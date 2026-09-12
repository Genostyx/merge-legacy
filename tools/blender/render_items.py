"""
Builds and renders the item sprites. Run inside Blender:

    blender --background --python tools/blender/render_items.py

THIS FILE IS THE PIPELINE. The wood chain was first built through one-off
commands typed at a live Blender session, which meant the models existed
nowhere but in that session's memory - close Blender and the only artefacts
left are PNGs, which are not editable sources. Everything needed to rebuild
every sprite from nothing is here.

The camera and the light are shared by every family and must stay that way;
only the geometry per tier differs.
"""

import math
import os
import shutil
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# ---- camera ----------------------------------------------------------------

# 26.565 degrees is atan(0.5) - half the horizontal run - which is the angle a
# ground edge makes in the game's own projection (see Mesh3D.ts, ISO_RISE over
# ISO_RUN). The runtime spent a long time at 27.324 by accident; sprites and
# procedural art have to agree or objects sit at visibly different angles in
# the same board cell.
ELEVATION = math.radians(26.565)
AZIMUTH = math.radians(225)          # looking toward +X / -Y, equal components
MARGIN = 1.16                        # frame padding, as a multiple of the fit
# 192, not 384. A board tile renders at roughly 74px and the panels draw
# these at 0.9 of a slot, so 384 was about five times oversampled - four
# times the download and four times the GPU memory for detail no surface in
# the game is big enough to show. Every fill ratio in the TypeScript is a
# RATIO, so none of them move with this.
# POWERS OF TWO, and that is not a stylistic choice.
#
# The game runs on WebGL1, which cannot build mipmaps for a non-power-of-two
# texture - so main.ts asking for LINEAR_MIPMAP_LINEAR was being silently
# downgraded to plain LINEAR, and minifying a sprite to tile size sampled
# four texels out of the whole image however large it was. That is the
# pixel-crawling edge on the event token, and it is why raising the
# resolution from 192 to 384 to 768 never fixed it and never could.
#
# 256 gives every board item a real mipmap chain down to the ~74px tile.
# HOW FAR THE FACE-ON MARKS TURN, in degrees about the screen vertical.
#
# 0, measured rather than chosen. At -30 the coin, the gem and the token all
# turned their faces away from both lamps and came back dull - the chip coin
# averaged 0x765f1c with 3 percent of it lit. Square on it averages 0xccb67e
# with 60 percent lit. Every attempt to make these three "shinier" through
# roughness or a clear coat moved the highlight by less than half a percent,
# because the studio's lamps are large and soft: on these surfaces brightness
# comes from facing a lamp, not from polish.
MARK_SWING = 10

# And how far the camera sits ABOVE them, as a tilt on the mark itself - the
# camera is shared by every family, so the same view is had by tipping the
# piece. Negative looks down on it, the way the lightning bolt is seen.
MARK_TILT = 12

# The token keeps the -10 it was set at; only the coin and the gem moved to
# +10. Same axis, its own number.
TOKEN_SWING = -10

# The coin's own tilt. Leaving it on MARK_TILT would drag the gem with it.
# THE CHIP MARKS' OWN ORIENTATION, shared by the coin and the gem so the two
# sitting side by side on the HUD bar cannot drift apart. The board's pieces
# keep MARK_SWING / MARK_TILT.
CHIP_SWING = 16
CHIP_TILT = -25

# The coin looks down a little more than the gem does.
COIN_TILT = -18


# Measured on the gem mark itself, at its own material and pose.
GEM_MARK_MEASURED = 0x705d8e

RESOLUTION = 256

# Families that need more than the default, and why.
#
# The board's items are chunky solids - planks, blocks, rocks - and 256 is
# ample. These two are seen FACE ON and read by fine detail: the token's
# crown is thin diagonal rays, which are the first thing to break up. 512,
# still a power of two so they mipmap properly.
FAMILY_RESOLUTION = {"event-token": 512, "credit-mark": 512,
                     "gem-mark": 512}

# Screen-horizontal in world terms, for this camera. Anything that has to
# splay left and right on screen leans along this, NOT along +X and +Y - those
# are opposite axes in the world but fall to the SAME side of the frame here,
# which is what turned the tier-five V into a single wedge twice.
# MEASURED, not assumed. Projecting a unit of this into camera space gives
# screen x = +1.11; the opposite, (1, 1, 0), gives -0.89. I had it as (1, 1, 0)
# and so every `beside(right)` in the file meant LEFT - which is invisible on
# a symmetric scatter and very visible the moment something has to sit in
# front of something else on a particular side.
SCREEN_RIGHT = Vector((-1, -1, 0)).normalized()
LEAN_AXIS = Vector((1, -1, 0)).normalized()

# ---- material --------------------------------------------------------------

# Straight from WOOD_CHAIN in src/game/data/chains.ts. One material per TIER,
# never one per family: a single wood material collapsed the ladder so
# completely that tier nine rendered darker than tier one.
WOOD_HEX = {
    1: 0x44302c, 2: 0x5d3b32, 3: 0x794434, 4: 0x994e33, 5: 0xb95c31,
    6: 0xd56c34, 7: 0xe18447, 8: 0xeb9c5c, 9: 0xf2a866,
}

# How far each tier's render missed its chain colour on the last pass, used to
# scale the material back onto the ladder.
#
# A diffuse base colour only reaches its nominal value under full white light,
# and how far short it falls depends on the SHAPE: a box shows mostly lit
# planes, a knot is a tube that shadows itself constantly. Uncorrected, tiers
# 8 and 9 came out darker than tier 7 and the ladder stopped climbing at the
# most important merge in the chain.
WOOD_MEASURED = {
    1: 0x40322f, 2: 0x71534c, 3: 0x7f5549, 4: 0x8e5744, 5: 0x9b5b3f,
    6: 0xa15e3c, 7: 0xaf7250, 8: 0x926140, 9: 0x8c5d3d,
}

# Straight from STONE_CHAIN. Mineral must not come out as wood in blue, so
# the ladder is carried by FORM as much as colour: found chunks at the bottom,
# worked stone in the middle, cut crystal at the top.
MINERAL_HEX = {
    1: 0x485562, 2: 0x566676, 3: 0x506274, 4: 0x687b8d, 5: 0x929faa,
    # BOTH cut stones are amber now, not the chain's old dark blues. A deep
    # blue at this absorption depth returns almost nothing - the surviving
    # colour has nowhere bright to survive TO - which is why the marquise kept
    # coming back black however far its density was dropped.
    6: 0xb3818a, 7: 0xafbac1, 8: 0xb4501f, 9: 0xc85f26,
}
# Measured off the first pass, same as wood's.
MINERAL_MEASURED = {
    1: 0x616e79, 2: 0x6d7983, 3: 0x5d6974, 4: 0x6d7881, 5: 0x838b91,
    # Tiers 8 and 9 hold no correction: their measurements were taken when
    # both were dark blue, and applying them to an amber divides the red up by
    # two and a half while cutting the blue to a quarter - a correction aimed
    # at a colour these tiers no longer are. Identity means "uncorrected".
    6: 0x8d6e73, 7: 0x8d9497, 8: 0xb4501f, 9: 0xc85f26,
}

# MEASURED SURFACES, not chosen ones.
#
# Every number below comes from published PBR reference rather than from what
# looked plausible in the last render, and the gap was not small: dry stone
# sits at 0.75 roughness and rough stone at 0.85-0.95, while everything here
# had been sitting at 0.46 - which is the varnish range. A dielectric that
# glossy, lit by one hard key, is indistinguishable from metal, and that is
# what it looked like.
#
# Roughness: painted/varnished 0.1-0.3, dry concrete 0.5-0.7, sanded wood
# 0.55-0.70, dry stone 0.75-0.95, cloth and heavily weathered 0.8-1.0.
# IOR: wood and marble 1.5-1.7, granite 1.65-1.75, quartz 1.54, sapphire 1.77.
#
# Sources:
#   https://sameerbaloch.com/roughness-setting/
#   https://polycount.com/discussion/164435/physically-accurate-material-values
#   https://pixelandpoly.com/ior.html
#
# SPECULAR IOR LEVEL IS 0.5, not 0.35. 0.5 is Blender's neutral - it means
# "use the IOR as given". Setting 0.35 quietly pushed reflectance BELOW
# physical and then the sheen was chased with roughness instead, which is the
# wrong control and the reason nothing responded the way it should have.
NEUTRAL_SPECULAR = 0.5

# (roughness, IOR) per mineral tier, by what the tier actually is.
MINERAL_SURFACE = {
    1: (0.88, 1.55),   # slate, split and dry
    2: (0.91, 1.55),   # rubble, freshly broken
    3: (0.91, 1.55),   # gravel
    # 4-6 ARE THE POLISHED TIERS. That is not a departure from reference -
    # polished stone is a real finish and these three are literally named for
    # it - and it is what turns the ladder into a story: rough rock is picked
    # up, worked, and finally polished, before being cut at 7.
    # Polished stone really is this smooth - a honed countertop sits near
    # 0.1 and a polished one below it. 0.22 was still a satin finish.
    4: (0.10, 1.55),   # polished stone
    5: (0.07, 1.60),   # polished marble
    6: (0.12, 1.70),   # polished granite, like a countertop
    7: (0.22, 1.54),   # milky quartz - waxy, not glassy
    8: (0.12, 1.77),   # sapphire - polished surface, not a transmitting one
    9: (0.06, 1.77),   # star sapphire
}

# Sanded timber. Wood is never glossy, and it is the one family where the
# grain does the work the highlight would otherwise have to.
WOOD_SURFACE = (0.66, 1.50)

# The chain colours in linear space, for anything that needs the hue rather
# than a calibrated base colour - the gem volumes take this, not the
# render-corrected material value.
MINERAL_HEX_RGB = {
    tier: tuple(((c >> shift) & 255) / 255.0 for shift in (16, 8, 0))
    for tier, c in MINERAL_HEX.items()
}

# Straight from CREDIT_CHAIN, ENERGY_CURRENCY_CHAIN and GEM_CURRENCY_CHAIN.
# No calibration entries: these are metal, emission and transmission, none of
# which have a diffuse base colour for a measured correction to act on.
CURRENCY_HEX = {
    # A NARROWER ramp. The old one ran 0xe7aa32 to 0xf9d66b and the ends
    # pulled apart once rendered - tier one read as dull brass, tier six as
    # near-white. Lifting the bottom and pulling the top back keeps six
    # steps that still climb without either end leaving the family.
    "currency-credit": {1: 0xecb63e, 2: 0xeeb943, 3: 0xefbd48,
                        4: 0xf1c04d, 5: 0xf2c452, 6: 0xf4c757},
    "currency-energy": {1: 0x24a9e8, 2: 0x2ab3ed, 3: 0x35bef0,
                        4: 0x48c9f2, 5: 0x61d3f4},
    # The whole ladder pulled DOWN, both ends by hand: tier one was reading
    # hot rather than as the base of the family, and tier five was close to
    # washing out. Same five even steps, lower.
    "currency-gem": {1: 0x8f63b4, 2: 0x9a6fbd, 3: 0xa77cc5,
                     4: 0xb287cb, 5: 0xbe92d0},
}
# Measured off a render. A metal has no diffuse colour - it tints what it
# reflects - so it renders well below its swatch by nature, and the gain is
# capped hard (see below) rather than closing that gap: gold at 3x drives red
# and green to 1.0, leaves blue behind, and stops being gold.
CURRENCY_MEASURED = {
    "currency-credit": {1: 0x4d3613, 2: 0x503714, 3: 0x6c5129,
                        4: 0x684f26, 5: 0x7d6032, 6: 0x635435},
    # The bolts had no correction and came back around 0x8db7cf against a
    # chain colour of 0x24a9e8 - a pale chalky blue, nowhere near it. A
    # saturated colour under a bright studio loses its saturation first,
    # because the light lifts the weak channel proportionally far more than
    # the strong one; red went from 36 to 141 while blue barely moved. The
    # correction is mostly a red cut, which is what puts the blue back.
    "currency-energy": {1: 0x8db7cf, 2: 0x90bbd1, 3: 0x94bed1,
                        4: 0x92baca, 5: 0x9dc1ce},
    # The gems had NO entry at all, so `measured` fell back to the wanted
    # colour, every gain came out 1.0, and the family rendered uncorrected -
    # which is the whole reason the board gem sat dark and grey next to the
    # calibrated chip mark. Measured off the alpha-masked renders at the
    # chip mark's coat. RE-MEASURED after the pose change: the mark's swing
    # puts far more lit face in shot, so the family now renders BRIGHTER
    # than its swatch and the correction is a cut rather than a lift.
    "currency-gem": {1: 0xa79cba, 2: 0xa499b7, 3: 0xaca2bb,
                     4: 0xa69bb4, 5: 0xb0a5b9},
}

CURRENCY_RGB = {
    kind: {tier: tuple(((c >> shift) & 255) / 255.0 for shift in (16, 8, 0))
           for tier, c in tiers.items()}
    for kind, tiers in CURRENCY_HEX.items()
}

# Straight from WATER_CHAIN in src/game/data/chains.ts. Twelve tiers, the
# longest chain in the game.
WATER_HEX = {
    1: 0x315f86, 2: 0x356f9b, 3: 0x3980ae, 4: 0x3d90be, 5: 0x42a0cc,
    6: 0x48afd7, 7: 0x52bde0, 8: 0x60c9e7, 9: 0x72d3ec, 10: 0x86dcf0,
    11: 0x9ce5f4, 12: 0xb4edf7,
}
# Measured off the first clean pass, the way wood and mineral were. A half
# transmissive body under a bright studio loses its saturation before it
# loses its value, so these are mostly cuts to red and green.
WATER_MEASURED = {
    1: 0x456580, 2: 0x486f8c, 3: 0x78a1bd, 4: 0x78a3be, 5: 0x648ca4,
    6: 0x70a1bb, 7: 0x6ea2ba, 8: 0x6c9db1, 9: 0x9cc0cd, 10: 0x79a6b5,
    11: 0xa6c3cb, 12: 0xb0c7cc,
}
WATER_RGB = {
    tier: tuple(((c >> shift) & 255) / 255.0 for shift in (16, 8, 0))
    for tier, c in WATER_HEX.items()
}


BEVEL_WIDTH = 0.016      # a sawn arris, not a moulded edge
BEVEL_SEGMENTS = 2
SMOOTH_ANGLE = math.radians(30)
STACK_GAP = 0.006        # so stacked planks keep four edges each


def srgb_to_linear(channel: int) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def tier_material(name: str, want: int, measured: int, max_gain: float = 3.0):
    """A material built FRESH, every time.

    This used to fetch the existing material by name and set the handful of
    inputs it cared about, which meant every run inherited whatever the last
    one had done. Tier eight was still carrying Transmission 1.0 and a linked
    Volume Absorption node from an experiment several passes earlier - a fully
    transmissive surface under a clear coat, which is why it read as chrome no
    matter what the current code said. "Resetting" it changed nothing, because
    nothing was ever reset.

    Renders have to depend only on the code that produced them, so the node
    tree is wiped and rebuilt rather than amended.
    """
    existing = bpy.data.materials.get(name)
    if existing is not None:
        bpy.data.materials.remove(existing)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    rgb = []
    for shift in (16, 8, 0):
        base = srgb_to_linear((want >> shift) & 255)
        gain = ((want >> shift) & 255) / max(1, (measured >> shift) & 255)
        rgb.append(min(1.0, base * min(max_gain, max(0.4, gain))))
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = NEUTRAL_SPECULAR
    return mat



# ---- material texture ------------------------------------------------------
#
# A flat base colour on a Principled BSDF is a coloured plastic, whatever the
# geometry underneath it. Every family in this game is named for a MATERIAL -
# wood, stone, glass - and the thing that makes one read is surface: grain
# running one way along a plank, salt-and-pepper flecks through granite, light
# passing THROUGH a sapphire instead of bouncing off it. Shape alone cannot
# carry that, which is why these tiers looked like toys.
#
# All procedural, so nothing here needs an image file or a UV unwrap.


def _shader(mat):
    return mat.node_tree.nodes["Principled BSDF"]


def _texture_coords(mat, scale=(1.0, 1.0, 1.0)):
    """Object-space coordinates, so a pattern stays put on the mesh."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = scale
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    return mapping.outputs["Vector"]


def grain(mat, base_rgb, contrast=0.30, scale=(1.0, 26.0, 5.0)):
    """Wood grain: noise stretched hard along ONE axis.

    Grain is directional - that is the whole of what makes a surface read as
    timber rather than as stone - so the noise is squashed to near-lines
    across the board and left long down its length.
    """
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 6.0
    links.new(_texture_coords(mat, scale), noise.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    # Proportional, both ends. Every attempt to give the dark tiers a bigger
    # absolute spread - blending the light end towards white, a flat lift,
    # capping the triple - was chasing a colour shift that turned out to be
    # the view transform left on Standard in the live scene, not the ramp.
    # Scaling keeps the hue, which is the whole job here.
    dark = [max(0.0, c * (1.0 - contrast)) for c in base_rgb]
    light = [min(1.0, c * (1.0 + contrast)) for c in base_rgb]
    ramp.color_ramp.elements[0].position = 0.36
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], _shader(mat).inputs["Base Color"])

    # Grain is also a texture you can FEEL: a little bump keeps the light from
    # sliding across a plank as though it were painted.
    bump = nodes.new("ShaderNodeBump")
    # 0.45, not 0.12. AgX compresses colour variation hard, so raising the
    # ramp's contrast alone barely shows - the grain kept coming back faint
    # however far the tint was pushed. Relief survives tone mapping, because
    # it changes how much light each line catches rather than what colour it
    # is, so on this pipeline the bump is the lever that actually works.
    bump.inputs["Strength"].default_value = 0.45
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], _shader(mat).inputs["Normal"])
    return mat


def speckle(mat, base_rgb, density=110.0, amount=0.55):
    """Granite's salt-and-pepper: sharp light and dark flecks, not a wash.

    The original art called for dark AND light flecks together, since that is
    granite's real signature; a single tone of noise just looks like dirt.
    """
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = density
    noise.inputs["Detail"].default_value = 2.0
    noise.inputs["Roughness"].default_value = 0.8
    links.new(_texture_coords(mat), noise.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = 'CONSTANT'
    dark = [c * (1.0 - amount) for c in base_rgb]
    light = [min(1.0, c + (1.0 - c) * amount) for c in base_rgb]
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.46
    ramp.color_ramp.elements[1].color = (*base_rgb, 1.0)
    third = ramp.color_ramp.elements.new(0.58)
    third.color = (*light, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], _shader(mat).inputs["Base Color"])
    return mat


def veins(mat, base_rgb, scale=(3.0, 3.0, 3.0)):
    """Marble: a few pale threads wandering through, not a busy pattern."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.2
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.62
    links.new(_texture_coords(mat, scale), noise.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    pale = [min(1.0, c + (1.0 - c) * 0.55) for c in base_rgb]
    ramp.color_ramp.elements[0].position = 0.46
    ramp.color_ramp.elements[0].color = (*base_rgb, 1.0)
    ramp.color_ramp.elements[1].position = 0.56
    ramp.color_ramp.elements[1].color = (*pale, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], _shader(mat).inputs["Base Color"])
    return mat


def mottle(mat, base_rgb, scale=9.0, strength=0.16):
    """Broad colour variation across a rock face.

    `weathered` only ever varied ROUGHNESS, which is invisible on a matte
    surface - so tiers one to four had no texture at all, just a flat fill
    with a bump. Stone is not one colour: it is blotched at a scale you can
    see across the whole piece, and that is what the eye reads as rock.
    """
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.58
    links.new(_texture_coords(mat), noise.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    # The light end blends toward WHITE rather than scaling the base up.
    # Scaling can only reach base * (1 + strength), so on a mid grey it tops
    # out at another mid grey and the variation reads as shading. Broken stone
    # has chalky near-white weathering on it, and that is a different colour,
    # not a brighter one.
    dark = [max(0.0, c * (1.0 - strength)) for c in base_rgb]
    light = [c + (1.0 - c) * strength for c in base_rgb]
    ramp.color_ramp.elements[0].position = 0.30
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].position = 0.70
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], _shader(mat).inputs["Base Color"])
    return mat


def polished(mat, coat_roughness=0.03):
    """A clear coat over the stone - which is what a polished slab IS.

    Dropping base roughness alone could never get there: a dielectric reflects
    only about 5% of the light at face-on incidence, so however smooth the
    stone got, "polished" kept arriving as "dark with a small lamp on it". A
    countertop is sealed - there is a separate, much glossier layer sitting on
    top of the stone, and the stone shows through it. That is a coat, and
    Principled has one.
    """
    shader = _shader(mat)
    shader.inputs["Coat Weight"].default_value = 1.0
    shader.inputs["Coat Roughness"].default_value = coat_roughness
    shader.inputs["Coat IOR"].default_value = 1.5
    return mat


def milky(mat, base_rgb, radius=0.22, weight=0.72):
    """Cloudy translucent stone - milky quartz, agate, alabaster.

    NOT transmission. Pure quartz is as clear as glass, but milky quartz is
    quartz shot through with kaolin and feldspar, and that makes it a
    slightly translucent DIFFUSE material: light enters, bounces about inside
    and leaves somewhere else, rather than passing straight through. Rendered
    with transmission it comes out as a cut window pane, which is what tiers
    7-9 had become.

    Subsurface is the tool for exactly this - the manual lists marble and wax
    beside skin and milk - and it is what gives a tumbled pebble its waxy
    depth instead of a hard glassy edge.
    """
    shader = _shader(mat)
    shader.inputs["Transmission Weight"].default_value = 0.0
    shader.inputs["Subsurface Weight"].default_value = weight
    shader.inputs["Subsurface Scale"].default_value = radius
    # Slightly warm and unequal per channel: light travels further
    # through a stone at the red end, which is what stops the interior
    # reading as grey.
    shader.inputs["Subsurface Radius"].default_value = (1.0, 0.62, 0.44)
    lifted = [min(1.0, c + (1.0 - c) * 0.45) for c in base_rgb]
    shader.inputs["Base Color"].default_value = (*lifted, 1.0)
    return mat


