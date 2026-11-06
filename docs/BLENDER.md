# Blender brief (PR 10)

This is the job list for the Blender batch: the client mannequin and the shop props for Full and Ultra graphics. Everything the game needs from the code side is already in (0.1.10.0): the loader, the slots, the photo textures, the packing tool. Your files slot in by name; nothing else changes. Lite phones never load any of this and keep the coded shop and mannequin, so nothing you do can break Lite.

**Status (0.1.15.0):** the wireless pen has its own model (`pen`, `ink-machine-pen.glb`, about 400 triangles, made by `pen()` in `props.py`), so the tray shows the kit's real machine. **Status (0.1.12.0):** the three shapes now read apart at a glance (Broad wider and thicker, Slight narrower and slimmer: the table below), the shin runs into the foot with no gap, the sculpt is stronger (shoulders, waist, knees, calves), a rotary pen joins the coil machine on the tray (`rotary`) and the sign says ИГЛА. **Status (0.1.11.0):** a first version of every file now ships, made by script: `tools/blender/` (`mannequin.py`, `props.py`, `check_mannequin.py`; how to run them in `tools/blender/README.md`). The scripted mannequin is built from the coded body's own reference export (`models/base-mesh/reference/`), not from the pistachio base mesh, so its UVs and shapes match the game exactly. Every entry in `ASSETS` is `on:true`. This brief still holds: any file you make by hand to it replaces the scripted one under the same name (pack it, run `check_mannequin.py` for the mannequin, credit it, and stop running the script for that file).

Every number below is taken from the code (`src/vis/body.js`, `src/vis/studio.js`, `src/vis/assets.js`, `src/sim/placements.js`). If a number here and the code ever disagree, the code wins: tell Claude and the doc gets fixed.

