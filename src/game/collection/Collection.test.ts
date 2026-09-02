import { describe, expect, it } from 'vitest';
import {
  claimDiscovery,
  claimedInFamily,
  createDefaultCollectionState,
  discoverItem,
  discoverThrough,
  isClaimed,
  isDiscovered,
  normalizeCollectionState,
  unclaimedDiscoveryCount
} from './Collection';

describe('item collection', () => {
  it('records discovery once and grants a claim once', () => {
    const state = createDefaultCollectionState();
    expect(discoverItem(state, 'wood', 2)).toBe(true);
    expect(discoverItem(state, 'wood', 2)).toBe(false);
    expect(unclaimedDiscoveryCount(state)).toBe(1);
    expect(claimDiscovery(state, 'wood', 2)).toBe(true);
    expect(claimDiscovery(state, 'wood', 2)).toBe(false);
    expect(isClaimed(state, 'wood', 2)).toBe(true);
  });

  it('never claims a locked slot', () => {
    const state = createDefaultCollectionState();
    expect(claimDiscovery(state, 'glass', 9)).toBe(false);
  });

  it('can reconstruct the ladder beneath a legacy high-tier item', () => {
    const state = createDefaultCollectionState();
    expect(discoverThrough(state, 'mineral', 4)).toBe(4);
    expect(isDiscovered(state, 'mineral', 1)).toBe(true);
    expect(isDiscovered(state, 'mineral', 4)).toBe(true);
    expect(isDiscovered(state, 'mineral', 5)).toBe(false);
  });

  it('normalizes invalid, duplicate and impossible claimed keys', () => {
    const state = normalizeCollectionState({
      discovered: ['wood:1', 'wood:1', 'bad:2'],
      claimed: ['wood:1', 'wood:2', 'bad:2']
    });
    expect(state).toEqual({ discovered: ['wood:1'], claimed: ['wood:1'] });
    expect(claimedInFamily(state, 'wood')).toBe(1);
  });
});
