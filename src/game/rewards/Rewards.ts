import { CHAINS, isCurrencyChain, isUtilityChain } from '../data/chains';
import type { CratePayloadEntry } from '../Grid';
import { RESOURCE_PRODUCERS } from './ResourceRewards';
import type { ResourceProducerId } from './ResourceRewards';
import { maxOrderTier, minOrderTier, typicalOrderWork } from '../levels/Orders';

/**
 * Crates and the three things that grant them.
 *
 * One crate payload format serves the output meter, level milestones, and
 * crate days in the five-day Daily Supply ladder. Its first two days award
 * level-scaled credits instead of pretending every login reward is a crate.
 *
 * **The output meter is deliberately honest.** It is modelled on the
 * fill-a-meter-and-pop mechanic from slot games, minus the part that makes
 * those predatory: there, the meter's fill is cosmetic and the payout is
 * decided elsewhere, so the player's sense of getting closer is a fiction.
 * Here the fill is the ONLY thing that decides which crate you get, it is
 * fully deterministic, and the thresholds are visible. Variance lives in the
 * crate's CONTENTS, never in whether your progress counted.
 *
 * That split - certainty about progress, variance in reward - is what keeps
 * the anticipation without the deception, and it is the only version that
 * belongs in a game whose whole pitch is a precise, learnable machine.
 */

export type CrateTier = 'bronze' | 'silver' | 'gold' | 'vault' | 'shipping';
export type DailyReward =
  | { kind: 'credits'; credits: number; streak: number; dayLabel: '1' | '2' }
  | { kind: 'crate'; tier: CrateTier; streak: number; dayLabel: '3' | '4' | '5+' };

export interface CrateLoot {
  tier: CrateTier;
  energy: number;
  coins: number;
  gems: number;
  items: { typeId: string; tier: number }[];
  spawnerPieces: { typeId: string; tier: number }[];
  payload?: CratePayloadEntry[];
}

/**
 * Collects needed for each crate tier, and the order they unlock in.
 *
 * The player can cash out at any tier already reached or keep collecting for
 * a better one. That choice is real because collecting COSTS ENERGY and
 * crates CONTAIN energy: when the bar is low, taking bronze now to keep
 * playing genuinely beats holding out for gold you cannot afford to reach.
 * Without that tension everyone would simply always wait for gold.
 */
export const CRATE_THRESHOLDS: { tier: CrateTier; collects: number }[] = [
  { tier: 'bronze', collects: 40 },
  { tier: 'silver', collects: 70 },
  { tier: 'gold', collects: 100 }
];

/** Fill needed for the best routine crate - the meter stops counting here. */
export const METER_MAX = CRATE_THRESHOLDS[CRATE_THRESHOLDS.length - 1].collects;

export const METER_COOLDOWN_BY_TIER: Record<'bronze' | 'silver' | 'gold', number> = {
  bronze: 5 * 60 * 1000,
  silver: 10 * 60 * 1000,
  gold: 20 * 60 * 1000
};
/** Legacy/default duration for old saves and callers without a recorded tier. */
export const METER_COOLDOWN_MS = METER_COOLDOWN_BY_TIER.bronze;

export interface RewardsState {
  /** Source collects banked toward the current crate. */
  meterCollects: number;
  /** Absolute timestamp when the output meter can accept source runs again. */
  meterCooldownEndsAt: number;
  /** Duration of the active cooldown, used to draw its progress accurately. */
  meterCooldownDurationMs: number;
  /** Highest player level whose milestone crate has been taken. */
  claimedMilestoneLevel: number;
  /**
   * Decagon items banked toward the meter. Progress PERSISTS between
   * Decagons: a dispenser is temporary, so a meter that died with it would
   * make a half-fed meter a punishment for running out rather than progress
   * toward the next one.
   */
  decagonMeter: number;
  /** Local-day index of the last daily claim, or -1 if never. */
  lastDailyDay: number;
  dailyStreak: number;
  /**
   * The day today's unclaimed daily was first LOOKED at, and the player level
   * they were at when they looked. Together they pin the reward's value.
   *
   * Without them the daily was priced from the player's CURRENT level every
   * time it was drawn, so an unclaimed reward grew while you played - and the
   * strategy was to never claim on login, level up, and claim a bigger one
   * later. A day's reward is now worth what it was worth when the day opened.
   */
  dailyOfferDay: number;
  dailyOfferLevel: number;
}

