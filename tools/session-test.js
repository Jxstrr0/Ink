#!/usr/bin/env node
/* tools/session-test.js: the PR 4 session and kit sim in plain node, deterministic (no randomness is used; the seed is
   fixed anyway). Kept apart from tools/sim-test.js so the two PRs that grew the sim merge cleanly.
   Usage (repo root):   node tools/session-test.js            the stencil table for every flash design + assertions
                        node tools/session-test.js --quiet    assertions only
   It loads src/sim/*.js the same way sim-test.js does, then drives SIM.sessionNew / penDown / penMove / penUp with
   synthetic traces (SIM.sessionSynth: on the stencil at a chosen pace, with a deterministic wobble, a stop or a lift) and
   checks: a steady trace beats a rushed one, rushing blows lines out, stop-start leaves joins, the ribs hurt faster than the
   forearm, a 7RL moves the line-weight band, Assist widens the band, overworked shading raises trauma, a big piece takes
   more than one sitting, plus the SVG flattener, the kit and that freshState's kit literal matches KIT_DEFAULT. Exit 1 on a
   failure. Zero dependencies. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const QUIET = process.argv.includes("--quiet");

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
SIM.rng(20000101);
const J = o => JSON.parse(JSON.stringify(o));
const f3 = v => Math.round(v * 1000) / 1000;
let fails = 0, passes = 0;
function check(name, ok, detail) { if (ok) passes++; else { fails++; console.log("FAIL: " + name + (detail != null ? "  (" + detail + ")" : "")); } }

const CL = { id: "t1", name: "Test", traits: { pain: 0.5, talkative: 0.6 }, bodyShape: "neutral", skinTone: 0.3 };
const SK = { linework: 3, shading: 3, colour: 3, speed: 3, styles: {} };
const flash = id => J(SIM.FLASH.find(f => f.id === id));
const mk = (design, o) => SIM.sessionStart(SIM.sessionNew(Object.assign({ design, client: CL, skills: SK, kit: SIM.kitDefault(), kind: "sample" }, o || {})));
/* trace every line of the sitting with the same synth options; returns the session */
function traceAll(s, o, max) {
  let n = 0;
  while (n++ < (max || 999)) {
    const it = SIM.sessionItem(s); if (!it || it.k !== "line") break;
    const r = SIM.sessionTrace(s, SIM.sessionSynth(s, o));
    if (!r || !r.done) { if (!SIM.sessionNextItem(s)) break; }
  }
  return s;
}

/* ---- the stencil table ---- */
if (!QUIET) {
  console.log("Ink session test. Stencils for the flash wall (strokes, total line mm, zones s=shade c=colour with mm2, hours, sittings, view mm)");
  for (const f of SIM.FLASH) {
    const s = mk(J(f)), p = SIM.sessionPlan(s);
    console.log("  " + f.id.padEnd(18) + String(p.strokes.length).padStart(3) + " strokes " + String(Math.round(p.strokes.reduce((a, b) => a + b.len, 0))).padStart(5) + " mm  zones " +
      (p.zones.map(z => z.kind[0] + Math.round(z.area)).join(",") || "-").padEnd(22) + String(p.hours).padStart(5) + " h " + p.parts + " sit  view " + s.view.size);
  }
}

/* ---- the flattener ---- */
const sq = SIM.flattenPath("M10 10 H50 V50 H10 Z");
check("flattener: absolute square is one closed subpath through its corners", sq.length === 1 && sq[0].closed && sq[0].pts.length === 10 && sq[0].pts[4] === 50 && sq[0].pts[5] === 50);
const rel = SIM.flattenPath("m10 10 h40 v40 h-40 z m60 0 l10 10");
check("flattener: relative commands and a second subpath", rel.length === 2 && rel[1].pts[0] === 70 && rel[1].pts[3] === 20);
const arc = SIM.flattenPath("M10 50 A40 40 0 0 1 90 50 A40 40 0 0 1 10 50Z")[0];
let ymin = 1e9, ymax = -1e9; for (let i = 1; i < arc.pts.length; i += 2) { ymin = Math.min(ymin, arc.pts[i]); ymax = Math.max(ymax, arc.pts[i]); }
check("flattener: a circle from two arcs spans its full height", Math.abs(ymin - 10) < 0.5 && Math.abs(ymax - 90) < 0.5, ymin + ".." + ymax);
const cs = SIM.flattenPath("M0 0 C 0 50 100 50 100 0 S 200 -50 200 0 Q 250 50 300 0 T 400 0")[0];
check("flattener: C, S, Q and T end where they should", Math.abs(cs.pts[cs.pts.length - 2] - 400) < 1e-9 && Math.abs(cs.pts[cs.pts.length - 1]) < 1e-9);
check("every flash design makes a stencil with strokes", SIM.FLASH.every(f => SIM.sessionPlan(mk(J(f))).strokes.length > 0));

