import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import {
  COLS,
  ROWS,
  PROJECT_STAGES,
  PROJECT_STAGE_NAMES,
  familyTierLabel,
  type ProjectStage
} from './config';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import {
  CURRENCY_COLOR,
  currencyChipOptions,
  currencyIcon,
  currencyPill,
  type CurrencyKind
} from '../../ui/CurrencyGlyph';
import { CRATE_DRAWN, drawCrate, drawTierIcon, iconPresentation } from '../../objects/TierIcons';
import { drawSplitterIcon } from '../../objects/SplitterView';
import { getTierDef } from '../../data/chains';
import { playerLevel } from '../../levels/Orders';
import { spendCoinsGeneric } from '../../economy/Economy';
import { addEnergy } from '../../economy/Energy';
import type { CrateTier } from '../../rewards/Rewards';
import { RoomView3D } from '../../rooms/RoomView3D';
import { ROOM_PIECES, ROOM_SCOPES, roomPiecesForStage, type RoomPiece } from '../../rooms/RoomView3D';

/**
 * projectPanel, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

/**
 * How many required items the board is still short, summed across lines.
 * Zero means the stage can be built.
 */
/**
 * Shuts the project panel completely and hands the board back.
 *
 * Extracted because a reward CANNOT be watched while this panel is open:
 * opening it hides every board object under depth 3000, and a crate created
 * behind it is hidden by that same sweep, so its flight animation plays on
 * an invisible object and is over before the player sees the board again.
 * The BUILD button already closed the panel before its reward fired, which
 * is the only reason hand-in rewards looked right and furniture rewards did
 * not.
 */
export function closeProjectPanel(scene: BoardScene): void {
  restoreBoardAfterRoom(scene);
  // Reopening builds a fresh RoomView3D, so the current one must be
  // disposed or its canvas stays in the DOM forever.
  scene.roomView?.dispose();
  scene.roomView = null;
  scene.projectOverlay?.destroy(true);
  scene.projectOverlay = null;
  scene.projectFooterRefresh = null;
  scene.modalOpen = false;
}

/** Puts the board back after the full-screen room panel closes. */
export function restoreBoardAfterRoom(scene: BoardScene): void {
  for (const obj of scene.roomHiddenForPanel) {
    (obj as Phaser.GameObjects.GameObject & { visible?: boolean }).visible = true;
  }
  scene.roomHiddenForPanel = [];
  scene.roomPanelOpen = false;
  scene.game.canvas.style.zIndex = '';
}

export function projectShortfall(scene: BoardScene, stage: ProjectStage): number {
  return stage.requirements.reduce(
    (short, req) => short + Math.max(0, req.count - scene.grid.countAtTier(req.tier, req.typeId)),
    0
  );
}

/**
 * The single answer to "does the project want the player's attention" -
 * shared by the level badge, the board button's dot and the profile panel,
 * which each used to re-derive it from the coin cost alone and would now
 * disagree about whether a stage was actually buildable.
 */
export function projectStageReady(scene: BoardScene): boolean {
  if (playerLevel(scene.orderState) < 3) return false;
  return projectPieceAffordable(scene) || projectUnlockReady(scene);
}

/** A piece of the open stage the player could buy right now. */
export function projectPieceAffordable(scene: BoardScene): boolean {
  return roomPiecesForStage(scene.projectStage)
    .some((piece) => !scene.builtPieces.has(piece.key) && scene.economy.coins >= piece.price);
}

/** Every piece a stage sells is bought. Stages with no pieces are trivially done. */
export function projectStageFurnished(scene: BoardScene, stage: number): boolean {
  return roomPiecesForStage(stage).every((piece) => scene.builtPieces.has(piece.key));
}

/**
 * The next stage can be unlocked.
 *
 * Furnishing the CURRENT stage is part of the gate: buying into stage 4
 * while stage 3 still has an empty corner would let the room fill out of
 * order and leave pieces sitting on supports that were never bought.
 */
export function projectUnlockReady(scene: BoardScene): boolean {
  const stage = PROJECT_STAGES[scene.projectStage];
  if (!stage || playerLevel(scene.orderState) < 3) return false;
  if (!projectStageFurnished(scene, scene.projectStage)) return false;
  return scene.economy.coins >= stage.coins && projectShortfall(scene, stage) === 0;
}

/**
 * Buys one piece of furniture and stands it in the room.
 *
 * The stage's reward waits for its LAST piece: a stage is finished when it
 * is furnished, not when it is unlocked, so the crate or the gems land on
 * the purchase that completes the look rather than on the one that opened
 * the list.
 */
/**
 * Whether the thing this piece sits on has been bought.
 *
 * The stage table already keeps a support in an earlier-or-equal stage, but
 * within a stage the shelf can be bought in any order - so the books could
 * be bought before the bookcase they stand in, and would hang in the air
 * until it arrived.
 */
export function roomPieceSupported(scene: BoardScene, piece: RoomPiece): boolean {
  return piece.restsOn == null || scene.builtPieces.has(piece.restsOn);
}

export function buyRoomPiece(scene: BoardScene, piece: RoomPiece, from: { x: number; y: number }): boolean {
  if (piece.stage > scene.projectStage) return false;
  if (scene.builtPieces.has(piece.key)) return false;
  if (!roomPieceSupported(scene, piece)) return false;
  if (!spendCoinsGeneric(scene.economy, piece.price)) return false;
  scene.builtPieces.add(piece.key);
  scene.roomView?.setBuilt(scene.builtPieces);
  if (projectStageFurnished(scene, piece.stage)) {
    // The panel STAYS OPEN. The reward is shown on top of it as a float, so
    // finishing a stage no longer throws the player out of the room they
    // are working on just to watch a crate land.
    scene.time.delayedCall(0, () => {
      grantFurnishReward(scene, piece.stage, from);
      scene.updateCurrencyText();
      scene.saveState();
    });
  }
  scene.updateCurrencyText();
  scene.refreshProjectButton();
  scene.updateLevelBadge();
  scene.saveState();
  return true;
}

