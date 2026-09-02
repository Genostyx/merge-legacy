import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import type { ResourceProducerId } from '../rewards/ResourceRewards';
import { RESOURCE_PRODUCERS } from '../rewards/ResourceRewards';

export class ResourceProducerView extends Phaser.GameObjects.Container {
  gridPos: GridPosition;
  state: TileState = 'idle';
  cellSize: number;
  producerId: ResourceProducerId;
  private art: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, cellSize: number, producerId: ResourceProducerId, gridPos: GridPosition) {
    super(scene, x, y);
    this.gridPos = gridPos;
    this.cellSize = cellSize;
    this.producerId = producerId;
    this.art = scene.add.image(0, 0, RESOURCE_PRODUCERS[producerId].textureKey)
      .setDisplaySize(cellSize * 0.94, cellSize * 0.94);
    this.add(this.art);
    this.setSize(cellSize, cellSize);
    scene.add.existing(this);
  }

  setGridPos(pos: GridPosition): void { this.gridPos = pos; }

  snapTo(x: number, y: number): Promise<void> {
    return new Promise((resolve) => this.scene.tweens.add({ targets: this, x, y, duration: 140, ease: 'Quad.Out', onComplete: () => resolve() }));
  }

  playDispensePulse(): void {
    this.scene.tweens.killTweensOf(this.art);
    this.art.setY(0);
  }

  playSpawnPulse(): void {
    this.setScale(0.4).setAlpha(0);
    this.scene.tweens.add({ targets: this, scale: 1, alpha: 1, duration: 300, ease: 'Back.Out' });
  }

  playEmptyAndDestroy(): Promise<void> {
    return new Promise((resolve) => this.scene.tweens.add({
      targets: this, scale: 0.55, alpha: 0, duration: 190, ease: 'Quad.In',
      onComplete: () => { this.destroy(); resolve(); }
    }));
  }
}
