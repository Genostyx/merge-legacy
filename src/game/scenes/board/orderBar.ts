import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import {
  COLS,
  ROWS,
  ORDER_BAR_H,
  ORDER_BAR_TOP,
  ORDER_CARD_GAP,
  ORDER_CARD_H,
  ORDER_CARD_MAX_W,
  ORDER_CARD_MIN_W,
  ORDER_CARD_PAD,
  ORDER_GO_H,
  ORDER_GO_W,
  ORDER_HEADER_H,
  ORDER_REORDER_MS,
  familyTierLabel,
  fullscreenElement,
  type OrderCardView
} from './config';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyLabel, type CurrencyKind } from '../../ui/CurrencyGlyph';
import { drawCrate, drawTierIcon, iconPresentation } from '../../objects/TierIcons';
import { SpawnerPieceView } from '../../objects/SpawnerPieceView';
import { TileView } from '../../objects/TileView';
import { getTierDef } from '../../data/chains';
import { floatingScore } from '../../fx/MergeFx';
import { addCoins, addGems } from '../../economy/Economy';
import { addEnergy } from '../../economy/Energy';
import {
  activeOrders,
  advanceOrder,
  orderDisplaySequence,
  orderProgress,
  playerLevel,
  type OrderDef,
  type OrderProgressSource
} from '../../levels/Orders';
import { CRATE_LABELS, isMeterCooling, shippingContainerPayload } from '../../rewards/Rewards';
import { SHOP_ROW_KEYS, rerollShopRow } from '../../shop/Shop';

/**
 * orderBar, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

export function orderProgressSource(scene: BoardScene): OrderProgressSource {
  return {
    countAtTier: (tier, typeId) => scene.grid.countAtTier(tier, typeId),
    dispenserCollects: scene.dispenserCollectCount
  };
}

/** Geometry shared by the order bar's build and refresh passes. */
export function orderBarMetrics(scene: BoardScene): { cardH: number; y: number; viewW: number } {
  // `viewW` is the CARD lane only - the ring sits outside it at the left.
  const fullscreenY = scene.boardOriginY
    - ORDER_CARD_H * scene.chromeScale
    - Math.round(10 * scene.hudScale);
  return {
    // LOCAL height: the cards are drawn at their tuned size and scaled as a
    // unit, so everything inside them - rows, plates, GO chip, text - grows
    // together instead of a taller card holding the same small contents.
    cardH: ORDER_CARD_H,
    // In fullscreen the board gains vertical breathing room. Keep the
    // orders attached to the board instead of leaving them behind under
    // the header, which created the large empty band seen on tall phones.
    y: fullscreenElement()
      ? fullscreenY
      : scene.contentTop + Math.round(48 * scene.chromeScale),
    viewW: COLS * scene.cellSize - scene.crateLaneW()
  };
}

/**
 * Builds one card per open order slot inside a horizontally scrolling,
 * masked container.
 *
 * Slot count grows with player level (3 at the start, up to
 * MAX_ORDER_SLOTS), so this tears down and rebuilds rather than assuming a
 * fixed count - `refreshOrderBar` calls it whenever the count changes.
 *
 * Each card gets its OWN container, with every child at local coordinates.
 * That is what lets a card be repositioned or animated by moving one
 * object, which both the content-driven widths and the reorder slide
 * depend on. Sizes and positions are all set by `refreshOrderBar`, since
 * they follow from content that is not known yet here.
 */
export function buildOrderBar(scene: BoardScene): void {
  destroyOrderBar(scene);

  const { cardH, y, viewW } = orderBarMetrics(scene);
  const slots = scene.orderState.activeOrderIndices.length;

  // Above the board. Tiles, dispensers and the glass pane all draw at the
  // default depth, so the GO chip - which now hangs below its card, over the
  // top of the board - was coming out behind a piece or its outline. 8 clears
  // every board object and the expansion locks (4-7) while staying under the
  // HUD chips at 20.
  const container = scene.add.container(0, 0).setDepth(8);
  scene.orderBarContainer = container;

  for (let position = 0; position < slots; position++) {
    const root = scene.add.container(scene.boardOriginX, y);
    const bg = scene.add.graphics();
    const progress = scene.add.text(ORDER_CARD_PAD, cardH - 8, '', {
      resolution: textResolution,
      fontFamily: Theme.fontMono,
      fontSize: '9px',
      color: hex(Theme.textOnDarkMuted)
    }).setOrigin(0, 1);
    const zone = scene.add.zone(0, cardH / 2, ORDER_CARD_MIN_W, cardH)
      .setInteractive({ useHandCursor: true });

    // Tap vs. drag, same rule the shop uses: a card must not fire when the
    // player was actually flicking the bar sideways to reach another order.
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      scene.orderDrag = { active: true, slot: position, startX: pointer.x, startScroll: scene.orderScroll, moved: 0, describe: null };
    });

    root.add([bg, progress, zone]);
    container.add(root);
    scene.orderCards.push({ root, bg, progress, rewardTexts: [], zone, width: ORDER_CARD_MIN_W });
  }

  // The mask is world-space and NOT on the display list, so it stays put
  // while the container slides under it - hence the explicit destroy in
  // destroyOrderBar.
  const maskShape = scene.make.graphics({});
  maskShape.fillStyle(0xffffff);
  // Tall enough for the overhanging pill above and the GO chip below,
  // or the scroll mask clips exactly the parts that moved outside.
  maskShape.fillRect(
    scene.boardOriginX + scene.crateLaneW(),
    y - 4 * scene.chromeScale,
    viewW,
    (cardH + ORDER_GO_H + 8) * scene.chromeScale
  );
  scene.orderBarMaskShape = maskShape;
  container.setMask(maskShape.createGeometryMask());
  container.x = -scene.orderScroll;

  // Edge fades: the only cue that more orders exist off-screen, since the
  // bar has no room for a scrollbar without stealing a card's height.
  scene.orderScrollHint = scene.add.graphics().setDepth(8);
}

