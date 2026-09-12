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
  'producer-coin-pouch': 0.611,
  'producer-coin-basket': 0.751,
  'producer-energy-basket': 0.795,
  'producer-gem-basket': 0.766,
  'energy-basket': 0.795,

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
