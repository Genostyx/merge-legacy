# TODO Details

This document stores context, constraints, and open decisions for tasks listed in TODO.md.

## Balance and progression

- Continue the retention trajectory in `docs/RETENTION_ROADMAP.md`. Any future long-term item sink needs a clearly presented reward that preserves the established weighted source-output and locked-board progression. Separately, `Grid.isDeadlocked()` and `BoardScene.deadlockOverlay` remain unused; the open question is whether a full board should cost anything beyond the existing sell price.

- **Spawner-piece family follow-up.** Family order is Wood -> Stone -> Glass. Wood is available at levels 1-9, Stone joins at 10-19, and Glass joins at level 20 onward. Approved piece names are Wood: Cut Timber, Joined Beams, Timber Frame, Roofed Frame; Stone: Cut Stone, Joined Stone Beams, Stone Framework, Roofed Stone Frame; Glass: Glass Panel, Joined Panels, Glass Framework, Roofed Glass Frame. Keep the current Water-piece artwork for now. A possible future replacement is a four-step set of recognizable well-construction parts: stone ring section, support frame, crank assembly, and roof section.
   - Water dispenser architecture begins with a masonry-only well at Source 01, adds timber supports and a crank at Source 02, and adds the pitched roof at Source 03. Later source tiers continue improving the structure.
   - Each dispenser family has four pre-dispenser piece tiers. They take board cells and merge 2-to-1 like normal items: piece 01 -> piece 02 -> piece 03 -> piece 04 -> dispenser 01. The resulting source still displays as that family's dispenser 01, because dispensers themselves can later be merged.
   - Spawner pieces are sellable, likely for low credits so board cleanup is possible without making chests into a currency exploit.
   - Chest roll counts are fixed ranges/counts: Bronze chest drops exactly 4 to 5 total items; Silver chest drops exactly 8 total items; Gold chest drops exactly 12 total items.
   - Per-slot spawner-piece odds start here, pending tuning from play: Bronze chest has piece 01 at about 10-15% and piece 02 at about 2-5%; Silver chest has piece 01 at about 35-45%, piece 02 at about 10-15%, and piece 03 at about 5%; Gold chest has piece 01 at about 50-60%, piece 02 at about 25-30%, piece 03 at about 10-15%, and piece 04 jackpot at about 1-3%.
   - A non-spawner roll should still produce a reward: normal merge item, credits, energy, gems, or another approved chest reward. No empty slots.
   - Family availability is level-banded without removing older families. At levels 1-9, chests only drop the first dispenser family's spawner pieces. At levels 10-19, the next dispenser family is added to the possible spawner-piece pool, while the earlier family remains available so players can continue upgrading it. Continue that pattern by decade for later families.
   - Implemented family order currently follows the existing family order: Wood first, Stone second, Glass third. Before broadening this system, decide exact family order by level band and the names/art direction for each family's four spawner-piece tiers.

## Interface and customization

- **Settings menu.** Prerequisite for the two below, so it lands before them.

- **Customization on a second tab inside settings.** Requires the Settings menu.

- **Customization options are earned, not just available** - unlocked, awarded, or otherwise gotten to. Requires the Customization tab inside Settings. This is the one item here that is directly retention work: it is a reward with no gameplay power, which makes it a safe sink to hang on levels, collection completion or crates without touching the economy.

## Art

- **Item art step S6 - dedupe** (plan: `~/.claude/plans/i-really-want-to-abundant-bonbon.md`). Wood 6 (`drawMahoganyBlock`) and Glass 7 (`drawInterlockingCross`) are both three-bar 60-degree asterisks - the exact failure `drawJoineryLattice`'s own comment forbids. The sparkle constellation is also copy-pasted across all six accent tiers, with Wood 9 and Glass 9 sharing a byte-identical first mote. S7 (a one-tier Blender reference pilot) remains optional.

## Economy and board systems

