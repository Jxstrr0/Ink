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
tattoo = { design, out: { lineQuality, depthQuality, saturation, trauma } (0..1; quality defaults 0.75 if missing, trauma 0.25),
           heal: HEAL_GRADES id or null, ink: INKS tier id or null, skinTone, sun (client's sun-exposure trait) }
Tables: COLOUR_FADE, PLACEMENT_WEAR, HEAL_GRADES (crisp, soft, patchy, blownout, infected). Ink tiers come from sim/kit.js
INKS (read at call time; SIM.INK_TIERS is the same object); an unknown or missing ink counts as standard.
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

# PR 3: clients, the consult, the week clock

Files: `sim/clients.js` (tables, generation, consult, memory, returns), `sim/calendar.js` (`WEEK`, `advanceWeek`, `nextStop`, `finishSession`), `sim/market.js` (`WALKINS`, `generateWalkins`). Every random draw takes an rng the caller forked (`SIM.rng(S.seed).fork(label)`); `advanceWeek` forks `"week:<year>:<week>"`, then one fork per hook (`heals`, `aging`, `bookings`, ...), and `bookings` forks `walkins`, `returns`, `referrals`. The same S always advances the same way.

## Time

`(w, y)`: week 1..52 of year 2000..2030. `SIM.weekIndex(w, y)` = weeks since week 1 of 2000; `SIM.weekFrom(i)` -> `{w, y}`. `SIM.WEEKS_PER_YEAR` = 52. A career ends at 2030 week 52 (`SIM.careerOver(S)`).

## A client (full record)

The PR 1 shape above, plus everything the game remembers. All clients are adults: `age` is drawn from `AGE_BANDS` (18..75) and only ever grows.

```
{ id: "c<n>", name: "Darya Sorokina", first: "Darya", surname: "Sorokina", patronymic: "Petrovna" | null,
  addr: what the shop calls them ("Darya", or "Darya Petrovna" from FORMAL_AGE 50 when they have a patronymic),
  pronouns: "she/her"|"he/him"|"they/them", age (18+; updated every week 1), born (year),
  bodyShape: BODY_SHAPES id, skinTone 0..1, job: JOBS name, cover: 0..1 (the job's need to hide tattoos; see below),
  traits: { pain, sun, aftercare, budget, loyalty, talkative, trusting },          // 0..1, from CLIENT_TRAITS
  wants: { styles:{styleId:weight}, tags:[…], sizeMm:[min,max], colour: 0..1 },
  mustHaves: [ {kind, v} ], dealbreakers: [ {kind, v} ],                         // hidden until revealed (or stated in the brief)
  known: { styles:[ids revealed], tags: true, size, colour, pain, sun, cover, budget, aftercare: bool,
           mustHaves:[{kind,v} revealed], dealbreakers:[{kind,v} revealed],
           mustAll, dealAll: bool (the artist knows there are no more) },
  brief: the current brief text (opening, referral or return), ask: (below), theme: BRIEFS theme, briefId, firstTattoo: bool,
  loyalty: 0..1 (the relationship with you; starts at LOYALTY.start + startTrait x traits.loyalty),
  referredBy: client id | null, src: "walkin"|"referral"|"return"|…,
  since: {w,y} (first seen), lastSeen: {w,y} (last history entry), visits, pieces: [piece ids],
  history: [ {w, y, kind, …} ] }
```

`ask` is what they asked for, before any design exists: `{ placement, sizeMm, style, tags:[…], theme, size: SIZE_CLASSES id, bad: BAD_IDEAS id | null, outline?, cover? }`. The consult can change it (a talk-out moves or enlarges it); the accepted ask rides on the booking.

`history` entries (`kind`):

| kind | fields |
|---|---|
| `consult` | `outcome` ("accepted"/"walked"/"declined"), `src`, `asked:[question ids]`, `talk?` ("won"/"lost"/"insisted"), `bad?`, `quote? {price, deposit, option}`, `ret?` (return rule id) |
| `piece` | `piece` (id), `name` |
| `session` | `n`, `of` (a sitting of a multi-session piece) |
| `review` | `piece`, `stars` 1..5, `text` |
| `referral` | `client` (who they sent) |
| `note` | `text` (e.g. gave up waiting for a consult) |
| `heal` | PR 5: `piece`, `grade` (a HEAL_GRADES id) |

**Job cover.** `JOBS` names keep the `design.js` `JOB_COVER` keywords, and `tools/sim-test.js` checks every job's explicit `cover` is within 0.25 of what `JOB_COVER` reads from the name, so scoring agrees today. `client.cover` is the explicit field; `design.js` can switch `dzJobCover(client.job)` to `client.cover ?? dzJobCover(client.job)` when the lead next touches it (design.js is outside PR 3's files).

**Briefs.** `BRIEFS` entries: `{ id, theme, text (with {slots}), tags (must exist in ELEMENTS), styles, size, place (base ids like "forearm" or full ids), seg (STYLES clientSegments), known? {must, deal}, first?, from?, to?, ages? [min,max], job? (name or list) }`. Slots: `{person} {Pr} {pr} {pos} {loved} {habit} {flower} {petName} {place} {workplace} {partner} {pastYear}` (a capitalised `{Place}` capitalises the value). A slot value with `tags` adds them to the ask. `{pastYear}` is always a year the client was already 18+, and briefs that use it need age 20+.

**Mostograd.** Names come from `NAMES` groups (mostly Russian, with Tatar, Caucasus, Baltic, Korean-Russian, West African, East Asian and other port-city names; surnames in masculine/feminine pairs; they/them clients take an indeclinable surname). Places in the text: the Old Bridge, Lodochnaya Embankment and Kanatnaya Street (all from Lombard), the canal, the port, the harbour mouth, the outer ring, the dacha, the banya, the White Nights.

## The consult

A pure state machine. `SIM.consultStart(client, S, {item})` -> consult; `SIM.consultOptions(consult)` -> 3..5 `{id, kind, text}`; `SIM.consultChoose(consult, id, r)` -> a **new** consult (the one passed in is untouched); `SIM.consultCommit(S, consult)` writes the result into S.

```
consult = { client (the record), clientId, step (exchanges so far), max (3..5: 3 + 0..2 for talkative clients),
  stage: "talk" | "quote" | "done",
  transcript: [ {who: "client"|"artist"|"note", text} ],
  known: a copy of client.known that grows, ask: a copy the talk-out may change, asked: [question ids],
  mood 0..1, bad: BAD_IDEAS id | null, talk: null|"won"|"lost"|"insisted", respect?,
  quote: null | { price, deposit, hours, sessions, option: "q_fair"|"q_high"|"q_low", mult, wtp, accept, wait },
  outcome: null | "accepted" | "walked" | "declined",
  skill (S.skills.consult), year, week, rate (rubles/hour today), wait (weeks of booked hours ahead), shopStage,
  est {hours, sessions}, src, item (queue item id | null), ret (the return's ret object | null) }
```

Option kinds: `ask` (a `CONSULT_QUESTIONS` id: reveals one hidden thing with chance `base + skill x consult + trust x trusting + talk x talkative`, else a vague answer), `talk` (`talk_gentle` / `talk_blunt`, only while a bad idea is open: win = the ask is fixed and loyalty rises; fail = they walk (`outcome "walked"`, the booking is lost) or insist), `price` (`to_quote`, from the second exchange), `quote` (`q_fair`, `q_high`, `q_low`, `decline`). From exchange `max - 1` only the quote options are offered, so every consult ends with an outcome in at most 5 exchanges.

The quote: hours and sessions come from `scoreDesign` on a one-element stand-in for the ask (`SIM.proxyDesign(ask)`, `SIM.estimate(ask, client, skills)`); price = hours x rate x the option's mult, rounded to 100 ₽ (`S.rate` once PR 7 sets it, already in today's rubles; until then `RATE_DEFAULT.rate x QUOTE.stageRate[stage] x priceIndex(year)`). Deposit = 20% (at least 300 ₽ in 2000 money, at most half the price). Acceptance falls with price / willingness to pay (`wtpLo..wtpHi` by budget x priceIndex, more for loyal clients), rises with mood, and falls with the wait beyond what they'll tolerate (collectors wait far longer). A touch-up inside a year is free.

