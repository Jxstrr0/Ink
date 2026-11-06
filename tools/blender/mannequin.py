"""tools/blender/mannequin.py: the client mannequin, models/ink-mannequin.glb, made by script (the Blender batch, PR 11).

  python tools/blender/mannequin.py [--out DIR] [--no-pack]        (a Python with bpy, Pillow and numpy; see README.md)

What it does, and why this way. The game's coded mannequin (src/vis/body.js, exported by tools/body-ref.js into
models/base-mesh/reference/) is a set of separate tubes and an egg that pass through each other at the shoulders, hips,
neck and wrists. Its UVs are the game's contract: every tattoo is painted into those atlas rectangles at true millimetres,
and the Session tab's stencil drag reads them back. So this script keeps the reference's surface, pose and UVs, and makes
the body one smooth skin:
  1. the 13 skin parts of ink-body-neutral.obj (torso, arms, hands, thumbs, legs, feet, neck, head) are welded and capped,
     joined and voxel-remeshed into one closed surface (3 mm voxels), so the shoulders, armpits, hips, neck and wrists
     become real joins instead of tubes poking through each other;
  2. a Taubin smooth (no shrinking) rounds the joins and the coded body's ring facets;
  3. the clothes are cut from that skin, not modelled apart: the bandeau is the front of the chest between y 0.835 and
     0.952 within 66 degrees of the centre line, the shorts everything below the waistband (y 0.70) down to the coded
     shorts' hem ring on each thigh; each is pushed 6.5 mm off the skin and gets a turned-in hem, so they fit exactly;
  4. each mesh is decimated to its budget (about 5.5k triangles of skin, 6.4k in all);
  5. UVs: every face takes the island of the reference face nearest its centre, and each corner the reference UV at its
     nearest point on that island (faces that straddle a tube's wrap seam use one reference face's map), so every face
     lies inside one atlas rectangle and a point on the skin has the UV the coded body has there;
  6. shape keys "masc" (Broad) and "femme" (Slight): each vertex moves as the reference surface under it moves between
     the three OBJs (same topology, so the move is exact), smoothed across the joins; the clothes follow the skin;
  7. names and materials as docs/BLENDER.md asks (body/skin, cloth_top, cloth_shorts), exported as glb and packed with
     tools/pack-model.py into models/ink-mannequin.glb. tools/blender/check_mannequin.py then checks the contract.
Nothing is random: the same reference gives the same file. The CC0 pistachio base mesh is not used (posing it onto the
reference would move the surface off the UV contract for little gain at this triangle budget).
UV convention: Blender UVs here are the OBJ's (v up, as Blender's UV editor shows ink-uv-atlas.png); the glTF exporter
writes v = 1 - v, so in the .glb TEXCOORD_0 is (u, y from the top) and the game flips it back when it loads the file.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  (first: bmesh and mathutils come with it)
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import inkbl as K  # noqa: E402

SKIN = ["torso", "arm_l", "hand_l", "thumb_l", "leg_l", "foot_l", "arm_r", "hand_r", "thumb_r", "leg_r", "foot_r", "neck", "head"]
CLOTH = {"top": "#5e6e6b", "shorts": "#3d4350"}      # BD_CLOTH in src/vis/body.js
VOXEL = 0.003          # m
TAUBIN = 40            # smoothing passes
OFFSET = 0.0065        # clothes off the skin, m (the coded ones sit 6 to 7 mm out)
HEM = 0.0055           # how far the hem turns back in towards the skin
TARGET = {"body": 5450, "top": 140, "shorts": 560}   # triangles before the hems
BUDGET = 7000
JOIN, SIGMA = 0.02, 0.004   # shape keys: how near a second part must be to count at a join, and the blend width (m)


def read_obj(path):
    """the reference OBJ: vertices, per-vertex UVs (the file has one vt per v), and faces per part"""
    parts, order, V, T, cur = {}, [], [], [], None
    for ln in open(path):
        if ln.startswith("o "):
            cur = ln[2:].strip()
            parts[cur] = []
            order.append(cur)
        elif ln.startswith("v "):
            V.append([float(x) for x in ln.split()[1:4]])
        elif ln.startswith("vt "):
            T.append([float(x) for x in ln.split()[1:3]])
        elif ln.startswith("f "):
            parts[cur].append([int(x.split("/")[0]) - 1 for x in ln.split()[1:4]])
    return np.array(V), np.array(T), {k: np.array(v) for k, v in parts.items()}, order


def edges_of(t):
    E = np.concatenate([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]])
    return np.unique(np.sort(E, 1), axis=0)


def laplacian(n, E):
    deg = np.maximum(np.bincount(E.ravel(), minlength=n), 1).astype(float)[:, None]

    def lap(x):
        s = np.zeros_like(x)
        np.add.at(s, E[:, 0], x[E[:, 1]])
        np.add.at(s, E[:, 1], x[E[:, 0]])
        return s / deg - x
    return lap


def vertex_normals(v, t):
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    n = np.zeros_like(v)
    for k in range(3):
        np.add.at(n, t[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def bm_from(v, t):
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in v]
    for f in t:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    return bm


def bm_arrays(bm):
    bm.verts.index_update()
    v = np.array([x.co[:] for x in bm.verts])
    t = np.array([[x.index for x in f.verts] for f in bm.faces if len(f.verts) == 3])
    return v, t


def decimate(v, t, target, name):
    ob = K.mesh_obj(name + "_dec", v, t, smooth=True)
    md = ob.modifiers.new("dec", "DECIMATE")
    md.ratio = min(1.0, target / max(1, len(t)))
    md.use_collapse_triangulate = True
    v2, t2 = K.mesh_arrays(ob)
    bpy.data.objects.remove(ob)
    return v2, t2


def keep_component(v, t, seed):
    """the faces connected to the vertex nearest `seed`"""
    n = len(v)
    parent = np.arange(n)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for e in edges_of(t):
        a, b = find(e[0]), find(e[1])
        if a != b:
            parent[a] = b
    root = np.array([find(i) for i in range(n)])
    s = root[np.argmin(np.linalg.norm(v - seed, axis=1))]
    keep = root[t[:, 0]] == s
    t = t[keep]
    used = np.unique(t)
    remap = -np.ones(n, dtype=np.int64)
    remap[used] = np.arange(len(used))
    return v[used], remap[t]


def cut(v, t, planes):
    """bisect by each plane (point, normal, x-side or None) and drop what lies on the normal's side"""
    bm = bm_from(v, t)
    for p, nrm, side in planes:
        p, nrm = Vector(p), Vector(nrm)
        geom = [f for f in bm.faces if side is None or (f.calc_center_median().x * side > 0)]
        if not geom:
            continue
        g = set(geom)
        for f in geom:
            g.update(f.verts)
            g.update(f.edges)
        bmesh.ops.bisect_plane(bm, geom=list(g), plane_co=p, plane_no=nrm, dist=1e-7, clear_outer=False, clear_inner=False)
        dead = [f for f in bm.faces if (side is None or f.calc_center_median().x * side > 0) and (f.calc_center_median() - p).dot(nrm) > 0]
        bmesh.ops.delete(bm, geom=dead, context="FACES")
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    v2, t2 = bm_arrays(bm)
    bm.free()
    return v2, t2


