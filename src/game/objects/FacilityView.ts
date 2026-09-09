import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import type { FacilityId } from '../Grid';
import { Theme, materialLighting, textResolution, hex, type MaterialLighting } from '../ui/Theme';

/**
 * THE SHREDDER, in the same isometric language the crates and sources use:
 * three real faces off one near-vertical edge, one light from the upper left,
 * flat facets rather than gradients on the structure.
 *
 * What makes it read as a shredder and not just a box is the THROAT - a wide
 * hopper mouth on the top face with two rows of interlocking teeth set into
 * it. That is the whole silhouette cue, and it is why the mouth is drawn
 * oversized relative to a real machine: at a board cell's size the teeth are
 * only a few pixels each, so they have to own a third of the top face to be
 * legible at all.
 *
 * No hazard stripes and no warning colour. The brief's reserved accents are
 * interaction state only, and a machine wearing one would read as selected.
 */
export function drawShredder(g: Phaser.GameObjects.Graphics, s: number, p: MaterialLighting): void {
  const L = s * 0.46;   // receding right
  const W = s * 0.34;   // receding left
  const H = s * 0.30;   // body height

  const RX = Math.cos(Math.PI / 6), RY = -Math.sin(Math.PI / 6);
  const ox = (W - L) * RX * 0.5;
  const oy = ((L + W) * 0.5 + H) * 0.5 - H * 0.1;

  // Near bottom corner, then the three faces off it.
  const nx = ox, ny = oy;
  const pt = (right: number, left: number, up: number): Phaser.Geom.Point =>
    new Phaser.Geom.Point(
      nx + right * RX - left * RX,
      ny + right * RY + left * RY - up
    );

  const face = (points: Phaser.Geom.Point[], tone: number): void => {
    g.fillStyle(tone, 1);
    g.fillPoints(points, true);
    g.lineStyle(Math.max(1, s * 0.012), p.shadow, 0.75);
    g.strokePoints(points, true);
  };

  // Body: right face (lit least), left face (lit most), top face.
  face([pt(0, 0, 0), pt(L, 0, 0), pt(L, 0, H), pt(0, 0, H)], p.dark);
  face([pt(0, 0, 0), pt(0, W, 0), pt(0, W, H), pt(0, 0, H)], p.base);
  face([pt(0, 0, H), pt(L, 0, H), pt(L, W, H), pt(0, W, H)], p.light);

  // A plinth line around the base, so it reads as set down on the cell rather
  // than floating in it.
  g.lineStyle(Math.max(1, s * 0.02), p.shadow, 0.9);
  g.lineBetween(pt(0, 0, 0).x, pt(0, 0, 0).y, pt(L, 0, 0).x, pt(L, 0, 0).y);
  g.lineBetween(pt(0, 0, 0).x, pt(0, 0, 0).y, pt(0, W, 0).x, pt(0, W, 0).y);

  // THE THROAT. A recessed slot in the top face, inset from all four edges.
  const i0 = 0.18, i1 = 0.82;
  const mouth = [
    pt(L * i0, W * i0, H), pt(L * i1, W * i0, H),
    pt(L * i1, W * i1, H), pt(L * i0, W * i1, H)
  ];
  g.fillStyle(Theme.bg, 0.95);
  g.fillPoints(mouth, true);
  g.lineStyle(Math.max(1, s * 0.012), p.shadow, 1);
  g.strokePoints(mouth, true);

  // THE TEETH. Two rows facing each other across the throat, offset by half a
  // tooth so they interlock - which is the one detail that says "this cuts"
  // rather than "this stores".
  const TEETH = 5;
  for (let row = 0; row < 2; row++) {
    // Rows sit either side of the throat's centre line, biting inward.
    const near = row === 0 ? i0 + 0.06 : i1 - 0.06;
    const tip = row === 0 ? 0.5 : 0.5;
    for (let i = 0; i < TEETH; i++) {
      // Half-tooth offset on the far row is what makes them mesh.
      const t0 = i0 + ((i + (row === 0 ? 0 : 0.5)) / TEETH) * (i1 - i0);
      const t1 = t0 + ((i1 - i0) / TEETH) * 0.46;
      if (t1 > i1) continue;
      const tooth = [
        pt(L * t0, W * near, H),
        pt(L * t1, W * near, H),
        pt(L * (t0 + t1) / 2, W * tip, H)
      ];
      g.fillStyle(row === 0 ? p.highlight : p.light, 0.95);
      g.fillPoints(tooth, true);
      g.lineStyle(1, p.shadow, 0.8);
      g.strokePoints(tooth, true);
    }
  }

  // Discharge chute on the front-right face - where the shredded stock leaves.
  const cx0 = 0.24, cx1 = 0.76;
  const chute = [
    pt(L * cx0, 0, H * 0.34), pt(L * cx1, 0, H * 0.34),
    pt(L * cx1, 0, H * 0.06), pt(L * cx0, 0, H * 0.06)
  ];
  g.fillStyle(Theme.bg, 0.88);
  g.fillPoints(chute, true);
  g.lineStyle(1, p.shadow, 0.9);
  g.strokePoints(chute, true);
  // Slats across it, so the opening reads as a grille rather than a hole.
  for (let i = 1; i < 4; i++) {
    const y = H * 0.06 + (H * 0.28 * i) / 4;
    g.lineStyle(1, p.dark, 0.9);
    g.lineBetween(pt(L * cx0, 0, y).x, pt(L * cx0, 0, y).y, pt(L * cx1, 0, y).x, pt(L * cx1, 0, y).y);
  }
}

