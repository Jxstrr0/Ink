"""tools/blender/check_mannequin.py: check models/ink-mannequin.glb against the game's contract (docs/BLENDER.md section 1).

  python tools/blender/check_mannequin.py [models/ink-mannequin.glb]

Reads the packed file the way the game does (KHR_mesh_quantization undone, node transforms applied) and checks, against
models/base-mesh/reference/ (ink-body.json and the three OBJs):
  - names: meshes body, cloth_top, cloth_shorts; materials skin, cloth_top, cloth_shorts; shape keys masc and femme, both
    at weight 0 by default
  - triangles: under 7,000 (target), never over 8,000 (ceiling)
  - placement: metres, feet on the floor, the head top near y 1.42, facing +Z; clothes inside their stated heights
  - UVs: every body face lies inside ONE atlas rectangle (no face crosses islands), every island is used, the islands
    are in true millimetres (3D area against UV area at the island's px-per-mm) and cover what the reference covers
  - zones: the centre of every placement zone's box, looked up on the reference, has a mannequin face over it
  - shape keys: each body vertex in Broad and Slight sits on the reference masc / femme surface (within a few mm)
Exits 1 with the failures listed. Needs numpy; the surface-distance checks use mathutils (the bpy module) when present.
"""
import json
import os
import struct
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REF = os.path.join(ROOT, "models", "base-mesh", "reference")
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
NORM = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}
SKIN = ["torso", "arm_l", "hand_l", "thumb_l", "leg_l", "foot_l", "arm_r", "hand_r", "thumb_r", "leg_r", "foot_r", "neck", "head"]


def load_glb(path):
    raw = open(path, "rb").read()
    off, g, binc = 12, None, b""
    while off < len(raw):
        n, kind = struct.unpack_from("<II", raw, off)
        chunk = raw[off + 8: off + 8 + n]
        if kind == 0x4E4F534A:
            g = json.loads(chunk.decode("utf8"))
        elif kind == 0x004E4942:
            binc = chunk
        off += 8 + n

    def read(ai):
        a = g["accessors"][ai]
        bv = g["bufferViews"][a["bufferView"]]
        dt = np.dtype(CT[a["componentType"]])
        n, c = a["count"], NC[a["type"]]
        o = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        st = bv.get("byteStride", dt.itemsize * c)
        rows = np.lib.stride_tricks.as_strided(np.frombuffer(binc, np.uint8, count=st * (n - 1) + dt.itemsize * c, offset=o),
                                               (n, dt.itemsize * c), (st, 1))
        v = np.ascontiguousarray(rows).view(dt).reshape(n, c).astype(np.float64)
        if a.get("normalized") and a["componentType"] in NORM:
            v = np.maximum(v / NORM[a["componentType"]], -1.0)
        return v

    # world transforms (translation + scale only; the exporter and the packer write no rotations here)
    meshes = {}

    def walk(ni, t, s):
        n = g["nodes"][ni]
        if "rotation" in n and any(abs(x) > 1e-9 for x in n["rotation"][:3]):
            raise SystemExit("node %s has a rotation: Apply All Transforms" % n.get("name"))
        s2 = s * np.array(n.get("scale", [1, 1, 1]))
        t2 = t + s * np.array(n.get("translation", [0, 0, 0]))
        if "mesh" in n:
            m = g["meshes"][n["mesh"]]
            prims = []
            for p in m["primitives"]:
                P = read(p["attributes"]["POSITION"])
                q = {"pos": P * s2 + t2, "idx": read(p["indices"]).astype(np.int64).reshape(-1, 3),
                     "mat": g["materials"][p["material"]].get("name") if "material" in p else None,
                     "uv": read(p["attributes"]["TEXCOORD_0"]) if "TEXCOORD_0" in p["attributes"] else None,
                     "targets": [read(tg["POSITION"]) * s2 for tg in p.get("targets", [])]}
                prims.append(q)
            meshes[m.get("name")] = {"prims": prims, "names": (m.get("extras") or {}).get("targetNames", []), "weights": m.get("weights")}
        for c in n.get("children", []):
            walk(c, t2, s2)
    for ni in g["scenes"][g.get("scene", 0)]["nodes"]:
        walk(ni, np.zeros(3), np.ones(3))
    return g, meshes, len(raw)


def read_obj(path):
    parts, V, T, cur = {}, [], [], None
    for ln in open(path):
        if ln.startswith("o "):
            cur = ln[2:].strip()
            parts[cur] = []
        elif ln.startswith("v "):
            V.append([float(x) for x in ln.split()[1:4]])
        elif ln.startswith("vt "):
            T.append([float(x) for x in ln.split()[1:3]])
        elif ln.startswith("f "):
            parts[cur].append([int(x.split("/")[0]) - 1 for x in ln.split()[1:4]])
    return np.array(V), np.array(T), {k: np.array(v) for k, v in parts.items()}


