import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import {
  COLS,
  EXPANSION_ROW_ONE,
  EXPANSION_ROW_ONE_PRICES,
  EXPANSION_ROW_TWO,
  EXPANSION_ROW_TWO_LEVEL,
  EXPANSION_ROW_TWO_PRICES
} from './config';
import type { GridPosition } from '../../types';
import type { GridCellData } from '../../Grid';
import { Theme, hex, textResolution } from '../../ui/Theme';
import { applyCurrencyIcon } from '../../ui/CurrencyGlyph';
import { playerLevel } from '../../levels/Orders';
import { spendCoinsGeneric } from '../../economy/Economy';

/**
 * boardExpansion, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

export function expansionPrice(scene: BoardScene, pos: GridPosition): number {
  return pos.row === EXPANSION_ROW_ONE
    ? EXPANSION_ROW_ONE_PRICES[pos.col]
    : EXPANSION_ROW_TWO_PRICES[pos.col];
}

export function expansionRowEligible(scene: BoardScene, row: number): boolean {
  if (row === EXPANSION_ROW_ONE) {
    return !scene.grid.serialize().some((cells) => cells.some((cell) => cell?.kind === 'locked-item'));
  }
  return row === EXPANSION_ROW_TWO
    && firstExpansionRowComplete(scene)
    && playerLevel(scene.orderState) >= EXPANSION_ROW_TWO_LEVEL;
}

export function firstExpansionRowComplete(scene: BoardScene): boolean {
  return EXPANSION_ROW_ONE_PRICES.every((_, col) => !scene.grid.isBlocked({ col, row: EXPANSION_ROW_ONE }));
}

/** Applies saved expansion purchases as real unavailable grid cells. */
export function applyBoardExpansionLocks(scene: BoardScene, savedCells?: (GridCellData | null)[][]): void {
  for (const row of [EXPANSION_ROW_ONE, EXPANSION_ROW_TWO]) {
    for (let col = 0; col < COLS; col++) {
      const pos = { col, row };
      const key = scene.keyOf(pos);
      // A short-lived nine-row development save may already contain an
      // owned object here from before row locking existed. Preserve it and
      // treat that particular cell as purchased rather than deleting it.
      if (savedCells?.[row]?.[col]) scene.boardExpansionUnlocked.add(key);
      if (!scene.boardExpansionUnlocked.has(key)) scene.grid.block(pos);
    }
  }
}

export function buildBoardExpansionLocks(scene: BoardScene): void {
  for (const row of [EXPANSION_ROW_ONE, EXPANSION_ROW_TWO]) {
    const worldY = scene.cellToWorld({ col: 0, row }).y;
    const label = scene.add.text(
      scene.boardOriginX + COLS * scene.cellSize / 2,
      worldY,
      row === EXPANSION_ROW_ONE
        ? 'CLEAR ALL LOCKED ITEMS TO UNLOCK ROW'
        : `UNLOCKS AT LEVEL ${EXPANSION_ROW_TWO_LEVEL}`,
      {
        resolution: textResolution,
        fontFamily: Theme.fontMono,
        fontSize: '10px',
        fontStyle: 'bold',
        color: hex(Theme.textOnDark),
        backgroundColor: 'rgba(0,0,0,0.58)',
        padding: { x: 3, y: 1 },
        align: 'center'
      }
    ).setOrigin(0.5).setDepth(6)
      .setStroke(hex(Theme.textOnDark), 1)
      .setShadow(0, 0, '#000000', 3, true, true);
    scene.expansionRowLabels.push(label);

    for (let col = 0; col < COLS; col++) {
      const pos = { col, row };
      if (!scene.grid.isBlocked(pos)) continue;
      const world = scene.cellToWorld(pos);
      const bg = scene.add.graphics().setDepth(4);
      const price = scene.add.text(world.x, world.y, '', {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric,
        fontSize: '11px',
        fontStyle: 'bold',
        color: hex(Theme.currencyCredit),
        align: 'center'
      }).setOrigin(0, 0.5).setDepth(6);
      const mark = scene.add.image(0, 0, 'currency-coin').setDepth(6);
      const zone = scene.add.zone(world.x, world.y, scene.cellSize, scene.cellSize)
        .setDepth(7)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => buyExpansionCell(scene, pos));
      scene.expansionLockViews.set(scene.keyOf(pos), { bg, price, mark, zone });
    }
  }
  refreshBoardExpansionLocks(scene);
}

