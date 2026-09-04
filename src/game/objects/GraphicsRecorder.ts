/**
 * A stand-in for `Phaser.GameObjects.Graphics` that draws nothing and instead
 * records the bounding box of everything asked of it.
 *
 * This exists so the game can know how big an icon actually is. Every shape
 * in TierIcons.ts is authored by hand from `s`-relative literals, so the real
 * drawn extent of a tier is an emergent property of ~40 numbers rather than
 * anything declared - and it varies by 2.75x across the 27 tiers. Running the
 * genuine draw call through this recorder is the only way to get that number
 * without either hand-maintaining a parallel table of sizes (which would rot
 * the first time a shape is retouched) or rendering to a real canvas (which
 * needs a live WebGL context and so can't run in tests).
 *
 * Only the subset of the Graphics API that TierIcons actually calls is
 * implemented. If a drawing helper starts using a new method, add it here -
 * an unimplemented method would throw rather than silently under-measure,
 * which is the failure mode we want.
 */

export interface RecordedBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PointLike {
  x: number;
  y: number;
}

export class GraphicsRecorder {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  /** True once any geometry has been recorded. */
  get hasGeometry(): boolean {
    return this.minX <= this.maxX;
  }

  get bounds(): RecordedBounds {
    return { minX: this.minX, minY: this.minY, maxX: this.maxX, maxY: this.maxY };
  }

  private point(x: number, y: number): this {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return this;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
    return this;
  }

  /** Corner-anchored box. Handles negative width/height, since min/max sorts it out. */
  private box(x: number, y: number, w: number, h: number): this {
    return this.point(x, y).point(x + w, y + h);
  }

  /** Centre-anchored box - Phaser's ellipse methods take a CENTRE plus FULL width/height. */
  private centred(cx: number, cy: number, w: number, h: number): this {
    return this.point(cx - w / 2, cy - h / 2).point(cx + w / 2, cy + h / 2);
  }

  // --- style state: no geometry, so these are pure no-ops ---
  fillStyle(): this { return this; }
  lineStyle(): this { return this; }
  fillGradientStyle(): this { return this; }
  setAlpha(): this { return this; }
  clear(): this {
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = -Infinity;
    this.maxY = -Infinity;
    return this;
  }

  // --- path building ---
  beginPath(): this { return this; }
  closePath(): this { return this; }
  fillPath(): this { return this; }
  strokePath(): this { return this; }
  moveTo(x: number, y: number): this { return this.point(x, y); }
  lineTo(x: number, y: number): this { return this.point(x, y); }

  // --- primitives ---
  fillRect(x: number, y: number, w: number, h: number): this { return this.box(x, y, w, h); }
  strokeRect(x: number, y: number, w: number, h: number): this { return this.box(x, y, w, h); }
  fillRoundedRect(x: number, y: number, w: number, h: number): this { return this.box(x, y, w, h); }
  strokeRoundedRect(x: number, y: number, w: number, h: number): this { return this.box(x, y, w, h); }

  fillEllipse(cx: number, cy: number, w: number, h: number): this { return this.centred(cx, cy, w, h); }
  strokeEllipse(cx: number, cy: number, w: number, h: number): this { return this.centred(cx, cy, w, h); }

  fillCircle(cx: number, cy: number, r: number): this { return this.centred(cx, cy, r * 2, r * 2); }
  strokeCircle(cx: number, cy: number, r: number): this { return this.centred(cx, cy, r * 2, r * 2); }

  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): this {
    return this.point(x1, y1).point(x2, y2).point(x3, y3);
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    return this.point(x1, y1).point(x2, y2);
  }

  strokePoints(points: PointLike[]): this {
    for (const pt of points) this.point(pt.x, pt.y);
    return this;
  }

  /**
   * Both of these were MISSING, and a missing method here is not a silently
   * wrong measurement - it is a TypeError thrown out of `iconFootprint`, so
   * any art that used them could not be drawn on the board at all. The
   * Decagon is drawn from polygons and a countersunk arc and hit exactly
   * that.
   */
  fillPoints(points: PointLike[]): this {
    for (const pt of points) this.point(pt.x, pt.y);
    return this;
  }

  /**
   * Sampled rather than taken as the full circle: an arc is usually a partial
   * sweep, and boxing it as a whole circle would inflate the footprint of
   * anything that used one for a rim or a lip.
   */
  arc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): this {
    const SAMPLES = 16;
    const sweep = endAngle - startAngle;
    for (let i = 0; i <= SAMPLES; i++) {
      const a = startAngle + (sweep * i) / SAMPLES;
      this.point(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    }
    return this;
  }
}
