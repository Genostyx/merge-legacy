# Merge Game collaboration rules

## Approval required for new gameplay mechanics

- Do not implement, prototype, or silently bundle a new gameplay mechanic before the project owner explicitly approves that mechanic.
- Before asking for approval, explain in plain language:
  - exactly what the player will do and see;
  - what the mechanic rewards or costs;
  - how it affects merge, unlock, order, energy, economy, and pacing progression;
  - whether it changes or replaces any existing behavior;
  - any permanent save-data or UI changes.
- Wait for explicit approval after that explanation. A general request to continue or proceed only authorizes work already discussed and approved; it does not authorize adjacent mechanics.
- Preserve existing mechanics unless the project owner specifically approves changing or removing them. Confirm a mechanic's current behavior in the code before altering it.
- If the intended design is ambiguous, stop and ask rather than selecting a design and implementing it.

This rule applies to Codex, Claude, and any other coding agent working in this project.

## Visual verification: only when it tells you something

- Do not screenshot the game to confirm a change the project owner can simply see. A colour, a size, a position, a label - make the edit and stop.
- Give no extra explanation unless the project owner explicitly asks for it.
- DO open the game when looking is the only way to know whether something WORKS, or when a change is large enough that a crash is plausible: new interactive code, a new panel or screen, an input path, layout maths that has to hold at a real screen size. Finding a crash yourself is better than shipping it.
- Prefer the cheapest tool that answers the question. `tools/debug/icon-sheet.ts` renders a family's icons to SVG with no GPU and no game; reading the drawn colour values beats squinting at a screenshot, and the browser preview's WebGL context dies after a handful of reloads.
- Do not run browser automation to re-check work that already passed, to admire a result, or to produce a screenshot for the project owner - they are looking at the game already.
- Non-visual checks are unnecessary for a small, isolated visual-value edit unless there is a concrete technical risk.

## Show, don't tell - the art speaks for itself

- Do not label a thing that has been drawn. If a crate's artwork already says
  bronze, silver or gold, no `BRONZE` caption goes under it; the same holds for
  item tiers, dispensers, sources and currencies.
- A caption is allowed only where the art genuinely cannot carry the meaning: a
  NUMBER (a price, an amount, a countdown), a state that has no visual form
  (`SOLD`, `RESTOCKING`), or a name the player must learn and could not deduce.
- When a label and the artwork say the same thing, the label is what gets cut,
  not the art. If the art cannot say it, that is a reason to fix the art.
- This applies to every surface: board, orders, shop, crates, daily rewards,
  collection, project.

## Keep responses as short as possible

- Keep responses as short as possible, even down to one word answers.
- Do not explain things unless asked.

## Look at the reference before building anything

- The reference art is almost always already in the repo. `public/*.svg` holds
  the drawn marks; they are vector traces, so RENDER them (a throwaway HTML
  page of `<img>` tags in the preview) rather than trying to read the paths.
- Do not model, restyle or resize from an idea of what a thing looks like. The
  gem currency was built as a round brilliant-cut stone and the energy bolt as
  a multi-peak zigzag; the drawn art is a flat rhombus slab and a six-point
  leaning bolt. Thirty seconds of looking would have saved hours of iteration.
- For a material, look up what the real surface does - roughness, IOR, how the
  texture actually behaves - instead of dialling values until one looks
  passable.
- For anything about size or colour, MEASURE: alpha bounding boxes and mean
  pixel values off the PNGs, not eyeballing successive renders.
- Research is read-only and cheap. Guessing is what costs real usage.

## A question is not a task

- When the project owner asks a question, answer it and stop - one or two
  sentences - even when the answer makes an obvious fix apparent. Say what you
  would do, then wait.
- "Is X the same as Y?", "is this meant to look like that?", "am I crazy or..."
  are requests for information. Rebuilding something in reply is not an answer.
- This extends the existing rule about offhand remarks: an observation, a
  hunch, or a question is information, never an instruction.

## One approval, one change

- An approved change carries only itself. Do not bundle anything else into it,
  however obviously broken the other thing is.
- If the approved work exposes a second problem, NAME it and leave it. Ask
  before touching it.
- Bundling means a revert of the approved change cannot cleanly undo the rest,
  and each extra brings its own debugging.

## Isolate before iterating

- When something changed and the cause is unknown, run ONE control test that
  proves whether the suspect is even involved - revert the suspect and re-run,
  or render a single tier rather than a family.
- Do not iterate candidate fixes through a slow operation. Eight guessed
  renders once chased a colour shift that one control render identified
  immediately, and the material being "fixed" was innocent throughout.
- Blender's LIVE SCENE keeps state the repo does not: `view_transform`,
  `cycles.device`, sample counts, light energies. A `git reset` reverts the
  code that sets them, not the running session. When a render changes and the
  code did not, suspect scene state first.
