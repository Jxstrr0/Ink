#!/usr/bin/env node
/* tools/sim-test.js: run the INK_SIM simulation in plain node on a fixed seed and check it still makes sense.
   Usage (repo root):   node tools/sim-test.js            table + stress reports + assertions + timing
                        node tools/sim-test.js --quiet    assertions and timing only
   It reads src/manifest.txt, concatenates the src/sim/*.js files in order, strips the first <script> and last </script>
   lines, runs that in a vm sandbox and takes INK_SIM. Every TEST_DESIGN (tools/sim-fixtures.js) is scored against the
   client it was drawn for and one contrasting client: every sub-score, hours/sessions/price, and the aging prediction at
   5/10/20 years (fade lost / readability today). Then it asserts sanity orderings (tiny script reads worse than big
   script, watercolour fades faster than traditional, ...) and exits 1 if any fail. Last, it times 10,000 scoreDesign calls.
   Zero dependencies. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const QUIET = process.argv.includes("--quiet");

/* ---- load the sim ---- */
function loadSim() {
  const list = fs.readFileSync(path.join(ROOT, "src/manifest.txt"), "utf8").split("\n").map(s => s.trim()).filter(s => s && !s.startsWith("#") && s.startsWith("sim/"));
  let lines = list.map(p => fs.readFileSync(path.join(ROOT, "src", p), "utf8")).join("").split("\n");
  const first = lines.findIndex(l => l.trim() === "<script>");
  if (first >= 0) lines.splice(first, 1);
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim() === "</script>") { lines.splice(i, 1); break; }
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(lines.join("\n"), sandbox, { filename: "ink-sim.js" });
  return sandbox.module.exports;
}
const SIM = loadSim();
const { TEST_CLIENTS, TEST_DESIGNS } = require("./sim-fixtures.js");
const SEED = 20000101;
SIM.rng(SEED);   // scoring is deterministic; the seed is fixed for anything random later PRs add here

/* every element id the fixtures use must exist */
const missing = [];
for (const t of TEST_DESIGNS) for (const e of t.design.elements) if (!SIM.elementById(e.id) && missing.indexOf(e.id) < 0) missing.push(e.id);

/* ---- score everything ---- */
const SKILLS = { styles: {}, consult: 5, linework: 5, shading: 5, colour: 5, speed: 5 };
const RES = {};
for (const t of TEST_DESIGNS) {
  RES[t.id] = {};
  for (const cid of [t.client, t.vs]) RES[t.id][cid] = SIM.scoreDesign(t.design, TEST_CLIENTS[cid], SKILLS, { year: 2000 });
}
const pct = v => String(Math.round(v * 100)).padStart(3);
if (!QUIET) {
  console.log("Ink sim test, seed " + SEED + "  (" + SIM.ELEMENTS.length + " elements)");
  console.log("scores x100. age cells are fade lost / readability today at 5, 10, 20 years");
  console.log("design         client  read flow bal  coh  fit  TOT   hrs ses   price  |  5y      10y     20y     | stress");
  for (const t of TEST_DESIGNS) for (const cid of [t.client, t.vs]) {
    const r = RES[t.id][cid], a = r.agePrediction, ag = y => (pct(a[y].fade) + "/" + pct(a[y].readability)).padEnd(8);
    console.log(t.id.padEnd(14) + " " + cid.padEnd(7) + pct(r.readability) + "  " + pct(r.flow) + "  " + pct(r.balance) + "  " + pct(r.coherence) + "  " + pct(r.fit) + "  " + pct(r.total) +
      String(r.hours).padStart(6) + String(r.sessions).padStart(4) + String(r.price).padStart(8) + "  | " + ag(5) + ag(10) + ag(20) + "| " + r.stress.map(s => s.id + (s.sev > 1 ? "!".repeat(s.sev - 1) : "")).join(" "));
  }
  console.log("\nstress reports (design for its own client):");
  for (const t of TEST_DESIGNS) {
    const r = RES[t.id][t.client];
    console.log("  " + t.id + " (" + t.label + ", " + t.client + "):" + (r.stress.length ? "" : " none"));
    for (const s of r.stress) console.log("     [" + s.sev + "] " + s.text);
  }
  console.log("");
}

/* ---- assertions ---- */
let fails = 0, passes = 0;
function check(name, ok, detail) { if (ok) passes++; else { fails++; console.log("FAIL: " + name + (detail ? "  (" + detail + ")" : "")); } }
const R = (d, c) => RES[d][c];
const D = id => TEST_DESIGNS.find(t => t.id === id).design;
const has = (r, id) => r.stress.some(s => s.id === id);
const f2 = v => (Math.round(v * 1000) / 1000);

