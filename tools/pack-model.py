#!/usr/bin/env python3
"""Pack a Blender export (.glb, or .gltf + .bin + textures) into one small .glb for Ink's Full / Ultra shop.

  python3 tools/pack-model.py IN.glb OUT.glb [--tex 512] [--normal 256] [--q 80] [--budget 1500]

Copied from Prairie Engine Works' tools/pack-model.py and adapted for Ink (PR 10):
  - reads a .glb straight from Blender's glTF exporter as well as a .gltf with its .bin and image files
  - textures shrink to --tex px (normal maps to --normal px) and are re-saved as JPEG at quality --q
  - vertex data is quantized with KHR_mesh_quantization (three.js r128's GLTFLoader reads it): positions to 16-bit,
    normals to 8-bit, UVs to 16-bit, indices to 16-bit; tangents, extra UV sets, skins and animations are dropped
  - morph targets (Blender shape keys, the mannequin's "masc" and "femme") are KEPT, as float deltas in the quantized
    space, with their names; PEW drops them because its props have none
  - then it prints what the game will see: triangles, size in metres, where the origin sits, materials, shape keys,
    and a warning if the triangles are over --budget (docs/BLENDER.md gives each file's budget)
Needs Python 3 with Pillow and numpy (pip install pillow numpy). Run it by hand; the output goes in models/ and is
committed with its line in models/CREDITS.md. Then set that file's entry to on:true in ASSETS (src/vis/assets.js).
"""
import io, json, os, struct, sys
import numpy as np
from PIL import Image

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
NORM = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}


def arg(name, d):
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else d


