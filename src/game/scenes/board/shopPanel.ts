import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import {
  SHOP_CARD_FOOTER,
  SHOP_CARD_HEADER,
  SHOP_SLOT_HEIGHT,
  spawnerPieceLabel,
  type ShopMode
} from './config';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import {
  CURRENCY_COLOR,
  applyCurrencyIcon,
  currencyChipOptions,
  currencyPill,
  type CurrencyKind
} from '../../ui/CurrencyGlyph';
import { drawCrate, drawTierIcon, iconPresentation } from '../../objects/TierIcons';
import { drawSpawnerPieceIcon } from '../../objects/SpawnerPieceView';
import { drawSplitterIcon } from '../../objects/SplitterView';
import { getTierDef } from '../../data/chains';
import { playerLevel } from '../../levels/Orders';
import { COIN_PACKS, GEM_PACKS, formatCountdown, purchaseCoinPack, purchaseGemPack } from '../../economy/Economy';
import { spendCoinsGeneric, spendGems } from '../../economy/Economy';
import { CRATE_LABELS } from '../../rewards/Rewards';
import {
  SHOP_SLOTS,
  REROLL_COST_GEMS,
  coinRerollCost,
  markOfferSold,
  msUntilShopRefresh,
  normalizeShopState,
  refreshIfDue,
  rerollShopRow,
  specialRerollCost,
  type ShopRowKey
} from '../../shop/Shop';
import {
  SUPPLY_CRATES,
  SUPPLY_CRATE_MIN_LEVEL,
  formatCrateWait,
  supplyCooldownRemaining,
  supplyCratePrice,
  supplyCrateReady
} from '../../shop/SupplyCrates';

/**
 * The shop panel, lifted out of BoardScene whole.
 *
 * Every method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten. The members these reach for had to stop
 * being `private`, which is the real cost of splitting a Phaser scene that
 * grew to nine thousand lines; the alternative was leaving it there.
 */

