import { describe, expect, it } from 'vitest';
import {
  CRATE_THRESHOLDS,
  METER_MAX,
  addMeterCollect,
  availableSpawnerPieceFamilies,
  availableCrate,
  claimDaily,
  claimMeterCrate,
  finishMeterCooldown,
  isMeterCooling,
  meterCooldownRemaining,
  METER_COOLDOWN_MS,
  claimMilestone,
  crateForStreak,
  createDefaultRewardsState,
  dailyRewardFor,
  dailyOfferLevel,
  feedDecagonMeter,
  decagonMeterReady,
  DECAGON_MIN_LEVEL,
  rollDecagonPayout,
  DECAGON_PAYOUT_ITEMS,
  DECAGON_CRATE_QUOTA,
  dailyAvailable,
  dayIndexFor,
  milestoneCrateFor,
  nextCrateStep,
  normalizeRewardsState,
  pendingMilestones,
  cratePayload,
  rollCrate
  ,shippingContainerPayload
} from './Rewards';

const fill = (n: number) => {
  const state = createDefaultRewardsState();
  for (let i = 0; i < n; i++) addMeterCollect(state);
  return state;
};

/** Deterministic RNG cycling through fixed values, so loot rolls are assertable. */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('output meter', () => {
  it('fills one step per source collect and stops at the top', () => {
    const state = fill(METER_MAX + 25);
    expect(state.meterCollects).toBe(METER_MAX);
  });

  it('earns no crate below the first threshold', () => {
    expect(availableCrate(fill(CRATE_THRESHOLDS[0].collects - 1))).toBeNull();
    expect(availableCrate(fill(CRATE_THRESHOLDS[0].collects))).toBe('bronze');
  });

  it('upgrades the earned crate at each threshold, in order', () => {
    for (const step of CRATE_THRESHOLDS) {
      expect(availableCrate(fill(step.collects)), `at ${step.collects}`).toBe(step.tier);
    }
  });

  it('progress is fully deterministic - the same collects always earn the same crate', () => {
    // The whole point of this mechanic's honest version: fill decides the
    // crate, nothing else does. If this ever needed an RNG, the meter would
    // have become the thing it was written to avoid.
    for (let i = 0; i < 5; i++) expect(availableCrate(fill(72))).toBe('silver');
  });

  it('reports how far the next tier is, and nothing once at the top', () => {
    expect(nextCrateStep(fill(0))).toEqual({ tier: 'bronze', remaining: 40 });
    expect(nextCrateStep(fill(41))).toEqual({ tier: 'silver', remaining: 29 });
    expect(nextCrateStep(fill(METER_MAX))).toBeNull();
  });

  it('flags exactly the collect that crosses a threshold', () => {
    const state = fill(CRATE_THRESHOLDS[0].collects - 1);
    expect(addMeterCollect(state)).toBe(true);
    expect(addMeterCollect(state)).toBe(false);
  });

  it('claiming empties the meter and refuses when nothing is earned', () => {
    const state = fill(75);
    expect(claimMeterCrate(state)).toBe('silver');
    expect(state.meterCollects).toBe(0);
    expect(claimMeterCrate(state)).toBeNull();
  });

  it('pays ONE crate for a full meter, not one per threshold passed', () => {
    // Confirms the escalation the owner asked about: filling past bronze and
    // silver without claiming does NOT bank those too. You get the best tier
    // you reached and the meter empties - which is exactly what makes cashing
    // out early a real decision instead of a strictly worse one.
    const state = fill(METER_MAX);
    expect(claimMeterCrate(state)).toBe('gold');
    expect(state.meterCollects).toBe(0);
    expect(availableCrate(state)).toBeNull();
    expect(claimMeterCrate(state)).toBeNull();
  });

  it('lets the player cash out early rather than forcing them to the top', () => {
    // The real decision: collecting costs energy and crates contain energy,
    // so taking bronze now to keep playing can beat holding for gold.
    const state = fill(45);
    expect(availableCrate(state)).toBe('bronze');
    expect(claimMeterCrate(state)).toBe('bronze');
    expect(availableCrate(state)).toBeNull();
  });

  it('pauses source-run progress for ten minutes after any meter crate is received', () => {
    const claimedAt = 1_000_000;
    const state = fill(CRATE_THRESHOLDS[0].collects);
    expect(claimMeterCrate(state, claimedAt)).toBe('bronze');
    expect(isMeterCooling(state, claimedAt)).toBe(true);
    expect(meterCooldownRemaining(state, claimedAt)).toBe(METER_COOLDOWN_MS);

    addMeterCollect(state, claimedAt + METER_COOLDOWN_MS - 1);
    expect(state.meterCollects).toBe(0);

    expect(finishMeterCooldown(state, claimedAt + METER_COOLDOWN_MS)).toBe(true);
    addMeterCollect(state, claimedAt + METER_COOLDOWN_MS);
    expect(state.meterCollects).toBe(1);
  });
});

