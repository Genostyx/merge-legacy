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