def absorbing(mat, colour_rgb, density=7.0):
    """Colour that lives INSIDE the stone, deepening with thickness.

    A tinted surface colours every ray by the same amount however far it
    travelled, so the whole stone comes out one flat shade - which is why the
    sapphire read as coloured plastic with highlights on it.

    A real gem is a clear body with a tint dissolved through it: light that
    only clips a corner comes back bright and saturated, light that crosses
    the whole stone comes back dark and deep. That gradient IS the look of a
    gemstone, and it is Beer-Lambert absorption, not a surface property. So
    the surface goes clear and the colour moves into the volume.
    """
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = _shader(mat)
    # Clear glass on the outside; all the colour is in the body now, and
    # leaving a tint here as well would filter the light twice.
    shader.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)

    absorb = nodes.new("ShaderNodeVolumeAbsorption")
    # Volume Absorption's colour is what SURVIVES the journey, so it takes
    # the tier's own hue, pushed saturated - whatever is left after a long
    # path is what the deep parts of the stone will look like.
    peak = max(colour_rgb) or 1.0
    vivid = [min(1.0, c / peak) for c in colour_rgb]
    absorb.inputs["Color"].default_value = (*vivid, 1.0)
    absorb.inputs["Density"].default_value = density
    output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
    links.new(absorb.outputs["Volume"], output.inputs["Volume"])

    return mat


def weathered(mat, strength=0.30, scale=48.0):
    """Roughness variation, so a rock is not uniformly matte plastic."""
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 4.0
    links.new(_texture_coords(mat), noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    base = _shader(mat).inputs["Roughness"].default_value
    ramp.color_ramp.elements[0].color = (base * (1 - strength),) * 3 + (1.0,)
    ramp.color_ramp.elements[1].color = (min(1.0, base * (1 + strength)),) * 3 + (1.0,)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], _shader(mat).inputs["Roughness"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], _shader(mat).inputs["Normal"])
    return mat


# THE GLASS RECIPE, kept for the glass family.
#
# These settings were built for mineral tiers 7-9 and are wrong there - they
# produce window glass, and quartz is not glass. They are exactly right for
# the GLASS chain, though, so they are recorded here rather than tuned away
# and rediscovered later. IOR 1.52 is soda-lime glass.
GLASS_PRESET = {"ior": 1.52, "roughness": 0.06, "tint_strength": 0.86}


def gemstone(mat, ior=1.77, roughness=0.06, tint_strength=0.86):
    """A cut stone that light goes THROUGH.

    This is the one that cannot be faked. A gem is dark where it is thick and
    bright where a facet catches, and that inversion comes from refraction -
    an opaque diffuse surface produces the exact opposite and reads as a
    painted pebble however many facets it has.

    The base colour is lightened first, but only a LITTLE: in transmission the
    colour multiplies along the whole path through the stone, so a mid-tone
    base comes out almost black - and lifting it too far costs the stone its
    hue instead, which turns a sapphire into a lump of clear glass. Keeping
    most of the saturation and letting the bright transmission sky do the
    lifting is what holds both.
    """
    shader = _shader(mat)
    colour = shader.inputs["Base Color"].default_value
    lifted = [min(1.0, c + (1.0 - c) * (1.0 - tint_strength)) for c in colour[:3]]
    shader.inputs["Base Color"].default_value = (*lifted, 1.0)
    shader.inputs["Transmission Weight"].default_value = 1.0
    shader.inputs["IOR"].default_value = ior
    # A polished gem really is this smooth - the reference range is 0.05-0.1
    # - and unlike the rocks it is SUPPOSED to be. What stopped it reading as
    # chrome was never the roughness: it was that the rocks around it were
    # glossy too, so nothing separated them.
    shader.inputs["Roughness"].default_value = roughness
    return mat


# ---- geometry helpers ------------------------------------------------------

def cube(w: float, d: float, h: float, loc=(0, 0, 0), base=True):
    """A box by FULL extents, standing on z=0 unless base=False.

    Location is baked in, so the object's origin lands on the world origin and
    any later rotation pivots THERE - which is what lets a leg lean from its
    foot instead of swinging about its middle.
    """
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.active_object
    ob.scale = (w, d, h)
    ob.location = (loc[0], loc[1], loc[2] + (h / 2 if base else 0))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def merge(parts):
    """One solid. ONLY for bars that genuinely pass through each other.

    Overlapping shells that are merely joined keep their interior faces, and
    you see straight into them - that was the black diamond in the middle of
    the X block.
    """
    base = parts[0]
    for other in parts[1:]:
        mod = base.modifiers.new("Union", 'BOOLEAN')
        mod.operation, mod.object, mod.solver = 'UNION', other, 'EXACT'
        bpy.context.view_layer.objects.active = base
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(other, do_unlink=True)
    return base


def carve(target, tool):
    """Cuts `tool` out of `target`. The opposite of merge().

    The credit symbol is a slot SUNK into the coin, not a bar sitting on it -
    a recess catches the key light on its far wall and shadows on its near
    one, which is what makes a struck coin look struck. A raised bar reads as
    something glued on.
    """
    mod = target.modifiers.new("Carve", 'BOOLEAN')
    mod.operation, mod.object, mod.solver = 'DIFFERENCE', tool, 'EXACT'
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool, do_unlink=True)
    return target


def stack(parts):
    """Separate pieces sharing one object, each keeping its own edges.

    The opposite of `merge`, and the distinction is visible: boolean-merging
    stacked planks let the bevel run smoothly over the joins, which told the
    truth - they had stopped being separate planks.
    """
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    return bpy.context.active_object


def beside(right: float, back: float = 0.0):
    """A world offset expressed in SCREEN terms: right, and away from viewer.

    Pieces that must read as separate have to separate ACROSS the frame, and
    world axes are a poor guide to that: +X and +Y look like opposites but
    fall to the same side here, while (1, -1) is the view axis and puts one
    piece directly behind another. This is the third time that has cost a
    shape - the V's legs, the quartz cluster, and nearly the rubble.
    """
    return tuple(SCREEN_RIGHT * right + Vector((1, -1, 0)).normalized() * back)


def translate_to(ob, loc):
    """Moves a finished piece, baking the offset into its vertices."""
    ob.location = loc
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return ob


def lean(ob, degrees: float):
    """Tips a piece along the SCREEN horizontal, about its own origin."""
    ob.rotation_euler = Matrix.Rotation(math.radians(degrees), 4, LEAN_AXIS).to_euler()
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return ob


def finish(ob, name: str, material, bevel: float = BEVEL_WIDTH,
           smooth_angle: float = SMOOTH_ANGLE, subdivide: int = 0):
    # SUBDIVISION FIRST, and it is the only thing that fixes a silhouette.
    #
    # Shade-smooth and a wider auto-smooth angle only change how existing
    # faces are SHADED - the outline is still the polygon it always was, so
    # the little points survive every one of those settings. Subdivision adds
    # real geometry, so the edge of the shape actually curves.
    #
    # Before the bevel, so the bevel runs on the finished surface rather than
    # on a cage that is about to move.
    if subdivide:
        sub = ob.modifiers.new("Subdivision", 'SUBSURF')
        sub.levels = sub.render_levels = subdivide

    mod = ob.modifiers.new("Bevel", 'BEVEL')
    mod.width, mod.segments = bevel, BEVEL_SEGMENTS
    mod.limit_method, mod.angle_limit = 'ANGLE', SMOOTH_ANGLE
    mod.use_clamp_overlap = True
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_auto_smooth(angle=smooth_angle)
    ob.name = name
    ob.data.materials.clear()
    ob.data.materials.append(material)
    return ob


