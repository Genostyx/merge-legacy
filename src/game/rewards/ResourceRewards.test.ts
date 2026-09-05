import { describe, expect, it } from 'vitest';
import { currencyPayout, splitCurrencyIntoItems } from './ResourceRewards';
describe('splitting a currency reward into board items', () => {
  it('adds up to the amount, and never runs longer than the cap', () => {
    // The cap is a board-space guarantee: 60 Energy as tier-1 sparks would be
    // sixty tiles for a reward that is meant to be a prize.
    for (const amount of [2, 5, 40, 50, 60]) {
      const tiers = splitCurrencyIntoItems('currency-energy', amount, 6, () => 0.5);
      expect(tiers.length).toBeLessThanOrEqual(6);
      const paid = tiers.reduce((sum, tier) => sum + currencyPayout('currency-energy', tier), 0);
      expect(paid, `amount ${amount}`).toBeLessThanOrEqual(amount);
      expect(paid, `amount ${amount}`).toBeGreaterThan(0);
    }
  });

  it('pays a small Gem reward exactly', () => {
    const tiers = splitCurrencyIntoItems('currency-gem', 4, 6, () => 0);
    const paid = tiers.reduce((sum, tier) => sum + currencyPayout('currency-gem', tier), 0);
    expect(paid).toBe(4);
  });

  it('returns nothing for a chain it does not know, or for zero', () => {
    expect(splitCurrencyIntoItems('wood', 50)).toEqual([]);
    expect(splitCurrencyIntoItems('currency-gem', 0)).toEqual([]);
  });
});
