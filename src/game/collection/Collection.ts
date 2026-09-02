import { CHAINS, getTierDef, isCurrencyChain } from '../data/chains';

export interface CollectionState {
  discovered: string[];
  claimed: string[];
}

export const collectionKey = (typeId: string, tier: number): string => `${typeId}:${tier}`;

const validKeys = new Set(
  CHAINS.filter((chain) => !isCurrencyChain(chain.typeId)).flatMap((chain) => chain.tiers.map((tier) => collectionKey(chain.typeId, tier.tier)))
);

export function createDefaultCollectionState(): CollectionState {
  return { discovered: [], claimed: [] };
}

export function normalizeCollectionState(raw: Partial<CollectionState> | undefined): CollectionState {
  const clean = (values: unknown): string[] => Array.isArray(values)
    ? [...new Set(values.filter((value): value is string => typeof value === 'string' && validKeys.has(value)))]
    : [];
  const discovered = clean(raw?.discovered);
  const discoveredSet = new Set(discovered);
  const claimed = clean(raw?.claimed).filter((key) => discoveredSet.has(key));
  return { discovered, claimed };
}

export function discoverItem(state: CollectionState, typeId: string, tier: number): boolean {
  if (!getTierDef(typeId, tier)) return false;
  const key = collectionKey(typeId, tier);
  if (state.discovered.includes(key)) return false;
  state.discovered.push(key);
  return true;
}

export function discoverThrough(state: CollectionState, typeId: string, tier: number): number {
  let added = 0;
  for (let current = 1; current <= tier; current++) {
    if (discoverItem(state, typeId, current)) added++;
  }
  return added;
}

export function isDiscovered(state: CollectionState, typeId: string, tier: number): boolean {
  return state.discovered.includes(collectionKey(typeId, tier));
}

export function isClaimed(state: CollectionState, typeId: string, tier: number): boolean {
  return state.claimed.includes(collectionKey(typeId, tier));
}

export function claimDiscovery(state: CollectionState, typeId: string, tier: number): boolean {
  const key = collectionKey(typeId, tier);
  if (!state.discovered.includes(key) || state.claimed.includes(key)) return false;
  state.claimed.push(key);
  return true;
}

export function unclaimedDiscoveryCount(state: CollectionState): number {
  const claimed = new Set(state.claimed);
  return state.discovered.filter((key) => !claimed.has(key)).length;
}

export function claimedInFamily(state: CollectionState, typeId: string): number {
  return state.claimed.filter((key) => key.startsWith(`${typeId}:`)).length;
}
