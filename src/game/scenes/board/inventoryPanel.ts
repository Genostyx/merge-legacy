import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { ROWS, familyTierLabel, spawnerPieceLabel, type BoardView } from './config';
import type { GridPosition } from '../../types';
import type { CratePayloadEntry } from '../../Grid';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyPill } from '../../ui/CurrencyGlyph';
import { drawBriefcase, drawCrate, drawTierIcon, iconPresentation } from '../../objects/TierIcons';
import { drawSpawnerPieceIcon, SpawnerPieceView } from '../../objects/SpawnerPieceView';
import { drawSplitterIcon, SplitterView } from '../../objects/SplitterView';
import { TileView } from '../../objects/TileView';
import { CrateView } from '../../objects/CrateView';
import { ResourceProducerView } from '../../objects/ResourceProducerView';
import { RESOURCE_PRODUCERS } from '../../rewards/ResourceRewards';
import { CRATE_LABELS, cratePayload, rollCrate, type CrateTier } from '../../rewards/Rewards';
import { getTierDef } from '../../data/chains';
import { playerLevel } from '../../levels/Orders';
import { spendGems } from '../../economy/Economy';
import {
  INVENTORY_GRID,
  INVENTORY_MAX_SLOTS,
  buySlot,
  freeSlots,
  isFull,
  retrieveItem,
  slotCost,
  storeItem,
  type StoredItem
} from '../../inventory/Inventory';

/**
 * inventoryPanel, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

export function inventoryButtonBounds(scene: BoardScene): Phaser.Geom.Rectangle {
  const x = scene.boardOriginX;
  const y = scene.boardOriginY + ROWS * scene.cellSize + scene.boardToTrayGap;
  // Generous on purpose: a drop target the size of the drawn chip is
  // fiddly to hit with a fingertip that is already holding a tile.
  return new Phaser.Geom.Rectangle(x - 3, y - 3, 48, 37);
}

export function isOverInventoryButton(scene: BoardScene, x: number, y: number): boolean {
  return Phaser.Geom.Rectangle.Contains(inventoryButtonBounds(scene), x, y);
}

/**
 * Moves a dragged board piece into storage. Returns false when it cannot
 * go - full inventory, or a locked tile - so the caller snaps it back.
 */
export function storeDraggedView(scene: BoardScene, view: BoardView, fromCell: GridPosition): boolean {
  const cell = scene.grid.get(fromCell);
  if (!cell) return false;

  let entry: StoredItem | null = null;
  let label = '';
  if (view instanceof CrateView && cell.kind === 'crate') {
    // Carries its REMAINING contents, so tidying a part-emptied crate away
    // never refills or resets it.
    // `readyAt` travels with it. Without this, storing a sealed supply crate
    // and taking it back out cleared its timer and it opened immediately -
    // and it also freed a SUPPLY_CRATE_LIMIT slot while still sealed, so the
    // cap could be sidestepped by shuffling crates through the inventory.
    entry = { kind: 'crate', tier: cell.tier, remaining: cell.remaining, readyAt: cell.readyAt };
    label = CRATE_LABELS[cell.tier as CrateTier];
  } else if (view instanceof ResourceProducerView && cell.kind === 'resource-producer') {
    entry = { kind: 'resource-producer', producerId: cell.producerId, remaining: cell.remaining, tier: 1 };
    label = RESOURCE_PRODUCERS[cell.producerId].label.toUpperCase();
  } else if (view instanceof TileView) {
    if (view.locked) {
      scene.refreshActionTray('LOCKED ITEMS CANNOT BE STORED\nMERGE A MATCH ONTO IT TO UNLOCK');
      return false;
    }
    entry = { kind: 'item', typeId: view.typeId, tier: view.tier };
    label = familyTierLabel(view.typeId, view.tier);
  } else if (view instanceof SpawnerPieceView) {
    entry = { kind: 'spawner-piece', typeId: view.typeId, tier: view.tier };
    label = spawnerPieceLabel(view.typeId, view.tier);
  } else if (view instanceof SplitterView && cell.kind === 'splitter') {
    // A Splitter is a one-shot TOOL, and the board is the scarcest thing in
    // the game - so being unable to put one aside meant an unspent Splitter
    // taxed a cell until it was used. Sources stay unstorable, which is a
    // different case: they are fixtures that produce where they stand.
    entry = { kind: 'splitter' };
    label = 'SPLITTER';
  }
  if (!entry) return false;

  if (!storeItem(scene.inventory, entry)) {
    scene.refreshActionTray(
      `INVENTORY FULL  ·  ${scene.inventory.slots}/${scene.inventory.slots}\nOPEN IT TO BUY A SLOT OR TAKE SOMETHING OUT`
    );
    return false;
  }

  scene.grid.set(fromCell, null);
  scene.views.delete(scene.keyOf(fromCell));
  if (scene.selectedItemKey === scene.keyOf(fromCell)) scene.selectedItemKey = null;
  view.destroy();
  refreshInventoryButton(scene);
  playInventoryNudge(scene);
  scene.tryDeliverMeterGold();
  scene.saveState();
  scene.refreshOrderBar();
  scene.checkDeadlock();
  scene.refreshActionTray(`${label} STORED\n${freeSlots(scene.inventory)} INVENTORY SLOTS FREE`);
  return true;
}

