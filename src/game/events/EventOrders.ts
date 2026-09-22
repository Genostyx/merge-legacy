import type { Grid } from '../Grid';
import type { GridPosition } from '../types';
import { EVENT_CHAIN, EVENT_MAX_TIER, eventPointsForTier } from './EventBoard';
import type { EventBoardState } from './EventBoard';

/**
 * EVENT ORDERS - the only thing on the event board that pays points.
 *
 * EACH SLOT REFILLS ON ITS OWN, and the order that replaces a filled one
 * must ASK FOR MORE than the one just handed in.
 *
 * This was a round - fill all three, then all three refresh - because when
 * slots refilled independently the event became: fill the cheap slot, get
 * another cheap one, repeat, never touch the other two. Points are flat (a
 * tier N pays N) while a tier-N piece costs 2^(N-1) merges, so the cheapest
 * order is always the most efficient one.
 *
 * The step up is what replaces the round. A slot alternates: a free draw,
 * then one strictly above whatever that free draw turned out to be, then
 * free again. You cannot be handed the bottom of your band twice running,
 * so the slot cannot be parked on.
 *
 * Note this is a WEAKER rule than the round was, and deliberately so - the
 * round's cost was that two finished cards sat greyed out waiting on a
 * third, which is the thing it was traded away for. Within a band of
 * [1, 2] the step has exactly one rung, so slot 0 alternates 1, 2, 1, 2
 * and remains the efficient place to spend. If that needs closing, the
 * lever is the point curve, not this.
 *
 * Three slots, always full, and ANY of them can ask for ANY tier. They used
 * to draw from disjoint bands - [1,2], [3,4,5], [6,7,8] - so each card had a
 * fixed difficulty. The step-up rule makes that redundant and actively
 * harmful: a band of [1,2] has exactly one rung above tier 1, so slot 0's
 * step was always the same card, and a band of [6,7,8] could not be filled
 * at all by a player who had not climbed that far.
 *
 * Filling one REMOVES the item and rerolls that slot. Points come from nowhere
 * else - not from merging, not from tapping - so the loop is always
 * "spend energy, merge up, hand in", never "tap for score".
 */

/**
 * EVERY SLOT DRAWS FROM THE WHOLE CHAIN.
 *
 * Nothing here consults what the player has built. An order for a piece you
 * have not made yet is a target, not a locked door - it tells you what to
 * climb toward, which is the only instruction this board ever gives.
 */
export const EVENT_ORDER_TIERS: readonly number[] =
  Array.from({ length: EVENT_MAX_TIER }, (_, i) => i + 1);

/**
 * Still three. It was the band count; now it is a number, because the row
 * is three cards wide and that is the only thing deciding it.
 */
export const EVENT_ORDER_SLOTS = 3;

/**
 * NO TWO SLOTS SHOW THE SAME TIER, which the disjoint bands used to give for
 * free and now has to be done on purpose.
 *
 * The old note here said dodging collisions was tried and only reached 13%,
 * because a band held three or four tiers and by the time a clash was spotted
 * there was often nothing left to swap with. That was a consequence of the
 * bands, not of dodging: against the full eight-tier chain there are always
 * at least six tiers free when the other two slots are excluded, so the
 * exclusion simply succeeds.
 */
function otherSlotTiers(state: EventBoardState, slot: number): number[] {
  return state.orders.filter((_, index) => index !== slot && index < EVENT_ORDER_SLOTS);
}

/**
 * A SHUFFLED BAG per slot, not an independent roll each time.
 *
 * Independent rolls let one player be dealt the dear end of the chain over
 * and over while another gets the cheap end - and with material set aside,
 * that is a straight advantage nobody earned. A bag deals every tier once
 * before any of them comes round again, so two players filling orders at the
 * same rate see the same set in the same number of fills. The ORDER inside a
 * cycle is still random; only the streaks are gone.
 *
 * Refilled when it empties, so the chain is walked in one shuffled pass, then
 * another. Per slot rather than shared, so the three cards are not drawing
 * down one common deck and starving each other.
 */
