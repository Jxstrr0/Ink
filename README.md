# Ink

A tattoo artist career game by Longlight Interactive. Start as an apprentice sweeping floors, learn on fake skin, build a client list, open a studio, and end with a two-year waiting list and a body of work that has aged on real people who keep walking back through your door. Set in Mostograd, 2000 to 2030.

**Play it: <https://jxstrr0.github.io/Ink/>**

It runs on phones and desktops. Install it from the browser ("Add to Home Screen" or the install button in Settings) and it works offline.

## Working on it

There are no dependencies and no package.json, only node (16 or newer).

```
node build.js            # rebuild index.html and sw.js from src/
node build.js --check    # fails if index.html or sw.js is out of date
node check-savecode.js   # save-code round-trip checks
```

- [`src/README.md`](src/README.md): the file map and the build details.
- [`CLAUDE.md`](CLAUDE.md): the project rules.
- [`docs/INK-PLAN.md`](docs/INK-PLAN.md): the build plan and its checklist.
- [`docs/DESIGN.md`](docs/DESIGN.md): the game as built.

© 2026 Kelbo / Longlight Interactive