/**
 * A STAGE PAYS TWICE, because a stage is two different pieces of work.
 *
 * Handing over the merge items is the accomplishment - it is what the board
 * was played for - and it used to pay nothing at all: the stage silently
 * unlocked and the payout turned up later, attached to buying a 150-coin
 * cushion. Furnishing the room is the other half, a coin sink you work
 * through piece by piece, and finishing it deserves marking too.
 *
 * So: the hand-in carries the main reward, and the last piece of furniture
 * carries a smaller one. Neither moment is silent, and each pays for what
 * it actually was.
 */
export function grantUnlockReward(scene: BoardScene, stage: number, from: { x: number; y: number }): void {
  // FOUR DIFFERENT KINDS OF THING, not one payout at four sizes.
  //
  // A ladder of crates pays out in the same currency the board already
  // rains on you, so each stage read as "more of what I have". The room is
  // the facility - the thing that is meant to be worth building - so what it
  // hands back should CHANGE something: a tool, a permanent capacity, and
  // the one crate the shop will never sell.
  if (stage === 1) {
    // Still a crate: it is the first hand-in, and a crate is the reward the
    // player already understands at that point.
    scene.awardCrate('bronze', 'STAGE COMPLETE', from);
    playProjectRewardFloat(scene, { kind: 'crate', tier: 'bronze' });
  } else if (stage === 2) {
    // A Splitter. A board TOOL rather than a payout - it changes how the
    // board is played, and it is otherwise a rare special-shop offer.
    scene.enqueueForcedSpawn({ kind: 'splitter' });
    scene.refreshActionTray('STAGE COMPLETE  ·  SPLITTER DELIVERED');
    playProjectRewardFloat(scene, { kind: 'splitter' });
  } else if (stage === 3) {
    // Bronze, not silver. The room costs 9,700 Credits and 240 energy -
    // about 210 Gems of input - and a bronze/silver/gold ladder paid ~25
    // crate slots against it, roughly double, before counting the Splitter
    // and the permanent slot. One crate opening the project and one closing
    // it is the shape; three made the middle repetitive as well as rich,
    // when the point of this ladder was that each rung is a different KIND
    // of thing.
    scene.awardCrate('bronze', 'STAGE COMPLETE', from);
    playProjectRewardFloat(scene, { kind: 'crate', tier: 'bronze' });
  } else if (stage >= 4) {
    // Silver, and NOT a briefcase slot.
    //
    // A slot was the one reward in the project with no physical form: the
    // count went up, a tray line said so, and nothing arrived - so the last
    // hand-in of the room looked like it had paid nothing at all. Every
    // rung of this ladder now lands on the board where the player can see
    // it, and silver sets up the gold that finishing the room pays.
    scene.awardCrate('silver', 'STAGE COMPLETE', from);
    playProjectRewardFloat(scene, { kind: 'crate', tier: 'silver' });
  }
  scene.projectFooterRefresh?.();
}

/** The smaller payout for standing the last piece of furniture in the room. */
export function grantFurnishReward(scene: BoardScene, stage: number, from: { x: number; y: number }): void {
  // The panel is usually still open behind the reward flying out of it, and
  // it was left showing the reward as pending until it was closed and
  // reopened. Redrawn at the end of this method.
  if (stage === 2) {
    addEnergy(scene.energy, 25);
    playProjectRewardFloat(scene, { kind: 'currency', currency: 'energy', amount: 25 });
  } else if (stage === 3) {
    addEnergy(scene.energy, 40);
    playProjectRewardFloat(scene, { kind: 'currency', currency: 'energy', amount: 40 });
  } else if (stage >= 4) {
    // The last piece of the last stage is the moment the ROOM IS FINISHED.
    // GOLD, not the vault: the whole living room costs 9,700 Credits and
    // eight Wood items - under five orders' income at the plateau - and it
    // is gated at level 3, so it is the onboarding room. The vault is the
    // crate the shop never sells and nothing else rolls; spending it here
    // would mean the best crate in the game is handed to a level-8 player
    // for the cheapest project in it, and there would be nothing left to
    // pay a room that costs fifteen times as much.
    scene.awardCrate('gold', 'ROOM COMPLETE', from);
    playProjectRewardFloat(scene, { kind: 'crate', tier: 'gold' });
  }
  scene.projectFooterRefresh?.();
}

export function consumeProjectItems(scene: BoardScene, stage: ProjectStage): void {
  for (const req of stage.requirements) {
    let remaining = req.count;
    for (let row = 0; row < ROWS && remaining > 0; row++) {
      for (let col = 0; col < COLS && remaining > 0; col++) {
        const pos = { col, row };
        const cell = scene.grid.get(pos);
        if (cell?.kind !== 'item' || cell.typeId !== req.typeId || cell.tier !== req.tier) continue;
        const key = scene.keyOf(pos);
        scene.views.get(key)?.destroy();
        scene.views.delete(key);
        scene.grid.set(pos, null);
        if (scene.selectedItemKey === key) scene.selectedItemKey = null;
        remaining--;
      }
    }
  }
}

