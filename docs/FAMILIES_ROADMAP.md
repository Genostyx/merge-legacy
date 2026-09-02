# Families & items roadmap

Planning reference only - this is a map of *possible* content, not a build
list. None of the new rows below are implemented; Wood, Stone, and Glass
exist in `src/game/data/chains.ts` today (this doc's earlier draft only
listed Wood/Stone as built and still had Glass as a candidate - since
fixed). Scope stays modeled on Tasty Travels ("look at how far we can get
with equivalents"), but themed to this game's own "raw industrial material
-> refined ornamental object" story (see the comment block at the top of
`chains.ts`), not Tasty Travels' cooking theme.

No exhaustive official item list exists for Tasty Travels (500+ ingredients,
no datamined wiki found) - this roadmap borrows its *structure* (many
parallel chains + a few cross-cutting item categories), not its literal
item names.

## Existing chains (built)

| Family | typeId | Tier 1 | Tier 4 | Tier 8 | Tier 9 (masterwork) |
|---|---|---|---|---|---|
| Wood | `wood` | Scrap Wood | Maple Block | Gilded Rosewood | Rosewood Heirloom |
| Stone | `mineral` | Gravel | Polished Stone | Sapphire | Star Sapphire |
| Glass | `glass` | Raw Sand | Crystal Block | Prismatic Knot | Aurora Crystal |

## Shape grammar (shared across every family)

Design correction: a family's tiers should NOT each invent a different
*named object* (Porcelain Vase vs. Glass Paperweight vs. Concrete Form -
the earlier draft of this doc did this and it's the wrong axis). The
**shape/geometric-complexity progression is shared across all families**;
only the material (color, surface, translucency, hardness of edge) varies
per family. This matches the existing rule already stated at the top of
`TierIcons.ts` - "refinement = increasing geometric order, not added
decoration" - and folds in the two shape references saved earlier this
project (`mergegame_prestige_shape_refs.md`: a faceted obelisk/prism
progression, and a blocky-interlocking-cross -> smooth-interlocking-knot
progression), which are really just tiers 6-8 of this same grammar.

**Acceptance test for every tier step (not just the grammar as a whole):**
a merge has to read as the result getting *better*, not just *different*.
This is the actual reason the shape grammar matters - a user complaint
about "certain merge games" is items merging into something barely
related that doesn't feel like an improvement, which kills the core
satisfaction of merging. Concretely: each tier's silhouette should be
visibly more refined/ordered/complex than the one before it at a glance,
never a same-complexity reskin and never a jump that reads as sideways
rather than up. If a proposed tier doesn't clearly read as "an upgrade
from the previous tier" in a silhouette-only comparison, it's wrong
regardless of how it fits the grammar's stage names.

| Tier | Shape stage | Notes |
|---|---|---|
| 1 | Rough/irregular chunk | Amorphous, no defined geometry - raw material as found |
| 2 | Irregular chip/shard | Slightly more defined, still rough |
| 3 | Cut block/slab | First clean rectilinear form appears |
| 4 | Squared block | Fully regular cube/rectangular solid |
| 5 | Beveled/faceted block | Cut corners, a few flat facets |
| 6 | Faceted prism/obelisk | 4-10 sides, tall faceted volume - the saved obelisk/prism reference |
| 7 | Interlocking compound form | Blocky interlocking cross/lattice - start of the saved knot-sculpture reference |
| 8 | Smooth interlocking knot | Fully refined torus/ring knot - end of the saved knot-sculpture reference |

Every family (existing or new) walks this same 8-stage shape ladder.
Retrofitting the two pre-grammar chains is an incremental `TierIcons.ts`
task:

- **Wood tiers 7-8: done.** They previously both called `drawTurnedForm`
  with *identical arguments* - the same silhouette, differing only by a
  5%-larger specular ellipse and some sparkles. Now on the grammar's real
  stages via `drawJoineryLattice` (7) and `drawWovenKnot` (8), expressed
  in wood's own joinery language rather than reusing Glass's helpers (see
  each helper's doc comment for why a shared call would have been the
  near-identical-params bug). Tier 9 moved with them - see below.
- **Wood tiers 1-6: still pre-grammar** named/colored progressions, but
  each is a distinct silhouette, so this is cosmetic debt, not a bug.
- **Stone tiers 7-9: done.** Were three consecutive `drawFacetedForm`
  calls differing only by side count (6/8/10) and scale - a hexagon,
  octagon and decagon all converge on "circle" at icon size. Now real
  lapidary cuts in Stone's own language, each with a different OUTLINE:
  step cut -> marquise -> round brilliant.
- **Glass tiers 8-9: done.** Tier 9 was tier 8's knot plus a 4th ring,
  which is invisible at icon size. Tier 9 now fills its centre with a
  solid faceted crystal - hollow vs cored is the change that survives at
  45px, where ring-counting did not.

**Tier 9 - masterwork capstone, per-chain decision, not part of the shared
grammar.** Wood, Stone, and Glass each gained a 9th tier beyond this
8-stage ladder (Rosewood Heirloom / Star Sapphire / Aurora Crystal),
reusing each chain's own tier-8 shape helper with a genuine silhouette
variation (not just more decoration - see `drawWovenKnot`'s `lobes` param
(3 at tier 8 vs 5 at tier 9), `drawFacetedForm`'s higher side-count, and
the new independently-angled ring on `drawInterlockingKnot`) plus an
escalated luxury accent. Note this makes tier 9 structurally dependent on
tier 8's shape: changing a chain's tier-8 helper means changing its tier
9 too, or the capstone merge silently becomes a sideways jump.
This was a request for these three specific chains, not a change to the
grammar itself - a future new chain (Clay, Metal, Concrete, etc.) should
default to 8 tiers unless a 9th is separately asked for.

**Checklist for every new family's tier art** (found missing when building
Glass - `drawGranite` (Stone tier 6) turned out to call `drawBlock` with
the exact same proportions as `drawMapleBlock` (Wood tier 4), a literal
duplicate silhouette across chains, fixed by moving Granite to the
obelisk stage):
- Before finalizing a tier's shape helper call, grep `TierIcons.ts` for
  other calls to the same helper (`drawBlock(`, `drawFacetedForm(`, etc.)
  and diff the parameters - identical or near-identical numbers across
  different chains/tiers is the bug, not a coincidence to leave alone.
