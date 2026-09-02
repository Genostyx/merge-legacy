import { describe, expect, it } from 'vitest';
import { materialLighting, toneAt, toneForNormal } from './Theme';

const channels = (color: number) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
const luma = (color: number) => {
  const [r, g, b] = channels(color);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
/** How far a colour is from neutral grey. Near-white and near-black both score ~0. */
const chroma = (color: number) => {
  const c = channels(color);
  return Math.max(...c) - Math.min(...c);
};

const SAPPHIRE = 0x5eb3de; // strongly hued blue - Stone tier 8
const ROSEWOOD = 0xf2a866; // strongly hued warm - Wood tier 9

describe('materialLighting hue retention', () => {
  // The regression this exists for: the old ramp drove tier-9 highlight 98%
  // toward pure white and shadow to 3% of base, so every family's lit faces
  // were the same near-white and every outline was pure black. Family hue
  // collapsed exactly at the tier meant to be most distinctive.
  it('keeps family hue in the tier-9 highlight', () => {
    for (const base of [SAPPHIRE, ROSEWOOD]) {
      const { highlight } = materialLighting(base, 9);
      expect(chroma(highlight)).toBeGreaterThan(20);
    }
  });

  it('keeps family hue in the tier-9 shadow rather than going pure black', () => {
    for (const base of [SAPPHIRE, ROSEWOOD]) {
      const { shadow } = materialLighting(base, 9);
      expect(luma(shadow)).toBeGreaterThan(8);
      expect(chroma(shadow)).toBeGreaterThan(5);
    }
  });

  it('pins base to the family colour at every tier', () => {
    for (let tier = 1; tier <= 9; tier++) {
      expect(materialLighting(SAPPHIRE, tier).base).toBe(SAPPHIRE);
    }
  });
});

describe('materialLighting tier spread', () => {
  const contrast = (tier: number) => {
    const p = materialLighting(SAPPHIRE, tier);
    return luma(p.highlight) - luma(p.shadow);
  };

  it('widens contrast substantially from tier 1 to tier 9', () => {
    // The old ramp widened only ~1.17x across all nine tiers, so "contrast
    // widens with tier" was aspirational rather than true.
    expect(contrast(9)).toBeGreaterThan(contrast(1) * 1.6);
  });

  it('increases monotonically with tier', () => {
    for (let tier = 2; tier <= 9; tier++) {
      expect(contrast(tier)).toBeGreaterThan(contrast(tier - 1));
    }
  });

  it('orders the five tones darkest to lightest at every tier', () => {
    for (let tier = 1; tier <= 9; tier++) {
      const p = materialLighting(SAPPHIRE, tier);
      const ordered = [p.shadow, p.dark, p.base, p.light, p.highlight].map(luma);
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i]).toBeGreaterThan(ordered[i - 1]);
      }
    }
  });
});

describe('toneAt / toneForNormal', () => {
  const palette = materialLighting(SAPPHIRE, 5);

  it('returns the ramp endpoints at 0 and 1', () => {
    expect(toneAt(palette, 0)).toBe(palette.shadow);
    expect(toneAt(palette, 1)).toBe(palette.highlight);
  });

  it('clamps out-of-range input instead of wrapping', () => {
    expect(toneAt(palette, -5)).toBe(palette.shadow);
    expect(toneAt(palette, 5)).toBe(palette.highlight);
  });

  it('increases monotonically across the ramp', () => {
    let previous = -1;
    for (let i = 0; i <= 20; i++) {
      const value = luma(toneAt(palette, i / 20));
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('lights a face pointing at the upper-left key brighter than one facing away', () => {
    // Screen y is DOWN, so upper-left is -3PI/4 and the opposite face is
    // +PI/4. Guards the sign: flipping it would light every faceted shape
    // from the lower-left and invert the whole game's rendering.
    const facingKey = toneForNormal(palette, -Math.PI * 0.75);
    const facingAway = toneForNormal(palette, Math.PI * 0.25);
    expect(luma(facingKey)).toBeGreaterThan(luma(facingAway));
    expect(facingKey).toBe(palette.highlight);
    expect(facingAway).toBe(palette.shadow);
  });

  it('produces a range of tones across facet normals, not two values', () => {
    // 12 evenly spaced normals yield 6 distinct tones, not 12: lighting is
    // mirror-symmetric about the key axis, so a face 45 degrees either side
    // of the light is equally lit. 6 is the correct answer here - the point
    // of the test is that it is nowhere near the 2 the old boolean gave.
    const tones = new Set<number>();
    for (let i = 0; i < 12; i++) tones.add(toneForNormal(palette, (Math.PI * 2 * i) / 12));
    expect(tones.size).toBeGreaterThanOrEqual(6);
  });
});
