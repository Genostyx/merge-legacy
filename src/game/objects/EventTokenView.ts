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
  // THE COIN SHRINKS, THE CROWN DOES NOT.
  //
  // The device is the readable part, and it was sized to survive a phone
  // cell; the disc around it only has to be big enough to hold it. So the
  // crown is still struck at the old radius while the coin is drawn smaller
  // around it, which lands the rays just short of the rim - a device that
  // fills its face, rather than a small mark adrift in a large blank.
  const r = s * 0.34;
  const crownR = s * 0.38;

  // A RIM, not milling.
  //
  // This used to draw sixteen ticks around the edge. At a 74px cell each was
  // under a pixel: invisible at best, a grey fringe at worst. Fewer and
  // bigger is the whole rule for icon-size art - one thick ring reads as a
  // struck edge where sixteen ticks read as nothing.
  //
  // There is no dark circle UNDER the rim any more. It was a full outline,
  // and an outline is the one thing a lit object does not have: the far side
  // of a rim is dark because it faces away from the light, and the near side
  // is not. Ringing the whole coin in shadow said it was lit from everywhere
  // and from nowhere at once.
  g.fillStyle(p.dark, 1);
  g.fillCircle(0, 0, r);
  // The rim catches the key along its upper-left, which is what gives the
  // coin an edge rather than an outline.
  g.lineStyle(r * 0.13, p.highlight, 0.85);
  g.beginPath();
  g.arc(0, 0, r * 0.9, Math.PI * 0.8, Math.PI * 1.7);
  g.strokePath();
  g.lineStyle(r * 0.1, p.shadow, 0.6);
  g.beginPath();
  g.arc(0, 0, r * 0.9, Math.PI * 1.75, Math.PI * 2.75);
  g.strokePath();

  // THE FACE, sunk inside the rim and a shade under the family colour, so
  // the pale device on it has something to be pale against.
  g.fillStyle(toneAt(p, 0.42), 1);
  g.fillCircle(0, 0, r * 0.8);

  // The sheen, as rings stepped along the material's ramp - Phaser gradients
  // only fill rectangles and triangles, so a disc has to be built this way.
  // FOUR rings at real strength rather than seven at a whisper: at cell size
  // a 0.3-alpha step is not a step at all.
  const SHEEN = 4;
  for (let i = 1; i <= SHEEN; i++) {
    const t = i / SHEEN;
    const rad = r * 0.8 * (1 - t * 0.72);
    const drift = -r * 0.15 * t;
    g.fillStyle(toneAt(p, 0.5 + t * 0.4), 0.55);
    g.fillCircle(drift, drift, rad);
  }

  drawStruckCrown(g, crownR, p);
}

/**
 * How far the relief is displaced, and how hard, as a fraction of the coin's
 * radius. Two passes rather than one: a single offset copy has a hard far
 * edge of its own, where two at falling strength read as the face curving
 * away. Down and right, because the light on every object here is upper-left.
 */
const RELIEF: readonly (readonly [number, number])[] = [[0.085, 0.55], [0.045, 0.6]];

function drawStruckCrown(
  g: Phaser.GameObjects.Graphics, r: number, p: MaterialLighting
): void {
  // Pushed down a touch: rays are top-heavy, so a device centred on the
  // geometric middle sits visibly high on the face.
  const cy = r * 0.16;
  const bandR = r * 0.3;

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
  const halfBase = r * 0.125;
  for (let i = 0; i < RAYS; i++) {
    const a = from + ((to - from) * i) / (RAYS - 1);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // The centre ray is longest and they shorten toward the ends, which is
    // what makes seven spikes read as a crown rather than a cog.
    const tip = r * (0.72 - Math.abs(i - 3) * 0.05);
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
    // The shaded flank each ray used to carry is gone. At cell size a ray is
    // four pixels across, so splitting it into a lit half and a shaded half
    // left two two-pixel slivers and the crown turned to mush. The relief
    // under the whole device does that job now, at a size that survives.

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
  /**
   * Set the instant collection begins, and never unset.
   *
   * A tap does not reach the collect until after `snapTo` has finished, and
   * that is a tween. A second tap inside those few frames found the token
   * still on the board and still in the view map, so two collects ran and the
   * player was paid twice for one token. The flag lives on the VIEW because
   * the view is the one thing both taps are holding.
   */
  collected = false;
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
