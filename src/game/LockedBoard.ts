import type { GridPosition } from './types';

export const STARTING_OPEN_CELLS: GridPosition[] = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: 1, row: 1 },
  { col: 2, row: 1 }
];

const STARTING_OPEN_KEYS = new Set(STARTING_OPEN_CELLS.map((pos) => `${pos.col},${pos.row}`));

export interface LockedBoardSeed {
  pos: GridPosition;
  typeId: 'wood' | 'mineral' | 'glass';
  tier: number;
  difficulty: number;
}

/** Stable position noise so contours feel placed rather than striped. */
function positionNoise(pos: GridPosition): number {
  let hash = Math.imul(pos.col + 1, 73856093) ^ Math.imul(pos.row + 1, 19349663);
  hash ^= hash >>> 13;
  return ((hash >>> 0) % 1001) / 1000 - 0.5;
}

/**
 * Edge-biased weighted distance field.
 *
 * The broad gradient still runs from the easy top-left opening to the
 * hardest bottom-right cell. Interior cells lose priority, so the selected
 * frontier travels farther up the right edge and left along the bottom edge
 * before occupying an equally distant diagonal cell. Small deterministic
 * noise breaks ties without changing the overall direction.
 */
export function edgeBiasedDifficulty(pos: GridPosition, cols: number, rows: number): number {
  if (pos.col === cols - 1 && pos.row === rows - 1) return 1;
  const x = cols <= 1 ? 0 : pos.col / (cols - 1);
  const y = rows <= 1 ? 0 : pos.row / (rows - 1);
  const diagonalGradient = (x + y) / 2;
  const edgeDistance = Math.min(pos.col, pos.row, cols - 1 - pos.col, rows - 1 - pos.row);
  const maxEdgeDistance = Math.max(1, Math.floor(Math.min(cols, rows) / 2));
  const interiorPenalty = edgeDistance / maxEdgeDistance;
  return diagonalGradient * 0.88 - interiorPenalty * 0.2 + positionNoise(pos) * 0.03;
}

type LockedFamily = LockedBoardSeed['typeId'];
const LOCKED_FAMILIES: LockedFamily[] = ['wood', 'mineral', 'glass'];
const LOCKED_TIERS = [2, 4, 6, 8] as const;
const LOCKED_CELL_COUNT = LOCKED_FAMILIES.length * LOCKED_TIERS.length;

export function createLockedBoardSeed(cols: number, rows: number): LockedBoardSeed[] {
  const candidates: { pos: GridPosition; difficulty: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (STARTING_OPEN_KEYS.has(`${col},${row}`)) continue;
      const pos = { col, row };
      candidates.push({ pos, difficulty: edgeBiasedDifficulty(pos, cols, rows) });
    }
  }

  // The shape is calculated, not stamped: take the 12 cells nearest the
  // bottom-right edge-biased frontier. On the 6x7 board this produces the
  // intended hooked pool along the bottom and right edges with three cells
  // filling its inner corner.
  const selected = candidates
    .sort((a, b) => b.difficulty - a.difficulty || b.pos.row - a.pos.row || b.pos.col - a.pos.col)
    .slice(0, LOCKED_CELL_COUNT);

  // Split the calculated frontier into four difficulty bands. Each band gets
  // exactly one Wood, Stone, and Glass lock; assigning Glass last keeps the
  // hardest cell (bottom-right) as Glass tier 8.
  const assigned = [...selected]
    .sort((a, b) => a.difficulty - b.difficulty || a.pos.row - b.pos.row || a.pos.col - b.pos.col)
    .map((cell, index) => {
      const bandSize = LOCKED_FAMILIES.length;
      const tierIndex = Math.min(LOCKED_TIERS.length - 1, Math.floor(index / bandSize));
      return {
        ...cell,
        typeId: LOCKED_FAMILIES[index % bandSize],
        tier: LOCKED_TIERS[tierIndex]
      };
    });

  // Hardest-first ordering preserves the intended frontier when an older
  // save only has a limited number of empty cells available for migration.
  return assigned
    .sort((a, b) => b.difficulty - a.difficulty || b.pos.row - a.pos.row || b.pos.col - a.pos.col);
}
