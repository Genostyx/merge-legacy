import { describe, expect, it } from 'vitest';
import { advanceLegacyMachine, normalizeLegacyMachine, legacyRotationsPerHour,
  LEGACY_MAX_LEVEL, LEGACY_MAX_RPH, legacyUnlocked, legacyUpgradeCost,
  createDefaultLegacyMachine, claimableLegacyMilestones, markLegacyClaimed,
  nextLegacyMilestone, syncLegacyGears, legacyRepeatInterval,
  buyLegacyGear, legacyGearCount, LEGACY_GEAR_RATIO } from './LegacyMachine';

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

describe('repeatable final rewards', () => {
  it('keeps the first-time sequence and repeats only its final reward', () => {
    const state = createDefaultLegacyMachine();
    state.turns[0] = 1200;
    syncLegacyGears(state);
    const claims = claimableLegacyMilestones(state).filter(entry => entry.gear === 0);
    expect(claims.map(entry => entry.milestone)).toEqual([1, 5, 25, 100, 400, 800, 1200]);
    expect(claims.slice(-2).map(entry => entry.reward)).toEqual([
      { kind: 'crate', tier: 'bronze' }, { kind: 'crate', tier: 'bronze' }
    ]);
    for (const entry of claims) markLegacyClaimed(state, entry.gear, entry.milestone);
    expect(claimableLegacyMilestones(state).filter(entry => entry.gear === 0)).toEqual([]);
    expect(state.claimed[0]).toEqual([1, 5, 25, 100, 400]);
    expect(state.repeatPaid[0]).toBe(3);
    state.turns[0] = 1400;
    expect(nextLegacyMilestone(state, 0)).toEqual({ milestone: 1600, progress: 0.5 });
  });

  it('repeats shipping rewards once per rotation on the final gear', () => {
    const state = createDefaultLegacyMachine();
    state.turns[0] = 3 * 4 ** 7;
    syncLegacyGears(state);
    const claims = claimableLegacyMilestones(state).filter(entry => entry.gear === 7);
    expect(claims.map(entry => entry.milestone)).toEqual([1, 2, 3]);
    expect(claims.every(entry => entry.reward.kind === 'crate' && entry.reward.tier === 'shipping')).toBe(true);
  });

  it('pays multiple offline cycles once and retains the counter across saving', () => {
    const state = createDefaultLegacyMachine();
    state.gearOneLevel = LEGACY_MAX_LEVEL;
    state.lastTickAt = 1000;
    const now = 1000 + 6 * 3_600_000;
    const produced = advanceLegacyMachine(state, now).filter(entry => entry.gear === 0);
    expect(produced.map(entry => entry.milestone)).toEqual([1, 5, 25, 100, 400, 800, 1200]);
    const restored = normalizeLegacyMachine(JSON.parse(JSON.stringify(state)));
    expect(advanceLegacyMachine(restored, now)).toEqual([]);
    expect(claimableLegacyMilestones(restored)).toEqual([]);
    expect(restored.repeatPaid[0]).toBe(3);
    expect(advanceLegacyMachine(restored, now + 2 * 3_600_000).filter(entry => entry.gear === 0)
      .map(entry => entry.milestone)).toEqual([1600]);
  });

  it('preserves old saves without retroactive repeat payouts', () => {
    const state = normalizeLegacyMachine({ turns: [1250], claimed: [[1, 5, 25, 100, 400]] });
    expect(state.turns[0]).toBe(1250);
    expect(state.repeatPaid[0]).toBe(3);
    expect(claimableLegacyMilestones(state).filter(entry => entry.gear === 0)).toEqual([]);
    expect(nextLegacyMilestone(state, 0)).toEqual({ milestone: 1600, progress: 0.125 });
  });

  it('handles torque gears with the same repeating shipping interval', () => {
    const state = createDefaultLegacyMachine();
    state.torqueLevel = 1;
    state.turns[0] = 2 * 4 ** 8;
    syncLegacyGears(state);
    expect(legacyRepeatInterval(8)).toBe(1);
    expect(claimableLegacyMilestones(state).filter(entry => entry.gear === 8)
      .map(entry => entry.milestone)).toEqual([1, 2]);
  });
});

describe('gears bought one at a time', () => {
  it('starts a newly bought gear from a standstill', () => {
    const state = createDefaultLegacyMachine();
    state.turns[0] = 100_000;
    syncLegacyGears(state);

    buyLegacyGear(state);
    const bought = legacyGearCount(state) - 1;

    // It arrives at zero rather than inheriting gear one's history.
    expect(state.turns[bought]).toBe(0);
    expect(state.gearStartTurns[bought]).toBe(100_000);
  });

  it('counts only the turns since the gear was bought', () => {
    const state = createDefaultLegacyMachine();
    state.turns[0] = 100_000;
    syncLegacyGears(state);
    buyLegacyGear(state);
    const bought = legacyGearCount(state) - 1;

    state.turns[0] += LEGACY_GEAR_RATIO ** bought * 3;
    syncLegacyGears(state);

    expect(state.turns[bought]).toBeCloseTo(3, 6);
  });

  it('leaves the base gears measuring from zero', () => {
    const state = createDefaultLegacyMachine();
    state.turns[0] = 4096;
    syncLegacyGears(state);
    for (let gear = 1; gear < 8; gear++) {
      expect(state.turns[gear]).toBeCloseTo(4096 / LEGACY_GEAR_RATIO ** gear, 6);
    }
  });

  it('takes nothing away from a save written before gearStartTurns', () => {
    const state = createDefaultLegacyMachine();
    state.turns[0] = 100_000;
    state.torqueLevel = 2;
    syncLegacyGears(state);
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.gearStartTurns;

    const restored = normalizeLegacyMachine(legacy);
    expect(restored.gearStartTurns.every(v => v === 0)).toBe(true);
    for (let gear = 1; gear < legacyGearCount(restored); gear++) {
      expect(restored.turns[gear]).toBeCloseTo(100_000 / LEGACY_GEAR_RATIO ** gear, 6);
    }
  });
});