export function refreshBoardExpansionLocks(scene: BoardScene): void {
  for (const [key, view] of scene.expansionLockViews) {
    const [col, row] = key.split(',').map(Number);
    const eligible = expansionRowEligible(scene, row);
    const concealed = row === EXPANSION_ROW_TWO && !firstExpansionRowComplete(scene);
    const world = scene.cellToWorld({ col, row });
    const left = world.x - scene.cellSize / 2;
    const top = world.y - scene.cellSize / 2;
    view.bg.clear();
    drawExpansionMetalTile(scene, view.bg, left - 0.5, top - 0.5, scene.cellSize + 1, eligible, concealed);
    const showPrice = eligible && !concealed && !scene.roomPanelOpen;
    const rawPrice = expansionPrice(scene, { col, row });
    const priceLabel = rawPrice >= 1_000 ? `${rawPrice / 1_000}k` : String(rawPrice);
    view.price.setVisible(showPrice).setText(priceLabel);
    view.mark.setVisible(showPrice);
    if (showPrice) {
      const glyphSize = 15;
      const gap = 3;
      const groupW = view.price.width + gap + glyphSize;
      const startX = world.x - groupW / 2;
      view.price.setPosition(startX, world.y);
      applyCurrencyIcon(view.mark, 'credit', glyphSize);
      view.mark.setPosition(startX + view.price.width + gap + glyphSize / 2, world.y);
    }
  }
  scene.expansionRowLabels.forEach((label, index) => {
    const row = index === 0 ? EXPANSION_ROW_ONE : EXPANSION_ROW_TWO;
    const visible = (
      !expansionRowEligible(scene, row)
      && !(row === EXPANSION_ROW_TWO && !firstExpansionRowComplete(scene))
    );
    // Hiding the board for the room panel sets visible=false on everything
    // below depth 3000, but this refresher runs afterwards and would set it
    // straight back - which is how the locked-row caption reappeared over
    // the 3D room.
    label.setVisible(visible && !scene.roomPanelOpen);
  });
}

