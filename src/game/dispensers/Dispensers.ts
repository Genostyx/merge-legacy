import { CHAINS } from '../data/chains';

export interface Dispenser {
  id: string;
  typeId: string;
  tier: number;
  readyAt: number;
  charges: number;
}

/** Retained only so saves from the retired off-board dock can be migrated. */
export interface DispenserState {
  slots: (Dispenser | null)[];
  unlockedCount: number;
}

export const MAX_DISPENSER_TIER = 5;

/**
 * Families in unlock order. THIS ARRAY IS THE RECHARGE LADDER - a family's
 * index in it sets its timer (see rechargeMsForFamily). Adding a family
 * means appending its typeId here; nothing else needs a timer number - the
 * next one is simply 10s slower than the last.
 *
 * Append only. Inserting into the middle silently doubles the recharge of
 * every family after the insertion point.
 */
export const FAMILY_RECHARGE_ORDER: string[] = ['wood', 'mineral', 'glass'];

/** Wood's interval - the base of the ladder every other family doubles from. */
export const BASE_RECHARGE_MS = 5_000;

/** Drops added per tick. The ladder is expressed per-drop, so this is 1. */
const DROPS_PER_TICK = 1;

/**
 * One drop every `5s x 2^(familyIndex)`: wood 5s, mineral 10s, glass 20s,
 * a 4th family 40s, and so on. See docs/DISPENSER_ENERGY_RESEARCH.md,
 * "Per-family recharge ladder."
 *
 * Flat across a family's own source tiers on purpose. So is capacity (see
 * SOURCE_CAPACITY): upgrading a source changes WHAT IT DROPS and nothing
 * else - a tier-2 source produces tier-2 items, worth a whole merge step
 * more per tap. Rate and reservoir are family traits, tier is the
 * capability. Keeping those separate is what stops an upgrade quietly
 * eroding the recharge beat.
 *
 * This deliberately replaces the previous researched Merge Mansion timers
 * (20-93 min per BATCH of drops). That model's numbers are preserved in
 * the research doc; this is a design decision that outranks them, and it
 * sits much closer to the Tasty Travels reference ("seconds or minutes,
 * not hours"). Consequence to remember: the producer timer is no longer
 * the pacing gate, so energy has to become it.
 */
export function rechargeMsForFamily(typeId: string): number {
  const index = FAMILY_RECHARGE_ORDER.indexOf(typeId);
  const step = index < 0 ? 0 : index;
  // Wood is the one irregular step - 5s to 10s - and every family after it
  // adds a flat 10s: 5, 10, 20, 30, 40, 50...
  //
  // This was `BASE_RECHARGE_MS * 2 ** index`, which produces identical values
  // for the three families that exist (5/10/20) and then diverges hard: the
  // 4th family would have been 40s instead of 30s, the 6th 160s instead of
  // 50s. Doubling stops being maskable - a 160s drop is a Merge Mansion Broom
  // Cabinet, the model this game deliberately moved away from - whereas a
  // linear ladder keeps every family inside the "seconds, not hours" band
  // however many are added.
  return step === 0 ? BASE_RECHARGE_MS : step * 10_000;
}

/**
 * Reservoir size in drops, per family. NOT per source tier.
 *
 * **Capacity does not change with tier at all.** Upgrading a source must
 * never hand the player a smaller number than they had - that is the
 * merge-satisfaction principle applied to the persistent layer, and it is
 * the rule this table exists to enforce. Wood previously ran 30 -> 14 and
 * glass ran 18, 21, 24, 18, 20 (climbing, dropping, then climbing again).
 * Those were
 * not designed curves: they were the retired batch-based config's
 * `dropsPerCharge x maxCharges` multiplied out, and the glass wobble in
 * particular was an artifact rather than a decision.
 *
 * Wood stays at 30 - the authored opening guarantee, and `Energy.test.ts`
 * pins ENERGY_CAP against the three families' reservoirs so a full-energy
 * player can always spend every drop the board holds.
 *
 * It does not INCREASE with tier either, which was briefly tried and
 * reverted. A bigger reservoir means more banked drops, which means the
 * player reaches the recharge timer less often - and the short recharge wait
 * is the most satisfying beat in the game (see
 * docs/DISPENSER_ENERGY_RESEARCH.md). Growing wood to 42 or mineral to 50
 * would have cut how often that beat lands to a fraction, buying nothing.
 *
 * Capacity is a FAMILY trait; tier is a CAPABILITY trait. Keeping them
 * separate is the whole design here. Upgrading a source is already richly
 * paid: a tier-2 source drops tier-2 items, so every tap is worth an entire
 * merge step more, on every drop, forever. That dwarfs any reservoir change,
 * and stacking a capacity bonus on top would pay twice for one upgrade with
 * the second payment taken out of the recharge cadence.
 *
 * Family contrast therefore lives in capacity vs. recharge rate together -
 * wood is 30 drops at 5s (a deep, fast workhorse), mineral 10 at 10s (short
 * and deliberate), glass 18 at 20s (slow to fill, worth the wait).
 */