export function createDefaultRewardsState(): RewardsState {
  return {
    meterCollects: 0, meterCooldownEndsAt: 0, meterCooldownDurationMs: 0,
    claimedMilestoneLevel: 1, decagonMeter: 0, lastDailyDay: -1, dailyStreak: 0,
    dailyOfferDay: -1, dailyOfferLevel: 0
  };
}

export function normalizeRewardsState(raw: Partial<RewardsState> | undefined): RewardsState {
  const base = createDefaultRewardsState();
  if (!raw) return base;
  const int = (value: unknown, fallback: number) =>
    Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : fallback;
  return {
    meterCollects: Math.min(METER_MAX, int(raw.meterCollects, 0)),
    meterCooldownEndsAt: int(raw.meterCooldownEndsAt, 0),
    meterCooldownDurationMs: int(raw.meterCooldownDurationMs, raw.meterCooldownEndsAt ? METER_COOLDOWN_MS : 0),
    claimedMilestoneLevel: Math.max(1, int(raw.claimedMilestoneLevel, 1)),
    decagonMeter: Math.min(DECAGON_METER_MAX, int(raw.decagonMeter, 0)),
    // -1 is meaningful (never claimed), so it cannot go through the >= 0 clamp.
    lastDailyDay: Number.isFinite(raw.lastDailyDay) ? Math.floor(raw.lastDailyDay as number) : -1,
    dailyStreak: int(raw.dailyStreak, 0),
    // -1/0 mean "not pinned yet", so an existing save simply pins on the next
    // time the daily is looked at rather than needing a migration.
    dailyOfferDay: Number.isFinite(raw.dailyOfferDay) ? Math.floor(raw.dailyOfferDay as number) : -1,
    dailyOfferLevel: int(raw.dailyOfferLevel, 0)
  };
}

// ---- Output meter ----

/** Advances the meter by one source collect. Returns true if a new tier was crossed. */
export function meterCooldownRemaining(state: RewardsState, now: number = Date.now()): number {
  return Math.max(0, state.meterCooldownEndsAt - now);
}

export function isMeterCooling(state: RewardsState, now: number = Date.now()): boolean {
  return meterCooldownRemaining(state, now) > 0;
}

export function finishMeterCooldown(state: RewardsState, now: number = Date.now()): boolean {
  if (isMeterCooling(state, now) || state.meterCooldownEndsAt === 0) return false;
  state.meterCooldownEndsAt = 0;
  state.meterCooldownDurationMs = 0;
  return true;
}

export function addMeterCollect(state: RewardsState, now: number = Date.now()): boolean {
  if (isMeterCooling(state, now)) return false;
  if (state.meterCollects >= METER_MAX) return false;
  const before = availableCrate(state);
  state.meterCollects = Math.min(METER_MAX, state.meterCollects + 1);
  return availableCrate(state) !== before;
}

/** The best crate the meter has earned so far, or null below the first threshold. */
export function availableCrate(state: RewardsState): CrateTier | null {
  let best: CrateTier | null = null;
  for (const step of CRATE_THRESHOLDS) {
    if (state.meterCollects >= step.collects) best = step.tier;
  }
  return best;
}

/** The next tier and how many more collects it needs, or null once at the top. */
export function nextCrateStep(state: RewardsState): { tier: CrateTier; remaining: number } | null {
  for (const step of CRATE_THRESHOLDS) {
    if (state.meterCollects < step.collects) {
      return { tier: step.tier, remaining: step.collects - state.meterCollects };
    }
  }
  return null;
}

/** Takes the earned crate and empties the meter. Returns null if nothing is earned yet. */
export function claimMeterCrate(state: RewardsState, now: number = Date.now()): CrateTier | null {
  const tier = availableCrate(state);
  if (!tier) return null;
  state.meterCollects = 0;
  const duration = METER_COOLDOWN_BY_TIER[tier as 'bronze' | 'silver' | 'gold'];
  state.meterCooldownDurationMs = duration;
  state.meterCooldownEndsAt = now + duration;
  return tier;
}

// ---- Level milestones ----

/**
 * EVERY OTHER level from 2 up grants a crate, escalating on a fixed cycle.
 * This is the visible ladder the retention roadmap asks for: a position you
 * can see and content you can see ahead, carrying no narrative at all.
 *
 * Even levels only, because one crate per level was too many - early levels
 * arrive quickly, so a new player banked a pile of them faster than they
 * could spend the board space to open them, and a reward you have a backlog
 * of stops reading as a reward. Halving the count also lets each one carry
 * more weight without inflating the economy.
 */
