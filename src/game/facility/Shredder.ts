import { CHAINS, isCurrencyChain, isUtilityChain } from '../data/chains';
import type { CrateTier } from '../rewards/Rewards';

/**
 * THE SHREDDER - rules only.
 *
 * Late on, low-tier stock is worth so few Credits that selling it is not a
 * real choice: the player wants it GONE and the sell price is not why. This
 * is the disposal route, and the meter is what turns a chore into an activity
 * with a payout at the end of it.
 */

/**
 * Anything that still has a merge path, and is not a currency.
 *
 * MAX-TIER ITEMS ARE REFUSED, which is the line between this and the
 * consumer. A finished chain is the one thing with no remaining use and it
 * has its own machine; letting both take it would put the two facilities in
 * competition for the same input and make the expensive one pointless.
 */
export function shredderAccepts(typeId: string, tier: number): boolean {
  if (isCurrencyChain(typeId) || isUtilityChain(typeId)) return false;
  const chain = CHAINS.find((c) => c.typeId === typeId);
  return chain != null && tier < chain.tiers.length;
}

/**
 * Items per payout. COUNTED, not weighted by tier.
 *
 * Deliberate: weighting by `2^(tier-1)` would make a tier-1 item worth a
 * 256th of a tier-9 and the machine useless for exactly the junk it exists to
 * absorb. Counting keeps it a disposal route.
 *
 * 50 is safe only because of what it pays. Fifty tier-1 items is 50 energy
 * at a tier-1 source, and the crate meter already hands out a bronze every 40
 * source collects - so this is about the same rate, stacking with it, and
 * paid for by not delivering those items to orders. It would stop being safe
 * the moment it paid a premium crate, which is why it cannot.
 */
export const SHREDDER_METER_MAX = 50;

/**
 * Bronze and silver only.
 *
 * No gold, and never a shipping container. The owner's call, and the maths
 * agrees: at 50 cheap items a roll, anything premium here would be the
 * cheapest premium crate in the game and would undercut both the supply shop
 * and the consumer.
 */
export const SHREDDER_PRIZES: { weight: number; tier: CrateTier }[] = [
  { weight: 78, tier: 'bronze' },
  { weight: 22, tier: 'silver' }
];

export interface ShredderState {
  meter: number;
}

export function createDefaultShredderState(): ShredderState {
  return { meter: 0 };
}

export function normalizeShredderState(raw: Partial<ShredderState> | undefined): ShredderState {
  const meter = Number.isFinite(raw?.meter) ? Math.floor(raw!.meter as number) : 0;
  return { meter: Math.max(0, Math.min(SHREDDER_METER_MAX, meter)) };
}

/** Banks one item. True when this one filled the meter. */
export function feedShredder(state: ShredderState): boolean {
  state.meter = Math.min(SHREDDER_METER_MAX, state.meter + 1);
  return state.meter >= SHREDDER_METER_MAX;
}

/** Rolls the table and empties the meter. */
export function rollShredderPrize(
  state: ShredderState,
  rng: () => number = Math.random
): CrateTier {
  state.meter = 0;
  const total = SHREDDER_PRIZES.reduce((sum, row) => sum + row.weight, 0);
  let roll = rng() * total;
  for (const row of SHREDDER_PRIZES) {
    roll -= row.weight;
    if (roll < 0) return row.tier;
  }
  return SHREDDER_PRIZES[0].tier;
}
