import { describe, expect, it } from 'vitest';
import { advanceLegacyMachine, normalizeLegacyMachine, legacyRotationsPerHour,
  LEGACY_MAX_LEVEL, LEGACY_MAX_RPH, legacyUnlocked, legacyUpgradeCost,
  createDefaultLegacyMachine, claimableLegacyMilestones, markLegacyClaimed,
  nextLegacyMilestone, syncLegacyGears, legacyRepeatInterval,
  buyLegacyGear, legacyGearCount, LEGACY_GEAR_RATIO,
  LEGACY_PRE_BOUGHT_GEARS, legacyRewardRow, legacyCreditsOwed,
  LEGACY_CREDITS_PER_TURN, LEGACY_REWARD_GEARS_PER_RUNG,
  legacyMilestones, legacyReward, type LegacyMachineState } from './LegacyMachine';

/**
 * A machine that already owns `gears` gears.
 *
 * The machine ships EMPTY now - every gear is bought - so a test that
 * wants a train has to say so. These arrive having started at zero,
 * which is what the old free eight were.
 */
function machineWithGears(gears: number): LegacyMachineState {
  const state = createDefaultLegacyMachine();
  state.torqueLevel = gears;
  syncLegacyGears(state);
  return state;
}

describe('machine clock', () => {
  it('prices speed from the top down, never charging energy or going backwards', () => {
    // The last upgrade is the anchor: the top of the original 36-level
    // track, so the most expensive speed purchase costs what it always did.
    expect(legacyUpgradeCost(LEGACY_MAX_LEVEL - 1)).toEqual({ credits: 150_750, gems: 74 });
    // And the first lands on the original's opening gem price.
    expect(legacyUpgradeCost(0).gems).toBe(4);
    // Not against level 1: below ~11,000c a step is worth under half a
    // credit, so neighbouring levels round to the same price.
    expect(legacyUpgradeCost(0).credits).toBeLessThan(legacyUpgradeCost(10_000).credits);
    let previous = legacyUpgradeCost(0);
    for (let level = 1; level < LEGACY_MAX_LEVEL; level++) {
      const cost = legacyUpgradeCost(level);
      expect(Object.keys(cost).sort()).toEqual(['credits', 'gems']);
      expect(cost.credits).toBeGreaterThanOrEqual(previous.credits);
      expect(cost.gems).toBeGreaterThanOrEqual(previous.gems);
      previous = cost;
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

/** Turns of gear one that put `gear` on `own` rotations of its own. */
function turnsFor(gear: number, own: number): number {
  return own * LEGACY_GEAR_RATIO ** gear;
}

describe('gear one is a wage', () => {
  it('pays a coin per whole rotation and never the same one twice', () => {
    const state = machineWithGears(1);
    state.turns[0] = 3.9;
    // Whole rotations only - a part rotation is not a rotation, and rounding
    // it would pay out faster than the machine turns.
    expect(legacyCreditsOwed(state)).toBe(3 * LEGACY_CREDITS_PER_TURN);
    expect(legacyCreditsOwed(state)).toBe(0);
    state.turns[0] = 3.99;
    expect(legacyCreditsOwed(state)).toBe(0);
    state.turns[0] = 5;
    expect(legacyCreditsOwed(state)).toBe(2 * LEGACY_CREDITS_PER_TURN);
  });

  it('pays nothing while the machine has no gears', () => {
    const state = createDefaultLegacyMachine();
    state.turns[0] = 500;
    expect(legacyCreditsOwed(state)).toBe(0);
  });

  it('has no milestones of its own', () => {
    // It used to pay pouches, baskets and bronze crates on a track. The
    // wage replaced all of it, so there is nothing left to reach.
    expect(legacyMilestones(0)).toEqual([]);
    const state = machineWithGears(4);
    state.turns[0] = 5_000;
    syncLegacyGears(state);
    expect(claimableLegacyMilestones(state).filter((e) => e.gear === 0)).toEqual([]);
  });

  it('reports the wage through advance, as one entry rather than thousands', () => {
    const state = machineWithGears(1);
    state.gearOneLevel = 250;
    state.lastTickAt = 1000;
    const produced = advanceLegacyMachine(state, 1000 + 3_600_000);
    const wage = produced.filter((e) => e.reward.kind === 'credits');
    expect(wage).toHaveLength(1);
    expect(wage[0].reward).toEqual({ kind: 'credits', amount: 250 });
  });

  it('treats a save from before the wage as already paid up', () => {
    // Defaulting the marker to 0 would hand a month-old save every rotation
    // it ever made, as a windfall it never earned.
    const restored = normalizeLegacyMachine({ turns: [1250], torqueLevel: 8 });
    expect(restored.creditsPaidTurns).toBe(1250);
    expect(legacyCreditsOwed(restored)).toBe(0);
  });
});

describe('the reward ladder is spread by rarity', () => {
  it('starts the authored rows at gear two, a rung every 10.5 gears', () => {
    expect(legacyRewardRow(0)).toBe(0);
    expect(legacyRewardRow(1)).toBe(1);
    expect(legacyRewardRow(1 + Math.ceil(LEGACY_REWARD_GEARS_PER_RUNG))).toBe(2);
  });

  it('puts the shipping container at gear 65 and not before', () => {
    // THE ANCHOR. One rotation of gear 65 costs 4.1M turns of gear one,
    // which is one container per 3.4 days with gear one at 50,000/hr - the
    // rate gear 8 gave at 4:1 against the old 200/hr ceiling.
    expect(legacyReward(63, 1)).not.toEqual({ kind: 'crate', tier: 'shipping' });
    expect(legacyReward(64, 1)).toEqual({ kind: 'crate', tier: 'shipping' });
    expect(legacyReward(99, 1)).toEqual({ kind: 'crate', tier: 'shipping' });
  });
});

describe('repeatable final rewards', () => {
  it('keeps the first-time sequence and repeats only its final reward', () => {
    // GEAR TWO, because gear one pays a wage and has no track at all.
    // Its row's interval is 100, so 400 of its own rotations is the
    // first-time four plus three repeats.
    const state = machineWithGears(8);
    state.turns[0] = turnsFor(1, 400);
    syncLegacyGears(state);
    const claims = claimableLegacyMilestones(state).filter(entry => entry.gear === 1);
    expect(claims.map(entry => entry.milestone)).toEqual([1, 5, 25, 100, 200, 300, 400]);
    expect(claims.slice(-2).map(entry => entry.reward)).toEqual([
      { kind: 'crate', tier: 'silver' }, { kind: 'crate', tier: 'silver' }
    ]);
    for (const entry of claims) markLegacyClaimed(state, entry.gear, entry.milestone);
    expect(claimableLegacyMilestones(state).filter(entry => entry.gear === 1)).toEqual([]);
    expect(state.claimed[1]).toEqual([1, 5, 25, 100]);
    expect(state.repeatPaid[1]).toBe(4);
    state.turns[0] = turnsFor(1, 450);
    syncLegacyGears(state);
    // Halfway, to float tolerance - the turn count is derived through
    // 1.267314^gear, so it does not land on exact halves.
    const next = nextLegacyMilestone(state, 1)!;
    expect(next.milestone).toBe(500);
    expect(next.progress).toBeCloseTo(0.5, 10);
  });

  it('repeats shipping rewards once per rotation on the shipping gears', () => {
    const state = machineWithGears(65);
    // Driven off the real ratio, not a hardcoded 4 - these count
    // ROTATIONS OF A DEEP GEAR, so the turns of gear one they need
    // move whenever the ratio does.
    // A hair over, because turnsFor(64, 3) lands just under 3 in floats.
    state.turns[0] = turnsFor(64, 3) * (1 + 1e-12);
    syncLegacyGears(state);
    const claims = claimableLegacyMilestones(state).filter(entry => entry.gear === 64);
    expect(claims.map(entry => entry.milestone)).toEqual([1, 2, 3]);
    expect(claims.every(entry => entry.reward.kind === 'crate' && entry.reward.tier === 'shipping')).toBe(true);
  });

  it('pays multiple offline cycles once and retains the counter across saving', () => {
    const state = machineWithGears(8);
    // 200/hr, which is what the cap used to be - the point of this test is
    // that a few repeat cycles pay once each, and at the real cap (100,000)
    // six hours is 1,500 of them.
    state.gearOneLevel = 200;
    state.lastTickAt = 1000;
    const now = 1000 + 6 * 3_600_000;
    const produced = advanceLegacyMachine(state, now).filter(entry => entry.gear === 1);
    expect(produced.map(entry => entry.milestone)).toEqual([1, 5, 25, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
    const restored = normalizeLegacyMachine(JSON.parse(JSON.stringify(state)));
    // Only the wage is outstanding on a second pass at the same instant -
    // no rotation has been added, so no milestone can have been reached.
    expect(advanceLegacyMachine(restored, now).filter(e => e.reward.kind !== 'credits')).toEqual([]);
    expect(restored.repeatPaid[1]).toBe(9);
    expect(advanceLegacyMachine(restored, now + 2 * 3_600_000).filter(entry => entry.gear === 1)
      .map(entry => entry.milestone)).toEqual([1000, 1100, 1200]);
  });

  it('preserves old saves without retroactive repeat payouts', () => {
    const state = normalizeLegacyMachine({ turns: [1250], claimed: [[1, 5, 25, 100, 400]] });
    expect(state.turns[0]).toBe(1250);
    // Gear one has no track, so it can owe nothing and repeat nothing.
    expect(state.repeatPaid[0]).toBe(0);
    expect(claimableLegacyMilestones(state).filter(entry => entry.gear === 0)).toEqual([]);
  });

  it('handles torque gears with the same repeating shipping interval', () => {
    // Sixty-six gears, so index 65 is a shipping gear - the row whose
    // interval is one rotation. Index 8 used to be that row, back when the
    // ladder sat in the machine's first eight gears.
    const state = machineWithGears(66);
    state.turns[0] = turnsFor(65, 2) * (1 + 1e-12);
    syncLegacyGears(state);
    expect(legacyRepeatInterval(65)).toBe(1);
    expect(claimableLegacyMilestones(state).filter(entry => entry.gear === 65)
      .map(entry => entry.milestone)).toEqual([1, 2]);
  });
});

describe('gears bought one at a time', () => {
  it('starts a newly bought gear from a standstill', () => {
    const state = machineWithGears(8);
    state.turns[0] = 100_000;
    syncLegacyGears(state);

    buyLegacyGear(state);
    const bought = legacyGearCount(state) - 1;

    // It arrives at zero rather than inheriting gear one's history.
    expect(state.turns[bought]).toBe(0);
    expect(state.gearStartTurns[bought]).toBe(100_000);
  });

  it('counts only the turns since the gear was bought', () => {
    const state = machineWithGears(8);
    state.turns[0] = 100_000;
    syncLegacyGears(state);
    buyLegacyGear(state);
    const bought = legacyGearCount(state) - 1;

    state.turns[0] += LEGACY_GEAR_RATIO ** bought * 3;
    syncLegacyGears(state);

    expect(state.turns[bought]).toBeCloseTo(3, 6);
  });

  it('leaves the base gears measuring from zero', () => {
    const state = machineWithGears(8);
    state.turns[0] = 4096;
    syncLegacyGears(state);
    for (let gear = 1; gear < 8; gear++) {
      expect(state.turns[gear]).toBeCloseTo(4096 / LEGACY_GEAR_RATIO ** gear, 6);
    }
  });

  it('takes nothing away from a save written before gearStartTurns', () => {
    const state = machineWithGears(8);
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

describe('the machine starts empty', () => {
  it('ships with no gears at all', () => {
    const state = createDefaultLegacyMachine();
    expect(legacyGearCount(state)).toBe(0);
    expect(state.turns).toEqual([]);
  });

  it('does not turn before a gear is bought, whatever the speed', () => {
    const state = createDefaultLegacyMachine();
    state.gearOneLevel = LEGACY_MAX_LEVEL;
    state.lastTickAt = 1;
    expect(advanceLegacyMachine(state, 1 + 3_600_000)).toEqual([]);
    expect(state.turns[0] ?? 0).toBe(0);
  });

  it('gives a save from before the change its free eight back as purchases', () => {
    // Written when `torqueLevel` counted gears ADDED to a free eight.
    const old = { gearOneLevel: 3, torqueLevel: 2, turns: [4096], claimed: [], lastTickAt: 5 };
    const restored = normalizeLegacyMachine(old);
    expect(legacyGearCount(restored)).toBe(LEGACY_PRE_BOUGHT_GEARS + 2);
    expect(restored.turns[0]).toBe(4096);
  });

  it('leaves an already-migrated save alone', () => {
    const state = machineWithGears(9);
    const restored = normalizeLegacyMachine(JSON.parse(JSON.stringify(state)));
    expect(legacyGearCount(restored)).toBe(9);
  });
});