export function drawLivingRoom(scene: BoardScene, g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number, stage: number): void {
  const left = cx - w / 2;
  const top = cy - h / 2;
  const floorY = top + h * 0.57;
  // Fixed three-quarter room shell. Every stage adds to these same planes.
  g.fillStyle(stage === 0 ? 0x59636a : 0xd2d5d4, 1);
  g.beginPath();
  g.moveTo(left, top + h * 0.12); g.lineTo(cx + w * 0.15, top);
  g.lineTo(cx + w * 0.15, floorY); g.lineTo(left, top + h * 0.72); g.closePath(); g.fillPath();
  g.fillStyle(stage === 0 ? 0x4b555c : 0xbec5c6, 1);
  g.beginPath();
  g.moveTo(cx + w * 0.15, top); g.lineTo(left + w, top + h * 0.18);
  g.lineTo(left + w, top + h * 0.73); g.lineTo(cx + w * 0.15, floorY); g.closePath(); g.fillPath();
  g.fillStyle(stage === 0 ? 0x3d454b : 0x7a8588, 1);
  g.beginPath();
  g.moveTo(left, top + h * 0.72); g.lineTo(cx + w * 0.15, floorY);
  g.lineTo(left + w, top + h * 0.73); g.lineTo(cx - w * 0.02, top + h); g.closePath(); g.fillPath();
  g.lineStyle(2, 0x273139, 0.75);
  g.lineBetween(cx + w * 0.15, top, cx + w * 0.15, floorY);

  if (stage >= 1) {
    // Cool daylight window and finished floor seams.
    g.fillStyle(0x58727e, 0.95);
    g.fillRect(left + w * 0.66, top + h * 0.25, w * 0.2, h * 0.25);
    g.lineStyle(2, 0xb9d0d8, 0.7);
    g.lineBetween(left + w * 0.76, top + h * 0.25, left + w * 0.76, top + h * 0.5);
    g.lineStyle(1, 0x59666b, 0.5);
    for (let i = 1; i < 5; i++) g.lineBetween(left + w * i / 5, top + h * 0.72, cx - w * 0.02 + w * i / 5, top + h);
  }
  if (stage >= 2) {
    // Main sofa and low table, broad architectural blocks rather than cartoon props.
    g.fillStyle(0x48565d, 1);
    g.fillRoundedRect(left + w * 0.2, top + h * 0.58, w * 0.42, h * 0.14, 5);
    g.fillStyle(0x68777d, 1);
    g.fillRoundedRect(left + w * 0.22, top + h * 0.52, w * 0.38, h * 0.1, 5);
    g.fillStyle(0x9da6a6, 1);
    g.fillRoundedRect(left + w * 0.53, top + h * 0.76, w * 0.2, h * 0.08, 4);
  }
  if (stage >= 3) {
    g.fillStyle(0x343f45, 1);
    g.fillRect(left + w * 0.06, top + h * 0.38, w * 0.1, h * 0.32);
    g.fillStyle(0x75898e, 1);
    g.fillRect(left + w * 0.075, top + h * 0.41, w * 0.07, h * 0.04);
    g.fillRect(left + w * 0.075, top + h * 0.49, w * 0.07, h * 0.04);
    g.lineStyle(3, 0x414c52, 1);
    g.lineBetween(left + w * 0.83, top + h * 0.51, left + w * 0.83, top + h * 0.69);
    g.fillStyle(0xc8d2d2, 1);
    g.fillCircle(left + w * 0.83, top + h * 0.48, 8);
  }
  if (stage >= 4) {
    g.fillStyle(0x405b55, 1);
    g.fillCircle(left + w * 0.88, top + h * 0.67, 13);
    g.fillStyle(0x69766f, 1);
    g.fillRect(left + w * 0.865, top + h * 0.68, 8, h * 0.12);
    g.fillStyle(0x87979a, 0.55);
    g.fillRoundedRect(left + w * 0.31, top + h * 0.79, w * 0.34, h * 0.12, 8);
    g.lineStyle(3, 0x758a92, 1);
    g.strokeRect(left + w * 0.28, top + h * 0.2, w * 0.2, h * 0.18);
  }
}