/**
 * The facility's housing, drawn on its own so the briefcase slot can show the
 * same object the board does rather than a second drawing of it.
 */
export function drawFacilityIcon(
  g: Phaser.GameObjects.Graphics, facilityId: FacilityId, s: number
): void {
  const base = facilityId === 'reclaimer' ? 0x6b4fd0 : 0x6d7580;
  const p = materialLighting(base, 6);
  if (facilityId === 'shredder') { drawShredder(g, s, p); return; }
  const w = s * 0.78;
  const h = s * 0.66;
  const x = -w / 2;
  const y = -h / 2;
  const r = Math.max(2, s * 0.06);
  g.fillGradientStyle(p.light, p.light, p.dark, p.dark, 1);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(Math.max(1, s * 0.02), p.shadow, 0.9);
  g.strokeRoundedRect(x, y, w, h, r);
  g.lineStyle(Math.max(1, s * 0.015), 0xffffff, 0.16);
  g.lineBetween(x + r, y + 1.5, x + w - r, y + 1.5);
  const slotW = w * 0.62;
  const slotH = h * 0.16;
  g.fillStyle(Theme.bg, 0.92);
  g.fillRoundedRect(-slotW / 2, y + h * 0.3, slotW, slotH, slotH / 2);
}

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

    if (this.facilityId === 'shredder') {
      // Real art, lifted a little so the meter has room under it.
      g.setPosition(0, -s * 0.06);
      drawShredder(g, s * 0.98, p);
      g.setPosition(0, 0);
      this.drawMeter(g, s, p);
      return;
    }

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

    this.drawMeter(g, s, p);
  }

  /**
   * The fill bar, along the bottom of the cell.
   *
   * Its own method because the two machines draw completely different
   * housings above it and both need the same readout under it. The NUMBER is
   * allowed here - show-don't-tell exempts a count, and how many more it
   * wants is exactly the thing art cannot say.
   */
  private drawMeter(g: Phaser.GameObjects.Graphics, s: number, p: MaterialLighting): void {
    const barW = s * 0.6;
    const barH = Math.max(3, s * 0.07);
    const barY = s * 0.2;
    g.fillStyle(Theme.bg, 0.9);
    g.fillRoundedRect(-barW / 2, barY, barW, barH, barH / 2);
    const fill = Phaser.Math.Clamp(this.meter / this.meterMax, 0, 1);
    if (fill > 0) {
      g.fillStyle(p.highlight, 1);
      g.fillRoundedRect(-barW / 2, barY, Math.max(barH, barW * fill), barH, barH / 2);
    }
    g.lineStyle(1, p.shadow, 0.9);
    g.strokeRoundedRect(-barW / 2, barY, barW, barH, barH / 2);
    this.label.setPosition(0, barY + barH + s * 0.11);
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
