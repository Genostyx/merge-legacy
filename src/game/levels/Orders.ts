import { CHAINS, getTierDef, isCurrencyChain, isUtilityChain } from '../data/chains';
import { EXPECTED_UNITS_PER_COLLECT } from '../dispensers/Dispensers';

export type OrderType = 'deliver-items' | 'dispenser-collects';

/** One line of a delivery order: N items of a given family at a given tier. */
export interface OrderRequirement {
  typeId: string;
  tier: number;
  count: number;
}

export interface OrderDef {
  id: string;
  type: OrderType;
  /** Delivery lines. Always empty for `dispenser-collects`. */
  requirements: OrderRequirement[];
  /** The `dispenser-collects` target; for a delivery, the total items across all lines. */
  targetCount: number;
  title: string;
  rewardCoins: number;
  rewardXp: number;
  rewardEnergy?: number;
  rewardGems?: number;
  rewardSpawner?: { typeId: string; tier: number };
  rewardShippingContainer?: boolean;
}

/**
 * Families an order may ask for, taken from the canonical chain registry
 * rather than a second hardcoded list - a private copy is exactly how glass
 * came to be missing from generated orders for as long as it was.
 */
// Water is intentionally a non-order utility family even after its source is owned.
const ORDER_FAMILIES: string[] = CHAINS.map((chain) => chain.typeId).filter((typeId) => !isUtilityChain(typeId) && !isCurrencyChain(typeId));

const item = (typeId: string, tier: number, count = 1): OrderRequirement => ({ typeId, tier, count });

const totalItems = (requirements: OrderRequirement[]): number =>
  requirements.reduce((sum, r) => sum + r.count, 0);

function delivery(def: Omit<OrderDef, 'type' | 'targetCount'>): OrderDef {
  return { ...def, type: 'deliver-items', targetCount: totalItems(def.requirements) };
}

function collection(def: Omit<OrderDef, 'type' | 'requirements'>): OrderDef {
  return { ...def, type: 'dispenser-collects', requirements: [] };
}

const STARTER_ORDERS: OrderDef[] = [
  delivery({ id: 'order-01', requirements: [item('wood', 2)], title: 'Fit a Pine Plank', rewardCoins: 8, rewardXp: 12 }),
  collection({ id: 'order-02', targetCount: 3, title: 'Test the Wood Source', rewardCoins: 10, rewardXp: 10, rewardEnergy: 15 }),
  delivery({ id: 'order-03', requirements: [item('wood', 3)], title: 'Plane an Oak Plank', rewardCoins: 18, rewardXp: 24, rewardEnergy: 15 }),
  delivery({ id: 'order-04', requirements: [item('wood', 2, 2)], title: 'Pair Pine Planks', rewardCoins: 16, rewardXp: 18 }),
  delivery({ id: 'order-05', requirements: [item('wood', 4)], title: 'Square a Maple Block', rewardCoins: 32, rewardXp: 36 }),
  collection({ id: 'order-06', targetCount: 6, title: 'Run the Sources', rewardCoins: 24, rewardXp: 28, rewardEnergy: 25, rewardGems: 2 }),
  delivery({ id: 'order-07', requirements: [item('wood', 3, 2)], title: 'Supply Oak Planks', rewardCoins: 38, rewardXp: 42 }),
  delivery({ id: 'order-08', requirements: [item('wood', 5)], title: 'Finish a Walnut Block', rewardCoins: 55, rewardXp: 55 }),
  delivery({ id: 'order-09', requirements: [item('wood', 4, 2)], title: 'Match Maple Blocks', rewardCoins: 70, rewardXp: 70, rewardEnergy: 25 }),
  collection({ id: 'order-10', targetCount: 10, title: 'Calibrate the Workshop', rewardCoins: 45, rewardXp: 48, rewardEnergy: 35, rewardGems: 3 }),
  delivery({ id: 'order-11', requirements: [item('wood', 6)], title: 'Polish Mahogany', rewardCoins: 95, rewardXp: 90 }),
  delivery({ id: 'order-12', requirements: [item('wood', 5, 2)], title: 'Fit Walnut Blocks', rewardCoins: 110, rewardXp: 105 }),
  delivery({ id: 'order-13', requirements: [item('wood', 6)], title: 'Polish Mahogany', rewardCoins: 95, rewardXp: 90, rewardEnergy: 30 })
];