/** World-space centre of a card, for the delivery animation to fly toward. */
export function orderCardWorldCenter(scene: BoardScene, position: number): { x: number; y: number } | null {
  const view = scene.orderCards[position];
  if (!view || !scene.orderBarContainer) return null;
  return {
    x: scene.orderBarContainer.x + view.root.x + view.width / 2,
    y: view.root.y + (ORDER_CARD_H / 2) * scene.chromeScale
  };
}

export function destroyOrderBar(scene: BoardScene): void {
  // The cooldown meter temporarily lives inside the scrolling order
  // container. Detach it before destroying/rebuilding that container so the
  // meter itself is not destroyed with the cards.
  if (scene.crateMeterContainer?.parentContainer === scene.orderBarContainer) {
    scene.orderBarContainer?.remove(scene.crateMeterContainer);
    scene.add.existing(scene.crateMeterContainer);
  }
  scene.orderScrollTween?.stop();
  scene.orderScrollTween = null;
  for (const view of scene.orderCards) for (const text of view.rewardTexts) text.destroy();
  scene.orderCards = [];
  scene.orderDisplayOrder = [];
  scene.orderBarContainer?.destroy(true);
  scene.orderBarContainer = null;
  scene.orderBarMaskShape?.destroy();
  scene.orderBarMaskShape = null;
  scene.orderScrollHint?.destroy();
  scene.orderScrollHint = null;
}

/**
 * Tells the player the bar moves. Two cues, because the fades alone were
 * not enough - they read as the board panel overlapping the cards rather
 * than as content continuing past the edge.
 *
 * The track and thumb are the SAME idiom the shop's scrolling list already
 * uses (4px, `Theme.bg` track, `Theme.borderOnDark` thumb), just turned on
 * its side, so the game keeps one scroll language instead of growing a
 * second one. The thumb also answers "how much more is there", which an
 * arrow or a chevron would not.
 */
export function drawOrderScrollHint(scene: BoardScene): void {
  const hint = scene.orderScrollHint;
  if (!hint) return;
  hint.clear();
  if (scene.orderScrollMax <= 0) return;

  const { cardH, y, viewW } = orderBarMetrics(scene);

  // Edge fades only. The track-and-thumb slider that used to sit directly
  // under the cards is gone: it read as chrome, and it occupied exactly the
  // strip the GO chip now overhangs into. The fades plus the one-time peek
  // nudge already say the bar continues and can be dragged.
  //
  // Fades are lifted above the board glass - the hint is created with the
  // order bar, before drawBoardBackground runs, so without this it renders
  // underneath the panel.
  scene.children.bringToTop(hint);
  const fadeW = 18;
  const bands = 6;
  const laneX = scene.boardOriginX + (isMeterCooling(scene.rewards) ? 0 : scene.crateLaneW());
  const visibleW = isMeterCooling(scene.rewards) ? COLS * scene.cellSize : viewW;
  if (scene.orderScroll > 1) {
    for (let i = 0; i < bands; i++) {
      hint.fillStyle(Theme.bg, 0.55 * (1 - i / bands));
      // Scaled, like the cards it fades: the raw band sat high and stopped
      // short of the bottom of a scaled card.
      hint.fillRect(laneX + (fadeW / bands) * i, y - 2 * scene.chromeScale, fadeW / bands + 1, (cardH + 4) * scene.chromeScale);
    }
  }
  if (scene.orderScroll < scene.orderScrollMax - 1) {
    const right = laneX + visibleW;
    for (let i = 0; i < bands; i++) {
      hint.fillStyle(Theme.bg, 0.55 * (1 - i / bands));
      hint.fillRect(right - (fadeW / bands) * (i + 1), y - 2 * scene.chromeScale, fadeW / bands + 1, (cardH + 4) * scene.chromeScale);
    }
  }

}

/**
 * A single nudge on first sight of an overflowing bar: slides a little way
 * and settles back, which is the one cue that says the thing is DRAGGABLE
 * rather than merely wider than the screen. Fires once per session, never
 * while the player is already touching the bar, and never if they have
 * already scrolled it themselves.
 */
export function peekOrderScroll(scene: BoardScene): void {
  if (scene.orderDrag.active || scene.orderScrollMax <= 0 || scene.orderScroll > 1) return;
  scene.orderScrollTween?.stop();
  scene.orderScrollTween = scene.tweens.addCounter({
    from: 0,
    to: Math.min(22, scene.orderScrollMax),
    duration: 300,
    ease: 'Quad.Out',
    yoyo: true,
    hold: 110,
    onUpdate: (tween) => {
      if (scene.orderDrag.active) {
        tween.stop();
        return;
      }
      setOrderScroll(scene, tween.getValue() ?? 0);
    },
    onComplete: () => {
      if (!scene.orderDrag.active) setOrderScroll(scene, 0);
    }
  });
}

export function setOrderScroll(scene: BoardScene, value: number): void {
  scene.orderScroll = Phaser.Math.Clamp(value, 0, scene.orderScrollMax);
  if (scene.orderBarContainer) scene.orderBarContainer.x = -scene.orderScroll;
  drawOrderScrollHint(scene);
}

