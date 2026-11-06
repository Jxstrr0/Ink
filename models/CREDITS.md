# Model and texture credits

Everything in `models/` is for the shop on **Full and Ultra** graphics only (`ASSETS` in `src/vis/assets.js`). Lite never loads any of it and keeps the coded shop from `src/vis/studio.js`.
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

Not loaded by the game: it is the starting point for Kelbo's Blender mannequin (PR 10, plan Q5: Claude Code sources a CC0 base mesh, Kelbo retopologises and dresses it).

| File | Asset | Author | Licence | Source |
|---|---|---|---|---|
| `human-basemeshes-pistachio.zip` | Human Basemeshes (one `.blend`: two rigged base meshes, about 1k triangles, about 4k with its subdivision) | pistachio | CC0 | [OpenGameArt](https://opengameart.org/content/human-basemeshes) |

Why this one: it is CC0 (checked on the OpenGameArt page, 2026-11-06); it is a smooth, featureless, faceless mannequin with no anatomical detail (nothing to remove for the game's no-nudity rule); it is an adult figure in an A-pose; its quad topology is clean and low enough (about 1k triangles, about 4k after one subdivision) to retopologise to the coded body's 6.6k budget; it comes with a rig, which makes seating it in the chair easier before the rig is removed; and it is small (220 KB). The other CC0 candidates looked at: VideroBoy's "Low Poly Human Male" / "Female" (OpenGameArt, CC0, about 700 quads, Blender 2.5 files, no rig). Rejected for licence: Clint Bellanger's base human models (CC-BY 3.0, usable but CC0 is simpler), "Low poly base meshes male/female" and "Cleaned base human models" (CC-BY-SA 3.0). Kenney and Poly Pizza were not reachable from the build machine.

`models/base-mesh/reference/` is original: the coded PR 6 mannequin exported by `tools/body-ref.js` (the three body shapes as OBJ, the UV atlas, the zone table), © 2026 Kelbo / Longlight Interactive. It is the pose, scale and UV guide for the Blender work.

## Models (`models/*.glb`)

None yet. Each one Kelbo makes goes here, packed with `tools/pack-model.py`, with a row like this:

| File | Model | Author | Licence | Source |
|---|---|---|---|---|
| `ink-chair.glb` (example) | Tattoo chair | Kelbo | Original (© year Kelbo / Longlight Interactive) | Blender, made for Ink |
| `ink-mannequin.glb` (example) | The client mannequin | Kelbo, from pistachio's Human Basemeshes | Original work on a CC0 base | Blender; base mesh above |

CC0 needs no credit, but we give it anyway. A CC-BY asset must be listed here with its author and a link, and the same line goes in Settings › About.
