import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { addCoins, addGems, spendCoinsGeneric, spendGems } from '../../economy/Economy';
import { addEnergy, spendEnergy } from '../../economy/Energy';
import { floatingScore } from '../../fx/MergeFx';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyIcon, currencyPill, currencyChipOptions } from '../../ui/CurrencyGlyph';
import {
  LEGACY_GEARS,
  LEGACY_GEAR_RATIO,
  LEGACY_MILESTONES,
  claimableLegacyMilestones,
  legacySpeed,
  legacyUpgradeCost,
  markLegacyClaimed,
  type LegacyReward
} from '../../legacy/LegacyMachine';

function rewardLabel(reward: LegacyReward): string {
  if (reward.kind === 'credits') return `${reward.amount.toLocaleString()} CREDITS`;
  if (reward.kind === 'gems') return `${reward.amount} GEMS`;
  return `${reward.amount} ENERGY`;
}

function drawGear(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number, progress: number): void {
  const teeth = 14;
  g.fillStyle(0x000000, 0.32);
  g.fillCircle(x + 2, y + 3, r + 5);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    g.fillStyle(color, 0.95);
    g.fillRect(x + Math.cos(a) * r - 3, y + Math.sin(a) * r - 3, 6, 6);
  }
  const lit = materialLighting(color, 5);
  g.fillGradientStyle(lit.highlight, lit.light, lit.dark, lit.shadow, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(Theme.bg, 0.85);
  g.fillCircle(x, y, r * 0.34);
  g.lineStyle(3, Theme.currencyXp, 0.25);
  g.beginPath();
  g.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  g.strokePath();
  g.lineStyle(1, 0xffffff, 0.2);
  g.strokeCircle(x, y, r - 2);
}