export function openShop(scene: BoardScene, mode: ShopMode = scene.shopMode): void {
  if (scene.shopOverlay || scene.modalOpen || scene.inputLocked) return;
  scene.shopMode = mode;
  scene.modalOpen = true;
  const typeIds = scene.availableShopTypeIds();
  // normalizeShopState also drops rows holding a family the player hasn't
  // unlocked yet, which reconcileOffers used to do separately.
  scene.shopState = normalizeShopState(
    scene.shopState, typeIds, Date.now(), scene.collection.discovered, scene.specialShopTypeIds()
  );
  refreshIfDue(scene.shopState, Date.now(), typeIds, scene.collection.discovered, scene.specialShopTypeIds());
  scene.saveState();

  const overlay = scene.add.container(0, 0).setDepth(3000);
  scene.shopOverlay = overlay;

  const dim = scene.add.rectangle(
    scene.scale.width / 2, scene.scale.height / 2,
    scene.scale.width, scene.scale.height,
    0x000000, 0.6
  ).setInteractive();
  dim.on('pointerdown', () => scene.time.delayedCall(0, () => closeShop(scene)));

  const focused = mode !== 'full';
  const panelW = Math.min(scene.scale.width - 40, 420);
  // The panel now takes as much height as the viewport allows and its
  // content SCROLLS, so spacing no longer has to be squeezed to fit a
  // fixed box. Sections can breathe evenly and a fourth section could be
  // added without re-tuning every gap above it.
  const panelH = Math.min(scene.scale.height - 24, focused ? 420 : 620);
  const panelX = scene.scale.width / 2;
  const panelY = scene.scale.height / 2;

  const panelBg = scene.add.graphics();
  panelBg.fillStyle(Theme.bgElevated, 1);
  panelBg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, Theme.radiusPanel);
  panelBg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
  panelBg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, Theme.radiusPanel);
  // Swallows taps that land on the panel itself. Without it a press on any
  // bare part of the shop - the gap beside a card, the header, the space
  // under the last row - fell through to the backdrop behind and closed the
  // whole thing. Only the X and a tap OUTSIDE the panel close it now.
  const panelCatcher = scene.add.zone(panelX, panelY, panelW, panelH)
    .setInteractive({ useHandCursor: false });

  const panelTitle = mode === 'coin' ? 'CREDITS' : mode === 'gem' ? 'GEMS' : 'SHOP';
  const title = scene.add.text(panelX, panelY - panelH / 2 + 20, panelTitle, {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '20px', fontStyle: 'bold', color: hex(Theme.textOnDark)
  }).setOrigin(0.5);

  const closeBtn = scene.add.text(panelX + panelW / 2 - 24, panelY - panelH / 2 + 24, '✕', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '18px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  closeBtn.on('pointerdown', () => scene.time.delayedCall(0, () => closeShop(scene)));

  overlay.add([dim, panelBg, panelCatcher, title, closeBtn]);

  // Sits in the gap the title already leaves above the first section, so
  // showing it never reflows the rows below.
  if (scene.shopNotice) {
    const notice = scene.add.text(panelX, panelY - panelH / 2 + 36, scene.shopNotice.text, {
      resolution: textResolution,
      fontFamily: Theme.fontMono, fontSize: '12px', fontStyle: 'bold',
      color: hex(scene.shopNotice.error ? Theme.danger : Theme.accentAmber)
    }).setOrigin(0.5);
    overlay.add(notice);
  }

  // Everything laid out by the cursor below goes into `content`, which is
  // masked to the panel's middle band and scrolls. The title, close
  // button, notice, and footer stay on `overlay` so they never scroll away.
  const content = scene.add.container(0, 0);
  overlay.add(content);

  // Shared scroll state. Declared up here because the buttons built below
  // need to read `moved` to tell a tap from a drag, and they are created
  // before the scroll wiring at the bottom of this method.
  const scrollHandlers = {
    dragging: false,
    startY: 0,
    startScroll: 0,
    moved: 0,
    apply: (_value: number): void => {}
  };
  /** True when the pointer barely moved, i.e. this was a tap and not a scroll drag. */
  const wasTap = (): boolean => scrollHandlers.moved <= 6;

  const viewTop = panelY - panelH / 2 + 44;
  const viewBottom = panelY + panelH / 2 - (focused ? 30 : 26);

  // Laid out with a running vertical cursor rather than the absolute
  // offsets this used before - two offer rows plus two pack rows is
  // enough content that hand-tuned constants drift out of sync the
  // moment any block changes height.
  const cursorStart = viewTop + 18;
  let cursor = cursorStart;
  const left = panelX - panelW / 2 + 20;
  const innerW = panelW - 40;
  // The countdown is now left-aligned under its own section header, so it
  // no longer has to be re-centred against a price glyph every tick - it
  // just re-reads its own text.
  const shopCountdownRows: Array<{ key: ShopRowKey; text: Phaser.GameObjects.Text }> = [];
  const REROLL_GLYPH = 17;

  /**
   * THE SHOP HAS TWO KINDS OF SHELF, and until now they looked identical.
   *
   * Rotating STOCK - the credit, gem and special offers - is three cards
   * that are gone in a few hours, and the whole reason to look at it is
   * that it changed. A permanent CATALOGUE - supply crates, credit packs,
   * gem packs - is the same shelf every day, read by price. Giving both the
   * same banner and the same card grid meant nothing on the panel said
   * which was which, or which one was worth scrolling back to.
   *
   * So: stock keeps the centred banner plaque and the card grid, and gains
   * its refresh clock directly under the header, where the rotation is
   * claimed. Catalogue gets a plain left-aligned label with a rule running
   * off it, and full-width list rows - the shape of a price list, not of a
   * shelf that turns over.
   */
  const sectionHeader = (label: string, color: number): void => {
    const text = scene.add.text(panelX, cursor, label, {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '13px', fontStyle: 'bold', color: hex(color)
    }).setOrigin(0.5).setLetterSpacing(1.5);

    const bw = Math.min(innerW - 44, text.width + 44);
    const banner = drawSectionBanner(scene, panelX, cursor, bw, color);

    // Faint rules out to the panel edges, so every stock header occupies
    // the same full width regardless of how long its label is.
    const edge = bw / 2 + 24;
    banner.lineStyle(1, color, 0.22);
    banner.lineBetween(left, cursor, panelX - edge, cursor);
    banner.lineBetween(panelX + edge, cursor, left + innerW, cursor);

    content.add(banner);
    content.add(text);
    cursor += 30;
  };

  /**
   * The recessed ground each section sits on, drawn AFTER its rows (their
   * height is only known once laid out) and pushed to the back. Without it
   * the panel was one continuous dark field with things floating on it, and
   * nothing said where one shelf ended and the next began.
   */
  const sectionGround = (top: number, color: number, solid: boolean): void => {
    const g = scene.add.graphics();
    g.fillStyle(Theme.bg, solid ? 0.55 : 0.3);
    g.fillRoundedRect(left - 9, top, innerW + 18, cursor - top, 6);
    g.lineStyle(1, color, solid ? 0.35 : 0.18);
    g.strokeRoundedRect(left - 9, top, innerW + 18, cursor - top, 6);
    // Lit top edge, one light, as everywhere.
    g.lineStyle(1, 0xffffff, 0.05);
    g.lineBetween(left - 3, top + 1.5, left + innerW + 3, top + 1.5);
    content.addAt(g, 0);
  };

  const offerRow = (key: ShopRowKey): void => {
    const slotW = innerW / SHOP_SLOTS;
    for (let i = 0; i < SHOP_SLOTS; i++) {
      buildOfferSlot(scene, content, left + slotW * i + slotW / 2, cursor, slotW - 10, key, i, wasTap);
    }
    cursor += SHOP_SLOT_HEIGHT + 12;
  };

  /**
   * The line that makes a stock section a stock section: how long this
   * shelf has left, and a button to pay for the next one now. It sits
   * ABOVE the cards, under the header, because it describes the whole row
   * rather than trailing off the end of it - and the reroll is a real
   * button on the right rather than a run of tappable text, which never
   * looked pressable.
   */
  const stockMeta = (
    key: ShopRowKey,
    cost: number,
    kind: CurrencyKind,
    color: number,
    onReroll: () => boolean
  ): void => {
    const clock = scene.add.text(
      left, cursor + 11,
      `REFRESH IN ${formatCountdown(msUntilShopRefresh(scene.shopState, key))}`,
      { resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '12px', color: hex(Theme.textOnDarkMuted) }
    ).setOrigin(0, 0.5);
    shopCountdownRows.push({ key, text: clock });
    content.add(clock);

    const verb = scene.add.text(0, cursor + 11, 'REROLL', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold', color: hex(color)
    }).setOrigin(0, 0.5).setLetterSpacing(0.5);
    const price = scene.add.text(0, cursor + 11, String(cost), {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: '13px', fontStyle: 'bold', color: hex(color)
    }).setOrigin(0, 0.5);
    const mark = scene.add.image(0, 0, 'currency-coin');
    applyCurrencyIcon(mark, kind, REROLL_GLYPH, color);

    const btnW = verb.width + 8 + price.width + 3 + REROLL_GLYPH + 20;
    const btnX = left + innerW - btnW;
    const btn = scene.add.graphics();
    btn.fillStyle(Theme.bg, 0.7);
    btn.fillRoundedRect(btnX, cursor - 1, btnW, 24, Theme.radiusChip);
    btn.lineStyle(1, color, 0.65);
    btn.strokeRoundedRect(btnX, cursor - 1, btnW, 24, Theme.radiusChip);
    verb.setX(btnX + 10);
    price.setX(btnX + 10 + verb.width + 8);
    mark.setPosition(price.x + price.width + 3 + REROLL_GLYPH / 2, cursor + 11);
    const hit = scene.add.zone(btnX + btnW / 2, cursor + 11, btnW, 26).setInteractive({ useHandCursor: true });
    content.add([btn, verb, price, mark, hit]);

    hit.on('pointerup', () => {
      if (!wasTap()) return;
      if (!onReroll()) return;
      rerollShopRow(
        scene.shopState, key,
        key === 'special' ? scene.specialShopTypeIds() : scene.availableShopTypeIds(),
        Date.now(), scene.collection.discovered
      );
      scene.updateCurrencyText();
      scene.saveState();
      reopenShop(scene, null);
    });
    cursor += 30;
  };

  /**
   * A shelf card that is not a merge offer: a supply crate or a currency
   * pack. Same silhouette, same footer, same price chip as the rotating
   * offers - the store has ONE card, and what changes between shelves is
   * what is drawn on it, never the shape of it.
   */
  const shelfCard = (
    cx: number,
    w: number,
    accent: number,
    art: (x: number, y: number) => Phaser.GameObjects.GameObject,
    title: string,
    sub: string,
    price: { value: string; kind: CurrencyKind | null; color: number },
    enabled: boolean,
    solidHeader: boolean,
    onBuy: (bx: number, by: number) => void,
    titleSize = 12
  ): void => {
    const h = SHOP_SLOT_HEIGHT;
    const top = cursor;
    content.add(drawShopCard(scene, 
      cx - w / 2, top, w, h, enabled ? accent : Theme.borderOnDark,
      { footer: SHOP_CARD_FOOTER, solidHeader, header: solidHeader ? 0 : SHOP_CARD_HEADER }
    ));

    content.add(scene.add.text(cx, top + (solidHeader ? 15 : SHOP_CARD_HEADER / 2 + 1), title, {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: `${titleSize}px`, fontStyle: 'bold',
      color: hex(enabled ? Theme.textOnDark : Theme.textOnDarkMuted),
      align: 'center', wordWrap: { width: w - 10 }, lineSpacing: 1
    }).setOrigin(0.5).setLetterSpacing(0.5));

    const artObj = art(cx, top + 64) as Phaser.GameObjects.GameObject
      & Partial<Phaser.GameObjects.Components.Alpha>;
    if (!enabled) artObj.setAlpha?.(0.45);
    content.add(artObj);

    if (sub) {
      content.add(scene.add.text(cx, top + h - SHOP_CARD_FOOTER - 12, sub, {
        resolution: textResolution,
        fontFamily: Theme.fontMono, fontSize: '11px', color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5));
    }

    const priceColor = enabled ? price.color : Theme.textOnDarkMuted;
    const priceY = top + h - SHOP_CARD_FOOTER / 2;
    if (price.kind) {
      const pill = currencyPill(scene, price.value, price.kind, {
        fontSize: 15, iconSize: 28, height: 22, padX: 9, ...currencyChipOptions(price.kind)
      }).setPosition(cx, priceY);
      if (!enabled) pill.setAlpha(0.5);
      content.add(pill);
    } else {
      // Real money carries no glyph, so it gets a filled button instead -
      // the one place in the shop where the price IS the product.
      const label = scene.add.text(cx, priceY, price.value, {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric, fontSize: '16px', fontStyle: 'bold', color: hex(Theme.textOnDark)
      }).setOrigin(0.5);
      const bw = label.width + 26;
      const btn = scene.add.graphics();
      btn.fillStyle(priceColor, enabled ? 0.9 : 0.3);
      btn.fillRoundedRect(cx - bw / 2, priceY - 11, bw, 22, Theme.radiusChip);
      btn.lineStyle(1, 0xffffff, 0.18);
      btn.lineBetween(cx - bw / 2 + 3, priceY - 10, cx + bw / 2 - 3, priceY - 10);
      content.add([btn, label]);
      content.bringToTop(label);
    }

    // The hit zone is built WHETHER OR NOT the card looks buyable, exactly
    // as an offer slot's is. Creating it only when affordable meant a card
    // the player could not use swallowed the tap silently - and any
    // disagreement between what dims a card and what enables its zone showed
    // up as a card that simply refused to respond, with nothing on screen
    // explaining it.
    const zone = scene.add.zone(cx, top + h / 2, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => scene.time.delayedCall(0, () => {
      if (!wasTap()) return;
      onBuy(cx, top + h / 2);
    }));
    content.add(zone);
  };

  /** Lays a set of shelf cards across the panel on the offer row's grid. */
  const shelfRow = (count: number, build: (cx: number, w: number, i: number) => void): void => {
    const slotW = innerW / count;
    for (let i = 0; i < count; i++) build(left + slotW * i + slotW / 2, slotW - 10, i);
    cursor += SHOP_SLOT_HEIGHT + 12;
  };

  if (mode !== 'gem') {
    const top = cursor - 16;
    sectionHeader('BUY WITH CREDITS', Theme.currencyCredit);
    const coinCost = coinRerollCost(scene.shopState);
    stockMeta('coin', coinCost, 'credit', Theme.currencyCredit, () =>
      spendCoinsGeneric(scene.economy, coinCost)
    );
    offerRow('coin');
    sectionGround(top, Theme.currencyCredit, false);
  }

  /**
   * The recurring Credit sink.
   *
   * Sits under BUY WITH CREDITS rather than in its own tab because it is
   * the same question - what do I do with Credits - and the answer should
   * be one scroll, not two places to look.
   */
  const supplyRow = (): void => {
    // Each tier restocks on its own clock now, so the shelf has no single
    // state to report - the line says the rule and each card says its own
    // wait.
    content.add(scene.add.text(left, cursor + 11, 'OPENS IMMEDIATELY  ·  EACH TIER RESTOCKS ON ITS OWN', {
      resolution: textResolution, fontFamily: Theme.fontMono, fontSize: '12px',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0, 0.5));
    cursor += 30;

    shelfRow(SUPPLY_CRATES.length, (cx, w, i) => {
      const offer = SUPPLY_CRATES[i];
      const price = supplyCratePrice(offer, playerLevel(scene.orderState));
      const cooling = supplyCooldownRemaining(scene.supplyTierCooldown(offer.tier), Date.now());
      const buyable = scene.economy.coins >= price
        && cooling === 0
        && scene.firstFreeCellInReadingOrder() != null;
      shelfCard(
        cx, w, Theme.currencyCredit,
        (x, y) => {
          const art = scene.add.graphics();
          drawCrate(art, 52, offer.tier);
          return art.setPosition(x, y);
        },
        `${offer.tier.toUpperCase()} CRATE`,
        // The card carries its own countdown while it is restocking, so a
        // dimmed card explains itself rather than needing a tap to find out.
        cooling > 0 ? `RESTOCKING  ·  ${formatCrateWait(cooling)}` : `RESTOCK ${formatCrateWait(offer.cooldownMs)}`,
        { value: price.toLocaleString(), kind: 'credit', color: CURRENCY_COLOR.credit },
        buyable,
        false,
        (bx, by) => {
          // The refusal has to be said INSIDE the panel. `buySupplyCrate`
          // writes its reasons to the action tray, which lives at the bottom
          // of the board - behind the shop - so a player tapping a crate got
          // a card that did nothing and an explanation they could not see.
          // The offer slots have always used the shop's own notice line;
          // this is that, for the same three gates the purchase enforces.
          const now = Date.now();
          const price = supplyCratePrice(offer, playerLevel(scene.orderState));
          if (scene.economy.coins < price) {
            reopenShop(scene, { text: `NOT ENOUGH CREDITS  ·  NEEDS ${price.toLocaleString()}`, error: true });
            return;
          }
          if (!supplyCrateReady(scene.supplyTierCooldown(offer.tier), now)) {
            reopenShop(scene, {
              text: `${CRATE_LABELS[offer.tier]} RESTOCKING  ·  ${formatCrateWait(supplyCooldownRemaining(scene.supplyTierCooldown(offer.tier), now))}`,
              error: true
            });
            return;
          }
          if (!scene.firstFreeCellInReadingOrder()) {
            reopenShop(scene, { text: 'BOARD FULL  ·  MAKE SPACE FIRST', error: true });
            return;
          }
          // Bought from this card, so the crate flies from here. Close on
          // success so the flight is visible.
          if (scene.buySupplyCrate(offer, { x: bx, y: by })) closeShop(scene);
          else reopenShop(scene, null);
        }
      );
    });
  };

  // Hidden below SUPPLY_CRATE_MIN_LEVEL: the store answers "what do I do
  // with surplus Credits", and a player without a surplus is not helped by
  // a shelf they cannot use.
  if (mode !== 'gem' && playerLevel(scene.orderState) >= SUPPLY_CRATE_MIN_LEVEL) {
    cursor += 22;
    const top = cursor - 16;
    sectionHeader('SUPPLY CRATES', Theme.currencyCredit);
    supplyRow();
    sectionGround(top, Theme.currencyCredit, false);
  }

  if (mode === 'full') cursor += 22;
  if (mode !== 'coin') {
    const top = cursor - 16;
    sectionHeader('BUY WITH GEMS', Theme.currencyGem);
    stockMeta('gem', REROLL_COST_GEMS, 'gem', Theme.currencyGem, () =>
      spendGems(scene.economy, REROLL_COST_GEMS)
    );
    offerRow('gem');
    sectionGround(top, Theme.currencyGem, false);
  }

  if (mode === 'full') {
    cursor += 22;
    const top = cursor - 16;
    sectionHeader('SPECIAL ITEMS', Theme.currencyGem);
    const specialCost = specialRerollCost(scene.shopState);
    stockMeta('special', specialCost, 'gem', Theme.currencyGem, () =>
      spendGems(scene.economy, specialCost)
    );
    offerRow('special');
    sectionGround(top, Theme.currencyGem, false);
  }

  /**
   * The currency packs. Same card, same grid, same footer as every other
   * shelf - they are allowed ONE deviation, and it is tone: a filled header
   * strip, a solid price button, and a heavier ground under the section.
   * These are the rows that take real money, and they should read as a
   * storefront rather than as today's stock.
   */
  const packRow = <T extends { id: string }>(
    title: string,
    accent: number,
    kind: CurrencyKind,
    packs: T[],
    amountOf: (pack: T) => string,
    priceOf: (pack: T) => { value: string; kind: CurrencyKind | null; color: number },
    onBuy: (pack: T) => boolean
  ): void => {
    cursor += 22;
    const top = cursor - 16;
    sectionHeader(title, accent);
    shelfRow(packs.length, (cx, w, i) => {
      const pack = packs[i];
      shelfCard(
        cx, w, accent,
        (x, y) => {
          const mark = scene.add.image(0, 0, 'currency-coin');
          applyCurrencyIcon(mark, kind, 46);
          return mark.setPosition(x, y);
        },
        amountOf(pack),
        '',
        priceOf(pack),
        true,
        true,
        () => {
          // A credit pack can fail (not enough gems); a gem pack cannot.
          // Say so either way rather than leaving a dead-looking card.
          if (!onBuy(pack)) {
            reopenShop(scene, { text: 'NOT ENOUGH GEMS FOR THAT PACK', error: true });
            return;
          }
          scene.updateCurrencyText();
          scene.saveState();
          reopenShop(scene, null);
        },
        // The amount IS the product on these cards, so it is set at the
        // shelf-title size rather than the item-name size.
        15
      );
    });
    sectionGround(top, accent, true);
  };

  if (mode !== 'gem') {
    packRow(
      'GET CREDITS', Theme.currencyCredit, 'credit', COIN_PACKS,
      (pack) => pack.coins.toLocaleString(),
      (pack) => ({ value: String(pack.gems), kind: 'gem', color: Theme.currencyGem }),
      (pack) => purchaseCoinPack(scene.economy, pack.id)
    );
  }
  if (mode !== 'coin') {
    packRow(
      'GET GEMS', Theme.currencyGem, 'gem', GEM_PACKS,
      (pack) => pack.gems.toLocaleString(),
      (pack) => ({ value: pack.priceLabel, kind: null, color: Theme.realMoney }),
      (pack) => purchaseGemPack(scene.economy, pack.id)
    );
  }

  // ---- Scrolling ----
  //
  // Content is masked to the panel's middle band and dragged vertically.
  // The mask is a world-space shape, so it stays put while `content.y`
  // moves; it is NOT on the display list, hence the explicit destroy in
  // the cleanup below.
  const viewH = viewBottom - viewTop;
  const contentH = cursor - cursorStart;
  const maxScroll = Math.max(0, contentH - viewH + 10);

  const maskShape = scene.make.graphics({});
  maskShape.fillStyle(0xffffff);
  maskShape.fillRect(panelX - panelW / 2, viewTop, panelW, viewH);
  content.setMask(maskShape.createGeometryMask());

  let scroll = 0;

  // Scroll affordance: a thin track + thumb, only drawn when there is
  // actually something to scroll to.
  let drawThumb: () => void = () => {};
  if (maxScroll > 0) {
    const trackX = panelX + panelW / 2 - 9;
    const trackTop = viewTop + 4;
    const trackH = viewH - 8;
    const thumbH = Math.max(24, trackH * (viewH / contentH));
    const track = scene.add.graphics();
    track.fillStyle(Theme.bg, 0.5);
    track.fillRoundedRect(trackX, trackTop, 4, trackH, 2);
    overlay.add(track);
    const thumb = scene.add.graphics();
    overlay.add(thumb);
    drawThumb = () => {
      const t = scroll / maxScroll;
      thumb.clear();
      thumb.fillStyle(Theme.borderOnDark, 1);
      thumb.fillRoundedRect(trackX, trackTop + t * (trackH - thumbH), 4, thumbH, 2);
    };
    drawThumb();
  }

  scrollHandlers.apply = (value: number): void => {
    scroll = Phaser.Math.Clamp(value, 0, maxScroll);
    content.y = -scroll;
    drawThumb();
  };

  // Tap-vs-drag: buttons inside the scroll area fire on pointerUP and only
  // when the pointer barely moved, so dragging the list past a button
  // doesn't buy anything. `dragMoved` is reset on pointerdown only, so it
  // is still readable by a button's pointerup regardless of handler order.
  const onDown = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.y < viewTop || pointer.y > viewBottom) return;
    if (Math.abs(pointer.x - panelX) > panelW / 2) return;
    scrollHandlers.dragging = true;
    scrollHandlers.startY = pointer.y;
    scrollHandlers.startScroll = scroll;
    scrollHandlers.moved = 0;
  };
  const onMove = (pointer: Phaser.Input.Pointer): void => {
    if (!scrollHandlers.dragging) return;
    const dy = pointer.y - scrollHandlers.startY;
    scrollHandlers.moved = Math.max(scrollHandlers.moved, Math.abs(dy));
    scrollHandlers.apply(scrollHandlers.startScroll - dy);
  };
  const onUp = (): void => { scrollHandlers.dragging = false; };
  const onWheel = (
    _p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number
  ): void => scrollHandlers.apply(scroll + dy * 0.5);

  scene.input.on('pointerdown', onDown);
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('wheel', onWheel);

  scene.shopScrollCleanup = () => {
    scene.input.off('pointerdown', onDown);
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('wheel', onWheel);
    maskShape.destroy();
  };

  scene.shopCountdownUpdater = () => {
    let refreshDue = false;
    for (const row of shopCountdownRows) {
      const remaining = msUntilShopRefresh(scene.shopState, row.key);
      row.text.setText(`REFRESH IN ${formatCountdown(remaining)}`);
      if (remaining <= 0) refreshDue = true;
    }
    if (refreshDue) {
      refreshIfDue(
        scene.shopState, Date.now(), scene.availableShopTypeIds(), scene.collection.discovered, scene.specialShopTypeIds()
      );
      scene.saveState();
      reopenShop(scene, null);
    }
  };

  if (focused) {
    const fullStoreLink = scene.add.text(panelX, panelY + panelH / 2 - 16, 'VIEW FULL STORE  →', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: '13px',
      fontStyle: 'bold',
      color: hex(Theme.textOnDark)
    }).setOrigin(0.5).setLetterSpacing(1).setInteractive({ useHandCursor: true });
    fullStoreLink.on('pointerdown', () => scene.time.delayedCall(0, () => {
      closeShop(scene);
      scene.shopNotice = null;
      openShop(scene, 'full');
    }));
    overlay.add(fullStoreLink);
  } else {
    const iapNote = scene.add.text(
      panelX, panelY + panelH / 2 - 14,
      'Test build — gem packs credit instantly, no real payment yet',
      { resolution: textResolution, fontFamily: Theme.fontHeading, fontSize: '11px', color: hex(Theme.textOnDarkMuted) }
    ).setOrigin(0.5);
    overlay.add(iapNote);
  }
}