- **Targeted item purchase for coins.** The shop's `BUY WITH CREDITS` row already sells items, but it is three random slots, so the piece a player actually needs is rarely in it. The feature is being able to buy a SPECIFIC low-tier item on demand.
    - Price off the same work curve the orders use - `3 x 2^(tier-1)` - so a bought item costs what the economy already says it is worth, with a margin over the sell price.
    - Cap the tier it will sell, or it short-circuits the merge ladder entirely. Low tiers only; the point is to unblock a stalled board, not to buy the answer.

- **Coin-priced supply crates, on a timer.** Cheap to add: crates are already full board objects with tiers, payloads, tap-to-open and storage.
    - **Every crate bought from the store carries a wait before it can be opened** (owner's requirement). Without it, coins convert directly into board items at will and the advantage is far too great - the timer is what keeps a bought crate a decision rather than a bypass.
    - Shares the timer framework described under Deferred work, including the absolute open-at timestamp so it counts down while the game is closed.

- **Scrap machine.** Feed unwanted items in; a bar fills; a full bar pays out a crate.
    - The best answer to the dead state because it consumes items ALREADY ON THE BOARD - it needs no energy and does not touch the recharge, so it fills the gap beside the wait rather than removing it.
    - Solves a real problem the build has now: a board of low-tier leftovers whose only use is `sellSelectedItem`. Items get a second sink besides credits.
    - Mechanically it is the crate meter that already ships - `CRATE_THRESHOLDS`, a filling bar, a crate at the end - pointed at fed items instead of source runs. Most of it exists.
    - Bar value per item should follow the same work curve everything else uses, `2^(tier-1)`, so feeding a tier 7 is worth what it cost to build.
    - A recycling plant is a FACILITY building, so this feeds the retention thesis rather than bypassing it. See `docs/RETENTION_ROADMAP.md`.

- **A free-tap material producer - the masking source.** One permanent producer that costs no energy and can be tapped indefinitely.
    - Its output is MATERIAL, not income: it drops something that merges and is consumed - by the Scrap machine, or as a crafting input - and it does NOT get its own paying order queue.
    - That distinction is the whole design. The proposal this came from attached a coin-and-XP order queue to it, which is what would have removed the energy gate: a player could earn indefinitely without spending energy. Dropping the rewards keeps the masking and keeps the gate.
    - Cost is BOARD SPACE, and that is a FEATURE, not a side effect. Scarce board space is what makes this a strategy game: with room to spare there is no decision in a merge board, because nothing trades against anything else. Tapping this producer freely fills the board, so it is paid for with the thing the player is always short of.
    - Which also means it must never be tuned until space stops being scarce. The same applies to everything else that relieves pressure - the inventory, selling, and the Scrap machine are all balanced costs, not fixes.
    - Open: whether it is a real dispenser on the grid or a fixture off it.

## Deferred

- **Deferred: timed event crates.** Do not apply opening timers to general crates. Timed crates may come from events later; implementation remains postponed.
   - **Gems skip the timer, priced by crate tier** (owner's call, 2026-08-30). Scale the skip cost with the tier so a vault costs meaningfully more to rush than a bronze.
   - The skip price should track the REMAINING time, not the crate's full duration - charging the vault price for the last thirty seconds of a vault is the version of this players resent.
   - Stores an ABSOLUTE open-at timestamp, not a remaining duration, so it counts down while the game is closed (owner confirmed). Same trap the daily-login claim already has to avoid.
   - **Several crates count down simultaneously** (owner's call, 2026-08-30). No queue, no single opening slot.
   - Which means BOARD SPACE is the limiter, not a timer slot - a crate is already a board item, so a player timing five crates is a player with five cells committed. That is a better constraint than an artificial queue: it is visible, it is one the player chose, and it trades against the thing the board is actually short of.
   - It also weakens the gem skip as a sink, which is the right trade. Nobody is buying their way past a wait they can simply set going and ignore, so the skip becomes what it should be - for the one crate a player actually wants now - rather than a toll on a queue the design created on purpose.
   - Consequence for the timer UI: several crates can be counting at once, so the remaining time belongs ON each crate rather than in a single panel.