export function drawEventOrder(
  state: EventBoardState,
  slot: number,
  roll: () => number = Math.random
): number {
  while (state.orderBags.length <= slot) state.orderBags.push([]);
  const taken = otherSlotTiers(state, slot);

  let bag = state.orderBags[slot];
  // A bag holding tiers off the chain is from an older build's bands;
  // rebuilding beats dealing something the slot cannot ask for.
  if (bag.length === 0 || bag.some((tier) => !EVENT_ORDER_TIERS.includes(tier))) {
    bag = shuffle([...EVENT_ORDER_TIERS], roll);
    state.orderBags[slot] = bag;
  }

  // THE STEP UP BYPASSES THE BAG, on purpose.
  //
  // The bag's job is to deal every tier once before repeating. A constrained
  // draw cannot come from it without breaking that: popping until something
  // qualifies would consume and discard the tiers below the floor, biasing
  // the next free draw upward. So the step is rolled flat over the eligible
  // tiers and the bag is left exactly as it was.
  const floor = state.orderFloor?.[slot] ?? 0;
  if (floor > 0) {
    const above = EVENT_ORDER_TIERS.filter((tier) => tier > floor && !taken.includes(tier));
    // Nothing higher left - the slot has topped out, so it falls back to a
    // free draw and the caller clears the floor.
    if (above.length > 0) {
      return above[Math.min(above.length - 1, Math.floor(roll() * above.length))];
    }
  }

  // A tier another card is already showing goes back to the BOTTOM of the bag
  // rather than being discarded, so skipping a collision cannot quietly eat a
  // tier out of this pass and bias what is left.
  const skipped: number[] = [];
  let drawn: number | undefined;
  while (bag.length > 0) {
    const tier = bag.pop() as number;
    if (!taken.includes(tier)) { drawn = tier; break; }
    skipped.push(tier);
  }
  bag.unshift(...skipped);
  if (drawn !== undefined) return drawn;

  // The whole bag collided, which needs the other slots to hold every tier
  // it had left. Reshuffle and take anything free.
  state.orderBags[slot] = shuffle([...EVENT_ORDER_TIERS], roll);
  const free = EVENT_ORDER_TIERS.filter((tier) => !taken.includes(tier));
  return free[Math.floor(roll() * free.length)] ?? EVENT_ORDER_TIERS[0];
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
  // Cleared first, so the opening deal is not excluding itself against
  // whatever the previous event happened to leave in `orders`.
  state.orders = [];
  for (let slot = 0; slot < EVENT_ORDER_SLOTS; slot++) {
    state.orders[slot] = drawEventOrder(state, slot, roll);
  }
  return state.orders;
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
  // No filled-slot guard any more: a slot is never left showing a receipt,
  // so the hardest one is always a live offer the auto-order may take over.
  const hardest = EVENT_ORDER_SLOTS - 1;
  if (findEventItem(grid, EVENT_MAX_TIER)) {
    slots[hardest] = EVENT_MAX_TIER;
  }
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
  /** The tier that was handed in, which the card can announce as it leaves. */
  tier: number;
  /** True when the order that replaced it is a step up rather than a free draw. */
  steppedUp: boolean;
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
  while (state.orderFloor.length < EVENT_ORDER_SLOTS) state.orderFloor.push(0);

  // FREE, THEN A STEP UP, THEN FREE. Filling a free draw sets the floor to
  // what it asked for, so the replacement has to beat it; filling one that
  // was already a step up clears the floor, so the slot starts over.
  const wasStepUp = state.orderFloor[slot] > 0;
  state.orderFloor[slot] = wasStepUp ? 0 : asking;
  while (state.orders.length < EVENT_ORDER_SLOTS) state.orders.push(1);
  state.orders[slot] = drawEventOrder(state, slot, roll);

  // The band had nothing above the floor, so the draw fell back to a free
  // one - which means the slot is already free again and the floor would
  // otherwise sit there constraining a draw it cannot constrain.
  const steppedUp = state.orderFloor[slot] > 0
    && state.orders[slot] > state.orderFloor[slot];
  if (!steppedUp) state.orderFloor[slot] = 0;

  return { from, points: eventOrderPayout(asking), tier: asking, steppedUp };
}
