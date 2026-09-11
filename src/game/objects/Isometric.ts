import Phaser from 'phaser';

/**
 * THE GAME'S ONE ISOMETRIC CAMERA.
 *
 * None of this is new. Every function here was already in `TierIcons.ts`,
 * written for the source buildings and reachable only from them - so each
 * item family went off and re-invented its own foreshortening by hand, with
 * its own depth ratio and its own idea of which face catches the light. Two
 * cameras in one board cell is what made the board look assembled rather than
 * designed, and the fix is not a new art direction, it is deleting the second
 * camera.
 *
 * Lifted out UNCHANGED, so the dispensers - which have always drawn against
 * this projection - are the regression test for the move.
 *
 * Nothing here knows about `Palette`. That is deliberate: `TierIcons` imports
 * this module, so a dependency the other way would be a cycle, and every
 * helper takes plain colours instead.
 */

/** Grid -> screen. Increasing x runs right-and-down, y left-and-down, z up. */
export type IsoFn = (x: number, y: number, z?: number) => [number, number];

/**
 * The projection the authored sources draw by hand, expressed once.
 *
 * The offsets exist because a drawing's grid origin is rarely its centre -
 * a slab usually runs longer on -x and a building rises on +z.
 */
export function makeIso(u: number, ox = 0.24, oy = 0.4): IsoFn {
  return (x, y, z = 0) => [
    (x - y) * u * 0.6 + u * ox,
    // 0.3, not 0.31. Half the horizontal run is what puts a ground edge at
    // atan(0.5) = 26.565 degrees - the isometric angle - and 0.31 put it at
    // 27.324, which reads as right on its own and wrong next to anything
    // drawn to the real one. See Mesh3D's projection, which shares it.
    (x + y) * u * 0.3 - z * u + u * oy
  ];
}

export function fillPoly(
  g: Phaser.GameObjects.Graphics, pts: [number, number][], color: number, alpha = 1
): void {
  g.fillStyle(color, alpha);
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
}

/**
 * How deep a top face is drawn, against how wide.
 *
 * THE CAMERA OWNS THIS, NOT THE CALLER. Depth was a free parameter, and a
 * solid given a different width-to-depth ratio to its neighbours is not a
 * differently shaped object - it is the same object seen from a different
 * angle. One block authored at 0.46x0.36 against planks at 0.52x0.24 read as
 * exactly that: a piece photographed from somewhere else and pasted in.
 *
 * So `isoSolid` takes a width and derives the depth. A solid can be any size
 * and any height; it cannot be at a different angle to everything else.
 */
export const ISO_DEPTH_RATIO = 0.46;

export interface IsoSolidOpts {
  /** Top face. The plane facing the key light, so normally the lightest. */
  top: number;
  /** Front-left face. */
  left: number;
  /** Front-right face, turned away from the key, so normally the darkest. */
  right: number;
  /** Hairline along the visible edges. Omit for a solid with no drawn edges. */
  edge?: number;
  alpha?: number;
}

/**
 * One box, placed by the centre of its BASE rather than its middle.
 *
 * That is the whole difference between a stack and a pile of floating plates,
 * and it is a lesson this codebase already learned once, in `sourceMass`:
 * stacking by centres leaves every layer a different distance off the ground
 * line. Placing by the base means two solids at the same `baseY` are standing
 * on the same floor, which is the only thing that makes a group read as one
 * object sitting somewhere.
 */
