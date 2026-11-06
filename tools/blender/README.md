# tools/blender: the Blender batch, by script

These scripts make every file the game loads from `models/` on Full and Ultra graphics: the client mannequin (`models/ink-mannequin.glb`) and the thirteen shop props (`models/ink-chair.glb` and the rest). They are plain Python that drives Blender through its `bpy` module. Each one builds its model from numbers in the script, exports a glTF and packs it with `tools/pack-model.py`. A rerun gives the same files. Nothing here runs in the game or in the checks; the `.glb` files are committed.

`docs/BLENDER.md` is the brief they follow: pose, UV islands, shape keys, names, budgets, origins. If you make a model in Blender by hand, the brief is still the contract, and your file simply replaces the scripted one (see "Replacing a model" below).

## Set up (once)

You need a Python that can `import bpy` (Blender as a module), plus Pillow and numpy. Blender's own Python works. A separate venv is simpler:

```
python3.13 -m venv ~/bpyenv
~/bpyenv/bin/pip install bpy==5.2.3 pillow numpy
```

`bpy` 5.2 needs Python 3.13 exactly. Last used: bpy 5.2.3 LTS, numpy 2.5, Pillow 13.

## Run (repo root)

```
~/bpyenv/bin/python tools/blender/props.py                 # all thirteen props
~/bpyenv/bin/python tools/blender/props.py chair lamp      # just these slots
~/bpyenv/bin/python tools/blender/mannequin.py             # the mannequin (a few minutes: voxel remesh, UV transfer)
~/bpyenv/bin/python tools/blender/check_mannequin.py       # check models/ink-mannequin.glb against the contract
```

Options: `--out DIR` is where the raw (unpacked) exports go (default `../Ink-blender`, next to the repo, never committed); `--no-pack` stops after the raw export. Each script prints triangles, size and origin per file from `pack-model.py`. A "below origin" note on a wall piece (flash frame, shelves, photos, sign) is expected: their origin is the middle of the back, as the slot asks.

After a change: `node build.js` (the media cache name hashes `models/`), the six checks, then look at it on Full in a browser.

## The files

| File | What it does |
|---|---|
| `inkbl.py` | Shared helpers: arguments, a clean scene, game axes to Blender axes, materials (sRGB colours to linear), mesh from arrays, glTF export, packing |
| `mannequin.py` | The mannequin. Starts from the coded body's own export in `models/base-mesh/reference/` (`tools/body-ref.js`), not from a downloaded mesh: the 13 skin parts are welded, joined by a 3 mm voxel remesh into one smooth skin, sculpted (`BRUSHES`, up to 9 mm since 0.1.12.0: collarbone, trapezius, shoulder blade, spine, deltoid front and side, a nipped-in waist, elbow, kneecap with the knee sides drawn in, calf, ankle; no face, no anatomy; the shin now runs into the foot in the reference, so there are no ankle bridges), and the bandeau and shorts are cut from that skin and set 6.5 mm off it. Then it is decimated to budget, the reference UVs are copied onto it face by face (every face inside one zone's atlas rectangle), and the `masc` and `femme` shape keys are taken from the reference's other two OBJs. The header of the script explains each step |
| `check_mannequin.py` | Reads the packed file the way the game does and checks names, materials, shape keys at weight 0, triangles, the seated placement, that every face sits in one UV rectangle, each island's UV area against its true size in mm, coverage of the reference's visible surface, a face under every zone centre, and the shape keys against the reference shapes. Exit 1 on a failure |
| `props.py` | One function per prop slot in `ASSETS.props` (`src/vis/assets.js`), modelled in game axes from the same numbers as the coded stand-ins in `src/vis/studio.js`: bevelled boxes, lathed profiles, swept frames, a Text object for the sign. Materials are named `ink_<prop>_<surface>`; wood uses `models/textures/dado-planks.jpg` |

## Replacing a model

Any file can be swapped for a hand-made one: export from Blender to the brief, pack it with `python3 tools/pack-model.py IN.glb models/ink-NAME.glb --budget N` under the same name, run `check_mannequin.py` if it is the mannequin, rebuild and credit it in `models/CREDITS.md`. Then stop using the script for that file, or it will overwrite yours on the next run. To turn a model off and go back to the coded stand-in, set its entry in `ASSETS` to `on:false`.
