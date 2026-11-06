#!/usr/bin/env node
/* tools/sim-test.js: run the INK_SIM simulation in plain node on a fixed seed and check it still makes sense.
   Usage (repo root):   node tools/sim-test.js            table + stress reports + assertions + timing
                        node tools/sim-test.js --quiet    assertions and timing only
   It reads src/manifest.txt, concatenates the src/sim/*.js files in order, strips the first <script> and last </script>
   lines, runs that in a vm sandbox and takes INK_SIM. Every TEST_DESIGN (tools/sim-fixtures.js) is scored against the
   client it was drawn for and one contrasting client: every sub-score, hours/sessions/price, and the aging prediction at
   5/10/20 years (fade lost / readability today). Then it asserts sanity orderings (tiny script reads worse than big
   script, watercolour fades faster than traditional, ...) and exits 1 if any fail. PR 3 adds client generation, the consult,
   memory and returns, the week clock, Next, and a synthetic 30-year run (auto-play: consult every walk-in, return and
   referral, do every session with default outputs) that times advanceWeek at year 30, and prints sample briefs, a consult
   transcript and a few Next lines to read the voice. Last, it times 10,000 scoreDesign calls.
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

/* ---- PR 3: clients, the consult, the week clock ---- */
const S0 = (o) => Object.assign({ v: 1, week: 1, year: 2000, cash: 0, rate: 0, rep: { walkins: 0, collectors: 0, peers: 0 },
  skills: { styles: {}, consult: 0, linework: 0, shading: 0, colour: 0, speed: 0 }, kit: {}, clients: [], pieces: [], queue: [],
  studio: { stage: "apprentice", staff: [] }, goals: {}, seed: SEED, settings: {}, bkAt: 0 }, o || {});
const clone = o => JSON.parse(JSON.stringify(o));
// tables
const elTags = new Set(); for (const e of SIM.ELEMENTS) for (const t of e.tags) elTags.add(t);
check("40+ brief templates across every theme", SIM.BRIEFS.length >= 40 && ["memorial", "milestone", "pets", "travel", "nature", "nautical", "first", "coverup", "matching", "collector"].every(t => SIM.BRIEFS.some(b => b.theme === t)), SIM.BRIEFS.length + " briefs");
check("brief ids unique", new Set(SIM.BRIEFS.map(b => b.id)).size === SIM.BRIEFS.length);
check("every brief tag, slot tag and hidden-want tag exists in ELEMENTS", SIM.BRIEFS.every(b => b.tags.every(t => elTags.has(t))) &&
  Object.values(SIM.BRIEF_SLOTS).every(l => l.every(v => !v.tags || v.tags.every(t => elTags.has(t)))) &&
  SIM.HIDDEN_WANTS.must.concat(SIM.HIDDEN_WANTS.deal).every(m => m.kind !== "tag" || elTags.has(m.v)),
  SIM.BRIEFS.map(b => b.tags.filter(t => !elTags.has(t)).join(",")).filter(Boolean).join(" "));
