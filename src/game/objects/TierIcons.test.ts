import { describe, expect, it, vi } from 'vitest';

// TierIcons pulls in `phaser` for four symbols, none of which need a real
// engine. Mocking them keeps these tests pure logic like the rest of the
// suite - importing the actual Phaser build requires a DOM and a canvas.
vi.mock('phaser', () => {
  class Point {
    constructor(public x: number, public y: number) {}
  }
  return {
    default: {
      Geom: { Point },
      Math: {
        Clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
        Linear: (a: number, b: number, t: number) => a + (b - a) * t
      }
    }
  };
});

const { drawTierIcon, iconFootprint, iconPresentation } = await import('./TierIcons');
const { GraphicsRecorder } = await import('./GraphicsRecorder');
const { materialLighting } = await import('../ui/Theme');

const FAMILIES = ['wood', 'mineral', 'glass'] as const;
const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
/** Every (family, tier) pair the game can draw - 27 icons. */
const ALL_TIERS = FAMILIES.flatMap((typeId) => TIERS.map((tier) => ({ typeId, tier })));

const recorderAsGraphics = (r: unknown) => r as Parameters<typeof drawTierIcon>[0];

describe('GraphicsRecorder', () => {
  it('treats ellipse arguments as a centre plus FULL width and height', () => {
    // Phaser's fillEllipse is centre-anchored while fillRect is
    // corner-anchored. Getting this backwards would silently halve or double
    // every measured footprint, so it is pinned.
    const r = new GraphicsRecorder();
    r.fillEllipse(10, 20, 8, 4);
    expect(r.bounds).toEqual({ minX: 6, minY: 18, maxX: 14, maxY: 22 });
  });

  it('treats rect arguments as a corner plus size', () => {
    const r = new GraphicsRecorder();
    r.fillRect(10, 20, 8, 4);
    expect(r.bounds).toEqual({ minX: 10, minY: 20, maxX: 18, maxY: 24 });
  });

  it('unions every recorded primitive', () => {
    const r = new GraphicsRecorder();
    r.fillCircle(0, 0, 5);
    r.lineBetween(-20, 0, 0, 30);
    expect(r.bounds).toEqual({ minX: -20, minY: -5, maxX: 5, maxY: 30 });
  });

  it('reports no geometry before anything is drawn, and again after clear()', () => {
    const r = new GraphicsRecorder();
    expect(r.hasGeometry).toBe(false);
    r.fillRect(0, 0, 4, 4);
    expect(r.hasGeometry).toBe(true);
    r.clear();
    expect(r.hasGeometry).toBe(false);
  });

  it('ignores style calls', () => {
    const r = new GraphicsRecorder();
    r.fillStyle();
    r.lineStyle();
    r.fillGradientStyle();
    expect(r.hasGeometry).toBe(false);
  });
});

describe('icon footprints', () => {
  it('measures real geometry for all 27 tiers', () => {
    for (const { typeId, tier } of ALL_TIERS) {
      const f = iconFootprint(typeId, tier);
      // Wide bounds on purpose: this is a smoke test that the tier draws
      // something plausible inside its box, not an assertion about styling.
      expect(f.width, `${typeId} ${tier} width`).toBeGreaterThan(0.1);
      expect(f.width, `${typeId} ${tier} width`).toBeLessThan(1.2);
      // Every icon extends below its own origin - a baseline at or above 0
      // would mean the shape floats entirely in the top half of the box and
      // the contact shadow would be drawn through it.
      expect(f.baselineY, `${typeId} ${tier} baseline`).toBeGreaterThan(0);
      expect(Math.abs(f.centerX), `${typeId} ${tier} centre`).toBeLessThan(0.25);
    }
  });

  it('scales the reported footprint linearly with the draw size', () => {
    // The measurement is taken once at a fixed size and cached, so the only
    // way it can serve every cell size is if it is applied proportionally.
    for (const { typeId, tier } of ALL_TIERS) {
      const palette = materialLighting(0x888888, tier);
      const small = drawTierIcon(recorderAsGraphics(new GraphicsRecorder()), typeId, tier, 48, palette);
      const large = drawTierIcon(recorderAsGraphics(new GraphicsRecorder()), typeId, tier, 96, palette);
      expect(large.footprint.width).toBeCloseTo(small.footprint.width * 2, 6);
      expect(large.footprint.baselineY).toBeCloseTo(small.footprint.baselineY * 2, 6);
    }
  });

  it('reports a footprint that matches what the icon actually drew', () => {
    // Guards the cache key: a stale or cross-wired entry would hand back
    // another tier's size, which is invisible until a shadow looks wrong.
    for (const { typeId, tier } of ALL_TIERS) {
      const recorder = new GraphicsRecorder();
      const render = drawTierIcon(
        recorderAsGraphics(recorder), typeId, tier, 100, materialLighting(0x888888, tier)
      );
      expect(render.footprint.width, `${typeId} ${tier}`).toBeCloseTo(recorder.maxX - recorder.minX, 6);
      expect(render.footprint.baselineY, `${typeId} ${tier}`).toBeCloseTo(recorder.maxY, 6);
    }
  });
});