export function milestoneCrateFor(level: number): CrateTier | null {
  if (level < 2 || level % 2 !== 0) return null;
  if (level % 20 === 0) return 'vault';
  if (level % 10 === 0) return 'gold';
  if (level % 6 === 0) return 'silver';
  return 'bronze';
}

/** Every unclaimed milestone at or below the player's level, oldest first. */
export function pendingMilestones(state: RewardsState, level: number): { level: number; tier: CrateTier }[] {
  const out: { level: number; tier: CrateTier }[] = [];
  for (let l = state.claimedMilestoneLevel + 1; l <= level; l++) {
    const tier = milestoneCrateFor(l);
    if (tier) out.push({ level: l, tier });
  }
  return out;
}

/** Marks one milestone level as taken. Never moves backwards. */
export function claimMilestone(state: RewardsState, level: number): void {
  state.claimedMilestoneLevel = Math.max(state.claimedMilestoneLevel, level);
}

// ---- Decagon meter ----

/**
 * Decagon items that must be ON THE BOARD at once to cash the meter.
 *
 * They cannot be merged, stored or fed in one at a time - the ten have to be
 * standing there together, which with the dispenser is eleven of the board's
 * forty-nine base cells. Board space IS the cost of this feature; there is no
 * energy, credit or time price anywhere in it.
 */
export const DECAGON_METER_MAX = 10;

export type DecagonPrize =
  | { kind: 'producer'; producerId: ResourceProducerId }
  | { kind: 'crate'; tier: CrateTier };

/**
 * THE PRIZE TABLE. This is a gamble, not a wage.
 *
 * Two columns matter and only one of them is value: every prize here is a
 * CONTAINER, and what it costs the player is the cells it needs to unpack -
 * a coin pouch drops 10, an energy basket 12, a coin basket 20, and crates
 * need their whole payload free to open (bronze 4-5 up to vault 16).
 *
 * The budget is the ten cells the meter just freed. The common rows sit at or
 * under it and clear themselves; the top rows deliberately overrun and spill
 * into the vault, so a jackpot is a prize you have to make room for. That is
 * the tension the feature is built on, not a bug in the table.
 *
 * The vault's 4% is set against how many PULLS a player gets, not against a
 * slot machine's odds: a Decagon is five pieces of crate drops and one or two
 * fills, so a fill is a weekly event rather than a per-minute one. At the
 * sub-1% odds a real slot uses, the jackpot would never be seen by anyone and
 * would be decoration rather than a hook.
 */
export const DECAGON_PRIZES: { weight: number; prize: DecagonPrize }[] = [
  { weight: 30, prize: { kind: 'producer', producerId: 'coin-pouch' } },
  { weight: 22, prize: { kind: 'producer', producerId: 'energy-basket' } },
  { weight: 18, prize: { kind: 'crate', tier: 'bronze' } },
  { weight: 12, prize: { kind: 'producer', producerId: 'coin-basket' } },
  { weight: 8, prize: { kind: 'producer', producerId: 'gem-basket' } },
  { weight: 6, prize: { kind: 'crate', tier: 'gold' } },
  { weight: 4, prize: { kind: 'crate', tier: 'vault' } }
];

/** True when the meter is holding a full ten and can be cashed. */
export function decagonMeterReady(state: RewardsState): boolean {
  return state.decagonMeter >= DECAGON_METER_MAX;
}

/**
 * Banks one Decagon item. Returns true when that item filled the meter, which
 * is the caller's cue to consume the ten on the board and roll.
 */
export function feedDecagonMeter(state: RewardsState): boolean {
  if (state.decagonMeter >= DECAGON_METER_MAX) return true;
  state.decagonMeter++;
  return state.decagonMeter >= DECAGON_METER_MAX;
}

/** Rolls the table and empties the meter. */
export function rollDecagonPrize(state: RewardsState, rng: () => number = Math.random): DecagonPrize {
  state.decagonMeter = 0;
  const total = DECAGON_PRIZES.reduce((sum, row) => sum + row.weight, 0);
  let roll = rng() * total;
  for (const row of DECAGON_PRIZES) {
    roll -= row.weight;
    if (roll < 0) return row.prize;
  }
  return DECAGON_PRIZES[0].prize;
}

