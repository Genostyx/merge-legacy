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
 * Points an event order pays, by the tier it asked for. LINEAR.
 *
 * Two points a tier, flat. It does not track the merge cost, which doubles -
 * so per unit of raw material the easy slot is the efficient one, and a
 * player who only ever fills that slot clears the track faster than one who
 * climbs. The three order BANDS are what hold that in check: only one slot
 * ever asks for the cheap end, so the cheap strategy is capped at a third of
 * the board's throughput rather than being the whole game.
 */
export function eventPointsForTier(tier: number): number {
  return Math.max(1, tier * 2);
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
   * Overflow crates already paid. Points past the last rung keep paying, and
   * this is what stops a reload paying for the same points twice.
   */
  overflowPaid: number;
}

export function createDefaultEventBoardState(): EventBoardState {
  return { energy: 0, grid: [], seeded: false, orders: [], overflowPaid: 0 };
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
 * THE OPENING LAYOUT, as an explicit matrix rather than a roll.
 *
 * Every player gets the same first board. A random crust can deal an opening
 * with nothing clearable in it, and on a 35-cell board that is the difference
 * between an event someone starts and one they close - so this is authored,
 * not rolled.
 *
 * The shape: the top-left is open, the crust is weighted to the bottom and
 * right, and its tiers RISE as it goes down the board. That gives an
 * immediate clearable target at tier 1 next to the open area, and a bottom
 * corner that stays as a goal for later - the board's own difficulty ramp,
 * without a single number needing to be tuned.
 *
 * Crusted cells are ordinary `locked-item` cells: the main board's rule,
 * unchanged. They refuse every input and clear when a matching item is merged
 * onto them.
 *
 * Coordinates are [col, row] with row 0 at the TOP. Row 0 carries no crust at
 * all - it is the open sandbox - and the booth's own cell in the last row is
 * left clear.
 */
export const EVENT_CRUST_LAYOUT: readonly [number, number, number][] = [
  // [col, row, tier]
  [3, 1, 1], [4, 1, 1],
  [3, 2, 1], [4, 2, 2],
  [0, 3, 1], [4, 3, 2],
  [0, 4, 2], [1, 4, 2], [3, 4, 3], [4, 4, 3],
  // The booth stands in the middle of this last row, so the crust leaves that
  // one cell open rather than the board carrying a whole row for it.
  [0, 5, 3], [1, 5, 3], [3, 5, 4], [4, 5, 5]
];

/** Where the spawner stands. Bottom-centre: thumb reach, and never crusted. */
export const EVENT_SPAWNER_AT = { col: 2, row: EVENT_BOARD_ROWS - 1 };

/** The two loose tier-1s, in the open top-left, so the first act is a merge. */
const EVENT_OPENING_ITEMS: readonly [number, number][] = [[0, 0], [1, 0]];

export function seedEventBoard(grid: Grid): void {
  grid.clear();
  grid.set(EVENT_SPAWNER_AT, {
    kind: 'spawner',
    id: 'event-spawner',
    typeId: EVENT_CHAIN.typeId,
    tier: 1,
    readyAt: 0,
    // The booth never runs dry: what gates a tap is event energy, and a
    // second gate on top of it would only be a wait the player cannot see.
    charges: Number.MAX_SAFE_INTEGER
  });

  for (const [col, row, tier] of EVENT_CRUST_LAYOUT) {
    grid.set({ col, row }, { kind: 'locked-item', typeId: EVENT_CHAIN.typeId, tier });
  }
  for (const [col, row] of EVENT_OPENING_ITEMS) {
    grid.set({ col, row }, { kind: 'item', typeId: EVENT_CHAIN.typeId, tier: 1 });
  }
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

/** Records `count` overflow crates as paid. The caller does the paying. */
export function markOverflowPaid(state: EventBoardState, count: number): void {
  if (!Number.isFinite(count) || count <= 0) return;
  state.overflowPaid += Math.floor(count);
}
