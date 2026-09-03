# Long-term TODO

Structural work, not features. Nothing here blocks a build; all of it
compounds. Ordered by what I would do first.

Separate from `TODO.md`, which tracks near-term gameplay and polish.

## 1. Split `BoardScene.ts`

~8,600 lines holding layout, shop, collection, project panel, room, rewards,
input and save. Every bug in the 2026-09-03 session came from implicit
ordering inside it - a mask drawn scaled in one place and unscaled in another,
the room panel's hide sweep running before vs after the panel's own objects,
the grid not cleared on the fresh-seed path, a WebGL context never released.
None were hard problems; they were hard to find.

Extract one panel at a time - `ShopPanel`, `ProjectPanel`, `CollectionPanel`,
`HudHeader` - as mechanical moves: no renames, no reordering, no incidental
fixes. Typecheck and tests between each, each step its own commit. Do it when
nobody is testing a build live.

Risk is real: shared mutable state (`views`, `grid`, `modalOpen`,
`roomPanelOpen`) and `create()` ordering are exactly what a refactor
disturbs, and the tests do not cover them. See item 5.

## 2. Tier silhouettes inside a family

Log to planks to stacked planks read as the same brown object at 50px; stone
is worse. Spotting two matching tiers at a glance is the core skill of the
genre, and silhouette carries it, not colour. The 8-tier shape grammar is
already written down in `FAMILIES_ROADMAP.md` - it has not landed on the
board yet. Likely also part of why board pieces feel too small.

## 3. Board contrast on a real phone

Dark pieces on a dark translucent pane over a photo. Reads well on a desktop
monitor; mid-tier pieces may disappear at half brightness outdoors. Check
before players report it.

## 4. First-load weight

~2.3MB of JS, plus SVGs rasterised at boot (several 300KB-1.7MB of path
data), plus a three.js renderer for the room. First load on a mid-range phone
over mobile data is the highest-friction moment in the game and has never been
measured.

## 5. Tests cover logic, not lifecycle

207 tests pass and not one would have caught any bug from the 2026-09-03
session: they all exercise pure functions while every failure was scene
lifecycle. Extracting the layout maths into pure functions that can be
asserted on would pay for itself, and is the safety net item 1 needs.

## 6. Save portability

One localStorage key. Clearing browser data, switching phones, or a private
tab loses the run. Fine now; not fine once someone has 40 hours in. An
export/import code is the cheapest fix.

## 7. Surface the source ladder

The persistent upgradable dispensers are meant to carry retention in place of
a story, but a player sees one wood source and no visible ladder of what it
becomes. If that is the spine, it deserves the surfacing the room project
gets.

## 8. Comb the merge-game subreddits for churn reasons

High priority, and time-sensitive in the sense that it is cheapest to act on
BEFORE the systems harden around a mistake other games already made.

Read what players actually complain about and quit over, not what reviews
praise. Titles to cover:

- Merge Mansion
- Travel Town
- Gossip Harbor
- Merge Cruise: Mystery Puzzle - r/MergeCruise
- Merge Dragons
- Merge Camp

Check each game's own subreddit first, then widen to the general
mobile-gaming and merge subs, app store review sections and the games'
Discords. Guess the r/<GameName> URL directly rather than trusting a search
engine to surface it.

What to come back with: the recurring complaints ranked by how often they
appear and how final they are (annoyance vs "I uninstalled"), each tagged with
whether this game is already exposed to it. Energy economics, board-space
pressure, event FOMO, paywalled progression and story gating are the ones I
would expect to dominate - the point is to find out rather than assume.
