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

  drawPolishedFace(g, r * 0.8, p);

  drawStruckCrown(g, crownR, p);
}

/**
 * THE FACE: one clean gradient across the disc, not rings.
 *
 * It was built as concentric circles stepping up the material ramp, and that
 * is a stepped RADIAL fill - at any size the steps read as contour rings,
 * which is nothing a polished coin does.
 *
 * Phaser's gradient fill only applies to rectangles and triangles, but a
 * triangle takes a colour PER VERTEX and the GPU interpolates between them.
 * So the disc is a fan of triangles, and each rim vertex is toned by how far
 * it faces the light. That is a real directional gradient, smooth by
 * construction rather than by using enough steps to hide the seams.
 *
 * The specular goes on top: an elongated blur across the upper left, which is
 * the one mark that makes metal read as polished rather than painted.
 */
function drawPolishedFace(
  g: Phaser.GameObjects.Graphics, radius: number, p: MaterialLighting
): void {
  const SEGMENTS = 48;
  // A POOL OF LIGHT, NOT A RAMP.
  //
  // A coin does not shade from one edge to the other. It carries a broad
  // soft pool sitting off-centre toward the light, and the field falls away
  // toward the rim on EVERY side - the darkest part is a crescent hugging
  // the inside of the rim on the far side, not the far edge itself.
  //
  // The fan gives both at once: the centre vertex is the brightest tone, so
  // every triangle darkens outward - that is the vignette - and each rim
  // vertex is toned by how far it faces the light, so the falloff is deeper
  // on the far side, which is the pool being off-centre.
  const pool = 0.8;
  const rimAt = (angle: number): number =>
    0.4
    + 0.22 * Math.cos(angle - KEY_ANGLE)
    // A dimmer second light bouncing back off whatever the coin is lying on.
    // It stops the far side going flat, and it is plainly there on a real
    // one: a lift along the bottom-left.
    + 0.07 * Math.cos(angle - Math.PI * 0.25);

  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = (Math.PI * 2 * i) / SEGMENTS;
    const a1 = (Math.PI * 2 * (i + 1)) / SEGMENTS;
    // Centre vertex first, then the two rim vertices - Phaser maps the four
    // gradient corners onto a triangle's three points in that order.
    g.fillGradientStyle(
      toneAt(p, pool), toneAt(p, rimAt(a0)), toneAt(p, rimAt(a1)), toneAt(p, rimAt(a1)), 1
    );
    g.fillTriangle(
      0, 0,
      Math.cos(a0) * radius, Math.sin(a0) * radius,
      Math.cos(a1) * radius, Math.sin(a1) * radius
    );
  }
  // NO SEPARATE HIGHLIGHT SHAPE.
  //
  // A blob and then a band were both tried on top of this gradient, and both
  // read as something stuck to the metal rather than as the metal. A polished
  // disc under one light IS a gradient - the bright part is simply the end of
  // it, not a mark laid over it. The ramp above runs the full width of the
  // material now, from its lightest tone to its darkest, which is the whole
  // reflection.
}

/** Upper-left: the one light every object in this game is lit by. */
const KEY_ANGLE = -Math.PI * 0.75;

/**
 * The tone a raised face of the device takes.
 *
 * THE DEVICE IS THE SAME METAL AS THE FIELD. On a struck coin the relief is
 * not a different colour - it is the same surface pushed up, legible only
 * because each raised edge catches a thin bright line on the side facing the
 * light and drops a thin shadow on the side away from it.
 *
 * This was filled in `highlight` on a mid-tone field, which is exactly why it
 * read as paint on metal rather than as metal. It sits one shade above the
 * field now and no more; the edges do all the reading.
 */
const STRUCK_FACE = 0.6;

/**
 * Outlines a struck shape the way a coin does: bright where an edge faces the
 * light, dark where it faces away.
 *
 * Per EDGE, by that edge's own normal, rather than one outline in one colour.
 * An even outline all the way round is the thing that makes a shape look
 * printed on - real relief is lit on one side and shadowed on the other, and
 * which side that is changes as the shape turns.
 */
function strokeStruckEdges(
  g: Phaser.GameObjects.Graphics, pts: readonly (readonly [number, number])[],
  p: MaterialLighting, width: number
): void {
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const nx = y2 - y1;
    const ny = -(x2 - x1);
    const facing = (nx * Math.cos(KEY_ANGLE) + ny * Math.sin(KEY_ANGLE)) / (Math.hypot(nx, ny) || 1);
    g.lineStyle(width, facing > 0 ? p.highlight : p.shadow, facing > 0 ? 0.95 : 0.85);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
  }
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

    const face: [number, number][] = [
      [bx + px, by + py],
      [cos * tip, cy + sin * tip],
      [bx - px, by - py]
    ];
    g.fillStyle(toneAt(p, STRUCK_FACE), 1);
    g.beginPath();
    face.forEach(([fx, fy], k) => (k === 0 ? g.moveTo(fx, fy) : g.lineTo(fx, fy)));
    g.closePath();
    g.fillPath();
    strokeStruckEdges(g, face, p, Math.max(1, r * 0.045));
  }

  // THE HALF RING they stand on - open at the bottom, so it is a band around
  // a head that is not drawn rather than a closed hoop.
  const band: Phaser.Geom.Point[] = [];
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI * 1.02 + (Math.PI * 0.96 * i) / 26;
    band.push(new Phaser.Geom.Point(Math.cos(a) * bandR, cy + Math.sin(a) * bandR));
  }
  // The band is struck from the same metal too: its body takes the raised
  // tone, with a lit line along the edge facing the light and a shadow along
  // the one that does not. Offsetting those two is what gives a stroked arc
  // a thickness you can read.
  const lift = r * 0.055;
  g.lineStyle(Math.max(1, r * 0.05), p.shadow, 0.85);
  g.strokePoints(band.map((pt) => new Phaser.Geom.Point(pt.x + lift, pt.y + lift)), false, false);
  g.lineStyle(Math.max(1, r * 0.16), toneAt(p, STRUCK_FACE), 1);
  g.strokePoints(band, false, false);
  g.lineStyle(Math.max(1, r * 0.045), p.highlight, 0.95);
  g.strokePoints(band.map((pt) => new Phaser.Geom.Point(pt.x - lift * 0.7, pt.y - lift * 0.7)), false, false);
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