check("every brief style, size and placement exists", SIM.BRIEFS.every(b => b.styles.every(s => SIM.STYLES[s]) && SIM.SIZE_CLASSES[b.size] && b.place.every(p => P[p] || P[p + "_l"])));
const jc = j => { const s = j.toLowerCase(); for (const [k, v] of SIM.JOB_COVER) if (k !== "DEFAULT" && s.indexOf(k) >= 0) return v; return SIM.JOB_COVER[SIM.JOB_COVER.length - 1][1]; };
check("every job's cover agrees with design.js JOB_COVER within 0.25", SIM.JOBS.every(j => Math.abs(j.cover - jc(j.name)) <= 0.25), SIM.JOBS.filter(j => Math.abs(j.cover - jc(j.name)) > 0.25).map(j => j.name + " " + j.cover + " vs " + jc(j.name)).join("; "));
check("names include he/him, she/her and they/them pools", SIM.NAMES.groups.some(g => g.he && g.he.length) && SIM.NAMES.groups.some(g => g.she && g.she.length) && SIM.NAMES.neutral.length >= 5);
/* content guard: nothing in the client tables reads as a minor, and no real brands (curated words) */
const tableText = JSON.stringify([SIM.BRIEFS, SIM.BRIEF_SLOTS, SIM.NAMES, SIM.JOBS, SIM.HIDDEN_WANTS, SIM.CONSULT_QUESTIONS, SIM.CONSULT_ANSWERS, SIM.REVIEWS, SIM.RETURN_RULES, SIM.FOREIGN_PIECES, SIM.REFERRAL, SIM.BAD_IDEAS.map(b => [b.add, b.gentle, b.blunt, b.yes, b.no, b.insist])]);
const BANNED = /\b(child|children|kid|kids|teen|teens|teenager|son|daughter|baby|babies|boy|girl|minor|minors|underage|toddler|infant|schoolgirl|schoolboy|pupil|nephew|niece|grandson|granddaughter|instagram|facebook|tiktok|vkontakte|coca|nike|adidas|disney)\b/i;
check("client tables contain no words that read as minors or real brands", !BANNED.test(tableText), (tableText.match(BANNED) || [])[0]);
// generation
const gen = [];
for (let i = 0; i < 3000; i++) { const yr = 2000 + (i % 31); gen.push(SIM.makeClient(SIM.rng(SEED).fork("gen:" + i), { id: "c" + (i + 1), year: yr, week: 1 + (i % 52) })); }
check("every generated client is 18..75", gen.every(c => c.age >= 18 && c.age <= 75 && SIM.clientAge(c, 2030) >= 18), gen.filter(c => c.age < 18 || c.age > 75).map(c => c.age).join(","));
check("ages lean young (median under 35)", gen.map(c => c.age).sort((a, b) => a - b)[1500] < 35);
check("all three pronoun sets appear", ["he/him", "she/her", "they/them"].every(p => gen.some(c => c.pronouns === p)));
check("clients carry the full contract shape", gen.every(c => c.id && c.name && SIM.BODY_SHAPES[c.bodyShape] && c.skinTone >= 0 && c.skinTone <= 1 && c.job &&
  ["pain", "sun", "aftercare", "budget", "loyalty", "talkative", "trusting"].every(k => c.traits[k] >= 0 && c.traits[k] <= 1) &&
  c.wants && c.wants.sizeMm[0] < c.wants.sizeMm[1] && Array.isArray(c.mustHaves) && Array.isArray(c.dealbreakers) && Array.isArray(c.history) && c.known && c.brief && P[c.ask.placement]));
check("no brief has an unfilled {slot}", gen.every(c => !/\{\w+\}/.test(c.brief)), (gen.find(c => /\{\w+\}/.test(c.brief)) || {}).brief);
check("a dealbreaker never contradicts a must-have", gen.every(c => c.dealbreakers.every(d => !c.mustHaves.some(m => m.kind === d.kind && m.v === d.v))));
check("makeClient is deterministic", JSON.stringify(SIM.makeClient(SIM.rng(SEED).fork("gen:7"), { id: "c8", year: 2007, week: 8 })) === JSON.stringify(gen[7]));
check("era-limited jobs and briefs stay in their years", gen.every(c => { const j = SIM.JOBS.find(x => x.name === c.job), b = SIM.BRIEFS.find(x => x.id === c.briefId), y = c.since.y; return (!j.from || y >= j.from) && (!b.from || y >= b.from); }));
check("roughly one in five walk-ins brings a bad idea", (() => { const n = gen.filter(c => c.ask.bad).length / gen.length; return n > 0.1 && n < 0.4; })(), (gen.filter(c => c.ask.bad).length / gen.length).toFixed(2));
// the consult
const autoPick = (c, prefer) => { const o = SIM.consultOptions(c); const by = k => o.find(x => x.kind === k);
  if (prefer && o.find(x => x.id === prefer)) return prefer;
  return (by("talk") || (c.asked.length < 2 && by("ask")) || by("price") || o.find(x => x.id === "q_fair") || o[0]).id; };
