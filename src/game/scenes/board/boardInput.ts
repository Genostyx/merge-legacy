import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import {
  DRAG_START_PX,
  ROWS,
  familyTierLabel,
  sourceTierLabel,
  spawnerPieceLabel,
  type BoardView
} from './config';
import type { GridPosition } from '../../types';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { drawTierIcon, iconPresentation } from '../../objects/TierIcons';
import { CRATE_LABELS } from '../../rewards/Rewards';
import { TileView } from '../../objects/TileView';
import { SpawnerView } from '../../objects/SpawnerView';
import { SpawnerPieceView } from '../../objects/SpawnerPieceView';
import { SplitterView } from '../../objects/SplitterView';
import { CrateView } from '../../objects/CrateView';
import { ResourceProducerView } from '../../objects/ResourceProducerView';
import { getTierDef, isCurrencyChain, spawnerPieceTiers } from '../../data/chains';
import { burstParticles, shakeForTier } from '../../fx/MergeFx';
import { playerLevel, syncOrderSlots, xpForMergeTier } from '../../levels/Orders';
import { MAX_DISPENSER_TIER, mergeDispenserPair } from '../../dispensers/Dispensers';

/**
 * boardInput, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

export function selectItem(scene: BoardScene, key: string): void {
  if (scene.selectedItemKey) {
    const previous = scene.views.get(scene.selectedItemKey);
    if (previous instanceof TileView || previous instanceof SpawnerPieceView) previous.setSelected(false);
  }
  const next = scene.views.get(key);
  if (next instanceof CrateView) {
    scene.selectedItemKey = key;
    scene.rushTargetKey = null;
    scene.refreshActionTray();
    return;
  }
  if (!(next instanceof TileView) && !(next instanceof SpawnerPieceView)) {
    scene.selectedItemKey = null;
    scene.refreshActionTray();
    return;
  }
  scene.selectedItemKey = key;
  next.setSelected(true);
  scene.refreshActionTray();
}

export function onPointerDown(scene: BoardScene, pointer: Phaser.Input.Pointer): void {
  if (scene.inputLocked || scene.modalOpen) return;
  const cell = scene.worldToCell(pointer.x, pointer.y);
  if (!cell) return;
  const key = scene.keyOf(cell);
  const view = scene.views.get(key);
  if (!view) return;
  if (view instanceof TileView && view.locked) {
    const def = getTierDef(view.typeId, view.tier);
    scene.refreshActionTray(
      `LOCKED ${def?.label?.toUpperCase() ?? 'ITEM'}  ·  ${familyTierLabel(view.typeId, view.tier)}\n` +
      'MERGE A MATCH ONTO IT TO UNLOCK'
    );
    return;
  }
  scene.draggingView = view;
  scene.dragFromCell = cell;
  scene.dragStartPointer = { x: pointer.x, y: pointer.y };
  // Deliberately NOT picked up here - see `DRAG_START_PX`. The lift, the
  // scale-up and the raise to the top all wait until the finger has moved
  // far enough to mean it.
  scene.dragActive = false;
}

export function onPointerMove(scene: BoardScene, pointer: Phaser.Input.Pointer): void {
  // Order-bar flick. Checked before the tile drag because the bar sits
  // outside the board and can never own a tile.
  if (scene.orderDrag.active) {
    const dx = pointer.x - scene.orderDrag.startX;
    scene.orderDrag.moved = Math.max(scene.orderDrag.moved, Math.abs(dx));
    scene.setOrderScroll(scene.orderDrag.startScroll - dx);
    return;
  }
  if (!scene.draggingView) return;
  if (!scene.dragActive) {
    const travelled = Math.hypot(
      pointer.x - scene.dragStartPointer.x,
      pointer.y - scene.dragStartPointer.y
    );
    if (travelled < DRAG_START_PX) return;
    scene.dragActive = true;
    scene.draggingView.state = 'dragging';
    scene.children.bringToTop(scene.draggingView);
    scene.draggingView.setScale(1.08);
  }
  scene.draggingView.setPosition(pointer.x, pointer.y);

  // Merge-ready highlight: a thin acid-green pulse on whatever tile is
  // currently under the drag, but only while it's a legal merge target -
  // purely visual, driven by the same typeId+tier check onPointerUp
  // already makes, so it can't diverge from the real merge rule.
  // Live feedback on the drop target, so storage is discoverable at all.
  scene.setInventoryHover(scene.isOverInventoryButton(pointer.x, pointer.y));

  const hoverCell = scene.worldToCell(pointer.x, pointer.y);
  const hoverView = hoverCell ? scene.views.get(scene.keyOf(hoverCell)) : undefined;
  const isLegalTarget = !!hoverView && canMergeViews(scene, scene.draggingView, hoverView);

  const nextTarget = isLegalTarget ? hoverView! : null;
  if (nextTarget !== scene.mergeReadyTarget) {
    if (scene.mergeReadyTarget instanceof TileView || scene.mergeReadyTarget instanceof SpawnerView || scene.mergeReadyTarget instanceof SpawnerPieceView) {
      scene.mergeReadyTarget.setMergeReady(false);
    }
    scene.mergeReadyTarget = nextTarget;
    if (scene.mergeReadyTarget instanceof TileView || scene.mergeReadyTarget instanceof SpawnerView || scene.mergeReadyTarget instanceof SpawnerPieceView) {
      scene.mergeReadyTarget.setMergeReady(true);
    }
  }
}

export async function onPointerUp(scene: BoardScene, pointer: Phaser.Input.Pointer): Promise<void> {
  // An order card only submits on a TAP. Without this, flicking the bar
  // sideways to reach a later order would fire whichever card the flick
  // happened to start on - the same rule the shop's scrolling list uses.
  if (scene.orderDrag.active) {
    const { slot, moved, describe } = scene.orderDrag;
    scene.orderDrag = { active: false, slot: -1, startX: 0, startScroll: 0, moved: 0, describe: null };
    if (moved > 6) return;
    // Tapping the ITEM on a card asks what it is; tapping the card asks to
    // deliver it. Same description the board gives for the same item, so
    // the card is a place to learn the ladder rather than only to read a
    // target off.
    if (describe) scene.describeOrderItem(describe.typeId, describe.tier);
    else scene.submitOrderSlot(slot);
    return;
  }

  const view = scene.draggingView;
  // Captured before it is cleared: the release path below asks whether the
  // piece was ever actually picked up, which is what separates a tap from a
  // drag that wandered and came back to its own cell.
  const wasDragging = scene.dragActive;
  const fromCell = scene.dragFromCell;
  scene.draggingView = null;
  scene.dragActive = false;
  scene.dragFromCell = null;
  if (scene.mergeReadyTarget instanceof TileView || scene.mergeReadyTarget instanceof SpawnerView || scene.mergeReadyTarget instanceof SpawnerPieceView) {
    scene.mergeReadyTarget.setMergeReady(false);
  }
  scene.mergeReadyTarget = null;
  if (!view || !fromCell) return;

  const fromWorld = scene.cellToWorld(fromCell);

  // Dropped on the briefcase: storage is a DRAG target, not a button in
  // the tray. The tray version could not work for a crate at all - the tap
  // that selected it also dispensed from it, so the button only appeared
  // after the crate had already given something up.
  scene.setInventoryHover(false);
  if (scene.isOverInventoryButton(pointer.x, pointer.y)) {
    if (scene.storeDraggedView(view, fromCell)) return;
    view.setScale(1);
    await view.snapTo(fromWorld.x, fromWorld.y);
    view.state = 'idle';
    return;
  }

  const targetCell = scene.worldToCell(pointer.x, pointer.y);

  if (!targetCell || (targetCell.col === fromCell.col && targetCell.row === fromCell.row)) {
    view.setScale(1);
    await view.snapTo(fromWorld.x, fromWorld.y);
    view.state = 'idle';
    // Landing back on the starting cell is only a TAP if the piece was
    // never picked up at all. Carrying a crate around and setting it back
    // down was dispensing from it, because "same cell" was being treated as
    // "tapped" no matter how far it had travelled.
    if (targetCell && !wasDragging) {
      if (view instanceof CrateView) scene.tapCrate(view);
      else if (view instanceof ResourceProducerView) scene.tapResourceProducer(view);
      else if (view instanceof SpawnerView) scene.spawnFromSpawner(view);
      else if (view instanceof TileView && (
        isCurrencyChain(view.typeId) ||
        (view.typeId === 'water' && getTierDef('water', view.tier + 1) == null)
      )) {
        const key = scene.keyOf(fromCell);
        const now = Date.now();
        if (scene.lastCurrencyTap?.key === key && now - scene.lastCurrencyTap.at <= 360) {
          scene.lastCurrencyTap = null;
          if (view.typeId === 'water') scene.collectFinalWater(view);
          else scene.collectCurrencyItem(view);
        } else {
          scene.lastCurrencyTap = { key, at: now };
          selectItem(scene, key);
        }
      } else selectItem(scene, scene.keyOf(fromCell));
    }
    return;
  }

  const targetKey = scene.keyOf(targetCell);
  const targetView = scene.views.get(targetKey);

  if (!targetView) {
    if (scene.grid.isBlocked(targetCell)) {
      view.setScale(1);
      await view.snapTo(fromWorld.x, fromWorld.y);
      view.state = 'idle';
      scene.refreshActionTray('BOARD TILE LOCKED\nTAP THE LOCKED TILE TO VIEW ITS REQUIREMENT');
      return;
    }
    const movingData = scene.grid.get(fromCell);
    if (!movingData) return;
    scene.grid.set(fromCell, null);
    scene.grid.set(targetCell, movingData);
    scene.views.delete(scene.keyOf(fromCell));
    scene.views.set(targetKey, view);
    view.setGridPos(targetCell);
    if (scene.selectedItemKey === scene.keyOf(fromCell)) scene.selectedItemKey = targetKey;
    const worldTarget = scene.cellToWorld(targetCell);
    view.setScale(1);
    await view.snapTo(worldTarget.x, worldTarget.y);
    view.state = 'idle';
    scene.saveState();
    scene.refreshActionTray();
    return;
  }

  if (view instanceof SplitterView && targetView instanceof TileView && canMergeViews(scene, view, targetView)) {
    view.setScale(1);
    await view.snapTo(fromWorld.x, fromWorld.y);
    view.state = 'idle';
    showSplitConfirmation(scene, view, targetView, fromCell, targetCell);
    return;
  }

  if (view instanceof TileView && targetView instanceof TileView && canMergeViews(scene, view, targetView)) {
    const nextDef = getTierDef(view.typeId, view.tier + 1);
    if (!nextDef) return;
    const unlockedItem = targetView.locked;
    scene.inputLocked = true;
    const worldTarget = scene.cellToWorld(targetCell);
    view.setScale(1);
    await view.snapTo(worldTarget.x, worldTarget.y);

    scene.grid.set(fromCell, null);
    scene.views.delete(scene.keyOf(fromCell));
    if (scene.selectedItemKey === scene.keyOf(fromCell) || scene.selectedItemKey === targetKey) scene.selectedItemKey = null;

    await Promise.all([view.playMergeOutAndDestroy(), targetView.playMergeOutAndDestroy()]);
    scene.views.delete(targetKey);

    burstParticles(scene, worldTarget.x, worldTarget.y, nextDef.color, nextDef.tier);
    shakeForTier(scene, nextDef.tier);
    const normalMergeXp = xpForMergeTier(nextDef.tier);
    const mergeXp = view.typeId === 'water' ? Math.max(1, Math.floor(normalMergeXp / 2)) : normalMergeXp;
    const levelBefore = playerLevel(scene.orderState);

    scene.placeTile(targetCell, view.typeId, nextDef.tier, true);
    scene.orderState.totalXp += mergeXp;
    const levelAfter = playerLevel(scene.orderState);
    // Merge XP can push the player over a level boundary, which may have
    // earned another order slot. advanceOrder syncs on its own path; this
    // is the other way XP is gained.
    syncOrderSlots(scene.orderState, scene.dispenserCollectCount, scene.ownedDispenserTypeIds());
    const automaticLevelRewards = levelAfter > levelBefore ? scene.autoDeliverLevelRewards() : [];
    scene.updateCurrencyText();
    scene.updateLevelBadge();
    scene.inputLocked = false;
    scene.saveState();
    scene.refreshOrderBar();
    scene.checkDeadlock();
    scene.tryDeliverMeterGold();
    const newest = automaticLevelRewards[automaticLevelRewards.length - 1];
    scene.refreshActionTray(
      newest
        ? `LEVEL ${levelAfter} REACHED  ·  ${CRATE_LABELS[newest.tier]} DELIVERED`
        : unlockedItem
          ? `ITEM UNLOCKED  ·  ${nextDef.label.toUpperCase()}\nNEW BOARD SPACE RECOVERED`
          : undefined
    );
    return;
  }

  if (view instanceof SpawnerPieceView && targetView instanceof SpawnerPieceView && canMergeViews(scene, view, targetView)) {
    scene.inputLocked = true;
    const worldTarget = scene.cellToWorld(targetCell);
    view.setScale(1);
    await view.snapTo(worldTarget.x, worldTarget.y);

    scene.grid.set(fromCell, null);
    scene.views.delete(scene.keyOf(fromCell));
    if (scene.selectedItemKey === scene.keyOf(fromCell) || scene.selectedItemKey === targetKey) scene.selectedItemKey = null;

    await Promise.all([view.playMergeOutAndDestroy(), targetView.playMergeOutAndDestroy()]);
    scene.views.delete(targetKey);

    // Tier 1 as the second fallback, before amber: a one-tier family like
    // the Decagon has no tier+1 to look up, so its merge burst came out in
    // the generic accent instead of its own colour.
    const color = getTierDef(view.typeId, Math.min(view.tier + 1, 9))?.color
      ?? getTierDef(view.typeId, 1)?.color
      ?? Theme.accentAmber;
    burstParticles(scene, worldTarget.x, worldTarget.y, color, Math.min(view.tier + 1, 5));
    // The Decagon takes five piece tiers, not four, so the tier that
    // promotes into a source is a per-family number rather than a constant.
    const topPiece = spawnerPieceTiers(view.typeId);
    const message = view.tier >= topPiece
      ? `${sourceTierLabel(view.typeId, 1)} BUILT\nTAP IT TO PRODUCE ${familyTierLabel(view.typeId, 1)}`
      : `${spawnerPieceLabel(view.typeId, view.tier + 1)} BUILT`;
    if (view.tier >= topPiece) {
      scene.placeSpawner(targetCell, view.typeId, 1, true);
    } else {
      scene.placeSpawnerPiece(targetCell, view.typeId, view.tier + 1, true);
    }
    scene.inputLocked = false;
    scene.saveState();
    scene.tryDeliverMeterGold();
    scene.refreshOrderBar();
    scene.checkDeadlock();
    scene.refreshActionTray(message);
    return;
  }

  if (view instanceof SpawnerView && targetView instanceof SpawnerView && canMergeViews(scene, view, targetView)) {
    scene.inputLocked = true;
    const worldTarget = scene.cellToWorld(targetCell);
    view.setScale(1);
    await view.snapTo(worldTarget.x, worldTarget.y);
    const mergedSpawner = mergeDispenserPair(view.spawner, targetView.spawner);
    const nextTier = mergedSpawner.tier;
    const typeId = mergedSpawner.typeId;

    scene.grid.set(fromCell, null);
    scene.views.delete(scene.keyOf(fromCell));
    await Promise.all([view.playMergeOutAndDestroy(), targetView.playMergeOutAndDestroy()]);
    scene.views.delete(targetKey);

    const color = getTierDef(typeId, Math.min(nextTier, 9))?.color ?? Theme.accentAmber;
    burstParticles(scene, worldTarget.x, worldTarget.y, color, nextTier);
    scene.placeSpawner(targetCell, typeId, nextTier, true, { kind: 'spawner', ...mergedSpawner });
    scene.inputLocked = false;
    scene.saveState();
    scene.tryDeliverMeterGold();
    scene.refreshActionTray(
      `SOURCE UPGRADED  ·  ${sourceTierLabel(view.spawner.typeId, nextTier)}\n` +
      `MINIMUM OUTPUT  ·  ${familyTierLabel(view.spawner.typeId, nextTier)}`
    );
    return;
  }

  // Nothing merged. A locked target can't move (it's pinned to its cell
  // until a matching merge clears it), so that still snaps back - with a
  // reason, since a silent snap-back reads as the drag being dropped.
  if (targetView instanceof TileView && targetView.locked) {
    const def = getTierDef(targetView.typeId, targetView.tier);
    view.setScale(1);
    await view.snapTo(fromWorld.x, fromWorld.y);
    view.state = 'idle';
    scene.refreshActionTray(
      `LOCKED ${def?.label?.toUpperCase() ?? 'ITEM'}  ·  ${familyTierLabel(targetView.typeId, targetView.tier)}\n` +
      'MERGE A MATCH ONTO IT TO UNLOCK'
    );
    return;
  }

  await swapCells(scene, view, targetView, fromCell, targetCell);
}

/**
 * Trades two occupied cells when a drag lands on something it can't merge
 * with. Previously any non-matching drop just snapped back, which made
 * rearranging the board impossible - the only way to move a piece was
 * onto an empty cell, so a full board couldn't be reorganised at all.
 *
 * Locked items are excluded by the caller: they're pinned to their cell
 * until a matching merge clears them.
 */
