import Phaser from 'phaser';

/**
 * REAL GEOMETRY, PROJECTED - not flat shapes drawn to look solid.
 *
 * The first attempt at a shared isometric camera computed screen coordinates
 * directly: a "box" was three hand-written quads in screen space, and a
 * "prism" was a ring of screen-space points. That works for a cube seen from
 * one angle and falls apart for everything else, because nothing in it knows
 * what is in front of what. Faces cannot be culled, they cannot be sorted,
 * and the shading has to be assigned by hand per face - which is precisely
 * how a family ends up lit from a different direction to its neighbour.
 *
 * So objects are defined ONCE, in 3D, and the camera and the light are
 * applied to them. Which faces you can see, what order they draw in, and how
 * bright each one is all fall out of the geometry instead of being authored.
 *
 * The projection is the one the source buildings have always used, so the
 * dispensers and everything built here share a camera by construction:
 *
 *   +x runs right-and-down     +y runs left-and-down     +z runs up
 *
 * Nothing here imports `Palette`; shading is handed in as a ramp function so
 * `TierIcons` can own the material and this can own the maths.
 */

export type Vec3 = [number, number, number];

export interface Mesh {
  verts: Vec3[];
  /** Vertex indices, wound counter-clockwise seen from OUTSIDE the solid. */
  faces: number[][];
  /**
   * Shading normal per face CORNER, when the mesh carries its own.
   *
   * Baked out of Blender with Shade Auto Smooth on, rather than recomputed
   * here. The renderer can blend normals by angle perfectly well, but then
   * what Blender shows and what the game draws are two implementations that
   * have to agree - and when they disagree there is no way to tell which is
   * wrong. A mesh that ships its normals shades in the game exactly as it
   * looked when it was modelled.
   *
   * These are directions, not positions: translating and scaling a mesh
   * leaves them valid, ROTATING one does not.
   */
  cornerNormals?: Vec3[][];
}

/**
 * The view axis: the one direction that projects to nothing.
 *
 * Derived from the projection rather than guessed - solving
 * `(x - y) = 0` and `(x + y) * 0.31 - z = 0` gives `(1, 1, 0.62)`. A face is
 * toward the viewer exactly when its normal has a positive component along
 * this, which is what makes back-face culling a calculation instead of an
 * opinion.
 */
const VIEW: Vec3 = [1, 1, 0.62];

/**
 * Where the key light is, in object space.
 *
 * Screen upper-left, expressed in the world the meshes live in: "left" is
 * +y and "up" is +z. The small +x term keeps the right-hand faces from going
 * completely flat, so a solid still has three distinguishable planes when it
 * turns away from the light.
 */
const KEY: Vec3 = [0.15, 0.5, 0.85];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v: Vec3): Vec3 => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
};
const KEY_N = norm(KEY);
const VIEW_N = norm(VIEW);

/** Object space -> screen, at `u` pixels per unit. */
export function project(v: Vec3, u: number): [number, number] {
  return [(v[0] - v[1]) * u * 0.6, (v[0] + v[1]) * u * 0.31 - v[2] * u];
}

/** Outward normal of a face, from its first three vertices. */
function faceNormal(mesh: Mesh, face: number[]): Vec3 {
  const [a, b, c] = [mesh.verts[face[0]], mesh.verts[face[1]], mesh.verts[face[2]]];
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return norm([
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ]);
}

// ---- primitives ----

/**
 * A box standing on z = 0, centred on x and y.
 *
 * Sizes are FULL extents, not half - authoring a solid should not require
 * halving every dimension in your head.
 */
export function box(w: number, d: number, h: number): Mesh {
  const x = w / 2, y = d / 2;
  return {
    verts: [
      [-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0],
      [-x, -y, h], [x, -y, h], [x, y, h], [-x, y, h]
    ],
    faces: [
      [4, 5, 6, 7],   // top
      [0, 3, 2, 1],   // bottom
      [3, 7, 6, 2],   // +y, the front-left face
      [1, 2, 6, 5],   // +x, the front-right face
      [0, 4, 7, 3],   // -x
      [0, 1, 5, 4]    // -y
    ]
  };
}

/**
 * An n-sided prism standing on z = 0, optionally tapered toward the top.
 *
 * `taper` below 1 is what separates an obelisk from a tall box, and `spin`
 * turns the footprint so a corner or a flat can be made to face the viewer.
 */
export function prism(sides: number, r: number, h: number, taper = 1, spin = 0): Mesh {
  const ring = (radius: number, z: number): Vec3[] =>
    Array.from({ length: sides }, (_, i): Vec3 => {
      const a = spin + (i * Math.PI * 2) / sides;
      return [Math.cos(a) * radius, Math.sin(a) * radius, z];
    });
  const verts = [...ring(r, 0), ...ring(r * taper, h)];
  const faces: number[][] = [
    Array.from({ length: sides }, (_, i) => sides + i),
    Array.from({ length: sides }, (_, i) => sides - 1 - i)
  ];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push([i, j, sides + j, sides + i]);
  }
  return { verts, faces };
}