/* ---- the kit ---- */
const kit = SIM.kitDefault(), B0 = SIM.kitBands(kit, SK, {});
const b3 = SIM.kitBands(kit, SK, {}, { liner: "3RL" }), b7 = SIM.kitBands(kit, SK, {}, { liner: "7RL" });
check("a 7RL needle moves the line-weight band (3RL lays 1-5, 7RL lays 5-9)", b3.lineBand[0] === 1 && b3.lineBand[1] === 5 && b7.lineBand[0] === 5 && b7.lineBand[1] === 9, b3.lineBand + " / " + b7.lineBand);
const kitNo7 = Object.assign(J(kit), { needles: ["3RL", "7M1"] });
check("adding a 7RL to the tray widens the tray's line range in kitDeltas", SIM.kitDeltas(kitNo7, kit, SK, {}).lineHi > 0, JSON.stringify(SIM.kitDeltas(kitNo7, kit, SK, {})));
check("Assist widens the pace band and slows the marker", SIM.kitBands(kit, SK, { assist: true }).paceBand > B0.paceBand * 1.3 && SIM.kitBands(kit, SK, { assist: true }).pace < B0.pace);
check("skill widens the pace band", SIM.kitBands(kit, { linework: 10 }, {}).paceBand > SIM.kitBands(kit, { linework: 0 }, {}).paceBand);
const hot = Object.assign(J(kit), { voltage: 9.5 });
check("more voltage: faster pace, narrower band, more trauma", SIM.kitBands(hot, SK, {}).pace > B0.pace && SIM.kitBands(hot, SK, {}).paceBand < B0.paceBand && SIM.kitBands(hot, SK, {}).trauma > B0.trauma);
const pen = Object.assign(J(kit), { machine: "pen", owned: { machines: ["coil_used", "pen"], needles: kit.owned.needles, inks: kit.owned.inks } });
check("a wireless pen beats the used coil on band and trauma", SIM.kitDeltas(kit, pen).band > 0.2 && SIM.kitDeltas(kit, pen).trauma < -0.2);
check("premium ink fades slower in the kit deltas, and aging reads INKS", SIM.kitDeltas(kit, Object.assign(J(kit), { ink: "premium", owned: { machines: ["coil_used"], needles: kit.owned.needles, inks: ["budget", "premium"] } })).fade < 0 && SIM.INK_TIERS === SIM.INKS);
check("a mag shades faster than no mag", SIM.kitBands(kit, SK, {}).shade > SIM.kitBands(Object.assign(J(kit), { needles: ["3RL", "7RL"] }), SK, {}).shade);
check("kitClean drops unknown ids, clamps sliders, keeps owned", (() => { const k = SIM.kitClean({ machine: "laser", needles: ["99RL", "7RL"], ink: "gold", voltage: 40, stroke: -1, owned: { machines: ["coil_used"], needles: ["7RL"], inks: ["budget"] } }); return k.machine === "coil_used" && k.needles.join() === "7RL" && k.ink === "budget" && k.voltage === SIM.VOLTAGE.max && k.stroke === SIM.STROKE.min; })());
check("kitClean({}) is the starter kit", JSON.stringify(SIM.kitClean({})) === JSON.stringify(SIM.KIT_DEFAULT));
check("prices follow PRICE_INDEX", SIM.kitPrice("machine", "rotary", 2015) > SIM.kitPrice("machine", "rotary", 2000) * 3);
/* freshState's kit literal must match KIT_DEFAULT */
const st = fs.readFileSync(path.join(ROOT, "src/app/state.js"), "utf8"), km = /kit:(\{machine:[^\n]*?\}\}),/.exec(st);
check("freshState's kit literal equals KIT_DEFAULT", !!km && JSON.stringify(vm.runInNewContext("(" + km[1] + ")")) === JSON.stringify(SIM.KIT_DEFAULT), km && km[1]);

