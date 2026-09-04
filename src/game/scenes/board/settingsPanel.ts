import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import {
  AUTO_MERGE_KEY,
  SAVE_KEY,
  fullscreenElement,
  fullscreenSupported,
  toggleFullscreen
} from './config';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';

/**
 * settingsPanel, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

/**
 * Settings: a small gear immediately left of the shop button.
 *
 * It sits in the band `layoutHudChips` gives up for it - the chips pack
 * right-to-left from a fixed inset, so the gear's width has to come out of
 * that inset or the credit balance would slide underneath it.
 */
export function buildSettingsButton(scene: BoardScene): void {
  const s = scene.hudScale;
  const size = 22 * s;
  // The shop button is a radius-18 circle centred at `headerRight - 18`, so
  // its left edge is `headerRight - 36`; four pixels of air, then the gear.
  const x = scene.headerRight - 36 * s - 4 * s - size / 2;
  // The header row's shared centre line - see `headerMidY` in create().
  const y = scene.contentTop + 42 * scene.hudScale - 16;

  const bg = scene.add.graphics().setDepth(4);
  bg.fillStyle(Theme.bg, 0.94);
  bg.fillRoundedRect(x - size / 2, y - size / 2, size, size, Theme.radiusChip);
  bg.lineStyle(1, Theme.borderOnDark, 1);
  bg.strokeRoundedRect(x - size / 2, y - size / 2, size, size, Theme.radiusChip);

  const icon = scene.add.graphics().setPosition(x, y).setDepth(5).setScale(s);
  const lighting = materialLighting(Theme.textOnDarkMuted, 4);
  icon.fillStyle(lighting.light, 1);
  const teeth = 8;
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    // Each tooth is drawn at the origin and moved into place by the canvas
    // transform, so they sit square to their own radius instead of being
    // axis-aligned squares that read as a blur at this size.
    icon.save();
    icon.translateCanvas(Math.cos(angle) * 6, Math.sin(angle) * 6);
    icon.rotateCanvas(angle);
    icon.fillRect(-1.9, -1.9, 3.8, 3.8);
    icon.restore();
  }
  icon.fillCircle(0, 0, 5.2);
  icon.fillStyle(Theme.bg, 1);
  icon.fillCircle(0, 0, 2.2);

  // Hit area stays finger-sized even though the art shrank - a 22px target
  // is under every touch guideline, and this one sits next to the shop
  // button, where a miss costs the player a wrong panel.
  const zone = scene.add.zone(x, y, size + 14, size + 14)
    .setDepth(6).setInteractive({ useHandCursor: true });
  zone.on('pointerdown', () => scene.time.delayedCall(0, () => openSettings(scene)));
}

/**
 * The settings panel. One setting so far: fullscreen.
 *
 * Toggling fullscreen resizes the viewport, and this scene answers a resize
 * by restarting itself, so the panel closes on its own a moment after the
 * tap. That is the architecture working rather than a bug - the whole HUD
 * has to be laid out again against the new size - so the panel does not try
 * to survive it.
 */
