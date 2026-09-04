/**
 * Player inventory - a small set of slots the player can move board items
 * into and pull back out later.
 *
 * This is a board-pressure valve that is NOT selling. Before it, holding a
 * tier-8 back for an order you expect meant giving up a board cell to do it,
 * so the only ways out of a crowded board were to merge or to sell at a
 * loss. Storage lets a player keep something valuable without paying board
 * space for it, which turns "what do I hold onto?" into a real question.
 *
 * Slots are deliberately few and get expensive: the inventory is meant to be
 * a squeeze the player manages, not a second board. If it ever grows big
 * enough to park everything in, board pressure stops existing.
 */

import type { CratePayloadEntry } from '../Grid';
import type { ResourceProducerId } from '../rewards/ResourceRewards';

/**
 * Anything that can occupy a slot. Crates are stored items, not a separate
 * list: they are earned into the inventory and opened from it, so storing,
 * retrieving and the slot squeeze all work on them with no extra code.
 */
export type StoredItem =
  | { kind: 'item'; typeId: string; tier: number }
  | { kind: 'spawner-piece'; typeId: string; tier: number }
  | { kind: 'resource-producer'; producerId: ResourceProducerId; remaining: number; tier: 1 }
  | { kind: 'crate'; tier: string; remaining?: CratePayloadEntry[]; readyAt?: number }
  // A Splitter carries nothing with it - it is one tool, in one state - so it
  // is the only stored kind with no fields at all.
  | { kind: 'splitter' };

export interface InventoryState {
  slots: number;
  items: StoredItem[];
}

/** Opening slots. Enough to be useful immediately, far too few to hoard with. */
export const INVENTORY_START_SLOTS = 5;

/**
 * Three columns, with five starting slots and thirty purchasable slots.
 * The inventory menu scrolls vertically so icons retain their current size.
 */
export const INVENTORY_GRID = 3;
export const INVENTORY_MAX_SLOTS = 35;

/**
 * Gem price of the NEXT slot, given how many are owned.
 *
 * Escalating ~1.6x per slot from 6, landing on 6 / 10 / 15 / 25 for the four
 * buyable slots. The first is deliberately cheap enough to be an easy early
 * yes - roughly two crate gem drops - while the ninth still costs most of an
 * energy refill, so the last slot stays a decision rather than an
 * afterthought.
 */
export function slotCost(currentSlots: number): number | null {
  if (currentSlots >= INVENTORY_MAX_SLOTS) return null;
  const purchaseNumber = Math.max(1, currentSlots - INVENTORY_START_SLOTS + 1);
  const ramp = [5, 10, 15, 20, 25, 35, 45, 55, 65, 75, 90, 110, 130, 150, 180];
  return ramp[purchaseNumber - 1] ?? 200;
}

export function createDefaultInventory(): InventoryState {
  return { slots: INVENTORY_START_SLOTS, items: [] };
}

export function normalizeInventory(raw: Partial<InventoryState> | undefined): InventoryState {
  const base = createDefaultInventory();
  if (!raw) return base;
  const slots = Number.isFinite(raw.slots)
    ? Math.min(INVENTORY_MAX_SLOTS, Math.max(INVENTORY_START_SLOTS, Math.floor(raw.slots as number)))
    : INVENTORY_START_SLOTS;
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((entry): entry is StoredItem => {
          if (!entry || typeof entry !== 'object') return false;
          const e = entry as { kind?: string; typeId?: unknown; tier?: unknown };
          if (e.kind === 'splitter') return true;
          if (e.kind === 'crate') return typeof e.tier === 'string';
          if (e.kind === 'resource-producer') return typeof (entry as { producerId?: unknown }).producerId === 'string' && Number.isFinite((entry as { remaining?: unknown }).remaining);
          return typeof e.typeId === 'string' && Number.isFinite(e.tier);
        })
        .map((entry) => entry.kind === 'splitter'
          ? { kind: 'splitter' as const }
          : entry.kind === 'crate'
          ? {
            kind: 'crate' as const, tier: entry.tier,
            remaining: Array.isArray(entry.remaining) ? (entry.remaining as CratePayloadEntry[]) : undefined,
            readyAt: typeof entry.readyAt === 'number' ? entry.readyAt : undefined
          }
          : entry.kind === 'resource-producer'
            ? { kind: 'resource-producer' as const, producerId: entry.producerId, remaining: Math.max(1, Math.floor(entry.remaining)), tier: 1 as const }
          : {
              kind: entry.kind === 'spawner-piece' ? 'spawner-piece' as const : 'item' as const,
              typeId: entry.typeId,
              tier: Math.max(1, Math.floor(entry.tier))
            })
        // Trim rather than drop, in case a save predates a lower cap.
        .slice(0, slots)
    : [];
  return { slots, items };
}

export function freeSlots(state: InventoryState): number {
  return Math.max(0, state.slots - state.items.length);
}

export function isFull(state: InventoryState): boolean {
  return freeSlots(state) <= 0;
}

/** Puts an item into storage. Returns false when there is no room. */
export function storeItem(state: InventoryState, item: StoredItem): boolean {
  if (isFull(state)) return false;
  state.items.push({ ...item });
  return true;
}

/** Removes and returns one stored item, or null if the index is not filled. */
export function retrieveItem(state: InventoryState, index: number): StoredItem | null {
  if (index < 0 || index >= state.items.length) return null;
  return state.items.splice(index, 1)[0];
}

export interface SlotPurchase {
  ok: boolean;
  cost: number | null;
  reason?: 'maxed' | 'insufficient-gems';
}

/**
 * Buys one slot. Takes a spend callback rather than the economy itself so
 * this module stays free of economy imports and is trivially testable.
 */
export function buySlot(state: InventoryState, spendGems: (amount: number) => boolean): SlotPurchase {
  const cost = slotCost(state.slots);
  if (cost === null) return { ok: false, cost: null, reason: 'maxed' };
  if (!spendGems(cost)) return { ok: false, cost, reason: 'insufficient-gems' };
  state.slots += 1;
  return { ok: true, cost };
}
