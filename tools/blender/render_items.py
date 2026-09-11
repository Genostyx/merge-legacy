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
RESOLUTION = 384

# Screen-horizontal in world terms, for this camera. Anything that has to
# splay left and right on screen leans along this, NOT along +X and +Y - those
# are opposite axes in the world but fall to the SAME side of the frame here,
# which is what turned the tier-five V into a single wedge twice.
SCREEN_RIGHT = Vector((1, 1, 0)).normalized()
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

BEVEL_WIDTH = 0.016      # a sawn arris, not a moulded edge
BEVEL_SEGMENTS = 2
SMOOTH_ANGLE = math.radians(30)
STACK_GAP = 0.006        # so stacked planks keep four edges each


def srgb_to_linear(channel: int) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def tier_material(name: str, want: int, measured: int):
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
        rgb.append(min(1.0, base * min(3.0, max(0.4, gain))))
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


def grain(mat, base_rgb, contrast=0.12, scale=(1.0, 26.0, 5.0)):
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
    bump.inputs["Strength"].default_value = 0.12
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
    dark = [max(0.0, c * (1.0 - strength)) for c in base_rgb]
    light = [min(1.0, c * (1.0 + strength)) for c in base_rgb]
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

    out[1] = merge([
        cube(0.62, 0.30, 0.24),
        cube(0.20, 0.17, 0.13, loc=(-0.10, -0.03, 0.24)),
    ])
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
    # Slate is a SPLIT PLATE, which is a broken chunk that happens to be
    # flat - so it is a hull like the rubble, pressed down. plate() drew a
    # tidy hexagon and the bevel rounded its corners into a lozenge; a hull
    # gives the straight irregular edges a cleaved sheet actually has.
    out[1] = rock(0.82, 0.055, seed=11, points=9, jitter=0.20)
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
            mottle(material, base,
                   scale=9.0 if tier < 4 else 6.0,
                   strength=0.20 if tier < 4 else 0.11)
            weathered(material, strength=0.34 if tier < 4 else 0.12)
            if tier == 4:
                polished(material)
        finish(ob, "mineral%d" % tier, material, bevel=bevel, smooth_angle=smooth,
               subdivide=2 if tier == 4 else 0)
    return out


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


def render(ob, cam, path: str):
    for other in bpy.data.objects:
        if other.type == 'MESH':
            other.hide_render = (other is not ob)

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = ob.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    pts = [ob.matrix_world @ v.co for v in mesh.vertices]
    evaluated.to_mesh_clear()

    forward = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))
    cam.location = (sum(pts, Vector((0, 0, 0))) / len(pts)) - forward * 20.0
    # Required. Without it matrix_world is a frame stale and every tier after
    # the first is framed against the PREVIOUS tier's camera position.
    bpy.context.view_layer.update()

    # Framed on the CAMERA'S axes. A world bounding box says nothing about how
    # much of a rotated frame an object fills, and framing off it is why
    # exports once ranged from 35 to 74 percent of their canvas.
    inv = cam.matrix_world.inverted()
    local = [inv @ p for p in pts]
    half = max(max(abs(p.x) for p in local), max(abs(p.y) for p in local))
    cam.data.ortho_scale = half * 2 * MARGIN

    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main(only: str = ""):
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)

    cam = build_camera()
    build_lights()
    configure_render()

    for family, build in (("wood", build_wood), ("mineral", build_mineral)):
        if only and family != only:
            continue
        for ob in list(bpy.data.objects):
            if ob.type == 'MESH':
                bpy.data.objects.remove(ob, do_unlink=True)
        family_dir = os.path.join(root, "public", "assets", "items", family)
        os.makedirs(family_dir, exist_ok=True)
        for tier, ob in sorted(build().items()):
            render(ob, cam, os.path.join(family_dir, "%d.png" % tier))
            print("rendered", family, "tier", tier)

    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            ob.hide_render = False


if __name__ == "__main__":
    main()
