# Material Merge

A two-item merge game prototype built with Phaser 3, TypeScript, Vite, and Capacitor.

**Visual direction: modern, dark minimalist, organic minimalist, brutalist -
with about 10% industrial techno.**

Warmth is part of it. Natural materials - timber, stone, linen, wool, plants -
are what "organic minimalist" means, and they keep the dark, brutal half from
reading as clinical. An earlier version of this file claimed a 70/20/10 ratio
and a "no warmth" rule; both were wrong and cost rework.
Treat that ratio literally - it is the acceptance test for any new art or UI.
Modern minimalism dominates: reduced, precise, generous negative space, no
ornament. Brutalism is the second voice: blocky mass, hard edges, exposed
structure, squared forms. Industrial techno is a TENTH - a thin machined
line, a precise indicator, a fine tick mark. It seasons; it never leads.

Warmth is NOT part of the brief. The current palette happens to lean warm
(see `Theme.ts`), but that is incidental, not a requirement - an earlier
version of this file described the direction as "warm modern minimalism
with restrained industrial UI lighting", which was wrong and led to art
being built against the wrong target.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Useful checks:

```bash
npm run typecheck
npm test
npm run build
npm run check
```

`npm run check` runs the type-check, gameplay regression tests, and production build.

## Current game loop

- The board is 6 columns by 7 rows.
- Drag two matching items together to create the next tier.
- Greyed-out locked items occupy board cells and cannot be moved or sold. Merge an identical free item onto one to unlock it and create the next tier.
- Sources are physical board pieces. Tap one to produce an item in a nearby empty cell.
- Board pieces display their silhouettes without tier-number badges; tapping an item shows its family and within-family number in the action tray (for example, `WOOD 02`). Sources likewise keep reservoir counts and source levels off the board surface.
- Drag two matching sources together to upgrade them. An upgraded source never produces below its own tier.
- Source merging preserves remaining drops. If either source was recharging, the upgraded source immediately receives at least one ready batch.
- Tap an item to select it, then use the action tray to sell it for coins.
- Three orders are visible above the board. A green order is ready to submit.
- Tap a ready item order to send the requested pieces. Delivered pieces are removed from the board.
- Completing an order immediately replaces it, so short- and long-term objectives remain visible together.
- Progress autosaves in `localStorage`.

The first six source drops are deliberately tier one. This prevents a lucky bonus drop from skipping the opening merge tutorial. Later drops use the normal bonus probabilities.

## Merge chains

All three families have nine tiers - the original 8-tier shared shape
grammar (see `docs/FAMILIES_ROADMAP.md`) plus one masterwork capstone tier
per chain.

### Wood

1. Scrap Wood
2. Pine Plank
3. Oak Plank
4. Maple Block
5. Walnut Block
6. Mahogany Block
7. Ebony Block
8. Gilded Rosewood
9. Rosewood Heirloom

### Mineral

1. Gravel
2. Rubble
3. Slate
4. Polished Stone
5. Marble
6. Granite
7. Quartz
8. Sapphire
9. Star Sapphire

### Glass

1. Raw Sand
2. Glass Shard
3. Cut Glass Block
4. Crystal Block
5. Beveled Crystal
6. Crystal Obelisk
7. Crystal Lattice
8. Prismatic Knot
9. Aurora Crystal

The game begins with one wood source. A second wood source, the first
mineral source, and the first glass source are earned through early
orders. Sources can be merged up to source tier five.

Each source is a compact building constructed from its output material: a timber mill for Wood, masonry works for Stone, and a pane-built glass house for Glass. Source tiers follow a real-property value progression rather than repeating one building with extra marks: basic shed/works/greenhouse, expanded workshop/conservatory, winged facility, taller premium building, then a balanced capstone estate, monumental hall, or crystalline palace. Merge items carry no numeric badge or separate counting marks. When a tier uses numerical visual language, it belongs to the object itself—for example two Pine planks, three Oak planks, a four-arm Maple X, a tier-five Walnut V, and a six-direction Mahogany interlock.

## Locked board progression

A new board begins with five playable pieces in an upper-left pocket: one source and four tier-one items. Twelve other cells begin with dimmed, color-preserving locked items: exactly one tier 2, 4, 6, and 8 item from each of the three current families. Their positions are calculated from an edge-biased distance field: the pool anchors at the bottom-right, extends farther along the bottom and right edges than it does diagonally, and fills the inner corner without forming a uniform staircase. This leaves open board space while making clearing the locked region a visible progression of its own.

- Locked items occupy real grid cells.
- They do not count toward delivery orders and do not unlock their family in the shop.
- They cannot be dragged or sold.
- Dragging an identical family-and-tier item onto a locked item consumes both pieces, unlocks the space, and creates the next tier.
- Existing saves receive locked items in available edge cells, starting at the bottom-right, while retaining at least two empty spaces.

Chain definitions live in `src/game/data/chains.ts`. Procedural tier silhouettes live in `src/game/objects/TierIcons.ts`.

## Orders and progression

`src/game/levels/Orders.ts` owns the order queue.

- Three orders are active at once.
- Item-delivery orders require an exact family, tier, and quantity.
- Source-use orders count taps from an order-specific baseline.
- Item deliveries consume the submitted pieces.
- The first twelve orders are hand-authored to teach the game and unlock sources in a controlled order.
- After those, the queue generates an endless mix of wood, mineral, and source-use orders.
- Each order displays its coin and XP payout before submission.
- Completing orders is the primary source of both coins and player XP.
- Merges grant XP rather than coins. The current direct curve rises from 1 XP for early merges to 64 XP for a tier-nine result, but it is provisional until the Tasty Travels-first progression audit in `TODO.md` is complete.
- The round header badge displays player level using a slower quadratic XP curve.

