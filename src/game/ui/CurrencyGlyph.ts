import Phaser from 'phaser';
import { Theme, materialLighting } from './Theme';
import { drawGemGlyph } from '../objects/TierIcons';
import { loadedItemSprite } from '../objects/itemSprites';

/**
 * The three spendable currencies, drawn rather than spelled.
 *
 * Every currency in the game had two representations: an icon inside its HUD
 * chip, and a letter code (`CR`, `GM`, `E`) everywhere else. The letter codes
 * are the weaker half - they need reading, they need learning, and `E` in
 * particular is indistinguishable from a stray initial. This module owns the
 * icon so a label, an order card and a floating receipt can all place the
 * same mark the chip uses.
 *
 * Each glyph is drawn centred on the origin and sized so that `size` is its
 * full height, which is what lets it sit on a text baseline at any scale.
 */
export type CurrencyKind = 'credit' | 'gem' | 'energy';

export const CURRENCY_COLOR: Record<CurrencyKind, number> = {
  credit: Theme.currencyCredit,
  gem: Theme.currencyGem,
  energy: Theme.currencyEnergy
};

/** Maps the legacy unit codes that call sites still pass around. */
export function currencyKindFor(unit: string): CurrencyKind | null {
  if (unit === 'CR' || unit === 'CREDITS') return 'credit';
  if (unit === 'GM' || unit === 'GEMS') return 'gem';
  if (unit === 'E' || unit === 'ENERGY') return 'energy';
  return null;
}

/**
 * Draws one currency mark centred on (0, 0), `size` pixels tall.
 *
 * Lifted from the three HUD chips, which each had their own copy welded into
 * their own draw call at their own fixed radius - which is why nothing else
 * in the game could show a currency icon without redrawing it by hand.
 */
export function drawCurrencyGlyph(
  g: Phaser.GameObjects.Graphics,
  kind: CurrencyKind,
  size: number,
  color = CURRENCY_COLOR[kind]
): void {
  const half = size / 2;
  if (kind === 'gem') {
    drawGemGlyph(g, half, color);
    return;
  }
  if (kind === 'credit') {
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, half);
    g.lineStyle(Math.max(1, size * 0.1), Theme.accentAmber, 1);
    g.strokeCircle(0, 0, half * 0.8);
    g.lineStyle(Math.max(1, size * 0.075), Theme.textOnLight, 0.45);
    g.lineBetween(-half * 0.35, 0, half * 0.35, 0);
    return;
  }
  // Energy: the same bolt the energy chip draws, expressed as a fraction of
  // the box rather than in the chip's literal pixels.
  const u = size / 22;
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(2.5 * u, -11 * u);
  g.lineTo(-7 * u, 1 * u);
  g.lineTo(-1.5 * u, 1 * u);
  g.lineTo(-3 * u, 11 * u);
  g.lineTo(7 * u, -1 * u);
  g.lineTo(1.5 * u, -1 * u);
  g.closePath();
  g.fillPath();
}

/**
 * Share of its 1024px art box each currency mark's drawing actually fills.
 *
 * Every currency SVG is the same square, but the art inside is not: the
 * coin's disc reaches 65% of the box, the gem 59%, the bolt 78%. Display size
 * is therefore NOT how big a mark comes out, which is why anything sizing one
 * - the HUD chips, the board tiles - goes through `currencyBoxFor` instead of
 * passing a display size straight in.
 *
 * Measured off the path bounds in `public/currency-*.svg`. Retrace an SVG
 * with different padding and its number here has to be remeasured: this is a
 * property of the art file, not of the shape it draws.
 */
export const CURRENCY_FILL_RATIO: Record<CurrencyKind, number> =
  { credit: 0.649, gem: 0.591, energy: 0.779 };

/** Display size that draws `height` pixels of actual mark. */
export function currencyBoxFor(kind: CurrencyKind, height: number): number {
  return Math.round((height / CURRENCY_FILL_RATIO[kind]) * 10) / 10;
}

/** Texture keys for the drawn currency art, loaded in BoardScene.preload. */
const CURRENCY_TEXTURE: Record<CurrencyKind, string> = {
  credit: 'currency-coin',
  gem: 'currency-gem',
  energy: 'currency-energy'
};

/**
 * The rendered item each currency's mark comes from.
 *
 * Credits point at `credit-mark`, NOT at the board's tier one. The board's
 * coin lies flat, which is right where you are looking down at it from the
 * isometric camera - but a mark is read at 17px, and flat on the ground a
 * coin is an ellipse with a scratch on it. `credit-mark` is the same coin
 * faced to the camera and swung, the way the event token is presented.
 */
const CURRENCY_ITEM: Record<CurrencyKind, string> = {
  credit: 'credit-mark',
  gem: 'currency-gem',
  energy: 'currency-energy'
};

/**
 * The texture to draw a currency mark with.
 *
 * The RENDERED tier-one item when it is loaded, the flat SVG otherwise. The
 * board draws the modelled coin, gem and bolt; leaving the HUD, the prices
 * and the labels on the traced vector versions meant the same currency had
 * two different pictures depending on where you looked at it, which is the
 * exact split this module exists to close. Resolving it here rather than at
 * each call site means a family that has not been modelled yet keeps its SVG
 * with no special case anywhere.
 */
