import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { ROWS, type BoardView, type ForcedSpawn } from './config';
import type { GridPosition } from '../../types';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { drawCrate, drawSourceBuilding, drawTierIcon, iconPresentation, sourcePalette } from '../../objects/TierIcons';
import { drawSpawnerPieceIcon } from '../../objects/SpawnerPieceView';
import { drawSplitterIcon } from '../../objects/SplitterView';
import { getTierDef } from '../../data/chains';
import { RESOURCE_PRODUCERS } from '../../rewards/ResourceRewards';
import { boxForDrawnArt } from '../../objects/ArtFill';

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
 * A reward queue the player cannot add to, only draw from. It appears only
 * while a forced spawn is waiting, previews the next LIFO item, and hands
 * that item over one tap at a time. Dragged board pieces are still refused -
 * this is an outbox, not storage.
 */
export function buildForcedSpawnVault(scene: BoardScene): void {
  const { x, y } = vaultPosition(scene);
  scene.vaultBg = scene.add.graphics();
  scene.vaultIcon = scene.add.container(x, y);
  scene.vaultCountDot = scene.add.graphics();
  scene.vaultCount = scene.add.text(x + 17, y - 12, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric,
    fontSize: '9px',
    fontStyle: 'bold',
    color: hex(Theme.bg)
  }).setOrigin(0.5);
  // The chip is the button. It is deliberately a little larger than the
  // plate it sits on - 42x31 is a small target on a phone.
  scene.vaultZone = scene.add.zone(x, y, 52, 40).setInteractive({ useHandCursor: true });
  scene.vaultZone.on('pointerup', () => {
    if (scene.modalOpen || scene.inputLocked || scene.dragActive) return;
    releaseOneVaultItem(scene);
  });
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
  scene.vaultZone?.setVisible(visible);
  if (visible) scene.vaultZone?.setPosition(vaultPosition(scene).x, vaultPosition(scene).y);
  if (!next) return;

  const { x, y } = vaultPosition(scene);
  scene.vaultBg.clear();
  scene.vaultBg.fillStyle(Theme.bgElevated, 1);
  scene.vaultBg.fillRoundedRect(x - 21, y - 15.5, 42, 31, Theme.radiusChip);
  scene.vaultBg.lineStyle(Theme.borderWidth, Theme.accentAmber, 0.9);
  scene.vaultBg.strokeRoundedRect(x - 21, y - 15.5, 42, 31, Theme.radiusChip);

  scene.vaultIcon.removeAll(true);
  scene.vaultIcon.setPosition(x, y);
  scene.vaultIcon.add(makeForcedSpawnIcon(scene, next, 28));
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
  else if (spawn.kind === 'spawner') {
    drawSourceBuilding(g, spawn.typeId, spawn.tier, size * 0.4, sourcePalette(spawn.typeId), true);
  } else if (spawn.kind === 'spawner-piece') drawSpawnerPieceIcon(g, spawn.typeId, spawn.tier, size);
  else if (spawn.kind === 'item') {
    const def = getTierDef(spawn.typeId, spawn.tier);
    if (!def) return;
    drawTierIcon(g, spawn.typeId, spawn.tier, size, materialLighting(def.color, def.tier));
    // The board applies this to every tile it draws, so a preview that skips
    // it shows the same item at a different size and sitting off its ground
    // line - see TierIcons.iconPresentation.
    const present = iconPresentation(spawn.typeId, spawn.tier, size);
    g.setScale(present.scale).setPosition(present.offsetX, present.offsetY);
  }
}

/**
 * The vault's preview, built as whatever the BOARD would build.
 *
 * The preview used to be one Graphics object for everything, which meant a
 * resource producer - a coin pouch, a basket - was previewed as a bare
 * currency glyph while the board drew it from its own texture. The player
 * was shown a coin and handed a basket.
 *
 * A producer therefore gets its real image here, sized the way
 * ResourceProducerView sizes it, and everything else keeps the vector path.
 * The result is a container so the caller can scale and tween the whole icon
 * without fighting the per-item presentation transform inside it.
 */
export function makeForcedSpawnIcon(
  scene: BoardScene, spawn: ForcedSpawn, size: number
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  if (spawn.kind === 'resource-producer') {
    const key = RESOURCE_PRODUCERS[spawn.producerId].textureKey;
    // Same drawn-art sizing the board uses, so the pouch does not come out
    // smaller than the baskets beside it.
    const box = boxForDrawnArt(key, size);
    container.add(scene.add.image(0, 0, key).setDisplaySize(box, box));
    return container;
  }
  const g = scene.add.graphics();
  drawForcedSpawnIcon(scene, g, spawn, size);
  container.add(g);
  return container;
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
  // Nothing drains on its own now - the vault only gives items up when the
  // player taps it. Reaching here means the board was full anyway, so the
  // old immediate retry could never have placed anything.
  if (!from) return;

  const destination = vaultPosition(scene);
  const flying = makeForcedSpawnIcon(scene, spawn, 42).setDepth(3105).setPosition(from.x, from.y);
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
    }
  });
}

/**
 * Hands ONE item back, and only when the player asks for it.
 *
 * The vault used to empty itself: every merge, sale, delivery and expansion
 * called this, and its own completion called it again, so a full vault
 * poured onto the board the moment a cell came free. That took the decision
 * away - the player could not choose what arrived or when, and a haul like
 * the Decagon's refilled the board faster than it could be cleared.
 *
 * Now it is a tap. The vault is still a queue the player cannot add to, but
 * taking things out of it is theirs to time.
 */
export function releaseOneVaultItem(scene: BoardScene): boolean {
  if (scene.vaultDeliveryPending || scene.vaultInboundPending > 0) return false;
  const next = scene.forcedSpawnVault[scene.forcedSpawnVault.length - 1];
  const spot = scene.firstFreeCellInReadingOrder();
  if (!next) return false;
  if (!spot) {
    scene.refreshActionTray('BOARD FULL\nMAKE SPACE BEFORE TAKING FROM THE VAULT');
    return false;
  }
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