export function openLegacyMachine(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  scene.modalOpen = true;

  const w = scene.viewW;
  const h = scene.viewH;
  const overlay = scene.add.container(0, 0).setDepth(4300);
  const bg = scene.add.graphics();
  bg.fillGradientStyle(0x0d1012, 0x151819, 0x1a1410, 0x090909, 1);
  bg.fillRect(0, 0, w, h);
  bg.fillStyle(Theme.currencyXp, 0.07);
  bg.fillRect(0, 0, w, Math.min(120, h * 0.2));

  const title = scene.add.text(w / 2, 30, 'LEGACY MACHINE', {
    resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '20px',
    fontStyle: 'bold', color: hex(Theme.textOnDark)
  }).setOrigin(0.5);
  const subtitle = scene.add.text(w / 2, 53, `GEAR 1 SPEED x${legacySpeed(scene.legacyMachine).toFixed(1)}`, {
    resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
    fontStyle: 'bold', color: hex(Theme.currencyXp)
  }).setOrigin(0.5);

  const close = scene.add.text(w - 24, 28, 'X', {
    resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '18px',
    fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  const content = scene.add.container(0, 0);
  const redraw = (): void => {
    content.removeAll(true);
    subtitle.setText(`GEAR 1 SPEED x${legacySpeed(scene.legacyMachine).toFixed(1)}`);

    const gearArt = scene.add.graphics();
    const spacing = Math.min(84, (w - 38) / LEGACY_GEARS);
    const startX = w / 2 - spacing * (LEGACY_GEARS - 1) / 2;
    const y = 122;
    for (let i = 0; i < LEGACY_GEARS; i++) {
      const turns = scene.legacyMachine.turns[i] ?? 0;
      drawGear(gearArt, startX + spacing * i, y, Math.max(18, spacing * 0.25), [0x3f6f86, 0x506b86, 0x6e5d89, 0x886b45, 0x927a49][i], turns % 1);
      content.add(scene.add.text(startX + spacing * i, y + 38, `G${i + 1}`, {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px',
        fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5));
      content.add(scene.add.text(startX + spacing * i, y + 51, turns.toFixed(i === 0 ? 1 : 2), {
        resolution: textResolution, fontFamily: Theme.fontNumeric, fontSize: '10px',
        fontStyle: 'bold', color: hex(Theme.textOnDark)
      }).setOrigin(0.5));
    }
    content.add(gearArt);

    const cost = legacyUpgradeCost(scene.legacyMachine.gearOneLevel);
    const upgradeY = Math.min(h - 78, 210);
    const upgradeW = Math.min(342, w - 30);
    const canBuy = scene.economy.coins >= cost.credits && scene.economy.gems >= cost.gems && scene.energy.current >= cost.energy;
    const up = scene.add.graphics();
    const upColor = canBuy ? Theme.currencyXp : Theme.panelAlt;
    const lighting = materialLighting(upColor, canBuy ? 5 : 2);
    up.fillGradientStyle(lighting.highlight, lighting.light, lighting.dark, lighting.shadow, 1);
    up.fillRoundedRect(w / 2 - upgradeW / 2, upgradeY - 25, upgradeW, 50, Theme.radiusChip);
    up.lineStyle(1.5, canBuy ? Theme.currencyXp : Theme.borderOnDark, 0.95);
    up.strokeRoundedRect(w / 2 - upgradeW / 2, upgradeY - 25, upgradeW, 50, Theme.radiusChip);
    content.add(up);
    content.add(scene.add.text(w / 2, upgradeY - 8, 'UPGRADE GEAR 1', {
      resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '13px',
      fontStyle: 'bold', color: hex(canBuy ? Theme.bg : Theme.textOnDarkMuted)
    }).setOrigin(0.5));

    const costRow = scene.add.container(w / 2, upgradeY + 12);
    const pills = [
      currencyPill(scene, cost.credits.toLocaleString(), 'credit', { ...currencyChipOptions('credit'), height: 18, fontSize: 9, iconSize: 13 }),
      currencyPill(scene, String(cost.gems), 'gem', { ...currencyChipOptions('gem'), height: 18, fontSize: 9, iconSize: 13 }),
      currencyPill(scene, String(cost.energy), 'energy', { ...currencyChipOptions('energy'), height: 18, fontSize: 9, iconSize: 13 })
    ];
    let x = -pills.reduce((sum, pill) => sum + pill.width, 0) / 2 - 8;
    for (const pill of pills) {
      x += pill.width / 2 + 4;
      pill.setPosition(x, 0);
      x += pill.width / 2 + 4;
      costRow.add(pill);
    }
    content.add(costRow);
    if (canBuy) {
      const zone = scene.add.zone(w / 2, upgradeY, upgradeW, 50).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        const current = legacyUpgradeCost(scene.legacyMachine.gearOneLevel);
        if (!spendCoinsGeneric(scene.economy, current.credits)) return;
        if (!spendGems(scene.economy, current.gems)) {
          addCoins(scene.economy, current.credits);
          return;
        }
        if (!spendEnergy(scene.energy, current.energy)) {
          addCoins(scene.economy, current.credits);
          addGems(scene.economy, current.gems);
          return;
        }
        scene.legacyMachine.gearOneLevel++;
        scene.updateCurrencyText();
        scene.updateEnergyText();
        scene.saveState();
        redraw();
      });
      content.add(zone);
    }

    const claims = claimableLegacyMilestones(scene.legacyMachine);
    const listTop = upgradeY + 48;
    content.add(scene.add.text(w / 2, listTop, claims.length ? 'UNLOCKED REWARDS' : 'NO REWARDS READY', {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
      fontStyle: 'bold', color: hex(claims.length ? Theme.currencyXp : Theme.textOnDarkMuted)
    }).setOrigin(0.5));
    const rowW = Math.min(340, w - 28);
    claims.slice(0, 5).forEach((claim, i) => {
      const yRow = listTop + 28 + i * 34;
      const row = scene.add.graphics();
      row.fillStyle(Theme.bgElevated, 0.95).fillRoundedRect(w / 2 - rowW / 2, yRow - 14, rowW, 28, Theme.radiusChip);
      row.lineStyle(1, Theme.currencyXp, 0.55).strokeRoundedRect(w / 2 - rowW / 2, yRow - 14, rowW, 28, Theme.radiusChip);
      content.add(row);
      content.add(scene.add.text(w / 2 - rowW / 2 + 10, yRow, `GEAR ${claim.gear + 1}  ${claim.milestone} ROT`, {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
        fontStyle: 'bold', color: hex(Theme.textOnDark)
      }).setOrigin(0, 0.5));
      const icon = currencyIcon(scene, claim.reward.kind === 'credits' ? 'credit' : claim.reward.kind === 'gems' ? 'gem' : 'energy', 18)
        .setPosition(w / 2 + 46, yRow);
      content.add(icon);
      content.add(scene.add.text(w / 2 + rowW / 2 - 10, yRow, rewardLabel(claim.reward), {
        resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '10px',
        fontStyle: 'bold', color: hex(Theme.currencyXp)
      }).setOrigin(1, 0.5));
      const zone = scene.add.zone(w / 2, yRow, rowW, 28).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (claim.reward.kind === 'credits') addCoins(scene.economy, claim.reward.amount);
        else if (claim.reward.kind === 'gems') addGems(scene.economy, claim.reward.amount);
        else addEnergy(scene.energy, claim.reward.amount);
        markLegacyClaimed(scene.legacyMachine, claim.gear, claim.milestone);
        scene.updateCurrencyText();
        scene.updateEnergyText();
        floatingScore(scene, w / 2, yRow, claim.reward.amount, claim.reward.kind === 'credits' ? 'CR' : claim.reward.kind === 'gems' ? 'GEM' : 'EN');
        scene.saveState();
        redraw();
      });
      content.add(zone);
    });

    content.add(scene.add.text(w / 2, h - 22, `PROJECT STAGES TURN GEAR 1. EACH GEAR IS ${LEGACY_GEAR_RATIO}:1.`, {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '9px',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5));
  };

  const dismiss = (): void => {
    overlay.destroy(true);
    scene.modalOpen = false;
  };
  close.on('pointerdown', dismiss);
  overlay.add([bg, title, subtitle, close, content]);
  redraw();
}
