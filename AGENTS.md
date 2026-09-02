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

## No automatic visual verification

- For visual changes, make only the requested edit and then stop.
- Give no extra explanation unless the project owner explicitly asks for it.
- Do not open, reload, inspect, screenshot, or otherwise visually verify the game after a visual change when the project owner can see the result themselves.
- Do not run browser automation or compare rendered output unless the project owner explicitly asks for visual verification.
- This restriction remains in effect even when visual verification would normally be considered good practice.
- Non-visual checks are also unnecessary for a small, isolated visual-value edit unless there is a concrete technical risk or the project owner explicitly requests them.