`consultCommit(S, consult)` -> `{client, item, isNew}`: adds a new client to `S.clients` (walk-ins who walked are kept too: they remember you), copies `known` (and the changed `ask`), logs a `consult` history entry, moves loyalty (`LOYALTY`), removes the queue item the client came in on, and on acceptance pushes a `session` queue item after the current wait and adds the deposit to `S.cash`.

## Pieces

`SIM.addPiece(S, {client, design, out, heal, price, ret})` -> piece, appended to `S.pieces` (never dropped):

```
{ id: "p<n>", client: client id, design (the design shape), out: {lineQuality, depthQuality, saturation, trauma} | null,
  heal: HEAL_GRADES id | null (PR 5 sets it), w, y (the week it was finished),
  name: "the rose on Darya's left forearm", label: "rose" (the biggest motif; lettering reads '"Hope" script'),
  stage: S.studio.stage when it was done (RETURN_RULES cover_own looks for early work), price, ret?: {rule, piece} (a return) }
```

`SIM.pieceLabel(design)`, `SIM.pieceName(label, client, placement)`. Placements read as a client would say them after "my" (`PLACE_WORDS`: "neck, left side").

## Queue items (`S.queue`)

Every item has `{id: "q<n>", kind, client: client id, w, y}` (the week it is due).

