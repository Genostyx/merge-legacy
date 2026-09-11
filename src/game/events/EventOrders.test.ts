import { describe, expect, it } from 'vitest';
import {
  EVENT_ORDER_BANDS,
  EVENT_ORDER_SLOTS,
  eventOrderPayout,
  drawEventOrder,
  isRoundComplete,
  isSlotFilled,
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

  it('deals every slot from inside its own band', () => {
    for (const roll of [() => 0, () => 0.5, () => 0.999]) {
      rollEventOrders(createDefaultEventBoardState(), roll).forEach((tier, slot) => {
        expect(EVENT_ORDER_BANDS[slot]).toContain(tier);
      });
    }
  });

  it('deals a whole band before repeating any of it', () => {
    // THE FAIRNESS RULE. Independent rolls let one player be dealt the dear
    // end of a band over and over while another gets the cheap end, which
    // with material set aside is an advantage nobody earned. Two players
    // filling at the same rate now see the same set in the same number of
    // fills; only the order inside a cycle is luck.
    for (let slot = 0; slot < EVENT_ORDER_SLOTS; slot++) {
      const band = EVENT_ORDER_BANDS[slot];
      const state = createDefaultEventBoardState();
      const cycle = band.map(() => drawEventOrder(state, slot));
      expect([...cycle].sort()).toEqual([...band].sort());

      // ...and the next cycle is a fresh pass over the same band, not a
      // continuation of the last one.
      const next = band.map(() => drawEventOrder(state, slot));
      expect([...next].sort()).toEqual([...band].sort());
    }
  });

  it('gives the slots disjoint bands, so two cards can never ask alike', () => {
    // THE GUARANTEE, by construction rather than by logic. Overlapping bands
    // put the same piece on two cards a fifth of the time, and dodging it
    // afterwards only reached 13% because the bags are too short to always
    // have a swap partner.
    const seen = new Set<number>();
    for (const band of EVENT_ORDER_BANDS) {
      for (const tier of band) {
        expect(seen.has(tier)).toBe(false);
        seen.add(tier);
      }
    }
  });

  it('never deals the same tier to two slots at once', () => {
    const state = createDefaultEventBoardState();
    for (let i = 0; i < 300; i++) {
      const dealt = rollEventOrders(state);
      expect(new Set(dealt).size).toBe(dealt.length);
    }
  });

  it('rebuilds a bag left over from different bands', () => {
    // A save written before the bands changed would otherwise deal a tier the
    // slot can no longer ask for.
    const state = { ...createDefaultEventBoardState(), orderBags: [[99]] };
    expect(EVENT_ORDER_BANDS[0]).toContain(drawEventOrder(state, 0));
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

  it('takes the item and pays, but does NOT replace the card', () => {
    const grid = createEventGrid();
    put(grid, 1, 2, 2);
    const state = stateWith([2, 4, 6]);
    const result = submitEventOrder(state, grid, 0, () => 0);

    expect(result?.from).toEqual({ col: 1, row: 2 });
    expect(result?.points).toBe(eventPointsForTier(2));
    expect(grid.get({ col: 1, row: 2 })).toBeNull();
    expect(result?.roundComplete).toBe(false);
    // The row is untouched: a filled slot is a receipt until the round ends.
    expect(state.orders).toEqual([2, 4, 6]);
    expect(isSlotFilled(state, 0)).toBe(true);
  });

  it('refuses a slot that is already filled this round', () => {
    // Without this the cheap slot could be handed a second item and paid
    // again, which is the farming the round exists to stop.
    const grid = createEventGrid();
    put(grid, 0, 0, 2);
    put(grid, 1, 0, 2);
    const state = stateWith([2, 4, 6]);
    expect(submitEventOrder(state, grid, 0)).not.toBeNull();
    expect(submitEventOrder(state, grid, 0)).toBeNull();
    // ...and the second item is still on the board, not consumed.
    expect(findEventItem(grid, 2)).not.toBeNull();
  });

  it('deals a fresh three only when all three are in', () => {
    const grid = createEventGrid();
    put(grid, 0, 0, 2);
    put(grid, 1, 0, 4);
    put(grid, 2, 0, 6);
    const state = stateWith([2, 4, 6]);

    expect(submitEventOrder(state, grid, 0)?.roundComplete).toBe(false);
    expect(submitEventOrder(state, grid, 1)?.roundComplete).toBe(false);
    expect(state.orders).toEqual([2, 4, 6]);

    const last = submitEventOrder(state, grid, 2);
    expect(last?.roundComplete).toBe(true);
    // A new round: nothing filled, and every slot asking again.
    expect(isRoundComplete(state)).toBe(false);
    state.orders.forEach((tier, slot) => {
      expect(EVENT_ORDER_BANDS[slot]).toContain(tier);
    });
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
    // No jackpot anywhere: a bonus on one tier would make that order worth
    // more player time per point than the rest, which is the whole thing the
    // payout curve exists to prevent.
    for (let tier = 1; tier <= EVENT_MAX_TIER; tier++) {
      expect(eventOrderPayout(tier)).toBe(eventPointsForTier(tier));
    }
  });

  it('ignores a slot index that does not exist', () => {
    const grid = createEventGrid();
    put(grid, 0, 0, 3);
    expect(submitEventOrder(stateWith([3, 4, 6]), grid, -1)).toBeNull();
    expect(submitEventOrder(stateWith([3, 4, 6]), grid, EVENT_ORDER_SLOTS)).toBeNull();
  });
});