export function refreshInventoryButton(scene: BoardScene, hovered = false): void {
  if (!scene.invBg) return;
  const x = scene.boardOriginX;
  const y = scene.boardOriginY + ROWS * scene.cellSize + scene.boardToTrayGap;
  const full = isFull(scene.inventory);
  const accent = full ? Theme.accentAmber : Theme.textOnDarkMuted;

  // Drag-over enlargement expands evenly around the original centre while
  // staying inside the narrow control rail beside the information panel.
  const w = hovered ? 46 : 42;
  const h = hovered ? 35 : 31;
  const bx = x - (w - 42) / 2;
  const by = y - (h - 31) / 2;
  const hoverGrey = 0xe2e5e7;

  scene.invBg.clear();
  scene.invBg.fillStyle(Theme.bgElevated, 1);
  scene.invBg.fillRoundedRect(bx, by, w, h, Theme.radiusChip);
  scene.invBg.lineStyle(
    hovered ? Theme.borderWidthStrong : Theme.borderWidth,
    hovered ? hoverGrey : full ? accent : Theme.borderOnDark,
    1
  );
  scene.invBg.strokeRoundedRect(bx, by, w, h, Theme.radiusChip);
  scene.invIcon.clear();
  scene.invIcon.setPosition(bx + w / 2, by + h / 2);
  drawBriefcase(scene.invIcon, hovered ? 29 : 27, hovered ? hoverGrey : full ? accent : 0x9aa3ab);
  scene.invZone?.setPosition(bx + w / 2, by + h / 2).setSize(w, h);
}

/**
 * Drives the drop-target feedback. The tray carries it because it is the
 * one surface a fingertip is never on top of mid-drag; the button also
 * grows modestly from its centre and turns very light grey while targeted.
 */
export function setInventoryHover(scene: BoardScene, hovered: boolean): void {
  if (hovered === scene.overInventory) return;
  scene.overInventory = hovered;
  refreshInventoryButton(scene, hovered);
  if (hovered) {
    scene.refreshActionTray(
      isFull(scene.inventory)
        ? `INVENTORY FULL  ·  ${scene.inventory.slots}/${scene.inventory.slots}
RELEASE TO PUT IT BACK`
        : `RELEASE TO STORE
${freeSlots(scene.inventory)} INVENTORY SLOTS FREE`
    );
  } else {
    scene.refreshActionTray();
  }
}

