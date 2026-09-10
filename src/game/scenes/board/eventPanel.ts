import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import type { GridPosition } from '../../types';
import { Grid } from '../../Grid';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { TileView } from '../../objects/TileView';
import { SpawnerView } from '../../objects/SpawnerView';
import { drawTierIcon, iconPresentation } from '../../objects/TierIcons';
import { EVENT_TOKEN_COLOR, drawEventToken } from '../../objects/EventTokenView';
import {
  EVENT_BOARD_COLS, EVENT_BOARD_ROWS, EVENT_CHAIN, EVENT_MAX_TIER, EVENT_SPAWN_COST,
  EVENT_SPAWNER_AT, createEventGrid, eventTierDef, markOverflowPaid, overflowCratesOwed,
  seedEventBoard, spendEventEnergy
} from '../../events/EventBoard';
import {
  EVENT_ORDER_SLOTS, eventOrderPayout, rollEventOrders, submitEventOrder, visibleEventOrders
} from '../../events/EventOrders';
import {
  activeEvent, addEventProgress, eventMsRemaining, eventProgress, unclaimedMilestones
} from '../../events/TimedEvents';

/**
 * THE EVENT BOARD PANEL - a second board, opened from the chip.
 *
 * It is a full-screen overlay rather than a scene of its own. A scene would
 * duplicate the header, the currency chips and the whole layout pass, and a
 * player switching boards would pay a scene start each way; an overlay keeps
 * one layout and lets the main board stay exactly as it was underneath.
 *
 * Everything here works on ITS OWN `Grid`. It never reads or writes
 * `scene.grid`, never touches the vault, the briefcase, the auto-merge or the
 * deadlock check, and its items are of a chain that is not in `CHAINS`. That
 * isolation is the point: the event cannot break the main game because it
 * cannot reach it.
 *
 * Input is deliberately its own small path rather than a reuse of
 * `boardInput`. That module is built around the main board's cell math,
 * its facilities, crates, sources and vault, and threading a second grid
 * through all of it would put a temporary feature's branches inside the
 * permanent one. This is drag, merge, tap - which is all this board has.
 */

const PAD = 12;
const ORDER_CARD_H = 62;
const TRACK_H = 46;

interface PanelState {
  overlay: Phaser.GameObjects.Container;
  boardLayer: Phaser.GameObjects.Container;
  grid: Grid;
  views: Map<string, TileView | SpawnerView>;
  cellSize: number;
  originX: number;
  originY: number;
  redraw: () => void;
  refreshChrome: () => void;
}

const keyOf = (pos: GridPosition): string => `${pos.col},${pos.row}`;