const SOURCE_CAPACITY: Record<string, number> = {
  wood: 30,
  mineral: 10,
  glass: 18
};

/**
 * The Decagon's drop interval. Deliberately NOT appended to
 * FAMILY_RECHARGE_ORDER: that array is index-driven, so appending would both
 * hand the Decagon a 30s beat and put every future family one rung further
 * out. 5s matches wood - the Decagon is temporary and should be emptied
 * inside a session, not left running for an hour.
 */
export const DECAGON_RECHARGE_MS = 5_000;

/**
 * A Decagon's reservoir. It is a BACKSTOP, not the thing that ends the
 * machine: a Decagon lives until its meter pays out, which takes ten items
 * standing on the board at once. The reservoir sits well above ten so that
 * selling a token, or a drop landing where a crate payload wanted to go,
 * cannot strand a machine unable to finish its own meter.
 */
export const DECAGON_DROPS = 30;

export function cooldownForTier(typeId: string, tier: number): number {
  if (typeId === 'water') return 1_000;
  if (typeId === 'decagon') return DECAGON_RECHARGE_MS;
  return rechargeMsForFamily(typeId);
}

export function dropsPerChargeForTier(_typeId: string, _tier: number): number {
  return DROPS_PER_TICK;
}

export function capacityForTier(typeId: string, tier: number): number {
  if (typeId === 'water') return Math.max(1, Math.min(MAX_DISPENSER_TIER, tier)) * 10;
  // A Decagon's capacity IS its lifetime: it never refills, so the reservoir
  // and the total it will ever produce are the same number.
  if (typeId === 'decagon') return DECAGON_DROPS;
  return SOURCE_CAPACITY[typeId] ?? SOURCE_CAPACITY.wood;
}

/**
 * Whether this dispenser is spent for good once empty. Every other source
 * recharges forever; a Decagon is consumed by using it, which is what makes
 * owning one an event rather than an upgrade.
 */
export function isTemporaryDispenser(typeId: string): boolean {
  return typeId === 'decagon';
}

export function makeDispenser(typeId: string, tier: number, now: number = Date.now(), startingCharges?: number): Dispenser {
  const capacity = capacityForTier(typeId, tier);
  const charges = Math.max(0, Math.min(capacity, startingCharges ?? Math.ceil(capacity / 2)));
  return {
    id: `d${Math.random().toString(36).slice(2, 9)}`,
    typeId,
    tier,
    charges,
    readyAt: charges >= capacity ? 0 : now + cooldownForTier(typeId, tier)
  };
}

/** Applies the current batch-charge rules to a retired dock save. */
export function normalizeDispenserState(state: DispenserState, now: number = Date.now()): DispenserState {
  state.slots = (state.slots ?? []).map((d) => {
    if (!d) return null;
    if (!Number.isFinite(d.charges)) d.charges = now >= d.readyAt ? 1 : 0;
    syncDispenser(d, now);
    return d;
  });
  return state;
}

export function syncDispenser(d: Dispenser, now: number = Date.now()): void {
  const capacity = capacityForTier(d.typeId, d.tier);
  d.charges = Math.max(0, Math.min(capacity, Math.floor(d.charges || 0)));
  if (d.charges >= capacity) {
    d.charges = capacity;
    d.readyAt = 0;
    return;
  }

  const cooldown = cooldownForTier(d.typeId, d.tier);
  if (!Number.isFinite(d.readyAt) || d.readyAt <= 0) d.readyAt = now + cooldown;
  if (now < d.readyAt) return;

  const chargesElapsed = 1 + Math.floor((now - d.readyAt) / cooldown);
  d.charges = Math.min(capacity, d.charges + chargesElapsed * dropsPerChargeForTier(d.typeId, d.tier));
  d.readyAt = d.charges >= capacity ? 0 : d.readyAt + chargesElapsed * cooldown;
}

export function isReady(d: Dispenser, now: number = Date.now()): boolean {
  syncDispenser(d, now);
  return d.charges > 0;
}

export function msRemaining(d: Dispenser, now: number = Date.now()): number {
  syncDispenser(d, now);
  if (d.charges >= capacityForTier(d.typeId, d.tier)) return 0;
  return Math.max(0, d.readyAt - now);
}

/**
 * Collects from an on-board source. The optional roll makes the authored
 * opening deterministic while leaving later bonus drops random.
 */
/**
 * How much better than its own tier a source's output can roll: 72% at the
 * source tier, 23% one tier higher, 5% two tiers higher.
 *
 * Exported as data rather than left inline, because the order economy prices
 * work against it. Inline, the two were silently coupled - retuning these
 * weights would have quietly mis-priced every order in the game with nothing
 * to catch it.
 */
