# Notes for Claude

Ink is a tattoo artist career game by Longlight Interactive: start as an apprentice sweeping floors, learn on fake skin, build a client list, open a studio, and end with a two-year waiting list and a body of work that has aged on real people who keep walking back through your door. Phone-first, free, one self-contained page (`index.html`, built from `src/`), live at https://jxstrr0.github.io/Ink/. The build plan is `docs/INK-PLAN.md` (tick its checklist as PRs land); the game as built is described in `docs/DESIGN.md`.

The stack, build and save-code tooling are lifted from Prairie Engine Works (`github.com/Jxstrr0/350Chev`). When in doubt about a pattern, look at how PEW does it.

## Stack

- Plain HTML, CSS and classic (non-module) JavaScript in a few big `<script>` blocks. No package.json, no npm, no bundler, no CI. The node scripts below are the only checks.
- three.js **r128** from CDN (`three.min.js` from cdnjs). Full/Ultra-only addons (the glTF loader) are in the `INK_LIBS` list in `src/html/body.html`; a Lite phone loads them on demand through `window.__inkLibs()`. Google Fonts only (Space Grotesk for the UI, Oswald for flash headers). Nothing else external.
- PWA: `manifest.webmanifest`, `icons/`, and the generated `sw.js`. Installed copies work offline. Every cache name starts with `ink-`: PEW lives on the same origin with `pew-` caches, and each worker only deletes its own prefix.
- Node 16 or newer for the scripts (22 is what was last used). Nothing to install.

## Commands (repo root)

```
node build.js            # rebuild index.html and sw.js from src/
node build.js --check    # exit 1 if either is stale, a script block does not compile, or a function is declared twice
node check-savecode.js   # save-code checks: round trip, damaged and cut-off codes, storage full
node tools/sim-test.js   # the sim on a fixed seed: every design sub-score, aging at 5/10/20 years, sanity assertions
node tools/element-sheet.js [--png out.png]   # validate the element library (and render a contact sheet)
node tools/session-test.js   # the session and kit on fixed traces: flattener, steady vs rushed, blowouts, joins, pain, zones, multi-session
```

Asset tools (by hand, not checks): `python3 tools/pack-model.py IN.glb models/OUT.glb --budget N` (Pillow + numpy) packs a Blender export; `node tools/body-ref.js [URL]` (Playwright, a local server) re-exports the coded mannequin reference into `models/base-mesh/reference/`. See `docs/BLENDER.md`.

Run all of them before every commit. To play a local copy: `python3 -m http.server` in the repo root and open it in a browser. The service worker only registers on a real host (or with `?sw=1`), so local testing is never cached.

## Source and build

- **Edit `src/`, never `index.html` or `sw.js`.** Both are generated: `node build.js` concatenates the files listed in `src/manifest.txt`, byte for byte, then writes `sw.js`.
- Commit `src/`, `index.html` and `sw.js` together.
- `src/README.md` has the file map, the script blocks and the `S` state map. Read it before moving code or adding a file.
- `src/` files are slices of one page, so a file may open or close mid-IIFE. `node --check` on one file means nothing; test the built page.
- A new `src/` file must go into `src/manifest.txt` at the right position, or the build refuses to run. No file may be empty (a one-line header comment is enough).
- To find code, grep `src/`: `grep -rn "function showTab" src/`.

## Deploy

GitHub Pages serves the repo root from `main` (`.nojekyll` keeps Jekyll out of it). There is no workflow file: merging into `main` is the deploy. Allow a minute or two, then reload the live site. Installed copies show the "New version ready" bar because the service worker's cache name carries the version and a content hash.

## Versions

- Every release bumps `const VERSION="x.y.z.w";` in `src/app/state.js` (major.minor.feature.hotfix). The build folds it into the `sw.js` cache name.
- Each plan PR bumps the third number; a fix to the last release bumps the fourth.
- The merge commit into `main` is titled `x.y.z.w: summary`.

## Architecture rules

