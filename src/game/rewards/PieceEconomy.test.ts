import { describe, expect, it } from 'vitest';
import {
  PIECE_UNITS_PER_SOURCE,
  cratePieceUnits,
  daysToSourceTier,
  estimatePieceRate,
  pieceUnitsForSourceTier,
  shippingContainerPieceUnits,
  specialShopPieceUnitsPerRefresh
} from './PieceEconomy';

/** A player mid-game: three families owned, two real sessions a day. */
const TYPICAL = {
  ownedFamilies: ['wood', 'water', 'mineral'],
  energyPerDay: 250,
  meterCollects: 100,
  ordersPerContainer: 8,
  energyPerOrder: 40,
  shopRefreshesPerDay: 6,
  buysFromShop: true
};

describe('piece ladder cost', () => {
  it('stacks two merge ladders multiplicatively', () => {
    // Pieces merge 1->2->3->4 and two tier-4 pieces build a source, so a
    // source is 2^4 pieces. Sources then merge on the same ladder, so tier 5
    // is 2^4 sources. This 256 is the number that governs how long the top
    // source takes, and it is easy to change one ladder without noticing.
    expect(PIECE_UNITS_PER_SOURCE).toBe(16);
    expect(pieceUnitsForSourceTier(1)).toBe(16);
    expect(pieceUnitsForSourceTier(5)).toBe(256);
  });
});

describe('per-faucet yields', () => {
  it('pays more pieces from better crates', () => {
    expect(cratePieceUnits('bronze')).toBeLessThan(cratePieceUnits('silver'));
    expect(cratePieceUnits('silver')).toBeLessThan(cratePieceUnits('gold'));
  });

  it('makes the vault the best crate for pieces', () => {
    // This test previously pinned vault at ZERO - it had no CHEST_SLOT_COUNTS
    // entry, so it never took the chest path and was the only milestone crate
    // that could not contain a piece, landing at levels 20 and 40 exactly
    // when sources are being built. Migrating it is what changed this
    // assertion, which is the guard doing its job.
    expect(cratePieceUnits('vault')).toBeGreaterThan(cratePieceUnits('gold'));
    // Better, but not a different game: roughly 1.6x gold.
    const ratio = cratePieceUnits('vault') / cratePieceUnits('gold');
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(2);
  });

  it('values a shipping container at seven pieces, mostly tier one', () => {
    expect(shippingContainerPieceUnits()).toBeCloseTo(8.4, 5);
  });

  it('dilutes the special shop as more families unlock', () => {
    expect(specialShopPieceUnitsPerRefresh(1)).toBeGreaterThan(specialShopPieceUnitsPerRefresh(3));
  });
});

describe('time to a source tier', () => {
  it('reaches a tier-5 source inside a month of typical play', () => {
    // The guard rail this module exists for. If a faucet is retuned and this
    // fails, the top source has quietly become unreachable - which is the
    // state the game was actually in when this was first measured.
    const days = daysToSourceTier(5, estimatePieceRate(TYPICAL));
    expect(days).toBeGreaterThan(3);
    expect(days).toBeLessThan(30);
  });

  it('gets slower as more families share the drops', () => {
    const narrow = estimatePieceRate({ ...TYPICAL, ownedFamilies: ['wood'] });
    const wide = estimatePieceRate({ ...TYPICAL, ownedFamilies: ['wood', 'water', 'mineral', 'glass'] });
    expect(wide.eligibleFamilies).toBeGreaterThan(narrow.eligibleFamilies);
    expect(daysToSourceTier(5, wide)).toBeGreaterThan(daysToSourceTier(5, narrow));
  });

  it('is dominated by the shop and the meter, not by shipping containers', () => {
    // Worth pinning because the intuition runs the other way: shipping
    // containers are the faucet that exists FOR pieces, but they are the
    // smallest of the three.
    const { byFaucet } = estimatePieceRate(TYPICAL);
    expect(byFaucet.specialShop).toBeGreaterThan(byFaucet.shipping);
    expect(byFaucet.meter).toBeGreaterThan(byFaucet.shipping);
  });
});
