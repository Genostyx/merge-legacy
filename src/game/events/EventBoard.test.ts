import { describe, expect, it } from 'vitest';
import {
  EVENT_BOARD_COLS,
  EVENT_BOARD_ROWS,
  EVENT_CRUST_LAYOUT,
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

  it('seeds the authored crust, leaving the top row and the booth clear', () => {
    const grid = createEventGrid();
    seedEventBoard(grid);

    expect(grid.get(EVENT_SPAWNER_AT)?.kind).toBe('spawner');
    for (const [col, row, tier] of EVENT_CRUST_LAYOUT) {
      const cell = grid.get({ col, row });
      // Crust IS `locked-item` - the main board's rule, not a second one.
      expect(cell).toEqual({ kind: 'locked-item', typeId: 'verdigris', tier });
    }
    // Row 0 is the open sandbox: nothing crusted anywhere along it.
    for (let col = 0; col < EVENT_BOARD_COLS; col++) {
      expect(grid.get({ col, row: 0 })?.kind).not.toBe('locked-item');
    }
    // And the very first thing available is a merge, not a wait.
    const loose = grid.serialize().flat()
      .filter((cell) => cell?.kind === 'item' && cell.tier === 1);
    expect(loose.length).toBeGreaterThanOrEqual(2);
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

  it('pays a flat step per tier', () => {
    // Linear by decision, not by oversight: the payout does NOT keep pace
    // with the merge cost, and the order bands are what stop the cheap end
    // being the whole game. See eventPointsForTier.
    const steps = [];
    for (let tier = 1; tier < 8; tier++) {
      steps.push(eventPointsForTier(tier + 1) - eventPointsForTier(tier));
    }
    expect(new Set(steps).size).toBe(1);
    expect(steps[0]).toBeGreaterThan(0);
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