function runConsult(client, S, r, prefer, item) {
  let c = SIM.consultStart(client, S, { item }), n = 0;
  while (c.stage !== "done" && n < 20) { const o = SIM.consultOptions(c); if (o.length < 3 || o.length > 5) return { c, bad: o.length + " options" }; c = SIM.consultChoose(c, autoPick(c, prefer), r); n++; }
  return { c, n };
}
const CS = S0({ year: 2010, studio: { stage: "chair", staff: [] }, skills: { styles: {}, consult: 4, linework: 0, shading: 0, colour: 0, speed: 0 } });
let maxEx = 0, optOk = true, allDone = true;
for (let i = 0; i < 600; i++) {
  const res = runConsult(gen[i], CS, SIM.rng(SEED).fork("consult:" + i), ["q_avoid", "q_must", null, "to_quote", "q_high", "q_low", "decline"][i % 7]);
  if (res.bad) optOk = false; if (res.c.stage !== "done" || !res.c.outcome) allDone = false;
  maxEx = Math.max(maxEx, res.n == null ? 99 : res.n);
}
check("the consult offers 3..5 choices at every step", optOk);
check("every consult terminates with an outcome in at most 5 exchanges", allDone && maxEx <= 5, "max " + maxEx);
const bads = gen.filter(c => c.ask.bad), talkRes = { won: 0, lost: 0, insisted: 0 };
for (let i = 0; i < bads.length; i++) for (const how of ["talk_gentle", "talk_blunt"]) {
  const c = SIM.consultChoose(SIM.consultStart(bads[i], CS), how, SIM.rng(SEED).fork("talk:" + how + i));
  talkRes[c.talk]++;
}
check("talking a client out of a bad idea can win them or lose the booking", talkRes.won > 10 && talkRes.lost > 10, JSON.stringify(talkRes));
const tiny = SIM.makeClient(SIM.rng(SEED).fork("tiny"), { id: "c9001", year: 2012, briefId: "first_word", badIdea: false });
const tinyAsk = c => Object.assign(clone(c), { ask: Object.assign(clone(c.ask), { style: "lettering", sizeMm: 9, placement: "forearm_l", bad: null }) });
check("a 9 mm script ask is flagged as a bad idea", SIM.consultStart(tinyAsk(tiny), CS).bad === "tiny_script");
const wonTalk = (() => { for (let i = 0; i < 200; i++) { const c = SIM.consultChoose(SIM.consultStart(tinyAsk(tiny), CS), "talk_gentle", SIM.rng(i + 1)); if (c.talk === "won") return c; } return null; })();
check("winning the tiny-script talk makes the script bigger and earns loyalty", wonTalk && wonTalk.ask.sizeMm >= 35 && (() => { const S1 = S0({ year: 2012 }); const before = wonTalk.client.loyalty; SIM.consultCommit(S1, wonTalk); return S1.clients[0].loyalty > before; })());
check("consultChoose does not mutate the consult it was given", (() => { const c = SIM.consultStart(gen[3], CS), j = JSON.stringify(c.transcript) + JSON.stringify(c.known); SIM.consultChoose(c, SIM.consultOptions(c)[0].id, SIM.rng(3)); return JSON.stringify(c.transcript) + JSON.stringify(c.known) === j; })());
check("asking about dealbreakers can reveal a hidden one", (() => { let hit = 0; gen.filter(c => c.dealbreakers.length > c.known.dealbreakers.length).slice(0, 100).forEach((cl, i) => { const c = SIM.consultChoose(SIM.consultStart(cl, CS), "q_avoid", SIM.rng(SEED + i)); if (c.known.dealbreakers.length > cl.known.dealbreakers.length) hit++; }); return hit > 20; })());
const acc = (() => { for (let i = 0; i < 100; i++) { const S1 = S0({ year: 2010, studio: { stage: "chair", staff: [] } }); const cl = SIM.makeClient(SIM.rng(i), { id: "c1", year: 2010, badIdea: false }); const res = runConsult(cl, S1, SIM.rng(i + 50), "q_low"); if (res.c.outcome === "accepted") { const out = SIM.consultCommit(S1, res.c); return { S1, out, c: res.c }; } } return null; })();
check("an accepted consult books a session and takes the deposit", acc && acc.out.item && acc.out.item.kind === "session" && acc.S1.cash === acc.c.quote.deposit && acc.S1.clients.length === 1 && acc.S1.clients[0].history[0].kind === "consult");
// memory: pieces, referral, returns, reviews
const MS = S0({ year: 2003, week: 10 });
const darya = SIM.makeClient(SIM.rng(11), { id: "c1", year: 2003, week: 10 }); MS.clients.push(darya);
const rose = { placement: "forearm_l", sizeMm: 85, style: "traditional", elements: [{ id: "rose_trad", x: 0.5, y: 0.5, scale: 0.8, rot: 0, lineWeight: 14, fill: 0.6, colour: "red" }] };
const pc = SIM.addPiece(MS, { client: "c1", design: rose, out: { lineQuality: 0.8, depthQuality: 0.8, saturation: 0.8, trauma: 0.5 } });
check("a piece is named after its motif, client and placement", pc.id === "p1" && pc.name === "the rose on " + darya.first + "'s left forearm" && darya.pieces[0] === "p1" && darya.history.some(h => h.kind === "piece"), pc.name);
const ref = SIM.referral(darya, SIM.rng(5), { id: "c2", year: 2003, week: 14, label: pc.label });
check("a referral names its referrer", ref.referredBy === "c1" && ref.brief.indexOf(darya.first) >= 0 && ref.age >= 18, ref.brief);
const RS = S0({ year: 2009, week: 20, studio: { stage: "studio", staff: [] } });
RS.clients.push(Object.assign(clone(darya), { loyalty: 1 })); RS.pieces.push(clone(pc));
let retItems = [];
for (let i = 0; i < 6000 && !retItems.length; i++) retItems = SIM.scheduleReturns(RS, SIM.rng(SEED).fork("ret:" + i));
const ri = retItems[0];
check("a return brief names the piece and its year", ri && ri.brief.indexOf(ri.ret.label) >= 0 && ri.brief.indexOf(String(ri.ret.year)) >= 0 && (ri.ret.rule === "cover_other" || (ri.ret.year === 2003 && ri.brief.indexOf("rose") >= 0)), ri && ri.brief);
check("every return rule's brief template names the piece and the year", SIM.RETURN_RULES.every(rr => rr.brief.every(t => /\{label\}|\{foreign\}/.test(t) && /\{year\}/.test(t))));
check("only one pending return per client", SIM.scheduleReturns(RS, SIM.rng(1)).length === 0);
const rv = SIM.writeReview(darya, Object.assign(clone(pc), { heal: "crisp" }), SIM.rng(2), true);
check("a review is written from REVIEWS and logged", rv && rv.kind === "review" && rv.stars >= 1 && rv.stars <= 5 && darya.history.indexOf(rv) >= 0);
// the week clock
const WS = S0({ week: 52, year: 2003, studio: { stage: "chair", staff: [] } });
const wl = SIM.advanceWeek(WS);
check("advanceWeek moves exactly one week and rolls the year", WS.week === 1 && WS.year === 2004 && wl[0].k === "week" && wl.some(l => l.k === "year"));
const WS2 = S0({ week: 17, year: 2011, studio: { stage: "studio", staff: [] } }); SIM.advanceWeek(WS2);
check("advanceWeek mid-year moves one week", WS2.week === 18 && WS2.year === 2011);
const ES = S0({ week: 51, year: 2030 }); SIM.advanceWeek(ES); const el2 = SIM.advanceWeek(ES);
check("the clock stops at 2030 week 52 with a flag", ES.week === 52 && ES.year === 2030 && el2.end === true && SIM.careerOver(ES) && SIM.nextStop(ES).weeks === 0);
check("advanceWeek is deterministic", (() => { const a = S0({ week: 30, year: 2015, studio: { stage: "studio", staff: [] }, rep: { walkins: 60, collectors: 30, peers: 10 } }), b = clone(a); SIM.advanceWeek(a); SIM.advanceWeek(b); return JSON.stringify(a) === JSON.stringify(b); })());
const NS = S0({ week: 5, year: 2002 });
let nsMax = 0; const nsLogs = [];
for (let i = 0; i < 60; i++) { const w0 = SIM.weekIndex(NS.week, NS.year), res = SIM.nextStop(NS); nsMax = Math.max(nsMax, SIM.weekIndex(NS.week, NS.year) - w0, res.weeks); nsLogs.push(res); }
check("nextStop never jumps more than 4 weeks", nsMax <= 4 && nsLogs.every(x => x.weeks >= 1 && typeof x.line === "string"), "max " + nsMax);
check("nextStop stops early for a client and runs to 4 on a quiet stretch", nsLogs.some(x => x.weeks < 4 && (x.why === "walkin" || x.why === "client")) && nsLogs.some(x => x.why === "cap" && x.weeks === 4));
const CQ = S0({ week: 10, year: 2006, studio: { stage: "chair", staff: [] } });
const cqC = SIM.makeClient(SIM.rng(9), { id: "c1", year: 2006 }); CQ.clients.push(cqC);
for (let i = 0; i < 8; i++) CQ.queue.push({ id: "q" + (i + 1), kind: "session", client: "c1", w: 11, y: 2006, hours: 6, sessionNo: 1, sessions: 1, price: 1000, deposit: 200, ask: cqC.ask });
const cqLog = SIM.advanceWeek(CQ);
check("sessions that don't fit the week's hours carry to next week", CQ.queue.filter(q => q.w === 11).reduce((a, q) => a + q.hours, 0) <= SIM.WEEK.stages.chair.hours && CQ.queue.some(q => q.w === 12) && cqLog.some(l => l.k === "carried"));
const fin = SIM.finishSession(CQ, CQ.queue.find(q => q.w === 11).id, { design: rose });
check("finishing a session pays the balance and creates the piece", fin.piece && CQ.pieces.length === 1 && CQ.cash === 800);