export function openProject(scene: BoardScene): void {
  if (scene.modalOpen) return;
  if (playerLevel(scene.orderState) < 3) {
    scene.refreshActionTray('LIVING ROOM PROJECT UNLOCKS AT LEVEL 3');
    return;
  }
  scene.modalOpen = true;

  // FULL SCREEN. The room fills the whole game area rather than sitting in an
  // inset panel, so the 3D canvas matches the game canvas exactly and the
  // panel's own UI draws on top of it.
  //
  // That means the 3D canvas goes UNDER Phaser's (which now clears to alpha)
  // and the board has to be hidden while the panel is open, or it would be
  // drawn over the room. Everything below depth 3000 is board content; the
  // overlay itself is 4000.
  //
  // Swept FIRST, before any of the panel's own objects exist. Run later, it
  // caught the panel's title, its stage line and the inspect readout - they
  // are created at depth 0 and only afterwards handed to the overlay - and
  // left them permanently invisible. Tapping a piece in the room highlighted
  // it and set a name that could never be seen.
  const hiddenForRoom: Phaser.GameObjects.GameObject[] = [];
  for (const child of scene.children.list) {
    const obj = child as Phaser.GameObjects.GameObject & { depth?: number; visible?: boolean };
    if ((obj.depth ?? 0) < 3000 && obj.visible !== false) {
      obj.visible = false;
      hiddenForRoom.push(child);
    }
  }
  scene.roomHiddenForPanel = hiddenForRoom;
  scene.roomPanelOpen = true;

  const overlay = scene.add.container(0, 0).setDepth(4000);
  scene.projectOverlay = overlay;
  const w = scene.scale.width;
  const h = scene.scale.height;
  // Fully TRANSPARENT: it exists to swallow taps that miss the panel's own
  // controls, not to darken anything. It was opaque and went unnoticed only
  // because the board-hiding sweep ran after it and swept it up too; with
  // the sweep moved earlier it became a sheet of paint over the room.
  // Phaser hit-tests interactive shapes by geometry, so alpha 0 still
  // catches the pointer.
  const dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x111619, 0).setInteractive();
  const title = scene.add.text(w / 2, 34, 'LIVING ROOM', {
    resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '21px', fontStyle: 'bold', color: hex(Theme.textOnDark)
  }).setOrigin(0.5);
  const stage = scene.add.text(w / 2, 58, `STAGE ${scene.projectStage + 1}/5  ·  ${PROJECT_STAGE_NAMES[scene.projectStage]}`, {
    resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5);
  const artPanel = scene.add.graphics();
  // The room fills the screen rather than sitting in a 390x430 box in the
  // middle of it. Everything below the art - the bill of materials, the
  // build button and the row under it - needs about 150px, and the title
  // pair above needs 78, so the art takes whatever is left.
  const artW = w - 16;
  // 152 was too little: the bill of materials, the reward row and the build
  // button collided once the art grew to fill the width.
  const artH = Math.max(240, h - 78 - 210);
  const artCx = w / 2;
  const artCy = 78 + artH / 2;
  // The room is real 3D, on its own canvas layered over the Phaser view.
  //
  // It used to be a shell sprite plus one sprite per piece, composited
  // back-to-front. That could never give camera movement - the camera is
  // baked into every pre-rendered frame - which is the thing the long-term
  // design actually needs. Three.js rather than a second game engine: it
  // shares this page and this JS heap, so object state can go straight into
  // the save file with no interop bridge.
  const roomParts: Phaser.GameObjects.GameObject[] = [];

  // Names the piece the player last tapped. Inspect only, for now.
  const inspect = scene.add.text(artCx, 86, '', {
    resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '11px',
    fontStyle: 'bold', color: hex(Theme.textOnDark),
    backgroundColor: 'rgba(10, 12, 14, 0.72)', padding: { x: 8, y: 4 }
  }).setOrigin(0.5).setAlpha(0);
  let inspectHide: Phaser.Time.TimerEvent | null = null;
  const showInspect = (label: string | null): void => {
    scene.tweens.killTweensOf(inspect);
    inspectHide?.remove(false);
    inspectHide = null;
    if (!label) { inspect.setAlpha(0); return; }
    inspect.setText(label.toUpperCase()).setAlpha(0).setScale(0.92);
    scene.tweens.add({
      targets: inspect, alpha: 1, scale: 1, duration: 120,
      onComplete: () => {
        inspectHide = scene.time.delayedCall(900, () => {
          scene.tweens.add({ targets: inspect, alpha: 0, duration: 220 });
        });
      }
    });
  };

  const canvasRect = scene.game.canvas.getBoundingClientRect();
  const roomCanvas = document.createElement('canvas');
  roomCanvas.style.zIndex = '0';
  scene.game.canvas.style.position = 'relative';
  scene.game.canvas.style.zIndex = '1';
  scene.game.canvas.parentElement?.appendChild(roomCanvas);

  scene.roomView?.dispose();
  scene.roomView = new RoomView3D(roomCanvas, {
    rect: {
      x: canvasRect.left, y: canvasRect.top,
      width: canvasRect.width, height: canvasRect.height
    },
    built: scene.builtPieces,
    onSelect: showInspect
  });
  void scene.roomView.load('rooms/living-room.glb');

  // Phaser owns input, so the orbit is driven from a Phaser zone rather than
  // from the 3D canvas - which is underneath and never sees a pointer.
  // Pushed into `roomParts` so it is added to the overlay BEFORE the title,
  // bill and build button, leaving those on top and still clickable.
  const orbitZone = scene.add.zone(w / 2, h / 2, w, h)
    .setInteractive({ useHandCursor: false, draggable: true });
  // Assigned once the scope label exists further down. Wheel and pinch change
  // scope too, so they have to refresh the same readout the buttons do -
  // otherwise the label only tracks button presses and silently goes stale.
  let refreshScopeLabel: () => void = () => {};
  let orbitMoved = 0;
  // The tap that OPENED this panel finishes here: its pointerup lands on a
  // zone that did not exist when the press began, and was picking whatever
  // object happened to sit under the button. A pick only counts when the
  // press started on this zone.
  let pressedHere = false;
  orbitZone.on('pointerdown', () => { orbitMoved = 0; pressedHere = true; });
  orbitZone.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
    const dx = pointer.x - pointer.prevPosition.x;
    const dy = pointer.y - pointer.prevPosition.y;
    orbitMoved += Math.abs(dx) + Math.abs(dy);
    scene.roomView?.orbitBy(dx, dy);
    // `drag` gives absolute positions we do not use; consuming them keeps
    // Phaser from complaining about unused parameters.
    void dragX; void dragY;
  });
  orbitZone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    // A drag orbits; only a genuine tap selects, same rule as the board.
    // Rotation settles on a quarter turn, so a released drag always lands on
    // a composed corner rather than wherever the finger stopped.
    if (!pressedHere) return;
    pressedHere = false;
    if (orbitMoved > 6) { scene.roomView?.settleRotation(); return; }
    // Scene units -> normalised device coordinates. The 3D canvas covers the
    // game canvas exactly, so the two spaces map straight onto each other.
    scene.roomView?.pickAt(
      (pointer.x / scene.scale.width) * 2 - 1,
      -(pointer.y / scene.scale.height) * 2 + 1
    );
  });
  // Wheel has to come through Phaser too - the 3D canvas is pointer-events
  // none, so its own wheel listener never fires.
  orbitZone.on('wheel', (_p: Phaser.Input.Pointer, _dx: number, dy: number) => {
    if (scene.roomView?.zoomBy(dy * 0.01)) refreshScopeLabel();
  });

  // Pinch: Phaser reports two pointers, and the change in the distance
  // between them is the zoom. Tracked here because a zone only reports one.
  // Phaser tracks one pointer by default; pinch needs a second.
  scene.input.addPointer(1);
  let pinchStart = 0;
  orbitZone.on('pointermove', () => {
    const p1 = scene.input.pointer1;
    const p2 = scene.input.pointer2;
    if (!p1.isDown || !p2.isDown) { pinchStart = 0; return; }
    const spread = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
    if (pinchStart === 0) { pinchStart = spread; return; }
    if (scene.roomView?.zoomBy((pinchStart - spread) * 0.02)) refreshScopeLabel();
    pinchStart = spread;
  });

  // Discrete zoom, stepping between scopes. The view itself communicates
  // the scale, so no ROOM/HOUSE/STREET label is drawn over the scene.
  const showScope = (): void => {};
  refreshScopeLabel = showScope;

  const zoomBtn = (dy: number, glyph: string, onTap: () => void): Phaser.GameObjects.GameObject[] => {
    const bx = w - 34;
    const by = h / 2 + dy;
    const g = scene.add.graphics();
    g.fillStyle(Theme.bg, 0.82);
    g.fillRoundedRect(bx - 17, by - 17, 34, 34, Theme.radiusChip);
    g.lineStyle(1, Theme.borderOnDark, 0.9);
    g.strokeRoundedRect(bx - 17, by - 17, 34, 34, Theme.radiusChip);
    const t = scene.add.text(bx, by, glyph, {
      resolution: textResolution, fontFamily: Theme.fontHeading,
      fontSize: '18px', fontStyle: 'bold', color: hex(Theme.textOnDark)
    }).setOrigin(0.5);
    const z = scene.add.zone(bx, by, 40, 40).setInteractive({ useHandCursor: true });
    z.on('pointerup', () => { onTap(); showScope(); });
    return [g, t, z];
  };

  // Dev-only light tuning. Arrow keys move the key light and the readout
  // shows where it is, so the angle can be found by eye and then baked into
  // RoomView3D's defaults. Stripped from production builds.
  if (import.meta.env?.DEV) {
    const keys = scene.input.keyboard;
    const onKey = (e: KeyboardEvent): void => {
      const step = e.shiftKey ? 0.02 : 0.08;
      let dz = 0;
      let de = 0;
      if (e.key === 'ArrowLeft') dz = -step;
      else if (e.key === 'ArrowRight') dz = step;
      else if (e.key === 'ArrowUp') de = step;
      else if (e.key === 'ArrowDown') de = -step;
      else return;
      e.preventDefault();
      const at = scene.roomView?.nudgeLight(dz, de);
      if (at) inspect.setText(`LIGHT  OFFSET ${at.offset}   ELEVATION ${at.elevation}`);
    };
    keys?.on('keydown', onKey);
    orbitZone.once('destroy', () => keys?.off('keydown', onKey));
  }

  roomParts.push(orbitZone);
  roomParts.push(...zoomBtn(-24, '+', () => scene.roomView?.zoomIn()));
  roomParts.push(...zoomBtn(24, '−', () => scene.roomView?.zoomOut()));
  roomParts.push(inspect);
  scene.time.delayedCall(80, showScope);
  void ROOM_SCOPES;

  const close = scene.add.text(22, 28, '‹ BOARD', {
    resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '13px', fontStyle: 'bold', color: hex(Theme.textOnDark)
  }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
  const closeProject = () => {
    // The 3D canvas is a DOM sibling of the game canvas, so it is not owned
    // by the Phaser overlay and has to be disposed explicitly.
    restoreBoardAfterRoom(scene);
    scene.roomView?.dispose();
    scene.roomView = null;
    overlay.destroy(true);
    scene.projectOverlay = null;
    scene.projectFooterRefresh = null;
    scene.modalOpen = false;
    scene.refreshProjectButton();
  };
  close.on('pointerdown', closeProject);

  // ---- Footer ----
  //
  // Two modes, and the state picks which: while the open stage still has
  // furniture for sale it is a SHOPPING LIST, and once that stage is fully
  // furnished it becomes the unlock for the next one. Both draw into one
  // container that re-renders after every purchase, because buying the last
  // piece of a stage has to turn the list into the unlock without the player
  // closing the panel.
  const footer = scene.add.container(0, 0);
  const rewardOrigin = { x: w / 2, y: artCy };

  const renderShoppingList = (pieces: RoomPiece[]): void => {
    const rowW = Math.min(330, w - 28);
    const rowH = 28;
    const top = artCy + artH / 2 + 26;
    footer.add(scene.add.text(w / 2, top - 16, 'FURNISH THIS STAGE', {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
      fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5));

    pieces.forEach((piece, i) => {
      const y = top + rowH / 2 + i * (rowH + 3);
      const owned = scene.builtPieces.has(piece.key);
      const supported = roomPieceSupported(scene, piece);
      const affordable = !owned && supported && scene.economy.coins >= piece.price;
      const support = piece.restsOn == null
        ? null
        : ROOM_PIECES.find((other) => other.key === piece.restsOn) ?? null;
      // Colour carries the state, not opacity - the same rule the order
      // cards and the inventory slots follow.
      const tone = owned ? Theme.accentGreen : affordable ? Theme.accentAmber : Theme.borderOnDark;
      const row = scene.add.graphics();
      row.fillStyle(owned ? Theme.accentGreen : Theme.bgElevated, owned ? 0.16 : 1);
      row.fillRoundedRect(w / 2 - rowW / 2, y - rowH / 2, rowW, rowH, Theme.radiusChip);
      row.lineStyle(1, tone, owned ? 0.85 : affordable ? 0.8 : 0.5);
      row.strokeRoundedRect(w / 2 - rowW / 2, y - rowH / 2, rowW, rowH, Theme.radiusChip);
      footer.add(row);

      footer.add(scene.add.text(w / 2 - rowW / 2 + 12, y, piece.label.toUpperCase(), {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '11px', fontStyle: 'bold',
        color: hex(owned ? Theme.accentGreen : affordable ? Theme.textOnDark : Theme.textOnDarkMuted)
      }).setOrigin(0, 0.5));

      if (owned) {
        footer.add(scene.add.text(w / 2 + rowW / 2 - 12, y, 'BUILT', {
          resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
          fontStyle: 'bold', color: hex(Theme.accentGreen)
        }).setOrigin(1, 0.5));
        return;
      }

      // A piece with nowhere to sit names what it is waiting for instead of
      // showing a price it cannot take.
      if (!supported && support) {
        footer.add(scene.add.text(w / 2 + rowW / 2 - 12, y, `NEEDS ${support.label.toUpperCase()}`, {
          resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px',
          color: hex(Theme.textOnDarkMuted)
        }).setOrigin(1, 0.5));
        return;
      }

      const priceColor = affordable ? CURRENCY_COLOR.credit : Theme.textOnDarkMuted;
      const price = currencyPill(scene, piece.price.toLocaleString(), 'credit', {
        ...currencyChipOptions('credit'),
        fontSize: 11, iconSize: 16, height: 20,
        textColor: priceColor, stroke: priceColor
      });
      price.setPosition(w / 2 + rowW / 2 - 10 - price.width / 2, y);
      // `currencyPill` has no colour hook for the mark itself, so the icon -
      // its third child - is dimmed directly to match an unaffordable price.
      const mark = price.list[2] as Partial<Phaser.GameObjects.Components.Alpha> | undefined;
      if (!affordable) mark?.setAlpha?.(0.45);
      footer.add(price);

      if (!affordable) return;
      const zone = scene.add.zone(w / 2, y, rowW, rowH).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (buyRoomPiece(scene, piece, rewardOrigin)) renderFooter();
      });
      footer.add(zone);
    });

    // What finishing the stage pays. The unlock step already showed this,
    // but that is the one moment the player is NOT working toward it - the
    // pull belongs here, on the list they are working through. On the last
    // stage it is the reward for completing the room.
    const lineY = top + pieces.length * (rowH + 3) + 16;
    const prompt = scene.add.text(w / 2, lineY, 'FINISH THIS STAGE  ·  GET', {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
      fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
    }).setOrigin(1, 0.5).setPosition(w / 2 - 6, lineY);
    footer.add(prompt);

    // Mirrors `grantFurnishReward` - this list is the FURNITURE, so it
    // shows what finishing the furniture pays, not what the hand-in pays.
    if (scene.projectStage >= 4) {
      const finish = scene.add.graphics().setPosition(w / 2 + 16, lineY);
      drawCrate(finish, 26 / CRATE_DRAWN.width, 'gold');
      footer.add(finish);
    } else {
      footer.add(currencyPill(scene, scene.projectStage === 3 ? '40' : '25', 'energy', {
        ...currencyChipOptions('energy'), fontSize: 11, iconSize: 16, height: 22
      }).setPosition(w / 2 + 26, lineY));
    }
  };

  const renderUnlock = (stageDef: ProjectStage | undefined): void => {
    const complete = stageDef == null;
    const shortfall = stageDef ? projectShortfall(scene, stageDef) : 0;
    const affordable = stageDef != null && scene.economy.coins >= stageDef.coins;
    const buildable = stageDef != null && affordable && shortfall === 0;

    // Built UPWARD from the bottom of the screen, in the same rows the
    // shopping list uses: one line per thing you owe, its state on the
    // right. The old version scattered a coin chip, square item plates and
    // a separate reward line across the middle of the panel at three
    // different sizes, and none of them lined up with anything.
    const rowW = Math.min(330, w - 28);
    const rowH = 28;
    const left = w / 2 - rowW / 2;
    const right = w / 2 + rowW / 2;
    const buttonH = 42;
    const buttonY = h - 16 - buttonH / 2;

    // Rows: the credits, when a stage charges any, then the materials.
    const rows: { label: string; met: boolean; req?: { typeId: string; tier: number; count: number } }[] = [];
    if (stageDef && stageDef.coins > 0) {
      rows.push({ label: `${stageDef.coins.toLocaleString()} CREDITS`, met: affordable });
    }
    for (const req of stageDef?.requirements ?? []) {
      const have = scene.grid.countAtTier(req.tier, req.typeId);
      rows.push({
        label: `${req.count}x ${familyTierLabel(req.typeId, req.tier)}`,
        met: have >= req.count,
        req
      });
    }

    const rewardY = buttonY - buttonH / 2 - 20;
    const rowsBottom = rewardY - 18;
    const rowsTop = rowsBottom - rows.length * (rowH + 3);

    if (stageDef) {
      footer.add(scene.add.text(w / 2, rowsTop - 14, `TO OPEN ${PROJECT_STAGE_NAMES[scene.projectStage + 1]}`, {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
        fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5));
    }

    rows.forEach((row, i) => {
      const y = rowsTop + rowH / 2 + i * (rowH + 3);
      const tone = row.met ? Theme.accentGreen : Theme.borderOnDark;
      const bg = scene.add.graphics();
      bg.fillStyle(row.met ? Theme.accentGreen : Theme.bgElevated, row.met ? 0.16 : 1);
      bg.fillRoundedRect(left, y - rowH / 2, rowW, rowH, Theme.radiusChip);
      bg.lineStyle(1, tone, row.met ? 0.85 : 0.5);
      bg.strokeRoundedRect(left, y - rowH / 2, rowW, rowH, Theme.radiusChip);
      footer.add(bg);

      // The item's own art, at the row's height, so a requirement is
      // recognisable without reading it.
      let textX = left + 12;
      if (row.req) {
        const def = getTierDef(row.req.typeId, row.req.tier);
        const art = rowH + 8;
        const icon = scene.add.graphics();
        const { materialAlpha } = drawTierIcon(
          icon, row.req.typeId, row.req.tier, art,
          materialLighting(def?.color ?? Theme.panelAlt, row.req.tier)
        );
        icon.setAlpha(row.met ? materialAlpha : materialAlpha * 0.55);
        const present = iconPresentation(row.req.typeId, row.req.tier, art);
        icon.setScale(present.scale).setPosition(left + 20 + present.offsetX, y + present.offsetY);
        footer.add(icon);
        textX = left + 40;
      }

      footer.add(scene.add.text(textX, y, row.label.toUpperCase(), {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '11px', fontStyle: 'bold',
        color: hex(row.met ? Theme.accentGreen : Theme.textOnDark)
      }).setOrigin(0, 0.5));

      // Right edge carries the state: how many you have, or a tick.
      const status = row.req
        ? `${Math.min(scene.grid.countAtTier(row.req.tier, row.req.typeId), row.req.count)}/${row.req.count}`
        : row.met ? 'READY' : 'SHORT';
      footer.add(scene.add.text(right - 12, y, status, {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px', fontStyle: 'bold',
        color: hex(row.met ? Theme.accentGreen : Theme.textOnDarkMuted)
      }).setOrigin(1, 0.5));
    });

    // Reward line, worded and placed exactly like the shopping list's, so
    // the two halves of the panel read as one thing.
    if (stageDef) {
      footer.add(scene.add.text(w / 2 - 6, rewardY, 'ON OPENING  ·  GET', {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
        fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
      }).setOrigin(1, 0.5));

      // Mirrors `grantUnlockReward`, keyed to the stage this hand-in OPENS
      // (projectStage + 1): bronze, then gems, then silver, then gold.
      // Mirrors `grantUnlockReward`, keyed to the stage this hand-in OPENS:
      // a crate, a splitter, an inventory slot, then the vault.
      const opening = scene.projectStage + 1;
      const rewardIcon = scene.add.graphics().setPosition(w / 2 + 16, rewardY);
      if (opening === 2) {
        drawSplitterIcon(rewardIcon, 26);
      } else {
        drawCrate(rewardIcon, 26 / CRATE_DRAWN.width, opening >= 4 ? 'silver' : 'bronze');
      }
      footer.add(rewardIcon);
    }

    const buttonBg = scene.add.graphics();
    const buttonColor = complete ? Theme.panelAlt : buildable ? Theme.accentGreen : Theme.textOnDarkMuted;
    const buttonLighting = materialLighting(buttonColor, buildable ? 5 : 2);
    buttonBg.fillGradientStyle(
      buttonLighting.highlight, buttonLighting.light,
      buttonLighting.dark, buttonLighting.shadow, 1
    );
    // Full row width, so the button is the base of the same column the rows
    // stand in rather than a narrower shape floating under them.
    buttonBg.fillRoundedRect(left, buttonY - buttonH / 2, rowW, buttonH, Theme.radiusChip);
    // The label names the MISSING half rather than repeating the price, which
    // the rows above already show. It says OPEN rather than BUILD: the button
    // no longer builds a stage, it unlocks one to be furnished.
    const label = complete
      ? 'PROJECT COMPLETE  ·  NEXT ROOM COMING SOON'
      : buildable ? `OPEN ${PROJECT_STAGE_NAMES[scene.projectStage + 1]}`
      : shortfall > 0 ? 'MISSING REQUIREMENTS'
      : 'NOT ENOUGH CREDITS';
    const buttonText = scene.add.text(w / 2, buttonY, label, {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '13px',
      fontStyle: 'bold', color: hex(complete ? Theme.textOnDarkMuted : Theme.bg)
    }).setOrigin(0.5);
    const buttonZone = scene.add.zone(w / 2, buttonY, rowW, buttonH).setInteractive({ useHandCursor: true });
    if (buildable && stageDef) buttonZone.on('pointerdown', () => confirmProjectPurchase(scene, stageDef));
    footer.add([buttonBg, buttonText, buttonZone]);
  };

  const renderFooter = (): void => {
    if (!scene.projectOverlay) return;
    footer.removeAll(true);
    stage.setText(`STAGE ${scene.projectStage + 1}/5  ·  ${PROJECT_STAGE_NAMES[scene.projectStage]}`);
    const pieces = roomPiecesForStage(scene.projectStage);
    if (pieces.some((piece) => !scene.builtPieces.has(piece.key))) {
      renderShoppingList(pieces);
      return;
    }
    renderUnlock(PROJECT_STAGES[scene.projectStage]);
  };

  overlay.add([dim, artPanel, ...roomParts, title, stage, close, footer]);
  scene.projectFooterRefresh = renderFooter;
  renderFooter();
}

