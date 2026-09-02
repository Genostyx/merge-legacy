import { describe, expect, it } from 'vitest';
import {
  SUPPLY_CRATES,
  SUPPLY_CRATE_LIMIT,
  SUPPLY_CRATE_MIN_LEVEL,
  supplyCratePrice,
  crateReady,
  crateRemainingMs,
  formatCrateWait,
  supplyCrateFor
} from './SupplyCrates';
import { cratePieceUnits } from '../rewards/PieceEconomy';
import { typicalOrderReward } from '../levels/Orders';

describe('supply crate pricing', () => {
  it('charges more for a better crate, and waits longer for it', () => {
    for (let i = 1; i < SUPPLY_CRATES.length; i++) {
      expect(supplyCratePrice(SUPPLY_CRATES[i], 30))
        .toBeGreaterThan(supplyCratePrice(SUPPLY_CRATES[i - 1], 30));
      expect(SUPPLY_CRATES[i].delayMs).toBeGreaterThan(SUPPLY_CRATES[i - 1].delayMs);
    }
  });

  it('holds the real cost steady as income scales', () => {
    // The point of pricing in orders. A flat price was 45 orders' income at
    // level 5 and under one order at level 30; the whole feature was only
    // correctly priced in a narrow band around level 15.
    for (const offer of SUPPLY_CRATES) {
      for (const level of [SUPPLY_CRATE_MIN_LEVEL, 12, 20, 30, 50]) {
        const orders = supplyCratePrice(offer, level) / typicalOrderReward(level);
        expect(orders).toBeLessThan(offer.ordersWorth * 3);
      }
      // ...and it must actually RISE with level, or late players get it free.
      expect(supplyCratePrice(offer, 30)).toBeGreaterThan(supplyCratePrice(offer, 12));
    }
  });

  it('never sells the vault', () => {
    // The vault is a twice-in-a-game milestone. Putting it on a shelf would
    // make the two moments it is awarded meaningless.
    expect(supplyCrateFor('vault')).toBeUndefined();
  });

  it('prices every crate well above the Credit value of its contents', () => {
    // Measured contents value at level 20: bronze ~291, silver ~430,
    // gold ~677. Buying must be a WORSE deal than playing, or Credits become
    // a conversion rate into merge items rather than a sink.
    const contentsValue: Record<string, number> = { bronze: 291, silver: 430, gold: 677 };
    for (const offer of SUPPLY_CRATES) {
      expect(supplyCratePrice(offer, 20)).toBeGreaterThan(contentsValue[offer.tier] * 3);
    }
  });

  it('caps the piece rate that Credits can buy', () => {
    // The guard that matters. Baseline is ~20.4 piece-units per family per
    // day and a tier-5 source costs 256, so ~12.5 days. Pieces roll across
    // four eligible families, so a crate contributes a quarter of its units
    // to the family being built.
    const BASELINE_PER_FAMILY_PER_DAY = 20.4;
    const ELIGIBLE_FAMILIES = 4;
    const best = cratePieceUnits('gold');
    const boughtPerDay = (best * SUPPLY_CRATE_LIMIT) / ELIGIBLE_FAMILIES;
    // Spending should help meaningfully...
    expect(boughtPerDay).toBeGreaterThan(BASELINE_PER_FAMILY_PER_DAY * 0.2);
    // ...without being able to more than double a free player's rate. If the
    // limit or the piece odds are ever raised, this is the line that breaks.
    expect(boughtPerDay).toBeLessThan(BASELINE_PER_FAMILY_PER_DAY);
  });
});

describe('crate opening delay', () => {
  it('leaves earned crates openable immediately', () => {
    // Earned crates carry no `readyAt`: the wait is a property of buying.
    expect(crateReady(undefined, 0)).toBe(true);
    expect(crateRemainingMs(undefined, 0)).toBe(0);
  });

  it('holds a bought crate shut until its absolute timestamp', () => {
    const readyAt = 10_000;
    expect(crateReady(readyAt, 9_999)).toBe(false);
    expect(crateReady(readyAt, 10_000)).toBe(true);
    // Absolute, not a countdown: the wait keeps running while the game is
    // closed rather than restarting on load.
    expect(crateRemainingMs(readyAt, 4_000)).toBe(6_000);
  });

  it('formats the wait with hours only when there are hours', () => {
    expect(formatCrateWait(6 * 3_600_000)).toBe('6:00:00');
    expect(formatCrateWait(125_000)).toBe('2:05');
    expect(formatCrateWait(0)).toBe('0:00');
  });
});
