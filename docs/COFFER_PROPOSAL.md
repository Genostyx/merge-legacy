# The Coin Coffer

Designed 2026-09-18, approved in principle, NOT built. Open questions are
marked; everything else is settled.

## What it is

A crate, sitting OFF the bronze - silver - gold - vault ladder rather than
on it. Those four are a general-loot size ladder. The coffer is the first
THEMED crate: it contains only coins.

Being off the ladder is also what frees its art. It is supposed to look
unlike the four chests, so a banded strongbox does not muddy their
silhouette progression.

## Why a crate and not a producer

The owner's own framing is that crates are temp producers too, like the
baskets, and that is right - the structural difference is narrower than the
two class names suggest. A producer is HOMOGENEOUS: one `typeId`, N charges,
variance only in tier through `rollResourceTier`. A crate is HETEROGENEOUS: a
rolled list of contents.

The coin producer ladder is already flat and finished - pouch 10, basket 20.
A coffer at 40 is another rung where the player does the identical thing for
longer, and adds no decision. Crates are where the variance already lives,
and rolled outcomes over flat ones is the owner's standing preference.

## The two constraints

1. **It pays coin ITEMS, never wallet credits.** `{ kind: 'item', typeId:
   'currency-credit' }` entries, not the `coins` payload kind.

   This is an opt-OUT, not a default. `cratePayload` already supports
   `{ kind: 'coins', amount }` and deliberately orders currencies first "so
   a crate pays out immediately and visibly" - so a coffer written the
   obvious way would pay straight into the wallet and cost the player
   nothing. Board space and merge effort are the price that stops it being
   free money.

   NOTE: this rule is the coffer's, not the game's. The Legacy Machine pays
   directly into the currency chip ON PURPOSE, because it pays sums far too
   large to put on a board. `LegacyMachine.ts`'s header currently argues the
   opposite and is either stale or describes behaviour the owner does not
   want - worth checking during the next machine pass.

2. **It opens.** Crates have hinged lids, an open state and a hollow
   interior, so the coffer needs a closed AND an open render - meaningfully
   more art than a producer, which needs one.

## The spread

The variance is in the DENOMINATION, not the count. Mostly tier 1-2 coins,
a small chance of tier 3, a rare tier 4. Because coins merge, a tier 4 is
worth far more than four tier 1s, so the payoff is spiky rather than linear
- variance the player feels on opening rather than a number they read.

Starting points, both to be tuned:

- Item count: rolled 8-16, sitting between coin pouch (10 flat) and coin
  basket (20 flat), with the range doing the work the extra capacity would
  otherwise do.
- Tier weights: roughly 70 / 20 / 8 / 2 across tiers 1-4.

**OPEN:** the owner is not convinced the weights are the right shape. Start
here, expect to move it.

## Where it comes from

**OPEN, and deferred.** Every option touches something:

- Shop, for gems - least disruptive to pacing, and paying to roll suits the
  mechanic. Recommended.
- A fourth crate-meter threshold - the meter stops at gold/100 collects, so
  a new rung changes the whole meter's pacing.
- Order or milestone reward - displaces something already in those tables.

## What it costs to build

Nothing existing changes if it is shop-only: a new `CrateTier` member, a
label, a slot-count entry, a payload roller, and the two renders.
`CrateTier` is a union type, so adding to it makes the compiler list every
switch that needs a case.

No save migration. A coffer on the board serialises through the existing
crate cell shape; old saves simply never contain one.
