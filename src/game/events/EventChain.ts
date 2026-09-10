import type { ChainDef } from '../types';

/**
 * THE EVENT CHAIN's definition, alone in a module that imports nothing.
 *
 * Split out of EventBoard so `chains.ts` can resolve the typeId without
 * pulling the board, the Grid and the reward tables in behind it. `getChain`
 * has to answer for this chain - TileView and the icon layer both go through
 * it - but the chain still must NOT be in `CHAINS`, or it would appear in the
 * shop, the collection and order generation, all of which outlive the window.
 */

/**
 * THE EVENT CHAIN - oxidised copper, raw ore up to a patinated knot.
 *
 * Kept OUT of `CHAINS` so it cannot leak into the shop, the collection or
 * order generation, all of which outlive the window this chain dies with.
 *
 * Copper because none of the standing families own it - Wood runs amber,
 * Stone warm neutral, Glass pale prismatic, Water cyan - and because it is
 * the one common material whose refined state is a COLOUR CHANGE rather than
 * a polish. That gives the ramp somewhere to go that no other family's does:
 * it gets greener as it gets better, which is the opposite of every other
 * chain here, and reads as foreign at a glance.
 *
 * It also lands on the token's own teal around tier 6, so the material and
 * the currency of the event are visibly the same substance.
 *
 * THE RAMP RUNS THROUGH A HUE, not just through lightness. Raw copper is
 * warm, oxidising copper goes brass then olive, and patina lands on the
 * green-blue the event is named for. That is what copper actually does, and
 * it means neighbouring tiers differ by more than a shade - which one hue
 * across eight tiers could never manage, however carefully the lightness was
 * stepped.
 *
 * The SHAPES break the shared eight-stage grammar on purpose; see the
 * Verdigris section of TierIcons.ts for why.
 */
export const EVENT_CHAIN: ChainDef = {
  typeId: 'verdigris',
  tiers: [
    { tier: 1, key: 'wire-offcut', label: 'Wire Offcut', color: 0x7a4326 },
    { tier: 2, key: 'wire-coil', label: 'Wire Coil', color: 0xa15c2b },
    { tier: 3, key: 'pipe-section', label: 'Pipe Section', color: 0xc08a3a },
    { tier: 4, key: 'pipe-elbow', label: 'Pipe Elbow', color: 0x7e9440 },
    { tier: 5, key: 'tee-fitting', label: 'Tee Fitting', color: 0x3f9c62 },
    { tier: 6, key: 'manifold', label: 'Manifold', color: 0x22ac96 },
    { tier: 7, key: 'condenser-coil', label: 'Condenser Coil', color: 0x35c8c4 },
    { tier: 8, key: 'alembic', label: 'Alembic', color: 0x9ce8e6 }
  ]
};

export const EVENT_MAX_TIER = EVENT_CHAIN.tiers.length;

export function eventTierDef(tier: number): ChainDef['tiers'][number] | null {
  return EVENT_CHAIN.tiers.find((def) => def.tier === tier) ?? null;
}

/** True for anything that belongs to the event chain rather than the board's. */
export function isEventTypeId(typeId: string): boolean {
  return typeId === EVENT_CHAIN.typeId;
}

