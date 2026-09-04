import { describe, expect, it } from 'vitest';
import {
  MAX_ORDER_SLOTS,
  activeOrders,
  advanceOrder,
  createDefaultOrderState,
  generateOrder,
  maxOrderTier,
  maxRequirementCount,
  maxRequirementLines,
  normalizeOrderState,
  orderFamiliesForLevel,
  orderRewardSummary,
  orderDisplaySequence,
  orderProgress,
  orderSlotsForLevel,
  playerXpProgress,
  syncOrderSlots,
  migrateXpCurve,
  XP_CURVE_VERSION,
  levelForXp,
  xpForLevel,
  xpForMergeTier
} from './Orders';

/** Generated (non-starter) orders begin after the 13 hand-authored ones. */
const GENERATED_START = 13;
const generated = (level: number, count = 120) =>
  Array.from({ length: count }, (_, i) => generateOrder(GENERATED_START + i, level));
const deliveries = (level: number, count = 120) =>
  generated(level, count).filter((o) => o.type === 'deliver-items');

describe('order generation', () => {
  it('gates generated order families to the chest piece progression bands', () => {
    // The bug this pins: the old generator picked
    // `cycle === 1 || cycle === 4 ? 'mineral' : 'wood'` and never once named
    // glass. The later piece-only source rule adds the opposite hazard:
    // asking for families before their dispenser pieces can appear at all.
    expect(orderFamiliesForLevel(1)).toEqual(['wood']);
    expect(orderFamiliesForLevel(9)).toEqual(['wood']);
    expect(orderFamiliesForLevel(10)).toEqual(['wood', 'mineral']);
    expect(orderFamiliesForLevel(20)).toEqual(['wood', 'mineral', 'glass']);
    expect(new Set(deliveries(9).flatMap((o) => o.requirements.map((r) => r.typeId))))
      .toEqual(new Set(['wood']));
    expect(new Set(deliveries(20).flatMap((o) => o.requirements.map((r) => r.typeId))))
      .toEqual(new Set(['wood', 'mineral', 'glass']));
  });

  it('reaches the capstone tiers as the player levels, and stops asking for rubble', () => {
    // The old generator advanced a tier only every 20 completed orders, so a
    // deep player was still being asked for tier 4-6. Tier now tracks LEVEL.
    const tiersAt = (level: number) => deliveries(level).flatMap((o) => o.requirements.map((r) => r.tier));
    expect(Math.max(...tiersAt(12))).toBe(9);
    expect(Math.min(...tiersAt(12))).toBeGreaterThan(Math.min(...tiersAt(3)));
  });

  it('never demands a tier above the level gate', () => {
    for (const level of [1, 4, 8, 12, 20]) {
      for (const order of deliveries(level)) {
        for (const r of order.requirements) {
          expect(r.tier, `level ${level}`).toBeLessThanOrEqual(maxOrderTier(level));
          expect(r.tier, `level ${level}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('adds multi-item orders as the player levels up', () => {
    const lineCounts = (level: number) => new Set(deliveries(level).map((o) => o.requirements.length));
    expect(lineCounts(1)).toEqual(new Set([1]));
    expect(Math.max(...lineCounts(12))).toBe(2);
    expect(Math.max(...lineCounts(20))).toBe(3);
    for (const level of [1, 12, 20]) {
      expect(Math.max(...lineCounts(level))).toBeLessThanOrEqual(maxRequirementLines(level));
    }
  });

  it('never repeats a family within one order', () => {
    // Two lines naming the same family and tier would both be satisfied from
    // a single pile, completing the order at half its stated cost.
    for (const order of deliveries(12)) {
      const families = order.requirements.map((r) => r.typeId);
      expect(new Set(families).size).toBe(families.length);
    }
  });

  it('pays for the work rather than for the order number', () => {
    // Two tier-N items merge into one tier-N+1, so an item's cost in raw
    // drops is 2^(tier-1). The old flat reward paid the same for a Gravel as
    // for a Sapphire, which is why a high-tier order was never worth wanting.
    const byTier = new Map<number, number>();
    for (const order of deliveries(12)) {
      if (order.requirements.length !== 1 || order.requirements[0].count !== 1) continue;
      byTier.set(order.requirements[0].tier, order.rewardCoins);
    }
    const tiers = [...byTier.keys()].sort((a, b) => a - b);
    expect(tiers.length).toBeGreaterThan(1);
    for (let i = 1; i < tiers.length; i++) {
      expect(byTier.get(tiers[i])!).toBeGreaterThan(byTier.get(tiers[i - 1])!);
    }
  });

  it('keeps curving after the tier ceiling runs out', () => {
    // maxOrderTier reaches 9 at level 12 and CANNOT rise - there is no tier
    // 10 - so from there the curve has to come from count. The old generator
    // had nothing left at this point: every order from level 12 to level 45
    // was identical apart from an inflating credit figure.
    const avgWork = (level: number) => {
      const orders = deliveries(level, 400);
      const total = orders.reduce(
        (sum, o) => sum + o.requirements.reduce((s, r) => s + r.count * 2 ** (r.tier - 1), 0),
        0
      );
      return total / orders.length;
    };
    expect(maxOrderTier(12)).toBe(maxOrderTier(45));
    expect(avgWork(20)).toBeGreaterThan(avgWork(12));
    expect(avgWork(36)).toBeGreaterThan(avgWork(20));
  });

  it('never lets counts shrink as the player levels', () => {
    for (const lines of [1, 2, 3]) {
      for (let level = 2; level <= 60; level++) {
        expect(
          maxRequirementCount(level, lines),
          `level ${level}, ${lines} lines`
        ).toBeGreaterThanOrEqual(maxRequirementCount(level - 1, lines));
      }
    }
  });

  it('pays source runs for the taps they ask for, not for delivery work', () => {
    // This test previously asserted the OPPOSITE - that collection orders were
    // worth about the same as deliveries. That was the bug, not the goal: the
    // reward was priced off `typicalOrderWork`, the work of a delivery, while
    // the order only ever asks for `targetCount` taps, capped at 20. At level
    // 30 it paid for 478 collects the player never made.
    //
    // A source run costs one Energy per tap, so its honest Credit rate is
    // CREDITS_PER_COLLECT (~4.14) times the tap count, times the collection
    // share. Deliveries stay the main Credit faucet.
    for (const level of [1, 3, 5, 8, 12, 20, 36, 45]) {
      const orders = generated(level, 400);
      for (const order of orders.filter((o) => o.type === 'dispenser-collects')) {
        const perEnergy = order.rewardCoins / order.targetCount;
        expect(perEnergy, `level ${level}`).toBeLessThan(6);
      }
    }
  });

  it('never lets a source run end Energy-positive', () => {
    // The invariant that actually matters. Energy is the pacing gate, and the
    // old reward refunded up to 40 against a cost of at most 20 - so running
    // sources PRINTED Energy. A source run should be a discount on the taps,
    // never a machine.
    for (let level = 1; level <= 60; level++) {
      const orders = generated(level, 200);
      for (const order of orders.filter((o) => o.type === 'dispenser-collects')) {
        expect(order.rewardEnergy ?? 0, `level ${level}`).toBeLessThan(order.targetCount);
      }
    }
  });

  it('caps the Gems a single order can pay', () => {
    // Gems price the 20-Gem Energy refill and the Gem shop row. Both the
    // collection and delivery formulas used to grow with `wave`, without
    // bound, which would quietly have made the Gem economy meaningless.
    for (const level of [1, 12, 30, 60]) {
      for (const order of generated(level, 600)) {
        expect(order.rewardGems ?? 0, `level ${level}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it('prices early orders by their work rather than pinning them to a floor', () => {
    // `Math.max(60, ...)` used to be the only thing setting the price of
    // every order below level 6: a one-drop delivery and a sixteen-drop one
    // both paid exactly 60 credits.
    const cheap = deliveries(2, 400).filter((o) => o.targetCount === 1);
    const byTier = [...new Map(cheap.map((o) => [o.requirements[0].tier, o.rewardCoins]))]
      .sort((a, b) => a[0] - b[0]);
    expect(byTier.length).toBeGreaterThan(2);
    // Non-decreasing throughout, and genuinely climbing across the span. The
    // floor may still tie the very cheapest orders together; it must not
    // swallow the whole early game.
    for (let i = 1; i < byTier.length; i++) {
      expect(byTier[i][1], `tier ${byTier[i][0]}`).toBeGreaterThanOrEqual(byTier[i - 1][1]);
    }
    expect(byTier[byTier.length - 1][1]).toBeGreaterThan(byTier[0][1] * 2);
  });

  it('pays exactly what the old tier-1-drop model paid', () => {
    // Orders are now priced in source COLLECTS rather than in imagined tier-1
    // items, because one collect yields ~1.38 of them. That was a correction
    // to what the model MEANS, not to what it pays, and this pins that: the
    // credits must still come out at 3 x the raw work. If this fails, a change
    // to the output weights has moved the economy - which is the coupling the
    // rewrite was for, but it should be a deliberate choice, not a surprise.
    for (const level of [2, 6, 12, 24, 40]) {
      for (const order of deliveries(level, 120)) {
        const work = order.requirements.reduce(
          (sum, r) => sum + r.count * 2 ** (r.tier - 1), 0
        );
        expect(order.rewardCoins, `level ${level}`).toBe(Math.max(6, Math.round(work * 3)));
      }
    }
  });

  it('is a pure function of index and level', () => {
    // Generation must not use Math.random: the same slot has to survive a
    // reload, or every boot would reshuffle the player's live orders.
    expect(generateOrder(40, 7)).toEqual(generateOrder(40, 7));
  });

  it('only requests families whose dispensers are owned', () => {
    const woodOnly = Array.from({ length: 80 }, (_, offset) => generateOrder(20 + offset, 30, ['wood']));
    const requested = woodOnly.flatMap((order) => order.type === 'deliver-items'
      ? order.requirements.map((requirement) => requirement.typeId)
      : []);
    expect(new Set(requested)).toEqual(new Set(['wood']));

    const allFamilies = Array.from({ length: 80 }, (_, offset) => generateOrder(20 + offset, 30, ['wood', 'mineral', 'glass', 'water']));
    expect(allFamilies.some((order) => order.type === 'deliver-items' && order.requirements.some((requirement) => requirement.typeId === 'glass'))).toBe(true);
    expect(allFamilies.some((order) => order.type === 'deliver-items' && order.requirements.some((requirement) => requirement.typeId === 'water'))).toBe(false);
  });
});

describe('order slots', () => {
  it('opens more simultaneous orders as the player levels', () => {
    expect(orderSlotsForLevel(1)).toBe(3);
    expect(orderSlotsForLevel(8)).toBe(5);
    expect(orderSlotsForLevel(40)).toBe(MAX_ORDER_SLOTS);
  });

  it('grants earned slots without disturbing existing ones', () => {
    const state = createDefaultOrderState();
    const before = [...state.activeOrderIndices];
    state.totalXp = xpForLevel(8);
    expect(syncOrderSlots(state, 0)).toBe(true);
    expect(state.activeOrderIndices.length).toBe(orderSlotsForLevel(8));
    expect(state.activeOrderIndices.slice(0, 3)).toEqual(before);
    expect(state.activeOrderLevels.length).toBe(state.activeOrderIndices.length);
    expect(state.activeOrderFamilies.every((families) => families.length === 1 && families[0] === 'wood')).toBe(true);
    // Idempotent - a second sync at the same level must not keep adding.
    expect(syncOrderSlots(state, 0)).toBe(false);
  });

  it('never takes a slot away', () => {
    const state = createDefaultOrderState();
    state.totalXp = xpForLevel(20);
    syncOrderSlots(state, 0);
    const wide = state.activeOrderIndices.length;
    state.totalXp = 0;
    syncOrderSlots(state, 0);
    expect(state.activeOrderIndices.length).toBe(wide);
  });

  it('does not rewrite an in-flight order when the player levels up', () => {
    // Orders store the level they were ISSUED at. Deriving it live would
    // swap the contents of an order the player was part-way through.
    const state = createDefaultOrderState();
    state.activeOrderIndices = [40];
    state.activeOrderLevels = [4];
    const before = activeOrders(state)[0].order;
    state.totalXp = xpForLevel(15);
    expect(activeOrders(state)[0].order).toEqual(before);
  });
});

describe('completable orders moving to the front', () => {
  const f = false;
  const t = true;

  it('INSERTS a ready order at the front and shifts the rest right', () => {
    // The distinction that matters: this is not a swap. When slot 3 becomes
    // ready, slot 0 moves to position 1 - it does NOT trade places with slot
    // 3 and get dumped at the back.
    expect(orderDisplaySequence([f, f, f, t, f, f])).toEqual([3, 0, 1, 2, 4, 5]);
  });

  it('moves several simultaneous ready orders to the front together', () => {
    expect(orderDisplaySequence([f, t, f, t, f])).toEqual([1, 3, 0, 2, 4]);
  });

  it('keeps queue order within the ready group and within the unready group', () => {
    const out = orderDisplaySequence([t, f, t, f, t, f]);
    expect(out).toEqual([0, 2, 4, 1, 3, 5]);
    // Ready slots ascending, then unready slots ascending - neither half is
    // ever reshuffled internally, so a card moves only when its own
    // readiness changes.
    expect(out.slice(0, 3)).toEqual([...out.slice(0, 3)].sort((a, b) => a - b));
    expect(out.slice(3)).toEqual([...out.slice(3)].sort((a, b) => a - b));
  });

  it('leaves the queue untouched when none or all are ready', () => {
    expect(orderDisplaySequence([f, f, f, f])).toEqual([0, 1, 2, 3]);
    expect(orderDisplaySequence([t, t, t, t])).toEqual([0, 1, 2, 3]);
    expect(orderDisplaySequence([])).toEqual([]);
  });

  it('only moves the card whose readiness changed', () => {
    // Guards the reshuffle hazard directly: going from "slot 4 ready" to
    // "slots 1 and 4 ready" must not disturb anything except slot 1.
    const before = orderDisplaySequence([f, f, f, f, t, f]);
    const after = orderDisplaySequence([f, t, f, f, t, f]);
    expect(before).toEqual([4, 0, 1, 2, 3, 5]);
    expect(after).toEqual([1, 4, 0, 2, 3, 5]);
    const movedBy = (slot: number) => Math.abs(after.indexOf(slot) - before.indexOf(slot));
    // Slot 1 jumps from position 2 to position 0.
    expect(movedBy(1)).toBe(2);
    // Everything else shifts by at most one position.
    for (const slot of [0, 2, 3, 4, 5]) expect(movedBy(slot)).toBeLessThanOrEqual(1);
  });
});

describe('multi-item deliveries', () => {
  const twoLine = {
    id: 'test',
    type: 'deliver-items' as const,
    targetCount: 3,
    title: 'Test',
    requirements: [
      { typeId: 'wood', tier: 4, count: 1 },
      { typeId: 'glass', tier: 5, count: 2 }
    ],
    rewardCoins: 10,
    rewardXp: 10
  };

  it('is ready only when EVERY line is satisfied', () => {
    const state = createDefaultOrderState();
    const have = (counts: Record<string, number>) =>
      orderProgress(twoLine, state, {
        countAtTier: (tier, typeId) => counts[`${typeId}${tier}`] ?? 0,
        dispenserCollects: 0
      });

    expect(have({ wood4: 1 }).ready).toBe(false);
    expect(have({ glass5: 2 }).ready).toBe(false);
    // Spare items on one line must never substitute for a missing other line.
    expect(have({ wood4: 9 }).ready).toBe(false);
    expect(have({ wood4: 1, glass5: 2 }).ready).toBe(true);
  });

  it('reports per-line progress and a combined total', () => {
    const state = createDefaultOrderState();
    const status = orderProgress(twoLine, state, {
      countAtTier: (tier, typeId) => (typeId === 'glass' && tier === 5 ? 1 : 0),
      dispenserCollects: 0
    });
    expect(status.lines.map((l) => [l.current, l.requirement.count, l.ready]))
      .toEqual([[0, 1, false], [1, 2, false]]);
    expect(status.current).toBe(1);
    expect(status.target).toBe(3);
  });
});

describe('xp curve migration', () => {
  // The property that matters is not that the conversion is right once. It is
  // that REFRESHING CANNOT COMPOUND IT. The first version of this doubled the
  // player's XP on every single load - levels jumping, milestone crates paying
  // out each time - because its gate was never closed.
  it('never moves a save twice, however many times it is run', () => {
    for (const startXp of [0, 1, 99, 100, 150, 1000, 4948, 43500, 122500, 500000]) {
      let save = { totalXp: startXp, xpCurve: undefined as number | undefined };
      save = migrateXpCurve(save);
      const afterFirst = save.totalXp;
      // Twenty refreshes.
      for (let i = 0; i < 20; i++) save = migrateXpCurve(save);
      expect(save.totalXp, `xp ${startXp}`).toBe(afterFirst);
      expect(save.xpCurve).toBe(XP_CURVE_VERSION);
    }
  });

  it('keeps the player at the level and progress they already had', () => {
    const OLD = (level: number) => 50 * level * (level - 1);
    for (let level = 1; level <= 60; level++) {
      for (const into of [0, 0.5, 0.99]) {
        const startXp = Math.round(OLD(level) + into * (OLD(level + 1) - OLD(level)));
        const { totalXp } = migrateXpCurve({ totalXp: startXp });
        expect(levelForXp(totalXp), `level ${level} + ${into}`).toBe(level);
        const span = xpForLevel(level + 1) - xpForLevel(level);
        const progress = span > 0 ? (totalXp - xpForLevel(level)) / span : 0;
        expect(Math.abs(progress - into), `progress at level ${level}`).toBeLessThan(0.01);
      }
    }
  });

  it('leaves a brand new save alone', () => {
    expect(migrateXpCurve({ totalXp: 0 })).toEqual({ totalXp: 0, xpCurve: XP_CURVE_VERSION });
  });
});

describe('order queue', () => {
  it('starts with three different orders and refills the completed slot', () => {
    const state = createDefaultOrderState();
    expect(activeOrders(state).map(({ index }) => index)).toEqual([0, 1, 2]);

    advanceOrder(state, 0, 4);

    expect(activeOrders(state).map(({ index }) => index)).toEqual([3, 1, 2]);
    expect(state.nextOrderIndex).toBe(4);
    expect(state.totalXp).toBe(12);
  });

  it('keeps orders as the main XP source while scaling big merges', () => {
    expect(xpForMergeTier(2)).toBe(1);
    expect(xpForMergeTier(5)).toBe(4);
    expect(xpForMergeTier(8)).toBe(32);
    expect(xpForMergeTier(9)).toBe(64);
    expect(activeOrders(createDefaultOrderState())[0].order.rewardXp).toBeGreaterThan(xpForMergeTier(2));
  });

  it('reports player XP progress within the current level', () => {
    // Derived from the curve rather than hardcoded: the totals doubled once
    // already, and a literal here just breaks the next time they move.
    const state = createDefaultOrderState();
    const into = 50;
    state.totalXp = xpForLevel(2) + into;
    const required = xpForLevel(3) - xpForLevel(2);
    expect(playerXpProgress(state)).toEqual({
      level: 2,
      current: into,
      required,
      remaining: required - into,
      total: state.totalXp
    });
  });

  it('does not award the second wood source during the wood-only opening', () => {
    const state = createDefaultOrderState();
    const oakOrder = activeOrders(state)[2].order;
    expect(oakOrder.requirements).toEqual([{ typeId: 'wood', tier: 3, count: 1 }]);
    expect(oakOrder.rewardSpawner).toBeUndefined();
  });

  it('defers the eighth-completion shipping reward to a qualifying delivery', () => {
    const state = createDefaultOrderState();
    state.totalXp = xpForLevel(5);
    for (let i = 0; i < 7; i++) {
      const active = activeOrders(state)[0];
      advanceOrder(state, active.index, 0, ['wood']);
    }
    expect(activeOrders(state).some(({ order }) => order.rewardShippingContainer)).toBe(false);

    for (let i = 0; i < 30 && !activeOrders(state).some(({ order }) => order.rewardShippingContainer); i++) {
      const active = activeOrders(state)[0];
      advanceOrder(state, active.index, 0, ['wood']);
    }
    const shippingOrders = activeOrders(state).filter(({ order }) => order.rewardShippingContainer);
    expect(shippingOrders).toHaveLength(1);
    expect(shippingOrders[0].order.type).toBe('deliver-items');
  });

  it('does not rewrite active orders when a new dispenser family is acquired', () => {
    const state = createDefaultOrderState();
    state.totalXp = xpForLevel(20);
    syncOrderSlots(state, 0, ['wood']);
    const before = activeOrders(state);
    syncOrderSlots(state, 0, ['wood', 'mineral', 'glass']);
    expect(activeOrders(state)).toEqual(before);
  });

  it('does not award direct stone or sand sources from starter orders', () => {
    for (let index = 0; index <= 12; index++) {
      expect(generateOrder(index, 1).rewardSpawner, `order ${index + 1}`).toBeUndefined();
    }
  });

  it('returns energy through recurring progression rewards', () => {
    const state = createDefaultOrderState();
    expect(activeOrders(state)[1].order.rewardEnergy).toBe(15);
    advanceOrder(state, 1, 3);
    expect(activeOrders(state).some(({ order }) => (order.rewardEnergy ?? 0) > 0)).toBe(true);
  });

  it('formats every reward for incomplete-order details', () => {
    const state = createDefaultOrderState();
    advanceOrder(state, 0, 0);
    const sourceRewardOrder = activeOrders(state)[0].order;
    expect(orderRewardSummary(sourceRewardOrder)).toBe('+16 CREDITS  ·  +18 XP');
    const energyOrder = activeOrders(createDefaultOrderState())[1].order;
    expect(orderRewardSummary(energyOrder)).toBe('+10 CREDITS  ·  +10 XP  ·  +15 ENERGY');
  });

  it('marks a delivery ready only when enough exact-tier items exist', () => {
    const state = createDefaultOrderState();
    const first = activeOrders(state)[0].order;
    const missing = orderProgress(first, state, { countAtTier: () => 0, dispenserCollects: 0 });
    const ready = orderProgress(first, state, { countAtTier: (tier, typeId) => tier === 2 && typeId === 'wood' ? 1 : 0, dispenserCollects: 0 });
    expect(missing.ready).toBe(false);
    expect(ready.ready).toBe(true);
  });

  it('counts source uses from an order-specific baseline', () => {
    const state = createDefaultOrderState(7);
    const sourceOrder = activeOrders(state)[1].order;
    expect(orderProgress(sourceOrder, state, { countAtTier: () => 0, dispenserCollects: 9 }).current).toBe(2);
    expect(orderProgress(sourceOrder, state, { countAtTier: () => 0, dispenserCollects: 10 }).ready).toBe(true);
  });

  it('migrates an old single-goal save without losing XP', () => {
    const state = normalizeOrderState({ currentLevelIndex: 4, totalXp: 80 }, 12);
    expect(state.activeOrderIndices).toEqual([4, 5, 6]);
    expect(state.nextOrderIndex).toBe(7);
    expect(state.totalXp).toBe(80);
  });
});
