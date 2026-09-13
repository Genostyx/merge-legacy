import { PIECE_FAMILIES, SPRITE_FAMILIES } from './itemSprites';
/**
 * How much of its own square each asset's drawing actually covers.
 *
 * Every one of these files is authored on the same square canvas, but the art
 * inside sits in a different amount of padding - the coin pouch covers 57% of
 * its height while the energy basket covers 84%, and stone source 01 is 60%
 * wide against wood source 01's 86%. Handing them all the same display size,
 * which is what the board did, therefore draws them at visibly different
 * sizes: the box is equal and the object inside it is not.
 *
 * Values are `sqrt(width x height)` of the path bounds, matching the metric
 * `iconPresentation` normalises the drawn tier icons on, so a source and a
 * board item asked for the same drawn size come out the same size.
 *
 * Measured off the files themselves - `public/*.svg` for the drawn ones and
 * `public/assets/**` for the renders. Re-render or retrace an asset with
 * different padding and its number here has to be remeasured: it describes
 * the FILE, not the shape. Rendering the sources and leaving these at their
 * traced values is exactly how they came out the wrong size.
 */
export const ART_FILL_RATIO: Record<string, number> = {
  // The pouch is still the drawn SVG, and keeps its traced number.
  'producer-coin-pouch': 0.611,
  // THE THREE BASKETS ARE RENDERS, and they came through one shared
  // frame, so they share one measured fill. They were still carrying
  // their traced values - 0.751 to 0.795 against an actual 0.847 - and
  // were drawn up to 13% oversized on the board.
  'producer-coin-basket': 0.847,
  'producer-energy-basket': 0.847,
  'producer-gem-basket': 0.847,
  'energy-basket': 0.847,

  // EVERY SOURCE IS A RENDER NOW, so all four families follow the rule
  // the well already did: ONE number per family, taken from its largest
  // tier, rather than a measurement per tier.
  //
  // The SVGs each normalised to their own fill because they were drawn
  // independently and none was to scale against the others. These are
  // not like that - a family's tiers go through one shared frame, so
  // tier one is ALREADY smaller than tier five by exactly the amount it
  // should be. Dividing each tier by its own fill undoes that and the
  // upgrade stops being visible.
  //
  // Measured off the PNGs by rasterising at 256 and scanning the alpha
  // bounds, the same way the well's number was taken.
  'source-wood-1': 0.839,
  'source-wood-2': 0.839,
  'source-wood-3': 0.839,
  'source-wood-4': 0.839,

  'source-mineral-1': 0.811,
  'source-mineral-2': 0.811,
  'source-mineral-3': 0.811,
  'source-mineral-4': 0.811,
  'source-mineral-5': 0.811,

  'source-water-1': 0.811,
  'source-water-2': 0.811,
  'source-water-3': 0.811,
  'source-water-4': 0.811,
  'source-water-5': 0.811,

  'source-glass-1': 0.847,
  'source-glass-2': 0.847,
  'source-glass-3': 0.847,
  'source-glass-4': 0.847
};

/**
 * Display size that draws `drawn` pixels of actual art.
 *
 * Falls back to 1 for an unmeasured key, which draws it as before rather than
 * at a wrong size - a missing entry should be invisible, not a regression.
 */
export function boxForDrawnArt(textureKey: string, drawn: number): number {
  return drawn / (ART_FILL_RATIO[textureKey] ?? 1);
}

/**
 * Each source asset's drawn WIDTH and HEIGHT, as fractions of its square.
 *
 * `ART_FILL_RATIO` above is `sqrt(w * h)` - one number, which cannot say how
 * a shape is proportioned. That is enough to size art but not to stop it
 * spilling: normalising on area means the flatter a shape is, the wider it
 * must grow to hit the target, so Stone 02 reached 1.29 of a cell and Glass
 * 03 1.23. These two numbers are what let the width be clamped.
 *
 * Measured by rasterising each SVG at 256px and scanning the alpha bounds.
 */
export const ART_EXTENT: Record<string, { w: number; h: number }> = {
  'source-wood-1': { w: 0.648, h: 0.609 },
  'source-wood-2': { w: 0.711, h: 0.797 },
  'source-wood-3': { w: 0.727, h: 0.828 },
  'source-wood-4': { w: 0.813, h: 0.867 },
  'source-mineral-1': { w: 0.484, h: 0.461 },
  'source-mineral-2': { w: 0.539, h: 0.602 },
  'source-mineral-3': { w: 0.555, h: 0.625 },
  'source-mineral-4': { w: 0.586, h: 0.820 },
  'source-mineral-5': { w: 0.867, h: 0.758 },
  'source-glass-1': { w: 0.656, h: 0.609 },
  'source-glass-2': { w: 0.762, h: 0.680 },
  'source-glass-3': { w: 0.734, h: 0.797 },
  'source-glass-4': { w: 0.828, h: 0.867 },
  'source-water-1': { w: 0.547, h: 0.445 },
  'source-water-2': { w: 0.563, h: 0.695 },
  'source-water-3': { w: 0.563, h: 0.820 },
  'source-water-4': { w: 0.703, h: 0.867 },
  'source-water-5': { w: 0.758, h: 0.867 },
};