export function currencyTexture(scene: Phaser.Scene, kind: CurrencyKind): string {
  return loadedItemSprite(scene, CURRENCY_ITEM[kind], 1) ?? CURRENCY_TEXTURE[kind];
}

/**
 * Share of its 384px canvas each RENDERED mark's art fills, longest side.
 *
 * The same measurement as CURRENCY_FILL_RATIO and needed for the same
 * reason, but the renders fill far less of their box than the SVGs did -
 * 0.55 against 0.65 for the coin - because a family is framed at ONE scale
 * so its tiers keep their size order, and tier one is the smallest thing in
 * the chain. Feeding a display size sized for the SVG straight to a render
 * therefore draws a noticeably smaller mark.
 *
 * Measured off public/assets/items/<family>/1.png. Re-render a chain with a
 * different ladder and these have to be measured again.
 */
const RENDER_FILL_RATIO: Record<CurrencyKind, number> = {
  credit: 0.867, gem: 0.578, energy: 0.641
};

/**
 * Display size that draws the same amount of MARK as `size` did on the SVG.
 *
 * Every call site sizes its icon through `currencyBoxFor`, which is written
 * against the SVG's own fill. Correcting here keeps all of them - the HUD
 * chips, the price pills, the order cards - at the size they were tuned to,
 * rather than making each one know which art it ended up with.
 */
function renderDisplaySize(kind: CurrencyKind, size: number): number {
  return size * (CURRENCY_FILL_RATIO[kind] / RENDER_FILL_RATIO[kind]);
}

/**
 * The display size to give an Image for `kind`, whichever art it resolves to.
 *
 * For the places that build their own Image rather than calling
 * `currencyIcon` - the HUD chips stack three copies for a shadow, the mark
 * and a gloss, so they cannot use it.
 */
export function currencyDisplaySize(
  scene: Phaser.Scene, kind: CurrencyKind, size: number
): number {
  return currencyTexture(scene, kind) === CURRENCY_TEXTURE[kind]
    ? size
    : renderDisplaySize(kind, size);
}

/**
 * One currency icon, as a display object.
 *
 * ALWAYS the real SVG art when it is loaded - the icons on the HUD bars are
 * the standard for the whole game, so nothing else may invent its own mark.
 * Everything outside the header used to draw a vector fallback instead, which
 * is why the gem in the collection menu did not match the gem in the bar.
 *
 * A muted or disabled state is expressed as ALPHA on that same art rather than
 * by recolouring it. Tinting pre-coloured art gives a muddy result, and
 * swapping in a differently-shaped glyph for the disabled case would reproduce
 * exactly the inconsistency this exists to remove.
 *
 * The drawn glyph survives only as a fallback for a missing texture.
 */
export function currencyIcon(
  scene: Phaser.Scene,
  kind: CurrencyKind,
  size: number,
  color?: number
): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
  const key = currencyTexture(scene, kind);
  const muted = color !== undefined && color !== CURRENCY_COLOR[kind];
  if (scene.textures.exists(key)) {
    const drawn = key === CURRENCY_TEXTURE[kind] ? size : renderDisplaySize(kind, size);
    const image = scene.add.image(0, 0, key).setDisplaySize(drawn, drawn);
    if (muted) image.setAlpha(0.45);
    return image;
  }
  const g = scene.add.graphics();
  drawCurrencyGlyph(g, kind, size, color ?? CURRENCY_COLOR[kind]);
  return g;
}

export interface CurrencyLabelOptions {
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  /** Overrides the currency's own colour, for muted or error states. */
  color?: number;
  /**
   * Glyph height. Defaults to noticeably LARGER than the text's cap height.
   *
   * The real currency art carries detail - a coin's rim, a gem's facets - that
   * simply disappears below about 14px. Legibility wins over fitting neatly
   * inside the surrounding chip, so these are allowed to overflow their
   * backing rather than being shrunk to sit inside it.
   */
  glyphSize?: number;
  /** Gap between the number and its mark. */
  gap?: number;
  /** 'left' puts the origin at the label's left edge; 'center' centres it. */
  align?: 'left' | 'center';
}

/**
 * A number followed by its currency mark, as one positionable object.
 *
 * Phaser text cannot embed a drawn shape mid-string, so this is a container
 * laying the two out side by side. `width` is set on the container so callers
 * can right-align or centre it the way they would a text object.
 */