export async function swapCells(
scene: BoardScene,
  view: BoardView,
  targetView: BoardView,
  fromCell: GridPosition,
  targetCell: GridPosition
): Promise<void> {
  const fromKey = scene.keyOf(fromCell);
  const targetKey = scene.keyOf(targetCell);
  const movingData = scene.grid.get(fromCell);
  const targetData = scene.grid.get(targetCell);
  const fromWorld = scene.cellToWorld(fromCell);
  const targetWorld = scene.cellToWorld(targetCell);

  if (!movingData || !targetData) {
    view.setScale(1);
    await view.snapTo(fromWorld.x, fromWorld.y);
    view.state = 'idle';
    return;
  }

  scene.grid.set(fromCell, targetData);
  scene.grid.set(targetCell, movingData);
  scene.views.set(fromKey, targetView);
  scene.views.set(targetKey, view);
  view.setGridPos(targetCell);
  targetView.setGridPos(fromCell);

  // Selection follows whichever piece the player was holding.
  if (scene.selectedItemKey === fromKey) scene.selectedItemKey = targetKey;
  else if (scene.selectedItemKey === targetKey) scene.selectedItemKey = fromKey;

  view.setScale(1);
  await Promise.all([
    view.snapTo(targetWorld.x, targetWorld.y),
    targetView.snapTo(fromWorld.x, fromWorld.y)
  ]);
  view.state = 'idle';
  targetView.state = 'idle';

  scene.saveState();
  scene.refreshActionTray();
}

