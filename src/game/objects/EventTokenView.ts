import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import { materialLighting, toneAt, type MaterialLighting } from '../ui/Theme';

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
 * The face carries a struck CROWN - seven tapered rays on a half ring, no
 * face inside it - rather than a number or a letter. Show-don't-tell, and a
 * glyph would need translating where a struck shape does not. Seven rays over
 * a band reads as one particular object even at cell size, where the
 * six-point burst it replaced was a generic sparkle.
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

  // THE SHEEN: a graded falloff across the face, not a flat fill under the
  // device.
  //
  // Phaser's gradient fill only applies to rectangles and triangles, so a
  // disc has to be built as rings - shrinking ellipses drawn toward the light
  // and stepped along the material's own ramp. Enough of them that the bands
  // stop being countable, and each is soft enough to blend into the last.
  const SHEEN = 7;
  for (let i = 1; i <= SHEEN; i++) {
    const t = i / SHEEN;
    const rad = r * 0.8 * (1 - t * 0.7);
    // Drifts up and left as it tightens, so the brightest part of the face
    // sits where the light is rather than in the middle of the coin.
    const drift = -r * 0.16 * t;
    g.fillStyle(toneAt(p, 0.5 + t * 0.34), 0.3);
    g.fillEllipse(drift + r * 0.06, drift + r * 0.06, rad * 2, rad * 2);
  }

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

  drawStruckCrown(g, r, p);
}

/**
 * The struck device on the face: SEVEN tapered rays standing on a half ring.
 *
 * Seven, and no face in the middle - a crown seen from the front, cut down to
 * the two things that survive at cell size. A six-point star was doing the
 * same job less specifically: at 20 pixels a six-pointed burst is a generic
 * sparkle, where seven rays over a band reads as one particular object even
 * when you cannot count them.
 *
 * The band is drawn as an ARC rather than a circle so the device sits on
 * something, which is what stops the rays reading as a starburst floating in
 * the middle of the coin.
 */
/**
 * How far the relief is displaced, and how hard, as a fraction of the coin's
 * radius. Two passes rather than one: a single offset copy has a hard far
 * edge of its own, where two at falling strength read as the face curving
 * away. Down and right, because the light on every object here is upper-left.
 */
const RELIEF: readonly (readonly [number, number])[] = [[0.05, 0.5], [0.026, 0.55]];

function drawStruckCrown(
  g: Phaser.GameObjects.Graphics, r: number, p: MaterialLighting
): void {
  // Pushed down a touch: rays are top-heavy, so a device centred on the
  // geometric middle sits visibly high on the face.
  const cy = r * 0.16;
  const bandR = r * 0.34;

  // SEVEN rays, fanned across the upper half. Each is a triangle whose base
  // sits on the band, so they read as fixed to it rather than laid over it.
  const RAYS = 7;
  const from = Math.PI * 1.04;
  const to = Math.PI * 1.96;
  // Base width is measured PERPENDICULAR to each ray, not as an angle.
  //
  // The first version spread the base by a fixed angle at the band's radius,
  // which is small - so at cell size every ray came out a sub-pixel sliver
  // and the device read as a bare arc. An angular width is only a width where
  // the radius is large, and here it never is.
  const halfBase = r * 0.085;
  for (let i = 0; i < RAYS; i++) {
    const a = from + ((to - from) * i) / (RAYS - 1);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // The centre ray is longest and they shorten toward the ends, which is
    // what makes seven spikes read as a crown rather than a cog.
    const tip = r * (0.95 - Math.abs(i - 3) * 0.07);
    const bx = cos * bandR;
    const by = cy + sin * bandR;
    // Perpendicular to the ray.
    const px = -sin * halfBase;
    const py = cos * halfBase;

    // RELIEF, not an outline. A struck coin's device is raised, so what you
    // see under it is the face falling away on the side opposite the light -
    // a displaced dark copy, softened over two passes. A tight line all the
    // way round reads as a printed sticker, which is what this was.
    for (const [d, alpha] of RELIEF) {
      g.fillStyle(p.shadow, alpha);
      g.beginPath();
      g.moveTo(bx + px + d * r, by + py + d * r);
      g.lineTo(cos * tip + d * r, cy + sin * tip + d * r);
      g.lineTo(bx - px + d * r, by - py + d * r);
      g.closePath();
      g.fillPath();
    }

    g.fillStyle(p.highlight, 1);
    g.beginPath();
    g.moveTo(bx + px, by + py);
    g.lineTo(cos * tip, cy + sin * tip);
    g.lineTo(bx - px, by - py);
    g.closePath();
    g.fillPath();
    // One shaded flank per ray, so seven of them do not flatten into a fan.
    g.fillStyle(p.light, 0.9);
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(cos * tip, cy + sin * tip);
    g.lineTo(bx - px, by - py);
    g.closePath();
    g.fillPath();

  }

  // THE HALF RING they stand on - open at the bottom, so it is a band around
  // a head that is not drawn rather than a closed hoop.
  const band: Phaser.Geom.Point[] = [];
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI * 1.02 + (Math.PI * 0.96 * i) / 26;
    band.push(new Phaser.Geom.Point(Math.cos(a) * bandR, cy + Math.sin(a) * bandR));
  }
  // The same relief under the band, offset the same way, so the whole device
  // is lit by one light rather than the ring and the rays disagreeing.
  for (const [d, alpha] of RELIEF) {
    g.lineStyle(Math.max(1, r * 0.16), p.shadow, alpha);
    g.strokePoints(
      band.map((pt) => new Phaser.Geom.Point(pt.x + d * r, pt.y + d * r)), false, false
    );
  }
  g.lineStyle(Math.max(1, r * 0.16), p.highlight, 1);
  g.strokePoints(band, false, false);
  g.lineStyle(Math.max(1, r * 0.06), p.light, 0.9);
  g.strokePoints(band, false, false);
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