/** Ceilings on how far a source may spill out of its cell. Mirrors TierIcons. */
const MAX_W = 1.15;
const MAX_H = 1.12;

/**
 * Display size for a source's texture: the drawn-art normalisation above,
 * then clamped so neither axis exceeds the ceilings. Clamps DOWN only, so a
 * shape already inside them keeps the size it asked for.
 *
 * `cellSize` is passed rather than derived from `drawn` so this does not have
 * to know what target the caller used.
 */
export function sourceBoxForCell(textureKey: string, drawn: number, cellSize: number): number {
  const box = boxForDrawnArt(textureKey, drawn);
  const extent = ART_EXTENT[textureKey];
  if (!extent) return box;
  const fit = Math.min(
    1,
    (MAX_W * cellSize) / (box * extent.w),
    (MAX_H * cellSize) / (box * extent.h)
  );
  return box * fit;
}

/**
 * Each rendered item's and piece's drawn box within its square canvas.
 *
 * `w` and `h` are the alpha bounds as fractions of the canvas; `bottom`
 * is how far down the canvas the art's lowest pixel sits, which is what
 * lets a piece be stood on the cell floor rather than centred in it.
 *
 * Measured by rasterising every PNG and scanning the alpha bounds. They
 * are what `itemPlacement` sizes from - actual dimensions, not an area
 * metric, because area cannot tell a flat wide thing from a tall narrow
 * one and both of those exist in every family.
 */
