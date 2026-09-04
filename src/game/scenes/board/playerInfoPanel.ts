import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyIcon } from '../../ui/CurrencyGlyph';
import { buildCurrencyCluster } from '../../ui/CurrencyCluster';
import { CRATE_DRAWN, drawCrate } from '../../objects/TierIcons';
import type { CrateTier } from '../../rewards/Rewards';
import {
  claimDaily,
  dailyAvailable,
  dailyOfferLevel,
  dailyRewardFor,
  milestoneCrateFor
} from '../../rewards/Rewards';
import { playerLevel, playerXpProgress } from '../../levels/Orders';
import { addCoins } from '../../economy/Economy';
import { floatingScore } from '../../fx/MergeFx';
import { unclaimedDiscoveryCount } from '../../collection/Collection';

/**
 * playerInfoPanel, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

/**
 * The level today's daily is priced at, pinned the first time it is looked
 * at. The panel's previews run on a CLONE of the rewards state, so the pin
 * has to be taken here against the real one or every redraw would re-pin at
 * the current level - which is the bug this exists to close.
 */
export function dailyLevel(scene: BoardScene, now: number): number {
  const day = scene.rewards.dailyOfferDay;
  const level = dailyOfferLevel(scene.rewards, now, playerLevel(scene.orderState));
  if (scene.rewards.dailyOfferDay !== day || scene.rewards.dailyOfferLevel !== level) scene.saveState();
  return level;
}

