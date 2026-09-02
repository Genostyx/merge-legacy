# Retention roadmap

What would take this from "a good session" to something worth playing for
months. Written 2026-08-29.

## The thesis

**The art promises a systems game. The material chain is Minecraft's. The one
thing missing is the loop that connects them.**

The visual direction is modern, dark minimalist, organic minimalist and
brutalist, with about 10% industrial techno - dark grounds, abstract geometric solids, a fixed hard light,
natural materials welcome
and no representational illustration. That is the language of Mini Metro,
Factorio, Opus Magnum: *this is a machine you are operating, and you can
operate it badly.* Nothing else in the genre looks like this; every competitor
is candy.

The materials are wood, stone and sand-to-glass. That is not an incidental
overlap with Minecraft, it is the crafting-fantasy spine. The sources are
already isometric buildings that upgrade through architectural tiers - a base
being developed. The owner's framing is that this game sits closer to
Minecraft than to Merge Mansion, and the code agrees.

The mechanics currently deliver a pleasant, unloseable merge game. Tap a
source, merge what falls out, hand it to an order, repeat. It is genuinely
satisfying minute to minute - the dispenser recharge beat is the best thing in
the game - but there is no sitting where you can do worse than another.

The game is NOT idle and must not be described as one: nothing is automated,
every action is a deliberate input - each source tap, each merge drag, each
delivery. Offline reservoir refill is a recharge timer, not idle production.
That sharpens the problem rather than softening it. An idle game is *supposed*
to run without stakes; being unloseable is a genre feature there. Here the
player makes hundreds of active decisions per session and **none of them can
be wrong**, which is a far stranger thing to ask of someone.

## What actually retains

Two conclusions had to be walked back while writing this doc. Both are
load-bearing, so they are recorded rather than quietly patched.

**Narrative is not the variable.** The naive argument was "merging needs a
story to justify it," pointing at Merge Mansion. Candy Crush kills that: no
narrative, ten-year retention. The owner's own play history kills it harder -
Merge Cruise's story was *the worst part of the game*, Township's journey story
is *annoying and skipped every time*, Tasty Travels' is barely memorable. That
is a player who finished these games and skipped their narratives. If story
were doing the work, skipping it would cause churn. **Treat narrative as
near-proven NOT load-bearing in this genre.**

**A chapter ladder is not universal either.** The replacement claim was "every
retaining game ships a gated task ladder." Minecraft kills that: no chapters,
no numbered map, no task list, over a decade of retention. That claim was
generalised from three games in one genre.

What Minecraft has instead is three things, and this game has one and a half:

| | has it? | where it lives here |
|---|---|---|
| Capability progression | **half** | source tier sets the base drop tier - real, but capped at 5 and invisible |
| Something persistent you keep | **yes** | the sources. The owner is explicit: they are the persistent layer, and they must stay *beneficial* or there is no reason to keep them |
| Self-directed goals | not sought | deliberately not pursued - the owner did not select it |

So the retention answer for THIS game is not a story and not a chapter map. It
is the facility: **a persistent thing you own, that gets more capable, and
whose remaining growth you can see.** That one object does the job of the
ladder, the capability tree and the keepsake at once - and it is already
half-built.

## The missing loop

**Items and the facility are two economies that never touch.**

You merge up to a tier-9 Aurora Crystal, and its only use is to be handed to an
order for credits. Nothing you make ever improves what you keep. Sources arrive
exclusively through `rewardSpawner` on authored orders, so the player has no
agency over the persistent layer at all - it is dispensed to them.

In Minecraft the diamonds you mine *become* the pickaxe, and the pickaxe
reaches material you could not touch before. That is the whole engine, and it
is the one structural piece missing here.

Everything in Tier 1 exists to close that loop.

## Tier 1 - Close the loop: items must feed the facility

Highest leverage in the document. It makes the top of the merge chain matter,
gives the player agency over the persistent layer, and turns the source
buildings into the game's spine rather than its furniture.

- **Let high-tier items be spent on the facility.** Installing a tier-7
  Sapphire to upgrade the mineral source, rather than selling it for credits,
  is the diamond-to-pickaxe step. Sources currently only upgrade by merging two
  of themselves (`mergeDispenserPair`), so the item chain and the source chain
  never interact. This is the single change that makes a tier-9 masterwork
  *worth making* instead of worth selling.