describe('icon presentation', () => {
  const S = 100;
  /** The icon's box after the presentation transform, in the same units as `s`. */
  const presented = (typeId: string, tier: number) => {
    const f = iconFootprint(typeId, tier);
    const { scale, offsetX, offsetY } = iconPresentation(typeId, tier, S);
    return {
      width: f.width * scale * S,
      height: f.height * scale * S,
      left: (f.centerX - f.width / 2) * scale * S + offsetX,
      right: (f.centerX + f.width / 2) * scale * S + offsetX,
      top: (f.centerY - f.height / 2) * scale * S + offsetY,
      baseline: f.baselineY * scale * S + offsetY
    };
  };
  /** The size the tier ladder is actually meant to grow - see iconPresentation. */
  const visualSize = (typeId: string, tier: number) => {
    const b = presented(typeId, tier);
    return Math.sqrt(b.width * b.height);
  };

  it('grows visual size monotonically with tier, within every family', () => {
    // The defect: measured sizes were not monotone at all. Wood 2 was the
    // largest object in the game - larger than any tier-9 masterwork - and
    // Stone 8 was smaller than Stone 3. Size contradicted the merge ladder.
    for (const typeId of FAMILIES) {
      for (let tier = 2; tier <= 9; tier++) {
        expect(
          visualSize(typeId, tier),
          `${typeId} tier ${tier} is not larger than tier ${tier - 1}`
        ).toBeGreaterThan(visualSize(typeId, tier - 1));
      }
    }
  });

  it('keeps the three families the same size at the same tier', () => {
    // A Wood 4 and a Stone 4 are worth the same and must look it. They
    // previously differed by up to 1.4x purely by drawing accident.
    for (const tier of TIERS) {
      const sizes = FAMILIES.map((f) => visualSize(f, tier));
      const spread = Math.max(...sizes) / Math.min(...sizes);
      expect(spread, `tier ${tier} family spread`).toBeLessThan(1.12);
    }
  });

  it('narrows the whole-game size spread to something deliberate', () => {
    const all = ALL_TIERS.map(({ typeId, tier }) => visualSize(typeId, tier));
    // Was 2.39x and arbitrary. Now it should be the tier ladder and little
    // else - an upper bound, so tightening the ladder later can't fail this.
    expect(Math.max(...all) / Math.min(...all)).toBeLessThan(1.7);
  });

  it('keeps every icon within its allowed overhang', () => {
    // Pieces are drawn LARGER than their cell on purpose - the cell is a hit
    // target and a grid position, not a frame, and detail below ~40px of drawn
    // art stops reading on a phone. So this no longer asserts "inside the
    // box"; it asserts each of the three caps the presentation actually
    // enforces, which is what stops a shape growing without limit.
    const horizontal = S * (1.04 / 2); // half of MAX_WIDTH
    const top = S * 0.74;              // MAX_RISE
    const bottom = S * 0.52;           // sits on the ground line, never below the cell
    for (const { typeId, tier } of ALL_TIERS) {
      const b = presented(typeId, tier);
      expect(Math.max(-b.left, b.right), `${typeId} ${tier} horizontal`).toBeLessThanOrEqual(horizontal);
      expect(-b.top, `${typeId} ${tier} top`).toBeLessThanOrEqual(top);
      expect(b.baseline, `${typeId} ${tier} bottom`).toBeLessThanOrEqual(bottom);
    }
  });

  it('lands every icon on a common ground line', () => {
    // What makes a board of objects read as sitting on one surface. Measured
    // baselines ranged over 0.14..0.44 of the box before this.
    const baselines = ALL_TIERS.map(({ typeId, tier }) => presented(typeId, tier).baseline);
    expect(Math.max(...baselines) - Math.min(...baselines)).toBeLessThan(S * 0.06);
  });

  it('centres every icon horizontally', () => {
    for (const { typeId, tier } of ALL_TIERS) {
      const b = presented(typeId, tier);
      expect(Math.abs(b.left + b.right), `${typeId} ${tier}`).toBeLessThan(1e-9);
    }
  });
});

describe('shadow ownership', () => {
  it('draws no ground shadow inside any icon', () => {
    // The defect this pins: 8 of 27 tiers used to draw their own wide, flat
    // ellipse at the very bottom of the shape, which stacked on TileView's
    // footprint shadow at nearly the same y. The contact shadow belongs to
    // the board-side caller and to nobody else.
    //
    // A ground shadow is recognisable by shape alone: a very flat ellipse
    // (wide, short) sitting at or below the bottom of everything else. That
    // is a description of a cast shadow and of nothing else these icons draw
    // - the specular blobs are tall relative to their width and sit high.
    for (const { typeId, tier } of ALL_TIERS) {
      const suspects: string[] = [];
      const probe = new GraphicsRecorder();
      const record = probe.fillEllipse.bind(probe);
      probe.fillEllipse = (cx: number, cy: number, w: number, h: number) => {
        if (w > h * 3 && cy > 0) suspects.push(`ellipse ${w.toFixed(1)}x${h.toFixed(1)} at y=${cy.toFixed(1)}`);
        return record(cx, cy, w, h);
      };

      drawTierIcon(recorderAsGraphics(probe), typeId, tier, 100, materialLighting(0x888888, tier));
      expect(suspects, `${typeId} tier ${tier} draws its own ground shadow`).toEqual([]);
    }
  });
});
