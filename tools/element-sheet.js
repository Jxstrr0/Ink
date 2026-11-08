#!/usr/bin/env node
/* Ink: check the element library (src/sim/elements.js) and draw it as a contact sheet.
 *
 *   node tools/element-sheet.js                    validate ELEMENTS, STYLES, COLOURS; print counts per style and family
 *   node tools/element-sheet.js --png out.png      also render every element as tattoo flash on a cream sheet (needs Playwright)
 *        [--only a,b,...]                          ... only elements whose id contains, or whose family or style is, one of these
 *   node tools/element-sheet.js --solo             load only rng.js + elements.js (if another sim file is mid-edit and breaks the run)
 *   node tools/element-sheet.js --import a.svg [--scale 100/512] [--shift x,y]
 *                                                  print the path data of a downloaded SVG (e.g. a game-icons.net icon) rescaled
 *                                                  from its 512 viewBox to Ink's 0..100 box at 1 decimal. Only the d="" strings
 *                                                  are read, nothing in the file is run. The 512x512 background square is dropped.
 *
 * 0.1.25.0: an element's second part (fill2, its leaves or stems, in its fixed colour2) must parse, close every subpath,
 * stay inside the element's box, need a main fill, and hardly overlap it (nonzero rule, sampled on a grid; the two parts
 * must never cancel where they meet, so a black piece's merged fill stays whole). The sheet draws it in colour2 under a red fill.
 *
 * The sim is loaded the way tools/sim-test.js does it: the src/sim/*.js files in src/manifest.txt order, joined, minus the
 * first <script> line and the last </script> line, run in node's vm. Exit 1 if any check fails.
 * Playwright is preinstalled in the Claude cloud box; elsewhere: npm i -g playwright; NODE_PATH=$(npm root -g) node tools/element-sheet.js --png x.png
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, ".."), SRC = path.join(ROOT, "src");
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i < 0 ? null : (args[i + 1] || ""); };

/* ---------- SVG path parsing (shared by the validator and --import) ---------- */
const ARITY = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
/* parse path data into [{c, a:[numbers]}], one entry per command segment; throws on anything that is not path syntax */
function parsePath(d) {
  const out = []; let i = 0, cmd = null;
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = () => {
    ws(); const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(d.slice(i));
    if (!m) throw new Error("expected a number at " + i + ": '" + d.slice(i, i + 12) + "'");
    i += m[0].length; return +m[0];
  };
  const flag = () => { ws(); if (d[i] !== "0" && d[i] !== "1") throw new Error("bad arc flag at " + i); return +d[i++]; };
  ws();
  if (!/[Mm]/.test(d[i] || "")) throw new Error("path must start with M");
  while (i < d.length) {
    ws(); if (i >= d.length) break;
    if (/[A-Za-z]/.test(d[i])) { cmd = d[i++]; if (!(cmd.toLowerCase() in ARITY)) throw new Error("unknown command " + cmd); }
    else if (!cmd || cmd === "z" || cmd === "Z") throw new Error("number without a command at " + i);
    const lc = cmd.toLowerCase(), n = ARITY[lc];
    if (!n) { out.push({ c: cmd, a: [] }); cmd = cmd; continue; }
    const a = [];
    for (let k = 0; k < n; k++) a.push(lc === "a" && (k === 3 || k === 4) ? flag() : num());
    out.push({ c: cmd, a });
    if (cmd === "M") cmd = "L"; else if (cmd === "m") cmd = "l";      /* extra pairs after a moveto are linetos */
    ws(); if (i < d.length && !/[A-Za-z]/.test(d[i]) && !/[+\-.\d]/.test(d[i])) throw new Error("bad character '" + d[i] + "' at " + i);
  }
  return out;
}
/* walk a parsed path in absolute coordinates: cb(cmdUpper, absArgs, from) per segment (for H/V the args become [x,y]) */
function walkAbs(segs, cb) {
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const { c, a } of segs) {
    const rel = c === c.toLowerCase(), C = c.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0; let abs;
    switch (C) {
      case "Z": cb("Z", [sx, sy], [cx, cy]); cx = sx; cy = sy; continue;
      case "H": abs = [a[0] + ox, cy]; break;
      case "V": abs = [cx, a[0] + oy]; break;
      case "A": abs = [a[0], a[1], a[2], a[3], a[4], a[5] + ox, a[6] + oy]; break;
      default: abs = a.map((v, k) => v + (k % 2 ? oy : ox));
    }
    cb(C, abs, [cx, cy]);
    cx = abs[abs.length - 2]; cy = abs[abs.length - 1];
    if (C === "M") { sx = cx; sy = cy; }
  }
}
/* bounding box of every end and control point (good enough to catch art drawn outside the 0..100 box) */
function bbox(d) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  walkAbs(parsePath(d), (C, a) => {
    const pts = C === "A" ? [a[5], a[6]] : a;
    for (let k = 0; k < pts.length; k += 2) { x0 = Math.min(x0, pts[k]); x1 = Math.max(x1, pts[k]); y0 = Math.min(y0, pts[k + 1]); y1 = Math.max(y1, pts[k + 1]); }
  });
  return [x0, y0, x1, y1];
}
/* rescale a path by s (and shift by tx,ty), rounding absolute points to 0.1 and writing compact relative commands.
   Rounding the absolute points first means relative deltas never drift. */