def boundary_loops(t):
    """ordered boundary loops of a triangle mesh (lists of vertex indices, in face winding order)"""
    he = {}
    for f in t:
        for k in range(3):
            he[(f[k], f[(k + 1) % 3])] = True
    nxt = {a: b for (a, b) in he if (b, a) not in he}
    loops, seen = [], set()
    for s in sorted(nxt):
        if s in seen:
            continue
        loop, a = [], s
        while a not in seen and a in nxt:
            seen.add(a)
            loop.append(a)
            a = nxt[a]
        if len(loop) > 2:
            loops.append(loop)
    return loops


def hem(v, t, n):
    """turn every open edge back in towards the skin: a strip of faces from the edge HEM along -normal"""
    loops = boundary_loops(t)
    v = list(map(np.asarray, v))
    T = [list(f) for f in t]
    parent = list(range(len(v)))
    for loop in loops:
        new = []
        for a in loop:
            v.append(v[a] - n[a] * HEM)
            parent.append(a)
            new.append(len(v) - 1)
        m = len(loop)
        for k in range(m):
            a, b, a2, b2 = loop[k], loop[(k + 1) % m], new[k], new[(k + 1) % m]
            # the boundary edge runs a->b in the face winding; the strip faces outward like the cloth
            T.append([b, a, a2])
            T.append([b, a2, b2])
    return np.array(v), np.array(T), np.array(parent)


