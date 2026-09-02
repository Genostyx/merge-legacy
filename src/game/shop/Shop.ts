import { CHAINS, isCurrencyChain } from '../data/chains';
import { FAMILY_RECHARGE_ORDER } from '../dispensers/Dispensers';

export interface ShopOffer {
  kind?: 'item' | 'spawner-piece' | 'splitter';
  typeId: string;
  tier: number;
  priceCoins: number | null; // null means "not purchasable with coins"
  priceGems: number | null;  // null means "not purchasable with gems"
  sold: boolean;
}

/**
 * One row of the shop. Each row is self-contained - its own offers, its own
 * refresh clock, and its own reroll currency - so rerolling the coin row
 * never touches the gem row's contents or timer.
 */
export interface ShopRow {
  offers: ShopOffer[];
  lastRefreshAt: number; // epoch ms
  /** Paid rerolls since the last scheduled refresh. */
  rerollCount: number;
}

/**
 * The shop is two fixed rows rather than one mixed row.
 *
 * It used to be three slots whose currency was rolled per slot (~65% coin,
 * ~35% gem), which meant a player could open the shop and see no coin offer
 * at all, or no gem offer at all - the contents were inconsistent session to
 * session. Splitting into a guaranteed coin row and a guaranteed gem row
 * makes both purchase paths always visible.
 */
export interface ShopState {
  coin: ShopRow;
  gem: ShopRow;
  special: ShopRow;
}

export type ShopRowKey = 'coin' | 'gem' | 'special';
export const SHOP_ROW_KEYS: ShopRowKey[] = ['coin', 'gem', 'special'];

export const SHOP_SLOTS = 3;
export const SHOP_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Gem reroll price - refreshes the gem row only. */
export const REROLL_COST_GEMS = 5;
export const SPECIAL_REROLL_BASE_GEMS = 16;
export const SPLITTER_PRICE_GEMS = 60;

export function specialRerollCost(state: ShopState): number {
  return SPECIAL_REROLL_BASE_GEMS * (2 ** state.special.rerollCount);
}

/**
 * Coin reroll price - refreshes the coin row only. Deliberately steep.
 *
 * `priceForCoinTier` is `180 x familyLadderIndex+1 x 2^(tier-2)`, so an offer
 * runs from 180 (wood, tier 2) to 2160 (glass, tier 4). 750 is several goals'
 * worth against the cheap end, which is the end that matters - a player
 * rerolling to chase a top offer is spending less than the offer costs, but a
 * reroll hands them nothing, so there is no loop to exploit. Coins otherwise
 * have few sinks, so this is one of the few places they drain at all.
 */
export const REROLL_COST_COINS = 750;

export function coinRerollCost(state: ShopState, now: number = Date.now()): number {
  const count = state.coin.rerollCount ?? 0;
  if (count === 0) {
    const remainingRatio = msUntilShopRefresh(state, 'coin', now) / SHOP_REFRESH_INTERVAL_MS;
    return Math.max(1, Math.ceil(REROLL_COST_COINS * remainingRatio));
  }
  if (count === 1) return REROLL_COST_COINS * 2;
  return Math.round(REROLL_COST_COINS * 5 * (2 ** (count - 2)));
}

// Mid tiers are the "convenience" purchase (coins - earned currency).
// High tiers are the "shortcut" purchase (gems - the monetized currency).
// This is the actual monetization lever: coins are freely earned from
// play, gems are scarce/premium, so anything worth skipping the grind for
// should be gem-priced.
const COIN_TIER_POOL = [2, 3, 4];
const GEM_TIER_PRICING: Record<number, number> = {
  5: 15,
  6: 35,
  7: 80
};

/**
 * Where a family sits on the difficulty ladder, for pricing.
 *
 * A family missing from `FAMILY_RECHARGE_ORDER` used to fall through to
 * `length + 1` - the MOST expensive multiplier in the game. That made
 * forgetting to register a new family a silent, invisible price rise rather
 * than an obvious break. It now falls back to the family's position in the
 * canonical chain registry, and only to 1 if it is in neither.
 */
function familyLadderIndex(typeId: string): number {
  const rechargeIndex = FAMILY_RECHARGE_ORDER.indexOf(typeId);
  if (rechargeIndex >= 0) return rechargeIndex;
  const chainIndex = CHAINS.filter((chain) => !isCurrencyChain(chain.typeId))
    .findIndex((chain) => chain.typeId === typeId);
  return chainIndex >= 0 ? chainIndex : 0;
}

