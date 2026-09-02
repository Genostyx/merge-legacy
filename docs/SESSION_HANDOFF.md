# Session handoff

> **Gameplay-design approval rule:** `AGENTS.md` is authoritative. New gameplay mechanics must be fully explained—including their player-facing behavior and effects on progression, pacing, economy, UI, existing mechanics, and save data—and explicitly approved by the project owner before implementation. Never bundle an unapproved adjacent mechanic into otherwise approved work.

Written so a fresh context can resume this project without re-deriving
everything. `TODO.md` (root) has the live task queue - this doc is "how this
codebase works and why," not a task list. Read `TODO.md`,
`docs/RETENTION_ROADMAP.md` and `docs/FAMILIES_ROADMAP.md` too; don't
duplicate their content here, just point at them.

Last reviewed for staleness: 2026-08-29.

## What this project is

Phaser 3 + TypeScript + Capacitor merge game. Three merge-chain families -
Wood (`wood`), Stone (`mineral`), Glass (`glass`) - each with 9 tiers (an 8
tier grammar plus a per-chain "masterwork capstone" at 9).

**Art direction is modern, dark minimalist, organic minimalist and
brutalist, with about 10% industrial techno.** Warmth IS allowed - organic minimalism wants natural
materials. No representational
illustration - abstract geometric solids only, never depicted tools,
machines or scenes. Art built against an older "warm modern minimalism"
description was rejected once; that description was wrong and is gone.

**This game is closer to MINECRAFT than to Merge Mansion.** The materials are
literally Minecraft's (wood, stone, sand-to-glass) and the sources are
upgrading buildings. The retention object is the FACILITY - a persistent
thing the player owns that gets more capable. Do NOT propose narrative (the
owner skips story in every game in this genre) and do NOT propose a
chapter/task ladder (Minecraft has none). Full reasoning in
`docs/RETENTION_ROADMAP.md`.

**The game is NOT idle.** Nothing is automated; every source tap, merge drag
and delivery is a deliberate input. Offline reservoir refill is a recharge
timer, not idle production.

## How to verify changes

```bash
npx tsc --noEmit -p tsconfig.json   # typecheck
npm test                             # vitest, currently 130 tests across 11 files
npm run build                        # production build
```

Then verify visually via the Browser pane MCP tools (`preview_start`,
`navigate`, `computer` screenshot, `read_console_messages`).

### Browser-pane gotchas (all confirmed)

- **Keep the dev server on port 5173.** `.claude/launch.json` sets
  `autoPort: false` deliberately - localStorage is origin-scoped, so a
  different port makes the player's save appear lost.
- **One tab at a time.** Two tabs run two game loops against the same save
  key and will fight.
- `Framebuffer status: Incomplete Attachment` and
  `Cannot read properties of null (reading 'drawImage')` are **environment
  artifacts, not code bugs**, and their reported line numbers are
  misleading.
- `read_console_messages` accumulates across reloads, so errors from a
  mid-edit HMR state persist and look real. Reload, then re-read, before
  believing any console error.
- `zoom` / region-crop on screenshots is **not supported** here - it silently
  returns the full screenshot. The full-resolution shot is normally legible
  enough for icon-level checks.
- Freshly created tabs render blank until fronted or reloaded.

### Testing a specific board state

Inject a save, then reload. **Back the real save up to a SEPARATE key first -
never delete it, and never restore without reloading:**

```js
// 1. back up
localStorage.setItem('merge-game-save-BACKUP', localStorage.getItem('merge-game-save-v1'));
// 2. seed whatever you need, then reload and test
// 3. restore
localStorage.setItem('merge-game-save-v1', localStorage.getItem('merge-game-save-BACKUP'));
localStorage.removeItem('merge-game-save-BACKUP');
// 4. RELOAD, then re-read the save and compare before trusting the restore
```

**Writing localStorage is only half a restore.** The running Phaser scene
holds the whole save in memory and rewrites it on its next `saveState()`,
which fires on almost any action - so a restore that isn't followed by a
reload gets silently overwritten field by field, and a partial overwrite
looks exactly like a success. This has cost real player state once.

Current save shape (`boardVersion: 6`):

```js
{
  boardVersion: 6,
  grid,            // 7 rows x 6 cols; null | {kind:'item'|'locked-item', typeId, tier}
                   // | {kind:'spawner', id, typeId, tier, readyAt, charges}
  economy: { coins, gems },
  energy: { current, lastTickAt },
  orderState: { activeOrderIndices, activeOrderLevels, nextOrderIndex, collectBaselines, totalXp },
  shopState: { coin: { offers, lastRefreshAt }, gem: { offers, lastRefreshAt } },
  rewards: { meterCollects, claimedMilestoneLevel, lastDailyDay, dailyStreak },
  dispenserCollectCount,
  pendingSpawners
}
```

## Established conventions (apply without being re-asked)

