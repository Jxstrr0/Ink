# INK_SIM data contract (PR 1)

The shapes every sim file agrees on. Tables live in the files named; field names here are binding. Update this file when a shape changes.

All sim code is inside one IIFE (see `src/README.md`): files add to the shared `SIM` object, may use `clamp`, `lerp`, `rng`, `hash` declared in `sim/rng.js`, and never touch the DOM, `window`, `document` or `Math.random()`. Top-level names inside the IIFE are shared across sim files, so avoid generic names (`data`, `list`, `tmp`) and never declare the same `function` twice (the build fails).

## Units

- Sizes are millimetres. A design's `sizeMm` is the longest side of its bounding box on the skin.
- Element coordinates in a design are normalised to that box: `x`, `y` in 0..1 (centre of the element), `scale` = the element's longest side as a fraction of `sizeMm` (so its real size is `scale * sizeMm` mm), `rot` in degrees.
- `lineWeight` is a liner grouping number from `LINE_WEIGHTS` = `[1,3,5,7,9,11,14]` (1RL fine line … 14RL bold). Line width on skin ≈ `LINE_MM[n]` (table in `design.js`).
- Every score is 0..1 (UI shows ×100). Higher is better.
- `skinTone` 0..1: 0 lightest, 1 darkest.

## `sim/elements.js`

```
COLOURS = { black:{name,hex,light}, grey:{…}, red, orange, yellow, green, teal, blue, purple, pink, brown, white, skyblue }   // light 0..1 (luminance)
STYLES = { traditional, neotrad, blackwork, fineline, realism, japanese, lettering, geometric, watercolour }
  each: { id, name, ageFactor (0..1, how well it holds; traditional ~0.9, watercolour ~0.35, fineline ~0.45),
          lineRange:[minRL,maxRL], palette:[colour ids], blendsWith:[style ids that sit together without a coherence hit],
          demandCurve:[[year,mult],…] (piecewise linear, 2000..2030), clientSegments:[strings] }
ELEMENTS = [ { id, name, family: "motif"|"lettering"|"frame"|"fill"|"texture",
               styles:[style ids], minSizeMm, detail (0..1), lineWeightDefault (a LINE_WEIGHTS value),
               colourable (bool), tags:[…], unlock: "start" | "style:<id>:<level>" | "rnd:<id>",
               path: SVG path data in a 0..100 viewBox (outline, stroked),
               fill: optional SVG path data for solid/shaded areas,
               src: "original" or a key into art/CREDITS.md } ]
SIM.ELEMENTS, SIM.STYLES, SIM.COLOURS, SIM.elementById(id)
```

## `sim/placements.js`

```
PLACEMENTS = { <id>: { id, name, region: "arm"|"leg"|"back"|"chest"|"side"|"neck"|"hand"|"foot"|"shoulder", side: "l"|"r"|null,
               island: UV island id, wrapMm (usable width), lengthMm (usable length), pain 0..1, visibility 0..1, sun 0..1,
               creases: [ {at: 0..1 along the length, axis:"x"|"y", name} ] (every joint; the forearm has elbow and wrist),
               crease: creases[0] or null,
               flowDeg: dominant flow direction (0 = along the limb, down the board),
               flow: [ [[x,y],…], … ]  (2..5 polylines in the placement's 0..1 box, for the board and the flow score),
               curve: 0..1 (how much the surface wraps; ribs high, upper back low) } }
ISLANDS = [ "arm_l","arm_r","leg_l","leg_r","back","chest","side_l","side_r","neck","hand_l","hand_r","foot_l","foot_r" ]
BODY_SHAPES = { masc:{name, wrap:{arm,leg,back,chest,side,neck,hand,foot,shoulder}}, femme:{…}, neutral:{…} }   // multipliers on wrapMm
SIM.PLACEMENTS, SIM.ISLANDS, SIM.BODY_SHAPES, SIM.placementBox(placementId, bodyShape) -> {wrapMm, lengthMm}
```

Allowed zones only: arms (forearm, upper arm, inner wrist area as part of forearm), shoulders, hands, legs (thigh, calf, shin), feet, back (upper, full), upper chest, ribs/side (left and right, the highest pain), neck (side, nape). Nothing else.

## A design

```
{ placement: PLACEMENTS id, sizeMm, style: STYLES id,
  pos: {x, y} (optional, 0..1: where the piece's centre sits in the placement box; default the middle),
  flash: FLASH id, an own-flash id, or null (optional, PR 2: drawn from flash, so FLASH_DISCOUNT.hours applies),
  elements: [ { id: ELEMENTS id, x, y, scale, rot, lineWeight, fill (0..1 shading), colour: COLOURS id or null (= black) } ] }
```