function priceForCoinTier(typeId: string, tier: number): number {
  const tierMultiplier = 2 ** Math.max(0, tier - 2);
  return 180 * (familyLadderIndex(typeId) + 1) * tierMultiplier;
}

function validTypeIds(typeIds: string[]): string[] {
  const registered = new Set(CHAINS.map((c) => c.typeId));
  const valid = typeIds.filter((id) => registered.has(id));
  return valid.length > 0 ? valid : ['wood'];
}

function makeOffer(row: ShopRowKey, typeId: string, tier: number): ShopOffer {
  return row === 'gem'
    ? { typeId, tier, priceCoins: null, priceGems: GEM_TIER_PRICING[tier], sold: false }
    : { typeId, tier, priceCoins: priceForCoinTier(typeId, tier), priceGems: null, sold: false };
}

const PIECE_PRICE_GEMS = [0, 4, 10, 22, 45];

export function generateSpecialOffers(typeIds: string[] = ['wood'], rng: () => number = Math.random): ShopOffer[] {
  const registered = new Set(CHAINS.map((chain) => chain.typeId));
  const families = typeIds.filter((typeId) => registered.has(typeId));
  const candidates: Array<{ offer: ShopOffer; weight: number }> = [
    { offer: { kind: 'splitter', typeId: 'splitter', tier: 1, priceCoins: null, priceGems: SPLITTER_PRICE_GEMS, sold: false }, weight: 2 }
  ];
  for (const typeId of families.length > 0 ? families : ['wood']) {
    [12, 6, 3, 1].forEach((weight, index) => candidates.push({
      offer: { kind: 'spawner-piece', typeId, tier: index + 1, priceCoins: null, priceGems: PIECE_PRICE_GEMS[index + 1], sold: false },
      weight
    }));
  }
  const offers: ShopOffer[] = [];
  while (offers.length < SHOP_SLOTS && candidates.length > 0) {
    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = rng() * total;
    let index = 0;
    for (; index < candidates.length - 1; index++) {
      roll -= candidates[index].weight;
      if (roll < 0) break;
    }
    offers.push(candidates[index].offer);
    candidates.splice(index, 1);
  }
  return offers;
}

function tierPoolFor(row: ShopRowKey): number[] {
  return row === 'gem' ? Object.keys(GEM_TIER_PRICING).map(Number) : COIN_TIER_POOL;
}

function isUnlocked(typeId: string, tier: number, unlockedItems?: readonly string[]): boolean {
  return unlockedItems == null || unlockedItems.includes(`${typeId}:${tier}`);
}

/**
 * Fills one row with distinct family+tier combinations. Draws from the
 * full candidate set by shuffling rather than rejection-sampling, so a
 * narrow pool (one unlocked family, three tiers) still fills every slot
 * instead of retrying into a duplicate.
 */