export function confirmProjectPurchase(scene: BoardScene, stageDef: ProjectStage): void {
  if (!scene.projectOverlay || scene.projectStage >= PROJECT_STAGES.length) return;
  const cost = stageDef.coins;
  const w = scene.scale.width;
  const h = scene.scale.height;
  const confirm = scene.add.container(0, 0).setDepth(4100);
  const dim = scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.68).setInteractive();
  const panel = scene.add.graphics();
  const pw = Math.min(310, w - 42);
  panel.fillStyle(Theme.bgElevated, 1).fillRoundedRect(w / 2 - pw / 2, h / 2 - 92, pw, 184, Theme.radiusPanel);
  panel.lineStyle(1, Theme.borderOnDark, 1).strokeRoundedRect(w / 2 - pw / 2, h / 2 - 92, pw, 184, Theme.radiusPanel);
  const rewardNames = ['25 ENERGY', 'BRONZE CRATE', '10 GEMS', 'GOLD CRATE'];
  const title = scene.add.text(w / 2, h / 2 - 55, `OPEN ${PROJECT_STAGE_NAMES[scene.projectStage + 1]}?`, {
    resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '14px', fontStyle: 'bold', color: hex(Theme.textOnDark), align: 'center', wordWrap: { width: pw - 30 }
  }).setOrigin(0.5);
  // Spells out the items as well as the credits: they leave the board on
  // confirm, and that is not recoverable.
  const materials = stageDef.requirements
    .map((req) => `${req.count}x ${req.typeId.toUpperCase()} ${String(req.tier).padStart(2, '0')}`)
    .join('  ·  ');
  // The credits line is dropped when the unlock is materials-only, which is
  // every stage but the surfaces one - printing "0 CREDITS" would read as a
  // price rather than as the absence of one. The reward line says when it
  // arrives, because for a stage with furniture it is no longer paid here:
  // it waits for the last piece of that stage to be bought.
  const price = cost > 0 ? `${cost.toLocaleString()} CREDITS  ·  ${materials}` : materials;
  const pieceCount = roomPiecesForStage(scene.projectStage + 1).length;
  const rewardLine = pieceCount > 0
    ? `REWARD ${rewardNames[scene.projectStage]} WHEN FURNISHED`
    : `REWARD ${rewardNames[scene.projectStage]}`;
  const detail = scene.add.text(
    w / 2, h / 2 - 12,
    `${price}
${rewardLine}`,
    {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
      color: hex(Theme.textOnDarkMuted), align: 'center', lineSpacing: 4
    }
  ).setOrigin(0.5);
  const makeChoice = (x: number, label: string, color: number) => {
    const bg = scene.add.graphics();
    bg.fillStyle(Theme.panelAlt, 1).fillRoundedRect(x - 55, h / 2 + 35, 110, 36, Theme.radiusChip);
    bg.lineStyle(1, color, 1).strokeRoundedRect(x - 55, h / 2 + 35, 110, 36, Theme.radiusChip);
    const text = scene.add.text(x, h / 2 + 53, label, {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold', color: hex(color)
    }).setOrigin(0.5);
    const zone = scene.add.zone(x, h / 2 + 53, 110, 36).setInteractive({ useHandCursor: true });
    return { bg, text, zone };
  };
  const cancel = makeChoice(w / 2 - 64, 'CANCEL', Theme.textOnDarkMuted);
  const build = makeChoice(w / 2 + 64, 'BUILD', Theme.accentGreen);
  const close = () => confirm.destroy(true);
  dim.on('pointerdown', close);
  cancel.zone.on('pointerdown', close);
  build.zone.on('pointerdown', () => {
    const from = { x: w / 2, y: h / 2 - 8 };
    if (!completeProjectStage(scene, stageDef, from, true)) {
      close();
      return;
    }
    confirm.destroy(true);
    closeProjectPanel(scene);
  });
  confirm.add([dim, panel, title, detail, cancel.bg, cancel.text, cancel.zone, build.bg, build.text, build.zone]);
  scene.projectOverlay.add(confirm);
}