export function refreshOrderBar(scene: BoardScene): void {
  // The Decagon pips ride along here because this is in practice the
  // "the board changed" refresh - it already runs after a merge, a sale, a
  // store, a spawn and a payout, which is exactly the set of things that
  // can change how many Decagons are standing on the board.
  scene.refreshDecagonMachines();
  // Level-ups open new slots, so the bar is rebuilt whenever the queue
  // length moves rather than being assumed fixed.
  const rebuilt = scene.orderCards.length !== scene.orderState.activeOrderIndices.length;
  if (rebuilt) buildOrderBar(scene);

  const orders = activeOrders(scene.orderState);
  const source = orderProgressSource(scene);
  const { cardH, y, viewW } = orderBarMetrics(scene);
  const cooling = isMeterCooling(scene.rewards);
  const laneX = scene.boardOriginX + (cooling ? 0 : scene.crateLaneW());
  const visibleW = cooling ? COLS * scene.cellSize : viewW;
  if (scene.orderBarMaskShape) {
    scene.orderBarMaskShape.clear();
    scene.orderBarMaskShape.fillStyle(0xffffff);
    // Scaled, exactly like the rect `buildOrderBar` lays down. Redrawing it
    // with the raw constants quietly undid that on the first refresh, and a
    // mask shorter than the scaled cards shaves their bottom edge - and
    // clips the crate meter, which rides inside this same container while
    // the meter is cooling.
    scene.orderBarMaskShape.fillRect(
      laneX,
      y - 4 * scene.chromeScale,
      visibleW,
      (cardH + ORDER_GO_H + 8) * scene.chromeScale
    );
  }

  // Completable orders move to the LEFT so the ones you can act on are
  // always the first cards - visible without scrolling, which is the whole
  // point of surfacing them. An insertion, not a swap: see
  // `orderDisplaySequence`, which owns the rule and is unit-tested.
  const statuses = orders.map(({ order }) => orderProgress(order, scene.orderState, source));
  scene.orderDisplayOrder = orderDisplaySequence(statuses.map((s) => s.ready));

  // Newly completable work is worth surfacing: if the bar is scrolled away
  // from the left when an order becomes ready, it would otherwise slide to
  // a position the player cannot see. Only fires when the ready COUNT
  // rises, so idle browsing is never yanked around.
  const readyCount = statuses.filter((s) => s.ready).length;
  if (readyCount > scene.orderReadyCount && scene.orderScroll > 1 && !scene.orderDrag.active) {
    animateOrderScrollTo(scene, 0);
  }
  scene.orderReadyCount = readyCount;

  // A reward token on an order card. `kind` swaps the letter code for the
  // currency's drawn mark; XP and a source reward have no mark and keep
  // their words.
  type CompactReward = {
    label: string;
    color: number;
    kind?: CurrencyKind;
    art?: 'shipping';
    size?: number;
    bold?: boolean;
  };
  const ROW_GAP = 5;
  /**
   * Requirement icon box. The band between the title and the reward rows is
   * ~35px, and `iconPresentation` scales art to roughly half its box, so a
   * smaller number here buys nothing but a shape too small to recognise -
   * which would defeat the whole point of drawing it.
   */
  const REQ_ICON = 38;
  /** Requirement tokens need more air than text tokens - each is a picture. */
  const REQ_GAP = 4;
  const REQ_ROW_Y = ORDER_HEADER_H + 5;
  /** The bevelled square each requirement sits in. */
  const REQ_PLATE = 38;
  /**
   * Art size inside the plate. `iconPresentation` draws at roughly half of
   * what it is given, so this is deliberately larger than the plate - it
   * makes the item nearly fill its square, as in the reference.
   */
  const REQ_ICON_ART = 52;
  /**
   * The sapphire is the one icon the plate cannot hold. `iconPresentation`
   * sizes on sqrt(w*h), so the marquise's narrow waist buys it height: it
   * is drawn 1.06 of its box tall where a typical tier sits at 0.80, and it
   * pins MAX_HEIGHT exactly. On the board that overhang is the point; in a
   * 38px slot it stands a third taller than everything beside it. Trimmed
   * to 0.86 - stone tier 7's height - so it is still the tallest thing on
   * the row without leaving it. The board keeps its own size.
   */
  const REQ_ICON_ART_TRIM: Record<string, number> = { 'mineral:8': 0.8 };
  /** The unlit plate: a recessed slot, still visibly a square. */
  const REQ_PLATE_DARK = 0x14120f;
  const innerW = (width: number) => width - ORDER_CARD_PAD * 2;

  /**
   * One requirement as the ITEM ITSELF plus its count, rather than the
   * item's name in words. A player matching an order against their board is
   * comparing shapes, so a card that shows the shape removes the
   * translation step - the full name still exists in the order info box.
   */
  const buildRequirementIcon = (
    view: OrderCardView,
    queueSlot: number,
    cardReady: boolean,
    line: { typeId: string; tier: number; count: number; ready: boolean },
    rowY: number
  ): Phaser.GameObjects.Container => {
    const def = getTierDef(line.typeId, line.tier);
    const baseColor = def?.color ?? 0x555555;

    // Each requirement sits in a bevelled square, and it is the SQUARE that
    // lights up when the board can satisfy it - not the item.
    //
    // Recolouring the item itself never worked: an item is already a shaded
    // object, so pushing it toward white destroyed the shading that makes it
    // recognisable, and a halo behind it read as decoration. A plate has no
    // such job - going from recessed to lit is the only thing it does.
    const plate = scene.add.graphics();
    const half = REQ_PLATE / 2;
    const px = REQ_ICON / 2;
    // Same corner radius as the order card the plate sits on, so the two
    // are cut from the same shape language.
    const radius = Theme.radiusChip;

    // Same recessed slot in both states - the difference is the GREEN, not
    // a change of material. The bone-coloured lit plate that used to sit
    // here read as a hole punched in the card.
    plate.fillStyle(REQ_PLATE_DARK, 1);
    plate.fillRoundedRect(px - half, -half, REQ_PLATE, REQ_PLATE, radius);
    // Inner shadow along the top edge. The board, the card and the slot
    // were three near-identical values stacked on each other, which is why
    // the squares never read as INSET - fixed by pushing the slot down the
    // value range rather than pulling the card up it, so the dark
    // aesthetic is unchanged.
    plate.fillStyle(0x000000, 0.35);
    plate.fillRect(px - half + 1, -half + 1, REQ_PLATE - 2, REQ_PLATE * 0.22);
    if (line.ready) {
      // The acid green that used to flood the whole card, spent here
      // instead: it now marks WHICH requirement the board can satisfy
      // rather than only that the order as a whole is done.
      plate.fillStyle(Theme.accentGreen, 0.28);
      plate.fillRoundedRect(px - half, -half, REQ_PLATE, REQ_PLATE, radius);
      // Lit along the top edge, from the same fixed upper-left key every
      // drawn object in the game shares.
      plate.fillStyle(Theme.accentGreen, 0.16);
      plate.fillRect(px - half + 1, -half + 1, REQ_PLATE - 2, REQ_PLATE * 0.45);
    }
    plate.lineStyle(Theme.borderWidth, line.ready ? Theme.accentGreen : Theme.borderOnDark, line.ready ? 0.85 : 0.5);
    plate.strokeRoundedRect(px - half, -half, REQ_PLATE, REQ_PLATE, radius);

    // The item keeps its own colour in both states. It is the item.
    const reqArt = REQ_ICON_ART * (REQ_ICON_ART_TRIM[`${line.typeId}:${line.tier}`] ?? 1);
    const icon = scene.add.graphics();
    const render = drawTierIcon(
      icon, line.typeId, line.tier, reqArt, materialLighting(baseColor, line.tier)
    );
    icon.setAlpha(render.materialAlpha);
    const present = iconPresentation(line.typeId, line.tier, reqArt);

    // The board's own contact shadow, so an item sits ON the plate rather
    // than floating in front of it - the single cue that made board tiles
    // read as objects. Sized from the measured footprint, exactly as
    // TileView does it.
    const shadow = scene.add.graphics();
    const { width: fw, centerX, baselineY } = render.footprint;
    if (fw > 0) {
      // Tighter than the board's, and pulled back up under the item: the
      // board version trails down and to the right into open space, which
      // here ran straight off the edge of the plate.
      for (let i = 3; i >= 1; i--) {
        shadow.fillStyle(0x000000, (line.ready ? 0.09 : 0.07) * i);
        shadow.fillEllipse(
          centerX + fw * 0.035 * i,
          baselineY - fw * 0.09 + fw * 0.022 * i,
          fw * (0.78 - i * 0.05),
          fw * 0.17
        );
      }
    }
    for (const g of [shadow, icon]) {
      g.setScale(present.scale).setPosition(px + present.offsetX, present.offsetY);
    }

    const token = scene.add.container(0, rowY, [plate, shadow, icon]);
    // The plate is its own press target, sitting above the card's zone so
    // `topOnly` routes the press here. It still arms the bar's horizontal
    // drag, or the bar could not be flicked from an icon - only the TAP
    // resolves differently.
    const press = scene.add.zone(px, 0, REQ_PLATE, REQ_PLATE).setInteractive();
    press.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      scene.orderDrag = {
        active: true,
        slot: queueSlot,
        startX: pointer.x,
        startScroll: scene.orderScroll,
        moved: 0,
        // Only an order that CANNOT be delivered describes its items. Once
        // it can, the whole card is one button - asking the player to aim
        // between the icons to complete an order they have already earned
        // is a trap the card's own readiness invites them into.
        describe: cardReady ? null : { typeId: line.typeId, tier: line.tier }
      };
    });
    token.add(press);
    // Only MULTIPLES are worth a number. "x1" on every single-item order is
    // noise on the one card the player reads at a glance.
    if (line.count > 1) {
      const badge = scene.add.text(0, 0, `×${line.count}`, {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric,
        fontSize: '9px',
        fontStyle: 'bold',
        color: hex(line.ready ? Theme.accentGreen : Theme.textOnDark)
      }).setOrigin(0.5, 0.5);
      // Its own chip. Every other label in the game sits on a panel; this
      // one is drawn over ITEM ART, which is the busiest surface on the
      // card and the only place a bare number has nothing behind it.
      const bw = badge.width + 8;
      const bh = 13;
      const bx = REQ_ICON - 2 - bw / 2;
      const by = -REQ_PLATE / 2 + bh / 2 + 2;
      const chip = scene.add.graphics();
      chip.fillStyle(Theme.bg, 0.92);
      chip.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, Theme.radiusChip);
      chip.lineStyle(1, line.ready ? Theme.accentGreen : Theme.borderOnDark, 1);
      chip.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, Theme.radiusChip);
      badge.setPosition(bx, by);
      token.add([chip, badge]);
    }
    token.setSize(REQ_ICON, REQ_ICON);
    view.root.add(token);
    view.rewardTexts.push(token);
    return token;
  };

  /** Creates a row of tokens at local coords and reports its natural width. */
  const buildRow = (view: OrderCardView, tokens: CompactReward[], rowY: number) => {
    const texts = tokens.map((token) => {
      // Containers centre on their y; a text object's default origin is its
      // top-left. Both are anchored to the same visual row explicitly.
      const built = token.art === 'shipping'
        ? (() => {
            const icon = scene.add.graphics().setX(15);
            drawCrate(icon, 30, 'shipping');
            return scene.add.container(0, rowY, [icon]).setSize(30, 30);
          })()
        : token.kind
          ? currencyLabel(scene, token.label, token.kind, {
            fontSize: 11,
            glyphSize: 17,
            gap: 3,
            color: token.color
          }).setPosition(0, rowY)
          : scene.add.text(0, rowY, token.label, {
              resolution: textResolution,
              fontFamily: Theme.fontNumeric,
              fontSize: `${token.size ?? 11}px`,
              fontStyle: token.bold === false ? 'normal' : 'bold',
              color: hex(token.color)
            }).setOrigin(0, 0.5);
      view.root.add(built);
      view.rewardTexts.push(built);
      return built;
    });
    const natural = texts.reduce((sum, t) => sum + t.width, 0) + ROW_GAP * Math.max(0, texts.length - 1);
    return { texts, natural, gap: ROW_GAP, align: 'center' as 'center' | 'left', fluid: false };
  };

  // PASS 1 - build every card's content and measure it. A width cannot be
  // chosen until its text exists, and a position cannot be chosen until
  // every width is known, so layout is deliberately split in two.
  // Card index IS the queue slot. Each card object owns one order for that
  // order's whole life; only its POSITION in the row changes.
  //
  // This used to be the other way round - cards were bound to screen
  // positions and had their content rewritten when the display order
  // changed. Nothing ever moved, so a completable order arriving at the
  // front was an instant content swap with no motion to follow, which is
  // exactly what made it read as a pop. The slide below could never fire
  // either, because a card's target x was always the x it already had.
  const built = scene.orderCards.map((view, queueSlot) => {
    const active = orders[queueSlot];
    for (const text of view.rewardTexts) text.destroy();
    view.rewardTexts = [];
    if (!active) return null;

    const { order } = active;
    const status = statuses[queueSlot];

    // The GO chip. Nothing on a ready card actually said "tap me" - the
    // green plates and the move to the front of the queue both read as
    // status rather than as an invitation, which is the one thing the
    // reference cards do that ours did not.
    view.progress
      .setText('GO')
      .setFontSize(11)
      .setColor(hex(Theme.bg))
      .setVisible(status.ready);

    // Requirements are DRAWN, side by side on one row: the item's own art
    // with its count beside it. They used to be one full name per line,
    // which is what the order info box is for - the card is the thing the
    // player scans against their board, and a shape matches a shape faster
    // than a name does.
    //
    // A collection order has no item to draw, so it keeps its words.
    const requirementRows = order.type === 'dispenser-collects'
      // Two stacked rows: the label, then a LIVE count under it. Collection
      // orders are the one case where a running total is worth showing -
      // there is no item on the board to light up, so the number is the
      // only progress the card can carry.
      ? [
          buildRow(view, [{
            // Sized so a collection card comes out the same width as an
            // item card. At 11px the text set the width and this card came
            // out visibly wider than every other one in the row.
            label: `SPEND ${status.target} ENERGY`,
            color: status.ready ? Theme.accentGreen : Theme.textOnDark,
            size: 9
          }], REQ_ROW_Y + REQ_ICON / 2 - 6),
          buildRow(view, [{
            label: `${status.current}/${status.target}`,
            color: status.ready ? Theme.accentGreen : Theme.textOnDark,
            size: 11,
            bold: false
          }], REQ_ROW_Y + REQ_ICON / 2 + 8)
        ]
      : [(() => {
          const tokens = status.lines.map((line) => buildRequirementIcon(view, queueSlot, status.ready, {
            typeId: line.requirement.typeId,
            tier: line.requirement.tier,
            count: line.requirement.count,
            ready: line.ready
          }, REQ_ROW_Y + REQ_ICON / 2));
          const natural = tokens.reduce((sum, t) => sum + t.width, 0)
            + REQ_GAP * Math.max(0, tokens.length - 1);
          return { texts: tokens, natural, gap: REQ_GAP, align: 'center' as 'center' | 'left', fluid: false };
        })()];

    const primary: CompactReward[] = [
      { label: `+${order.rewardCoins}`, color: Theme.currencyCredit, kind: 'credit' }
      // No XP figure anywhere player-facing - see the profile panel for why.
      // The order's other rewards are what the card is for; XP is carried by
      // the level bar instead of by a number on every card.
    ];
    const secondary: CompactReward[] = [];
    if (order.rewardEnergy) {
      secondary.push({ label: `+${order.rewardEnergy}`, color: Theme.currencyEnergy, kind: 'energy' });
    }
    if (order.rewardGems) {
      secondary.push({ label: `+${order.rewardGems}`, color: Theme.currencyGem, kind: 'gem' });
    }
    if (order.rewardSpawner) {
      secondary.push({
        label: '+SRC',
        color: getTierDef(order.rewardSpawner.typeId, 1)?.color ?? Theme.accentGreen
      });
    }
    if (order.rewardShippingContainer) {
      secondary.push({ label: '', color: 0x9fb2bd, art: 'shipping' });
    }

    // ONE reward line, and it sits ABOVE the card rather than inside it.
    // Credits and gems/energy are the same kind of information; stacked on
    // two rows at the card's dimmest edge they competed with each other and
    // made the card bottom-heavy. Lifting them out - and the GO chip below
    // - leaves the body as nothing but slots.
    // Reward on the header's left, GO on its right - see ORDER_HEADER_H.
    const rewardRow = buildRow(view, [...primary, ...secondary], (ORDER_BAR_TOP + ORDER_HEADER_H) / 2);
    rewardRow.align = 'left';
    // The reward bar is its OWN element, sized to what is in it - like the
    // HUD currency chips. It does not stretch to the card and the card does
    // not stretch to it; it just extends rightward as its contents grow.
    rewardRow.fluid = true;
    const rows = [...requirementRows, rewardRow];

    // No title to size against any more: the card is its contents.
    // Width comes from the SLOTS, but never less than the reward bar needs.
    // The bar still sizes itself to its own contents - it just cannot hang
    // off the end of the tray any more, which a two-reward order did.
    const widest = Math.max(rewardRow.natural, ...requirementRows.map((row) => row.natural));
    const width = Phaser.Math.Clamp(
      Math.ceil(widest) + ORDER_CARD_PAD * 2,
      ORDER_CARD_MIN_W,
      ORDER_CARD_MAX_W
    );
    return { view, status, rows, width };
  });

  // PASS 2 - size, paint and place. A running cursor rather than
  // `position * cardW`, since cards no longer share a width.
  let cursor = laneX;
  // Walked in DISPLAY order while the cards themselves stay bound to their
  // queue slots - which is what turns a reorder into a change of x, and
  // therefore into something that can be animated.
  for (const queueSlot of scene.orderDisplayOrder) {
    const entry = built[queueSlot];
    if (!entry) continue;
    const { view, status, rows, width } = entry;
    view.root.setScale(scene.chromeScale);
    // Bookkeeping is WORLD width - callers use it to find a card's centre
    // on screen - while everything inside the card stays in local units.
    view.width = width * scene.chromeScale;

    view.bg.clear();
    // NO outer card panel. There were three stacked shapes - an outer card,
    // a reward bar and a slot tray - and the outer one was doing nothing but
    // putting a second border around the other two. The card IS the reward
    // bar plus the slot tray, sitting directly on the board.

    // Only content that hit the MAX width cap still needs squeezing.
    for (const row of rows) {
      // A fluid row keeps its size and runs on past the card if it has to.
      const scale = row.fluid ? 1 : Math.min(1, innerW(width) / Math.max(1, row.natural));
      // Centred, not left-aligned. Without a title the card is just its
      // contents, and a lone icon pinned to the left edge left most of the
      // card empty.
      let x = row.align === 'left'
        ? ORDER_CARD_PAD
        : Math.max(ORDER_CARD_PAD, (width - row.natural * scale) / 2);
      for (const text of row.texts) {
        text.setX(x).setScale(scale);
        // Each row carries its own gap: a row of pictures needs more air
        // between tokens than a row of text, and measuring with one gap
        // while packing with another leaves the row misaligned.
        x += (text.width + row.gap) * scale;
      }
    }

    // The reward BAR: its own shape, hugging its own contents. Shorter than
    // the card is fine and expected; longer is allowed too, and it simply
    // runs past the edge rather than dragging the card wider with it.
    const rewardNatural = rows[rows.length - 1]?.natural ?? 0;
    const barW = rewardNatural + ORDER_CARD_PAD * 2;
    // Drawn BEFORE the tray and running past its top edge, so the tray
    // paints over the bar's lower half. Only the top of the bar is ever
    // seen - its bottom bevels finish behind the card, which is what makes
    // it read as a tab slotted in behind rather than a chip stuck on front.
    // Same translucent glass as the board pane: nothing sits behind the bar
    // any more, so it can let the room show through exactly as the board
    // does, which ties the two together without a new colour.
    view.bg.fillStyle(Theme.bgElevated, 0.84);
    view.bg.fillRoundedRect(0, ORDER_BAR_TOP, barW, ORDER_BAR_H, Theme.radiusChip);
    view.bg.lineStyle(1, Theme.borderOnDark, 1);
    view.bg.strokeRoundedRect(0, ORDER_BAR_TOP, barW, ORDER_BAR_H, Theme.radiusChip);

    // The SLOTS get their own inset tray beneath it, and that change of
    // material is what divides the two.
    // Full width now that nothing sits behind it, and flush-left with the
    // reward bar above so the two share an edge.
    view.bg.fillStyle(Theme.bg, 0.9);
    view.bg.fillRoundedRect(0, ORDER_HEADER_H, width, cardH - ORDER_HEADER_H, Theme.radiusChip);
    view.bg.lineStyle(Theme.borderWidth, Theme.borderOnDark, 1);
    view.bg.strokeRoundedRect(0, ORDER_HEADER_H, width, cardH - ORDER_HEADER_H, Theme.radiusChip);

    if (status.ready) {
      // Centred over the REWARD BAR, not over the card: the bar hugs its
      // own contents and can be much narrower than the card, so aligning to
      // the card put the chip off to one side of the thing it belongs to.
      const gx = (barW - ORDER_GO_W) / 2;
      // Straddling the card's bottom edge - half on the card, half off it.
      // Below the top edge it reached into the header band, where a ready
      // order could sit under the currency chips; underneath there is
      // nothing but the board.
      const gy = cardH - ORDER_GO_H / 2;
      const goLighting = materialLighting(Theme.accentGreen, 5);
      view.bg.fillGradientStyle(goLighting.highlight, goLighting.light, goLighting.base, goLighting.dark, 1);
      view.bg.fillRoundedRect(gx, gy, ORDER_GO_W, ORDER_GO_H, Theme.radiusChip);
      view.progress.setPosition(gx + ORDER_GO_W / 2, gy + ORDER_GO_H / 2).setOrigin(0.5, 0.5);
    }

    // Reaches DOWN over the half of the GO chip that hangs past the card.
    const below = status.ready ? ORDER_GO_H / 2 + 1 : 0;
    view.zone.setPosition(width / 2, (cardH + below) / 2).setSize(width, cardH + below);
    const hit = view.zone.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    hit?.setTo(0, 0, width, cardH + below);

    // Cards SLIDE to their new position rather than jumping, on the same
    // 140ms Quad.Out as TileView.snapTo - so an order reordering itself
    // reads like two board pieces trading places, which is the one
    // move-animation the player already knows.
    const targetX = cursor;
    scene.tweens.killTweensOf(view.root);
    if (rebuilt || view.root.x === targetX) {
      view.root.setPosition(targetX, y);
    } else {
      view.root.y = y;
      scene.tweens.add({ targets: view.root, x: targetX, duration: ORDER_REORDER_MS, ease: 'Quad.Out' });
    }
    cursor += width * scene.chromeScale + ORDER_CARD_GAP;
  }

  if (cooling && scene.orderBarContainer && scene.crateMeterContainer) {
    const wasInQueue = scene.crateMeterContainer.parentContainer === scene.orderBarContainer;
    if (!wasInQueue) scene.orderBarContainer.add(scene.crateMeterContainer);
    // Even a short early-game order queue must put the cooling meter beyond
    // the visible edge. It remains reachable by swiping to the end.
    const targetLeft = Math.max(cursor, laneX + visibleW + ORDER_CARD_GAP);
    const targetX = targetLeft - scene.boardOriginX;
    scene.tweens.killTweensOf(scene.crateMeterContainer);
    if (wasInQueue && Math.abs(scene.crateMeterContainer.x - targetX) < 0.5) {
      scene.crateMeterContainer.x = targetX;
    } else {
      scene.tweens.add({
        targets: scene.crateMeterContainer,
        x: targetX,
        duration: ORDER_REORDER_MS,
        ease: 'Quad.Out'
      });
    }
    cursor = targetLeft + scene.crateLaneW();
  } else if (!cooling && scene.crateMeterContainer?.parentContainer === scene.orderBarContainer) {
    const worldX = scene.orderBarContainer.x + scene.crateMeterContainer.x;
    scene.orderBarContainer.remove(scene.crateMeterContainer);
    scene.add.existing(scene.crateMeterContainer);
    scene.crateMeterContainer.x = worldX;
    scene.tweens.killTweensOf(scene.crateMeterContainer);
    scene.tweens.add({
      targets: scene.crateMeterContainer,
      x: 0,
      duration: ORDER_REORDER_MS,
      ease: 'Quad.Out'
    });
  }

  // Ready cards travel IN FRONT. They are the ones moving left through the
  // others, so they have to pass over rather than under - a card sliding
  // behind its neighbours is most of what made the movement hard to follow.
  if (scene.orderBarContainer) {
    for (const queueSlot of scene.orderDisplayOrder) {
      const entry = built[queueSlot];
      if (entry?.status.ready) scene.orderBarContainer.bringToTop(entry.view.root);
    }
  }

  const contentW = Math.max(0, cursor - ORDER_CARD_GAP - laneX);
  scene.orderScrollMax = Math.max(0, contentW - visibleW);
  setOrderScroll(scene, scene.orderScroll);

  // Delayed so the nudge lands after the board has finished appearing,
  // where it reads as a hint rather than as part of the load.
  if (!scene.orderPeekShown && scene.orderScrollMax > 0) {
    scene.orderPeekShown = true;
    scene.time.delayedCall(700, () => peekOrderScroll(scene));
  }
}