/* ---- linework: steady vs rushed vs stop-start ---- */
const moon = flash("fl_moon");
const steady = traceAll(mk(J(moon)), { speed: 1, noise: 0.2 }), rushed = traceAll(mk(J(moon)), { speed: 2.6, noise: 0.2 });
const rs = SIM.sessionFinish(steady), rr = SIM.sessionFinish(rushed);
if (!QUIET) console.log("\nmoon, steady: line " + rs.sitting.lineQuality + " depth " + rs.sitting.depthQuality + " blow " + rs.sitting.blowouts + " joins " + rs.sitting.joins + " trauma " + rs.out.trauma +
  " | rushed: line " + rr.sitting.lineQuality + " depth " + rr.sitting.depthQuality + " blow " + rr.sitting.blowouts + " trauma " + rr.out.trauma);
check("a steady trace scores higher than a rushed one", rs.sitting.lineQuality > rr.sitting.lineQuality + 0.2, rs.sitting.lineQuality + " vs " + rr.sitting.lineQuality);
check("a steady, accurate trace scores well", rs.sitting.lineQuality > 0.85 && rs.sitting.depthQuality > 0.85, rs.sitting.lineQuality + " / " + rs.sitting.depthQuality);
check("rushing gives blowouts, steady gives none", rr.sitting.blowouts >= 2 && rs.sitting.blowouts === 0, rr.sitting.blowouts + " / " + rs.sitting.blowouts);
check("rushing is shallow: depth quality falls", rr.sitting.depthQuality < rs.sitting.depthQuality - 0.2);
const wobbly = SIM.sessionFinish(traceAll(mk(J(moon)), { speed: 1, noise: 3, wave: 0.12 }));
check("wandering off the stencil costs line quality", wobbly.sitting.lineQuality < rs.sitting.lineQuality - 0.15, wobbly.sitting.lineQuality);
const stopper = SIM.sessionFinish(traceAll(mk(J(moon)), { speed: 1, noise: 0.2, stopAt: 0.5, stopMs: 700 }));
const lifter = SIM.sessionFinish(traceAll(mk(J(moon)), { speed: 1, noise: 0.2, stopAt: 0.5, stopMs: 400, lift: true }));
check("stop-start leaves joins (one per line)", stopper.sitting.joins >= SIM.sessionPlan(mk(J(moon))).strokes.length - 1 && rs.sitting.joins === 0, stopper.sitting.joins);
check("lifting and coming back leaves joins too", lifter.sitting.joins >= 2, lifter.sitting.joins);
check("joins cost line quality", stopper.sitting.lineQuality < rs.sitting.lineQuality, stopper.sitting.lineQuality);
check("starting away from the dot is refused", (() => { const s = mk(J(moon)), it = SIM.sessionItem(s), p = it.stroke.pts; return SIM.penDown(s, 0, p[0] + 40, p[1] + 40).why === "start"; })());
check("same samples, same scores (deterministic)", JSON.stringify(SIM.sessionFinish(traceAll(mk(J(moon)), { speed: 1, noise: 0.2 }))) === JSON.stringify(rs));
/* the liner against the line weight: a 9RL line with a 3RL liner */
const bold = flash("fl_sailor_rose");
const s9a = mk(J(bold)); SIM.sessionSetLiner(s9a, "7RL"); SIM.sessionTrace(s9a, SIM.sessionSynth(s9a, { speed: 1 }));
const s9b = mk(J(bold)); SIM.sessionSetLiner(s9b, "3RL"); SIM.sessionTrace(s9b, SIM.sessionSynth(s9b, { speed: 1 }));
check("a 9RL line laid with a 3RL liner scores lower than with the 7RL", s9b.lastStroke.q < s9a.lastStroke.q && s9b.lastStroke.lwSteps > 0, s9a.lastStroke.q + " vs " + s9b.lastStroke.q);
/* Assist makes a slightly rushed trace steady */
const fastA = SIM.sessionFinish(traceAll(mk(J(moon), { settings: { assist: true } }), { speed: 1.5 })), fastN = SIM.sessionFinish(traceAll(mk(J(moon)), { speed: 1.5 }));
check("Assist: a hand running 50% over the pace scores better", fastA.sitting.lineQuality > fastN.sitting.lineQuality, fastA.sitting.lineQuality + " vs " + fastN.sitting.lineQuality);

