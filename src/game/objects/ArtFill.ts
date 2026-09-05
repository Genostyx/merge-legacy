/**
 * How much of its own square each SVG asset's drawing actually covers.
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
 * Measured off `public/*.svg`. Retrace an asset with different padding and its
 * number here has to be remeasured - it describes the FILE, not the shape.
 */
export const ART_FILL_RATIO: Record<string, number> = {
  'producer-coin-pouch': 0.611,
  'producer-coin-basket': 0.751,
  'producer-energy-basket': 0.795,
  'producer-gem-basket': 0.766,
  'energy-basket': 0.795,

  'source-wood-1': 0.864,
  'source-wood-2': 0.716,
  'source-wood-3': 0.761,
  'source-wood-4': 0.714,

  'source-mineral-1': 0.709,
  'source-mineral-2': 0.824,
  'source-mineral-3': 0.691,
  'source-mineral-4': 0.764,
  'source-mineral-5': 0.806,

  'source-glass-1': 0.780,
  'source-glass-2': 0.912,
  'source-glass-3': 0.801,
  'source-glass-4': 0.892
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
  'source-glass-1': { w: 0.789, h: 0.781 },
  'source-glass-2': { w: 0.813, h: 0.746 },
  'source-glass-3': { w: 0.855, h: 0.754 },
  'source-glass-4': { w: 0.984, h: 0.816 },
  'source-mineral-1': { w: 0.602, h: 0.672 },
  'source-mineral-2': { w: 0.758, h: 0.770 },
  'source-mineral-3': { w: 0.641, h: 0.770 },
  'source-mineral-4': { w: 0.738, h: 0.801 },
  'source-mineral-5': { w: 0.914, h: 0.711 },
  'source-wood-1': { w: 0.863, h: 0.785 },
  'source-wood-2': { w: 0.664, h: 0.781 },
  'source-wood-3': { w: 0.656, h: 0.863 },
  'source-wood-4': { w: 0.695, h: 0.742 },
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
