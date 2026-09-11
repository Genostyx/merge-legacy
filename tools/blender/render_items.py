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
    6: 0xb3818a, 7: 0xafbac1, 8: 0x40566e, 9: 0x5d7389,
}
# Measured off the first pass, same as wood's.
MINERAL_MEASURED = {
    1: 0x616e79, 2: 0x6d7983, 3: 0x5d6974, 4: 0x6d7881, 5: 0x838b91,
    6: 0x8d6e73, 7: 0x8d9497, 8: 0x485e71, 9: 0x71808c,
}

BEVEL_WIDTH = 0.016      # a sawn arris, not a moulded edge
BEVEL_SEGMENTS = 2
SMOOTH_ANGLE = math.radians(30)
STACK_GAP = 0.006        # so stacked planks keep four edges each


def srgb_to_linear(channel: int) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def tier_material(name: str, want: int, measured: int):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    rgb = []
    for shift in (16, 8, 0):
        base = srgb_to_linear((want >> shift) & 255)
        gain = ((want >> shift) & 255) / max(1, (measured >> shift) & 255)
        rgb.append(min(1.0, base * min(3.0, max(0.4, gain))))
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.62
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.35
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


def finish(ob, name: str, material, bevel: float = BEVEL_WIDTH):
    mod = ob.modifiers.new("Bevel", 'BEVEL')
    mod.width, mod.segments = bevel, BEVEL_SEGMENTS
    mod.limit_method, mod.angle_limit = 'ANGLE', SMOOTH_ANGLE
    mod.use_clamp_overlap = True
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_auto_smooth(angle=SMOOTH_ANGLE)
    ob.name = name
    ob.data.materials.clear()
    ob.data.materials.append(material)
    return ob


def rock(width: float, height: float, seed: int, jitter: float = 0.26):
    """An irregular angular chunk, sitting on z=0.

    A low icosphere pushed about: few enough faces that every one reads as a
    flat plane, which is the difference between STONE and a sphere. Wood is
    milled and rectilinear; if mineral were built from boxes too, the two
    families would differ only in hue - the exact failure FAMILIES_ROADMAP
    records for the event chain.
    """
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.5)
    ob = bpy.context.active_object
    rng = random.Random(seed)
    for v in ob.data.vertices:
        v.co *= 1.0 + rng.uniform(-jitter, jitter)
        v.co.x *= width
        v.co.y *= width * 0.86
        v.co.z *= height
    low = min(v.co.z for v in ob.data.vertices)
    for v in ob.data.vertices:
        v.co.z -= low
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
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


def gem(radius: float, crown: float, pavilion: float, sides: int = 8, table: float = 0.52):
    """A cut stone: flat table, sloped crown, pavilion to a point.

    The top of the mineral ladder is the one place the family stops being
    found rock and becomes something CUT, and a faceted silhouette is what
    says so at board size - not a shinier material on the same lump.
    """
    mesh = bpy.data.meshes.new("gem")
    bm = bmesh.new()
    girdle = [bm.verts.new((math.cos(2 * math.pi * i / sides) * radius,
                            math.sin(2 * math.pi * i / sides) * radius, pavilion))
              for i in range(sides)]
    top = [bm.verts.new((math.cos(2 * math.pi * i / sides) * radius * table,
                         math.sin(2 * math.pi * i / sides) * radius * table,
                         pavilion + crown))
           for i in range(sides)]
    point = bm.verts.new((0.0, 0.0, 0.0))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((girdle[i], girdle[j], top[j], top[i]))
        bm.faces.new((girdle[j], girdle[i], point))
    bm.faces.new(tuple(top))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("gem", mesh)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    return ob


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
        finish(ob, "wood%d" % tier,
               tier_material("wood-tier-%d" % tier, WOOD_HEX[tier], WOOD_MEASURED[tier]))

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

    # 1-3: found rock. Count carries the first two merges, exactly as the
    # plank tiers do, but the pieces are angular rather than milled.
    out[1] = rock(0.72, 0.20, seed=11)
    out[2] = stack([
        rock(0.52, 0.30, seed=21),
        translate_to(rock(0.40, 0.24, seed=22), beside(0.34, -0.10)),
    ])
    out[3] = stack([
        translate_to(rock(0.34, 0.26, seed=30 + i), beside(right, back))
        for i, (right, back) in enumerate(
            ((-0.34, 0.06), (0.10, -0.20), (0.38, 0.14), (-0.06, 0.26))
        )
    ])

    # 4-5: dressed stone. Still irregular at 4, squared and chamfered at 5 -
    # the tier where the family stops being found and starts being worked.
    out[4] = rock(0.62, 0.42, seed=41, jitter=0.10)
    # A DRESSED DRUM, not a bare cube. A cube is the wood language - tier
    # four of that chain is one - and a heavy chamfer on a cube is still
    # unmistakably a cube. An eight-sided plinth reads as stone someone has
    # worked, and shares no silhouette with anything in wood.
    out[5] = crystal(radius=0.38, height=0.46, tip=0.0, sides=8, taper=0.92)

    # 6-7: crystal. 6 is a single blunt column, 7 a cluster of three - more
    # points, taller, which is the silhouette escalation.
    out[6] = crystal(radius=0.30, height=0.44, tip=0.26, sides=6)
    # The cluster has to be BIGGER than the single column it merges from -
    # first pass made it smaller and the ladder shrank at tier seven.
    # Spread WIDE. The first attempt sat them close enough to overlap and the
    # three read as one white mass - the count is the whole difference between
    # this tier and the single column below it, so the gaps have to survive at
    # board size.
    spires = []
    for radius, height, tip, loc, tilt in (
        (0.22, 0.60, 0.36, beside(0.0, 0.10), 0),
        (0.16, 0.34, 0.24, beside(-0.40), -22),
        (0.14, 0.26, 0.20, beside(0.38, -0.08), 20),
    ):
        spire = crystal(radius=radius, height=height, tip=tip, sides=6)
        if tilt:
            lean(spire, tilt)
        spires.append(translate_to(spire, loc))
    out[7] = stack(spires)

    # 8-9: cut gems, the one place the family is no longer found rock. Nine
    # takes more facets and a deeper pavilion than eight rather than just
    # being larger.
    # A SHALLOW crown over a wide table reads as a spinning top, not a stone.
    # A cut gem is mostly pavilion, with a small table and a crown steep
    # enough to catch light across several facets at once.
    out[8] = gem(radius=0.32, crown=0.26, pavilion=0.46, sides=8, table=0.38)
    out[9] = gem(radius=0.38, crown=0.32, pavilion=0.58, sides=12, table=0.32)

    for tier, ob in out.items():
        # Gems and crystal keep CRISP facets - a bevel on a cut stone rounds
        # off the only thing that makes it read as cut.
        # Tier five takes a deliberately HEAVY chamfer - that is the dressing.
        # Crystal and gems take none: a bevel on a cut stone rounds off the
        # only thing that says it was cut.
        bevel = 0.0 if tier >= 6 else (0.055 if tier == 5 else 0.012)
        material = tier_material("mineral-tier-%d" % tier,
                                 MINERAL_HEX[tier], MINERAL_MEASURED[tier])
        material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = (
            0.18 if tier >= 8 else 0.46
        )
        finish(ob, "mineral%d" % tier, material, bevel=bevel)
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
        ("KeyLight", (-3, -4, 6), 1250, 4),
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
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.055, 0.052, 0.05, 1.0)


def configure_render():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 16
    sc.cycles.use_denoising = True
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
