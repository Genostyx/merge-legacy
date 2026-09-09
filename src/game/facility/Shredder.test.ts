import { describe, expect, it } from 'vitest';
import {
  SHREDDER_METER_MAX,
  SHREDDER_PRIZES,
  createDefaultShredderState,
  feedShredder,
  normalizeShredderState,
  rollShredderPrize,
  shredderAccepts
} from './Shredder';

describe('the shredder', () => {
  it('takes anything with a merge path left', () => {
    expect(shredderAccepts('wood', 1)).toBe(true);
    expect(shredderAccepts('glass', 8)).toBe(true);
  });

  it('refuses max-tier items - those belong to the consumer', () => {
    // The line between the two machines. If both took a finished chain they
    // would compete for the same input and the expensive one would be
    // pointless.
    expect(shredderAccepts('wood', 9)).toBe(false);
    expect(shredderAccepts('mineral', 9)).toBe(false);
  });

  it('refuses currency and utility chains', () => {
    expect(shredderAccepts('currency-credit', 2)).toBe(false);
    expect(shredderAccepts('water', 3)).toBe(false);
    expect(shredderAccepts('decagon', 1)).toBe(false);
  });

  it('never pays a premium crate', () => {
    // At 50 cheap items a roll, a gold or a shipping container here would be
    // the cheapest premium crate in the game and would undercut both the
    // supply shop and the max-tier consumer.
    for (const row of SHREDDER_PRIZES) {
      expect(['bronze', 'silver']).toContain(row.tier);
    }
    for (const rng of [() => 0, () => 0.5, () => 0.999]) {
      const state = createDefaultShredderState();
      expect(['bronze', 'silver']).toContain(rollShredderPrize(state, rng));
      expect(state.meter).toBe(0);
    }
  });

  it('reports the fill exactly once', () => {
    const state = createDefaultShredderState();
    for (let i = 1; i < SHREDDER_METER_MAX; i++) expect(feedShredder(state)).toBe(false);
    expect(feedShredder(state)).toBe(true);
  });

  it('clamps a junk save', () => {
    expect(normalizeShredderState({ meter: 999 }).meter).toBe(SHREDDER_METER_MAX);
    expect(normalizeShredderState({ meter: -1 }).meter).toBe(0);
    expect(normalizeShredderState(undefined).meter).toBe(0);
  });
});