export function openSettings(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  scene.modalOpen = true;
  const w = scene.scale.width;
  const h = scene.scale.height;
  const overlay = scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6)
    .setDepth(3000).setInteractive();

  const card = scene.add.container(w / 2, h / 2).setDepth(3001);
  const cw = Math.min(300, w - 40);
  const ch = 168;
  const cardBg = scene.add.graphics();
  cardBg.fillStyle(Theme.panel, 1);
  cardBg.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, Theme.radiusPanel);
  cardBg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 0.85);
  cardBg.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, Theme.radiusPanel);

  const title = scene.add.text(0, -ch / 2 + 26, 'SETTINGS', {
    resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '16px',
    fontStyle: 'bold', color: hex(Theme.textOnLight)
  }).setOrigin(0.5);

  // Not every browser has the Fullscreen API - iOS Safari on iPhone has
  // never shipped it - so the row says so plainly and points at the route
  // that does work there, rather than offering a control that does nothing.
  const available = fullscreenSupported();
  const rowY = -6;
  const label = scene.add.text(-cw / 2 + 20, rowY, 'FULLSCREEN', {
    resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '13px',
    fontStyle: 'bold', color: hex(available ? Theme.textOnLight : Theme.textOnLightMuted)
  }).setOrigin(0, 0.5);

  const toggleW = 68;
  const toggleH = 28;
  const toggleX = cw / 2 - 20 - toggleW / 2;
  const toggleBg = scene.add.graphics();
  const toggleText = scene.add.text(toggleX, rowY, '', {
    resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '11px',
    fontStyle: 'bold', color: hex(Theme.textOnLight)
  }).setOrigin(0.5);

  const paintToggle = (): void => {
    const on = !!fullscreenElement();
    const tone = !available ? Theme.textOnLightMuted : on ? Theme.accentGreen : Theme.textOnLightMuted;
    toggleBg.clear();
    toggleBg.fillStyle(on && available ? Theme.accentGreen : Theme.panelAlt, on && available ? 0.22 : 1);
    toggleBg.fillRoundedRect(toggleX - toggleW / 2, rowY - toggleH / 2, toggleW, toggleH, Theme.radiusChip);
    toggleBg.lineStyle(1, tone, 0.9);
    toggleBg.strokeRoundedRect(toggleX - toggleW / 2, rowY - toggleH / 2, toggleW, toggleH, Theme.radiusChip);
    toggleText.setText(!available ? 'N/A' : on ? 'ON' : 'OFF').setColor(hex(tone));
  };
  paintToggle();

  const note = scene.add.text(
    0, ch / 2 - 46,
    available
      ? 'THE GAME REBUILDS ITS LAYOUT WHEN THIS CHANGES.'
      : 'THIS BROWSER HAS NO FULLSCREEN API.\nADD THE GAME TO YOUR HOME SCREEN INSTEAD.',
    {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px',
      color: hex(Theme.textOnLightMuted), align: 'center', lineSpacing: 3
    }
  ).setOrigin(0.5);

  const close = scene.add.text(0, ch / 2 - 22, 'CLOSE', {
    resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '13px',
    fontStyle: 'bold', color: hex(Theme.textOnLightMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  card.add([cardBg, title, label, toggleBg, toggleText, note, close]);

  const dismiss = () => {
    overlay.destroy();
    card.destroy();
    scene.modalOpen = false;
  };

  if (available) {
    const toggleZone = scene.add.zone(toggleX, rowY, toggleW, toggleH)
      .setInteractive({ useHandCursor: true });
    // Fullscreen has to be requested from inside a real user gesture, which
    // a pointerdown handler is - so this is NOT deferred through a
    // delayedCall the way the panel's other taps are. Deferring drops it
    // out of the gesture and the browser refuses the request.
    toggleZone.on('pointerdown', () => {
      // Phaser's own toggle wraps the canvas in an element it creates, which
      // does not survive this scene's restart-on-resize; the request went
      // through the DOM instead, and `toggleFullscreen` handles the prefixed
      // spellings phones still ship.
      toggleFullscreen();
      // Closed immediately rather than left open to be torn down by the
      // resize-driven restart. Entering fullscreen moves and resizes the
      // canvas, and until the scale manager re-reads its bounds every
      // pointer hit lands at the old coordinates - so CLOSE stops
      // responding and the panel becomes a trap with the game running
      // behind it. Nothing to be trapped in if it is already gone.
      dismiss();
    });
    card.add(toggleZone);
  }

  const deferDismiss = () => scene.time.delayedCall(0, dismiss);
  overlay.on('pointerdown', deferDismiss);
  close.on('pointerdown', deferDismiss);
}

/**
 * RESET is a dev-only utility, not part of the real game's HUD. Pinned to
 * an absolute screen corner with its own tiny footprint so it can be
 * deleted in one line without touching any other header element.
 */
export function buildDevResetButton(scene: BoardScene): void {
  const text = scene.add.text(scene.scale.width - 8, scene.scale.height - 8, 'reset', {
    resolution: textResolution,
    fontFamily: Theme.fontMono,
    fontSize: '10px',
    color: hex(Theme.textOnDarkMuted)
  }).setOrigin(1, 1).setAlpha(0.5).setInteractive({ useHandCursor: true });
  text.on('pointerover', () => text.setAlpha(1));
  text.on('pointerout', () => text.setAlpha(0.5));
  text.on('pointerdown', () => confirmReset(scene));
}

/** Wipes the save and starts over. Confirmed via confirmReset() before this runs. */
export function resetGame(scene: BoardScene): void {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(AUTO_MERGE_KEY);
  window.location.reload();
}

export function confirmReset(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  scene.modalOpen = true;
  const overlay = scene.add.rectangle(
    scene.scale.width / 2, scene.scale.height / 2,
    scene.scale.width, scene.scale.height,
    0x000000, 0.6
  ).setDepth(3000).setInteractive();

  const card = scene.add.container(scene.scale.width / 2, scene.scale.height / 2).setDepth(3001);
  const cardBg = scene.add.graphics();
  cardBg.fillStyle(Theme.panel, 1);
  cardBg.fillRoundedRect(-150, -80, 300, 160, Theme.radiusPanel);
  cardBg.lineStyle(Theme.borderWidthStrong, Theme.danger, 0.85);
  cardBg.strokeRoundedRect(-150, -80, 300, 160, Theme.radiusPanel);

  const title = scene.add.text(0, -44, 'Reset progress?', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '17px', fontStyle: 'bold', color: hex(Theme.textOnLight)
  }).setOrigin(0.5);
  const subtitle = scene.add.text(0, -14, 'This clears the board, coins,\ngems, and goals for good.', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '12px', color: hex(Theme.textOnLightMuted), align: 'center'
  }).setOrigin(0.5);

  const cancelBtn = scene.add.text(-60, 40, 'CANCEL', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '14px', color: hex(Theme.textOnLightMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  const resetBtn = scene.add.text(60, 40, 'RESET', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '14px', fontStyle: 'bold', color: hex(Theme.danger)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  card.add([cardBg, title, subtitle, cancelBtn, resetBtn]);

  const dismiss = () => {
    overlay.destroy();
    card.destroy();
    scene.modalOpen = false;
  };
  const deferDismiss = () => scene.time.delayedCall(0, dismiss);
  overlay.on('pointerdown', deferDismiss);
  cancelBtn.on('pointerdown', deferDismiss);
  resetBtn.on('pointerdown', () => resetGame(scene));
}
