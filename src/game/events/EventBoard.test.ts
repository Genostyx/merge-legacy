import { describe, expect, it } from 'vitest';
import {
  EVENT_BOARD_COLS,
  EVENT_BOARD_ROWS,
  EVENT_OVERFLOW_STEP,
  EVENT_SPAWNER_AT,
  addEventEnergy,
  createDefaultEventBoardState,
  createEventGrid,
  eventPointsForTier,
  markOverflowPaid,
  normalizeEventBoardState,
  overflowCratesOwed,
  seedEventBoard,
  spendEventEnergy
} from './EventBoard';
import type { TimedEventDef } from './TimedEvents';

const event: TimedEventDef = {
  id: 'e', title: 'E', startsAt: 0, endsAt: 1, goal: 100,
  milestones: [
    { at: 20, kind: 'gems', amount: 5 },
    { at: 100, kind: 'crate', tier: 'gold' }
  ]
};

describe('event board', () => {
  it('is its own grid, not the main board', () => {
    const grid = createEventGrid();
    expect(grid.cols).toBe(EVENT_BOARD_COLS);
    expect(grid.rows).toBe(EVENT_BOARD_ROWS);
  });

  it('opens with the hut and nothing else', () => {
    // An empty board is the clearest statement of what this board is: one
    // machine, thirty empty cells, exactly one thing to do. A board that
    // opened two-thirds full of pieces the player cannot touch read as
    // someone else's game already in progress.
    const grid = createEventGrid();
    seedEventBoard(grid);

    expect(grid.get(EVENT_SPAWNER_AT)?.kind).toBe('spawner');
    const occupied = grid.serialize().flat().filter(Boolean);
    expect(occupied).toHaveLength(1);
  });

  it('seeds the same board every time', () => {
    const a = createEventGrid();
    const b = createEventGrid();
    seedEventBoard(a);
    seedEventBoard(b);
    expect(a.serialize()).toEqual(b.serialize());
  });

  it('never lets energy go negative, and refuses what it cannot pay', () => {
    const state = createDefaultEventBoardState();
    expect(spendEventEnergy(state, 1)).toBe(false);
    addEventEnergy(state, 3);
    expect(spendEventEnergy(state, 4)).toBe(false);
    expect(state.energy).toBe(3);
    expect(spendEventEnergy(state, 3)).toBe(true);
    expect(state.energy).toBe(0);
  });

  it('pays exactly the energy the piece cost to make', () => {
    // THE BALANCE RULE: every order is worth the same player time per point,
    // so which orders a player is dealt cannot decide how long the event
    // takes them. A tier-N piece is 2^(N-1) hut taps.
    expect(eventPointsForTier(1)).toBe(1);
    for (let tier = 1; tier < 8; tier++) {
      expect(eventPointsForTier(tier + 1)).toBe(eventPointsForTier(tier) * 2);
    }

    // Stated the other way round, which is the way it will be read in a
    // balance argument: two pieces of one tier cost and pay what one of the
    // next tier does.
    for (let tier = 1; tier < 8; tier++) {
      expect(eventPointsForTier(tier) * 2).toBe(eventPointsForTier(tier + 1));
    }
  });

  it('pays an overflow crate every step past the last rung, once each', () => {
    const state = createDefaultEventBoardState();
    expect(overflowCratesOwed(state, event, 100)).toBe(0);
    expect(overflowCratesOwed(state, event, 100 + EVENT_OVERFLOW_STEP - 1)).toBe(0);
    expect(overflowCratesOwed(state, event, 100 + EVENT_OVERFLOW_STEP)).toBe(1);
    expect(overflowCratesOwed(state, event, 100 + EVENT_OVERFLOW_STEP * 3)).toBe(3);

    markOverflowPaid(state, 3);
    expect(overflowCratesOwed(state, event, 100 + EVENT_OVERFLOW_STEP * 3)).toBe(0);
    expect(overflowCratesOwed(state, event, 100 + EVENT_OVERFLOW_STEP * 4)).toBe(1);
  });

  it('discards a saved grid of the wrong shape rather than patching it', () => {
    // A half-repaired grid would put items on cells that do not exist.
    const state = normalizeEventBoardState({
      energy: 4, seeded: true, overflowPaid: 2,
      grid: [[null, null]] as never
    });
    expect(state.grid).toEqual([]);
    expect(state.seeded).toBe(false);
    // Everything that is NOT the grid still survives.
    expect(state.energy).toBe(4);
    expect(state.overflowPaid).toBe(2);
  });

  it('survives junk in a save', () => {
    const state = normalizeEventBoardState({
      energy: Number.NaN, overflowPaid: -5
    } as never);
    expect(state).toEqual(createDefaultEventBoardState());
    expect(normalizeEventBoardState(undefined)).toEqual(createDefaultEventBoardState());
  });
});
