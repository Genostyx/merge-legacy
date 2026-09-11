import Phaser from 'phaser';
import { BoardScene } from './game/scenes/BoardScene';
import { renderScale } from './game/ui/Theme';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-root',
  backgroundColor: '#1c1a17',
  // The canvas clears to alpha rather than a solid colour, so a WebGL layer
  // placed BEHIND it (the 3D room) can show through wherever the scene draws
  // nothing. The board is unaffected: its backdrop photo covers the screen, and
  // the body's own #1c1a17 sits behind everything else.
  transparent: true,
  render: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
    premultipliedAlpha: true,
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR'
  },
  scale: {
    // DEVICE PIXELS IN, CSS PIXELS OUT.
    //
    // The game is sized in device pixels and zoomed back down by the same
    // factor, so the canvas backing store matches the screen's real
    // resolution while the element still occupies the right space on the
    // page. Under RESIZE the backing store was CSS-sized, so every shape was
    // rasterised at half or a third of the screen's resolution and stretched.
    //
    // NONE rather than RESIZE because RESIZE overwrites the game size with
    // the parent's CSS size on every tick, which is precisely what has to be
    // scaled here. `fitCanvasToViewport` below does that job instead.
    mode: Phaser.Scale.NONE,
    zoom: 1 / renderScale,
    width: Math.max(2, Math.floor(window.innerWidth * renderScale)),
    height: Math.max(2, Math.floor(window.innerHeight * renderScale))
  },
  scene: [BoardScene]
};

const game = new Phaser.Game(config);

/**
 * Keeps the canvas matched to the viewport, in device pixels.
 *
 * This is what RESIZE mode would have done, except it multiplies by the
 * render scale first. The zoom in the config divides it back out again for
 * the CSS size, so the element measures the same as it always did.
 */
function fitCanvasToViewport(): void {
  const w = Math.max(2, Math.floor(window.innerWidth * renderScale));
  const h = Math.max(2, Math.floor(window.innerHeight * renderScale));
  if (game.scale.width === w && game.scale.height === h) return;
  game.scale.resize(w, h);
}

window.addEventListener('resize', fitCanvasToViewport);
window.addEventListener('orientationchange', fitCanvasToViewport);
// A phone's browser bar collapsing resizes the visual viewport without firing
// a window resize, and the scene's own canvas observer cannot fix the backing
// store - only this can.
window.visualViewport?.addEventListener('resize', fitCanvasToViewport);
game.events.once(Phaser.Core.Events.READY, fitCanvasToViewport);

// Dev-only handle, so the running scene can be inspected from a console or a
// browser-automation tool. Stripped from production builds by the `DEV`
// guard, which Vite resolves statically.
if (import.meta.env?.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}

/**
 * Recovers from a lost WebGL context instead of leaving a grey screen.
 *
 * Reported on phones and worst on iPhone/Safari: opening the project panel
 * blanked the game to grey with no way out, and it only came back a couple of
 * minutes later - which is Safari reloading the tab after reclaiming memory,
 * not the game recovering.
 *
 * The panel layers a SECOND WebGL context (RoomView3D's three.js renderer)
 * behind Phaser's, and iOS Safari caps live contexts and reclaims hard on a
 * tight device. When it reclaims it kills a context, and a dead Phaser
 * context draws nothing at all.
 *
 * `webglcontextlost` is CANCELABLE, and the default action is what makes the
 * loss permanent. Calling `preventDefault()` is what allows a restore to
 * happen; without it the browser will never fire `webglcontextrestored`. So:
 * cancel the default, and if the context does come back, reload - Phaser
 * cannot rebuild its textures and buffers by itself, and a reload is
 * instant and lossless here because saves live in localStorage.
 *
 * The reload is guarded to once per session. A device that is genuinely out
 * of memory can drop the context again immediately, and a reload loop would
 * be worse than the grey screen it replaces.
 *
 * This is a safety net for ANY cause of context loss - a backgrounded tab, a
 * GPU driver reset - not only the project panel, so it stays even if the
 * second context is removed later.
 */
function recoverFromContextLoss(canvas: HTMLCanvasElement): void {
  const RELOADED_KEY = 'merge-game-context-reloaded';
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.warn('[webgl] context lost');
    if (sessionStorage.getItem(RELOADED_KEY)) return;
    // Give the browser a moment to restore it on its own before reloading;
    // a restore that arrives first cancels this.
    setTimeout(() => {
      if (sessionStorage.getItem(RELOADED_KEY)) return;
      sessionStorage.setItem(RELOADED_KEY, '1');
      location.reload();
    }, 1200);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    console.warn('[webgl] context restored');
    if (sessionStorage.getItem(RELOADED_KEY)) return;
    sessionStorage.setItem(RELOADED_KEY, '1');
    location.reload();
  });
}

// The canvas does not exist until Phaser has booted its renderer.
game.events.once(Phaser.Core.Events.READY, () => {
  const canvas = game.canvas;
  if (canvas) recoverFromContextLoss(canvas);
});

declare const __BUILD_ID__: string;

/**
 * Reloads the page when a newer build has been deployed.
 *
 * Without this a player keeps running whatever bundle their browser cached -
 * GitHub Pages caches index.html for ten minutes and the hosting offers no
 * header to change that, so an update reaches nobody until they happen to
 * hard-refresh. Progress is untouched either way: saves live in localStorage
 * under this origin, and a reload re-reads them.
 *
 * The check is cheap (a few dozen bytes) and deliberately quiet:
 *
 *  - only while the tab is VISIBLE, so a backgrounded phone is not polled;
 *  - `cache: 'no-store'`, or the check would be answered by the same stale
 *    cache it exists to detect;
 *  - one reload per session, tracked in sessionStorage, so a version file
 *    that somehow never matches cannot put the game in a reload loop.
 */
function watchForNewBuild(): void {
  if (import.meta.env?.DEV) return;
  const RELOADED_KEY = 'merge-game-reloaded-for';

  const check = async (): Promise<void> => {
    if (document.visibilityState !== 'visible') return;
    try {
      const response = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const { build } = (await response.json()) as { build?: string };
      if (!build || build === __BUILD_ID__) return;
      // Reloading straight into the same mismatch would loop forever if the
      // server is serving one build's HTML and another's version file.
      if (sessionStorage.getItem(RELOADED_KEY) === build) return;
      sessionStorage.setItem(RELOADED_KEY, build);
      window.location.reload();
    } catch {
      // Offline, or the file is not there yet on an older deploy. Nothing to
      // do - the player keeps playing the build they have.
    }
  };

  void check();
  // Fifteen minutes: long enough to be invisible on a metered connection,
  // short enough that a player in a long session still picks up a fix.
  setInterval(() => void check(), 15 * 60 * 1000);
  // The common case on a phone: the game is reopened from the background
  // hours later, which is exactly when a new build is likely waiting.
  document.addEventListener('visibilitychange', () => void check());
}

watchForNewBuild();
