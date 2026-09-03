# TODO

## Balance and progression

- [ ] **Finalize spawner-piece family planning**
  - Decide the final piece-art direction.

- [ ] **DECISION: does order income scale past level 30?**
  - Measured from the live generator: average order pays 33 Credits at level 5,
    556 at 10, 1,470 at 15, 1,826 at 20, and then **plateaus at ~2,086 from
    level 30 onward** - flat forever.
  - Cause is structural, not a bug: `typicalOrderWork` tops out at 680 once
    `maxOrderTier` hits the tier-9 cap (level 12) and `maxRequirementCount`
    maxes out. There is no tier 10, so work cannot keep climbing.
  - Consequence: expansion row two costs 1,270,000 Credits, which is ~609
    orders at a reward that never grows again.
  - The honest fix is more FAMILIES (see docs/FAMILIES_ROADMAP.md), not a
    bigger multiplier - widening the ladder is what makes work climb again.

- [ ] **DECISION: close the mid-game Credit trough**
  - Sink totals: expansion row one 127,000, expansion row two 1,270,000,
    living-room project 6,250, plus the recurring coin shop row.
  - Row two is gated at **level 50**. Between finishing row one and reaching
    level 50 the only sinks are the project (trivial) and the shop row, so
    Credits pile up with nothing to buy.
  - Coin-priced supply crates below are the intended recurring sink for
    exactly this window.

- [ ] **DECISION: vault crate at 16 board slots**
  - The vault now uses the chest payload path at 16 slots (gold is 12), which
    means it needs 16 free cells to empty.
  - Either the best version of scarce board space - a vault is a "clear the
    board first" event you plan around - or the crate that sits half-open for
    two sessions and stops reading as a reward.
  - The alternative is holding vault at 12 slots and buying its ~1.6x edge
    purely through richer contents, so it is denser rather than bigger.

## Interface and customization

- [ ] **Build the Settings menu**
  - Make it the prerequisite and container for customization.

- [ ] **Add a Customization tab to Settings**
  - Requires the Settings menu.

- [ ] **Make customization options earnable**
  - Requires the Customization tab.
  - Award options through progression systems such as levels, collections, or crates.
  - Keep customization cosmetic with no gameplay power.

## Art

- [ ] **Draw Wood Source 05 art**
  - Sources 01-04 use the owner's SVGs; 05 still falls back to the generated
    vector building, so the family visibly changes material at the top of its
    own ladder.

- [ ] **Deduplicate Wood 06 and Glass 07 artwork**
  - Replace their shared three-bar asterisk silhouette with clearly different forms.
  - Remove the repeated sparkle constellation across accent tiers.
  - A one-tier Blender reference pilot remains optional.

## Economy and board systems

- [ ] **Add targeted low-tier item purchases for Credits**
  - Let players choose a specific item rather than rely only on rotating random offers.
  - Price from the existing work-value curve with a buying margin above sell value.
  - Cap purchasable tiers so the feature cannot bypass the merge ladder.

- [x] **Add coin-priced supply crates**
  - Bronze 1,500 / Silver 4,000 / Gold 9,000, in a SUPPLY CRATES shop section.
  - Purchased crates occupy a board cell; buying is refused when the board is full.
  - **Crates open immediately.** A per-purchase RESTOCK COOLDOWN gates buying
    instead: 25m / 3h / 6h, stored as an absolute timestamp so it keeps running
    while the game is closed.
  - The sealed-on-the-board timer was removed as too punishing - it consumed
    the scarcest resource, board space, and gave nothing back for hours, which
    reads as a penalty for spending.
  - The old three-sealed-crates cap also bounded throughput far more loosely
    than intended: three concurrent gold crates at six hours each complete
    TWELVE a day, not three, so spending could nearly double a free player's
    piece rate. A cooldown gives an exact ceiling - ~13 units per family per
    day on every tier, against a ~20.4 baseline. Two tests guard it, including
    one that no tier becomes the obvious exploit.
  - Prices sit at roughly 5x the Credit value of the contents, so buying is a
    deliberately worse deal than playing.
  - The vault is never sold - it stays a milestone.
  - Prices are LEVEL-SCALED, not flat: each crate costs a fixed number of
    typical orders' income (1 / 2.5 / 5) via `supplyCratePrice`, which reads
    the live reward curve through `typicalOrderReward`. Flat prices were 45
    orders at level 5 and under one order at level 30 - only correctly priced
    in a narrow band around level 15 - and because crate CONTENTS already
    scale with level, a flat price meant the same Credits bought more the
    longer you played. The store is hidden below level 8.

- [ ] **DECISION: the supply crate sink may still be too small late**
  - Max spend is 3 gold crates a day, ~30,000 Credits at plateau income,
    against 42,000-83,000 earned per day at 20-40 orders. It narrows the
    row-1-to-level-50 trough rather than closing it.
  - Raising `SUPPLY_CRATE_LIMIT` is the WRONG fix - the cap is what bounds the
    piece rate. Add more expensive crate tiers instead, so the Credit drain
    grows while the piece ceiling stays put.

- [x] **Let Gems skip a sealed supply crate's remaining wait**
  - The natural companion to the delay, and already specified for event
    crates under Deferred. Price by tier and by time remaining.

