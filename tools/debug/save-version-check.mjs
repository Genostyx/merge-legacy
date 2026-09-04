/**
 * Static check: no save migration can outlive the version the save stamps.
 *
 * `loadOrSeed` gates one-time migrations on the loaded save's `boardVersion`:
 *
 *     if ((parsed.boardVersion ?? 0) < 10) { ...migrate once... }
 *
 * That only runs once because `saveState` then writes `boardVersion: 10`. If
 * the two numbers ever disagree - a gate above the stamped version - the
 * migration re-runs on EVERY load, forever.
 *
 * That is not hypothetical. It shipped to the dev server on 2026-09-04: an XP
 * curve migration gated on `< 10` while the save still stamped `9`, so every
 * refresh doubled the player's XP again, jumping levels and paying out
 * milestone crates each time. Typecheck, 222 tests and the build all passed -
 * the code was valid, it just re-migrated for ever.
 *
 * Run: node tools/debug/save-version-check.mjs   (also `npm run check:save`)
 */
import { readFileSync } from 'node:fs';

const FILE = 'src/game/scenes/board/saveGame.ts';
const src = readFileSync(FILE, 'utf8');

const gates = [...src.matchAll(/boardVersion\s*\?\?\s*0\)\s*<\s*(\d+)/g)].map((m) => Number(m[1]));
const stamps = [...src.matchAll(/\bboardVersion:\s*(\d+)/g)].map((m) => Number(m[1]));

const fail = (msg) => {
  console.error(`save-version-check: ${msg}`);
  process.exitCode = 1;
};

if (gates.length === 0) fail(`no migration gates found in ${FILE} - has it moved?`);
if (stamps.length === 0) fail(`no 'boardVersion: N' write found in ${FILE} - has it moved?`);
if (new Set(stamps).size > 1) fail(`the save stamps more than one version: ${stamps.join(', ')}`);

const stamped = stamps[0];
const tooHigh = gates.filter((g) => g > stamped);

if (tooHigh.length > 0) {
  fail(
    `migration gate(s) ${tooHigh.join(', ')} are above the stamped boardVersion ${stamped}.\n` +
    '  A save written by this build would trip them again on the next load, and\n' +
    '  every load after that. Bump the stamped version to at least ' + Math.max(...tooHigh) + '.'
  );
} else if (process.exitCode !== 1) {
  console.log(`save-version-check: ok - stamps ${stamped}, gates ${gates.sort((a, b) => a - b).join(', ')}`);
}