export function buildOfferSlot(scene: BoardScene, container: Phaser.GameObjects.Container, x: number, y: number, w: number, key: ShopRowKey, index: number, wasTap: () => boolean): void {
  const offer = scene.shopState[key].offers[index];
  const h = SHOP_SLOT_HEIGHT;

  const def = offer && (offer.kind === 'item' || offer.kind == null)
    ? getTierDef(offer.typeId, offer.tier)
    : undefined;
  const baseColor = def?.color ?? Theme.panelAlt;
  const accent = offer && !offer.sold
    ? (offer.priceCoins != null ? Theme.currencyCredit : Theme.currencyGem)
    : Theme.borderOnDark;
  container.add(drawShopCard(scene, x - w / 2, y, w, h, accent, offer && !offer.sold
    ? { footer: SHOP_CARD_FOOTER, header: SHOP_CARD_HEADER }
    : {}));

  if (!offer || offer.sold) {
    const soldText = scene.add.text(x, y + h / 2, 'SOLD', {
      resolution: textResolution,
      fontFamily: Theme.fontHeading, fontSize: '15px', fontStyle: 'bold',
      color: hex(Theme.textOnDarkMuted), align: 'center'
    }).setOrigin(0.5).setLetterSpacing(2);
    const backSoon = scene.add.text(x, y + h / 2 + 18, 'BACK SOON', {
      resolution: textResolution,
      fontFamily: Theme.fontMono, fontSize: '11px', color: hex(Theme.textOnDarkMuted), align: 'center'
    }).setOrigin(0.5).setAlpha(0.8);
    container.add([soldText, backSoon]);
    return;
  }

  const icon = scene.add.graphics();
  icon.setPosition(x, y + 40);
  // No contact shadow here, deliberately: this icon sits on a shop card,
  // not on the board, so it has no ground to cast onto. TileView is the
  // only caller that draws one (see drawTierIcon's shadow-ownership note).
  //
  // The size/ground-line transform IS applied, though - it is the same
  // object, and a Stone 1 that is a speck in the shop but board-sized on
  // the board would make the shop misrepresent what is being bought.
  const ICON_SIZE = 48;
  if (offer.kind === 'splitter') {
    drawSplitterIcon(icon, ICON_SIZE * 0.9);
    icon.setPosition(x, y + 64);
  } else if (offer.kind === 'spawner-piece') {
    drawSpawnerPieceIcon(icon, offer.typeId, offer.tier, ICON_SIZE * 0.92);
    icon.setPosition(x, y + 64);
  } else {
    const { materialAlpha } = drawTierIcon(icon, offer.typeId, offer.tier, ICON_SIZE, materialLighting(baseColor, offer.tier));
    icon.setAlpha(materialAlpha);
    const present = iconPresentation(offer.typeId, offer.tier, ICON_SIZE);
    icon.setScale(present.scale);
    icon.setPosition(x + present.offsetX, y + 64 + present.offsetY);
  }
  container.add(icon);

  // Name ABOVE the item, uppercase like every other label in the game.
  // Mixed-case Title Case was the only place in the build using it, and next
  // to the all-caps banners and prices around it that read as a different
  // product. Sitting below the icon it was also wedged against the price;
  // above it, the slot reads top to bottom as name, thing, cost.
  //
  // Centre-anchored so a two-word name grows both ways rather than downward
  // into the icon.
  const offerName = offer.kind === 'splitter'
    ? 'SPLITTER'
    : offer.kind === 'spawner-piece'
      ? spawnerPieceLabel(offer.typeId, offer.tier)
      : (def?.label ?? '?').toUpperCase();
  // 12px in a two-line band, tracked out slightly. At 11px on three lines
  // this was the smallest type in the game sitting on its most-read screen.
  const nameText = scene.add.text(x, y + SHOP_CARD_HEADER / 2 + 1, offerName.toUpperCase(), {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '12px', fontStyle: 'bold',
    color: hex(Theme.textOnDark),
    align: 'center', wordWrap: { width: w - 10 }, lineSpacing: 1
  }).setOrigin(0.5, 0.5).setLetterSpacing(0.5);
  container.add(nameText);

  const priceKind: CurrencyKind = offer.priceCoins != null ? 'credit' : 'gem';
  // Same buy pill the inventory's slot unlock uses - a filled chip reads as
  // a button where a bare number read as a caption, and it is far easier to
  // pick out against the card art behind it.
  const priceText = currencyPill(
    scene,
    String(offer.priceCoins ?? offer.priceGems),
    priceKind,
    // Height 20 matches the HUD currency bars exactly, and the icon is
    // deliberately taller than the bar - overflowing it is the HUD's own
    // look, not an accident.
    { fontSize: 15, iconSize: 28, height: 22, padX: 9, ...currencyChipOptions(priceKind) }
  ).setPosition(x, y + h - SHOP_CARD_FOOTER / 2);
  container.add(priceText);

  // The whole card is the purchase target. The tap check still prevents a
  // scrolling gesture that starts on a card from buying it accidentally.
  const buyZone = scene.add.zone(x, y + h / 2, w, h)
    .setInteractive({ useHandCursor: true });
  container.add(buyZone);
  buyZone.on('pointerup', () => {
    if (!wasTap()) return;
    buyOffer(scene, key, index);
  });
}

