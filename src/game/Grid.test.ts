import { describe, expect, it } from 'vitest';
import { Grid } from './Grid';

describe('grid dimension migration', () => {
  it('preserves a shorter save and adds empty rows beneath it', () => {
    const oldGrid = new Grid(6, 7);
    oldGrid.set({ col: 5, row: 6 }, { kind: 'item', typeId: 'wood', tier: 4 });

    const expanded = new Grid(6, 9);
    expanded.loadFrom(oldGrid.serialize());

    expect(expanded.get({ col: 5, row: 6 })).toEqual({ kind: 'item', typeId: 'wood', tier: 4 });
    expect(expanded.get({ col: 0, row: 7 })).toBeNull();
    expect(expanded.get({ col: 5, row: 8 })).toBeNull();
    expect(expanded.serialize()).toHaveLength(9);
    expect(expanded.emptyCells()).toHaveLength(53);
  });
});

describe('blocked expansion cells', () => {
  it('excludes blocked cells from empty space until they are unlocked', () => {
    const grid = new Grid(2, 2);
    const pos = { col: 1, row: 1 };
    grid.block(pos);
    expect(grid.isBlocked(pos)).toBe(true);
    expect(grid.isEmpty(pos)).toBe(false);
    expect(grid.emptyCells()).toHaveLength(3);
    grid.unblock(pos);
    expect(grid.isEmpty(pos)).toBe(true);
    expect(grid.emptyCells()).toHaveLength(4);
  });
});

describe('locked board items', () => {
  it('occupies a cell without counting toward delivery inventory', () => {
    const grid = new Grid(2, 2);
    grid.set({ col: 0, row: 0 }, { kind: 'locked-item', typeId: 'wood', tier: 3 });
    expect(grid.emptyCells()).toHaveLength(3);
    expect(grid.countAtTier(3, 'wood')).toBe(0);
    expect(grid.highestTier('wood')).toBe(0);
  });

  it('survives save serialization', () => {
    const grid = new Grid(2, 2);
    grid.set({ col: 1, row: 1 }, { kind: 'locked-item', typeId: 'mineral', tier: 5 });
    const restored = new Grid(2, 2);
    restored.loadFrom(grid.serialize());
    expect(restored.get({ col: 1, row: 1 })).toEqual({ kind: 'locked-item', typeId: 'mineral', tier: 5 });
  });
});

describe('spawner pieces', () => {
  it('survives save serialization', () => {
    const grid = new Grid(2, 2);
    grid.set({ col: 0, row: 1 }, { kind: 'spawner-piece', typeId: 'wood', tier: 3 });
    const restored = new Grid(2, 2);
    restored.loadFrom(grid.serialize());
    expect(restored.get({ col: 0, row: 1 })).toEqual({ kind: 'spawner-piece', typeId: 'wood', tier: 3 });
  });
});

describe('splitter items', () => {
  it('survives save serialization', () => {
    const grid = new Grid(2, 2);
    grid.set({ col: 1, row: 0 }, { kind: 'splitter' });
    const restored = new Grid(2, 2);
    restored.loadFrom(grid.serialize());
    expect(restored.get({ col: 1, row: 0 })).toEqual({ kind: 'splitter' });
  });
});