| kind | extra fields | lifetime |
|---|---|---|
| `walkin` | `newClient` (the full record; not in `S.clients` until `consultCommit`), `src:"walkin"`, `expires` (week index = its own week), `brief`, `ask` | leaves at the end of its week if nobody consults them |
| `consult` | `src: "return"` or `"referral"`, `expires` (due + `WEEK.consultWait`), `brief`, `ask`; returns: `ret {rule, piece, label, year, w, place, foreign?}`, `beat` (PR 8); referrals: `newClient`, `from` (referrer id) | gives up after `expires` (a return costs a little loyalty) |
| `session` | `hours` (this sitting), `sessionNo`, `sessions`, `price`, `deposit`, `paid`, `ask`, `design` (null until the board fills it), `booked {w,y}`, `moved`, `ret?` | each week the due sessions fill the chair hours oldest first; the rest move to next week (`moved++`); one that wasn't played rolls over |

`SIM.finishSession(S, itemId, {design, out, heal})` -> `{piece, next, paid}`: removes the item, adds this sitting's share of `price - deposit` to `S.cash`, and books the next sitting `WEEK.sessionGap` weeks later (carrying the design) or, on the last one, calls `addPiece`. `SIM.waitWeeks(S)` = booked session hours / this stage's hours per week.

## The week clock

`WEEK = { stages: {apprentice|chair|studio|legacy: {hours, maxBookings, walkinSlots}}, healWeeks: 2, sessionGap: 3, consultWait: 2, maxSkip: 4, nextStopsOnWalkins: true, first, last }`; `SIM.weekHours(S)`.

`SIM.advanceWeek(S)` -> log. The only function that moves `S.week` / `S.year`. Steps: close the ending week (unseen walk-ins leave, stale consults give up), week + 1 (52 -> week 1 of the next year), then `WEEK_ORDER` = `heals, aging, bookings, costs, events, trend`, each `SIM.WEEK_HOOKS[name](S, ctx)` with `ctx = {r, log, yearRolled, now}`:

- `heals`: pieces finished `healWeeks` ago get their bandage off. Calls `SIM.healPiece(S, piece, r, log)` if PR 5 defined it; until then it logs a `heal` line.
- `aging`: on week 1, `client.age = year - born` for everyone and a `year` line counts the pieces that turned a year older (PR 5 re-renders those).
- `bookings`: `generateWalkins` -> `walkin` items; `scheduleReturns` -> `consult` items; referrals from pieces that healed `REFERRAL.after` weeks ago (not after patchy, blown-out or infected heals); then the chair hours.
- `costs` (PR 7), `events` (PR 8: queued events, reckonings, inspections; push `{k:"event"}` to stop Next), `trend` (PR 8): no-ops. Replace one by assigning `SIM.WEEK_HOOKS.costs = fn`.

The log: `[ {k, text, client?, piece?, item?, n?, from?, hours?} ]`, `k` one of `week` (always first), `left`, `gaveup`, `heal`, `year`, `walkin`, `return`, `referral`, `booked`, `carried`, `cost`, `event`, `trend`, `end`. At 2030 week 52 the log ends with `{k:"end"}`, the array has `.end = true`, and further calls change nothing.

`SIM.nextStop(S)` -> `{weeks (0..4), why: "client"|"walkin"|"heal"|"event"|"cap"|"end", line, log}`: advances until a session or booked consult is due this week (or a walk-in, while `WEEK.nextStopsOnWalkins`), a heal or an event, at most `WEEK.maxSkip` weeks. `line` is one sentence for the Career tab, e.g. "Weeks 22 to 25, 2004: 8 walk-ins left unseen; 3 walk-ins: Timofei, Davit, Pavel; a quiet stretch."

## Walk-ins (`sim/market.js`)

`SIM.generateWalkins(S, r)` -> `[client]` (not yet in S): the count is Poisson(`WALKINS.base[stage]` x `WALKIN_SEASON[week]` x (1 + `WALKINS.rep[track]` x rep / `repFull`) for each track), capped at the stage's `walkinSlots`. Each is a `makeClient` weighted by this year's style demand (`SIM.styleDemand(style, year)` = `demandCurve` x `SIM.trendMult(style, year)` if PR 8 defines it), the client segments the reputation tracks pull in (`WALKINS.seg`) and the sizes the stage allows (`WALKINS.sizes`: an apprentice gets tiny and small flash). `S.rep` is read on a 0..100 scale until PR 5 fixes `REP_TRACKS`.

## Returns, referrals, reviews

- `SIM.scheduleReturns(S, r)` -> new `consult` items. For every piece, each `RETURN_RULES` rule (`touchup`, `addon`, `sleeve`, `cover_own`, `cover_other`) whose `after:[from,to]` window (weeks since the piece) contains its age rolls a weekly chance spread from `p:[at loyalty 0, at 1]`. At most one pending item (consult or session) per client. The brief always names the piece and its year ("You did the rose on my left forearm in 2003. I want a full sleeve now..."); `cover_other` invents someone else's piece (`FOREIGN_PIECES`) from a year the client was already an adult. `cover_own` (needs a piece from the apprentice stage or the first 3 years) carries `beat: null` for PR 8, and `SIM.onReturn(item, S)`, if defined, may turn any return into a scripted reckoning.
- `SIM.referral(client, r, opts)` -> a new client with `referredBy = client.id` whose brief opens with the referrer's first name ("Darya sent me...").
- `SIM.writeReview(client, piece, r, force?)` -> a `review` history entry from `REVIEWS[heal grade][loyalty band]` with a `REVIEW_CHANCE` (or null). PR 5 calls it after a heal.
- `SIM.loyaltyBump(client, kind | delta)`, `SIM.clientLog(client, entry)`, `SIM.findClient(S, id)` (a Map index cached per `S.clients` array).

## Which S fields each function reads and writes

No PR 3 function adds a top-level S field.

