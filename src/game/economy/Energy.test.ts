import { describe, expect, it } from 'vitest';
import {
  ENERGY_CAP,
  ENERGY_COST_PER_COLLECT,
  ENERGY_REFILL_MS,
  addEnergy,
  createDefaultEnergy,
  energyRefillCost,
  msUntilEnergyFull,
  msUntilNextEnergy,
  normalizeEnergy,
  recordEnergyRefillPurchase,
  spendEnergy,
  syncEnergy
} from './Energy';
import { capacityForTier } from '../dispensers/Dispensers';

describe('energy refill', () => {
  it('grants one energy per interval', () => {
    const state = createDefaultEnergy(0);
    state.current = 10;
    syncEnergy(state, ENERGY_REFILL_MS);
    expect(state.current).toBe(11);
    syncEnergy(state, ENERGY_REFILL_MS * 3);
    expect(state.current).toBe(13);
  });

  it('keeps partial tick progress instead of restarting it', () => {
    const state = createDefaultEnergy(0);
    state.current = 10;
    // 1.5 intervals: one energy lands, and the leftover half-interval is
    // still credited toward the next one.
    syncEnergy(state, ENERGY_REFILL_MS * 1.5);
    expect(state.current).toBe(11);
    expect(msUntilNextEnergy(state, ENERGY_REFILL_MS * 1.5)).toBe(ENERGY_REFILL_MS / 2);
  });

  it('accrues offline time in one jump', () => {
    const state = createDefaultEnergy(0);
    state.current = 0;
    syncEnergy(state, ENERGY_REFILL_MS * 40);
    expect(state.current).toBe(40);
  });

  it('stops at the cap', () => {
    const state = createDefaultEnergy(0);
    state.current = 0;
    syncEnergy(state, ENERGY_REFILL_MS * 10_000);
    expect(state.current).toBe(ENERGY_CAP);
  });

  it('does not bank a backlog while sitting full', () => {
    const state = createDefaultEnergy(0);
    // Idle at full for a long time, then spend - the next energy must be a
    // whole interval away, not instantly refunded from banked time.
    syncEnergy(state, ENERGY_REFILL_MS * 50);
    spendEnergy(state, 5, ENERGY_REFILL_MS * 50);
    expect(state.current).toBe(ENERGY_CAP - 5);
    expect(msUntilNextEnergy(state, ENERGY_REFILL_MS * 50)).toBe(ENERGY_REFILL_MS);
  });

  it('reports time to full', () => {
    const state = createDefaultEnergy(0);
    state.current = ENERGY_CAP - 3;
    expect(msUntilEnergyFull(state, 0)).toBe(ENERGY_REFILL_MS * 3);
  });
});

describe('energy spending', () => {
  it('doubles paid refill prices and resets them after 24 hours', () => {
    const state = createDefaultEnergy(0);
    expect(energyRefillCost(state, 0)).toBe(20);
    recordEnergyRefillPurchase(state, 0);
    expect(energyRefillCost(state, 1)).toBe(40);
    recordEnergyRefillPurchase(state, 1);
    expect(energyRefillCost(state, 2)).toBe(80);
    expect(energyRefillCost(state, 24 * 60 * 60 * 1000)).toBe(20);
  });

  it('refuses a spend it cannot afford and changes nothing', () => {
    const state = createDefaultEnergy(0);
    state.current = 0;
    expect(spendEnergy(state, 1, 0)).toBe(false);
    expect(state.current).toBe(0);
  });

  it('allows purchases to exceed the natural cap, with refill paused above it', () => {
    const state = createDefaultEnergy(0);
    addEnergy(state, 50, 0);
    expect(state.current).toBe(ENERGY_CAP + 50);
    syncEnergy(state, ENERGY_REFILL_MS * 10);
    expect(state.current).toBe(ENERGY_CAP + 50);
  });
});

describe('energy vs the dispenser loop', () => {
  it('covers a full board of reservoirs so the reload loop is never smothered', () => {
    // The binding design constraint from docs/DISPENSER_ENERGY_RESEARCH.md:
    // a full-energy player must be able to spend every drop the board's
    // sources hold. If this fails, energy has become the wrong kind of gate.
    const boardReservoirs =
      capacityForTier('wood', 1) + capacityForTier('mineral', 1) + capacityForTier('glass', 1);
    expect(ENERGY_CAP).toBeGreaterThanOrEqual(boardReservoirs * ENERGY_COST_PER_COLLECT);
  });
});

describe('energy save handling', () => {
  it('defaults a missing or malformed save to a full bar', () => {
    expect(normalizeEnergy(undefined, 0).current).toBe(ENERGY_CAP);
    expect(normalizeEnergy({ current: 'x', lastTickAt: 0 }, 0).current).toBe(ENERGY_CAP);
  });

  it('credits offline time on load', () => {
    const saved = { current: 5, lastTickAt: 0 };
    expect(normalizeEnergy(saved, ENERGY_REFILL_MS * 10).current).toBe(15);
  });

  it('does not stall forever on a save written in the future', () => {
    const saved = { current: 5, lastTickAt: 10_000_000 };
    const state = normalizeEnergy(saved, 0);
    expect(state.lastTickAt).toBeLessThanOrEqual(0);
    expect(msUntilNextEnergy(state, 0)).toBe(ENERGY_REFILL_MS);
  });
});
