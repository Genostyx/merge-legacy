import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import { materialLighting, type MaterialLighting } from '../ui/Theme';

/**
 * The event token's own colour. Not borrowed from any family, and not one of
 * the reserved interaction accents - a token has to read as "not from around
 * here" the instant it lands, and any family's ramp would say it belonged to
 * that chain.
 */
export const EVENT_TOKEN_COLOR = 0x2fb59a;

/**
 * THE EVENT TOKEN - a struck medallion, drawn rather than borrowed.
 *
 * A new asset rather than a recoloured item, because everything else on the
 * board is either material to merge or a machine to feed, and this is neither:
 * it is a mark of participation you collect and hand in. So it is the one
 * round thing on a board of cut solids and squared housings, which is the
 * whole silhouette cue.
 *
 * The face carries a six-point star burst rather than a number or letter -
 * show-don't-tell, and a glyph would need translating while a struck shape
 * does not.
 */
export function drawEventToken(g: Phaser.GameObjects.Graphics, s: number, p: MaterialLighting): void {
  const r = s * 0.3;

  // Rim, then the sunken face inside it - a coin reads as struck because its
  // edge stands proud of its middle, not because of what is printed on it.
  g.fillStyle(p.dark, 1);
  g.fillCircle(0, 0, r);
  g.fillStyle(p.base, 1);
  g.fillCircle(0, 0, r * 0.88);
  // Lit crescent, upper left, matching every other object's single light.
  g.fillStyle(p.light, 0.55);
  g.beginPath();
  g.arc(0, 0, r * 0.88, Math.PI * 0.75, Math.PI * 1.75);
  g.fillPath();
  g.fillStyle(p.base, 1);
  g.fillCircle(r * 0.06, r * 0.06, r * 0.8);

  // Milled edge - short ticks around the rim. Cheap, and it is what stops the
  // shape reading as a plain dot at cell size.
  g.lineStyle(Math.max(1, s * 0.014), p.shadow, 0.8);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.lineBetween(
      Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9,
      Math.cos(a) * r, Math.sin(a) * r
    );
  }
  g.lineStyle(Math.max(1, s * 0.016), p.shadow, 0.9);
  g.strokeCircle(0, 0, r);

  // The struck star on the face.
  const points: Phaser.Geom.Point[] = [];
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
    const rad = i % 2 === 0 ? r * 0.56 : r * 0.22;
    points.push(new Phaser.Geom.Point(Math.cos(a) * rad, Math.sin(a) * rad));
  }
  g.fillStyle(p.highlight, 1);
  g.fillPoints(points, true);
  g.lineStyle(1, p.shadow, 0.7);
  g.strokePoints(points, true);
}

/** One event token standing on the board, waiting to be tapped in. */
export class EventTokenView extends Phaser.GameObjects.Container {
  gridPos: GridPosition;
  state: TileState = 'idle';
  cellSize: number;
  private art: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, cellSize: number, gridPos: GridPosition) {
    super(scene, x, y);
    this.gridPos = gridPos;
    this.cellSize = cellSize;
    this.art = scene.add.graphics();
    drawEventToken(this.art, cellSize, materialLighting(EVENT_TOKEN_COLOR, 6));
    this.add(this.art);
    this.setSize(cellSize, cellSize);
    // A slow bob, so a token reads as waiting to be collected rather than as
    // another thing to merge. Nothing else on the board moves at rest.
    scene.tweens.add({
      targets: this.art, y: -cellSize * 0.04,
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut'
    });
    scene.add.existing(this);
  }

  setGridPos(pos: GridPosition): void { this.gridPos = pos; }

  playSpawnPulse(): void {
    this.setScale(0.6);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 240, ease: 'Back.Out' });
  }

  snapTo(x: number, y: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this, x, y, duration: 140, ease: 'Quad.Out', onComplete: () => resolve()
      });
    });
  }

  /** Flies to the event chip and vanishes. */
  collectTo(x: number, y: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this, x, y, scale: 0.3, alpha: 0,
        duration: 320, ease: 'Cubic.In', onComplete: () => resolve()
      });
    });
  }
}