| function | reads | writes |
|---|---|---|
| `makeClient(r, opts)`, `referral` | opts only | nothing |
| `generateWalkins(S, r)` | `week`, `year`, `rep`, `studio.stage`, `clients` / `queue` (for ids) | nothing |
| `consultStart(client, S, {item})` | `year`, `week`, `skills`, `rate`, `studio.stage`, `queue` (the wait) | nothing |
| `consultOptions`, `consultChoose` | the consult | nothing (returns a new consult) |
| `consultCommit(S, c)` | `week`, `year`, `queue` | `clients` (push, the record), `queue` (removes the item, pushes a session), `cash` (+ deposit) |
| `addPiece(S, o)` | `week`, `year`, `studio.stage`, `clients` | `pieces` (push); the client's `pieces`, `history`, `visits`, `loyalty` |
| `scheduleReturns(S, r)` | `week`, `year`, `clients`, `pieces`, `queue` | `queue` (push); the client's `brief`, `ask` |
| `finishSession(S, id, res)` | `week`, `year`, `queue`, `clients` | `queue`, `cash`, and via `addPiece` |
| `advanceWeek(S)` | all of the above, `seed` | `week`, `year`, `queue`, `clients` (ages, loyalty, history), via its hooks |
| `nextStop(S)` | as `advanceWeek` | as `advanceWeek` |

## Tables added in PR 3

`clients.js`: `CLIENT_TRAITS`, `AGE_BANDS`, `PRONOUNS`, `NAMES`, `JOBS` (+ `JOB_AGES`), `BRIEF_SLOTS`, `SIZE_CLASSES`, `STYLE_COLOUR`, `BRIEFS`, `HIDDEN_WANTS`, `BAD_IDEAS` (+ `BAD_IDEA_CHANCE`), `CONSULT_QUESTIONS`, `CONSULT_ANSWERS`, `CONSULT`, `QUOTE`, `LOYALTY`, `REVIEWS` (+ `REVIEW_CHANCE`, `REVIEW_BANDS`), `FOREIGN_PIECES`, `RETURN_RULES`, `REFERRAL`, `PLACE_WORDS`. `calendar.js`: `WEEK`, `WEEK_HOOKS`, `WEEK_ORDER`. `market.js`: `WALKINS`, `WALKIN_SEASON`. All are on `SIM`.

## Notes from PR 3

- The synthetic 30-year run (one artist, no staff, auto-play) ends with ~5,500 client records and ~5,600 pieces; S as JSON is ~10 MB (~1.5 KB a client, ~0.4 KB a piece). That is past localStorage's ~5 MB long before year 30, so PR 7's `CLIENT_CAP` compaction (and probably leaner piece records) is required, not optional.
- `advanceWeek` at year 30 runs ~7 ms in node (budget 50 ms).

# PR 4: the session and the kit

## Outputs

`out = {lineQuality, depthQuality, saturation, trauma, sessionsUsed, blowouts, joins}`. The first three are 0..1, higher is better. **`trauma` is 0..1 and LOWER is better** (skin damage: rushing, lingering, blowouts, overworking a zone, a hard-hitting kit); it feeds the heal grade in PR 5, not aging directly. A piece made by the session also carries, at the top level: `heal: null`, `healDue: {w, y}` (two weeks on, `SE_HEAL_WEEKS`), `sessionsUsed`, `blowouts`, `joins`, `ink` (INKS id), `machine` (MACHINES id).

## `sim/kit.js`

```
kit = {machine, needles:[ids on the tray], ink, voltage, stroke, owned:{machines:[], needles:[], inks:[]}}   (S.kit, KIT_DEFAULT)
SIM.kitBands(kit, skills, settings{assist}, {liner}?) -> {paceBand, accFrac, pace, hit, depthTol, trauma, pain, shade, colour,
  liner, liners:[{id, rl, lo, hi}], lineBand:[lo, hi] (the liner in use), lineAll:[lo, hi] (the tray), lineMm:[lo, hi],
  fade, spread, sat (the ink), buzz {wave, hz, cut, rough}, machine, ink, assist}
SIM.kitDeltas(a, b, skills?, settings?) -> {band, pace, shade, trauma, fade (ratios - 1), lineLo, lineHi (LINE_WEIGHTS steps)}
SIM.kitPrice(kind "machine"|"needle"|"ink", id, year) -> rubles that year;  SIM.kitClean(kit) -> a valid kit;  SIM.kitDefault()
```