// ---- Daily claim ----

/**
 * Minutes the daily reset sits behind UTC. -300 is 00:00 EST.
 *
 * A FIXED offset, deliberately not `America/New_York`: that zone shifts to EDT
 * for half the year, which would move the reset by an hour and hand every
 * player either a 23- or a 25-hour day at each changeover. A fixed offset
 * makes every day exactly 24 hours.
 */
export const DAILY_RESET_UTC_OFFSET_MINUTES = -300;

/**
 * Day index against a FIXED reset boundary rather than device-local midnight.
 *
 * The previous version called `date.setHours(0,0,0,0)`, which is midnight in
 * whatever timezone the device claims to be in - so a player could collect a
 * second daily by moving their timezone forward, without touching the clock
 * at all. Everyone now rolls over at the same instant worldwide.
 *
 * `now` is still the device clock, so this does NOT defeat a player who sets
 * the clock forward; it only removes the timezone hole. See TODO item on
 * trusted time for what would actually close that.
 */
export function dayIndexFor(now: number): number {
  return Math.floor((now + DAILY_RESET_UTC_OFFSET_MINUTES * 60_000) / 86_400_000);
}

export function dailyAvailable(state: RewardsState, now: number): boolean {
  return dayIndexFor(now) !== state.lastDailyDay;
}

/**
 * Streak escalates the crate, and a missed day resets it - but only a fully
 * missed day. Claiming on consecutive days continues the run; coming back
 * after a gap starts a new one at 1 rather than punishing with nothing.
 */
export function crateForStreak(streak: number): CrateTier {
  if (streak >= 5) return 'gold';
  if (streak === 4) return 'silver';
  return 'bronze';
}

/**
 * Day 1's floor. A brand-new player is level 1, where the level-scaled value
 * works out at ten Credits - a reward that reads as an insult on the screen
 * that is supposed to bring them back tomorrow. It is a FLOOR rather than a
 * flat price on purpose: a level-30 player whose streak resets goes back to
 * day 1 too, and handing them 300 would be the same mistake in reverse.
 */
export const DAILY_DAY_ONE_MIN_CREDITS = 300;

/** Five-day Township-style ladder; Day 5 remains the maximum while the streak continues. */
export function dailyRewardFor(streak: number, playerLevel = 1): DailyReward {
  const day = Math.max(1, Math.floor(streak));
  const typicalCredits = typicalOrderWork(playerLevel) * 3;
  const nearestFive = (value: number) => Math.max(5, Math.round(value / 5) * 5);
  if (day === 1) {
    return {
      kind: 'credits',
      credits: Math.max(DAILY_DAY_ONE_MIN_CREDITS, nearestFive(typicalCredits * 0.4)),
      streak: day,
      dayLabel: '1'
    };
  }
  if (day === 2) {
    return { kind: 'credits', credits: Math.max(20, nearestFive(typicalCredits * 0.8)), streak: day, dayLabel: '2' };
  }
  if (day === 3) return { kind: 'crate', tier: 'bronze', streak: day, dayLabel: '3' };
  if (day === 4) return { kind: 'crate', tier: 'silver', streak: day, dayLabel: '4' };
  return { kind: 'crate', tier: 'gold', streak: day, dayLabel: '5+' };
}

/**
 * The level today's daily is priced at: the level the player was when the day
 * opened for them, pinned on first look and held until it is claimed or the
 * day rolls over. Call this instead of passing the live level.
 */
export function dailyOfferLevel(state: RewardsState, now: number, playerLevel: number): number {
  const today = dayIndexFor(now);
  if (state.dailyOfferDay !== today || state.dailyOfferLevel <= 0) {
    state.dailyOfferDay = today;
    state.dailyOfferLevel = Math.max(1, Math.floor(playerLevel));
  }
  return state.dailyOfferLevel;
}

/** Claims the daily crate, or returns null if today's has already been taken. */
export function claimDaily(state: RewardsState, now: number, playerLevel = 1): DailyReward | null {
  const today = dayIndexFor(now);
  if (today === state.lastDailyDay) return null;
  // Priced at the pinned level, so what is handed over is what the panel has
  // been showing - not what the player has levelled up to since.
  const level = dailyOfferLevel(state, now, playerLevel);
  state.dailyStreak = today === state.lastDailyDay + 1 ? state.dailyStreak + 1 : 1;
  state.lastDailyDay = today;
  return dailyRewardFor(state.dailyStreak, level);
}

