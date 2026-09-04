import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { CRATE_RING_LANE, CRATE_RING_R, CRATE_RING_W, ORDER_HEADER_H } from './config';
import { Theme, hex, textResolution } from '../../ui/Theme';
import { drawCrate } from '../../objects/TierIcons';
import { formatCountdown } from '../../economy/Economy';
import { playerLevel } from '../../levels/Orders';
import {
  CRATE_THRESHOLDS,
  METER_COOLDOWN_MS,
  METER_MAX,
  availableCrate,
  claimMeterCrate,
  cratePayload,
  isMeterCooling,
  meterCooldownRemaining,
  nextCrateStep,
  rollCrate,
  type CrateTier
} from '../../rewards/Rewards';

/**
 * crateMeter, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

/**
 * The output meter: a thin full-width rule that fills as sources are run,
 * with a notch at each crate threshold.
 *
 * Drawn as a machined hairline rather than a chunky progress bar because
 * that is what the art brief's "industrial techno" tenth actually is - a
 * precise indicator, never the subject. It also costs almost no vertical
 * space, which the header did not have to spare.
 *
 * Every number it shows is real: the fill is exactly `collects / 100` and
 * the notches sit exactly at the thresholds that grant each crate. See
 * Rewards.ts for why that matters.
 */
export function buildCrateMeter(scene: BoardScene): void {
  scene.crateMeterContainer = scene.add.container(0, 0).setDepth(2);
  scene.crateMeterBar = scene.add.graphics();
  scene.crateMeterProgress = scene.add.graphics();
  scene.crateMeterIcon = scene.add.graphics();
  const { cx, cy } = crateRingCentre(scene);
  scene.crateMeterZone = scene.add.zone(cx, cy, crateRingR(scene) * 2 + 8, crateRingR(scene) * 2 + 8)
    .setInteractive({ useHandCursor: true });
  scene.crateMeterZone.on('pointerdown', () => claimMeterCrateReward(scene));
  scene.crateMeterContainer.add([
    scene.crateMeterBar,
    scene.crateMeterProgress,
    scene.crateMeterIcon,
    scene.crateMeterZone
  ]);
  refreshCrateMeter(scene);
}

/**
 * Ring centre: the left end of the ORDER ROW, in line with the cards rather
 * than in a strip of its own. The cards scroll past it; the ring does not
 * move, because it is not one of them.
 */
/**
 * Width of the crate meter's lane at the current chrome scale.
 *
 * The order cards are drawn at their tuned size and scaled as a unit, so
 * anything that has to line up beside them - this lane, the bar's mask, the
 * cursor the cards are packed from - has to grow by the same factor. Left
 * fixed, the lane stayed 56px while the cards grew, and the meter ended up
 * overlapping the first card with its own ring clipped.
 */
export function crateLaneW(scene: BoardScene): number {
  return Math.round(CRATE_RING_LANE * scene.chromeScale);
}

/** Ring radius at the current chrome scale. */
export function crateRingR(scene: BoardScene): number {
  return CRATE_RING_R * scene.chromeScale;
}

export function crateRingCentre(scene: BoardScene): { cx: number; cy: number } {
  const { cardH, y } = scene.orderBarMetrics();
  return {
    cx: scene.boardOriginX + (crateLaneW(scene) - Math.round(8 * scene.chromeScale)) / 2,
    cy: y + (ORDER_HEADER_H + (cardH - ORDER_HEADER_H) / 2) * scene.chromeScale
  };
}