/**
 * `queueSlot` is both the card and the order it holds: a card object owns
 * one queue slot for that order's whole life and merely moves around the
 * row, so the two can no longer diverge. The indirection through
 * `orderDisplayOrder` that used to be needed here is gone with it.
 */
/**
 * Names an item tapped on an order CARD, in the same tray line the board
 * uses when that item is tapped in its cell. Nothing is selected and
 * nothing is sold - the card is not the board, so the sell action stays off.
 */
export function describeOrderItem(scene: BoardScene, typeId: string, tier: number): void {
  if (scene.modalOpen || scene.inputLocked) return;
  const def = getTierDef(typeId, tier);
  scene.selectedItemKey = null;
  scene.rushTargetKey = null;
  scene.refreshActionTray(
    `${def?.label?.toUpperCase() ?? 'ITEM'}
${familyTierLabel(typeId, tier)}`
  );
}

export function submitOrderSlot(scene: BoardScene, queueSlot: number): void {
  if (scene.modalOpen || scene.inputLocked) return;
  const active = activeOrders(scene.orderState)[queueSlot];
  if (!active) return;
  const status = orderProgress(active.order, scene.orderState, orderProgressSource(scene));
  if (!status.ready) {
    showOrderDetails(scene, active.order, status.current, status.target);
    return;
  }
  // The consuming animation flies to the CARD, which is now indexed by the
  // same number.
  if (active.order.type === 'deliver-items') consumeOrderItems(scene, active.order, queueSlot);
  completeOrder(scene, active.index, active.order, queueSlot);
}

