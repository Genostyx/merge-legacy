import { describe, expect, it } from 'vitest';
import { advanceLegacyMachine, normalizeLegacyMachine, legacyRotationsPerHour,
  LEGACY_MAX_LEVEL, LEGACY_MAX_RPH, legacyUnlocked, legacyUpgradeCost } from './LegacyMachine';

describe('machine clock', () => {
  it('keeps credit and gem prices without charging energy at any speed level', () => {
    for (let level = 0; level < LEGACY_MAX_LEVEL; level++) {
      expect(legacyUpgradeCost(level)).toEqual({
        credits: Math.round(250 * (level + 1) * (1 + level * 0.45)),
        gems: 4 + level * 2
      });
    }
  });
  it('reaches the advertised speed cap at the final speed upgrade', () => {
    expect(legacyRotationsPerHour(LEGACY_MAX_LEVEL)).toBe(LEGACY_MAX_RPH);
    expect(legacyRotationsPerHour(LEGACY_MAX_LEVEL - 1)).toBeLessThan(LEGACY_MAX_RPH);
  });
  it('requires the final room furnishings, not just stage access', () => {
    expect(legacyUnlocked(4, 4, false)).toBe(false);
    expect(legacyUnlocked(4, 4, true)).toBe(true);
    expect(legacyUnlocked(3, 4, true)).toBe(false);
  });
  it('never earns the same interval twice after a clock rewind', () => {
    const state = normalizeLegacyMachine({ gearOneLevel: 1, lastTickAt: 1000 });
    advanceLegacyMachine(state, 3_601_000);
    const turns = state.turns[0];
    advanceLegacyMachine(state, 1000);
    expect(state.lastTickAt).toBe(3_601_000);
    advanceLegacyMachine(state, 3_601_000);
    expect(state.turns[0]).toBe(turns);
  });
});
