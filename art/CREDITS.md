# Art credits

Credits for the design-element art in `src/sim/elements.js` (the `ELEMENTS` table). Ink only uses CC0 or CC-BY art: never NC or ND, nothing traced from a real tattoo artist's work, no real brands or people.

## How to read this file

- An element's `src` field is either `"original"` or one of the keys below (in backticks).
- **`original`**: drawn as SVG paths by Claude Code for Ink / Longlight Interactive (© 2026 Kelbo / Longlight Interactive). That is every element whose `src` is `"original"`, including the generated geometric, botanical and pattern art and the pre-drawn script words. Kelbo's own art, when it lands, is also marked original and noted here.
- **Sourced art**: one entry per asset: the key, the asset name, the author, the licence and the URL it came from. Changes made for Ink are noted per source.

## game-icons.net (CC BY 3.0)

Licence: Creative Commons Attribution 3.0 Unported, https://creativecommons.org/licenses/by/3.0/ . Source repository: https://github.com/game-icons/icons .
Changes for Ink: the icon's path data was extracted (the black 512x512 background square dropped) and rescaled from the 512 viewBox to Ink's 0..100 box at 0.1 precision with `node tools/element-sheet.js --import` (the octopus and snake also shrunk slightly to fit the box). The shapes are otherwise unchanged; in game they are stroked and filled in tattoo ink.

| key | asset | author | licence | URL | used by element |
|---|---|---|---|---|---|
| `gi_rose` | Rose | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/rose.html | `rose_bold` |
| `gi_sparrow` | Sparrow | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/sparrow.html | `sparrow` |
| `gi_snake` | Snake | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/snake.html | `snake` |
| `gi_spider_web` | Spider web | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/spider-web.html | `spider_web` |
| `gi_lighthouse` | Lighthouse | Delapouite (https://delapouite.com) | CC BY 3.0 | https://game-icons.net/1x1/delapouite/lighthouse.html | `lighthouse` |
| `gi_octopus` | Octopus | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/octopus.html | `octopus` |
| `gi_curled_tentacle` | Curled tentacle | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/curled-tentacle.html | `tentacle` |
| `gi_bee` | Bee | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/bee.html | `bee` |
| `gi_mushroom` | Mushroom | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/mushroom.html | `mushroom` |
| `gi_daisy` | Daisy | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/daisy.html | `daisy` |
| `gi_lotus` | Lotus | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/lotus.html | `lotus_bold` |
| `gi_feather` | Feather | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/feather.html | `feather` |
| `gi_swan` | Swan | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/swan.html | `swan` |
| `gi_hummingbird` | Hummingbird | Delapouite (https://delapouite.com) | CC BY 3.0 | https://game-icons.net/1x1/delapouite/hummingbird.html | `hummingbird` |
| `gi_dragonfly` | Dragonfly | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/dragonfly.html | `dragonfly` |
| `gi_jellyfish` | Jellyfish | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/jellyfish.html | `jellyfish` |
| `gi_seahorse` | Seahorse | Delapouite (https://delapouite.com) | CC BY 3.0 | https://game-icons.net/1x1/delapouite/seahorse.html | `seahorse` |
| `gi_whale_tail` | Whale tail | Delapouite (https://delapouite.com) | CC BY 3.0 | https://game-icons.net/1x1/delapouite/whale-tail.html | `whale_tail` |
| `gi_sea_turtle` | Sea turtle | Delapouite (https://delapouite.com) | CC BY 3.0 | https://game-icons.net/1x1/delapouite/sea-turtle.html | `sea_turtle` |
| `gi_rabbit` | Rabbit | Delapouite (https://delapouite.com) | CC BY 3.0 | https://game-icons.net/1x1/delapouite/rabbit.html | `rabbit` |
| `gi_owl` | Owl | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/owl.html | `owl` |
| `gi_raven` | Raven | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/raven.html | `raven` |
| `gi_wolf_head` | Wolf head | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/wolf-head.html | `wolf_head` |
| `gi_bear_head` | Bear head | Delapouite (https://delapouite.com) | CC BY 3.0 | https://game-icons.net/1x1/delapouite/bear-head.html | `bear_head` |
| `gi_stag_head` | Stag head | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/stag-head.html | `stag_head` |
| `gi_lion` | Lion | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/lion.html | `lion_head` |
| `gi_tiger_head` | Tiger head | Delapouite (https://delapouite.com) | CC BY 3.0 | https://game-icons.net/1x1/delapouite/tiger-head.html | `tiger_head` |
| `gi_big_wave` | Big wave | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/big-wave.html | `big_wave` |
| `gi_sea_serpent` | Sea serpent | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/sea-serpent.html | `sea_serpent` |
| `gi_hand` | Hand | Lorc (https://lorcblog.blogspot.com) | CC BY 3.0 | https://game-icons.net/1x1/lorc/hand.html | `hand` |
