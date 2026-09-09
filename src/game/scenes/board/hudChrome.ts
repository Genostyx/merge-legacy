import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { AUTO_MERGE_KEY, ROWS, formatHudValue, type HudChip } from './config';
import { Theme, hex, materialLighting, textResolution, toneAt } from '../../ui/Theme';
import { currencyBoxFor } from '../../ui/CurrencyGlyph';
import { playerLevel, playerXpProgress } from '../../levels/Orders';
import { syncEnergy } from '../../economy/Energy';
import { dailyAvailable } from '../../rewards/Rewards';
import { unclaimedDiscoveryCount } from '../../collection/Collection';

/**
 * hudChrome, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

/** Energy chip: value only; tapping opens the live countdown and refill details. */
export function buildEnergyChip(scene: BoardScene, y: number): HudChip {
  const s = scene.hudScale;
  const accent = Theme.currencyEnergy;
  const numberColor = materialLighting(accent, 4).light;
  const bg = scene.add.graphics().setDepth(20);
  const iconSize = currencyBoxFor('energy', 17 * s);
  const iconShadow = scene.add.image(0, 0, 'currency-energy').setDisplaySize(iconSize, iconSize).setTintFill(0x000000).setAlpha(0.28).setDepth(21);
  const icon = scene.add.image(0, 0, 'currency-energy').setDisplaySize(iconSize, iconSize).setDepth(22);
  const iconGloss = scene.add.image(0, 0, 'currency-energy').setDisplaySize(iconSize, iconSize).setTintFill(0xffffff).setAlpha(0.2).setDepth(23);
  iconGloss.setCrop(0, 0, iconGloss.width, iconGloss.height * 0.42);
  const text = scene.add.text(0, 0, '', {
    fontFamily: Theme.fontNumeric,
    fontSize: `${10.5 * s}px`,
    fontStyle: 'bold',
    color: hex(numberColor),
    resolution: textResolution
  }).setOrigin(1, 0.5).setDepth(24);
  const hit = scene.add.rectangle(0, 0, 10, 20, 0x000000, 0).setDepth(25).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => scene.time.delayedCall(0, () => scene.offerEnergyRefill()));

  const naturalWidth = (): number => Math.max(38 * s, Math.ceil(text.width) + 24 * s);
  const draw = (rightX: number, w: number): void => {
    const h = 16 * s;
    const x = rightX - w;

    bg.clear();
    // Darker than the surfaces around it, so the bar reads as a recess the
    // number sits in rather than as another raised panel.
    const chipLighting = materialLighting(Theme.bgElevated, 2);
    bg.fillGradientStyle(chipLighting.light, chipLighting.base, chipLighting.dark, chipLighting.shadow, 1);
    bg.fillRoundedRect(x, y, w, h, Theme.radiusChip);
    const edgeLighting = materialLighting(accent, 6);
    bg.lineGradientStyle(
      Theme.borderWidth + 0.5,
      edgeLighting.highlight, edgeLighting.light,
      edgeLighting.dark, edgeLighting.shadow, 0.95
    );
    bg.strokeRoundedRect(x, y, w, h, Theme.radiusChip);

    iconShadow.setPosition(x + 8 * s, y + h / 2 + 1.25 * s);
    icon.setPosition(x + 8 * s, y + h / 2);
    iconGloss.setPosition(x + 8 * s, y + h / 2);

    text.setScale(Math.min(1, Math.max(0.72, (w - 22 * s) / Math.max(1, text.width))), 1);
    text.setPosition(x + w - 6 * s, y + h / 2);
    hit.setPosition(x + w / 2, y + h / 2).setSize(w, h);
    hit.input!.hitArea.setTo(0, 0, w, h);
  };

  return { text, naturalWidth, draw };
}

/**
 * Packs the currency chips right-to-left from the shop button.
 *
 * Re-run whenever a value changes, because each chip is now sized to its
 * own number - so gaining a digit has to push its neighbours along rather
 * than overlap them.
 */