/** A small jolt when something drops in, so the store visibly lands. */
export function playInventoryNudge(scene: BoardScene): void {
  if (!scene.invIcon) return;
  scene.tweens.killTweensOf(scene.invIcon);
  scene.invIcon.setAngle(0);
  scene.tweens.add({
    targets: scene.invIcon,
    angle: { from: -7, to: 7 },
    duration: 55,
    yoyo: true,
    repeat: 1,
    ease: 'Sine.InOut',
    onComplete: () => scene.invIcon.setAngle(0)
  });
}

/**
 * Takes a crate out of storage and puts it on the BOARD. It is not opened
 * here - a crate can only be opened where it sits, one tap at a time, so
 * the reveal happens on the board rather than in a modal that hands over
 * everything at once.
 */
export function deployStoredCrate(scene: BoardScene, index: number, tier: CrateTier, kept?: CratePayloadEntry[], readyAt?: number): void {
  const empties = scene.grid.emptyCells();
  if (empties.length === 0) {
    scene.refreshActionTray('BOARD FULL  ·  MAKE SPACE FIRST\nTHE CRATE IS SAFE IN YOUR INVENTORY');
    return;
  }
  retrieveItem(scene.inventory, index);
  // Rolled ONCE, here, and stored in the cell. Rolling at open time would
  // re-roll the contents on every reload part-way through emptying it.
  const payload = kept ?? cratePayload(rollCrate(
    tier, playerLevel(scene.orderState), Math.random, scene.ownedDispenserTypeIds()
  ));
  const pos = scene.firstFreeCellInReadingOrder() ?? empties[0];
  // An absolute timestamp, so the wait kept running while it sat in the
  // inventory rather than pausing or restarting.
  scene.placeCrate(pos, tier, payload, readyAt).playArrive();
  refreshInventoryButton(scene);
  scene.saveState();
  scene.refreshActionTray(
    `${CRATE_LABELS[tier]} PLACED\nTAP IT TO TAKE OUT ONE THING AT A TIME`
  );
}

/** Puts a stored item back on the board, if there is a free cell. */
export function retrieveStoredItem(scene: BoardScene, index: number): void {
  const empties = scene.grid.emptyCells();
  if (empties.length === 0) {
    scene.refreshActionTray('BOARD FULL  ·  MAKE SPACE FIRST\nTHE ITEM IS SAFE IN YOUR INVENTORY');
    return;
  }
  const item = retrieveItem(scene.inventory, index);
  if (!item || item.kind === 'crate') return;
  const pos = empties[Math.floor(Math.random() * empties.length)];
  if (item.kind === 'item') scene.placeTile(pos, item.typeId, item.tier, true);
  else if (item.kind === 'spawner-piece') scene.placeSpawnerPiece(pos, item.typeId, item.tier, true);
  else if (item.kind === 'splitter') scene.placeSplitter(pos, true);
  else scene.placeResourceProducer(pos, item.producerId, item.remaining, true);
  refreshInventoryButton(scene);
  scene.updateLevelBadge();
  scene.saveState();
  scene.refreshOrderBar();
  const label = item.kind === 'item'
    ? familyTierLabel(item.typeId, item.tier)
    : item.kind === 'spawner-piece'
      ? spawnerPieceLabel(item.typeId, item.tier)
      : item.kind === 'splitter'
        ? 'SPLITTER'
        : RESOURCE_PRODUCERS[item.producerId].label.toUpperCase();
  scene.refreshActionTray(`${label} RETRIEVED`);
}

/**
 * The inventory panel: one tile per slot, filled slots drawn with their
 * real icon so storage reads like a shelf rather than a list, plus the
 * next slot's gem price.
 */
