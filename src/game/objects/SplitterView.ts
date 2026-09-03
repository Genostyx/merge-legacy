import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import { Theme } from '../ui/Theme';

export function drawSplitterIcon(g: Phaser.GameObjects.Graphics, size: number): void {
  const s = size;
  g.fillStyle(0x171b1c, 0.34);
  g.fillEllipse(0, s * 0.3, s * 0.66, s * 0.18);
  g.lineStyle(Math.max(2, s * 0.075), 0x70797a, 1);
  g.lineBetween(-s * 0.26, -s * 0.2, s * 0.2, s * 0.18);
  g.lineBetween(s * 0.26, -s * 0.2, -s * 0.2, s * 0.18);
  g.lineStyle(Math.max(1, s * 0.025), 0xcbd0cd, 0.9);
  g.lineBetween(-s * 0.25, -s * 0.22, s * 0.04, s * 0.02);
  g.lineBetween(s * 0.25, -s * 0.22, -s * 0.04, s * 0.02);
  g.fillStyle(Theme.currencyGem, 0.95);
  g.fillCircle(-s * 0.21, s * 0.2, s * 0.105);
  g.fillCircle(s * 0.21, s * 0.2, s * 0.105);
  g.fillStyle(0x1e2223, 1);
  g.fillCircle(-s * 0.21, s * 0.2, s * 0.052);
  g.fillCircle(s * 0.21, s * 0.2, s * 0.052);
  g.fillStyle(0xe4e7e4, 0.95);
  g.fillCircle(0, 0, s * 0.055);
}

export class SplitterView extends Phaser.GameObjects.Container {
  gridPos: GridPosition;
  state: TileState = 'idle';
  private icon: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, cellSize: number, gridPos: GridPosition) {
    super(scene, x, y);
    this.gridPos = gridPos;
    this.icon = scene.add.graphics();
    // 0.88, matching the dispensers and spawner pieces it sits among. At 0.78 it
    // was the only piece of board furniture drawn smaller than the rest.
    drawSplitterIcon(this.icon, cellSize * 0.88);
    this.add(this.icon);
    this.setSize(cellSize, cellSize);
    scene.add.existing(this);
  }

  setGridPos(pos: GridPosition): void { this.gridPos = pos; }

  snapTo(x: number, y: number): Promise<void> {
    return new Promise((resolve) => this.scene.tweens.add({
      targets: this, x, y, duration: 140, ease: 'Cubic.Out', onComplete: () => resolve()
    }));
  }

  playSpawnPulse(): void {
    this.scene.tweens.add({ targets: this, scale: { from: 0.65, to: 1 }, duration: 210, ease: 'Back.Out' });
  }

  playMergeOutAndDestroy(): Promise<void> {
    return new Promise((resolve) => this.scene.tweens.add({
      targets: this, scale: 0, alpha: 0, duration: 150, ease: 'Quad.In',
      onComplete: () => { this.destroy(); resolve(); }
    }));
  }
}
