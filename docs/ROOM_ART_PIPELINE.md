# Room art pipeline

The living-room project art is **rendered in Blender, not drawn in code**.
`drawLivingRoom` in `BoardScene.ts` still exists, but only as a fallback for a
missing texture.

## Files

| What | Where |
|---|---|
| Blender scene | `../blender/living-room.blend` |
| Furniture assets | `../assets-src/furniture-kit/` (Kenney Furniture Kit, **CC0**) |
| Rendered stages | `public/rooms/living-0.png` … `living-4.png` |
| Test renders | `../blender-tests/` (scratch, not shipped) |

Everything outside `merge-game/` is source material and is not part of the web
build. Only `public/rooms/*.png` ships.

## Why the camera is at 31.11 degrees

The board's projection is

```
iso(x, y, z) = [(x - y) * u * 0.6, (x + y) * u * 0.31 - z * u]
```

so the ground plane's screen ratio is `0.31 / 0.6 = 0.5167`, and the camera
elevation that reproduces it is `asin(0.5167) = 31.109 degrees`, at 45 degrees
azimuth, **orthographic**. Deriving it rather than eyeballing is what makes a
render sit in the same world as the board.

Two consequences worth knowing:

- **+X reads screen-LEFT and +Y screen-RIGHT** from this camera. Easy to get
  backwards; the first furniture layout was mirrored because of it.
- The projection **exaggerates height** by about 1.375x - `iso()` gives z a
  coefficient of 1.0 where the geometry implies ~0.73. Renders are currently
  physically correct, so the room is slightly shorter than the old drawn art.
  Stretch Z if it ever needs to sit directly beside vector objects.

## Lighting

Two suns, **cast shadows off**, plus a dark ambient world. Shadows were tried
and removed: they threw an arbitrary diagonal across the floor and fought the
flat art direction, which draws each plane as one even value.

The key comes from **+X**, not screen-upper-left as the code convention
suggests - in this projection the left wall's inward normal points
screen-right, so lighting it needs the opposite side.

## Adding furniture

`place()` in the build script handles conditioning: joins the glTF hierarchy,
normalises to a real-world size, seats the object on the floor, and remaps
every material to the room palette so Kenney's bright colours never render.

**Scale tall thin objects by height, not width.** Sizing a floor lamp by its
width made it a 3-metre column.

## Stages

Stage art is cumulative, matching `PROJECT_STAGE_NAMES`:

| Stage | Name | Contents |
|---|---|---|
| 0 | UNFINISHED ROOM | Raw concrete walls and screed, glazing not installed |
| 1 | FINISHED SURFACES | Walls and floor finished, glazing installed |
| 2 | MAIN FURNITURE | Rug, sofa, lounge chair, coffee table |
| 3 | LIGHTING & STORAGE | Floor lamp, ceiling light, bookcase, TV cabinet |
| 4 | COMPLETED LIVING ROOM | TV, plant, side table, books, pillow, small plant |

Group items by what the stage is CALLED, not by what balances the renders.
The lounge chair started in stage 4 and the TV cabinet too - but a chair is
main furniture and a cabinet is storage, so a player reading
"LIGHTING & STORAGE" and getting a television would be right to be confused.
The TV stays in stage 4 because it is neither, and the cabinet arriving empty
before it gains a screen is the better progression anyway.

Re-render by toggling `hide_render` per stage group and writing to
`public/rooms/living-<n>.png`. Keep **1024 square** - power-of-two so the
texture mipmaps like the rest of the game, which is what stops the aliasing
seen on non-POT source art. Set PNG compression to 100 (Blender defaults to
15); it took the set from 3.8 MB to 2.7 MB for free.

## What did not work

Generating a whole furnished room with an image-to-3D converter. The output
renders convincingly but has **no internal structure**: 5,062,539 vertices, and
separating it by loose parts gave 16,765 fragments whose largest islands were
all flat room surfaces (a 3.88 x 2.89 x 0.03 "floor") with 16,438 pieces under
20 polygons. The furniture is welded into the shells or shattered into dust.
It also crashed Blender twice.

Pre-made low-poly assets are the answer: the sofa in use is **128 polygons**.
