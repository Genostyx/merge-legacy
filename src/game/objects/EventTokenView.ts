import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import { materialLighting, toneAt, type MaterialLighting } from '../ui/Theme';
import { loadedItemSprite } from './itemSprites';

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
  // A polished bevel reflects alternating bright and dark surroundings.
  for (let i = 0; i < 96; i++) {
    const a = i * Math.PI * 2 / 96;
    const reflection = Math.pow(Math.abs(Math.cos(a + 0.55)), 8);
    g.lineStyle(r * 0.12, metalMix(p.dark, 0xeafff7, 0.2 + reflection * 0.8), 1);
    g.beginPath();
    g.arc(0, 0, r * 0.9, a, a + Math.PI * 2 / 96 + 0.003);
    g.strokePath();
  }

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
function metalMix(a: number, b: number, t: number): number {
  const mix = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

function drawPolishedFace(
  g: Phaser.GameObjects.Graphics, radius: number, p: MaterialLighting
): void {
  // Parallel sections sample a reflected light strip across a flat face.
  // Unlike a centre fan, the highlight can cross the disc without every
  // triangle converging on the same middle tone. Keep the token's teal metal.
  const strips = 80;
  const angle = -0.3;
  const point = (u: number, v: number): [number, number] => [
    radius * (u * Math.cos(angle) - v * Math.sin(angle)),
    radius * (u * Math.sin(angle) + v * Math.cos(angle))
  ];
  const color = (v: number): number => {
    const broad = Math.exp(-Math.pow((v + 0.22) / 0.23, 2));
    // Widened from 0.055: at a 74px cell that was a sub-pixel line, which
    // aliases into a dashed glint rather than a reflection. It still reads
    // as a hard edge when large, and now survives being small.
    const sharp = Math.exp(-Math.pow((v + 0.28) / 0.085, 2));
    const lower = Math.exp(-Math.pow((v - 0.85) / 0.1, 2));
    // Was mixed 68% toward near-black and then only 12% back toward the
    // family colour, which came out as dark chrome rather than the bright
    // metal it is meant to be. The floor is lifted and the body sits much
    // closer to the token's own teal.
    const darkMetal = metalMix(p.shadow, 0x020b0a, 0.3);
    const body = metalMix(darkMetal, p.base, 0.38 + broad * 0.42);
    return metalMix(body, 0xf3fff5, Math.min(0.94, broad * 0.48 + sharp * 0.46 + lower * 0.22));
  };
  for (let i = 0; i < strips; i++) {
    const v0 = -1 + 2 * i / strips;
    const v1 = -1 + 2 * (i + 1) / strips;
    const w0 = Math.sqrt(Math.max(0, 1 - v0 * v0));
    const w1 = Math.sqrt(Math.max(0, 1 - v1 * v1));
    const a = point(-w0, v0), b = point(w0, v0);
    const c = point(-w1, v1), d = point(w1, v1);
    const top = color(v0), bottom = color(v1);
    g.fillGradientStyle(top, top, bottom, bottom, 1);
    g.fillTriangle(...a, ...b, ...c);
    g.fillGradientStyle(top, bottom, bottom, bottom, 1);
    g.fillTriangle(...b, ...d, ...c);
  }
}

/** Upper-left: the one light every object in this game is lit by. */
const KEY_ANGLE = -Math.PI * 0.75;

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

    // GRADED ACROSS ITS WIDTH, not flat-filled.
    //
    // On real polished metal every raised form carries continuous tone: a
    // spike is bright along the flank that faces the light and falls away
    // smoothly to the other side. Flat fills with a line drawn round them
    // read as cut paper, which is what these were - and it is the single
    // biggest difference between this and a photograph of a coin.
    //
    // Phaser interpolates colour PER VERTEX on a triangle, so the two flank
    // points take the lit and shaded tones and the tip takes the middle. The
    // GPU does the rest.
    const lean = Math.cos(a - KEY_ANGLE);
    // Which flank faces the light depends on where the ray points, so the
    // two tones swap as the fan sweeps past the light's axis.
    const litSide = -sin * Math.cos(KEY_ANGLE) + cos * Math.sin(KEY_ANGLE) > 0;
    const near = metalMix(p.light, 0xf3fff5, 0.88);
    const far = toneAt(p, 0.22 + lean * 0.1);
    g.fillGradientStyle(
      litSide ? near : far,
      metalMix(p.light, 0xf3fff5, 0.6 + lean * 0.2),
      litSide ? far : near,
      litSide ? far : near,
      1
    );
    g.fillTriangle(bx + px, by + py, cos * tip, cy + sin * tip, bx - px, by - py);
  }

  // THE ARCH, long enough to carry every foot.
  //
  // It ran from 1.02PI to 1.98PI while the rays ran 1.04PI to 1.96PI - about
  // four degrees of margin at each end. But a ray's foot is a WIDTH, not a
  // point: half a base of `halfBase` at a radius of `bandR` subtends around
  // twenty-four degrees, so the outer two rays hung off the ends of the arch
  // with nothing under them.
  //
  // The span is derived from that foot angle now rather than guessed, so the
  // arch always finishes outside the last ray however the fan is retuned.
  const footAngle = Math.atan2(halfBase, bandR);
  const bandFrom = from - footAngle;
  const bandTo = to + footAngle;
  const band: Phaser.Geom.Point[] = [];
  const BAND_STEPS = 30;
  for (let i = 0; i <= BAND_STEPS; i++) {
    const a = bandFrom + ((bandTo - bandFrom) * i) / BAND_STEPS;
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
  // The band is graded too, and for that it has to be a RIBBON rather than a
  // stroked line: a stroke takes one colour for its whole width, where a pair
  // of triangles per segment can run bright along its top edge and dark along
  // its bottom, which is what a band of metal actually does.
  const halfBand = r * 0.08;
  for (let k = 0; k < band.length - 1; k++) {
    const c0 = band[k];
    const c1 = band[k + 1];
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfBand;
    const ny = (dx / len) * halfBand;
    const lit = metalMix(p.light, 0xf3fff5, 0.85);
    const shade = toneAt(p, 0.25);
    // The outer edge of the arc is the one facing up and out, so it takes
    // the light and the inner edge takes the shade.
    g.fillGradientStyle(lit, lit, shade, shade, 1);
    g.fillTriangle(c0.x + nx, c0.y + ny, c1.x + nx, c1.y + ny, c0.x - nx, c0.y - ny);
    g.fillGradientStyle(lit, shade, shade, shade, 1);
    g.fillTriangle(c1.x + nx, c1.y + ny, c1.x - nx, c1.y - ny, c0.x - nx, c0.y - ny);
  }
}

