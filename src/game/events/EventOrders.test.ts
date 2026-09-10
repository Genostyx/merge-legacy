import { describe, expect, it } from 'vitest';
import {
  EVENT_ORDER_BANDS,
  EVENT_ORDER_SLOTS,
  eventOrderPayout,
  findEventItem,
  rollEventOrders,
  submitEventOrder,
  visibleEventOrders
} from './EventOrders';
import {
  EVENT_CHAIN, EVENT_MAX_TIER, createDefaultEventBoardState, createEventGrid, eventPointsForTier
} from './EventBoard';
import type { Grid } from '../Grid';

const put = (grid: Grid, col: number, row: number, tier: number, locked = false): void => {
  grid.set({ col, row }, {
    kind: locked ? 'locked-item' : 'item', typeId: EVENT_CHAIN.typeId, tier
  } as never);
};

const stateWith = (orders: number[]) => ({ ...createDefaultEventBoardState(), orders });

describe('event orders', () => {
  it('can ask for every tier in the chain, unlocked or not', () => {
    // Nothing here consults what the player has built: an order for a piece
    // they have not made yet is a target, not a locked door.
    const askable = new Set(EVENT_ORDER_BANDS.flat());
    for (let tier = 1; tier <= EVENT_MAX_TIER; tier++) {
      expect(askable.has(tier)).toBe(true);
    }
  });

  it('rolls every slot inside its own band', () => {
    for (const roll of [() => 0, () => 0.5, () => 0.999]) {
      rollEventOrders(roll).forEach((tier, slot) => {
        expect(EVENT_ORDER_BANDS[slot]).toContain(tier);
      });
    }
  });

  it('refuses, and changes nothing, when the board cannot pay', () => {
    const grid = createEventGrid();
    const state = stateWith([3, 4, 6]);
    expect(submitEventOrder(state, grid, 0)).toBeNull();
    expect(state.orders).toEqual([3, 4, 6]);
  });

  it('will not take a crusted item, only a cleared one', () => {
    // Crust is a target to merge onto, not stock to hand in.
    const grid = createEventGrid();
    put(grid, 0, 0, 3, true);
    expect(findEventItem(grid, 3)).toBeNull();
    expect(submitEventOrder(stateWith([3, 4, 6]), grid, 0)).toBeNull();
  });

  it('takes the item, pays, and rerolls the slot it filled', () => {
    const grid = createEventGrid();
    put(grid, 1, 2, 3);
    const state = stateWith([3, 4, 6]);
    const result = submitEventOrder(state, grid, 0, () => 0);

    expect(result?.from).toEqual({ col: 1, row: 2 });
    expect(result?.points).toBe(eventPointsForTier(3));
    expect(grid.get({ col: 1, row: 2 })).toBeNull();
    expect(state.orders[0]).toBe(EVENT_ORDER_BANDS[0][0]);
    // The other slots are untouched.
    expect(state.orders.slice(1)).toEqual([4, 6]);
  });

  it('retargets the hardest slot the moment a top-tier item exists', () => {
    const grid = createEventGrid();
    const state = stateWith([3, 4, 6]);
    expect(visibleEventOrders(state, grid)[EVENT_ORDER_SLOTS - 1]).toBe(6);

    put(grid, 4, 4, EVENT_MAX_TIER);
    expect(visibleEventOrders(state, grid)[EVENT_ORDER_SLOTS - 1]).toBe(EVENT_MAX_TIER);
    // And the stored slot is NOT overwritten - once the top item is handed
    // in, the slot goes back to asking what it asked for before.
    expect(state.orders[EVENT_ORDER_SLOTS - 1]).toBe(6);
  });

  it('pays a tier its own value, with no exception at the top', () => {
    // The scale is linear end to end. A jackpot on the last tier would break
    // it at the exact place a player is most likely to check the arithmetic.
    for (let tier = 1; tier <= EVENT_MAX_TIER; tier++) {
      expect(eventOrderPayout(tier)).toBe(tier);
    }
  });

  it('ignores a slot index that does not exist', () => {
    const grid = createEventGrid();
    put(grid, 0, 0, 3);
    expect(submitEventOrder(stateWith([3, 4, 6]), grid, -1)).toBeNull();
    expect(submitEventOrder(stateWith([3, 4, 6]), grid, EVENT_ORDER_SLOTS)).toBeNull();
  });
});