describe('level milestones', () => {
  it('grants on EVERY OTHER level only, escalating on a fixed cycle', () => {
    // One per level was too many: early levels arrive fast enough that a new
    // player banked a backlog they could not spend board space to open.
    expect(milestoneCrateFor(1)).toBeNull();
    expect(milestoneCrateFor(3)).toBeNull();
    expect(milestoneCrateFor(7)).toBeNull();
    expect(milestoneCrateFor(2)).toBe('bronze');
    expect(milestoneCrateFor(4)).toBe('bronze');
    expect(milestoneCrateFor(6)).toBe('silver');
    expect(milestoneCrateFor(10)).toBe('gold');
    expect(milestoneCrateFor(20)).toBe('vault');
    // Vault outranks the others where the cycles collide.
    expect(milestoneCrateFor(60)).toBe('vault');
  });

  it('hands out roughly one crate per two levels', () => {
    const granted = Array.from({ length: 30 }, (_, i) => milestoneCrateFor(i + 1)).filter(Boolean);
    expect(granted.length).toBe(15);
  });

  it('lists every unclaimed milestone, oldest first', () => {
    const state = createDefaultRewardsState();
    expect(pendingMilestones(state, 5).map((m) => m.level)).toEqual([2, 4]);
  });

  it('does not re-grant a claimed milestone', () => {
    const state = createDefaultRewardsState();
    claimMilestone(state, 3);
    expect(pendingMilestones(state, 6).map((m) => m.level)).toEqual([4, 6]);
  });

  it('never moves the claimed marker backwards', () => {
    const state = createDefaultRewardsState();
    claimMilestone(state, 8);
    claimMilestone(state, 3);
    expect(state.claimedMilestoneLevel).toBe(8);
    expect(pendingMilestones(state, 8)).toEqual([]);
  });

  it('persists one-at-a-time claims and resumes at the next milestone', () => {
    const state = createDefaultRewardsState();
    const first = pendingMilestones(state, 6)[0];
    expect(first).toEqual({ level: 2, tier: 'bronze' });
    claimMilestone(state, first.level);

    const loaded = normalizeRewardsState({ ...state });
    expect(pendingMilestones(loaded, 6)[0]).toEqual({ level: 4, tier: 'bronze' });
    expect(pendingMilestones(loaded, 6).map((reward) => reward.level)).toEqual([4, 6]);
  });
});