Contents: [0. Set up](#0-set-up) · [1. The mannequin](#1-the-mannequin) · [2. The shop props](#2-the-shop-props) · [3. Pack and check](#3-pack-and-check) · [4. Credit it](#4-credit-it) · [5. Rules](#5-rules)

---

## 0. Set up

1. **Blender** 3.6 or newer (4.x is fine). Scene Properties › Units: Unit System **Metric**, Unit Scale **1.000**, Length **Meters**. The game works in metres: 1 Blender unit = 1 m.
2. **Python 3 with Pillow and numpy** for the packing tool: `pip install pillow numpy`.
3. Keep your `.blend` files and raw exports on your PC (a folder like `Ink-blender/`). Only the packed `.glb` files go into the repo, in `models/`.
4. **Axes.** The game is +Y up and the mannequin faces **+Z**. Blender is +Z up; the glTF exporter turns Blender's +Z into the game's +Y and Blender's **-Y** into the game's **+Z**. So in Blender: up is up, and the front of everything faces **-Y** (towards you in Front view, numpad 1).

---

## 1. The mannequin

### What you start from

| file | what it is |
|---|---|
| `models/base-mesh/human-basemeshes-pistachio.zip` | the CC0 base mesh: one `.blend` with two smooth, faceless, rigged base meshes in an A-pose (about 1k triangles each, about 4k with one subdivision). Credited in `models/CREDITS.md`. Pick the one you like as the base; you only need one |
| `models/base-mesh/reference/ink-body-neutral.obj` | the coded mannequin from the game, seated in the chair, in the "Average" shape: your pose, scale and UV guide |
| `models/base-mesh/reference/ink-body-masc.obj`, `ink-body-femme.obj` | the same body in the "Broad" and "Slight" shapes (same vertices, same UVs, only moved) |
| `models/base-mesh/reference/ink-uv-atlas.png` | the game's UV atlas, every island labelled, with the coded body's wireframe: the backdrop for the UV editor |
| `models/base-mesh/reference/ink-body.json` | the same atlas as numbers, the triangle count per part, and every tattoo zone with its size in mm |

These were made by `node tools/body-ref.js` (it needs Playwright and a local server; you don't need to run it unless body.js changes).

Import a reference OBJ with File › Import › Wavefront (.obj), default axes (Forward -Z, Up Y). It lands seated on the chair, feet on the floor (y = 0), facing -Y in Blender. Put it in its own collection, set it to display as Wire, and model over it.

### Steps

1. **Open the base mesh** (unzip, open `Human Basemeshes.blend`). Delete the mesh you won't use.
2. **Seat it with its rig.** Select the armature, Pose Mode, and pose the body onto the reference OBJ (see *The pose* below). When it matches, select the mesh, Modifiers › Armature › **Apply**. Then delete the armature. The game does not use a rig.
3. **Subdivide once** if you want more to work with (Subdivision Surface level 1, Apply), then **retopologise** (or clean up) to the budget: about **6,600 triangles** for everything (body, head and clothes), the same as the coded body. Under 7,000 is the target; 8,000 is the hard ceiling. Put edge loops where the body bends and where tattoo zones start: shoulder, armpit, elbow, wrist, knee, ankle, waist, neck base, hip.
4. **Keep it a mannequin.** Smooth, no face (an egg-shaped head is right), no fingers needed beyond a mitten hand and a thumb, no nipples, navel or any anatomical detail, no hair. An adult proportion.
5. **Dress it** (section *Clothes*), **lay out the UVs** (section *UVs*), **add the shape keys** (section *Shape keys*), name things (section *Names*), export (section *Export*).

### The pose (from `bdSpec` in body.js, metres in game axes: x to the figure's left, y up, z forward)

The figure sits on the tattoo chair, back upright, facing +Z (Blender -Y), both forearms resting forward on the two armrests.

| landmark | where (Average shape) |
|---|---|
| seat top | y 0.47, the chair centred at x 0, z 0.06 |
| head | an egg centred at y 1.305, z 0.012; half sizes 0.084 wide, 0.112 tall, 0.098 deep (top of the head at about y 1.42) |
| neck | from y 1.245 down to the torso top at y 1.14 |
| shoulders | the arm starts at x ±0.178, y 1.083; shoulder half width 0.19 (Broad 0.226, Slight 0.162); the arms move out with the shoulders so the forearms stay over the armrests |
| upper arm | hangs down and a little out: elbow at about x ±0.29, y 0.80, z 0.035 |
| forearm | forward and level on the armrest: wrist at x ±0.295, y 0.745, z 0.27; the top of the forearm faces up |
| hand | flat, palm down, past the wrist to about z 0.46 |
| waist | the narrowest ring, y 0.77 |
| hips | thighs start at x ±0.09, y 0.6, z -0.07 |
| thighs | forward, nearly level, on the seat: knee at x ±0.11, y 0.53, z 0.43 |
| shins | straight down: ankle at x ±0.115, y 0.115, z 0.45; the shin tube carries on into the top of the foot (to y 0.072, z 0.449), so there is no gap at the ankle |
| feet | flat on the floor (y 0), toes forward to about z 0.65 |

The armrests in the game are coded and move under the forearms for each body shape, so the forearms must stay where the reference has them. The chair is not part of the mannequin file.

### Clothes

Two separate fitted meshes, always on, a few millimetres off the skin (the coded ones sit 6 to 7 mm out):

- **The bandeau (top):** a strapless band over the front of the chest only, from y 0.952 down to y 0.835, wrapping round to about 66° each side of the centre line. It sits **below** the chest island, so the chest, the **ribs and sides stay bare**, and the **whole back stays bare**. Colour `#5e6e6b`. (It is stylised: nothing holds it up, and that is fine.)
- **The shorts:** from the waistband at y 0.70 down over the hips and the top quarter of each thigh. Colour `#3d4350`.

No other clothing, jewellery or shoes: every placement zone must stay skin.

### UVs: one island per zone, in true millimetres

The tattoo texture is one atlas. Each island holds one limb or zone, unwrapped flat in **true millimetres of the Average body**, so a 100 mm design is 100 mm on the skin. The islands must land **exactly** in the atlas rectangles of `ink-uv-atlas.png` / `ink-body.json`, because the game paints tattoos into those rectangles and finds zones by them. The easy way, since your mannequin follows the reference's pose:

1. Mark seams so each island below is one piece (seams go where the island's edges are on the reference: the underside of the arm, the side of the leg, the side seams of the torso; select the reference in Edit Mode and UV › Seams from Islands shows them).
2. Add a **Data Transfer** modifier on your mesh: Source = the reference neutral OBJ, Face Corner Data ✓ › UVs, mapping **Nearest Face Interpolated**. Apply it. Your UVs now sit in the right rectangles.
3. Check in the UV editor with `ink-uv-atlas.png` as the image: every island inside its rectangle, nothing overlapping, nothing crossing an edge. Relax (UV › Minimize Stretch) inside a rectangle only.

| island | what it covers | how it is laid out (x across, y down) |
|---|---|---|
| `arm_l`, `arm_r` | shoulder to wrist, all the way round | y = 0 at the top of the shoulder, down to the wrist (about 637 mm); x = the arc round the arm from the face line, which runs down the front of the arm and along the **top** of the forearm; the seam is underneath |
| `hand_l`, `hand_r` | the hand, wrist to fingertips (not the thumb) | centred on the back of the hand |
| `leg_l`, `leg_r` | hip to ankle, all the way round | y from the hip down to the ankle (about 1007 mm); the face line runs along the top of the thigh and down the front of the shin; the seam runs down the side of the leg a quarter turn from it (copy the reference: its island is off-centre on purpose) |
| `foot_l`, `foot_r` | the foot | centred on the top of the foot, y from the heel forward |
| `chest` | the front of the torso from the neck base down to just under the chest (about 265 mm), ±62° round from the centre | centred on the sternum |
| `side_l`, `side_r` | each side, from the armpit to the hip, 62° to 118° round | centred under the arm |
| `back` | the whole back from the neck base to the hips | centred on the spine |
| `neck` | the neck, all the way round | centred on the nape (the back of the neck) |
| `blank` | a tiny square for skin that never takes ink: head, thumbs, belly below the chest island, everything under the clothes | every vertex of those parts can sit at the centre of the blank square |

**Zones** (the placements a client can ask for; `startMm` is how far down its island the box starts on the coded body; widths and lengths are the box in mm):

| zone | island | width × length (mm) | starts at (mm down the island) |
|---|---|---|---|
| shoulder (l/r) | arm | 140 × 150 | 6 |
| upper arm (l/r) | arm | 120 × 250 | 124 |
| forearm (l/r) | arm | 100 × 240 | 304 |
| hand (l/r) | hand | 80 × 85 | 22 |
| thigh (l/r) | leg | 190 × 360 | 212 |
| calf (l/r) | leg | 140 × 280 | 492 |
| shin (l/r) | leg | 85 × 290 | 553 |
| foot (l/r) | foot | 85 × 120 | 110 |
| ribs (l/r) | side | 160 × 300 | 242 |
| side of the neck (l/r) | neck | 75 × 110 | 4 |
| nape | neck | 90 × 90 | 14 |
| upper back | back | 380 × 240 | 38 |
| full back | back | 400 × 600 | 18 |
| chest (l/r) | chest | 160 × 140 | 70 |
| sternum | chest | 90 × 180 | 80 |

You don't place the zones: the game does, from the islands. Your job is that each island covers its whole limb with no gaps, at the right millimetre scale.

### Shape keys: three body shapes on one topology

The client picks one of three shapes (`BODY_SHAPES` in `src/sim/placements.js`); the game blends between them, so they must be **shape keys on one mesh**, never three meshes. Same vertices, **identical UVs** (shape keys can't change UVs anyway, so this comes for free).

| shape key | game name | girth multipliers (arm, leg, back, chest, side, neck, hand, foot, shoulder) | shoulder half width |
|---|---|---|---|
| `Basis` | neutral, "Average" | all 1 | 0.190 m |
| `masc` | "Broad" | 1.24, 1.14, 1.18, 1.18, 1.10, 1.16, 1.12, 1.08, 1.24 | 0.226 m; waist ×1.12, hips ×1.05, depth ×1.14 |
| `femme` | "Slight" | 0.82, 0.90, 0.86, 0.88, 0.90, 0.88, 0.88, 0.92, 0.84 | 0.162 m; waist ×0.85, hips ×0.95, depth ×0.87 |

How: sculpt or scale each key until it matches `ink-body-masc.obj` / `ink-body-femme.obj` (import them as wire guides). Keep the forearms on the same line (the armrests follow them, but only a few centimetres). The bandeau and shorts need the **same two keys** so they follow the body.

### Names and materials

| object | material | notes |
|---|---|---|
| `body` (skin: torso, limbs, hands, feet, neck and head in one mesh) | `skin` | any colour: the game replaces it with the client's skin tone and the tattoo texture |
| `cloth_top` | `cloth_top` (Base Color `#5e6e6b`, Roughness 0.95) | |
| `cloth_shorts` | `cloth_shorts` (Base Color `#3d4350`, Roughness 0.95) | |

Object › Apply › **All Transforms** on all three before export. Origin at the world origin (0, 0, 0), which is the floor under the chair's centre line.

### Export

File › Export › glTF 2.0, **Format: glTF Binary (.glb)**:

- Include: **Selected Objects** (select the three).
- Transform: **+Y Up** ✓.
- Data › Mesh: Apply Modifiers ✓, UVs ✓, Normals ✓, Tangents ✗, Vertex Colors ✗.
- Data › Shape Keys ✓, Shape Key Normals ✓.
- Data › Armature / Skinning ✗, Animation ✗.
- Materials: Export.

Save it as `Ink-blender/ink-mannequin-raw.glb`, then pack it (section 3) to `models/ink-mannequin.glb` with `--budget 7000`.

**Then tell Claude.** The mannequin is the one file the loader does not swap in yet: the swap needs a real file to test against (the tattoos, the stencil drag and the camera all read the body). With your file in `models/`, it is a small follow-up PR.

---

## 2. The shop props

Since 0.1.14.0 the shop is four coded rooms, one per career stage: Arkady's back room, a rented chair in a busy shop, your studio and the legacy studio (`VR_ROOMS` in `src/vis/studio.js`). Every prop below has a coded stand-in in `src/vis/studio.js` and a slot in `ASSETS.props` in `src/vis/assets.js`. When your file is in, the game hides the coded stand-in and puts your model where the slot says, on Full and Ultra only.

**Where a prop stands per room.** Make every model once, for the spot and facing in the table below (its *home*). The game then moves the whole prop group, model and stand-in together, into each room that has it: `VR_PLACE` in `src/vis/studio.js` gives the room's origin for it and an extra turn round its own origin (for example the shelves turn to face you on the back room's back wall, the sign and the photos move from the right wall to the back wall). So you never need a second file or new numbers per room; keep the origin rules exactly, because the turn happens round that origin. Which rooms have which prop: chair, station, machine, rotary, pen, lamp and stool are in every room (since 0.1.15.0 also Arkady's front room, the rented chair's second room); shelves in the back room, your studio and the legacy studio; bench, flash frame in the rented chair, your studio and the legacy studio; sign and plant in your studio and the legacy studio; photos, trophies and plant2 in the legacy studio only.

**The machines.** The coil machine, the rotary pen and (since 0.1.15.0) the wireless pen all have a group on the tray in every room. The one the player's kit uses goes to the front spot (0.74, 0.81, 0.38, turned 0.4), the newest other machine the player owns goes to the back corner (0.79, 0.81, 0.22, turned -0.3) (`VR_TRAY`), and the third is hidden.

### For every prop

- **Units:** metres, real size. Check with the N panel's Dimensions.
- **Front faces -Y in Blender** (the game's +Z). The slot's turn (`rot`) then points it the right way in the room; you never rotate for the room yourself.
- **Origin:** on the floor under the centre of the prop (Object › Set Origin, and move the mesh so its base sits at z = 0), unless the table says otherwise. Apply All Transforms.
- **Materials:** Principled BSDF only, Base Color + Roughness + Metallic. Name them `ink_<prop>_<surface>`, e.g. `ink_chair_leather`, `ink_chair_steel`. Image textures are allowed but optional and small (the packer shrinks them to 512 px; normal maps to 256 px). The only glowing surfaces are bulbs and the lit sign: give those an Emission colour and name them `..._bulb` or `..._glow`.
- **Triangles:** keep under the budget in the table (the packer warns you). Bevel the edges that catch the light, skip detail nobody sees from the client's side of the room.
- **No text on anything** except the signage below, and never a real brand, logo or shop name.
- Export each prop on its own, as above (glTF Binary, Selected Objects, +Y Up, no animation, no shape keys needed).

### The props

Positions are where the game puts the origin, in game metres (x right as you look at the client, y up, z towards the window wall's opposite, i.e. towards the door). `rot` is the game's turn round the up axis: 0 = facing the client's way (+Z), π/2 = facing +X, -π/2 = facing -X, π = facing -Z.

| slot | file | stage | size of the stand-in | budget | where (origin) | rot | what to make |
|---|---|---|---|---|---|---|---|
| `chair` | `ink-chair.glb` | apprentice on | seat 0.50 × 0.46, top at 0.47 m; a column; a 0.3 m disc base | 1,500 | 0, 0, 0.06 | 0 | the tattoo chair: padded seat, column, base. **No armrests** (the game's armrests move per body shape) and no backrest above 0.9 m (it would hide the back) |
| `station` | `ink-station.glb` | apprentice on | a steel trolley 0.46 × 0.36, top shelf at 0.81 m | 1,200 | 0.86, 0, 0.32 | 0 | your trolley: two shelves, ink caps, a paper towel roll, a spray bottle, a box of gloves. **Not** the machine |
| `machine` | `ink-machine-coil.glb` | apprentice on | about 0.13 m long | 600 | 0.78, 0.81, 0.37 (lying on the trolley top) | 0.4 | the coil machine lying on its side, with a short clip cord. Origin at its underside, so it rests on the tray |
| `rotary` | `ink-machine-rotary.glb` | apprentice on | about 0.15 m long | 600 | 0.79, 0.81, 0.22 (on the tray beside the coil) | -0.3 | a rotary pen: turned body, stroke ring, knurled grip, clear cartridge, needle tip to -x, a short cord. No logo. Origin at its underside |
| `pen` | `ink-machine-pen.glb` | apprentice on | about 0.154 m long | 400 | 0.79, 0.81, 0.22 (the rotary's spot) | -0.3 | the wireless pen (0.1.15.0): a battery collar with a small charge light at the back, slim body, stroke dial, rubber grip, clear cartridge, needle tip to -x. No cord, no logo. Origin at its underside |
| `lamp` | `ink-lamp.glb` | apprentice on | base disc 0.15 m, pole 1.62 m | 800 | 1.05, 0, -0.45 | 0 | the angle lamp: weighted base, pole, an arm reaching to the shade. The shade's opening must be at (-0.55, 1.50, +0.33) from the origin, pointing down at the forearm (the game's light sits there). Bulb material `ink_lamp_bulb` with Emission |
| `stool` | `ink-stool.glb` | apprentice on | seat r 0.18 at 0.55 m | 500 | 0.95, 0, 0.86 | 0 | your rolling stool |
| `shelves` | `ink-shelves.glb` | apprentice on | two shelves 0.24 deep × 1.1 long at 1.25 and 1.62 m | 900 | -2.66, 0, -0.6 (against the left wall) | π/2 | wall shelves with jars, ink bottles, sketchbooks. The back of the shelf is 0.12 m behind the origin (it touches the wall) |
| `bench` | `ink-bench.glb` | apprentice on | 1.4 wide, seat at 0.5 m, 0.42 deep, back to 0.9 m | 800 | -1.3, 0, 2.25 (by the door) | π | the waiting bench |
| `flashframe` | `ink-flash-frame.glb` | apprentice on | a 2.1 × 1.09 frame | 400 | 0.85, 1.72, -2.31 (**origin at the frame's centre, on its back**) | 0 | an empty wooden frame for the flash wall, open in the middle: the game draws the flash sheets inside it |
| `sign` | `ink-sign.glb` | studio on | a 1.0 × 0.25 panel at 2.05 m | 600 | 2.77, 2.05, -0.6 on the right wall (**origin at the centre of its back**) | -π/2 | your studio's sign (see *Signage*) |
| `plant` | `ink-plant.glb` | studio on | pot r 0.16, 0.9 m tall with leaves | 800 | 2.45, 0, -2.0 | 0 | a potted plant in the corner |
| `photos` | `ink-photos.glb` | legacy | six frames in a 3 × 2 grid, 1.24 × 0.7 | 400 | 2.77, 1.55, 0.82 on the right wall (**origin at the centre, on the back**) | -π/2 | framed photos of healed work: frames with plain cream mounts (no real photos, no real tattoos) |
| `trophies` | `ink-trophies.glb` | legacy | none (new) | 1,200 | -2.62, 0, 0.9 against the left wall | π/2 | a narrow cabinet or shelf (at most 0.8 wide, 0.3 deep, 1.9 tall) with convention trophies: cups, plaques, a framed certificate. Invented, with no real convention's name on them |

The room shell (floor, walls, window onto the canal, ceiling, door) stays coded; on Full and Ultra it already wears the photo textures. The armrests, the flash sheets themselves, the rug, the broom and the supply boxes stay coded too.

**More machines.** The tray shows the coil and, since 0.1.12.0, the rotary pen (`rotary`). The wireless pen has its own file since 0.1.15.0 (`pen`). If you make `ink-machine-coil-used.glb` as well (same origin rule, budget 600), it can follow the player's kit later: ask Claude.

### Signage

Mostograd is a St Petersburg-like river city (shared with Lombard): Cyrillic-flavoured, invented, never a real shop. For the studio sign, one line of big letters, e.g. **ТАТУ · TATTOO** or an invented shop word like **ИГЛА** ("needle") with TATTOO under it. Since 0.1.12.0 both signs (coded and `ink-sign.glb`) say **ИГЛА**, on a dark board with a thin brass edge (the coded one is `#1b120c` with `#c9a35e` and `#f0c674` letters). Lettering as geometry (Text object, Convert to Mesh, low resolution) or as a small texture. No real brand, no real shop's name, no phone numbers or web addresses.

---

## 3. Pack and check

1. Export the raw `.glb` from Blender (as above).
2. From the repo root:
   ```
   python3 tools/pack-model.py ../Ink-blender/ink-chair-raw.glb models/ink-chair.glb --budget 1500
   ```
   It shrinks the textures, squeezes the vertex data (KHR_mesh_quantization, which three.js r128 reads) and keeps the shape keys. Then it prints what the game will see:
   ```
   models/ink-chair.glb  38 KB
     triangles   1320
     size (m)    0.600 wide (x)  0.800 tall (y)  0.560 deep (z)
     origin      x -0.300..0.300  y 0.000..0.800  z -0.280..0.280
     materials   ink_chair_leather, ink_chair_steel
   ```
   Check: triangles under the budget (it says OVER if not); the size is the real size in metres (a 60 m chair means the units were wrong); `y` starts at 0.000 (the base is on the origin); the materials are the names you gave them. The mannequin also lists `shape keys  femme, masc`.
3. Turn the slot on: in `src/vis/assets.js`, set that entry's `on:false` to `on:true`. (A slot that is off is never fetched, which is how the game ships without your files and without 404 errors.)
4. Add the file's line to `models/CREDITS.md` (section 4).
5. `node build.js`, then run the checks (`node build.js --check` and the four node scripts).
6. Look at it: `python3 -m http.server` in the repo root, open `http://localhost:8000/`, Settings › Graphics › **Full**. Your prop should replace the coded one in the Studio tab. Try each stage (the Career tab moves through them; or ask Claude for a test save). Then Settings › Graphics › **Lite**: the coded shop, unchanged.
7. Commit `src/`, `index.html`, `sw.js`, the `.glb` and `models/CREDITS.md` together (`Assets: the tattoo chair from Blender`).

Size: a prop should pack to under about 100 KB, the mannequin under about 400 KB. Every file goes into the phone's offline cache when it is first loaded on Full or Ultra.

---

## 4. Credit it

Every file in `models/` has a row in `models/CREDITS.md`. For your own work:

| File | Model | Author | Licence | Source |
|---|---|---|---|---|
| `ink-chair.glb` | Tattoo chair | Kelbo | Original (© 2026 Kelbo / Longlight Interactive) | Blender, made for Ink |

For the mannequin, credit both: your work and the base it started from (pistachio's Human Basemeshes, CC0, OpenGameArt; the row is already in the file). If you ever use someone else's model or texture, it must be **CC0 or CC-BY** (never NC, never ND), with the author, licence and link in its row, and a CC-BY one also goes in Settings › About.

---

## 5. Rules

- Adults only, a neutral stylised mannequin, no nudity or anatomical detail; the clothes always on; placements only where the zones are.
- No real people, brands, logos, shop or convention names. Signage is invented and Mostograd-flavoured.
- Nothing traced from real tattoo artists' work: the photos and flash frames have no real tattoos in them (the game draws the flash).
- CC0 or CC-BY only, credited. Your own work is noted as original.
- Lite never loads models or textures; Full and Ultra get them on demand. Keep budgets so a Full phone stays smooth (the auto-adjust drops a tier if the frame rate sinks, and you never want to see that toast).
