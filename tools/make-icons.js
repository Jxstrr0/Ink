#!/usr/bin/env node
/* Ink: render the PWA icons into icons/ (192, 512, 512 maskable, 180 apple-touch). Placeholder mark until Kelbo makes one.
 * Needs Playwright (preinstalled in the Claude cloud box; elsewhere npm i -g playwright; NODE_PATH=$(npm root -g) node tools/make-icons.js).
 * Output is committed; re-run only to change the mark.
 * The mark: a coil tattoo machine in silhouette (frame, two coils, armature bar, tube and grip) in cream on warm black,
 * with a red ink drop at the needle tip. */
"use strict";
const { chromium } = require("playwright"), fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "icons");
const BG = "#17130f", INK = "#f3ead8", RED = "#c8553d";
/* 100x100 artboard. s = mark scale about the centre (the maskable icon keeps the mark inside the inner 80% safe zone) */
function svg(s) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" fill="${BG}"/>
<g transform="translate(50 50) scale(${s}) rotate(-28) translate(-50 -50)" fill="${INK}">
<rect x="28" y="22" width="9" height="40" rx="2"/>
<rect x="28" y="22" width="34" height="8" rx="2"/>
<rect x="40" y="31" width="9" height="20" rx="3"/><rect x="51" y="31" width="9" height="20" rx="3"/>
<rect x="38" y="51" width="24" height="4" rx="1.5"/>
<rect x="60" y="18" width="4" height="16" rx="1.5"/>
<rect x="44" y="55" width="12" height="7" rx="2"/>
<rect x="46.5" y="62" width="7" height="18" rx="2"/>
<rect x="48.6" y="80" width="2.8" height="8" rx="1"/>
<path d="M50 90 C47.6 93.6 47.6 96 50 96 C52.4 96 52.4 93.6 50 90Z" fill="${RED}"/>
</g></svg>`;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "icon.svg"), svg(0.86));
  const b = await chromium.launch(), jobs = [["icon-192.png", 192, 0.86], ["icon-512.png", 512, 0.86], ["icon-512-maskable.png", 512, 0.66], ["apple-touch-icon.png", 180, 0.8]];
  for (const [f, n, s] of jobs) {
    const p = await b.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0;background:${BG}">${svg(s)}</body>`);
    await p.screenshot({ path: path.join(OUT, f), clip: { x: 0, y: 0, width: n, height: n } }); await p.close(); console.log("wrote icons/" + f);
  }
  await b.close();
})();
