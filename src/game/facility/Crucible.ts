import { CHAINS, isCurrencyChain, isUtilityChain } from '../data/chains';
import type { CrateTier } from '../rewards/Rewards';

/**
 * THE MAX-TIER CONSUMER - rules only. Nothing draws it yet.
 *
 * The problem it exists for: an item at the top of its chain cannot merge
 * again, so the two most expensive things in the game are worth exactly what
 * a tier 3 is - money. This is somewhere for them to go.
 */

/**
 * ENERGY FAMILIES ONLY. Water is excluded because its source costs no Energy,
 * and a machine fed from a free source would be a machine fed for free. The
 * Decagon is excluded because its chain is one tier long, so every Decagon
 * item is simultaneously its max tier - it would be the cheapest possible
 * feed by an enormous margin.
 */
export function acceptsFamily(typeId: string): boolean {
  return !isCurrencyChain(typeId) && !isUtilityChain(typeId);
}

/** True when this item is the top of its own chain and this machine takes it. */
export function acceptsItem(typeId: string, tier: number): boolean {
  if (!acceptsFamily(typeId)) return false;
  const chain = CHAINS.find((c) => c.typeId === typeId);
  return chain != null && tier >= chain.tiers.length;
}

/**
 * Max-tier items per payout.
 *
 * Sized against ENERGY, not against merges. A max-tier item costs about 13
 * energy to produce from a tier-5 source however many merges that takes -
 * the energy multiplier changes the tap count but never the energy - so
 * energy is the only honest unit here. Ten items is roughly 130 energy a
 * roll.
 */
export const CRUCIBLE_METER_MAX = 10;

export type CruciblePrize =
  | { kind: 'shipping' }
  | { kind: 'crate'; tier: CrateTier };

/**
 * THE PRIZE TABLE.
 *
 * The shipping container is the jackpot because it is the ONE reward in the
 * game with no purchase path - orders are the only source, at one per eight
 * completed. A jackpot you can buy is not a jackpot.
 *
 * Its 30% is not a feel-good number, it is a ratio. Orders cost about 200
 * energy per container (8 orders at ~25 each); ten max-tier items cost about
 * 130, so 30% puts this at roughly 430 energy per container - about twice
 * what orders charge. That keeps the machine a real alternative route
 * without it ever being the efficient one, and the ratio holds whatever the
 * player's actual daily energy turns out to be.
 *
 * Every other row is a crate, so there is no losing pull - the floor is what
 * stops variance reading as punishment.
 */
export const CRUCIBLE_PRIZES: { weight: number; prize: CruciblePrize }[] = [
  { weight: 30, prize: { kind: 'shipping' } },
  { weight: 34, prize: { kind: 'crate', tier: 'gold' } },
  { weight: 24, prize: { kind: 'crate', tier: 'silver' } },
  { weight: 12, prize: { kind: 'crate', tier: 'vault' } }
];

export interface CrucibleState {
  /** Max-tier items fed since the last payout, 0..CRUCIBLE_METER_MAX. */
  meter: number;
}

export function createDefaultCrucibleState(): CrucibleState {
  return { meter: 0 };
}

export function normalizeCrucibleState(raw: Partial<CrucibleState> | undefined): CrucibleState {
  const meter = Number.isFinite(raw?.meter) ? Math.floor(raw!.meter as number) : 0;
  return { meter: Math.max(0, Math.min(CRUCIBLE_METER_MAX, meter)) };
}

/**
 * Banks one item. Returns true when this one filled the meter, which is the
 * caller's cue to roll and pay out.
 */
export function feedCrucible(state: CrucibleState): boolean {
  state.meter = Math.min(CRUCIBLE_METER_MAX, state.meter + 1);
  return state.meter >= CRUCIBLE_METER_MAX;
}

/** Rolls the table and empties the meter. */
export function rollCruciblePrize(
  state: CrucibleState,
  rng: () => number = Math.random
): CruciblePrize {
  state.meter = 0;
  const total = CRUCIBLE_PRIZES.reduce((sum, row) => sum + row.weight, 0);
  let roll = rng() * total;
  for (const row of CRUCIBLE_PRIZES) {
    roll -= row.weight;
    if (roll < 0) return row.prize;
  }
  return CRUCIBLE_PRIZES[0].prize;
}
