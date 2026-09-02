import bpy

bpy.ops.export_scene.fbx(
    filepath=r"C:\Users\intig\Downloads\merge-game\merge-game\unity-project\Assets\Art\living-room.fbx",
    object_types={"MESH"},
    use_selection=False,
    axis_forward="-Z",
    axis_up="Y",
    apply_scale_options="FBX_SCALE_ALL",
    bake_anim=False,
)