export function layoutHudChips(scene: BoardScene): void {
  if (!scene.hudChips.length) return;
  // Equal insets keep the three slot centres symmetrical across the board.
  // 70, not 44: the settings gear occupies the 26px immediately left of the
  // shop button now, and chips pack right-to-left from this inset - without
  // widening it a long credit balance would run underneath the gear.
  const right = scene.headerRight - 70 * scene.hudScale;
  // The level badge ends at roughly boardOriginX + 37. Seven more pixels
  // form a protected gap that resource balances may never enter.
  const left = scene.boardOriginX + 44 * scene.hudScale;
  const available = Math.max(1, right - left);
  const gap = (available >= 180 * scene.hudScale ? 8 : 3) * scene.hudScale;
  const widths = scene.hudChips.map((chip) => chip.naturalWidth());
  const gapTotal = gap * (widths.length - 1);
  const naturalTotal = widths.reduce((sum, width) => sum + width, 0);
  if (naturalTotal + gapTotal > available) {
    const scale = Math.max(0, (available - gapTotal) / naturalTotal);
    for (let i = 0; i < widths.length; i++) widths[i] *= scale;
  }
  const total = widths.reduce((sum, width) => sum + width, 0) + gapTotal;
  let cursor = (left + right + total) / 2;
  for (let i = 0; i < scene.hudChips.length; i++) {
    scene.hudChips[i].draw(cursor, widths[i]);
    cursor -= widths[i] + gap;
  }
}

/** A bordered icon+number badge for a currency, right-aligned at `rightX`. */
export function buildCurrencyChip(
scene: BoardScene,
  y: number,
  accent: number,
  glyph: 'coin' | 'gem',
  onTap: () => void
): HudChip {
  const s = scene.hudScale;
  const numberColor = materialLighting(accent, 4).light;
  const bg = scene.add.graphics().setDepth(20);
  const iconKey = glyph === 'coin' ? 'currency-coin' : 'currency-gem';
  // 24px of drawn mark, against the bolt's 26 - see GLYPH_FILL_RATIO for
  // why that is not the same as a 24px display size.
  const iconSize = currencyBoxFor(glyph === 'coin' ? 'credit' : 'gem', 15 * s);
  const iconShadow = scene.add.image(0, 0, iconKey).setDisplaySize(iconSize, iconSize).setTintFill(0x000000).setAlpha(0.28).setDepth(21);
  const icon = scene.add.image(0, 0, iconKey).setDisplaySize(iconSize, iconSize).setDepth(22);
  const iconGloss = scene.add.image(0, 0, iconKey).setDisplaySize(iconSize, iconSize).setTintFill(0xffffff).setAlpha(0.2).setDepth(23);
  iconGloss.setCrop(0, 0, iconGloss.width, iconGloss.height * 0.42);
  const text = scene.add.text(0, 0, '', {
    fontFamily: Theme.fontNumeric,
    fontSize: `${11 * s}px`,
    fontStyle: 'bold',
    color: hex(numberColor),
    resolution: textResolution
  }).setOrigin(1, 0.5).setDepth(24);
  const hit = scene.add.rectangle(0, 0, 10, 28, 0x000000, 0).setDepth(25).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => scene.time.delayedCall(0, onTap));

  const naturalWidth = (): number => Math.max(38 * s, Math.ceil(text.width) + 24 * s);
  const draw = (rightX: number, w: number): void => {
    const h = 16 * s;
    const x = rightX - w;

    bg.clear();
    // Darker than the surfaces around it, so the bar reads as a recess the
    // number sits in rather than as another raised panel.
    const chipLighting = materialLighting(Theme.bgElevated, 2);
    bg.fillGradientStyle(chipLighting.light, chipLighting.base, chipLighting.dark, chipLighting.shadow, 1);
    bg.fillRoundedRect(x, y, w, h, Theme.radiusChip);
    const edgeLighting = materialLighting(accent, 6);
    bg.lineGradientStyle(
      Theme.borderWidth + 0.5,
      edgeLighting.highlight, edgeLighting.light,
      edgeLighting.dark, edgeLighting.shadow, 0.95
    );
    bg.strokeRoundedRect(x, y, w, h, Theme.radiusChip);

    iconShadow.setPosition(x + 9 * s, y + h / 2 + 1.25 * s);
    icon.setPosition(x + 9 * s, y + h / 2);
    iconGloss.setPosition(x + 9 * s, y + h / 2);

    text.setScale(Math.min(1, Math.max(0.72, (w - 22 * s) / Math.max(1, text.width))), 1);
    text.setPosition(x + w - 6 * s, y + h / 2);
    hit.setPosition(x + w / 2, y + h / 2).setSize(w, 28);
    hit.input!.hitArea.setTo(0, 0, w, 28);
  };

  return { text, naturalWidth, draw };
}