// ---- Level gates ----
//
// Orders are gated on PLAYER LEVEL rather than on how many orders have been
// completed. The previous generator derived everything from the order index
// via a `wave` counter that advanced a tier only every 20 orders, which is
// why high tiers were effectively never seen: a player 23 generated orders
// deep was still being asked for tier 4-6.

/**
 * Level at which `maxOrderTier` reaches the tier-9 capstones. Past this point
 * the tier ceiling CANNOT rise - there is no tier 10 - so every further step
 * of the difficulty curve has to come from somewhere else. See
 * `maxRequirementCount`.
 */
export const TIER_CAP_LEVEL = 12;

/** Highest item tier an order may demand. Reaches the tier-9 capstones at level 12. */
export function maxOrderTier(level: number): number {
  return Math.min(9, 3 + Math.floor(Math.max(1, level) / 2));
}

/**
 * Lowest tier an order may demand, so a deep player stops being asked for
 * gravel. Trails the ceiling by three, which keeps a spread worth choosing
 * between without ever asking for something trivial.
 */
export function minOrderTier(level: number): number {
  return Math.max(1, maxOrderTier(level) - 3);
}

/** How many DIFFERENT items one order may ask for at once. */
export function maxRequirementLines(level: number): number {
  if (level >= 9) return 3;
  if (level >= 4) return 2;
  return 1;
}

/**
 * Most copies of ONE item an order may demand.
 *
 * This is the curve past `TIER_CAP_LEVEL`. Up to level 12 the difficulty
 * comes from the tier ceiling climbing, and counts stay low so an order is
 * mostly "reach a new tier". After 12 the ceiling is stuck at 9 and the only
 * honest way left to ask for more is to ask for MORE OF IT - a level 40
 * order reads "5 x Sapphire" where a level 12 one read "1 x Sapphire".
 *
 * The old generator instead derived counts from a `wave` counter that capped
 * at 3 by roughly order 43, after which nothing about an order changed ever
 * again except the number of credits printed on it.
 */
export function maxRequirementCount(level: number, lines: number): number {
  const lv = Math.max(1, level);
  // A three-line order asking for six of each is a wall, not a curve, so
  // wide orders stay shallower than narrow ones.
  const ceiling = lines > 2 ? 4 : lines > 1 ? 5 : 6;
  // Before the tier cap the ceiling is doing the work, so counts creep. After
  // it, one more copy every eight levels - slow enough that the last step is
  // still ahead of a player at level 36, rather than saturating by 20 and
  // going flat again for the rest of the game.
  const base = lv <= TIER_CAP_LEVEL
    ? 1 + Math.floor(lv / 6)
    : 3 + Math.floor((lv - TIER_CAP_LEVEL) / 8);
  return Math.max(1, Math.min(ceiling, base));
}

export function orderFamiliesForLevel(level: number): string[] {
  const unlockedCount = Math.min(ORDER_FAMILIES.length, Math.max(1, Math.floor(Math.max(1, level) / 10) + 1));
  return ORDER_FAMILIES.slice(0, unlockedCount);
}

/**
 * Work, in raw source drops, that a TYPICAL order at this level costs.
 *
 * Two tier-N items merge into one tier-N+1, so one item of tier T costs
 * 2^(T-1) drops. This averages that over the tier window, the line count and
 * the per-line count, which gives collection orders something to be priced
 * against. Without it the two order types drift apart: measured on the old
 * build, a collection paid 2.4x what a delivery did at level 1 and 0.18x
 * what it did at level 12, so at every point in the game one of the two was
 * a trap.
 */
export function typicalOrderWork(level: number): number {
  const hi = maxOrderTier(level);
  const lo = minOrderTier(level);
  let perItem = 0;
  for (let tier = lo; tier <= hi; tier++) perItem += 2 ** (tier - 1);
  perItem /= hi - lo + 1;

  const lineCap = maxRequirementLines(level);
  let total = 0;
  for (let lines = 1; lines <= lineCap; lines++) {
    const countCap = maxRequirementCount(level, lines);
    total += lines * perItem * ((1 + countCap) / 2);
  }
  return total / lineCap;
}

/**
 * Credits per unit of work, where a unit of work is one tier-1 item.
 *
 * Reverse-engineered from the hand-authored starters, which sit almost
 * exactly on `3 x 2^(tier-1)`.
 */
const CREDITS_PER_WORK = 3;