export function refreshCrateMeter(scene: BoardScene, now = Date.now()): void {
  if (!scene.crateMeterBar) return;
  const cooling = isMeterCooling(scene.rewards, now);
  const { cx, cy } = crateRingCentre(scene);
  const earned = availableCrate(scene.rewards);
  const next = nextCrateStep(scene.rewards);
  const cooldownRemaining = meterCooldownRemaining(scene.rewards, now);
  const fill = cooling
    ? cooldownRemaining / Math.max(1, scene.rewards.meterCooldownDurationMs || METER_COOLDOWN_MS)
    : Math.min(1, scene.rewards.meterCollects / METER_MAX);

  const g = scene.crateMeterBar;
  g.clear();

  {
  // Compact icon-only meter. Progress and claimability are communicated by
  // the ring and crate itself; persistent explanatory copy was unnecessary.
  for (const text of scene.crateMeterRuns) text.destroy();
  scene.crateMeterRuns = [];
  const { cardH: laneH, y: laneY } = scene.orderBarMetrics();
  // Same scale the cards are drawn at, so the meter's box lines up with the
  // card band beside it instead of sitting short and high.
  const boxY = laneY + ORDER_HEADER_H * scene.chromeScale;
  const boxH = (laneH - ORDER_HEADER_H) * scene.chromeScale;
  const boxW = crateLaneW(scene) - Math.round(8 * scene.chromeScale);
  g.fillStyle(Theme.bg, 0.9);
  g.fillRoundedRect(scene.boardOriginX, boxY, boxW, boxH, Theme.radiusChip);
  g.lineStyle(Theme.borderWidth, Theme.borderOnDark, 1);
  g.strokeRoundedRect(scene.boardOriginX, boxY, boxW, boxH, Theme.radiusChip);
  drawCrateMeterProgress(scene, now);
  const showTier = earned ?? next?.tier ?? 'bronze';
  // Dead centre on the ring. The -3/+1 nudge dated from when `drawCrate`
  // built its art off to one side of the origin and every caller corrected
  // for it by hand; the art centres itself now, so the correction was the
  // only thing left pushing it off.
  scene.crateMeterIcon.clear().setPosition(cx, cy).setAlpha(cooling ? 0.3 : earned ? 1 : 0.55);
  drawCrate(scene.crateMeterIcon, (CRATE_RING_R * 1.25 + 14) * scene.chromeScale, showTier);
  if (cooling) {
    const timer = scene.add.text(cx, boxY + boxH - 6, formatCountdown(cooldownRemaining), {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric,
      fontSize: '8px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark),
      backgroundColor: 'rgba(0,0,0,0.72)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5).setDepth(3);
    scene.crateMeterContainer.add(timer);
    scene.crateMeterRuns.push(timer);
  }
  scene.crateMeterPulse?.stop();
  scene.crateMeterIcon.setScale(1);
  if (earned && !cooling) {
    scene.crateMeterPulse = scene.tweens.add({
      targets: scene.crateMeterIcon,
      scale: { from: 1, to: 1.12 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }
  scene.crateMeterWasCooling = cooling;
  scene.crateMeterSecond = cooling ? Math.ceil(cooldownRemaining / 1000) : -1;
  return;
  }

}

/** Draws only the circular indicator, allowing cooldown motion every frame without rebuilding text. */
export function drawCrateMeterProgress(scene: BoardScene, now = Date.now()): void {
  if (!scene.crateMeterProgress) return;
  const { cx, cy } = crateRingCentre(scene);
  const cooling = isMeterCooling(scene.rewards, now);
  const earned = availableCrate(scene.rewards);
  const fill = cooling
    ? meterCooldownRemaining(scene.rewards, now) / METER_COOLDOWN_MS
    : Math.min(1, scene.rewards.meterCollects / METER_MAX);
  const g = scene.crateMeterProgress;
  const tau = Math.PI * 2;
  const start = -Math.PI / 2;

  g.clear();
  const ringR = crateRingR(scene);
  g.lineStyle(CRATE_RING_W * scene.chromeScale, Theme.bgElevated, 1);
  g.beginPath();
  g.arc(cx, cy, ringR, 0, tau);
  g.strokePath();

  if (fill > 0) {
    g.lineStyle(
      CRATE_RING_W,
      cooling ? Theme.textOnDarkMuted : earned ? crateAccent(scene, earned) : Theme.currencyEnergy,
      cooling ? 0.65 : earned ? 1 : 0.8
    );
    g.beginPath();
    g.arc(cx, cy, ringR, start, start + tau * fill);
    g.strokePath();
  }

  for (const step of CRATE_THRESHOLDS) {
    const angle = start + tau * (step.collects / METER_MAX);
    const reached = !cooling && scene.rewards.meterCollects >= step.collects;
    const inner = ringR - (CRATE_RING_W * scene.chromeScale) / 2 - 1;
    const outer = ringR + (CRATE_RING_W * scene.chromeScale) / 2 + 1;
    g.lineStyle(2, reached ? Theme.textOnDark : Theme.borderOnDark, 1);
    g.lineBetween(
      cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner,
      cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer
    );
  }
}

/**
 * Cashes the meter in. Refuses when the board cannot hold the crate's
 * items rather than dropping them, matching what buying from the shop
 * already does on a full board - and crucially WITHOUT consuming the
 * meter, so nothing is lost.
 */
export function claimMeterCrateReward(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  if (isMeterCooling(scene.rewards)) {
    const seconds = Math.ceil(meterCooldownRemaining(scene.rewards) / 1000);
    scene.refreshActionTray(`CRATE METER RECHARGING  ·  ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    return;
  }
  const tier = availableCrate(scene.rewards);
  if (!tier) return;

  // Gold closes the cycle and becomes a physical board object; if the board
  // is full, the automatic vault owns the wait rather than blocking meter
  // progress behind an invisible reward.
  if (tier === 'gold') {
    tryDeliverMeterGold(scene);
    return;
  }

  const { cx, cy } = crateRingCentre(scene);
  if (!scene.awardCrate(tier, 'METER REWARD', { x: cx, y: cy })) return;
  claimMeterCrate(scene.rewards);
  refreshCrateMeter(scene);
  scene.refreshOrderBar();
  scene.saveState();
}

/** Converts a completed Gold meter into a forced spawn exactly once. */
export function tryDeliverMeterGold(scene: BoardScene): boolean {
  if (scene.rewards.meterCollects < METER_MAX || availableCrate(scene.rewards) !== 'gold') return false;
  const payload = cratePayload(rollCrate(
    'gold', playerLevel(scene.orderState), Math.random, scene.ownedDispenserTypeIds()
  ));
  claimMeterCrate(scene.rewards);
  const { cx, cy } = crateRingCentre(scene);
  scene.enqueueForcedSpawn(
    { kind: 'crate', tier: 'gold', remaining: payload, source: 'METER REWARD' },
    { x: cx, y: cy }
  );
  refreshCrateMeter(scene);
  scene.refreshOrderBar();
  scene.saveState();
  return true;
}

/** Tier colour for a crate. Metallic, deliberately outside every family ramp. */
export function crateAccent(scene: BoardScene, tier: CrateTier): number {
  if (tier === 'vault') return Theme.currencyGem;
  if (tier === 'gold') return Theme.currencyCredit;
  if (tier === 'silver') return 0xc9d2d8;
  return 0xc08a52;
}