export function showSplitConfirmation(
scene: BoardScene,
  splitter: SplitterView,
  target: TileView,
  splitterCell: GridPosition,
  targetCell: GridPosition
): void {
  if (scene.modalOpen || target.tier < 2) return;
  const def = getTierDef(target.typeId, target.tier);
  const lower = getTierDef(target.typeId, target.tier - 1);
  if (!def || !lower) return;
  scene.modalOpen = true;
  const overlay = scene.add.container(0, 0).setDepth(3300);
  const cx = scene.scale.width / 2;
  const cy = scene.scale.height / 2;
  const w = Math.min(340, scene.scale.width - 36);
  const h = 280;
  const dim = scene.add.rectangle(cx, cy, scene.scale.width, scene.scale.height, 0x000000, 0.7).setInteractive();
  const panel = scene.add.graphics();
  panel.fillStyle(Theme.bgElevated, 1);
  panel.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, Theme.radiusPanel);
  panel.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
  panel.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, Theme.radiusPanel);
  const title = scene.add.text(cx, cy - h / 2 + 28, 'SPLIT THIS ITEM?', {
    resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '18px', fontStyle: 'bold', color: hex(Theme.textOnDark)
  }).setOrigin(0.5);
  const subtitle = scene.add.text(cx, cy - h / 2 + 51, `TURN ${def.label.toUpperCase()} INTO TWO ${lower.label.toUpperCase()}`, {
    resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px', color: hex(Theme.textOnDarkMuted), align: 'center'
  }).setOrigin(0.5);
  const icon = scene.add.graphics().setPosition(cx, cy - 20);
  const iconSize = 82;
  const render = drawTierIcon(icon, target.typeId, target.tier, iconSize, materialLighting(def.color, def.tier));
  const present = iconPresentation(target.typeId, target.tier, iconSize);
  icon.setAlpha(render.materialAlpha).setScale(present.scale);
  icon.x += present.offsetX;
  icon.y += present.offsetY;

  const button = (x: number, label: string, color: number): { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone } => {
    const bw = 116, bh = 38;
    const bg = scene.add.graphics();
    bg.fillStyle(Theme.panelAlt, 1).fillRoundedRect(x - bw / 2, cy + 82, bw, bh, Theme.radiusChip);
    bg.lineStyle(1, color, 0.9).strokeRoundedRect(x - bw / 2, cy + 82, bw, bh, Theme.radiusChip);
    const text = scene.add.text(x, cy + 101, label, {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold', color: hex(color)
    }).setOrigin(0.5);
    const zone = scene.add.zone(x, cy + 101, bw, bh).setInteractive({ useHandCursor: true });
    return { bg, text, zone };
  };
  const cancel = button(cx - 68, 'CANCEL', Theme.textOnDarkMuted);
  const confirm = button(cx + 68, 'SPLIT', Theme.currencyGem);
  overlay.add([dim, panel, title, subtitle, icon, cancel.bg, cancel.text, cancel.zone, confirm.bg, confirm.text, confirm.zone]);

  const close = (): void => {
    overlay.destroy(true);
    scene.modalOpen = false;
    scene.refreshActionTray();
  };
  dim.on('pointerdown', close);
  cancel.zone.on('pointerdown', close);
  confirm.zone.on('pointerdown', () => {
    const splitterData = scene.grid.get(splitterCell);
    const targetData = scene.grid.get(targetCell);
    if (splitterData?.kind !== 'splitter' || targetData?.kind !== 'item'
      || targetData.typeId !== target.typeId || targetData.tier !== target.tier) {
      close();
      return;
    }
    scene.grid.set(splitterCell, null);
    scene.grid.set(targetCell, null);
    scene.views.delete(scene.keyOf(splitterCell));
    scene.views.delete(scene.keyOf(targetCell));
    splitter.destroy();
    target.destroy();
    scene.placeTile(targetCell, target.typeId, target.tier - 1, true);
    scene.placeTile(splitterCell, target.typeId, target.tier - 1, true);
    close();
    scene.saveState();
    scene.refreshOrderBar();
    scene.checkDeadlock();
  });
}

