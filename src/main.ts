import Phaser from 'phaser';
import { BoardScene } from './game/scenes/BoardScene';

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
    // Match the real viewport so text remains a readable CSS-pixel size on
    // phones instead of shrinking the entire 720x1280 scene to fit.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BoardScene]
};

const game = new Phaser.Game(config);

// Dev-only handle, so the running scene can be inspected from a console or a
// browser-automation tool. Stripped from production builds by the `DEV`
// guard, which Vite resolves statically.
if (import.meta.env?.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}

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
