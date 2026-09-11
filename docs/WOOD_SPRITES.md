# Wood sprite rendering

The wood item chain uses Blender-rendered transparent PNGs in
`public/assets/items/wood/1.png` through `9.png`. Keep the procedural meshes
as a fallback. Do not change gameplay while adjusting these assets.

## Shared camera and lighting

- Orthographic camera; elevation **26.565 degrees**, approved by the owner.
- Diagonal azimuth: camera toward +X / -Y, equal horizontal components.
- Use the same camera direction for every tier; only framing changes.
- Normalize each export copy to one unit before lighting and framing.
- Key area light: target-relative (-3, -4, 6), 450 W, size 4.
- Fill area light: target-relative (4, 1, 3), 180 W, size 3.
- Transparent film, 384 x 384 PNG RGBA, Cycles 16 samples with denoising.
- Frame evaluated world bounds with 20 percent margin.
- Current trial bevel width: 0.012 in source units, three segments.

Export copies must not alter the original Blender models. Source names are
wood1 through wood7, then knot3 and knot5 for tiers 8 and 9.

The open Blender source project was unsaved when this pipeline began.
Preserve it before closing Blender; PNG exports are not editable model backups.

## Corrections found while re-rendering

**Object rotation, 45 degrees about Z.** The models were left axis-aligned
under a 45-degree camera azimuth, so every piece was seen corner-on: a plank's
length ran diagonally away from the viewer instead of across the frame, and
the shapes read as lozenges rather than as timber. The camera is shared, so
the object is the half that moves. Screen-right for this camera is world
(1, 1), so each piece is turned +45 degrees about Z.

**One material per tier, not one for the chain.** The first renders used a
single wood material, so the palette ladder - dark brown at tier 1 climbing to
pale orange at tier 9 - was gone. Measured, every tier landed within a few
points of #64402a and tier NINE was the darkest of the set, the exact inverse
of the intent. Each tier now carries its own material from `WOOD_CHAIN`.

**Materials are calibrated against the render, not set from the swatch.** A
diffuse base colour only reaches its nominal value under full white light, and
how far short a tier falls depends on its SHAPE: a box shows mostly lit
planes, a knot is a tube that shadows itself constantly. Uncorrected, tiers 8
and 9 rendered darker than tier 7 and the ladder stopped climbing at the most
important merge in the chain. Each material is scaled per channel by how far
its own render missed its chain colour.

**Exposure.** 450 W / 180 W left everything at roughly 0.4x its base colour.
Key 1250 W, fill 520 W, plus a dim world background (0.055) so faces turned
away from both lamps keep their hue instead of going to black.

**Framing is measured on the CAMERA'S axes**, not the world's. A world
bounding box says nothing about how much of a rotated frame an object fills,
and framing off it is why exports ranged from 35 to 74 percent of their canvas.

Note: `bpy.context.view_layer.update()` is required after moving the camera
and before reading `matrix_world`, or each tier is framed against the previous
tier's camera position.
