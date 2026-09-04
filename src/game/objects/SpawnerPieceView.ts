import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import { getTierDef } from '../data/chains';
import { Theme, materialLighting, toneForNormal } from '../ui/Theme';
import type { MaterialLighting } from '../ui/Theme';

/**
 * A source-construction piece. It is intentionally separate from TileView:
 * Wood Piece 01 must merge with Wood Piece 01, not with Scrap Wood.
 */
/**
 * The Decagon's five pieces, and they are ASSEMBLY steps rather than
 * materials: a single facet, a pair of them hinged, the ten-sided frame they
 * seat into, the core that drives it, and the housing that closes it up. Read
 * left to right the set should look like something being built, which is what
 * makes the fifth merge feel like a machine rather than a bigger lump.
 *
 * Deliberately angular and hollow where the family pieces are solid: this is
 * a mechanism, not a block of stone.
 */
function drawDecagonPiece(g: Phaser.GameObjects.Graphics, tier: number, s: number, p: MaterialLighting): void {
  const SIDES = 10;
  const start = -Math.PI / 2 + Math.PI / SIDES;
  const ringPoints = (radius: number): Phaser.Geom.Point[] => {
    const pts: Phaser.Geom.Point[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = start + (i / SIDES) * Math.PI * 2;
      pts.push(new Phaser.Geom.Point(Math.cos(a) * radius, Math.sin(a) * radius));
    }
    return pts;
  };

  // One facet: the flat trapezoid that ten of would make the rim.
  const facet = (cx: number, cy: number, w: number, h: number, lit: number): void => {
    const pts = [
      new Phaser.Geom.Point(cx - w / 2, cy + h / 2),
      new Phaser.Geom.Point(cx - w * 0.34, cy - h / 2),
      new Phaser.Geom.Point(cx + w * 0.34, cy - h / 2),
      new Phaser.Geom.Point(cx + w / 2, cy + h / 2)
    ];
    g.fillStyle(toneForNormal(p, lit), 1);
    g.fillPoints(pts, true);
    g.lineStyle(Math.max(1, s * 0.02), p.dark, 0.9);
    g.strokePoints(pts, true);
    g.lineStyle(Math.max(1, s * 0.016), p.highlight, 0.5);
    g.lineBetween(cx - w * 0.3, cy - h / 2 + 1.5, cx + w * 0.3, cy - h / 2 + 1.5);
  };

  if (tier === 1) {
    facet(0, 0, s * 0.5, s * 0.34, 0.85);
    return;
  }

  if (tier === 2) {
    // Two facets, hinged at an angle - the first thing that reads as joined.
    facet(-s * 0.14, s * 0.04, s * 0.42, s * 0.3, 0.9);
    facet(s * 0.16, -s * 0.06, s * 0.42, s * 0.3, 0.55);
    return;
  }

  if (tier === 3) {
    // The frame: the full ten-sided outline, empty in the middle.
    const outer = ringPoints(s * 0.42);
    const inner = ringPoints(s * 0.3);
    for (let i = 0; i < SIDES; i++) {
      const mid = start + ((i + 0.5) / SIDES) * Math.PI * 2;
      const lit = (Math.cos(mid - Math.PI * 1.25) + 1) / 2;
      g.fillStyle(toneForNormal(p, lit), 1);
      g.fillPoints([outer[i], outer[(i + 1) % SIDES], inner[(i + 1) % SIDES], inner[i]], true);
    }
    g.lineStyle(Math.max(1, s * 0.02), p.dark, 0.9);
    g.strokePoints(outer, true);
    g.strokePoints(inner, true);
    return;
  }

  if (tier === 4) {
    // The core: the frame with a driven hub seated in it.
    const outer = ringPoints(s * 0.42);
    g.fillStyle(p.base, 0.5);
    g.fillPoints(outer, true);
    g.lineStyle(Math.max(1, s * 0.02), p.dark, 0.9);
    g.strokePoints(outer, true);
    g.fillGradientStyle(p.highlight, p.light, p.shadow, p.dark, 1);
    g.fillCircle(0, 0, s * 0.2);
    g.lineStyle(Math.max(1, s * 0.018), p.dark, 0.9);
    g.strokeCircle(0, 0, s * 0.2);
    // Spokes out to the rim, so the hub reads as driving the ring.
    g.lineStyle(Math.max(1, s * 0.022), p.light, 0.8);
    for (let i = 0; i < 5; i++) {
      const a = start + (i / 5) * Math.PI * 2;
      g.lineBetween(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2, Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4);
    }
    return;
  }

  // Tier 5, the housing: the whole assembly closed up, one merge from a
  // working machine.
  const outer = ringPoints(s * 0.46);
  const inner = ringPoints(s * 0.34);
  g.fillGradientStyle(p.highlight, p.light, p.shadow, p.dark, 1);
  g.fillPoints(outer, true);
  for (let i = 0; i < SIDES; i++) {
    const mid = start + ((i + 0.5) / SIDES) * Math.PI * 2;
    const lit = (Math.cos(mid - Math.PI * 1.25) + 1) / 2;
    g.fillStyle(toneForNormal(p, lit), 1);
    g.fillPoints([outer[i], outer[(i + 1) % SIDES], inner[(i + 1) % SIDES], inner[i]], true);
  }
  g.fillStyle(p.dark, 1);
  g.fillCircle(0, 0, s * 0.16);
  g.fillStyle(p.highlight, 0.85);
  g.fillCircle(0, -s * 0.03, s * 0.09);
  g.lineStyle(Math.max(1.2, s * 0.022), p.dark, 0.9);
  g.strokePoints(outer, true);
}

