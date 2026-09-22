import { describe, expect, it } from 'vitest';
import {
  EVENT_ORDER_TIERS,
  EVENT_ORDER_SLOTS,
  eventOrderPayout,
  drawEventOrder,
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
    for (let tier = 1; tier <= EVENT_MAX_TIER; tier++) {
      expect(EVENT_ORDER_TIERS).toContain(tier);
    }
  });

  it('lets any slot ask for any tier', () => {
    // The slots used to draw from disjoint bands, so slot 0 could only ever
    // ask for a 1 or a 2. Every slot now reaches the whole chain.
    const seen = EVENT_ORDER_TIERS.map(() => new Set<number>());
    const state = createDefaultEventBoardState();
    for (let i = 0; i < 400; i++) {
      rollEventOrders(state).forEach((tier, slot) => seen[slot].add(tier));
    }
    for (let slot = 0; slot < EVENT_ORDER_SLOTS; slot++) {
      // Not every tier every time - two are excluded on any given deal as
      // the other cards' - but across 400 deals a slot must reach the ends.
      expect(seen[slot].has(1)).toBe(true);
      expect(seen[slot].has(EVENT_MAX_TIER)).toBe(true);
    }
  });

  it('deals the whole chain before repeating any of it', () => {
    // THE FAIRNESS RULE. Independent rolls let one player be dealt the dear
    // end over and over while another gets the cheap end, which with material
    // set aside is an advantage nobody earned. Two players filling at the
    // same rate now see the same set in the same number of fills; only the
    // order inside a cycle is luck.
    for (let slot = 0; slot < EVENT_ORDER_SLOTS; slot++) {
      // On its own, so the collision skip does not exclude anything.
      const state = createDefaultEventBoardState();
      state.orders = [];
      const cycle = EVENT_ORDER_TIERS.map(() => drawEventOrder(state, slot));
      expect([...cycle].sort((a, b) => a - b)).toEqual([...EVENT_ORDER_TIERS]);

      const next = EVENT_ORDER_TIERS.map(() => drawEventOrder(state, slot));
      expect([...next].sort((a, b) => a - b)).toEqual([...EVENT_ORDER_TIERS]);
    }
  });

  it('puts a skipped collision back rather than eating it', () => {
    // Dodging a duplicate must not quietly consume the tier out of this
    // pass, or the rest of the cycle is biased toward whatever is left.
    const state = createDefaultEventBoardState();
    state.orders = [0, 4, 7];
    const drawn = new Set<number>();
    for (let i = 0; i < EVENT_ORDER_TIERS.length - 2; i++) {
      state.orders[0] = 0;
      drawn.add(drawEventOrder(state, 0));
    }
    // Six draws with 4 and 7 excluded must be the other six, each once.
    expect([...drawn].sort((a, b) => a - b))
      .toEqual(EVENT_ORDER_TIERS.filter((t) => t !== 4 && t !== 7));
  });

  it('never deals the same tier to two slots at once', () => {
    const state = createDefaultEventBoardState();
    for (let i = 0; i < 300; i++) {
      const dealt = rollEventOrders(state);
      expect(new Set(dealt).size).toBe(dealt.length);
    }
  });

  it('rebuilds a bag left over from the old bands', () => {
    // A save written before the bands were removed would otherwise deal a
    // tier that is not on the chain at all.
    const state = { ...createDefaultEventBoardState(), orderBags: [[99]] };
    expect(EVENT_ORDER_TIERS).toContain(drawEventOrder(state, 0));
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

  it('takes the item, pays, and replaces that card on the spot', () => {
    const grid = createEventGrid();
    put(grid, 1, 2, 2);
    const state = stateWith([2, 4, 6]);
    const result = submitEventOrder(state, grid, 0, () => 0);

    expect(result?.from).toEqual({ col: 1, row: 2 });
    expect(result?.points).toBe(eventPointsForTier(2));
    expect(result?.tier).toBe(2);
    expect(grid.get({ col: 1, row: 2 })).toBeNull();
    // Only slot 0 moves. The neighbours are untouched.
    expect(state.orders[1]).toBe(4);
    expect(state.orders[2]).toBe(6);
    expect(EVENT_ORDER_TIERS).toContain(state.orders[0]);
  });

  it('replaces a filled order with one at least a tier higher', () => {
    const grid = createEventGrid();
    // Band 1 is [3, 4, 5], so filling a 3 must be answered with a 4 or a 5.
    put(grid, 0, 0, 3);
    const state = stateWith([2, 3, 6]);
    const result = submitEventOrder(state, grid, 1, () => 0);
    expect(result?.steppedUp).toBe(true);
    expect(state.orders[1]).toBeGreaterThan(3);
    expect(state.orderFloor[1]).toBe(3);
  });

  it('resets to a free draw once the stepped-up order is filled', () => {
    const grid = createEventGrid();
    put(grid, 0, 0, 3);
    const state = stateWith([2, 3, 6]);
    submitEventOrder(state, grid, 1, () => 0);
    const raised = state.orders[1];
    expect(raised).toBeGreaterThan(3);

    // Hand in the stepped-up one; the slot is free again, so the next draw
    // may be anything in the band - including back down to a 3.
    put(grid, 0, 0, raised);
    const second = submitEventOrder(state, grid, 1, () => 0);
    expect(second?.steppedUp).toBe(false);
    expect(state.orderFloor[1]).toBe(0);
    expect(EVENT_ORDER_TIERS).toContain(state.orders[1]);
  });

  it('falls straight back to free at the top of the chain', () => {
    // Filling the last tier has no rung above it, so the step is skipped
    // rather than stalling the slot on a constraint it cannot meet.
    const grid = createEventGrid();
    put(grid, 0, 0, EVENT_MAX_TIER);
    const state = stateWith([EVENT_MAX_TIER, 4, 6]);
    const result = submitEventOrder(state, grid, 0, () => 0);
    expect(result?.steppedUp).toBe(false);
    expect(state.orderFloor[0]).toBe(0);
    expect(EVENT_ORDER_TIERS).toContain(state.orders[0]);
  });

  it('lets the same slot be filled again immediately', () => {
    // The round used to refuse this - it was the anti-farm rule. A slot now
    // refills on the spot, so a second item CAN be handed in at once; what
    // stops it being the same cheap order is the step up, not a refusal.
    const grid = createEventGrid();
    put(grid, 0, 0, 1);
    const state = stateWith([1, 4, 6]);
    expect(submitEventOrder(state, grid, 0, () => 0)).not.toBeNull();
    expect(state.orders[0]).toBe(2);
    put(grid, 1, 0, 2);
    expect(submitEventOrder(state, grid, 0, () => 0)).not.toBeNull();
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
