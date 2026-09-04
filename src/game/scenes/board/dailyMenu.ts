import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyIcon } from '../../ui/CurrencyGlyph';
import { buildCurrencyCluster } from '../../ui/CurrencyCluster';
import { CRATE_DRAWN, drawCrate } from '../../objects/TierIcons';
import { claimDaily, dailyAvailable, dailyRewardFor } from '../../rewards/Rewards';
import { addCoins } from '../../economy/Economy';
import { floatingScore } from '../../fx/MergeFx';

/**
 * dailyMenu, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

/**
 * The daily supply menu. It opens BY ITSELF on launch when today's reward
 * is unclaimed, and there is deliberately no button that reaches it: it is
 * the game's first word of the session, not a screen to go looking for. Once
 * claimed it does not come back, and the profile panel's strip stays as the
 * way to claim one that was dismissed.
 */
export function openDailyMenu(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  const now = Date.now();
  if (!dailyAvailable(scene.rewards, now)) return;
  scene.modalOpen = true;

  const level = scene.dailyLevel(now);
  // What claiming right now would hand over, previewed on a COPY so the
  // real streak is only advanced by the button.
  const preview = claimDaily({ ...scene.rewards }, now, level) ?? dailyRewardFor(1, level);
  const activeIndex = Math.min(preview.streak, 5) - 1;
  const claimedThrough = Math.min(Math.max(0, preview.streak - 1), 5);

  const W = Math.min(scene.scale.width - 36, 380);
  const H = 336;
  const cx = scene.scale.width / 2;
  const cy = scene.scale.height / 2;

  // 0.72, and darker than the other panels' 0.6: this one interrupts the
  // session rather than being opened, so the board behind it should read as
  // switched off. The fill alpha is set here and the OBJECT alpha is what
  // animates - passing 0 as the fill alpha made a rectangle that could
  // never be seen however far its alpha was tweened.
  const dim = scene.add.rectangle(cx, cy, scene.scale.width, scene.scale.height, 0x000000, 0.72)
    .setDepth(3000).setAlpha(0).setInteractive();
  const card = scene.add.container(cx, cy).setDepth(3001);

  const bg = scene.add.graphics();
  // Cast shadow first, so the panel sits ABOVE the board rather than being
  // painted onto it. Three offset passes rather than one: a single flat
  // rectangle of black reads as a border, a falloff reads as a shadow.
  for (let i = 3; i >= 1; i--) {
    bg.fillStyle(0x000000, 0.13);
    bg.fillRoundedRect(-W / 2 - i * 2, -H / 2 - i + 8, W + i * 4, H + i * 2, Theme.radiusPanel + i);
  }
  // Lit at the top, falling to the base tone at the bottom - the same
  // upper-left key light every drawn object in the game shares.
  bg.fillGradientStyle(Theme.bg, Theme.bg, 0x14120f, 0x14120f, 1);
  bg.fillRoundedRect(-W / 2, -H / 2, W, H, Theme.radiusPanel);
  bg.fillStyle(Theme.currencyCredit, 0.06);
  bg.fillRoundedRect(-W / 2, -H / 2, W, H * 0.34, Theme.radiusPanel);
  bg.lineStyle(Theme.borderWidthStrong, Theme.currencyCredit, 0.85);
  bg.strokeRoundedRect(-W / 2, -H / 2, W, H, Theme.radiusPanel);
  // Lit inner edge along the top, shadowed one along the bottom: 1px each,
  // and the whole panel stops looking like a flat sheet.
  bg.lineStyle(1, 0xffffff, 0.09);
  bg.lineBetween(-W / 2 + 8, -H / 2 + 2, W / 2 - 8, -H / 2 + 2);
  bg.lineStyle(1, 0x000000, 0.3);
  bg.lineBetween(-W / 2 + 8, H / 2 - 2, W / 2 - 8, H / 2 - 2);
  card.add(bg);

  card.add(scene.add.text(0, -H / 2 + 26, 'DAILY SUPPLY', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '20px', fontStyle: 'bold', color: hex(Theme.textOnDark)
  }).setOrigin(0.5).setLetterSpacing(2));
  // The line states what is actually true of THIS day. On day 4 the news is
  // that tomorrow is the top of the ladder; on day 5+ the player is already
  // there and telling them to play five days in a row says nothing.
  const subtitle = preview.streak >= 5
    ? 'MAXIMUM REWARD  ·  KEEP THE STREAK TO HOLD IT'
    : preview.streak === 4
      ? "YOU'LL GET THE MAXIMUM REWARD TOMORROW"
      : 'PLAY 5 DAYS IN A ROW FOR THE MAXIMUM BONUS';
  card.add(scene.add.text(0, -H / 2 + 50, subtitle, {
    resolution: textResolution,
    fontFamily: Theme.fontMono, fontSize: '11px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5));

  // Five INTERLOCKING tabs, the same chevron strip the profile panel uses -
  // that shape is what says "five days in a row" rather than "five separate
  // prizes". Each one is still its own container so the row can be brought
  // in a day at a time.
  const rowW = W - 32;
  const tabW = rowW / 5;
  const tabH = 116;
  const rowY = -14;
  const NOTCH = 8;
  /** Sized by its DRAWN width: 44px across, so it reads bigger than a coin. */
  const CRATE_ART = 44 / CRATE_DRAWN.width;
  /** The box the Credit artwork is normalised into, matching the crates. */
  const DAILY_ICON = 46;
  // The well the strip sits in. Recessed - dark fill, lit BOTTOM edge -
  // which is the inverse of the raised panel around it, and what makes the
  // tabs read as sitting inside something.
  const well = scene.add.graphics();
  well.fillStyle(Theme.bg, 0.55);
  well.fillRoundedRect(-rowW / 2 - 8, rowY - tabH / 2 - 10, rowW + 16, tabH + 20, 6);
  well.lineStyle(1, 0x000000, 0.35);
  well.lineBetween(-rowW / 2 - 2, rowY - tabH / 2 - 9, rowW / 2 + 2, rowY - tabH / 2 - 9);
  well.lineStyle(1, 0xffffff, 0.05);
  well.lineBetween(-rowW / 2 - 2, rowY + tabH / 2 + 9, rowW / 2 + 2, rowY + tabH / 2 + 9);
  card.add(well);

  const tabs: Phaser.GameObjects.Container[] = [];
  for (let index = 0; index < 5; index++) {
    const reward = dailyRewardFor(index + 1, level);
    const isActive = index === activeIndex;
    const isClaimed = index < claimedThrough;
    const accent = reward.kind === 'credits' ? Theme.currencyCredit : scene.crateAccent(reward.tier);
    const tab = scene.add.container(-rowW / 2 + tabW * index + tabW / 2, rowY);

    // Relative to the tab's own centre, so the containers can be tweened
    // independently and the chevrons still interlock.
    const l = -tabW / 2;
    const r = tabW / 2;
    const t = -tabH / 2;
    const b = tabH / 2;
    const pt = (x: number, y: number) => new Phaser.Geom.Point(x, y);
    const points = index === 0
      ? [pt(l, t), pt(r - NOTCH, t), pt(r, 0), pt(r - NOTCH, b), pt(l, b)]
      : index === 4
        ? [pt(l + NOTCH, t), pt(r, t), pt(r, b), pt(l + NOTCH, b), pt(l, 0)]
        : [pt(l + NOTCH, t), pt(r - NOTCH, t), pt(r, 0), pt(r - NOTCH, b), pt(l + NOTCH, b), pt(l, 0)];

    // The chevron's left and right edges at a given y. The notch runs from
    // the corners to the vertical midpoint, so both edges are a straight
    // interpolation - which is what lets a horizontal band be clipped to the
    // shape exactly, instead of a rectangle laid over it. The previous
    // "highlight" was a rectangle-ish polygon built by filtering the
    // outline's points, which cut a shape that was not the tab.
    const edgesAt = (yy: number): [number, number] => {
      // 1 at the tips, 0 at the waist - the notch is fully open at the top
      // and bottom edges and closed at the point.
      const u = Math.min(1, Math.abs(yy) / (tabH / 2));
      const leftNotch = index === 0 ? 0 : NOTCH;
      const rightNotch = index === 4 ? 0 : NOTCH;
      return [l + leftNotch * u, r - rightNotch * u];
    };

    const plate = scene.add.graphics();
    // Dropped copy first: the tab is a raised key, not a printed shape.
    plate.fillStyle(0x000000, 0.4);
    plate.fillPoints(points.map((q) => pt(q.x, q.y + 4)), true);
    plate.fillStyle(isActive ? accent : Theme.bgElevated, isActive ? 0.26 : 1);
    plate.fillPoints(points, true);

    // A REFLECTION, built as horizontal bands clipped to the chevron: bright
    // at the top edge, falling away through the upper half, then a matching
    // dark ramp rising off the bottom. Sixteen bands is enough that the
    // steps are invisible at this size, and it is the only way to get a
    // gradient into an arbitrary polygon - `fillGradientStyle` reaches rects
    // and triangles only.
    const BANDS = 16;
    for (let i = 0; i < BANDS; i++) {
      const y0 = t + (tabH * i) / BANDS;
      const y1 = t + (tabH * (i + 1)) / BANDS;
      const f = i / (BANDS - 1);
      const [l0, r0] = edgesAt(y0);
      const [l1, r1] = edgesAt(y1);
      const quad = [pt(l0, y0), pt(r0, y0), pt(r1, y1), pt(l1, y1)];
      if (f < 0.5) {
        // Specular fall-off from the top edge. Squared, so the brightest
        // part is a thin band at the very top rather than a wash over the
        // whole upper half - which is what made the old one look painted on.
        const a = (1 - f * 2) ** 2 * (isActive ? 0.16 : 0.1);
        plate.fillStyle(0xffffff, a);
      } else {
        plate.fillStyle(0x000000, ((f - 0.5) * 2) ** 2 * 0.3);
      }
      plate.fillPoints(quad, true);
    }

    // Bevel: a lit inner edge just inside the top of the outline and a dark
    // one inside the bottom, both following the chevron rather than running
    // straight across it.
    const [bl, br] = edgesAt(t + 2);
    plate.lineStyle(1.5, 0xffffff, isActive ? 0.3 : 0.16);
    plate.lineBetween(bl + 2, t + 2, br - 2, t + 2);
    const [dl, dr] = edgesAt(b - 2);
    plate.lineStyle(1.5, 0x000000, 0.35);
    plate.lineBetween(dl + 2, b - 2, dr - 2, b - 2);

    if (isActive) {
      // The one tab that matters gets a halo, not just a brighter border.
      plate.lineStyle(4, accent, 0.22);
      plate.strokePoints(points, true);
    }
    plate.lineStyle(isActive ? 2 : 1, isActive ? accent : Theme.borderOnDark, isActive ? 1 : 0.9);
    plate.strokePoints(points, true);
    tab.add(plate);

    // HORIZONTAL CENTRING, from the tab's real shape rather than a flat
    // nudge. A middle tab is notched on BOTH sides, so it is symmetric and
    // wants no offset at all; only the two end tabs are lopsided - the
    // first is flat on its left and notched on its right, so its mass sits
    // left of the geometric centre, and the last is the mirror of that.
    // The old `index === 0 ? -2 : 2` pushed all three middle tabs right for
    // no reason.
    const nudge = index === 0 ? -NOTCH / 4 : index === 4 ? NOTCH / 4 : 0;
    tab.add(scene.add.text(nudge, -tabH / 2 + 14, index === 4 ? 'DAY 5+' : `DAY ${index + 1}`, {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '11px', fontStyle: 'bold',
      color: hex(isActive ? accent : Theme.textOnDarkMuted)
    }).setOrigin(0.5));

    // `drawCrate`'s `s` is NOT its drawn size - the front face is a
    // fraction of it - so a crate is asked for through CRATE_DRAWN. It
    // centres itself, so there is no offset to apply.
    const iconX = nudge;
    // Vertically centred in the band the label and the value line leave
    // behind. The label sits at -44 and reaches -37; the value sits at +42
    // and starts at +33; so the free space runs -37 to +33 and its middle
    // is -2. The art was pinned at -4 to -12 and rode high in every tab.
    const iconY = -2;
    if (reward.kind === 'credits') {
      // Day 1 is the single Credit - the family's tier 1, which is the SVG
      // mark rather than a drawn silhouette - and day 2 is the Credit Stack,
      // tier 3. One coin against a stack is the whole statement.
      if (index === 0) {
        const coin = currencyIcon(scene, 'credit', 38).setPosition(iconX, iconY);
        if (isClaimed) coin.setAlpha(0.45);
        tab.add(coin);
      } else {
        // Twin Credits, the family's tier 2 - the same pair the board draws,
        // through the shared cluster so there is one definition of what a
        // pair of coins looks like.
        // The cluster's marks carry their own downward offsets - +8 and +4
        // at this box size - so the pair is lifted by their midpoint to put
        // the PAIR's centre on the line, not the first coin's.
        for (const { art, gloss } of buildCurrencyCluster(scene, 'credit', 2, DAILY_ICON * 1.35)) {
          for (const part of [art, gloss]) {
            part.setPosition(part.x + iconX, part.y + iconY - 6.2);
            if (isClaimed) part.setAlpha(part.alpha * 0.45);
            tab.add(part);
          }
        }
      }
    } else {
      const crate = scene.add.graphics()
        .setPosition(iconX, iconY)
        .setAlpha(isClaimed ? 0.45 : 1);
      drawCrate(crate, CRATE_ART, reward.tier);
      tab.add(crate);
    }

    // Unopened days show '?': their Credit value is only fixed when the day
    // rolls over and is priced at the level reached by then.
    // A crate day carries no figure: the crate IS the statement, and the
    // tier word under it was both redundant and the widest text in a 70px
    // tab. Only the Credit days print a number - or '?' when the day has
    // not opened and its value is not fixed yet.
    const unopened = index > activeIndex;
    const valueLine = isClaimed
      ? '✓'
      : reward.kind !== 'credits' ? ''
        : unopened ? '?' : String(reward.credits);
    if (valueLine) {
      tab.add(scene.add.text(nudge, tabH / 2 - 16, valueLine, {
        resolution: textResolution,
        fontFamily: valueLine === '✓' ? Theme.fontHeading : Theme.fontNumeric,
        fontSize: '14px', fontStyle: 'bold',
        color: hex(isClaimed ? Theme.accentGreen : isActive ? Theme.textOnDark : Theme.textOnDarkMuted)
      }).setOrigin(0.5));
    }

    card.add(tab);
    tabs.push(tab);
  }

  const claimW = 208;
  const claimH = 44;
  const claimY = H / 2 - 44;
  const claimBtn = scene.add.container(0, claimY);
  const claimBg = scene.add.graphics();
  // A seated key: a dark plinth under it, a lit top face, a shadowed lower
  // edge. A flat filled rectangle was the flattest thing on the panel, on
  // the one control the player is meant to reach for.
  claimBg.fillStyle(0x000000, 0.4);
  claimBg.fillRoundedRect(-claimW / 2, -claimH / 2 + 4, claimW, claimH, Theme.radiusChip);
  claimBg.fillGradientStyle(
    Theme.currencyCredit, Theme.currencyCredit,
    materialLighting(Theme.currencyCredit, 5).dark, materialLighting(Theme.currencyCredit, 5).dark, 1
  );
  claimBg.fillRoundedRect(-claimW / 2, -claimH / 2, claimW, claimH, Theme.radiusChip);
  claimBg.lineStyle(1, 0xffffff, 0.32);
  claimBg.lineBetween(-claimW / 2 + 4, -claimH / 2 + 1.5, claimW / 2 - 4, -claimH / 2 + 1.5);
  claimBg.lineStyle(1, 0x000000, 0.35);
  claimBg.lineBetween(-claimW / 2 + 4, claimH / 2 - 1.5, claimW / 2 - 4, claimH / 2 - 1.5);
  const claimLabel = scene.add.text(0, 0, 'CLAIM', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '17px', fontStyle: 'bold', color: hex(Theme.bg)
  }).setOrigin(0.5).setLetterSpacing(2);
  const claimZone = scene.add.zone(0, 0, claimW, claimH).setInteractive({ useHandCursor: true });
  claimBtn.add([claimBg, claimLabel, claimZone]);
  card.add(claimBtn);

  const closeBtn = scene.add.text(W / 2 - 22, -H / 2 + 22, '✕', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '18px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  card.add(closeBtn);

  // ---- the way in ----
  //
  // Scale and fade from the centre, then the days light up in sequence.
  // A daily reward that simply APPEARS reads as an error dialog; the
  // sequence is what makes it read as something being handed over.
  card.setScale(0.86).setAlpha(0);
  tabs.forEach((tab) => tab.setScale(0.6).setAlpha(0));
  claimBtn.setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: 1, duration: 220, ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
  tabs.forEach((tab, index) => {
    scene.tweens.add({
      targets: tab, scale: 1, alpha: 1,
      delay: 220 + index * 70, duration: 220, ease: 'Back.easeOut'
    });
  });
  scene.tweens.add({ targets: claimBtn, alpha: 1, delay: 560, duration: 200 });

  let closing = false;
  const dismiss = (): void => {
    if (closing) return;
    closing = true;
    scene.tweens.add({ targets: dim, alpha: 0, duration: 140 });
    scene.tweens.add({
      targets: card, scale: 0.92, alpha: 0, duration: 140, ease: 'Sine.easeIn',
      onComplete: () => {
        dim.destroy();
        card.destroy();
        scene.modalOpen = false;
      }
    });
  };
  dim.on('pointerdown', () => scene.time.delayedCall(0, dismiss));
  closeBtn.on('pointerdown', () => scene.time.delayedCall(0, dismiss));

  let claiming = false;
  claimZone.on('pointerup', () => scene.time.delayedCall(0, () => {
    if (claiming || closing) return;
    claiming = true;
    const claimNow = Date.now();
    const claimed = claimDaily(scene.rewards, claimNow, scene.dailyLevel(claimNow));
    if (!claimed) {
      dismiss();
      return;
    }
    if (claimed.kind === 'credits') {
      addCoins(scene.economy, claimed.credits);
      scene.updateCurrencyText();
      floatingScore(scene, cx, cy + rowY, claimed.credits, 'CR');
    } else {
      scene.awardCrate(claimed.tier, `DAILY SUPPLY  ·  DAY ${claimed.dayLabel}`, { x: cx, y: cy + rowY });
    }
    scene.updateLevelBadge();
    scene.saveState();
    dismiss();
  }));
}
