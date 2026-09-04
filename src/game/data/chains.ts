import type { ChainDef } from '../types';

// Two merge families, both framed as "cheap raw material -> priceless
// refined material" rather than a growing-things metaphor - wood you mill
// up from scrap to gilded exotic hardwood, stone you dig up from rubble to
// a radiant gem. Add more ChainDef entries to introduce further parallel
// families (e.g. a second board region, or unlocked later).
//
// `color` is a material ramp per chain: each family stays in one warm
// (wood) or cool (mineral) neighborhood, but BOTH hue and saturation/
// lightness swing hard across the 9 tiers (dark and desaturated at tier 1,
// near the board's own charcoal, up to a vivid, clearly "refined" tone at
// tier 9) - matching the raw-material-to-priceless-material story above.
// An earlier version held hue nearly fixed and only nudged lightness a
// few percent per tier, so every tile in a chain read as the same muddy
// color and the only way to tell tier 3 from tier 6 was the corner number
// chip. This is the fix, kept within the project's dark palette (a
// deliberate choice - see README) rather than a pivot to the
// light/saturated boards the reference merge games use.
//
// Hue ranges are chosen to stay clearly distinct from the three reserved
// interactive-state accents (cyan/amber/acid-green - see ui/Theme.ts).
// Stone stays predominantly neutral and mineral-warm so it cannot be
// confused with Water's cyan-blue silhouettes at board size.
export const WOOD_CHAIN: ChainDef = {
  typeId: 'wood',
  tiers: [
    { tier: 1, key: 'scrap-wood', label: 'Scrap Wood', color: 0x44302c },
    { tier: 2, key: 'pine-plank', label: 'Pine Plank', color: 0x5d3b32 },
    { tier: 3, key: 'oak-plank', label: 'Oak Plank', color: 0x794434 },
    { tier: 4, key: 'maple-block', label: 'Maple Block', color: 0x994e33 },
    { tier: 5, key: 'walnut-block', label: 'Walnut Block', color: 0xb95c31 },
    { tier: 6, key: 'mahogany-block', label: 'Mahogany Block', color: 0xd56c34 },
    { tier: 7, key: 'ebony-block', label: 'Ebony Block', color: 0xe18447 },
    { tier: 8, key: 'gilded-rosewood', label: 'Gilded Rosewood', color: 0xeb9c5c },
    // Masterwork capstone, one tier beyond the shared shape grammar's top -
    // see docs/FAMILIES_ROADMAP.md. Pushes past Gilded Rosewood's amber-
    // orange rather than a new hue, since "heirloom" is the same material
    // pushed to its ultimate refinement, not a different material.
    { tier: 9, key: 'rosewood-heirloom', label: 'Rosewood Heirloom', color: 0xf2a866 }
  ]
};

// Second family: quarried stone -> cut/polished stone -> faceted gem.
// Its first on-board source is earned from an early order rather than being
// available at the start. The matching score curve lets both families share
// the same merge and economy rules.
//
// Renamed from an earlier fantasy-crystal framing (Amethyst/Geode/
// Crystal Cavern/Radiant Core) to grounded quarry-and-lapidary material
// names, to match wood's "raw industrial material -> refined ornamental
// object" story instead of a magic-cave one - both chains now read as the
// same idea in two materials, not two different genres.
export const STONE_CHAIN: ChainDef = {
  typeId: 'mineral',
  tiers: [
    { tier: 1, key: 'slate', label: 'Slate', color: 0x485562 },
    { tier: 2, key: 'rubble', label: 'Rubble', color: 0x566676 },
    { tier: 3, key: 'gravel', label: 'Gravel', color: 0x506274 },
    { tier: 4, key: 'polished-stone', label: 'Polished Stone', color: 0x687b8d },
    { tier: 5, key: 'marble', label: 'Marble', color: 0x929faa },
    { tier: 6, key: 'granite', label: 'Granite', color: 0xb3818a },
    { tier: 7, key: 'quartz', label: 'Quartz', color: 0xafbac1 },
    // The sapphire tiers retain a restrained geological blue, but it is
    // dark, greyed and far from Water's bright cyan ramp.
    { tier: 8, key: 'sapphire', label: 'Sapphire', color: 0x40566e },
    { tier: 9, key: 'star-sapphire', label: 'Star Sapphire', color: 0x5d7389 }
  ]
};

