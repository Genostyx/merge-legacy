import type { GridCellData } from '../Grid';
import { Grid } from '../Grid';
import type { TimedEventDef } from './TimedEvents';

/**
 * THE EVENT BOARD - its data, its state, and the rules that own them.
 *
 * Nothing here draws, and nothing here touches the main board. The event
 * board is a SECOND `Grid` instance with its own cells, its own chain and its
 * own energy; the only wire between the two is that main-board play pays for
 * event-board taps, and finished rungs pay back into the main game.
 *
 * Three decisions worth stating, because each one is a thing NOT built:
 *
 *  - CRUSTED CELLS ARE `locked-item` CELLS. The main board already has a cell
 *    kind that refuses every input and clears when a matching item is merged
 *    onto it. That is the sand-lock rule exactly. A second flag meaning the
 *    same thing would be two implementations of one behaviour, and they would
 *    drift.
 *  - EVENT ENERGY DOES NOT RECHARGE ON A TIMER. It is bought with main-board
 *    play and nothing else. A pool that refilled by itself would let a player
 *    finish the event without touching the main board, which is the one link
 *    the whole design exists to create - so there is no recharge anchor here
 *    to save, and none to get wrong.
 *  - THE EVENT CHAIN IS NOT IN `CHAINS`. Registering it would put it in the
 *    shop, the collection, order generation and the dispenser tables, all of
 *    which outlive the window. It is resolved through this module instead.
 */

export const EVENT_BOARD_COLS = 5;
export const EVENT_BOARD_ROWS = 6;

/** What one tap of the event spawner costs. */
export const EVENT_SPAWN_COST = 1;

export { EVENT_CHAIN, EVENT_MAX_TIER, eventTierDef, isEventTypeId } from './EventChain';
import { EVENT_CHAIN, EVENT_MAX_TIER } from './EventChain';

/**
 * Points an event order pays, by the tier it asked for. LINEAR, and with no
 * exceptions anywhere: tier N pays N.
 *
 * It deliberately does NOT track the merge cost, which doubles. That makes
 * the cheapest piece the most efficient one per unit of raw material - a
 * tier 1 pays a point for one energy, where a tier 8 pays eight for a hundred
 * and twenty-eight. That is a known and accepted trade, not an oversight:
 *
 *  - The slots cannot be dismissed or re-rolled at will, so a player cannot
 *    hold three cheap orders. Only one band reaches the bottom of the chain,
 *    which caps the cheap strategy at a third of the row.
 *  - A payout that doubled with the merge cost would make the top of the
 *    chain worth so much that nothing below it mattered, which is the
 *    opposite failure and a worse one.
 *
 * Anything that pays a bonus on top of this - a top-tier jackpot, say - makes
 * the scale non-linear again, so there is nothing of the sort.
 */
export function eventPointsForTier(tier: number): number {
  return Math.max(1, Math.floor(tier));
}

export interface EventBoardState {
  /**
   * Event energy, bought with main-board play. Uncapped: it is earned rather
   * than regenerated, so a cap would only punish a player for banking taps
   * before sitting down with the event.
   */
  energy: number;
  /** Cells, row-major, exactly as `Grid.serialize` writes them. */
  grid: (GridCellData | null)[][];
  /** False until the opening layout has been laid down once. */
  seeded: boolean;
  /**
   * What each order slot is asking for, as a tier. Always as long as
   * `EVENT_ORDER_BANDS`; see EventOrders.ts.
   */
  orders: number[];
  /**
   * The highest tier the player has actually MADE, which is what the ladder
   * reveals. Crusted pieces are excluded on purpose: seeing a tier sitting
   * under the crust is not the same as having built it, and a ladder that
   * spoiled its own top row from the first second would have nothing left to
   * show for a merge.
   */
  seenTier: number;
  /**
   * Overflow crates already paid. Points past the last rung keep paying, and
   * this is what stops a reload paying for the same points twice.
   */
  overflowPaid: number;
}

export function createDefaultEventBoardState(): EventBoardState {
  return { energy: 0, grid: [], seeded: false, orders: [], seenTier: 0, overflowPaid: 0 };
}

/**
 * Rebuilds the board state from a save.
 *
 * A grid of the wrong SHAPE is discarded rather than patched: the event board
 * is temporary, its dimensions are a constant, and a half-repaired grid would
 * put items on cells the player can never reach.
 */
