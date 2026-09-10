# Debug tools

Development-only. Nothing here is imported by the game or shipped.

Each of these exists because of a specific failure that got past every check
the project already had. They are not general-purpose utilities.

## `save-version-check.mjs` — wired into `npm run check`

Fails the build if a save migration is gated on a `boardVersion` higher than
the one `saveState` actually stamps.

That combination means the migration re-runs on **every load, forever**. On
2026-09-04 an XP-curve migration was gated on `< 10` while the save still
stamped `9`: every refresh doubled the player's XP again, jumping them levels
and paying out milestone crates each time, until the game was unplayable.
Typecheck, 222 tests and the build all passed - the code was valid, it just
re-migrated for ever.

```bash
npm run check:save
```

## `patch.py` — edit source, or fail loudly

```bash
python tools/debug/patch.py <file> <old.txt> <new.txt> [expected-count]
```

Applies an edit only if the search text appears exactly the expected number of
times (default 1), and prints near-misses when it finds none.

Same incident as above: the version bump was written with a plain
`str.replace()` whose search text had the wrong indentation. It matched
nothing, `replace()` said nothing, and every check passed because the file was
still valid TypeScript - just the old code. An edit that refuses to be a no-op
is the only thing that catches this.

## `devtools.js` — browser console helpers

Paste into the dev console; everything hangs off `__dbg`.

Vite serves it from the project root, so one line loads it:

```js
eval(await (await fetch('/tools/debug/devtools.js')).text());
```

```js
__dbg.state()                 // level, xp, boardVersion, board contents, vault, meter
await __dbg.health()          // fps AND the flags that gate input
__dbg.watch()                 // start capturing; the LIST outlives reloads
__dbg.errors()                // what it caught

__dbg.level(5)                // jump to a level (reloads); no arg = read it
                              // on a phone use the in-game `- lvN +` stepper
                              // in the bottom-left dev strip instead
__dbg.tokens()                // event token drop rate, measured not assumed
__dbg.tokens(true)            // reset the count

__dbg.backup('mine')          // before wrecking the board
__dbg.restore('mine')

// build a test board (reloads automatically)
__dbg.board({ spawners: [['decagon', 1, 3, 3]], items: [['decagon', 1, 9]] })
__dbg.board({ spawners: [['wood', 1]], fill: 'wood', leaveFree: 1 })
__dbg.patch(s => { s.economy.gems = 500; })
```

Three traps it removes:

1. **Writes reload in the same tick.** The running game holds state in memory
   and autosaves over localStorage, so writing a save and reloading as two
   separate steps is a coin flip - the game sometimes clobbers the write
   first. This has silently reverted test setups more than once.
2. **The error list survives reloads.** `watch()` stores into sessionStorage,
   so `errors()` accumulates rather than resetting every refresh - a crash
   seen once is still readable afterwards. Honest limit: the listener is not
   part of the bundle, so re-eval `devtools.js` after each reload to keep
   capturing; anything thrown before that eval is missed.
3. **`level(n)` arrives at a level instead of climbing to one.** Anything
   gated on level - the event's level-5 gate, order slots, shop rows - can be
   reached in one call after a reset. It sets the exact XP threshold rather
   than nudging, and refuses if the level it reads back is not the one asked
   for, which is what catches the XP formula moving underneath it. Level
   rewards for the skipped levels are delivered on the next load; that is the
   honest consequence of arriving rather than climbing.
4. **`health()` reports `inputLocked`, not just fps.** A locked game still
   renders at 60fps. A stuck `inputLocked` is what a "frozen screen" usually
   is - the board draws fine and ignores every tap.

## `icon-sheet.ts` - look at the art without running the game

```bash
npx vitest run --config vitest.tools.config.ts
```

Writes `tools/debug/out/icon-sheet-<family>.svg`: every tier of a chain, on
the board's own ground, at the size and offset `iconPresentation` gives it.

It replays the SAME `drawTierIcon` calls the renderer receives into an SVG
recorder, so what it shows is what the board draws - no GPU, no canvas, no
game. That matters because the only way to see an icon used to be running the
preview, and the preview's WebGL context dies after a handful of reloads; the
Verdigris art pass spent several rounds on "change a colour and hope".

It also makes the mixed colours READABLE. Grepping the fills is what caught
every accent on that chain landing khaki - a saturated yellow at 25% into a
dark desaturated green is olive, which no amount of squinting at a screenshot
would have named.

It is kept OUT of the main suite by `vitest.config.ts`, which is `src/` only:
it writes files, and `npm run check` regenerating artefacts as a side effect
is not something anyone should have to know about.

`token-sheet.ts` does the same for the event medallion, at the sizes it is
ACTUALLY drawn - 74px, 52px, 40px - each rendered small and then magnified,
so a detail that dies at cell size dies here too.

Rendering it large is what got the crown approved twice and failed on the
board twice: at 300px every ray and every shade is obvious, and at a 74px
cell the same art is a teal disc with a smudge on it. Sixteen milled ticks
were under a pixel each; a lit flank on a four-pixel ray was two two-pixel
slivers. Neither was visible as a mistake until the render matched the
screen.

One difference to keep in mind: `fillGradientStyle` flattens to its first
stop, because Phaser's four corner colours do not map onto one SVG gradient.
Anything drawn as a gradient shows here as its top-left tone.

