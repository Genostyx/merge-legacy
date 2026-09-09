import { describe, expect, it } from 'vitest';
import {
  CRUCIBLE_METER_MAX,
  CRUCIBLE_PRIZES,
  acceptsItem,
  createDefaultCrucibleState,
  feedCrucible,
  normalizeCrucibleState,
  rollCruciblePrize
} from './Crucible';

describe('the max-tier consumer', () => {
  it('takes only the top of an energy family\'s chain', () => {
    expect(acceptsItem('wood', 9)).toBe(true);
    expect(acceptsItem('mineral', 9)).toBe(true);
    expect(acceptsItem('glass', 9)).toBe(true);
    // Below the top still has a merge path, so it stays out.
    expect(acceptsItem('wood', 8)).toBe(false);
  });

  it('refuses Water and the Decagon', () => {
    // Water's source costs no Energy, so feeding it would be free. The
    // Decagon's chain is ONE tier long, which would make every Decagon item
    // simultaneously max tier and by far the cheapest possible feed.
    expect(acceptsItem('water', 12)).toBe(false);
    expect(acceptsItem('decagon', 1)).toBe(false);
    expect(acceptsItem('currency-credit', 6)).toBe(false);
  });

  it('reports the fill exactly once and never overruns', () => {
    const state = createDefaultCrucibleState();
    for (let i = 1; i < CRUCIBLE_METER_MAX; i++) expect(feedCrucible(state)).toBe(false);
    expect(feedCrucible(state)).toBe(true);
    expect(state.meter).toBe(CRUCIBLE_METER_MAX);
  });

  it('never pays nothing - the floor is what makes the variance fair', () => {
    for (const rng of [() => 0, () => 0.5, () => 0.999]) {
      const state = createDefaultCrucibleState();
      const prize = rollCruciblePrize(state, rng);
      expect(prize.kind === 'shipping' || prize.kind === 'crate').toBe(true);
      expect(state.meter).toBe(0);
    }
  });

  it('prices the jackpot at about twice what orders charge', () => {
    // Orders give one shipping container per 8 completed, ~25 energy each -
    // call it 200 energy. Ten max-tier items is ~130. The weight is chosen so
    // this route costs roughly double, and this pins that ratio rather than
    // the number, so retuning the meter has to keep it honest.
    const total = CRUCIBLE_PRIZES.reduce((sum, row) => sum + row.weight, 0);
    const shipping = CRUCIBLE_PRIZES.find((row) => row.prize.kind === 'shipping')!;
    const energyPerContainer = (CRUCIBLE_METER_MAX * 13) / (shipping.weight / total);
    expect(energyPerContainer).toBeGreaterThan(300);
    expect(energyPerContainer).toBeLessThan(550);
  });

  it('clamps a junk save', () => {
    expect(normalizeCrucibleState({ meter: 99 }).meter).toBe(CRUCIBLE_METER_MAX);
    expect(normalizeCrucibleState({ meter: -4 }).meter).toBe(0);
    expect(normalizeCrucibleState(undefined).meter).toBe(0);
  });
});