- **Three namespaces.** `INK_SIM` (design scoring, aging model, client logic, calendar, economy) never touches the DOM or three.js and runs in plain node. `INK_VIS` (three.js body and studio) draws what the sim says. App glue lives in `src/app/`.
- **All randomness goes through `INK_SIM.rng`** (`src/sim/rng.js`, seeded). No bare `Math.random()` in `src/sim/`. Node tests run on a fixed seed so numbers repeat.
- **Tuning numbers live in tables, not inline.** Every table is named in the plan (`ELEMENTS`, `STYLES`, `PLACEMENTS`, `SKIN_CONTRAST`, `COMBOS`, `COLOUR_FADE`, `PLACEMENT_WEAR`, …).
- **The state object `S` is defined once**, in `freshState()` in `src/app/state.js`. A PR that needs a new field adds it there and to the `S` map in `src/README.md` in the same commit; never invent fields inline.
- Three graphics tiers, `lite`, `full`, `ultra` (`src/app/perf.js`). Lite is the phone default and must keep working after every change. Still scenes render on change, not every frame.
- All localStorage access is wrapped in try/catch. Keys: `ink-save`, `ink-slot1` to `ink-slot3`. A new key must be added to `buMake`/`buWrite` in `src/app/savecode.js` and to `check-savecode.js`. **Stop and ask Kelbo before adding one.**
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`. The light theme gets every change. The design board stays cream with black ink in both themes.
- Comments in plain English at the top of each file say what it holds. Keep that up when adding one.

## Save codes

- **Back up** / **Restore** (Settings › Save) in `src/app/savecode.js`. A code is `INK1:` + the four localStorage keys as JSON, LZW-squeezed, base64url, + a 6-character checksum. Restore checks the whole code before writing anything. The next format is `INK2:`.
- Tattoos save as design parameters + session outputs + date, **never as rasters**; everything visual is re-rendered from the sim. Pieces are never dropped; old clients compact past `CLIENT_CAP` (PR 7).
- Players may paste their codes to debug a career. That is their personal data: decode and run it locally only, never send it to an outside service, and don't commit it.

## Content rules (hard)

- All clients are adults (the game states 18+ at the consult and never generates a minor). The body model is a neutral, stylized mannequin with no nudity; placements are limited to arms, legs, back, chest (upper), ribs/side, shoulders, neck, hands and feet. No real people, no real brands, no hateful imagery; the element library is curated, never free text rendered as art.
- **Assets:** CC0 or CC-BY only, credited in `models/CREDITS.md`, `art/CREDITS.md`, `sounds/CREDITS.md` (name, author, licence, URL). Kelbo's own Blender work is noted as original. No NC or ND assets. Nothing traced from real tattoo artists' work.

## Setting

Mostograd, the fictional St Petersburg-like river city shared with Lombard (`github.com/Jxstrr0/lombard`, `docs/01-GDD.md`): canals, drawbridges that open at night, 19th-century facades, a Soviet-era outer ring. Client names, street names, signage and weather follow Mostograd. Ink must not contradict Lombard. Ink's tone is a working shop, not dark comedy. Era 2000 to 2030; social media arrives as a system in 2016.

## How Kelbo works

- Beginner-plus coder who tests on his phone on the live site. End every task with a plain-language summary of what changed and how to test it on a phone.
- Work on a `claude/...` branch and open a pull request into `main`, one per plan section. Once the checks pass, merge it yourself (merge commit titled `x.y.z.w: summary`): merging is the deploy. Never push straight to `main`.
- Commit subject: `Area: what changed`. Explain the why in the body. When scoring numbers move, put before/after numbers from `tools/sim-test.js` in the commit message.
- Real design decisions get asked, not guessed. Open questions are listed in `docs/INK-PLAN.md` § 15; ask before the PR they affect.
- The site and the game use the name Kelbo only, never a real name. Studio name: Longlight Interactive. Credit line: "© year Kelbo / Longlight Interactive".

## Current status (0.1.17.0, November 2026)

- 0.1.17.0 built (Kelbo's tattoo look, visual only, sim-test unchanged): `vis/decals.js` draws pieces with bolder lines (`INK_SIM.lineMm` x `DC_LOOK.lineK` plus a soft bleed), packed fills (`fillGamma`) with soft inner shading, watercolour washes, a fresh red halo and gloss that settle by the heal (`freshWeeks`, `settleWeeks`, `healHalo`) and blacks that drift blue-grey. Sharper up close: each piece (overlapping pieces on one island share one) also gets a detail tile in a second canvas (`TIER` `dt`/`dtPpm`/`tiles` in `vis/core.js`: Lite 1024 at up to 7 px/mm, 8 tiles; Full 2048 / 10; Ultra 2048 / 12; 16 tiles), and a shader patch on every skin material (`dcPatch` via `vsSkinPatch` in `vis/api.js`, checked each draw so the mannequin's clone gets it) samples the tile (`textureGrad` with `lodK` on WebGL2), mixes in some of the ink's own colour (`DC_LOOK.pigment`) and adds a soft fresh-ink sheen from a gloss canvas (`TIER.gl` 512 / 1024; also the roughnessMap on Full/Ultra). The atlas still holds every piece. GPU memory: Lite about 12 MB, Full/Ultra about 48 MB; no 4096 textures. The fill paths are the elements' own (the sim reads them), so no colour is invented. No new S fields, no new keys.

- 0.1.16.0 built (Kelbo's "step up the ease of use"): in the chair you hold the machine (`SE_PEN`, `SE_MACHINE`, `#sePen` in `app/session.js`): its needle tip sits above and to the side of your finger, leaning to your free hand, and the sim only hears the tip; Settings › Session › Needle under finger turns it off. The chair zooms onto the current line or zone (`SE_ZOOM`, `#seCam`, `seRefit`), with a Whole / Close up button and pinch; the laid ink is replayed through every move. Every control is at least 44 px. The new `app/nextstep.js` puts one "what to do now" line with a button at the top of every tab (`NX_COPY`, `nxStep`, slots `#nx-<tab>` in `html/body.html`); `caDoFriend()` came out of `app/career.js` for it. The design board has bigger handles, a turn handle on a stalk (`DZ_HANDLE`), labelled toolbar buttons and a pinch that picks the element. New S field: `settings.needle` (`"offset"`/`"direct"`, hydrated, checked by `buSaveOk` and `check-savecode.js`). No new keys.

