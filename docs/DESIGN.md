# Ink: the game as built

This file describes what is actually in the game today (the plan for what comes next is `docs/INK-PLAN.md`). Update it in the same PR as the feature.

## 0.1.2.0: the design board

- **Design tab, three views:** Body, Board and Flash, on a segmented control at the top.
- **Body:** an original front/back drawing of the neutral mannequin (smooth capsule limbs, no face, crop top and shorts so the ribs show), in `app/bodymap.js`. Every one of the 26 placements is a tappable (and keyboard-focusable) zone; picking one shows its room (wrap × length for the body shape), pain, how much it shows and its sun. A body-shape switch (Broad, Slight, Average) reshapes the figure and the wrap widths, and a skin-tone slider tints it; both feed scoring. A list picker does the same for anyone who prefers it.
- **Walk-ins:** four sample clients (Darya, Bogdan, Sasha, Ilya) to score against until real clients arrive in PR 3. Picking one sets the body shape and skin tone.
- **Board:** cream with black ink in both themes. The placement's box at its true aspect in millimetres, with a mm ruler, the flow lines, the joint creases and the piece's footprint (W × H mm). Elements come from a drawer in the sheet, filtered by style, family and tag; locked elements are greyed with what unlocks them, and "Show all (sandbox)" opens everything for testing (not saved). Drag to move, two fingers to pinch-scale and rotate, the corner handle for mouse users, and a toolbar: size, rotate ±15° (90° steps from the flow with snap on), line weight (1 to 14RL), fill, colour swatches from the style's palette (greyed, hatched and labelled "faint" or "won't read" when `SKIN_CONTRAST` says so on this skin tone), duplicate, bring forward, delete. Snap to flow turns an element's long axis along the limb's flow where it sits. Lines are drawn at their true width, so a 1RL line on a big piece is a hairline.
- **Capsule:** docked at the bottom of the board: readability, flow, fit, hours, visits (sessions) and price in rubles, each with a ▲/▼ delta from before the last change (colour and shape). Under it, the piece now and at 5, 10 and 20 years, blurred, faded and with the lines spread by `agePrediction`, with readability under each. The chevron hides the aging row (hidden by default on short phones).
- **Stress report:** every `stress` line with a severity icon (octagon serious, triangle warning, circle note), plus balance, coherence and overall.
- **Flash wall:** 12 pre-composed designs (`FLASH`, `sim/flash.js`) that take 20% fewer hours (`FLASH_DISCOUNT`, `design.flash`). Using one loads it on the current spot (shrunk to fit if needed). Adding or removing elements makes it a custom piece again. "Save to my flash" keeps your own designs (up to 40) as your flash, with the same discount.
- **Undo/redo:** buttons, Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y). On desktop, Tab reaches each element; arrows nudge (Shift for 5 mm), + and − size, [ and ] turn, Delete removes, Escape deselects.
- **Saving:** the working design, body shape, skin tone and walk-in (`S.board`) and your flash (`S.flash`) save with the game and ride in backup codes; designs save as parameters, never pictures.

## 0.1.1.0: the design sim (text only)

- **Element library:** 135 curated elements (motifs, lettering, frames, fills, textures) across 9 styles; 105 drawn for Ink, 30 from game-icons.net (CC BY 3.0, `art/CREDITS.md`). Lettering is six pre-drawn script words, two roman-numeral dates and banners; the game never renders typed text as art.
- **Placements:** 26 zones on arms, shoulders, hands, legs, feet, back, upper chest, ribs/side and neck, each with wrap and length, pain, visibility, sun, joint creases, flow lines and a UV island. Three body shapes scale the wrap.
- **Scoring:** readability (size vs each element's minimum, density, line weight, skin contrast), flow, balance, coherence, fit to the client, a total, hours, sessions and a price in rubles, and a plain-English stress report.
- **Aging:** blur, fade, spread and today's readability from line weight, depth, colours, placement wear, style, ink tier, skin tone, sun and heal grade.
- **Design tab:** a sample piece and the raw score object, with placement, size, colour and client pickers (replaced by the board in 0.1.2.0).
- **Money:** rubles (₽), with a ruble-like `PRICE_INDEX` from 2000 to 2030.

## 0.1.0.0: the scaffold

- **Screens:** five tabs on a bottom bar: Studio, Design, Session, Clients, Career. The header shows the week, year, stage and cash, and the Settings button.
- **Studio:** a placeholder 3D back room (lamp, wall with a flash sheet, the chair and a stool) rendered once per change, and a card about the shop.
- **Session:** "No one in the chair. Book a client from the Clients tab." until sessions exist.
- **Settings:** theme (dark, light, auto), reduced effects, graphics tier (auto, lite, full, ultra) and auto-adjust, sound, Back up / Restore codes, backup files, Install app where the browser allows it.
- **Saves:** the game saves itself to `ink-save`; `INK1:` backup codes carry it and the three slot keys.
- **Setting:** Mostograd, 2000 to 2030.
