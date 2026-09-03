import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import { drawCrate } from './TierIcons';

/**
 * A crate sitting on the board.
 *
 * Deliberately NOT a TileView: a crate has no family, no tier ladder and no
 * merge behaviour, and giving it one would make it look mergeable. It is a
 * container the player empties one tap at a time, so it gets its own view
 * with its own idle motion - a slow breathing pulse rather than the tiles'
 * sway, which reads as "this is waiting for you" instead of "this is one of
 * the pieces".
 */
export class CrateView extends Phaser.GameObjects.Container {
  gridPos: GridPosition;
  /** Kept so BoardScene can treat every board view uniformly when dragging. */
  state: TileState = 'idle';
  cellSize: number;
  crateTier: string;

  private art: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Graphics;
  private idleTween?: Phaser.Tweens.Tween;
  /** Countdown plate shown only while a bought crate is still sealed. */
  private waitPlate?: Phaser.GameObjects.Graphics;
  private waitText?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, cellSize: number, tier: string, gridPos: GridPosition) {
    super(scene, x, y);
    this.gridPos = gridPos;
    this.cellSize = cellSize;
    this.crateTier = tier;

    this.shadow = scene.add.graphics();
    this.art = scene.add.graphics();
    this.add([this.shadow, this.art]);
    this.setSize(cellSize, cellSize);
    this.draw();

    this.idleTween = scene.tweens.add({
      targets: this,
      scale: { from: 1, to: 1.05 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });

    scene.add.existing(this);
  }

  private draw(): void {
    // 1.30, not 0.9: `drawCrate` draws its box at 0.5 of the size it is given,
    // so at 0.9 the crate came out 0.45 of a cell wide - little more than half
    // the board items now standing beside it. This asks for the size that
    // DRAWS at about 0.65 of the cell.
    const size = this.cellSize * 1.30;
    this.shadow.clear();
    // Same stacked-ellipse contact shadow language the tiles use, sized to
    // the crate rather than to the cell.
    // The contact shadow stays keyed to the CELL, not to the drawing size
    // above: that number is inflated to compensate for how `drawCrate` scales
    // its box, and feeding it here would throw the shadow most of a cell below
    // the crate.
    const shadowSize = this.cellSize * 0.9;
    for (let i = 3; i >= 1; i--) {
      this.shadow.fillStyle(0x000000, 0.1 * i);
      this.shadow.fillEllipse(
        shadowSize * 0.05 * i, shadowSize * 0.3 + shadowSize * 0.03 * i,
        shadowSize * (0.6 - i * 0.03), shadowSize * 0.16
      );
    }
    // Shifted LEFT by half the isometric depth. `drawCrate` builds its front
    // face around the origin and then extends the top and side faces to the
    // upper right, so the finished block's visual centre sits right of where
    // it was drawn from; without this the crate rides off-centre in its cell.
    this.art.clear().setPosition(-size * 0.085, 0);
    drawCrate(this.art, size, this.crateTier);
  }

  /**
   * Shows the remaining wait on a bought crate, or clears it once the crate
   * opens. The breathing idle stops while sealed: that pulse means "tap me",
   * and a crate that cannot be tapped yet must not claim it.
   */
  setWait(label: string | null): void {
    if (label == null) {
      this.waitPlate?.destroy();
      this.waitText?.destroy();
      this.waitPlate = undefined;
      this.waitText = undefined;
      this.art.setAlpha(1);
      if (this.idleTween?.isPlaying() === false) this.idleTween.play();
      return;
    }
    this.idleTween?.pause();
    this.setScale(1);
    // Dimmed rather than greyed: the crate is still itself, just shut.
    this.art.setAlpha(0.55);
    const size = this.cellSize * 0.9;
    if (!this.waitPlate) {
      this.waitPlate = this.scene.add.graphics();
      this.waitText = this.scene.add.text(0, size * 0.34, '', {
        fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#e8eef2',
        resolution: window.devicePixelRatio ?? 1
      }).setOrigin(0.5);
      this.add([this.waitPlate, this.waitText]);
    }
    this.waitText?.setText(label);
    const w = (this.waitText?.width ?? 0) + 10;
    this.waitPlate.clear();
    this.waitPlate.fillStyle(0x000000, 0.62);
    this.waitPlate.fillRoundedRect(-w / 2, size * 0.34 - 8, w, 16, 4);
  }

  /** Settles in when delivered, so a crate arriving is visibly an event. */
  playArrive(): this {
    this.setScale(0.4).setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      alpha: 1,
      duration: 320,
      ease: 'Back.Out'
    });
    return this;
  }

  /** A short pop when the crate gives something up, so each tap lands. */
  playDispensePulse(): void {
    this.scene.tweens.add({
      targets: this.art,
      scaleX: { from: 1, to: 1.16 },
      scaleY: { from: 1, to: 0.86 },
      duration: 90,
      yoyo: true,
      ease: 'Quad.Out'
    });
  }

  playEmptyAndDestroy(): Promise<void> {
    this.idleTween?.stop();
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scale: 0.6,
        alpha: 0,
        angle: -8,
        duration: 200,
        ease: 'Quad.In',
        onComplete: () => {
          this.destroy();
          resolve();
        }
      });
    });
  }

  setGridPos(pos: GridPosition): void {
    this.gridPos = pos;
  }

  snapTo(x: number, y: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: this, x, y, duration: 140, ease: 'Quad.Out', onComplete: () => resolve() });
    });
  }
}