/**
 * Fills a rect with the Blender-rendered button texture, scaled uniformly
 * (cover-fit, same technique as the scene background photo) and clipped
 * to a rounded-rect mask - NOT 9-sliced. The source has a continuous
 * diagonal reflection streak across its whole surface, so stretching a
 * sliced middle region to fill different button widths warps that streak;
 * uniform scaling avoids any axis-independent distortion.
 */
export function buildTexturedButtonFill(scene: BoardScene, x: number, y: number, w: number, h: number, container?: Phaser.GameObjects.Container, radius: number = Theme.radiusChip): Phaser.GameObjects.Image {
  const img = scene.add.image(x + w / 2, y + h / 2, 'uiButtonTest');
  const scale = Math.max(w / img.width, h / img.height);
  img.setScale(scale);

  const maskShape = scene.add.graphics().setVisible(false);
  maskShape.fillStyle(0xffffff, 1);
  maskShape.fillRoundedRect(x, y, w, h, radius);
  img.setMask(maskShape.createGeometryMask());

  if (container) {
    container.add(img);
    container.add(maskShape);
  }
  return img;
}

/** Layered vector badge showing the player's current level number. */
export function buildLevelBadge(scene: BoardScene, cx: number, cy: number): Phaser.GameObjects.Text {
  const s = scene.hudScale;
  const radius = 15 * s;
  const lighting = materialLighting(Theme.playerLevel, 5);
  // A rebuild (resize, fullscreen) makes a fresh Graphics, so the trailing
  // value is dropped and any tween still writing to the OLD object is
  // killed - that write would land on a destroyed display object.
  scene.levelXpRingTween?.remove();
  scene.levelXpRingTween = null;
  scene.levelXpRingDrawn = -1;
  scene.levelXpRing = scene.add.graphics();
  const badgePoints = (centerY: number, outer: number, inner: number): Phaser.Geom.Point[] => {
    const points: Phaser.Geom.Point[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 8;
      const r = i % 2 === 0 ? outer : inner;
      points.push(new Phaser.Geom.Point(cx + Math.cos(angle) * r, centerY + Math.sin(angle) * r));
    }
    return points;
  };
  const bg = scene.add.graphics();
  bg.fillStyle(lighting.shadow, 0.9);
  bg.fillPoints(badgePoints(cy + 2 * s, radius + s, radius - 3 * s), true);
  bg.fillStyle(lighting.light, 1);
  bg.fillPoints(badgePoints(cy, radius, radius - 4 * s), true);
  bg.fillGradientStyle(lighting.light, lighting.highlight, Theme.playerLevel, lighting.dark, 1);
  bg.fillCircle(cx, cy, radius - 4 * s);
  bg.lineStyle(1.5 * s, lighting.highlight, 0.75);
  bg.strokeCircle(cx, cy, radius - 5 * s);
  bg.fillStyle(lighting.highlight, 0.3);
  bg.fillEllipse(cx - 3 * s, cy - 5 * s, 8 * s, 4 * s);
  scene.levelKeystone = scene.add.graphics();

  const text = scene.add.text(cx, cy, '1', {
    fontFamily: Theme.fontNumeric,
    fontSize: `${13 * s}px`,
    fontStyle: 'bold',
    color: hex(Theme.textOnDark),
    resolution: textResolution
  }).setOrigin(0.5).setShadow(0, 1, '#000000', 1, true, false);
  const hit = scene.add.circle(cx, cy, radius, 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => scene.time.delayedCall(0, () => scene.openPlayerInfo()));

  // Persistent but quiet ready marker. It belongs to the level badge
  // because milestone crates are earned by levelling and claimed from the
  // profile; no second header currency or detached inbox is introduced.
  scene.levelMilestoneDot = scene.add.graphics();
  scene.levelMilestoneCount = scene.add.text(cx + 11 * s, cy - 11 * s, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric,
    fontSize: `${8 * s}px`,
    fontStyle: 'bold',
    color: hex(Theme.bg)
  }).setOrigin(0.5).setDepth(3);
  return text;
}