def load(src):
    """the glTF json and its buffers, from a .glb or a .gltf"""
    base = os.path.dirname(os.path.abspath(src))
    raw = open(src, "rb").read()
    if raw[:4] == b"glTF":
        off, g, binc = 12, None, b""
        while off < len(raw):
            n, kind = struct.unpack_from("<II", raw, off)
            chunk = raw[off + 8: off + 8 + n]
            if kind == 0x4E4F534A:
                g = json.loads(chunk.decode("utf8"))
            elif kind == 0x004E4942:
                binc = chunk
            off += 8 + n
        bins = [binc if "uri" not in b else open(os.path.join(base, b["uri"]), "rb").read() for b in g["buffers"]]
    else:
        g = json.loads(raw.decode("utf8"))
        bins = [open(os.path.join(base, b["uri"]), "rb").read() for b in g["buffers"]]
    return g, bins, base


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    tex, ntex, q, budget = arg("--tex", 512), arg("--normal", 256), arg("--q", 80), arg("--budget", 0)
    g, bins, base = load(src)

    def read(ai):
        a = g["accessors"][ai]
        bv = g["bufferViews"][a["bufferView"]]
        dt = np.dtype(CT[a["componentType"]])
        n, c = a["count"], NC[a["type"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        st = bv.get("byteStride", dt.itemsize * c)
        raw = np.frombuffer(bins[bv["buffer"]], np.uint8, count=st * (n - 1) + dt.itemsize * c, offset=off)
        rows = np.lib.stride_tricks.as_strided(raw, (n, dt.itemsize * c), (st, 1))
        v = np.ascontiguousarray(rows).view(dt).reshape(n, c)
        if a.get("normalized") and a["componentType"] in NORM:
            v = np.maximum(v.astype(np.float64) / NORM[a["componentType"]], -1.0)
        return v

    def view_bytes(vi):
        bv = g["bufferViews"][vi]
        o = bv.get("byteOffset", 0)
        return bins[bv["buffer"]][o: o + bv["byteLength"]]

    blob = bytearray()
    views, accs = [], []

    def push(arr, ctype, typ, target=None, normalized=False, mn=None, mx=None):
        while len(blob) % 4:
            blob.append(0)
        data = np.ascontiguousarray(arr)
        stride = None
        if data.ndim == 2 and data.itemsize * data.shape[1] % 4:   # vertex attributes must sit on 4-byte strides
            pad = 4 - data.itemsize * data.shape[1] % 4
            padded = np.zeros((data.shape[0], data.itemsize * data.shape[1] + pad), np.uint8)
            padded[:, : data.itemsize * data.shape[1]] = data.view(np.uint8).reshape(data.shape[0], -1)
            stride = padded.shape[1]
            data = padded
        v = {"buffer": 0, "byteOffset": len(blob), "byteLength": data.nbytes}
        if stride:
            v["byteStride"] = stride
        if target:
            v["target"] = target
        blob.extend(data.tobytes())
        views.append(v)
        a = {"bufferView": len(views) - 1, "componentType": ctype, "count": int(arr.shape[0]), "type": typ}
        if normalized:
            a["normalized"] = True
        if mn is not None:
            a["min"], a["max"] = mn, mx
        accs.append(a)
        return len(accs) - 1

    tris = 0
    keys = set()
    # ---- meshes: quantize per mesh, and move the de-quantize scale/offset onto a child node ----
    mesh_dq = {}
    for mi, m in enumerate(g["meshes"]):
        lo = np.full(3, np.inf)
        hi = np.full(3, -np.inf)
        for p in m["primitives"]:
            P = read(p["attributes"]["POSITION"]).astype(np.float64)
            lo, hi = np.minimum(lo, P.min(0)), np.maximum(hi, P.max(0))
        ctr, half = (lo + hi) / 2, np.maximum((hi - lo) / 2, 1e-9)
        mesh_dq[mi] = (ctr, half)
        for name in (m.get("extras") or {}).get("targetNames", []):
            keys.add(name)
        for p in m["primitives"]:
            A = p["attributes"]
            na = {}
            P0 = read(A["POSITION"]).astype(np.float64)
            P = (P0 - ctr) / half
            Pq = np.clip(np.round(P * 32767), -32767, 32767).astype(np.int16)
            na["POSITION"] = push(Pq, 5122, "VEC3", 34962, True, Pq.min(0).tolist(), Pq.max(0).tolist())
            Ns = None
            if "NORMAL" in A:
                N0 = read(A["NORMAL"]).astype(np.float64)
                Ns = N0 * half   # the node scale stretches normals by 1/half; pre-stretch
                Ns /= np.maximum(np.linalg.norm(Ns, axis=1, keepdims=True), 1e-12)
                na["NORMAL"] = push(np.round(Ns * 127).astype(np.int8), 5120, "VEC3", 34962, True)
            if "TEXCOORD_0" in A:
                T = read(A["TEXCOORD_0"]).astype(np.float64)
                if T.min() >= 0 and T.max() <= 1:
                    na["TEXCOORD_0"] = push(np.round(T * 65535).astype(np.uint16), 5123, "VEC2", 34962, True)
                else:
                    na["TEXCOORD_0"] = push(T.astype(np.float32), 5126, "VEC2", 34962)
            # shape keys: position deltas divided by the same half extents, normal deltas between the stretched normals
            nt = []
            for t in p.get("targets", []):
                tt = {}
                if "POSITION" in t:
                    D = read(t["POSITION"]).astype(np.float64) / half
                    tt["POSITION"] = push(D.astype(np.float32), 5126, "VEC3", 34962, False, D.min(0).tolist(), D.max(0).tolist())
                if "NORMAL" in t and Ns is not None:
                    Nt = (N0 + read(t["NORMAL"]).astype(np.float64)) * half
                    Nt /= np.maximum(np.linalg.norm(Nt, axis=1, keepdims=True), 1e-12)
                    tt["NORMAL"] = push((Nt - Ns).astype(np.float32), 5126, "VEC3", 34962)
                nt.append(tt)
            if nt:
                p["targets"] = nt
            else:
                p.pop("targets", None)
            p["attributes"] = na
            if "indices" in p:
                I = read(p["indices"]).ravel().astype(np.int64)
                tris += len(I) // 3
                small = int(I.max()) < 65535
                p["indices"] = push(I.astype(np.uint16 if small else np.uint32), 5123 if small else 5125, "SCALAR", 34963)
            else:
                tris += len(P0) // 3

    # ---- nodes: a node with a mesh keeps its transform; the mesh moves to a child that carries the de-quantize transform ----
    nodes = g["nodes"]
    for n in list(nodes):
        n.pop("skin", None)
        if "mesh" in n:
            ctr, half = mesh_dq[n["mesh"]]
            child = {"mesh": n.pop("mesh"), "translation": ctr.tolist(), "scale": half.tolist()}
            if "weights" in n:
                child["weights"] = n.pop("weights")
            nodes.append(child)
            n.setdefault("children", []).append(len(nodes) - 1)
    g.pop("skins", None)
    g.pop("animations", None)

    # ---- textures: shrink and re-save as JPEG (embedded images in a .glb as well as image files) ----
    normal_imgs = {g["textures"][m["normalTexture"]["index"]]["source"] for m in g.get("materials", []) if "normalTexture" in m}
    imgs = []
    for ii, im in enumerate(g.get("images", [])):
        if "uri" in im:
            pic = Image.open(os.path.join(base, im["uri"]))
        else:
            pic = Image.open(io.BytesIO(view_bytes(im["bufferView"])))
        pic = pic.convert("RGB")
        side = ntex if ii in normal_imgs else tex
        pic = pic.resize((min(side, pic.width), min(side, pic.height)), Image.LANCZOS)
        buf = io.BytesIO()
        pic.save(buf, "JPEG", quality=q, optimize=True)
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(buf.getvalue())})
        blob.extend(buf.getvalue())
        imgs.append({"bufferView": len(views) - 1, "mimeType": "image/jpeg"})
    if imgs:
        g["images"] = imgs
    for m in g.get("materials", []):
        m.pop("extensions", None)   # KHR_materials_* extras the game does not need

    while len(blob) % 4:
        blob.append(0)
    g["accessors"], g["bufferViews"] = accs, views
    g["buffers"] = [{"byteLength": len(blob)}]
    g["extensionsUsed"] = ["KHR_mesh_quantization"]
    g["extensionsRequired"] = ["KHR_mesh_quantization"]
    g.setdefault("asset", {})["generator"] = "Ink tools/pack-model.py (from Prairie Engine Works)"
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    glb += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    open(out, "wb").write(glb)

    # ---- what the game will see (the mesh bounds, ignoring node transforms, which the exporter leaves at identity
    #      once you Apply All Transforms in Blender as docs/BLENDER.md asks) ----
    lo = np.min([c - h for c, h in mesh_dq.values()], axis=0)
    hi = np.max([c + h for c, h in mesh_dq.values()], axis=0)
    size = hi - lo
    print("%s  %d KB" % (out, len(glb) // 1024))
    print("  triangles   %d%s" % (tris, ("  OVER the budget of %d" % budget) if budget and tris > budget else ""))
    print("  size (m)    %.3f wide (x)  %.3f tall (y)  %.3f deep (z)" % tuple(size))
    print("  origin      x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f" % (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    if lo[1] < -0.005:
        print("  note        the model goes %.3f m below its origin: props sit on the floor, so the origin should be at the base" % -lo[1])
    if size.max() > 3:
        print("  note        bigger than 3 m: check the scene units are metres (Blender: Unit Scale 1.0)")
    print("  materials   %s" % ", ".join(m.get("name", "?") for m in g.get("materials", [])) or "none")
    if keys:
        print("  shape keys  %s" % ", ".join(sorted(keys)))
    for n in nodes:
        if any(abs(v - 1) > 1e-6 for v in n.get("scale", [1, 1, 1])) and "mesh" not in n and "children" in n and not n.get("name", "").startswith("_"):
            print("  note        node %s has a scale: Apply All Transforms before exporting" % n.get("name", "?"))
            break


if __name__ == "__main__":
    main()
