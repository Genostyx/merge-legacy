export type ResourceProducerId = 'coin-pouch' | 'coin-basket' | 'energy-basket' | 'gem-basket';

export const RESOURCE_PRODUCERS: Record<ResourceProducerId, {
  label: string;
  typeId: 'currency-credit' | 'currency-energy' | 'currency-gem';
  capacity: number;
  textureKey: string;
  drops: { tier: number; weight: number }[];
}> = {
  'coin-pouch': {
    label: 'Coin Pouch', typeId: 'currency-credit', capacity: 10, textureKey: 'producer-coin-pouch',
    drops: [{ tier: 1, weight: 80 }, { tier: 2, weight: 20 }]
  },
  'coin-basket': {
    label: 'Coin Basket', typeId: 'currency-credit', capacity: 20, textureKey: 'producer-coin-basket',
    drops: [{ tier: 1, weight: 55 }, { tier: 2, weight: 35 }, { tier: 3, weight: 10 }]
  },
  'energy-basket': {
    label: 'Energy Basket', typeId: 'currency-energy', capacity: 12, textureKey: 'producer-energy-basket',
    drops: [{ tier: 1, weight: 80 }, { tier: 2, weight: 20 }]
  },
  'gem-basket': {
    label: 'Gem Basket', typeId: 'currency-gem', capacity: 3, textureKey: 'producer-gem-basket',
    drops: [{ tier: 1, weight: 80 }, { tier: 2, weight: 20 }]
  }
};

export const RESOURCE_PAYOUTS: Record<string, number[]> = {
  'currency-credit': [1, 3, 10, 35, 150, 1000],
  'currency-energy': [1, 3, 8, 25, 100],
  'currency-gem': [1, 3, 8, 18, 40]
};

export function rollResourceTier(id: ResourceProducerId, rng: () => number = Math.random): number {
  const drops = RESOURCE_PRODUCERS[id].drops;
  const total = drops.reduce((sum, drop) => sum + drop.weight, 0);
  let roll = rng() * total;
  for (const drop of drops) {
    roll -= drop.weight;
    if (roll < 0) return drop.tier;
  }
  return drops[drops.length - 1].tier;
}

export function currencyPayout(typeId: string, tier: number): number {
  return RESOURCE_PAYOUTS[typeId]?.[tier - 1] ?? 0;
}

/**
 * Coins one tap of a producer is worth, on average.
 *
 * Computed from the producer's own drop weights and payout table rather than
 * guessed, so it cannot drift when either is retuned. Used for valuing a
 * part-used producer sitting inside a crate.
 */
export function expectedProducerCoinValue(
  id: ResourceProducerId, coinsPerGem: number, coinsPerEnergy: number
): number {
  const def = RESOURCE_PRODUCERS[id];
  const total = def.drops.reduce((sum, drop) => sum + drop.weight, 0);
  const units = def.drops.reduce(
    (sum, drop) => sum + (drop.weight / total) * currencyPayout(def.typeId, drop.tier),
    0
  );
  const rate = def.typeId === 'currency-gem' ? coinsPerGem
    : def.typeId === 'currency-energy' ? coinsPerEnergy
    : 1;
  return units * rate;
}

/**
 * Breaks a currency amount into board items whose payouts add up to it.
 *
 * A Hydro Core pays its Energy and Gems ONTO THE BOARD rather than into the
 * wallet, so the reward has to become tiles - and 50 Energy as fifty tier-1
 * sparks would bury the board. This picks the biggest tier that still fits
 * most of the time, and a random affordable one otherwise, so the split
 * varies without ever running long.
 *
 * `maxItems` is a hard stop on board cost: once it is reached the remainder
 * is dropped rather than spilling more tiles. Slight under-payment is the
 * right failure here - the alternative is a reward that floods the board it
 * is supposed to be a prize for.
 */
export function splitCurrencyIntoItems(
  typeId: string,
  amount: number,
  maxItems = 6,
  rng: () => number = Math.random
): number[] {
  const payouts = RESOURCE_PAYOUTS[typeId];
  if (!payouts || amount <= 0) return [];
  const out: number[] = [];
  let left = Math.floor(amount);

  while (left > 0 && out.length < maxItems) {
    // Tiers are 1-based; find every one the remainder can still afford.
    const affordable = payouts
      .map((value, index) => ({ tier: index + 1, value }))
      .filter((row) => row.value <= left);
    if (affordable.length === 0) break;

    const biggest = affordable[affordable.length - 1];
    // Mostly the biggest, so the count stays low; sometimes a smaller one, so
    // two payouts of the same size do not produce identical piles.
    const pick = rng() < 0.6 ? biggest : affordable[Math.floor(rng() * affordable.length)];
    out.push(pick.tier);
    left -= pick.value;
  }
  return out;
}
