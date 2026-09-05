import type { BoardScene } from '../BoardScene';
import {
  COLS,
  ROWS,
  EXPANSION_ROW_ONE,
  PROJECT_STAGES,
  PREVIOUS_SAVE_KEY,
  SAVE_KEY,
  TYPE_ID,
  UNREADABLE_SAVE_KEY,
  stashSave,
  type ForcedSpawn
} from './config';
import type { GridCellData } from '../../Grid';
import { createLockedBoardSeed } from '../../LockedBoard';
import { isCurrencyChain } from '../../data/chains';
import { capacityForTier, makeDispenser, normalizeDispenserState } from '../../dispensers/Dispensers';
import type { DispenserState } from '../../dispensers/Dispensers';
import { createDefaultEconomy } from '../../economy/Economy';
import type { EconomyState } from '../../economy/Economy';
import { normalizeEnergy } from '../../economy/Energy';
import type { EnergyState } from '../../economy/Energy';
import { normalizeOrderState, migrateXpCurve, XP_CURVE_VERSION } from '../../levels/Orders';
import type { OrderState } from '../../levels/Orders';
import { normalizeShopState, refreshIfDue } from '../../shop/Shop';
import type { ShopState } from '../../shop/Shop';
import { SUPPLY_CRATES } from '../../shop/SupplyCrates';
import { normalizeRewardsState } from '../../rewards/Rewards';
import type { RewardsState } from '../../rewards/Rewards';
import { normalizeInventory } from '../../inventory/Inventory';
import type { InventoryState } from '../../inventory/Inventory';
import { discoverThrough, normalizeCollectionState } from '../../collection/Collection';
import type { CollectionState } from '../../collection/Collection';
import { ROOM_PIECES } from '../../rooms/RoomView3D';