export function openEventPanel(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  const event = activeEvent(Date.now());
  if (!event) return;
  scene.modalOpen = true;

  // The board is rebuilt from the save every time the panel opens, so the
  // panel owns no state that could drift from what is stored.
  const grid = createEventGrid();
  if (scene.eventBoard.seeded && scene.eventBoard.grid.length > 0) {
    grid.loadFrom(scene.eventBoard.grid);
  } else {
    seedEventBoard(grid);
    scene.eventBoard.seeded = true;
  }
  if (scene.eventBoard.orders.length !== EVENT_ORDER_SLOTS) {
    scene.eventBoard.orders = rollEventOrders();
  }

  const overlay = scene.add.container(0, 0).setDepth(3040);
  scene.eventOverlay = overlay;

  const W = scene.scale.width;
  const H = scene.scale.height;
  // Opaque, not a scrim. This is a place you go, not a dialog over the board -
  // and a half-visible main board behind a second board is unreadable.
  const back = scene.add.rectangle(W / 2, H / 2, W, H, Theme.bg, 1).setInteractive();
  overlay.add(back);

  const boardLayer = scene.add.container(0, 0);
  const chromeLayer = scene.add.container(0, 0);
  overlay.add([boardLayer, chromeLayer]);

  // ---- layout ----
  const headerH = 44;
  const ordersY = headerH + 6;
  const trackY = ordersY + ORDER_CARD_H + 8;
  const boardTop = trackY + TRACK_H + 10;
  const boardBottom = H - PAD - 34;
  const cellSize = Math.floor(Math.min(
    (W - PAD * 2) / EVENT_BOARD_COLS,
    (boardBottom - boardTop) / EVENT_BOARD_ROWS
  ));
  const originX = Math.floor((W - EVENT_BOARD_COLS * cellSize) / 2);
  const originY = Math.floor(boardTop + (boardBottom - boardTop - EVENT_BOARD_ROWS * cellSize) / 2);

  const state: PanelState = {
    overlay, boardLayer, grid, views: new Map(), cellSize, originX, originY,
    redraw: () => undefined, refreshChrome: () => undefined
  };

  const cellToWorld = (pos: GridPosition): { x: number; y: number } => ({
    x: originX + pos.col * cellSize + cellSize / 2,
    y: originY + pos.row * cellSize + cellSize / 2
  });
  const worldToCell = (x: number, y: number): GridPosition | null => {
    const col = Math.floor((x - originX) / cellSize);
    const row = Math.floor((y - originY) / cellSize);
    if (col < 0 || row < 0 || col >= EVENT_BOARD_COLS || row >= EVENT_BOARD_ROWS) return null;
    return { col, row };
  };

  // ---- the board's own cells ----
  const cellsGfx = scene.add.graphics();
  boardLayer.add(cellsGfx);
  cellsGfx.fillStyle(Theme.bgElevated, 0.5);
  cellsGfx.fillRoundedRect(
    originX - 6, originY - 6,
    EVENT_BOARD_COLS * cellSize + 12, EVENT_BOARD_ROWS * cellSize + 12,
    Theme.radiusPanel
  );
  for (let row = 0; row < EVENT_BOARD_ROWS; row++) {
    for (let col = 0; col < EVENT_BOARD_COLS; col++) {
      cellsGfx.lineStyle(1, Theme.borderOnDark, 0.35);
      cellsGfx.strokeRoundedRect(
        originX + col * cellSize + 2, originY + row * cellSize + 2,
        cellSize - 4, cellSize - 4, Theme.radiusChip
      );
    }
  }

  const save = (): void => {
    scene.eventBoard.grid = grid.serialize();
    scene.saveState();
  };

  const addView = (pos: GridPosition): void => {
    const cell = grid.get(pos);
    if (!cell) return;
    const world = cellToWorld(pos);
    let view: TileView | SpawnerView | null = null;
    if (cell.kind === 'item' || cell.kind === 'locked-item') {
      view = new TileView(
        scene, world.x, world.y, cellSize, cell.typeId, cell.tier, pos,
        cell.kind === 'locked-item'
      );
    } else if (cell.kind === 'spawner') {
      view = new SpawnerView(scene, world.x, world.y, cellSize, cell, pos);
    }
    if (!view) return;
    boardLayer.add(view);
    state.views.set(keyOf(pos), view);
  };

  const redraw = (): void => {
    for (const view of state.views.values()) view.destroy();
    state.views.clear();
    for (let row = 0; row < EVENT_BOARD_ROWS; row++) {
      for (let col = 0; col < EVENT_BOARD_COLS; col++) addView({ col, row });
    }
  };
  state.redraw = redraw;
  redraw();

  // ---- chrome ----
  const chrome = buildChrome(scene, event, chromeLayer, state, {
    W, headerH, ordersY, trackY,
    onClose: () => close(),
    onSave: save
  });
  state.refreshChrome = chrome.refresh;

  // ---- input ----
  const input = attachPanelInput(scene, state, {
    cellToWorld, worldToCell, save,
    afterChange: () => chrome.refresh()
  });

  const close = (): void => {
    input.detach();
    save();
    scene.eventOverlay = null;
    scene.modalOpen = false;
    overlay.destroy(true);
    scene.refreshEventChip();
    scene.refreshOrderBar();
  };
}

