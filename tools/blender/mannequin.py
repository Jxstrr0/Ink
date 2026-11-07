"""tools/blender/mannequin.py: the client mannequin, models/ink-mannequin.glb, made by script (the Blender batch, PR 11).

  python tools/blender/mannequin.py [--out DIR] [--no-pack]        (a Python with bpy, Pillow and numpy; see README.md)

What it does, and why this way. The game's coded mannequin (src/vis/body.js, exported by tools/body-ref.js into
models/base-mesh/reference/) is a set of separate tubes and an egg that pass through each other at the shoulders, hips,
neck and wrists. Its UVs are the game's contract: every tattoo is painted into those atlas rectangles at true millimetres,
and the Session tab's stencil drag reads them back. So this script keeps the reference's surface, pose and UVs, and makes
the body one smooth skin:
  1. the skin parts of ink-body-neutral.obj in UNION (torso, arms, legs, feet, neck) are welded and capped; the coded
     mitten hands, stub thumbs and egg head are left out and rebuilt here instead (0.1.18.0, extra_parts): four fingers
     per hand curled over the armrest's front edge plus a thumb (FINGERS, BENDS, PHALANX, THUMB), and a head of cranium,
     face and jaw with a nose and ears (HEAD, NOSE). All of it is joined and voxel-remeshed into one closed surface
     (VOXEL, 2.5 mm), so the shoulders, armpits, hips, neck, wrists and fingers become real joins;
  2. a Taubin smooth (no shrinking) rounds the joins and the coded body's ring facets, lighter on the fingers (FINE, faded
     out over FINE_REACH); then the sculpt pass (BRUSHES: collarbone, shoulders, arms, waist, knees, calves, ankles, toe
     grooves, and on the face a brow, eye sockets, cheekbones, chin and jawline). A sculpt only: no painted eyes, no
     mouth, no hair, nobody's likeness;
  3. the clothes are cut from that skin, not modelled apart: the bandeau is the front of the chest between y 0.835 and
     0.952 within 66 degrees of the centre line, the shorts everything below the waistband (y 0.70) down to the coded
     shorts' hem ring on each thigh; each is pushed 6.5 mm off the skin and gets a turned-in hem, so they fit exactly;
  4. each mesh is decimated to its budget (TARGET: about 6.7k triangles of skin, 7.7k in all), the decimator told to
     spare the fingers, face and toes through a vertex group (FREE);
  5. UVs: every face takes the island of the reference face nearest its centre, and each corner the reference UV at its
     nearest point on that island (faces that straddle a tube's wrap seam use one reference face's map), so every face
     lies inside one atlas rectangle and a point on the skin has the UV the coded body has there; the thumbs go to the
     blank island, as the coded body's do;
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
VOXEL = 0.0025         # m (0.1.18.0: finer, from 3 mm, so the gaps between the fingers and the ear's rim survive)
TAUBIN = 40            # smoothing passes
FINE = {"hand": 0.22, "head": 1.0, "foot": 1.0, "toes": 1.0}   # smoothing strength on the rebuilt parts, against 1 elsewhere
FINE_REACH = 0.006     # m: how far from a rebuilt part its weights fade back to the body's
FREE = {"hand": 0.3, "head": 0.4, "foot": 0.5, "toes": 0.05}   # how readily the decimator takes their vertices (1 = the body's)
DEC_FACTOR = 1.0       # the Decimate modifier's vertex group factor
OFFSET = 0.0065        # clothes off the skin, m (the coded ones sit 6 to 7 mm out)
HEM = 0.0055           # how far the hem turns back in towards the skin
TARGET = {"body": 6700, "top": 140, "shorts": 560}   # triangles before the hems (0.1.18.0: body 5450 -> 6700 for the
BUDGET = 8000                                        # fingers, thumbs and the face; see docs/BLENDER.md)
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


def decimate(v, t, target, name, free=None):
    """collapse-decimate to about `target` triangles, symmetric in x. free: per-vertex 0..1, how readily each vertex goes
    (Blender decimates vertices weighted 1 in the group first; 0.1.18.0 keeps the face, hands and feet denser this way)"""
    ob = K.mesh_obj(name + "_dec", v, t, smooth=True)
    md = ob.modifiers.new("dec", "DECIMATE")
    md.use_collapse_triangulate = True
    md.use_symmetry, md.symmetry_axis = True, "X"
    if free is not None:
        vg = ob.vertex_groups.new(name="free")
        for w in np.unique(np.round(free, 2)):
            vg.add([int(i) for i in np.where(np.round(free, 2) == w)[0]], float(w), "REPLACE")
        md.vertex_group, md.vertex_group_factor = "free", DEC_FACTOR
    ratio = min(1.0, target / max(1, len(t)))
    for _ in range(8):                 # weighted vertices resist, so the ratio is walked down until the count fits
        md.ratio = ratio
        v2, t2 = K.mesh_arrays(ob)
        if len(t2) <= target * 1.01:
            break
        ratio *= target / len(t2)
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


# ---- 0.1.18.0: the parts the coded body only hints at: hands with fingers and a thumb, a head with a face ----
# The coded body has a mitten hand, a stub thumb and an egg for a head. These are rebuilt here as closed meshes (game
# metres, left side; the right side is the mirror image) and go into the voxel union in their place. They stay inside the
# coded hand's and head's footprint, so the hand island still maps (the back of the hand is where the mitten's back is)
# and the head, which is all "blank" skin, can take any shape. A mannequin's face: a nose, a brow ridge, cheekbones, a jaw
# and chin, ears and a hint of eye sockets (BRUSHES); no eyes, mouth or hair are drawn or painted, and it is no one.
UNION = ["torso", "arm_l", "leg_l", "foot_l", "arm_r", "leg_r", "foot_r", "neck"]   # reference parts kept as they are
PALM_RINGS = 6           # the coded hand's first rings (wrist to the knuckles, z 0.248..0.372) make the palm
# fingers, left hand: knuckle x and z on the back of the hand, length knuckle to tip, radius at the knuckle and at the tip,
# splay (radians; + is away from the thumb). The hand lies palm down on the armrest; the pad ends near z 0.39, so the
# fingers curl gently down over its front edge (BENDS, degrees at the knuckle, the middle joint and the last joint)
FINGERS = [("index", 0.2705, 0.361, 0.074, 0.0084, 0.0066, -0.07),
           ("middle", 0.2895, 0.366, 0.083, 0.0088, 0.0069, -0.02),
           ("ring", 0.3078, 0.363, 0.077, 0.0083, 0.0066, 0.035),
           ("little", 0.3248, 0.353, 0.061, 0.0072, 0.0057, 0.09)]
BENDS = (1.0, 24.0, 16.0)
PHALANX = (0.46, 0.30, 0.24)       # share of the finger's length per bone
FINGER_FLAT = (0.92, 1.06)         # cross-section: up and across, against the radius
# the thumb, left hand: spine keys from the ball of the thumb (inside the palm) to the tip, radius at each key
THUMB = [((0.277, 0.734, 0.266), 0.0145), ((0.257, 0.7365, 0.316), 0.0106), ((0.2465, 0.7365, 0.348), 0.0098),
         ((0.2405, 0.7345, 0.372), 0.0084)]
THUMB_UP = (-0.55, 0.83, 0.0)      # the thumbnail side faces up and in
# the head: ellipsoids (centre, half sizes, turn in degrees about x, y, z) and the nose, smooth-joined by the voxel union.
# The coded egg was centred at y 1.305 with half sizes 0.084 x 0.112 x 0.098; the top stays at about y 1.417
HEAD = [("cranium", (0, 1.318, -0.006), (0.079, 0.099, 0.094), (0, 0, 0)),
        ("face", (0, 1.270, 0.026), (0.068, 0.085, 0.076), (0, 0, 0)),
        ("jaw", (0, 1.226, 0.018), (0.056, 0.042, 0.064), (0, 0, 0)),
        ("nose tip", (0, 1.271, 0.111), (0.0100, 0.0095, 0.0095), (0, 0, 0)),
        ("nose wing", (0.0110, 1.268, 0.101), (0.0074, 0.0064, 0.0076), (0, 0, 0)),
        ("ear root", (0.073, 1.292, -0.006), (0.012, 0.022, 0.014), (0, 0, 0)),
        ("ear", (0.081, 1.296, -0.012), (0.0075, 0.031, 0.019), (-12, -22, 0))]
NOSE = [((0, 1.326, 0.087), 0.0062), ((0, 1.300, 0.100), 0.0072), ((0, 1.276, 0.112), 0.0092)]   # the bridge: spine, radius


def cr_spline(keys, n=48):
    """Catmull-Rom through the keys (as body.js bdSpline), densely sampled, with its cumulative length"""
    keys = np.asarray(keys, dtype=np.float64)
    P = np.vstack([2 * keys[0] - keys[1], keys, 2 * keys[-1] - keys[-2]])
    pts = []
    for i in range(1, len(keys)):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            s = k / n
            pts.append(0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s ** 3))
    pts.append(keys[-1])
    pts = np.array(pts)
    return pts, np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])


def ring_mesh(rings, tips):
    """triangles joining rings of equal size (each an (n,3) array, closed round), fanned to a tip point at each end"""
    n = len(rings[0])
    V = [tips[0]] + [p for r in rings for p in r] + [tips[1]]
    F, last = [], len(V) - 1
    for j in range(n):
        F.append([0, 1 + (j + 1) % n, 1 + j])
    for i in range(len(rings) - 1):
        a, b = 1 + i * n, 1 + (i + 1) * n
        for j in range(n):
            j2 = (j + 1) % n
            F += [[a + j, a + j2, b + j], [b + j, a + j2, b + j2]]
    a = 1 + (len(rings) - 1) * n
    for j in range(n):
        F.append([a + j, a + (j + 1) % n, last])
    return np.array(V), np.array(F)


def tube(keys, prof, up, segs=16, rings=20, cap=4):
    """a closed tube along a spline (game axes): prof = [(u, radius)] with FINGER_FLAT-style (up, across) scales given as
    prof entries (u, r_up, r_across); rounded caps of `cap` rings at both ends"""
    pts, cum = cr_spline(keys)
    L = cum[-1]
    th = np.linspace(0, 2 * np.pi, segs, endpoint=False)
    U = [q[0] for q in prof]
    rows, N = [], None
    for u in np.linspace(0, 1, rings):
        s = u * L
        i = min(int(np.searchsorted(cum, s, side="right")) - 1, len(pts) - 2)
        f = (s - cum[i]) / max(cum[i + 1] - cum[i], 1e-12)
        p = pts[i] + (pts[i + 1] - pts[i]) * f
        T = pts[i + 1] - pts[i]
        T /= np.linalg.norm(T)
        base = np.asarray(up, dtype=np.float64) if N is None else N
        N = base - T * (base @ T)
        N /= np.linalg.norm(N)
        B = np.cross(T, N)
        a, b = np.interp(u, U, [q[1] for q in prof]), np.interp(u, U, [q[2] for q in prof])
        rows.append((p, T, N, B, a, b))
    ring = lambda p, N, B, a, b: np.array([p + N * a * np.cos(t) + B * b * np.sin(t) for t in th])
    R = []
    p, T, N, B, a, b = rows[0]
    rc = min(a, b)
    for k in range(cap - 1, 0, -1):
        ph = np.pi / 2 * k / cap
        R.append(ring(p - T * rc * np.sin(ph), N, B, a * np.cos(ph), b * np.cos(ph)))
    tip0 = p - T * rc
    R += [ring(*r[:1], *r[2:]) for r in rows]
    p, T, N, B, a, b = rows[-1]
    rc = min(a, b)
    for k in range(1, cap):
        ph = np.pi / 2 * k / cap
        R.append(ring(p + T * rc * np.sin(ph), N, B, a * np.cos(ph), b * np.cos(ph)))
    return ring_mesh(R, [tip0, p + T * rc])


def rot_xyz(deg):
    ax, ay, az = np.radians(deg)
    Rx = np.array([[1, 0, 0], [0, np.cos(ax), -np.sin(ax)], [0, np.sin(ax), np.cos(ax)]])
    Ry = np.array([[np.cos(ay), 0, np.sin(ay)], [0, 1, 0], [-np.sin(ay), 0, np.cos(ay)]])
    Rz = np.array([[np.cos(az), -np.sin(az), 0], [np.sin(az), np.cos(az), 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def ellipsoid(c, r, deg=(0, 0, 0), segs=28, rings=16):
    th = np.linspace(0, 2 * np.pi, segs, endpoint=False)
    R = []
    for k in range(1, rings):
        ph = np.pi * k / rings - np.pi / 2
        R.append(np.array([[np.cos(ph) * np.cos(t), np.sin(ph), np.cos(ph) * np.sin(t)] for t in th]))
    V, F = ring_mesh(R, [np.array([0, -1.0, 0]), np.array([0, 1.0, 0])])
    return (V * np.asarray(r)) @ rot_xyz(deg).T + np.asarray(c), F


def mirror(v, f):
    return v * np.array([-1.0, 1, 1]), f[:, ::-1]


def bend(d, deg):
    """turn a direction down (towards -y) by deg about its own sideways axis"""
    lat = np.cross(d, [0, 1.0, 0])
    lat /= np.linalg.norm(lat)
    a = -np.radians(deg)
    return d * np.cos(a) + np.cross(lat, d) * np.sin(a)


def hand_parts(ref):
    """{group: [(verts, faces)]} for the left hand in game axes: the palm (the coded hand's first rings, capped round),
    four fingers and a thumb"""
    G = K.b2g(ref.P["neutral"])
    ids = np.unique(ref.parts["hand_l"])
    rings = G[ids].reshape(-1, 13, 3)[:, :12]          # 12 segments + the seam's repeat
    cen = rings.mean(1)
    pr = [rings[i] for i in range(PALM_RINGS)]
    d = cen[PALM_RINGS - 1] - cen[PALM_RINGS - 2]
    d /= np.linalg.norm(d)
    c5 = cen[PALM_RINGS - 1]
    for off, k in ((0.008, (0.95, 0.88)), (0.014, (0.78, 0.66)), (0.018, (0.45, 0.4))):
        q = rings[PALM_RINGS - 1] - c5
        sideways = np.array([1.0, 0, 0])
        q = c5 + d * off + (q @ sideways)[:, None] * sideways * k[0] + (q - (q @ sideways)[:, None] * sideways) * k[1]
        pr.append(q)
    out = {"palm": [ring_mesh(pr, [cen[0] - d * 0.002, c5 + d * 0.019])], "finger": [], "thumb": []}
    # the top of the hand at a given z (the coded rings' top), for seating each finger flush with it
    top_z, top_y = cen[:, 2], rings[:, :, 1].max(1)
    hd = cen[5] - cen[2]
    hd /= np.linalg.norm(hd)
    for name, x, z, L, r0, r1, spl in FINGERS:
        y = np.interp(z, top_z, top_y) - r0 * FINGER_FLAT[0] - 0.0004
        Kn = np.array([x, y, z])
        d0 = np.array([hd[0] * np.cos(spl) + hd[2] * np.sin(spl), hd[1], -hd[0] * np.sin(spl) + hd[2] * np.cos(spl)])
        d0 /= np.linalg.norm(d0)
        d1 = bend(d0, BENDS[0])
        d2 = bend(d1, BENDS[1])
        d3 = bend(d2, BENDS[2])
        P1 = Kn + d1 * L * PHALANX[0]
        P2 = P1 + d2 * L * PHALANX[1]
        P3 = P2 + d3 * (L * PHALANX[2] - r1)
        back = 0.018
        keys = [Kn - d0 * back, Kn, P1, P2, P3]
        tot = back + L - r1
        uk, u1, u2 = back / tot, (back + L * PHALANX[0]) / tot, (back + L * (PHALANX[0] + PHALANX[1])) / tot
        rr = [(0, r0 * 1.05), (uk, r0), (u1 - 0.02, r0 * 0.9 + r1 * 0.1), (u1, (r0 + r1) / 2 * 1.04), (u2, r1 * 1.03), (1, r1)]
        prof = [(u, r * FINGER_FLAT[0], r * FINGER_FLAT[1]) for u, r in rr]
        out["finger"].append(tube(keys, prof, up=(0, 1, 0), segs=14, rings=22))
    keys = [np.array(k) for k, _ in THUMB]
    tot = np.concatenate([[0], np.cumsum([np.linalg.norm(keys[i + 1] - keys[i]) for i in range(len(keys) - 1)])])
    prof = [(s / tot[-1], r * FINGER_FLAT[0], r * FINGER_FLAT[1]) for s, (_, r) in zip(tot, THUMB)]
    out["thumb"].append(tube(keys, prof, up=THUMB_UP, segs=14, rings=16))
    return out


def head_parts():
    out = []
    for name, c, r, deg in HEAD:
        out.append(ellipsoid(c, r, deg))
        if c[0] > 0:
            out.append(mirror(*out[-1]))
    keys = [np.array(k) for k, _ in NOSE]
    tot = np.concatenate([[0], np.cumsum([np.linalg.norm(keys[i + 1] - keys[i]) for i in range(len(keys) - 1)])])
    out.append(tube(keys, [(s / tot[-1], r * 0.95, r) for s, (_, r) in zip(tot, NOSE)], up=(0, 0, 1), segs=14, rings=12))
    return out


def extra_parts(ref):
    """every rebuilt part, both sides, in game axes, by group: palm, finger, thumb, head"""
    H = hand_parts(ref)
    out = {}
    for g, lst in H.items():
        out[g] = lst + [mirror(v, f) for v, f in lst]
    out["head"] = head_parts()
    return out


# ---- the sculpt pass: gentle anatomy on the smooth skin, as Gaussian pushes along the surface normal ----
# (game metres; s = 1 is the figure's left, +x). kind "pt" = a point, "seg" = a line; amp in m (+ out, - in); sigma in m;
# dir = the way the skin must face to be pushed (so a bump on the front of the knee leaves the back alone). Each centre is
# snapped to the skin first. 0.1.12.0 made it stronger where the eye reads a build (shoulders, waist, knees, calves: up to
# 9 mm) and kept the rest at 2 to 5 mm; still smooth, faceless and neutral, and the islands still cover the reference.
BRUSHES = [
    ("trapezius", "seg", [(0.05, 1.15, -0.02), (0.15, 1.10, -0.02)], 0.006, 0.018, (0, 1, -0.3)),
    ("collarbone", "seg", [(0.025, 1.11, 0.06), (0.14, 1.095, 0.05)], 0.004, 0.0075, (0, 0.3, 1)),
    ("chest", "pt", [(0.085, 1.0, 0.13)], 0.005, 0.04, (0, 0, 1)),
    ("sternum", "seg", [(0.0, 1.08, 0.12), (0.0, 0.96, 0.13)], -0.002, 0.008, (0, 0, 1)),
    ("shoulder blade", "pt", [(0.085, 1.0, -0.12)], 0.005, 0.035, (0, 0, -1)),
    ("spine", "seg", [(0.0, 1.10, -0.10), (0.0, 0.64, -0.10)], -0.0035, 0.010, (0, 0, -1)),
    ("deltoid", "pt", [(0.235, 1.04, 0.0)], 0.007, 0.032, (1, 0.4, 0)),
    ("deltoid front", "pt", [(0.215, 1.03, 0.045)], 0.004, 0.022, (0.3, 0.2, 1)),
    ("waist", "seg", [(0.14, 0.80, 0.0), (0.142, 0.74, 0.0)], -0.008, 0.026, (1, 0, 0)),
    ("waist front", "seg", [(0.10, 0.80, 0.09), (0.10, 0.74, 0.09)], -0.003, 0.02, (0.5, 0, 1)),
    ("elbow", "pt", [(0.29, 0.78, -0.01)], 0.004, 0.012, (0, -0.5, -1)),
    ("kneecap", "pt", [(0.11, 0.565, 0.485)], 0.008, 0.02, (0, 0.3, 1)),
    ("knee sides in", "pt", [(0.075, 0.53, 0.45)], -0.003, 0.016, (-1, 0, 0)),
    ("knee sides out", "pt", [(0.15, 0.53, 0.45)], -0.003, 0.016, (1, 0, 0)),
    ("calf", "seg", [(0.118, 0.45, 0.40), (0.118, 0.34, 0.405)], 0.009, 0.03, (0, 0, -1)),
    ("calf in", "pt", [(0.09, 0.42, 0.42)], 0.004, 0.025, (-1, 0, -0.5)),
    ("ankle out", "pt", [(0.148, 0.10, 0.45)], 0.003, 0.009, (1, 0, 0)),
    ("ankle in", "pt", [(0.082, 0.105, 0.45)], 0.003, 0.009, (-1, 0, 0)),
    ("neck muscle", "seg", [(0.03, 1.235, -0.015), (0.014, 1.15, 0.04)], 0.0025, 0.008, (0, 0, 1)),
    # 0.1.18.0: the arms and the trunk read less like tubes: biceps, triceps, the forearm's muscle by the elbow, the lats
    ("biceps", "seg", [(0.255, 0.98, 0.035), (0.275, 0.86, 0.03)], 0.004, 0.02, (0, 0, 1)),
    ("triceps", "seg", [(0.26, 0.98, -0.04), (0.285, 0.86, -0.045)], 0.003, 0.02, (0, 0, -1)),
    ("forearm", "pt", [(0.305, 0.79, 0.06)], 0.004, 0.022, (0.5, 1, 0)),
    ("lats", "pt", [(0.13, 0.93, -0.04)], 0.004, 0.03, (1, 0, -0.4)),
    ("midline", "seg", [(0.0, 0.83, 0.1), (0.0, 0.72, 0.1)], -0.0015, 0.006, (0, 0, 1)),
    # and a hint of eye sockets under the brow, and toes: four shallow grooves on the top front of each foot
    ("brow", "seg", [(0.010, 1.337, 0.092), (0.046, 1.331, 0.078)], 0.0035, 0.0075, (0, 0.2, 1)),
    ("eye socket", "pt", [(0.030, 1.313, 0.090)], -0.0045, 0.011, (0, 0, 1)),
    ("cheekbone", "pt", [(0.047, 1.287, 0.072)], 0.003, 0.012, (0.6, 0, 1)),
    ("cheek", "pt", [(0.047, 1.256, 0.068)], -0.002, 0.012, (0.6, 0, 1)),
    ("chin", "pt", [(0.0, 1.207, 0.080)], 0.0045, 0.012, (0, -0.3, 1)),
    ("jawline", "seg", [(0.052, 1.238, 0.010), (0.022, 1.200, 0.060)], 0.002, 0.008, (1, -1, 0.3)),
    ("toe 1|2", "seg", [(0.101, 0.030, 0.668), (0.100, 0.050, 0.606)], -0.0055, 0.0030, (0, 1, 1)),
    ("toe 2|3", "seg", [(0.118, 0.030, 0.664), (0.118, 0.048, 0.610)], -0.0050, 0.0028, (0, 1, 1)),
    ("toe 3|4", "seg", [(0.134, 0.030, 0.658), (0.135, 0.047, 0.608)], -0.0050, 0.0028, (0, 1, 1)),
    ("toe 4|5", "seg", [(0.149, 0.030, 0.650), (0.150, 0.045, 0.604)], -0.0045, 0.0026, (0, 1, 1)),
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


def part_near(v, trees, ref):
    """per vertex, 0..1: how near it is to the rebuilt hands, head and the feet (1 on them, fading to 0 by FINE_REACH)"""
    out = {}
    for g, names in (("hand", ("palm", "finger", "thumb")), ("head", ("head",))):
        d = np.full(len(v), 1e9)
        for nm in names:
            d = np.minimum(d, [trees[nm].find_nearest(Vector(p))[3] for p in v])
        out[g] = np.clip(1 - np.asarray(d) / FINE_REACH, 0, 1)
    # the feet: below the ankle (game y < 0.09)
    gy = K.b2g(v)[:, 1]
    out["foot"] = np.clip((0.09 - gy) / 0.02, 0, 1)
    out["toes"] = out["foot"] * np.clip((K.b2g(v)[:, 2] - 0.585) / 0.01, 0, 1)
    return out


def face_on(v, t, trees, part, others):
    """faces whose centre is nearer the `part` tube than any of `others` and within 4 mm of it"""
    cen = v[t].mean(1)
    dp = np.array([trees[part].find_nearest(Vector(p))[3] for p in cen])
    do = np.min([[trees[o].find_nearest(Vector(p))[3] for p in cen] for o in others], axis=0)
    return (dp < do) & (dp < 0.004)


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


def uv_faces(v, t, ref, blank_faces=None):
    """per-loop UVs for triangles: (T,3,2) and the island index of each face. blank_faces: faces forced onto the blank
    island (the thumbs, which the coded body leaves blank too)"""
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
        k = blank if blank_faces is not None and blank_faces[f] else int(ref.isl[ti])
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
    # ---- 1. one closed skin from the reference parts and the rebuilt hands and head ----
    bm = bmesh.new()
    for p in UNION:
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
    extra = extra_parts(ref)
    trees = {}
    for g, lst in extra.items():
        allv, allf, o = [], [], 0
        for gv, gf in lst:
            bv = K.g2b(gv)
            pb = bm_from(bv, gf)
            me = bpy.data.meshes.new(g)
            pb.to_mesh(me)
            pb.free()
            bm.from_mesh(me)
            allv.append(bv)
            allf.append(gf + o)
            o += len(bv)
        trees[g] = BVHTree.FromPolygons([tuple(x) for x in np.vstack(allv)], np.vstack(allf).tolist())
    # (0.1.12.0: the coded shin now runs on into the top of the foot, so the ankle bridges this used to add are gone)
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
    # ---- 2. Taubin smoothing (lighter on the fingers and the face), then the sculpt pass ----
    near = part_near(v, trees, ref)
    sw = np.ones(len(v))
    for g, w in FINE.items():
        sw = np.minimum(sw, 1 - (1 - w) * near[g])
    sw = sw[:, None]
    lap = laplacian(len(v), edges_of(t))
    for _ in range(TAUBIN):
        v = v + 0.5 * sw * lap(v)
        v = v - 0.53 * sw * lap(v)
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
    near = part_near(v, trees, ref)
    free = np.ones(len(v))
    for g, w in FREE.items():
        free = np.minimum(free, 1 - (1 - w) * near[g])
    v, t = decimate(v, t, TARGET["body"], "body", free=free)
    print("body: %d triangles" % len(t))
    # ---- 5. UVs, 6. shape keys ----
    thumb = face_on(v, t, trees, "thumb", ("palm", "finger"))
    uvs, fis, straddle = uv_faces(v, t, ref, blank_faces=thumb)
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
