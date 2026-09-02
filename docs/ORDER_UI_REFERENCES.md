# Order row - reference notes

Layout references the project owner supplied (2026-08-30) while reworking the
order cards and the crate meter. The images themselves live in the chat
transcript, not in the repo, so this file records what was taken from them and
why - enough to work from without the screenshots.

**The aesthetic was never in question.** The project's own direction stands:
Modern, dark minimalist, organic minimalist, brutalist, with about 10%
industrial techno. Every reference
below is bright and cartoon-styled and was rejected on look. They were used
for LAYOUT and PROPORTION only, and the owner said so explicitly.

## The five references

1. **Merge title, two tinted squares.** Items in bevelled squares; the square's
   background lights up when the board can satisfy that item. This is the
   mechanic we adopted for satisfied requirements - see `REQ_PLATE_*` in
   `BoardScene.refreshOrderBar`. The owner explicitly did NOT want the same
   treatment on the board's own cells.
2. **Animal Crossing Pocket Camp.** Reward pill above the item row; square tint
   is per-card there, where ours is per-item. Per-item carries more
   information on a multi-item order, so we kept ours.
3. **Match-3 with the GO button.** The owner's favourite for SHAPE. Reward bar
   and a green GO button on one row above a panel of item slots. This is the
   card we built: a reward bar sized to its own contents, GO centred over it,
   slots in a tray below.
4. **Merge title with a horizontal meter above the board.** Source of the idea
   to move the crate meter out of a full-width bar. The owner's refinement was
   to keep our ring shape but put it in the ORDER ROW at the left, so it costs
   no vertical space of its own.
5. **Second merge title, for SCALE only.** Order cards there are much smaller
   relative to the board than ours were. Drove `ORDER_CARD_H` 88 -> 68,
   `ORDER_CARD_MIN_W` 78 -> 58 and `REQ_PLATE` 52 -> 38.

## Decisions that came out of them

- The card sizes to its SLOTS. The reward bar sizes to itself and may be
  shorter or longer than the card; it never drags the card's width around.
  A bigger payout is not a bigger order.
- No outer card panel. The card is two shapes - the reward bar and the slot
  tray - sitting directly on the board. A third shape behind them was only
  adding a second border.
- The reward bar is drawn BEFORE the tray and runs past its top edge, so its
  lower bevels finish behind the card and it reads as a tab slotted in.
- The reward bar uses the board pane's own translucent glass
  (`Theme.bgElevated` at 0.84), which ties the two together without inventing
  a colour.
- No titles and no `0/2` fractions on cards. Multiples get an `xN` badge;
  a single item gets nothing, because a badge on every item stops being
  information. Collection orders keep words plus a live `N/M`, since they have
  no item to draw.
- Green marks the individual satisfied ITEM, not the whole card. Flooding the
  card only ever said "done", which its move to the front of the queue
  already says.
- The crate meter is the old bar's track, fill and threshold notches wrapped
  into a ring, at the left of the order row. The notches were kept
  deliberately: seeing exactly where bronze/silver/gold sit is the whole
  difference between this and a slot-machine meter.