/**
 * saveGame, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

export function seedLockedBoard(scene: BoardScene, preserveEmpty: number): void {
  let remainingSlots = Math.max(0, scene.grid.emptyCells().length - preserveEmpty);
  // Locked merge items retain the original 6x7 board layout. The final two
  // rows are expansion tiles and must never receive ordinary locked items.
  for (const seed of createLockedBoardSeed(COLS, EXPANSION_ROW_ONE)) {
    if (remainingSlots <= 0) break;
    if (!scene.grid.isEmpty(seed.pos)) continue;
    scene.placeLockedTile(seed.pos, seed.typeId, seed.tier);
    remainingSlots--;
  }
}

export function migrateLockedItemsToWiderBoard(scene: BoardScene, savedCells: (GridCellData | null)[][]): void {
  const remainingLocks = savedCells.flat().filter(
    (cell): cell is Extract<GridCellData, { kind: 'locked-item' }> => cell?.kind === 'locked-item'
  );
  const targets = createLockedBoardSeed(COLS, EXPANSION_ROW_ONE);
  for (const lock of remainingLocks) {
    const exactIndex = targets.findIndex((target) =>
      target.typeId === lock.typeId && target.tier === lock.tier && scene.grid.isEmpty(target.pos)
    );
    const fallbackIndex = targets.findIndex((target) => scene.grid.isEmpty(target.pos));
    const index = exactIndex >= 0 ? exactIndex : fallbackIndex;
    if (index < 0) break;
    const [target] = targets.splice(index, 1);
    scene.placeLockedTile(target.pos, lock.typeId, lock.tier);
  }
}

export function loadOrSeed(scene: BoardScene): void {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        boardVersion?: number;
        xpCurve?: number;
        hasTappedSource?: boolean;
        grid: (GridCellData | null)[][];
        economy?: EconomyState;
        energy?: EnergyState;
        orderState?: OrderState;
        levelState?: { currentLevelIndex?: number; totalXp?: number };
        shopState?: ShopState;
        dispenserState?: DispenserState;
        dispenserCollectCount?: number;
        rewards?: Partial<RewardsState>;
        collection?: Partial<CollectionState>;
        inventory?: Partial<InventoryState>;
        pendingSpawners?: { typeId: string; tier: number }[];
        forcedSpawnVault?: ForcedSpawn[];
        boardExpansion?: { unlockedCells?: string[] };
        projectStage?: number;
        builtPieces?: string[];
        supplyCooldownUntil?: number;
        supplyCooldownByTier?: Record<string, number>;
      };
      scene.grid.loadFrom(parsed.grid);
      const savedCells = scene.grid.serialize();
      scene.grid.clear();
      scene.boardExpansionUnlocked = new Set(
        Array.isArray(parsed.boardExpansion?.unlockedCells)
          ? parsed.boardExpansion.unlockedCells.filter((key): key is string => typeof key === 'string')
          : []
      );
      scene.applyBoardExpansionLocks(savedCells);
      // DEFAULTS TRUE, and that default is the whole point: an existing save
      // has a player who long ago worked out that sources are tappable, and
      // the first-tap hint appearing on their board after an update would be
      // noise. Only the seed path below starts it false.
      scene.hasTappedSource = parsed.hasTappedSource ?? true;
      scene.dispenserCollectCount = parsed.dispenserCollectCount ?? 0;
      scene.projectStage = Phaser.Math.Clamp(Math.floor(parsed.projectStage ?? 0), 0, PROJECT_STAGES.length);
      // Saves written before the room was itemized have no piece list: back
      // then reaching stage N meant owning everything up to N, so that is
      // what they migrate to. Without this a returning player's furnished
      // room would empty itself out and ask to be bought again.
      const validKeys = new Set(ROOM_PIECES.map((piece) => piece.key));
      scene.builtPieces = Array.isArray(parsed.builtPieces)
        ? new Set(parsed.builtPieces.filter((key): key is string => validKeys.has(key)))
        : new Set(
            ROOM_PIECES
              .filter((piece) => piece.stage <= scene.projectStage)
              .map((piece) => piece.key)
          );
      scene.supplyCooldownUntil = typeof parsed.supplyCooldownUntil === 'number'
        ? parsed.supplyCooldownUntil : 0;
      // A save from before per-tier timers carries one shared deadline.
      // Rather than drop it - which would hand back every crate at once -
      // or apply it to all three, it is honoured on the tier it most likely
      // came from: the shortest one it could still be running for.
      scene.supplyCooldownByTier = {};
      if (parsed.supplyCooldownByTier && typeof parsed.supplyCooldownByTier === 'object') {
        for (const [tier, until] of Object.entries(parsed.supplyCooldownByTier)) {
          if (typeof until === 'number' && Number.isFinite(until)) scene.supplyCooldownByTier[tier] = until;
        }
      } else if (scene.supplyCooldownUntil > Date.now()) {
        const remaining = scene.supplyCooldownUntil - Date.now();
        const from = [...SUPPLY_CRATES].sort((a, b) => a.cooldownMs - b.cooldownMs)
          .find((offer) => offer.cooldownMs >= remaining) ?? SUPPLY_CRATES[SUPPLY_CRATES.length - 1];
        scene.supplyCooldownByTier[from.tier] = scene.supplyCooldownUntil;
      }
      scene.rewards = normalizeRewardsState(parsed.rewards);
      const legacyCollection = parsed.collection == null;
      scene.collection = normalizeCollectionState(parsed.collection);
      scene.inventory = normalizeInventory(parsed.inventory);
      const savedVault = Array.isArray(parsed.forcedSpawnVault)
        ? parsed.forcedSpawnVault.filter((entry): entry is ForcedSpawn => {
            if (!entry || typeof entry !== 'object' || typeof entry.kind !== 'string') return false;
            if (entry.kind === 'crate') return typeof entry.tier === 'string' && Array.isArray(entry.remaining);
            if (entry.kind === 'splitter') return true;
            if (entry.kind === 'resource-producer') return typeof entry.producerId === 'string' && Number.isFinite(entry.remaining);
            return typeof entry.typeId === 'string' && Number.isFinite(entry.tier);
          })
        : [];
      const legacyPending = Array.isArray(parsed.pendingSpawners)
        ? parsed.pendingSpawners
            .filter((entry) => entry && typeof entry.typeId === 'string' && Number.isFinite(entry.tier))
            .map((entry): ForcedSpawn => ({ kind: 'spawner', typeId: entry.typeId, tier: entry.tier }))
        : [];
      scene.forcedSpawnVault = [...legacyPending, ...savedVault];
      if (parsed.economy) {
        scene.economy = { ...createDefaultEconomy(), ...parsed.economy };
      }
      // Pre-energy saves get a full bar rather than an empty one - the
      // mechanic arriving must not read as a punishment for existing players.
      scene.energy = normalizeEnergy(parsed.energy);
      const savedDispenserFamilies = new Set<string>();
      for (const row of savedCells) {
        for (const cell of row) {
          if (cell?.kind === 'spawner') savedDispenserFamilies.add(cell.typeId);
        }
      }
      for (const pending of scene.forcedSpawnVault) {
        if (pending.kind === 'spawner') savedDispenserFamilies.add(pending.typeId);
      }
      if (savedDispenserFamilies.size === 0) savedDispenserFamilies.add(TYPE_ID);
      scene.orderState = normalizeOrderState(
        parsed.orderState ?? parsed.levelState ?? {},
        scene.dispenserCollectCount,
        [...savedDispenserFamilies]
      );
      let saveMigration = false;
      const needsLockedBoardMigration = (parsed.boardVersion ?? 0) < 8;
      const needsBoardWidthMigration = (parsed.boardVersion ?? 0) < 9;
      // THE XP CURVE CONVERSION GUARDS ITSELF.
      //
      // It is gated on its own `xpCurve` field, not on `boardVersion`, and
      // `migrateXpCurve` returns the total untouched once that field is
      // current - so calling it on every load is safe by construction rather
      // than by the caller remembering to check.
      //
      // Both were needed. The first version hung this off `boardVersion`, and
      // the version the save STAMPED was never bumped, so the doubling re-ran
      // on every refresh: XP compounded, levels jumped, and milestone crates
      // paid out each time. A gate that lives with the thing it guards cannot
      // drift apart from it that way.
      const xpCurve = typeof parsed.xpCurve === 'number' ? parsed.xpCurve : undefined;
      const migratedXp = migrateXpCurve({ totalXp: scene.orderState.totalXp, xpCurve });
      if (xpCurve !== XP_CURVE_VERSION) {
        scene.orderState.totalXp = migratedXp.totalXp;
        saveMigration = true;
      }
      let spawnerCount = 0;
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const cell = savedCells[row]?.[col];
          if (!cell) continue;
          const pos = { col, row };
          if (cell.kind === 'spawner') {
            scene.placeSpawner(pos, cell.typeId, cell.tier, false, cell);
            spawnerCount++;
          } else if (cell.kind === 'locked-item') {
            // Version 8 restores the locked items to the original 6x7
            // frontier after the two expansion rows were added. Discard
            // only old locked cells here; player-owned pieces and sources
            // survive and the locks are reseeded below.
            if (!needsLockedBoardMigration && !needsBoardWidthMigration) scene.placeLockedTile(pos, cell.typeId, cell.tier);
          } else if (cell.kind === 'crate') {
            scene.placeCrate(pos, cell.tier, cell.remaining, cell.readyAt);
          } else if (cell.kind === 'spawner-piece') {
            scene.placeSpawnerPiece(pos, cell.typeId, cell.tier, false);
          } else if (cell.kind === 'splitter') {
            scene.placeSplitter(pos, false);
          } else if (cell.kind === 'resource-producer') {
            scene.placeResourceProducer(pos, cell.producerId, cell.remaining, false);
          } else {
            scene.placeTile(pos, cell.typeId, cell.tier, false);
          }
        }
      }

      // One-time migration from the old off-board source dock. Existing
      // sources become real board pieces instead of disappearing.
      if (spawnerCount === 0 && parsed.dispenserState) {
        const legacyState = normalizeDispenserState(parsed.dispenserState);
        for (const legacy of legacyState.slots) {
          const empty = scene.grid.emptyCells()[0];
          if (!legacy || !empty) continue;
          if (!legacy.typeId) legacy.typeId = TYPE_ID;
          scene.placeSpawner(empty, legacy.typeId, legacy.tier, false, { kind: 'spawner', ...legacy });
          spawnerCount++;
        }
      }
      if (spawnerCount === 0) {
        const empty = scene.grid.emptyCells()[0] ?? { col: 2, row: 5 };
        const fullStarter = makeDispenser(TYPE_ID, 1, Date.now(), capacityForTier(TYPE_ID, 1));
        scene.placeSpawner(empty, TYPE_ID, 1, false, { kind: 'spawner', ...fullStarter });
        spawnerCount++;
      }

      // Saves from before the collection feature have no permanent history.
      // Reconstruct the lower ladder only from player-owned items that still
      // exist on the board or in inventory; locked cells never count.
      if (legacyCollection) {
        const highest = new Map<string, number>();
        for (const key of scene.collection.discovered) {
          const [typeId, rawTier] = key.split(':');
          highest.set(typeId, Math.max(highest.get(typeId) ?? 0, Number(rawTier)));
        }
        for (const item of scene.inventory.items) {
          if (item?.kind !== 'item') continue;
          highest.set(item.typeId, Math.max(highest.get(item.typeId) ?? 0, item.tier));
        }
        for (const [typeId, tier] of highest) {
          if (!isCurrencyChain(typeId)) discoverThrough(scene.collection, typeId, tier);
        }
        saveMigration = true;
      }

      if (needsLockedBoardMigration) {
        seedLockedBoard(scene, 2);
        saveMigration = true;
      } else if (needsBoardWidthMigration) {
        migrateLockedItemsToWiderBoard(scene, savedCells);
        saveMigration = true;
      }

      if (parsed.shopState) {
        const typeIds = scene.availableShopTypeIds();
        // normalizeShopState handles the pre-two-row save shape (a single
        // mixed `offers` array) by regenerating both rows - offers are
        // ephemeral, so nothing the player owns is lost in that reset.
        scene.shopState = refreshIfDue(
          normalizeShopState(parsed.shopState, typeIds, Date.now(), scene.collection.discovered, scene.specialShopTypeIds()),
          Date.now(), typeIds, scene.collection.discovered, scene.specialShopTypeIds()
        );
      }
      // Captured only once the load has fully succeeded, so `.prev` always
      // holds a save that is known to be readable.
      stashSave(PREVIOUS_SAVE_KEY, raw);
      if (saveMigration) saveState(scene);
      scene.updateLevelBadge();
      return;
    } catch (error) {
      // The save is KEPT, not discarded. This catch covers the whole load,
      // not just the JSON.parse: any shape an older build wrote that a newer
      // one mishandles ends up here, and seeding a fresh board means the
      // next autosave is seconds away from overwriting real progress. The
      // copy survives that, so a player who reports "my game reset" can be
      // put back rather than consoled.
      stashSave(UNREADABLE_SAVE_KEY, raw);
      console.error(
        `[save] could not be loaded and was copied to "${UNREADABLE_SAVE_KEY}"`,
        error
      );
    }
  }
  // A fresh game begins with one physical source and a ready-made first
  // merge. Further sources arrive as goal rewards.
  //
  // The grid is CLEARED first because it is a scene field and survives
  // `scene.restart()`, while the views that draw it do not. Re-seeding onto
  // a grid that still held the previous run's cells placed nothing -
  // `seedLockedBoard` skips any cell that is not empty - so the locked items
  // existed as data with no views: invisible, and un-mergeable. The load
  // path above already clears for the same reason; only the seed path did
  // not, which is why one merge (and the save it writes) hid the bug.
  // A genuinely new game is the ONLY thing that gets the first-tap hint.
  scene.hasTappedSource = false;
  scene.grid.clear();
  scene.boardExpansionUnlocked.clear();
  scene.applyBoardExpansionLocks();
  const fullStarter = makeDispenser(TYPE_ID, 1, Date.now(), capacityForTier(TYPE_ID, 1));
  scene.placeSpawner({ col: 1, row: 1 }, TYPE_ID, 1, false, { kind: 'spawner', ...fullStarter });
  scene.placeTile({ col: 0, row: 0 }, TYPE_ID, 1, false);
  scene.placeTile({ col: 0, row: 1 }, TYPE_ID, 1, false);
  scene.placeTile({ col: 1, row: 0 }, TYPE_ID, 1, false);
  scene.placeTile({ col: 2, row: 1 }, TYPE_ID, 1, false);
  seedLockedBoard(scene, 0);
  scene.updateLevelBadge();
  // Persist the starting board immediately, so a rebuild - a rotation, a
  // resize, entering fullscreen - restores it through the load path instead
  // of seeding a second time.
  saveState(scene);
}

export function saveState(scene: BoardScene): void {
  const payload = {
    boardVersion: 10,
    xpCurve: XP_CURVE_VERSION,
    hasTappedSource: scene.hasTappedSource,
    grid: scene.grid.serialize(),
    economy: scene.economy,
    energy: scene.energy,
    orderState: scene.orderState,
    shopState: scene.shopState,
    dispenserCollectCount: scene.dispenserCollectCount,
    rewards: scene.rewards,
    collection: scene.collection,
    inventory: scene.inventory,
    forcedSpawnVault: scene.forcedSpawnVault,
    boardExpansion: { unlockedCells: [...scene.boardExpansionUnlocked] }
    ,projectStage: scene.projectStage
    ,builtPieces: [...scene.builtPieces]
    // Absolute, so the restock keeps running while the game is closed.
    ,supplyCooldownUntil: scene.supplyCooldownUntil
    ,supplyCooldownByTier: scene.supplyCooldownByTier
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}