/** Eases the order bar to a scroll offset, used when new work appears off-screen. */
export function animateOrderScrollTo(scene: BoardScene, target: number): void {
  scene.orderScrollTween?.stop();
  scene.orderScrollTween = scene.tweens.addCounter({
    from: scene.orderScroll,
    to: Phaser.Math.Clamp(target, 0, scene.orderScrollMax),
    duration: 220,
    ease: 'Quad.Out',
    // A drag beginning mid-tween must win immediately, or the bar would
    // fight the player's finger.
    onUpdate: (tween) => {
      if (scene.orderDrag.active) {
        tween.stop();
        return;
      }
      setOrderScroll(scene, tween.getValue() ?? 0);
    }
  });
}

export function consumeOrderItems(scene: BoardScene, order: OrderDef, slot: number): void {
  // Target the card that took them, so the flight visibly connects the
  // board to the order being filled. Resolved in WORLD space: card parts
  // now live in a per-card container inside the scrolling bar, so their
  // own x/y are local and would send items to the wrong place.
  const card = orderCardWorldCenter(scene, slot);
  // One pass per requirement line. The stagger counter is shared across
  // lines so a three-line order still reads as a single sequence being
  // collected, not three simultaneous bursts.
  let delay = 0;
  for (const requirement of order.requirements) {
    let remaining = requirement.count;
    for (let row = 0; row < ROWS && remaining > 0; row++) {
      for (let col = 0; col < COLS && remaining > 0; col++) {
        const pos = { col, row };
        const cell = scene.grid.get(pos);
        if (cell?.kind !== 'item' || cell.typeId !== requirement.typeId || cell.tier !== requirement.tier) continue;
        const key = scene.keyOf(pos);
        const view = scene.views.get(key);
        // The cell is freed and the view detached IMMEDIATELY, so the board
        // is playable the instant the order submits - the flight is purely
        // decorative and owns nothing the game state depends on.
        scene.views.delete(key);
        scene.grid.set(pos, null);
        if (scene.selectedItemKey === key) scene.selectedItemKey = null;
        if (view instanceof TileView && card) {
          scene.children.bringToTop(view);
          // Staggered so two or three items read as a sequence being
          // collected rather than one blur leaving at once.
          void view.playDeliverTo(card.x, card.y, delay);
          delay += 90;
        } else {
          view?.destroy();
        }
        remaining--;
      }
    }
  }
}