- [x] **Replace the living room's drawn art with rendered art**
  - Five stage renders in `public/rooms/living-0..4.png`, composited from a
    Blender scene at the board's own isometric projection. See
    `docs/ROOM_ART_PIPELINE.md`.
  - Furniture is Kenney's Furniture Kit (CC0, no attribution required), remapped
    to the room palette on import so nothing arrives in its original colours.
  - `drawLivingRoom` is kept only as a fallback when a texture is missing.
  - Image-to-3D generation of a whole room was tried and abandoned - it renders
    convincingly but has no internal structure, and crashed Blender twice. The
    detail is in the pipeline doc so it is not attempted again.

- [ ] **Add a second project room**
  - The pipeline now exists, so this is asset work rather than engineering:
    build the shell, place furniture, render five stages, drop the PNGs in.
  - Stages now cost delivered items as well as Credits, so the project is
    finally worth doing - and it dead-ends at stage 5 on
    `NEXT ROOM COMING SOON`.
  - The facility is the retention object, so a hard stop there is a retention
    cliff. Mostly content, not new systems: same structure, higher tiers.
  - Later rooms should draw on families beyond Wood once more than one family
    is guaranteed owned.

- [ ] **Add the Scrap machine**
  - Accept unwanted board items without spending Energy.
  - Fill a reward meter using `2^(tier−1)` value per item.
  - Award a crate when the meter fills.
  - Present it as a facility and an alternative item sink, not a replacement for selling.

- [ ] **Add an automatic no-Energy material dispenser**
  - Use Water as the provisional output family; the final family is undecided.
  - Build Source 01 from four mergeable pre-dispenser piece tiers.
  - Begin making its pieces obtainable at player level 5.
  - Add its pieces to the existing Bronze, Silver, and Gold chest piece pools at that level.
  - Choose equally between all eligible chest-piece families, provisionally.
  - Implement it as a board dispenser with stored output and one-at-a-time recharge.
  - Do not charge Energy when it produces.
  - Automatically place stored items into its empty neighboring cells, up to the eight surrounding tiles or fewer at an edge.
  - Release at most one stored item per second while a neighboring cell is empty.
  - Use a fixed neighboring-cell placement order.
  - Store 10 items at tier 1 and add 10 capacity per dispenser tier.
  - Use five tiers for now, with capacities of 10, 20, 30, 40, and 50.
  - Merging two Water dispensers fully refills the resulting upgraded dispenser.
  - Allow players to refill an empty Water dispenser instantly with Gems.
  - Price Water refills at 2, 4, 6, 8, and 10 Gems for dispenser tiers 1–5, provisionally.
  - Recharge one stored item in a FLAT 1 second at every Water Source tier.
    Tier scales capacity only (`tier x 10`), not rate - the earlier 1/2/3/4/5
    seconds per tier was dropped, and `cooldownForTier` is the source of truth.
  - Continue recharging while the game is closed, like regular dispensers.
  - Display its recharge pie timer in blue.
  - Use weighted output across exactly three item tiers: the dispenser's base tier, base + 1, and base + 2.
  - Use the same output percentages as regular dispensers.
  - Its stored capacity and refill wait are the production cap.
  - Never include Water-family items in normal orders.
  - Water merges grant half the normal merge XP, rounded down with a minimum of 1 XP.
  - Water items sell for half the normal Credit value, rounded down with a minimum of 1 Credit.
  - Water items can be stored in and retrieved from the normal inventory.
  - Give Water a 12-tier merge chain.
  - Display its Collection page as one grid with 3 columns and 4 rows.
  - Award 1 Gem for each newly discovered Water tier.
  - Make its output useful to the Scrap machine or a future crafting system.
  - Balance it through board-space pressure.

## Time and anti-cheat

- [x] **Pin the daily reset to a fixed 00:00 EST boundary**
  - `dayIndexFor` measured device-local midnight, so changing TIMEZONE granted an extra daily with no clock tampering at all.
  - Now measured against `DAILY_RESET_UTC_OFFSET_MINUTES` (-300), so every player rolls over at the same instant.
  - Fixed offset rather than `America/New_York` on purpose: that zone shifts to EDT for half the year and would hand players a 23- or 25-hour day at each changeover.

- [ ] **Route every timer through one clock module**
  - `Date.now()` is read at 53 call sites - recharge, energy, shop refresh, daily claim, crate timers.
  - None of the protections below are enforceable while each system reads the device clock directly.

- [ ] **Add an offline-progress cap**
  - Credit at most N hours of recharge and energy between sessions whatever the clock claims.
  - Blunts a forward clock jump with no network required, and bounds what a genuinely long absence grants.

- [ ] **Add a monotonic high-water mark**
  - Persist the largest timestamp ever seen; if `Date.now()` returns lower, the clock moved backwards - refuse to credit progress.
  - Cheap, and closes clock rewinding completely.

- [ ] **Fetch a trusted time source at launch**
  - The only real fix for a forward clock jump. An HTTP `Date` response header is a usable trusted clock without building a backend.
  - Must degrade gracefully offline - a Capacitor build has to keep working on a plane.
  - Ceiling worth stating: a purely client-side game cannot be made cheat-proof. These raise the cost from "change your phone clock" to "modify the binary", which is the right target for a single-player merge game.

## Deferred

- [x] **Add timed crates for events**
  - Do not apply timers to general reward crates.
  - Allow multiple event crates to count down simultaneously.
  - Store absolute opening timestamps for offline progress.
  - Show remaining time on each timed crate.
  - Let Gems skip the remaining wait, priced by crate tier and remaining time.