export const OUTPUT_BONUS_TABLE: { bonus: number; chance: number }[] = [
  { bonus: 2, chance: 0.05 },
  { bonus: 1, chance: 0.23 },
  { bonus: 0, chance: 0.72 }
];

/**
 * Tier-1-equivalents one collect is worth on average.
 *
 * Two tier-N items merge into one tier-(N+1), so a bonus tier is worth double.
 * At the weights above this comes to about 1.38 - one tap of a source is worth
 * appreciably more than one base item, which is exactly what the order work
 * model has to price against.
 */
export const EXPECTED_UNITS_PER_COLLECT = OUTPUT_BONUS_TABLE.reduce(
  (sum, entry) => sum + entry.chance * 2 ** entry.bonus,
  0
);

/** Picks an output bonus from the table for a 0..1 roll. */
export function rollOutputBonus(roll: number): number {
  let remaining = roll;
  for (const entry of OUTPUT_BONUS_TABLE) {
    if (remaining < entry.chance) return entry.bonus;
    remaining -= entry.chance;
  }
  return 0;
}

export function collectDispenser(
  d: Dispenser,
  now: number = Date.now(),
  roll: number = Math.random()
): { typeId: string; tier: number } | null {
  if (!isReady(d, now)) return null;
  const bonus = rollOutputBonus(roll);
  // The cap is the CHAIN'S OWN LENGTH, not a literal.
  //
  // This was `water ? 12 : 9`, which is right for every family that happens
  // to have nine tiers and wrong for the Decagon, whose chain is one tier
  // long: the output bonus pushed roughly a quarter of its drops out at tier
  // 2 or 3, items with no tier definition at all. The meter counts tier-1
  // Decagons, so those drops sat on the board without ever counting, and the
  // machine ran well past ten before it could cash.
  //
  // Falls back to 9 for a typeId with no chain so the pure-rules tests can
  // still drive this with invented families.
  const chainCap = CHAINS.find((c) => c.typeId === d.typeId)?.tiers.length ?? 9;
  const produced = { typeId: d.typeId, tier: Math.min(chainCap, d.tier + bonus) };
  const wasFull = d.charges >= capacityForTier(d.typeId, d.tier);
  d.charges -= 1;
  if (wasFull || d.readyAt <= 0) d.readyAt = now + cooldownForTier(d.typeId, d.tier);
  return produced;
}

export function rushCostGems(d: Dispenser, now: number = Date.now()): number {
  syncDispenser(d, now);
  if (d.typeId === 'water') return Math.max(1, d.tier) * 2;
  const familyIndex = FAMILY_RECHARGE_ORDER.indexOf(d.typeId);
  const familyBase = (familyIndex < 0 ? 0 : familyIndex) + 1;
  return familyBase + Math.max(1, d.tier) - 1;
}

/** Gem rushes refill the complete reservoir, not only the next one-drop tick. */
export function refillDispenser(d: Dispenser): void {
  d.charges = capacityForTier(d.typeId, d.tier);
  d.readyAt = 0;
}

/**
 * Combines matching sources without erasing saved drops. The new source
 * keeps their combined inventory, capped by the upgraded capacity.
 *
 * That cap can still bite - two FULL wood sources hold 60 drops between
 * them against a reservoir of 30 - but it is inherent to combining two
 * things into one rather than, as before, the upgraded source being smaller
 * than either input. The player trades a board slot and the overflow for a
 * higher production tier.
 */
export function mergeDispenserPair(a: Dispenser, b: Dispenser, now: number = Date.now()): Dispenser {
  const nextTier = a.tier + 1;
  const capacity = capacityForTier(a.typeId, nextTier);
  if (a.typeId === 'water') return makeDispenser(a.typeId, nextTier, now, capacity);
  const wasRecharging = msRemaining(a, now) > 0 || msRemaining(b, now) > 0;
  const combinedDrops = Math.max(0, a.charges) + Math.max(0, b.charges);
  // Head start so a merge of two dry sources is never born empty. This used
  // to be "one full batch" (dropsPerCharge), which was a meaningful floor
  // when a batch was 7-15 drops - under the per-drop ladder that expression
  // evaluates to 1 and would make merging two empty sources feel broken, so
  // it is now a fraction of the upgraded reservoir instead.
  // The live-capture question that once gated this is closed (see
  // docs/DISPENSER_ENERGY_RESEARCH.md), so this floor is the shipped rule
  // rather than a placeholder.
  const readyFloor = wasRecharging ? Math.max(1, Math.ceil(capacity * 0.2)) : 0;
  const keptDrops = Math.min(capacity, Math.max(combinedDrops, readyFloor));
  return makeDispenser(a.typeId, nextTier, now, keptDrops);
}
