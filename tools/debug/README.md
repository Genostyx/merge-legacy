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
3. **`health()` reports `inputLocked`, not just fps.** A locked game still
   renders at 60fps. A stuck `inputLocked` is what a "frozen screen" usually
   is - the board draws fine and ignores every tap.