export function buyOffer(scene: BoardScene, key: ShopRowKey, index: number): void {
  const offer = scene.shopState[key].offers[index];
  if (!offer || offer.sold) return;

  const empties = scene.grid.emptyCells();
  let paid = false;
  if (offer.priceCoins != null) {
    paid = spendCoinsGeneric(scene.economy, offer.priceCoins);
  } else if (offer.priceGems != null) {
    paid = spendGems(scene.economy, offer.priceGems);
  }
  if (!paid) {
    const needed = offer.priceCoins != null ? `${offer.priceCoins} CREDITS` : `${offer.priceGems} GEMS`;
    reopenShop(scene, { text: `NOT ENOUGH  ·  NEEDS ${needed}`, error: true });
    return;
  }

  if (offer.kind === 'splitter') {
    scene.enqueueForcedSpawn({ kind: 'splitter' });
  } else if (offer.kind === 'spawner-piece') {
    scene.enqueueForcedSpawn({ kind: 'spawner-piece', typeId: offer.typeId, tier: offer.tier });
  } else if (empties.length === 0) {
    scene.enqueueForcedSpawn({ kind: 'item', typeId: offer.typeId, tier: offer.tier });
  } else {
    const pos = empties[Math.floor(Math.random() * empties.length)];
    scene.placeTile(pos, offer.typeId, offer.tier, true);
  }
  markOfferSold(scene.shopState, key, index);
  scene.updateCurrencyText();
  scene.saveState();
  scene.refreshOrderBar();
  scene.checkDeadlock();
  // Shop stays open so the player can keep browsing/buying. The bought
  // slot rebuilds as SOLD and the header currency ticks down, so the
  // purchase still reads as having happened even though the item itself
  // lands on the board behind the panel.
  const label = offer.kind === 'splitter'
    ? 'SPLITTER'
    : offer.kind === 'spawner-piece'
      ? spawnerPieceLabel(offer.typeId, offer.tier).toUpperCase()
      : getTierDef(offer.typeId, offer.tier)?.label?.toUpperCase() ?? 'ITEM';
  reopenShop(scene, {
    text: `${label}  ·  ${empties.length === 0 ? 'ADDED TO VAULT' : 'ADDED TO BOARD'}`,
    error: false
  });
}

