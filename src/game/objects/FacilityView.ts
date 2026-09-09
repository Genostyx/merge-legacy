import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import type { FacilityId } from '../Grid';
import { Theme, materialLighting, textResolution, hex } from '../ui/Theme';

/**
 * A facility standing on the board: the shredder, or the max-tier consumer.
 *
 * Drawn rather than rastered, and deliberately machine-like - a squared
 * housing with an intake slot across its face and a fill bar under it. The
 * bar is the whole point: these are meters, and a meter the player cannot
 * read is just a cell they lost.
 */
export class FacilityView extends Phaser.GameObjects.Container {
  facilityId: FacilityId;
  gridPos: GridPosition;
  state: TileState = 'idle';
  cellSize: number;
  private art: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private meter = 0;
  private meterMax = 1;

  constructor(
    scene: Phaser.Scene, x: number, y: number, cellSize: number,
    facilityId: FacilityId, gridPos: GridPosition
  ) {
    super(scene, x, y);
    this.facilityId = facilityId;
    this.gridPos = gridPos;
    this.cellSize = cellSize;
    this.art = scene.add.graphics();
    this.label = scene.add.text(0, cellSize * 0.34, '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: `${Math.max(8, Math.round(cellSize * 0.17))}px`,
      fontStyle: 'bold', color: hex(Theme.textOnDark)
    }).setOrigin(0.5);
    this.add([this.art, this.label]);
    this.setSize(cellSize, cellSize);
    this.refresh();
    scene.add.existing(this);
  }

  setMeter(value: number, max: number): void {
    this.meter = value;
    this.meterMax = Math.max(1, max);
    this.refresh();
  }

  private refresh(): void {
    const s = this.cellSize;
    // The consumer eats finished chains and pays the best prizes, so it takes
    // the premium violet; the shredder is disposal, and industrial grey says
    // so without a caption.
    const base = this.facilityId === 'reclaimer' ? 0x6b4fd0 : 0x6d7580;
    const p = materialLighting(base, 6);
    const g = this.art;
    g.clear();

    const w = s * 0.78;
    const h = s * 0.66;
    const x = -w / 2;
    const y = -h / 2 - s * 0.04;
    const r = Math.max(2, s * 0.06);

    g.fillGradientStyle(p.light, p.light, p.dark, p.dark, 1);
    g.fillRoundedRect(x, y, w, h, r);
    g.lineStyle(Math.max(1, s * 0.02), p.shadow, 0.9);
    g.strokeRoundedRect(x, y, w, h, r);
    // Lit upper edge, one light, upper-left, as everywhere else.
    g.lineStyle(Math.max(1, s * 0.015), 0xffffff, 0.16);
    g.lineBetween(x + r, y + 1.5, x + w - r, y + 1.5);

    // THE INTAKE. A recessed slot across the face - the one thing that says
    // "put something in here" without a word on it.
    const slotW = w * 0.62;
    const slotH = h * 0.16;
    g.fillStyle(Theme.bg, 0.92);
    g.fillRoundedRect(-slotW / 2, y + h * 0.22, slotW, slotH, slotH / 2);
    g.lineStyle(1, p.shadow, 0.8);
    g.strokeRoundedRect(-slotW / 2, y + h * 0.22, slotW, slotH, slotH / 2);

    // The meter, along the bottom of the housing.
    const barW = w * 0.74;
    const barH = Math.max(3, h * 0.12);
    const barY = y + h * 0.62;
    g.fillStyle(Theme.bg, 0.9);
    g.fillRoundedRect(-barW / 2, barY, barW, barH, barH / 2);
    const fill = Phaser.Math.Clamp(this.meter / this.meterMax, 0, 1);
    if (fill > 0) {
      g.fillStyle(p.highlight, 1);
      g.fillRoundedRect(-barW / 2, barY, Math.max(barH, barW * fill), barH, barH / 2);
    }
    g.lineStyle(1, p.shadow, 0.9);
    g.strokeRoundedRect(-barW / 2, barY, barW, barH, barH / 2);

    // A NUMBER is allowed where art cannot carry it - see the show-don't-tell
    // rule. How many more it wants is exactly that case.
    this.label.setText(`${this.meter}/${this.meterMax}`);
  }

  setGridPos(pos: GridPosition): void { this.gridPos = pos; }

  /**
   * The same snap every draggable board object has. A facility is dragged to
   * be repositioned or put in the briefcase, so it has to answer the drop
   * path exactly as the others do.
   */
  snapTo(x: number, y: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this, x, y, duration: 140, ease: 'Quad.Out',
        onComplete: () => resolve()
      });
    });
  }

  playSpawnPulse(): void {
    this.setScale(0.82);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 260, ease: 'Back.Out' });
  }

  /** Fed something: a short intake thump, so the meter tick has a beat. */
  playIntake(): void {
    this.scene.tweens.add({
      targets: this, scaleY: 0.9, duration: 90, yoyo: true, ease: 'Quad.Out'
    });
  }
}