export function clearOrderRewardTexts(scene: BoardScene): void {
  for (const text of scene.orderRewardTexts) text.destroy();
  scene.orderRewardTexts = [];
}

/** Expanded order receipt with full names and matching resource colors. */
export function showOrderDetails(scene: BoardScene, order: OrderDef, current: number, target: number): void {
  clearOrderRewardTexts(scene);
  if (scene.selectedItemKey) {
    const selected = scene.views.get(scene.selectedItemKey);
    if (selected instanceof TileView || selected instanceof SpawnerPieceView) selected.setSelected(false);
  }
  scene.selectedItemKey = null;
  scene.rushTargetKey = null;
  scene.sellButton.setVisible(false);
  scene.sellButtonMark.setVisible(false);
  scene.sellButtonBg.setVisible(false);
  scene.sellButtonAmount.setVisible(false);
  scene.sellButtonZone.setVisible(false);

  const trayX = scene.boardOriginX + 48;
  const trayY = scene.boardOriginY + ROWS * scene.cellSize + scene.boardToTrayGap;
  const left = trayX + 14;
  const right = trayX + COLS * scene.cellSize - 14;
  scene.actionText
    .setPosition(left, trayY + 8)
    .setOrigin(0, 0)
    .setFontSize(10)
    .setLineSpacing(1)
    .setColor(hex(Theme.textOnDark))
    .setText(`${order.title.toUpperCase()}\nPROGRESS  ${current}/${target}`);

  // Spendable currencies show their MARK; XP and a source reward stay in
  // words, because neither has one. The tray's title and progress line
  // above is a DESCRIPTION and keeps words throughout - it is only these
  // value chips that change, and they change because the receipt that
  // floats off this very card when the order is delivered already uses the
  // mark.
  type Reward = { label: string; color: number } | { amount: number; kind: CurrencyKind } | { art: 'shipping' };
  const rewards: Reward[] = [
    { amount: order.rewardCoins, kind: 'credit' }
  ];
  if (order.rewardEnergy) rewards.push({ amount: order.rewardEnergy, kind: 'energy' });
  if (order.rewardGems) rewards.push({ amount: order.rewardGems, kind: 'gem' });
  if (order.rewardSpawner) {
    rewards.push({
      label: `+${order.rewardSpawner.typeId.toUpperCase()} SOURCE`,
      color: getTierDef(order.rewardSpawner.typeId, 1)?.color ?? Theme.accentGreen
    });
  }
  if (order.rewardShippingContainer) {
    rewards.push({ art: 'shipping' });
  }

  let cursorX = left;
  let lineY = trayY + 43;
  for (const reward of rewards) {
    if (cursorX !== left) {
      // The separator is its own object now: it used to be prepended to
      // each label's string, which a drawn glyph has no way to carry.
      const dot = scene.add.text(cursorX, lineY, '  ·  ', {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric,
        fontSize: '9px',
        color: hex(Theme.textOnDarkMuted)
      });
      cursorX += dot.width;
      scene.orderRewardTexts.push(dot);
    }

    const chip = 'art' in reward
      ? (() => {
          const icon = scene.add.graphics().setX(15);
          drawCrate(icon, 30, 'shipping');
          return scene.add.container(0, 0, [icon]).setSize(30, 30);
        })()
      : 'kind' in reward
        ? currencyLabel(scene, `+${reward.amount}`, reward.kind, { fontSize: 9, glyphSize: 10, gap: 3 })
        : scene.add.text(0, 0, reward.label, {
          resolution: textResolution,
          fontFamily: Theme.fontNumeric,
          fontSize: '9px',
          fontStyle: 'bold',
          color: hex(reward.color)
        }).setOrigin(0, 0.5);

    if (cursorX !== left && cursorX + chip.width > right) {
      lineY += 12;
      cursorX = left;
    }
    // Containers position from their centre line, text from its own origin,
    // so both are anchored on the same baseline explicitly.
    chip.setPosition(cursorX, lineY + 5);
    cursorX += chip.width;
    scene.orderRewardTexts.push(chip);
  }
}