/**
 * What a typical order pays at a given level.
 *
 * Exported so anything priced in "orders' worth of income" - the supply crate
 * store, for one - tracks the reward curve instead of hardcoding a table that
 * silently goes stale the moment the curve is retuned.
 *
 * Runs 34 at level 5, ~540 at 10, ~1,440 at 15, and plateaus near 2,040 from
 * level 30, where `typicalOrderWork` tops out against the tier-9 cap.
 */
export function typicalOrderReward(level: number): number {
  return Math.max(6, Math.round(typicalOrderWork(level) * CREDITS_PER_WORK));
}

/**
 * The same rate expressed per SOURCE COLLECT, which is what a player actually
 * spends.
 *
 * `2^(tier-1)` counts tier-1 items, but a collect does not yield one tier-1
 * item - it yields about 1.38 of them, because the output table rolls a bonus
 * tier 28% of the time and a bonus tier is worth double. So an order's true
 * cost in taps is `work / EXPECTED_UNITS_PER_COLLECT`, and the model was
 * overstating it by that factor.
 *
 * Paying `CREDITS_PER_COLLECT` for that smaller number of collects gives
 * exactly the same credits as before - this is a correction to what the model
 * MEANS, not to what it pays. The value is that the two halves are now tied to
 * the drop table: retune the output weights and order rewards follow, instead
 * of silently drifting.
 */
const CREDITS_PER_COLLECT = CREDITS_PER_WORK * EXPECTED_UNITS_PER_COLLECT;

/** An order's cost in source taps, rather than in imagined tier-1 items. */
function collectsForWork(work: number): number {
  return work / EXPECTED_UNITS_PER_COLLECT;
}

/**
 * What a collection order pays relative to a typical delivery at the same
 * level. Below 1 because it asks for patience rather than for a board full
 * of merges - but not far below, or the slot it occupies is wasted.
 */
const COLLECTION_REWARD_SHARE = 0.7;

/** Hard ceiling on simultaneous orders, and therefore on the order bar's width. */
export const MAX_ORDER_SLOTS = 6;

/** Simultaneous orders. Starts at 3 and opens one more every 4 levels. */
export function orderSlotsForLevel(level: number): number {
  return Math.min(MAX_ORDER_SLOTS, 3 + Math.floor(Math.max(1, level) / 4));
}

/**
 * Deterministic 0..1 from an integer seed. Generation must be a pure
 * function of (index, level): the same slot has to produce the same order on
 * every reload, and `Math.random()` would reshuffle a player's live orders
 * every time the game booted.
 */