/**
 * Level-up flourish on the profile badge.
 *
 * Two rings leaving the badge and a punch on the number. The rings are the
 * XP ring's own radius and colour, so the effect reads as the ring the
 * player just filled letting go, rather than as a sparkle arriving from
 * nowhere - and the second, thinner one trails the first so it lands as a
 * pulse rather than as one hard flash.
 *
 * Drawn as throwaway Graphics rather than by animating the badge itself:
 * the badge's dome, rim, ring and keystone are separate objects at absolute
 * coordinates, so there is nothing to scale as a unit without rebuilding it
 * into a container.
 */
export function playLevelUpFlourish(scene: BoardScene): void {
  const s = scene.hudScale;
  const x = scene.levelBadgeText.x;
  const y = scene.levelBadgeText.y + 1.5;
  const lighting = materialLighting(Theme.playerLevel, 5);

  for (const wave of [
    { delay: 0, width: 3, tone: lighting.highlight, scale: 2.05, duration: 520 },
    { delay: 110, width: 1.5, tone: lighting.light, scale: 2.5, duration: 620 }
  ]) {
    const ring = scene.add.graphics().setPosition(x, y).setDepth(3).setAlpha(0);
    ring.lineStyle(wave.width, wave.tone, 1);
    // Centred on the graphics' own origin so `scale` grows it from the
    // badge rather than sliding it across the header.
    ring.strokeCircle(0, 0, 16.5 * s);
    scene.tweens.add({
      targets: ring,
      alpha: { from: 0.9, to: 0 },
      scale: { from: 1, to: wave.scale },
      delay: wave.delay,
      duration: wave.duration,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
  }

  // Killed first: levelling twice in quick succession - which a milestone
  // crate's own XP can cause - would otherwise leave the number stranded
  // mid-punch at whatever scale the interrupted tween had reached.
  scene.tweens.killTweensOf(scene.levelBadgeText);
  scene.levelBadgeText.setScale(1);
  scene.tweens.add({
    targets: scene.levelBadgeText,
    scale: 1.4,
    duration: 150,
    hold: 70,
    yoyo: true,
    ease: 'Back.easeOut',
    onComplete: () => scene.levelBadgeText.setScale(1)
  });
}

/** One paint of the ring at a given fill fraction. */
export function drawLevelXpRing(scene: BoardScene, progress: number, ringX: number, ringY: number, s: number): void {
  const gap = Phaser.Math.DegToRad(38);
  const start = -Math.PI / 2 + gap / 2;
  const span = Math.PI * 2 - gap;
  scene.levelXpRingDrawn = progress;
  scene.levelXpRing.clear();
  scene.levelXpRing.lineStyle(5 * s, Theme.borderOnDark, 0.8);
  scene.levelXpRing.beginPath();
  scene.levelXpRing.arc(ringX, ringY, 16.5 * s, start, start + span);
  scene.levelXpRing.strokePath();
  if (progress > 0) {
    const xpLighting = materialLighting(Theme.currencyXp, 5);
    const segments = Math.max(2, Math.ceil(36 * progress));
    for (let i = 0; i < segments; i++) {
      const from = start + span * progress * (i / segments);
      const to = start + span * progress * ((i + 1) / segments);
      scene.levelXpRing.lineStyle(5 * s, toneAt(xpLighting, 0.25 + 0.75 * (i / Math.max(1, segments - 1))), 1);
      scene.levelXpRing.beginPath();
      scene.levelXpRing.arc(ringX, ringY, 16.5 * s, from, to + 0.002);
      scene.levelXpRing.strokePath();
    }
  }
}

/**
 * Sweeps the ring to its new fill instead of snapping. XP arrives in one
 * lump when an order is delivered, and the ring jumping a quarter turn
 * between frames read as a number changing rather than progress being
 * made - the one place in the HUD where the player is meant to SEE the
 * gain.
 *
 * A level-up runs as two legs: up to full, then round from empty to the
 * remainder. Tweening straight to the smaller number would run the ring
 * BACKWARDS through the level it just earned.
 */
export function animateLevelXpRing(scene: BoardScene, target: number, ringX: number, ringY: number, s: number): void {
  scene.levelXpRingTween?.remove();
  scene.levelXpRingTween = null;
  const from = scene.levelXpRingDrawn;
  if (from === target) return;

  const sweep = (a: number, b: number, onDone?: () => void) => {
    // Paced by DISTANCE, so a sliver of XP is a flick and a big delivery is
    // a visible sweep, both at the same angular speed.
    const duration = Phaser.Math.Clamp(Math.abs(b - a) * 900, 120, 700);
    scene.levelXpRingTween = scene.tweens.addCounter({
      from: a,
      to: b,
      duration,
      ease: 'Sine.easeOut',
      onUpdate: (tween) => drawLevelXpRing(scene, tween.getValue() ?? b, ringX, ringY, s),
      onComplete: () => {
        drawLevelXpRing(scene, b, ringX, ringY, s);
        scene.levelXpRingTween = null;
        onDone?.();
      }
    });
  };

  if (target < from) sweep(from, 1, () => sweep(0, target));
  else sweep(from, target);
}

export function updateLevelBadge(scene: BoardScene): void {
  const s = scene.hudScale;
  const level = playerLevel(scene.orderState);
  scene.levelBadgeText.setText(String(level));
  // Detected here rather than at the order-completion call site, because
  // XP also arrives from milestones, daily claims and discoveries - every
  // one of which already routes through this method.
  if (scene.levelBadgeShownLevel !== 0 && level > scene.levelBadgeShownLevel) {
    playLevelUpFlourish(scene);
  }
  scene.levelBadgeShownLevel = level;
  const xp = playerXpProgress(scene.orderState);
  const progress = Phaser.Math.Clamp(xp.current / xp.required, 0, 1);
  const ringX = scene.levelBadgeText.x;
  const ringY = scene.levelBadgeText.y + 1.5 * s;
  drawLevelXpRing(scene, scene.levelXpRingDrawn < 0 ? progress : scene.levelXpRingDrawn, ringX, ringY, s);
  animateLevelXpRing(scene, progress, ringX, ringY, s);
  const capLighting = materialLighting(Theme.playerLevel, 5);
  const keystone = [
    new Phaser.Geom.Point(ringX - 7 * s, ringY - 20 * s),
    new Phaser.Geom.Point(ringX + 7 * s, ringY - 20 * s),
    new Phaser.Geom.Point(ringX + 5 * s, ringY - 13 * s),
    new Phaser.Geom.Point(ringX - 5 * s, ringY - 13 * s)
  ];
  scene.levelKeystone.clear();
  // Shaded as horizontal slices rather than one flat fill. Graphics has no
  // gradient fill for an arbitrary polygon - fillGradientStyle only reaches
  // rects and triangles, and on a triangulated path it keys off vertex
  // order, which for this trapezoid lands wherever the tessellator happens
  // to cut it. Slicing the shape puts the ramp under our control.
  //
  // Lit at the top face, falling to a shadowed underside where the cap
  // meets the ring: the same upper-left key light the dome, rim and XP
  // ring below it are all shaded by. A flat cap was the one surface on
  // this badge that read as a sticker sitting on the art.
  const capTop = ringY - 20 * s;
  const capBottom = ringY - 13 * s;
  const capSlices = 9;
  for (let i = 0; i < capSlices; i++) {
    const t0 = i / capSlices;
    const t1 = (i + 1) / capSlices;
    const halfAt = (t: number) => (7 - 2 * t) * s;
    const yAt = (t: number) => capTop + (capBottom - capTop) * t;
    scene.levelKeystone.fillStyle(toneAt(capLighting, 0.88 - 0.55 * ((t0 + t1) / 2)), 1);
    scene.levelKeystone.fillPoints([
      new Phaser.Geom.Point(ringX - halfAt(t0), yAt(t0)),
      new Phaser.Geom.Point(ringX + halfAt(t0), yAt(t0)),
      // Half a pixel of overlap onto the next slice; butted edges leave
      // hairline seams once the canvas is scaled by devicePixelRatio.
      new Phaser.Geom.Point(ringX + halfAt(t1), yAt(t1) + 0.5),
      new Phaser.Geom.Point(ringX - halfAt(t1), yAt(t1) + 0.5)
    ], true);
  }
  scene.levelKeystone.lineStyle(1, capLighting.highlight, 0.8);
  scene.levelKeystone.strokePoints(keystone, true);
  const projectReady = scene.projectStageReady();
  const readyCount = (dailyAvailable(scene.rewards, Date.now()) ? 1 : 0)
    + unclaimedDiscoveryCount(scene.collection)
    + (projectReady ? 1 : 0);
  scene.refreshMainCollectionButton();
  if (!scene.levelMilestoneDot || !scene.levelMilestoneCount) return;
  scene.levelMilestoneDot.clear();
  scene.levelMilestoneCount.setText('');
  if (readyCount > 0) {
    const x = scene.levelBadgeText.x + 11 * s;
    const y = scene.levelBadgeText.y - 11 * s;
    scene.levelMilestoneDot.fillStyle(Theme.accentAmber, 1);
    scene.levelMilestoneDot.fillCircle(x, y, 6 * s);
    scene.levelMilestoneDot.lineStyle(1, Theme.textOnDark, 0.75);
    scene.levelMilestoneDot.strokeCircle(x, y, 6 * s);
    scene.levelMilestoneDot.setDepth(2);
    scene.levelMilestoneCount
      .setPosition(x, y - 0.75)
      .setText(readyCount > 9 ? '9+' : String(readyCount));
  }
}

/** Layered vector storefront button, matching the board item's drawn-material treatment. */
export function buildShopIconButton(scene: BoardScene, cx: number, cy: number, onTap: () => void): void {
  const s = scene.hudScale;
  const radius = 18;
  const diameter = radius * 2;
  const lighting = materialLighting(Theme.panelAlt, 4);
  const icon = scene.add.graphics();
  icon.fillStyle(0x000000, 0.3);
  icon.fillCircle(1, 2, radius);
  icon.fillStyle(lighting.dark, 1);
  icon.fillCircle(0, 0, radius);
  icon.lineStyle(1.5, lighting.light, 0.9);
  icon.strokeCircle(0, 0, radius - 1);
  icon.fillStyle(lighting.highlight, 0.16);
  icon.fillEllipse(-5, -8, 18, 8);

  // Store body and window.
  icon.fillStyle(Theme.textOnDarkMuted, 1);
  icon.fillRoundedRect(-9, -3, 18, 13, 2);
  icon.fillStyle(Theme.bgElevated, 1);
  icon.fillRect(-6, 2, 5, 8);
  icon.fillRect(2, 2, 5, 5);

  // Striped awning gives the silhouette a clear "shop" read at icon size.
  icon.fillStyle(Theme.textOnDark, 1);
  icon.fillRoundedRect(-11, -9, 22, 7, 2);
  icon.fillStyle(Theme.currencyCredit, 1);
  icon.fillRect(-6, -9, 5, 7);
  icon.fillRect(4, -9, 5, 7);
  icon.lineStyle(1, lighting.shadow, 0.75);
  icon.lineBetween(-11, -2, 11, -2);

  scene.add.container(cx, cy, [icon]).setScale(s);

  const zone = scene.add.zone(cx, cy, diameter * s, diameter * s).setInteractive({ useHandCursor: true });
  zone.on('pointerdown', onTap);
}

export function buildAutoMergeButton(scene: BoardScene): void {
  scene.autoMergeText = scene.add.text(scene.scale.width - 48, scene.scale.height - 8, '', {
    resolution: textResolution,
    fontFamily: Theme.fontMono,
    fontSize: '10px',
    color: hex(Theme.textOnDarkMuted)
  }).setOrigin(1, 1).setAlpha(0.65).setDepth(10).setInteractive({ useHandCursor: true });
  const refresh = (): void => {
    scene.autoMergeText.setText(`auto: ${scene.autoMergeEnabled ? 'on' : 'off'}`)
      .setColor(hex(scene.autoMergeEnabled ? Theme.accentGreen : Theme.textOnDarkMuted));
  };
  refresh();
  scene.autoMergeText.on('pointerdown', () => {
    scene.autoMergeEnabled = !scene.autoMergeEnabled;
    localStorage.setItem(AUTO_MERGE_KEY, String(scene.autoMergeEnabled));
    refresh();
  });
}

export function buildProjectButton(scene: BoardScene): void {
  const { cy } = scene.crateRingCentre();
  const x = Math.max(22, scene.boardOriginX - 24);
  const s = 38;
  scene.projectButtonBg = scene.add.graphics().setDepth(4);
  scene.projectButtonIcon = scene.add.graphics().setPosition(x, cy).setDepth(5);
  scene.projectBadge = scene.add.graphics().setDepth(6);
  scene.projectButtonZone = scene.add.zone(x, cy, s, s).setDepth(7).setInteractive({ useHandCursor: true });
  scene.projectButtonZone.on('pointerdown', () => scene.openProject());

  scene.projectButtonBg.fillStyle(Theme.bg, 0.94);
  scene.projectButtonBg.fillRoundedRect(x - s / 2, cy - s / 2, s, s, Theme.radiusChip);
  scene.projectButtonBg.lineStyle(1, Theme.borderOnDark, 1);
  scene.projectButtonBg.strokeRoundedRect(x - s / 2, cy - s / 2, s, s, Theme.radiusChip);

  // Compact modern-house silhouette: concrete shell, glass opening, flat roof.
  scene.projectButtonIcon.fillStyle(0xb9c2c7, 1);
  scene.projectButtonIcon.fillRect(-12, -8, 24, 17);
  scene.projectButtonIcon.fillStyle(0x74858d, 1);
  scene.projectButtonIcon.fillRect(-14, -11, 28, 4);
  scene.projectButtonIcon.fillStyle(0x31454f, 1);
  scene.projectButtonIcon.fillRect(-7, -2, 7, 11);
  scene.projectButtonIcon.fillStyle(0x91a9b4, 0.85);
  scene.projectButtonIcon.fillRect(3, -3, 6, 6);
  refreshProjectButton(scene);
}

export function refreshProjectButton(scene: BoardScene): void {
  if (!scene.projectBadge || !scene.projectButtonIcon) return;
  const unlocked = playerLevel(scene.orderState) >= 3;
  scene.projectButtonIcon.setAlpha(unlocked ? 1 : 0.38);
  scene.projectBadge.clear();
  if (!scene.projectStageReady()) return;
  const { cy } = scene.crateRingCentre();
  const x = Math.max(22, scene.boardOriginX - 24);
  scene.projectBadge.fillStyle(Theme.accentAmber, 1);
  scene.projectBadge.fillCircle(x + 15, cy - 15, 6);
  scene.projectBadge.lineStyle(1, Theme.bg, 1);
  scene.projectBadge.strokeCircle(x + 15, cy - 15, 6);
}

/**
 * INVENTORY button, bottom-left under the action tray. Always visible,
 * unlike CRATES, because its slot count is information the player needs
 * even when it is empty.
 */
export function buildInventoryButton(scene: BoardScene): void {
  const x = scene.boardOriginX;
  const y = scene.boardOriginY + ROWS * scene.cellSize + scene.boardToTrayGap;
  scene.invBg = scene.add.graphics();
  // Icon-only, like the SHOP button: the word was the least interesting
  // thing on the screen and the case says it faster.
  scene.invLabel = scene.add.text(0, 0, '', { fontSize: '1px' }).setVisible(false);
  scene.invIcon = scene.add.graphics().setPosition(x + 21, y + 15.5);
  scene.invZone = scene.add.zone(x + 21, y + 15.5, 42, 31).setInteractive({ useHandCursor: true });
  scene.invZone.on('pointerdown', () => scene.showInventory());
  scene.refreshInventoryButton();
}

export function updateCurrencyText(scene: BoardScene): void {
  // The chip's own icon glyph now carries the coin/gem meaning, so the
  // number doesn't need a CR/GM prefix repeating it.
  scene.coinText.setText(formatHudValue(scene.economy.coins));
  scene.gemText.setText(formatHudValue(scene.economy.gems));
  updateEnergyText(scene);
  if (scene.levelBadgeText) updateLevelBadge(scene);
}

export function updateEnergyText(scene: BoardScene): void {
  if (!scene.energyText) return;
  syncEnergy(scene.energy);
  scene.energyText.setText(formatHudValue(scene.energy.current));
  scene.energyText.setColor(hex(
    scene.energy.current > 0 ? materialLighting(Theme.currencyEnergy, 4).light : Theme.danger
  ));
  // Every value change can change a chip's width, which moves its
  // neighbours - so the row re-packs rather than overlapping.
  layoutHudChips(scene);
}