- **Make the choice a real one.** Deliver it for credits now, or install it for
  permanent capability. A genuine tradeoff between short-term income and
  long-term throughput - the kind of decision the aesthetic has been promising
  all along.
- **`MAX_DISPENSER_TIER = 5` is settled - leave it.** The item ladder is 9
  tiers and the source ladder is 5, and with `collectDispenser`'s +2 bonus
  ceiling the highest tier that can ever drop is 7. Tiers 8 and 9 are
  merge-only by construction. That was initially written up here as a problem;
  the owner confirmed it follows genre convention and is correct as-is.
  **The live question is not the cap, it is what tiers 8 and 9 are FOR.**
  Right now the answer is "sell them to an order," which is the same answer as
  tier 3 - so the two most expensive things in the game are worth nothing but
  money. Whatever the item-to-facility loop turns out to be, the capstone
  tiers are what most need somewhere to go.
- **Give the player a reason to hold more than one source per family.** The
  owner's constraint is that persistent things must be *beneficial* or they
  will not be kept. Two wood sources are currently strictly better than one
  with no decision attached; sources that specialise (Tier 4) would make a
  collection of them a real portfolio.

## Tier 2 - Make the board loseable

A decision is only a decision if it can be wrong, and right now no placement,
purchase or merge can be.

- **Correction to an earlier draft of this document.** It claimed no sell path
  existed anywhere in `src/`. That was wrong - `sellSelectedItem`,
  `sellValueFor` and the action tray's SELL button have been there all along.
  The claim came from a grep whose output was truncated by `head -20`, so only
  comment matches were seen. Board pressure DOES have a valve.
- **The deadlock decision was deliberate, not neglected.** `checkDeadlock()` is
  called, and its body intentionally does nothing but unlock input; its comment
  reads *"A full board is now recoverable through deliberate item selling.
  Never seize control or destroy a piece on the player's behalf."* That is a
  designed stance, and a defensible one. What remains literally unused is
  `Grid.isDeadlocked()` (written and unit-tested, never invoked) and
  `BoardScene.deadlockOverlay` (declared, nulled, never built).
- **So the real question is narrower than "add a fail state".** Selling makes a
  full board recoverable, which means it can never be *lost* - only slowly
  bled. The open design question is whether a full board should cost the player
  anything beyond the sell price: today the answer is no, and that is why no
  placement can be wrong. Options if stakes are wanted: make the sell price
  punitive when the board is full, or have `isDeadlocked` drive a real "you are
  stuck, here is what it costs" moment rather than sitting unused.
- **Surface board pressure before it bites.** A free-cell count, or the frame
  tightening as it drops below ~6. The squeeze must be visible coming, or
  failure reads as unfair instead of earned.

## Tier 3 - The facility as the visible ladder

This replaces the chapter-ladder idea entirely. The player should be able to
see what their operation is and what it could still become - no narrative, no
chapter numbers.

- **Show the capability that already exists.** A tier-3 source drops tier-3
  items, skipping two merge steps - genuinely powerful, and almost certainly
  invisible to the player. Board metadata was deliberately removed, so this
  belongs in the selection receipt/tray: what this source produces, what it
  holds, what the next tier would give.
- **Show empty plots.** Visible un-owned source sites are "content ahead"
  without a word of story, and the locked-cell pattern already on the board is
  the same idea applied to items. This is the map Candy Crush has and a player
  level number cannot be: a counter says where you have been, a plot says what
  is still to come.
- **Let the facility be inspected as a whole.** The sources are the collection
  worth showing off, not just the items - they are what the player kept.
- **Then the item collection.** The 8-tier shape grammar across families
  (`FAMILIES_ROADMAP.md`) is already a Pokedex and nothing displays it. A
  gallery, silhouetted until first discovered, costs no new systems and
  showcases the art, which is the project's best asset.

## Tier 4 - Decisions with tradeoffs

Stakes and capability need choices to attach to. Currently the optimal play is
the only play: tap everything, merge everything, deliver everything.

- **Differentiate the families mechanically.** They differ in colour, shape and
  recharge rate only. The capacity tables already hint at personality (wood
  starts generous and shrinks, mineral starts stingy and grows into a prestige
  reservoir) - lean in. If one produced in bursts, one slowly at a higher base
  tier, and one unpredictably, *which source to spend on* becomes a question.
