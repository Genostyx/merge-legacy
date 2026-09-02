import { typicalOrderReward } from '../levels/Orders';
import type { CrateTier } from '../rewards/Rewards';

/**
 * Crates the player can buy with Credits.
 *
 * These exist to be a RECURRING Credit sink. The one-time sinks are large but
 * finite - expansion row one is 127,000, row two is 1,270,000 - and row two is
 * gated at level 50, so between finishing row one and reaching that level
 * Credits pile up against nothing. Supply crates fill that window.
 *
 * The hard part is that crates contain spawner pieces, and pieces are the
 * bottleneck on building high-tier sources. Priced wrong, this feature turns
 * "save Credits" into a paid shortcut around the source ladder: at the
 * measured baseline of ~20.4 piece-units per family per day a tier-5 source
 * takes ~12.5 days, and a player who could buy ten gold crates a day would cut
 * that to about four.
 *
 * Price alone cannot hold that line, because Credits are abundant by mid-game.
 * Three limiters do, together:
 *
 *  1. `SUPPLY_CRATE_LIMIT` - at most three bought crates unopened at once.
 *     This is the one that actually bounds the piece rate.
 *  2. The opening delay - a bought crate is not merge material for hours.
 *  3. Board space - each one holds a cell until it is emptied.
 *
 * At the cap, three gold crates a day adds ~10 piece-units per family per day
 * against the 20.4 baseline, moving tier five from ~12.5 days to ~8.4. That is
 * a real reward for spending without collapsing the ladder.
 */
export interface SupplyCrateOffer {
  tier: CrateTier;
  /**
   * Price expressed in TYPICAL ORDERS' WORTH of income rather than in a fixed
   * number of Credits.
   *
   * A flat price cannot be fair across the game, because order income scales
   * about 63x: a flat 1,500 is 45 orders at level 5, one order at level 15,
   * and pocket change at level 30. Worse, crate CONTENTS already scale with
   * level - `rollCrate` draws item tiers from `maxOrderTier` - so a flat price
   * means the same Credits buy strictly more the longer you play, which is
   * backwards for something meant to absorb late-game surplus.
   *
   * Pricing in orders holds the real cost constant instead, and it follows the
   * reward curve automatically if that curve is ever retuned. It also matches
   * what the rest of the shop already does: `priceForCoinTier` scales with the
   * item's tier rather than sitting still.
   */
  ordersWorth: number;
  /**
   * Floor for the very early game, where a typical order pays 34 Credits and
   * pure scaling would price a crate at pocket change. Below
   * `SUPPLY_CRATE_MIN_LEVEL` the store is not shown at all; these only catch
   * the seam just above it.
   */
  minPriceCoins: number;
  /** Wait between buying and the first tap, in ms. */
  delayMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Multipliers chosen to land on the prices that were already validated at
 * mid-to-late game - at level 30 these give roughly 2,000 / 5,000 / 10,000
 * against the old flat 1,500 / 4,000 / 9,000 - while staying affordable
 * earlier, where the flat numbers were out of reach.
 */
export const SUPPLY_CRATES: SupplyCrateOffer[] = [
  { tier: 'bronze', ordersWorth: 1, minPriceCoins: 250, delayMs: 30 * MINUTE },
  { tier: 'silver', ordersWorth: 2.5, minPriceCoins: 600, delayMs: 2 * HOUR },
  { tier: 'gold', ordersWorth: 5, minPriceCoins: 1_200, delayMs: 6 * HOUR }
];

/**
 * Below this the store is hidden. Supply crates answer "what do I do with
 * surplus Credits", and a player who has no surplus is not being helped by
 * being shown a shelf they cannot use.
 */
export const SUPPLY_CRATE_MIN_LEVEL = 8;

/** Rounded to the nearest 50 so prices stay legible as they scale. */
export function supplyCratePrice(offer: SupplyCrateOffer, level: number): number {
  const scaled = offer.ordersWorth * typicalOrderReward(level);
  return Math.max(offer.minPriceCoins, Math.round(scaled / 50) * 50);
}

/**
 * How many bought crates may be unopened at once, counting both the board and
 * the inventory.
 *
 * This is the real balance lever - price is not. Without it the opening delay
 * caps nothing: a player would buy ten at once and open them all when the same
 * timer expired, paying one wait rather than ten.
 */
export const SUPPLY_CRATE_LIMIT = 3;

export function supplyCrateFor(tier: string): SupplyCrateOffer | undefined {
  return SUPPLY_CRATES.find((offer) => offer.tier === tier);
}

/**
 * Whether a bought crate can be opened yet.
 *
 * Earned crates have no `readyAt` and are always open - the delay is a
 * property of BUYING one, not of crates in general, so a milestone or order
 * reward is never made to wait.
 */
export function crateReady(readyAt: number | undefined, now: number): boolean {
  return readyAt == null || now >= readyAt;
}

export function crateRemainingMs(readyAt: number | undefined, now: number): number {
  if (readyAt == null) return 0;
  return Math.max(0, readyAt - now);
}

/** `6:04:11` while hours remain, `4:11` under an hour. */
export function formatCrateWait(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