/* ------------------------------------------------------------------ */
/* Chrome: header, energy, orders, milestone track                     */
/* ------------------------------------------------------------------ */

function buildChrome(
  scene: BoardScene,
  event: ReturnType<typeof activeEvent> & object,
  layer: Phaser.GameObjects.Container,
  state: PanelState,
  opts: {
    W: number; headerH: number; ordersY: number; trackY: number;
    onClose: () => void; onSave: () => void;
  }
): { refresh: () => void } {
  const { W, headerH, ordersY, trackY } = opts;

  // --- header: the name, the countdown, and the way out ---
  layer.add(scene.add.text(PAD + 4, headerH / 2, event.title.toUpperCase(), {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '16px', fontStyle: 'bold',
    color: hex(EVENT_TOKEN_COLOR)
  }).setOrigin(0, 0.5));

  // ENERGY, as the token itself plus a number. The medallion says what the
  // number counts, so nothing has to be labelled - and this is the one figure
  // a player checks before every tap, so it sits in the header rather than
  // beside the booth where a dragged item would cover it.
  const energyToken = scene.add.graphics().setPosition(W / 2 - 26, headerH / 2 + 1);
  drawEventToken(energyToken, 22, materialLighting(EVENT_TOKEN_COLOR, 5));
  const energyText = scene.add.text(W / 2 - 14, headerH / 2, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric, fontSize: '13px', fontStyle: 'bold',
    color: hex(EVENT_TOKEN_COLOR)
  }).setOrigin(0, 0.5);
  layer.add([energyToken, energyText]);

  const clock = scene.add.text(W - PAD - 34, headerH / 2, '', {
    resolution: textResolution,
    fontFamily: Theme.fontMono, fontSize: '10px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(1, 0.5);
  layer.add(clock);

  const back = scene.add.text(W - PAD - 6, headerH / 2, '✕', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '17px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(1, 0.5);
  const backHit = scene.add.zone(W - PAD - 14, headerH / 2, 48, 44)
    .setInteractive({ useHandCursor: true });
  backHit.on('pointerup', opts.onClose);
  layer.add([back, backHit]);

  // --- the milestone track, as a bar with its rungs marked on it ---
  const trackGfx = scene.add.graphics();
  const trackText = scene.add.text(PAD + 4, trackY + 6, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric, fontSize: '10px', fontStyle: 'bold',
    color: hex(EVENT_TOKEN_COLOR)
  }).setOrigin(0, 0);
  layer.add([trackGfx, trackText]);
  const trackHit = scene.add.zone(W / 2, trackY + TRACK_H / 2, W - PAD * 2, TRACK_H)
    .setInteractive({ useHandCursor: true });
  trackHit.on('pointerup', () => {
    // Refreshed on close: claiming a rung changes what this bar has to say.
    scene.eventTrackClosed = () => refresh();
    scene.openEventTrack(true);
  });
  layer.add(trackHit);

  // --- order cards ---
  const cardW = Math.floor((W - PAD * 2 - 12) / EVENT_ORDER_SLOTS);
  const cards = Array.from({ length: EVENT_ORDER_SLOTS }, (_, slot) => {
    const x = PAD + slot * (cardW + 6);
    const bg = scene.add.graphics();
    const icon = scene.add.graphics();
    const pay = scene.add.text(x + cardW / 2, ordersY + ORDER_CARD_H - 8, '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: '10px', fontStyle: 'bold',
      color: hex(EVENT_TOKEN_COLOR)
    }).setOrigin(0.5, 1);
    const hit = scene.add.zone(x + cardW / 2, ordersY + ORDER_CARD_H / 2, cardW, ORDER_CARD_H)
      .setInteractive({ useHandCursor: true });
    layer.add([bg, icon, pay, hit]);
    hit.on('pointerup', () => {
      const result = submitEventOrder(scene.eventBoard, state.grid, slot);
      if (!result) {
        // Refused, and it says which item is missing rather than just
        // failing silently - the card's own art is the answer, so the
        // shake points at it.
        scene.tweens.add({
          targets: bg, x: 4, duration: 60, yoyo: true, repeat: 1, ease: 'Sine.InOut',
          onComplete: () => bg.setX(0)
        });
        return;
      }
      state.views.get(keyOf(result.from))?.destroy();
      state.views.delete(keyOf(result.from));
      payEventPoints(scene, result.points);
      opts.onSave();
      refresh();
    });
    return { x, bg, icon, pay };
  });

  const refresh = (): void => {
    const now = Date.now();
    clock.setText(formatRemaining(eventMsRemaining(event, now)));
    energyText.setText(String(scene.eventBoard.energy));
    // Dimmed when there is nothing to spend, which is the state that explains
    // why the booth has stopped responding.
    const spent = scene.eventBoard.energy < EVENT_SPAWN_COST;
    energyToken.setAlpha(spent ? 0.4 : 1);
    energyText.setAlpha(spent ? 0.4 : 1);

    // Energy and progress on the track bar.
    const points = eventProgress(scene.timedEvents, event);
    const owed = unclaimedMilestones(scene.timedEvents, event).length;
    const barY = trackY + 26;
    const barW = W - PAD * 2 - 8;
    trackGfx.clear();
    trackGfx.fillStyle(Theme.bg, 0.9);
    trackGfx.fillRoundedRect(PAD + 4, barY, barW, 8, 4);
    trackGfx.fillStyle(EVENT_TOKEN_COLOR, 0.9);
    trackGfx.fillRoundedRect(PAD + 4, barY, Math.max(4, barW * (points / event.goal)), 8, 4);
    for (const milestone of event.milestones) {
      const mx = PAD + 4 + barW * Math.min(1, milestone.at / event.goal);
      const reached = points >= milestone.at;
      trackGfx.fillStyle(reached ? EVENT_TOKEN_COLOR : Theme.borderOnDark, 1);
      trackGfx.fillCircle(mx, barY + 4, reached ? 5 : 3.5);
    }
    trackText.setText(
      `${points}/${event.goal}${owed > 0 ? `  ·  ${owed} READY` : ''}`
    ).setColor(hex(owed > 0 ? EVENT_TOKEN_COLOR : Theme.textOnDarkMuted));

    // Order cards.
    const asking = visibleEventOrders(scene.eventBoard, state.grid);
    cards.forEach((card, slot) => {
      const tier = asking[slot];
      const def = eventTierDef(tier);
      const top = tier >= EVENT_MAX_TIER;
      card.bg.clear();
      card.bg.fillStyle(Theme.bgElevated, 1);
      card.bg.fillRoundedRect(card.x, ordersY, cardW, ORDER_CARD_H, Theme.radiusChip);
      // The top-tier auto-order is the one card that lights up, because it is
      // the one that will not be there next time you look.
      card.bg.lineStyle(
        Theme.borderWidth, top ? EVENT_TOKEN_COLOR : Theme.borderOnDark, top ? 1 : 0.7
      );
      card.bg.strokeRoundedRect(card.x, ordersY, cardW, ORDER_CARD_H, Theme.radiusChip);

      card.icon.clear();
      if (def) {
        const size = ORDER_CARD_H * 0.72;
        const render = drawTierIcon(
          card.icon, EVENT_CHAIN.typeId, tier, size, materialLighting(def.color, tier)
        );
        const present = iconPresentation(EVENT_CHAIN.typeId, tier, size);
        card.icon.setAlpha(render.materialAlpha)
          .setScale(present.scale)
          .setPosition(
            card.x + cardW / 2 + present.offsetX,
            ordersY + ORDER_CARD_H * 0.42 + present.offsetY
          );
      }
      card.pay.setText(`+${eventOrderPayout(tier)}`);
    });
  };
  refresh();

  return { refresh };
}

