import Phaser from 'phaser';

/**
 * WHICH ITEM FAMILIES SHIP AS RENDERED SPRITES.
 *
 * A family is converted one at a time - modelled in `tools/blender/
 * render_items.py`, rendered to `public/assets/items/<family>/<tier>.png` -
 * and until it is, its tiers keep drawing procedurally through `TierIcons`.
 * Both paths have to coexist for as long as that takes.
 *
 * This list is the ONLY place that knows which is which. The first family was
 * wired in as a `typeId === 'wood'` test repeated at nine call sites, which
 * meant converting the second one was nine edits with no way to tell whether
 * any had been missed.
 */
export const SPRITE_FAMILIES: Readonly<Record<string, number>> = {
  wood: 9,
  mineral: 9,
  // The currency chains are shorter, and the count matters: preloading nine
  // tiers for a five-tier chain asks the server for four files that do not
  // exist on every boot.
  'currency-credit': 6,
  'currency-energy': 5,
  'currency-gem': 5,
  // Not board items. The event token and the credit MARK are single
  // presentations - face to the camera and swung - rendered for the HUD and
  // the panels, where a coin lying flat at the board's angle is an ellipse
  // with a scratch on it. They live here because this is what preloads them.
  'event-token': 1,
  'credit-mark': 1
};

/** The texture key for a tier, whether or not it has actually been loaded. */
export function itemSpriteKey(typeId: string, tier: number): string {
  return `item-${typeId}-${tier}`;
}

/**
 * BUMP THIS whenever the sprites are re-rendered.
 *
 * The PNG paths never change, so a browser that has cached one keeps serving
 * it to Phaser's loader and a plain reload does not revalidate. That is not
 * a theoretical worry: after re-rendering every sprite from 384px to 192px,
 * the running game was still holding all 36 textures at 384 - the art had
 * changed on disk and on the server, and nothing anyone could see had moved.
 *
 * A version in the query string makes the URL new, so every client refetches
 * once and then caches again normally.
 */
export const ITEM_ART_VERSION = 6;

/** Where the renderer writes it, relative to `public/`. */
export function itemSpritePath(typeId: string, tier: number): string {
  return `assets/items/${typeId}/${tier}.png?v=${ITEM_ART_VERSION}`;
}

/**
 * The texture key to draw this tier with, or null to draw it procedurally.
 *
 * Checks the texture is really loaded rather than trusting the family list:
 * a missing or failed PNG should fall back to the procedural art, not leave a
 * hole on the board.
 */
export function loadedItemSprite(
  scene: Phaser.Scene, typeId: string, tier: number
): string | null {
  if (!(typeId in SPRITE_FAMILIES)) return null;
  const key = itemSpriteKey(typeId, tier);
  return scene.textures.exists(key) ? key : null;
}