- **Shape grammar** (`docs/FAMILIES_ROADMAP.md`): every family's tiers follow
  one shared 8-stage silhouette progression (rough chunk -> chip -> cut block
  -> squared block -> beveled/faceted block -> faceted obelisk/prism ->
  interlocking cross -> smooth interlocking knot), with only material varying
  per family. Tier 9 is a per-chain masterwork beyond the grammar; a new
  chain defaults to 8 tiers unless a 9th is asked for.
- **Merge-satisfaction principle:** every merge must read as the result
  getting *better*, not just *different*. This applies to the persistent
  layer too - it is why source reservoir capacity may never shrink on
  upgrade.
- **Before adding any tier/shape:** grep `TierIcons.ts` for other calls to
  the same helper and **diff the numbers**. Near-identical params across
  tiers or families is a bug, not a coincidence - this class of defect has
  recurred five-plus times (Wood 7/8, Stone 7-9, Glass 8/9, Glass 2 vs Stone
  2). Two live cases remain, logged as item 6 in `TODO.md`.
- **Icons are measured, not guessed.** `GraphicsRecorder` + `iconFootprint`
  replay a real draw call to get an icon's true extent; `iconPresentation`
  then normalises size and drops every item onto a common ground line at the
  `drawTierIcon` seam. Don't hand-tune sizes into the shapes.
- **TileView owns the contact shadow.** No icon draws its own ground ellipse.
- **Locked-item soft-lock rule** (`Grid.hasLockedItem`,
  `canSafelyDeliverSpawnerReward`, plus the spawner-merge guard): a locked
  cell at tier 1 can only ever be cleared by a tier-1 spawner of its own
  family. Both guards are generic over `typeId`, so nothing is needed when
  adding a family.
- **Locked-board density:** one locked cell per family per even tier, each
  family with its own ladder (`LockedBoard.ts`). Took several rounds of
  correction to land - don't re-tune unasked.
- **Source capacity and recharge are FAMILY traits; tier is CAPABILITY.**
  Capacity never changes with tier (wood 30 / mineral 10 / glass 18) and
  recharge is flat within a family. Upgrading a source changes only what it
  DROPS - a tier-2 source produces tier-2 items, worth a whole merge step
  more per tap. Growing capacity with tier was tried and reverted: more
  banked drops means the player reaches the recharge timer less often, and
  that short wait is the best beat in the game.
- **The dispenser wait is the fun.** Never design it away in favour of some
  other pacing gate.
- **Reserved accent colours** (`Theme.ts`): amber and acid-green are
  interactive STATE only (ready, merge-ready) - never family identity or
  decoration. There is no `accentCyan` any more; that hex now belongs to
  `currencyEnergy`, so re-adding a cyan state accent would collide with the
  energy chip. Resource identity colours are a separate set again.
- **Text rendering:** every `scene.add.text` must pass
  `resolution: textResolution`. Phaser rasterises Text at 1x, so on a
  DPR-2 screen small glyphs turn to mush - this caused a real misdiagnosed
  "duplicate tier" report. Digits read at a glance use `Theme.fontNumeric`;
  `Theme.fontMono` stays for technical labels. Board pieces carry no
  numbered tier chips - that metadata was deliberately removed from the
  board and lives in the action tray / receipts instead, in the
  `WOOD 02` form.
- **Rewards are one system with three feeds** (`src/game/rewards/Rewards.ts`):
  a single crate payload and loot table, fed by the output meter, level
  milestones and the daily claim. Add feeds, not parallel reward systems.
- **The output meter is deliberately honest.** It is the fill-a-meter-and-pop
  slot mechanic minus the deception: the fill is the only thing that picks
  the crate, it is fully deterministic, and thresholds are drawn as visible
  notches. Variance lives in crate CONTENTS. If it ever needs an RNG to
  decide the tier, it has become the thing it was written to avoid.
- **Gold closes the meter cycle on the board.** At 100 runs, Gold automatically
  occupies the first free board cell and the meter restarts. If the board is
  full, the meter remains at 100 and earns nothing further until space is
  freed; tapping the waiting Gold label is the only action that explains the
  block. The full meter itself is the saved pending state—never an off-board
  stack—and freeing a cell automatically retries delivery.
- **Gems are scarce.** Crates pay 1-3, and only the vault can pay 5. Gems
  price the gem shop row and the 40-gem energy refill; handing them out
  freely quietly kills both.

## Recent work

`TODO.md`'s Completed section is the durable, chronological record - read it
there rather than duplicating it here. The short version of the most recent
stretch: item art depth pass (lighting ramp, faceted shading, measured
footprints, single-owner contact shadows), the order system rebuild
(level-gated tiers, multi-item requirements, a scrolling 3-to-6 slot queue,
completable orders sorting to the front), the crate/reward system with the
output meter wired, and a hint animation when an item matching a locked tile
lands.

## Pending work

`TODO.md` is authoritative. As of this writing the queue is: energy tuning
against real play, designing a clearly presented long-term item sink,
making generated orders actually curve, and the S6 art dedupe. All
three crate feeds are live: output meter, level milestones and daily login.
The two player-specific feeds live in the profile and share the level-badge
ready marker.
