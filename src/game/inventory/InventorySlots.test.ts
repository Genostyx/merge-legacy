import { describe, expect, it } from 'vitest';
import { createDefaultInventory, storeItem, moveItem, retrieveItem, normalizeInventory,
  freeSlots, inventoryGesture } from './Inventory';

const plank = { kind: 'item' as const, typeId: 'wood', tier: 3 };
describe('stable inventory slots', () => {
  it('preserves distant slots through saving, retrieval, and new storage', () => {
    const state = createDefaultInventory();
    storeItem(state, plank);
    expect(moveItem(state, 0, 4)).toBe(true);
    expect(state.items).toEqual([null, null, null, null, plank]);
    const loaded = normalizeInventory(JSON.parse(JSON.stringify(state)));
    expect(loaded.items).toEqual(state.items);
    expect(freeSlots(loaded)).toBe(4);
    storeItem(loaded, { kind: 'item', typeId: 'glass', tier: 1 });
    expect(loaded.items[0]?.kind).toBe('item');
    expect(loaded.items[4]).toEqual(plank);
    retrieveItem(loaded, 0);
    expect(loaded.items[4]).toEqual(plank);
  });
  it('swaps occupied slots and rejects locked destinations or empty origins', () => {
    const state = createDefaultInventory();
    const glass = { kind: 'item' as const, typeId: 'glass', tier: 1 };
    storeItem(state, plank);
    storeItem(state, glass);
    expect(moveItem(state, 0, 1)).toBe(true);
    expect(state.items).toEqual([glass, plank]);
    expect(moveItem(state, 0, state.slots)).toBe(false);
    expect(moveItem(state, 4, 0)).toBe(false);
  });
  it('allows taps and mouse dragging while reserving vertical touch movement for scrolling', () => {
    expect(inventoryGesture(0, 3, true)).toBe('none');
    expect(inventoryGesture(2, 20, true)).toBe('scroll');
    expect(inventoryGesture(20, 2, true)).toBe('item');
    expect(inventoryGesture(0, 20, false)).toBe('item');
  });
});