# ---- the sculpt pass: gentle anatomy on the smooth skin, as Gaussian pushes along the surface normal ----
# (game metres; s = 1 is the figure's left, +x). kind "pt" = a point, "seg" = a line; amp in m (+ out, - in); sigma in m;
# dir = the way the skin must face to be pushed (so a bump on the front of the knee leaves the back alone). Each centre is
# snapped to the skin first. Kept small (2 to 6 mm), so the surface stays within a few mm of the coded body's.
BRUSHES = [
    ("trapezius", "seg", [(0.05, 1.15, -0.02), (0.15, 1.10, -0.02)], 0.005, 0.018, (0, 1, -0.3)),
    ("collarbone", "seg", [(0.025, 1.11, 0.06), (0.14, 1.095, 0.05)], 0.0025, 0.007, (0, 0.3, 1)),
    ("chest", "pt", [(0.085, 1.0, 0.13)], 0.004, 0.04, (0, 0, 1)),
    ("sternum", "seg", [(0.0, 1.08, 0.12), (0.0, 0.96, 0.13)], -0.0015, 0.008, (0, 0, 1)),
    ("shoulder blade", "pt", [(0.085, 1.0, -0.12)], 0.004, 0.035, (0, 0, -1)),
    ("spine", "seg", [(0.0, 1.10, -0.10), (0.0, 0.64, -0.10)], -0.003, 0.010, (0, 0, -1)),
    ("deltoid", "pt", [(0.235, 1.04, 0.0)], 0.003, 0.035, (1, 0.3, 0)),
    ("elbow", "pt", [(0.29, 0.78, -0.01)], 0.004, 0.012, (0, -0.5, -1)),
    ("kneecap", "pt", [(0.11, 0.565, 0.485)], 0.005, 0.022, (0, 0.3, 1)),
    ("ankle out", "pt", [(0.148, 0.10, 0.45)], 0.003, 0.009, (1, 0, 0)),
    ("ankle in", "pt", [(0.082, 0.105, 0.45)], 0.003, 0.009, (-1, 0, 0)),
    ("neck muscle", "seg", [(0.03, 1.235, -0.015), (0.014, 1.15, 0.04)], 0.0025, 0.008, (0, 0, 1)),
]


def sculpt(v, t):
    """apply BRUSHES (both sides) to the skin, along the vertex normals"""
    n = vertex_normals(v, t)
    tree = BVHTree.FromPolygons([tuple(x) for x in v], t.tolist())
    snap = lambda q: np.array(tree.find_nearest(Vector(K.g2b(q)))[0])
    disp = np.zeros(len(v))
    for name, kind, pts, amp, sig, d in BRUSHES:
        for s in ((1, -1) if any(abs(p[0]) > 1e-6 for p in pts) else (1,)):
            P = [snap((p[0] * s, p[1], p[2])) for p in pts]
            dirv = K.g2b((d[0] * s, d[1], d[2]))
            dirv = dirv / np.linalg.norm(dirv)
            if kind == "pt":
                dist = np.linalg.norm(v - P[0], axis=1)
            else:
                a, b = P
                ab = b - a
                h = np.clip(((v - a) @ ab) / (ab @ ab), 0, 1)
                dist = np.linalg.norm(v - (a + h[:, None] * ab), axis=1)
            face = np.clip(n @ dirv, 0, 1)
            disp += amp * np.exp(-(dist / sig) ** 2 / 2) * face
    return v + n * disp[:, None]