function rescale(d, s, tx, ty) {
  const T = v => Math.round(v * 10), F = t => { let r = String(t / 10); if (r.startsWith("0.")) r = r.slice(1); else if (r.startsWith("-0.")) r = "-" + r.slice(2); return r; };
  let out = "", ex = 0, ey = 0, esx = 0, esy = 0, first = true;
  const nums = list => { let o = ""; for (const t of list) { const f = F(t); o += (o && !f.startsWith("-") && !(f.startsWith(".") && /\.\d*$/.test(o)) ? " " : "") + f; } return o; };
  walkAbs(parsePath(d), (C, a) => {
    if (C === "Z") { out += "z"; ex = esx; ey = esy; return; }
    if (C === "A") {
      const X = T(a[5] * s + tx), Y = T(a[6] * s + ty);
      out += "a" + nums([T(a[0] * s), T(a[1] * s)]) + " " + a[2] + " " + a[3] + " " + a[4] + " " + nums([X - ex, Y - ey]); ex = X; ey = Y; return;
    }
    const P = []; for (let k = 0; k < a.length; k += 2) P.push([T(a[k] * s + tx), T(a[k + 1] * s + ty)]);
    const [X, Y] = P[P.length - 1];
    if (C === "M" && first) { out += "M" + nums([X, Y]); first = false; }
    else if (C === "H" || (C === "L" && Y === ey && X !== ex)) out += "h" + nums([X - ex]);
    else if (C === "V" || (C === "L" && X === ex)) out += "v" + nums([Y - ey]);
    else out += C.toLowerCase() + nums(P.flatMap(([px, py]) => [px - ex, py - ey]));
    ex = X; ey = Y; if (C === "M") { esx = X; esy = Y; }
  });
  return out;
}

/* ---------- --import: print a downloaded icon's path rescaled to 0..100 ---------- */
if (args.includes("--import")) {
  const f = opt("--import"), sc = (opt("--scale") || "100/512").split("/"), s = sc.length > 1 ? +sc[0] / +sc[1] : +sc[0];
  const txt = fs.readFileSync(f, "utf8");
  const ds = [...txt.matchAll(/\sd="([^"]*)"/g)].map(m => m[1]).filter(d => !/^M0 0h512v512H0z$/.test(d));
  for (const d of ds) parsePath(d);                                     /* refuse anything that is not plain path data */
  const sh = (opt("--shift") || "0,0").split(",").map(Number), r = rescale(ds.join(" "), s, sh[0], sh[1]);
  console.log(r);
  console.error(path.basename(f) + ": " + r.length + " chars, bbox " + bbox(r).map(v => v.toFixed(1)).join(" "));
  process.exit(0);
}

/* ---------- load the sim ---------- */
function loadSim(solo) {
  const list = fs.readFileSync(path.join(SRC, "manifest.txt"), "utf8").split("\n").map(l => l.trim()).filter(l => /^sim\/.*\.js$/.test(l));
  const files = solo ? ["sim/rng.js", "sim/elements.js"] : list;
  let lines = files.map(p => fs.readFileSync(path.join(SRC, p), "utf8")).join("").split("\n");
  const a = lines.findIndex(l => l.trim() === "<script>"); if (a >= 0) lines.splice(a, 1);
  if (solo) lines.push("return SIM;})();");
  else { let b = -1; for (let k = lines.length - 1; k >= 0; k--) if (lines[k].trim() === "</script>") { b = k; break; } if (b >= 0) lines.splice(b, 1); }
  const ctx = { module: { exports: {} }, console };
  return vm.runInNewContext(lines.join("\n") + "\n;INK_SIM", ctx, { filename: "ink-sim.js" });
}
let SIM;
try { SIM = loadSim(args.includes("--solo")); }
catch (e) { console.error("the full sim did not load (" + e.message + "); falling back to rng.js + elements.js"); SIM = loadSim(true); }

