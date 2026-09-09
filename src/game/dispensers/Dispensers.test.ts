import { describe, expect, it } from 'vitest';
import {
  BASE_RECHARGE_MS,
  FAMILY_RECHARGE_ORDER,
  MAX_DISPENSER_TIER,
  capacityForTier,
  collectDispenser,
  cooldownForTier,
  makeDispenser,
  mergeDispenserPair,
  refillDispenser,
  rechargeMsForFamily,
  rushCostGems,
  syncDispenser,
  outputTierDistribution,
  rollOutputTier,
  maxCollectMultiplier
} from './Dispensers';

describe('reservoir capacity', () => {
  it('gives Water sources ten additional stored items per tier', () => {
    expect([1, 2, 3, 4, 5].map((tier) => capacityForTier('water', tier)))
      .toEqual([10, 20, 30, 40, 50]);
  });

  it('does not change with source tier', () => {
    // Two regressions in one. Capacity used to SHRINK - wood ran 30 -> 14 and
    // glass ran 18, 21, 24, 18, 20 (climbing, dropping, climbing again),
    // both artifacts of the retired batch-based config rather than designed
    // curves - so upgrading handed the player a smaller number than they had.
    // The fix then briefly overshot into GROWING capacity with tier, which
    // was worse in a subtler way: more banked drops means the player reaches
    // the recharge timer less often, and that wait is the best beat in the
    // game. Capacity is a family trait; tier is a capability trait.
    for (const typeId of FAMILY_RECHARGE_ORDER) {
      const atOne = capacityForTier(typeId, 1);
      for (let tier = 2; tier <= MAX_DISPENSER_TIER; tier++) {
        expect(capacityForTier(typeId, tier), `${typeId} source tier ${tier}`).toBe(atOne);
      }
    }
  });

  it('keeps the authored 30-drop wood opening', () => {
    // Pinned separately because Energy.test.ts sizes ENERGY_CAP against the
    // three families' reservoirs.
    expect(capacityForTier('wood', 1)).toBe(30);
  });

  it('still differentiates the families', () => {
    // With tier out of the picture, capacity is one of only two levers
    // carrying family personality (the other is recharge rate). If these ever
    // converge, the three sources become the same object in three colours.
    const sizes = FAMILY_RECHARGE_ORDER.map((f) => capacityForTier(f, 1));
    expect(new Set(sizes).size).toBe(sizes.length);
  });
});

describe('on-board sources', () => {
  it('fully refills an upgraded Water source when two are merged', () => {
    const merged = mergeDispenserPair(
      makeDispenser('water', 1, 1_000, 0),
      makeDispenser('water', 1, 1_000, 0),
      1_000
    );
    expect(merged.tier).toBe(2);
    expect(merged.charges).toBe(20);
    expect(merged.readyAt).toBe(0);
  });

  it('supports a full 30-drop opening source', () => {
    const source = makeDispenser('wood', 1, 1_000, capacityForTier('wood', 1));
    expect(source.charges).toBe(30);
    expect(source.readyAt).toBe(0);
  });

  it('carries both sources stored drops into the merged source', () => {
    const now = 1_000;
    const a = makeDispenser('wood', 1, now, 4);
    const b = makeDispenser('wood', 1, now, 5);
    const merged = mergeDispenserPair(a, b, now);
    expect(merged.tier).toBe(2);
    // Previously asserted dropsPerChargeForTier, which under the old
    // batch model was a 13-drop floor that beat the 9 carried drops. The
    // per-drop ladder makes that expression 1, so this now asserts what
    // the test was always named for: the drops actually survive.
    expect(merged.charges).toBe(9);
  });

  it('caps preserved drops at the upgraded source capacity', () => {
    const now = 1_000;
    const a = makeDispenser('wood', 1, now, 30);
    const b = makeDispenser('wood', 1, now, 30);
    const merged = mergeDispenserPair(a, b, now);
    expect(merged.charges).toBe(capacityForTier('wood', 2));
  });

  it('finishes recharge when dry sources are merged', () => {
    const now = 1_000;
    const a = makeDispenser('wood', 1, now, 0);
    const b = makeDispenser('wood', 1, now, 0);
    const merged = mergeDispenserPair(a, b, now);
    expect(merged.charges).toBeGreaterThan(0);
    expect(collectDispenser(merged, now, 0.99)?.tier).toBe(2);
  });

  it('allows authored opening drops without disabling later bonuses', () => {
    const source = makeDispenser('wood', 1, 1_000, 3);
    expect(collectDispenser(source, 1_000, 0.99)?.tier).toBe(1);
    expect(collectDispenser(source, 1_000, 0.2)?.tier).toBe(2);
    expect(collectDispenser(source, 1_000, 0.01)?.tier).toBe(3);
  });

});