export function showInventory(scene: BoardScene, initialScroll = 0): void {
  if (scene.modalOpen || scene.inputLocked) return;
  scene.modalOpen = true;

  const COLS_N = INVENTORY_GRID;
  const CELL = 72;
  const rows = Math.ceil(INVENTORY_MAX_SLOTS / COLS_N);
  const W = COLS_N * CELL + 40;
  const H = Math.min(scene.scale.height - 40, 96 + INVENTORY_GRID * CELL);

  const overlay = scene.add.rectangle(
    scene.scale.width / 2, scene.scale.height / 2, scene.scale.width, scene.scale.height, 0x000000, 0.6
  ).setDepth(3000).setInteractive();
  const card = scene.add.container(scene.scale.width / 2, scene.scale.height / 2).setDepth(3001);
  const bg = scene.add.graphics();
  bg.fillStyle(Theme.bgElevated, 1);
  bg.fillRoundedRect(-W / 2, -H / 2, W, H, Theme.radiusPanel);
  bg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
  bg.strokeRoundedRect(-W / 2, -H / 2, W, H, Theme.radiusPanel);
  const titleIcon = scene.add.graphics().setPosition(-50, -H / 2 + 18);
  drawBriefcase(titleIcon, 26, Theme.textOnDarkMuted);
  card.add([bg, titleIcon, scene.add.text(-36, -H / 2 + 18, 'INVENTORY', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '16px', fontStyle: 'bold', color: hex(Theme.textOnDark)
  }).setOrigin(0, 0.5)]);

  const gridTop = -H / 2 + 40;
  const viewportBottom = H / 2 - 38;
  const viewportH = viewportBottom - gridTop;
  const content = scene.add.container(0, 0);
  const maskShape = scene.add.graphics().setVisible(false);
  maskShape.fillStyle(0xffffff).fillRect(
    card.x - W / 2 + 10,
    card.y + gridTop,
    W - 20,
    viewportH
  );
  content.setMask(maskShape.createGeometryMask());
  card.add(content);
  let scroll = 0;
  const maxScroll = Math.max(0, rows * CELL - viewportH);
  const setScroll = (value: number): void => {
    scroll = Phaser.Math.Clamp(value, 0, maxScroll);
    content.y = -scroll;
  };
  setScroll(initialScroll);
  let inventoryItemPressed = false;
  let scrolling = false;
  let scrollStartY = 0;
  let scrollStart = 0;
  const onScrollDown = (pointer: Phaser.Input.Pointer): void => {
    if (inventoryItemPressed) return;
    if (pointer.x < card.x - W / 2 + 10 || pointer.x > card.x + W / 2 - 10
      || pointer.y < card.y + gridTop || pointer.y > card.y + viewportBottom) return;
    scrolling = true;
    scrollStartY = pointer.y;
    scrollStart = scroll;
  };
  const onScrollMove = (pointer: Phaser.Input.Pointer): void => {
    if (!scrolling || inventoryItemPressed) return;
    setScroll(scrollStart + scrollStartY - pointer.y);
  };
  const onScrollUp = (): void => { scrolling = false; };
  const onScrollWheel = (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void => {
    if (pointer.x < card.x - W / 2 || pointer.x > card.x + W / 2
      || pointer.y < card.y + gridTop || pointer.y > card.y + viewportBottom) return;
    setScroll(scroll + dy * 0.55);
  };
  scene.input.on('pointerdown', onScrollDown);
  scene.input.on('pointermove', onScrollMove);
  scene.input.on('pointerup', onScrollUp);
  scene.input.on('wheel', onScrollWheel);
  const slotAtPointer = (x: number, y: number): number | null => {
    const localX = x - card.x + W / 2 - 20;
    const localY = y - card.y - content.y - gridTop;
    const col = Math.floor(localX / CELL);
    const row = Math.floor(localY / CELL);
    if (col < 0 || col >= COLS_N || row < 0 || row >= rows) return null;
    const slot = row * COLS_N + col;
    return slot < scene.inventory.slots ? slot : null;
  };

  const dismiss = () => {
    scene.input.off('pointerdown', onScrollDown);
    scene.input.off('pointermove', onScrollMove);
    scene.input.off('pointerup', onScrollUp);
    scene.input.off('wheel', onScrollWheel);
    maskShape.destroy();
    overlay.destroy();
    card.destroy();
    scene.modalOpen = false;
    scene.refreshActionTray();
  };
  const reopen = () => {
    const preservedScroll = scroll;
    dismiss();
    scene.time.delayedCall(0, () => showInventory(scene, preservedScroll));
  };

  const nextCost = slotCost(scene.inventory.slots);
  // Every cell of the 3x3 is drawn from the start. Owned slots are live,
  // the NEXT one carries its gem price, and the rest are shown locked
  // without a price - one number to act on rather than a wall of them.
  for (let slot = 0; slot < INVENTORY_MAX_SLOTS; slot++) {
    const cx = -W / 2 + 20 + (slot % COLS_N) * CELL + CELL / 2;
    const cy = gridTop + Math.floor(slot / COLS_N) * CELL + CELL / 2;
    const owned = slot < scene.inventory.slots;
    const isNext = slot === scene.inventory.slots && nextCost !== null;
    const item = owned ? scene.inventory.items[slot] : undefined;

    const cell = scene.add.graphics();
    const inset = 5;
    const box: [number, number, number, number] = [
      cx - CELL / 2 + inset, cy - CELL / 2 + inset, CELL - inset * 2, CELL - inset * 2
    ];
    cell.fillStyle(owned ? (item ? Theme.bg : Theme.panelAlt) : Theme.bg, owned && item ? 0.85 : 0.3);
    cell.fillRoundedRect(...box, Theme.radiusChip);
    cell.lineStyle(
      1,
      isNext ? Theme.currencyGem : Theme.borderOnDark,
      owned ? 1 : isNext ? 0.9 : 0.35
    );
    cell.strokeRoundedRect(...box, Theme.radiusChip);
    content.add(cell);

    if (item) {
      const icon = scene.add.graphics();
      let visual: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image | Phaser.GameObjects.Container = icon;
      const size = CELL - 26;
      if (item.kind === 'crate') {
        drawCrate(icon, size, item.tier);
        icon.setPosition(cx, cy);
      } else if (item.kind === 'resource-producer') {
        const image = scene.add.image(cx, cy, RESOURCE_PRODUCERS[item.producerId].textureKey).setDisplaySize(size, size);
        visual = image;
        content.add(image);
      } else if (item.kind === 'splitter') {
        drawSplitterIcon(icon, size * 0.9);
        icon.setPosition(cx, cy);
      } else if (item.kind === 'spawner-piece') {
        drawSpawnerPieceIcon(icon, item.typeId, item.tier, size);
        icon.setPosition(cx, cy - 2);
      } else if (item.typeId.startsWith('currency-') && !(item.typeId === 'currency-credit' && item.tier >= 3)) {
        const textureKey = item.typeId === 'currency-credit'
          ? 'currency-coin'
          : item.typeId === 'currency-gem'
            ? 'currency-gem'
            : 'currency-energy';
        const count = item.tier === 1 ? 1 : item.tier === 2 ? 2 : Math.min(6, item.tier + 1);
        const positions: [number, number][] = [
          [0, 4], [-10, 7], [10, 0], [-6, -9], [8, -11], [1, 12]
        ];
        const currencyIcon = scene.add.container(cx, cy);
        const iconSize = CELL * (item.tier <= 2 ? 0.52 : 0.36);
        for (let i = count - 1; i >= 0; i--) {
          const [x, y] = positions[i];
          currencyIcon.add(scene.add.image(x, y, textureKey).setDisplaySize(iconSize, iconSize));
        }
        visual = currencyIcon;
        content.add(currencyIcon);
      } else {
        const def = getTierDef(item.typeId, item.tier);
        const { materialAlpha } = drawTierIcon(
          icon, item.typeId, item.tier, size, materialLighting(def?.color ?? Theme.panelAlt, item.tier)
        );
        icon.setAlpha(materialAlpha);
        const present = iconPresentation(item.typeId, item.tier, size);
        icon.setScale(present.scale).setPosition(cx + present.offsetX, cy - 4 + present.offsetY);
      }
      const hit = scene.add.zone(cx, cy, CELL - 10, CELL - 10).setInteractive({ useHandCursor: true });
      scene.input.setDraggable(hit);
      let wasDragged = false;
      let pressX = 0;
      let pressY = 0;
      hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        inventoryItemPressed = true;
        pressX = pointer.x;
        pressY = pointer.y;
      });
      hit.on('drag', (pointer: Phaser.Input.Pointer) => {
        if (!wasDragged && Phaser.Math.Distance.Between(pressX, pressY, pointer.x, pointer.y) <= 6) return;
        if (!wasDragged) {
          wasDragged = true;
          content.bringToTop(visual);
          content.bringToTop(hit);
        }
        visual.setPosition(pointer.x - card.x, pointer.y - card.y - content.y);
      });
      hit.on('dragend', (pointer: Phaser.Input.Pointer) => {
        inventoryItemPressed = false;
        if (!wasDragged) return;
        const target = slotAtPointer(pointer.x, pointer.y);
        if (target === null || target === slot) {
          visual.setPosition(cx, cy);
          return;
        }
        const items = scene.inventory.items;
        if (target < items.length) {
          [items[slot], items[target]] = [items[target], items[slot]];
        } else {
          const [movedItem] = items.splice(slot, 1);
          items.splice(Math.min(target, items.length), 0, movedItem);
        }
        scene.saveState();
        reopen();
      });
      hit.on('pointerup', () => {
        inventoryItemPressed = false;
        if (wasDragged) return;
        scene.time.delayedCall(0, () => {
          if (item.kind === 'crate') deployStoredCrate(scene, slot, item.tier as CrateTier, item.remaining, item.readyAt);
          else retrieveStoredItem(scene, slot);
          reopen();
        });
      });
      content.add([icon, hit]);
    } else if (isNext) {
      // Priced in full colour whether or not the player can afford it. A
      // greyed-out price reads as "not for sale"; this one is for sale, and
      // the answer to not having the gems is the gem store, not a dead
      // button.
      // A labelled buy PILL rather than a bare number: the word says what
      // the price does, and putting the cost on a filled chip is what makes
      // it read as a button instead of a caption.
      const unlockLabel = scene.add.text(cx, cy - 20, 'UNLOCK', {
        resolution: textResolution,
        fontFamily: Theme.fontHeading, fontSize: '11px', fontStyle: 'bold',
        color: hex(Theme.textOnDark)
      }).setOrigin(0.5);

      const pillGroup = currencyPill(scene, `${nextCost}`, 'gem').setPosition(cx, cy + 6);

      // The WHOLE cell is the target. The hit area used to be the price
      // text itself, which is a ~20px sliver next to the glyph - the cell
      // looks like a button and has to behave like one.
      const buyHit = scene.add.zone(cx, cy, CELL - 10, CELL - 10)
        .setInteractive({ useHandCursor: true });
      buyHit.on('pointerdown', () => scene.time.delayedCall(0, () => {
        const result = buySlot(scene.inventory, (amount) => spendGems(scene.economy, amount));
        if (!result.ok) {
          // Short of gems: go where the gems are, rather than reporting a
          // shortfall and leaving the player to find the store themselves.
          dismiss();
          scene.openShop('gem');
          return;
        }
        scene.updateCurrencyText();
        refreshInventoryButton(scene);
        scene.saveState();
        reopen();
      }));
      content.add([unlockLabel, pillGroup, buyHit]);
    } else if (!owned) {
      content.add(scene.add.text(cx, cy, '·', {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric, fontSize: '14px', color: hex(Theme.borderOnDark)
      }).setOrigin(0.5));
    }
  }

  const close = scene.add.text(0, H / 2 - 18, 'CLOSE', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  card.add(close);
  overlay.on('pointerdown', () => scene.time.delayedCall(0, dismiss));
  close.on('pointerdown', () => scene.time.delayedCall(0, dismiss));
}
