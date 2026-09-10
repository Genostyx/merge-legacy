import type { Grid } from '../Grid';
import type { GridPosition } from '../types';
import { EVENT_CHAIN, EVENT_MAX_TIER, eventPointsForTier } from './EventBoard';
import type { EventBoardState } from './EventBoard';

/**
 * EVENT ORDERS - the only thing on the event board that pays points.
 *
 * Three slots, always full, each drawing from a band of the chain: something
 * you can fill now, something worth working toward, and something that needs
 * most of the window. A single order queue would either be trivial for a
 * player who had merged high or impossible for one who had not, and the three
 * bands are what let one board serve both.
 *
 * Filling one REMOVES the item and rerolls that slot. Points come from nowhere
 * else - not from merging, not from tapping - so the loop is always
 * "spend energy, merge up, hand in", never "tap for score".
 */

/**
 * The band each slot draws from.
 *
 * Between them the three bands cover the WHOLE chain, tier one to tier eight,
 * and nothing here consults what the player has built. An order for a piece
 * you have not made yet is a target, not a locked door - it tells you what to
 * climb toward, which is the only instruction this board ever gives.
 *
 * The bands overlap on purpose. Hard edges would make the middle slot's two
 * tiers the entire mid-game; sharing tiers 3 and 5 between neighbours means
 * the row can ask for the same piece in more than one way and the three slots
 * stay distinguishable without being three separate games.
 */
export const EVENT_ORDER_BANDS: readonly (readonly number[])[] = [
  [1, 2, 3],
  [3, 4, 5],
  [5, 6, 7, 8]
];

export const EVENT_ORDER_SLOTS = EVENT_ORDER_BANDS.length;

/** Rolls one slot's tier from its own band, ignoring the bag. */
export function rollEventOrder(slot: number, roll: number = Math.random()): number {
  const band = EVENT_ORDER_BANDS[slot] ?? EVENT_ORDER_BANDS[0];
  return band[Math.min(band.length - 1, Math.floor(roll * band.length))];
}

/**
 * A SHUFFLED BAG per slot, not an independent roll each time.
 *
 * Independent rolls let one player be dealt the dear end of a band over and
 * over while another gets the cheap end - and with material set aside, that
 * is a straight advantage nobody earned. A bag deals every tier in the band
 * once before any of them comes round again, so two players filling orders at
 * the same rate see the same set in the same number of fills. The ORDER
 * inside a cycle is still random; only the streaks are gone.
 *
 * Refilled when it empties, so a band is walked in one shuffled pass, then
 * another.
 */
export function drawEventOrder(
  state: EventBoardState, slot: number, roll: () => number = Math.random
): number {
  const band = EVENT_ORDER_BANDS[slot] ?? EVENT_ORDER_BANDS[0];
  while (state.orderBags.length <= slot) state.orderBags.push([]);

  let bag = state.orderBags[slot];
  // A bag holding tiers that are not in this band any more is from an older
  // build's bands; rebuilding beats dealing a tier the slot cannot ask for.
  if (bag.length === 0 || bag.some((tier) => !band.includes(tier))) {
    bag = shuffle([...band], roll);
    state.orderBags[slot] = bag;
  }
  return bag.pop() ?? band[0];
}

/** Fisher-Yates, on the injected roll so a test can pin the deal. */
function shuffle(items: number[], roll: () => number): number[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** The opening deal: one draw per slot. */
export function rollEventOrders(
  state: EventBoardState, roll: () => number = Math.random
): number[] {
  return EVENT_ORDER_BANDS.map((_, slot) => drawEventOrder(state, slot, roll));
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

/**
 * What a slot pays if filled now. The tier's own value, always.
 *
 * The top tier used to pay double here, which broke the linear scale at the
 * exact end where it is most visible. The auto-order remains worth chasing
 * for what it is - the hard slot retargeting to a piece you already hold, so
 * it can be handed in at once instead of waiting for a matching roll.
 */
export function eventOrderPayout(tier: number): number {
  return eventPointsForTier(tier);
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
  const rerolledTo = drawEventOrder(state, slot, roll);
  state.orders[slot] = rerolledTo;
  return { from, points: eventOrderPayout(asking), rerolledTo };
}