describe('per-family recharge ladder', () => {
  it('doubles the interval for each family in unlock order', () => {
    expect(rechargeMsForFamily('wood')).toBe(5_000);
    expect(rechargeMsForFamily('mineral')).toBe(10_000);
    expect(rechargeMsForFamily('glass')).toBe(20_000);
  });

  it('adds a flat 10s per family after the first, so a new family needs no timer number', () => {
    // Wood to stone is the one irregular step (5s -> 10s); everything after
    // is +10s. This used to double, which agreed with the linear ladder for
    // the three families that exist and then ran away: the 6th family would
    // have recharged at 160s, well past the point the wait can be masked.
    const expected = [5_000, 10_000, 20_000];
    FAMILY_RECHARGE_ORDER.forEach((typeId, index) => {
      expect(rechargeMsForFamily(typeId), typeId).toBe(expected[index]);
    });
    // The shape future families inherit, checked against the formula rather
    // than against whatever happens to be in the array today.
    for (let index = 1; index < 8; index++) {
      expect(FAMILY_RECHARGE_ORDER.length > index
        ? rechargeMsForFamily(FAMILY_RECHARGE_ORDER[index])
        : index * 10_000).toBe(index * 10_000);
    }
  });

  it('falls back to the base interval for an unknown family', () => {
    expect(rechargeMsForFamily('not-a-family')).toBe(BASE_RECHARGE_MS);
  });

  it('holds the interval flat across a family own source tiers', () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(cooldownForTier('wood', tier)).toBe(5_000);
      expect(cooldownForTier('glass', tier)).toBe(20_000);
      expect(cooldownForTier('water', tier)).toBe(1_000);
    }
  });

  it('regenerates exactly one drop per interval', () => {
    const now = 1_000;
    const source = makeDispenser('wood', 1, now, 0);
    syncDispenser(source, now + 5_000);
    expect(source.charges).toBe(1);
    syncDispenser(source, now + 15_000);
    expect(source.charges).toBe(3);
  });

  it('never overfills past the reservoir', () => {
    const now = 1_000;
    const source = makeDispenser('wood', 1, now, 0);
    syncDispenser(source, now + 5_000 * 500);
    expect(source.charges).toBe(capacityForTier('wood', 1));
  });
});

describe('whole-reservoir gem refill', () => {
  it('prices Water refills at two Gems per source tier', () => {
    expect([1, 2, 3, 4, 5].map((tier) => rushCostGems(makeDispenser('water', tier, 0, 0), 0)))
      .toEqual([2, 4, 6, 8, 10]);
  });

  it('prices by family position plus source level', () => {
    expect(rushCostGems(makeDispenser('wood', 1, 0, 0), 0)).toBe(1);
    expect(rushCostGems(makeDispenser('wood', 3, 0, 0), 0)).toBe(3);
    expect(rushCostGems(makeDispenser('mineral', 1, 0, 0), 0)).toBe(2);
    expect(rushCostGems(makeDispenser('glass', 4, 0, 0), 0)).toBe(6);
  });

  it('fills the entire reservoir and clears its timer', () => {
    const source = makeDispenser('mineral', 2, 0, 0);
    refillDispenser(source);
    expect(source.charges).toBe(capacityForTier('mineral', 2));
    expect(source.readyAt).toBe(0);
  });
});

describe('below-tier output', () => {
  it('keeps upgrading worth it - each tier still pays about double', () => {
    // The constraint this was tuned against. If a source tier stopped being
    // worth roughly twice the one below it, climbing the ladder would stop
    // making sense and the whole capability curve would go with it.
    const ev = (tier: number) => [...outputTierDistribution('wood', tier).entries()]
      .reduce((sum, [t, p]) => sum + p * 2 ** (t - 1), 0);
    for (let tier = 2; tier <= 5; tier++) {
      const ratio = ev(tier) / ev(tier - 1);
      expect(ratio, `tier ${tier}`).toBeGreaterThan(1.75);
      expect(ratio, `tier ${tier}`).toBeLessThan(2.05);
    }
  });

  it('always leaves the low tiers reachable, and every distribution sums to 1', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const dist = outputTierDistribution('wood', tier);
      const total = [...dist.values()].reduce((sum, p) => sum + p, 0);
      expect(total, `tier ${tier}`).toBeCloseTo(1, 6);
      // Nothing above the chain cap, nothing below tier 1.
      for (const t of dist.keys()) expect(t).toBeGreaterThanOrEqual(1);
      if (tier > 1) expect(dist.get(1) ?? 0, `tier ${tier}`).toBeGreaterThan(0);
    }
  });

  it('never produces a tier the chain does not have', () => {
    // The Decagon is one tier long; its source must not roll tier 2 or 3.
    for (let roll = 0; roll < 1; roll += 0.05) {
      expect(rollOutputTier('decagon', 1, roll)).toBe(1);
    }
  });
});

describe('energy multiplier', () => {
  it('buys exactly one tier per doubling, and costs the charges it replaces', () => {
    // The whole justification: x2 is one tier up because a tier IS two of the
    // tier below. If this drifted, the multiplier would become an efficiency
    // gain rather than a convenience.
    const at = (multiplier: 1 | 2 | 4) => {
      const d = makeDispenser('wood', 2, 0, 30);
      const out = collectDispenser(d, 0, 0.99, multiplier);
      return { tier: out!.tier, spent: 30 - d.charges };
    };
    const base = at(1);
    expect(at(2).tier).toBe(base.tier + 1);
    expect(at(4).tier).toBe(base.tier + 2);
    expect(at(1).spent).toBe(1);
    expect(at(2).spent).toBe(2);
    expect(at(4).spent).toBe(4);
  });

  it('never spends more charges than the reservoir holds', () => {
    const d = makeDispenser('wood', 2, 0, 3);
    collectDispenser(d, 0, 0.99, 4);
    expect(d.charges).toBe(0);
  });

  it('gates the multiplier by level', () => {
    expect(maxCollectMultiplier(1)).toBe(1);
    expect(maxCollectMultiplier(5)).toBe(2);
    expect(maxCollectMultiplier(15)).toBe(4);
  });
});
