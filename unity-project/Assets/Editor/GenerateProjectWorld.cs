using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class GenerateProjectWorld
{
    public static void Build()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var source = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Art/living-room.fbx");
        var living = (GameObject)PrefabUtility.InstantiatePrefab(source);
        living.name = "Living Room";

        var bounds = BoundsOf(living);
        var kitchen = new GameObject("Kitchen");
        var width = bounds.size.x;
        var depth = bounds.size.z;
        var wallHeight = Mathf.Max(3f, bounds.size.y);
        var center = new Vector3(bounds.max.x + width * 0.5f, bounds.min.y, bounds.center.z);

        var floorMat = Material("Kitchen Floor", new Color(0.17f, 0.18f, 0.18f), 0.88f);
        var wallMat = Material("Kitchen Concrete", new Color(0.56f, 0.57f, 0.55f), 0.82f);
        Block("Floor", kitchen.transform, center + Vector3.down * 0.08f,
            new Vector3(width, 0.16f, depth), floorMat);
        Block("Back Wall", kitchen.transform,
            new Vector3(center.x, bounds.min.y + wallHeight * 0.5f, bounds.max.z),
            new Vector3(width, wallHeight, 0.18f), wallMat);
        Block("Far Wall", kitchen.transform,
            new Vector3(bounds.max.x + width, bounds.min.y + wallHeight * 0.5f, center.z),
            new Vector3(0.18f, wallHeight, depth), wallMat);

        var cameraObject = new GameObject("Project Camera");
        var camera = cameraObject.AddComponent<Camera>();
        camera.orthographic = true;
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0.035f, 0.045f, 0.05f);
        var all = BoundsOf(living, kitchen);
        cameraObject.transform.position = all.center + new Vector3(12f, 12f, -12f);
        cameraObject.transform.LookAt(all.center);
        camera.orthographicSize = Mathf.Max(all.size.x, all.size.z) * 0.62f;

        var lightObject = new GameObject("Project Key Light");
        var light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = 1.25f;
        light.color = new Color(0.91f, 0.94f, 1f);
        lightObject.transform.rotation = Quaternion.Euler(48f, -32f, 0f);

        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.24f, 0.26f, 0.28f);
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/ProjectWorld.unity");
        AssetDatabase.SaveAssets();
    }

    private static Material Material(string name, Color color, float roughness)
    {
        var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
        var material = new Material(shader) { name = name, color = color };
        if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", 1f - roughness);
        AssetDatabase.CreateAsset(material, $"Assets/Art/{name.Replace(' ', '-')}.mat");
        return material;
    }

    private static void Block(string name, Transform parent, Vector3 position, Vector3 scale, Material material)
    {
        var block = GameObject.CreatePrimitive(PrimitiveType.Cube);
        block.name = name;
        block.transform.SetParent(parent);
        block.transform.position = position;
        block.transform.localScale = scale;
        block.GetComponent<Renderer>().sharedMaterial = material;
    }

    private static Bounds BoundsOf(params GameObject[] roots)
    {
        var renderers = roots[0].GetComponentsInChildren<Renderer>();
        var result = renderers[0].bounds;
        foreach (var root in roots)
            foreach (var renderer in root.GetComponentsInChildren<Renderer>())
                result.Encapsulate(renderer.bounds);
        return result;
    }
}
