import { describe, expect, it } from 'vitest';
import {
  RECLAIMER_METER_MAX,
  RECLAIMER_PRIZES,
  acceptsItem,
  createDefaultReclaimerState,
  feedReclaimer,
  normalizeReclaimerState,
  rollReclaimerPrize
} from './Reclaimer';

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
    const state = createDefaultReclaimerState();
    for (let i = 1; i < RECLAIMER_METER_MAX; i++) expect(feedReclaimer(state)).toBe(false);
    expect(feedReclaimer(state)).toBe(true);
    expect(state.meter).toBe(RECLAIMER_METER_MAX);
  });

  it('never pays nothing - the floor is what makes the variance fair', () => {
    for (const rng of [() => 0, () => 0.5, () => 0.999]) {
      const state = createDefaultReclaimerState();
      const prize = rollReclaimerPrize(state, rng);
      expect(prize.kind === 'shipping' || prize.kind === 'crate').toBe(true);
      expect(state.meter).toBe(0);
    }
  });

  it('prices the jackpot at about twice what orders charge', () => {
    // Orders give one shipping container per 8 completed, ~25 energy each -
    // call it 200 energy. Ten max-tier items is ~130. The weight is chosen so
    // this route costs roughly double, and this pins that ratio rather than
    // the number, so retuning the meter has to keep it honest.
    const total = RECLAIMER_PRIZES.reduce((sum, row) => sum + row.weight, 0);
    const shipping = RECLAIMER_PRIZES.find((row) => row.prize.kind === 'shipping')!;
    const energyPerContainer = (RECLAIMER_METER_MAX * 13) / (shipping.weight / total);
    expect(energyPerContainer).toBeGreaterThan(300);
    expect(energyPerContainer).toBeLessThan(550);
  });

  it('clamps a junk save', () => {
    expect(normalizeReclaimerState({ meter: 99 }).meter).toBe(RECLAIMER_METER_MAX);
    expect(normalizeReclaimerState({ meter: -4 }).meter).toBe(0);
    expect(normalizeReclaimerState(undefined).meter).toBe(0);
  });
});