/* ---- pain ---- */
const onSpot = (d, pl) => Object.assign(J(d), { placement: pl, pos: { x: 0.5, y: 0.5 } });
const ribs = traceAll(mk(onSpot(moon, "ribs_l")), { speed: 1 }), fore = traceAll(mk(onSpot(moon, "forearm_l")), { speed: 1 });
if (!QUIET) console.log("pain after the moon's lines: ribs " + f3(ribs.m.pain) + " forearm " + f3(fore.m.pain) + " (clock " + f3(ribs.m.clock) + " / " + f3(fore.m.clock) + " h)");
check("a ribs placement raises pain faster than a forearm", ribs.m.pain > fore.m.pain * 2 && SIM.sessionPainRate(mk(onSpot(moon, "ribs_l"))) > SIM.sessionPainRate(mk(onSpot(moon, "forearm_l"))) * 2, f3(ribs.m.pain) + " vs " + f3(fore.m.pain));
const tough = mk(onSpot(moon, "ribs_l"), { client: Object.assign(J(CL), { traits: { pain: 0.95, talkative: 0.5 } }) }), soft = mk(onSpot(moon, "ribs_l"), { client: Object.assign(J(CL), { traits: { pain: 0.05, talkative: 0.5 } }) });
check("a tough client (pain tolerance 1) feels it less", SIM.sessionPainRate(tough) < SIM.sessionPainRate(soft) / 2);
const numbed = mk(onSpot(moon, "ribs_l")), nr0 = SIM.sessionPainRate(numbed), na = SIM.sessionAction(numbed, "numb");
check("numbing cream costs rubles and lowers the pain rate", na.ok && na.cost > 0 && SIM.sessionPainRate(numbed) < nr0 * 0.6 && !SIM.sessionAction(numbed, "numb").ok);
const brk = traceAll(mk(onSpot(moon, "ribs_l")), { speed: 1 }), p0 = brk.m.pain;
check("a break takes pain down, and each break helps less", SIM.sessionAction(brk, "break").ok && brk.m.pain < p0 && (() => { const a = brk.m.pain; SIM.sessionAction(brk, "break"); return a - brk.m.pain < p0 - a; })());
const chatty = mk(J(moon), { client: Object.assign(J(CL), { traits: { pain: 0.5, talkative: 0.95 } }) }), quiet = mk(J(moon), { client: Object.assign(J(CL), { traits: { pain: 0.5, talkative: 0.95 } }) });
SIM.sessionAction(chatty, "chat"); traceAll(chatty, { speed: 1 }); traceAll(quiet, { speed: 1 });
check("chatting with a talkative client slows fatigue", chatty.m.fatigue < quiet.m.fatigue, f3(chatty.m.fatigue) + " vs " + f3(quiet.m.fatigue));
const prac = traceAll(SIM.sessionStart(SIM.sessionNew({ design: onSpot(moon, "ribs_l"), client: null, skills: SK, kit: SIM.kitDefault(), kind: "practice" })), { speed: 1 });
check("fake skin: no pain, no fatigue, no actions", prac.m.pain === 0 && prac.m.fatigue === 0 && !SIM.sessionAction(prac, "break").ok);

/* ---- shading ---- */
function shadeZone(s, mm) {   // sweep back and forth inside the current zone's box for mm millimetres of travel
  const it = SIM.sessionItem(s), z = it.zone; let t = 1e6, x = z.cx, y = z.cy, dir = 1, gone = 0;
  const w = (z.box[2] - z.box[0]) * 0.3, step = 1.2;
  /* find a point inside to start from */
  for (let k = 0; k < 400; k++) { const px = z.box[0] + (z.box[2] - z.box[0]) * ((k * 0.618) % 1), py = z.box[1] + (z.box[3] - z.box[1]) * ((k * 0.382) % 1); if (SIM.insideZone(z.polys, px, py)) { x = px; y = py; break; } }
  const x0 = x; SIM.penDown(s, t, x, y);
  while (gone < mm) { t += 40; x += dir * step; gone += step; if (Math.abs(x - x0) > w) dir = -dir; SIM.penMove(s, t, x, y); }
  SIM.penUp(s, t);
}
const shadeTest = () => { const s = mk(flash("fl_bold_rose")); traceAll(s, { speed: 1 }); return s; };
const sA = shadeTest();
const firstZone = SIM.sessionItem(sA);
check("after the lines come the zones", firstZone && (firstZone.k === "shade" || firstZone.k === "colour"), firstZone && firstZone.k);
const tr0 = sA.acc.trauma;
const sB = shadeTest(); shadeZone(sA, 400); shadeZone(sB, 4000);
if (!QUIET) console.log("zone: sat " + f3(sA.zsat[firstZone.i]) + " / " + f3(sB.zsat[firstZone.i]) + " (target " + firstZone.zone.target + "), trauma " + f3(sA.acc.trauma - tr0) + " / " + f3(sB.acc.trauma - tr0));
check("sweeping fills the saturation meter", sA.zsat[firstZone.i] > 0.2, f3(sA.zsat[firstZone.i]));
check("overworked shading raises trauma", sB.acc.trauma - tr0 > (sA.acc.trauma - tr0) + 0.2 && sB.zsat[firstZone.i] > firstZone.zone.target + SIM.ZONE.slack, f3(sB.acc.trauma - tr0) + " vs " + f3(sA.acc.trauma - tr0));
check("overworked shading shows in the trauma output", SIM.sessionFinish(sB).out.trauma > SIM.sessionFinish(sA).out.trauma);

