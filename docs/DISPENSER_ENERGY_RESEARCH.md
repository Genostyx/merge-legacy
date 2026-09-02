# Dispenser and energy research

Research date: 2026-08-28

Purpose: handoff reference for implementing energy and producer timers. Exact live-game balance values can change or be A/B tested, so keep all numbers configurable.

## Decision

Model the core system after **Merge Mansion**, not Merge Dragons.

Merge Mansion has two independent limits:

1. **Global energy:** producing one board item normally costs one energy.
2. **Producer inventory:** each producer stores a limited number of drops, refills those drops on its own timer, and may stack multiple recharge cycles.

The player can therefore have energy but an empty producer, or a charged producer but no energy. Our current system only models producer inventory, so it is incomplete; energy should be added as a separate resource rather than replacing source cooldowns.

## Merge Mansion findings

### Energy

- Normal producer taps cost 1 energy.
- Natural energy cap: 100.
- Natural refill: 1 energy every 2 minutes, including offline time.
- Empty-to-full natural refill: 3 hours 20 minutes.
- Energy rewards or purchases can exceed the natural cap.
- Timed unlimited-energy items exist in 5-, 10-, and 20-minute forms.

### Producers

- A producer has `dropsPerCharge`, `rechargeTime`, and `maxCharges`.
- A recharge cycle adds another batch of stored drops until the producer reaches its maximum stored cycles.
- Timer progress and global energy are independent.
- Different producer families deliberately use very different cooldowns.
- Upgrading a producer can improve its output tiers, drops per charge, and stored-charge count. It does not mean every higher producer simply has a longer cooldown and fewer drops.
- The UI exposes a timer when a producer is empty.

Current reference examples observed in the community data tables:

| Producer | Drops per charge | Stored charges | Recharge per charge | Full stored output |
|---|---:|---:|---:|---:|
| Gardening Toolbox L4 | 8 | 2 | 1 minute | 16 drops |
| Gardening Toolbox L8 | 13 | 3 | 1 minute | 39 drops |
| Gardening Toolbox L13 | 18 | 4 | 1 minute | 72 drops |
| Broom Cabinet L5 | 8 | 1 | 200 minutes | 8 drops |
| Broom Cabinet L6 | 9 | 2 | 200 minutes | 18 drops |
| Broom Cabinet L10 | 17 | 2 | 200 minutes | 34 drops |
| Broom Cabinet L13 | 26 | 2 | 200 minutes | 52 drops |

The contrast is intentional: some common producers are effectively energy-gated, while slow producers remain timer-gated. The 200-minute Broom Cabinet cycle also matches a complete 100-energy refill at 2 minutes per energy.

### Separate booster types confirm the architecture

- Timeskip advances producer timers.
- Infinite Energy removes the energy cost temporarily.
- Producer Booster enables unlimited producer output temporarily.

These are separate effects because energy and producer availability are separate systems.

### Direct device capture - RESOLVED 2026-08-28

