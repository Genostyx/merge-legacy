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