export function drawSpawnerPieceIcon(
  g: Phaser.GameObjects.Graphics,
  typeId: string,
  tier: number,
  size: number
): void {
  const base = getTierDef(typeId, Math.min(tier + 1, 9))?.color ?? Theme.panelAlt;
  const p = materialLighting(base, Math.min(tier + 1, 9));
  // The Decagon is assembled from FIVE pieces rather than four, so the clamp
  // has to know the family it is clamping for.
  const t = Phaser.Math.Clamp(tier, 1, typeId === 'decagon' ? 5 : 4);
  // 0.66 of an 0.88 box - about 0.58 of the cell. At 0.48 it came out at 0.42,
  // the smallest thing on the board after the currency tiles, even though a
  // source piece is a step on the way to the largest.
  const s = size * 0.66;

  if (typeId === 'water') {
    drawWaterSpawnerPiece(g, t, s, p);
    return;
  }

  if (typeId === 'decagon') {
    drawDecagonPiece(g, t, s, p);
    return;
  }

  g.lineStyle(1, p.highlight, 0.55);
  g.fillStyle(p.base, 0.95);
  g.fillRoundedRect(-s * 0.62, s * 0.12, s * 1.24, s * 0.18, 3);

  if (t >= 1) drawPieceBeam(g, -s * 0.42, -s * 0.04, s * 0.78, s * 0.16, -12, p);
  if (t >= 2) drawPieceBeam(g, -s * 0.24, -s * 0.18, s * 0.78, s * 0.16, 18, p);
  if (t >= 3) {
    drawPiecePost(g, -s * 0.34, -s * 0.34, s * 0.16, s * 0.62, p);
    drawPiecePost(g, s * 0.22, -s * 0.32, s * 0.16, s * 0.58, p);
    drawPieceBeam(g, -s * 0.32, -s * 0.36, s * 0.76, s * 0.12, 0, p);
  }
  if (t >= 4) {
    g.fillStyle(p.dark, 0.95);
    g.fillTriangle(-s * 0.5, -s * 0.36, 0, -s * 0.74, s * 0.5, -s * 0.36);
    g.lineStyle(1, p.highlight, 0.65);
    g.strokeTriangle(-s * 0.5, -s * 0.36, 0, -s * 0.74, s * 0.5, -s * 0.36);
    g.fillStyle(p.light, 0.28);
    g.fillRect(-s * 0.12, -s * 0.31, s * 0.24, s * 0.34);
  }
}

/**
 * Water's four pre-dispenser pieces: PARTS of a well, each shown on its own.
 *
 * The set docs/TODO_DETAILS.md names - ring section, support frame, roof
 * section, winch assembly - with the winch LAST, as the final piece before the
 * source itself.
 *
 * Each tier is one part waiting to be fitted, not the well at four stages of
 * assembly: drawn cumulatively they came out as four small copies of the water
 * source, which is itself a well, so the pieces showed you the thing you were
 * building towards three times before you had built it. The other families
 * work the same way - cut timber, joined beams, a frame - components, not
 * miniatures.
 *
 * All four are solid forms at the weight the other families use. The pipe run
 * this replaced drew tiers 1 and 2 as thin strokes, which read as scratches at
 * board size.
 */
