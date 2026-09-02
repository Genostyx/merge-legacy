# Open Design Decisions

**Core aesthetic standard — Aura (decided 2026-09-02).** Every element, individually and as part of the whole game, should feel awe-inspiring and significant rather than generic, disposable, or visually timid.

- Give every item an iconic silhouette and convincing material presence.
- Make higher tiers feel rarer and more imposing, not merely busier.
- Treat dispensers as meaningful structures rather than ordinary board props.
- Make project rooms feel architectural and monumental.
- Give rewards weight, anticipation, and a clear sense of arrival through animation and sound.
- Keep the interface restrained so it frames the artwork instead of cheapening or competing with it.
- Use color, scale, lighting, motion, and sound to create awe without relying on warm lighting or excessive effects.
- Functionality alone is insufficient: anything that feels generic or insignificant does not meet the aesthetic standard.

**Paid board expansion (implemented 2026-08-31).** The two bottom rows of the 6x9 board begin unavailable. The first row becomes purchasable after every original locked board item has been cleared; its six cells cost 1,000, 2,000, 4,000, 8,000, 16,000, and 32,000 Credits from left to right. The second row becomes purchasable at player level 50; its cells cost 10,000, 20,000, 40,000, 80,000, 160,000, and 320,000 Credits. Once a row is eligible, players may buy its cells independently in any order. This preserves player choice while the rising prices naturally encourage left-to-right expansion.

**Order card formatting - reference shapes (logged 2026-08-30).** Owner supplied three shots (a merge title, Animal Crossing Pocket Camp, a match-3). Aesthetic is NOT in question - the project's own direction stands. These are logged for LAYOUT only:

- Rewards sit ABOVE the items, in a pill that straddles the card's top edge. Ours are underneath.
- The card body is then only the item row - nothing else competes with it.
- Light card with inset squares, the inverse of ours (dark card, dark slots).
- A dedicated GO button for a completable order, rather than the whole card being the button. Worth weighing against the current behaviour, where tapping the card delivers and tapping an item describes it.
- Square tint reads as per-card in the Pocket Camp shot and per-item in the merge one; ours is per-item, which carries more information on a multi-item order.


- Considering making wood the only dispenser family with no recharge timer, since the player ends up gated by something either way once other families/energy are involved - would only remove the wait on the one starter/common family, not the whole pacing gate. Depends on resolving the Tasty Travels/Merge Camp timerless-dispenser research below before deciding.