export function completeProjectStage(
scene: BoardScene,
  stageDef: ProjectStage,
  from: { x: number; y: number },
  reopenProject = false
): boolean {
  if (stageDef !== PROJECT_STAGES[scene.projectStage]) return false;
  if (!projectStageFurnished(scene, scene.projectStage)) return false;
  if (projectShortfall(scene, stageDef) > 0 || !spendCoinsGeneric(scene.economy, stageDef.coins)) return false;
  consumeProjectItems(scene, stageDef);
  scene.refreshOrderBar();
  scene.checkDeadlock();
  const unlockedStage = ++scene.projectStage;
  // Every hand-in pays, including the one that opens the furniture-less
  // surfaces stage. This used to be the ONLY case that paid on unlock,
  // which is why handing over the items felt like nothing had happened.
  scene.time.delayedCall(0, () => {
    grantUnlockReward(scene, unlockedStage, from);
    scene.updateCurrencyText();
    scene.saveState();
  });
  if (reopenProject) {
    scene.time.delayedCall(900, () => {
      if (!scene.modalOpen) openProject(scene);
    });
  }
  return true;
}

/**
 * A project reward, shown WHERE THE PLAYER IS.
 *
 * Rewards used to fly to the board or to a HUD counter, which meant they
 * could only be watched with the project panel shut - the panel hides every
 * board object under depth 3000, so a reward granted behind it animated
 * invisibly. The fix was briefly to close the panel first, which threw the
 * player out of the room they were in the middle of furnishing.
 *
 * Instead the reward pops up over the panel and floats away: its own art,
 * a neon `+` to the left of it, and for currency the amount. The thing it
 * represents is still granted through the ordinary path underneath - a
 * crate really does land on the board - so this is the presentation, not
 * the delivery.
 */