// Third family: raw sand -> cut/translucent crystal. Unlike Wood (warm,
// saturated) and Stone (cool, saturated blue), Glass's ramp stays
// deliberately DESATURATED and trends toward near-white/pale at tier 8 -
// "clarity" is its refinement story, not rising saturation, which also
// keeps it visually distinct from both existing chains at a glance. See
// docs/FAMILIES_ROADMAP.md's "Shape grammar" section - Glass is the first
// chain built against that shared 8-tier shape ladder rather than
// inventing its own bespoke per-tier shapes the way Wood/Stone did.
export const GLASS_CHAIN: ChainDef = {
  typeId: 'glass',
  tiers: [
    { tier: 1, key: 'raw-sand', label: 'Raw Sand', color: 0x9c8f6f },
    { tier: 2, key: 'glass-shard', label: 'Glass Shard', color: 0x8f9a8a },
    { tier: 3, key: 'cut-glass-block', label: 'Cut Glass Block', color: 0x9fb0ac },
    { tier: 4, key: 'crystal-block', label: 'Crystal Block', color: 0xafc4c2 },
    { tier: 5, key: 'beveled-crystal', label: 'Beveled Crystal', color: 0xbdd6d6 },
    { tier: 6, key: 'crystal-obelisk', label: 'Crystal Obelisk', color: 0xcce4e6 },
    { tier: 7, key: 'crystal-lattice', label: 'Crystal Lattice', color: 0xdcf0f2 },
    { tier: 8, key: 'prismatic-knot', label: 'Prismatic Knot', color: 0xeaf8fa },
    // Masterwork capstone. Unlike Wood/Stone (which push further along
    // their existing hue), this shifts hue toward pale lavender instead of
    // staying on tier 8's pale-cyan lean - tier 8's near-white cyan left
    // very little room to differentiate a 9th pale-cyan step, and a hue
    // shift is a more honest "aurora" (iridescent, color-shifting) read
    // than just another few RGB points of brightness.
    { tier: 9, key: 'aurora-crystal', label: 'Aurora Crystal', color: 0xe8e6fb }
  ]
};

export const WATER_CHAIN: ChainDef = {
  typeId: 'water',
  tiers: [
    { tier: 1, key: 'droplet', label: 'Droplet', color: 0x315f86 },
    { tier: 2, key: 'twin-drops', label: 'Twin Drops', color: 0x356f9b },
    { tier: 3, key: 'triple-ripple', label: 'Triple Ripple', color: 0x3980ae },
    { tier: 4, key: 'water-pool', label: 'Water Pool', color: 0x3d90be },
    { tier: 5, key: 'flowing-stream', label: 'Flowing Stream', color: 0x42a0cc },
    { tier: 6, key: 'water-basin', label: 'Water Basin', color: 0x48afd7 },
    { tier: 7, key: 'pressure-jet', label: 'Pressure Jet', color: 0x52bde0 },
    { tier: 8, key: 'cascade', label: 'Cascade', color: 0x60c9e7 },
    { tier: 9, key: 'whirlpool', label: 'Whirlpool', color: 0x72d3ec },
    { tier: 10, key: 'water-sphere', label: 'Water Sphere', color: 0x86dcf0 },
    { tier: 11, key: 'tidal-ring', label: 'Tidal Ring', color: 0x9ce5f4 },
    { tier: 12, key: 'hydro-core', label: 'Hydro Core', color: 0xb4edf7 }
  ]
};

/**
 * The Decagon. ONE TIER, and that is the whole point: its items cannot merge
 * with anything, so they are not a ladder to climb but a stake to hold. Ten of
 * them sitting on the board at once fills the Decagon meter, which consumes
 * them and pays out.
 *
 * Everything else in the game asks for merges and gives board space back as a
 * reward. This asks for board space and gives it back only when you cash in -
 * so it is the one family whose cost is measured in cells rather than in
 * energy, credits or time.
 */
export const DECAGON_CHAIN: ChainDef = {
  typeId: 'decagon',
  tiers: [
    // Light for a violet, on purpose. Everything in this family - the solid,
    // the five pieces and the machine - takes its ramp from this one colour,
    // and a mid violet's shaded end lands too close to the dark board for a
    // 40px piece to read. Starting the ramp higher fixes all three at once
    // rather than patching each drawing's tones separately.
    { tier: 1, key: 'decagon', label: 'Decagon', color: 0xb0a0ea }
  ]
};

