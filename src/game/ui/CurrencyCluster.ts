import Phaser from 'phaser';
import { CurrencyKind, currencyBoxFor } from './CurrencyGlyph';

/** The SVG mark each currency is drawn from. */
const TEXTURE_KEY: Record<CurrencyKind, string> = {
  credit: 'currency-coin',
  gem: 'currency-gem',
  energy: 'currency-energy'
};

/**
 * What a pile of currency looks like, defined ONCE.
 *
 * These layouts started inside `TileView` as local arrays, which was fine
 * while the board was the only thing that drew a pile. It is not any more -
 * the daily rewards use the same piles to say how much a day pays - and two
 * copies of a layout is two things to keep in step. Every offset is a
 * FRACTION of the box the cluster is drawn in, so a pile scales with whatever
 * it is sitting in rather than being tuned for one board width.
 */

/**
 * Credits keep the stacked, structured arrangement: coins are minted things
 * and stack squarely, so a tidy footprint is the point.
 */
export const CREDIT_CLUSTERS: [number, number][][] = [
  [[0, 0.07]],
  // The pair is centred on the tile: the two coins sat at -0.19 and 0, so
  // their midpoint was 0.095 to the LEFT of centre and the whole mark hung
  // off one side of the cell.
  [[-0.095, 0.13], [0.095, 0.07]],
  [[0, 0.17], [0, 0.05], [0, -0.07]],
  [[-0.15, 0.15], [-0.15, 0.03], [0.15, 0.11], [0.15, -0.01]],
  [[-0.21, 0.15], [0, 0.15], [0.21, 0.15], [-0.11, 0.01], [0.11, 0.01]],
  [[-0.21, 0.18], [0, 0.18], [0.21, 0.18], [-0.11, 0.04], [0.11, 0.04], [0, -0.1]]
];

/**
 * Gems and droplets get loose clusters instead: aligned columns made them
 * read as a bar chart.
 */
export const GEM_CLUSTERS: [number, number][][] = [
  [[0, 0.07]],
  [[-0.095, 0.13], [0.095, 0.07]],
  [[-0.16, 0.14], [0.17, 0.07], [0, -0.07]],
  [[-0.19, 0.14], [0.16, 0.15], [-0.04, 0], [0.19, -0.08]],
  [[-0.2, 0.16], [0.05, 0.19], [-0.15, -0.02], [0.2, 0.05], [0.02, -0.13]],
  [[-0.21, 0.17], [0.03, 0.2], [0.21, 0.1], [-0.16, 0.01], [0.11, -0.06], [-0.03, -0.17]]
];

export function clusterLayoutFor(kind: CurrencyKind, tier: number): [number, number][] {
  const layouts = kind === 'credit' ? CREDIT_CLUSTERS : GEM_CLUSTERS;
  return layouts[Math.max(1, Math.min(layouts.length, Math.floor(tier))) - 1];
}

/**
 * How much of the box a single mark fills, by how many are in the pile.
 *
 * Coins shrink as the count climbs, so six occupy the footprint of one. Gems
 * and droplets do NOT: they hold one size at every tier and are allowed to
 * overlap, because a higher tier reading as physically smaller undercuts the
 * merge that produced it. Energy asks for MORE than the gems do - the bolt is
 * the one mark far narrower than it is tall, so at a matched height it covers
 * about a third less area than a coin.
 */
export function clusterDrawnFraction(kind: CurrencyKind, count: number): number {
  if (kind === 'credit') return [0.62, 0.54, 0.46, 0.42, 0.38, 0.36][count - 1] ?? 0.36;
  return kind === 'energy' ? 0.66 : 0.54;
}

/** One mark of a pile: the art, and the white top-cropped gloss over it. */
export interface ClusterPart {
  art: Phaser.GameObjects.Image;
  gloss: Phaser.GameObjects.Image;
}

/**
 * Builds a pile of `tier` marks laid out inside a `box`-sized square, centred
 * on (0, 0). The caller owns the returned objects: add each part's art and
 * then its gloss, in that order, so the gloss sits directly above the mark it
 * catches the light on.
 */
export function buildCurrencyCluster(
  scene: Phaser.Scene, kind: CurrencyKind, tier: number, box: number
): ClusterPart[] {
  const layout = clusterLayoutFor(kind, tier);
  const iconSize = currencyBoxFor(kind, box * clusterDrawnFraction(kind, layout.length));
  const textureKey = TEXTURE_KEY[kind];
  // The cluster offsets were authored against round marks, which hang evenly
  // around their centre. A bolt's mass sits low, so the same offsets drop the
  // whole group below the middle; energy lifts by a few percent to put it back.
  const lift = kind === 'energy' ? -0.04 : 0;

  return layout.map(([x, y]) => {
    const px = x * box;
    const py = (y + lift) * box;
    const art = scene.add.image(px, py, textureKey).setDisplaySize(iconSize, iconSize);
    const gloss = scene.add.image(px, py, textureKey)
      .setDisplaySize(iconSize, iconSize)
      .setTintFill(0xffffff)
      .setAlpha(0.2);
    gloss.setCrop(0, 0, gloss.width, gloss.height * 0.42);
    return { art, gloss };
  });
}
