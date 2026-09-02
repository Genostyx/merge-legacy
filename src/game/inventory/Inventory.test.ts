import { describe, expect, it } from 'vitest';
import {
  INVENTORY_MAX_SLOTS,
  INVENTORY_START_SLOTS,
  buySlot,
  createDefaultInventory,
  freeSlots,
  isFull,
  normalizeInventory,
  retrieveItem,
  slotCost,
  storeItem
} from './Inventory';

const plank = { kind: 'item' as const, typeId: 'wood', tier: 3 };
const fillToCapacity = () => {
  const state = createDefaultInventory();
  for (let i = 0; i < INVENTORY_START_SLOTS; i++) storeItem(state, { kind: 'item', typeId: 'wood', tier: i + 1 });
  return state;
};

describe('storing and retrieving', () => {
  it('opens with a small number of slots', () => {
    const state = createDefaultInventory();
    expect(state.slots).toBe(INVENTORY_START_SLOTS);
    expect(freeSlots(state)).toBe(INVENTORY_START_SLOTS);
  });

  it('stores until full, then refuses', () => {
    const state = fillToCapacity();
    expect(isFull(state)).toBe(true);
    expect(storeItem(state, plank)).toBe(false);
    expect(state.items.length).toBe(INVENTORY_START_SLOTS);
  });

  it('returns the exact item that was stored', () => {
    const state = createDefaultInventory();
    storeItem(state, plank);
    expect(retrieveItem(state, 0)).toEqual(plank);
    expect(state.items).toEqual([]);
  });

  it('copies on store, so later edits to the caller object cannot corrupt storage', () => {
    const state = createDefaultInventory();
    const source = { kind: 'item' as const, typeId: 'glass', tier: 7 };
    storeItem(state, source);
    source.tier = 1;
    expect(state.items[0].tier).toBe(7);
  });

  it('refuses an out-of-range retrieve rather than returning undefined', () => {
    const state = createDefaultInventory();
    expect(retrieveItem(state, 0)).toBeNull();
    expect(retrieveItem(state, -1)).toBeNull();
  });

  it('frees a slot when an item is taken back out', () => {
    const state = fillToCapacity();
    retrieveItem(state, 2);
    expect(freeSlots(state)).toBe(1);
    expect(storeItem(state, plank)).toBe(true);
  });
});

describe('buying slots', () => {
  const wallet = (gems: number) => {
    const purse = { gems };
    return {
      purse,
      spend: (amount: number) => {
        if (purse.gems < amount) return false;
        purse.gems -= amount;
        return true;
      }
    };
  };

  it('never charges less for a successive slot', () => {
    let slots = INVENTORY_START_SLOTS;
    let previous = 0;
    while (slots < INVENTORY_MAX_SLOTS) {
      const cost = slotCost(slots)!;
      expect(cost, `slot ${slots + 1}`).toBeGreaterThanOrEqual(previous);
      previous = cost;
      slots++;
    }
  });

  it('prices the first extra slot against the rest of the gem economy', () => {
    expect(slotCost(INVENTORY_START_SLOTS)).toBe(5);
  });

  it('spends the gems and adds exactly one slot', () => {
    const state = createDefaultInventory();
    const { purse, spend } = wallet(100);
    const result = buySlot(state, spend);
    expect(result).toEqual({ ok: true, cost: 5 });
    expect(state.slots).toBe(INVENTORY_START_SLOTS + 1);
    expect(purse.gems).toBe(95);
  });

  it('does not add a slot or take gems when the player cannot afford it', () => {
    const state = createDefaultInventory();
    const { purse, spend } = wallet(2);
    const result = buySlot(state, spend);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient-gems');
    expect(state.slots).toBe(INVENTORY_START_SLOTS);
    expect(purse.gems).toBe(2);
  });

  it('stops at the cap so the inventory can never become a second board', () => {
    const state = createDefaultInventory();
    const { spend } = wallet(100_000);
    while (state.slots < INVENTORY_MAX_SLOTS) buySlot(state, spend);
    expect(slotCost(state.slots)).toBeNull();
    const result = buySlot(state, spend);
    expect(result).toEqual({ ok: false, cost: null, reason: 'maxed' });
    expect(state.slots).toBe(INVENTORY_MAX_SLOTS);
  });
});

describe('crates share the slots', () => {
  it('stores and returns a crate like any other item', () => {
    const state = createDefaultInventory();
    expect(storeItem(state, { kind: 'crate', tier: 'gold' })).toBe(true);
    expect(state.items[0]).toEqual({ kind: 'crate', tier: 'gold' });
    expect(freeSlots(state)).toBe(INVENTORY_START_SLOTS - 1);
    expect(retrieveItem(state, 0)).toEqual({ kind: 'crate', tier: 'gold' });
  });

  it('counts crates against the same squeeze as items', () => {
    const state = createDefaultInventory();
    for (let i = 0; i < INVENTORY_START_SLOTS; i++) storeItem(state, { kind: 'crate', tier: 'bronze' });
    expect(isFull(state)).toBe(true);
    expect(storeItem(state, plank)).toBe(false);
  });
});

describe('spawner pieces share the slots', () => {
  it('stores and returns a spawner piece like a board item', () => {
    const state = createDefaultInventory();
    const piece = { kind: 'spawner-piece' as const, typeId: 'wood', tier: 2 };
    expect(storeItem(state, piece)).toBe(true);
    expect(state.items[0]).toEqual(piece);
    expect(freeSlots(state)).toBe(INVENTORY_START_SLOTS - 1);
    expect(retrieveItem(state, 0)).toEqual(piece);
  });
});

describe('save handling', () => {
  it('defaults a missing or malformed save', () => {
    expect(normalizeInventory(undefined)).toEqual(createDefaultInventory());
    expect(normalizeInventory({ slots: NaN } as never).slots).toBe(INVENTORY_START_SLOTS);
  });

  it('never restores fewer than the starting slots, or more than the cap', () => {
    expect(normalizeInventory({ slots: 1 }).slots).toBe(INVENTORY_START_SLOTS);
    expect(normalizeInventory({ slots: 999 }).slots).toBe(INVENTORY_MAX_SLOTS);
  });

  it('drops malformed entries and trims past the slot count', () => {
    const state = normalizeInventory({
      slots: 5,
      items: [
        plank,
        { kind: 'item', typeId: 'glass', tier: 2 },
        { tier: 4 } as never,
        null as never,
        { typeId: 'wood', tier: 'x' } as never
      ]
    });
    expect(state.items).toEqual([plank, { kind: 'item', typeId: 'glass', tier: 2 }]);
  });

  it('trims a saved overflow rather than exceeding the slot count', () => {
    const items = Array.from({ length: 9 }, () => plank);
    expect(normalizeInventory({ slots: 5, items }).items.length).toBe(5);
  });
});