export function openPlayerInfo(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  scene.modalOpen = true;
  const xp = playerXpProgress(scene.orderState);
  const profileNow = Date.now();
  const dailyReady = dailyAvailable(scene.rewards, profileNow);
  const pinnedLevel = dailyLevel(scene, profileNow);
  const dailyPreviewState = { ...scene.rewards };
  const dailyPreview = dailyReady
    ? claimDaily(dailyPreviewState, profileNow, pinnedLevel)
    : dailyRewardFor(scene.rewards.dailyStreak + 1, pinnedLevel);
  const projectUnlocked = xp.level >= 3;
  const profileProjectReady = scene.projectStageReady();
  const collectionReady = unclaimedDiscoveryCount(scene.collection);
  let nextMilestoneLevel = xp.level + 1;
  let nextMilestoneTier = milestoneCrateFor(nextMilestoneLevel);
  // Milestones are not awarded every level. Walk to the next actual reward
  // instead of showing the generic word CRATE when the immediate next level
  // happens to be one of the levels without a milestone.
  while (!nextMilestoneTier) {
    nextMilestoneLevel++;
    nextMilestoneTier = milestoneCrateFor(nextMilestoneLevel);
  }

  const overlay = scene.add.rectangle(
    scene.scale.width / 2, scene.scale.height / 2,
    scene.scale.width, scene.scale.height,
    0x000000, 0.6
  ).setDepth(3000).setInteractive();

  const card = scene.add.container(scene.scale.width / 2, scene.scale.height / 2).setDepth(3001);
  const panelW = Math.min(360, scene.scale.width - 40);
  // 316, down from 360. The panel was a title row, three blocks and the gaps
  // between them; dropping the title and the advice line took about 60px of
  // nothing out of it, so what is left is denser rather than more cramped.
  const panelH = Math.min(316, scene.scale.height - 32);
  const left = -panelW / 2;
  const top = -panelH / 2;
  // Built exactly as the daily menu's panel is - cast shadow, top-lit
  // gradient ground, accent wash on the upper third, lit and shadowed inner
  // edges. The two panels are the game's two "here is where you stand"
  // screens and they were drawn in different languages: one a flat sheet
  // with a grey outline, the other a seated object.
  const cardBg = scene.add.graphics();
  for (let i = 3; i >= 1; i--) {
    cardBg.fillStyle(0x000000, 0.13);
    cardBg.fillRoundedRect(left - i * 2, top - i + 8, panelW + i * 4, panelH + i * 2, Theme.radiusPanel + i);
  }
  cardBg.fillGradientStyle(Theme.bg, Theme.bg, 0x14120f, 0x14120f, 1);
  cardBg.fillRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);
  cardBg.fillStyle(Theme.playerLevel, 0.06);
  cardBg.fillRoundedRect(left, top, panelW, panelH * 0.34, Theme.radiusPanel);
  cardBg.lineStyle(Theme.borderWidthStrong, Theme.playerLevel, 0.85);
  cardBg.strokeRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);
  cardBg.lineStyle(1, 0xffffff, 0.09);
  cardBg.lineBetween(left + 8, top + 2, left + panelW - 8, top + 2);
  cardBg.lineStyle(1, 0x000000, 0.3);
  cardBg.lineBetween(left + 8, top + panelH - 2, left + panelW - 8, top + panelH - 2);

  // No "PLAYER PROFILE" heading and no rule under it. A panel opened from
  // the level badge does not need to announce itself, and between them they
  // cost 45px at the top of a panel whose contents were already tight. The
  // level block is the identity now.
  const titleRule = scene.add.graphics();
  const title = scene.add.text(0, 0, '', { fontSize: '1px' }).setVisible(false);

  const levelDisc = scene.add.graphics();
  levelDisc.fillStyle(Theme.playerLevel, 1);
  // The same recessed well the daily menu puts its strip in: dark fill, a
  // shadowed top edge and a lit bottom one, which is the inverse of the
  // raised panel around it.
  const profileBand = scene.add.graphics();
  profileBand.fillStyle(Theme.bgElevated, 1);
  profileBand.fillRoundedRect(left + 18, top + 20, panelW - 36, 82, Theme.radiusChip);
  profileBand.fillStyle(Theme.playerLevel, 0.14);
  profileBand.fillRoundedRect(left + 18, top + 20, panelW - 36, 41, Theme.radiusChip);
  profileBand.lineStyle(1, Theme.playerLevel, 0.55);
  profileBand.strokeRoundedRect(left + 18, top + 20, panelW - 36, 82, Theme.radiusChip);
  profileBand.lineStyle(1, 0x000000, 0.35);
  profileBand.lineBetween(left + 26, top + 21, left + panelW - 26, top + 21);
  profileBand.lineStyle(1, 0xffffff, 0.06);
  profileBand.lineBetween(left + 26, top + 101, left + panelW - 26, top + 101);

  levelDisc.fillStyle(Theme.playerLevel, 1);
  levelDisc.fillCircle(left + 57, top + 61, 30);
  levelDisc.lineStyle(1, Theme.textOnDark, 0.4);
  levelDisc.strokeCircle(left + 57, top + 61, 30);
  const levelText = scene.add.text(left + 57, top + 61, String(xp.level), {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric,
    fontSize: '25px',
    fontStyle: 'bold',
    color: hex(Theme.textOnDark)
  }).setOrigin(0.5);
  const levelLabel = scene.add.text(left + 100, top + 40, `LEVEL ${xp.level}`, {
    resolution: textResolution,
    fontFamily: Theme.fontHeading,
    fontSize: '13px',
    fontStyle: 'bold',
    color: hex(Theme.textOnDark)
  });
  // The XP bar lives on the LEVEL row, not on a row of its own.
  //
  // No numbers on it, and no `TOTAL XP` or `N XP TO LEVEL` lines either.
  // `xpForLevel` is `50 * level * (level - 1)`, so a player reading those
  // figures watches the cost of a level climb from 200 to 4,400 - the bar
  // shows the same progress without spelling out a curve that only reads as
  // discouraging. Inlining it also frees the whole middle of the panel.
  const barX = left + 100;
  const barY = top + 62;
  const barW = panelW - 136;
  const barH = 13;
  const progress = Phaser.Math.Clamp(xp.current / xp.required, 0, 1);
  const xpBar = scene.add.graphics();
  xpBar.fillStyle(Theme.bg, 0.7);
  xpBar.fillRoundedRect(barX, barY, barW, barH, Theme.radiusChip);
  if (progress > 0) {
    const xpLighting = materialLighting(Theme.currencyXp, 5);
    xpBar.fillGradientStyle(
      xpLighting.light, xpLighting.highlight,
      xpLighting.dark, xpLighting.base, 1
    );
    xpBar.fillRoundedRect(barX, barY, Math.max(4, barW * progress), barH, Theme.radiusChip);
  }
  xpBar.lineStyle(Theme.borderWidth, Theme.borderOnDark, 1);
  xpBar.strokeRoundedRect(barX, barY, barW, barH, Theme.radiusChip);

  // The upcoming level reward is the object at the finish line, rather
  // than a second text row explaining the same thing. When it is ready,
  // the crate itself becomes the claim control.
  const rewardCrateX = barX + barW;
  const rewardCrateY = barY + barH / 2;
  const rewardCrate = scene.add.graphics().setPosition(rewardCrateX, rewardCrateY);
  const drawLevelReward = (tier: CrateTier): void => {
    rewardCrate.clear().setAlpha(0.78);
    drawCrate(rewardCrate, 36, tier);
  };
  drawLevelReward(nextMilestoneTier as CrateTier);

  // The divider, and the "MERGE ITEMS AND COMPLETE ORDERS TO LEVEL UP" line
  // under it, are gone. Nobody opens their profile to be told how to level
  // up, and that line held the most prominent free space on the panel to say
  // it.
  const divider = scene.add.graphics();
  const guidance = scene.add.text(0, 0, '', { fontSize: '1px' }).setVisible(false);

  // Sits straight under the level block and takes the height the title and
  // the advice line gave back: 92 rather than 74, which is what lets the day
  // labels and reward figures be read at all.
  const dailyY = top + 160;
  const dailyStripX = left + 18;
  const dailyStripY = dailyY - 46;
  const dailyStripW = panelW - 36;
  const dailyStripH = 92;
  // DERIVED from the strip, not fixed.
  //
  // At a hardcoded 62 the four ordinary tabs came to 248px, and `panelW` is
  // `min(360, viewport - 40)` - so on a narrow phone the strip is smaller
  // than that and the fifth tab was handed a NEGATIVE width. It collapsed,
  // and its chevron inverted.
  //
  // The last tab keeps the extra width it always had: at the widest panel
  // the old numbers gave 62 against 76, so it takes 1.22 shares to the
  // others' one and the proportions are unchanged where they already fitted.
  const LAST_TAB_SHARE = 1.22;
  const dailyTabW = dailyStripW / (4 + LAST_TAB_SHARE);
  const dailyLastW = dailyStripW - dailyTabW * 4;
  // Type follows the tab. A 10px label is right at the full width and too
  // wide for a tab that has had to shrink, which is the other half of "the
  // days don't fit".
  const dailyFit = Phaser.Math.Clamp(dailyTabW / 62, 0.72, 1);
  const dailyLabelPx = Math.round(Phaser.Math.Clamp(10 * dailyFit, 8, 10));
  const dailyValuePx = Math.round(Phaser.Math.Clamp(9 * dailyFit, 7, 9));
  const dailyStrip = scene.add.graphics();
  const dailyIcons = Array.from({ length: 5 }, () => scene.add.graphics());
  // Coins are the SVG mark now, so they are Images rather than something
  // the strip draws. One of the two is shown per day.
  // Day 1 is the single Credit, which is an SVG mark and so an Image; day 2
  // is the Credit Stack, a drawn silhouette on the same graphics the crate
  // days use.
  const dailyCoin = currencyIcon(scene, 'credit', 30 * dailyFit).setVisible(false);
  // Day 2's pair, built once and repositioned as the strip redraws. Each
  // mark keeps its layout offset in data, since reading it back off `x`
  // after a reposition would compound.
  const dailyPair = buildCurrencyCluster(scene, 'credit', 2, 44 * dailyFit)
    .flatMap(({ art, gloss }) => [art, gloss])
    .map((part) => part.setData('ox', part.x).setData('oy', part.y).setVisible(false));
  const dailyDayLabels = Array.from({ length: 5 }, (_, index) => scene.add.text(0, 0,
    index === 4 ? 'DAY 5+' : `DAY ${index + 1}`, {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: `${dailyLabelPx}px`,
      fontStyle: 'bold',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0.5));
  const dailyRewardLabels = Array.from({ length: 5 }, () => scene.add.text(0, 0, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric,
    fontSize: `${dailyValuePx}px`,
    fontStyle: 'bold',
    color: hex(Theme.textOnDark)
  }).setOrigin(0.5));
  const dailyStateLabels = Array.from({ length: 5 }, () => scene.add.text(0, 0, '', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading,
    fontSize: `${dailyValuePx}px`,
    fontStyle: 'bold',
    color: hex(Theme.accentGreen)
  }).setOrigin(0.5));
  const dailyClaimZone = scene.add.zone(0, 0, dailyTabW, dailyStripH);
  let dailyClaimOriginX = dailyStripX + dailyTabW / 2;
  const dailyTabBounds = (index: number): { x: number; width: number } => ({
    x: dailyStripX + dailyTabW * index,
    width: index === 4 ? dailyLastW : dailyTabW
  });
  const drawDailyStrip = (): void => {
    const now = Date.now();
    const canDaily = dailyAvailable(scene.rewards, now);
    // The pinned level, not the live one: an unclaimed daily must not grow
    // while the panel is open.
    const currentLevel = dailyLevel(scene, now);
    const previewState = { ...scene.rewards };
    const preview = canDaily
      ? claimDaily(previewState, now, currentLevel) ?? dailyRewardFor(1, currentLevel)
      : dailyRewardFor(scene.rewards.dailyStreak + 1, currentLevel);
    const activeIndex = Math.min(preview.streak, 5) - 1;
    const claimedThrough = canDaily
      ? Math.min(Math.max(0, preview.streak - 1), 5)
      : Math.min(scene.rewards.dailyStreak, 5);

    dailyStrip.clear();
    for (let index = 0; index < 5; index++) {
      const reward = dailyRewardFor(index + 1, currentLevel);
      const bounds = dailyTabBounds(index);
      const x = bounds.x;
      const width = bounds.width;
      const right = x + width;
      const mid = dailyStripY + dailyStripH / 2;
      const points = index === 0
        ? [
            new Phaser.Geom.Point(x, dailyStripY),
            new Phaser.Geom.Point(right - 7, dailyStripY),
            new Phaser.Geom.Point(right, mid),
            new Phaser.Geom.Point(right - 7, dailyStripY + dailyStripH),
            new Phaser.Geom.Point(x, dailyStripY + dailyStripH)
          ]
        : index === 4
          ? [
              new Phaser.Geom.Point(x + 7, dailyStripY),
              new Phaser.Geom.Point(right, dailyStripY),
              new Phaser.Geom.Point(right, dailyStripY + dailyStripH),
              new Phaser.Geom.Point(x + 7, dailyStripY + dailyStripH),
              new Phaser.Geom.Point(x, mid)
            ]
          : [
              new Phaser.Geom.Point(x + 7, dailyStripY),
              new Phaser.Geom.Point(right - 7, dailyStripY),
              new Phaser.Geom.Point(right, mid),
              new Phaser.Geom.Point(right - 7, dailyStripY + dailyStripH),
              new Phaser.Geom.Point(x + 7, dailyStripY + dailyStripH),
              new Phaser.Geom.Point(x, mid)
            ];
      const isActive = index === activeIndex;
      const isClaimed = index < claimedThrough || (!canDaily && index === 4 && claimedThrough >= 5);
      const accent = reward.kind === 'credits' ? Theme.currencyCredit : scene.crateAccent(reward.tier);

      // The daily menu's tab treatment, applied to the same five days here:
      // a dropped copy for lift, a specular band clipped to the chevron, and
      // a bevel that follows the notch instead of running across it.
      const tabTop = dailyStripY;
      const tabBot = dailyStripY + dailyStripH;
      const edgesAt = (yy: number): [number, number] => {
        const u = Math.min(1, Math.abs(yy - mid) / (dailyStripH / 2));
        return [x + (index === 0 ? 0 : 7) * u, right - (index === 4 ? 0 : 7) * u];
      };
      dailyStrip.fillStyle(0x000000, 0.4);
      dailyStrip.fillPoints(points.map((q) => new Phaser.Geom.Point(q.x, q.y + 3)), true);
      dailyStrip.fillStyle(isActive ? accent : Theme.bgElevated, isActive ? 0.26 : 1);
      dailyStrip.fillPoints(points, true);
      const BANDS = 14;
      for (let b = 0; b < BANDS; b++) {
        const y0 = tabTop + (dailyStripH * b) / BANDS;
        const y1 = tabTop + (dailyStripH * (b + 1)) / BANDS;
        const f = b / (BANDS - 1);
        const [l0, r0] = edgesAt(y0);
        const [l1, r1] = edgesAt(y1);
        const quad = [
          new Phaser.Geom.Point(l0, y0), new Phaser.Geom.Point(r0, y0),
          new Phaser.Geom.Point(r1, y1), new Phaser.Geom.Point(l1, y1)
        ];
        if (f < 0.5) dailyStrip.fillStyle(0xffffff, (1 - f * 2) ** 2 * (isActive ? 0.16 : 0.1));
        else dailyStrip.fillStyle(0x000000, ((f - 0.5) * 2) ** 2 * 0.3);
        dailyStrip.fillPoints(quad, true);
      }
      const [bl, br] = edgesAt(tabTop + 2);
      dailyStrip.lineStyle(1.5, 0xffffff, isActive ? 0.3 : 0.16);
      dailyStrip.lineBetween(bl + 2, tabTop + 2, br - 2, tabTop + 2);
      const [dl, dr] = edgesAt(tabBot - 2);
      dailyStrip.lineStyle(1.5, 0x000000, 0.35);
      dailyStrip.lineBetween(dl + 2, tabBot - 2, dr - 2, tabBot - 2);
      if (isActive) {
        dailyStrip.lineStyle(4, accent, 0.22);
        dailyStrip.strokePoints(points, true);
      }
      dailyStrip.lineStyle(isActive ? 2 : 1, isActive ? accent : Theme.borderOnDark, isActive ? 1 : 0.9);
      dailyStrip.strokePoints(points, true);

      // Same centring the daily menu's tabs use, and for the same reason:
      // a middle tab is notched on BOTH sides so it is symmetric and wants
      // no offset, while the two end tabs are lopsided. The old flat
      // `index > 0 ? 2 : 0` pushed all four right-hand tabs across.
      const centerX = x + width / 2 + (index === 0 ? -7 / 4 : index === 4 ? 7 / 4 : 0);
      // Vertically centred in the band the day label and the value line
      // leave: the label sits at +10 and reaches +16, the value sits at
      // +63 and starts at +57, so the free space runs +16 to +57 and its
      // middle is +36.
      const iconY = dailyStripY + 36;
      dailyDayLabels[index].setPosition(centerX, dailyStripY + 10)
        .setColor(hex(isActive ? accent : Theme.textOnDarkMuted));
      dailyIcons[index].clear().setScale(1).setAlpha(isClaimed ? 0.5 : 1);
      // 26 and 25 looked like matching numbers but were not matching SIZES:
      // `drawCurrencyGlyph` fills its full `size` (a 26px coin), while
      // `drawCrate` draws to about 0.67 of it, so the chests came out at
      // ~17px beside a 26px coin. 40 puts the crate's rendered width on the
      // coin's, which is what "the same size" actually means here.
      // Sized by drawn width, as everywhere else.
      const STRIP_CRATE = (36 * dailyFit) / CRATE_DRAWN.width;
      if (index === 0) {
        dailyCoin.setVisible(reward.kind === 'credits')
          .setPosition(centerX, iconY)
          .setAlpha(isClaimed ? 0.5 : 1);
      } else if (index === 1) {
        for (const part of dailyPair) {
          part.setVisible(reward.kind === 'credits')
            // Lifted by the pair's own midpoint, so the PAIR is centred
            // rather than its first coin.
            .setPosition(centerX + part.getData('ox'), iconY - 4.4 + part.getData('oy'))
            .setAlpha(isClaimed ? 0.5 : part.isTinted ? 0.2 : 1);
        }
      }
      if (reward.kind !== 'credits') {
        dailyIcons[index].setPosition(centerX, iconY);
        drawCrate(dailyIcons[index], STRIP_CRATE, reward.tier);
      }
      // A day that has not opened yet shows '?' rather than a number. Its
      // Credit value is only fixed when the day rolls over and is priced at
      // the level reached by then, so printing today's estimate would be
      // stating a figure the game has not committed to - and the player
      // would read a later, larger payout as the game shortchanging them.
      // Measured against the last day whose value is actually FIXED, which
      // is not the same as the active tab. Once today's daily is claimed the
      // strip moves `activeIndex` on to tomorrow to show what is next - and
      // tomorrow's Credits are priced at the level reached by then, so
      // printing a figure there stated a number the game has not committed
      // to. That is the same fault the '?' was introduced to fix, surviving
      // in the one case where the day had already been taken.
      const fixedThrough = canDaily ? activeIndex : Math.min(scene.rewards.dailyStreak, 5) - 1;
      const unopened = index > fixedThrough;
      dailyRewardLabels[index]
        .setPosition(centerX, dailyStripY + 63)
        // No tier word under a crate. The art says which crate it is, and
        // the game's rule is that the art speaks for itself - see the
        // show-don't-tell note in CLAUDE.md.
        .setText(reward.kind !== 'credits'
          ? ''
          : unopened ? '?' : String(reward.credits))
        .setColor(hex(isActive ? Theme.textOnDark : Theme.textOnDarkMuted));
      dailyStateLabels[index]
        .setPosition(centerX + width * 0.28, dailyStripY + 24)
        // No 'NEXT' on the day that is coming: the tab is already the one
        // lit and outlined in the accent colour, so the word only repeated
        // what the highlight had said. 'CLAIM' stays - that is an action to
        // take, not a description of the state.
        .setText(isClaimed ? '✓' : isActive && canDaily ? 'CLAIM' : '')
        .setColor(hex(isClaimed ? Theme.accentGreen : accent));
    }

    const activeBounds = dailyTabBounds(activeIndex);
    dailyClaimOriginX = activeBounds.x + activeBounds.width / 2;
    dailyClaimZone.setPosition(dailyClaimOriginX, dailyStripY + dailyStripH / 2)
      .setSize(activeBounds.width, dailyStripH);
    if (canDaily) dailyClaimZone.setInteractive({ useHandCursor: true });
    else dailyClaimZone.disableInteractive();
  };
  drawDailyStrip();

  const collectionX = left + 42;
  const collectionY = top + 258;
  const collectionPanel = scene.add.graphics();
  collectionPanel.fillStyle(Theme.panelAlt, 0.72);
  // 60x37. The height is DERIVED: the house's drawn art stands on the chip's
  // bottom edge while breaking ~9px past its top, and the home-icon SVG
  // carries 9.7% padding above its drawing and 8.9% below - so at a 56px
  // display size the art runs 5.4px to 51px inside its own box, and the chip
  // that satisfies both ends is 37 tall with the box centred 4.5px above it.
  // Seated like the daily menu's CLAIM: a dark plinth under the chip, a lit
  // top edge and a shadowed bottom one. These are the only two things on the
  // panel you can press, and they were the flattest shapes on it.
  collectionPanel.fillStyle(0x000000, 0.4);
  collectionPanel.fillRoundedRect(collectionX - 30, collectionY - 15.5, 60, 37, Theme.radiusChip);
  collectionPanel.fillStyle(Theme.panelAlt, 0.72);
  collectionPanel.fillRoundedRect(collectionX - 30, collectionY - 18.5, 60, 37, Theme.radiusChip);
  collectionPanel.lineStyle(1, profileProjectReady ? Theme.accentAmber : Theme.borderOnDark,
    profileProjectReady ? 0.9 : 1);
  collectionPanel.strokeRoundedRect(collectionX - 30, collectionY - 18.5, 60, 37, Theme.radiusChip);
  collectionPanel.lineStyle(1, 0xffffff, 0.16);
  collectionPanel.lineBetween(collectionX - 25, collectionY - 17.5, collectionX + 25, collectionY - 17.5);
  collectionPanel.lineStyle(1, 0x000000, 0.35);
  collectionPanel.lineBetween(collectionX - 25, collectionY + 17.5, collectionX + 25, collectionY + 17.5);
  // The owner's house mark, drawn LARGER than its 48x36 tile and allowed to
  // overhang it. Contained inside the chip the building was too small to
  // read as a building - same call as the currency glyphs, which are sized
  // for legibility first and overflow their scrims rather than shrink.
  const collectionIcon = scene.add.image(collectionX, collectionY - 4.5, 'home-icon')
    .setDisplaySize(56, 56)
    .setAlpha(projectUnlocked ? 1 : 0.38);
  // The badge means "something is waiting for you". A locked button has
  // nothing waiting - it says so with the padlock and the line beside it, so
  // the dot no longer doubles as a level requirement.
  const collectionBadge = scene.add.text(collectionX + 23, collectionY - 14,
    profileProjectReady ? '!' : '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric,
      fontSize: '8px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark),
      backgroundColor: hex(Theme.accentAmber),
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5);
  collectionBadge.setVisible(profileProjectReady);

  // Padlock over the greyed mark, and the requirement spelled out beside it.
  // Two lines: one would run under the collection button sitting at x = 0.
  const collectionLock = scene.add.graphics().setPosition(collectionX, collectionY - 3);
  const collectionLockNote = scene.add.text(collectionX + 36, collectionY, 'UNLOCKS AT\nLEVEL 3', {
    resolution: textResolution,
    fontFamily: Theme.fontMono,
    fontSize: '8px',
    fontStyle: 'bold',
    color: hex(Theme.textOnDarkMuted),
    lineSpacing: 2
  }).setOrigin(0, 0.5);
  if (projectUnlocked) {
    collectionLockNote.setVisible(false);
  } else {
    // Body, then the shackle as a stroked half-circle above it.
    collectionLock.fillStyle(Theme.textOnDark, 0.9);
    collectionLock.fillRoundedRect(-7, -1, 14, 11, 2);
    collectionLock.lineStyle(2.5, Theme.textOnDark, 0.9);
    collectionLock.beginPath();
    collectionLock.arc(0, -1, 4.5, Math.PI, 0);
    collectionLock.strokePath();
    collectionLock.fillStyle(Theme.bg, 0.9);
    collectionLock.fillCircle(0, 4, 1.6);
  }
  const collectionZone = scene.add.zone(collectionX, collectionY, 60, 44)
    .setInteractive({ useHandCursor: true });

  const bookX = 0;
  const bookY = collectionY;
  const bookPanel = scene.add.graphics();
  bookPanel.fillStyle(0x000000, 0.4);
  bookPanel.fillRoundedRect(bookX - 30, bookY - 15.5, 60, 37, Theme.radiusChip);
  bookPanel.fillStyle(Theme.panelAlt, 0.72);
  bookPanel.fillRoundedRect(bookX - 30, bookY - 18.5, 60, 37, Theme.radiusChip);
  bookPanel.lineStyle(1, collectionReady > 0 ? Theme.currencyGem : Theme.borderOnDark,
    collectionReady > 0 ? 0.8 : 1);
  bookPanel.strokeRoundedRect(bookX - 30, bookY - 18.5, 60, 37, Theme.radiusChip);
  bookPanel.lineStyle(1, 0xffffff, 0.16);
  bookPanel.lineBetween(bookX - 25, bookY - 17.5, bookX + 25, bookY - 17.5);
  bookPanel.lineStyle(1, 0x000000, 0.35);
  bookPanel.lineBetween(bookX - 25, bookY + 17.5, bookX + 25, bookY + 17.5);
  // The book draws centred on its origin at 0.68 of its size tall, so
  // standing it on the chip's bottom edge with the same overhang means its
  // centre sits 5px above the chip's.
  const bookIcon = scene.add.graphics().setPosition(bookX, bookY - 5);
  scene.drawCollectionBook(bookIcon, 40, collectionReady > 0 ? Theme.currencyGem : Theme.textOnDarkMuted);
  const bookBadge = scene.add.text(bookX + 23, bookY - 14,
    collectionReady > 0 ? String(collectionReady > 9 ? '9+' : collectionReady) : '', {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric,
      fontSize: '8px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark),
      backgroundColor: hex(Theme.currencyGem),
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5).setVisible(collectionReady > 0);
  const bookZone = scene.add.zone(bookX, bookY, 60, 44).setInteractive({ useHandCursor: true });

  const closeBtn = scene.add.text(-left - 22, top + 22, '✕', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading,
    fontSize: '18px',
    color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  card.add([
    cardBg, titleRule, title, profileBand, levelDisc, levelText, levelLabel, xpBar,
    rewardCrate, divider, guidance,
    dailyStrip, ...dailyIcons, dailyCoin, ...dailyPair, ...dailyDayLabels, ...dailyRewardLabels, ...dailyStateLabels, dailyClaimZone,
    collectionPanel, collectionIcon, collectionLock, collectionLockNote, collectionBadge, collectionZone,
    bookPanel, bookIcon, bookBadge, bookZone, closeBtn
  ]);

  const dismiss = (): void => {
    overlay.destroy();
    card.destroy();
    scene.modalOpen = false;
  };
  /** Rewrites both reward rows from current state, so the panel can stay open. */
  const refreshRewardRows = (): void => {
    let upcomingLevel = playerLevel(scene.orderState) + 1;
    let upcomingTier = milestoneCrateFor(upcomingLevel);
    while (!upcomingTier) {
      upcomingLevel++;
      upcomingTier = milestoneCrateFor(upcomingLevel);
    }
    drawLevelReward(upcomingTier as CrateTier);

    drawDailyStrip();
  };

  let rewardClaimPending = false;
  overlay.on('pointerdown', () => scene.time.delayedCall(0, dismiss));
  closeBtn.on('pointerdown', () => scene.time.delayedCall(0, dismiss));
  collectionZone.on('pointerdown', () => scene.time.delayedCall(0, () => {
    dismiss();
    scene.openProject();
  }));
  bookZone.on('pointerdown', () => scene.time.delayedCall(0, () => {
    dismiss();
    scene.openCollection();
  }));
  dailyClaimZone.on('pointerdown', () => scene.time.delayedCall(0, () => {
      if (rewardClaimPending) return;
      rewardClaimPending = true;
      const now = Date.now();
      if (!dailyAvailable(scene.rewards, now)) {
        rewardClaimPending = false;
        return;
      }

      const claimed = claimDaily(scene.rewards, now, playerLevel(scene.orderState));
      if (!claimed) {
        rewardClaimPending = false;
        return;
      }
      if (claimed.kind === 'credits') {
        addCoins(scene.economy, claimed.credits);
        scene.updateCurrencyText();
        floatingScore(scene, card.x + dailyClaimOriginX, card.y + dailyY + 3, claimed.credits, 'CR');
        scene.saveState();
      } else {
        scene.awardCrate(
          claimed.tier,
          `DAILY SUPPLY  ·  DAY ${claimed.dayLabel}`,
          { x: card.x + dailyClaimOriginX, y: card.y + dailyY + 3 }
        );
      }
      scene.updateLevelBadge();
      // Panel stays open; the rows rewrite themselves instead.
      refreshRewardRows();
      rewardClaimPending = false;
    }));
}