Old saves using the earlier single-goal format are migrated into the three-order queue.

## Sources

Sources use stored drops alongside a separate global energy pool. Producer inventory controls which source can dispense; energy controls total session length.

- Source tier 1 holds up to 30 drops.
- The opening source begins full with 30 drops so the first session cannot be interrupted by its recharge timer.
- Sources earned later begin half full.
- One batch recharges every 20 minutes at tier 1.
- Higher source tiers recharge more slowly and store fewer drops, but their minimum output tier is permanently higher.
- Later-game source taps can occasionally produce one or two tiers above the source floor.
- A dry source can be completely refilled with gems. Cost rises by source level and family unlock order: Wood starts at 1 gem, Mineral at 2, and Glass at 3.
- Merging sources combines their remaining drops. A merge also completes recharge when either input source was recharging.
- Producing one item costs one energy only after the item is successfully created.
- Natural energy caps at 100 and refills by one every two minutes, including offline time.
- The compact energy counter shares the top resource row with coins and gems; its countdown appears only while refilling.

These values remain tunable, but the two-minute energy interval matches the current Tasty Travels and Merge Mansion reference rate.

## Economy and shop

- Normal merges award no coins.
- Orders award coins and XP, and occasionally gems or new sources.
- Every item can be sold, which makes a full board recoverable.
- The shop sells rotating merge items for coins or gems.
- Gem-pack buttons are development stubs. They credit gems immediately and do not process a real payment.

Real-money purchasing is intentionally not a current priority. The core loop, retention, progression, content, and economy need playtesting first.

## Design-reference priority

When reference games disagree, use this order:

1. Tasty Travels — primary model for orders, coin flow, XP flow, travel/world progression, and overall session structure.
2. Merge Mansion — secondary model for two-item merging, board objects, source behavior, and high-tier merge rewards.
3. Merge Camp — tertiary reference for supporting progression and social/camp ideas.

## Save data

The current save contains:

- Board cells, including items and on-board sources
- Source charges, recharge timestamps, energy, and energy refill progress
- Coins and gems
- Active orders, order progress baselines, and player XP
- Shop state
- Pending source rewards

The key is `merge-game-save-v1`. Loading still migrates saves from the retired off-board source dock and the retired single-goal progression model.

## Visual architecture

- `src/game/scenes/BoardScene.ts` owns layout, input, orders, shop, save/load, and board interactions.
- `src/game/objects/TileView.ts` is the art swap point for merge items. Replace its `drawTierIcon(...)` call with sprites when final art is ready; dragging and animation are independent of the rendering method.
- `src/game/objects/SpawnerView.ts` renders the on-board material buildings.
- `src/game/ui/Theme.ts` centralizes the charcoal, amber, cyan, green, typography, border, and lighting tokens.
- `public/minimalist-spa-interior-meditation-space_23-2151935107.avif` is the current background reference image.
- `public/ui-button-test.png` is the current rendered button-material experiment.
- `public/references/wood-dispenser-progression-concept-v1.png` is the first professional isometric 3D direction study for the five Wood source levels. It is a concept sheet, not a runtime sprite sheet.
- `public/assets/dispensers/wood-1.png` is the simplified 3D Wood source level-one render retained as a visual reference. The running Wood level-one source is now a hand-built isometric vector recreation in `TierIcons.ts`; the raster is deliberately not preloaded.

The board is intentionally more opaque than the background so item silhouettes and order state remain legible. The environment carries the scene; the interaction layer stays dark and structured.

## Native packaging

Capacitor configuration lives in `capacitor.config.ts`.

```bash
npm run build
npm run cap:sync
npm run cap:add:android
npm run cap:add:ios
```

The Android project is present in `android/`. Native builds still require the corresponding local Android or iOS toolchain.

## Next priorities

1. The energy mechanic is BUILT (`src/game/economy/Energy.ts`: cap 100, one per two minutes, one spent per source collect) and so is the crate/reward system feeding it (`src/game/rewards/Rewards.ts`). What remains is tuning energy against real play - see `TODO.md`, which is the authoritative queue.
2. Complete the Tasty Travels-first XP and level-progression audit described in `TODO.md`; keep current XP values provisional until then.
3. Playtest the first ten minutes and measure where players hesitate, run out of useful moves, or ignore orders.
4. Replace the procedural wood and mineral shapes with highly legible production art while keeping the restrained material palette.
5. Add a lightweight workshop/restoration wrapper so delivered orders create visible permanent progress.
6. Add sound and haptics for source taps, merges, deliveries, and source unlocks.
7. Tune source capacities, cooldowns, order rewards, shop costs, and sell values from playtest data.
8. Add storage and additional chains only after the two-family board remains interesting across repeated sessions.
9. Consider monetization only after the unmonetized loop is demonstrably enjoyable.

## Project structure

```
src/
  game/
    data/chains.ts
    dispensers/Dispensers.ts
    economy/Economy.ts
    levels/Orders.ts
    objects/TileView.ts
    objects/SpawnerView.ts
    objects/TierIcons.ts
    scenes/BoardScene.ts
    shop/Shop.ts
    ui/Theme.ts
  main.ts
public/
android/
capacitor.config.ts
```
