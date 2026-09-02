import { CHEST_SLOT_COUNTS, SPAWNER_PIECE_ODDS, availableSpawnerPieceFamilies } from './Rewards';
import type { CrateTier } from './Rewards';

/**
 * How long it takes to build a source, computed rather than audited.
 *
 * Dispenser pieces arrive from six unrelated systems - shipping containers,
 * the output meter, level milestones, the daily supply, the special shop and
 * the one-off Living Room project - and until this module existed no single
 * place knew the combined rate. Answering "how long to a tier-5 stone source"
 * meant reading five files and multiplying by hand, which is why it got
 * answered wrong three times.
 *
 * Everything here is a pure function of the tuning tables it imports, so
 * retuning any faucet moves these numbers automatically and the tests below
 * fail loudly if a change makes the ladder unreachable.
 *
 * The unit throughout is a **piece-unit**: one tier-1 piece. Pieces merge in
 * pairs, so a tier-T piece is worth `2^(T-1)` of them.
 */

/** Pieces merge 1->2->3->4, and two tier-4 pieces build a tier-1 source. */
export const PIECE_UNITS_PER_SOURCE = 16;

/** Piece-units to build a source of a given tier, from nothing. */
export function pieceUnitsForSourceTier(tier: number): number {
  const steps = Math.max(1, Math.round(tier)) - 1;
  return PIECE_UNITS_PER_SOURCE * 2 ** steps;
}

/** Expected piece-units in one crate of a tier, across ALL families. */
export function cratePieceUnits(tier: CrateTier): number {
  const slots = CHEST_SLOT_COUNTS[tier];
  const odds = SPAWNER_PIECE_ODDS[tier];
  // A tier with no slot count never takes the chest path at all - which is
  // why vault crates contain no pieces despite being the best crate.
  if (!slots || !odds) return 0;
  const averageSlots = (slots[0] + slots[1]) / 2;
  const perSlot = odds.reduce((sum, chance, index) => sum + chance * 2 ** index, 0);
  return averageSlots * perSlot;
}

/** Expected piece-units in one shipping container: 7 pieces, 80% tier 1 / 20% tier 2. */
export function shippingContainerPieceUnits(): number {
  return 7 * (0.8 * 1 + 0.2 * 2);
}

/**
 * Expected piece-units for ONE family from one special-shop refresh, assuming
 * every offer of that family is bought.
 *
 * Weights are `[12, 6, 3, 1]` for piece tiers 1-4 per family, plus 2 for the
 * splitter, over `SHOP_SLOTS` draws.
 */
export function specialShopPieceUnitsPerRefresh(familyCount: number, slots = 3): number {
  const perFamilyWeights = [12, 6, 3, 1];
  const familyWeight = perFamilyWeights.reduce((sum, w) => sum + w, 0);
  const totalWeight = 2 + Math.max(1, familyCount) * familyWeight;
  const familyUnits = perFamilyWeights.reduce((sum, w, index) => sum + w * 2 ** index, 0);
  return slots * (familyUnits / totalWeight);
}

export interface PieceFaucetInput {
  /** Families the player owns a source for, in progression order. */
  ownedFamilies: readonly string[];
  /** Energy the player actually spends per day - NOT the regen ceiling. */
  energyPerDay: number;
  /** Source collects needed to fill the output meter to its best crate. */
  meterCollects: number;
  /** Orders completed per shipping container. */
  ordersPerContainer: number;
  /** Energy an average order consumes. */
  energyPerOrder: number;
  /** Special-shop refreshes per day, and whether the player buys from it. */
  shopRefreshesPerDay: number;
  buysFromShop: boolean;
}

export interface PieceRate {
  /** Piece-units per day for ONE family. */
  perFamilyPerDay: number;
  byFaucet: Record<string, number>;
  /** Families pieces are split across - the divisor on every faucet. */
  eligibleFamilies: number;
}

/**
 * Piece-units per day for a single family.
 *
 * Deliberately takes `energyPerDay` rather than deriving it: the energy bar
 * caps at 100, so a player banks only what they are present to spend, and the
 * regen ceiling badly overstates a real session.
 */
export function estimatePieceRate(input: PieceFaucetInput): PieceRate {
  const eligible = availableSpawnerPieceFamilies(input.ownedFamilies).length;
  const share = 1 / Math.max(1, eligible);

  const meterCrates = input.energyPerDay / Math.max(1, input.meterCollects);
  const meter = meterCrates * cratePieceUnits('gold');

  const ordersPerDay = input.energyPerDay / Math.max(1, input.energyPerOrder);
  const shipping = (ordersPerDay / Math.max(1, input.ordersPerContainer))
    * shippingContainerPieceUnits();

  // Milestones average out to one crate every two levels; over twenty levels
  // that is 5 bronze, 3 silver, 1 gold and 1 vault. Expressed per level so it
  // does not need a levelling-rate input it cannot know.
  const milestonePerLevel = (5 * cratePieceUnits('bronze')
    + 3 * cratePieceUnits('silver')
    + cratePieceUnits('gold')
    + cratePieceUnits('vault')) / 20;

  const daily = cratePieceUnits('silver');

  const shop = input.buysFromShop
    ? input.shopRefreshesPerDay * specialShopPieceUnitsPerRefresh(eligible) / share
    : 0;

  const byFaucet: Record<string, number> = {
    meter: meter * share,
    shipping: shipping * share,
    daily: daily * share,
    // The shop already targets a specific family, so it is not share-divided.
    specialShop: input.buysFromShop
      ? input.shopRefreshesPerDay * specialShopPieceUnitsPerRefresh(eligible)
      : 0,
    milestonePerLevel: milestonePerLevel * share
  };
  void shop;

  return {
    perFamilyPerDay: byFaucet.meter + byFaucet.shipping + byFaucet.daily + byFaucet.specialShop,
    byFaucet,
    eligibleFamilies: eligible
  };
}

/** Days to build one source of `tier` for a single family at a given rate. */
export function daysToSourceTier(tier: number, rate: PieceRate): number {
  return pieceUnitsForSourceTier(tier) / Math.max(0.0001, rate.perFamilyPerDay);
}