Tables: `MACHINES` (`coil_used`, `coil`, `rotary`, `pen` from 2014: band, trauma, depth, pain, price in 2000 rubles, buzz), `NEEDLES` (liners `1RL`..`14RL` with `rl` and `reach`, mags `7M1`, `9M1`, `13RM`, `15RM`; `shade`), `INKS` (`budget`, `standard`, `premium`: fade, spread, sat), `VOLTAGE`, `STROKE`, `KIT_TUNE`, `ASSIST`, `KIT_DEFAULT`, `KIT_TRAY_MAX`.

## `sim/session.js`

```
sess = SIM.sessionNew({design, client, skills, kit, settings:{assist}, bodyShape, skinTone, kind:"practice"|"sample"|"booked",
                       itemId, part, partsTotal, progress, year, week})     numbers and short strings only: it saves as JSON
SIM.sessionPlan(sess) -> {box, strokes, zones, items:[{k:"line"|"shade"|"colour", i, w (hours), cw}], hours, work, parts}  (cached)
SIM.sessionBands(sess) -> kitBands + {paceMmS, accMm, view}
SIM.stencilCheck(design, client, skills) -> {flow, issues: stress entries crease, crease_near, too_wide, too_long, against_flow, against_shape}
SIM.sessionPlace(sess, {x, y})   SIM.sessionStart(sess)   SIM.sessionResume(sess)   SIM.sessionItem(sess) -> item + {stroke | zone} | null
SIM.penDown / penMove / penUp(sess, tMs, xMm, yMm) -> {ok, why?, r (pace / target), d (mm off), rushed, blow, join, sat, over, inside,
                                                     pain, fatigue, clock, stop, done, lineDone}
SIM.sessionSetLiner(sess, id)   SIM.sessionNextItem(sess)   SIM.sessionAction(sess, "break"|"numb"|"chat") -> {ok, why, eff, cost, talk}
SIM.sessionFinish(sess) -> {done, early, stop ("done"|"pain"|"fatigue"|"artist"), out, sitting {lineQuality, depthQuality, blowouts,
   joins, trauma, hours, items, pain, fatigue}, progress {next, zsat, acc, cur}, part, partsTotal, sessionsUsed, nextPart, left}
SIM.sessionXp(result, sess, skills) -> {linework, shading, colour, speed, styles:{id: +x}}  (added to S.skills, capped at 10)
SIM.sessionSynth(sess, {speed, noise, wave, stopAt, stopMs, lift}), SIM.sessionTrace(sess, contacts)   for tests
```

Coordinates are millimetres on the placement box (`placementBox(placement, bodyShape)`), the same transform the board draws with. A piece of N sittings splits its work list at 1/N, 2/N... of the hours; a sitting that ends early leaves the rest to the next. Multi-session progress lives on the booked `S.queue` session item as `item.progress` (the `progress` object above); `finishSession` copies it to the next sitting's item.

Tables: `STENCIL`, `PACE`, `ACC`, `DEPTH`, `BLOW`, `JOIN`, `LW_FIT`, `ZONE`, `COLOUR_PACK` (`COLOUR` inside the file), `TRAUMA`, `PAIN`, `FATIGUE`, `BREAK`, `NUMB`, `CHAT`, `CLOCK`, `SKILL_XP`. Extra exports: `SIM.flattenPath`, `SIM.pointAt`, `SIM.insideZone`. Nothing in the session is random.

## Which S fields PR 4 adds

`kit` (filled), `session` (`{live, next}` or null), `settings.handed`, `settings.assist`; `cash` starts at 3,000. The sim functions above touch only `sess`; `app/session.js` writes `S.session`, `S.skills`, `S.cash` (numbing cream, sample pay), `S.pieces` (via `addPiece` / `finishSession`) and `item.progress`.

## Tests