export function completeOrder(scene: BoardScene, index: number, order: OrderDef, position: number): void {
  // Captured BEFORE anything advances: `refreshOrderBar` below re-sorts and
  // re-lays out the bar, so afterwards this position holds a different
  // order at a different x. Previously this was derived from the QUEUE slot
  // using a fixed `(boardWidth - gaps) / 3` card width - both wrong now
  // that ready orders sort to the front and cards size to their content,
  // which put the reward popup over an unrelated card.
  const rewardAt = orderCardWorldCenter(scene, position);
  const levelBefore = playerLevel(scene.orderState);
  advanceOrder(scene.orderState, index, scene.dispenserCollectCount, scene.ownedDispenserTypeIds());
  const levelAfter = playerLevel(scene.orderState);
  addCoins(scene.economy, order.rewardCoins);
  if (order.rewardEnergy) addEnergy(scene.energy, order.rewardEnergy);
  if (order.rewardGems) addGems(scene.economy, order.rewardGems);
  if (order.rewardSpawner) {
    // Unlocking a family should surface it in the shop immediately, so
    // both rows re-roll here rather than just one.
    scene.queueSpawnerReward(
      order.rewardSpawner.typeId,
      order.rewardSpawner.tier,
      rewardAt ?? undefined
    );
    const typeIds = scene.availableShopTypeIds();
    for (const key of SHOP_ROW_KEYS) {
      rerollShopRow(
        scene.shopState, key, key === 'special' ? scene.specialShopTypeIds() : typeIds,
        Date.now(), scene.collection.discovered
      );
    }
  }
  if (order.rewardShippingContainer) {
    scene.enqueueForcedSpawn({
      kind: 'crate', tier: 'shipping',
      remaining: shippingContainerPayload(scene.ownedDispenserTypeIds(), playerLevel(scene.orderState)),
      source: 'ORDER REWARD'
    }, rewardAt ?? undefined);
  }
  const automaticLevelRewards = levelAfter > levelBefore ? scene.autoDeliverLevelRewards() : [];
  scene.updateCurrencyText();
  refreshOrderBar(scene);
  scene.updateLevelBadge();
  scene.saveState();

  // Reward feedback is deliberately non-modal: the player can keep
  // tapping, dragging, or submitting another order immediately.
  const rewardX = rewardAt?.x ?? scene.boardOriginX + (COLS * scene.cellSize) / 2;
  const rewardY = rewardAt?.y ?? scene.contentTop + 78;
  // +/-34 rather than +/-22: rewards now scale with the tier delivered, so
  // a four-digit credit figure and a three-digit XP figure collided at the
  // spacing that suited the old flat two-digit rewards.
  floatingScore(scene, rewardX - 34, rewardY, order.rewardCoins, 'CR');
  if (order.rewardEnergy) floatingScore(scene, rewardX, rewardY + 18, order.rewardEnergy, 'E');
  if (order.rewardGems) floatingScore(scene, rewardX, rewardY + (order.rewardEnergy ? 36 : 18), order.rewardGems, 'GM');

  let trayMessage = `ORDER SENT  ·  ${order.title.toUpperCase()}
+${order.rewardCoins} CREDITS`;
  if (order.rewardEnergy) trayMessage += `  ·  +${order.rewardEnergy} E`;
  if (order.rewardGems) trayMessage += `  ·  +${order.rewardGems} GM`;
  if (order.rewardSpawner) trayMessage += `  ·  ${order.rewardSpawner.typeId.toUpperCase()} SOURCE`;
  if (order.rewardShippingContainer) trayMessage += '  ·  SHIPPING CONTAINER';
  if (levelAfter > levelBefore) {
    const newest = automaticLevelRewards[automaticLevelRewards.length - 1];
    trayMessage = newest
      ? `LEVEL ${levelAfter} REACHED  ·  ${CRATE_LABELS[newest.tier]} DELIVERED`
      : `LEVEL ${levelAfter} REACHED\nTAP THE LEVEL BADGE TO VIEW PROGRESS`;
  }
  scene.checkDeadlock();
  scene.tryReleaseVaultItem();
  scene.tryDeliverMeterGold();
  scene.refreshActionTray(trayMessage);
}
