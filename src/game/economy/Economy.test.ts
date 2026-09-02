import { describe, expect, it } from 'vitest';
import { COIN_PACKS, createDefaultEconomy, purchaseCoinPack } from './Economy';

describe('coin packs (gems -> coins)', () => {
  it('spends the gem price and credits the coins', () => {
    const state = createDefaultEconomy();
    state.gems = 50;
    const pack = COIN_PACKS[1]; // 15 GM -> 900 CR
    expect(purchaseCoinPack(state, pack.id)).toBe(true);
    expect(state.gems).toBe(50 - pack.gems);
    expect(state.coins).toBe(pack.coins);
  });

  it('changes nothing when the player cannot afford it', () => {
    const state = createDefaultEconomy();
    state.gems = 1;
    expect(purchaseCoinPack(state, 'coins_large')).toBe(false);
    expect(state.gems).toBe(1);
    expect(state.coins).toBe(0);
  });

  it('rejects an unknown pack id without touching the wallet', () => {
    const state = createDefaultEconomy();
    state.gems = 500;
    expect(purchaseCoinPack(state, 'coins_enormous')).toBe(false);
    expect(state.gems).toBe(500);
    expect(state.coins).toBe(0);
  });

  it('gives strictly better coins-per-gem as the pack gets bigger', () => {
    const rates = COIN_PACKS.map((pack) => pack.coins / pack.gems);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });
});