export const CREDIT_CHAIN: ChainDef = {
  typeId: 'currency-credit',
  tiers: [
    { tier: 1, key: 'credit', label: 'Credit', color: 0xe7aa32 },
    { tier: 2, key: 'twin-credits', label: 'Twin Credits', color: 0xecb33a },
    { tier: 3, key: 'credit-stack', label: 'Credit Stack', color: 0xf0ba43 },
    { tier: 4, key: 'credit-roll', label: 'Credit Roll', color: 0xf3c34e },
    { tier: 5, key: 'credit-bundle', label: 'Credit Bundle', color: 0xf6cc5a },
    { tier: 6, key: 'credit-vault', label: 'Credit Vault', color: 0xf9d66b }
  ]
};

export const ENERGY_CURRENCY_CHAIN: ChainDef = {
  typeId: 'currency-energy',
  tiers: [
    { tier: 1, key: 'energy-spark', label: 'Energy Spark', color: 0x24a9e8 },
    { tier: 2, key: 'energy-pair', label: 'Energy Pair', color: 0x2ab3ed },
    { tier: 3, key: 'power-cell', label: 'Power Cell', color: 0x35bef0 },
    { tier: 4, key: 'energy-core', label: 'Energy Core', color: 0x48c9f2 },
    { tier: 5, key: 'full-charge', label: 'Full Charge', color: 0x61d3f4 }
  ]
};

export const GEM_CURRENCY_CHAIN: ChainDef = {
  typeId: 'currency-gem',
  tiers: [
    { tier: 1, key: 'gem-shard', label: 'Gem Shard', color: 0x9d70c2 },
    { tier: 2, key: 'gem-pair', label: 'Gem Pair', color: 0xaa7dca },
    { tier: 3, key: 'cut-gems', label: 'Cut Gems', color: 0xb789d2 },
    { tier: 4, key: 'gem-cluster', label: 'Gem Cluster', color: 0xc497db },
    { tier: 5, key: 'crown-jewel', label: 'Crown Jewel', color: 0xd2a6e3 }
  ]
};

export const CURRENCY_CHAIN_IDS = ['currency-credit', 'currency-energy', 'currency-gem'] as const;
export function isCurrencyChain(typeId: string): boolean {
  return (CURRENCY_CHAIN_IDS as readonly string[]).includes(typeId);
}

export const CHAINS: ChainDef[] = [
  WOOD_CHAIN, STONE_CHAIN, GLASS_CHAIN, WATER_CHAIN, DECAGON_CHAIN,
  CREDIT_CHAIN, ENERGY_CURRENCY_CHAIN, GEM_CURRENCY_CHAIN
];

/**
 * Families that are UTILITIES rather than merge ladders: they never appear in
 * orders and never turn up as crate loot, because neither system has anything
 * to price them against. Water is a production utility; Decagon is a stake.
 *
 * Kept here rather than as a `typeId !== 'water'` test repeated in Orders and
 * Rewards - which is exactly how glass once went missing from generated
 * orders for as long as it did.
 */
/**
 * How many piece tiers merge up into a source. Four everywhere - the pieces
 * are 1-2-3-4 and the fourth merge builds the source - except the Decagon,
 * which takes FIVE, so it costs sixteen tier-1 pieces rather than eight.
 * That doubled cost is what keeps a temporary dispenser an event.
 */
export function spawnerPieceTiers(typeId: string): number {
  return typeId === 'decagon' ? 5 : 4;
}

export const UTILITY_CHAIN_IDS = ['water', 'decagon'] as const;
export function isUtilityChain(typeId: string): boolean {
  return (UTILITY_CHAIN_IDS as readonly string[]).includes(typeId);
}

export function getChain(typeId: string): ChainDef {
  const chain = CHAINS.find((c) => c.typeId === typeId);
  if (!chain) throw new Error(`Unknown chain typeId: ${typeId}`);
  return chain;
}

export function getTierDef(typeId: string, tier: number) {
  const chain = getChain(typeId);
  const def = chain.tiers.find((t) => t.tier === tier);
  if (!def) return null; // null means "max tier reached, no further merge"
  return def;
}

// Weighted spawn pool - lower tiers spawn far more often.
// Index = tier - 1, value = relative weight.
export const SPAWN_WEIGHTS = [60, 30, 8, 2];

export function rollSpawnTier(): number {
  const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
    roll -= SPAWN_WEIGHTS[i];
    if (roll <= 0) return i + 1;
  }
  return 1;
}
