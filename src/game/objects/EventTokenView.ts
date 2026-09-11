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
  // AN EVEN RIM, all the way round.
  //
  // It used to be lit along the upper-left and shaded along the lower-right,
  // which is how a SPHERE is shaded - and that is exactly what it looked
  // like: a dish, or a coin bent toward the light. A coin lying face-on has
  // its rim at the same angle to the light the whole way round, so the whole
  // ring is one tone. The face's own sheen carries the material; the rim only
  // has to say "raised edge".
  g.lineStyle(r * 0.12, p.light, 1);
  g.strokeCircle(0, 0, r * 0.9);

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
 * How far the struck device is displaced to cast its relief, as a fraction of
 * the crown's radius, and how hard.
 *
 * Two passes at falling strength rather than one: a single offset copy has a
 * hard far edge of its own, where two read as the face curving away. Down and
 * right, because the light on every object here is upper-left.
 *
 * Kept SHORT. At the first offsets a ray threw a shadow as wide as itself,
 * which at any size above a board cell read as a second, darker crown behind
 * the first rather than as depth.
 */
const RELIEF: readonly (readonly [number, number])[] = [[0.04, 0.5], [0.02, 0.55]];

/**
 * The struck device: seven spikes rising from behind a headband.
 *
 * THE BAND IS THE FLOOR OF THE DEVICE, NOT AN ARCH OVER IT. It first went in
 * as the upper half of a circle with the rays radiating around it, which is
 * not a crown at all - it reads as a sunburst behind a rainbow, and the ray
 * bases sat ON the arch instead of behind it. A crown seen from the front is
 * a band curving DOWN across the brow with the spikes standing up behind it,
 * so that is what this draws: a shallow smile, and seven rays whose feet
 * disappear behind it.
 *
 * Drawn in that order too - rays first, band last - because the band has to
 * overlap the feet for them to read as going behind it.
 */
function drawStruckCrown(
  g: Phaser.GameObjects.Graphics, r: number, p: MaterialLighting
): void {
  const halfW = r * 0.54;
  const sag = r * 0.2;
  // CENTRED BY MEASUREMENT, not by a guessed offset.
  //
  // The device runs from the tip of the tallest ray down to the bottom of the
  // band's sag, and that span is not symmetric about the point the rays are
  // struck from - so placing it by eye left it sitting low, with the spikes
  // touching the rim and a gap under the band. `browY` is derived below from
  // the extent the geometry actually has.
  const reach = r * 1.02;
  const browY = (reach - sag) / 2 - r * 0.02;

  /** A point along the headband, `t` running -1 (left) to 1 (right). */
  const band = (t: number): [number, number] => [t * halfW, browY + sag * (1 - t * t)];

  const RAYS = 7;
  const feet: [number, number][] = [];
  const tips: [number, number][] = [];
  for (let i = 0; i < RAYS; i++) {
    const t = -0.78 + (1.56 * i) / (RAYS - 1);
    const [bx, by] = band(t);
    // Each ray leans away from the middle, so the fan opens like a crown
    // rather than standing up like a comb.
    const lean = t * 0.62;
    const dx = Math.sin(lean);
    const dy = -Math.cos(lean);
    // Longest in the middle, and the outermost pair shortest - the profile
    // that makes seven spikes read as a crown instead of a cog.
    const len = reach - Math.abs(t) * r * 0.42;
    feet.push([bx, by]);
    tips.push([bx + dx * len, by + dy * len]);
  }

  // Base width is measured PERPENDICULAR to each ray, not as an angle. An
  // angular spread at a small radius is not a width at all: the first version
  // did that and every ray came out a sub-pixel sliver.
  const halfBase = r * 0.1;
  const flanks = feet.map(([bx, by], i): [[number, number], [number, number]] => {
    const [tx, ty] = tips[i];
    const dx = tx - bx;
    const dy = ty - by;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * halfBase;
    const py = (dx / len) * halfBase;
    return [[bx + px, by + py], [bx - px, by - py]];
  });

  // RELIEF first, under everything.
  for (const [d, alpha] of RELIEF) {
    g.fillStyle(p.shadow, alpha);
    for (let i = 0; i < RAYS; i++) {
      const [[ax, ay], [bx2, by2]] = flanks[i];
      const [tx, ty] = tips[i];
      g.beginPath();
      g.moveTo(ax + d * r, ay + d * r);
      g.lineTo(tx + d * r, ty + d * r);
      g.lineTo(bx2 + d * r, by2 + d * r);
      g.closePath();
      g.fillPath();
    }
  }

  // THE RAYS.
  for (let i = 0; i < RAYS; i++) {
    const [[ax, ay], [bx2, by2]] = flanks[i];
    const [tx, ty] = tips[i];
    g.fillStyle(p.highlight, 1);
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(tx, ty);
    g.lineTo(bx2, by2);
    g.closePath();
    g.fillPath();
  }

  // THE BAND, last, so it covers the feet.
  const curve: Phaser.Geom.Point[] = [];
  for (let i = 0; i <= 24; i++) {
    const [x, y] = band(-1 + (2 * i) / 24);
    curve.push(new Phaser.Geom.Point(x, y));
  }
  for (const [d, alpha] of RELIEF) {
    g.lineStyle(r * 0.17, p.shadow, alpha);
    g.strokePoints(
      curve.map((pt) => new Phaser.Geom.Point(pt.x + d * r, pt.y + d * r)), false, false
    );
  }
  g.lineStyle(r * 0.17, p.highlight, 1);
  g.strokePoints(curve, false, false);
  // A thin lit line along its top edge - a band is a strip of metal, and the
  // edge facing the light is what says so.
  g.lineStyle(r * 0.05, p.light, 0.9);
  g.strokePoints(
    curve.map((pt) => new Phaser.Geom.Point(pt.x, pt.y - r * 0.05)), false, false
  );
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