// ---- transforms ----

export function translate(mesh: Mesh, dx: number, dy: number, dz: number): Mesh {
  return {
    ...mesh,
    verts: mesh.verts.map(([x, y, z]): Vec3 => [x + dx, y + dy, z + dz])
  };
}

/**
 * Applies a rotation given as where the three object axes END UP.
 *
 * Every rotation goes through here so that BAKED NORMALS TURN WITH THE MESH.
 * They were being dropped: the rotate helpers rebuilt `{ verts, faces }` and
 * quietly left `cornerNormals` behind, so a rotated mesh silently fell back
 * to runtime smoothing and shaded differently from the same mesh unrotated.
 * A rotation is orthonormal, so the same matrix that moves a position moves a
 * direction.
 */
function applyBasis(mesh: Mesh, ax: Vec3, ay: Vec3, az: Vec3): Mesh {
  const map = ([x, y, z]: Vec3): Vec3 => [
    ax[0] * x + ay[0] * y + az[0] * z,
    ax[1] * x + ay[1] * y + az[1] * z,
    ax[2] * x + ay[2] * y + az[2] * z
  ];
  return {
    faces: mesh.faces,
    verts: mesh.verts.map(map),
    cornerNormals: mesh.cornerNormals?.map((face) => face.map(map))
  };
}

export function rotateX(mesh: Mesh, turns: number): Mesh {
  const a = turns * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  return applyBasis(mesh, [1, 0, 0], [0, c, s], [0, -s, c]);
}

export function rotateY(mesh: Mesh, turns: number): Mesh {
  const a = turns * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  return applyBasis(mesh, [c, 0, -s], [0, 1, 0], [s, 0, c]);
}

export function rotateZ(mesh: Mesh, turns: number): Mesh {
  const a = turns * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  return applyBasis(mesh, [c, s, 0], [-s, c, 0], [0, 0, 1]);
}

/**
 * Stands a flat-lying mesh UP so the viewer sees its face, not its edge.
 *
 * A knot is a plate: all its structure lives in one plane. Left lying on the
 * ground, the camera squashes that plane to 31% of its height and the weave
 * becomes an oval smear - the shape reads as a ring rather than as a knot.
 *
 * The basis is DERIVED, not dialled in. The object's +z goes onto the view
 * axis, so its plane is square to the viewer; its +y goes onto whatever is
 * left of world-up once the view axis is taken out of it, so the object is
 * upright rather than rolled to an arbitrary angle; and +x completes the set.
 * Upright is the half that a hand-tuned pair of rotations kept getting wrong,
 * because aiming an axis at the camera says nothing about the spin around it.
 */
export function faceViewer(mesh: Mesh): Mesh {
  const az = VIEW_N;
  const up: Vec3 = [0, 0, 1];
  const ay = norm([
    up[0] - az[0] * dot(up, az),
    up[1] - az[1] * dot(up, az),
    up[2] - az[2] * dot(up, az)
  ]);
  const ax: Vec3 = norm([
    ay[1] * az[2] - ay[2] * az[1],
    ay[2] * az[0] - ay[0] * az[2],
    ay[0] * az[1] - ay[1] * az[0]
  ]);
  return applyBasis(mesh, ax, ay, az);
}

/** One mesh from several, so a whole object sorts and culls as one thing. */
export function group(...meshes: Mesh[]): Mesh {
  const verts: Vec3[] = [];
  const faces: number[][] = [];
  for (const mesh of meshes) {
    const base = verts.length;
    verts.push(...mesh.verts);
    faces.push(...mesh.faces.map((f) => f.map((i) => i + base)));
  }
  return { verts, faces };
}

export interface RenderOpts {
  /** Pixels per object-space unit. */
  u: number;
  /**
   * Material ramp. `t` is 0 for a face pointing away from the key light and
   * 1 for one facing it square on.
   */
  tone: (t: number) => number;
  /** Hairline along each drawn face's edges. */
  edge?: number;
  edgeAlpha?: number;
  alpha?: number;
  /** Screen-space offset, applied after projection. */
  ox?: number;
  oy?: number;
  /**
   * Centre the projected object on the origin before drawing.
   *
   * Objects are authored at whatever coordinates make the SOLID easy to
   * describe - a burr is three bars crossing at (0,0,0), a stack grows up
   * from z = 0 - and where that lands on screen is an accident of the
   * projection. Centring here means an icon never has to carry a hand-tuned
   * offset that has to be re-tuned every time its geometry moves.
   */
  center?: boolean;
  /**
   * AUTO SMOOTH, by angle - Blender's rule, not a blanket one.
   *
   * `true` uses the default threshold; a number sets it in degrees. Faces
   * meeting at a shallower angle than this are shaded across; anything
   * sharper keeps its hard edge.
   *
   * A blanket smooth is wrong, and wrong in a way that looks like a bug: it
   * rounds off the corners of the tube's own cross-section as eagerly as it
   * rounds the sweep along its length, so a solid loses the crease that says
   * where it actually bends. The threshold is what separates "this facet is
   * an artefact of how finely I sampled the curve" from "this edge is real".
   *
   * Phaser cannot fill an arbitrary polygon with a gradient, but it CAN give
   * a triangle a colour per vertex. So a smoothed face is fanned into
   * triangles and each corner takes the tone of its own blended normal -
   * Gouraud shading, through the one primitive the engine offers.
   */
  smooth?: boolean | number;
}