function drawWaterSpawnerPiece(
  g: Phaser.GameObjects.Graphics,
  tier: number,
  s: number,
  p: ReturnType<typeof materialLighting>
): void {
  if (tier === 1) {
    // Ring section: one curved block of the well's mouth, lying flat. An arc
    // rather than a closed ring - closed, it reads as the finished mouth,
    // which is the source's own silhouette.
    g.fillStyle(p.dark, 1);
    g.beginPath();
    g.arc(0, s * 0.16, s * 0.46, Math.PI * 1.06, Math.PI * 1.94);
    g.arc(0, s * 0.16, s * 0.2, Math.PI * 1.94, Math.PI * 1.06, true);
    g.closePath();
    g.fillPath();
    g.fillStyle(p.base, 1);
    g.beginPath();
    g.arc(0, s * 0.08, s * 0.44, Math.PI * 1.06, Math.PI * 1.94);
    g.arc(0, s * 0.08, s * 0.22, Math.PI * 1.94, Math.PI * 1.06, true);
    g.closePath();
    g.fillPath();
    g.lineStyle(Math.max(1, s * 0.04), p.shadow, 0.55);
    g.lineBetween(-s * 0.16, -s * 0.19, -s * 0.08, -s * 0.02);
    g.lineBetween(s * 0.16, -s * 0.19, s * 0.08, -s * 0.02);
    return;
  }

  if (tier === 2) {
    // Support frame: two posts, their crossbeam and braces, standing alone.
    // Nothing beneath them, which is what keeps it a frame rather than half a
    // well.
    const postW = s * 0.15;
    for (const dx of [-s * 0.4, s * 0.25]) {
      g.fillStyle(p.dark, 1);
      g.fillRoundedRect(dx, -s * 0.34, postW, s * 0.78, s * 0.04);
      g.fillStyle(p.light, 0.5);
      g.fillRoundedRect(dx, -s * 0.34, postW * 0.4, s * 0.78, s * 0.04);
    }
    g.fillStyle(p.base, 1);
    g.fillRoundedRect(-s * 0.46, -s * 0.42, s * 0.92, s * 0.14, s * 0.04);
    g.fillStyle(p.light, 0.62);
    g.fillRoundedRect(-s * 0.46, -s * 0.42, s * 0.92, s * 0.06, s * 0.04);
    g.lineStyle(Math.max(1, s * 0.07), p.dark, 0.9);
    g.lineBetween(-s * 0.3, -s * 0.26, -s * 0.14, -s * 0.1);
    g.lineBetween(s * 0.3, -s * 0.26, s * 0.14, -s * 0.1);
    return;
  }

  if (tier === 3) {
    // Roof section: the pitched cap alone, with its ridge and a shingle
    // course, resting on the board rather than floating over a well.
    g.fillStyle(p.dark, 1);
    g.beginPath();
    g.moveTo(0, -s * 0.44);
    g.lineTo(s * 0.52, s * 0.16);
    g.lineTo(s * 0.36, s * 0.3);
    g.lineTo(-s * 0.52, s * 0.3);
    g.closePath();
    g.fillPath();
    g.fillStyle(p.base, 1);
    g.beginPath();
    g.moveTo(0, -s * 0.4);
    g.lineTo(s * 0.44, s * 0.16);
    g.lineTo(-s * 0.44, s * 0.16);
    g.closePath();
    g.fillPath();
    g.fillStyle(p.light, 0.78);
    g.beginPath();
    g.moveTo(0, -s * 0.4);
    g.lineTo(-s * 0.44, s * 0.16);
    g.lineTo(-s * 0.06, s * 0.16);
    g.closePath();
    g.fillPath();
    g.lineStyle(Math.max(1, s * 0.045), p.shadow, 0.55);
    g.lineBetween(0, -s * 0.4, 0, s * 0.16);
    g.lineStyle(Math.max(1, s * 0.03), p.shadow, 0.35);
    g.lineBetween(-s * 0.28, 0, s * 0.28, 0);
    return;
  }

  // Winch assembly, shaped after a marine windlass: a horizontal motor body
  // lying on the board with a wide drum standing on top of it. Read from its
  // outline alone - long body, tall drum - where the hand crank it replaced
  // was a rounded box with a stub, which is not a silhouette at board size.
  const bodyY = s * 0.06;

  g.fillStyle(p.dark, 1);
  g.fillRoundedRect(-s * 0.5, bodyY - s * 0.01, s * 0.98, s * 0.34, s * 0.15);
  g.fillStyle(p.base, 1);
  g.fillRoundedRect(-s * 0.5, bodyY - s * 0.04, s * 0.94, s * 0.32, s * 0.15);
  g.fillStyle(p.light, 0.55);
  g.fillRoundedRect(-s * 0.44, bodyY - s * 0.02, s * 0.8, s * 0.11, s * 0.06);
  // Terminal box on the right end - the detail that makes it machinery.
  g.fillStyle(p.shadow, 1);
  g.fillRoundedRect(s * 0.3, bodyY + s * 0.02, s * 0.2, s * 0.22, s * 0.04);

  // Pedestal carrying the drum.
  g.fillStyle(p.shadow, 1);
  g.fillRect(-s * 0.28, -s * 0.12, s * 0.26, s * 0.2);
  g.fillStyle(p.dark, 1);
  g.fillRoundedRect(-s * 0.36, -s * 0.18, s * 0.42, s * 0.09, s * 0.03);

  // Drum: the part that reads first.
  g.fillStyle(p.dark, 1);
  g.fillEllipse(-s * 0.15, -s * 0.2, s * 0.66, s * 0.2);
  g.fillStyle(p.base, 1);
  g.fillEllipse(-s * 0.15, -s * 0.24, s * 0.62, s * 0.18);
  g.fillStyle(p.light, 0.85);
  g.fillEllipse(-s * 0.15, -s * 0.34, s * 0.4, s * 0.2);
  g.fillStyle(p.highlight, 0.7);
  g.fillEllipse(-s * 0.21, -s * 0.38, s * 0.18, s * 0.09);
}

