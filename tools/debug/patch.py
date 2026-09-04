"""Edit a source file, or fail loudly. Never silently.

    python tools/debug/patch.py <file> <old-file> <new-file> [expected-count]

`old-file` and `new-file` hold the exact text to find and the text to put in
its place. The edit is applied only if `old` appears EXACTLY `expected-count`
times (default 1); anything else exits non-zero and changes nothing.

WHY THIS EXISTS
---------------
On 2026-09-04 a one-line edit - bumping the save's stamped `boardVersion` from
9 to 10 - was written with a plain `str.replace()` whose search text had the
wrong indentation. It matched nothing. `replace()` does not complain, the
typecheck passed, all 222 tests passed, and the build succeeded, because the
code was still valid; it was just the OLD code.

The result was a save migration whose gate never closed. It re-ran on every
refresh, doubling the player's XP each time, jumping them levels and paying
out milestone crates until the game was unplayable.

Every check in the project passed. The only thing that would have caught it is
the edit itself refusing to be a no-op. That is all this script does.
"""
import io
import sys

if len(sys.argv) < 4:
    raise SystemExit(__doc__)

path, old_path, new_path = sys.argv[1], sys.argv[2], sys.argv[3]
expected = int(sys.argv[4]) if len(sys.argv) > 4 else 1

src = io.open(path, encoding='utf-8', newline='').read()
old = io.open(old_path, encoding='utf-8', newline='').read()
new = io.open(new_path, encoding='utf-8', newline='').read()

# Trailing newlines are an artefact of writing the needle to a file, not part
# of what the caller means to match.
old = old.rstrip('\r\n')
new = new.rstrip('\r\n')

found = src.count(old)
if found != expected:
    print(f'REFUSED: found {found} occurrence(s), expected {expected}', file=sys.stderr)
    if found == 0:
        # The most common cause is whitespace, so say which lines nearly match.
        needle = old.strip().split('\n')[0].strip()
        for i, line in enumerate(src.split('\n'), 1):
            if needle and needle in line:
                print(f'  near miss at line {i}: {line!r}', file=sys.stderr)
    raise SystemExit(1)

io.open(path, 'w', encoding='utf-8', newline='').write(src.replace(old, new, expected))
print(f'patched {path} ({expected} occurrence(s))')