/**
 * Display size for the render, as a multiple of the drawn version's `size`.
 *
 * BOTH ends have to be measured, and only one of them was. The render fills
 * 0.86 of its canvas - but the drawn medallion never filled its `size`
 * either: its disc reaches 0.34 and its crown 0.38, so 0.76 of the box. The
 * correction is the ratio between the two, 0.76 / 0.86, and dividing by the
 * render's fill alone made every token a third too big.
 */
const TOKEN_SCALE = 0.76 / 0.870;

/**
 * One event token as a display object: the RENDER when it is loaded, the
 * drawn medallion when it is not.
 *
 * Every surface that shows a token goes through this - the board, the chip,
 * the panel header, the forced-spawn preview - so they cannot end up on
 * different art from each other. The vector version stays as the fallback,
 * exactly as the currency marks kept theirs.
 */
export function eventTokenMark(
  scene: Phaser.Scene, size: number
): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
  const key = loadedItemSprite(scene, 'event-token', 1);
  if (key) {
    const drawn = size * TOKEN_SCALE;
    return scene.add.image(0, 0, key).setDisplaySize(drawn, drawn);
  }
  const g = scene.add.graphics();
  drawEventToken(g, size, materialLighting(EVENT_TOKEN_COLOR, 5));
  return g;
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
  private art: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, cellSize: number, gridPos: GridPosition) {
    super(scene, x, y);
    this.gridPos = gridPos;
    this.cellSize = cellSize;
    this.art = eventTokenMark(scene, cellSize);
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