export function playProjectRewardFloat(
scene: BoardScene,
  reward:
    | { kind: 'crate'; tier: CrateTier }
    | { kind: 'splitter' }
    | { kind: 'currency'; currency: CurrencyKind; amount: number }
): void {
  const ART = 62;
  const GAP = 8;
  // Neon rather than the theme's accent green: this sits over a lit panel
  // rather than on the dark board, and the muted green disappeared into it.
  const NEON = 0x4dff9a;

  const group = scene.add.container(scene.scale.width / 2, scene.scale.height / 2 + 12)
    .setDepth(4200);

  const plus = scene.add.text(0, 0, '+', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '42px', fontStyle: 'bold', color: hex(NEON)
  }).setOrigin(0.5);

  let amount: Phaser.GameObjects.Text | null = null;
  if (reward.kind === 'currency') {
    amount = scene.add.text(0, 0, String(reward.amount), {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: '34px', fontStyle: 'bold', color: hex(NEON)
    }).setOrigin(0.5);
  }

  let art: Phaser.GameObjects.GameObject & { setPosition: (x: number, y: number) => unknown };
  if (reward.kind === 'crate') {
    const g = scene.add.graphics();
    drawCrate(g, ART / CRATE_DRAWN.width, reward.tier);
    art = g;
  } else if (reward.kind === 'splitter') {
    const g = scene.add.graphics();
    drawSplitterIcon(g, ART);
    art = g;
  } else {
    art = currencyIcon(scene, reward.currency, ART);
  }

  // Laid out left to right and centred as one group: plus, the number when
  // there is one, then the art.
  const widths = [plus.width, ...(amount ? [amount.width] : []), ART];
  const total = widths.reduce((sum, w) => sum + w, 0) + GAP * (widths.length - 1);
  let cursor = -total / 2;
  const place = (obj: { setPosition: (x: number, y: number) => unknown }, w: number) => {
    obj.setPosition(cursor + w / 2, 0);
    cursor += w + GAP;
  };
  place(plus, plus.width);
  if (amount) place(amount, amount.width);
  place(art, ART);

  group.add([plus, ...(amount ? [amount] : []), art as Phaser.GameObjects.GameObject]);

  // Pops in, holds for a beat, then floats up and away.
  group.setScale(0.55).setAlpha(0);
  scene.tweens.add({ targets: group, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: group,
    y: group.y - 96,
    alpha: 0,
    delay: 620,
    duration: 620,
    ease: 'Quad.easeIn',
    onComplete: () => group.destroy(true)
  });
}