/** Rebuilds the shop panel in place, optionally carrying a one-line notice. */
export function reopenShop(scene: BoardScene, notice: { text: string; error: boolean } | null): void {
  closeShop(scene);
  scene.shopNotice = notice;
  openShop(scene, scene.shopMode);
}

/**
 * A hanging ribbon banner, drawn as vectors rather than a flat plaque:
 * two drooping swallowtail ends behind a raised centre panel, with a fold
 * wedge where each tail passes behind it. The tails and folds are filled
 * from the darker `bg` so they read as the ribbon's shaded reverse side,
 * which is what gives the shape depth without any bitmap.
 *
 * Deliberately kept angular - chamfered corners, straight tails, hard
 * notches - to sit with the project's squared/brutalist direction rather
 * than the curled parchment banner this motif usually implies.
 */
/**
 * The shop's one card surface. EVERY shelf uses it - rotating offers,
 * supply crates, credit and gem packs - because the store was three
 * different-looking things stacked in one panel, and matching silhouettes
 * is what makes it read as a store rather than three screens.
 *
 * Built as a machined plate rather than a flat rectangle: a lit upper half,
 * an accent hairline along the top edge, corner ticks cut into two corners,
 * and a recessed footer band for the price. That is the 70/20/10 direction -
 * minimal ground, brutalist cut edges, a little industrial hardware - and
 * it is what the flat `panelAlt` rectangle was missing.
 */