def rock(width: float, height: float, seed: int, jitter: float = 0.26,
         points: int = 13):
    """A broken chunk: the convex hull of scattered points.

    THE HULL IS THE POINT. Every previous version started from a sphere and
    pushed its vertices about, which forces a choice between two failures -
    per-vertex randomness makes spikes, and smoothing or subdividing the
    spikes away leaves a pebble with no stone left in it. Neither is broken
    rock, because a sphere has no flat faces to begin with and displacement
    cannot invent them.

    A hull has nothing but flat faces and sharp edges, by construction. There
    are no spikes to remove, no tessellation to hide, and no silhouette
    artefacts - the outline is made of the same real edges as the surface.
    Fewer points give chunkier facets.
    """
    rng = random.Random(seed)
    mesh = bpy.data.meshes.new("rock")
    bm = bmesh.new()
    for _ in range(points):
        # A direction on the sphere, then a radius that varies - the radius is
        # what makes facets differ in size, and equal radii would give
        # something close to a regular solid.
        z = rng.uniform(-1.0, 1.0)
        theta = rng.uniform(0.0, 2.0 * math.pi)
        ring = math.sqrt(max(0.0, 1.0 - z * z))
        radius = 0.5 * (1.0 + rng.uniform(-jitter, jitter))
        bm.verts.new((math.cos(theta) * ring * radius * width,
                      math.sin(theta) * ring * radius * width * 0.86,
                      # Not doubled. Broken rock sits LOW - a chunk taller than it
                      # is wide reads as a shard or a crystal, which is tier six's
                      # job, not tier two's.
                      z * radius * height))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    # convex_hull leaves the points it did not use behind; they are inside the
    # solid and invisible, but they upset the bevel and the bounds.
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(mesh)
    bm.free()

    ob = bpy.data.objects.new("rock", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    low = min(v.co.z for v in mesh.vertices)
    for v in mesh.vertices:
        v.co.z -= low
    return ob


def crystal(radius: float, height: float, tip: float, sides: int = 6, taper: float = 0.86):
    """A prism that comes to a point: the quartz/granite silhouette.

    Built by hand rather than from a cylinder primitive so the tip is a real
    apex - a cone stacked on a cylinder leaves a seam ring that the bevel then
    catches, and it reads as two objects.
    """
    mesh = bpy.data.meshes.new("crystal")
    bm = bmesh.new()
    base = [bm.verts.new((math.cos(2 * math.pi * i / sides) * radius,
                          math.sin(2 * math.pi * i / sides) * radius, 0.0))
            for i in range(sides)]
    shoulder = [bm.verts.new((math.cos(2 * math.pi * i / sides) * radius * taper,
                              math.sin(2 * math.pi * i / sides) * radius * taper, height))
                for i in range(sides)]
    apex = bm.verts.new((0.0, 0.0, height + tip))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((base[i], base[j], shoulder[j], shoulder[i]))
        bm.faces.new((shoulder[i], shoulder[j], apex))
    bm.faces.new(tuple(reversed(base)))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("crystal", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    return ob


def cut_stone(girdle, crown, pavilion):
    """A cut stone built from FACET ROWS, not a single slope.

    The first version had one crown row and one pavilion row, so a step cut, a
    marquise and a brilliant all came out as the same thing: a cone with a
    flat top. What actually distinguishes the cuts is how many times the
    surface CHANGES ANGLE between the girdle and the table - a step cut is
    literally named for its steps, and a brilliant carries two rows of facets
    above the girdle and two below.

    `crown` and `pavilion` are lists of (scale, height) rings measured from
    the girdle, outward face first. The last pavilion ring at scale 0 closes
    to a keel point.
    """
    mesh = bpy.data.meshes.new('cut')
    bm = bmesh.new()

    def make_ring(scale, z):
        # A scale may be a single number or a pair. The pair exists for the
        # marquise: scaling both axes evenly pulls its POINTS in as the crown
        # rises, so the table ends up a tiny lens that reads as a dark slot
        # rather than a ridge running the length of the stone.
        sx, sy = scale if isinstance(scale, tuple) else (scale, scale)
        return [bm.verts.new((x * sx, y * sy, z)) for x, y in girdle]

    rows = [make_ring(1.0, 0.0)]
    for scale, z in crown:
        rows.append(make_ring(scale, z))
    below = [rows[0]]
    keel = None
    for scale, z in pavilion:
        if not isinstance(scale, tuple) and scale <= 0.0:
            keel = bm.verts.new((0.0, 0.0, z))
        else:
            below.append(make_ring(scale, z))

    def band(lower, upper):
        for k in range(len(girdle)):
            m = (k + 1) % len(girdle)
            bm.faces.new((lower[k], lower[m], upper[m], upper[k]))

    for a, b in zip(rows, rows[1:]):
        band(a, b)
    for a, b in zip(below, below[1:]):
        band(b, a)
    if keel is not None:
        last = below[-1]
        for k in range(len(girdle)):
            m = (k + 1) % len(girdle)
            bm.faces.new((last[m], last[k], keel))
    bm.faces.new(tuple(rows[-1]))

    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new('cut', mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    return ob


def ring(sides: int, radius: float, squash: float = 1.0, spin: float = 0.0):
    """A closed outline: the girdle of a round brilliant."""
    return [(math.cos(spin + 2 * math.pi * i / sides) * radius,
             math.sin(spin + 2 * math.pi * i / sides) * radius * squash)
            for i in range(sides)]


def lens(length: float, width: float, per_side: int = 7):
    """A pointed oval - the marquise girdle.

    Two arcs meeting at sharp points. A squashed circle is NOT this: the
    points are the whole identity of the cut, and an ellipse has none.

    The return arc runs BACKWARDS. Walking both arcs left-to-right does not
    close a loop, it crosses one - the outline came out a bow tie, and the
    fold showed on the render as a dark slot across the crown that no amount
    of adjusting the facet rows was ever going to fix.
    """
    pts = []
    for side in (1, -1):
        steps = range(per_side) if side == 1 else range(per_side, 0, -1)
        for i in steps:
            t = -1.0 + 2.0 * i / per_side
            pts.append((t * length * 0.5, side * width * 0.5 * (1 - t * t) ** 0.72))
    return pts


def rect_ring(w: float, d: float, chamfer: float = 0.22):
    """A rectangle with its corners cut - the step-cut girdle."""
    hw, hd = w * 0.5, d * 0.5
    cw, cd = hw * chamfer, hd * chamfer
    return [(hw - cw, -hd), (hw, -hd + cd), (hw, hd - cd), (hw - cw, hd),
            (-hw + cw, hd), (-hw, hd - cd), (-hw, -hd + cd), (-hw + cw, -hd)]


def torus_knot(p: int, q: int, samples: int, sides: int, radius: float, z_amp: float):
    """A knot as a swept tube.

    `z_amp` is what keeps it a VOLUME rather than a plate. At 1.0 against a
    radius of 3 the knot lives in one plane, flattens to an oval under this
    camera, and has to be turned square to the viewer to be read at all -
    which takes it off the shared camera entirely.
    """
    pts, tans = [], []
    for i in range(samples):
        t = 2 * math.pi * i / samples
        r = math.cos(q * t) + 2.0
        pts.append(Vector((r * math.cos(p * t), r * math.sin(p * t), -math.sin(q * t) * z_amp)))
        tans.append(Vector((
            -q * math.sin(q * t) * math.cos(p * t) - p * r * math.sin(p * t),
            -q * math.sin(q * t) * math.sin(p * t) + p * r * math.cos(p * t),
            -q * math.cos(q * t) * z_amp,
        )).normalized())

    def rodrigues(v, axis, angle):
        k = axis.normalized()
        return (v * math.cos(angle) + k.cross(v) * math.sin(angle)
                + k * k.dot(v) * (1 - math.cos(angle)))

    ref = Vector((0, 0, 1))
    if abs(tans[0].dot(ref)) > 0.9:
        ref = Vector((1, 0, 0))
    start = (ref - tans[0] * ref.dot(tans[0])).normalized()
    normal, normals = start.copy(), []
    for i in range(samples):
        if i > 0:
            a, b = tans[i - 1], tans[i]
            axis = a.cross(b)
            if axis.length > 1e-9:
                normal = rodrigues(normal, axis, math.atan2(axis.length, a.dot(b)))
            normal = (normal - b * normal.dot(b)).normalized()
        normals.append(normal.copy())

    # Transporting a frame around a CLOSED curve does not return it to where
    # it started, and that leftover rotation tore a seam where the last ring
    # met the first. Unwinding it evenly closes the loop, at the cost of a
    # twist too gradual to see.
    closing = normals[-1].copy()
    axis = tans[-1].cross(tans[0])
    if axis.length > 1e-9:
        closing = rodrigues(closing, axis, math.atan2(axis.length, tans[-1].dot(tans[0])))
    closing = (closing - tans[0] * closing.dot(tans[0])).normalized()
    drift = math.atan2(closing.dot(tans[0].cross(start).normalized()), closing.dot(start))

    verts, faces = [], []
    for i, centre in enumerate(pts):
        u = rodrigues(normals[i], tans[i], -drift * i / samples)
        v = tans[i].cross(u).normalized()
        for s in range(sides):
            a = 2 * math.pi * s / sides
            verts.append(centre + u * (math.cos(a) * radius) + v * (math.sin(a) * radius))
    for i in range(samples):
        j = (i + 1) % samples
        for s in range(sides):
            t2 = (s + 1) % sides
            faces.append([i * sides + s, i * sides + t2, j * sides + t2, j * sides + s])

    mesh = bpy.data.meshes.new("knot")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.validate()
    ob = bpy.data.objects.new("knot", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.shade_auto_smooth(angle=math.radians(45))
    return ob


# ---- the wood chain --------------------------------------------------------

def build_wood():
    T = 0.085
    out = {}

    out[1] = cube(0.62, 0.30, 0.24)
    out[2] = stack([
        cube(0.68, 0.30, T),
        cube(0.64, 0.28, T, loc=(0.07, -0.07, T + STACK_GAP)),
    ])
    out[3] = stack([
        cube(0.66, 0.30, T, loc=(i * 0.03, -i * 0.03, i * (T + STACK_GAP)))
        for i in range(3)
    ])
    out[4] = merge([cube(0.86, 0.24, 0.20), cube(0.24, 0.86, 0.20)])
    out[5] = stack([lean(cube(0.24, 0.24, 0.78), 34 * sign) for sign in (1, -1)])
    out[6] = merge([
        cube(0.84, 0.26, 0.26, base=False),
        cube(0.26, 0.84, 0.26, base=False),
        cube(0.26, 0.26, 0.84, base=False),
    ])
    out[7] = stack([
        cube(0.20, 0.92, 0.17, loc=(-0.20, 0, 0)),
        cube(0.20, 0.92, 0.17, loc=(0.20, 0, 0)),
        cube(0.92, 0.20, 0.17, loc=(0, -0.20, 0.17 + STACK_GAP)),
        cube(0.92, 0.20, 0.17, loc=(0, 0.20, 0.17 + STACK_GAP)),
    ])
    out[8] = torus_knot(2, 3, 72, 10, 0.55, 2.6)
    out[9] = torus_knot(2, 5, 90, 10, 0.48, 2.6)

    for tier, ob in out.items():
        material = tier_material("wood-tier-%d" % tier, WOOD_HEX[tier], WOOD_MEASURED[tier])
        roughness, ior = WOOD_SURFACE
        _shader(material).inputs["Roughness"].default_value = roughness
        _shader(material).inputs["IOR"].default_value = ior
        grain(material, _shader(material).inputs["Base Color"].default_value[:3])
        finish(ob, "wood%d" % tier, material)

    # PAPERWEIGHT: the burr rests on three arms rather than standing one
    # straight up, by tipping its body diagonal onto vertical.
    out[6].rotation_euler = (
        Vector((1, 1, 1)).normalized().rotation_difference(Vector((0, 0, 1))).to_euler()
    )

    # THE KNOTS FACE THE CAMERA SQUARE ON, which is how the flat artwork they
    # replace read them. Corner-on, the loops overlap into a single blob
    # instead of showing as two pieces passing through each other. Everything
    # else stays corner-on - that is the diagonal an isometric game is built
    # on, and it is right for anything box-shaped.
    facing = (-camera_forward()).to_track_quat('Z', 'Y').to_euler()
    out[8].rotation_euler = facing
    out[9].rotation_euler = facing
    return out


# ---- the mineral chain -----------------------------------------------------

def build_mineral():
    """Found -> worked -> cut, which is the story the shapes have to tell.

    1-3 are chunks off the ground, 4-5 are stone someone has dressed, 6-7 are
    crystal grown out of it, 8-9 are cut gems. Nothing here is a box, because
    a box is what wood is.
    """
    out = {}

    # THE COUNT IS THE TIER NUMBER for the first three - one plate, two
    # chunks, three chips. That is how the genre encodes chain position, it is
    # why Slate sits at 1 and Gravel at 3, and the existing art is built on
    # it. My first pass gave tier three FOUR pieces and broke the convention.
    # ONE BROKEN CHUNK, the way crushed slate actually comes: roughly as deep
    # as it is wide, with sharp fractured faces. I had it as a flat plate on
    # the theory that slate splits into sheets, and that is true of a slate
    # ROOF tile - the aggregate a game means by "slate" is angular rubble.
    out[1] = rock(0.60, 0.34, seed=11, points=10, jitter=0.20)
    out[2] = stack([
        rock(0.52, 0.30, seed=21),
        translate_to(rock(0.40, 0.24, seed=22), beside(0.34, -0.10)),
    ])
    out[3] = stack([
        translate_to(rock(0.34, 0.28, seed=30 + i), beside(right, back))
        # Tight. Framing normalises each sprite to its own spread, so pushing
        # the chips apart does not make the group bigger - it makes every chip
        # smaller, and at board size they vanish.
        for i, (right, back) in enumerate(((-0.17, 0.02), (0.05, -0.11), (0.19, 0.07)))
    ])

    # 4 - POLISHED STONE: a tumbled pebble.
    #
    # HULL THEN SUBDIVIDE, which is the one combination that gives an organic
    # stone. It was a bevelled cube - six flat faces with rounded corners -
    # and no amount of bevel hides that a box is a box; it reads as low-poly
    # geometry pretending to be a rock. A tumbled pebble has NO flat faces.
    #
    # The hull supplies irregular proportions without spikes, and subdivision
    # rounds it off completely. Neither works alone: subdividing a sphere
    # gives an egg, and a bare hull is faceted, which is right for rubble and
    # wrong for something that has been worn smooth.
    out[4] = rock(0.66, 0.20, seed=41, points=11, jitter=0.16)

    # 5 - MARBLE: a tall upright block, a pedestal fragment. The existing art
    # went out of its way to make this tall so it would not be a bigger,
    # veinier version of the flat pebble below it.
    out[5] = cube(0.34, 0.30, 0.58)

    # 6 - GRANITE: a faceted SLAB of seven sides, deliberately not a tower.
    # The art notes record that it had been an obelisk and read as Glass's
    # Crystal Obelisk; seven sides is also unique across the whole set.
    out[6] = crystal(radius=0.40, height=0.20, tip=0.0, sides=7, taper=0.82)
    # TURNED HALF A FACET. A heptagon starting at angle zero puts a VERTEX on
    # the right-hand silhouette, and with the taper pulling the top face in,
    # the side facet beside that vertex collapses to a sliver - the outline
    # pinches there and reads as a modelling fault rather than a cut. Half a
    # step round (360/7/2) presents a flat to that edge instead, so the
    # silhouette meets it as a straight run.
    out[6].rotation_euler.z = math.radians(360 / 7 / 2)

    # 7-9 - THREE REAL LAPIDARY CUTS, plainest first. A step cut is the
    # simplest and the right read for the chain's first cut stone; the
    # marquise adds points; the round brilliant is the most heavily cut and
    # earns the top slot on silhouette alone.
    # STEP CUT: named for its steps, so it gets three of them up to a broad
    # table and two down to the keel. A single slope is what made it read as
    # a loaf.
    out[7] = cut_stone(
        rect_ring(0.60, 0.42),
        crown=[(0.88, 0.05), (0.76, 0.10), (0.64, 0.15)],
        pavilion=[(0.84, -0.09), (0.56, -0.19), (0.0, -0.30)],
    )
    # MARQUISE: the points are the identity of the cut, so the girdle is a
    # lens and the crown keeps its length as it rises.
    #
    # DEEP ON PURPOSE, and not a mistake to be corrected. A 63 degree pavilion
    # leaks - past the critical angle, light entering the table escapes out
    # the back instead of returning to the eye, which is the bow-tie, and it
    # is why this stone reads darker in the middle than the brilliant does.
    # Recutting it to the textbook 41 degrees fixes that and makes the stone
    # less than half as deep, which changes its silhouette completely. The
    # owner picked the silhouette. Depth is the deliberate trade.
    out[8] = cut_stone(
        lens(0.80, 0.38),
        crown=[((0.92, 0.74), 0.07), ((0.80, 0.30), 0.15)],
        pavilion=[((0.84, 0.66), -0.13), ((0.62, 0.34), -0.26), (0.0, -0.38)],
    )
    # ROUND BRILLIANT: the most heavily cut stone in the chain, and it should
    # win on facet count alone - two rows above the girdle, two below, on a
    # sixteen-sided girdle.
    out[9] = cut_stone(
        ring(16, 0.36),
        crown=[(0.86, 0.08), (0.46, 0.17)],
        pavilion=[(0.74, -0.16), (0.38, -0.33), (0.0, -0.46)],
    )

    for tier, ob in out.items():
        # Gems and crystal keep CRISP facets - a bevel on a cut stone rounds
        # off the only thing that makes it read as cut.
        # Tier five takes a deliberately HEAVY chamfer - that is the dressing.
        # Crystal and gems take none: a bevel on a cut stone rounds off the
        # only thing that says it was cut.
        # WIDE ENOUGH TO SEE. 0.016 on a piece two thirds of a unit across is
        # about a pixel at board size - present in the mesh and invisible on
        # screen, which is the same mistake the wood bevel made at 0.012.
        # What makes an edge read is a band of shading with WIDTH, so the
        # rocks get roughly what the timber gets.
        # Tier four needs no bevel of its own - subdivision has already taken
        # every edge off it.
        bevel = 0.008 if tier >= 7 else (0.0 if tier == 4 else 0.032)
        # A hull's facets are REAL faces, so there is nothing to merge and the
        # narrow angle stands. Tier four is the exception: subdivision leaves
        # it with hundreds of tiny quads that are pure tessellation, and at 30
        # degrees each would catch its own tone.
        smooth = math.radians(88) if tier == 4 else SMOOTH_ANGLE
        material = tier_material("mineral-tier-%d" % tier,
                                 MINERAL_HEX[tier], MINERAL_MEASURED[tier])
        roughness, ior = MINERAL_SURFACE[tier]
        _shader(material).inputs["Roughness"].default_value = roughness
        _shader(material).inputs["IOR"].default_value = ior
        base = _shader(material).inputs["Base Color"].default_value[:3]
        if tier == 7:
            # Quartz is STONE, not a window. Cloudy inside, waxy outside, and
            # a cloud pattern coarse enough to see through the translucency.
            mottle(material, base, scale=5.0, strength=0.13)
            milky(material, base)
            polished(material, coat_roughness=0.06)
        elif tier == 8:
            # RESET. Plain polished stone in the tier's own colour - no
            # transmission, no volume, nothing layered on.
            #
            # The transmission stack never worked on this shape and every
            # attempt to rescue it made something else worse: dropping density
            # did nothing, lifting the studio floor washed out all nine tiers,
            # and recutting the pavilion to stop the leak changed a silhouette
            # that was already right. Each fix was aimed at a symptom of a cut
            # that leaks by design, so the honest move is to stop stacking on
            # a broken base and build again from a surface that reads.
            polished(material, coat_roughness=0.04)
        elif tier == 9:
            gemstone(material, ior=ior, roughness=roughness, tint_strength=0.0)
            # Density is per unit of PATH, and this is a deep cut.
            absorbing(material, MINERAL_HEX_RGB[tier], density=6.0)
        elif tier == 6:
            speckle(material, base)          # granite's real signature
            polished(material)
        elif tier == 5:
            veins(material, base)            # marble
            polished(material)
        else:
            # Colour variation FIRST - that is the part you can see - with the
            # roughness break on top of it. The rough tiers get a coarser,
            # stronger mottle than the polished pebble.
            # Broken stone is BLOTCHY, strongly. The reference is chalky pale
            # patches over a much darker grey, not a gentle wash - at 0.20 the
            # variation was there and read as shading rather than as surface.
            mottle(material, base,
                   scale=9.0 if tier < 4 else 6.0,
                   strength=0.38 if tier < 4 else 0.11)
            weathered(material, strength=0.34 if tier < 4 else 0.12)
            if tier == 4:
                polished(material)
        finish(ob, "mineral%d" % tier, material, bevel=bevel, smooth_angle=smooth,
               subdivide=2 if tier == 4 else 0)
    return out



def extrude_profile(points, thickness: float):
    """A flat 2D outline given depth: the x-z plane, extruded along y.

    Used for anything whose identity is a SILHOUETTE rather than a volume -
    the energy bolt is a zigzag before it is an object, and building it as a
    solid from scratch would lose the shape that makes it readable.
    """
    mesh = bpy.data.meshes.new("profile")
    bm = bmesh.new()
    half = thickness * 0.5
    front = [bm.verts.new((x, -half, z)) for x, z in points]
    back = [bm.verts.new((x, half, z)) for x, z in points]
    for i in range(len(points)):
        j = (i + 1) % len(points)
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bm.faces.new(tuple(front[::-1]))
    bm.faces.new(tuple(back))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("profile", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    return ob


def disc(radius: float, thickness: float, sides: int = 24):
    """A coin, lying flat."""
    mesh = bpy.data.meshes.new("coin")
    bm = bmesh.new()
    lower, upper = [], []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        x, y = math.cos(a) * radius, math.sin(a) * radius
        lower.append(bm.verts.new((x, y, 0.0)))
        upper.append(bm.verts.new((x, y, thickness)))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
    bm.faces.new(tuple(upper))
    bm.faces.new(tuple(reversed(lower)))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("coin", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    return ob


# The bolt, as a closed outline. A lightning glyph is a zigzag with one long
# diagonal on each half; fewer points than this and it stops reading as one.
#
# Sized against the COIN, not against the frame. A unit that spans a whole
# unit of height next to a coin 0.34 across is three times the mark, and at
# tiers four and five the cluster closed into a thicket. The drawn art called
# for energy running SLIGHTLY larger than the round marks, because a zigzag
# carries less ink at equal width - slightly, not triple.
# Traced off public/currency-energy.svg. The structure was already right -
# six points, two limbs, a step between them - but the limbs were far too
# thin: 0.15 of horizontal run against 0.62 of height made each one a spike,
# so a bolt read as two loose triangles rather than as one chunky mark. The
# drawn bolt is nearly as wide as it is tall.
# TRACED VERTEX BY VERTEX off the drawn bolt, not approximated from the idea
# of one. Six points: a tip top right, a long edge down to the left extreme,
# a step in, the second tip straight down, then back out to the right extreme
# and a step in to close. What was here before had both limbs at the same
# height and the tips nearly vertical, which is a zigzag, not a bolt - the
# drawn one leans, with its right extreme ABOVE centre and its left extreme
# below.
#
# The x values are negated because this camera's screen-right is -X: a
# profile written the way it looks on paper renders mirrored.
BOLT = [(-0.177, 0.359), (0.211, -0.043), (0.034, -0.055),
        (0.034, -0.361), (-0.273, 0.077), (-0.095, 0.064)]

# Traced off public/currency-gem.svg, which is NOT a brilliant cut. The drawn
# gem is a flat rhombus slab with a thick bevelled edge - a shape read by its
# silhouette, like the bolt - and it was being modelled as a round eight-sided
# stone with a crown and a pavilion. Different object entirely. The waist sits
# just above centre, which is what keeps it a gem rather than a lozenge.
GEM = [(0.00, 0.36), (0.27, 0.04), (0.00, -0.36), (-0.27, 0.04)]


# ---- the currency chains ---------------------------------------------------

# Loose CLUSTERS, in screen terms, never columns or rows. Aligned layouts make
# a stack of coins read as a bar chart, and these are things that pile up - so
# no three of them line up. Taken from the drawn art, which had already solved
# this, and expressed as (right, back) because world axes are a poor guide to
# what separates on screen.
CURRENCY_CLUSTERS = [
    [(0.00, 0.00)],
    [(-0.20, 0.06), (0.16, -0.08)],
    [(-0.22, 0.04), (0.20, -0.02), (0.00, -0.22)],
    [(-0.24, 0.08), (0.18, 0.10), (-0.04, -0.10), (0.22, -0.20)],
    [(-0.26, 0.10), (0.06, 0.18), (-0.14, -0.08), (0.26, 0.00), (0.04, -0.22)],
    [(-0.28, 0.12), (0.02, 0.20), (0.26, 0.08), (-0.18, -0.04),
     (0.14, -0.14), (-0.04, -0.26)],
]


def facing_camera(ob):
    """Turns a piece square to the viewer.

    Used sparingly, and only where a thing's identity IS a flat face. A coin
    is a disc: seen from the board's camera lying down it is an ellipse, and
    stood on edge it is a line. There is no orientation that makes a coin
    three-dimensional, because a coin is not - unlike the knots, which were
    turned to face the viewer to hide the fact that they were modelled as
    plates, and which got fixed by giving them real depth instead.
    """
    forward = Euler((math.pi / 2 - ELEVATION, 0.0, AZIMUTH)).to_quaternion() @ Vector((0, 0, -1))
    ob.rotation_euler = (-forward).to_track_quat('Z', 'Y').to_euler()
    return ob


def facing_profile(ob):
    """Turns an EXTRUDED OUTLINE to the viewer, then off square.

    `facing_camera` aims local +Z at the camera, which is right for a knot
    and wrong for anything `extrude_profile` made: those carry their outline
    in x-z with the depth along y, so aiming +Z stands the slab edge on.

    Lying these flat like the coins does not work either. A coin is round, so
    it survives being seen from above; a bolt seen from above collapses into
    a bowtie. Its silhouette IS the object, which is the wood knots' rule.

    Dead on, though, an extruded outline is only its own silhouette and the
    depth hides behind the face - a flat sticker, which is what the 3D was
    meant to replace. So it is turned off square, far enough to show the
    thickness down one side, exactly as the drawn mark does.
    """
    view = Euler((math.pi / 2 - ELEVATION, 0.0, AZIMUTH)).to_quaternion()
    forward = view @ Vector((0, 0, -1))
    ob.rotation_euler = (-forward).to_track_quat('Y', 'Z').to_euler()
    # -30 about the screen vertical, and NOTHING else. The same turn the
    # coins and the event token take, so every face-on piece in the game is
    # presented at one angle instead of each having its own. The 9 degree
    # drop that used to go with it is gone for the same reason: the coins do
    # not have one, and it only tipped these out of line with them.
    swing = Matrix.Rotation(math.radians(MARK_SWING), 4, view @ Vector((0, 1, 0)))
    tilt = Matrix.Rotation(math.radians(MARK_TILT), 4, view @ Vector((1, 0, 0)))
    ob.rotation_euler = (
        tilt @ swing @ ob.rotation_euler.to_matrix().to_4x4()
    ).to_euler()
    return ob


# WHICH WAY IS FRONT.
#
# The camera sits at -X / +Y and looks toward +X / -Y, so the faces you can
# see on an axis-aligned box are the -X one and the +Y one. Every applied
# detail - a vault door, a roll's end cap, a strap's seal - has to go on one
# of those. I put all of them on -Y first, which is the face pointing directly
# away, and they rendered as a plain gold box, a plain cylinder and a jumble.
FRONT_Y = 1.0


def coin(radius: float = 0.17, thickness: float = 0.042, slot: bool = True,
         sides: int = 24):
    """A coin: raised inner field, with the credit SLOT struck INTO it.

    Two things, both from the art. The drawn tiers stroke a circle at 0.72 of
    the radius on every coin, which is the raised field that separates a coin
    from a disc. And the game's own credit mark is a bar RECESSED across that
    field - a slot, not a ridge.

    The body and the field are unioned before the slot is cut. Carving a
    difference out of two disjoint shells that merely sit on each other does
    not behave: the first attempt came back with the bar standing proud of
    the face, which is the exact opposite of the mark it was copying.
    """
    # THE RIM STANDS PROUD AND THE FACE SITS INSIDE IT. I had it inverted -
    # a raised inner field with the rim below - which is a button, not a coin.
    # A struck coin's edge is the highest part of it; that raised ring is what
    # protects the face and what you see catching the light all the way round.
    rim_height = thickness * 0.34
    blank = disc(radius, thickness + rim_height, sides)
    well = disc(radius * 0.80, rim_height * 3, sides)
    translate_to(well, (0.0, 0.0, thickness))
    body = carve(blank, well)

    if slot:
        # Struck DEEP into the recessed face, which sits at `thickness`.
        #
        # Measured from the face down rather than centred on it: a box
        # straddling the surface only sinks half its height, so at 0.36 of the
        # coin's thickness the cut was barely 18% deep and read as a scratch.
        # Building it base-up from `thickness - depth` means the number is the
        # depth.
        depth = thickness * 0.62
        bar = cube(radius * 0.82, radius * 0.18, depth + thickness)
        translate_to(bar, (0.0, 0.0, thickness - depth))
        body = carve(body, bar)
    return body


def upright_coin(radius: float = 0.17, thickness: float = 0.042,
                 lean_deg: float = 0.0):
    """A coin standing ON ITS EDGE, turned to the isometric three-quarter.

    Lying on its back a coin shows its face as a flat ellipse and hides the
    rim entirely, so the struck detail - the raised ring, the slot - is read
    end-on and the piece looks like a token. Stood up and turned part way, the
    face and the thickness are both visible at once, which is what the game's
    own coin mark does and what every other item in the set does: presented at
    an angle, not square to anything.
    """
    piece = coin(radius, thickness)

    # SPIN THE SLOT FIRST, in the coin's own frame, and bake it in. The mark
    # runs diagonally across the face; doing this after the coin is stood up
    # would need a rotation about whatever the face normal had become, which
    # is a different axis every time the presentation is adjusted.
    piece.rotation_euler.z = math.radians(-32)
    bpy.ops.object.select_all(action='DESELECT')
    piece.select_set(True)
    bpy.context.view_layer.objects.active = piece
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    piece.rotation_euler.rotate_axis("X", math.radians(-90))
    # Not 45 - that is dead face-on to this camera. 23 off it keeps the face
    # readable while leaving the rim's thickness in view.
    piece.rotation_euler.rotate_axis("Z", math.radians(23))

    # An optional lean, about the SCREEN horizontal, so the coin tips back
    # rather than sideways. Applied in world space after the local turns -
    # rotate_axis only takes the three named axes, and screen-right is not
    # one of them.
    if lean_deg:
        piece.rotation_euler = (
            Matrix.Rotation(math.radians(lean_deg), 4, SCREEN_RIGHT)
            @ piece.rotation_euler.to_matrix().to_4x4()
        ).to_euler()
    return piece


# A coin is taller than its own thickness: the rim stands proud by another
# third on top. Stacking on `thickness` alone drives each coin a third of the
# way into the one below it.
COIN_RIM = 0.34


def coin_column(count: int, radius: float = 0.17, thickness: float = 0.042,
                gap: float = 0.004):
    """A stack of real coins, slot on the top one only.

    Tiers three and five were stacks of plain DISCS while tiers one and two
    were struck coins - the same currency, two different objects, and the
    stacks read as poker chips. Only the top face of a stack is visible, so
    only that coin needs the slot cut; carving one into each of seven buried
    coins is boolean work nobody will ever see.
    """
    step = thickness * (1 + COIN_RIM) + gap
    return [translate_to(coin(radius, thickness, slot=(i == count - 1)),
                         (0.0, 0.0, i * step))
            for i in range(count)]


def build_credits():
    """The credit chain is an OBJECT LADDER, not a growing pile.

    Read off the drawn art, which spells it out: one coin, two coins, a stack,
    a wrapped roll, a bound bundle, a strongbox. Six different things, each
    plainly more money than the last - a far better merge than six piles
    differing only in how many discs are in them, which is what I had reduced
    it to by assuming credits followed the cluster rule. Only gems and energy
    do.

    The DETAILS come from the same source and are the point of it: face rings,
    the coin edges in a stack, the wrapper's seam and band, the bundle's strap
    and seal, the vault's spokes and dial. Several of them cost nothing here
    that they cost in 2D - a stack built from real discs has edge lines
    because it has edges.
    """
    out = {}
    coin_r, coin_t = 0.17, 0.042

    # 1-2: loose coins ON THEIR BACKS. Standing a coin up to show its face
    # is a 2D problem; from this camera a coin lying flat already shows the
    # whole face and its thickness at once, which is why tier three's top
    # coin reads correctly and every upright version of these did not.
    out[1] = coin(coin_r, coin_t)

    # The second coin is HALF ON the first, so it cannot lie flat - it has
    # one edge up on the other's rim and one still on the ground. The tilt
    # is not chosen, it is the angle that geometry forces: the rise is one
    # coin's full height over one coin's diameter.
    height = coin_t * (1 + COIN_RIM)
    along = Vector(beside(1.0, 0.0)).normalized()
    tilt = math.degrees(math.atan2(height, 2 * coin_r))
    upper = coin(coin_r, coin_t)
    upper.rotation_euler = Matrix.Rotation(
        math.radians(tilt), 4, Vector((0.0, 0.0, 1.0)).cross(along)
    ).to_euler()
    translate_to(upper, tuple(along * (coin_r * 1.25)
                              + Vector((0.0, 0.0, height / 2))))
    out[2] = stack([coin(coin_r, coin_t), upper])

    # 3: a STACK of real discs. The drawn version had to hand-draw a rim line
    # and a highlight arc per layer; stacked solids have those edges already.
    # The top coin keeps its face device, since that face is visible.
    out[3] = stack(coin_column(5, coin_r, coin_t))

    # 4: a BUNDLE OF BILLS with a currency strap round it.
    #
    # Paper, not metal - which is what makes it a step up from the coin
    # stack below rather than a taller version of it. Built as separate
    # leaves so the edges read: a solid block with lines on it would be
    # faking in 3D exactly what 2D had to fake.
    bill_w, bill_d, leaf = 0.52, 0.27, 0.016
    leaves = 11
    bundle_h = leaves * leaf
    bills = [translate_to(cube(bill_w, bill_d, leaf), (0.0, 0.0, i * leaf))
             for i in range(leaves)]

    # The strap goes round the SHORT way, over the top and under the bottom,
    # so it is a rectangular ring in the y-z plane - a band lying flat across
    # the top would be a ribbon, not a strap. Left blank: no denomination.
    outer = cube(0.10, bill_d + 0.036, bundle_h + 0.036, base=False)
    translate_to(outer, (0.0, 0.0, bundle_h / 2))
    inner = cube(0.26, bill_d + 0.002, bundle_h + 0.002, base=False)
    translate_to(inner, (0.0, 0.0, bundle_h / 2))
    strap = carve(outer, inner)

    # TIPPED ONTO ITS LONG NARROW SIDE, so the bundle stands on the thin edge
    # and you look at the cut edges of the notes rather than down at the top
    # one. Lying flat it read as a single slab with a band on it; on edge the
    # leaves are the silhouette.
    bundle = stack(bills + [strap])
    bundle.rotation_euler.rotate_axis("X", math.radians(90))
    bpy.ops.object.select_all(action='DESELECT')
    bundle.select_set(True)
    bpy.context.view_layer.objects.active = bundle
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    # Tipping it put half the bundle under the floor - reseat it on z=0.
    low = min((bundle.matrix_world @ v.co).z for v in bundle.data.vertices)
    translate_to(bundle, (0.0, 0.0, -low))

    # A coin RESTING AGAINST the bundle's left end, not floating beside it.
    #
    # upright_coin turns about its own origin, so half the disc hangs below
    # z=0 - it has to be lifted by its radius to stand on the floor at all.
    # And `back` moves a piece down-screen as well as toward the viewer, so a
    # large value drops it clear of the thing it is meant to lean on.
    # SHORTER than the bundle and tipped against it. At full size it stood
    # taller than the money it was leaning on, which reads as two objects
    # meeting rather than one propped on the other; and dead upright it was
    # standing beside the bundle, not resting on it.
    # Shorter than the bundle and tipped. The lean is about the SCREEN
    # horizontal, so it tips the coin toward the viewer rather than sideways -
    # subtle by design, and reversing it only made the coin lie back the other
    # way, which was worse.
    leaning = upright_coin(radius=0.115, thickness=0.032, lean_deg=-20)
    # Pushed AWAY from the camera until it bites into the bundle.
    #
    # A negative `back` pulls a piece toward the viewer, which is what kept
    # opening a gap: the coin was in front of the money in depth, so no amount
    # of moving it left or right could make the two meet. Overshooting into a
    # slight clip is the right error to make - an overlap reads as contact,
    # while a gap reads as two separate objects.
    translate_to(leaning, tuple(
        Vector(beside(-0.155, 0.12)) + Vector((0.0, 0.0, 0.108))))
    out[4] = stack([bundle, leaning])

    # 5: a BUNDLE - three stacks of real coins bound by a strap with a seal.
    # Built from discs rather than smooth columns so the coin edges read, the
    # way the drawn version's three ruled lines per stack did.
    # Three columns, spread far enough apart that the strap reads as binding
    # three things rather than sitting on one mass. They were close enough to
    # merge into a single heap.
    pieces = []
    for index, right in enumerate((-0.27, 0.0, 0.27)):
        for piece in coin_column(7 + index % 2, coin_r * 0.72, coin_t):
            pieces.append(translate_to(piece,
                          tuple(Vector(beside(right)) + Vector(piece.location))))
    # THE BAR LEANS AGAINST THE COLUMNS, in front of them. It was a slab at
    # the same height as the stacks, so it ran straight through the middle of
    # them - a bar clipping through coins, which is the one thing a solid
    # object must never do.
    # Leaning ON the columns, not lying on the floor in front of them. At
    # -0.34 it sat clear of the stacks entirely and hung off the bottom of the
    # frame; it needs to touch what it leans against.
    bar = cube(0.44, 0.19, 0.095)
    bar.rotation_euler.rotate_axis("X", math.radians(-34))
    translate_to(bar, tuple(Vector(beside(0.0, -0.19)) + Vector((0.0, 0.0, 0.02))))
    out[5] = stack(pieces + [bar])

    # 6: the VAULT - a strongbox, corner-on like every other box in the game,
    # because here the object IS a volume. Door, spokes and dial, all of which
    # the drawn version draws and none of which a bare box has.
    body = cube(0.52, 0.40, 0.44)

    # THE TRIM. The drawn version strokes a bright border round the whole
    # strongbox, and without it the safe is a plain gold box - which is most
    # of why it was hard to tell what it is. Four raised rails frame the
    # visible face, the way a real strongbox's edge banding does.
    trim = []
    for horizontal, offset in ((True, 0.20), (True, -0.20),
                               (False, 0.24), (False, -0.24)):
        rail = (cube(0.54, 0.045, 0.045, base=False) if horizontal
                else cube(0.045, 0.045, 0.44, base=False))
        z = 0.22 + (offset if horizontal else 0.0)
        x = 0.0 if horizontal else offset
        trim.append(translate_to(rail, (x, FRONT_Y * 0.205, z)))

    door = disc(0.145, 0.05)
    door.rotation_euler.x = math.radians(-90)
    translate_to(door, (0.0, FRONT_Y * 0.20, 0.24))
    # The spokes cross on the door: one flat, one upright, both proud of it.
    spokes = []
    for upright in (False, True):
        spoke = cube(0.03 if upright else 0.20, 0.03, 0.20 if upright else 0.03,
                     base=False)
        spokes.append(translate_to(spoke, (0.0, FRONT_Y * 0.245, 0.24)))
    dial = disc(0.040, 0.03)
    dial.rotation_euler.x = math.radians(-90)
    translate_to(dial, (-0.15, FRONT_Y * 0.21, 0.10))
    # Turned a quarter so the door is on the RIGHT-hand visible face.
    # Everything is built on the +Y face, which this camera shows on the
    # left; +Y becomes -X under a +90 turn about Z.
    safe = stack([body, door, dial] + spokes + trim)
    safe.rotation_euler.z = math.radians(90)
    out[6] = safe

    # THE LADDER, tuned as one. Now that the whole family shares a render
    # scale the modelled sizes are what the player compares, and they were
    # never meant to be compared - each tier had been sized to look right on
    # its own in a full frame, so a single coin came out a third of the
    # canvas while a stack of five filled nine tenths of it.
    #
    # These factors put the six on an even climb, applied as object scale so
    # each tier's own proportions are untouched. Even is the point: the rise
    # has to be visible at a glance but never leave the low tiers looking
    # like specks on their tiles.
    #
    # Tiers one and two are deliberately OFF that climb, by request: the
    # single coin a touch bigger, at about 60 percent of frame, and the pair
    # a lot bigger at about 74. That puts the pair past tier three and level
    # with tier four, so the low end of this chain no longer reads as a size
    # ladder. Recorded here so it is not "corrected" back by someone reading
    # the numbers rather than the intent.
    for tier, factor in ((1, 1.61), (2, 1.19), (3, 1.48), (4, 1.17),
                         (5, 0.92), (6, 1.16)):
        out[tier].scale = (factor, factor, factor)
    return out


def build_currency(kind: str):
    """Energy and gems, where the COUNT is the tier.

    Two rules come from the drawn art and are not mine to change. The number
    of units IS the tier number, and every unit is the SAME SIZE at every
    tier: shrinking them to fit more in made a tier-five pile read as smaller
    and cheaper than a tier-two one, which is the opposite of what a merge
    should say. A cluster is allowed to crowd and overlap instead.

    Credits are NOT this - see build_credits.
    """
    out = {}
    tiers = len(CURRENCY_HEX[kind])
    for tier in range(1, tiers + 1):
        pieces = []
        for index, (right, back) in enumerate(CURRENCY_CLUSTERS[tier - 1]):
            if kind == "currency-energy":
                piece = extrude_profile(BOLT, 0.10)
            else:
                piece = extrude_profile(GEM, 0.20)
            if kind == "currency-energy":
                # 74.79 degrees about the VERTICAL - a door turn, and the
                # only rotation the bolt gets. Taken off the pose the owner
                # set in tools/blender/bolt.blend rather than guessed: every
                # attempt at facing it to the camera, tipping it back or
                # laying it flat was wrong, and the answer was simply a much
                # bigger turn than any of them.
                piece.rotation_euler.rotate_axis("Z", math.radians(74.79))
            elif kind == "currency-gem":
                # THE CHIP MARK'S POSE. `facing_profile` leaves the slab
                # square to the view, where the lamp's mirror misses the
                # camera entirely and the face renders as flat dark purple.
                # The mark's swing and tilt are what put the highlight back
                # into shot, and they are the difference the board gems were
                # missing - not the material, which already matched.
                chip_facing(piece, 'Y')
            else:
                facing_profile(piece)
            pieces.append(translate_to(piece, beside(right, back)))
        out[tier] = stack(pieces)
    return out


def dress_currency(kind: str, out):
    """The material, shared by all three chains."""
    for tier, ob in out.items():
        measured = CURRENCY_MEASURED.get(kind, CURRENCY_HEX[kind])
        material = tier_material("%s-tier-%d" % (kind, tier),
                                 CURRENCY_HEX[kind][tier], measured[tier],
                                 # The gems need the chip mark's headroom.
                                 # A dielectric slab under this studio comes
                                 # back far darker than a coin does, and 1.45
                                 # clips the correction long before it
                                 # reaches the drawn purple.
                                 max_gain=3.0 if kind == "currency-gem" else 1.45)
        shader = _shader(material)
        if kind == "currency-credit":
            # A coin is the one genuinely METALLIC thing in the game. Every
            # other family is a dielectric, and the difference is not a
            # brighter highlight - a metal has no diffuse colour at all, it
            # tints its own reflection, which is why gold looks like gold from
            # any angle and a yellow plastic does not.
            # Near enough fully metallic. Backing this off to 0.7 to rescue
            # the value was the wrong lever - the diffuse it let through is
            # flat, unlit-looking colour, so the coins read as light painted
            # plastic. The value belongs in CURRENCY_MEASURED instead, where
            # it lifts the reflection rather than diluting it. Held just shy
            # of 1.0 so a face pointed away from every light is not pure
            # black.
            shader.inputs["Metallic"].default_value = 0.94
            # Polish, not tint: reflection is the only lever on a metal that
            # does not cost hue.
            shader.inputs["Roughness"].default_value = 0.13
        elif kind == "currency-energy":
            # A spark makes its own light. Nothing else here does, and it is
            # the whole read - an unlit blue zigzag is a blue zigzag.
            # Emission at the tier's OWN colour and well under 1. Scaling the
            # colour up and then driving it at 1.6 clipped every channel to
            # white, so the sparks came out pale grey - a glow that erases the
            # thing glowing. The base still carries the blue; the emission
            # only lifts it off the board.
            shader.inputs["Emission Color"].default_value =                 shader.inputs["Base Color"].default_value
            # OFF. Emission at the base colour adds that colour to every
            # lit and unlit part alike, which raises the darks, compresses
            # the range and desaturates the whole thing towards white - so
            # the self-lit look was costing exactly the depth and the blue
            # that make the drawn bolt read. The drawn one is not emissive
            # either: it is a saturated blue with hard bright edges, which
            # is lighting, not glow.
            shader.inputs["Emission Strength"].default_value = 0.0
            shader.inputs["Roughness"].default_value = 0.18
            # A LIGHT coat, not the stones' full one. `polished` sets Coat
            # Weight to 1.0, which is right for a sealed countertop and far
            # too much here: a full coat reflects the bright studio across
            # the whole face, and it was that - not the base colour - doing
            # the washing out. Driving the base darker barely moved the
            # render (0x8db7cf to 0x8ab5d3) because the coat was most of
            # what you were looking at.
            shader.inputs["Coat Weight"].default_value = 0.22
            shader.inputs["Coat Roughness"].default_value = 0.05
            shader.inputs["Coat IOR"].default_value = 1.5
        else:
            # AN OPAQUE STONE, not glass. public/currency-gem.svg is a solid
            # light-purple slab with a dark purple extruded edge and one soft
            # highlight - flat, bright, high-value. It was being built as a
            # transmissive gem instead, so its colour only existed as light
            # passing THROUGH it, and what it had to transmit was a dark
            # studio. That is why it averaged near grey at 0x5c5a6d and why
            # every absorption density barely moved it: no tuning of an
            # absorbing material reaches the drawing, because the drawing is
            # not made of that.
            #
            # The bolt was always opaque, which is why it only ever needed
            # its angle corrected.
            # POLISHED, not satin. 0.34 was the bolt's kind of surface and
            # it cost the stone the one thing transmission had been doing
            # well: a cut gem is glossy, and losing the sharp highlight for
            # a broad soft one made it read as painted. A dielectric only
            # reflects about 5 percent face on, so the gloss has to come
            # from a full clear COAT over the colour rather than from base
            # roughness, the same way the polished stones get theirs.
            # HALF GLASS. Full transmission gave the glassy refraction and
            # the hard bright edges, and cost the value: the stone's colour
            # then only exists as light that made it through, and what it
            # has to transmit is a dark studio, so it averaged 0x5c5a6d -
            # near grey. Fully opaque fixed the value and lost every one of
            # those reflections, and no amount of roughness or coat brought
            # them back (0.14, 0.07 and 0.02 all rendered byte-identical,
            # because a flat face under a big soft lamp has no sharp
            # specular to give).
            #
            # At 0.5 both halves are doing their job: the diffuse purple
            # carries the brightness, and the half that refracts carries the
            # glass. The colour stays on the SURFACE rather than going into
            # a volume, so it survives the half that does not transmit.
            shader.inputs["Transmission Weight"].default_value = 0.5
            shader.inputs["Roughness"].default_value = 0.04
            shader.inputs["IOR"].default_value = 1.75
            # The CHIP MARK's coat, not a sharper one. A 0.01 coat mirrors
            # the lamp as a hard bright disc and leaves the rest of the face
            # dark; blurring it to 0.25 is what made the mark read as a lit
            # solid, and the board gems have to be the same stone.
            polished(material, coat_roughness=0.25)
        # A REAL CHAMFER on the credit pieces. The drawn coin has a stroked
        # outline inside its edge, and on a solid that is a chamfered rim -
        # at 0.010 on a 0.042-thick coin it was a hairline and the edge read
        # as a cut cylinder.
        finish(ob, "%s%d" % (kind, tier), material,
               bevel=0.004 if kind == "currency-gem" else 0.018)
    return out


def currency_family(kind: str):
    """Geometry then material, for whichever currency chain."""
    built = build_credits() if kind == "currency-credit" else build_currency(kind)
    return dress_currency(kind, built)


# ---- the event token -------------------------------------------------------

EVENT_TOKEN_HEX = 0x2fb59a

# MEASURED off a render, the way every other family is. The token had no
# correction at all, so it rendered at whatever the studio gave it - 0x15473d
# against a swatch of 0x2fb59a, less than a third of its value.
EVENT_TOKEN_MEASURED = 0x15473d


def build_event_token():
    """The event token: a struck medallion with a crown on its face.

    Read off `drawEventToken` in EventTokenView.ts, which is the authority:
    one round thing on a board of cut solids, a raised rim, a polished face,
    and a device of SEVEN tapered rays over a half ring. No number and no
    letter - a struck shape needs no translating.

    Lying flat, like the credit coins. A coin is the one shape this camera
    shows whole from above, face and thickness at once.
    """
    radius, thickness = 0.17, 0.042
    # THE DEVICE SITS LOW ON THE FACE. The arch is centred on the origin but
    # the rays only rise from it, so the crown's mass lands well above centre
    # unless the whole thing is dropped. Baked into the placements because
    # `translate_to` bakes its offset into the mesh and leaves the object's
    # location at zero - shifting `part.location` afterwards does nothing,
    # which is why an earlier attempt at measuring the extent and correcting
    # it had no effect at all.
    # Face up to the camera, so the crown's up is simply +Y and screen-down
    # is -Y. Lying flat at the board's isometric angle was tried and does not
    # work here: at 26.5 degrees of elevation a device standing 0.03 proud on
    # a 0.17 disc foreshortens into nothing, and the device is the object.
    CROWN_UP = math.radians(90)
    CROWN_DROP_X, CROWN_DROP_Y = 0.0, -0.030
    # 128 sides. The credit coins are seen from above where the outline is
    # an ellipse and 24 is plenty; this one is FACE ON, so BOTH its circles
    # are full ones - the outer silhouette and the rim's inner lip - and a
    # polished metal returns a separate highlight off every facet. 64 still
    # showed the polygon on the inner lip, where the chamfer is a hairline
    # and there is nothing to break the reflection up.
    body = coin(radius, thickness, slot=False, sides=128)

    # THE RIM'S CHAMFER IS THE DISC'S ALONE, applied before anything is
    # joined. The shared two-segment bevel is one flat facet, and
    # auto-smoothing that into a 64-sided wall leaves the normals stepping
    # unevenly round the edge - that is the waviness on the outer ring, not
    # the silhouette, which measures round to within the bevel's own width.
    # Six segments make it an actual curve carrying one clean highlight the
    # whole way round.
    #
    # Doing it to the assembled token instead would put the same 0.004 on
    # the crown, whose rays are only 0.014 thick, and soften a struck device
    # into an etched one.
    rim = body.modifiers.new("RimChamfer", 'BEVEL')
    # 16 SEGMENTS, not 6. Six over a 90 degree corner steps 12.9 degrees at
    # a time, and a low-roughness metal returns a distinct highlight off each
    # of those steps - which is the banding round the rim. At 16 the step is
    # 5.3 degrees, well inside the auto-smooth angle, so the chamfer shades
    # as one continuous curve and the sheen can stay.
    rim.width, rim.segments = 0.004, 16
    rim.limit_method, rim.angle_limit = 'ANGLE', SMOOTH_ANGLE
    rim.use_clamp_overlap = True
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier="RimChamfer")
    face = thickness          # the recessed face `coin` leaves inside the rim

    # THE ARCH: a half ring standing proud of the face. Built as an annulus
    # with its lower half carved off rather than as a drawn stroke, because
    # here it is a raised band and has to catch the light like one.
    # A SMALLER ARCH than the rays. At 0.090 outer against rays reaching
    # 0.134 the band covered most of each ray's length, so the fan read as a
    # row of short teeth above a bridge. Drawn, the arch is a little over
    # half the crown's radius and the spikes overhang it by a long way -
    # that overhang IS the fan.
    band = carve(
        translate_to(disc(0.068, 0.030, 64), (CROWN_DROP_X, CROWN_DROP_Y, face)),
        translate_to(disc(0.042, 0.070, 64), (CROWN_DROP_X, CROWN_DROP_Y, face - 0.02)))
    # UP ON A FLAT FACE IS 315 DEGREES, not +Y. The token lies down, so the
    # crown's up has to be the world direction that projects to screen up -
    # measured, not assumed: +X and -Y both come back at screen y +0.316, and
    # the direction between them at +0.447. Built round +Y the crown came out
    # lying on its side.
    up = CROWN_UP
    cutter = cube(0.44, 0.22, 0.14, base=False)
    cutter.rotation_euler.rotate_axis("Z", up - math.radians(270))
    band = carve(band, translate_to(cutter, (
        -math.cos(up) * 0.11 + CROWN_DROP_X,
        -math.sin(up) * 0.11 + CROWN_DROP_Y, face + 0.010)))

    # SEVEN RAYS over the top half, tapering outwards from the band. Seven
    # over a band reads as one particular object at cell size, where the
    # six-point burst it replaced read as a generic sparkle.
    rays = []
    for i in range(7):
        angle = up - math.radians(85) + math.radians(170) * i / 6
        # The middle spear is the longest and they shorten towards the ends,
        # the way the drawn crown does. Evenly long rays read as a comb.
        reach = 0.100 - 0.022 * abs(i - 3) / 3.0
        # LONG FLAT SPEARS. Two faults at once before this: at 0.026 thick
        # against 0.022 wide they were square in section, so any ray turned
        # edge-on read as a rectangular block rather than a ray; and at 0.074
        # they were short enough to hide behind the arch. Drawn, they are
        # thin plates reaching well past it - that overhang is the whole
        # shape.
        ray = extrude_profile([(-0.017, 0.0), (0.017, 0.0), (0.0, reach)], 0.014)
        # `extrude_profile` builds in x-z and extrudes along y, so a quarter
        # turn about X lays the triangle flat with its thickness in z and its
        # tip pointing +Y. The spin about Z then aims it outwards.
        ray.rotation_euler.rotate_axis("X", math.radians(-90))
        # PRE-MULTIPLIED, not `rotate_axis`. Euler.rotate_axis turns about the
        # euler's OWN axis, not the world's - after the quarter turn about X
        # a "Z" spin of -85 degrees landed in the Y slot and tipped the ray
        # out of the face instead of aiming it outwards. Every version of
        # this crown fanned wrongly for that one reason: measured, ray zero
        # wanted 5 degrees and its tip came out at 62.
        ray.rotation_euler = (
            Matrix.Rotation(angle - math.pi / 2, 4, Vector((0.0, 0.0, 1.0)))
            @ ray.rotation_euler.to_matrix().to_4x4()
        ).to_euler()
        # Based just OUTSIDE the band, and sized so the tips stay INSIDE
        # the recessed face. `coin` wells out to 0.8 of the radius - 0.136 -
        # and rays reaching 0.158 were punching into the rim wall, which is
        # what turned the device into a ring of clipped fragments.
        # Rooted OUT AT THE ARCH, not near the middle - at 0.030 all seven
        # converged on the centre and piled into one lump instead of
        # radiating. Based at 0.050 they fan out properly, and sitting below
        # the band's own height the arch hides their roots, which is how the
        # drawn crown is built. Tips reach 0.134, just inside the recessed
        # face's 0.136.
        translate_to(ray, (math.cos(angle) * 0.036 + CROWN_DROP_X,
                           math.sin(angle) * 0.036 + CROWN_DROP_Y,
                           face + 0.004))
        rays.append(ray)

    token = stack([body, band] + rays)

    # FACE TO THE CAMERA, then SWUNG. Dead square on, a medallion reads as
    # a UI icon pasted onto the board; a horizontal turn about the screen's
    # vertical puts it in the board's space and shows the disc's thickness
    # down one edge, without foreshortening the crown the way lying flat
    # does.
    facing_camera(token)
    view = Euler((math.pi / 2 - ELEVATION, 0.0, AZIMUTH)).to_quaternion()
    token.rotation_euler = (
        Matrix.Rotation(math.radians(MARK_TILT), 4, view @ Vector((1, 0, 0)))
        @ Matrix.Rotation(math.radians(TOKEN_SWING), 4, view @ Vector((0, 1, 0)))
        @ token.rotation_euler.to_matrix().to_4x4()
    ).to_euler()

    material = tier_material("event-token", EVENT_TOKEN_HEX,
                             EVENT_TOKEN_MEASURED, max_gain=3.0)
    shader = _shader(material)
    # 0.22 keeps a real metallic sheen. Roughing the surface to 0.38, or to
    # the chip coin's 0.541, also hides the banding - but it hides it by
    # throwing away the reflection that makes metal look like metal, and the
    # banding was never a reflection problem. It is the rim chamfer's facets
    # being picked out one by one, which is fixed below in the geometry so
    # the finish does not have to pay for it.
    # The credit chain's exact metal, in the token's own colour: 0.94 and
    # 0.13, no coat, with the same max_gain 1.45 on the brightness
    # correction above.
    shader.inputs["Metallic"].default_value = 0.1
    shader.inputs["Roughness"].default_value = 0.3
    # A HAIRLINE bevel. At 0.006 it was wider than the rays are thick and
    # melted the whole device into blobs - a struck mark needs its edges.
    # 20 DEGREES, and the number is not free. Too high and the rays' facets
    # blend into the field and into each other, which is the rippling the
    # shared 30 sets off. Too low and the CHAMFERS stop being curves: a 90
    # degree corner cut into six segments steps about 12.9 degrees per
    # segment, so at 12 every segment shaded as its own flat band and the rim
    # came out quilted, with the same stepping round the inner lip. 20 clears
    # the chamfer's 12.9 and stays far below the 90 the struck edges meet at.
    finish(token, "event-token", material, bevel=0.0015,
           smooth_angle=math.radians(20))

    # SEGMENTS, not width. The disc's outer edge gets its own six-segment
    # chamfer above and reads perfectly round; the rim's INNER lip had only
    # the shared two-segment bevel, which is a single flat facet per side of
    # a 64-sided ring - and on a 0.94-metallic surface each of those facets
    # returns its own highlight, so the inner edge showed the polygon the
    # outer one hides. It does not show in solid viewport shading, which is
    # matte and has no reflection to break up.
    #
    # The width stays a hairline: width is what melts a struck device, and
    # the crown's rays are only 0.014 thick.
    # 16, matching the rim chamfer. Six segments over the arch's edges leaves
    # each rounded strip coarse enough to shade as its own ridge, which is
    # the banding across the band. Raising the segment count fixes it without
    # moving a single vertex, so the arch keeps exactly the angle it had -
    # raising the disc's side count to 128 also cleared the ridges but
    # changed how the highlight runs along it.
    token.modifiers["Bevel"].segments = 16
    return {1: token}


def build_chip_coin():
    """The credit coin as a MARK: face to the camera, swung, same as the token.

    The board's tier-one credit lies flat, which is right there - seen from
    above a coin shows its whole face and its thickness with no trick. The
    HUD chip is a different job: it is a 17px icon read at a glance, and flat
    on the ground a coin is an ellipse with a scratch on it.

    So this is the same geometry presented the way the event token is, and it
    is a separate render rather than a re-pose of tier one, because both are
    wanted at once - the board keeps its flat coin and the chip gets a mark.
    """
    radius, thickness = 0.17, 0.042
    # 128 sides, matching the token: this is the other piece seen face on,
    # so both of its circles are full circles rather than the ellipses the
    # board's coins show.
    body = coin(radius, thickness, sides=128)

    # The disc's own chamfer, six segments, exactly as the token's - a
    # two-segment bevel auto-smoothed into a 64-sided wall is what makes an
    # outer ring look wavy.
    rim = body.modifiers.new("RimChamfer", 'BEVEL')
    # 16 segments, matching the token. Six over a 90 degree corner steps
    # 12.9 degrees at a time and a low-roughness metal returns a distinct
    # highlight off each step, which bands the rim; at 16 the step is 5.3 and
    # the chamfer shades as one curve.
    rim.width, rim.segments = 0.004, 16
    rim.limit_method, rim.angle_limit = 'ANGLE', SMOOTH_ANGLE
    rim.use_clamp_overlap = True
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier="RimChamfer")

    # FACED TO THE CAMERA, then swung and tilted like the other marks. A hard
    # (90, 0, 0) was tried and points the struck face away from the camera -
    # `coin` cuts its well and slot on +Z, so the mark only reads when +Z is
    # what the camera sees. It came back as a blank disc.
    chip_facing(body, 'Z')

    # CALIBRATED THE WAY THE TOKEN IS: measured on this mark, at this
    # material and this pose, with the same 3.0 cap. The board coins'
    # measurement does not transfer - those were taken lying flat at 0.94
    # metallic, where the render is a different colour entirely. Face on at
    # 0.2 metallic the swatch comes back 0x5e4313.
    material = tier_material("credit-mark", CURRENCY_HEX["currency-credit"][1],
                             0x5e4313, max_gain=3.0)
    shader = _shader(material)
    # Same finish as the event token. 0.541 was the right call while the rim
    # was banding, because roughness was the only lever that hid it - but it
    # hid it by throwing away the reflection that makes metal read as metal.
    # With the chamfer fixed above the banding is gone from the geometry, so
    # the sheen can come back.
    # Low metallic so the base colour carries the brightness, the way the
    # token does.
    # GOLD LEAF. Real leaf is fully metallic with a warm yellow tint and a
    # slightly broken surface - not a mirror, but nowhere near matte. The
    # crinkle is what spreads a lamp into the soft sheen it has.
    shader.inputs["Metallic"].default_value = 1.0
    # 0.30, chosen because it SURVIVES THE SHRINK. The chip draws this at
    # 19 pixels from a 512 source, and a sharp specular is smaller than one
    # of those pixels by the time it gets there - at roughness 0 the
    # brightest pixel falls from 765 to 564 on the way down, which is the
    # highlight going missing in the game while looking fine in the PNG. A
    # broader, softer sheen is large enough to still be there: 758 to 688.
    shader.inputs["Roughness"].default_value = 0.30

    # WARMED WITHOUT LOSING THE CALIBRATION. At low metallic the specular
    # turns white and dilutes the gold, so the hue needs a push - but
    # assigning a hand-picked Base Color REPLACES what tier_material
    # computed and throws the measured correction away, which is what
    # happened when this was a literal 0xffb82a.
    #
    # So the calibrated colour is warmed in place: the channels are tilted
    # towards orange, then the whole triple is scaled back so its luminance
    # is exactly what the calibration produced. Hue moves, value does not.
    # A metal's base colour is the colour it TINTS its reflection, so for
    # leaf it is the leaf's own yellow rather than a calibrated value - the
    # calibration above only sets the starting point.
    leaf = [srgb_to_linear(c) for c in (0xe8, 0xb6, 0x3c)]
    shader.inputs["Base Color"].default_value = (*leaf, 1.0)
    finish(body, "credit-mark", material, bevel=0.0015,
           smooth_angle=math.radians(20))
    return {1: body}


def chip_facing(ob, axis: str):
    """Points a HUD mark at the camera and swings it to the chip angle.

    `axis` is which of the object's own axes is its face - 'Z' for a coin,
    which `coin` strikes on +Z, and 'Y' for an extruded outline, which
    carries its face along the extrusion.
    """
    view = Euler((math.pi / 2 - ELEVATION, 0.0, AZIMUTH)).to_quaternion()
    forward = view @ Vector((0, 0, -1))
    up = 'Y' if axis == 'Z' else 'Z'
    ob.rotation_euler = (-forward).to_track_quat(axis, up).to_euler()
    ob.rotation_euler = (
        Matrix.Rotation(math.radians(COIN_TILT if axis == 'Z' else CHIP_TILT),
                        4, view @ Vector((1, 0, 0)))
        @ Matrix.Rotation(math.radians(CHIP_SWING), 4, view @ Vector((0, 1, 0)))
        @ ob.rotation_euler.to_matrix().to_4x4()
    ).to_euler()
    return ob


def build_chip_gem():
    """The gem as a MARK for the HUD chip, the coin's treatment in purple.

    Same two fixes the coin needed. It was built with rotation_euler set to
    zero - no facing at all - so the camera saw it edge on, and it carried an
    emission hack to brighten it. Both gone: it faces the camera through the
    shared mark constants, and its brightness comes from a calibration
    measured on this piece at this material.
    """
    body = extrude_profile(GEM, 0.20)
    chip_facing(body, 'Y')

    material = tier_material("gem-mark", CURRENCY_HEX["currency-gem"][1],
                             GEM_MARK_MEASURED, max_gain=3.0)
    shader = _shader(material)
    # The board gem's own recipe: half glass, half stone.
    shader.inputs["Transmission Weight"].default_value = 0.5
    shader.inputs["Roughness"].default_value = 0.04
    shader.inputs["IOR"].default_value = 1.75
    # A much softer coat than the board gems'. Round lamps took the square
    # out of the reflection and blur is what stops it reading as the lamp at
    # all - coat WEIGHT barely moved it, because a weaker coat is a fainter
    # copy of the same shape, not a different one.
    polished(material, coat_roughness=0.25)
    finish(body, "gem-mark", material, bevel=0.004)
    return {1: body}


# ---- water -----------------------------------------------------------------

def revolve(profile, segments: int = 40, close_bottom: bool = True,
            close_top: bool = True):
    """A solid of revolution from a (radius, z) profile, spun about Z.

    Water has no flat faces and no fractures, so none of the mineral
    primitives fit it: a hull is broken rock by construction and a prism is
    cut stone. Almost every shape in this chain - the droplet, the bowl, the
    vortex, the sphere - is a silhouette spun about a vertical axis, which is
    one helper rather than six.

    The profile runs BOTTOM TO TOP. A radius of zero at either end is treated
    as an apex and fans to a single vertex instead of a degenerate ring, so
    the droplet's tip and the vortex's throat are real points.
    """
    mesh = bpy.data.meshes.new("revolve")
    bm = bmesh.new()
    rings, apexes = [], {}
    for index, (radius, z) in enumerate(profile):
        if radius <= 1e-6:
            apexes[index] = bm.verts.new((0.0, 0.0, z))
            rings.append(None)
            continue
        rings.append([
            bm.verts.new((math.cos(2 * math.pi * i / segments) * radius,
                          math.sin(2 * math.pi * i / segments) * radius, z))
            for i in range(segments)
        ])
    for index in range(len(profile) - 1):
        lower, upper = rings[index], rings[index + 1]
        for i in range(segments):
            j = (i + 1) % segments
            if lower is None:
                bm.faces.new((apexes[index], upper[i], upper[j]))
            elif upper is None:
                bm.faces.new((lower[j], lower[i], apexes[index + 1]))
            else:
                bm.faces.new((lower[i], lower[j], upper[j], upper[i]))
    if close_bottom and rings[0] is not None:
        bm.faces.new(tuple(reversed(rings[0])))
    if close_top and rings[-1] is not None:
        bm.faces.new(tuple(rings[-1]))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("revolve", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    return ob


def droplet(radius: float, height: float, steps: int = 20):
    """The teardrop: a point at the top rounding into a full belly below.

    Traced off the cubic in `drawWaterTier`'s `drop` rather than invented -
    the drawn mark is what the player already knows a droplet in this game
    looks like. A hanging drop is widest well below its middle, which is the
    whole difference between a teardrop and a cone with a rounded bottom.
    """
    profile = []
    for i in range(steps + 1):
        u = i / steps
        # sin gives the round base; the exponent pulls the shoulder up into
        # the tip instead of letting it bulge like an egg.
        profile.append((radius * math.sin(math.pi * u) ** 1.35 * (1.0 - u * 0.22),
                        height * u))
    profile[0] = (0.0, 0.0)
    profile[-1] = (0.0, height)
    return revolve(profile, close_bottom=False)


def blob(radius: float, height: float, seed: int, wobble: float = 0.16,
         segments: int = 44):
    """A lopsided shallow pool - a puddle, or the water lying in a basin.

    A tidy ellipse reads as something poured on purpose. Two harmonics out of
    phase with each other, the same trick the drawn puddle uses, so no lobe
    lands opposite its twin: one wave alone just makes a flower.
    """
    rng = random.Random(seed)
    phase_a, phase_b = rng.uniform(0, 6.28), rng.uniform(0, 6.28)
    rim = [radius * (1.0 + wobble * math.sin(2 * math.pi * i / segments * 3 + phase_a)
                     + wobble * 0.55 * math.sin(2 * math.pi * i / segments * 5 + phase_b))
           for i in range(segments)]
    mesh = bpy.data.meshes.new("blob")
    bm = bmesh.new()

    def ringverts(scale, z):
        return [bm.verts.new((math.cos(2 * math.pi * i / segments) * rim[i] * scale,
                              math.sin(2 * math.pi * i / segments) * rim[i] * scale, z))
                for i in range(segments)]

    # Three rings: a flat floor, the widest point, and a slightly drawn-in
    # top, so the pool carries a meniscus rather than a knife edge.
    floor = ringverts(0.94, 0.0)
    edge = ringverts(1.0, height * 0.55)
    top = ringverts(0.88, height)
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((floor[i], floor[j], edge[j], edge[i]))
        bm.faces.new((edge[i], edge[j], top[j], top[i]))
    bm.faces.new(tuple(reversed(floor)))
    bm.faces.new(tuple(top))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("blob", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    return ob


def torus(major: float, minor: float, squash: float = 1.0,
          major_segments: int = 44, minor_segments: int = 14):
    """A ring: the tidal ring's body, and every ripple in the chain."""
    mesh = bpy.data.meshes.new("torus")
    bm = bmesh.new()
    rings = []
    for i in range(major_segments):
        a = 2 * math.pi * i / major_segments
        centre = Vector((math.cos(a) * major, math.sin(a) * major, 0.0))
        out = Vector((math.cos(a), math.sin(a), 0.0))
        rings.append([
            bm.verts.new(centre
                         + out * (math.cos(2 * math.pi * k / minor_segments) * minor)
                         + Vector((0.0, 0.0,
                                   math.sin(2 * math.pi * k / minor_segments)
                                   * minor * squash)))
            for k in range(minor_segments)
        ])
    for i in range(major_segments):
        n = (i + 1) % major_segments
        for k in range(minor_segments):
            m = (k + 1) % minor_segments
            bm.faces.new((rings[i][k], rings[n][k], rings[n][m], rings[i][m]))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("torus", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    low = min(v.co.z for v in mesh.vertices)
    for v in mesh.vertices:
        v.co.z -= low
    return ob


def ball(radius: float, segments: int = 32):
    """A sphere, sitting on z=0."""
    steps = segments // 2
    profile = [(math.sin(math.pi * i / steps) * radius,
                radius - math.cos(math.pi * i / steps) * radius)
               for i in range(steps + 1)]
    profile[0] = (0.0, 0.0)
    profile[-1] = (0.0, radius * 2)
    return revolve(profile, segments=segments, close_bottom=False)


def basin(radius: float, height: float, wall: float = 0.05):
    """An open vessel: a bowl with its inside scooped out.

    ONE revolution, outer wall down and inner wall back up, rather than a
    boolean. Carving a sphere out of a sphere leaves coincident faces at the
    lip and the bevel catches them as a seam.
    """
    steps = 14
    outer = [(math.sin(math.pi * 0.5 * i / steps) * radius,
              height * (1 - math.cos(math.pi * 0.5 * i / steps)))
             for i in range(steps + 1)]
    inner = [(math.sin(math.pi * 0.5 * i / steps) * max(0.0, radius - wall),
              wall + (height - wall) * (1 - math.cos(math.pi * 0.5 * i / steps)))
             for i in range(steps, -1, -1)]
    return revolve(outer + inner, close_bottom=False)


def arc_tube(points, radius: float, sides: int = 10):
    """A round tube swept along a path: the jet, and the cascade's falls."""
    mesh = bpy.data.meshes.new("tube")
    bm = bmesh.new()
    rings = []
    for index, point in enumerate(points):
        nxt = Vector(points[min(index + 1, len(points) - 1)])
        prv = Vector(points[max(index - 1, 0)])
        forward = nxt - prv
        if forward.length < 1e-6:
            forward = Vector((0.0, 0.0, 1.0))
        forward.normalize()
        side = forward.cross(Vector((0.0, 1.0, 0.0)))
        if side.length < 1e-6:
            side = forward.cross(Vector((1.0, 0.0, 0.0)))
        side.normalize()
        up = forward.cross(side)
        rings.append([
            bm.verts.new(Vector(point)
                         + side * (math.cos(2 * math.pi * k / sides) * radius)
                         + up * (math.sin(2 * math.pi * k / sides) * radius))
            for k in range(sides)
        ])
    for i in range(len(rings) - 1):
        for k in range(sides):
            m = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][m], rings[i][m]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("tube", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    return ob


def ribbon(points, widths, heights, sides: int = 14):
    """A swept run whose cross-section is a FLAT ELLIPSE that changes along
    its length - a stream, rather than the round constant tube `arc_tube`
    sweeps.

    A pipe is exactly what a constant circular section looks like, however
    it is bent. Running water is wide and shallow, it is never the same
    width twice, and it sits ON something: the section here is far wider
    than it is deep, and both vary per point.
    """
    mesh = bpy.data.meshes.new("ribbon")
    bm = bmesh.new()
    rings = []
    for index, point in enumerate(points):
        nxt = Vector(points[min(index + 1, len(points) - 1)])
        prv = Vector(points[max(index - 1, 0)])
        forward = nxt - prv
        if forward.length < 1e-6:
            forward = Vector((1.0, 0.0, 0.0))
        forward.normalize()
        # The flat axis is horizontal whatever the run is doing vertically,
        # so the surface stays level with the ground the water is on.
        side = forward.cross(Vector((0.0, 0.0, 1.0)))
        if side.length < 1e-6:
            side = Vector((0.0, 1.0, 0.0))
        side.normalize()
        rings.append([
            bm.verts.new(Vector(point)
                         + side * (math.cos(2 * math.pi * k / sides) * widths[index])
                         + Vector((0.0, 0.0,
                                   math.sin(2 * math.pi * k / sides)
                                   * heights[index])))
            for k in range(sides)
        ])
    for i in range(len(rings) - 1):
        for k in range(sides):
            m = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][m], rings[i][m]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("ribbon", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    return ob


def build_water():
    """Drops -> a body of water -> water under pressure -> contained water.

    TWELVE tiers, the longest chain in the game, and the shapes are not mine
    to invent: `drawWaterTier` in src/game/objects/TierIcons.ts has drawn
    every one of them since before the renderer existed, and a player who
    has climbed this chain knows what each tier looks like. Each entry below
    is that mark in three dimensions, not a fresh idea about water.

    The count rule the currencies follow holds at the bottom here too: one
    drop at tier one, two at tier two, three ripples at tier three.
    """
    out = {}
    # Tiers that carry more than one material and so finish themselves.
    prefinished = set()

    # 1-2 DROPLET, TWIN DROPS. The count is the tier.
    out[1] = droplet(0.22, 0.46)
    out[2] = stack([
        translate_to(droplet(0.19, 0.40), beside(-0.11, 0.05)),
        translate_to(droplet(0.135, 0.29), beside(0.17, -0.09)),
    ])

    # 3 TRIPLE RIPPLE: three rings spreading from one point, each lower and
    # wider than the last - that IS a ripple, and three of them is the tier.
    # CONCENTRIC, not scattered: the rings share a centre and each one is
    # thinner than the one inside it, which is how a ripple spreading out
    # loses its energy.
    out[3] = stack([torus(0.13 * i, 0.040 - 0.008 * i, squash=0.5)
                    for i in (1, 2, 3)])

    # 4 PUDDLE: shallower than it is wide, lopsided, with a fleck thrown
    # clear of itself. Those three things are the whole difference between a
    # puddle and the basin at tier six.
    out[4] = stack([
        blob(0.40, 0.075, seed=41),
        translate_to(blob(0.075, 0.035, seed=42, wobble=0.22), beside(0.34, -0.08)),
        translate_to(blob(0.055, 0.030, seed=43, wobble=0.22), beside(-0.33, 0.10)),
    ])

    # 5 FLOWING STREAM: a stream running down a rocky bed, with a step of
    # falls partway along and a pool at the foot - the reference is a river
    # BETWEEN BANKS, and the banks are half of what makes it read as one. A
    # bare ribbon of water is a shape; water with stone either side of it is
    # a place.
    #
    # THE ONLY TIER WITH TWO MATERIALS, so it is finished here rather than in
    # the shared loop below: `finish` clears an object's material slots and
    # assigns one, which would paint the rocks water-blue.
    along = Vector((-1.0, -1.0, 0.0)).normalized()
    across = Vector((1.0, -1.0, 0.0)).normalized()
    steps = 56
    path, widths, heights = [], [], []
    for i in range(steps + 1):
        u = i / steps
        bend = math.sin(u * math.pi * 2.1)
        here = along * (-0.40 + 0.80 * u) + across * (bend * 0.105)
        # THE FALLS. A single step down just past halfway, which is what the
        # reference hangs its whole silhouette on - a stream that runs level
        # the whole way is a canal.
        drop = 0.0 if u < 0.46 else min(1.0, (u - 0.46) / 0.12) * 0.075
        path.append((here.x, here.y, 0.105 - drop - 0.012 * u))
        # A thread at the head, opening into the pool at the foot - but a
        # WIDE one. At 0.02-0.145 the water was a line between two banks of
        # stone and the rocks were the subject; the river has to be the
        # subject, so the whole run is about half again as wide.
        widths.append(0.032 + 0.185 * u ** 1.25)
        heights.append(0.022 + 0.018 * u)
    water = stack([
        ribbon(path, widths, heights),
        # The pool the falls run out into, wider than the stream that feeds it.
        translate_to(blob(0.200, 0.055, seed=53, wobble=0.09),
                     tuple(along * 0.37 + across * 0.015)),
    ])
    water_material = tier_material("water-tier-5", WATER_HEX[5], WATER_MEASURED[5],
                                   max_gain=2.2)
    water_shader = _shader(water_material)
    water_shader.inputs["Transmission Weight"].default_value = 0.5
    water_shader.inputs["Roughness"].default_value = 0.06
    water_shader.inputs["IOR"].default_value = 1.33
    polished(water_material, coat_roughness=0.18)
    water_shader.inputs["Coat Weight"].default_value = 0.35
    finish(water, "water5-water", water_material, bevel=0.0,
           smooth_angle=math.radians(88))

    # The banks. Scattered along both sides in screen terms, because the
    # stream runs on the screen's horizontal - placed in world axes they
    # would pile up on one side of it.
    # DARK, because the studio is not. A mid brown at 0.30 mottle came back
    # pale grey - the light stop of that ramp blends toward white, and under
    # these lamps a small rounded stone shows almost nothing but its lit
    # side. The drawn reference is a deep warm brown, so the base starts
    # well below it and the weathering is kept narrow.
    # THE MINERAL CHAIN'S OWN STONE, colour and correction both. These banks
    # are the same rock the Slate and Gravel items are made of, so they take
    # that family's swatch rather than a brown of their own - one stone in
    # the game, not two that nearly match.
    stone = tier_material("water-bank", MINERAL_HEX[3], MINERAL_MEASURED[3],
                          max_gain=1.45)
    _shader(stone).inputs["Roughness"].default_value = MINERAL_SURFACE[3][0]
    _shader(stone).inputs["IOR"].default_value = MINERAL_SURFACE[3][1]
    # The blotching broken stone gets everywhere else in the game, at the
    # same numbers the mineral chain's rubble tiers use.
    # FINER AND WEAKER than the mineral chain's own rubble, because these
    # stones are a quarter the size of those. Noise scale is in world units,
    # so a scale of 9 across a 0.15 pebble lands the whole stone inside one
    # blotch - and with that ramp blending toward white, a bank of them came
    # out chalk. A tighter scale puts several blotches on each stone, which
    # is what reads as texture instead of as a paint job.
    mottle(stone, _shader(stone).inputs["Base Color"].default_value[:3],
           scale=26.0, strength=0.20)
    weathered(stone, strength=0.30, scale=90.0)
    rng = random.Random(55)
    banks = []
    for index in range(30):
        u = rng.uniform(0.02, 0.98)
        side = -1 if index % 2 else 1
        bend = math.sin(u * math.pi * 2.1)
        offset = (0.032 + 0.185 * u ** 1.25) + rng.uniform(0.050, 0.125)
        here = (along * (-0.40 + 0.80 * u)
                + across * (bend * 0.105 + side * offset))
        # BIGGER AND ROUNDER. At 0.07-0.15 with nine hull points they came
        # out as grey slivers beside the water rather than as a bank; river
        # stones are worn, so they want more points and less jitter.
        size = rng.uniform(0.130, 0.235)
        banks.append(translate_to(
            rock(size, size * rng.uniform(0.40, 0.58), seed=550 + index,
                 points=13, jitter=0.16),
            (here.x, here.y, 0.0)))
    bank = stack(banks)
    finish(bank, "water5-bank", stone, bevel=0.012)
    out[5] = stack([water, bank])
    prefinished.add(5)

    # 6 WATER BASIN: the vessel plus the water sitting in it. Two objects,
    # because the rim has to read as something holding the water in.
    out[6] = stack([
        basin(0.40, 0.26),
        translate_to(blob(0.335, 0.045, seed=61, wobble=0.04), (0.0, 0.0, 0.11)),
    ])

    # 7 FOUNTAIN: the floating AERATOR kind - a V of spray thrown up and
    # outward off the surface of open water, with no dish and no pedestal.
    #
    # Built as a hollow cone, not a solid one. The pattern those fountains
    # throw is a SHELL: water leaves the nozzle in a ring and spreads as it
    # rises, so the middle is empty and you can see the far side through it.
    # A solid cone of the same silhouette reads as a lampshade.
    # DISCRETE JETS, not a surface. Two passes at a hollow cone both read as
    # a cone - a revolved shell has a continuous silhouette and a continuous
    # highlight, and that is what a solid object looks like however thin its
    # wall is. Spray has GAPS: the eye reads the pattern from the separate
    # strands and the ground showing between them, so the V has to be built
    # out of the jets that make it.
    jets = []
    count = 16
    for k in range(count):
        angle = 2 * math.pi * k / count
        # Alternating lengths, so the crown is ragged rather than machined.
        reach = 0.34 if k % 2 == 0 else 0.29
        rise = 0.86 if k % 2 == 0 else 0.76
        path = []
        for i in range(13):
            u = i / 12
            # Out in a straight run, then tipping over at the top as the jet
            # runs out of speed - that turn is what says thrown, not poured.
            radius = 0.035 + reach * u ** 1.08
            path.append((math.cos(angle) * radius,
                         math.sin(angle) * radius,
                         rise * (u ** 0.78) * (1.0 - 0.18 * u * u)))
        jets.append(arc_tube(path, radius=0.017, sides=8))
    out[7] = stack([
        # The water it stands in, churned flat and wide where the spray lands.
        blob(0.40, 0.045, seed=70, wobble=0.07),
    ] + [translate_to(jet, (0.0, 0.0, 0.030)) for jet in jets])

    # 8 CASCADE: a THREE-TIERED CASCADING FOUNTAIN - the wedding-cake kind.
    # Concentric on one axis, widest dish at the bottom, each smaller one
    # carried above it on a stem, and water spilling over every rim.
    #
    # The first pass offset the three bowls sideways, which read as a stack
    # of plates knocked askew rather than as one piece of waterworks.
    parts = []
    levels = ((0.40, 0.0, 0.14), (0.27, 0.30, 0.11), (0.155, 0.54, 0.085))
    for index, (radius, z, depth) in enumerate(levels):
        parts.append(translate_to(basin(radius, depth), (0.0, 0.0, z)))
        parts.append(translate_to(blob(radius * 0.80, 0.028, seed=80 + index,
                                       wobble=0.035),
                                  (0.0, 0.0, z + depth * 0.55)))
        if index:
            # The stem carrying this dish up off the one below it.
            lower = levels[index - 1]
            parts.append(translate_to(
                revolve([(0.055, 0.0), (0.040, (z - lower[1]) * 0.5),
                         (0.055, z - lower[1])]),
                (0.0, 0.0, lower[1] + lower[2] * 0.5)))
            # Four curtains of water over the rim of the dish above, falling
            # into this one. Four, not two: a fountain spills all the way
            # round, and two strands read as a leak.
            for k in range(4):
                angle = math.pi / 4 + k * math.pi / 2
                parts.append(translate_to(
                    arc_tube([(0.0, 0.0, -(z - lower[1]) * (i / 10))
                              for i in range(11)], radius=0.024),
                    (math.cos(angle) * radius * 0.96,
                     math.sin(angle) * radius * 0.96,
                     z + depth * 0.5)))
    out[8] = stack(parts)

    # 9 WHIRLPOOL: a funnel. The identity is the THROAT - a cone of water
    # with a hole pulled down its middle - so the profile dives to a narrow
    # waist and the rim flares wide above it.
    out[9] = revolve(
        [(0.055, 0.0), (0.075, 0.05), (0.13, 0.13), (0.22, 0.22),
         (0.34, 0.30), (0.42, 0.35), (0.42, 0.38), (0.33, 0.34),
         (0.20, 0.25), (0.10, 0.14), (0.055, 0.06)],
        close_bottom=True)

    # 10 WATER SPHERE: water with no container at all, held by nothing. The
    # simplest shape in the chain and the one that says "this is not a puddle
    # any more" fastest.
    out[10] = ball(0.33)

    # 11 TIDAL RING: a THICK ring and nothing else. The drawn mark skips the
    # sphere entirely at this tier - `if(t!==11)` in drawWaterTier - and
    # strokes the ring at 0.095 where tier twelve strokes it at 0.038. A fat
    # ring alone is the silhouette; putting a ball inside it here is what
    # made it read as a smaller hydro core.
    #
    # TILTED, because the drawn ellipse is. A ring lying flat on the board
    # projects to an ellipse too, but a level one - the drawn mark leans,
    # which is what stops it reading as a hole in the ground.
    out[11] = torus(0.34, 0.115, squash=0.9)
    out[11].rotation_euler = Euler((math.radians(24), 0.0, math.radians(-18)))

    # 12 HYDRO CORE: the sphere with the ring AROUND ITS MIDDLE, the way the
    # drawn mark has it - a thin ring crossing the body, not a hoop resting
    # on top of one. Concentric and larger than the ball, so the ring passes
    # in front of the core on one side and behind it on the other, which is
    # the whole read.
    core = ball(0.235)
    hoop = torus(0.40, 0.038, squash=0.9)
    hoop.rotation_euler = Euler((math.radians(22), 0.0, math.radians(-16)))
    out[12] = stack([
        translate_to(core, (0.0, 0.0, 0.0)),
        translate_to(hoop, (0.0, 0.0, 0.235 - 0.038)),
    ])

    for tier, ob in out.items():
        if tier in prefinished:
            continue
        material = tier_material("water-tier-%d" % tier,
                                 WATER_HEX[tier], WATER_MEASURED[tier],
                                 max_gain=2.2)
        shader = _shader(material)
        # WATER IS GLASS WITH A COLOUR IN IT, and that is not a style choice:
        # its IOR is 1.33, it is perfectly smooth, and what makes a body of
        # water blue is Beer-Lambert absorption through its depth, not a
        # painted surface. A diffuse blue solid is what this chain looked
        # like before, and it read as plastic.
        #
        # HALF TRANSMISSION, the same split the gems landed on. Full glass
        # costs the value - the colour only exists as light that got through,
        # and what it has to transmit is a dark studio - and fully opaque
        # loses every refraction. At 0.55 the drawn blue survives AND the
        # shape bends what is behind it.
        shader.inputs["Transmission Weight"].default_value = 0.5
        shader.inputs["Roughness"].default_value = 0.06
        shader.inputs["IOR"].default_value = 1.33
        # NO `absorbing` HERE, and that is the whole difference between this
        # chain reading as water and reading as porcelain. Volume absorption
        # whitens the BASE colour by design - the tint is supposed to live in
        # the body, which works when the surface is fully transmissive. At a
        # half split the opaque half is then pure white diffuse, and it
        # dominates: every tier came back around 0xc0c5c8 against chain
        # colours from 0x315f86 to 0xb4edf7, and cutting the coat, the
        # transmission and the roughness moved it by three points, because
        # none of them were what was white.
        #
        # The gems settled this already: keep the colour on the SURFACE, and
        # let half the surface refract.
        polished(material, coat_roughness=0.18)
        shader.inputs["Coat Weight"].default_value = 0.35
        # NO BEVEL ANYWHERE IN THIS CHAIN. Every shape here is already a
        # curved surface with no arris to cut - a bevel on a sphere or a
        # revolved droplet only adds a band of geometry along the seam.
        finish(ob, "water%d" % tier, material, bevel=0.0,
               smooth_angle=math.radians(88))
    return out


# ---- the water source: a well ----------------------------------------------

def _well_materials():
    """The four surfaces the well is built from, made once per render.

    A source is the first thing in the game built out of more than one
    material, so the parts are finished in GROUPS - all the masonry, then all
    the timber - and joined afterwards. `finish` clears an object's material
    slots, so a part that is finished after the join loses its own surface.
    """
    stone = tier_material("well-stone", MINERAL_HEX[2], MINERAL_MEASURED[2],
                          max_gain=1.45)
    _shader(stone).inputs["Roughness"].default_value = MINERAL_SURFACE[2][0]
    _shader(stone).inputs["IOR"].default_value = MINERAL_SURFACE[2][1]
    mottle(stone, _shader(stone).inputs["Base Color"].default_value[:3],
           scale=22.0, strength=0.22)
    weathered(stone, strength=0.30, scale=80.0)

    timber = tier_material("well-timber", WOOD_HEX[3], WOOD_MEASURED[3],
                           max_gain=1.45)
    _shader(timber).inputs["Roughness"].default_value = WOOD_SURFACE[0]
    _shader(timber).inputs["IOR"].default_value = WOOD_SURFACE[1]
    grain(timber, _shader(timber).inputs["Base Color"].default_value[:3])

    # The well's water is the chain's own, at the shallow end of the ladder -
    # what is down a shaft is dark, not the bright tidal blue of tier twelve.
    water = tier_material("well-water", WATER_HEX[2], WATER_MEASURED[2],
                          max_gain=2.2)
    _shader(water).inputs["Transmission Weight"].default_value = 0.5
    _shader(water).inputs["Roughness"].default_value = 0.06
    _shader(water).inputs["IOR"].default_value = 1.33
    polished(water, coat_roughness=0.18)
    _shader(water).inputs["Coat Weight"].default_value = 0.35

    # Iron, for the crank and the bands on the bucket. A real metal, so it
    # tints its own reflection rather than carrying a diffuse grey.
    iron = tier_material("well-iron", 0x6a6e73, 0x6a6e73, max_gain=1.0)
    _shader(iron).inputs["Metallic"].default_value = 0.92
    _shader(iron).inputs["Roughness"].default_value = 0.34
    return stone, timber, water, iron


def _course(radius: float, z: float, height: float, blocks: int, offset: float):
    """One ring of masonry blocks, laid as a real course.

    A revolved cylinder would be a pipe. What says MASONRY is the individual
    stones and the joints between them, and that the joints of one course do
    not line up with the next - so each course takes a half-block offset.
    """
    out = []
    for i in range(blocks):
        angle = 2 * math.pi * (i + offset) / blocks
        # Each block is a shallow box, turned to face out of the circle.
        # THE LONG AXIS IS TANGENTIAL, which is the whole difference between
        # a wall and a cogwheel. `cube` lays its first extent along x, and x
        # is the RADIAL direction once the block is turned to face out of the
        # circle - so a block described long-side-first stuck out of the
        # wall like a tooth. Depth 0.055 radially, 0.150 around the circle,
        # which at eighteen blocks on a 0.40 radius overlaps its neighbour
        # slightly rather than leaving a gap.
        block = cube(0.055, 0.150, height, base=False)
        block.rotation_euler = Euler((0.0, 0.0, angle))
        bpy.ops.object.select_all(action='DESELECT')
        block.select_set(True)
        bpy.context.view_layer.objects.active = block
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        out.append(translate_to(block, (math.cos(angle) * radius,
                                        math.sin(angle) * radius,
                                        z + height / 2)))
    return out


def build_water_source():
    """The Water dispenser: a well that gets built up tier by tier.

    From docs/TODO_DETAILS.md, and it is a specification rather than a
    suggestion: "begins with a masonry-only well at Source 01, adds timber
    supports and a crank at Source 02, and adds the pitched roof at Source
    03. Later source tiers continue improving the structure."

    So the shape is CUMULATIVE. Every tier keeps everything the tier below
    it had and adds one recognisable piece of architecture - which is the
    same thing the item chains do with silhouette, and the reason an upgrade
    reads as an upgrade without a number on it.
    """
    stone_mat, timber_mat, water_mat, iron_mat = _well_materials()
    RADIUS = 0.40
    out = {}

    for tier in range(1, 6):
        stone_parts, timber_parts, water_parts, iron_parts = [], [], [], []

        # THE SHAFT, every tier. Three courses of masonry, each offset half a
        # block against the one below.
        for course, z in enumerate((0.0, 0.115, 0.230)):
            stone_parts += _course(RADIUS, z, 0.115, 18, 0.5 * (course % 2))
        # The coping the courses sit under - a flat ring capping the wall, so
        # the top of it reads as finished stonework rather than as the last
        # course happening to stop.
        # A RING, not a lid. The profile has to come back down its inner
        # face and close on itself: left open, `revolve` caps the last ring
        # as a disc and the well ends up with a stone plate over the shaft -
        # no hole, no water, and nothing for the bucket to go into.
        cap = revolve([(RADIUS - 0.075, 0.0), (RADIUS + 0.055, 0.0),
                       (RADIUS + 0.055, 0.045), (RADIUS - 0.075, 0.045),
                       (RADIUS - 0.075, 0.0)],
                      close_bottom=False, close_top=False)
        stone_parts.append(translate_to(cap, (0.0, 0.0, 0.345)))
        # The water down the shaft.
        water_parts.append(translate_to(
            blob(RADIUS - 0.085, 0.035, seed=91, wobble=0.03),
            (0.0, 0.0, 0.115)))

        if tier >= 2:
            # TIMBER SUPPORTS AND A CRANK. Two posts across the shaft, a
            # headstock between them, and the winding barrel the rope is on.
            for side in (-1, 1):
                post = cube(0.075, 0.075, 0.52, base=False)
                timber_parts.append(translate_to(
                    post, (side * (RADIUS - 0.03), 0.0, 0.39 + 0.26)))
            barrel = revolve([(0.0, 0.0), (0.075, 0.0), (0.075, 0.60), (0.0, 0.60)])
            barrel.rotation_euler = Euler((0.0, math.radians(90), 0.0))
            bpy.ops.object.select_all(action='DESELECT')
            barrel.select_set(True)
            bpy.context.view_layer.objects.active = barrel
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
            timber_parts.append(translate_to(barrel, (-0.30, 0.0, 0.86)))
            # The crank: a shaft out of one end, an elbow, and a grip.
            iron_parts.append(translate_to(
                arc_tube([(0.0, 0.0, 0.0), (0.13, 0.0, 0.0)], radius=0.020, sides=8),
                (RADIUS + 0.02, 0.0, 0.86)))
            iron_parts.append(translate_to(
                arc_tube([(0.0, 0.0, 0.0), (0.0, 0.0, -0.13)], radius=0.020, sides=8),
                (RADIUS + 0.15, 0.0, 0.86)))
            iron_parts.append(translate_to(
                arc_tube([(0.0, 0.0, 0.0), (0.10, 0.0, 0.0)], radius=0.018, sides=8),
                (RADIUS + 0.15, 0.0, 0.73)))

        if tier >= 3:
            # THE PITCHED ROOF. Two slabs leaning against each other over a
            # ridge, carried on the posts.
            for side in (-1, 1):
                slab = cube(0.62, 0.34, 0.035, base=False)
                slab.rotation_euler = Euler((0.0, math.radians(side * 34), 0.0))
                bpy.ops.object.select_all(action='DESELECT')
                slab.select_set(True)
                bpy.context.view_layer.objects.active = slab
                bpy.ops.object.transform_apply(location=False, rotation=True,
                                               scale=False)
                timber_parts.append(translate_to(
                    slab, (side * 0.22, 0.0, 1.06)))
            ridge = cube(0.075, 0.36, 0.055, base=False)
            timber_parts.append(translate_to(ridge, (0.0, 0.0, 1.20)))

        if tier >= 4:
            # THE BUCKET, on its rope, plus a stone apron round the foot so
            # the well is standing on worked ground rather than in a field.
            # HUNG, not stood. A bucket resting on the coping is a pot; a
            # bucket on a rope under the barrel is a well.
            timber_parts.append(translate_to(
                revolve([(0.095, 0.0), (0.115, 0.155), (0.115, 0.165),
                         (0.095, 0.165), (0.095, 0.0)],
                        close_bottom=True, close_top=False),
                (0.0, 0.0, 0.47)))
            iron_parts.append(translate_to(torus(0.112, 0.012), (0.0, 0.0, 0.615)))
            iron_parts.append(translate_to(
                arc_tube([(0.0, 0.0, 0.0), (0.0, 0.0, 0.22)], radius=0.007, sides=6),
                (0.0, 0.0, 0.635)))
            apron = revolve([(RADIUS + 0.055, 0.0), (RADIUS + 0.185, 0.0),
                             (RADIUS + 0.185, 0.050), (RADIUS + 0.055, 0.065)],
                            close_bottom=False)
            stone_parts.append(apron)

        if tier >= 5:
            # A SECOND COURSE ON THE ROOF and a spout into a trough - the
            # tier where the well stops being a hole with a lid and becomes
            # waterworks.
            for side in (-1, 1):
                slab = cube(0.70, 0.40, 0.030, base=False)
                slab.rotation_euler = Euler((0.0, math.radians(side * 34), 0.0))
                bpy.ops.object.select_all(action='DESELECT')
                slab.select_set(True)
                bpy.context.view_layer.objects.active = slab
                bpy.ops.object.transform_apply(location=False, rotation=True,
                                               scale=False)
                timber_parts.append(translate_to(slab, (side * 0.25, 0.0, 0.98)))
            trough = revolve([(0.0, 0.0), (0.20, 0.0), (0.20, 0.12),
                              (0.165, 0.12), (0.165, 0.03), (0.0, 0.03)],
                             close_bottom=True)
            stone_parts.append(translate_to(trough, (0.0, -0.66, 0.0)))
            water_parts.append(translate_to(
                blob(0.155, 0.03, seed=92, wobble=0.03), (0.0, -0.66, 0.055)))
            iron_parts.append(translate_to(
                arc_tube([(0.0, 0.0, 0.0), (0.0, -0.16, 0.0), (0.0, -0.20, -0.06)],
                         radius=0.026, sides=8),
                (0.0, -RADIUS - 0.02, 0.30)))

        groups = [(stone_parts, stone_mat, 0.010),
                  (timber_parts, timber_mat, 0.008),
                  (water_parts, water_mat, 0.0),
                  (iron_parts, iron_mat, 0.004)]
        finished = []
        for index, (parts, material, bevel) in enumerate(groups):
            if not parts:
                continue
            group = stack(parts)
            finished.append(finish(group, "well%d-%d" % (tier, index), material,
                                   bevel=bevel, smooth_angle=math.radians(50)))
        out[tier] = stack(finished)
    return out


# ---- the legacy machine's gear ---------------------------------------------

# THE BARREL'S ANGLE. In the reference the gear train lies on its side and
# runs away from the viewer - you look along the stack, not at one gear's
# face. These two put the gear's axis along that line.
# Turned less and tilted more than the first pass: the photographs are all
# taken from ABOVE the barrel looking down its length, so you read the end
# wheel's face and the stack running away behind it. At 64/14 the machine
# was nearly side-on and the depth of the barrel was lost.
# Almost straight down the barrel. The clearest reference is shot from
# above the near end looking along the length: the two stacks run away up
# the frame and the end wheels sit nearest the camera. That is nearly all
# TILT and very little turn - at 56/27 the machine was still being read
# side-on, which is the one view that hides how long it is.
# DOWN NEAR THE HORIZON. At 49 degrees of tilt the camera was looking onto
# the top of the barrel like a plan view, which flattens it - the reference
# photographs are taken from about the height of the bench, so the stack
# runs away almost level and the near gears tower over the far ones.
GEAR_AXIS_TURN = math.radians(11)
GEAR_AXIS_TILT = math.radians(29)

# Sixteen frames across ONE TOOTH PITCH. A gear with eighteen teeth is
# identical to itself every twenty degrees, so a loop only has to cover
# twenty degrees - and sixteen frames of it fit a 512 square at 128 each,
# which keeps the sheet power-of-two and its mipmaps alive.
GEAR_TEETH = 30
GEAR_FRAMES = 16
# THIN. The reference gears are laser-cut plate - a stack of eight at 0.20
# read as a row of tyres, and it is the thinness that lets a barrel hold as
# many as it does. At a hundred of them the plate has to be thinner still.
GEAR_THICKNESS = 0.040
# How many plates in from the near end still turn fast enough to SEE. Past
# this the rate is under a thousandth of the first gear's and the render
# cannot show the difference, so they all share the slowest step rather
# than each costing its own arithmetic.
LEGACY_STAGES = 7
# A GEAR'S SYMMETRY IS NOT ITS TOOTH PITCH.
#
# Thirty teeth means the TEETH repeat every twelve degrees - but the wheel
# has six spokes, which repeat every sixty. Turn it one tooth and the teeth
# land back on themselves while the spokes are nowhere near, so the frame
# does not match the one before it. The real symmetry is the coarser of the
# two: five teeth, sixty degrees.
#
# That cost three attempts to find. The loop was built on tooth pitch, and
# every measurement said the wrap jumped by more than a step no matter how
# the rotation was fixed.
# THE END WHEELS keep six spokes - they are the only ones you read, and
# the open wheel is the machine's signature. THE BURIED PLATES take one
# per tooth: nobody can see a plate's spokes through a stack fifty deep,
# and it buys back the symmetry the six-spoke version cost.
# CLOSED, not spoked. The open wheel looked right, but its six spokes made
# the gear repeat only every sixty degrees - see `spin_legacy_machine` -
# and a loop long enough to close on that was five times the frames. A
# closed web repeats every tooth, and the reference's own barrel is so
# dense that the webs are invisible behind the teeth anyway.
GEAR_SPOKES = 0
PLATE_SPOKES = 0
# The open wheel, for the one gear the panel spins live.
GEAR_SPOKES_OPEN = 6

# NINE TEETH per loop: gear one covers nine, gear two three, gear three
# one - every one a whole tooth, so all three come back to themselves and
# the wrap is exact. Gear four would need twenty-seven and is held, which
# is honest, since at a 27:1 reduction it moves a third of a tooth over
# the whole loop.
MACHINE_LOOP_PITCHES = 9
MACHINE_FRAMES = 18


def pose_on_barrel_axis(ob):
    """Lays a piece over so its local Z runs along the barrel.

    Square to the viewer FIRST, then turned: the barrel angle is described
    relative to the CAMERA, not to the world, so that the same two numbers
    read the same way whatever the scene's azimuth happens to be.
    """
    facing_camera(ob)
    view = Euler((math.pi / 2 - ELEVATION, 0.0, AZIMUTH)).to_quaternion()
    ob.rotation_euler = (
        Matrix.Rotation(GEAR_AXIS_TILT, 4, view @ Vector((1, 0, 0)))
        @ Matrix.Rotation(GEAR_AXIS_TURN, 4, view @ Vector((0, 1, 0)))
        @ ob.rotation_euler.to_matrix().to_4x4()
    ).to_euler()
    # THE AXLE, in world space, taken BEFORE the rotation is baked in.
    #
    # `transform_apply` writes the rotation into the vertices and resets
    # rotation_euler to zero, so afterwards the object's "local Z" is the
    # WORLD's Z, not the barrel's. Reading the axle off the object after
    # posing spun every gear about the vertical like a turntable instead of
    # rolling it on its own shaft.
    axle = ob.rotation_euler.to_matrix() @ Vector((0.0, 0.0, 1.0))
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return axle


def build_legacy_gear(spin: float = 0.0, pose: bool = True,
                      radius: float = 1.0, dressed: bool = True,
                      spokes: int = GEAR_SPOKES):
    """ONE spur gear at the barrel's angle, spun `spin` radians on its axis.

    One gear, not a pre-rendered stack: the panel places eight of these and
    runs each at its own rate, which is the whole point of the machine - gear
    one is a blur while gear eight has visibly not moved. A single rendered
    barrel could only ever be a still photograph of that idea.
    """
    teeth = GEAR_TEETH
    # A SPOKED WHEEL, not a disc with a hole. The reference gears are mostly
    # air: a thin toothed rim, a small hub, and a handful of arms between
    # them with big open windows either side. A solid web is what made the
    # first pass read as a coin - and at eight stacked deep, the windows are
    # also what let you see the gears behind.
    outer, root = 0.50 * radius, 0.425 * radius
    rim_in = 0.355 * radius
    hub, bore = 0.135 * radius, 0.060 * radius
    spoke_half = math.radians(7.5 * 6 / spokes) if spokes > 0 else 0.0
    thickness = GEAR_THICKNESS

    mesh = bpy.data.meshes.new("gear")
    bm = bmesh.new()
    rim = []
    for i in range(teeth * 4):
        step = i % 4
        # root, flank up, tip, flank down - a trapezoidal tooth, which is
        # what reads as a gear in silhouette. A sine wave reads as a flower.
        radius = (root, outer, outer, root)[step]
        angle = spin + 2 * math.pi * (i + (0.35 if step in (1, 2) else 0.0)) / (teeth * 4)
        rim.append((math.cos(angle) * radius, math.sin(angle) * radius))

    count = len(rim)
    lower = [bm.verts.new((x, y, 0.0)) for x, y in rim]
    upper = [bm.verts.new((x, y, thickness)) for x, y in rim]
    inner_low, inner_up = [], []
    for i in range(count):
        angle = spin + 2 * math.pi * i / count
        cx, cy = math.cos(angle) * rim_in, math.sin(angle) * rim_in
        inner_low.append(bm.verts.new((cx, cy, 0.0)))
        inner_up.append(bm.verts.new((cx, cy, thickness)))
    for i in range(count):
        j = (i + 1) % count
        bm.faces.new((lower[i], lower[j], upper[j], upper[i]))            # teeth
        bm.faces.new((inner_low[j], inner_low[i], inner_up[i], inner_up[j]))  # bore of the rim
        bm.faces.new((inner_low[i], inner_low[j], lower[j], lower[i]))    # underside
        bm.faces.new((upper[i], upper[j], inner_up[j], inner_up[i]))      # top face

    # The hub: a short tube on the same axis, open through the middle.
    hub_low, hub_up, bore_low, bore_up = [], [], [], []
    for i in range(count):
        angle = spin + 2 * math.pi * i / count
        cx, cy = math.cos(angle), math.sin(angle)
        hub_low.append(bm.verts.new((cx * hub, cy * hub, 0.0)))
        hub_up.append(bm.verts.new((cx * hub, cy * hub, thickness)))
        bore_low.append(bm.verts.new((cx * bore, cy * bore, 0.0)))
        bore_up.append(bm.verts.new((cx * bore, cy * bore, thickness)))
    for i in range(count):
        j = (i + 1) % count
        bm.faces.new((hub_low[i], hub_low[j], hub_up[j], hub_up[i]))
        bm.faces.new((bore_low[j], bore_low[i], bore_up[i], bore_up[j]))
        bm.faces.new((bore_low[i], bore_low[j], hub_low[j], hub_low[i]))
        bm.faces.new((hub_up[i], hub_up[j], bore_up[j], bore_up[i]))

    if spokes <= 0:
        # A CLOSED WEB. A spoked wheel only repeats every few teeth - six
        # spokes on thirty teeth means the gear maps onto itself once every
        # sixty degrees, not every twelve - and that coarse symmetry is
        # what forced the rotation loop to be five times longer than it
        # needed to be, which in turn is why only the first gear could be
        # allowed to move. Closing the web makes every tooth a repeat, so a
        # loop of nine teeth covers gears one, two AND three.
        for i in range(count):
            j = (i + 1) % count
            bm.faces.new((hub_low[j], lower[j], lower[i], hub_low[i]))
            bm.faces.new((hub_up[i], upper[i], upper[j], hub_up[j]))
    else:
        # The arms. Straight bars from hub to rim, thin enough that the
        # windows between them are most of the wheel.
        for k in range(spokes):
            centre = spin + 2 * math.pi * k / spokes
            ring = []
            for radius in (hub * 0.98, rim_in * 1.02):
                for side in (-1, 1):
                    angle = centre + side * spoke_half
                    ring.append((math.cos(angle) * radius, math.sin(angle) * radius))
            # hub-left, hub-right, rim-right, rim-left, wound so it closes.
            order = [ring[0], ring[1], ring[3], ring[2]]
            low = [bm.verts.new((x, y, 0.0)) for x, y in order]
            up = [bm.verts.new((x, y, thickness)) for x, y in order]
            for i in range(4):
                j = (i + 1) % 4
                bm.faces.new((low[i], low[j], up[j], up[i]))
            bm.faces.new(tuple(reversed(low)))
            bm.faces.new(tuple(up))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("gear", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob

    if pose:
        pose_on_barrel_axis(ob)
    elif pose is None:
        # FACE ON, for the live panel. A sprite can only be rotated about
        # the axis pointing at the viewer, so a gear that is going to be
        # turned in the game has to be photographed down its own axle -
        # any other angle and spinning the sprite is a lie the silhouette
        # gives away immediately.
        facing_camera(ob)
    if not dressed:
        # Part of a bigger assembly: it gets its material and its bevel
        # once, after the join, so the machine is one object and not
        # thirty-two.
        return ob

    # CAST IRON, the reference machine's own material: a real metal, dark,
    # and rough enough that it reads as machined rather than chromed.
    # NEAR-BLACK, the way the reference machine's gears are - dark cast
    # parts with a sheen along the tooth tips, not bright steel. A light
    # grey barrel reads as a stack of coins.
    material = tier_material("legacy-gear", 0x2f3338, 0x2f3338, max_gain=1.0)
    _shader(material).inputs["Metallic"].default_value = 0.85
    _shader(material).inputs["Roughness"].default_value = 0.42
    # A NARROW smooth angle. At 34 degrees the shading ran from the flat
    # web straight out over the tooth roots and the whole gear read as a
    # star; a cast gear has a flat face and the teeth stand off it.
    finish(ob, "legacy-gear", material, bevel=0.006,
           smooth_angle=math.radians(16))
    return ob



def legacy_machine_material():
    """The one surface the whole machine is cut from.

    CALIBRATED, because a barrel of gears shadows itself relentlessly: the
    first pass measured 0x1b1e22 against a swatch of 0x2f3338 and read as a
    black cut-out. Almost none of this shape is a lit face - it is teeth
    standing in each other's shade - so the correction has real work to do.
    """
    material = tier_material("legacy-gear", 0x3b4149, 0x1b1e22, max_gain=2.6)
    # LESS metallic than a bare gear would be. A metal has no diffuse at
    # all, so a self-shadowing stack of them has nothing to return in the
    # shade; a little diffuse is what keeps the inner plates from going to
    # pure black.
    _shader(material).inputs["Metallic"].default_value = 0.55
    _shader(material).inputs["Roughness"].default_value = 0.40
    return material


def build_legacy_machine():
    """THE WHOLE MACHINE: two long barrels of thin plate gears lying side by
    side with their teeth in mesh, an end wheel on the near face of each,
    the shafts they ride, a stand, and the worktop under it.

    BUILT ONCE, AND THE GEARS ARE LEFT AS SEPARATE OBJECTS. The rotation
    loop is produced by re-posing these objects between renders - see
    `spin_legacy_machine` - not by rebuilding them. An earlier version
    baked each frame's rotation into the vertices and rebuilt every mesh
    per frame: fine for the single-gear sprite it was written for, and
    1,600 bmesh builds when the same code was pointed at a hundred gears
    over sixteen frames, which took Blender down repeatedly. Rotating an
    object is free; rebuilding geometry is not, and the geometry never
    needed to change.

    Assembled flat - every gear in the XY plane, the barrels running along
    Z - and posed onto the barrel axis at the end. Posing each gear as it
    is made would mean assembling in a rotated frame, which is how the
    spacing goes wrong.

    Returns (machine_parts, spinners, counter): everything to render, the
    gears that turn paired with their rate, and the worktop, which is kept
    out of the camera fit.
    """
    thickness = GEAR_THICKNESS
    pitch = thickness + 0.013          # plate plus the gap between plates
    # A HUNDRED GEARS, which is the reference's own number and the thing
    # the whole object is about. Fifty a side reads as the long dense
    # barrel in the photograph; seventeen read as a short fat roller, and
    # no amount of material work fixes a proportion.
    count = 50                         # per barrel
    # TOOTH TO TOOTH. Two spur gears mesh when their centres are one pitch
    # diameter apart - any less and they overlap, any more and there is a
    # visible gap where the drive is supposed to be.
    spacing = 0.4625 * 2

    parts, rates, placed = [], [], []
    for row in range(2):
        # LOCAL -Z RUNS TOWARD THE CAMERA once posed, measured rather than
        # assumed: built along +Z, gear one came out at the FAR end of the
        # barrel and the slow gears were the ones looming over the lens.
        # The fastest gear has to be the nearest, or the machine reads
        # backwards.
        #
        # THE ROWS ARE COPLANAR. They were offset half a plate along the
        # barrel to look interleaved, and two gears cannot mesh unless
        # they are in the same plane: offset axially AND spaced at the
        # meshing distance, every plate's teeth ran through the teeth of
        # the two plates opposite it. The solids intersected, and turning
        # them swept that intersection down the barrel - the clipping that
        # showed on both rows. The half-TOOTH rotational offset below is
        # what makes teeth sit in gaps; the axial offset only broke it.
        z0 = 0.0
        # Meshing rows counter-rotate, as two gears in mesh do.
        direction = 1.0 if row == 0 else -1.0
        for i in range(count):
            gear = build_legacy_gear(
                # Every other plate turned half a tooth, which is what mesh
                # looks like: a barrel of identically-aligned teeth reads as
                # an extruded shape rather than as separate wheels.
                # Half a tooth between the rows, so one row's teeth fall
                # into the other's gaps - and alternating along the barrel
                # as well, so a stack of identically-aligned plates does
                # not read as one extruded shape.
                spin=(math.pi / GEAR_TEETH) * ((i + row) % 2),
                pose=False, dressed=False, spokes=PLATE_SPOKES)
            # POSITION KEPT AS A TRANSFORM, not baked into the vertices.
            # `translate_to` applies the offset and leaves the origin at
            # the world origin, and an object turns about ITS ORIGIN -
            # which made every gear orbit a point metres away instead of
            # spinning on its shaft. Setting `origin_set` afterwards is
            # not good enough either: it uses the bounding box, and a
            # toothed disc's bounds centre is a hair off its axle, so the
            # gear turns eccentric and the loop cannot close.
            placed.append((gear, Vector((row * spacing, 0.0, z0 - pitch * i))))
            parts.append(gear)
            # ITS OWN RATE: gear i advances a third of what gear i-1 does,
            # so the near plates turn and the far ones visibly do not.
            # A plate repeats every single tooth, so its symmetry is 1.
            rates.append((gear, direction / (3 ** min(i, LEGACY_STAGES - 1)), 1))

        # THE END WHEEL on the near face, the one whose spokes you actually
        # read - everything behind it is teeth. Same size as every other
        # plate: looking down the barrel the near gears are already bigger
        # because they are nearer, and modelling them bigger as well
        # doubles an effect perspective gives for free.
        #
        # It turns WITH gear one, being on gear one's shaft. Left static it
        # read as the biggest wheel being the slowest, which is the exact
        # opposite of how the machine works.
        wheel = build_legacy_gear(pose=False, dressed=False, radius=1.0)
        placed.append((wheel, Vector((row * spacing, 0.0, pitch * 3.2))))
        parts.append(wheel)
        # Closed, so it repeats every tooth like the plates.
        rates.append((wheel, direction, 1))

        # The shaft everything on this row rides, stub ends proud of the
        # wheels the way the photograph has them.
        shaft = revolve([(0.05, 0.0), (0.05, pitch * (count + 9))])
        parts.append(translate_to(shaft, (row * spacing, 0.0, -pitch * (count + 3))))

    # THE STAND. Both photographs have one - a pair of dark plates the
    # shafts sit in and a bar along the floor between them - and without it
    # the barrel floats, which is the one thing the reference never looks
    # like. SMALL: the first attempt used full-height boxes and came out a
    # crate with a roller in it, hiding the second barrel entirely.
    length = pitch * (count + 6)
    for end_z in (pitch * 5.0, -length + pitch * 1.0):
        leg = cube(spacing * 1.45, 0.62, 0.07, base=False)
        parts.append(translate_to(leg, (spacing / 2, -0.31, end_z)))
    rail = cube(spacing * 1.5, 0.09, length + pitch * 6.0, base=False)
    parts.append(translate_to(rail, (spacing / 2, -0.60, -length / 2 + pitch * 2.0)))

    # POSED AS A GROUP, and each gear keeps its own origin so it can still
    # be turned about its own axle afterwards.
    material = legacy_machine_material()
    axle = Vector((0.0, 0.0, 1.0))
    for index, part in enumerate(parts):
        axle = pose_on_barrel_axis(part)
        finish(part, "legacy-part-%d" % index, material,
               bevel=0.004, smooth_angle=math.radians(16))
    # The same pose the parts were given, as a matrix, so a gear's centre
    # can be carried through it exactly rather than measured off bounds.
    view = Euler((math.pi / 2 - ELEVATION, 0.0, AZIMUTH)).to_quaternion()
    pose = (Matrix.Rotation(GEAR_AXIS_TILT, 4, view @ Vector((1, 0, 0)))
            @ Matrix.Rotation(GEAR_AXIS_TURN, 4, view @ Vector((0, 1, 0)))
            @ (-(view @ Vector((0, 0, -1)))).to_track_quat('Z', 'Y')
            .to_matrix().to_4x4())
    for gear, local in placed:
        gear.location = pose @ local
    # Each turning gear, its rate, its REST POSE, and the world axle it
    # turns about - all captured once, after posing, so a frame can be set
    # absolutely from the phase instead of nudged from wherever the last
    # frame left it.
    # EACH GEAR'S ORIGIN MOVED ONTO ITS OWN AXLE.
    #
    # `translate_to` bakes position into the vertices, so every part's
    # origin was still sitting at the world origin - and an object rotates
    # about ITS ORIGIN. Turning them therefore swung each gear around a
    # point metres away instead of spinning it on its shaft: the plates
    # swept through each other, which is the clipping, and the loop could
    # not close because an orbit that size is nothing like periodic with a
    # tooth pitch.
    # Every part shares one pose, so every gear shares one axle.
    spinners = [
        (gear, rate, symmetry, gear.rotation_euler.to_matrix().to_4x4(), axle)
        for gear, rate, symmetry in rates
    ]

    # THE COUNTERTOP. Every photograph of this machine is a black object on
    # a pale worktop, and that contrast is most of why it reads - against
    # the panel's own dark ground the barrel was a silhouette losing its
    # teeth. Kept out of the camera fit and running well past the frame,
    # because the panel uses this render as its whole background.
    pts = [p for part in parts for p in
           (part.matrix_world @ v.co for v in part.data.vertices)]
    span = max(max(p.x for p in pts) - min(p.x for p in pts),
               max(p.y for p in pts) - min(p.y for p in pts))
    lowest = min(p.z for p in pts)
    counter = cube(span * 40.0, span * 40.0, 0.30, base=False)
    bench = tier_material("legacy-counter", 0xe8e3da, 0xe8e3da, max_gain=1.0)
    _shader(bench).inputs["Roughness"].default_value = 0.62
    mottle(bench, _shader(bench).inputs["Base Color"].default_value[:3],
           scale=3.0, strength=0.05)
    finish(counter, "legacy-counter", bench, bevel=0.0)
    translate_to(counter, (0.0, 0.0, lowest - 0.175))

    return parts, spinners, counter


def spin_legacy_machine(spinners, phase: float):
    """Turns every gear to its position at `phase` of one tooth pitch.

    Absolute, not incremental: each gear's rotation is SET from the phase
    rather than added to, so a frame can be re-rendered without the machine
    drifting, and rounding cannot accumulate across a loop.
    """
    pitch_angle = 2 * math.pi / GEAR_TEETH
    for gear, rate, symmetry, rest, axis in spinners:
        # Teeth this gear covers over the loop, measured in ITS OWN repeat.
        # A plate repeats every tooth; a six-spoke end wheel every five. A
        # gear that would finish part way through its repeat is held, or it
        # snaps back at the wrap and the whole barrel clips.
        steps = MACHINE_LOOP_PITCHES * abs(rate) / symmetry
        if abs(steps - round(steps)) > 1e-6:
            turned = 0.0
        else:
            turned = pitch_angle * phase * MACHINE_LOOP_PITCHES * rate
        gear.rotation_euler = (
            Matrix.Rotation(turned, 4, axis) @ rest
        ).to_euler()



# The machine's scene, kept between calls so the hundred gears are built
# once and only re-posed afterwards.
_LEGACY_SCENE = {}


def setup_legacy_machine(lens: float = 35.0, fit: float = 0.92):
    """Builds the machine, places the camera, and holds on to both.

    Call once, then `render_legacy_frame` per frame. The camera is the one
    deliberate exception to the game's orthographic rule: this asset is a
    photograph of an object, and without convergence a hundred identical
    plates render as a perfectly parallel tube with no length to it.
    """
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH':
            bpy.data.objects.remove(ob, do_unlink=True)
    cam = build_camera()
    build_lights()
    configure_render()

    parts, spinners, counter = build_legacy_machine()

    rot = cam.matrix_world.to_quaternion()
    forward = rot @ Vector((0, 0, -1))
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    pts = [p for part in parts for p in
           (part.matrix_world @ v.co for v in part.data.vertices)]
    xs = [p.dot(right) for p in pts]
    ys = [p.dot(up) for p in pts]
    depth = sum(p.dot(forward) for p in pts) / len(pts)
    centre = (right * ((min(xs) + max(xs)) / 2)
              + up * ((min(ys) + max(ys)) / 2)
              + forward * depth)
    half = max(max(xs) - min(xs), max(ys) - min(ys)) / 2

    cam.data.type = 'PERSP'
    cam.data.lens = lens
    cam.location = centre - forward * (
        (half * fit) * lens / (cam.data.sensor_width / 2))
    bpy.context.view_layer.update()

    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = 512
    # OPAQUE: the worktop is the image, and a transparent film would throw
    # away the contrast it was added for.
    sc.render.film_transparent = False

    _LEGACY_SCENE.clear()
    _LEGACY_SCENE.update(cam=cam, parts=parts, spinners=spinners,
                         counter=counter)
    return len(parts)


def render_legacy_frame(index: int, out_dir: str, frames: int = MACHINE_FRAMES):
    """One frame of the loop, from the scene `setup_legacy_machine` left."""
    scene = _LEGACY_SCENE
    if not scene:
        raise RuntimeError("call setup_legacy_machine() first")
    os.makedirs(out_dir, exist_ok=True)
    spin_legacy_machine(scene["spinners"], index / frames)
    bpy.context.view_layer.update()
    keep = set(scene["parts"]) | {scene["counter"]}
    for other in bpy.data.objects:
        if other.type == 'MESH':
            other.hide_render = other not in keep
    bpy.context.scene.render.filepath = os.path.join(out_dir, "%02d.png" % index)
    bpy.ops.render.render(write_still=True)
    return index


def pack_legacy_gear_sheet(frame_dir: str, out_path: str):
    """The sixteen frames into one 512 square, four by four.

    A sheet rather than sixteen files: Phaser mipmaps a power-of-two texture
    and does not mipmap sixteen NPOT ones, and eight gears turning at eight
    different rates would otherwise be eight textures being swapped every
    frame. The frames are deleted afterwards - they are an intermediate,
    not an asset.
    """
    # Pillow is not part of Blender's bundled Python on every install, so a
    # missing import leaves the frames on disk for tools/ to pack rather
    # than failing the whole render.
    try:
        from PIL import Image
    except ImportError:
        print("Pillow unavailable in Blender; frames left in", frame_dir)
        return
    frames = [Image.open(os.path.join(frame_dir, "%02d.png" % i)).convert("RGBA")
              for i in range(GEAR_FRAMES)]
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * 4, h * 4), (0, 0, 0, 0))
    for index, frame_image in enumerate(frames):
        sheet.paste(frame_image, ((index % 4) * w, (index // 4) * h), frame_image)
    sheet.save(out_path)
    for image in frames:
        image.close()
    shutil.rmtree(frame_dir, ignore_errors=True)
    print("packed legacy gear sheet", sheet.size)


def render_face_on_gear(cam, out_path: str):
    """One closed gear, square to the camera, for the panel to spin.

    This replaces the eighteen full-screen frames of the whole machine.
    Those cost 18MB of texture rebound thirty times a second to show four
    gears moving out of fifty; one 512 sprite, drawn once per gear and
    rotated, shows ALL of them at their true ratios and reacts to an
    upgrade in the same frame it is bought.
    """
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH':
            bpy.data.objects.remove(ob, do_unlink=True)
    # SPOKED AGAIN. The closed web was only ever forced by the frame
    # loop - a six-spoke wheel repeats every sixty degrees, which is what
    # stopped the pre-rendered loop closing. Rotating the sprite live has
    # no loop to close, so the open wheel comes back.
    gear = build_legacy_gear(pose=None, spokes=GEAR_SPOKES_OPEN,
                             dressed=False)

    # TWO MATERIALS, split at the rim. The angled barrel read well because
    # its teeth caught the light against a darker body; rendered face on
    # in one flat dark grey the whole wheel became a silhouette and the
    # spokes disappeared into it. The teeth take a light steel, the web
    # and hub stay near-black, and the wheel is legible at any size.
    rim = tier_material("legacy-gear-rim", 0x9aa1a9, 0x9aa1a9, max_gain=1.0)
    _shader(rim).inputs["Metallic"].default_value = 0.80
    _shader(rim).inputs["Roughness"].default_value = 0.34
    body = tier_material("legacy-gear-body", 0x2b2f34, 0x2b2f34, max_gain=1.0)
    _shader(body).inputs["Metallic"].default_value = 0.55
    _shader(body).inputs["Roughness"].default_value = 0.45
    finish(gear, "legacy-gear", rim, bevel=0.006,
           smooth_angle=math.radians(16))
    gear.data.materials.append(body)
    # Assigned by RADIUS, after the bevel: a face belongs to the rim if it
    # sits outside the root circle, and to the body if it does not.
    root_radius = 0.425
    for poly in gear.data.polygons:
        centre = poly.center
        poly.material_index = 0 if math.hypot(centre.x, centre.y) > root_radius * 0.97 else 1
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.film_transparent = True
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    render(gear, cam, out_path)
    print("rendered face-on gear")


def render_legacy_gear(cam, out_dir: str):
    """The gear's rotation loop, one PNG per frame.

    CENTRED ON THE HUB, not on the bounding box. Every other render in this
    file aims at the middle of the silhouette, which is right for an object
    sitting on a tile - but this sprite gets SPUN by the panel, and a sprite
    rotates about its own centre. Framed on its bounds, the gear's axis sits
    off to one side of the image and the whole thing wobbles round a point
    that is not the axle.

    Framed ONCE, off frame zero, and every frame rendered at that same scale
    and position: a toothed wheel has a different silhouette at every angle,
    so per-frame framing would make it breathe as it turned.
    """
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = 128
    pitch = 2 * math.pi / GEAR_TEETH
    rot = cam.matrix_world.to_quaternion()
    forward = rot @ Vector((0, 0, -1))
    location, half = None, 0.0
    for index in range(GEAR_FRAMES):
        for ob in list(bpy.data.objects):
            if ob.type == 'MESH':
                bpy.data.objects.remove(ob, do_unlink=True)
        gear = build_legacy_gear(pitch * index / GEAR_FRAMES)
        if location is None:
            bpy.context.view_layer.update()
            # The middle of the AXLE, in world space: the gear is modelled
            # around the origin and extruded up its own local z.
            hub = gear.matrix_world @ Vector((0.0, 0.0, GEAR_THICKNESS / 2))
            location = hub - forward * 20.0
            half = frame(gear, cam)[1]
        for other in bpy.data.objects:
            if other.type == 'MESH':
                other.hide_render = (other is not gear)
        cam.location = location
        bpy.context.view_layer.update()
        cam.data.ortho_scale = half * 2 * MARGIN
        sc.render.filepath = os.path.join(out_dir, "%02d.png" % index)
        bpy.ops.render.render(write_still=True)
        print("rendered legacy gear frame", index)


# ---- scene, framing, render ------------------------------------------------

def camera_forward() -> Vector:
    """Where the camera looks, derived from the angles rather than restated."""
    return Euler((math.pi / 2 - ELEVATION, 0.0, AZIMUTH)).to_quaternion() @ Vector((0, 0, -1))


def build_camera():
    data = bpy.data.cameras.get("ItemCam") or bpy.data.cameras.new("ItemCam")
    data.type = 'ORTHO'
    cam = bpy.data.objects.get("ItemCam")
    if cam is None:
        cam = bpy.data.objects.new("ItemCam", data)
        bpy.context.collection.objects.link(cam)
    cam.data = data
    cam.rotation_euler = (math.pi / 2 - ELEVATION, 0.0, AZIMUTH)
    # matrix_world does not reflect this until the depsgraph runs, so any
    # check against it here would be reading last frame's camera.
    bpy.context.view_layer.update()
    bpy.context.scene.camera = cam
    return cam


def build_lights():
    # 450/180 left every tier at roughly 0.4x its own base colour. These sit
    # them at their palette value, which matters because the board shows them
    # against dark glass.
    for name, loc, power, size in (
        # Smaller and brighter than it was. A four-unit lamp on a piece under
        # a unit across is a wall of light: it wraps the whole top and gives a
        # soft gradient, which reads as matte no matter how glossy the surface
        # is. Gloss is a SMALL bright reflection with a hard edge, so the lamp
        # has to be small enough to have one.
        ("KeyLight", (-3, -4, 6), 2600, 1.6),
        ("FillLight", (4, 1, 3), 520, 3),
    ):
        data = bpy.data.lights.get(name) or bpy.data.lights.new(name, type='AREA')
        data.type, data.energy, data.size = 'AREA', power, size
        # DISC lamps, not squares. A polished surface mirrors the light's own
        # outline, so a square area lamp puts a white RECTANGLE on the face -
        # you can read the studio in the reflection. A disc leaves a round
        # highlight, which is what a lit object is supposed to have. Same
        # size, same power, same position: only the shape changes.
        data.shape = 'DISK'
        ob = bpy.data.objects.get(name)
        if ob is None:
            ob = bpy.data.objects.new(name, data)
            bpy.context.collection.objects.link(ob)
        ob.data = data
        ob.location = loc
        ob.rotation_euler = (-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

    # A little sky, so faces turned away from both lamps keep their hue
    # instead of going to black and losing the tier's colour down there.
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()

    # TWO ENVIRONMENTS, chosen per ray.
    #
    # A transmissive stone is lit by whatever its refracted rays find, and with
    # a transparent film those rays escape into the world - so against a 0.055
    # background every gem rendered as a black lump, which is the opposite of
    # the problem transmission was added to solve. Turning the world up instead
    # would flood the rocks and force the whole calibration to be redone.
    #
    # So diffuse and camera rays keep the dim sky, and transmission rays see a
    # bright one. Nothing but the inside of a gem can tell the difference.
    dim = nodes.new("ShaderNodeBackground")
    dim.inputs[0].default_value = (0.055, 0.052, 0.05, 1.0)

    # A STUDIO FOR THE TRANSMISSION RAYS TO FIND.
    #
    # A cut stone has no appearance of its own - what you see is its
    # surroundings, folded and multiplied by its facets. Against a FLAT sky
    # every facet returns the same value, so the stone comes back evenly
    # bright and reads as polished metal, which is exactly what it looked
    # like. The variation is the whole point: jewellery renders put a stone in
    # a lit box for this reason, and the bright and dark bands of that box are
    # what a facet has to catch and miss.
    #
    # So the transmission sky is banded by ray height: a dark floor, a bright
    # horizon band standing in for a softbox, a mid sky and a bright zenith.
    coords = nodes.new("ShaderNodeTexCoord")
    axis = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Generated"], axis.inputs["Vector"])
    bands = nodes.new("ShaderNodeValToRGB")
    # SOFT-EDGED, AND MORE OF THEM.
    #
    # These were three hard constant bands, which is fine on a flat slab and
    # wrong on anything curved: a curved surface sweeps the whole sky in a
    # short distance, so three walls reflect as three flat stripes wrapping
    # the object - lines painted on a pebble, which is the low-poly look.
    #
    # A real room has many surfaces at many brightnesses, and their edges are
    # soft because nothing has an infinitely sharp boundary. Linear
    # interpolation with stops close together keeps the edge a reflection
    # needs while giving it somewhere to travel, and six of them mean a curve
    # picks up variety rather than a stripe.
    bands.color_ramp.interpolation = 'LINEAR'
    stops = bands.color_ramp.elements
    stops[0].position = 0.0
    # The floor stays NEAR BLACK, and that is deliberate.
    #
    # Lifting it to 0.20 to rescue one dark stone washed out every glossy tier
    # at once - the same box is reflected by the polished slabs and refracted
    # by the gems, so a change made for one is a change made to all nine. The
    # darks are what the bright bands are bright AGAINST.
    stops[0].color = (0.02, 0.02, 0.03, 1.0)
    stops[1].position = 0.26
    stops[1].color = (0.05, 0.05, 0.07, 1.0)
    for position, value in ((0.33, (1.0, 1.0, 1.0)),      # the softbox
                            (0.44, (0.90, 0.92, 1.0)),
                            (0.50, (0.09, 0.10, 0.13)),   # its edge
                            (0.63, (0.28, 0.30, 0.36)),
                            (0.78, (0.72, 0.76, 0.88)),   # a second, dimmer one
                            (0.88, (0.30, 0.32, 0.38)),
                            (1.0, (0.14, 0.15, 0.18))):
        element = stops.new(position)
        element.color = (*value, 1.0)
    links.new(axis.outputs["Z"], bands.inputs["Fac"])

    bright = nodes.new("ShaderNodeBackground")
    # Bright enough to be worth reflecting. A coat returns only a few per
    # cent of what it sees, so a dim box gives a dim countertop.
    bright.inputs[1].default_value = 2.2
    links.new(bands.outputs["Color"], bright.inputs["Color"])

    # THE STUDIO IS FOR REFLECTIONS TOO, not only refractions.
    #
    # A polished surface has no look of its own either - it shows you the
    # room. Against a 0.055 sky, dropping roughness just made the stone DARK
    # with one small lamp blob on it, which is why "polished" kept coming out
    # as "dull with a highlight" however low the number went. Glossy rays see
    # the same lit box the transmission rays do, so a countertop finish has
    # bands to reflect and actually reads as one.
    path = nodes.new("ShaderNodeLightPath")
    glossy_or_transmission = nodes.new("ShaderNodeMath")
    glossy_or_transmission.operation = 'MAXIMUM'
    links.new(path.outputs["Is Transmission Ray"], glossy_or_transmission.inputs[0])
    links.new(path.outputs["Is Glossy Ray"], glossy_or_transmission.inputs[1])
    mix = nodes.new("ShaderNodeMixShader")
    out = nodes.new("ShaderNodeOutputWorld")
    links.new(glossy_or_transmission.outputs["Value"], mix.inputs["Fac"])
    links.new(dim.outputs["Background"], mix.inputs[1])
    links.new(bright.outputs["Background"], mix.inputs[2])
    links.new(mix.outputs["Shader"], out.inputs["Surface"])


def configure_render():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    # GPU IF THERE IS ONE, and set here rather than left to the session.
    #
    # The scene's device is live state that no amount of editing this file
    # changes - it sat on CPU through every render in this project, at
    # around fourteen seconds a frame for the machine, because nothing ever
    # asked for the card. Enabling the backend's devices is required too:
    # a device that is present but not `use`d is not used.
    prefs = bpy.context.preferences.addons.get("cycles")
    if prefs is not None:
        backend = prefs.preferences
        for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
            try:
                backend.compute_device_type = kind
            except TypeError:
                continue          # not built for this backend
            backend.get_devices()
            if any(d.type == kind for d in backend.devices):
                for device in backend.devices:
                    device.use = device.type == kind
                sc.cycles.device = 'GPU'
                break
        else:
            sc.cycles.device = 'CPU'
    # Transmission needs both: 16 samples leaves a gem full of fireflies, and
    # the default bounce limits cut the light off before it has passed through
    # a stone and back out, which renders a sapphire as a black lump.
    sc.cycles.samples = 128
    sc.cycles.use_denoising = True
    sc.cycles.transmission_bounces = 12
    sc.cycles.max_bounces = 16
    sc.cycles.blur_glossy = 0.6
    # NOT film_transparent_glass. That flag makes glass ignore the world and
    # come back cleanly transparent, which is Blender's answer to the fact
    # that refraction cannot be written into an alpha channel - correct when
    # you intend to composite something behind the glass later, and wrong
    # here. These are sprites dropped onto a board: the stone has to carry its
    # own interior, so it must refract the studio rather than the board it
    # will eventually sit on.
    sc.cycles.film_transparent_glass = False
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = RESOLUTION
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'


def frame(ob, cam):
    """Where to aim the camera for this object, and how wide it needs to be.

    Split out of `render` so a whole family can be MEASURED before any of it
    is rendered, which is what lets every tier share one scale.
    """
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = ob.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    pts = [ob.matrix_world @ v.co for v in mesh.vertices]
    evaluated.to_mesh_clear()

    rot = cam.matrix_world.to_quaternion()
    forward = rot @ Vector((0, 0, -1))
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    xs = [p.dot(right) for p in pts]
    ys = [p.dot(up) for p in pts]
    depth = sum(p.dot(forward) for p in pts) / len(pts)

    # AIMED AT THE BOUNDING BOX'S CENTRE, not at the average of the vertices.
    # A mean is pulled towards whatever part of the model carries the most
    # geometry - the vault's dial, spokes and trim are all on one face - and
    # an off-centre aim costs clearance on every side.
    centre = (right * ((min(xs) + max(xs)) / 2)
              + up * ((min(ys) + max(ys)) / 2)
              + forward * depth)
    # Measured on the CAMERA'S axes. A world bounding box says nothing about
    # how much of a rotated frame an object fills.
    half = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
    return centre - forward * 20.0, half


def render(ob, cam, path: str, half: float = 0.0):
    for other in bpy.data.objects:
        if other.type == 'MESH':
            other.hide_render = (other is not ob)

    location, own = frame(ob, cam)
    cam.location = location
    # Required. Without it matrix_world is a frame stale and every tier after
    # the first is framed against the PREVIOUS tier's camera position.
    bpy.context.view_layer.update()
    cam.data.ortho_scale = (half or own) * 2 * MARGIN

    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def archive(path: str = ""):
    """Builds EVERY family into one scene and saves it as a .blend.

    `main` deletes the meshes before each family, so the file left open after
    a render holds whatever was built last - which is not an archive, and
    quietly looked like one. This lays all of them out in a row instead, so
    there is a real editable source file to open, poke at and save over.

    The script is still the source of truth: everything here is rebuilt from
    it on every run, and the .blend is a convenience for looking at geometry
    by hand. Editing the .blend alone will be overwritten by the next render.
    """
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    build_camera()
    build_lights()
    configure_render()

    builders = [("wood", build_wood), ("mineral", build_mineral),
                ("water", build_water),
                ("event-token", build_event_token),
                ("credit-mark", build_chip_coin),
                ("gem-mark", build_chip_gem)]
    for kind in CURRENCY_HEX:
        builders.append((kind, (lambda k: lambda: currency_family(k))(kind)))

    for row, (family, build) in enumerate(builders):
        for tier, ob in sorted(build().items()):
            # Spread out so nothing overlaps and every piece can be clicked.
            ob.location.x += tier * 2.2
            ob.location.y += row * 2.2
            print("archived", family, "tier", tier)

    bpy.ops.wm.save_as_mainfile(
        filepath=path or os.path.join(root, "tools", "blender", "items.blend"))


def main(only: str = ""):
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)

    cam = build_camera()
    build_lights()
    configure_render()

    families = [("wood", build_wood), ("mineral", build_mineral),
                ("water", build_water),
                ("event-token", build_event_token),
                ("credit-mark", build_chip_coin),
                ("gem-mark", build_chip_gem)]
    for kind in CURRENCY_HEX:
        families.append((kind, (lambda k: lambda: currency_family(k))(kind)))
    for family, build in families:
        if only and family != only:
            continue
        for ob in list(bpy.data.objects):
            if ob.type == 'MESH':
                bpy.data.objects.remove(ob, do_unlink=True)
        family_dir = os.path.join(root, "public", "assets", "items", family)
        os.makedirs(family_dir, exist_ok=True)
        sc = bpy.context.scene
        sc.render.resolution_x = sc.render.resolution_y = FAMILY_RESOLUTION.get(
            family, RESOLUTION)
        tiers = sorted(build().items())
        # ONE SCALE FOR THE WHOLE FAMILY - but only where the family was
        # modelled to be compared. Fitting each tier to the canvas on its own
        # throws the ladder away: a single coin and a strongbox come out the
        # same size, so a five-coin stack reads as bigger than the vault it
        # merges into.
        #
        # Wood and mineral are NOT on it. Their tiers were modelled at wildly
        # different unit scales - the knots at a radius of 3 against planks
        # under an eighth of that - so a shared frame draws tiers one to
        # seven at under a sixth of their tile. Putting them on it needs
        # every tier resized first, which is a separate job.
        shared = family not in ("wood", "mineral")
        widest = max(frame(ob, cam)[1] for _, ob in tiers) if shared else 0.0
        for tier, ob in tiers:
            render(ob, cam, os.path.join(family_dir, "%d.png" % tier), widest)
            print("rendered", family, "tier", tier)

    # THE SOURCES, written somewhere else and framed on their own. A
    # dispenser is not a member of an item ladder - it never sits beside an
    # item for comparison - so it takes the whole canvas at every tier
    # rather than a shared family scale.
    sources = [("water", build_water_source)]
    for family, build in sources:
        # Addressed as "source-water", so `main("water")` still means the
        # twelve items and cannot quietly re-render the dispensers too.
        if only and only != "source-" + family:
            continue
        for ob in list(bpy.data.objects):
            if ob.type == 'MESH':
                bpy.data.objects.remove(ob, do_unlink=True)
        source_dir = os.path.join(root, "public", "assets", "sources", family)
        os.makedirs(source_dir, exist_ok=True)
        sc = bpy.context.scene
        sc.render.resolution_x = sc.render.resolution_y = 512
        tiers = sorted(build().items())
        widest = max(frame(ob, cam)[1] for _, ob in tiers)
        for tier, ob in tiers:
            render(ob, cam, os.path.join(source_dir, "%d.png" % tier), widest)
            print("rendered source", family, "tier", tier)

    if only == "legacy-machine":
        # DRIVEN FROM OUTSIDE, one frame per call. The whole loop in a
        # single call is what kept killing Blender, and a render this
        # heavy has no business holding one connection open for sixteen
        # of them. See `setup_legacy_machine` and `render_legacy_frame`.
        print("use setup_legacy_machine() then render_legacy_frame(i) per call")

    if not only or only == "legacy-face-gear":
        for ob in list(bpy.data.objects):
            if ob.type == 'MESH':
                bpy.data.objects.remove(ob, do_unlink=True)
        build_lights()
        configure_render()
        render_face_on_gear(cam, os.path.join(root, "public", "assets",
                                              "machine", "gear.png"))

    if not only or only == "legacy-gear":
        for ob in list(bpy.data.objects):
            if ob.type == 'MESH':
                bpy.data.objects.remove(ob, do_unlink=True)
        render_legacy_gear(cam, os.path.join(root, "public", "assets", "machine",
                                             "gear-frames"))
        pack_legacy_gear_sheet(
            os.path.join(root, "public", "assets", "machine", "gear-frames"),
            os.path.join(root, "public", "assets", "machine", "legacy-gear.png"))

    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            ob.hide_render = False


if __name__ == "__main__":
    main()