// ---- Loot ----

/**
 * How far below the level's ceiling each crate draws its item tiers, so a
 * bronze pays gravel where a vault pays the good stuff.
 *
 * This used to be a whole `CrateShape` carrying fixed energy/coins/gems/items
 * per crate. Every crate now takes the chest-slot path, which pays currency
 * as resource-producers rather than lump sums, so those numbers had stopped
 * being read - while still reading like the live balance table to anyone
 * tuning a crate. Only the tier drop survived, so only the tier drop is here.
 */
const CRATE_ITEM_TIER_DROP: Record<CrateTier, number> = {
  bronze: 3,
  silver: 2,
  gold: 1,
  vault: 0,
  shipping: 0
};

// Utilities are excluded from both pools. Water has no order value to price
// against; a Decagon item cannot merge at all, so a crate rolling one would be
// handing out a dead cell. Decagon PIECES still come from crates - on their
// own roll, not this one.
const LOOT_FAMILIES: string[] = CHAINS.map((chain) => chain.typeId).filter((typeId) => !isUtilityChain(typeId) && !isCurrencyChain(typeId));
const SPAWNER_PIECE_FAMILIES: string[] = CHAINS.map((chain) => chain.typeId).filter((typeId) => typeId !== 'decagon' && !isCurrencyChain(typeId));

/** Exported so PieceEconomy can compute the piece rate from the real table. */
export const CHEST_SLOT_COUNTS: Partial<Record<CrateTier, [number, number]>> = {
  bronze: [4, 5],
  silver: [8, 8],
  gold: [12, 12],
  vault: [16, 16]
};

/** Exported so PieceEconomy can compute the piece rate from the real table. */
export const SPAWNER_PIECE_ODDS: Partial<Record<CrateTier, number[]>> = {
  bronze: [0.125, 0.035, 0, 0],
  silver: [0.4, 0.125, 0.05, 0],
  gold: [0.435, 0.185, 0.065, 0.005],
  // Vault is the only crate that can roll a tier-4 piece with any regularity
  // - four times gold's chance - which is what makes it feel like the crate
  // you were saving for. Its per-slot expectation is 1.30 tier-1-equivalents
  // against gold's 1.105, and over 16 slots rather than 12 that lands the
  // whole crate at about 1.6x gold.
  //
  // The total is deliberately LOWER than gold's (0.66 vs 0.69) so more slots
  // fall through to items and producers. The jackpot crate should not be
  // narrower than the one below it.
  vault: [0.34, 0.2, 0.1, 0.02]
};

const RESOURCE_PRODUCER_CHANCES: Partial<Record<CrateTier, Partial<Record<ResourceProducerId, number>>>> = {
  bronze: { 'coin-pouch': 0.60, 'coin-basket': 0.05, 'energy-basket': 0.25, 'gem-basket': 0.03 },
  silver: { 'coin-pouch': 0.55, 'coin-basket': 0.20, 'energy-basket': 0.40, 'gem-basket': 0.08 },
  gold: { 'coin-pouch': 0.40, 'coin-basket': 0.50, 'energy-basket': 0.65, 'gem-basket': 0.18 },
  // Currency reaches the player as PRODUCERS on this path, not as a lump sum
  // - so a vault's old fixed 1,100-1,700 credits and 2-5 gems are replaced by
  // near-certain baskets. Expected producer value works out around 1.6x
  // gold's, matching the piece ratio so the crate is better on both axes
  // rather than on one.
  //
  // `coin-pouch` drops BELOW gold on purpose, continuing the trend down the
  // tiers (0.60 -> 0.55 -> 0.40 -> 0.35): the pouch is the weakest producer
  // and the basket supersedes it.
  vault: { 'coin-pouch': 0.35, 'coin-basket': 0.85, 'energy-basket': 0.90, 'gem-basket': 0.45 }
};