The producer-merge question ("how merging two partially charged or empty
producers transfers timer progress and stored charges") was captured from
the live build and closed. The exact captured values were not written down
here, so treat this section as "no longer blocking" rather than as a
record of what Merge Mansion does - re-capture if producer-merge behaviour
is ever reworked rather than trusting this line.

Still open, and never blocking: whether Merge Mansion's timer values are
universal or assigned through balance-test groups.

## Merge Dragons findings

Merge Dragons is structurally different and should not be used as the main dispenser model.

- Camp production usually requires a dragon to harvest an object; the board object is not a Merge Mansion-style tap producer.
- Harvesting or building spends that individual dragon's stamina.
- Higher-level dragons generally have more stamina.
- An exhausted dragon sleeps in a Dragon Home. Each Home rests one dragon at a time; multiple Homes process dragons in parallel.
- Dragon Home rest times fall by level: approximately 20, 17, 15, 13, 11, 9, 7, then 5 minutes per rested dragon.
- Dragon rest continues while away from Camp.
- Many tappable Camp objects use a different clock that advances only while their map is loaded. Common long-cycle Wonders and event trophies can require about 10 hours of active Camp time per stored tap.
- Level entry uses a separate Chalice resource, generally capped at 7 and restoring about one per hour.

Merge Dragons is useful only as a reference for multiple parallel workers, worker stamina, and active-map timers. It does not justify replacing Merge Mansion-style global energy with the current per-source cooldown system.

## Implementation handoff rules

When energy implementation begins:

1. Add a global energy state with a configurable cap and offline refill interval.
2. Charge energy only after a source successfully creates an item; full-board or invalid taps must not consume it.
3. Keep producer inventory separate, expressed as drops per charge, recharge duration, and maximum stored charges.
4. Let early/common producers recharge fast enough that energy is the main early-session limit. Reserve long producer timers for selected chains later.
5. Store balance data per producer family and tier; do not derive every timer by one universal formula.
6. Keep Timeskip, Unlimited Energy, and Unlimited Production as distinct future effect types.
7. Producer-merge behaviour is settled (capture done 2026-08-28); `mergeDispenserPair`'s head-start floor is the shipped rule, not a placeholder.

## Tasty Travels continuity layers (2026-08-28 follow-up)

Tasty Travels keeps the roughly two-minute passive refill but extends sessions through additional energy sources rather than shortening the base timer. Reported live-game layers include mergeable energy from scratch cards and chests, daily/pass rewards, event rewards, gem-purchased refills, occasional timed infinite-energy items, official gift links, and rewarded ads for some test groups/versions. Early continuity therefore depends on the frequency of reward energy, not passive regeneration alone.

First implementation response: onboarding and source-use orders now return energy at regular intervals. Daily chests, events, infinite-energy items, and ads remain separate future systems.

## Source rush decision (2026-08-28)

Merge Mansion generally prices a rush from remaining time and may complete only one recharge cycle. That does not translate cleanly to this game's per-drop timers: almost every rush would cost one gem and return only one item. The implemented rule therefore refills the complete reservoir for a fixed, legible price: `family index + source tier`, with indices starting at Wood 0, Mineral 1, Glass 2. Thus Wood S1 costs 1 GM, Mineral S1 costs 2 GM, Glass S1 costs 3 GM, and each source tier adds one.

## Per-family recharge ladder (user-specified, 2026-08-28)

The canonical rule for **every** family's source recharge, including ones
not built yet. Stated directly by the user - this is a design decision,
not a research finding, and it overrides the researched Merge Mansion
numbers currently sitting in `SOURCE_CONFIG`.

**Rule: a source regenerates ONE drop every `5s x 2^(familyIndex)`, where
`familyIndex` is the family's position in unlock order, zero-based.**

| Family index | Family | One drop every |
|---|---|---|
| 0 | Wood | 5s |
| 1 | Stone (`mineral`) | 10s |
| 2 | Glass | 20s |
| 3 | *next family* | 40s |
| 4 | *next family* | 80s |
| 5 | *next family* | 160s |

Implemented as `BASE_RECHARGE_MS` and `FAMILY_RECHARGE_ORDER` in
`Dispensers.ts` - adding a family means appending one string to that
array, not hand-writing timer numbers.

The interval is **flat across a family's own source tiers** (wood is 5s
at S01 and at S05). So is CAPACITY - see `SOURCE_CAPACITY`, which is a
family trait and not a per-tier one. Upgrading a source changes only what
it DROPS: a tier-2 source produces tier-2 items, worth a whole merge step
more per tap. Growing capacity with tier was tried and reverted, because a
bigger reservoir means the player reaches the recharge timer less often and
that wait is the most satisfying beat in the game.

Each new family doubles the previous one's interval. When adding a family,
append it to the end of the ladder - do not slot it in ahead of an
existing family, since that would silently re-time every family after it.

Two things to know when implementing this:

- **This is a per-DROP interval, not the current per-BATCH one.** Today
  `rechargeMs` is the time to gain a whole `dropsPerCharge` batch (wood
  tier 1: 15 drops per 20 minutes). The rule above is one drop at a time,
  which is both a different unit and roughly 16-240x faster. It is not a
  retune of the existing numbers; it replaces their shape.
- **It deliberately contradicts rules 4-5 above and the Merge Mansion
  numbers**, which is fine and arguably better-aligned with our actual
  top design reference: the Tasty Travels research in `TODO.md` found its
  producer cooldowns are "seconds or minutes, not hours," and Tasty
  Travels outranks Merge Mansion.

**The ladder is itself a real gate - do not trade it away for energy.**
An earlier draft of this note claimed the fast ladder left the game with
"no gate at all" until energy shipped. That was wrong, and playtesting
contradicted it directly: draining a reservoir and waiting for it to tick
back is the moment-to-moment rhythm, and the source lighting up when it
refills is reported as the most satisfying beat in the game. Merging
feels good *because* the input is rationed - the fast ladder created that
feeling rather than removing it.

The two gates are complementary, not alternatives, which is exactly what
Merge Mansion does (see Producers above: "timer progress and global
energy are independent", fast producers energy-gated, slow ones
timer-gated). **The dispenser ladder paces the minute; energy paces the
session.**

**Design constraint that follows:** energy must not be tight enough to
stop a player spending the drops a dispenser hands them. If a full
reservoir can't be collected because energy ran out first, the
reload-and-collect loop - the part that demonstrably works - is what
breaks.

## Sources

- [Merge Mansion Energy reference](https://merge-mansion.fandom.com/wiki/Energy)
- [Merge Mansion Gardening Toolbox current statistics](https://merge-mansion.fandom.com/wiki/Gardening_Toolbox)
- [Merge Mansion current producer data table](https://merge-mansion.fandom.com/wiki/Module%3ADatatable/Items/1)
- [Merge Mansion official automatic boosters](https://support.metacoregames.com/hc/en/merge-mansion/articles/auto-activated-rewards-515)
- [Merge Dragons official work and sleep explanation](https://gramgames.helpshift.com/hc/en/9-merge-dragons-1497457953/faq/58-how-can-i-make-my-dragons-sleep-faster/?l=en)
- [Merge Dragons Dragon Homes reference](https://mergedragons.fandom.com/wiki/Dragon_Homes)
- [Merge Dragons stamina reference](https://mergedragons.fandom.com/wiki/Stamina)
- [Merge Dragons game-tick reference](https://mergedragons.fandom.com/wiki/Game_Tick)
- [Merge Dragons official recharging-object description](https://www.mergedragons.com/news/camp-and-chill)
