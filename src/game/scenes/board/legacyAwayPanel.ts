import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { CRATE_LABELS } from '../../rewards/Rewards';
import { drawCrate } from '../../objects/TierIcons';
import { RESOURCE_PRODUCERS } from '../../rewards/ResourceRewards';
import {
  advanceLegacyMachine,
  legacyRotationsPerHour,
  type LegacyReward
} from '../../legacy/LegacyMachine';

/** Under this there is nothing worth interrupting the player for. */
const MIN_AWAY_MS = 60_000;

function rewardName(reward: LegacyReward): string {
  return reward.kind === 'crate'
    ? CRATE_LABELS[reward.tier]
    : RESOURCE_PRODUCERS[reward.producerId].label.toUpperCase();
}

/** One key per distinct thing, so identical rewards stack into a count. */
function rewardKey(reward: LegacyReward): string {
  return reward.kind === 'crate' ? `crate:${reward.tier}` : `producer:${reward.producerId}`;
}

function awayLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} MINUTE${minutes === 1 ? '' : 'S'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} HOUR${hours === 1 ? '' : 'S'}`;
  const days = Math.floor(hours / 24);
  return `${days} DAY${days === 1 ? '' : 'S'}`;
}

/**
 * WHAT THE MACHINE DID WHILE THE GAME WAS SHUT.
 *
 * The Legacy Machine turns on real time, so it keeps working when nobody
 * is watching - which is the whole appeal, and also useless if the player
 * never finds out. This runs once on boot: it winds the machine forward,
 * delivers whatever it produced, and says so.
 *
 * It NEVER appears before the machine has been started. A player who has
 * not bought the first upgrade has a machine standing still, and a
 * "while you were away" box reporting nothing would be a lie about a
 * feature they have not met yet.
 */
export function showLegacyAway(scene: BoardScene): void {
  const state = scene.legacyMachine;
  if (state.gearOneLevel <= 0) return;

  const now = Date.now();
  const awayMs = state.lastTickAt ? now - state.lastTickAt : 0;
  const produced = advanceLegacyMachine(state, now);
  if (!produced.length) {
    scene.saveState();
    return;
  }

  // DELIVERED FIRST, SHOWN SECOND. The crates go to the board, or to the
  // vault when the board is full, before anything is drawn - so the
  // rewards exist whether or not the player reads the box or the game is
  // closed again while it is open.
  for (const entry of produced) {
    if (entry.reward.kind === 'crate') {
      scene.awardCrate(entry.reward.tier, 'LEGACY MACHINE');
    } else {
      scene.enqueueForcedSpawn({
        kind: 'resource-producer',
        producerId: entry.reward.producerId,
        remaining: RESOURCE_PRODUCERS[entry.reward.producerId].capacity
      });
    }
  }
  scene.saveState();
  if (awayMs < MIN_AWAY_MS) return;

  const w = scene.viewW;
  const h = scene.viewH;
  const s = Math.min(1, Math.min(w / 390, h / 720));
  scene.modalOpen = true;

  const overlay = scene.add.container(0, 0).setDepth(4400);
  const shade = scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.7).setInteractive();
  overlay.add(shade);

  // STACKED BY KIND, not listed one per line. Twenty-one rows of "GEAR 4
  // - BRONZE CRATE" is a receipt; every other game shows the thing and a
  // count, because that is what the player actually wants to know.
  const tally = new Map<string, { reward: LegacyReward; count: number }>();
  for (const entry of produced) {
    const key = rewardKey(entry.reward);
    const seen = tally.get(key);
    if (seen) seen.count++;
    else tally.set(key, { reward: entry.reward, count: 1 });
  }
  const haul = [...tally.values()];

  const columns = Math.min(haul.length, 4);
  const rows = Math.ceil(haul.length / columns);
  const cell = Math.min(72 * s, (w - 60 * s) / columns);
  const panelW = Math.min(340 * s, Math.max(260 * s, columns * cell + 36 * s));
  const panelH = 92 * s + rows * (cell + 14 * s);
  const panelX = w / 2;
  const panelY = h / 2;

  const bg = scene.add.graphics();
  bg.fillStyle(Theme.bgElevated, 1);
  bg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, Theme.radiusPanel);
  bg.lineStyle(Theme.borderWidthStrong, Theme.currencyXp, 0.85);
  bg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, Theme.radiusPanel);
  bg.fillStyle(Theme.currencyXp, 0.06);
  bg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW,
    panelH * 0.3, Theme.radiusPanel);
  overlay.add(bg);

  overlay.add(scene.add.text(
    panelX, panelY - panelH / 2 + 22 * s, 'THE MACHINE KEPT TURNING',
    {
      resolution: textResolution, fontFamily: Theme.fontHeading,
      fontSize: `${Math.round(15 * s)}px`, fontStyle: 'bold',
      color: hex(Theme.textOnDark)
    }
  ).setOrigin(0.5));
  overlay.add(scene.add.text(
    panelX, panelY - panelH / 2 + 42 * s,
    `${awayLabel(awayMs)} AWAY  ·  ${legacyRotationsPerHour(state.gearOneLevel).toLocaleString()} / HOUR`,
    {
      resolution: textResolution, fontFamily: Theme.fontMono,
      fontSize: `${Math.round(9 * s)}px`, fontStyle: 'bold',
      color: hex(Theme.currencyXp)
    }
  ).setOrigin(0.5));

  haul.forEach((entry, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cx = panelX - (columns - 1) * cell / 2 + column * cell;
    const cy = panelY - panelH / 2 + 68 * s + cell / 2 + row * (cell + 14 * s);

    const art = cell * 0.62;
    if (entry.reward.kind === 'crate') {
      const icon = scene.add.graphics().setPosition(cx, cy);
      drawCrate(icon, art, entry.reward.tier);
      overlay.add(icon);
    } else {
      const key = `producer-${entry.reward.producerId}`;
      if (scene.textures.exists(key)) {
        overlay.add(scene.add.image(cx, cy, key).setDisplaySize(art, art));
      }
    }

    // The count, bottom-right of the art the way every other game does it.
    if (entry.count > 1) {
      overlay.add(scene.add.text(
        cx + cell * 0.30, cy + cell * 0.24, `×${entry.count}`,
        {
          resolution: textResolution, fontFamily: Theme.fontNumeric,
          fontSize: `${Math.round(13 * s)}px`, fontStyle: 'bold',
          color: hex(Theme.textOnDark),
          stroke: hex(Theme.bg), strokeThickness: 3 * s
        }
      ).setOrigin(1, 0.5));
    }
    overlay.add(scene.add.text(cx, cy + cell * 0.46, rewardName(entry.reward), {
      resolution: textResolution, fontFamily: Theme.fontMono,
      fontSize: `${Math.round(7 * s)}px`, fontStyle: 'bold',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5, 0));
  });

  // Says where the things went, because a crate that landed in the vault
  // is invisible until the player goes looking for it.
  overlay.add(scene.add.text(
    panelX, panelY + panelH / 2 - 16 * s, 'DELIVERED TO THE BOARD  ·  VAULT IF IT WAS FULL',
    {
      resolution: textResolution, fontFamily: Theme.fontMono,
      fontSize: `${Math.round(8 * s)}px`, color: hex(Theme.textOnDarkMuted)
    }
  ).setOrigin(0.5));

  const dismiss = (): void => {
    overlay.destroy(true);
    scene.modalOpen = false;
    scene.refreshForcedSpawnVault();
    scene.refreshActionTray();
  };
  shade.on('pointerup', dismiss);
  const lighting = materialLighting(Theme.currencyXp, 5);
  const button = scene.add.graphics();
  button.fillGradientStyle(lighting.highlight, lighting.light, lighting.dark, lighting.shadow, 1);
  button.fillRoundedRect(panelX - 54 * s, panelY + panelH / 2 - 6 * s, 108 * s, 26 * s, Theme.radiusChip);
  overlay.add(button);
  overlay.add(scene.add.text(panelX, panelY + panelH / 2 + 7 * s, 'GOOD', {
    resolution: textResolution, fontFamily: Theme.fontHeading,
    fontSize: `${Math.round(11 * s)}px`, fontStyle: 'bold', color: hex(Theme.bg)
  }).setOrigin(0.5));
  const hit = scene.add.zone(panelX, panelY + panelH / 2 + 7 * s, 108 * s, 26 * s)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerup', dismiss);
  overlay.add(hit);
}