- 0.1.15.1: Kelbo's answer on the soft fail: `softFail` sets `S.career.split` from Arkady's goodwill, like `rentChair` does ("mentor" at `MENTOR.splitAt` or above, so the chair stage is Arkady's front room; "standard" otherwise). The closing scene's line comes from `MENTOR.lines.broke.sedov` or `.low`, and `lgBrokeHtml` names the room. There is a new sim-test check. No new S fields, no new keys.

- 0.1.15.0 built (Kelbo's rooms follow-up): a fifth room, `VR_ROOMS.sedov` (Arkady's front room at Sedov's on Kanatnaya Street), shown for the chair stage when `S.career.split==="mentor"` (left on good terms); app glue picks it (`stShop()` in `app/studio.js`) and passes it as `INK_VIS.setStudio(stage, shop)`, vis never reads S. `ST_CAP` captions: "Arkady's back room", "Your rented chair, across town", "Your chair in Arkady's front room"; the generic chair card in `app/shop.js` says "across town". Your own flash on your walls: `INK_VIS.setFlash(list)` (`stFlash()`, called by `stRoom()` and after saving or deleting a sheet in `app/design.js`) repaints one shared canvas (`VR_OWN`, 512 Lite / 1024 Full and Ultra) only when the list changes; the studio and legacy flash walls and the shop-across-town partition show your sheets first (from the curated elements, with titles), generic ones after; Arkady's rooms keep his. The wireless pen: coded group `pen`, `models/ink-machine-pen.glb` (372 triangles, 15 KB, `pen()` in `tools/blender/props.py`, deterministic), `ASSETS.props.pen`; `VR_MACHINE` maps coil/rotary/pen, `setMachine(kind, spare)` puts the kit's machine up front and the newest other owned machine at the back. `stRoom()` is the one call for stage, shop, machine and flash (`stShow`, `caStage`). No new S fields, no new keys.

- 0.1.14.0 built (Kelbo's "room per stage"): `vis/studio.js` builds four rooms (`VR_ROOMS`: Arkady's back room, the rented chair in a busy shop, your studio, the legacy studio; each its own size, walls, floor, dado, window, door, dressing and light) and `vsStage` shows one, sets the lights and the camera box (`ROOM` in `vis/core.js`). The chair, armrests, station, lamp and stool are shared. Every named prop group is built at its home (`ASSETS.props[k].at`) and moved per room as a whole by `VR_PLACE` (origin and turn, `vrPlace`), so the `vis/assets.js` models follow their stand-ins; `vaTexApply` tints each room's floor/walls/dado per stage (`tints`, null keeps the coded lino and tiles). The kit's machine lies up front on the tray (`vsMachine`, `VR_TRAY`, `INK_VIS.setMachine(kind)`, called by `stMachine()` in `app/studio.js` from `stShow`, `kpDone` and `caStage`). The trophy cabinet has a coded stand-in. `INK_VIS.stats()` counts visible meshes only. No new S fields, no new keys.

- 0.1.13.1: Kelbo's tuning of the 0.1.13.0 honours: `REP_TRACKS` gates lowered (the Drawbridge Prize peers 85 → 75, the magazine collectors 75 → 65); a new `GOALS` entry `drawbridge` ("Win the Drawbridge Prize", first place in `S.world.repEv.award`; ticks at once through `evGoalsNow` after the card, or on Next when the default entry is judged; `first_award` stays conventions only); the magazine is now Kontur, Mostograd's invented tattoo quarterly ("outline"; internal id `magazine` unchanged, so saves are untouched; the ИГЛА sign stays). No new S fields, no new localStorage keys.

- 0.1.13.0 built (Kelbo's answers 17–20 in `docs/INK-PLAN.md` § 15): the four unbuilt `REP_TRACKS` events as `REP_EVENTS` in `sim/events.js` (choice cards through `S.world.pending`, gated by the track numbers, `r.fork` draws): a flash day (walk-ins 40, three sheets of your own flash, tallied sittings, money, rep, xp), the Friday 13th special (walk-ins 60, real dates from `friday13Weeks`), a feature in Kontur (collectors 65 since 0.1.13.1, four healed portfolio pieces, at most three, a collector consult), the Drawbridge Prize (peers 75 since 0.1.13.1, week 48, `awardJudge` on the three best healed pieces); a Days and honours card and the rep bars naming every event (`app/events.js`, `app/career.js`); `REP_TRACKS.collectors.events.waiting_list` corrected to 60, the number Act 4 uses. The toast chime plays only for the `TOAST_CHIME` kinds (`toast(msg, kind)` in `app/state.js`). Piece share cards say whose piece it is ("Anton's left forearm"). Skip the broom starts with tips off. New S field: `world.repEv` (hydrated by `worldEnsure`, checked by `buOk` and `check-savecode.js`). No new localStorage keys.

- 0.1.12.0: the three body shapes read apart at a glance. Broad is wider and thicker, Slight narrower and slimmer: `BODY_SHAPES.wrap` in `sim/placements.js` (Broad arm 1.24 ... shoulder 1.24, Slight 0.82 ... 0.84), `BD_FORM` in `vis/body.js` (shoulder half width 0.226 / 0.162, waist, hips, depth), the arms and legs move out with the shoulders and hips (`bdLegKeys`) so the armrests still sit under the forearms, and the Design tab's `BM_SHAPES`. Design fit and flow move by a point or two on Broad and Slight (sim-test before/after in the commit); the 30-year career totals don't move. The shin now runs into the foot (no ankle gap, the foot island unchanged); the coded body is 6,688 triangles. The reference was re-exported (`tools/body-ref.js`) and the mannequin rebuilt with a stronger sculpt (shoulders, waist, knees, calves; `models/ink-mannequin.glb` 6,511 triangles, 317 KB, `check_mannequin.py` passes). A rotary pen: `ASSETS.rotary`, a coded stand-in (group `rotary` in `vis/studio.js`) and `models/ink-machine-rotary.glb` (580 triangles, 15 KB, `props.py`); the Lite room is about 3,000 triangles. The sign says ИГЛА on both the coded sign (`vrSign`, repainted once the Oswald Cyrillic font loads) and `models/ink-sign.glb`. No new S fields.

- The Blender batch built, by script (`tools/blender/`, run with a Python that has `bpy` 5.2; `tools/blender/README.md`): `models/ink-mannequin.glb` (6,507 triangles with the bandeau and shorts, 317 KB, shape keys `masc` and `femme`) is the coded body's reference export (`models/base-mesh/reference/`, not the pistachio mesh) welded and voxel-remeshed into one smooth skin, lightly sculpted, clothes cut from it, the reference UVs copied face by face and checked by `tools/blender/check_mannequin.py`; twelve props (`models/ink-chair.glb` ... `ink-trophies.glb`, 72 to 1,180 triangles each, about 410 KB in all). Every `ASSETS` entry is `on:true`, plus a new `plant2` slot (the legacy studio's second plant, `vis/studio.js` group `plant2`). On Full/Ultra `vaBodyApply` (`vis/assets.js`) swaps in the mannequin: the decal texture and stencil overlay ride on it, `vaBodyShape` drives the morph targets from the body shape, and the coded body stays in the scene hidden so the stencil drag raycast, camera aims and armrests are unchanged; a failed load keeps the coded body. Lite still makes no request under `models/`. Credits in `models/CREDITS.md` and Settings › About. Kelbo can replace any file by hand under the same name (`docs/BLENDER.md`). No new S fields.

- PR 10 (code and free assets) built; the Blender batch was then scripted in 0.1.11.0 (above; `docs/BLENDER.md` is the brief). `vis/assets.js`: the `ASSETS` table and loader, Full/Ultra only (Lite makes no request): Poly Haven CC0 textures on the floor, walls and dado (`models/textures/`, about 270 KB, cached by the service worker as fetched), and a slot per coded prop (`vis/studio.js` now builds each prop as a named group in `room.props`): a model file replaces its stand-in when its entry is `on:true`; entries ship `on:false` until the file exists (no 404s); a failed load keeps the stand-in silently. The mannequin (`ASSETS.body`) is listed but not swapped yet: a follow-up once `models/ink-mannequin.glb` exists. Kenney CC0 UI sounds (`sounds/tap.wav`, `sounds/toast.wav`, `UI_SOUNDS` in `sound/synth.js`: `tick()` and the new `chime()` on toasts; synth fallback; the buzz stays synthesised). The CC0 base mesh (pistachio's Human Basemeshes) is in `models/base-mesh/`; `tools/body-ref.js` (Playwright) exported the coded body to `models/base-mesh/reference/` (three shapes as OBJ, UV atlas, zones); `tools/pack-model.py` is PEW's, adapted (reads .glb, keeps shape keys, prints triangles/size/origin). Credits in `models/CREDITS.md`, `sounds/CREDITS.md` and Settings › About. `build.js` hashes `models/textures/` into the media cache name. No new S fields.

- PR 9 built: help overlays on Act 1 (`app/help.js` `HELP_TIPS`: Arkady's shop, practice on fake skin, draw a flash sheet, the friend's free piece, the first heal; each once, a spotlight on the real control, `S.help` and `S.settings.tips`, Settings › Help › Show tips again); share cards (`app/share.js`: the piece card on its limb, goal trophy cards, the Legacy card, 2D canvas, one share path `shSave`: the share sheet with the file, else a download, the toast says which; every card carries the credit line); Settings grouped into Display, Graphics, Sound, Session (now with the stencil view), Help and Save with one labelled row per control; a landscape layout for short screens (slim header, tab labels beside the icons); toasts drop to the top while a sheet or a tip is open; goals reached by a convention, a lease, a hire or an event tick at once; the reputation bars only name what the game has (no "later update"); contrast fixes (the board's empty hint, done Act 1 steps, the light theme's board edge). New S fields: `help`, `settings.tips`.

- PR 8 built: events, trends, rivals and social media (`sim/events.js`, `app/events.js`, `css/ui-events.css`): `TREND_WAVES` steer walk-in asks (What's in demand card); social media from 2016 (`SOCIAL`: post a healed piece, followers follow reputation, far-away bookings, one viral piece, bad heals posted); `RIVALS` (four invented shops plus alumni: pull walk-ins, undercut, poach, copy flash, as choice cards with a default); `RECKONINGS` once per career (the first-year piece back in years 12–18 shown then and now, the bad-mouthing client, Arkady's referral, the pawn shop on the canal); the inspector's checks and closure (`S.career.closed`); cover-up puzzles drawn under the board's work (`dzOld`) with `coverScore`; conventions judged on a fresh and a healed piece (`convJudge`); ten `GOALS`. A simple shape keeps reading as an outline once its strokes close (`READ.shapeHold`). New S fields: `world`, `goals`; `career.rivals`, `closed`, `inspLast`, `inspFails`, `lastFail`.

- PR 7 built: the career (`sim/career.js`): four acts with Arkady Sedov as mentor and Act 1 as the tutorial (one goal at a time, chores, a friend's free piece, walk-ins after it), the chair split, the lease and studio build-out, vibe and marketing, staff from `simStaffSession` (Shop gallery and shop rep, never your work), apprentices (staff or rivals), conventions, guest spots, Act 4 projects and the TV offer, the signature, the money ledger (`WEEK_HOOKS.costs`) and the soft fail back to a chair; the Legacy screen (`app/legacy.js`); the client archive (`sim/archive.js`: `CLIENT_CAP` 200, compacted clients come back) and the packed save (about 1.5 MB JSON / 0.9 MB code at year 30, pieces never dropped); three save slots and New career with Skip the broom (`app/slots.js`). New S fields: `career`, the extended `studio`.

- PR 6 built: the 3D mannequin (`vis/body.js`: seated, three shapes on one topology with identical UVs, one UV island per zone in true mm, bandeau and shorts, about 6.6k triangles), decals (`vis/decals.js`: element paths drawn per island with aging blur/fade/spread from `INK_SIM.age` and the piece's heal, one texture per client, 1024 Lite / 2048 Full and Ultra), the shop (`vis/studio.js`: stages apprentice/chair/studio/legacy, night canal window, about 2.7k triangles, no shadows on Lite), render on change with camera presets. The Studio tab shows who's in the chair with their pieces; the Session tab places the stencil on the body in 3D (drag, turn with `INK_SIM.sessionRotate`, Flat view fallback in `S.settings.flatStencil`).

- PR 5 built: heals two weeks after a piece (`sim/heal.js` `healPiece`, `HEAL`: crisp, slightly soft, patchy, blown out, infected from the session outputs and the client's aftercare), loyalty, reviews and a free fix after an infection; the three reputation tracks (`REP_TRACKS`, `REP`, 0..100 in `S.rep`, gating `WALKINS.seg` segments); the reveal on the Career tab (`S.reveals`, fresh against healed with the stencil ghost, reaction, review, portfolio prompt); the body of work as the Clients tab's Work view (`app/gallery.js`, renders cached per piece and whole year). Shapes: `docs/SIM-CONTRACT.md` PR 5.

- PR 4 built: the kit (`sim/kit.js`: machines, needles, inks, voltage and stroke, `kitBands`/`kitDeltas`; the build panel on the Studio tab) and the session (`sim/session.js`, `app/session.js`): stencil placement, trace-and-rhythm linework, shading and colour zones, pain and fatigue with break, numbing cream and chat, multi-session pieces (progress on the queue item), practice on fake skin, results and XP, the machine buzz. Handedness and Assist in Settings. New S fields: `kit` (starter kit), `session`, `settings.handed`, `settings.assist`; a new career starts with 3,000 ₽. Session tests: `node tools/session-test.js`.

- PR 3 built: the week clock (`sim/calendar.js`: `advanceWeek`, `nextStop`) behind Career › Next; clients, briefs, the consult, memory, returns and referrals (`sim/clients.js`), walk-ins (`sim/market.js`); the Clients tab (`app/clients.js`): this week, the consult chat, designing for a booking, the client list and card. Sittings use a temporary Quick session until PR 4. S.board gained `item`. Save size grows with every client: PR 7's `CLIENT_CAP` compaction is required.

- PR 2 built: the design board on the Design tab: body diagram (`app/bodymap.js`) with every placement, body shape and skin tone; the cream board with drag, pinch, toolbar, snap to flow, undo/redo; live ▲/▼ deltas and the aging strip on a docked capsule; the stress report; the flash wall (`sim/flash.js`) and your own flash. Saved in `S.board` and `S.flash`. Sample walk-ins until PR 3.

- PR 1 built: seeded rng, 135 design elements (105 original, 30 game-icons CC BY 3.0, credited in `art/CREDITS.md` and Settings › About), 9 styles, 26 placements, design scoring with skin contrast and the stress report, the aging model, ruble `PRICE_INDEX`, `tools/sim-test.js`. Data shapes: `docs/SIM-CONTRACT.md`. The Design tab shows the raw score object until PR 2.
- PR 0 (scaffold) built: five tabs (Studio, Design, Session, Clients, Career), a placeholder 3D back room on the Studio tab, Settings (theme, reduced effects, graphics tier and auto-adjust, sound), Back up / Restore codes and backup files, PWA with the update bar.
- What to test on a phone after any change: the loading bar finishes and the studio renders on Lite; every tab switches; Settings opens as a sheet; Back up and Restore round trip; light theme reads; portrait and landscape; no console errors on desktop.

## Studio catalogue

`LONGLIGHT-STUDIO.md` (repo root) covers every Longlight game: looks, names
already taken, storage and cache prefixes on the shared origin, a reuse map and
improvement ideas. Read it before pitching new ideas, names or looks, and
before building a system another Longlight game may already have. This file
wins where the two disagree. Don't edit the copy here: the master is
`.github/LONGLIGHT-STUDIO.md` in Jxstrr0/Kelbo.Website; it gets recopied.