/**
 * Banks points and pays anything they earned.
 *
 * Rungs are NOT paid here - those are claimed by hand on the track, so a
 * reward always lands where the player is looking. Overflow crates are,
 * because past the last rung there is no track left to claim from.
 */
function payEventPoints(scene: BoardScene, points: number): void {
  const event = activeEvent(Date.now());
  if (!event) return;
  addEventProgress(scene.timedEvents, event, points, Date.now());
  const total = eventProgress(scene.timedEvents, event);
  const owed = overflowCratesOwed(scene.eventBoard, event, total);
  if (owed > 0) {
    for (let i = 0; i < owed; i++) scene.awardCrate('bronze', 'EVENT');
    markOverflowPaid(scene.eventBoard, owed);
  }
  scene.refreshEventChip();
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  if (days >= 1) return `${days}d ${Math.floor((totalMinutes % 1440) / 60)}h`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 1) return `${hours}h ${totalMinutes % 60}m`;
  return `${totalMinutes}m`;
}

/* ------------------------------------------------------------------ */
/* Input: drag, merge, tap                                             */
/* ------------------------------------------------------------------ */

const DRAG_START_PX = 6;

function attachPanelInput(
  scene: BoardScene,
  state: PanelState,
  opts: {
    cellToWorld: (pos: GridPosition) => { x: number; y: number };
    worldToCell: (x: number, y: number) => GridPosition | null;
    save: () => void;
    afterChange: () => void;
  }
): { detach: () => void } {
  let dragging: TileView | SpawnerView | null = null;
  let fromCell: GridPosition | null = null;
  let startPointer = { x: 0, y: 0 };
  let active = false;

  const down = (pointer: Phaser.Input.Pointer): void => {
    // The board is inert while the milestone track is stacked over it -
    // otherwise a drag would run underneath the panel the player is reading.
    if (scene.eventTrackOpen) return;
    const cell = opts.worldToCell(pointer.x, pointer.y);
    if (!cell) return;
    const view = state.views.get(keyOf(cell));
    if (!view) return;
    // A crusted cell refuses to be picked up, exactly as it does on the main
    // board. It is a target, never a piece.
    if (view instanceof TileView && view.locked) return;
    dragging = view;
    fromCell = cell;
    startPointer = { x: pointer.x, y: pointer.y };
    active = false;
  };

  const move = (pointer: Phaser.Input.Pointer): void => {
    if (!dragging) return;
    if (!active) {
      const travelled = Math.hypot(pointer.x - startPointer.x, pointer.y - startPointer.y);
      if (travelled < DRAG_START_PX) return;
      active = true;
      state.boardLayer.bringToTop(dragging);
      dragging.setScale(1.08);
    }
    dragging.setPosition(pointer.x, pointer.y);
  };

  const up = (pointer: Phaser.Input.Pointer): void => {
    const view = dragging;
    const from = fromCell;
    const wasDragging = active;
    dragging = null;
    fromCell = null;
    active = false;
    if (!view || !from) return;
    view.setScale(1);

    const target = opts.worldToCell(pointer.x, pointer.y);
    const home = opts.cellToWorld(from);

    // A tap: the booth dispenses, anything else does nothing.
    if (!wasDragging || !target || (target.col === from.col && target.row === from.row)) {
      view.setPosition(home.x, home.y);
      if (!wasDragging && view instanceof SpawnerView) tapBooth(scene, state, opts);
      return;
    }

    const targetCell = state.grid.get(target);
    const fromCellData = state.grid.get(from);
    if (!fromCellData || fromCellData.kind !== 'item') {
      view.setPosition(home.x, home.y);
      return;
    }

    // MERGE - onto a match, or onto a crusted cell of the same tier, which is
    // what clears the crust. Both are the main board's rules.
    const mergeable = targetCell
      && (targetCell.kind === 'item' || targetCell.kind === 'locked-item')
      && targetCell.typeId === fromCellData.typeId
      && targetCell.tier === fromCellData.tier
      && fromCellData.tier < EVENT_MAX_TIER;

    if (mergeable) {
      state.grid.set(from, null);
      state.grid.set(target, {
        kind: 'item', typeId: fromCellData.typeId, tier: fromCellData.tier + 1
      });
      rebuildCells(scene, state, opts, [from, target]);
      opts.save();
      opts.afterChange();
      return;
    }

    // A crusted cell of the WRONG tier is still a wall - the piece goes home
    // rather than swapping with something that cannot move.
    if (targetCell?.kind === 'locked-item') {
      view.setPosition(home.x, home.y);
      return;
    }

    // MOVE or SWAP.
    state.grid.set(from, targetCell ?? null);
    state.grid.set(target, fromCellData);
    rebuildCells(scene, state, opts, [from, target]);
    opts.save();
    opts.afterChange();
  };

  scene.input.on('pointerdown', down);
  scene.input.on('pointermove', move);
  scene.input.on('pointerup', up);
  return {
    detach: () => {
      scene.input.off('pointerdown', down);
      scene.input.off('pointermove', move);
      scene.input.off('pointerup', up);
    }
  };
}