- Tier 1-2 "rough chunk" silhouettes are allowed to read as a *family* of
  similar shapes across chains (that's the shared grammar working as
  intended, differentiated by color) - the duplicate-check matters most
  from tier 3 up, where shapes should read as deliberately engineered.

**Source recharge for a new family is already decided - don't invent one.**
Every family regenerates one drop every `5s x 2^(familyIndex)` in unlock
order (Wood 5s, Stone 10s, Glass 20s, next family 40s, then 80s...). In
code this is `FAMILY_RECHARGE_ORDER` in `Dispensers.ts` - append the new
family's `typeId` to the end of that array and the timer follows
automatically. Appending matters: slotting a family into the middle
silently re-times every family after it. Full rule and its consequences:
`docs/DISPENSER_ENERGY_RESEARCH.md`, "Per-family recharge ladder."

**Soft-lock note - no per-family work needed:** granting a family's second
spawner before its locked tier-1 cells are cleared can permanently strand
those cells (see `Grid.hasLockedItem` and `canSafelyDeliverSpawnerReward`/
the spawner-merge guard in `BoardScene.ts`, added after this was caught
for Wood). Both guards are generic over `typeId`, so every new family gets
this protection automatically - nothing to add when building Clay, Metal,
etc.

## Candidate new material families (not built)

Filter (user's rule): a family only qualifies if it could plausibly be
shaped into the geometric/paperweight-like forms above, or reads as
modern/minimalist. Soft or organic materials fail this even if they sound
thematically nice - Textile, Paper, Leather, and Botanical were all cut on
this basis (soft goods, or living material, not shapeable into the hard
forms the grammar above needs). Wood, Stone, and Glass all already pass -
Glass moved from this table to "Existing chains" once it was built.

| # | Family | Material identity (what varies per tier) | Notes |
|---|---|---|---|
| 4 | Clay | Raw earthenware -> fired, glazed ceramic | Pairs visually with Stone; matte-to-glossy glaze shift across tiers |
| 5 | Metal | Raw scrap -> brushed/polished steel | Cool metallic ramp, specular highlights increase with tier |
| 6 | Concrete | Raw pour -> polished aggregate | Matches the brutalist 20% of the project's 70/20/10 visual direction (see README) |
| 7 | Resin/Acrylic | Cast raw resin -> clear cast acrylic | Modern minimalism; translucency ramp similar to Glass but warmer/softer |
| 8 | Wax | Raw wax -> smooth cast wax | Matte, soft-edged even at high tiers - the one family that stays non-reflective |

Cut for failing the filter (kept here so they aren't re-proposed later
without a reason): Textile, Paper, Leather (explicitly called out),
Botanical.

Deliberately not proposed: a second gem/crystal chain split out of Stone -
Sapphire already caps Stone as the prestige tier under the old naming
scheme; under the shared shape grammar above, Stone's own tiers 6-8 already
cover the obelisk/interlocking-knot territory, so a separate gem family
would be redundant. Revisit only if we want a third parallel "prestige"
material track later.

## Cross-cutting item categories (Tasty Travels equivalents)

Ideas for *mechanics*, not new chains - each maps to a Tasty Travels
category from the research:

| Tasty Travels category | Our equivalent | Status |
|---|---|---|
| Producers/spawners | Dispensers/sources (`Dispensers.ts`) | Built, 3 families |
| Ingredients | Chain tiers 1-3 (raw end) | Built |
| Prepared items | Chain tiers 4-9 (refined end) | Built |
| Splitters (duplicate one item into two) | — | Not built, possible gem-sink item |
| Omnis (wildcard, satisfies any order slot) | — | Not built, possible rare order reward |
| Event items (seasonal, limited-time) | — | Not built, no event system yet |
| Card album (cross-family collection meta) | — | Not built, bigger scope - see README's "permanent world growth" open item |

## Sequencing note

This list intentionally outpaces what's buildable soon - the point is
having the roster mapped before `LockedBoard.ts`'s progression matrix gets
redesigned (see `TODO.md`), not committing to build all six new chains
now. Pick a small slice (e.g. one new chain) when ready to actually add
content, rather than building this whole list at once.