const between = ([lo, hi]: [number, number], rng: () => number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

export function availableSpawnerPieceFamilies(ownedFamilies: readonly string[] = ['wood']): string[] {
  const progression = ['wood', 'water', 'mineral', 'glass']
    .filter((typeId) => SPAWNER_PIECE_FAMILIES.includes(typeId));
  const owned = progression.filter((typeId) => ownedFamilies.includes(typeId));
  if (!owned.includes('wood') && progression.includes('wood')) owned.unshift('wood');
  const next = progression.find((typeId) => !owned.includes(typeId));
  return next ? [...owned, next] : owned;
}

/** Seven limited-use dispenser pieces: 80% Piece 01, 20% Piece 02. */
export function shippingContainerPayload(
  ownedFamilies: readonly string[],
  rng: () => number = Math.random
): CratePayloadEntry[] {
  const eligible = availableSpawnerPieceFamilies(ownedFamilies);
  const owned = eligible.filter((typeId) => ownedFamilies.includes(typeId));
  const next = eligible.find((typeId) => !owned.includes(typeId));
  const chooseFamily = (): string => {
    if (next && (owned.length === 0 || rng() < 0.5)) return next;
    const pool = owned.length > 0 ? owned : eligible;
    return pool[Math.floor(rng() * pool.length)] ?? 'wood';
  };
  return Array.from({ length: 7 }, () => ({
    kind: 'spawner-piece' as const,
    typeId: chooseFamily(),
    tier: rng() < 0.8 ? 1 : 2
  }));
}

function rollSpawnerPieceTier(tier: CrateTier, rng: () => number): number | null {
  const odds = SPAWNER_PIECE_ODDS[tier];
  if (!odds) return null;
  const total = odds.reduce((sum, chance) => sum + chance, 0);
  const roll = rng();
  if (roll >= total) return null;
  let cursor = 0;
  for (let i = 0; i < odds.length; i++) {
    cursor += odds[i];
    if (roll < cursor) return i + 1;
  }
  return null;
}

function rollNormalChestEntry(
  level: number,
  itemDrop: number,
  rng: () => number,
  unlockedFamilies?: readonly string[]
): CratePayloadEntry {
  const legacyResourceRoll = rng();
  const families = unlockedFamilies == null
    ? LOOT_FAMILIES
    : LOOT_FAMILIES.filter((typeId) => unlockedFamilies.includes(typeId));
  const ceiling = maxOrderTier(level);
  const floor = minOrderTier(level);
  const top = Math.max(1, ceiling - itemDrop);
  const bottom = Math.max(1, Math.min(floor, top));
  const pool = families.length > 0 ? families : ['wood'];
  if (legacyResourceRoll < 0.58) {
    const typeId = pool[Math.floor(rng() * pool.length)];
    return { kind: 'item', typeId, tier: bottom + Math.floor(rng() * (top - bottom + 1)) };
  }
  const tierRoll = legacyResourceRoll >= 0.95 ? legacyResourceRoll : rng();
  const typeId = pool[Math.floor(legacyResourceRoll * pool.length) % pool.length];
  return { kind: 'item', typeId, tier: bottom + Math.floor(tierRoll * (top - bottom + 1)) };
}

/**
 * Chance per crate slot of a DECAGON piece, rolled SEPARATELY from the family
 * piece odds so wood, stone and glass source-building is not slowed to pay
 * for it. A Decagon needs five piece tiers - sixteen tier-1 equivalents - so
 * at ~43 crate slots a day these rates put one Decagon somewhere around a
 * week apart. That is the number to move first if it turns out to be too
 * common or too rare in play.
 */
const DECAGON_PIECE_CHANCE: Partial<Record<CrateTier, number>> = {
  bronze: 0.05,
  silver: 0.05,
  gold: 0.05,
  vault: 0.05,
  shipping: 0.08
};

/** Decagon pieces arrive low: the merging is the cost, not the finding. */
function rollDecagonPieceTier(rng: () => number): number {
  const roll = rng();
  if (roll < 0.7) return 1;
  if (roll < 0.93) return 2;
  return 3;
}

function rollChestPayload(tier: CrateTier, level: number, rng: () => number, unlockedFamilies?: readonly string[]): CratePayloadEntry[] | null {
  const countRange = CHEST_SLOT_COUNTS[tier];
  if (!countRange) return null;
  const itemDrop = CRATE_ITEM_TIER_DROP[tier];
  const count = between(countRange, rng);
  const families = availableSpawnerPieceFamilies(unlockedFamilies);
  const out: CratePayloadEntry[] = [];
  for (let i = 0; i < count; i++) {
    const pieceTier = rollSpawnerPieceTier(tier, rng);
    if (pieceTier) {
      const typeId = families[Math.floor(rng() * families.length)];
      out.push({ kind: 'spawner-piece', typeId, tier: pieceTier });
    } else {
      out.push(rollNormalChestEntry(level, itemDrop, rng, unlockedFamilies));
    }
  }
  const chances = RESOURCE_PRODUCER_CHANCES[tier] ?? {};
  const producerIds = (Object.keys(chances) as ResourceProducerId[])
    .filter((id) => rng() < (chances[id] ?? 0))
    .sort(() => rng() - 0.5);
  const replaceable = out.map((entry, index) => entry.kind === 'spawner-piece' ? -1 : index).filter((index) => index >= 0);
  for (let i = 0; i < producerIds.length && i < replaceable.length; i++) {
    const producerId = producerIds[i];
    out[replaceable[i]] = { kind: 'resource-producer', producerId, remaining: RESOURCE_PRODUCERS[producerId].capacity };
  }

  // Decagon pieces are APPENDED, not substituted, and rolled last.
  //
  // Rolling them inside the slot loop would have taken a slot from the
  // ordinary loot, which quietly cuts the family piece rate by the same 5% -
  // the exact dilution this roll is supposed to avoid. Appending costs the
  // player an extra cell instead, which is the currency this whole family is
  // priced in anyway. Rolling last also leaves every existing crate's random
  // sequence untouched, so the approved piece-rate numbers still hold.
  const decagonChance = DECAGON_PIECE_CHANCE[tier] ?? 0;
  for (let i = 0; i < count; i++) {
    if (rng() < decagonChance) {
      out.push({ kind: 'spawner-piece', typeId: 'decagon', tier: rollDecagonPieceTier(rng) });
    }
  }
  return out;
}

function summarizePayload(tier: CrateTier, payload: CratePayloadEntry[]): CrateLoot {
  const loot: CrateLoot = { tier, energy: 0, coins: 0, gems: 0, items: [], spawnerPieces: [], payload };
  for (const entry of payload) {
    if (entry.kind === 'item') loot.items.push({ typeId: entry.typeId, tier: entry.tier });
    else if (entry.kind === 'spawner-piece') loot.spawnerPieces.push({ typeId: entry.typeId, tier: entry.tier });
    else if (entry.kind === 'resource-producer') continue;
    else if (entry.kind === 'coins') loot.coins += entry.amount;
    else if (entry.kind === 'gems') loot.gems += entry.amount;
    else loot.energy += entry.amount;
  }
  return loot;
}

/**
 * Rolls one crate's contents. Item tiers track the player's level using the
 * same gates orders do, so a deep player never opens a crate full of gravel.
 */
export function rollCrate(tier: CrateTier, level: number, rng: () => number = Math.random, unlockedFamilies?: readonly string[]): CrateLoot {
  if (tier === 'shipping') return summarizePayload(tier, shippingContainerPayload(unlockedFamilies ?? ['wood'], rng));
  // Every tier has a CHEST_SLOT_COUNTS entry and shipping returns above, so
  // this is total. The old fallback that rolled a flat shape is gone.
  return summarizePayload(tier, rollChestPayload(tier, level, rng, unlockedFamilies) ?? []);
}

export const CRATE_LABELS: Record<CrateTier, string> = {
  bronze: 'BRONZE CRATE',
  silver: 'SILVER CRATE',
  gold: 'GOLD CRATE',
  vault: 'VAULT'
  ,shipping: 'SHIPPING CONTAINER'
};

/**
 * Flattens rolled loot into one entry per tap, in the order the player will
 * see them: currencies first so a crate pays out immediately and visibly,
 * then the items, which are the part that needs board space.
 */
export function cratePayload(loot: CrateLoot): CratePayloadEntry[] {
  if (loot.payload) return loot.payload.map((entry) => ({ ...entry }));
  const out: CratePayloadEntry[] = [];
  if (loot.coins) out.push({ kind: 'coins', amount: loot.coins });
  if (loot.gems) out.push({ kind: 'gems', amount: loot.gems });
  if (loot.energy) out.push({ kind: 'energy', amount: loot.energy });
  for (const item of loot.items) out.push({ kind: 'item', typeId: item.typeId, tier: item.tier });
  for (const piece of loot.spawnerPieces) out.push({ kind: 'spawner-piece', typeId: piece.typeId, tier: piece.tier });
  return out;
}
