import { describe, expect, it } from 'vitest';
import { createLockedBoardSeed, edgeBiasedDifficulty, STARTING_OPEN_CELLS } from './LockedBoard';

describe('starting locked board layout', () => {
  const layout = createLockedBoardSeed(6, 7);
  const openKeys = new Set(STARTING_OPEN_CELLS.map((pos) => `${pos.col},${pos.row}`));

  it('never overlaps the five starting playable cells', () => {
    expect(layout.every((seed) => !openKeys.has(`${seed.pos.col},${seed.pos.row}`))).toBe(true);
  });

  it('places exactly 12 locks in unique cells', () => {
    expect(layout).toHaveLength(12);
    expect(new Set(layout.map((seed) => `${seed.pos.col},${seed.pos.row}`)).size).toBe(layout.length);
  });

  it('places one of every family at each locked tier', () => {
    const combinations = layout.map((seed) => `${seed.typeId}:${seed.tier}`);
    expect(new Set(combinations)).toEqual(new Set([
      'wood:2', 'wood:4', 'wood:6', 'wood:8',
      'mineral:2', 'mineral:4', 'mineral:6', 'mineral:8',
      'glass:2', 'glass:4', 'glass:6', 'glass:8'
    ]));
  });

  it('calculates the intended hooked pool at the bottom-right', () => {
    const positions = layout.map((seed) => `${seed.pos.col},${seed.pos.row}`);
    expect(new Set(positions)).toEqual(new Set([
      '1,6', '2,6', '3,6', '4,6', '5,6',
      '5,2', '5,3', '5,4', '5,5',
      '3,5', '4,5', '4,4'
    ]));
  });

  it('favors perimeter routes over equal-depth interior cells', () => {
    expect(edgeBiasedDifficulty({ col: 5, row: 1 }, 6, 7))
      .toBeGreaterThan(edgeBiasedDifficulty({ col: 3, row: 3 }, 6, 7));
    expect(edgeBiasedDifficulty({ col: 1, row: 6 }, 6, 7))
      .toBeGreaterThan(edgeBiasedDifficulty({ col: 3, row: 4 }, 6, 7));
  });

  it('puts glass tier 8 in the far bottom-right frontier', () => {
    const glassEight = layout.find((seed) => seed.typeId === 'glass' && seed.tier === 8);
    expect(glassEight?.pos).toEqual({ col: 5, row: 6 });
  });

  it('uses both the perimeter and the middle of the board', () => {
    const perimeterCount = layout.filter(({ pos }) => (
      pos.col === 0 || pos.row === 0 || pos.col === 5 || pos.row === 6
    )).length;
    const interiorCount = layout.length - perimeterCount;
    expect(perimeterCount).toBeGreaterThan(interiorCount);
    expect(interiorCount).toBeGreaterThan(0);
  });

  it('orders migration seeds from the hardest frontier inward', () => {
    expect(layout[0].pos).toEqual({ col: 5, row: 6 });
    for (let i = 1; i < layout.length; i++) {
      expect(layout[i - 1].difficulty).toBeGreaterThanOrEqual(layout[i].difficulty);
    }
  });
});