export const ITEM_EXTENT: Record<string, { w: number; h: number; bottom: number }> = {
  'wood-1': { w: 0.865, h: 0.661, bottom: 0.833 },
  'wood-2': { w: 0.865, h: 0.615, bottom: 0.807 },
  'wood-3': { w: 0.865, h: 0.729, bottom: 0.865 },
  'wood-4': { w: 0.865, h: 0.573, bottom: 0.786 },
  'wood-5': { w: 0.865, h: 0.563, bottom: 0.781 },
  'wood-6': { w: 0.865, h: 0.854, bottom: 0.927 },
  'wood-7': { w: 0.865, h: 0.630, bottom: 0.818 },
  'wood-8': { w: 0.833, h: 0.865, bottom: 0.932 },
  'wood-9': { w: 0.844, h: 0.865, bottom: 0.932 },

  'mineral-1': { w: 0.865, h: 0.469, bottom: 0.734 },
  'mineral-2': { w: 0.865, h: 0.292, bottom: 0.646 },
  'mineral-3': { w: 0.865, h: 0.510, bottom: 0.755 },
  'mineral-4': { w: 0.865, h: 0.385, bottom: 0.693 },
  'mineral-5': { w: 0.542, h: 0.865, bottom: 0.932 },
  'mineral-6': { w: 0.865, h: 0.552, bottom: 0.776 },
  'mineral-7': { w: 0.865, h: 0.667, bottom: 0.833 },
  'mineral-8': { w: 0.865, h: 0.865, bottom: 0.932 },
  'mineral-9': { w: 0.865, h: 0.771, bottom: 0.885 },

  'glass-1': { w: 0.865, h: 0.438, bottom: 0.719 },
  'glass-2': { w: 0.396, h: 0.703, bottom: 0.854 },
  'glass-3': { w: 0.479, h: 0.448, bottom: 0.724 },
  'glass-4': { w: 0.417, h: 0.573, bottom: 0.786 },
  'glass-5': { w: 0.479, h: 0.406, bottom: 0.703 },
  'glass-6': { w: 0.635, h: 0.625, bottom: 0.813 },
  'glass-7': { w: 0.406, h: 0.667, bottom: 0.833 },
  'glass-8': { w: 0.479, h: 0.531, bottom: 0.766 },
  'glass-9': { w: 0.760, h: 0.828, bottom: 0.911 },

  'water-1': { w: 0.313, h: 0.323, bottom: 0.661 },
  'water-2': { w: 0.448, h: 0.333, bottom: 0.667 },
  'water-3': { w: 0.635, h: 0.292, bottom: 0.646 },
  'water-4': { w: 0.708, h: 0.323, bottom: 0.661 },
  'water-5': { w: 0.865, h: 0.323, bottom: 0.661 },
  'water-6': { w: 0.625, h: 0.375, bottom: 0.688 },
  'water-7': { w: 0.635, h: 0.797, bottom: 0.901 },
  'water-8': { w: 0.625, h: 0.573, bottom: 0.786 },
  'water-9': { w: 0.667, h: 0.438, bottom: 0.719 },
  'water-10': { w: 0.521, h: 0.521, bottom: 0.760 },
  'water-11': { w: 0.677, h: 0.401, bottom: 0.703 },
  'water-12': { w: 0.656, h: 0.375, bottom: 0.688 },

  'currency-credit-1': { w: 0.604, h: 0.354, bottom: 0.677 },
  'currency-credit-2': { w: 0.729, h: 0.302, bottom: 0.651 },
  'currency-credit-3': { w: 0.552, h: 0.677, bottom: 0.839 },
  'currency-credit-4': { w: 0.740, h: 0.583, bottom: 0.792 },
  'currency-credit-5': { w: 0.792, h: 0.693, bottom: 0.844 },
  'currency-credit-6': { w: 0.844, h: 0.865, bottom: 0.932 },

  'currency-energy-1': { w: 0.396, h: 0.625, bottom: 0.813 },
  'currency-energy-2': { w: 0.719, h: 0.688, bottom: 0.844 },
  'currency-energy-3': { w: 0.776, h: 0.740, bottom: 0.870 },
  'currency-energy-4': { w: 0.813, h: 0.750, bottom: 0.875 },
  'currency-energy-5': { w: 0.865, h: 0.792, bottom: 0.896 },

  'currency-gem-1': { w: 0.458, h: 0.583, bottom: 0.792 },
  'currency-gem-2': { w: 0.740, h: 0.625, bottom: 0.813 },
  'currency-gem-3': { w: 0.786, h: 0.677, bottom: 0.839 },
  'currency-gem-4': { w: 0.823, h: 0.688, bottom: 0.844 },
  'currency-gem-5': { w: 0.865, h: 0.719, bottom: 0.859 },

  'piece-wood-1': { w: 0.500, h: 0.375, bottom: 0.688 },
  'piece-wood-2': { w: 0.583, h: 0.401, bottom: 0.703 },
  'piece-wood-3': { w: 0.510, h: 0.760, bottom: 0.880 },
  'piece-wood-4': { w: 0.625, h: 0.865, bottom: 0.932 },

  'piece-mineral-1': { w: 0.500, h: 0.375, bottom: 0.688 },
  'piece-mineral-2': { w: 0.583, h: 0.401, bottom: 0.703 },
  'piece-mineral-3': { w: 0.510, h: 0.760, bottom: 0.880 },
  'piece-mineral-4': { w: 0.625, h: 0.865, bottom: 0.932 },

  'piece-glass-1': { w: 0.500, h: 0.375, bottom: 0.688 },
  'piece-glass-2': { w: 0.583, h: 0.406, bottom: 0.703 },
  'piece-glass-3': { w: 0.510, h: 0.760, bottom: 0.880 },
  'piece-glass-4': { w: 0.625, h: 0.865, bottom: 0.932 },

  'piece-water-1': { w: 0.625, h: 0.365, bottom: 0.682 },
  'piece-water-2': { w: 0.583, h: 0.865, bottom: 0.932 },
  'piece-water-3': { w: 0.646, h: 0.521, bottom: 0.760 },
  'piece-water-4': { w: 0.750, h: 0.708, bottom: 0.854 },

  'piece-decagon-1': { w: 0.448, h: 0.344, bottom: 0.672 },
  'piece-decagon-2': { w: 0.688, h: 0.354, bottom: 0.677 },
  'piece-decagon-3': { w: 0.865, h: 0.490, bottom: 0.745 },
  'piece-decagon-4': { w: 0.667, h: 0.406, bottom: 0.703 },
  'piece-decagon-5': { w: 0.813, h: 0.563, bottom: 0.781 },
};

