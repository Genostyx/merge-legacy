import type { Grid } from '../Grid';
import type { GridPosition } from '../types';
import { EVENT_CHAIN, EVENT_MAX_TIER, eventPointsForTier } from './EventBoard';
import type { EventBoardState } from './EventBoard';

/**
 * EVENT ORDERS - the only thing on the event board that pays points.
 *
 * Three slots, always full, each pinned to a band of the chain: something you
 * can fill now, something worth working toward, and something that needs most
 * of the window. A single order queue would either be trivial for a player who
 * had merged high or impossible for one who had not, and the same three bands
 * are what let one board serve both.
 *
 * Filling one REMOVES the item and rerolls that slot. Points come from nowhere
 * else - not from merging, not from tapping - so the loop is always
 * "spend energy, merge up, hand in", never "tap for score".
 */

/**
 * The band each slot draws from. Tier 1 is deliberately absent: it is what
 * the booth hands out, so an order for one would pay points for doing nothing.
 */
export const EVENT_ORDER_BANDS: readonly (readonly number[])[] = [
  [2, 3],
  [4, 5],
  [6, 7]
];

export const EVENT_ORDER_SLOTS = EVENT_ORDER_BANDS.length;

/**
 * What the top of the chain pays when it is handed in.
 *
 * DOUBLE its own tier value. Reaching tier 8 costs 128 tier-1 items and no
 * ordinary slot ever asks for one, so without a bonus the top merge would be
 * worth exactly as much as the two tier-7s that went into it - a jackpot that
 * pays nothing extra is not a jackpot.
 */
export function topTierPayout(): number {
  return eventPointsForTier(EVENT_MAX_TIER) * 2;
}

/** Rolls one slot's tier from its own band. */
export function rollEventOrder(slot: number, roll: number = Math.random()): number {
  const band = EVENT_ORDER_BANDS[slot] ?? EVENT_ORDER_BANDS[0];
  return band[Math.min(band.length - 1, Math.floor(roll * band.length))];
}

export function rollEventOrders(roll: () => number = Math.random): number[] {
  return EVENT_ORDER_BANDS.map((_, slot) => rollEventOrder(slot, roll()));
}

/**
 * The tier each slot is asking for right now.
 *
 * The AUTO-ORDER lives here rather than as a popup: the moment a top-tier item
 * exists on the board, the hardest slot switches to asking for it. A popup
 * would have to be dismissed, could be missed, and would need its own state to
 * survive a reload - where a slot that simply retargets cannot be lost, and
 * says the same thing in a place the player is already looking.
 */
export function visibleEventOrders(state: EventBoardState, grid: Grid): number[] {
  const slots = state.orders.slice(0, EVENT_ORDER_SLOTS);
  if (findEventItem(grid, EVENT_MAX_TIER)) slots[EVENT_ORDER_SLOTS - 1] = EVENT_MAX_TIER;
  return slots;
}

/** What a slot pays if filled now. */
export function eventOrderPayout(tier: number): number {
  return tier >= EVENT_MAX_TIER ? topTierPayout() : eventPointsForTier(tier);
}

/** The first cell holding an event item of exactly `tier`, or null. */
export function findEventItem(grid: Grid, tier: number): GridPosition | null {
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const cell = grid.get({ col, row });
      // `locked-item` is deliberately excluded: crusted cells are not yours
      // to hand in until they have been merged open.
      if (cell?.kind === 'item' && cell.typeId === EVENT_CHAIN.typeId && cell.tier === tier) {
        return { col, row };
      }
    }
  }
  return null;
}

export interface EventOrderResult {
  /** Where the item was taken from, so the caller can animate it leaving. */
  from: GridPosition;
  points: number;
  /** What the slot asks for now. */
  rerolledTo: number;
}

/**
 * Fills one slot if the board can pay for it.
 *
 * Returns null when it cannot, and changes nothing in that case - the caller
 * decides what to say. Never partially applies: the item is removed, the
 * points are counted and the slot is rerolled together, or none of it happens.
 */
export function submitEventOrder(
  state: EventBoardState,
  grid: Grid,
  slot: number,
  roll: () => number = Math.random
): EventOrderResult | null {
  if (slot < 0 || slot >= EVENT_ORDER_SLOTS) return null;
  const asking = visibleEventOrders(state, grid)[slot];
  if (!asking) return null;
  const from = findEventItem(grid, asking);
  if (!from) return null;

  grid.set(from, null);
  const rerolledTo = rollEventOrder(slot, roll());
  state.orders[slot] = rerolledTo;
  return { from, points: eventOrderPayout(asking), rerolledTo };
}
