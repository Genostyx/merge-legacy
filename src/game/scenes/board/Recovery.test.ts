import { describe, expect, it, vi } from 'vitest';
import { withInputRecovery } from './ActionRecovery';
import { tryWriteSave } from './SaveStorage';

describe('input recovery', () => {
  it('releases an acquired lock when animation fails', async () => {
    const lock = vi.fn(); const error = vi.fn();
    await withInputRecovery(async (set) => { set(true); throw Error('animation'); }, lock, error);
    expect(lock.mock.calls).toEqual([[true], [false]]); expect(error).toHaveBeenCalledOnce();
  });
  it('does not release another action lock when it acquired none', async () => {
    const lock = vi.fn();
    await withInputRecovery(async () => { throw Error('tap'); }, lock, () => {});
    expect(lock).not.toHaveBeenCalled();
  });
  it('releases a successful action without requiring its own cleanup', async () => {
    const lock = vi.fn();
    await withInputRecovery(async (set) => { set(true); }, lock, () => {});
    expect(lock.mock.calls).toEqual([[true], [false]]);
  });
});

describe('save storage failures', () => {
  it('writes the serialized save on success', () => {
    const setItem = vi.fn();
    expect(tryWriteSave('save', { coins: 4 }, () => ({ setItem }))).toBe(true);
    expect(setItem).toHaveBeenCalledWith('save', '{"coins":4}');
  });
  it('handles unavailable storage, quota failure, and serialization failure without throwing', () => {
    expect(tryWriteSave('save', {}, () => { throw Error('private mode'); })).toBe(false);
    expect(tryWriteSave('save', {}, () => ({ setItem() { throw Error('quota'); } }))).toBe(false);
    expect(tryWriteSave('save', { big: 1n }, () => ({ setItem() {} }))).toBe(false);
  });
});
