import { describe, it, vi } from 'vitest';

// Same shim the TierIcons tests use: the icon code needs four Phaser symbols
// and none of them need an engine, where the real build needs a DOM.
vi.mock('phaser', () => {
  class Point {
    constructor(public x: number, public y: number) {}
  }
  return {
    default: {
      Geom: { Point },
      Math: {
        Clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
        Linear: (a: number, b: number, t: number) => a + (b - a) * t
      }
    }
  };
});

// Dev utility, not a check. Run it on demand:
//   npx vitest run tools/debug/icon-sheet.spec.ts
describe('icon sheet', () => {
  it('writes a contact sheet for the event chain', async () => {
    const { writeIconSheet } = await import('./icon-sheet');
    console.log('wrote', writeIconSheet('verdigris'));
  });
});
