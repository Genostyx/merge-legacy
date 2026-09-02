import { describe, expect, it, vi } from 'vitest';

// Same reason as TierIcons.test: this module imports `phaser` for its type
// signatures only, but the real build wants a DOM and a canvas at import time.
vi.mock('phaser', () => ({ default: {} }));

const { CURRENCY_COLOR, currencyKindFor, drawCurrencyGlyph } = await import('./CurrencyGlyph');
const { GraphicsRecorder } = await import('../objects/GraphicsRecorder');
type CurrencyKind = 'credit' | 'gem' | 'energy';

const KINDS: CurrencyKind[] = ['credit', 'gem', 'energy'];

const record = (kind: CurrencyKind, size: number) => {
  const g = new GraphicsRecorder();
  drawCurrencyGlyph(g as never, kind, size);
  return g;
};

describe('currency glyphs', () => {
  it('maps every legacy unit code, and nothing else', () => {
    // These codes are still what the call sites pass around; a miss here is a
    // silent fallback to plain text, which is the thing being removed.
    expect(currencyKindFor('CR')).toBe('credit');
    expect(currencyKindFor('CREDITS')).toBe('credit');
    expect(currencyKindFor('GM')).toBe('gem');
    expect(currencyKindFor('GEMS')).toBe('gem');
    expect(currencyKindFor('E')).toBe('energy');
    expect(currencyKindFor('ENERGY')).toBe('energy');
    // XP is not a spendable currency and has no mark.
    expect(currencyKindFor('XP')).toBeNull();
    expect(currencyKindFor('')).toBeNull();
  });

  it('draws every kind', () => {
    for (const kind of KINDS) {
      expect(record(kind, 20).hasGeometry, kind).toBe(true);
    }
  });

  it('fits inside its stated box, centred on the origin', () => {
    // The whole point of the shared helper is that a glyph can sit on a text
    // baseline at any size. That only holds if `size` really is its height
    // and it really is centred - otherwise every call site needs its own
    // nudge, which is the situation this replaced.
    for (const kind of KINDS) {
      for (const size of [10, 14, 22, 40]) {
        const b = record(kind, size).bounds;
        const half = size / 2;
        expect(b.minX, `${kind} @${size}`).toBeGreaterThanOrEqual(-half - 0.51);
        expect(b.maxX, `${kind} @${size}`).toBeLessThanOrEqual(half + 0.51);
        expect(b.minY, `${kind} @${size}`).toBeGreaterThanOrEqual(-half - 0.51);
        expect(b.maxY, `${kind} @${size}`).toBeLessThanOrEqual(half + 0.51);
      }
    }
  });

  it('scales linearly, so one glyph is not quietly a different shape at a different size', () => {
    for (const kind of KINDS) {
      const small = record(kind, 11).bounds;
      const large = record(kind, 44).bounds;
      expect(large.maxY - large.minY, kind).toBeCloseTo((small.maxY - small.minY) * 4, 4);
      expect(large.maxX - large.minX, kind).toBeCloseTo((small.maxX - small.minX) * 4, 4);
    }
  });

  it('fills the height it claims', () => {
    // A mark that only fills half its box reads as small next to text sized
    // to the same number.
    for (const kind of KINDS) {
      const b = record(kind, 20).bounds;
      expect(b.maxY - b.minY, kind).toBeGreaterThan(20 * 0.85);
    }
  });

  it('gives each currency its own colour', () => {
    const colors = KINDS.map((k) => CURRENCY_COLOR[k]);
    expect(new Set(colors).size).toBe(KINDS.length);
  });
});