export function canMergeViews(scene: BoardScene, a: BoardView, b: BoardView): boolean {
  if (a === b) return false;
  if (a instanceof TileView && b instanceof TileView) {
    return !a.locked && a.typeId === b.typeId && a.tier === b.tier && getTierDef(a.typeId, a.tier + 1) != null;
  }
  if (a instanceof SpawnerPieceView && b instanceof SpawnerPieceView) {
    return a.typeId === b.typeId && a.tier === b.tier && a.tier >= 1 && a.tier <= spawnerPieceTiers(a.typeId);
  }
  if (a instanceof SpawnerView && b instanceof SpawnerView) {
    // Decagons never merge. The family has ONE item tier, so a tier-2
    // Decagon machine would produce a tier-2 Decagon item that does not
    // exist - and merging two temporary machines into one would destroy
    // half the drops the player collected the pieces for.
    if (a.spawner.typeId === 'decagon' || b.spawner.typeId === 'decagon') return false;
    if (a.spawner.typeId !== b.spawner.typeId || a.spawner.tier !== b.spawner.tier || a.spawner.tier >= MAX_DISPENSER_TIER) return false;
    // Merging two tier-1 spawners removes both and replaces them with one
    // tier-2+ spawner. If that would leave zero tier-1 spawners of this
    // family while a locked tier-1 cell of it still exists, refuse - that
    // cell can only ever be cleared by a tier-1 spawner of its own
    // family (merges only go up), so this would strand it permanently.
    // See canSafelyDeliverSpawnerReward for the matching reward-side gate.
    if (a.spawner.tier === 1) {
      const otherTierOneSpawners = [...scene.views.values()].filter(
        (v) => v instanceof SpawnerView && v !== a && v !== b && v.spawner.typeId === a.spawner.typeId && v.spawner.tier === 1
      ).length;
      if (otherTierOneSpawners === 0 && scene.grid.hasLockedItem(a.spawner.typeId, 1)) return false;
    }
    return true;
  }
  if (a instanceof SplitterView && b instanceof TileView) {
    return !b.locked && b.tier >= 2;
  }
  return false;
}
