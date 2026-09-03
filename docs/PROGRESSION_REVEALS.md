# The reveal ladder

The owner's original plan for how this merge game creates progression. It is
not a list of features - it is an **order of surprises**, and the order is the
point. Each one reframes what the player thinks the game is.

In his words, the plan is:

1. **A 3D game inside the 2D game.** The player is playing a 2D merge board and
   discovers the project room is real 3D.
2. **The 3D room is not just a room - it expands.** What looked like a single
   fixed room turns out to grow.
3. **The whole house**, with an actual road and an outdoor environment.
4. **Multiple buildings.**
5. Nothing decided past this point yet.

## Why this is written down

Because it changes how things must be built *before* they are built. Anything
that hardcodes "the room" as a special case makes reveal 2 or 3 a rewrite
instead of an addition.

Consequences already applied:

- **Camera scopes are a list, not fixed zoom levels.** `ROOM_SCOPES` in
  `RoomView3D.ts` runs close -> room -> house, and a later reveal appends
  `street` and `district` as data rather than new camera code.
- **Wall visibility is a rule, not a room property.** "Hide what stands between
  the camera and the subject" works for one room and still works when a
  neighbouring building blocks the street.
- **The room model gained all four walls and a roof**, tagged `far` / `near` /
  `roof`. It was originally a two-wall cutaway built for a single fixed
  viewpoint, which cannot be zoomed out of.

## What this implies but is not built yet

- The GLB will need to become several loaded pieces rather than one file, so a
  reveal can add geometry without re-downloading the house.
- Each reveal wants a **moment** - a camera pull-back that shows the new scope -
  rather than the new scope simply being available next time the panel opens.
- Reveals should be gated on progression, so they land as rewards.

## The rule for whoever builds the next piece

Do not special-case the current scope. Ask whether the thing being written
would survive the world getting one level wider, because it is going to.