check("fixture element ids all exist", !missing.length, "missing: " + missing.join(", "));
// readability and size
check("9mm script reads worse than 40mm script", R("script9", "anya").readability < R("script40", "anya").readability - 0.3, f2(R("script9", "anya").readability) + " vs " + f2(R("script40", "anya").readability));
check("9mm script reads badly at 10 years", R("script9", "anya").agePrediction[10].readability < 0.2, f2(R("script9", "anya").agePrediction[10].readability));
check("40mm script still reads at 10 years", R("script40", "anya").agePrediction[10].readability > 0.6, f2(R("script40", "anya").agePrediction[10].readability));
check("bold 85mm rose still reads at 20 years (light-skinned office worker)", R("rose_trad", "anya").agePrediction[20].readability > 0.55, f2(R("rose_trad", "anya").agePrediction[20].readability));
check("9mm script stress names 9 mm and the years", R("script9", "anya").stress.some(s => s.id === "small_script" && /9 mm/.test(s.text) && /close up/.test(s.text)));
check("pale yellow reads worse on dark skin than light", R("yellow_sun", "zhenya").readability < R("yellow_sun", "anya").readability - 0.2, f2(R("yellow_sun", "zhenya").readability) + " vs " + f2(R("yellow_sun", "anya").readability));
check("pale yellow on dark skin is flagged", has(R("yellow_sun", "zhenya"), "pale_on_dark") && !has(R("yellow_sun", "anya"), "pale_on_dark"));
const blackRose = JSON.parse(JSON.stringify(D("rose_trad"))); blackRose.elements.forEach(e => { e.colour = null; });
check("bold black rose reads about the same on dark and light skin", Math.abs(SIM.scoreDesign(blackRose, TEST_CLIENTS.dmitri).readability - SIM.scoreDesign(blackRose, TEST_CLIENTS.anya).readability) < 0.1);
check("lopsided piece balances worse than the rose", R("lopsided", "dmitri").balance < R("rose_trad", "dmitri").balance - 0.3);
check("crowded piece flagged and reads worse than the rose", has(R("crowded", "zhenya"), "crowded") && R("crowded", "zhenya").readability < R("rose_trad", "dmitri").readability);
check("white ink flagged", has(R("crowded", "zhenya"), "white_ink"));
// aging
const fadeAt = (d, c, y) => R(d, c).agePrediction[y].fade;
check("watercolour fades faster than traditional (same spot, same client)", SIM.scoreDesign(D("rose_water"), TEST_CLIENTS.oksana).agePrediction[10].fade > SIM.scoreDesign(D("rose_trad"), TEST_CLIENTS.oksana).agePrediction[10].fade + 0.1);
check("watercolour on the hand of a gardener fades over half in 10 years", fadeAt("water_hand", "oksana", 10) > 0.5, f2(fadeAt("water_hand", "oksana", 10)));
check("watercolour hand + outdoor client is a sev 3 stress", R("water_hand", "oksana").stress.some(s => s.id === "watercolour_sun" && s.sev === 3 && /outdoors/.test(s.text)));
check("aging is monotonic (fade and blur grow, readability falls)", TEST_DESIGNS.every(t => { const a = R(t.id, t.client).agePrediction; return a[5].fade <= a[10].fade && a[10].fade <= a[20].fade && a[5].blur <= a[10].blur && a[10].blur <= a[20].blur && a[5].readability >= a[10].readability && a[10].readability >= a[20].readability; }));
const tat = (o) => Object.assign({ design: D("rose_trad"), out: {}, heal: null, ink: null, skinTone: 0.3, sun: 0.4 }, o);
check("blown-out heal starts with more spread than crisp", SIM.age(tat({ heal: "blownout" }), 0).spread > SIM.age(tat({ heal: "crisp" }), 0).spread + 0.5);
check("patchy heal starts with spread and fade already applied", SIM.age(tat({ heal: "patchy" }), 0).spread > 0.2 && SIM.age(tat({ heal: "patchy" }), 0).fade > SIM.age(tat({ heal: "crisp" }), 0).fade);
check("the same piece wears faster on the hand than the upper back", SIM.age(tat({ design: Object.assign({}, D("rose_trad"), { placement: "hand_r" }) }), 10).fade > SIM.age(tat({ design: Object.assign({}, D("rose_trad"), { placement: "upperback" }) }), 10).fade + 0.05);
check("sun-loving client fades faster", SIM.age(tat({ sun: 0.95 }), 10).fade > SIM.age(tat({ sun: 0.05 }), 10).fade);
check("premium ink fades slower than budget", SIM.age(tat({ ink: "premium" }), 10).fade < SIM.age(tat({ ink: "budget" }), 10).fade);
check("poor depth spreads more than good depth", SIM.age(tat({ out: { depthQuality: 0.2 } }), 10).spread > SIM.age(tat({ out: { depthQuality: 0.95 } }), 10).spread);
const thin = JSON.parse(JSON.stringify(D("rose_trad"))); thin.elements.forEach(e => { e.lineWeight = 1; e.fill = 0; });
check("1RL lines fade more than 14RL (they spread to nothing)", SIM.age(tat({ design: thin }), 10).fade > SIM.age(tat({}), 10).fade + 0.05);
// flow
check("ribs piece against the flow scores lower on flow", R("ribs_against", "anya").flow < R("ribs_with", "anya").flow - 0.2, f2(R("ribs_against", "anya").flow) + " vs " + f2(R("ribs_with", "anya").flow));
check("piece crossing the elbow: crease stress and low flow", has(R("elbow", "dmitri"), "crease") && R("elbow", "dmitri").flow < R("rose_trad", "dmitri").flow - 0.3);
check("crease stress text names the elbow", R("elbow", "dmitri").stress.some(s => /elbow crease: distorts when bent/.test(s.text)));
check("koi wider than the forearm: too_wide stress and low flow", has(R("wide_koi", "dmitri"), "too_wide") && R("wide_koi", "dmitri").flow < 0.5);
check("a band is allowed to wrap", !has(R("band", "lev"), "too_wide") && R("band", "lev").flow > 0.8);
// coherence
check("traditional + fine-line butterfly: lower coherence and a style fight", R("mixed", "dmitri").coherence < R("rose_trad", "dmitri").coherence - 0.2 && has(R("mixed", "dmitri"), "style_fight"));
// fit
check("dealbreaker crushes fit (watercolour for Lev)", R("water_hand", "lev").fit < 0.12, f2(R("water_hand", "lev").fit));
check("blackwork band fits Lev better than Anya", R("band", "lev").fit > R("band", "anya").fit + 0.3);
check("missing must-have costs fit (Zhenya wants floral)", SIM.scoreDesign(D("yellow_sun"), TEST_CLIENTS.zhenya).fit < SIM.scoreDesign(D("yellow_sun"), Object.assign({}, TEST_CLIENTS.zhenya, { mustHaves: [] })).fit - 0.1);
check("neck piece: cover stress for the bank clerk and lower fit than for the crane operator", has(R("neck_bird", "anya"), "cover") && R("neck_bird", "anya").fit < R("neck_bird", "dmitri").fit);
check("ribs for a low-tolerance client: pain stress", has(R("ribs_with", "anya"), "pain") && !has(R("ribs_with", "zhenya"), "pain"));
check("fine line on the hand flagged", has(R("tiny_hand", "anya"), "fine_extremity"));
// time and money
check("hours: back mandala > koi > rose > 9mm script", R("mandala", "lev").hours > R("koi", "dmitri").hours && R("koi", "dmitri").hours > R("rose_trad", "dmitri").hours && R("rose_trad", "dmitri").hours > R("script9", "anya").hours);
check("back mandala needs several sessions, a small rose one", R("mandala", "lev").sessions >= 3 && R("rose_trad", "dmitri").sessions === 1);
check("speed skill shortens hours", SIM.scoreDesign(D("koi"), TEST_CLIENTS.dmitri, { speed: 10 }).hours < SIM.scoreDesign(D("koi"), TEST_CLIENTS.dmitri, { speed: 0 }).hours);
check("price index: 2000 = 1, ~x7-9 by 2030, clamped, interpolated", SIM.priceIndex(2000) === 1 && SIM.priceIndex(1995) === 1 && SIM.priceIndex(2030) >= 7 && SIM.priceIndex(2030) <= 9 && SIM.priceIndex(2040) === SIM.priceIndex(2030) && SIM.priceIndex(2003.5) > SIM.priceIndex(2003) && SIM.priceIndex(2003.5) < SIM.priceIndex(2004));
check("same piece costs more in 2015 than 2000", SIM.scoreDesign(D("rose_trad"), TEST_CLIENTS.dmitri, SKILLS, { year: 2015 }).price > R("rose_trad", "dmitri").price * 3);
check("mid-2010s average rate is ~3,000-4,000 rubles/hour", SIM.RATE_DEFAULT.rate * SIM.priceIndex(2015) >= 3000 && SIM.RATE_DEFAULT.rate * SIM.priceIndex(2015) <= 4000);
// skills
const s10 = { styles: { lettering: 10 } };
check("style skill helps a little, not a lot", (() => { const a = SIM.scoreDesign(D("script9"), TEST_CLIENTS.anya, {}), b = SIM.scoreDesign(D("script9"), TEST_CLIENTS.anya, s10); return b.readability >= a.readability && b.coherence >= a.coherence && b.total - a.total < 0.08; })());
// placements and shapes
const P = SIM.PLACEMENTS, pids = Object.keys(P);
check("ribs are the most painful placement", pids.every(id => P[id].pain <= P.ribs_l.pain) && P.ribs_l.pain === P.ribs_r.pain);
check("every placement sits on a known island and has 2..5 flow lines", pids.every(id => SIM.ISLANDS.indexOf(P[id].island) >= 0 && P[id].flow.length >= 2 && P[id].flow.length <= 5));
check("every allowed zone exists", ["forearm_l", "forearm_r", "upperarm_l", "upperarm_r", "shoulder_l", "shoulder_r", "hand_l", "hand_r", "thigh_l", "thigh_r", "calf_l", "calf_r", "shin_l", "shin_r", "foot_l", "foot_r", "ribs_l", "ribs_r", "upperback", "fullback", "chest_l", "chest_r", "sternum", "neck_l", "neck_r", "nape"].every(id => P[id]));
check("broad body shape has a wider forearm than slight", SIM.placementBox("forearm_l", "masc").wrapMm > SIM.placementBox("forearm_l", "femme").wrapMm && SIM.placementBox("forearm_l", "nobody").wrapMm === P.forearm_l.wrapMm);
// spread of scores
const totals = []; for (const t of TEST_DESIGNS) for (const c in RES[t.id]) totals.push(RES[t.id][c].total);
const subs = k => { const v = []; for (const t of TEST_DESIGNS) for (const c in RES[t.id]) v.push(RES[t.id][c][k]); return Math.max(...v) - Math.min(...v); };
check("totals spread out (max - min > 0.4)", Math.max(...totals) - Math.min(...totals) > 0.4, f2(Math.min(...totals)) + ".." + f2(Math.max(...totals)));
check("every sub-score spreads by at least 0.35", ["readability", "flow", "balance", "coherence", "fit"].every(k => subs(k) >= 0.35), ["readability", "flow", "balance", "coherence", "fit"].map(k => k + " " + f2(subs(k))).join(", "));
check("every score is 0..1", TEST_DESIGNS.every(t => Object.values(RES[t.id]).every(r => ["readability", "flow", "balance", "coherence", "fit", "total"].every(k => r[k] >= 0 && r[k] <= 1))));
check("scoring is deterministic", JSON.stringify(SIM.scoreDesign(D("koi"), TEST_CLIENTS.dmitri, SKILLS)) === JSON.stringify(R("koi", "dmitri")));