/* ---------- validate ---------- */
const errs = [], err = m => errs.push(m);
const { ELEMENTS, STYLES, COLOURS, LINE_WEIGHTS } = SIM;
if (!Array.isArray(ELEMENTS)) { console.error("SIM.ELEMENTS missing"); process.exit(1); }
if (JSON.stringify(LINE_WEIGHTS) !== "[1,3,5,7,9,11,14]") err("SIM.LINE_WEIGHTS should be [1,3,5,7,9,11,14]");
const COLOUR_IDS = ["black", "grey", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "white", "skyblue"];
const STYLE_IDS = ["traditional", "neotrad", "blackwork", "fineline", "realism", "japanese", "lettering", "geometric", "watercolour"];
const FAMILIES = ["motif", "lettering", "frame", "fill", "texture"];
for (const id of COLOUR_IDS) {
  const c = COLOURS[id]; if (!c) { err("COLOURS." + id + " missing"); continue; }
  if (typeof c.name !== "string" || !/^#[0-9a-f]{6}$/i.test(c.hex) || !(c.light >= 0 && c.light <= 1)) err("COLOURS." + id + " needs name, hex #rrggbb, light 0..1");
}
for (const id of Object.keys(COLOURS)) if (!COLOUR_IDS.includes(id)) err("COLOURS has an extra id " + id);
for (const id of STYLE_IDS) {
  const s = STYLES[id]; if (!s) { err("STYLES." + id + " missing"); continue; }
  if (s.id !== id || typeof s.name !== "string") err("STYLES." + id + ": id/name");
  if (!(s.ageFactor >= 0 && s.ageFactor <= 1)) err("STYLES." + id + ".ageFactor");
  if (!Array.isArray(s.lineRange) || s.lineRange.length !== 2 || !LINE_WEIGHTS.includes(s.lineRange[0]) || !LINE_WEIGHTS.includes(s.lineRange[1]) || s.lineRange[0] > s.lineRange[1]) err("STYLES." + id + ".lineRange");
  if (!Array.isArray(s.palette) || !s.palette.length || s.palette.some(c => !COLOURS[c])) err("STYLES." + id + ".palette");
  if (!Array.isArray(s.blendsWith) || s.blendsWith.some(b => !STYLES[b] || b === id)) err("STYLES." + id + ".blendsWith");
  const dc = s.demandCurve;
  if (!Array.isArray(dc) || dc[0][0] !== 2000 || dc[dc.length - 1][0] !== 2030 || dc.some((p, k) => !(p[1] > 0) || (k && p[0] <= dc[k - 1][0]))) err("STYLES." + id + ".demandCurve: years 2000..2030 ascending, mult > 0");
  if (!Array.isArray(s.clientSegments) || !s.clientSegments.length || s.clientSegments.some(x => typeof x !== "string")) err("STYLES." + id + ".clientSegments");
}
for (const [a, s] of Object.entries(STYLES)) for (const b of s.blendsWith || []) if (STYLES[b] && !STYLES[b].blendsWith.includes(a)) err("blendsWith not symmetric: " + a + " -> " + b);
const seen = new Set(), FIELDS = ["id", "name", "family", "styles", "minSizeMm", "detail", "lineWeightDefault", "colourable", "tags", "unlock", "path", "src"];
const credits = fs.existsSync(path.join(ROOT, "art", "CREDITS.md")) ? fs.readFileSync(path.join(ROOT, "art", "CREDITS.md"), "utf8") : "";
let bytes = 0, nPart2 = 0;
/* 0.1.25.0: the second part. Overlap = grid points inside both parts / points inside fill2 (PART2_OVERLAP at most) */
const PART2_OVERLAP = 0.2, PART2_GRID = 120, part2Stats = [];
function part2Check(e, at) {
  nPart2++;
  if (typeof e.fill2 !== "string" || !e.fill2) return err(at + ": fill2 must be a non-empty string");
  if (!COLOURS[e.colour2]) err(at + ": colour2 '" + e.colour2 + "' is not a COLOURS id");
  if (!e.fill) err(at + ": a fill2 needs a main fill");
  if (!e.colourable) err(at + ": a fill2 on an element that can't be coloured");
  if (e.family !== "motif") err(at + ": fill2 only on motifs (family " + e.family + ")");
  let segs; try { segs = parsePath(e.fill2); } catch (x) { return err(at + ": fill2 does not parse: " + x.message); }
  let open = false;
  for (const g of segs) { if (/[Mm]/.test(g.c)) { if (open) { err(at + ": fill2 has a subpath with no Z"); break; } open = true; } else if (/[Zz]/.test(g.c)) open = false; }
  if (open) err(at + ": fill2 ends without Z");
  const box = SIM.elementBox ? SIM.elementBox(e.id) : null, b = bbox(e.fill2);
  if (box && (b[0] < box.x - 0.05 || b[1] < box.y - 0.05 || b[2] > box.x + box.w + 0.05 || b[3] > box.y + box.h + 0.05))
    err(at + ": fill2 leaves the element's box (" + b.map(v => v.toFixed(1)).join(" ") + " vs " + [box.x, box.y, box.x + box.w, box.y + box.h].map(v => v.toFixed(1)).join(" ") + ")");
  if (!SIM.flattenPath || !SIM.insideZone || !e.fill) return;
  const P = d => SIM.flattenPath(d).map(s => s.pts), F = P(e.fill), F2 = P(e.fill2), U = F.concat(F2);
  let in2 = 0, both = 0, cancel = 0;
  for (let i = 0; i < PART2_GRID; i++) for (let j = 0; j < PART2_GRID; j++) {
    const x = (i + 0.5) * 100 / PART2_GRID, y = (j + 0.5) * 100 / PART2_GRID, a = SIM.insideZone(F, x, y), c = SIM.insideZone(F2, x, y);
    if (c) in2++; if (a && c) both++; if ((a || c) && !SIM.insideZone(U, x, y)) cancel++;
  }
  if (!in2) err(at + ": fill2 has no area");
  else if (both / in2 > PART2_OVERLAP) err(at + ": fill2 overlaps the fill by " + Math.round(both / in2 * 100) + "% (at most " + PART2_OVERLAP * 100 + "%)");
  if (cancel) err(at + ": fill and fill2 cancel at " + cancel + " grid points (draw the second part the same way round as the fill)");
  part2Stats.push(e.id + " " + Math.round(both / Math.max(1, in2) * 100) + "%");
}
for (const e of ELEMENTS) {
  const at = "element " + (e && e.id);
  for (const f of FIELDS) if (!(f in e)) err(at + ": missing " + f);
  if (typeof e.id !== "string" || !/^[a-z][a-z0-9_]*$/.test(e.id)) err(at + ": id must be lower_snake");
  if (seen.has(e.id)) err(at + ": duplicate id"); seen.add(e.id);
  if (typeof e.name !== "string" || !e.name) err(at + ": name");
  if (!FAMILIES.includes(e.family)) err(at + ": family " + e.family);
  if (!Array.isArray(e.styles) || !e.styles.length || e.styles.some(s => !STYLES[s])) err(at + ": styles " + e.styles);
  if (!(e.minSizeMm >= 5 && e.minSizeMm <= 300)) err(at + ": minSizeMm " + e.minSizeMm);
  if (!(e.detail >= 0 && e.detail <= 1)) err(at + ": detail " + e.detail);
  if (!LINE_WEIGHTS.includes(e.lineWeightDefault)) err(at + ": lineWeightDefault " + e.lineWeightDefault);
  if (typeof e.colourable !== "boolean") err(at + ": colourable must be boolean");
  if (!Array.isArray(e.tags) || !e.tags.length || e.tags.some(t => typeof t !== "string" || !/^[a-z][a-z0-9_]*$/.test(t))) err(at + ": tags");
  const u = /^(start|style:([a-z]+):(\d+)|rnd:[a-z][a-z0-9_]*)$/.exec(e.unlock || "");
  if (!u) err(at + ": unlock '" + e.unlock + "'");
  else if (u[2] && (!STYLES[u[2]] || !(+u[3] >= 1 && +u[3] <= 10))) err(at + ": unlock style/level '" + e.unlock + "'");
  else if (u[2] && !e.styles.includes(u[2])) err(at + ": unlocks through a style it is not in");
  for (const k of ["path", "fill"]) {
    if (k === "fill" && e.fill == null) continue;
    if (typeof e[k] !== "string" || !e[k]) { err(at + ": " + k + " must be a non-empty string"); continue; }
    try { const b = bbox(e[k]); if (b[0] < -3 || b[1] < -3 || b[2] > 103 || b[3] > 103) err(at + ": " + k + " leaves the 0..100 box (" + b.map(v => v.toFixed(1)).join(" ") + ")"); }
    catch (x) { err(at + ": " + k + " does not parse: " + x.message); }
  }
  if (e.fill2 != null) part2Check(e, at);
  bytes += (e.path || "").length + (e.fill && e.fill !== e.path ? e.fill.length : 0) + (e.fill2 ? e.fill2.length : 0);
  if (e.src !== "original") { if (typeof e.src !== "string" || !credits.includes("`" + e.src + "`")) err(at + ": src '" + e.src + "' has no entry in art/CREDITS.md"); }
}
if (typeof SIM.elementById !== "function" || SIM.elementById(ELEMENTS[0].id) !== ELEMENTS[0] || SIM.elementById("no_such") != null) err("SIM.elementById");

/* ---------- report ---------- */
const by = (key) => { const o = {}; for (const e of ELEMENTS) for (const v of [].concat(e[key])) o[v] = (o[v] || 0) + 1; return o; };
const fam = by("family"), sty = by("styles"), src = ELEMENTS.filter(e => e.src !== "original").length;
console.log("elements: " + ELEMENTS.length + " (" + src + " sourced, " + (ELEMENTS.length - src) + " original), path data ~" + Math.round(bytes / 1024) + " KB");
console.log("by family: " + FAMILIES.map(f => f + " " + (fam[f] || 0)).join(", "));
console.log("by style:  " + STYLE_IDS.map(s => s + " " + (sty[s] || 0)).join(", "));
console.log("unlock:    " + Object.entries(by("unlock")).map(([k, v]) => k + " " + v).join(", "));
console.log("second part (fill2): " + nPart2 + " elements" + (part2Stats.length ? " (overlap with the fill: " + part2Stats.join(", ") + ")" : ""));
const file = path.join(SRC, "sim", "elements.js"); console.log("src/sim/elements.js: " + Math.round(fs.statSync(file).size / 1024) + " KB");
if (errs.length) { console.error("\n" + errs.length + " problem(s):\n  " + errs.join("\n  ")); process.exit(1); }
console.log("all element checks pass");

/* ---------- --png: contact sheet ---------- */
if (args.includes("--png")) {
  const out = opt("--png") || "element-sheet.png", only = opt("--only");
  const keys = only ? only.split(",") : null;
  const list = keys ? ELEMENTS.filter(e => keys.some(k => e.id.includes(k) || e.family === k || e.styles.includes(k))) : ELEMENTS;
  const sw = lw => (0.7 + lw * 0.22).toFixed(2);       /* liner group -> preview stroke width in the 100 box */
  const cells = list.map(e => {
    const col = e.fill2 ? COLOURS.red.hex : e.colourable && e.styles.includes("watercolour") ? COLOURS[STYLES.watercolour.palette[e.id.length % STYLES.watercolour.palette.length]].hex : "#141210";
    const p2 = e.fill2 ? `<path d="${e.fill2}" fill="${COLOURS[e.colour2].hex}" fill-opacity="0.85"/>` : "";
    return `<div class="c"><svg viewBox="-4 -4 108 108">${p2}<path d="${e.fill || ""}"fill="${col}" fill-opacity="${col === "#141210" ? 1 : 0.8}"/><path d="${e.path}" fill="none" stroke="#141210" stroke-width="${sw(e.lineWeightDefault)}" stroke-linecap="round" stroke-linejoin="round"/></svg><b>${e.id}</b><i>${e.family} · ${e.styles.join(" ")}${e.src !== "original" ? " · " + e.src : ""}</i></div>`;
  }).join("");
  const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;padding:12px;background:#efe6d2;font:10px/1.2 sans-serif;color:#3a3128;display:grid;grid-template-columns:repeat(10,150px);gap:8px}
.c{background:#f7f0e0;border:1px solid #d9ccb0;border-radius:4px;padding:6px;text-align:center;overflow:hidden}.c svg{width:132px;height:132px;display:block;margin:auto}.c b{display:block;font-size:11px}.c i{display:block;font-style:normal;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>${cells}`;
  (async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } });
    await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close();
    console.log("contact sheet: " + path.resolve(out) + " (" + list.length + " elements)");
  })().catch(e => { console.error(e.message); process.exit(1); });
}