function drawPieceBeam(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
  p: ReturnType<typeof materialLighting>
): void {
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(Phaser.Math.DegToRad(angle));
  g.fillStyle(p.base, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 3);
  g.fillStyle(p.light, 0.6);
  g.fillRoundedRect(-w / 2, -h / 2, w, h * 0.45, 3);
  g.lineStyle(1, p.highlight, 0.65);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 3);
  g.restore();
}

function drawPiecePost(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  p: ReturnType<typeof materialLighting>
): void {
  g.fillStyle(p.base, 1);
  g.fillRoundedRect(x, y, w, h, 3);
  g.fillStyle(p.light, 0.55);
  g.fillRoundedRect(x, y, w * 0.45, h, 3);
  g.lineStyle(1, p.highlight, 0.6);
  g.strokeRoundedRect(x, y, w, h, 3);
}

export class SpawnerPieceView extends Phaser.GameObjects.Container {
  typeId: string;
  tier: number;
  gridPos: GridPosition;
  state: TileState = 'idle';
  cellSize: number;

  private shadow: Phaser.GameObjects.Graphics;
  private art: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private ringTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, cellSize: number, typeId: string, tier: number, gridPos: GridPosition) {
    super(scene, x, y);
    this.typeId = typeId;
    this.tier = tier;
    this.gridPos = gridPos;
    this.cellSize = cellSize;

    this.shadow = scene.add.graphics();
    this.art = scene.add.graphics();
    this.ring = scene.add.graphics().setVisible(false);
    this.add([this.shadow, this.art, this.ring]);
    this.setSize(cellSize, cellSize);
    this.draw();

    scene.add.existing(this);
  }

  private draw(): void {
    const size = this.cellSize * 0.88;
    this.shadow.clear();
    for (let i = 3; i >= 1; i--) {
      this.shadow.fillStyle(0x000000, 0.08 * i);
      this.shadow.fillEllipse(size * 0.04 * i, size * 0.29 + size * 0.02 * i, size * (0.56 - i * 0.03), size * 0.12);
    }

    this.art.clear();
    drawSpawnerPieceIcon(this.art, this.typeId, this.tier, size);
  }

  setMergeReady(active: boolean): void {
      const size = this.cellSize * 0.96 - 8;
    const half = size / 2;
    this.ringTween?.stop();
    this.ring.clear();
    if (!active) {
      this.ring.setVisible(false).setAlpha(1);
      return;
    }
    this.ring.lineStyle(Theme.borderWidthStrong, Theme.accentGreen, 1);
    this.ring.strokeRoundedRect(-half - 3, -half - 3, size + 6, size + 6, Theme.radiusTile);
    this.ring.setVisible(true);
    this.ringTween = this.scene.tweens.add({
      targets: this.ring,
      alpha: { from: 1, to: 0.35 },
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  setSelected(_active: boolean): void {
    // Selection is communicated by the action tray, matching current item tiles.
  }

  setGridPos(pos: GridPosition): void {
    this.gridPos = pos;
  }

  playMergeIn(): Promise<void> {
    this.state = 'spawning';
    this.setScale(0.72);
    this.setAlpha(0);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scale: 1,
        alpha: 1,
        duration: 150,
        ease: 'Quad.Out',
        onComplete: () => {
          this.state = 'idle';
          resolve();
        }
      });
    });
  }

  playMergeOutAndDestroy(): Promise<void> {
    this.state = 'merging';
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scale: 0.82,
        alpha: 0,
        duration: 110,
        ease: 'Quad.In',
        onComplete: () => {
          this.destroy();
          resolve();
        }
      });
    });
  }

  playSpawnFrom(fromX: number, fromY: number): Promise<void> {
    const homeX = this.x;
    const homeY = this.y;
    this.state = 'spawning';
    this.setPosition(fromX, fromY).setScale(0.35).setAlpha(0.6);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        x: homeX,
        y: homeY,
        scale: 1,
        alpha: 1,
        duration: 300,
        ease: 'Back.Out',
        onComplete: () => {
          this.state = 'idle';
          resolve();
        }
      });
    });
  }

  snapTo(x: number, y: number, animate = true): Promise<void> {
    if (!animate) {
      this.setPosition(x, y);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: this, x, y, duration: 140, ease: 'Quad.Out', onComplete: () => resolve() });
    });
  }
}