## A client (PR 3 generates them; PR 1 has `TEST_CLIENTS`)

```
{ id, name, pronouns, age (18+), bodyShape: BODY_SHAPES id, skinTone 0..1, job,
  traits: { pain, sun, aftercare, budget, loyalty, talkative, trusting } (each 0..1; pain is pain TOLERANCE, 1 = sits like a rock),
  wants: { styles:{styleId:weight}, tags:[…], sizeMm:[min,max], colour: 0..1 (how much they want colour) },
  mustHaves: [ {kind:"tag"|"element"|"style"|"colour", v} ], dealbreakers: [ same shape ] }
```

## Skills

`{ styles:{styleId: 0..10}, consult, linework, shading, colour, speed }` (0..10). Matches `S.skills`.

## `sim/design.js`

```
SIM.scoreDesign(design, client, skills, opts?) -> {
  readability, flow, balance, coherence, fit,          // 0..1
  total,                                               // 0..1 weighted (weights in DESIGN_WEIGHTS)
  agePrediction: { 5:{blur,fade,spread,readability}, 10:{…}, 20:{…} },
  hours, sessions, price,                              // price uses opts.year (default 2000), opts.rate, opts.repMult
  stress: [ { id, sev: 1|2|3, text } ]                 // from COMBOS, plain English, e.g. "script at 9 mm: letters will close up within 5 years"
}
Tables: LINE_MM, SKIN_CONTRAST, COMBOS, DESIGN_WEIGHTS, HOURS (hours by area and detail), SESSION_HOURS
```

Board helpers (PR 2): `SIM.footprintOf(design) -> {x0, y0, w, h, cx, cy}` (the piece's footprint in the design's normalised box),
`SIM.inkReads(colourId, skinTone) -> 0..1` (`SKIN_CONTRAST`; under 0.45 faint, under 0.2 won't read), `SIM.elementBox(id) -> {x, y, w, h}`
(the path's bounding box in its 0..100 viewBox), `SIM.flowAt(placementId, bodyShape, xMm, yMm) -> degrees` (the local flow, like rot).
`FLASH_DISCOUNT = {hours: 0.8}`: `design.flash` set (or `opts.flash`) multiplies hours before rounding.

## `sim/flash.js` (PR 2)

`FLASH = [ {id, name, note, placement (suggested), style, sizeMm, elements:[…]} ]`: about a dozen pre-composed designs in the design shape.
`SIM.FLASH`. The board app keeps the elements in mm on the placement box and converts with `footprintOf`: sizeMm is the footprint's
longest side, x/y/scale are normalised to it and pos is the footprint centre over the box.

## `sim/aging.js`

```
SIM.age(tattoo, years) -> { blur (mm), fade (0..1 lost), spread (mm), readability (0..1 today) }
tattoo = { design, out: { lineQuality, depthQuality, saturation, trauma } (0..1; defaults 0.75 if missing),
           heal: HEAL_GRADES id or null, ink: INKS tier id or null, skinTone, sun (client's sun-exposure trait) }
Tables: COLOUR_FADE, PLACEMENT_WEAR, HEAL_GRADES (crisp, soft, patchy, blownout, infected), INK_TIERS (if kit.js is empty: budget, standard, premium)
```

## `sim/market.js`

`PRICE_INDEX` (per year 2000..2030, 1.0 in 2000), `SIM.priceIndex(year)`.

## Tests

`tools/sim-test.js`: reads `src/manifest.txt`, concatenates the `sim/*.js` files in order, strips the first `<script>` and last `</script>` lines, runs it in `vm`, takes `INK_SIM`. Fixed seed. Scores ~15 `TEST_DESIGNS` against ~5 `TEST_CLIENTS` (both in `tools/sim-fixtures.js`), prints every sub-score and aging at 5/10/20, and asserts sanity orderings (e.g. tiny script reads worse than big script; watercolour fades faster than traditional; pale yellow on dark skin reads worse than on light skin; a ribs piece that fights the flow scores lower on flow). Exit 1 on failure.

## Notes from PR 1

- Colour goes on an element's fill; its lines stay black, except in watercolour (`COLOUR_LINES`).
- An element's aspect comes from its SVG path's bounding box. Elements tagged `band`/`armband`/`wrap` run across the limb and may exceed the wrap width.
- Job cover needs come from `JOB_COVER` (keywords in the job string) until PR 3 gives clients an explicit field.
- Session `trauma` feeds the heal grade (PR 5), not aging directly.
- Extra exports: `SIM.readabilityOf`, `SIM.FAMILY_SHAPE`, `SIM.RATE_DEFAULT`, `SIM.JOB_COVER`, `SIM.INK_TIERS`, `SIM.AGING`, `SIM.PRICE_INDEX`, `SIM.lineMm`.
