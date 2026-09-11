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
RESOLUTION = 256

# Families that need more than the default, and why.
#
# The board's items are chunky solids - planks, blocks, rocks - and 256 is
# ample. These two are seen FACE ON and read by fine detail: the token's
# crown is thin diagonal rays, which are the first thing to break up. 512,
# still a power of two so they mipmap properly.
FAMILY_RESOLUTION = {"event-token": 512, "credit-mark": 512}

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
    "currency-gem": {1: 0x9d70c2, 2: 0xaa7dca, 3: 0xb789d2,
                     4: 0xc497db, 5: 0xd2a6e3},
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
}

CURRENCY_RGB = {
    kind: {tier: tuple(((c >> shift) & 255) / 255.0 for shift in (16, 8, 0))
           for tier, c in tiers.items()}
    for kind, tiers in CURRENCY_HEX.items()
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
    swing = Matrix.Rotation(math.radians(-30), 4, view @ Vector((0, 1, 0)))
    ob.rotation_euler = (
        swing @ ob.rotation_euler.to_matrix().to_4x4()
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
            pieces.append(translate_to(facing_profile(piece),
                                       beside(right, back)))
        out[tier] = stack(pieces)
    return out


def dress_currency(kind: str, out):
    """The material, shared by all three chains."""
    for tier, ob in out.items():
        measured = CURRENCY_MEASURED.get(kind, CURRENCY_HEX[kind])
        material = tier_material("%s-tier-%d" % (kind, tier),
                                 CURRENCY_HEX[kind][tier], measured[tier],
                                 max_gain=1.45)
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
            # tint_strength stays 0: `absorbing` below whitens the surface
            # on purpose and moves all the colour into the volume, so any
            # tint set here is overwritten. Density is the only lever on this
            # stone's value.
            gemstone(material, ior=1.75, roughness=0.06, tint_strength=0.0)
            # DENSITY 2.2, down from 9.0. Absorption is how much colour the
            # light loses crossing the stone, so on a slab this thick 9 was
            # eating nearly all of it - the gems averaged 0x5b567c against
            # the bolts' 0x89b6d5 and read as dark lumps on the board's
            # glass. Lower density keeps the thick-is-deeper gradient that
            # makes it a gem and stops it going black in the middle.
            absorbing(material, CURRENCY_RGB[kind][tier], density=2.2)
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
        Matrix.Rotation(math.radians(-30), 4, view @ Vector((0, 1, 0)))
        @ token.rotation_euler.to_matrix().to_4x4()
    ).to_euler()

    material = tier_material("event-token", EVENT_TOKEN_HEX, EVENT_TOKEN_HEX)
    shader = _shader(material)
    # 0.22 keeps a real metallic sheen. Roughing the surface to 0.38, or to
    # the chip coin's 0.541, also hides the banding - but it hides it by
    # throwing away the reflection that makes metal look like metal, and the
    # banding was never a reflection problem. It is the rim chamfer's facets
    # being picked out one by one, which is fixed below in the geometry so
    # the finish does not have to pay for it.
    shader.inputs["Metallic"].default_value = 1.0
    shader.inputs["Roughness"].default_value = 0.22
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
    token.modifiers["Bevel"].segments = 6
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

    facing_camera(body)
    view = Euler((math.pi / 2 - ELEVATION, 0.0, AZIMUTH)).to_quaternion()
    body.rotation_euler = (
        Matrix.Rotation(math.radians(-30), 4, view @ Vector((0, 1, 0)))
        @ body.rotation_euler.to_matrix().to_4x4()
    ).to_euler()

    measured = CURRENCY_MEASURED["currency-credit"][1]
    material = tier_material("credit-mark", CURRENCY_HEX["currency-credit"][1],
                             measured, max_gain=1.45)
    shader = _shader(material)
    # Same finish as the event token. 0.541 was the right call while the rim
    # was banding, because roughness was the only lever that hid it - but it
    # hid it by throwing away the reflection that makes metal read as metal.
    # With the chamfer fixed above the banding is gone from the geometry, so
    # the sheen can come back.
    shader.inputs["Metallic"].default_value = 1.0
    shader.inputs["Roughness"].default_value = 0.22
    finish(body, "credit-mark", material, bevel=0.0015,
           smooth_angle=math.radians(20))
    return {1: body}


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

    builders = [("wood", build_wood), ("mineral", build_mineral)]
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
                ("event-token", build_event_token),
                ("credit-mark", build_chip_coin)]
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

    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            ob.hide_render = False


if __name__ == "__main__":
    main()
