import type { GridPosition } from './types';
import type { ResourceProducerId } from './rewards/ResourceRewards';

export interface ItemCellData {
  kind: 'item';
  typeId: string;
  tier: number;
}

export interface LockedItemCellData {
  kind: 'locked-item';
  typeId: string;
  tier: number;
}

export interface SpawnerCellData {
  kind: 'spawner';
  id: string;
  typeId: string;
  tier: number;
  readyAt: number;
  charges: number;
}

export interface SpawnerPieceCellData {
  kind: 'spawner-piece';
  typeId: string;
  tier: number;
}

export interface SplitterCellData {
  kind: 'splitter';
}

export interface ResourceProducerCellData {
  kind: 'resource-producer';
  producerId: ResourceProducerId;
  remaining: number;
}

/**
 * A crate the player has put down. Its contents are rolled ONCE, when the
 * crate is placed, and stored here - rolling at open time would re-roll the
 * payload on every reload mid-open.
 */
export interface CrateCellData {
  kind: 'crate';
  tier: string;
  remaining: CratePayloadEntry[];
  /**
   * Absolute epoch ms before which a BOUGHT crate cannot be opened. Absent on
   * earned crates, which open immediately - the wait is a property of buying
   * one, not of crates in general.
   *
   * Absolute rather than a remaining duration so the wait keeps running while
   * the game is closed instead of restarting on load.
   */
  readyAt?: number;
}

/** One tap's worth of a crate: either a tile to spawn or a currency to award. */
export type CratePayloadEntry =
  | { kind: 'item'; typeId: string; tier: number }
  | { kind: 'spawner-piece'; typeId: string; tier: number }
  | { kind: 'resource-producer'; producerId: ResourceProducerId; remaining: number }
  | { kind: 'coins' | 'gems' | 'energy'; amount: number };

export type GridCellData = ItemCellData | LockedItemCellData | SpawnerCellData | SpawnerPieceCellData | CrateCellData | SplitterCellData | ResourceProducerCellData;

/**
 * Pure data grid. Knows nothing about Phaser, rendering, or input.
 * Scenes read/write this and drive visuals off of it.
 */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  private cells: (GridCellData | null)[][];
  private blockedCells = new Set<string>();

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.cells = Array.from({ length: rows }, () => new Array(cols).fill(null));
  }

  inBounds(pos: GridPosition): boolean {
    return pos.col >= 0 && pos.col < this.cols && pos.row >= 0 && pos.row < this.rows;
  }

  get(pos: GridPosition): GridCellData | null {
    if (!this.inBounds(pos)) return null;
    return this.cells[pos.row][pos.col];
  }

  block(pos: GridPosition): void {
    if (this.inBounds(pos) && this.get(pos) === null) this.blockedCells.add(`${pos.col},${pos.row}`);
  }

  unblock(pos: GridPosition): void {
    this.blockedCells.delete(`${pos.col},${pos.row}`);
  }

  isBlocked(pos: GridPosition): boolean {
    return this.blockedCells.has(`${pos.col},${pos.row}`);
  }

  set(pos: GridPosition, data: GridCellData | null): void {
    if (!this.inBounds(pos)) return;
    this.cells[pos.row][pos.col] = data;
  }

  isEmpty(pos: GridPosition): boolean {
    return this.get(pos) === null && !this.isBlocked(pos);
  }

  /** Returns all empty cell positions. */
  emptyCells(): GridPosition[] {
    const out: GridPosition[] = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const pos = { col, row };
        if (this.cells[row][col] === null && !this.isBlocked(pos)) out.push(pos);
      }
    }
    return out;
  }

  /**
   * True if the board is full and contains no mergeable matching pair.
   * BoardScene allows a tile to be dragged to any other cell, so adjacency
   * is deliberately irrelevant here.
   */
  isDeadlocked(canUpgrade: (cell: GridCellData) => boolean = () => true): boolean {
    if (this.emptyCells().length > 0) return false;
    const seen = new Set<string>();
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const here = this.cells[row][col];
        if (!here || !canUpgrade(here)) continue;
        // A crate is never a merge partner, so it can't rescue a full board.
        if (here.kind === 'crate' || here.kind === 'splitter' || here.kind === 'resource-producer') continue;
        const key = `${here.kind}:${here.typeId}:${here.tier}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
    }
    return true;
  }

  /** Highest tier on the board for one chain, or across every chain when omitted. */
  highestTier(typeId?: string): number {
    let max = 0;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cell = this.cells[row][col];
        if (cell?.kind === 'item' && (!typeId || cell.typeId === typeId) && cell.tier > max) max = cell.tier;
      }
    }
    return max;
  }

  /** How many tiles of the given tier and optional chain are on the board. */
  countAtTier(tier: number, typeId?: string): number {
    let count = 0;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cell = this.cells[row][col];
        if (cell?.kind === 'item' && cell.tier === tier && (!typeId || cell.typeId === typeId)) count++;
      }
    }
    return count;
  }

  /**
   * Whether any locked-item cell of the given chain+tier still exists.
   * Used to guard against a permanent soft-lock: a locked cell can only be
   * unlocked by merging a matching FREE item onto it, and tiles only merge
   * upward, so a locked TIER-1 cell can only ever be cleared by a tier-1
   * spawner of the same family. If every spawner of that family gets
   * merge-upgraded past tier 1 while a locked tier-1 cell of it remains,
   * that cell can never be produced again - see BoardScene's spawner-merge
   * guard and pending-spawner-reward gate, both of which check this first.
   */
  hasLockedItem(typeId: string, tier: number): boolean {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cell = this.cells[row][col];
        if (cell?.kind === 'locked-item' && cell.typeId === typeId && cell.tier === tier) return true;
      }
    }
    return false;
  }

  clear(): void {
    this.cells = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    this.blockedCells.clear();
  }

  serialize(): (GridCellData | null)[][] {
    return this.cells.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  }

  loadFrom(data: (GridCellData | null)[][]): void {
    // Normalize saves to the grid's CURRENT dimensions. This preserves every
    // cell from an older, shorter board at the same coordinates and appends
    // empty rows beneath it when the board grows.
    this.cells = Array.from({ length: this.rows }, (_, rowIndex) => (
      Array.from({ length: this.cols }, (_, colIndex) => {
        const cell = data[rowIndex]?.[colIndex] ?? null;
        if (!cell) return null;
        // Saves created before spawners lived on the board contain no `kind`.
        return { ...cell, kind: (cell as { kind?: GridCellData['kind'] }).kind ?? 'item' } as GridCellData;
      })
    ));
  }
}