`node tools/session-test.js`: the flattener, the stencil plan, steady against rushed, blowouts, joins, Assist, the liner fit, ribs against forearm pain, numbing, breaks, chat, practice, shading overwork, a multi-session back piece, the pain limit, outputs and XP.

# PR 5: the heal, the reveal, reputation

File: `sim/heal.js` (after `calendar.js` in the manifest: it wraps `WEEK_HOOKS.heals`). The app side is `app/gallery.js` (the reveal and the body of work) and the reputation bars in `app/career.js`.

## The heal

`SIM.healPiece(S, piece, r, log)` -> the grade. `calendar.js` `calHeals` calls it for each piece finished `WEEK.healWeeks` (2) weeks ago with no heal yet; the rng is the week's `heals` fork, and `healPiece` forks `"grade:<piece id>"` and `"review:<piece id>"` from it. A piece heals **exactly once**: a piece with `heal` set returns that grade and changes nothing. Practice never makes a piece, so it never heals.

The grade (a `HEAL_GRADES` id in `aging.js`, which then feeds `SIM.age`), from `SIM.healOdds(piece, aftercare)` -> `{infect, blow, score}` and `SIM.healGrade(piece, aftercare, r)`; the draws are always in the order infection, blowout, score:

- **infected**: chance `HEAL.infect.max x (trauma - 0.55) / 0.45 x (0.45 - aftercare) / 0.45`, so it needs trauma over 0.55 *and* aftercare under 0.45. Low trauma never infects.
- **blownout**: chance `HEAL.blow.max x (1 - e^(-blowouts / HEAL.blow.k))` (blowouts from `piece.blowouts`, else `out.blowouts`). No blowouts, never.
- otherwise the heal score `0.28 line + 0.32 depth + 0.18 saturation + 0.22 (1 - trauma) + 0.3 (aftercare - 0.55) - 0.012 x joins (at most 0.08)` plus `normal(0, 0.05)`: **crisp** from 0.76, **soft** from 0.6, else **patchy**.

Aftercare is `client.traits.aftercare`. For a piece whose client isn't in `S.clients` (a sample walk-in from the Design tab) `healPiece` asks `SIM.guestClient(id) -> {traits, loyalty, skinTone}` if the app set it, else uses `HEAL.careDefault` (0.6).

What `healPiece` writes:

| where | what |
|---|---|
| `piece` | `heal` (the grade), `healW`, `healY` (the week it healed); for a sample walk-in only, `review: {stars, text}` |
| the client | a `heal` history entry `{w, y, kind:"heal", piece, grade}`, `loyaltyBump(client, grade)` (`LOYALTY.crisp` ... `infected`), and through `writeReview` maybe a `review` entry (`REVIEW_CHANCE` by grade) |
| `S.rep` | `repHealDelta(S, piece)`, then the review's stars (below) |
| `S.queue` | on an infection, for a client on the books: a free fix `{kind:"session", price:0, deposit:0, hours (HEAL.fix: 0.02 h per mm, 1..4), sessions:1, design (a copy), fix: piece id, ret:{rule:"touchup", piece}}` due `HEAL.fix.weeksAfter` (3) weeks on. Finishing it goes through `finishSession` like any sitting (and makes a touch-up piece) |
| `S.reveals` | the piece id is pushed when `S.reveals` is an array (the app's `freshState` has it; the node tests' bare S does not), keeping the newest `REVEAL_CAP` (12) |
| the log | `{k:"heal", text, piece, client, grade, review: stars or null}`; an infection's text names the free fix's week |