export function isoSolid(
  g: Phaser.GameObjects.Graphics,
  cx: number, baseY: number, w: number, h: number,
  opts: IsoSolidOpts
): void {
  const d = w * ISO_DEPTH_RATIO;
  const alpha = opts.alpha ?? 1;
  const cy = baseY - h;
  const top: [number, number][] = [
    [cx - w * 0.5, cy], [cx, cy - d * 0.5], [cx + w * 0.5, cy], [cx, cy + d * 0.5]
  ];
  const down = (pt: [number, number]): [number, number] => [pt[0], pt[1] + h];

  // NO CONTACT SHADOW HERE. The board draws one under every tile, and an
  // icon that casts its own stacks a second ellipse on top of it at almost
  // the same y - the defect `shadow ownership` in the tests pins.

  fillPoly(g, [top[0], top[3], down(top[3]), down(top[0])], opts.left, alpha);
  fillPoly(g, [top[3], top[2], down(top[2]), down(top[3])], opts.right, alpha);
  fillPoly(g, top, opts.top, alpha);

  if (opts.edge !== undefined) {
    g.lineStyle(1, opts.edge, 0.48 * alpha);
    g.strokePoints(top.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    for (const corner of [top[0], top[2], top[3]]) {
      g.lineBetween(corner[0], corner[1], corner[0], corner[1] + h);
    }
  }
}

/**
 * A seam running along a top face, in that face's own perspective.
 *
 * `t` is the position across the face, 0 at the left corner and 1 at the
 * right. Drawn parallel to the long edge, which is what keeps a grain line
 * from looking painted on flat.
 */
export function isoTopSeam(
  g: Phaser.GameObjects.Graphics,
  cx: number, baseY: number, w: number, h: number,
  t: number, color: number, alpha = 0.45
): void {
  const d = w * ISO_DEPTH_RATIO;
  const cy = baseY - h;
  const ax = cx - w * 0.5 + w * 0.5 * t;
  const ay = cy + d * 0.5 * t;
  const bx = cx + w * 0.5 * t;
  const by = cy - d * 0.5 + d * 0.5 * t;
  g.lineStyle(1, color, alpha);
  g.lineBetween(ax, ay, bx, by);
}

/** Straight-line blend between two packed RGB colours. */
function mixRgb(a: number, b: number, t: number): number {
  const channel = (shift: number): number =>
    Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export interface IsoPrismOpts extends IsoSolidOpts {
  /**
   * Top footprint as a fraction of the base. Below 1 the solid tapers, which
   * is what separates an obelisk from a tall box.
   */
  taper?: number;
  /** Rotation of the footprint, in turns. Shifts which corner faces front. */
  spin?: number;
}

/**
 * An n-sided prism on the same camera, shaded per face.
 *
 * `isoSolid` is this with four sides and no taper, kept separate because a
 * box is the common case and its faces have names. Everything above a squared
 * block in the shape grammar - the beveled block, the faceted obelisk - is a
 * prism, and hand-authoring those as flat polygons is exactly how a family
 * ends up off-camera.
 *
 * Only FRONT-FACING sides are drawn, decided per edge by its own outward
 * normal rather than by a fixed index range, so the taper and spin cannot
 * turn a back face into a visible one.
 */
export function isoPrism(
  g: Phaser.GameObjects.Graphics,
  cx: number, baseY: number, w: number, h: number, sides: number,
  opts: IsoPrismOpts
): void {
  const alpha = opts.alpha ?? 1;
  const taper = opts.taper ?? 1;
  const rx = w * 0.5;
  const ry = rx * ISO_DEPTH_RATIO;
  const cy = baseY - h;
  const spin = (opts.spin ?? 0) * Math.PI * 2;

  const ring = (r: number, y: number): [number, number][] =>
    Array.from({ length: sides }, (_, i): [number, number] => {
      const a = spin + (i * Math.PI * 2) / sides;
      return [cx + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r];
    });
  const top = ring(taper, cy);
  const bottom = ring(1, baseY);

  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    // Outward normal of this face, in footprint angle terms. A face is
    // visible when it points toward the viewer, i.e. down the screen.
    const a = spin + ((i + 0.5) * Math.PI * 2) / sides;
    const ny = Math.sin(a);
    if (ny <= 0) continue;
    fillPoly(g, [top[i], top[j], bottom[j], bottom[i]],
      mixRgb(opts.left, opts.right, (Math.cos(a) + 1) / 2), alpha);
  }

  fillPoly(g, top, opts.top, alpha);

  if (opts.edge !== undefined) {
    g.lineStyle(1, opts.edge, 0.48 * alpha);
    g.strokePoints(top.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    for (let i = 0; i < sides; i++) {
      const a = spin + ((i + 0.5) * Math.PI * 2) / sides;
      if (Math.sin(a) <= 0) continue;
      g.lineBetween(top[i][0], top[i][1], bottom[i][0], bottom[i][1]);
    }
  }
}
