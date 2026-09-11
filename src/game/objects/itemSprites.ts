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
export const SPRITE_FAMILIES: readonly string[] = ['wood', 'mineral'];

/** Tiers rendered per family. Every sprite family covers 1..9. */
export const SPRITE_TIERS = 9;

/** The texture key for a tier, whether or not it has actually been loaded. */
export function itemSpriteKey(typeId: string, tier: number): string {
  return `item-${typeId}-${tier}`;
}

/** Where the renderer writes it, relative to `public/`. */
export function itemSpritePath(typeId: string, tier: number): string {
  return `assets/items/${typeId}/${tier}.png`;
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
  if (!SPRITE_FAMILIES.includes(typeId)) return null;
  const key = itemSpriteKey(typeId, tier);
  return scene.textures.exists(key) ? key : null;
}