def tri_area(P, t):
    return 0.5 * np.linalg.norm(np.cross(P[t[:, 1]] - P[t[:, 0]], P[t[:, 2]] - P[t[:, 0]]), axis=1)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "models", "ink-mannequin.glb")
    g, M, size = load_glb(path)
    J = json.load(open(os.path.join(REF, "ink-body.json")))
    R = {k: v["rect"] for k, v in J["islands"].items()}
    ppm = {k: v["pxPerMmAt2048"] / 2048 for k, v in J["islands"].items()}
    fails, notes = [], []

    def need(ok, msg):
        if not ok:
            fails.append(msg)

    # ---- names ----
    for n in ("body", "cloth_top", "cloth_shorts"):
        need(n in M, "no mesh named " + n)
    if fails:
        print("\n".join("FAIL " + f for f in fails))
        sys.exit(1)
    mats = {"body": "skin", "cloth_top": "cloth_top", "cloth_shorts": "cloth_shorts"}
    for n, m in M.items():
        need(len(m["prims"]) == 1, "%s has %d primitives (one material each)" % (n, len(m["prims"])))
        need(m["prims"][0]["mat"] == mats.get(n), "%s's material is %s, not %s" % (n, m["prims"][0]["mat"], mats.get(n)))
        need(m["names"] == ["masc", "femme"], "%s's shape keys are %s, not masc, femme" % (n, m["names"]))
        need(not m["weights"] or not any(m["weights"]), "%s's default shape key weights are %s, not 0" % (n, m["weights"]))
    tris = sum(len(p["idx"]) for m in M.values() for p in m["prims"])
    need(tris <= 8000, "%d triangles: over the 8,000 ceiling" % tris)
    if tris > 7000:
        notes.append("%d triangles: over the 7,000 target" % tris)
    B = M["body"]["prims"][0]
    P, T, UV = B["pos"], B["idx"], B["uv"]
    # ---- placement ----
    lo, hi = P.min(0), P.max(0)
    need(-0.01 < lo[1] < 0.02, "the feet are at y %.3f, not on the floor" % lo[1])
    need(1.38 < hi[1] < 1.46, "the head top is at y %.3f, not about 1.42" % hi[1])
    need(hi[2] > 0.6 and lo[2] > -0.2, "the body does not face +Z (z %.2f..%.2f)" % (lo[2], hi[2]))
    need(abs(lo[0] + hi[0]) < 0.01, "the body is not centred on x 0 (%.3f..%.3f)" % (lo[0], hi[0]))
    top = M["cloth_top"]["prims"][0]["pos"]
    sh = M["cloth_shorts"]["prims"][0]["pos"]
    need(0.825 < top[:, 1].min() and top[:, 1].max() < 0.962, "the bandeau runs y %.3f..%.3f, not 0.835..0.952" % (top[:, 1].min(), top[:, 1].max()))
    need(top[:, 2].min() > -0.05, "the bandeau wraps round to the back")
    need(sh[:, 1].max() < 0.71, "the shorts reach y %.3f, above the 0.70 waistband" % sh[:, 1].max())
    # ---- UVs ----
    need(UV is not None, "the body has no UVs")
    Y = np.stack([UV[:, 0], UV[:, 1]], 1)          # glTF: v runs down from the top, as ink-body.json's y
    names = sorted(R)
    eps = 1e-4
    inside = np.zeros((len(T), len(names)), dtype=bool)
    for k, n in enumerate(names):
        r = R[n]
        ok = (Y[:, 0] >= r["x"] - eps) & (Y[:, 0] <= r["x"] + r["w"] + eps) & (Y[:, 1] >= r["y"] - eps) & (Y[:, 1] <= r["y"] + r["h"] + eps)
        inside[:, k] = ok[T].all(1)
    hits = inside.sum(1)
    need((hits >= 1).all(), "%d body faces are not inside one island's rectangle (they cross islands or the gaps)" % int((hits < 1).sum()))
    fisl = np.where(hits >= 1, inside.argmax(1), -1)
    ref_V, ref_UV, parts = read_obj(os.path.join(REF, "ink-body-neutral.obj"))
    rt = np.concatenate([parts[p] for p in SKIN])
    rY = np.stack([ref_UV[:, 0], 1 - ref_UV[:, 1]], 1)
    rc = rY[rt].mean(1)
    risl = np.full(len(rt), -1)
    for k, n in enumerate(names):
        r = R[n]
        risl[(rc[:, 0] >= r["x"] - eps) & (rc[:, 0] <= r["x"] + r["w"] + eps) & (rc[:, 1] >= r["y"] - eps) & (rc[:, 1] <= r["y"] + r["h"] + eps)] = k
    try:
        import bpy  # noqa: F401  (mathutils comes with the bpy module)
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
        have_mu = True
    except ImportError:
        have_mu = False
        notes.append("mathutils not found (run with the bpy Python): surface checks skipped")
    # the reference faces you can see: the coded parts pass through each other, so only those on the mannequin's skin count
    seen = np.ones(len(rt), dtype=bool)
    if have_mu:
        btree = BVHTree.FromPolygons([tuple(x) for x in P], T.tolist())
        seen = np.array([btree.find_nearest(Vector(c))[3] < 0.004 for c in ref_V[rt].mean(1)])
    rows = []
    for k, n in enumerate(names):
        f = fisl == k
        if n == "blank":
            need(f.any(), "nothing uses the blank island (head, thumbs, belly)")
            continue
        need(f.any(), "island %s is not used" % n)
        if not f.any():
            continue
        a3 = tri_area(P, T[f]).sum() * 1e6                                     # mm^2 on the Average body
        auv = tri_area(np.c_[Y, np.zeros(len(Y))], T[f]).sum() / ppm[n] ** 2   # mm^2 by the atlas
        ra = tri_area(np.c_[rY, np.zeros(len(rY))], rt[(risl == k) & seen]).sum() / ppm[n] ** 2
        scale = auv / a3
        cover = auv / ra
        rows.append("  %-7s %5d faces  uv/3D area %.2f   covers %3.0f%% of the reference island's visible skin" % (n, f.sum(), scale, cover * 100))
        need(0.85 < scale < 1.15, "island %s is not at true mm: UV area / 3D area %.2f" % (n, scale))
        need(cover > 0.80, "island %s covers only %.0f%% of the reference island" % (n, cover * 100))
    # ---- zones: the centre of each zone's box is on the mannequin ----
    if have_mu:
        uvtree = BVHTree.FromPolygons([(x, y, 0.0) for x, y in Y], T.tolist())
        for zid, z in J["zones"].items():
            n = z["island"]
            r, I = R[n], J["islands"][n]
            # the box centre on the island: the middle of its x range is close enough for the limbs; torso zones use x 0
            ym = z["startMm"] + z["lengthMm"] / 2
            xm = 0.0 if I["mm"]["x"][0] < 0 < I["mm"]["x"][1] else sum(I["mm"]["x"]) / 2
            u = r["x"] + (xm - I["mm"]["x"][0]) * ppm[n]
            v = r["y"] + (ym - I["mm"]["y"][0]) * ppm[n]
            loc, _, fi, d = uvtree.find_nearest(Vector((u, v, 0.0)))
            need(d is not None and d * 2048 < 3 and fisl[fi] == names.index(n), "zone %s: no mannequin face under its centre on %s (%.1f px away)" % (zid, n, (d or 9) * 2048))
        # ---- shape keys against the reference shapes ----
        # where two coded parts meet (armpit, hip, neck, wrist) the reference parts pass through each other and move apart
        # differently between shapes, so the smooth skin there cannot sit on both: those joins get a looser limit
        ptrees = [BVHTree.FromPolygons([tuple(x) for x in ref_V], parts[p].tolist()) for p in SKIN]
        dd = np.array([sorted(t.find_nearest(Vector(p))[3] for t in ptrees)[:2] for p in P])
        join = dd[:, 1] < 0.02
        ntree = BVHTree.FromPolygons([tuple(x) for x in ref_V], rt.tolist())
        d0 = np.array([ntree.find_nearest(Vector(p))[3] for p in P])
        rows.append("  Average shape: off the reference by %.1f mm median, %.1f mm at most (%d vertices at the joins)" %
                    (np.median(d0) * 1000, d0.max() * 1000, join.sum()))
        for k, shp in enumerate(("masc", "femme")):
            RV, _, _ = read_obj(os.path.join(REF, "ink-body-%s.obj" % shp))
            tree = BVHTree.FromPolygons([tuple(x) for x in RV], rt.tolist())
            Q = P + B["targets"][k]
            d1 = np.array([tree.find_nearest(Vector(p))[3] for p in Q])
            off = d1 - d0
            rows.append("  %-6s shape: off the reference by %.1f mm median; away from the joins %.1f mm at most, at the joins %.1f mm" %
                        (shp, np.median(d1) * 1000, off[~join].max() * 1000, off[join].max() * 1000))
            need(off[~join].max() < 0.004, "%s: %d vertices away from the joins are more than 4 mm off the reference" % (shp, int((off[~join] >= 0.004).sum())))
            need(off[join].max() < 0.015, "%s: a join is %.1f mm off the reference" % (shp, off[join].max() * 1000))
            need(np.median(d1) < 0.0015, "%s: median %.1f mm off the reference" % (shp, np.median(d1) * 1000))
    print("%s  %d KB, %d triangles (body %d, bandeau %d, shorts %d)" % (os.path.relpath(path, ROOT), size // 1024, tris, len(T),
          len(M["cloth_top"]["prims"][0]["idx"]), len(M["cloth_shorts"]["prims"][0]["idx"])))
    print("\n".join(rows))
    for n in notes:
        print("note " + n)
    for f in fails:
        print("FAIL " + f)
    print("ok" if not fails else "%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
