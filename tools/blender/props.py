"""tools/blender/props.py: the shop props, models/ink-*.glb, made by script (the Blender batch, PR 11).

  python tools/blender/props.py [chair station ...] [--out DIR] [--no-pack]      (no names: all fourteen)

One function per slot in ASSETS.props (src/vis/assets.js) / docs/BLENDER.md section 2. Each prop is modelled in GAME axes
(metres, +Y up, its front facing +Z, origin where the slot's `at` puts it: on the floor under the prop's centre, or on
the back of a wall piece), so the numbers read straight against src/vis/studio.js's coded stand-ins; the builder turns
it into Blender axes (front -Y) at the end, and the glTF exporter's +Y up turns it back. The slot's `rot` turns it for
the room in the game: nothing here is rotated for the room.
Shapes are real but cheap: bevelled boxes, lathed (spun) profiles for anything round, swept profiles for frames and
tubes, a Text object for the sign. Edges sharper than 40 degrees get split normals, the rest shade smooth. Materials are
Principled (Base Color, Roughness, Metallic, Emission for the bulb and the sign's letters) named ink_<prop>_<surface>;
the wood uses the dado planks photo texture already in models/textures/ (Poly Haven, CC0) on box-projected UVs, tinted
towards the coded wood colour. Nothing is random (the plant's leaves come from a fixed table), so every run gives the
same files. Nothing carries a real brand or name; the sign says ИГЛА ("needle", an invented shop word), as the coded one does.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  (first: bmesh and mathutils come with it)
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import inkbl as K  # noqa: E402

WOOD_TEX = os.path.join(K.MODELS, "textures", "dado-planks.jpg")
TAU = math.tau


# ---------------------------------------------------------------- the builder
class Prop:
    """accumulates parts (bmesh, game axes) with a material each; .obj() makes the Blender object"""

    def __init__(self, name):
        self.name, self.bm, self.mats = name, bmesh.new(), []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def add(self, part, m, uv=None, sharp=40, smooth=True):
        """merge a part (bmesh in game axes). uv: metres per texture repeat for a box projection (u along the part's
        longest side), else every corner at (0.5, 0.5)"""
        idx = self.mi(m)
        part.normal_update()
        luv = part.loops.layers.uv.verify()
        if uv:
            co = np.array([v.co[:] for v in part.verts]) if part.verts else np.zeros((1, 3))
            ext = co.max(0) - co.min(0)
            longest = int(np.argmax(ext))
        for f in part.faces:
            f.material_index = idx
            f.smooth = smooth
            n = np.abs(np.array(f.normal[:]))
            ax = [a for a in range(3) if a != int(np.argmax(n))]      # project along the face's main axis
            if uv and ax[1] == longest:
                ax = ax[::-1]                                          # the grain runs along the part's longest side
            for lp in f.loops:
                if uv:
                    p = lp.vert.co
                    lp[luv].uv = (p[ax[0]] / uv, p[ax[1]] / uv + 0.31)
                else:
                    lp[luv].uv = (0.5, 0.5)
        for e in part.edges:
            if len(e.link_faces) == 2:
                e.smooth = e.calc_face_angle(0) < math.radians(sharp)
            else:
                e.smooth = True
        me = bpy.data.meshes.new("part")
        part.to_mesh(me)
        part.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return self

    def obj(self):
        bm = self.bm
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.transform(Matrix.Rotation(math.radians(90), 4, "X"))     # game (x, y, z) -> Blender (x, -z, y)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def _bm():
    return bmesh.new()


def xform(bm, loc=(0, 0, 0), rot=None, scale=None):
    """rot: (axis 'x'|'y'|'z', radians) or a list of them, or a 3x3 matrix"""
    M = Matrix.Identity(4)
    if scale is not None:
        s = scale if hasattr(scale, "__len__") else (scale,) * 3
        M = Matrix.Diagonal((s[0], s[1], s[2], 1.0)) @ M
    if rot is not None:
        if isinstance(rot, Matrix):
            M = rot.to_4x4() @ M
        else:
            for ax, a in (rot if isinstance(rot[0], (list, tuple)) else [rot]):
                M = Matrix.Rotation(a, 4, ax.upper()) @ M
    M = Matrix.Translation(Vector(loc)) @ M
    bm.transform(M)
    return bm


def box(size, loc=(0, 0, 0), bevel=0.0, seg=1, rot=None):
    bm = _bm()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.transform(Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type="OFFSET", segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)
    return xform(bm, loc, rot)


def lathe(prof, segs=16, loc=(0, 0, 0), rot=None, cap_top=False, cap_bot=False, arc=None):
    """a surface of revolution round +Y from (radius, y) points, bottom to top; caps close an end with a fan"""
    bm = _bm()
    a0, a1 = arc if arc else (0.0, TAU)
    closed = arc is None
    n = segs if closed else segs + 1
    rings = []
    for r, y in prof:
        ring = []
        for k in range(n):
            t = a0 + (a1 - a0) * k / segs
            ring.append(bm.verts.new((r * math.sin(t), y, r * math.cos(t))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for k in range(segs):
            k2 = (k + 1) % n
            q = [A[k], A[k2], B[k2], B[k]]
            if len(set(id(v) for v in q)) == 4:
                try:
                    bm.faces.new(q)
                except ValueError:
                    pass
    if cap_bot and closed:
        bm.faces.new(rings[0][::-1])
    if cap_top and closed:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)   # (the winding is already outward: no recalc on open shells)
    return xform(bm, loc, rot)


def cyl(r, h, segs=12, loc=(0, 0, 0), rot=None, r2=None, caps=True):
    """a cylinder (or a cone with r2) standing on y = 0 .. h, then moved"""
    r2 = r if r2 is None else r2
    return lathe([(r, 0), (r2, h)], segs, loc, rot, cap_top=caps, cap_bot=caps)


def tube(path, r, segs=8, caps=True):
    """a round tube along a polyline of points"""
    bm = _bm()
    P = [Vector(p) for p in path]
    rings, prevN = [], None
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        n = prevN if prevN is not None else (Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0)))
        n = (n - t * n.dot(t)).normalized()
        prevN = n
        b = t.cross(n)
        rings.append([bm.verts.new(p + (n * math.cos(TAU * k / segs) + b * math.sin(TAU * k / segs)) * r) for k in range(segs)])
    for i in range(len(rings) - 1):
        for k in range(segs):
            bm.faces.new([rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]])
    if caps:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    return bm


def frame(w, h, prof, loc=(0, 0, 0), rot=None, back=True):
    """a rectangular moulding swept round a w x h outer edge, mitred: prof = [(inset from the outer edge, z)], outside to
    inside; z = 0 is the back. back=True closes the back face of the moulding"""
    bm = _bm()
    loops = []
    for d, z in prof:
        x, y = w / 2 - d, h / 2 - d
        loops.append([bm.verts.new(c) for c in ((-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z))])
    for i in range(len(loops) - 1):
        A, B = loops[i], loops[i + 1]
        for k in range(4):
            bm.faces.new([A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]])
    if back:                                   # close the ring from the inner edge back round to the outer one
        A, B = loops[-1], loops[0]
        for k in range(4):
            bm.faces.new([A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]])
    return xform(bm, loc, rot)


def quad(w, h, loc=(0, 0, 0), rot=None):
    bm = _bm()
    v = [bm.verts.new(c) for c in ((-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0))]
    bm.faces.new(v)
    return xform(bm, loc, rot)


def text(s, size, depth, loc=(0, 0, 0), res=2, space=1.0):
    """a Text object turned into a mesh (Blender's built-in font), centred, its face towards +Z"""
    c = bpy.data.curves.new("txt", "FONT")
    c.body, c.size, c.extrude, c.resolution_u = s, size, depth, res
    c.align_x, c.align_y = "CENTER", "CENTER"
    c.space_character = space
    c.fill_mode = "BOTH"
    ob = bpy.data.objects.new("txt", c)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    bpy.data.objects.remove(ob)
    bm = _bm()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    # the font's +Z is its face already (text lies in the XY plane); move so its back sits at z = 0
    return xform(bm, (loc[0], loc[1], loc[2] + depth))


def M(prop, surface, color, rough=0.8, metal=0.0, **kw):
    return K.mat("ink_%s_%s" % (prop, surface), color, rough, metal, **kw)


def wood(prop, surface="wood"):
    return K.mat("ink_%s_%s" % (prop, surface), "#ffffff", 0.7, 0.0, image=WOOD_TEX)


# the coded colours (src/vis/studio.js) and a warm tint for the photo wood (multiplies the texture, linear)
C = dict(leather="#231b17", steel="#9a968e", dark="#151210", cream="#efe5d2", paper="#f4f1ea", brass="#b48a46",
         shade="#2b2b2b", rug="#5c2a22", green="#3f6b45", pot="#8a4b2e", wood="#3a2618")
WOOD_TINT = [1.0, 0.78, 0.6, 1.0]


# ---------------------------------------------------------------- the props
def chair():
    """the tattoo chair: padded seat, seat pan, tilt block, hydraulic column with a collar, disc base, pump pedal.
    No armrests (the game's move per body shape) and no backrest (it would hide the back)"""
    P = Prop("chair")
    lea, st, dk = M("chair", "leather", C["leather"], 0.52), M("chair", "steel", C["steel"], 0.3, 0.75), M("chair", "dark", C["dark"], 0.6)
    P.add(box((0.50, 0.075, 0.46), (0, 0.4325, 0), bevel=0.032, seg=4), lea)         # the cushion, top at 0.47 (rounder since 0.1.18.0)
    P.add(box((0.48, 0.012, 0.44), (0, 0.392, 0), bevel=0.004), dk)                   # piping under the cushion
    P.add(box((0.52, 0.022, 0.48), (0, 0.375, 0), bevel=0.008, seg=2), dk)            # seat pan
    P.add(box((0.20, 0.05, 0.22), (0, 0.34, -0.01), bevel=0.008, seg=1), dk)          # tilt block
    P.add(box((0.16, 0.012, 0.012), (0.16, 0.335, 0.08), bevel=0.003), st)            # the tilt lever
    P.add(lathe([(0.03, 0.31), (0.05, 0.31), (0.05, 0.30), (0.045, 0.29), (0.045, 0.11), (0.052, 0.10), (0.052, 0.075),
                 (0.06, 0.065), (0.06, 0.04)], 20, cap_top=True), st)                 # column with its collar and boot
    P.add(lathe([(0.0, 0.0), (0.28, 0.0), (0.297, 0.004), (0.30, 0.012), (0.299, 0.022), (0.29, 0.032), (0.27, 0.04), (0.08, 0.046),
                 (0.06, 0.05)], 32, cap_top=True), M("chair", "base", "#2a2826", 0.4, 0.65))  # disc base, its rim rounded
    P.add(box((0.05, 0.016, 0.12), (0.0, 0.025, 0.31), bevel=0.004, rot=("x", -0.25)), dk)     # pump pedal
    P.add(box((0.02, 0.02, 0.06), (0.0, 0.03, 0.26)), st)
    return P


def station():
    """your trolley: steel tray with a lip, lower shelf, four legs on castors, ink caps, a paper roll on its holder, a spray
    bottle and a box of gloves. The machine (its own slot) lies at x -0.08, z +0.05, so that corner stays clear"""
    P = Prop("station")
    st = M("station", "steel", C["steel"], 0.3, 0.75)
    dk = M("station", "rubber", "#1a1714", 0.7)
    P.add(box((0.46, 0.012, 0.36), (0, 0.804, 0), bevel=0.004), st)                    # top tray, surface at 0.81
    for sx, sz, w, d in ((0, 0.18, 0.46, 0.008), (0, -0.18, 0.46, 0.008), (0.23, 0, 0.008, 0.36), (-0.23, 0, 0.008, 0.36)):
        P.add(box((w, 0.02, d), (sx, 0.82, sz)), st)                                    # the tray's lip
    P.add(box((0.46, 0.012, 0.36), (0, 0.28, 0), bevel=0.004), st)                     # lower shelf
    for dx, dz in ((-0.2, -0.15), (0.2, -0.15), (-0.2, 0.15), (0.2, 0.15)):
        P.add(cyl(0.011, 0.76, 8, (dx, 0.045, dz)), st)
        P.add(cyl(0.018, 0.02, 8, (dx, 0.03, dz)), st)
        P.add(cyl(0.022, 0.016, 10, (dx, 0.022, dz), rot=("z", math.pi / 2)), dk)      # castor wheel
    caps = ["#16120e", "#9a1d1d", "#1f4f8a", "#2f7a3a", "#d9a21a", "#5e3a7a"]
    for i, c in enumerate(caps):
        P.add(lathe([(0.0, 0.0), (0.008, 0.0), (0.0095, 0.012), (0.0085, 0.012), (0.0, 0.009)], 8,
                    (0.05 + (i % 3) * 0.03, 0.81, -0.06 + (i // 3) * 0.03)), M("station", "ink%d" % i, c, 0.35))
    paper = M("station", "paper", C["paper"], 0.95)
    P.add(lathe([(0.012, 0.0), (0.05, 0.0), (0.05, 0.2), (0.012, 0.2)], 16, (0.14, 0.86, 0.09), rot=("z", math.pi / 2)), paper)  # roll
    P.add(cyl(0.006, 0.24, 6, (0.26, 0.91, 0.09), rot=("z", math.pi / 2)), st)          # spindle across
    for x in (0.02, 0.26):
        P.add(box((0.008, 0.1, 0.02), (x - 0.02 + (0.0 if x < 0.1 else 0.0), 0.865, 0.09)), st)
    bottle = M("station", "bottle", "#cfd8d4", 0.25)
    P.add(lathe([(0.0, 0.0), (0.03, 0.0), (0.032, 0.01), (0.032, 0.11), (0.02, 0.13), (0.012, 0.14)], 12,
                (0.15, 0.81, -0.1), cap_top=True), bottle)
    P.add(box((0.022, 0.03, 0.05), (0.15, 0.965, -0.112), bevel=0.004), dk)             # trigger head
    P.add(box((0.008, 0.025, 0.012), (0.15, 0.94, -0.128)), dk)
    gl = M("station", "box", C["cream"], 0.9)
    P.add(box((0.30, 0.08, 0.14), (-0.05, 0.326, 0.0), bevel=0.003), gl)               # box of gloves on the shelf
    P.add(box((0.16, 0.002, 0.05), (-0.05, 0.367, 0.0)), M("station", "glove", "#6d8fb3", 0.6))
    return P


def machine():
    """the coil machine lying on its side: tip, tube, grip, frame, two coils, armature bar, binding posts, a clip cord.
    Origin at its underside (it rests on the trolley top); its length runs along x"""
    P = Prop("machine")
    st = M("machine", "steel", C["steel"], 0.25, 0.85)
    fr = M("machine", "frame", "#1e1b19", 0.45, 0.6)
    br = M("machine", "brass", C["brass"], 0.35, 0.8)
    coil = M("machine", "coil", "#5a2316", 0.4, 0.3)
    cord = M("machine", "cord", "#1b1b1b", 0.6)
    y = 0.012                                                       # the axis height above the tray
    P.add(cyl(0.007, 0.05, 10, (-0.005, y, 0), rot=("z", math.pi / 2), r2=0.007), st)        # tube
    P.add(cyl(0.007, 0.016, 10, (-0.055, y, 0), rot=("z", math.pi / 2), r2=0.0025), st)      # tip
    P.add(lathe([(0.0115, 0.0), (0.0115, 0.004), (0.0105, 0.006), (0.0115, 0.008), (0.0115, 0.012), (0.0105, 0.014),
                 (0.0115, 0.016), (0.0115, 0.03), (0.009, 0.034)], 9, (-0.005, y, 0), rot=("z", math.pi / 2), cap_top=True, cap_bot=True), st)  # knurled grip
    P.add(box((0.068, 0.006, 0.03), (0.03, 0.003, 0.0), bevel=0.0015), fr)                    # side plate on the tray
    P.add(box((0.012, 0.03, 0.03), (0.0, 0.016, 0.0), bevel=0.002), fr)                       # front of the frame
    P.add(box((0.01, 0.03, 0.03), (0.06, 0.016, 0.0), bevel=0.002), fr)                       # back of the frame
    for dz in (-0.008, 0.008):
        P.add(cyl(0.0085, 0.032, 10, (0.046, 0.017, dz), rot=("z", math.pi / 2)), coil)       # coils
    P.add(box((0.05, 0.004, 0.012), (0.03, 0.034, 0.0), bevel=0.001), st)                     # armature bar
    P.add(cyl(0.0025, 0.012, 6, (0.012, 0.03, 0.0)), br)                                       # contact screw
    for dz in (-0.011, 0.011):
        P.add(cyl(0.003, 0.01, 6, (0.064, 0.024, dz), rot=("z", -math.pi / 2)), br)            # binding posts
    path = [(0.074, 0.024, 0.0), (0.09, 0.022, 0.006), (0.105, 0.012, 0.02), (0.112, 0.004, 0.04), (0.11, 0.004, 0.07)]
    P.add(tube(path, 0.0025, 6), cord)
    return P


def rotary():
    """the rotary pen lying on the tray beside the coil (0.1.12.0): a turned body in one lathe profile (motor cap at the
    back, the body with a stroke ring, a knurled grip, a clear needle cartridge and the needle tip), a short cord out of the
    back. No logo, no maker's name. Origin at its underside, the centre of its length; the tip points to -x"""
    P = Prop("rotary")
    body = M("rotary", "body", "#2e3b3f", 0.45, 0.5)
    ring = M("rotary", "ring", "#7a2a22", 0.5, 0.3)
    st = M("rotary", "steel", C["steel"], 0.25, 0.85)
    cart = M("rotary", "cartridge", "#cfd6d8", 0.3)
    cord = M("rotary", "cord", "#1b1b1b", 0.6)
    y = 0.013                                                        # the axis height above the tray (the body's radius)
    # (radius, distance from the back end); spun round +Y, then laid along -x with the back end at x +0.068
    seg = lambda prof, m, segs=14: P.add(lathe([(r, d) for r, d in prof], segs, (0.068, y, 0), rot=("z", math.pi / 2), cap_top=prof[-1][0] > 0, cap_bot=prof[0][0] > 0), m)
    seg([(0.0, 0.0), (0.009, 0.0), (0.0115, 0.004), (0.012, 0.03), (0.013, 0.034), (0.013, 0.068)], body)          # motor cap and body
    seg([(0.0145, 0.068), (0.0145, 0.076)], ring)                                                                   # stroke ring
    seg([(0.011, 0.076), (0.0115, 0.082), (0.0105, 0.086), (0.0115, 0.090), (0.0105, 0.094), (0.0115, 0.098),
         (0.0105, 0.102), (0.0115, 0.106), (0.0105, 0.110), (0.011, 0.116)], st, 12)                              # knurled grip
    seg([(0.010, 0.116), (0.009, 0.124), (0.006, 0.132)], cart, 12)                                                 # cartridge
    seg([(0.003, 0.132), (0.0012, 0.142), (0.0, 0.146)], st, 8)                                                     # needle tip
    path = [(0.068, y, 0.0), (0.082, 0.010, 0.004), (0.096, 0.004, 0.014), (0.104, 0.003, 0.034), (0.104, 0.003, 0.06)]
    P.add(tube(path, 0.003, 6), cord)
    return P


def pen():
    """the wireless pen (0.1.15.0), at the rotary's spot on the tray when the kit uses it: one turned body in lathe profiles
    (the battery collar at the back with its charge light, a slim body, a stroke dial, a rubber grip, a clear needle
    cartridge and the needle tip). No cord, no logo, no maker's name. Origin at its underside, the centre of its length;
    the tip points to -x, as the rotary's does"""
    P = Prop("pen")
    collar = M("pen", "collar", "#a8733f", 0.35, 0.7)
    body = M("pen", "body", "#25282d", 0.4, 0.4)
    dial = M("pen", "dial", "#4a4f55", 0.5, 0.5)
    grip = M("pen", "grip", "#3b3e42", 0.85)
    cart = M("pen", "cartridge", "#cfd6d8", 0.3)
    st = M("pen", "steel", C["steel"], 0.25, 0.85)
    led = M("pen", "light", "#7fe0a0", 0.4, emit="#5fd88a", emit_strength=1.5)
    y = 0.0135                                                       # the axis height above the tray (the collar's radius)
    # (radius, distance from the back end); spun round +Y, then laid along -x with the back end at x +0.074
    seg = lambda prof, m, segs=12: P.add(lathe(prof, segs, (0.074, y, 0), rot=("z", math.pi / 2), cap_top=prof[-1][0] > 0, cap_bot=prof[0][0] > 0), m)
    seg([(0.0, 0.0), (0.010, 0.0), (0.0135, 0.003), (0.0135, 0.024)], collar)                                      # battery collar
    seg([(0.0135, 0.024), (0.0105, 0.026), (0.0105, 0.078)], body)                                                 # body
    seg([(0.0122, 0.078), (0.0122, 0.085)], dial)                                                                  # stroke dial
    seg([(0.0108, 0.085), (0.0104, 0.100), (0.0108, 0.115), (0.0104, 0.124)], grip)                               # grip
    seg([(0.0098, 0.124), (0.009, 0.132), (0.006, 0.140)], cart, 10)                                              # cartridge
    seg([(0.003, 0.140), (0.0012, 0.150), (0.0, 0.154)], st, 8)                                                    # needle tip
    P.add(box((0.005, 0.003, 0.005), (0.062, 2 * y, 0.0)), led)                                                   # charge light
    return P


def lamp():
    """the angle lamp: weighted base, pole, a two-part arm with joints, the shade opening at (-0.55, 1.50, +0.33) pointing
    down at the forearm where the game's light sits, a bulb inside (ink_lamp_bulb, emissive)"""
    P = Prop("lamp")
    dk = M("lamp", "black", C["dark"], 0.45, 0.4)
    sh = M("lamp", "shade", C["shade"], 0.5, 0.3, double=True)
    inner = M("lamp", "inner", "#d9d2c4", 0.6, double=True)
    bulb = M("lamp", "bulb", "#fff4d6", 0.3, emit="#ffd9a0", emit_strength=2.5)
    st = M("lamp", "steel", C["steel"], 0.3, 0.75)
    P.add(lathe([(0.0, 0.0), (0.145, 0.0), (0.15, 0.008), (0.15, 0.022), (0.12, 0.034), (0.03, 0.04), (0.018, 0.05)], 16, cap_top=True), dk)
    P.add(cyl(0.013, 1.58, 10, (0, 0.04, 0)), st)
    P.add(lathe([(0.0, -0.012), (0.018, -0.01), (0.02, 0.0), (0.018, 0.01), (0.0, 0.012)], 10, (0, 1.62, 0)), dk)  # knuckle
    o = Vector((-0.55, 1.50, 0.33))                                     # the shade's opening
    a = Vector((-0.81, 0.74, 0.61)) - o                                 # towards the work (the light's target)
    a.normalize()
    back = o - a * 0.13
    elbow = Vector((-0.24, 1.80, 0.12))
    P.add(tube([(0, 1.62, 0), elbow[:]], 0.009, 8), st)
    P.add(tube([elbow[:], (back + Vector((0, 0.02, 0)))[:]], 0.008, 8), st)
    P.add(lathe([(0.0, -0.014), (0.016, -0.012), (0.017, 0.0), (0.016, 0.012), (0.0, 0.014)], 10, elbow[:]), dk)
    R = Vector((0, 1, 0)).rotation_difference(-a).to_matrix()          # the shade's +Y points back along -a
    prof = [(0.085, 0.0), (0.08, 0.03), (0.06, 0.08), (0.035, 0.115), (0.02, 0.13)]
    P.add(lathe(prof, 18, o[:], R, cap_top=True), sh)
    P.add(lathe([(r - 0.003, y + 0.002) for r, y in prof[:-1]], 18, o[:], R), inner)
    P.add(lathe([(0.0, -0.028), (0.02, -0.022), (0.028, -0.005), (0.022, 0.012), (0.012, 0.022), (0.0, 0.026)], 12,
                (o + a * -0.055)[:], R), bulb)
    return P


def stool():
    """your rolling stool: round padded seat, gas column, a five-star base on castors, a foot ring"""
    P = Prop("stool")
    lea, st, dk = M("stool", "leather", C["leather"], 0.52), M("stool", "steel", C["steel"], 0.3, 0.75), M("stool", "rubber", "#1a1714", 0.7)
    P.add(lathe([(0.0, 0.52), (0.165, 0.52), (0.18, 0.53), (0.185, 0.55), (0.16, 0.58), (0.0, 0.582)], 16), lea)
    P.add(cyl(0.12, 0.02, 14, (0, 0.5, 0)), dk)
    P.add(cyl(0.025, 0.44, 10, (0, 0.07, 0)), st)
    P.add(lathe([(0.17, -0.006), (0.176, 0.0), (0.17, 0.006), (0.164, 0.0), (0.17, -0.006)], 10, (0, 0.3, 0)), st)   # foot ring
    for i in range(5):
        t = TAU * i / 5
        P.add(box((0.022, 0.016, 0.2), (0.1 * math.sin(t), 0.07, 0.1 * math.cos(t)), rot=("y", t)), st)
        P.add(cyl(0.016, 0.022, 6, (0.2 * math.sin(t) + 0.011, 0.02, 0.2 * math.cos(t)), rot=("z", math.pi / 2)), dk)
    P.add(cyl(0.04, 0.03, 8, (0, 0.06, 0)), st)
    return P


def shelves():
    """wall shelves: two planks on brackets, jars, ink bottles, sketchbooks. The back is 0.12 behind the origin, on the wall"""
    P = Prop("shelves")
    w = wood("shelves")
    dk = M("shelves", "bracket", C["dark"], 0.5, 0.5)
    jars = ["#4c6a72", "#8b6b3d", "#6d3b2e", "#53624a"]
    glass = [M("shelves", "jar%d" % i, c, 0.3) for i, c in enumerate(jars)]
    lid = M("shelves", "lid", C["brass"], 0.4, 0.7)
    for k, y in enumerate((1.25, 1.62)):
        P.add(box((1.1, 0.03, 0.24), (0, y, 0), bevel=0.004), w, uv=0.9)
        for x in (-0.42, 0.42):
            P.add(box((0.02, 0.16, 0.012), (x, y - 0.095, -0.114)), dk)
            P.add(box((0.02, 0.012, 0.2), (x, y - 0.021, -0.01)), dk)
        for i in range(4):
            x = -0.4 + i * 0.25 - (0.0 if k else 0.0)
            if k == 0 and i == 3:
                continue                                         # the sketchbooks stand there
            P.add(lathe([(0.0, 0.0), (0.04, 0.0), (0.04, 0.1), (0.03, 0.115)], 8, (x, y + 0.015, 0.0)), glass[(i + 2 * k) % 4])
            P.add(cyl(0.032, 0.014, 8, (x, y + 0.128, 0.0)), lid)
    ink = [M("shelves", "ink%d" % i, c, 0.35) for i, c in enumerate(("#16120e", "#7a1d18", "#1f3f6a"))]
    for i in range(3):
        P.add(lathe([(0.0, 0.0), (0.018, 0.0), (0.018, 0.05), (0.008, 0.06), (0.008, 0.07), (0.0, 0.07)], 6,
                    (-0.28 + i * 0.045, 1.635, 0.07)), ink[i])
    books = [("#2c3540", 0.028), ("#6b2c22", 0.022), ("#3f5240", 0.03), ("#1d1a18", 0.02)]
    x = 0.41
    for c, t in books:                                            # standing sketchbooks at the right-hand end
        P.add(box((t, 0.21, 0.17), (x, 1.265 + 0.105, 0.0)), M("shelves", "book%s" % c[1:], c, 0.9))
        x += t + 0.004
    P.add(box((0.2, 0.04, 0.16), (-0.33, 1.285, 0.02)), M("shelves", "book2c3540", "#2c3540", 0.9))   # a stack lying down
    P.add(box((0.18, 0.03, 0.15), (-0.33, 1.32, 0.02)), M("shelves", "book6b2c22", "#6b2c22", 0.9))
    return P


def bench():
    """the waiting bench: an upholstered seat and back on a wooden frame. Its front faces +Z (the slot turns it to the room)"""
    P = Prop("bench")
    lea = M("bench", "leather", C["leather"], 0.5)
    w = wood("bench")
    P.add(box((1.38, 0.07, 0.40), (0, 0.465, 0.01), bevel=0.027, seg=3), lea)          # seat cushion, top at 0.50
    P.add(box((1.38, 0.36, 0.06), (0, 0.70, -0.20), bevel=0.024, seg=2, rot=("x", -0.08)), lea)   # back cushion, top at about 0.9
    for x in (-0.68, 0.68):
        P.add(box((0.05, 0.43, 0.05), (x, 0.215, 0.17), bevel=0.006), w, uv=0.9)         # front legs
        P.add(box((0.05, 0.88, 0.05), (x, 0.44, -0.2), bevel=0.006), w, uv=0.9)          # back legs, up the back
        P.add(box((0.05, 0.05, 0.42), (x, 0.405, -0.015), bevel=0.006), w, uv=0.9)       # side rail under the seat
        P.add(box((0.05, 0.04, 0.38), (x, 0.13, -0.015), bevel=0.005), w, uv=0.9)        # low stretcher
    P.add(box((1.31, 0.05, 0.04), (0, 0.405, 0.17), bevel=0.006), w, uv=0.9)             # front rail
    P.add(box((1.31, 0.05, 0.04), (0, 0.405, -0.2), bevel=0.006), w, uv=0.9)             # back rail
    return P


def flashframe():
    """an empty wooden frame for the flash wall, 2.1 x 1.09, origin at the centre of its back; the game draws the sheets"""
    P = Prop("flashframe")
    P.add(frame(2.1, 1.09, [(0.0, 0.0), (0.0, 0.03), (0.002, 0.036), (0.007, 0.04), (0.014, 0.041), (0.02, 0.04),
                              (0.025, 0.036), (0.028, 0.032), (0.034, 0.03), (0.038, 0.027), (0.042, 0.022), (0.046, 0.02),
                              (0.05, 0.018), (0.05, 0.006)]), wood("flashframe"), uv=0.9, sharp=50)   # a rounder moulding (0.1.18.0)
    return P


def sign():
    """your studio's sign: a dark board with a brass edge and ИГЛА in lit letters (as the coded one), origin at the
    centre of its back"""
    P = Prop("sign")
    board = M("sign", "board", "#1b120c", 0.6)
    brass = M("sign", "brass", "#c9a35e", 0.35, 0.8, double=True)
    glow = M("sign", "glow", "#f0c674", 0.5, emit="#f0c674", emit_strength=1.6)
    P.add(box((0.98, 0.23, 0.022), (0, 0, 0.011), bevel=0.005, seg=2), board)
    P.add(frame(1.0, 0.25, [(0.0, 0.0), (0.0, 0.024), (0.0015, 0.028), (0.004, 0.0305), (0.007, 0.031), (0.01, 0.0302),
                            (0.0125, 0.028), (0.014, 0.025), (0.014, 0.022)], back=False), brass, sharp=50)
    P.add(frame(0.93, 0.18, [(0.0, 0.0225), (0.0, 0.0245), (0.004, 0.0245), (0.004, 0.0225)], back=False), brass)    # inner line
    t = text("ИГЛА", 0.17, 0.004, (0, -0.006, 0.0222), res=3, space=1.5)   # Inter has Cyrillic
    xform(t, scale=(0.86, 1.0, 1.0))                                   # condensed, like the coded sign's Oswald
    P.add(t, glow, sharp=30)
    return P


# the plant's leaves: (angle round the pot, lean from upright, length of the stem, leaf length, leaf width, twist)
LEAVES = [(0.0, 0.25, 0.55, 0.20, 0.09, 0.2), (0.9, 0.55, 0.42, 0.22, 0.10, -0.3), (1.8, 0.35, 0.62, 0.21, 0.09, 0.4),
          (2.7, 0.65, 0.36, 0.2, 0.09, 0.1), (3.5, 0.3, 0.5, 0.23, 0.1, -0.2), (4.3, 0.6, 0.4, 0.21, 0.095, 0.3),
          (5.1, 0.4, 0.58, 0.22, 0.1, -0.4), (5.8, 0.75, 0.3, 0.18, 0.085, 0.0), (0.45, 0.85, 0.26, 0.17, 0.08, 0.2),
          (2.25, 0.15, 0.66, 0.19, 0.085, -0.1), (3.9, 0.9, 0.24, 0.17, 0.08, 0.3), (1.35, 0.45, 0.5, 0.2, 0.09, 0.0)]


def plant():
    """a potted rubber plant in the corner: terracotta pot with a rim, soil, a dozen stems with folded leaves (from LEAVES,
    no randomness)"""
    P = Prop("plant")
    pot = M("plant", "pot", C["pot"], 0.9)
    soil = M("plant", "soil", "#2a1c14", 1.0)
    leaf = M("plant", "leaf", C["green"], 0.55, double=True)
    stem = M("plant", "stem", "#4d6b3a", 0.8)
    P.add(lathe([(0.0, 0.0), (0.12, 0.0), (0.125, 0.01), (0.15, 0.25), (0.165, 0.255), (0.168, 0.3), (0.152, 0.3), (0.148, 0.265)], 20), pot)
    P.add(cyl(0.148, 0.002, 16, (0, 0.27, 0), caps=True), soil)
    for ang, lean, sl, ll, lw, tw in LEAVES:
        d = Vector((math.sin(lean) * math.sin(ang), math.cos(lean), math.sin(lean) * math.cos(ang)))
        base = Vector((0.02 * math.sin(ang), 0.27, 0.02 * math.cos(ang)))
        mid = base + Vector((0, sl * 0.5, 0)) + Vector((d.x, 0, d.z)) * sl * 0.25
        tip = base + d * sl
        P.add(tube([base[:], mid[:], tip[:]], 0.004, 5, caps=False), stem)
        # the leaf: a folded ellipse along the direction it leans, out and slightly down
        out = Vector((math.sin(ang), -0.35, math.cos(ang))).normalized()
        side = out.cross(Vector((0, 1, 0))).normalized()
        side = Matrix.Rotation(tw, 3, out) @ side
        up = side.cross(out).normalized()
        bm = _bm()
        n = 5                                                    # (4 rows until 0.1.18.0: the leaves curve more smoothly)
        rows = []
        for i in range(n + 1):
            t = i / n
            half = lw * 0.5 * math.sin(math.pi * min(1.0, t * 1.08)) if t > 0 else 0.0
            c = tip + out * (ll * t) - up * (0.04 * t * t)
            rows.append([bm.verts.new(c + side * s * half + up * (0.012 if s else 0.0) * math.sin(math.pi * t)) for s in (-1, 0, 1)])
        for i in range(n):
            for k in range(2):
                q = [rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]]
                if len(set(q)) == 4:
                    bm.faces.new(q)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        P.add(bm, leaf, sharp=89)
    return P


def photos():
    """six framed photos of healed work in a 3 x 2 grid, origin at the centre on the back: wooden frames, cream mounts and
    a plain print panel in each (no real photos, no real tattoos)"""
    P = Prop("photos")
    w = wood("photos")
    mount = M("photos", "mount", C["cream"], 0.9)
    prints = [M("photos", "print%d" % i, c, 0.6) for i, c in enumerate(("#b8a58c", "#a99a86", "#c2b29b"))]
    for i in range(6):
        x, y = (i // 2 - 1) * 0.42, (i % 2 - 0.5) * 0.4
        P.add(frame(0.24, 0.30, [(0.0, 0.0), (0.0, 0.024), (0.003, 0.029), (0.008, 0.031), (0.016, 0.03), (0.021, 0.027),
                                 (0.024, 0.022)], (x, y, 0)), w, uv=0.9, sharp=50)
        P.add(quad(0.198, 0.258, (x, y, 0.022)), mount)
        P.add(quad(0.12, 0.16, (x, y + 0.008, 0.0225)), prints[i % 3])
    return P


def trophies():
    """a narrow open cabinet (0.7 wide, 0.3 deep, 1.8 tall, its back on the wall) with convention trophies: cups, plaques,
    a framed certificate, a medal on a stand. Invented: no names or text on any of them"""
    P = Prop("trophies")
    w = wood("trophies")
    gold = M("trophies", "gold", "#c9a35e", 0.3, 0.85)
    silver = M("trophies", "silver", "#c4c4c8", 0.25, 0.9)
    base = M("trophies", "base", "#1b1512", 0.4)
    paper = M("trophies", "paper", C["cream"], 0.9)
    red = M("trophies", "ribbon", "#8a1f1a", 0.7)
    W, D, H = 0.7, 0.3, 1.8
    for x in (-W / 2 + 0.01, W / 2 - 0.01):
        P.add(box((0.02, H, D), (x, H / 2, 0)), w, uv=0.9)
    P.add(box((W, 0.02, D), (0, H - 0.01, 0)), w, uv=0.9)
    P.add(box((W - 0.04, 0.08, 0.02), (0, 0.04, D / 2 - 0.02)), w, uv=0.9)                 # plinth
    P.add(box((W - 0.04, H - 0.02, 0.01), (0, H / 2, -D / 2 + 0.005)), w, uv=0.9)           # back panel
    shelves_y = [0.08, 0.5, 0.92, 1.34]
    for y in shelves_y:
        P.add(box((W - 0.04, 0.02, D - 0.02), (0, y + 0.01, 0.0)), w, uv=0.9)

    def cup(x, y, s, mat):
        P.add(box((0.08 * s, 0.05 * s, 0.08 * s), (x, y + 0.025 * s, 0), bevel=0.004), base)
        P.add(lathe([(0.025 * s, 0.05 * s), (0.012 * s, 0.07 * s), (0.008 * s, 0.1 * s), (0.02 * s, 0.11 * s), (0.045 * s, 0.14 * s),
                     (0.05 * s, 0.2 * s), (0.046 * s, 0.2 * s), (0.0, 0.16 * s)], 10, (x, y, 0)), mat)
        for sx in (-1, 1):
            P.add(tube([(x + sx * 0.045 * s, y + 0.19 * s, 0), (x + sx * 0.07 * s, y + 0.18 * s, 0), (x + sx * 0.07 * s, y + 0.15 * s, 0),
                        (x + sx * 0.044 * s, y + 0.145 * s, 0)], 0.004 * s, 4, caps=False), mat)
    cup(-0.15, 1.36, 1.25, gold)
    cup(0.14, 1.36, 0.95, silver)
    cup(0.16, 0.10, 1.1, gold)

    def plaque(x, y, rot, mat):
        P.add(box((0.16, 0.2, 0.02), (x, y + 0.1, -0.08), bevel=0.005, rot=("x", rot)), base)
        P.add(box((0.11, 0.06, 0.004), (x, y + 0.115, -0.068), bevel=0.001, rot=("x", rot)), mat)
    plaque(-0.17, 0.94, -0.12, gold)
    plaque(0.15, 0.52, -0.12, silver)
    # a framed certificate, leaning back on the middle shelf
    cert = frame(0.24, 0.18, [(0.0, 0.0), (0.0, 0.014), (0.012, 0.016), (0.016, 0.012)])
    xform(cert, (0.12, 1.032, -0.07), rot=("x", -0.2))
    P.add(cert, w, uv=0.9)
    P.add(quad(0.21, 0.15, (0.12, 1.032, -0.058), rot=("x", -0.2)), paper)
    # a medal on a little stand
    P.add(box((0.1, 0.02, 0.06), (-0.12, 0.53, 0.02), bevel=0.003), base)
    P.add(box((0.03, 0.1, 0.004), (-0.12, 0.59, 0.0), rot=("x", -0.15)), red)
    P.add(cyl(0.03, 0.006, 16, (-0.12, 0.56, 0.006), rot=("x", math.pi / 2 - 0.15)), gold)
    # a star on a block (a "best in show" style award, no words)
    P.add(box((0.07, 0.05, 0.07), (-0.16, 0.115, 0), bevel=0.004), base)
    st = _bm()
    pts = []
    for k in range(10):
        r = 0.05 if k % 2 == 0 else 0.022
        t = TAU * k / 10
        pts.append((r * math.sin(t), r * math.cos(t)))
    vf = [st.verts.new((x, y, -0.008)) for x, y in pts]
    vb = [st.verts.new((x, y, 0.008)) for x, y in pts]
    st.faces.new(vf[::-1])
    st.faces.new(vb)
    for k in range(10):
        st.faces.new([vf[k], vf[(k + 1) % 10], vb[(k + 1) % 10], vb[k]])
    bmesh.ops.recalc_face_normals(st, faces=st.faces)
    xform(st, (-0.16, 0.2, 0))
    P.add(st, silver, sharp=30)
    return P


# slot -> (function, file, triangle budget), as in ASSETS.props and docs/BLENDER.md section 2
PROPS = {
    "chair": (chair, "ink-chair.glb", 1500), "station": (station, "ink-station.glb", 1200),
    "machine": (machine, "ink-machine-coil.glb", 600), "rotary": (rotary, "ink-machine-rotary.glb", 600),
    "pen": (pen, "ink-machine-pen.glb", 400),
    "lamp": (lamp, "ink-lamp.glb", 800),
    "stool": (stool, "ink-stool.glb", 500), "shelves": (shelves, "ink-shelves.glb", 900),
    "bench": (bench, "ink-bench.glb", 800), "flashframe": (flashframe, "ink-flash-frame.glb", 400),
    "sign": (sign, "ink-sign.glb", 600), "plant": (plant, "ink-plant.glb", 800),
    "photos": (photos, "ink-photos.glb", 400), "trophies": (trophies, "ink-trophies.glb", 1200),
}


def tint_wood(path):
    """multiply the wood photo texture by WOOD_TINT (glTF baseColorFactor), in the raw .glb"""
    import json
    import struct
    raw = open(path, "rb").read()
    n = struct.unpack_from("<I", raw, 12)[0]
    g = json.loads(raw[20:20 + n])
    for m in g.get("materials", []):
        if m.get("name", "").endswith("_wood") and "baseColorTexture" in m.get("pbrMetallicRoughness", {}):
            m["pbrMetallicRoughness"]["baseColorFactor"] = WOOD_TINT
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    rest = raw[20 + n:]
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<II", len(js), 0x4E4F534A) + js + rest
    open(path, "wb").write(out)


def main():
    out, do_pack, names = K.args()
    for name in names or list(PROPS):
        fn, file, budget = PROPS[name]
        K.reset()
        K._MATS.clear()
        ob = fn().obj()
        raw = K.export_glb([ob], os.path.join(out, file.replace(".glb", "-raw.glb")))
        tint_wood(raw)
        print("%-10s %5d triangles (budget %d) -> %s" % (name, len(ob.data.polygons), budget, raw))
        if do_pack:
            K.pack(raw, file, budget)


if __name__ == "__main__":
    main()