export function normalizeEventBoardState(
  raw: Partial<EventBoardState> | undefined
): EventBoardState {
  const state = createDefaultEventBoardState();
  if (!raw) return state;

  if (Number.isFinite(raw.energy)) state.energy = Math.max(0, Math.floor(raw.energy as number));
  if (Number.isFinite(raw.seenTier)) {
    state.seenTier = Math.min(EVENT_MAX_TIER, Math.max(0, Math.floor(raw.seenTier as number)));
  }
  if (Number.isFinite(raw.overflowPaid)) {
    state.overflowPaid = Math.max(0, Math.floor(raw.overflowPaid as number));
  }
  if (Array.isArray(raw.orders)) {
    state.orders = raw.orders
      .filter((tier): tier is number => Number.isFinite(tier))
      .map((tier) => Math.min(EVENT_MAX_TIER, Math.max(1, Math.floor(tier))));
  }
  const grid = raw.grid;
  const rightShape = Array.isArray(grid)
    && grid.length === EVENT_BOARD_ROWS
    && grid.every((row) => Array.isArray(row) && row.length === EVENT_BOARD_COLS);
  if (rightShape) {
    state.grid = grid as (GridCellData | null)[][];
    state.seeded = raw.seeded === true;
  }
  return state;
}

/** A fresh grid instance for the event board. Never the main board's. */
export function createEventGrid(): Grid {
  return new Grid(EVENT_BOARD_COLS, EVENT_BOARD_ROWS);
}

export function addEventEnergy(state: EventBoardState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.energy += Math.floor(amount);
}

/** Spends if it can, and says whether it did. Never goes negative. */
export function spendEventEnergy(state: EventBoardState, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (state.energy < amount) return false;
  state.energy -= amount;
  return true;
}

/**
 * THE OPENING LAYOUT: the hut, and nothing else.
 *
 * This used to deal a crust of locked pieces across the lower rows - the
 * sand-locked opening the genre uses, meant to hand the player mid-tier
 * targets from minute one. It is gone, and the reason is worth keeping:
 *
 * An empty board is the clearest possible statement of what an event board
 * IS. A player opening it for the first time sees one machine and thirty
 * empty cells, and there is exactly one thing to do. A board that opens
 * two-thirds full of pieces they cannot touch reads as someone else's game
 * already in progress - and on a five-by-six grid it also means the first
 * real merges have nowhere to happen.
 *
 * The `locked-item` handling in the panel stays, because the main board's
 * rule is the main board's rule and this board simply no longer seeds any.
 */
export const EVENT_SPAWNER_AT = { col: 2, row: EVENT_BOARD_ROWS - 1 };

export function seedEventBoard(grid: Grid): void {
  grid.clear();
  grid.set(EVENT_SPAWNER_AT, {
    kind: 'spawner',
    id: 'event-spawner',
    typeId: EVENT_CHAIN.typeId,
    tier: 1,
    readyAt: 0,
    // The hut never runs dry: what gates a tap is event energy, and a second
    // gate on top of it would only be a wait the player cannot see.
    charges: Number.MAX_SAFE_INTEGER
  });
}

/**
 * OVERFLOW: points past the last rung keep paying.
 *
 * A three-day event whose track finishes on day two leaves the third day
 * worth nothing, which is when players put the game down. Every
 * `EVENT_OVERFLOW_STEP` points beyond the final rung pays one bronze crate,
 * for as long as the window is open.
 */
export const EVENT_OVERFLOW_STEP = 25;

/** How many overflow crates are owed and not yet paid. */
export function overflowCratesOwed(
  state: EventBoardState, event: TimedEventDef, points: number
): number {
  const last = event.milestones.length > 0
    ? Math.max(...event.milestones.map((m) => m.at))
    : event.goal;
  if (points <= last) return 0;
  const earned = Math.floor((points - last) / EVENT_OVERFLOW_STEP);
  return Math.max(0, earned - state.overflowPaid);
}

/** Raises the ladder's high-water mark. Never lowers it. */
export function noteEventTierSeen(state: EventBoardState, tier: number): void {
  if (!Number.isFinite(tier)) return;
  state.seenTier = Math.min(EVENT_MAX_TIER, Math.max(state.seenTier, Math.floor(tier)));
}

/** Records `count` overflow crates as paid. The caller does the paying. */
export function markOverflowPaid(state: EventBoardState, count: number): void {
  if (!Number.isFinite(count) || count <= 0) return;
  state.overflowPaid += Math.floor(count);
}