describe('daily claim', () => {
  const DAY = 86_400_000;
  const noon = (offsetDays: number) => new Date(2026, 7, 20 + offsetDays, 12).getTime();

  it('is available once per local day', () => {
    const state = createDefaultRewardsState();
    expect(dailyAvailable(state, noon(0))).toBe(true);
    claimDaily(state, noon(0));
    expect(dailyAvailable(state, noon(0))).toBe(false);
    expect(claimDaily(state, noon(0))).toBeNull();
    expect(dailyAvailable(state, noon(1))).toBe(true);
  });

  it('pins an unclaimed daily to the level the day opened at', () => {
    const state = createDefaultRewardsState();
    // Looked at on login at level 2, claimed later the same day at level 20.
    const pinned = dailyOfferLevel(state, noon(0), 2);
    expect(pinned).toBe(2);
    const claimed = claimDaily(state, noon(0), 20) as { credits: number };
    expect(claimed.credits).toBe((dailyRewardFor(1, 2) as { credits: number }).credits);
  });

  it('re-pins the level when the day rolls over', () => {
    const state = createDefaultRewardsState();
    dailyOfferLevel(state, noon(0), 2);
    claimDaily(state, noon(0), 2);
    expect(dailyOfferLevel(state, noon(1), 20)).toBe(20);
    const day2 = claimDaily(state, noon(1), 20) as { credits: number };
    expect(day2.credits).toBe((dailyRewardFor(2, 20) as { credits: number }).credits);
  });

  it('builds a streak across consecutive days', () => {
    const state = createDefaultRewardsState();
    for (let day = 0; day < 3; day++) claimDaily(state, noon(day));
    expect(state.dailyStreak).toBe(3);
  });

  it('restarts the streak at 1 after a missed day rather than zeroing out', () => {
    const state = createDefaultRewardsState();
    claimDaily(state, noon(0));
    claimDaily(state, noon(1));
    const back = claimDaily(state, noon(5));
    expect(state.dailyStreak).toBe(1);
    expect(back).toMatchObject({ kind: 'credits', dayLabel: '1' });
  });

  it('uses the five-day ladder and holds at gold on day 5+', () => {
    expect(crateForStreak(1)).toBe('bronze');
    // Day 1 carries a floor, so a level-1 player's first daily is worth
    // opening the game for rather than the ten Credits the curve gives.
    expect(dailyRewardFor(1, 1)).toEqual({ kind: 'credits', credits: 300, streak: 1, dayLabel: '1' });
    expect(dailyRewardFor(2, 1)).toEqual({ kind: 'credits', credits: 20, streak: 2, dayLabel: '2' });
    expect(dailyRewardFor(3, 1)).toMatchObject({ kind: 'crate', tier: 'bronze', dayLabel: '3' });
    expect(dailyRewardFor(4, 1)).toMatchObject({ kind: 'crate', tier: 'silver', dayLabel: '4' });
    expect(dailyRewardFor(5, 1)).toMatchObject({ kind: 'crate', tier: 'gold', dayLabel: '5+' });
    expect(dailyRewardFor(14, 1)).toMatchObject({ kind: 'crate', tier: 'gold', dayLabel: '5+' });
    expect((dailyRewardFor(2, 20) as { credits: number }).credits)
      .toBeGreaterThan((dailyRewardFor(2, 1) as { credits: number }).credits);
  });

  it('uses local midnight, so a late-evening and next-morning play are different days', () => {
    const lateTuesday = new Date(2026, 7, 25, 23, 30).getTime();
    const earlyWednesday = new Date(2026, 7, 26, 7, 0).getTime();
    expect(dayIndexFor(earlyWednesday) - dayIndexFor(lateTuesday)).toBe(1);
    // ...and two times within one evening are not.
    expect(dayIndexFor(lateTuesday)).toBe(dayIndexFor(lateTuesday - DAY / 6));
  });
});