/**
 * Draws a mesh: cull, sort, shade, fill.
 *
 * Painter's algorithm rather than a depth buffer - these are a few dozen
 * convex faces per icon, and sorting by how far each face's centre sits along
 * the view axis is exact for the solids this game draws.
 */
export function renderMesh(
  g: Phaser.GameObjects.Graphics, mesh: Mesh, opts: RenderOpts
): void {
  const { u, tone } = opts;
  const alpha = opts.alpha ?? 1;
  let ox = opts.ox ?? 0;
  let oy = opts.oy ?? 0;
  if (opts.center) {
    const b = meshBounds(mesh, u);
    ox -= (b.minX + b.maxX) / 2;
    oy -= (b.minY + b.maxY) / 2;
  }

  // Normals, per FACE and per CORNER. A corner's normal is the blend of the
  // faces meeting there that are within the smoothing angle of this one - so
  // the same vertex can be smooth along the sweep of a tube and hard across
  // the crease where it folds, which is the whole point of a threshold.
  const normals = mesh.faces.map((face) => faceNormal(mesh, face));
  let corners: Vec3[][] | null = null;
  if (mesh.cornerNormals) {
    // The mesh brought its own from Blender. Nothing to work out.
    corners = mesh.cornerNormals;
  } else if (opts.smooth) {
    const limit = Math.cos(
      ((typeof opts.smooth === 'number' ? opts.smooth : 40) * Math.PI) / 180
    );
    const adjacent: number[][] = mesh.verts.map(() => []);
    mesh.faces.forEach((face, f) => {
      for (const i of face) adjacent[i].push(f);
    });
    corners = mesh.faces.map((face, f) => face.map((i) => {
      const sum: Vec3 = [0, 0, 0];
      for (const g of adjacent[i]) {
        if (dot(normals[g], normals[f]) < limit) continue;
        sum[0] += normals[g][0];
        sum[1] += normals[g][1];
        sum[2] += normals[g][2];
      }
      return norm(sum);
    }));
  }

  const visible = mesh.faces
    .map((face, f) => ({
      face,
      f,
      n: normals[f],
      depth: face.reduce((t, i) => t + dot(mesh.verts[i], VIEW_N), 0) / face.length
    }))
    .filter(({ n }) => dot(n, VIEW_N) > 0)
    .sort((a, b) => a.depth - b.depth);

  // Half-Lambert: the unlit side lands at 0 rather than at some negative
  // number clamped flat, so a plane turned right away from the key still
  // carries its material instead of going to the bottom of the ramp.
  const lit = (n: Vec3): number => tone((dot(n, KEY_N) + 1) / 2);

  for (const { face, f, n } of visible) {
    const pts = face.map((i) => {
      const [x, y] = project(mesh.verts[i], u);
      return [x + ox, y + oy] as [number, number];
    });

    if (corners) {
      const shade = corners[f].map(lit);
      for (let k = 1; k + 1 < face.length; k++) {
        // Phaser maps the gradient's four corners onto a triangle's three
        // points in order, so the last colour is repeated.
        g.fillGradientStyle(shade[0], shade[k], shade[k + 1], shade[k + 1], alpha);
        g.fillTriangle(
          pts[0][0], pts[0][1], pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]
        );
      }
    } else {
      g.fillStyle(lit(n), alpha);
      g.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath();
      g.fillPath();
    }

    if (opts.edge !== undefined) {
      g.lineStyle(1, opts.edge, (opts.edgeAlpha ?? 0.4) * alpha);
      g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    }
  }
}

/**
 * The screen-space bounding box of a mesh, so a caller can sit an object on a
 * ground line or centre it without hand-measuring the projection.
 */
export function meshBounds(
  mesh: Mesh, u: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  const pts = mesh.verts.map((v) => project(v, u));
  return {
    minX: Math.min(...pts.map((q) => q[0])),
    maxX: Math.max(...pts.map((q) => q[0])),
    minY: Math.min(...pts.map((q) => q[1])),
    maxY: Math.max(...pts.map((q) => q[1]))
  };
}