export function drawShopCard(scene: BoardScene, 
  x: number, y: number, w: number, h: number, accent: number,
  options: { footer?: number; header?: number; solidHeader?: boolean } = {}
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const r = Theme.radiusChip;
  const footer = options.footer ?? 0;
  const header = options.header ?? 0;

  g.fillStyle(Theme.bgElevated, 1);
  g.fillRoundedRect(x, y, w, h, r);
  // Lit upper half. One light, upper-left, as everywhere else in the game.
  g.fillStyle(0xffffff, 0.045);
  g.fillRoundedRect(x + 1, y + 1, w - 2, h * 0.42, r);

  if (options.solidHeader) {
    // The packs' one deviation: a filled header strip instead of a
    // hairline. A price list of real money should look like a product,
    // not like today's shelf.
    g.fillStyle(accent, 0.16);
    g.fillRoundedRect(x + 1, y + 1, w - 2, 29, r);
    g.lineStyle(1, accent, 0.5);
    g.lineBetween(x + 2, y + 30, x + w - 2, y + 30);
  }

  if (header > 0) {
    // Same recess as the footer, so the card reads in three registers:
    // name plate, item, price. Drawn UNDER the lit half above rather than
    // over it, which would flatten the light.
    g.fillStyle(Theme.bg, 0.42);
    g.fillRoundedRect(x + 1, y + 1, w - 2, header, r);
    g.lineStyle(1, Theme.borderOnDark, 0.7);
    g.lineBetween(x + 2, y + header + 1, x + w - 2, y + header + 1);
    g.lineStyle(1, accent, 0.2);
    g.lineBetween(x + 2, y + header + 2, x + w - 2, y + header + 2);
  }

  if (footer > 0) {
    g.fillStyle(Theme.bg, 0.55);
    g.fillRoundedRect(x + 1, y + h - footer, w - 2, footer - 1, r);
    g.lineStyle(1, Theme.borderOnDark, 0.7);
    g.lineBetween(x + 2, y + h - footer, x + w - 2, y + h - footer);
  }

  // Accent hairline under the top edge, and cut ticks at two opposite
  // corners - the hardware detail that stops the card reading as a box.
  g.lineStyle(1, accent, options.solidHeader ? 0.75 : 0.45);
  g.lineBetween(x + r + 2, y + 1.5, x + w - r - 2, y + 1.5);
  g.lineStyle(1, accent, 0.55);
  g.lineBetween(x + 1, y + 9, x + 1, y + 18);
  g.lineBetween(x + w - 1, y + h - 18, x + w - 1, y + h - 9);

  g.lineStyle(Theme.borderWidth, Theme.borderOnDark, 1);
  g.strokeRoundedRect(x, y, w, h, r);
  return g;
}