/** Front-facing square steel access plate used by every locked board cell. */
export function drawExpansionMetalTile(
scene: BoardScene,
  g: Phaser.GameObjects.Graphics, left: number, top: number, size: number, eligible: boolean, concealed: boolean
): void {
  const edge = concealed ? 0x4b5053 : eligible ? 0x858f95 : 0x737c81;
  const face = concealed ? 0x5a6063 : eligible ? 0xaeb7bb : 0x969fa3;
  const faceDark = concealed ? 0x393e41 : eligible ? 0x717b81 : 0x626b70;
  const recess = concealed ? 0x414649 : eligible ? 0x808a90 : 0x70797e;
  const outline = 0x20252a;
  const inset = Math.max(5, size * 0.105);
  const boltInset = Math.max(5, size * 0.115);
  const boltR = Math.max(1.8, size * 0.043);

  // Full square footprint makes neighboring plates meet with no exposed
  // board between them. The dark bottom band suggests thickness without
  // rotating the tile into an isometric diamond.
  g.fillStyle(outline, 1);
  g.fillRect(left, top, size, size);
  g.fillStyle(faceDark, 1);
  g.fillRect(left + 1, top + 3, size - 2, size - 4);
  g.fillStyle(face, 1);
  g.fillRect(left + 2, top + 2, size - 4, size - 7);
  // Broad top-light-to-shadow treatment shared by both locked rows. The
  // first row keeps its brighter palette; only the lighting progression
  // matches the concealed row beneath it.
  g.fillStyle(0xffffff, concealed ? 0.07 : 0.12);
  g.fillRect(left + 2, top + 2, size - 4, size * 0.28);
  g.fillStyle(0x000000, concealed ? 0.13 : 0.09);
  g.fillRect(left + 2, top + size * 0.62, size - 4, size * 0.28);

  // Square recessed center with a restrained curved highlight across its
  // upper half, echoing the reference's polished inset at board scale.
  g.fillStyle(outline, 0.95);
  g.fillRoundedRect(left + inset - 1, top + inset - 1, size - inset * 2 + 2, size - inset * 2 + 2, 3);
  g.fillStyle(recess, 1);
  g.fillRoundedRect(left + inset, top + inset, size - inset * 2, size - inset * 2, 2);
  g.fillStyle(0xd7dde0, eligible ? 0.24 : 0.17);
  g.fillRoundedRect(left + inset + 2, top + inset + 2, size - inset * 2 - 4, Math.max(3, size * 0.12), 2);

  // Crisp top/left light and bottom/right shadow form the outer bevel.
  g.lineStyle(1, 0xe7ecee, eligible ? 0.78 : 0.58);
  g.lineBetween(left + 2, top + 2, left + size - 2, top + 2);
  g.lineBetween(left + 2, top + 2, left + 2, top + size - 5);
  g.lineStyle(1, outline, 0.95);
  g.lineBetween(left + size - 2, top + 2, left + size - 2, top + size - 2);
  g.lineBetween(left + 1, top + size - 2, left + size - 1, top + size - 2);

  // Four small fasteners remain readable even at the 52px phone size.
  for (const [x, y] of [
    [left + boltInset, top + boltInset],
    [left + size - boltInset, top + boltInset],
    [left + boltInset, top + size - boltInset],
    [left + size - boltInset, top + size - boltInset]
  ]) {
    g.fillStyle(outline, 1);
    g.fillCircle(x, y, boltR + 1);
    g.fillStyle(edge, 1);
    g.fillCircle(x, y, boltR);
    g.fillStyle(0xf0f3f4, 0.72);
    g.fillCircle(x - boltR * 0.25, y - boltR * 0.3, Math.max(0.8, boltR * 0.42));
  }
}

export function buyExpansionCell(scene: BoardScene, pos: GridPosition): void {
  if (!scene.grid.isBlocked(pos)) return;
  if (!expansionRowEligible(scene, pos.row)) {
    scene.refreshActionTray(
      pos.row === EXPANSION_ROW_ONE
        ? 'ROW LOCKED\nCLEAR ALL LOCKED BOARD ITEMS FIRST'
        : !firstExpansionRowComplete(scene)
          ? 'ROW LOCKED\nUNLOCK THE ROW ABOVE FIRST'
        : 'ROW LOCKED\nREACH PLAYER LEVEL 50 FIRST'
    );
    return;
  }
  const cost = expansionPrice(scene, pos);
  if (!spendCoinsGeneric(scene.economy, cost)) {
    scene.refreshActionTray(`NOT ENOUGH CREDITS\nTHIS BOARD TILE COSTS ${cost.toLocaleString()}`);
    return;
  }

  scene.grid.unblock(pos);
  scene.boardExpansionUnlocked.add(scene.keyOf(pos));
  const view = scene.expansionLockViews.get(scene.keyOf(pos));
  view?.bg.destroy();
  view?.price.destroy();
  view?.mark.destroy();
  view?.zone.destroy();
  scene.expansionLockViews.delete(scene.keyOf(pos));
  scene.updateCurrencyText();
  scene.refreshProjectButton();
  scene.saveState();
  scene.tryDeliverMeterGold();
  scene.checkDeadlock();
  scene.refreshActionTray(`BOARD TILE UNLOCKED\n${cost.toLocaleString()} CREDITS SPENT`);
}
