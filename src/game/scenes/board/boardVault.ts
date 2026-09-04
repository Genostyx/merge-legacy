import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { ROWS, type BoardView, type ForcedSpawn } from './config';
import type { GridPosition } from '../../types';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { drawCurrencyGlyph, type CurrencyKind } from '../../ui/CurrencyGlyph';
import { drawCrate, drawSourceBuilding, drawTierIcon, sourcePalette } from '../../objects/TierIcons';
import { drawSpawnerPieceIcon } from '../../objects/SpawnerPieceView';
import { drawSplitterIcon } from '../../objects/SplitterView';
import { getTierDef } from '../../data/chains';
import { RESOURCE_PRODUCERS } from '../../rewards/ResourceRewards';

/**
 * boardVault, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

export function vaultPosition(scene: BoardScene): { x: number; y: number } {
  return {
    x: scene.boardOriginX + 21,
    y: scene.boardOriginY + ROWS * scene.cellSize + scene.boardToTrayGap + 50.5
  };
}

/**
 * A passive reward queue, not player storage. It appears only while a
 * forced spawn is waiting, previews the next LIFO item, and never accepts
 * taps or dragged board pieces.
 */
export function buildForcedSpawnVault(scene: BoardScene): void {
  const { x, y } = vaultPosition(scene);
  scene.vaultBg = scene.add.graphics();
  scene.vaultIcon = scene.add.graphics().setPosition(x, y);
  scene.vaultCountDot = scene.add.graphics();
  scene.vaultCount = scene.add.text(x + 17, y - 12, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric,
    fontSize: '9px',
    fontStyle: 'bold',
    color: hex(Theme.bg)
  }).setOrigin(0.5);
  refreshForcedSpawnVault(scene);
}

export function refreshForcedSpawnVault(scene: BoardScene): void {
  if (!scene.vaultBg || !scene.vaultIcon || !scene.vaultCountDot || !scene.vaultCount) return;
  const next = scene.forcedSpawnVault[scene.forcedSpawnVault.length - 1];
  const visible = Boolean(next);
  scene.vaultBg.setVisible(visible);
  scene.vaultIcon.setVisible(visible);
  scene.vaultCountDot.setVisible(visible);
  scene.vaultCount.setVisible(visible);
  if (!next) return;

  const { x, y } = vaultPosition(scene);
  scene.vaultBg.clear();
  scene.vaultBg.fillStyle(Theme.bgElevated, 1);
  scene.vaultBg.fillRoundedRect(x - 21, y - 15.5, 42, 31, Theme.radiusChip);
  scene.vaultBg.lineStyle(Theme.borderWidth, Theme.accentAmber, 0.9);
  scene.vaultBg.strokeRoundedRect(x - 21, y - 15.5, 42, 31, Theme.radiusChip);

  scene.vaultIcon.clear().setPosition(x, y);
  drawForcedSpawnIcon(scene, scene.vaultIcon, next, 28);
  const countX = x + 17;
  const countY = y - 12;
  scene.vaultCountDot.clear();
  scene.vaultCountDot.fillStyle(Theme.accentAmber, 1);
  scene.vaultCountDot.fillCircle(countX, countY, 7);
  scene.vaultCountDot.lineStyle(1, Theme.textOnDark, 0.75);
  scene.vaultCountDot.strokeCircle(countX, countY, 7);
  scene.vaultCount.setPosition(countX, countY - 0.75)
    .setText(scene.forcedSpawnVault.length > 9 ? '9+' : String(scene.forcedSpawnVault.length));
}

export function drawForcedSpawnIcon(scene: BoardScene, g: Phaser.GameObjects.Graphics, spawn: ForcedSpawn, size: number): void {
  if (spawn.kind === 'crate') drawCrate(g, size, spawn.tier);
  else if (spawn.kind === 'splitter') drawSplitterIcon(g, size);
  else if (spawn.kind === 'resource-producer') {
    const typeId = RESOURCE_PRODUCERS[spawn.producerId].typeId;
    const kind: CurrencyKind = typeId === 'currency-credit' ? 'credit' : typeId === 'currency-gem' ? 'gem' : 'energy';
    drawCurrencyGlyph(g, kind, size, kind === 'credit' ? Theme.currencyCredit : kind === 'gem' ? Theme.currencyGem : Theme.currencyEnergy);
  }
  else if (spawn.kind === 'spawner') {
    drawSourceBuilding(g, spawn.typeId, spawn.tier, size * 0.4, sourcePalette(spawn.typeId), true);
  } else if (spawn.kind === 'spawner-piece') drawSpawnerPieceIcon(g, spawn.typeId, spawn.tier, size);
  else {
    const def = getTierDef(spawn.typeId, spawn.tier);
    if (def) drawTierIcon(g, spawn.typeId, spawn.tier, size, materialLighting(def.color, def.tier));
  }
}