/* ---- the synthetic 30-year run: consult and accept walk-ins, do every session with default outputs ---- */
function autoWeek(S) {
  const yrs = S.year - 2000;
  S.studio.stage = yrs < 3 ? "apprentice" : yrs < 8 ? "chair" : yrs < 20 ? "studio" : "legacy";
  S.rep.walkins = Math.min(100, yrs * 6); S.rep.collectors = Math.min(100, yrs * 4); S.rep.peers = Math.min(100, yrs * 3);
  S.skills.consult = Math.min(10, Math.floor(yrs / 2)); S.skills.speed = Math.min(10, Math.floor(yrs / 3));
  const r = SIM.rng(S.seed).fork("auto:" + S.year + ":" + S.week), now = SIM.weekIndex(S.week, S.year);
  for (const q of S.queue.slice()) {
    if (SIM.weekIndex(q.w, q.y) !== now || (q.kind !== "walkin" && q.kind !== "consult")) continue;
    const client = q.newClient || SIM.findClient(S, q.client); if (!client) continue;
    let c = SIM.consultStart(client, S, { item: q });
    while (c.stage !== "done") c = SIM.consultChoose(c, autoPick(c), r);
    SIM.consultCommit(S, c);
  }
  for (const q of S.queue.slice()) if (q.kind === "session" && SIM.weekIndex(q.w, q.y) === now)
    SIM.finishSession(S, q.id, { design: q.design || SIM.proxyDesign(q.ask), out: { lineQuality: 0.8, depthQuality: 0.8, saturation: 0.8, trauma: 0.4 } });
}
const LONG = S0({ seed: SEED });
const perYear = {}, tRun = process.hrtime.bigint();
let lastLog = null;
for (let i = 0; i < 1560; i++) {
  autoWeek(LONG);
  const t0 = process.hrtime.bigint(); lastLog = SIM.advanceWeek(LONG); const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  (perYear[LONG.year] = perYear[LONG.year] || []).push(dt);
}
const runMs = Number(process.hrtime.bigint() - tRun) / 1e6;
const y30 = perYear[2029], avg30 = y30.reduce((a, b) => a + b, 0) / y30.length, max30 = Math.max(...y30);
const ids = LONG.clients.map(c => c.id);
check("30-year run: 1,560 weeks lands on 2030 week 1", LONG.year === 2030 && LONG.week === 1, LONG.week + "/" + LONG.year);
check("30-year run: no duplicate client, piece or queue ids", new Set(ids).size === ids.length && new Set(LONG.pieces.map(p => p.id)).size === LONG.pieces.length && new Set(LONG.queue.map(q => q.id)).size === LONG.queue.length);
check("30-year run: every client is an adult", LONG.clients.every(c => c.age >= 18 && SIM.clientAge(c, LONG.year) >= 18));
check("30-year run: referrals, returns and named pieces all happen", LONG.clients.some(c => c.referredBy) && LONG.clients.some(c => c.history.some(h => h.kind === "consult" && h.src === "return")) && LONG.pieces.every(p => /^the .+ on .+'s .+/.test(p.name)));
check("30-year run: advanceWeek under 50 ms at year 30", avg30 < 50 && max30 < 150, avg30.toFixed(2) + " ms avg, " + max30.toFixed(1) + " ms max");
check("the 30-year run is deterministic (first 2 years, twice)", (() => { const a = S0({ seed: 77 }), b = S0({ seed: 77 }); for (let i = 0; i < 104; i++) { autoWeek(a); SIM.advanceWeek(a); autoWeek(b); SIM.advanceWeek(b); } return JSON.stringify(a) === JSON.stringify(b) && a.clients.length > 0; })());

if (!QUIET) {
  console.log("\nsample briefs:");
  for (const c of gen.filter((c, i) => i % 433 === 5).slice(0, 7)) console.log("  [" + c.since.y + ", " + c.name + ", " + c.age + ", " + c.job + "] " + c.brief);
  const tr = (() => { for (let i = 0; i < 600; i++) { const cl = gen[i]; if (!cl.ask.bad || cl.dealbreakers.length <= cl.known.dealbreakers.length) continue; const r = SIM.rng(SEED + i); let c = SIM.consultStart(cl, CS);
    for (const id of ["q_avoid", "talk_gentle", "q_pain", "to_quote", "q_fair"]) { if (c.stage === "done") break; const o = SIM.consultOptions(c); c = SIM.consultChoose(c, o.find(x => x.id === id) ? id : autoPick(c), r); }
    while (c.stage !== "done") c = SIM.consultChoose(c, autoPick(c), r); if (c.outcome === "accepted" && c.talk === "won" && c.known.dealbreakers.length > cl.known.dealbreakers.length) return c; } return null; })();
  if (tr) { console.log("\nsample consult (" + tr.client.name + ", " + tr.client.job + ", consult skill " + tr.skill + "):"); for (const l of tr.transcript) console.log("  " + (l.who === "artist" ? "YOU:    " : l.who === "client" ? "CLIENT: " : "        (") + l.text + (l.who === "note" ? ")" : "")); console.log("  -> " + tr.outcome + ", quote " + JSON.stringify(tr.quote)); }
  const keep = new Set(LONG.clients.slice(0, 40).map(c => c.id));
  const NX = S0({ week: 20, year: 2004, studio: { stage: "chair", staff: [] }, rep: { walkins: 30, collectors: 10, peers: 5 }, clients: clone(LONG.clients.slice(0, 40)), pieces: clone(LONG.pieces.filter(p => keep.has(p.client))) });
  console.log("\nNext, four presses (a 2004 chair; nobody is consulted in between, so walk-ins leave unseen):");
  for (let i = 0; i < 4; i++) { const res = SIM.nextStop(NX); console.log("  [" + res.weeks + " wk, stop: " + res.why + "] " + res.line); }
  /* the same shop if walk-ins did not stop Next (WEEK.nextStopsOnWalkins = false), with a fresh piece healing */
  const NY = S0({ week: 20, year: 2004, studio: { stage: "chair", staff: [] }, rep: { walkins: 30, collectors: 10, peers: 5 }, clients: clone(LONG.clients.slice(0, 40)), pieces: clone(LONG.pieces.filter(p => keep.has(p.client))) });
  const nyC = NY.clients[0]; NY.pieces.push(Object.assign(clone(pc), { id: "p" + (NY.pieces.length + 1), client: nyC.id, w: 19, y: 2004, name: SIM.pieceName(pc.label, nyC, pc.design.placement) }));
  NY.queue.push({ id: "q1", kind: "session", client: nyC.id, w: 27, y: 2004, hours: 4, sessionNo: 1, sessions: 1, price: 9000, deposit: 1800, ask: nyC.ask });
  SIM.WEEK.nextStopsOnWalkins = false;
  console.log("Next, four presses, if only booked clients, heals and events stopped it:");
  for (let i = 0; i < 4; i++) { const res = SIM.nextStop(NY); console.log("  [" + res.weeks + " wk, stop: " + res.why + "] " + res.line); }
  SIM.WEEK.nextStopsOnWalkins = true;
  const retN = LONG.clients.filter(c => c.history.some(h => h.kind === "consult" && h.src === "return")).length;
  console.log("\n30-year run: " + LONG.clients.length + " clients, " + LONG.pieces.length + " pieces, " + LONG.clients.filter(c => c.referredBy).length + " referred, " + retN + " came back, queue " + LONG.queue.length +
    ", cash " + LONG.cash.toLocaleString("en-CA") + " RUB, S as JSON " + Math.round(JSON.stringify(LONG).length / 1024) + " KB (uncompacted; CLIENT_CAP is PR 7). whole run " + Math.round(runMs) + " ms");
  console.log("last advanceWeek log: " + lastLog.map(l => l.text).join(" | "));
}
console.log("30-year run: " + LONG.clients.length + " clients; advanceWeek at year 30: " + avg30.toFixed(2) + " ms avg, " + max30.toFixed(1) + " ms max");

/* ---- timing ---- */
const N = 10000, cl = Object.values(TEST_CLIENTS);
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) SIM.scoreDesign(TEST_DESIGNS[i % TEST_DESIGNS.length].design, cl[i % cl.length], SKILLS);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(passes + " passed, " + fails + " failed. scoreDesign: " + (ms / N).toFixed(4) + " ms per call (" + N + " calls, " + Math.round(ms) + " ms)");
process.exit(fails ? 1 : 0);