describe('crate loot', () => {
  const alwaysHigh = seq([0.99]);
  const alwaysLow = seq([0.0]);
  /**
   * Decagon pieces ride an EXTRA roll appended after the slots are filled, so
   * they are not part of any approved slot count. These tests pin the slot
   * shape, so they measure it without them.
   */
  const slots = (payload: ReturnType<typeof cratePayload>) =>
    payload.filter((entry) => !(entry.kind === 'spawner-piece' && entry.typeId === 'decagon'));

  it('uses the approved chest slot counts', () => {
    expect(slots(cratePayload(rollCrate('bronze', 1, seq([0]))))).toHaveLength(4);
    expect(slots(cratePayload(rollCrate('bronze', 1, seq([0.99]))))).toHaveLength(5);
    expect(slots(cratePayload(rollCrate('silver', 1, alwaysHigh)))).toHaveLength(8);
    expect(slots(cratePayload(rollCrate('gold', 1, alwaysHigh)))).toHaveLength(12);
  });

  it('keeps obtained families and adds only the next unowned family', () => {
    expect(availableSpawnerPieceFamilies([])).toEqual(['wood', 'water']);
    expect(availableSpawnerPieceFamilies(['wood'])).toEqual(['wood', 'water']);
    expect(availableSpawnerPieceFamilies(['wood', 'water'])).toEqual(['wood', 'water', 'mineral']);
    expect(availableSpawnerPieceFamilies(['wood', 'water', 'mineral'])).toEqual(['wood', 'water', 'mineral', 'glass']);
    expect(availableSpawnerPieceFamilies(['wood', 'water', 'mineral', 'glass']))
      .toEqual(['wood', 'water', 'mineral', 'glass']);
  });

  it('fills a shipping container with exactly seven tier-1-or-2 pieces', () => {
    // Level 0 keeps the Decagon roll out of it, so this still measures the
    // dispenser-piece payload alone.
    const payload = shippingContainerPayload(['wood'], 0, seq([
      0.1, 0.1, 0.9, 0.9, 0.2, 0.1, 0.8, 0.1,
      0.3, 0.1, 0.7, 0.1, 0.4, 0.1
    ]));
    expect(payload).toHaveLength(7);
    expect(payload.every((entry) => entry.kind === 'spawner-piece' && (entry.tier === 1 || entry.tier === 2))).toBe(true);
    expect(payload.every((entry) => entry.kind !== 'spawner-piece' || ['wood', 'water'].includes(entry.typeId))).toBe(true);
  });

  it('uses the approved 69% total gold-chest spawner-piece cutoff', () => {
    const payload = cratePayload(rollCrate('gold', 1, seq([
      0.99,
      0.1, 0,
      0.2, 0,
      0.3, 0,
      0.4, 0,
      0.5, 0,
      0.6, 0,
      0.7, 0,
      0.72, 0,
      0.74, 0,
      0.76, 0.2, 0, 0,
      0.86, 0.6, 0,
      0.96, 0.99
    ])));
    const family = slots(payload);
    expect(family.filter((entry) => entry.kind === 'spawner-piece')).toHaveLength(7);
    expect(family.filter((entry) => entry.kind !== 'spawner-piece')).toHaveLength(5);
  });

  it('uses normal rewards rather than empty slots when no spawner piece rolls', () => {
    const payload = slots(cratePayload(rollCrate('silver', 1, alwaysHigh)));
    expect(payload).toHaveLength(8);
    expect(payload.every((entry) => entry.kind !== 'spawner-piece')).toBe(true);
  });

  it('draws item tiers from the player level, not from a fixed table', () => {
    // A deep player should never open a crate full of gravel. `alwaysHigh`
    // fails every piece and producer roll, so each slot falls through to an
    // ordinary item.
    const items = (level: number) => cratePayload(rollCrate('vault', level, alwaysHigh))
      .filter((entry) => entry.kind === 'item')
      .map((entry) => (entry as { tier: number }).tier);
    expect(Math.min(...items(20))).toBeGreaterThan(Math.min(...items(2)));
  });

  it('limits ordinary item rewards to families the player has unlocked', () => {
    const items = cratePayload(rollCrate('vault', 20, alwaysHigh, ['mineral']))
      .filter((entry) => entry.kind === 'item');
    expect(items).toHaveLength(16);
    expect(items.every((entry) => (entry as { typeId: string }).typeId === 'mineral')).toBe(true);
  });

  it('only ever rolls real families and legal tiers', () => {
    for (let roll = 0; roll < 40; roll++) {
      const loot = rollCrate('gold', 12, Math.random);
      for (const item of loot.items) {
        expect(['wood', 'mineral', 'glass']).toContain(item.typeId);
        expect(item.tier).toBeGreaterThanOrEqual(1);
        expect(item.tier).toBeLessThanOrEqual(9);
      }
      for (const piece of loot.spawnerPieces) {
        // Decagon pieces ride an additional roll, so they can appear in any
        // crate alongside the family pieces.
        expect(['wood', 'water', 'mineral', 'decagon']).toContain(piece.typeId);
        expect(piece.tier).toBeGreaterThanOrEqual(1);
        expect(piece.tier).toBeLessThanOrEqual(piece.typeId === 'decagon' ? 5 : 4);
      }
    }
  });
});

describe('save handling', () => {
  it('defaults a missing or malformed save', () => {
    expect(normalizeRewardsState(undefined)).toEqual(createDefaultRewardsState());
    const junk = normalizeRewardsState({ meterCollects: NaN, dailyStreak: -4 } as never);
    expect(junk.meterCollects).toBe(0);
    expect(junk.dailyStreak).toBe(0);
  });

  it('preserves "never claimed a daily" rather than clamping it to day zero', () => {
    // -1 is meaningful here; clamping it to 0 would make the epoch a claim.
    expect(normalizeRewardsState({}).lastDailyDay).toBe(-1);
    expect(dailyAvailable(normalizeRewardsState({}), Date.now())).toBe(true);
  });

  it('clamps a meter that somehow exceeds the cap', () => {
    expect(normalizeRewardsState({ meterCollects: 9999 }).meterCollects).toBe(METER_MAX);
  });
});