class Ref:
    """the three reference OBJs as nearest-point lookups: the island of each triangle, its UVs, and the shape moves"""

    def __init__(self):
        P = {}
        for sh in ("neutral", "masc", "femme"):
            V, UV, parts, order = read_obj(os.path.join(K.REF, "ink-body-%s.obj" % sh))
            P[sh] = V
        self.parts, self.uv = parts, UV
        J = json.load(open(os.path.join(K.REF, "ink-body.json")))
        self.islands = {k: v["rect"] for k, v in J["islands"].items()}
        tri, pid = [], []
        for i, p in enumerate(SKIN):
            tri.append(parts[p])
            pid += [i] * len(parts[p])
        self.tri = np.concatenate(tri)
        self.pid = np.array(pid)
        self.P = {k: K.g2b(v) for k, v in P.items()}       # Blender axes
        # the island of each reference triangle, from its UV centre
        c = UV[self.tri].mean(1)
        self.names = sorted(self.islands)
        self.isl = np.array([self.island_at(u, 1 - w) for u, w in c])
        self.bvh = BVHTree.FromPolygons([tuple(x) for x in self.P["neutral"]], self.tri.tolist())
        self.pbvh = []
        for k in range(len(SKIN)):
            idx = np.where(self.pid == k)[0]
            self.pbvh.append((BVHTree.FromPolygons([tuple(x) for x in self.P["neutral"]], self.tri[idx].tolist()), idx))
        self.ibvh = {}
        for k in range(len(self.names)):
            idx = np.where(self.isl == k)[0]
            if len(idx):
                self.ibvh[k] = (BVHTree.FromPolygons([tuple(x) for x in self.P["neutral"]], self.tri[idx].tolist()), idx)

    def island_at(self, u, y):
        for k, n in enumerate(self.names):
            r = self.islands[n]
            if r["x"] - 1e-4 <= u <= r["x"] + r["w"] + 1e-4 and r["y"] - 1e-4 <= y <= r["y"] + r["h"] + 1e-4:
                return k
        raise SystemExit("a reference UV at %.4f, %.4f is in no island" % (u, y))

    def bary(self, ti, p):
        a, b, c = self.P["neutral"][self.tri[ti]]
        v0, v1, v2 = b - a, c - a, p - a
        d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-20:
            return np.array([1.0, 0, 0])
        y = (d11 * d20 - d01 * d21) / den
        z = (d00 * d21 - d01 * d20) / den
        return np.array([1 - y - z, y, z])

    def nearest(self, p, island=None):
        """(triangle index, barycentrics clamped to the triangle) of the nearest reference point"""
        if island is None:
            loc, _, i, _ = self.bvh.find_nearest(Vector(p))
            ti = i
        else:
            tree, idx = self.ibvh[island]
            loc, _, i, _ = tree.find_nearest(Vector(p))
            ti = idx[i]
        b = np.clip(self.bary(ti, np.array(loc)), 0, 1)
        return ti, b / b.sum()

    def uv_of(self, ti, b):
        return b @ self.uv[self.tri[ti]]

    def delta(self, ti, b, shape):
        ids = self.tri[ti]
        return b @ (self.P[shape][ids] - self.P["neutral"][ids])


def uv_faces(v, t, ref):
    """per-loop UVs for triangles: (T,3,2) and the island index of each face"""
    blank = ref.names.index("blank")
    cache = {}

    def corner(i, k):
        if (i, k) not in cache:
            ti, b = ref.nearest(v[i], k)
            cache[(i, k)] = (ref.uv_of(ti, b), ti)
        return cache[(i, k)]
    out = np.zeros((len(t), 3, 2))
    fis = np.zeros(len(t), dtype=np.int64)
    straddle = 0
    for f, tri in enumerate(t):
        cen = v[tri].mean(0)
        ti, b = ref.nearest(cen)
        k = int(ref.isl[ti])
        fis[f] = k
        r = ref.islands[ref.names[k]]
        if k == blank:
            out[f] = [r["x"] + r["w"] / 2, 1 - (r["y"] + r["h"] / 2)]
            continue
        tc, bc = ref.nearest(cen, k)
        uc = ref.uv_of(tc, bc)
        uvs = np.array([corner(i, k)[0] for i in tri])
        span = np.abs(uvs - uc) / np.array([r["w"], r["h"]])
        if span.max() > 0.3:       # across a tube's wrap seam: use the centre triangle's own map, extended
            straddle += 1
            for c, i in enumerate(tri):
                bb = ref.bary(tc, v[i])
                uvs[c] = ref.uv_of(tc, bb)
        # inside the island's rectangle, always
        uvs[:, 0] = np.clip(uvs[:, 0], r["x"], r["x"] + r["w"])
        uvs[:, 1] = np.clip(uvs[:, 1], 1 - r["y"] - r["h"], 1 - r["y"])
        out[f] = uvs
    return out, fis, straddle


