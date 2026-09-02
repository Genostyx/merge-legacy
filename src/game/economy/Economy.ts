import { ENERGY_CAP, ENERGY_REFILL_BASE_GEMS } from './Energy';
export interface EconomyState {
  coins: number;
  gems: number; // premium currency - intended to be sold via real-money IAP
}

export function createDefaultEconomy(): EconomyState {
  return { coins: 0, gems: 0 };
}

export function addCoins(state: EconomyState, amount: number): void {
  state.coins += amount;
}

export function canSpendCoins(state: EconomyState, amount: number): boolean {
  return state.coins >= amount;
}

export function spendCoinsGeneric(state: EconomyState, amount: number): boolean {
  if (!canSpendCoins(state, amount)) return false;
  state.coins -= amount;
  return true;
}

export function addGems(state: EconomyState, amount: number): void {
  state.gems += amount;
}

export function canSpendGems(state: EconomyState, amount: number): boolean {
  return state.gems >= amount;
}

export function spendGems(state: EconomyState, amount: number): boolean {
  if (!canSpendGems(state, amount)) return false;
  state.gems -= amount;
  return true;
}

/**
 * Real-money gem packs. This is the ONLY function that should ever credit
 * gems from a purchase - keep all "spend real money" paths funneled
 * through here so there's one place to wire up the real store integration.
 *
 * STUBBED: this currently just credits gems directly with no payment
 * taken, so the shop/economy loop is fully testable end-to-end without a
 * store account. To go live:
 *   1. Add a Capacitor IAP plugin (e.g. @capacitor-community/in-app-purchases)
 *      and register these pack IDs as products in App Store Connect /
 *      Google Play Console.
 *   2. Replace the body of this function with: call the plugin to launch
 *      the native purchase sheet, await the result, and - critically -
 *      verify the purchase receipt server-side before calling addGems.
 *      Never credit currency purely on a client-side "purchase succeeded"
 *      callback; that path is trivially spoofable.
 *   3. Keep GEM_PACKS as your source of truth for pack contents/pricing
 *      so the shop UI doesn't need to change.
 */
export interface GemPack {
  id: string;
  gems: number;
  priceLabel: string; // display-only placeholder until real store pricing is wired up
}

export const GEM_PACKS: GemPack[] = [
  { id: 'gems_small', gems: 100, priceLabel: '$0.99' },
  { id: 'gems_medium', gems: 550, priceLabel: '$4.99' },
  { id: 'gems_large', gems: 1200, priceLabel: '$9.99' }
];

export function purchaseGemPack(state: EconomyState, packId: string): boolean {
  const pack = GEM_PACKS.find((p) => p.id === packId);
  if (!pack) return false;
  // TODO(real IAP): this is the stub described above - replace with a
  // verified native purchase before shipping.
  addGems(state, pack.gems);
  return true;
}

/**
 * Coin packs bought with GEMS, not real money - the soft-currency rung of
 * the ladder (real money -> gems -> coins). Unlike GEM_PACKS this is a
 * real, final transaction, not a stub: it spends a currency the player
 * already holds, so there's no store integration to wire up later.
 *
 * Rates improve with size, mirroring how GEM_PACKS scale: 50, 60, then 70
 * coins per gem. Reference points for tuning - a coin offer costs 180-360
 * coins, a goal pays 15-150, and a coin reroll is 750 (see Shop.ts), so
 * the largest pack is worth roughly eight coin offers.
 *
 * Note this makes the coin row indirectly gem-purchasable, which is
 * intended: it's the standard hard-to-soft conversion, and the coin row
 * only holds cheap tier 2-4 items.
 */
export interface CoinPack {
  id: string;
  coins: number;
  gems: number;
}

/**
 * The soft-currency value of one gem, and of one energy.
 *
 * These are the ONE place the game decides what a premium unit is worth in
 * coins. Everything that converts between currencies must derive from them.
 *
 * Before this existed, three systems disagreed: `COIN_PACKS` sold coins at
 * 50-70 per gem, the crate sell calculation valued a gem at 30 and one energy
 * at 4, and `energyRefillCost` implied about 10-14 coins per energy. Selling a
 * crate therefore paid ~0.30 of a gem's worth but only ~0.20 of energy's, on
 * top of the sell penalty that was supposed to be the only haircut.
 *
 * `COINS_PER_GEM` is the middle coin pack's rate. `COINS_PER_ENERGY` is
 * derived, not chosen: a base refill buys a full bar, so one energy is worth
 * that fraction of a gem.
 */
export const COINS_PER_GEM = 60;
export const COINS_PER_ENERGY = Math.round(
  COINS_PER_GEM * (ENERGY_REFILL_BASE_GEMS / ENERGY_CAP)
);

export const COIN_PACKS: CoinPack[] = [
  { id: 'coins_small', coins: 250, gems: 5 },
  { id: 'coins_medium', coins: 900, gems: 15 },
  { id: 'coins_large', coins: 2800, gems: 40 }
];

/** Spends gems to credit coins. Returns false (changing nothing) if the player can't afford it. */
export function purchaseCoinPack(state: EconomyState, packId: string): boolean {
  const pack = COIN_PACKS.find((p) => p.id === packId);
  if (!pack) return false;
  if (!spendGems(state, pack.gems)) return false;
  addCoins(state, pack.coins);
  return true;
}

/**
 * Formats as m:ss, or h:mm:ss once there's at least an hour left. Dispenser
 * waits now reach several hours at higher tiers (see Dispensers.ts), and
 * the shop's own 4-hour refresh timer already needed this - both used to
 * render as e.g. "261:23" with no hours component.
 */
export function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
