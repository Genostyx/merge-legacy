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