/* ---- multi-session ---- */
const big = { placement: "upperback", style: "japanese", sizeMm: 300, pos: { x: 0.5, y: 0.5 }, elements: [
  { id: "koi", x: 0.5, y: 0.45, scale: 0.9, rot: 90, lineWeight: 9, fill: 0.8, colour: "orange" },
  { id: "wave_jp", x: 0.5, y: 0.85, scale: 1, rot: 0, lineWeight: 9, fill: 0.6, colour: "blue" }] };
const missingEl = big.elements.filter(e => !SIM.elementById(e.id)).map(e => e.id);
if (missingEl.length) { const any = SIM.ELEMENTS.filter(e => e.fill && e.styles.includes("japanese")).map(e => e.id); big.elements.forEach((e, i) => { if (!SIM.elementById(e.id)) e.id = any[i % any.length]; }); }
const bs = mk(J(big)), bp = SIM.sessionPlan(bs);
check("a big piece needs more than one sitting", bs.partsTotal > 1 && bs.end < bp.items.length, "parts " + bs.partsTotal + ", sitting 1 ends at item " + bs.end + " of " + bp.items.length);
traceAll(bs, { speed: 1 }); while (SIM.sessionItem(bs)) SIM.sessionNextItem(bs);
const bf = SIM.sessionFinish(bs);
check("its first sitting leaves work for the next, with progress saved as numbers", !bf.done && bf.nextPart === 2 && bf.progress.next === bs.end && JSON.stringify(bf.progress).length < 4000 && !/NaN|null,null/.test(JSON.stringify(bf.progress.zsat)));
const bs2 = SIM.sessionStart(SIM.sessionNew({ design: J(big), client: CL, skills: SK, kit: SIM.kitDefault(), kind: "sample", part: 2, partsTotal: bs.partsTotal, progress: J(bf.progress) }));
check("sitting 2 picks up where sitting 1 stopped", bs2.start === bs.end && bs2.acc.sittings === 1 && bs2.phase === "work");
let guard = 0; let s3 = bs2;
while (guard++ < 10) { traceAll(s3, { speed: 1 }); while (SIM.sessionItem(s3)) SIM.sessionNextItem(s3); const f = SIM.sessionFinish(s3); if (f.done) { s3 = f; break; }
  s3 = SIM.sessionStart(SIM.sessionNew({ design: J(big), client: CL, skills: SK, kit: SIM.kitDefault(), kind: "sample", part: f.nextPart, partsTotal: bs.partsTotal, progress: J(f.progress) })); }
check("the piece finishes in about partsTotal sittings", s3.done && s3.sessionsUsed === bs.partsTotal, s3.sessionsUsed + " of " + bs.partsTotal);
/* a pain limit ends a sitting early and the piece continues */
const lim = mk(onSpot(flash("fl_sailor_rose"), "ribs_l"), { client: Object.assign(J(CL), { traits: { pain: 0, talkative: 0.1 } }) });
lim.m.pain = 0.97; traceAll(lim, { speed: 1 }, 1);
const lf = SIM.sessionFinish(lim);
check("hitting the pain limit ends the sitting early and keeps the part", lim.stop === "pain" && lf.early && lf.nextPart === lf.part, lim.stop + " " + lf.early);

/* ---- outputs and XP ---- */
const full = (() => { const s = mk(flash("fl_moon")); traceAll(s, { speed: 1 }); while (SIM.sessionItem(s)) SIM.sessionNextItem(s); return SIM.sessionFinish(s); })();
check("outputs match aging.js tattoo.out (0..1) and feed SIM.age", ["lineQuality", "depthQuality", "saturation", "trauma"].every(k => full.out[k] >= 0 && full.out[k] <= 1) && full.done && full.sessionsUsed === 1 &&
  SIM.age({ design: flash("fl_moon"), out: full.out, ink: "budget" }, 10).readability > 0);
const xp = SIM.sessionXp(full, steady, SK);
check("XP: practice and sitting give a little linework XP, less at a high level", xp.linework > 0 && xp.linework < 0.2 && SIM.sessionXp(full, steady, { linework: 9 }).linework < xp.linework);

console.log(passes + " passed, " + fails + " failed (session and kit)");
process.exit(fails ? 1 : 0);
