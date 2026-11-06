# Ink: the game as built

This file describes what is actually in the game today (the plan for what comes next is `docs/INK-PLAN.md`). Update it in the same PR as the feature.

## 0.1.1.0: the design sim (text only)

- **Element library:** 135 curated elements (motifs, lettering, frames, fills, textures) across 9 styles; 105 drawn for Ink, 30 from game-icons.net (CC BY 3.0, `art/CREDITS.md`). Lettering is six pre-drawn script words, two roman-numeral dates and banners; the game never renders typed text as art.
- **Placements:** 26 zones on arms, shoulders, hands, legs, feet, back, upper chest, ribs/side and neck, each with wrap and length, pain, visibility, sun, joint creases, flow lines and a UV island. Three body shapes scale the wrap.
- **Scoring:** readability (size vs each element's minimum, density, line weight, skin contrast), flow, balance, coherence, fit to the client, a total, hours, sessions and a price in rubles, and a plain-English stress report.
- **Aging:** blur, fade, spread and today's readability from line weight, depth, colours, placement wear, style, ink tier, skin tone, sun and heal grade.
- **Design tab:** a sample piece and the raw score object, with placement, size, colour and client pickers.
- **Money:** rubles (₽), with a ruble-like `PRICE_INDEX` from 2000 to 2030.

## 0.1.0.0: the scaffold

- **Screens:** five tabs on a bottom bar: Studio, Design, Session, Clients, Career. The header shows the week, year, stage and cash, and the Settings button.
- **Studio:** a placeholder 3D back room (lamp, wall with a flash sheet, the chair and a stool) rendered once per change, and a card about the shop.
- **Session:** "No one in the chair. Book a client from the Clients tab." until sessions exist.
- **Settings:** theme (dark, light, auto), reduced effects, graphics tier (auto, lite, full, ultra) and auto-adjust, sound, Back up / Restore codes, backup files, Install app where the browser allows it.
- **Saves:** the game saves itself to `ink-save`; `INK1:` backup codes carry it and the three slot keys.
- **Setting:** Mostograd, 2000 to 2030.