// the flash wall (PR 2)
const FL = SIM.FLASH || [];
check("FLASH has about a dozen designs", FL.length >= 10 && FL.length <= 20, FL.length + " designs");
check("every FLASH element and placement exists", FL.every(f => SIM.PLACEMENTS[f.placement] && SIM.STYLES[f.style] && f.elements.every(e => SIM.elementById(e.id))));
check("a flash design takes fewer hours than the same design drawn custom", FL.every(f => SIM.scoreDesign(Object.assign({}, f, { flash: f.id }), null, SKILLS).hours <= SIM.scoreDesign(f, null, SKILLS).hours) && SIM.scoreDesign(Object.assign({}, FL[0], { flash: FL[0].id }), null, SKILLS).hours < SIM.scoreDesign(FL[0], null, SKILLS).hours);
check("board helpers: footprint, ink contrast, element box, flow", (() => { const fp = SIM.footprintOf(D("rose_trad")); return fp.w > 0 && fp.h > 0 && SIM.inkReads("black", 0.9) > SIM.inkReads("yellow", 0.9) && SIM.elementBox("rose_trad").w > 0 && Math.abs(SIM.flowAt("forearm_l", "neutral", 50, 120)) < 10 && Math.abs(SIM.flowAt("upperback", "neutral", 190, 120)) > 45; })());

/* ---- timing ---- */
const N = 10000, cl = Object.values(TEST_CLIENTS);
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) SIM.scoreDesign(TEST_DESIGNS[i % TEST_DESIGNS.length].design, cl[i % cl.length], SKILLS);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(passes + " passed, " + fails + " failed. scoreDesign: " + (ms / N).toFixed(4) + " ms per call (" + N + " calls, " + Math.round(ms) + " ms)");
process.exit(fails ? 1 : 0);