export function generateRowOffers(row: ShopRowKey, typeIds: string[] = ['wood'], unlockedItems?: readonly string[]): ShopOffer[] {
  const candidates: { typeId: string; tier: number }[] = [];
  for (const typeId of validTypeIds(typeIds)) {
    for (const tier of tierPoolFor(row)) {
      if (isUnlocked(typeId, tier, unlockedItems)) candidates.push({ typeId, tier });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const offers: ShopOffer[] = [];
  for (const candidate of candidates.slice(0, SHOP_SLOTS)) {
    offers.push(makeOffer(row, candidate.typeId, candidate.tier));
  }
  // Only reachable if the candidate pool is smaller than SHOP_SLOTS, which
  // needs both a single unlocked family and a shrunken tier pool.
  while (offers.length < SHOP_SLOTS && candidates.length > 0) {
    const fill = candidates[offers.length % candidates.length];
    offers.push(makeOffer(row, fill.typeId, fill.tier));
  }
  return offers;
}

function makeRow(row: ShopRowKey, typeIds: string[], now: number, unlockedItems?: readonly string[]): ShopRow {
  if (row === 'special') return { offers: generateSpecialOffers(typeIds), lastRefreshAt: now, rerollCount: 0 };
  return { offers: generateRowOffers(row, typeIds, unlockedItems), lastRefreshAt: now, rerollCount: 0 };
}

export function createDefaultShopState(typeIds: string[] = ['wood'], now: number = Date.now()): ShopState {
  return {
    coin: makeRow('coin', typeIds, now),
    gem: makeRow('gem', typeIds, now),
    special: makeRow('special', typeIds, now)
  };
}

function isValidRow(row: unknown, key: ShopRowKey, allowed: Set<string>, unlockedItems?: readonly string[]): row is ShopRow {
  const candidate = row as ShopRow | undefined;
  if (!candidate || !Array.isArray(candidate.offers)) return false;
  if (candidate.offers.length > SHOP_SLOTS) return false;
  if (!Number.isFinite(candidate.lastRefreshAt)) return false;
  if (candidate.rerollCount != null && (!Number.isInteger(candidate.rerollCount) || candidate.rerollCount < 0)) return false;
  return candidate.offers.every((offer) => {
    if (!offer) return false;
    if (key === 'special') {
      return offer.priceGems != null && (
        (offer.kind === 'splitter' && offer.typeId === 'splitter')
        || (offer.kind === 'spawner-piece' && allowed.has(offer.typeId) && offer.tier >= 1 && offer.tier <= 4)
      );
    }
    if (!allowed.has(offer.typeId) || !isUnlocked(offer.typeId, offer.tier, unlockedItems)) return false;
    // A row must only hold offers priced in its own currency - this is what
    // catches a pre-two-row save, whose single mixed row would otherwise
    // deserialize into `coin` and quietly keep gem-priced items in it.
    return key === 'gem' ? offer.priceGems != null : offer.priceCoins != null;
  });
}

/**
 * Coerces anything loaded from a save into a valid two-row state,
 * regenerating whichever rows don't survive validation. Saves written
 * before the two-row split have a single mixed `offers` array and no
 * `coin`/`gem` keys at all, so both rows regenerate - shop offers are
 * ephemeral, so there's nothing for the player to lose in that reset.
 */
export function normalizeShopState(raw: unknown, typeIds: string[] = ['wood'], now: number = Date.now(), unlockedItems?: readonly string[], specialTypeIds: string[] = typeIds): ShopState {
  const allowed = new Set(validTypeIds(typeIds));
  const specialAllowed = new Set(validTypeIds(specialTypeIds));
  const candidate = raw as Partial<ShopState> | undefined;
  const coin = isValidRow(candidate?.coin, 'coin', allowed, unlockedItems) ? candidate!.coin! : makeRow('coin', typeIds, now, unlockedItems);
  const gem = isValidRow(candidate?.gem, 'gem', allowed, unlockedItems) ? candidate!.gem! : makeRow('gem', typeIds, now, unlockedItems);
  const special = isValidRow(candidate?.special, 'special', specialAllowed) ? candidate!.special! : makeRow('special', specialTypeIds, now);
  // Saves made before rerollCount existed retain their offers and start at
  // the first reroll price.
  coin.rerollCount ??= 0;
  for (const offer of coin.offers) offer.priceCoins = priceForCoinTier(offer.typeId, offer.tier);
  gem.rerollCount ??= 0;
  special.rerollCount ??= 0;
  return { coin, gem, special };
}

/** Refreshes any row whose interval has elapsed, each on its own clock. */
export function refreshIfDue(state: ShopState, now: number = Date.now(), typeIds: string[] = ['wood'], unlockedItems?: readonly string[], specialTypeIds: string[] = typeIds): ShopState {
  for (const key of SHOP_ROW_KEYS) {
    if (now - state[key].lastRefreshAt >= SHOP_REFRESH_INTERVAL_MS) {
      state[key] = makeRow(key, key === 'special' ? specialTypeIds : typeIds, now, unlockedItems);
    }
  }
  return state;
}

export function msUntilShopRefresh(state: ShopState, key: ShopRowKey, now: number = Date.now()): number {
  return Math.max(0, SHOP_REFRESH_INTERVAL_MS - (now - state[key].lastRefreshAt));
}

/** Instantly re-rolls ONE row, resetting only that row's refresh timer. */
export function rerollShopRow(state: ShopState, key: ShopRowKey, typeIds: string[] = ['wood'], now: number = Date.now(), unlockedItems?: readonly string[]): void {
  const rerollCount = (state[key].rerollCount ?? 0) + 1;
  state[key] = makeRow(key, typeIds, now, unlockedItems);
  state[key].rerollCount = rerollCount;
}

export function markOfferSold(state: ShopState, key: ShopRowKey, index: number): void {
  const offer = state[key].offers[index];
  if (offer) offer.sold = true;
}