def shape_deltas(v, ref):
    """per-vertex moves to the masc and femme shapes. Each vertex follows the reference surface under it; near a join
    (where two coded parts pass through each other and move apart differently between shapes) it blends the moves of the
    parts within JOIN of the nearest by exp(-extra distance / SIGMA), so the skin stays smooth in every shape"""
    D = {"masc": np.zeros_like(v), "femme": np.zeros_like(v)}
    for i, p in enumerate(v):
        hits = []
        for k, (tree, idx) in enumerate(ref.pbvh):
            loc, _, j, d = tree.find_nearest(Vector(p))
            hits.append((d, idx[j], np.array(loc)))
        dmin = min(h[0] for h in hits)
        wsum = 0.0
        acc = {sh: np.zeros(3) for sh in D}
        for d, ti, loc in hits:
            if d - dmin > JOIN:
                continue
            w = np.exp(-(d - dmin) / SIGMA)
            b = np.clip(ref.bary(ti, loc), 0, 1)
            b /= b.sum()
            for sh in D:
                acc[sh] += w * ref.delta(ti, b, sh)
            wsum += w
        for sh in D:
            D[sh][i] = acc[sh] / wsum
    return D


def main():
    out, do_pack, _ = K.args()
    t0 = time.time()
    K.reset()
    ref = Ref()
    # ---- 1. one closed skin from the reference parts ----
    bm = bmesh.new()
    for p in SKIN:
        F = ref.parts[p]
        pb = bm_from(ref.P["neutral"], [])
        ids = np.unique(F)
        vm = {i: pb.verts.new(ref.P["neutral"][i]) for i in ids}
        for f in F:
            try:
                pb.faces.new([vm[i] for i in f])
            except ValueError:
                pass
        bmesh.ops.remove_doubles(pb, verts=pb.verts, dist=1e-5)
        bmesh.ops.holes_fill(pb, edges=[e for e in pb.edges if e.is_boundary], sides=0)
        bmesh.ops.triangulate(pb, faces=pb.faces)
        me = bpy.data.meshes.new(p)
        pb.to_mesh(me)
        pb.free()
        bm.from_mesh(me)
    # the coded foot floats about 2 cm under the end of the shin (nothing in the game looks there): bridge each ankle
    for s in (1, -1):
        ab = bmesh.new()
        bmesh.ops.create_cone(ab, cap_ends=True, segments=16, radius1=0.031, radius2=0.032, depth=0.09)
        bmesh.ops.translate(ab, verts=ab.verts, vec=Vector(K.g2b([0.115 * s, 0.1, 0.45])))
        me = bpy.data.meshes.new("ankle")
        ab.to_mesh(me)
        ab.free()
        bm.from_mesh(me)
    me = bpy.data.meshes.new("union")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("union", me)
    bpy.context.scene.collection.objects.link(ob)
    md = ob.modifiers.new("voxel", "REMESH")
    md.mode, md.voxel_size, md.adaptivity = "VOXEL", VOXEL, 0.0
    v, t = K.mesh_arrays(ob)
    bpy.data.objects.remove(ob)
    v, t = keep_component(v, t, K.g2b([0, 1.0, 0.12]))
    print("skin: voxel remesh %d triangles (%.1f s)" % (len(t), time.time() - t0))
    # ---- 2. Taubin smoothing, then the sculpt pass ----
    lap = laplacian(len(v), edges_of(t))
    for _ in range(TAUBIN):
        v = v + 0.5 * lap(v)
        v = v - 0.53 * lap(v)
    v = sculpt(v, t)
    # ---- 3. the clothes, cut from the smooth skin ----
    G = K.g2b
    cz = 0.006                                  # the torso ring centres sit about here (bdTorsoRings)
    a = np.radians(66)
    top_planes = [(G([0, 0.952, 0]), G([0, 1, 0]) - G([0, 0, 0]), None),
                  (G([0, 0.835, 0]), G([0, -1, 0]) - G([0, 0, 0]), None),
                  (G([0, 0, cz]), G([np.cos(a), 0, -np.sin(a)]) - G([0, 0, 0]), None),
                  (G([0, 0, cz]), G([-np.cos(a), 0, -np.sin(a)]) - G([0, 0, 0]), None)]
    # the shorts' hem on each thigh: the last ring of the coded shorts leg (u = 0.24 down the leg)
    rings = {}
    for s in ("l", "r"):
        F = ref.parts["shortsleg_" + s]
        ids = np.unique(F)
        P = ref.P["neutral"][ids]
        ring = P[-17:]                          # 6 rings of 17 (16 segments + the seam); the last is the hem
        c = ring.mean(0)
        nrm = np.linalg.svd(ring - c)[2][2]
        if nrm @ (c - P[:17].mean(0)) < 0:
            nrm = -nrm
        rings[s] = (c, nrm)
    short_planes = [(G([0, 0.70, 0]), G([0, 1, 0]) - G([0, 0, 0]), None),
                    (rings["l"][0], rings["l"][1], 1), (rings["r"][0], rings["r"][1], -1)]
    cloth = {}
    for name, planes, seed in (("top", top_planes, [0, 0.89, 0.2]), ("shorts", short_planes, [0, 0.6, -0.2])):
        cv, ct = cut(v, t, planes)
        cv, ct = keep_component(cv, ct, G(seed))
        cv = cv + vertex_normals(cv, ct) * OFFSET
        cv, ct = decimate(cv, ct, TARGET[name], name)
        cv, ct, parent = hem(cv, ct, vertex_normals(cv, ct))
        cloth[name] = (cv, ct, parent)
        print("%s: %d triangles with the hem" % (name, len(ct)))
    # ---- 4. the skin to its budget ----
    v, t = decimate(v, t, TARGET["body"], "body")
    print("body: %d triangles" % len(t))
    # ---- 5. UVs, 6. shape keys ----
    uvs, fis, straddle = uv_faces(v, t, ref)
    print("uv: %d faces across a wrap seam use their own map" % straddle)
    D = shape_deltas(v, ref)
    objs = []
    body = K.mesh_obj("body", v, t, K.mat("skin", "#dba57c", 0.62), uvs=uvs.reshape(-1, 2))
    body.data.name = "body"
    objs.append(body)
    for name, (cv, ct, parent) in cloth.items():
        mt = K.mat("cloth_" + name, CLOTH[name], 0.95, double=True)
        o = K.mesh_obj("cloth_" + name, cv, ct, mt)
        o.data.name = "cloth_" + name
        cd = shape_deltas(cv[: parent.max() + 1], ref)
        objs.append((o, {k: d[parent] for k, d in cd.items()}))
    # shape keys on all three
    for item in objs:
        o, dd = (item, D) if item is body else item
        o.shape_key_add(name="Basis", from_mix=False)
        n = len(o.data.vertices)
        base = np.empty(n * 3)
        o.data.vertices.foreach_get("co", base)
        base = base.reshape(-1, 3)
        for sh in ("masc", "femme"):
            kb = o.shape_key_add(name=sh, from_mix=False)
            kb.data.foreach_set("co", (base + dd[sh]).ravel())
            kb.value = 0.0             # exported as the mesh's default weights: the game sets them per client
    objs = [body] + [o for o, _ in objs[1:]]
    tris = sum(len(o.data.polygons) for o in objs)
    print("total: %d triangles (budget %d)" % (tris, BUDGET))
    raw = K.export_glb(objs, os.path.join(out, "ink-mannequin-raw.glb"))
    print("raw: %s (%.1f s)" % (raw, time.time() - t0))
    if do_pack:
        K.pack(raw, "ink-mannequin.glb", BUDGET)


if __name__ == "__main__":
    main()