`SIM.healReaction(piece, loyalty)` (from `HEAL_REACTIONS[grade][low|mid|high]`, bands from `REVIEW_BANDS`) and `SIM.healApology(piece)` (`HEAL_APOLOGY`) pick a line stably per piece id (`hash`), so a reveal reads the same every time. `SIM.pieceReview(S, piece)` -> the review (the client's history entry, or `piece.review`) or null.

Referrals still skip patchy, blown-out and infected heals (`calendar.js`).

## Reputation

`S.rep = {walkins, collectors, peers}`, each 0..100 (`REP.full`; `WALKINS.repFull` reads the same scale).

| track | what moves it | client segments it unlocks (`unlocks`: the value a `WALKINS.seg` segment starts pulling at) | events (`events`, for PR 8) |
|---|---|---|---|
| `walkins` (speed and price) | a heal: crisp +0.3, soft +0.18, patchy -0.2, blown out -0.6, infected -1.5; a flash piece +0.12; a piece 60 mm or smaller +0.08; a review +0.25 per star from 3 | `walk_in` 0, `first_timer` 0, `students` 15, `trades` 25 | `flash_day` 40, `friday_13` 60 |
| `collectors` (custom work and style) | a custom (not flash) piece when it heals: (0.15 + 0.003 per mm up to 250 mm, + 0.06 in a style you hold at 6+) x the grade (crisp 1, soft 0.7, patchy 0.2, blown out -0.6, infected -1.2); a review +0.12 per star from 3; the portfolio +0.5 (and -0.5 taking it out) | `creatives` 10, `memorial` 15, `collector` 25, `large_scale` 45 | `waiting_list` 50, `magazine` 75 |
| `peers` (clean heals) | a heal: crisp +0.3, soft +0.08, patchy -0.3, blown out -1, infected -2.5; a review +0.05 per star from 3 | `old_school` 20, `cover_up` 35 | `guest_spot` 30, `convention` 55, `award` 85 |

- A piece moves reputation when it **heals**, not when it's finished (every piece heals two weeks on).
- `SIM.repAdd(S, track, delta)`: a gain is multiplied by `1 - REP.soft x track / 100` (`soft` 0.85), so a track fills slower as it rises; a loss is taken whole; the result is clamped to 0..100.
- `SIM.repWeek(S)`: every track loses `REP.decayWeek` (0.15%) of itself each week (the heals hook calls it after the heals), so a reputation has to be kept up.
- `SIM.setPortfolio(S, piece, on)`: healed pieces only; sets or removes `piece.portfolio` and moves collectors by `REP.portfolio.collectors` with no soft cap, so taking it out gives back exactly what putting it in gave.
- `SIM.repUnlocked(S, track, id)` (a segment or event id), `SIM.repNext(S, track) -> {id, kind:"segment"|"event", at}` or null.
- `market.js` `mkSegBoost`: each track's `WALKINS.seg` weights x the track / 100, except that a segment under its unlock pulls nothing.

## Which S fields PR 5 adds or writes

`reveals` (new: piece ids), `rep` (now moved), and on pieces `heal`, `healW`, `healY`, `portfolio`, `review` (sample walk-ins). `healPiece` writes `pieces`, `clients` (history, loyalty), `rep`, `queue` (the free fix) and `reveals`; `repWeek` writes `rep`; `setPortfolio` writes the piece and `rep`.

## Tables added in PR 5

`heal.js`: `HEAL`, `REVEAL_CAP`, `HEAL_REACTIONS`, `HEAL_APOLOGY`, `REP_TRACKS`, `REP`. All on `SIM`.

## Tests

`tools/sim-test.js`, block "PR 5: heals and the reputation tracks": good outputs with good aftercare heal crisp; high trauma with bad aftercare can get infected, low trauma never does; blowouts lead to blown-out heals; a piece heals exactly once, two weeks on, and lands in `S.reveals`; the heal feeds aging; reviews are sometimes written; loyalty and every track move the right way; gains soften, tracks decay, the portfolio nudge comes back off; segment unlocks. The 30-year run now heals every piece and still times `advanceWeek` (budget 50 ms).

## Notes from PR 5

- In the 30-year auto-play (default outputs 0.8 / trauma 0.4, aftercare as drawn) about 58% of pieces heal crisp, 41% soft and 1% patchy. The run's referrals rise from about 1,000 to 1,200 because every piece now heals and crisp heals raise loyalty.
- The gallery's renders are never saved: `app/gallery.js` caches them in memory per piece id + whole years of age + heal + skin tone.