export function drawSectionBanner(scene: BoardScene, cx: number, cy: number, w: number, color: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const half = w / 2;
  const hh = 11;      // half-height of the centre panel
  const tail = 20;    // how far each tail reaches past the panel
  const notch = 9;    // depth of the swallowtail cut
  const drop = 5;     // how far the tails hang below the panel
  const chamfer = 6;

  const poly = (pts: [number, number][], fill: number, stroke: number, strokeAlpha: number): void => {
    g.fillStyle(fill, 1);
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
    g.fillPath();
    g.lineStyle(1, stroke, strokeAlpha);
    g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  };

  for (const dir of [-1, 1] as const) {
    const inner = cx + dir * half;
    const outer = cx + dir * (half + tail);
    // Tail, hanging slightly below the panel it hangs from.
    poly([
      [inner, cy - hh + 2],
      [outer, cy - hh + 2 + drop],
      [outer - dir * notch, cy + drop],
      [outer, cy + hh - 2 + drop],
      [inner, cy + hh - 2]
    ], Theme.bg, color, 0.55);
    // Fold wedge - the sliver of tail that disappears behind the panel.
    poly([
      [inner, cy - hh + 2],
      [inner - dir * 7, cy + 1],
      [inner, cy + hh - 2]
    ], Theme.bg, color, 0.35);
  }

  // Raised centre panel, chamfered rather than rounded.
  poly([
    [cx - half + chamfer, cy - hh],
    [cx + half - chamfer, cy - hh],
    [cx + half, cy - hh + chamfer],
    [cx + half, cy + hh - chamfer],
    [cx + half - chamfer, cy + hh],
    [cx - half + chamfer, cy + hh],
    [cx - half, cy + hh - chamfer],
    [cx - half, cy - hh + chamfer]
  ], Theme.bgElevated, color, 0.9);

  // Lit upper half of the plaque, so it is a shaped object rather than a
  // flat fill with a line on it.
  g.fillStyle(color, 0.1);
  g.fillRect(cx - half + chamfer, cy - hh + 1, w - chamfer * 2, hh);

  // Top inner highlight - one lit edge, matching the fixed upper-left
  // light every other drawn object in the game uses.
  g.lineStyle(1, color, 0.35);
  g.lineBetween(cx - half + chamfer + 2, cy - hh + 3, cx + half - chamfer - 2, cy - hh + 3);
  // Rivets. The one piece of industrial hardware on the plaque, and what
  // makes the tails read as a fixed plate rather than cloth.
  g.fillStyle(color, 0.55);
  g.fillCircle(cx - half + 7, cy, 1.4);
  g.fillCircle(cx + half - 7, cy, 1.4);

  return g;
}

export function closeShop(scene: BoardScene): void {
  scene.shopCountdownUpdater = null;
  scene.shopScrollCleanup?.();
  scene.shopScrollCleanup = null;
  scene.shopOverlay?.destroy();
  scene.shopOverlay = null;
  scene.modalOpen = false;
}