/**
 * Keeps a board object out of sight while the room panel is open.
 *
 * The panel hides the board by sweeping the display list ONCE, when it
 * opens. Anything created afterwards - a crate delivered by a stage reward,
 * for instance - was never swept, so it landed on top of the room and stayed
 * there. Registering it with the same list hides it now and reveals it with
 * everything else when the panel closes.
 */
export function hideBehindRoomPanel(scene: BoardScene, view: Phaser.GameObjects.GameObject & { visible: boolean }): void {
  if (!scene.roomPanelOpen) return;
  view.visible = false;
  scene.roomHiddenForPanel.push(view);
}

export function enqueueForcedSpawn(scene: BoardScene, spawn: ForcedSpawn, from?: { x: number; y: number }): void {
  const openCell = scene.firstFreeCellInReadingOrder();
  if (openCell) {
    const view = placeForcedSpawn(scene, openCell, spawn);
    hideBehindRoomPanel(scene, view);
    const target = scene.cellToWorld(openCell);
    const origin = from ?? vaultPosition(scene);
    view.setPosition(origin.x, origin.y).setScale(0.72).setAlpha(0.35);
    scene.saveState();
    scene.tweens.add({
      targets: view,
      x: target.x,
      y: target.y,
      scale: 1,
      alpha: 1,
      duration: 430,
      ease: 'Cubic.Out',
      onComplete: () => {
        scene.refreshOrderBar();
        scene.checkDeadlock();
      }
    });
    return;
  }

  scene.forcedSpawnVault.push(spawn);
  refreshForcedSpawnVault(scene);
  scene.saveState();
  if (!from) {
    tryReleaseVaultItem(scene);
    return;
  }

  const destination = vaultPosition(scene);
  const flying = scene.add.graphics().setDepth(3105).setPosition(from.x, from.y);
  drawForcedSpawnIcon(scene, flying, spawn, 42);
  scene.vaultInboundPending++;
  scene.tweens.add({
    targets: flying,
    x: destination.x,
    y: destination.y,
    scale: 0.62,
    alpha: { from: 1, to: 0.75 },
    duration: 430,
    ease: 'Cubic.InOut',
    onComplete: () => {
      flying.destroy();
      scene.vaultInboundPending = Math.max(0, scene.vaultInboundPending - 1);
      refreshForcedSpawnVault(scene);
      tryReleaseVaultItem(scene);
    }
  });
}

export function tryReleaseVaultItem(scene: BoardScene): boolean {
  if (scene.vaultDeliveryPending || scene.vaultInboundPending > 0) return false;
  const next = scene.forcedSpawnVault[scene.forcedSpawnVault.length - 1];
  const spot = scene.firstFreeCellInReadingOrder();
  if (!next || !spot) return false;
  if (next.kind === 'spawner' && !scene.canSafelyDeliverSpawnerReward(next.typeId, next.tier)) return false;

  scene.forcedSpawnVault.pop();
  const view = placeForcedSpawn(scene, spot, next);

  const target = scene.cellToWorld(spot);
  const from = vaultPosition(scene);
  view.setPosition(from.x, from.y).setScale(0.72).setAlpha(0.35);
  scene.vaultDeliveryPending = true;
  refreshForcedSpawnVault(scene);
  scene.saveState();
  scene.tweens.add({
    targets: view,
    x: target.x,
    y: target.y,
    scale: 1,
    alpha: 1,
    duration: 360,
    ease: 'Cubic.Out',
    onComplete: () => {
      scene.vaultDeliveryPending = false;
      scene.refreshOrderBar();
      scene.checkDeadlock();
      tryReleaseVaultItem(scene);
    }
  });
  return true;
}

export function placeForcedSpawn(scene: BoardScene, spot: GridPosition, spawn: ForcedSpawn): BoardView {
  if (spawn.kind === 'crate') return scene.placeCrate(spot, spawn.tier, spawn.remaining, spawn.readyAt);
  if (spawn.kind === 'splitter') return scene.placeSplitter(spot, false);
  if (spawn.kind === 'resource-producer') return scene.placeResourceProducer(spot, spawn.producerId, spawn.remaining, false);
  if (spawn.kind === 'spawner') return scene.placeSpawner(spot, spawn.typeId, spawn.tier, false);
  if (spawn.kind === 'spawner-piece') return scene.placeSpawnerPiece(spot, spawn.typeId, spawn.tier, false);
  return scene.placeTile(spot, spawn.typeId, spawn.tier, false);
}
