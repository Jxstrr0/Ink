"""tools/blender/inkbl.py: shared helpers for Ink's scripted Blender models (the Blender batch, PR 11).

Imported by mannequin.py and props.py (run them with a Python that has the `bpy` module, Blender 4.x or 5.x as a module:
`python3 -m venv V && V/bin/pip install bpy pillow numpy`). Nothing here is random, so every run gives the same files.
  - repo paths, argument parsing (--out DIR for the raw exports, --no-pack to skip tools/pack-model.py)
  - a clean empty scene in metres
  - game axes <-> Blender axes: the game is +Y up and faces +Z; Blender is +Z up and the front faces -Y, so a game point
    (x, y, z) is Blender (x, -z, y). The glTF exporter's +Y up turns it back.
  - Principled materials by name (Base Color, Roughness, Metallic, optional Emission)
  - mesh from numpy arrays, export one collection of objects to .glb, pack it into models/
"""
import os
import subprocess
import sys

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "models")
REF = os.path.join(MODELS, "base-mesh", "reference")


def args():
    """--out DIR (raw exports, default ../Ink-blender next to the repo), --no-pack, and any other words (names to build)"""
    a = sys.argv[1:]
    out = os.path.join(os.path.dirname(ROOT), "Ink-blender")
    if "--out" in a:
        i = a.index("--out")
        out = a[i + 1]
        del a[i:i + 2]
    pack = "--no-pack" not in a
    names = [x for x in a if not x.startswith("--")]
    os.makedirs(out, exist_ok=True)
    return out, pack, names


def reset():
    """an empty scene, metric, unit scale 1"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = "METRIC"
    s.unit_settings.scale_length = 1.0
    s.unit_settings.length_unit = "METERS"
    return s


def g2b(p):
    """game (x, y up, z front) -> Blender (x, -z, y); works on (..., 3) arrays"""
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def b2g(p):
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1)


def srgb_to_lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def hex_rgb(h):
    h = h.lstrip("#")
    return srgb_to_lin([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]).tolist()


_MATS = {}


def mat(name, color, rough=0.8, metal=0.0, emit=None, emit_strength=1.0, double=False, image=None, uv_scale=None):
    """a Principled BSDF material (cached by name). color is '#rrggbb' (sRGB, like the game's vsMat)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = hex_rgb(color) + [1.0]
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = hex_rgb(emit) + [1.0]
        p.inputs["Emission Strength"].default_value = emit_strength
    if image:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(image)
        nt.links.new(tex.outputs["Color"], p.inputs["Base Color"])
        if uv_scale:
            mp = nt.nodes.new("ShaderNodeMapping")
            tc = nt.nodes.new("ShaderNodeTexCoord")
            mp.inputs["Scale"].default_value = (uv_scale[0], uv_scale[1], 1)
            nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
            nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    m.use_backface_culling = not double
    _MATS[name] = m
    return m


def mesh_obj(name, verts, faces, material=None, smooth=True, uvs=None, collection=None):
    """an object from Blender-axis verts (N,3) and faces (lists of indices); uvs: per-loop (L,2) in face order"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(int(i) for i in f) for f in faces])
    if uvs is not None:
        uvl = me.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", np.asarray(uvs, dtype=np.float32).ravel())
    me.validate(clean_customdata=False)
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    if material is not None:
        me.materials.append(material)
    return ob


def mesh_arrays(ob, evaluated=True):
    """(verts (N,3), tris (T,3)) of an object, modifiers applied, triangulated, in Blender axes and world space"""
    dg = bpy.context.evaluated_depsgraph_get()
    eo = ob.evaluated_get(dg) if evaluated else ob
    me = eo.to_mesh()
    me.calc_loop_triangles()
    v = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", v)
    t = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", t)
    M = np.array(ob.matrix_world)
    v = v.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    eo.to_mesh_clear()
    return v, t.reshape(-1, 3)


def apply_all(ob):
    """apply every modifier and the transform (no bpy.ops context needed)"""
    dg = bpy.context.evaluated_depsgraph_get()
    eo = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(eo, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    me.transform(ob.matrix_world)
    ob.matrix_world.identity()
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def tri_count(objs):
    n = 0
    for ob in objs:
        v, t = mesh_arrays(ob)
        n += len(t)
    return n


def export_glb(objs, path):
    """export just these objects as glTF binary, +Y up, modifiers applied, no animation"""
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
              export_texcoords=True, export_normals=True, export_tangents=False, export_animations=False,
              export_skins=False, export_morph=True, export_morph_normal=True, export_materials="EXPORT")
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color="NONE")
    except TypeError:
        bpy.ops.export_scene.gltf(**kw, export_colors=False)
    return path


def pack(raw, name, budget):
    """tools/pack-model.py RAW models/NAME --budget N (with this same Python, which has Pillow and numpy)"""
    out = os.path.join(MODELS, name)
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "pack-model.py"), raw, out, "--budget", str(budget)],
                       capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode:
        sys.stderr.write(r.stderr)
        raise SystemExit("pack-model.py failed for " + name)
    return out