describe('decagon meter', () => {
  it('fills at ten and reports the fill on the tenth item', () => {
    const state = createDefaultRewardsState();
    for (let i = 0; i < 9; i++) {
      expect(feedDecagonMeter(state)).toBe(false);
    }
    expect(feedDecagonMeter(state)).toBe(true);
    expect(decagonMeterReady(state)).toBe(true);
  });

  it('keeps partial progress, because a Decagon is temporary and the meter is not', () => {
    const state = createDefaultRewardsState();
    feedDecagonMeter(state);
    feedDecagonMeter(state);
    const carried = normalizeRewardsState(JSON.parse(JSON.stringify(state)));
    expect(carried.decagonMeter).toBe(2);
  });

  it('empties the meter when it rolls, and pays the full payout count', () => {
    const state = createDefaultRewardsState();
    for (let i = 0; i < 10; i++) feedDecagonMeter(state);
    const payout = rollDecagonPayout(state, () => 0.999);
    expect(state.decagonMeter).toBe(0);
    expect(payout).toHaveLength(DECAGON_PAYOUT_ITEMS);
  });

  it('always pays at least one vault crate, whatever the rolls', () => {
    // Both extremes of every quota range, since the guarantee is the whole
    // point of the table and a mid-roll sample would not prove it.
    for (const rng of [() => 0, () => 0.999]) {
      const state = createDefaultRewardsState();
      const payout = rollDecagonPayout(state, rng);
      const crates = payout.filter((entry) => entry.kind === 'crate');
      const vaults = crates.filter((entry) => entry.kind === 'crate' && entry.tier === 'vault');
      expect(vaults.length).toBeGreaterThanOrEqual(1);
      expect(payout).toHaveLength(DECAGON_PAYOUT_ITEMS);
      // Crates never crowd out the baskets entirely.
      expect(crates.length).toBeLessThan(DECAGON_PAYOUT_ITEMS);
    }
  });

  it('emits the crates best-first so they land on the freed cells', () => {
    const state = createDefaultRewardsState();
    const payout = rollDecagonPayout(state, () => 0.5);
    expect(payout[0]).toEqual({ kind: 'crate', tier: 'vault' });
    const lastCrate = payout.findIndex((entry) => entry.kind === 'producer');
    expect(payout.slice(lastCrate).every((entry) => entry.kind === 'producer')).toBe(true);
  });

  it('keeps the quota inside its declared ranges', () => {
    const state = createDefaultRewardsState();
    const payout = rollDecagonPayout(state, () => 0.999);
    for (const row of DECAGON_CRATE_QUOTA) {
      const n = payout.filter((entry) => entry.kind === 'crate' && entry.tier === row.tier).length;
      expect(n).toBeGreaterThanOrEqual(row.min);
      expect(n).toBeLessThanOrEqual(row.max);
    }
  });
});

describe('decagon piece drops', () => {
  const pieces = (level: number) =>
    cratePayload(rollCrate('gold', level, seq([0.0])))
      .filter((entry) => entry.kind === 'spawner-piece' && entry.typeId === 'decagon');

  // Pinned to the constant rather than to a literal, so moving the gate is
  // one edit instead of two - it has already moved twice.
  it('drops nothing below the gate', () => {
    expect(pieces(DECAGON_MIN_LEVEL - 1)).toHaveLength(0);
  });

  it('drops from the gate on', () => {
    expect(pieces(DECAGON_MIN_LEVEL).length).toBeGreaterThan(0);
  });
});

describe('decagon rates', () => {
  const decagons = (loot: ReturnType<typeof cratePayload>) =>
    loot.filter((e) => e.kind === 'spawner-piece' && e.typeId === 'decagon');

  it('gives shipping containers their own roll, on top of the seven dispenser pieces', () => {
    // `seq([0])` makes every chance roll succeed, so the container yields its
    // seven family pieces AND seven decagon pieces rather than seven total.
    const payload = cratePayload(rollCrate('shipping', 30, seq([0]), ['wood']));
    expect(decagons(payload)).toHaveLength(7);
    expect(payload.filter((e) => e.kind === 'spawner-piece' && e.typeId !== 'decagon')).toHaveLength(7);
  });

  it('still gives shipping containers nothing below the level gate', () => {
    const payload = cratePayload(rollCrate('shipping', 4, seq([0]), ['wood']));
    expect(decagons(payload)).toHaveLength(0);
  });
});

describe('the container the game actually awards', () => {
  it('rolls decagon pieces from the payload builder, not only through rollCrate', () => {
    // This is the path BoardScene uses when an order pays a container. The
    // roll used to live in `rollCrate`, which that path never touches.
    const payload = shippingContainerPayload(['wood'], 30, seq([0]));
    expect(payload.filter((e) => e.kind === 'spawner-piece' && e.typeId === 'decagon')).toHaveLength(7);
    expect(payload.filter((e) => e.kind === 'spawner-piece' && e.typeId !== 'decagon')).toHaveLength(7);
  });
});