/**
 * Where one item sits in its cell, and how big it is drawn.
 *
 * CENTRED FIRST, then pushed up only if it would drop out the bottom.
 * An item may stand taller than its cell and overhang the row above -
 * that is what makes a board of them read as objects on a surface
 * rather than as icons in a grid - but it must never cross its own
 * left, right or bottom edge, because those are the edges a player
 * reads as "this is the piece I am about to drag". So a short item
 * sits in the middle of its cell, and a tall one rises out of the top
 * with its feet on the floor.
 *
 * Centring is on the ART, not on the canvas. The renders put their
 * subject wherever the frame happened to land it, so centring the
 * image leaves a low-sitting object low and a high one floating.
 *
 * WIDTH is the cap. Height gets a ceiling too, a little above a cell:
 * without one the glass obelisk - narrow and tall - scales past one and
 * a half cells chasing the width target. Anything that reaches the
 * ceiling is too deep to centre, so it stands on the floor and
 * overhangs the top by whatever is left.
 *
 * Sizing on width and height rather than on `sqrt(w * h)` is the point:
 * an area metric cannot tell a flat wide thing from a tall narrow one.
 *
 * A GENTLE LADDER, WORKED BACKWARDS. The top tier sits at the full
 * allowance - the size everything was tuned flat at - and the lower
 * tiers come down from it, so nothing grew when the ladder was added
 * and nothing gained the right to spill by being high tier.
 *
 * The whole BOX is scaled, not one axis: the placement already takes
 * whichever of width or height binds, so scaling the box grows a flat
 * coin and a tall obelisk by the same percentage instead of making one
 * wider and the other taller.
 *
 * Front-loaded, because the early merges are the ones a player does
 * hundreds of times: on a nine-tier chain the first step is about 9%
 * and the last about 2%. Subtle between neighbours, obvious end to
 * end.
 */
const ITEM_LADDER_FLOOR = 0.82;

/** Where in its family's ladder a tier sits, as a scale on the box. */
function ladderScale(tier: number, tiers: number): number {
  if (tiers <= 1) return 1;
  const u = Math.sqrt((tier - 1) / (tiers - 1));
  return ITEM_LADDER_FLOOR + (1 - ITEM_LADDER_FLOOR) * u;
}

const ITEM_TARGET_W = 0.86;
// 1.10 of the size passed in, which is 1.056 of a real cell, so a
// capped item clears the top edge by about 6% of a cell. Below roughly
// 1.02 nothing overhangs at all.
const ITEM_MAX_H = 1.10;
/** The cell's own floor, as a fraction of the size the caller passes. */
const ITEM_FLOOR = 0.50;

export function itemPlacement(
  textureKey: string, cellSize: number, tier = 1, tiers = 1
): { box: number; offsetY: number } {
  const extent = ITEM_EXTENT[textureKey];
  // An unmeasured key keeps the old behaviour rather than guessing: a
  // missing entry should be invisible, not a regression.
  if (!extent) return { box: cellSize, offsetY: 0 };
  const box = cellSize * ladderScale(tier, tiers) * Math.min(
    ITEM_TARGET_W / extent.w, ITEM_MAX_H / extent.h);
  // Where the art's own centre and feet sit inside the image, which is
  // drawn centred on the origin.
  const artCentre = (extent.bottom - extent.h / 2 - 0.5) * box;
  let offsetY = -artCentre;
  const feet = offsetY + (extent.bottom - 0.5) * box;
  const floor = cellSize * ITEM_FLOOR;
  if (feet > floor) offsetY -= feet - floor;
  return { box, offsetY };
}

export function itemBoxForCell(
  textureKey: string, cellSize: number, tier = 1, tiers = 1
): number {
  return itemPlacement(textureKey, cellSize, tier, tiers).box;
}

/**
 * The same thing addressed the way callers actually hold it: a family
 * and a tier, rather than a texture key.
 */
export function itemDisplaySize(typeId: string, tier: number, cellSize: number): number {
  return itemBoxForCell(`${typeId}-${tier}`, cellSize, tier,
    SPRITE_FAMILIES[typeId] ?? 9);
}

export function pieceDisplaySize(typeId: string, tier: number, cellSize: number): number {
  return itemBoxForCell(`piece-${typeId}-${tier}`, cellSize, tier,
    PIECE_FAMILIES[typeId] ?? 4);
}

/**
 * The same sizing for a caller that only holds an extent key - the info
 * ladder builds its rows from mixed kinds and carries one string.
 * Sources fall through to their own table.
 */
export function artBoxFor(extentKey: string, size: number): number {
  if (ITEM_EXTENT[extentKey]) return itemBoxForCell(extentKey, size);
  if (ART_EXTENT[extentKey]) return sourceBoxForCell(extentKey, size, size);
  return size;
}

export function itemPlacementFor(typeId: string, tier: number, cellSize: number) {
  return itemPlacement(`${typeId}-${tier}`, cellSize, tier,
    SPRITE_FAMILIES[typeId] ?? 9);
}

export function piecePlacementFor(typeId: string, tier: number, cellSize: number) {
  return itemPlacement(`piece-${typeId}-${tier}`, cellSize, tier,
    PIECE_FAMILIES[typeId] ?? 4);
}