/** Rebuilds just the cells that changed, rather than the whole board. */
function rebuildCells(
  scene: BoardScene,
  state: PanelState,
  opts: { cellToWorld: (pos: GridPosition) => { x: number; y: number } },
  cells: GridPosition[]
): void {
  for (const pos of cells) {
    const key = keyOf(pos);
    state.views.get(key)?.destroy();
    state.views.delete(key);
    const cell = state.grid.get(pos);
    if (!cell) continue;
    const world = opts.cellToWorld(pos);
    let view: TileView | SpawnerView | null = null;
    if (cell.kind === 'item' || cell.kind === 'locked-item') {
      view = new TileView(
        scene, world.x, world.y, state.cellSize, cell.typeId, cell.tier, pos,
        cell.kind === 'locked-item'
      );
    } else if (cell.kind === 'spawner') {
      view = new SpawnerView(scene, world.x, world.y, state.cellSize, cell, pos);
    }
    if (!view) continue;
    state.boardLayer.add(view);
    state.views.set(key, view);
  }
}

/**
 * One tap of the booth: one energy, one item.
 *
 * Tier 1 most of the time and tier 2 sometimes, so the bottom of the chain is
 * never a wall of identical taps - and never higher, because the whole board
 * is the climb.
 */
function tapBooth(
  scene: BoardScene,
  state: PanelState,
  opts: {
    cellToWorld: (pos: GridPosition) => { x: number; y: number };
    save: () => void;
    afterChange: () => void;
  }
): void {
  const free = firstFreeCell(state.grid);
  // A full board and an empty pool both stop a tap, and both say so on the
  // booth itself rather than doing nothing - a source that ignores a tap is
  // indistinguishable from a broken one.
  if (!free || !spendEventEnergy(scene.eventBoard, EVENT_SPAWN_COST)) {
    const booth = state.views.get(keyOf(EVENT_SPAWNER_AT));
    if (booth) {
      scene.tweens.killTweensOf(booth);
      const home = opts.cellToWorld(EVENT_SPAWNER_AT);
      scene.tweens.add({
        targets: booth, x: home.x + 3, duration: 55, yoyo: true, repeat: 1,
        ease: 'Sine.InOut', onComplete: () => booth.setX(home.x)
      });
    }
    return;
  }

  const tier = Math.random() < 0.22 ? 2 : 1;
  state.grid.set(free, { kind: 'item', typeId: EVENT_CHAIN.typeId, tier });
  rebuildCells(scene, state, opts, [free]);
  // Flies out of the booth, so a tap has an origin rather than an item
  // simply appearing somewhere else on the board.
  const spawned = state.views.get(keyOf(free));
  const booth = opts.cellToWorld(EVENT_SPAWNER_AT);
  if (spawned instanceof TileView) void spawned.playSpawnFrom(booth.x, booth.y);
  opts.save();
  opts.afterChange();
}

function firstFreeCell(grid: Grid): GridPosition | null {
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (!grid.get({ col, row })) return { col, row };
    }
  }
  return null;
}
