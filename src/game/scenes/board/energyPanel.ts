import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyIcon, currencyLabel } from '../../ui/CurrencyGlyph';
import { formatCountdown, spendGems } from '../../economy/Economy';
import {
  ENERGY_CAP,
  ENERGY_REFILL_BASE_GEMS,
  ENERGY_REFILL_MS,
  addEnergy,
  energyRefillCost,
  msUntilEnergyFull,
  msUntilNextEnergy,
  recordEnergyRefillPurchase,
  syncEnergy
} from '../../economy/Energy';

/**
 * energyPanel, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

/**
 * Gem-for-energy refill, opened by tapping the energy chip. Lives here
 * rather than as a third pack row in the shop: the shop panel is already
 * near its height ceiling, and the energy bar is where a player looks when
 * they run out anyway.
 */
export function offerEnergyRefill(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  syncEnergy(scene.energy);

  scene.modalOpen = true;
  const missing = Math.max(0, ENERGY_CAP - scene.energy.current);
  const refillCost = energyRefillCost(scene.energy);
  const affordable = scene.economy.gems >= refillCost;

  const overlay = scene.add.rectangle(
    scene.scale.width / 2, scene.scale.height / 2,
    scene.scale.width, scene.scale.height,
    0x000000, 0.6
  ).setDepth(3000).setInteractive();

  // Dark card, matching every other panel in the game. It was previously
  // the light `Theme.panel`, which is the one surface in the palette that
  // the resource colours DON'T work on - the energy cyan and gem violet are
  // both tuned for dark grounds, so the panel's own subject matter was the
  // least legible thing on it.
  const CARD_W = 320;
  // Room for a gauge and a proper hierarchy. This panel used to be three
  // lines of identical mono text, where the number that matters - the
  // current energy - carried the same weight as a help string, and a panel
  // ABOUT energy showed no energy.
  const CARD_H = 288;
  const card = scene.add.container(scene.scale.width / 2, scene.scale.height / 2).setDepth(3001);
  const cardBg = scene.add.graphics();
  cardBg.fillStyle(Theme.bgElevated, 1);
  cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, Theme.radiusPanel);
  cardBg.lineStyle(Theme.borderWidthStrong, Theme.currencyEnergy, 0.85);
  cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, Theme.radiusPanel);
  // Lit top edge, same fixed upper-left key every panel and drawn object
  // in the game shares.
  cardBg.fillStyle(Theme.currencyEnergy, 0.07);
  cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H * 0.4, Theme.radiusPanel);

  const title = scene.add.text(0, -CARD_H / 2 + 18, 'ENERGY', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '17px', fontStyle: 'bold', color: hex(Theme.currencyEnergy)
  }).setOrigin(0.5);
  // The hero reading: current value large, cap small beside it, mark
  // alongside, so the panel names its own subject at a glance.
  const heroValue = scene.add.text(0, -84, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric, fontSize: '38px', fontStyle: 'bold', color: hex(Theme.textOnDark)
  }).setOrigin(0, 0.5);
  const heroCap = scene.add.text(0, -76, `/ ${ENERGY_CAP}`, {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric, fontSize: '16px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0, 0.5);
  const heroMark = currencyIcon(scene, 'energy', 30);

  // The gauge, in the same language as the HUD bars: a recessed track with
  // a filled portion. The thing the old panel was missing entirely.
  const GAUGE_W = CARD_W - 48;
  const GAUGE_H = 12;
  const GAUGE_Y = -40;
  const gauge = scene.add.graphics();

  /** One label/value row: label left, value right, across the gauge width. */
  const statRow = (y: number, label: string): Phaser.GameObjects.Text[] => {
    const key = scene.add.text(-GAUGE_W / 2, y, label, {
      resolution: textResolution,
      fontFamily: Theme.fontMono, fontSize: '10px', color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0, 0.5);
    const value = scene.add.text(GAUGE_W / 2, y, '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: '12px', fontStyle: 'bold', color: hex(Theme.textOnDark)
    }).setOrigin(1, 0.5);
    return [key, value];
  };
  const [nextKey, nextValue] = statRow(-8, 'NEXT ENERGY');
  const [fullKey, fullValue] = statRow(14, 'FULL IN');
  // Two lines: what energy is spent on, and what a refill will cost NEXT
  // time. The price doubles per purchase and drops back 24 hours after the
  // first one, and a player who is not told that reads the second refill's
  // 40 as a bug - or, worse, learns it by spending.
  const footnote = scene.add.text(0, 42, '1 ENERGY PER SOURCE ITEM', {
    resolution: textResolution,
    fontFamily: Theme.fontMono, fontSize: '9px', color: hex(Theme.textOnDarkMuted),
    align: 'center', lineSpacing: 3
  }).setOrigin(0.5).setAlpha(0.7);

  // The refill gets its own full-width bar, and the WHOLE bar is the hit
  // target. It used to be a bare `currencyLabel` whose interactive rectangle
  // was only as wide as the number itself, so most of the row looked
  // pressable and wasn't.
  const BAR_W = CARD_W - 40;
  const BAR_H = 38;
  const BAR_Y = 74;
  const buyBar = scene.add.graphics();
  /**
   * At full energy the bar stays in place as a muted status strip instead
   * of hiding. Hiding it left a hole the rest of the card had to shuffle
   * into, and a panel that rearranges itself as you watch reads as broken.
   */
  const drawBuyBar = (full: boolean): number => {
    const color = full ? Theme.currencyEnergy : affordable ? Theme.currencyGem : Theme.textOnDarkMuted;
    buyBar.clear();
    buyBar.fillStyle(Theme.bg, 0.92);
    buyBar.fillRoundedRect(-BAR_W / 2, BAR_Y - BAR_H / 2, BAR_W, BAR_H, Theme.radiusChip);
    buyBar.lineStyle(Theme.borderWidth, color, full ? 0.35 : affordable ? 0.9 : 0.5);
    buyBar.strokeRoundedRect(-BAR_W / 2, BAR_Y - BAR_H / 2, BAR_W, BAR_H, Theme.radiusChip);
    return color;
  };
  const barColor = drawBuyBar(missing === 0);

  const buyVerb = scene.add.text(0, BAR_Y, 'REFILL', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '14px', fontStyle: 'bold', color: hex(barColor)
  }).setOrigin(0, 0.5);
  const buyCost = currencyLabel(scene, String(refillCost), 'gem', {
    fontSize: 14,
    align: 'center',
    color: barColor
  });
  // Verb and price centred as one group, so the pair sits on the bar's
  // middle however wide the price gets.
  const groupW = buyVerb.width + 12 + buyCost.width;
  buyVerb.setX(-groupW / 2);
  buyCost.setPosition(-groupW / 2 + buyVerb.width + 12 + buyCost.width / 2, BAR_Y);

  const buyZone = scene.add.zone(0, BAR_Y, BAR_W, BAR_H).setInteractive({ useHandCursor: true });
  const buyBtn = scene.add.container(0, 0, [buyBar, buyVerb, buyCost, buyZone]);

  // No CANCEL button: there is nothing to cancel. The panel commits nothing
  // until REFILL is pressed, and tapping outside already dismisses it - it
  // was a leftover from a confirm-dialog shape. Closing is the corner X,
  // the same affordance the shop panel uses.
  const cancelBtn = scene.add.text(CARD_W / 2 - 22, -CARD_H / 2 + 20, '✕', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '16px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  // A refill is priced in gems, so the panel is a dead end for anyone who
  // hasn't got them - which is exactly the moment a player needs the gem
  // shop. Opens the gem row specifically rather than the whole store: they
  // came here for energy, not to browse offers.
  const storeBtnText = scene.add.text(0, 0, 'GET', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold', color: hex(Theme.currencyGem)
  }).setOrigin(0, 0.5);
  const storeBtnMark = currencyIcon(scene, 'gem', 19);
  const storeBtnW = storeBtnText.width + 5 + 14;
  storeBtnText.setX(-storeBtnW / 2);
  storeBtnMark.setPosition(storeBtnW / 2 - 7, 0);
  const storeBtn = scene.add.container(0, CARD_H / 2 - 26, [storeBtnText, storeBtnMark]);
  storeBtn.setSize(storeBtnW, 20).setInteractive(
    new Phaser.Geom.Rectangle(-storeBtnW / 2, -10, storeBtnW, 20),
    Phaser.Geom.Rectangle.Contains
  );

  const divider = scene.add.graphics();
  divider.lineStyle(1, Theme.borderOnDark, 0.9);
  divider.lineBetween(-CARD_W / 2 + 18, CARD_H / 2 - 52, CARD_W / 2 - 18, CARD_H / 2 - 52);

  card.add([
    cardBg, title, gauge, heroValue, heroCap, heroMark,
    nextKey, nextValue, fullKey, fullValue, footnote,
    cancelBtn, buyBtn, divider, storeBtn
  ]);

  const updateEnergyInfo = (): void => {
    syncEnergy(scene.energy);
    const full = scene.energy.current >= ENERGY_CAP;

    heroValue.setText(String(scene.energy.current));
    // The hero group is laid out as one unit and re-centred every tick,
    // because the number changes width as it counts up.
    const groupW = heroValue.width + 6 + heroCap.width + 8 + 30;
    heroValue.setX(-groupW / 2);
    heroCap.setX(-groupW / 2 + heroValue.width + 6);
    heroMark.setPosition(groupW / 2 - 15, -80);

    const fraction = Phaser.Math.Clamp(scene.energy.current / ENERGY_CAP, 0, 1);
    gauge.clear();
    gauge.fillStyle(Theme.bg, 0.92);
    gauge.fillRoundedRect(-GAUGE_W / 2, GAUGE_Y - GAUGE_H / 2, GAUGE_W, GAUGE_H, GAUGE_H / 2);
    if (fraction > 0) {
      const energyLighting = materialLighting(Theme.currencyEnergy, 5);
      gauge.fillGradientStyle(
        energyLighting.highlight, energyLighting.light,
        energyLighting.dark, energyLighting.base, 1
      );
      // Never narrower than its own cap radius, so one point of energy is
      // still a visible sliver rather than nothing.
      const w = Math.max(GAUGE_H, GAUGE_W * fraction);
      gauge.fillRoundedRect(-GAUGE_W / 2, GAUGE_Y - GAUGE_H / 2, w, GAUGE_H, GAUGE_H / 2);
    }
    gauge.lineStyle(1, Theme.currencyEnergy, 0.5);
    gauge.strokeRoundedRect(-GAUGE_W / 2, GAUGE_Y - GAUGE_H / 2, GAUGE_W, GAUGE_H, GAUGE_H / 2);

    // At full, the countdowns have nothing to count, so the rows state what
    // IS true rather than showing 0:00.
    nextKey.setText(full ? 'STATUS' : 'NEXT ENERGY');
    nextValue.setText(full ? 'FULL' : formatCountdown(msUntilNextEnergy(scene.energy)))
      .setColor(hex(full ? Theme.currencyEnergy : Theme.textOnDark));
    fullKey.setText(full ? 'NATURAL REFILL' : 'FULL IN');
    fullValue.setText(full
      ? `1 / ${formatCountdown(ENERGY_REFILL_MS)}`
      : formatCountdown(msUntilEnergyFull(scene.energy)));

    // The price line rides the same tick as the countdowns, so the time
    // left on the window ticks down while the panel is open.
    const resetAt = scene.energy.refillPriceResetAt;
    const priceNote = resetAt > Date.now()
      ? `BACK TO ${ENERGY_REFILL_BASE_GEMS} GEMS IN ${formatCountdown(resetAt - Date.now())}`
      : 'EACH REFILL DOUBLES THE PRICE FOR 24H';
    footnote.setText(['1 ENERGY PER SOURCE ITEM', priceNote]);

    const color = drawBuyBar(full);
    buyVerb.setText(full ? 'ENERGY FULL' : 'REFILL').setColor(hex(color));
    buyCost.setVisible(!full);
    // Re-centred each tick: the group is the verb alone at full, and the
    // verb plus the price otherwise.
    const barGroupW = buyVerb.width + (full ? 0 : 12 + buyCost.width);
    buyVerb.setX(-barGroupW / 2);
    buyCost.setPosition(-barGroupW / 2 + buyVerb.width + 12 + buyCost.width / 2, BAR_Y);
    if (full) buyZone.disableInteractive();
    else buyZone.setInteractive({ useHandCursor: true });
  };
  updateEnergyInfo();
  scene.energyMenuUpdater = updateEnergyInfo;

  const dismiss = () => {
    scene.energyMenuUpdater = null;
    overlay.destroy();
    card.destroy();
    scene.modalOpen = false;
  };
  const deferDismiss = () => scene.time.delayedCall(0, dismiss);
  overlay.on('pointerdown', deferDismiss);
  cancelBtn.on('pointerdown', deferDismiss);
  // Dismiss first: openShop refuses to run while another modal is up.
  storeBtn.on('pointerdown', () => scene.time.delayedCall(0, () => {
    dismiss();
    scene.openShop('gem');
  }));
  if (missing > 0) {
    buyZone.on('pointerdown', () => scene.time.delayedCall(0, () => {
      if (!spendGems(scene.economy, refillCost)) {
        dismiss();
        scene.refreshActionTray(`NOT ENOUGH GEMS\nENERGY REFILL COSTS ${refillCost} GEMS`);
        return;
      }
      recordEnergyRefillPurchase(scene.energy);
      addEnergy(scene.energy, Math.max(0, ENERGY_CAP - scene.energy.current));
      dismiss();
      scene.updateCurrencyText();
      scene.saveState();
      scene.refreshActionTray(`ENERGY REFILLED  ·  ${scene.energy.current}/${ENERGY_CAP}`);
    }));
  }
}