export function currencyLabel(
  scene: Phaser.Scene,
  value: string,
  kind: CurrencyKind,
  options: CurrencyLabelOptions = {}
): Phaser.GameObjects.Container {
  const fontSize = options.fontSize ?? 13;
  const color = options.color ?? CURRENCY_COLOR[kind];
  const glyphSize = options.glyphSize ?? fontSize * 1.6;
  const gap = options.gap ?? Math.round(fontSize * 0.35);

  const text = scene.add.text(0, 0, value, {
    fontFamily: options.fontFamily ?? Theme.fontNumeric,
    fontSize: `${fontSize}px`,
    fontStyle: options.fontStyle ?? 'bold',
    color: `#${color.toString(16).padStart(6, '0')}`,
    resolution: window.devicePixelRatio ?? 1
  }).setOrigin(0, 0.5);

  const glyph = currencyIcon(scene, kind, glyphSize, color);

  const width = text.width + gap + glyphSize;
  glyph.setPosition(text.width + gap + glyphSize / 2, 0);

  const container = scene.add.container(0, 0, [text, glyph]);
  container.setSize(width, Math.max(fontSize, glyphSize));
  if (options.align === 'center') {
    text.x = -width / 2;
    glyph.x -= width / 2;
  }
  return container;
}

/**
 * Re-points an existing currency Image at a kind and size.
 *
 * For marks that are updated in place rather than rebuilt - the tray's
 * sell/refill button changes currency depending on what is selected.
 */
export function applyCurrencyIcon(
  image: Phaser.GameObjects.Image, kind: CurrencyKind, size: number, color?: number
): void {
  const key = currencyTexture(image.scene, kind);
  const drawn = key === CURRENCY_TEXTURE[kind] ? size : renderDisplaySize(kind, size);
  image.setTexture(key)
    .setDisplaySize(drawn, drawn)
    .setAlpha(color !== undefined && color !== CURRENCY_COLOR[kind] ? 0.45 : 1);
}

export interface CurrencyPillOptions {
  fontSize?: number;
  iconSize?: number;
  height?: number;
  padX?: number;
  gap?: number;
  /** Pill fill. Defaults to the game's "you can act on this" green. */
  fill?: number;
  textColor?: number;
  /** Outline colour. Defaults to a soft black lip on the filled variant. */
  stroke?: number;
  strokeAlpha?: number;
  /** Corner radius. Defaults to a full pill; the chip variant squares up. */
  radius?: number;
}

/**
 * Price chip in the HUD's own language: dark fill, currency-coloured border
 * and number.
 *
 * Used where a bright filled pill would be wrong - the shop, where a green
 * chip both reads as candy-game and collides with the green that means "this
 * order is ready" everywhere else.
 */
export function currencyChipOptions(kind: CurrencyKind): CurrencyPillOptions {
  return {
    // Darker than the panel it sits on, so the chip reads as a recess rather
    // than as another raised surface.
    fill: Theme.bg,
    textColor: CURRENCY_COLOR[kind],
    stroke: CURRENCY_COLOR[kind],
    strokeAlpha: 0.85,
    // Same corner as the HUD currency bars, not a full pill - the bars are
    // the reference for what a price looks like in this game.
    radius: Theme.radiusChip
  };
}

/**
 * A price on a filled pill: `<number> <currency icon>`.
 *
 * A bare number beside an icon reads as a caption; the same number on a
 * filled chip reads as a button, which is what a price on a purchasable
 * thing should do. Shared by the inventory's slot unlock and the shop's
 * offer cards so the two cannot drift apart.
 *
 * The pill sizes itself to its contents, so a four-digit price widens it
 * rather than crowding the icon.
 */
export function currencyPill(
  scene: Phaser.Scene,
  value: string,
  kind: CurrencyKind,
  options: CurrencyPillOptions = {}
): Phaser.GameObjects.Container {
  const fontSize = options.fontSize ?? 15;
  const iconSize = options.iconSize ?? 24;
  const height = options.height ?? 28;
  const padX = options.padX ?? 9;
  const gap = options.gap ?? 3;
  const fill = options.fill ?? Theme.accentGreen;
  const textColor = options.textColor ?? Theme.bg;

  const text = scene.add.text(0, 0, value, {
    fontFamily: Theme.fontNumeric,
    fontSize: `${fontSize}px`,
    fontStyle: 'bold',
    color: `#${textColor.toString(16).padStart(6, '0')}`,
    resolution: window.devicePixelRatio ?? 1
  }).setOrigin(1, 0.5);

  const contentW = text.width + gap + iconSize;
  const pillW = contentW + padX * 2;

  const pill = scene.add.graphics();
  const lighting = materialLighting(fill, 4);
  pill.fillGradientStyle(lighting.light, lighting.base, lighting.dark, lighting.shadow, 1);
  const radius = options.radius ?? height / 2;
  pill.fillRoundedRect(-pillW / 2, -height / 2, pillW, height, radius);
  pill.lineStyle(Theme.borderWidth, options.stroke ?? 0x000000, options.strokeAlpha ?? 0.28);
  pill.strokeRoundedRect(-pillW / 2, -height / 2, pillW, height, radius);

  const contentLeft = -contentW / 2;
  text.setX(contentLeft + text.width);
  const icon = currencyIcon(scene, kind, iconSize).setPosition(
    contentLeft + text.width + gap + iconSize / 2, 0
  );

  const container = scene.add.container(0, 0, [pill, text, icon]);
  container.setSize(pillW, height);
  return container;
}