function hash01(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function tierLabel(typeId: string, tier: number): string {
  return getTierDef(typeId, tier)?.label ?? `Tier ${tier}`;
}

/**
 * Titles for multi-line orders, where naming every item would overflow the
 * card. Deliberately plain industrial nouns - the art direction has no room
 * for whimsy, and these are labels rather than story.
 */
const MIXED_TITLES = [
  'Mixed Consignment',
  'Assembly Manifest',
  'Bulk Requisition',
  'Composite Lot',
  'Works Order'
];

/**
 * The order for one queue slot. `level` is the player's level AT THE MOMENT
 * THE ORDER WAS ISSUED, stored per slot in `OrderState` - deriving it live
 * would silently rewrite a player's in-progress orders the instant they
 * levelled up.
 */
export function generateOrder(index: number, level: number, eligibleFamilies = orderFamiliesForLevel(level)): OrderDef {
  if (index < STARTER_ORDERS.length) return STARTER_ORDERS[index];

  const n = index - STARTER_ORDERS.length;
  const wave = Math.floor(n / 5);
  const cycle = n % 5;
  const id = `order-${index + 1}`;
  const seed = index * 17 + 101;

  if (cycle === 2) {
    // The TARGET barely grows, and that part was right: doubling it does not
    // make the order twice as interesting, it makes it twice as long. The
    // mistake was scaling the REWARD against a cost that stays flat.
    const count = Math.min(8 + Math.floor(level / 2), 20);
    // Priced off ITS OWN cost - the taps - not off a delivery's work.
    //
    // This used to pay `typicalOrderWork(level)`, the work of a DELIVERY,
    // while only ever asking for `count` taps, capped at 20. Cost and reward
    // had come apart completely: at level 30 it paid for 478 collects the
    // player never made, so a source run returned 69.3 Credits per Energy
    // against a delivery's 4.1 - seventeen times the rate - AND refunded more
    // Energy than it cost, AND left the player the items those taps produced,
    // where a delivery consumes them. Better on all three axes at once.
    const rewardCoins = Math.max(6, Math.round(count * CREDITS_PER_COLLECT * COLLECTION_REWARD_SHARE));
    return collection({
      id,
      targetCount: count,
      title: `Run sources ${count} times`,
      rewardCoins,
      rewardXp: Math.round(rewardCoins * 0.65),
      // Strictly below `count`, so a source run is a DISCOUNT on running the
      // sources - about 40% off - and never a machine that prints Energy.
      // Energy is the real pacing gate, and an order ending net-positive puts
      // a hole in it.
      rewardEnergy: Math.floor(count * 0.6),
      // Gems are now the reason to want this order, which is the point: they
      // let it stay worth doing without touching the Credit economy. Capped
      // hard, because Gems price the 20-Gem Energy refill and the Gem shop
      // row - the old `3 + wave / 3` grew without bound and would have made
      // both meaningless.
      rewardGems: Math.min(3, 1 + Math.floor(level / 20))
    });
  }

  const hi = maxOrderTier(level);
  const lo = minOrderTier(level);
  const lineCap = maxRequirementLines(level);
  const lines = 1 + Math.floor(hash01(seed) * lineCap);

  // Families are drawn WITHOUT replacement so two lines can never name the
  // same family+tier - `countAtTier` would then satisfy both from one pile
  // and the order would complete at half its stated cost.
  const pool = ORDER_FAMILIES.filter((typeId) => eligibleFamilies.includes(typeId));
  if (pool.length === 0) pool.push(ORDER_FAMILIES[0]);
  const requirements: OrderRequirement[] = [];
  const perLineCap = maxRequirementCount(level, lines);
  for (let i = 0; i < lines && pool.length > 0; i++) {
    const typeId = pool.splice(Math.floor(hash01(seed + i * 3 + 1) * pool.length), 1)[0];
    const tier = lo + Math.floor(hash01(seed + i * 3 + 2) * (hi - lo + 1));
    requirements.push(item(typeId, tier, 1 + Math.floor(hash01(seed + i * 3 + 3) * perLineCap)));
  }

  // Reward tracks the WORK, not the order number. Two items of tier N merge
  // into one of tier N+1, so an item's cost in raw drops is 2^(tier-1) - the
  // old flat `85 + wave * 22` paid the same for a Gravel as for a Sapphire,
  // which is precisely why nobody would ever want a high-tier order. The 3x
  // multiplier is reverse-engineered from the hand-authored starters, which
  // sit almost exactly on `3 x 2^(tier-1)`.
  const work = requirements.reduce((sum, r) => sum + r.count * 2 ** (r.tier - 1), 0);
  // No `wave` multiplier. Work already curves - it is exponential in tier and
  // now linear in count - so multiplying it again by an unbounded order
  // counter was pure credit inflation stacked on top of a real curve. The
  // floor is low enough to stay out of the way - it catches only a lone
  // tier-1 drop. At 60 it was the ONLY thing setting the price of every
  // order below level 6, so a one-drop delivery and a sixteen-drop one paid
  // exactly the same.
  const rewardCoins = Math.max(6, Math.round(collectsForWork(work) * CREDITS_PER_COLLECT));

  const title = requirements.length === 1
    ? `Deliver ${requirements[0].count > 1 ? `${requirements[0].count} × ` : ''}${tierLabel(requirements[0].typeId, requirements[0].tier)}`
    : MIXED_TITLES[Math.floor(hash01(seed + 99) * MIXED_TITLES.length)];

  return delivery({
    id,
    requirements,
    title,
    rewardCoins,
    rewardXp: Math.round(rewardCoins * 0.8),
    // Capped, like the source run's. `3 + wave / 2` grew without bound - by
    // wave 40 a single delivery paid 23 Gems, against a 20-Gem Energy refill
    // and a Gem shop row priced for scarcity. Deliveries are the larger order
    // so they still out-pay a source run's 3.
    rewardGems: cycle === 4 && wave % 2 === 1 ? Math.min(6, 3 + Math.floor(wave / 4)) : undefined
  });
}

export interface OrderState {
  activeOrderIndices: number[];
  /**
   * Player level when each slot's order was issued, parallel to
   * `activeOrderIndices`. Stored rather than derived so an order's contents
   * can never change under a player who levels up mid-delivery.
   */
  activeOrderLevels: number[];
  /** Dispenser families owned when each slot's current order was issued. */
  activeOrderFamilies: string[][];
  nextOrderIndex: number;
  collectBaselines: Record<string, number>;
  totalXp: number;
  completedSinceShipping: number;
  shippingRewardPending: boolean;
  activeOrderShipping: boolean[];
}

export interface ActiveOrder {
  index: number;
  order: OrderDef;
}

export function orderRewardSummary(order: OrderDef): string {
  const rewards = [`+${order.rewardCoins} CREDITS`, `+${order.rewardXp} XP`];
  if (order.rewardEnergy) rewards.push(`+${order.rewardEnergy} ENERGY`);
  if (order.rewardGems) rewards.push(`+${order.rewardGems} GEMS`);
  if (order.rewardSpawner) rewards.push(`+${order.rewardSpawner.typeId.toUpperCase()} SOURCE`);
  if (order.rewardShippingContainer) rewards.push('+SHIPPING CONTAINER');
  return rewards.join('  ·  ');
}

/** Human-readable requirement list, for the incomplete-order details modal. */
export function orderRequirementSummary(order: OrderDef): string {
  if (order.type === 'dispenser-collects') return `${order.targetCount} source collections`;
  return order.requirements
    .map((r) => `${r.count} × ${tierLabel(r.typeId, r.tier)}`)
    .join('  ·  ');
}

export function createDefaultOrderState(dispenserCollects = 0): OrderState {
  return {
    activeOrderIndices: [0, 1, 2],
    activeOrderLevels: [1, 1, 1],
    activeOrderFamilies: [['wood'], ['wood'], ['wood']],
    nextOrderIndex: 3,
    collectBaselines: { 'order-02': dispenserCollects },
    totalXp: 0,
    completedSinceShipping: 0,
    shippingRewardPending: false,
    activeOrderShipping: [false, false, false]
  };
}

/** Migrates the earlier one-goal save format into the order queue. */
export function normalizeOrderState(
  raw: Partial<OrderState> & { currentLevelIndex?: number },
  dispenserCollects = 0,
  eligibleFamilies: string[] = ['wood']
): OrderState {
  const totalXp = raw.totalXp ?? 0;
  const level = levelForXp(totalXp);

  let activeOrderIndices: number[];
  if (Array.isArray(raw.activeOrderIndices) && raw.activeOrderIndices.length > 0) {
    activeOrderIndices = raw.activeOrderIndices.slice(0, MAX_ORDER_SLOTS);
  } else {
    const start = Math.max(0, raw.currentLevelIndex ?? 0);
    activeOrderIndices = [start, start + 1, start + 2];
  }

  // Saves written before per-slot levels existed get backfilled with the
  // player's current level, which is the closest honest guess and only ever
  // makes an in-flight order match what a fresh one would look like.
  const savedLevels = Array.isArray(raw.activeOrderLevels) ? raw.activeOrderLevels : [];
  const activeOrderLevels = activeOrderIndices.map((_, slot) => savedLevels[slot] ?? level);
  const savedFamilies = Array.isArray(raw.activeOrderFamilies) ? raw.activeOrderFamilies : [];
  const activeOrderFamilies = activeOrderIndices.map((_, slot) => {
    const saved = Array.isArray(savedFamilies[slot])
      ? savedFamilies[slot].filter((typeId): typeId is string => typeof typeId === 'string' && ORDER_FAMILIES.includes(typeId))
      : [];
    return saved.length > 0 ? saved : [...eligibleFamilies];
  });

  const nextOrderIndex = Math.max(
    raw.nextOrderIndex ?? Math.max(...activeOrderIndices) + 1,
    Math.max(...activeOrderIndices) + 1
  );

  const collectBaselines = { ...(raw.collectBaselines ?? {}) };
  activeOrderIndices.forEach((index, slot) => {
    const order = generateOrder(index, activeOrderLevels[slot], activeOrderFamilies[slot]);
    if (order.type === 'dispenser-collects' && collectBaselines[order.id] == null) {
      collectBaselines[order.id] = dispenserCollects;
    }
  });

  const activeOrderShipping = activeOrderIndices.map((_, slot) => raw.activeOrderShipping?.[slot] === true);
  const state: OrderState = {
    activeOrderIndices, activeOrderLevels, activeOrderFamilies, nextOrderIndex, collectBaselines, totalXp,
    completedSinceShipping: Math.max(0, Math.floor(raw.completedSinceShipping ?? 0)),
    shippingRewardPending: raw.shippingRewardPending === true,
    activeOrderShipping
  };
  syncOrderSlots(state, dispenserCollects, eligibleFamilies);
  return state;
}

/**
 * Opens any order slots the player's level has earned. Slots are never
 * removed - a player who somehow drops below a threshold keeps what they
 * were already working on.
 *
 * Returns true when the queue changed, so callers can skip a redraw.
 */
export function syncOrderSlots(state: OrderState, dispenserCollects: number, eligibleFamilies: string[] = ['wood']): boolean {
  const level = playerLevel(state);
  const wanted = orderSlotsForLevel(level);
  let changed = false;
  while (state.activeOrderIndices.length < wanted) {
    const index = state.nextOrderIndex++;
    state.activeOrderIndices.push(index);
    state.activeOrderLevels.push(level);
    state.activeOrderFamilies.push([...eligibleFamilies]);
    state.activeOrderShipping.push(false);
    const order = generateOrder(index, level, eligibleFamilies);
    if (order.type === 'dispenser-collects') state.collectBaselines[order.id] = dispenserCollects;
    changed = true;
  }
  return changed;
}

export function activeOrders(state: OrderState): ActiveOrder[] {
  return state.activeOrderIndices.map((index, slot) => ({
    index,
    order: {
      ...generateOrder(index, state.activeOrderLevels[slot] ?? playerLevel(state), state.activeOrderFamilies[slot] ?? ['wood']),
      rewardShippingContainer: state.activeOrderShipping[slot] || undefined
    }
  }));
}

const MERGE_XP_BY_RESULT_TIER = [0, 1, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512];

export function xpForMergeTier(resultTier: number): number {
  return MERGE_XP_BY_RESULT_TIER[Math.max(1, Math.min(MERGE_XP_BY_RESULT_TIER.length, resultTier)) - 1];
}

/**
 * WATER PAYS ALMOST NOTHING, and only from tier 6 up.
 *
 * Water was the fastest progression in the game. It ran the same merge-XP
 * table as everything else on a HALF divisor, which came to 1.88 XP per
 * tier-1 item against wood's 2.25 - near parity, for a source that costs no
 * Energy and refills once a second. A tier-5 water source produces 3,600
 * items an hour, so a player tapping nothing else earned ~6,750 XP an hour
 * and reached level 30 in about six hours of it.
 *
 * Halving could never fix that, because the low tiers are the flood: one
 * tier-12 takes 1,024 tier-2 merges, and a divisor still leaves each of them
 * paying the 1 XP floor. So the low tiers pay ZERO instead, and the rest pay
 * a flat rate that does not climb with tier - 0.25 XP per item, an 87% cut.
 * Water is a production utility; the progression should come from what you
 * do with it.
 */
export const WATER_XP_MIN_TIER = 6;
export const WATER_MERGE_XP = 4;

/** Merge XP for a completed merge, by family and the tier it produced. */
export function xpForMerge(typeId: string, resultTier: number): number {
  if (typeId === 'water') return resultTier >= WATER_XP_MIN_TIER ? WATER_MERGE_XP : 0;
  return xpForMergeTier(resultTier);
}

/**
 * DOUBLED from `50 * level * (level - 1)`.
 *
 * Levels arrived too quickly for the content behind them, and the water cut
 * above slows the fastest earner without changing how far apart the rungs
 * are. This does that: the same quadratic shape, twice the cost, so the
 * pacing changes at every level rather than only late.
 *
 * Existing saves do NOT lose a level to it. `totalXp` is remapped once on
 * load (see saveGame's XP curve migration) to the point on the new curve
 * that holds the same level and the same progress into it - the player keeps
 * where they are, and only what comes next costs more.
 */
export function xpForLevel(level: number): number {
  return 100 * level * (level - 1);
}

/** Level for a raw XP total, without needing an OrderState. */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

export function playerLevel(state: OrderState): number {
  return levelForXp(state.totalXp);
}

export interface PlayerXpProgress {
  level: number;
  current: number;
  required: number;
  remaining: number;
  total: number;
}

export function playerXpProgress(state: OrderState): PlayerXpProgress {
  const level = playerLevel(state);
  const levelStart = xpForLevel(level);
  const nextLevel = xpForLevel(level + 1);
  const current = Math.max(0, state.totalXp - levelStart);
  const required = Math.max(1, nextLevel - levelStart);
  return {
    level,
    current,
    required,
    remaining: Math.max(0, required - current),
    total: state.totalXp
  };
}

export interface OrderProgressSource {
  countAtTier: (tier: number, typeId: string) => number;
  dispenserCollects: number;
}

export interface RequirementProgress {
  requirement: OrderRequirement;
  current: number;
  ready: boolean;
}

export interface OrderStatus {
  /** Per-requirement progress. Empty for `dispenser-collects`. */
  lines: RequirementProgress[];
  /** Total delivered across every line, or collections made. */
  current: number;
  target: number;
  ready: boolean;
}

export function orderProgress(order: OrderDef, state: OrderState, progress: OrderProgressSource): OrderStatus {
  if (order.type === 'dispenser-collects') {
    const done = progress.dispenserCollects - (state.collectBaselines[order.id] ?? progress.dispenserCollects);
    return {
      lines: [],
      current: Math.max(0, Math.min(done, order.targetCount)),
      target: order.targetCount,
      ready: done >= order.targetCount
    };
  }

  const lines = order.requirements.map((requirement) => {
    const have = progress.countAtTier(requirement.tier, requirement.typeId);
    return {
      requirement,
      current: Math.max(0, Math.min(have, requirement.count)),
      ready: have >= requirement.count
    };
  });

  return {
    lines,
    current: lines.reduce((sum, line) => sum + line.current, 0),
    target: order.targetCount,
    // EVERY line must be satisfied. Summing counts instead would let three
    // spare Pine Planks complete a line asking for a Sapphire.
    ready: lines.length > 0 && lines.every((line) => line.ready)
  };
}

/**
 * Card position -> queue slot, given which orders are completable.
 *
 * Completable orders move to the FRONT and everything else shifts right,
 * keeping its relative order. This is an INSERTION, not a swap: when slot 3
 * becomes ready, `[a b c D e f]` becomes `[D a b c e f]` - slot 0 moves to
 * position 1, it does not trade places with slot 3 and land at the back.
 * Several orders becoming ready at once all move to the front together, in
 * their existing queue order.
 *
 * Both halves are order-preserving on purpose. A card must only ever move
 * because its OWN readiness changed; anything less stable would reshuffle
 * cards under a player who is reaching for one.
 */
export function orderDisplaySequence(ready: boolean[]): number[] {
  return ready
    .map((_, position) => position)
    .sort((a, b) => Number(ready[b]) - Number(ready[a]) || a - b);
}

export function advanceOrder(
  state: OrderState,
  completedIndex: number,
  dispenserCollects: number,
  eligibleFamilies: string[] = ['wood']
): void {
  const slot = state.activeOrderIndices.indexOf(completedIndex);
  if (slot < 0) return;
  const completed = generateOrder(
    completedIndex,
    state.activeOrderLevels[slot] ?? playerLevel(state),
    state.activeOrderFamilies[slot] ?? ['wood']
  );
  delete state.collectBaselines[completed.id];

  state.completedSinceShipping++;
  if (state.completedSinceShipping >= 8) state.shippingRewardPending = true;

  // XP is banked BEFORE the replacement is generated, so a level-up earned by
  // this very order immediately raises what the next one may ask for.
  state.totalXp += completed.rewardXp;
  const level = playerLevel(state);

  const replacementIndex = state.nextOrderIndex++;
  state.activeOrderIndices[slot] = replacementIndex;
  state.activeOrderLevels[slot] = level;
  state.activeOrderFamilies[slot] = [...eligibleFamilies];
  const replacement = generateOrder(replacementIndex, level, eligibleFamilies);
  const activeShippingCount = state.activeOrderShipping.filter(Boolean).length - (state.activeOrderShipping[slot] ? 1 : 0);
  const work = replacement.type === 'deliver-items'
    ? replacement.requirements.reduce((sum, r) => sum + r.count * 2 ** (r.tier - 1), 0)
    : 0;
  const awardShipping = level >= 5 && state.shippingRewardPending && activeShippingCount < 2 &&
    replacement.type === 'deliver-items' && work >= typicalOrderWork(level);
  state.activeOrderShipping[slot] = awardShipping;
  if (awardShipping) {
    state.shippingRewardPending = false;
    state.completedSinceShipping = 0;
  }
  if (replacement.type === 'dispenser-collects') state.collectBaselines[replacement.id] = dispenserCollects;

  syncOrderSlots(state, dispenserCollects, eligibleFamilies);
}