- **Make board space compete with itself.** Once space is scarce (Tier 2),
  holding a high tier for a future order genuinely costs the ability to work
  now. Needs no new systems, only the scarcity to be real.
- **Make energy a choice, not a tax.** At 100 cap against a 30-drop wood
  reservoir, energy cannot bind before the reservoirs do - pinned by a test,
  deliberately, to protect the recharge beat. Correct today, but it means
  energy is never spent *instead* of something. Competing sinks (facility
  upgrades, board-clears, rerolls) turn the same budget into decisions.
- **Contracts, if variety is still thin after the above.** A fixed board, fixed
  goal and hard limit that can be failed. Demoted from earlier drafts: with the
  facility carrying the long horizon, a separate mode is a large build for a
  need that may already be met.

## Tier 5 - Texture

Cheap, disproportionately felt.

- **Variable reward is already shipped and wants tuning, not adding.**
  `collectDispenser` rolls a 5% chance of +2 tiers and 23% of +1. That is the
  Candy Crush cascade, already in the code. Make sure it is *felt* - a bonus
  drop should announce itself.
- **A clean end-of-session beat.** The game currently just continues. A "here
  is what you did" moment makes returning feel like a return.
- **Make the offline return a payoff.** Reservoirs already refill offline;
  landing on a board of full, lit sources should be presented as a reward
  rather than discovered incidentally.

## What NOT to do

- **Do not write a narrative.** It fights the art, it is the most expensive
  content type per hour of retention, and the owner's own play history says it
  is the part players actively skip. Build the ladder it would have wrapped and
  skip the wrapper.
- **Do not build a chapter/task ladder either.** Minecraft is the
  counterexample; the facility is this game's version and it is already
  half-built.
- **Do not soften toward cozy.** Every competitor is warm and illustrated.
  Being the cold precise one is a market position, not a taste.
- **Do not remove the dispenser wait.** Established: the short recharge IS the
  fun. Every gate here sits alongside it, never replaces it.
- **Do not add families before closing the Tier 1 loop.** A fourth family
  multiplies content and creates no stakes, and it is the most expensive thing
  to build - nine tiers of new art.

## Bugs found while writing this

- **Resolved: generated-order families now follow owned dispensers.** Family
  eligibility is no longer unlocked by player level alone. Wood, Stone, or
  Glass can enter a newly issued order only after the player owns at least
  Source 01 for that family. Each order snapshots its eligible families when
  issued, so acquiring another source never rewrites an in-progress order.
- **Generated orders never curve.** Flat wave formula: rewards climb linearly,
  tier every 4 waves, count caps at 3. Wave 40 is wave 4 with bigger numbers.

## Open questions only playtesting answers

Everything above reasons from the systems, not from watching anyone play.

- Does board pressure read as tense or as annoying? The entire bet of Tier 2,
  and genuinely uncertain.
- Would a player *choose* to install a tier-9 item rather than sell it, or does
  giving up the credits feel purely like a loss? Tier 1 depends on the install
  being visibly worth it.
- ~~Does upgrading wood read as a downgrade?~~ **Resolved 2026-08-29: fixed
  rather than watched.** Wood ran 30 -> 14 across its five source tiers and
  glass ran 18, 21, 24, 18, 20 - climbing, dropping, then climbing again. Both
  were the retired batch-based config multiplied out rather than designed
  curves. Reservoir capacity is now FLAT across tiers: a family trait, not a
  tier one. Growing it with tier was tried first and reverted - more banked
  drops means the player reaches the recharge timer less often, and that wait
  is the best beat in the game, so it would have paid twice for an upgrade
  that is already generous with the second payment taken out of the cadence.
  Upgrading a source changes what it DROPS (a tier-2 source produces tier-2
  items, an entire merge step more per tap) and nothing else.
- Does the energy cap ever bind for a normal player? One tester ran out and the
  owner never has (`TODO.md`), suggesting it tracks merge speed rather than
  session length.
- ~~Unresolved doc discrepancy on the recharge base.~~ **Resolved
  2026-08-29:** `DISPENSER_ENERGY_RESEARCH.md` said 10s and derived its whole
  family ladder from that; the code has always been `BASE_RECHARGE_MS = 5000`
  and the owner specified 5s twice. The doc is corrected (5s / 10s / 20s /
  40s...), as is the same ladder restated in `FAMILIES_ROADMAP.md`.
