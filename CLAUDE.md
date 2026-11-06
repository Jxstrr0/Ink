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
```

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

## Current status (0.1.1.0, November 2026)

- PR 1 built: seeded rng, 135 design elements (105 original, 30 game-icons CC BY 3.0, credited in `art/CREDITS.md` and Settings › About), 9 styles, 26 placements, design scoring with skin contrast and the stress report, the aging model, ruble `PRICE_INDEX`, `tools/sim-test.js`. Data shapes: `docs/SIM-CONTRACT.md`. The Design tab shows the raw score object until PR 2.
- PR 0 (scaffold) built: five tabs (Studio, Design, Session, Clients, Career), a placeholder 3D back room on the Studio tab, Settings (theme, reduced effects, graphics tier and auto-adjust, sound), Back up / Restore codes and backup files, PWA with the update bar.
- What to test on a phone after any change: the loading bar finishes and the studio renders on Lite; every tab switches; Settings opens as a sheet; Back up and Restore round trip; light theme reads; portrait and landscape; no console errors on desktop.
