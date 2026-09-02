import { describe, expect, it } from 'vitest';
import {
  SHOP_REFRESH_INTERVAL_MS,
  SHOP_SLOTS,
  SPECIAL_REROLL_BASE_GEMS,
  SPLITTER_PRICE_GEMS,
  createDefaultShopState,
  generateRowOffers,
  generateSpecialOffers,
  markOfferSold,
  msUntilShopRefresh,
  normalizeShopState,
  refreshIfDue,
  rerollShopRow,
  specialRerollCost
} from './Shop';

describe('shop offers', () => {
  it('does not show the same family and tier twice in a row', () => {
    for (let run = 0; run < 100; run++) {
      for (const key of ['coin', 'gem'] as const) {
        const offers = generateRowOffers(key, ['wood', 'mineral']);
        const keys = offers.map((offer) => `${offer.typeId}:${offer.tier}`);
        expect(offers).toHaveLength(SHOP_SLOTS);
        expect(new Set(keys).size).toBe(SHOP_SLOTS);
      }
    }
  });

  it('prices every offer in only its own row currency', () => {
    for (let run = 0; run < 50; run++) {
      for (const offer of generateRowOffers('coin', ['wood', 'mineral', 'glass'])) {
        expect(offer.priceCoins).toBeGreaterThan(0);
        expect(offer.priceGems).toBeNull();
      }
      for (const offer of generateRowOffers('gem', ['wood', 'mineral', 'glass'])) {
        expect(offer.priceGems).toBeGreaterThan(0);
        expect(offer.priceCoins).toBeNull();
      }
    }
  });

  it('still fills every slot when only one family is unlocked', () => {
    const offers = generateRowOffers('coin', ['wood']);
    expect(offers).toHaveLength(SHOP_SLOTS);
    expect(offers.every((offer) => offer.typeId === 'wood')).toBe(true);
  });

  it('never offers an item tier the player has not discovered', () => {
    const unlocked = ['wood:2', 'mineral:3'];
    const coin = generateRowOffers('coin', ['wood', 'mineral'], unlocked);
    const gem = generateRowOffers('gem', ['wood', 'mineral'], unlocked);
    expect(coin.map((offer) => `${offer.typeId}:${offer.tier}`))
      .toEqual(expect.arrayContaining(unlocked));
    expect(coin.every((offer) => unlocked.includes(`${offer.typeId}:${offer.tier}`))).toBe(true);
    expect(gem).toEqual([]);
  });

  it('builds three distinct weighted Special Items offers with premium prices', () => {
    const offers = generateSpecialOffers(['wood'], () => 0.999);
    expect(offers).toHaveLength(SHOP_SLOTS);
    expect(new Set(offers.map((offer) => `${offer.kind}:${offer.typeId}:${offer.tier}`)).size).toBe(SHOP_SLOTS);
    expect(offers.every((offer) => offer.priceGems != null && offer.priceCoins == null)).toBe(true);
    const splitter = generateSpecialOffers(['wood'], () => 0)[0];
    expect(splitter.kind).toBe('splitter');
    expect(splitter.priceGems).toBe(SPLITTER_PRICE_GEMS);
  });
});

describe('per-row reroll', () => {
  it('doubles the Special Items reroll price and resets it on scheduled refresh', () => {
    const state = createDefaultShopState(['wood'], 0);
    expect(specialRerollCost(state)).toBe(SPECIAL_REROLL_BASE_GEMS);
    rerollShopRow(state, 'special', ['wood'], 1_000);
    expect(specialRerollCost(state)).toBe(32);
    rerollShopRow(state, 'special', ['wood'], 2_000);
    expect(specialRerollCost(state)).toBe(64);
    refreshIfDue(state, SHOP_REFRESH_INTERVAL_MS + 2_000, ['wood'], undefined, ['wood']);
    expect(specialRerollCost(state)).toBe(SPECIAL_REROLL_BASE_GEMS);
  });
  it('leaves the other row untouched', () => {
    const state = createDefaultShopState(['wood', 'mineral', 'glass'], 1_000);
    const gemBefore = JSON.stringify(state.gem);
    rerollShopRow(state, 'coin', ['wood', 'mineral', 'glass'], 2_000);
    expect(JSON.stringify(state.gem)).toBe(gemBefore);
    expect(state.coin.lastRefreshAt).toBe(2_000);
    expect(state.gem.lastRefreshAt).toBe(1_000);
  });

  it('clears a sold flag only in the rerolled row', () => {
    const state = createDefaultShopState(['wood', 'mineral'], 1_000);
    markOfferSold(state, 'coin', 0);
    markOfferSold(state, 'gem', 0);
    rerollShopRow(state, 'coin', ['wood', 'mineral'], 2_000);
    expect(state.coin.offers[0].sold).toBe(false);
    expect(state.gem.offers[0].sold).toBe(true);
  });

  it('runs each row refresh clock independently', () => {
    const state = createDefaultShopState(['wood', 'mineral'], 0);
    rerollShopRow(state, 'gem', ['wood', 'mineral'], SHOP_REFRESH_INTERVAL_MS);
    // Coin row is now due, gem row has a full interval left.
    refreshIfDue(state, SHOP_REFRESH_INTERVAL_MS, ['wood', 'mineral']);
    expect(state.coin.lastRefreshAt).toBe(SHOP_REFRESH_INTERVAL_MS);
    expect(msUntilShopRefresh(state, 'gem', SHOP_REFRESH_INTERVAL_MS)).toBe(SHOP_REFRESH_INTERVAL_MS);
  });
});

describe('save migration', () => {
  it('regenerates both rows from a pre-two-row save shape', () => {
    const legacy = {
      offers: [{ typeId: 'wood', tier: 2, priceCoins: 180, priceGems: null, sold: false }],
      lastRefreshAt: 5_000
    };
    const state = normalizeShopState(legacy, ['wood', 'mineral'], 9_000);
    expect(state.coin.offers).toHaveLength(SHOP_SLOTS);
    expect(state.gem.offers).toHaveLength(SHOP_SLOTS);
    expect(state.coin.lastRefreshAt).toBe(9_000);
  });

  it('replaces a row holding a family that is no longer unlocked', () => {
    const state = createDefaultShopState(['wood', 'mineral', 'glass'], 1_000);
    state.coin.offers[0].typeId = 'glass';
    const narrowed = normalizeShopState(state, ['wood'], 2_000);
    expect(narrowed.coin.offers.every((offer) => offer.typeId === 'wood')).toBe(true);
  });

  it('rejects a row whose offers are priced in the wrong currency', () => {
    const state = createDefaultShopState(['wood'], 1_000);
    // A mixed-currency row is exactly what a legacy save deserializes into.
    state.coin.offers[0] = { typeId: 'wood', tier: 5, priceCoins: null, priceGems: 15, sold: false };
    const fixed = normalizeShopState(state, ['wood'], 2_000);
    expect(fixed.coin.offers.every((offer) => offer.priceCoins != null)).toBe(true);
  });

  it('keeps a valid state untouched', () => {
    const state = createDefaultShopState(['wood', 'mineral'], 1_000);
    const before = JSON.stringify(state);
    expect(JSON.stringify(normalizeShopState(state, ['wood', 'mineral'], 2_000))).toBe(before);
  });
});
