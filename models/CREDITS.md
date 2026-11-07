# Model and texture credits

Everything in `models/` is for the shop on **Full and Ultra** graphics (`ASSETS` in `src/vis/assets.js`), except the mannequin: since 0.1.18.0 Lite loads `ink-mannequin.glb` too (and the service worker precaches it). Lite never loads the props or textures and keeps the coded shop from `src/vis/studio.js`.
Ink only uses CC0 or CC-BY assets: never NC or ND, nothing traced from a real tattoo artist's work, no real brands. Keep this file in step with the folder: every file listed with what it is, who made it, the licence and where it came from. Kelbo's own Blender work is listed as original. How the models are made and packed: `docs/BLENDER.md`.

## Textures (`models/textures/`)

From Poly Haven, downloaded at 1k on 2026-11-06 and re-saved for the game with Pillow (Lanczos resize, JPEG). In game each one is tinted to the coded room's colour.

| File | Asset | Author | Licence | Source | Changes for Ink |
|---|---|---|---|---|---|
| `floor-parquet.jpg` | Herringbone Parquet (diffuse) | Jenelle van Heerden (processing), Sergej Majboroda (photography) | CC0 | [Poly Haven](https://polyhaven.com/a/herringbone_parquet) | 1024 px, JPEG q72 |
| `wall-plaster.jpg` | Painted Plaster Wall (diffuse) | Amal Kumar | CC0 | [Poly Haven](https://polyhaven.com/a/painted_plaster_wall) | 1024 px, JPEG q70 |
| `wall-plaster-nor.jpg` | Painted Plaster Wall (normal, OpenGL) | Amal Kumar | CC0 | [Poly Haven](https://polyhaven.com/a/painted_plaster_wall) | 512 px, JPEG q82 |
| `dado-planks.jpg` | Dark Wooden Planks (diffuse) | Amal Kumar | CC0 | [Poly Haven](https://polyhaven.com/a/dark_wooden_planks) | 512 px, JPEG q74 |

A herringbone parquet floor and painted plaster over a planked dado is what the back room of a 19th-century Mostograd building would have.

## The mannequin base mesh (`models/base-mesh/`)

Not loaded by the game, and not used by the scripted mannequin (0.1.11.0), which is built from the reference export below instead. It stays as a starting point if Kelbo models the mannequin by hand (PR 10, plan Q5).

| File | Asset | Author | Licence | Source |
|---|---|---|---|---|
| `human-basemeshes-pistachio.zip` | Human Basemeshes (one `.blend`: two rigged base meshes, about 1k triangles, about 4k with its subdivision) | pistachio | CC0 | [OpenGameArt](https://opengameart.org/content/human-basemeshes) |

Why this one: it is CC0 (checked on the OpenGameArt page, 2026-11-06); it is a smooth, featureless, faceless mannequin with no anatomical detail (nothing to remove for the game's no-nudity rule); it is an adult figure in an A-pose; its quad topology is clean and low enough (about 1k triangles, about 4k after one subdivision) to retopologise to the coded body's 6.6k budget; it comes with a rig, which makes seating it in the chair easier before the rig is removed; and it is small (220 KB). The other CC0 candidates looked at: VideroBoy's "Low Poly Human Male" / "Female" (OpenGameArt, CC0, about 700 quads, Blender 2.5 files, no rig). Rejected for licence: Clint Bellanger's base human models (CC-BY 3.0, usable but CC0 is simpler), "Low poly base meshes male/female" and "Cleaned base human models" (CC-BY-SA 3.0). Kenney and Poly Pizza were not reachable from the build machine.

`models/base-mesh/reference/` is original: the coded PR 6 mannequin exported by `tools/body-ref.js` (the three body shapes as OBJ, the UV atlas, the zone table), © 2026 Kelbo / Longlight Interactive. It is the pose, scale and UV guide for the Blender work.

## Models (`models/*.glb`)

All original, © 2026 Kelbo / Longlight Interactive, made for Ink by the scripts in `tools/blender/` (Blender 5.2 through its Python module, packed with `tools/pack-model.py`). No outside model is in any of them. Rebuild or change one with `tools/blender/README.md`; a hand-made replacement takes the same file name and its own row here.

| File | Model | Author | Licence | Source |
|---|---|---|---|---|
| `ink-mannequin.glb` | The client mannequin (body, bandeau, shorts; shape keys `masc`, `femme`) | Kelbo / Longlight Interactive | Original | `tools/blender/mannequin.py`, built from the coded body's reference export above (not from the pistachio base mesh) |
| `ink-chair.glb` | Tattoo chair | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-station.glb` | Work station trolley | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-machine-coil.glb` | Coil machine | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-machine-rotary.glb` | Rotary machine | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` (0.1.12.0) |
| `ink-machine-pen.glb` | Wireless pen machine | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` (0.1.15.0) |
| `ink-lamp.glb` | Floor lamp | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-stool.glb` | Artist's stool | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-shelves.glb` | Ink shelves | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-bench.glb` | Waiting bench | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-flash-frame.glb` | Flash wall frames | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-sign.glb` | "ИГЛА" sign | Kelbo / Longlight Interactive | Original | `tools/blender/props.py`; letters from Blender's built-in font (Bfont, which in Blender 5.2 is Inter by Rasmus Andersson, SIL Open Font License 1.1), turned into mesh, so no font file is distributed |
| `ink-plant.glb` | Potted plant (also the legacy studio's second plant, smaller) | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-photos.glb` | Framed photos | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |
| `ink-trophies.glb` | Trophy cabinet | Kelbo / Longlight Interactive | Original | `tools/blender/props.py` |

The wooden parts of the props use `textures/dado-planks.jpg` (Poly Haven, CC0, above), embedded in each file at a smaller size.

CC0 needs no credit, but we give it anyway. A CC-BY asset must be listed here with its author and a link, and the same line goes in Settings › About.
