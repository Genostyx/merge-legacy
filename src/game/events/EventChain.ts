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
 * The tiers walk the shared eight-stage shape grammar (see
 * docs/FAMILIES_ROADMAP.md) - rough chunk, shard, cut slab, squared solid,
 * faceted block, spire, interlocking lattice, smooth knot. The event does not
 * get its own grammar; only its material differs.
 *
 * SATURATION IS HELD ACROSS THE WHOLE RAMP; only lightness climbs. The first
 * version darkened AND desaturated the bottom four tiers to say "raw", and
 * they came out grey - the family only started reading as copper at tier 5,
 * so half the chain looked like it belonged to a different game. Rawness is
 * the shape's job here: a lump with gas pits already reads as unrefined
 * without the colour draining out of it.
 */
export const EVENT_CHAIN: ChainDef = {
  typeId: 'verdigris',
  tiers: [
    { tier: 1, key: 'copper-slag', label: 'Copper Slag', color: 0x2c6155 },
    { tier: 2, key: 'oxide-shard', label: 'Oxide Shard', color: 0x2a7062 },
    { tier: 3, key: 'cut-cathode', label: 'Cut Cathode', color: 0x27806e },
    { tier: 4, key: 'bronze-billet', label: 'Bronze Billet', color: 0x24947e },
    { tier: 5, key: 'faceted-bronze', label: 'Faceted Bronze', color: 0x22a88e },
    { tier: 6, key: 'patina-spire', label: 'Patina Spire', color: 0x2fbda2 },
    { tier: 7, key: 'verdigris-lattice', label: 'Verdigris Lattice', color: 0x58d3b8 },
    { tier: 8, key: 'verdigris-knot', label: 'Verdigris Knot', color: 0x8fe7cd }
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

