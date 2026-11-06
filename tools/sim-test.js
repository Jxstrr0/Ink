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
const cqCash = CQ.cash, fin = SIM.finishSession(CQ, CQ.queue.find(q => q.w === 11).id, { design: rose });   // PR 7: advanceWeek now charges supplies, so compare the change
check("finishing a session pays the balance and creates the piece", fin.piece && CQ.pieces.length === 1 && CQ.cash - cqCash === 800);

/* ---- PR 5: heals and the reputation tracks (all on fixed seeds) ---- */
const HC = (care, loyalty) => Object.assign(SIM.makeClient(SIM.rng(31), { id: "c1", year: 2004 }), { loyalty: loyalty == null ? 0.5 : loyalty });
const healRun = (out, care, n, extra) => {   // n fresh pieces healed with these outputs and this aftercare -> grade counts
  const counts = { crisp: 0, soft: 0, patchy: 0, blownout: 0, infected: 0 };
  for (let i = 0; i < n; i++) {
    const c = HC(); c.traits.aftercare = care;
    const H = S0({ week: 10, year: 2004, clients: [c], reveals: [] });
    const p = SIM.addPiece(H, Object.assign({ client: "c1", design: rose, out }, extra || {}));
    Object.assign(p, extra || {}); p.id = "p" + (i + 1);
    counts[SIM.healPiece(H, p, SIM.rng(SEED + i), [])]++;
  }
  return counts;
};
const GOOD = { lineQuality: 0.88, depthQuality: 0.86, saturation: 0.85, trauma: 0.12 };
const ROUGH = { lineQuality: 0.4, depthQuality: 0.45, saturation: 0.5, trauma: 0.85 };
const hGood = healRun(GOOD, 0.8, 300), hRoughBad = healRun(ROUGH, 0.1, 300), hLowT = healRun(Object.assign({}, ROUGH, { trauma: 0.3 }), 0.05, 300);
const hBlow = healRun(Object.assign({}, GOOD, { blowouts: 8 }), 0.7, 300, { blowouts: 8 });
check("heal: good outputs with good aftercare mostly heal crisp", hGood.crisp / 300 > 0.8 && hGood.infected === 0 && hGood.blownout === 0, JSON.stringify(hGood));
check("heal: high trauma with bad aftercare can get infected (rarely)", hRoughBad.infected > 0 && hRoughBad.infected / 300 < 0.45, JSON.stringify(hRoughBad));
check("heal: low trauma never gets infected, even with bad aftercare", hLowT.infected === 0, JSON.stringify(hLowT));
check("heal: blowouts lead to blown-out heals", hBlow.blownout / 300 > 0.6 && hGood.blownout === 0, JSON.stringify(hBlow));
check("heal: poor outputs heal worse than good ones", (hRoughBad.patchy + hRoughBad.blownout + hRoughBad.infected) > 200 && hRoughBad.crisp < 10, JSON.stringify(hRoughBad));
check("heal: every grade is a HEAL_GRADES id with reaction lines for every loyalty band", Object.keys(SIM.HEAL_GRADES).every(g => ["low", "mid", "high"].every(b => SIM.HEAL_REACTIONS[g][b].length >= 2)));
// through the calendar: a piece heals exactly once, two weeks on, and lands in the reveal queue
const HW = S0({ week: 10, year: 2004, studio: { stage: "chair", staff: [] }, clients: [HC()], reveals: [] });
const hp = SIM.addPiece(HW, { client: "c1", design: rose, out: GOOD });
const healLogs = []; let healAt = null;
for (let i = 0; i < 6; i++) { const lg = SIM.advanceWeek(HW); for (const l of lg) if (l.k === "heal" && l.piece === hp.id) { healLogs.push(l); healAt = SIM.weekIndex(HW.week, HW.year); } }
const firstGrade = hp.heal; SIM.healPiece(HW, hp, SIM.rng(1), []);
check("heal: advanceWeek heals a piece exactly once, two weeks after it was done", healLogs.length === 1 && healAt === SIM.weekIndex(10, 2004) + SIM.WEEK.healWeeks && hp.heal === firstGrade && hp.healW === 12 && hp.healY === 2004, JSON.stringify(healLogs.map(l => l.text)));
check("heal: the piece is queued for its reveal and the client remembers the heal", HW.reveals.indexOf(hp.id) >= 0 && HW.clients[0].history.some(h => h.kind === "heal" && h.piece === hp.id && h.grade === hp.heal));
check("heal: the heal grade feeds the aging model", (() => { const t = { design: rose, out: GOOD, skinTone: 0.3, sun: 0.4 }; const a = SIM.age(Object.assign({}, t, { heal: "crisp" }), 0), b = SIM.age(Object.assign({}, t, { heal: "blownout" }), 0); return b.spread > a.spread && b.readability <= a.readability; })());
// reviews and loyalty
let reviews = 0, loyUp = 0, loyDown = 0;
for (let i = 0; i < 200; i++) {
  const c = HC(null, 0.5); c.traits.aftercare = 0.8;
  const H = S0({ week: 10, year: 2004, clients: [c] });
  const p = SIM.addPiece(H, { client: "c1", design: rose, out: i % 2 ? GOOD : ROUGH }); const l0 = c.loyalty;
  SIM.healPiece(H, p, SIM.rng(SEED * 3 + i), []);
  if (SIM.pieceReview(H, p)) reviews++;
  if (p.heal === "crisp" && c.loyalty > l0) loyUp++;
  if ((p.heal === "patchy" || p.heal === "blownout" || p.heal === "infected") && c.loyalty < l0) loyDown++;
}
check("heal: a review gets written sometimes, not always", reviews > 20 && reviews < 150, reviews + " of 200");
check("heal: crisp heals raise loyalty and bad ones lower it", loyUp > 20 && loyDown > 10, loyUp + " up, " + loyDown + " down");
// an infection: a free fix for a client on the books
const infS = (() => { for (let i = 0; i < 400; i++) { const c = HC(); c.traits.aftercare = 0.05; const H = S0({ week: 10, year: 2004, clients: [c], rep: { walkins: 30, collectors: 30, peers: 30 } }); const p = SIM.addPiece(H, { client: "c1", design: rose, out: ROUGH }); if (SIM.healPiece(H, p, SIM.rng(SEED + 7 * i), []) === "infected") return { H, p }; } return null; })();
check("heal: an infection books a free fix and costs reputation", infS && infS.H.queue.some(q => q.kind === "session" && q.fix === infS.p.id && q.price === 0 && q.client === "c1") && infS.H.rep.peers < 30 && infS.H.rep.walkins < 30);
// reputation
const RP = S0({ week: 10, year: 2004, clients: [HC()] });
const rp1 = SIM.addPiece(RP, { client: "c1", design: rose, out: GOOD }); rp1.heal = "crisp";
const dCrisp = SIM.repHealDelta(RP, rp1), dBlown = SIM.repHealDelta(RP, Object.assign({}, rp1, { heal: "blownout" }));
const dFlash = SIM.repHealDelta(RP, Object.assign({}, rp1, { design: Object.assign({}, rose, { flash: "fl_bold_rose", sizeMm: 50 }) }));
check("rep: a crisp heal raises peers and walk-ins, a blowout lowers them", dCrisp.peers > 0 && dCrisp.walkins > 0 && dBlown.peers < 0 && dBlown.walkins < 0);
check("rep: custom work moves collectors, small flash moves walk-ins", dCrisp.collectors > 0 && dFlash.collectors === 0 && dFlash.walkins > dCrisp.walkins);
const R0 = S0({ rep: { walkins: 10, collectors: 90, peers: 50 } }); SIM.repAdd(R0, "walkins", 2); SIM.repAdd(R0, "collectors", 2); SIM.repAdd(R0, "peers", -200);
check("rep: gains soften as a track fills, every track stays in 0..100", R0.rep.walkins - 10 > R0.rep.collectors - 90 && R0.rep.collectors < 92 && R0.rep.peers === 0);
const R1 = S0({ rep: { walkins: 50, collectors: 50, peers: 50 } }); for (let i = 0; i < 52; i++) SIM.repWeek(R1);
check("rep: a track slips a little each week when nothing happens", R1.rep.walkins < 50 && R1.rep.walkins > 40, R1.rep.walkins);
const pf = S0({ clients: [HC()], rep: { walkins: 0, collectors: 20, peers: 0 } }), pfp = SIM.addPiece(pf, { client: "c1", design: rose, out: GOOD });
const pfBefore = SIM.setPortfolio(pf, pfp, true); pfp.heal = "crisp"; SIM.setPortfolio(pf, pfp, true); const pfOn = pf.rep.collectors; SIM.setPortfolio(pf, pfp, false);
check("rep: the portfolio flag (healed pieces only) nudges collectors and comes back off", pfBefore === false && pfOn > 20 && Math.abs(pf.rep.collectors - 20) < 0.05 && !pfp.portfolio);
check("rep: segments unlock with their track", !SIM.repUnlocked(S0(), "collectors", "collector") && SIM.repUnlocked(S0({ rep: { walkins: 0, collectors: 30, peers: 0 } }), "collectors", "collector") && SIM.repNext(S0(), "peers").id === "old_school");
const HR = S0({ week: 10, year: 2004, studio: { stage: "chair", staff: [] }, clients: [HC()], rep: { walkins: 20, collectors: 20, peers: 20 } });
for (let i = 0; i < 12; i++) { const c = HC(); c.id = "c" + (i + 2); c.traits.aftercare = 0.8; HR.clients.push(c); SIM.addPiece(HR, { client: c.id, design: rose, out: GOOD }); }
for (let i = 0; i < 3; i++) SIM.advanceWeek(HR);
check("rep: a run of clean heals through the calendar raises peers", HR.rep.peers > 20 && HR.pieces.every(p => p.heal), HR.rep.peers + " peers, grades " + HR.pieces.map(p => p.heal).join(","));

/* ---- the synthetic 30-year run: consult and accept walk-ins, do every session with default outputs ----
   PR 7: the acts now move through the career functions (rent a chair in year 3, lease in year 8, legacy in year 20), the
   studio builds two stations and hires two artists, invites are declined, and the client archive (CLIENT_CAP) runs. */
const AUTO_SIZES = {};
function autoWeek(S) {
  const yrs = S.year - 2000;
  SIM.careerEnsure(S);
  if (yrs >= 3 && S.studio.stage === "apprentice") SIM.rentChair(S);
  if (yrs >= 8 && S.studio.stage === "chair") { if (S.cash < SIM.leaseNeed(S).cost) S.cash = SIM.leaseNeed(S).cost + 1; SIM.leaseStudio(S); }
  if (S.studio.stage === "studio" || S.studio.stage === "legacy") {
    while ((S.studio.build.stations || 0) < 2) { const c = SIM.buildCost(S, "stations"); if (S.cash < c) S.cash = c; SIM.buildUp(S, "stations"); }
    if (!S.studio.build.steril) { const c = SIM.buildCost(S, "steril"); if (S.cash < c) S.cash = c; SIM.buildUp(S, "steril"); }
    if (SIM.staffRoom(S) > 0) { const cand = SIM.staffCandidates(S)[0]; if (cand) { if (S.cash < 1e6) S.cash += 1e6; SIM.hireStaff(S, cand.cid); } }
    if (S.cash < 0) S.cash = 0;   // the auto-player is never the one testing the soft fail
  }
  if (yrs >= 20 && S.studio.stage === "studio") SIM.goLegacy(S);
  for (const inv of S.career.invites.slice()) if (inv.kind !== "chair") SIM.enterInvite(S, inv.id, false);
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
/* the save's size: ink-save JSON (packed, as the app writes it) and the INK1: backup code (app/savecode.js buZip) */
const BU = (() => { const ctx = { TextEncoder, TextDecoder, Uint8Array, console }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src/app/savecode.js"), "utf8") + "\nthis.zip=buZip;this.sum=buSum;", ctx); return ctx; })();
function saveSizes(S) {
  const t0 = process.hrtime.bigint(), json = JSON.stringify(SIM.packSave(S)), packMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const body = BU.zip(new TextEncoder().encode(JSON.stringify({ v: 1, at: 0, ver: "test", save: JSON.parse(json), slots: [null, null, null] })));
  return { json: json.length, raw: JSON.stringify(S).length, code: 5 + body.length + 6, clients: S.clients.length, full: S.clients.filter(c => !c.compact).length, pieces: S.pieces.length, staffPieces: S.pieces.filter(p => p.by).length, packMs };
}
const LONG = S0({ seed: SEED });
const perYear = {}, tRun = process.hrtime.bigint();
let lastLog = null;
const LONG_EV = [];   // PR 8: every event, trend and goal line of the run, with its week
for (let i = 0; i < 1560; i++) {
  autoWeek(LONG);
  const t0 = process.hrtime.bigint(); lastLog = SIM.advanceWeek(LONG); const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  for (const l of lastLog) if (l.k === "event" || l.k === "trend" || l.k === "goal" || l.k === "note" || (l.k === "referral" && l.social)) LONG_EV.push(Object.assign({ w: LONG.week, y: LONG.year }, l));
  (perYear[LONG.year] = perYear[LONG.year] || []).push(dt);
  if (LONG.week === 1 && [2005, 2010, 2020, 2030].includes(LONG.year)) AUTO_SIZES[LONG.year - 2000] = saveSizes(LONG);
}
const runMs = Number(process.hrtime.bigint() - tRun) / 1e6;
const y30 = perYear[2029], avg30 = y30.reduce((a, b) => a + b, 0) / y30.length, max30 = Math.max(...y30);
const ids = LONG.clients.map(c => c.id);
check("30-year run: 1,560 weeks lands on 2030 week 1", LONG.year === 2030 && LONG.week === 1, LONG.week + "/" + LONG.year);
check("30-year run: no duplicate client, piece or queue ids", new Set(ids).size === ids.length && new Set(LONG.pieces.map(p => p.id)).size === LONG.pieces.length && new Set(LONG.queue.map(q => q.id)).size === LONG.queue.length);
check("30-year run: every client is an adult", LONG.clients.every(c => c.age >= 18 && SIM.clientAge(c, LONG.year) >= 18));
check("30-year run: referrals, returns and named pieces all happen", LONG.clients.some(c => c.referredBy) && LONG.clients.some(c => (c.history || []).some(h => h.kind === "consult" && h.src === "return")) && LONG.pieces.every(p => /^the .+ on .+'s .+/.test(p.name)));
check("30-year run: advanceWeek under 50 ms at year 30", avg30 < 50 && max30 < 150, avg30.toFixed(2) + " ms avg, " + max30.toFixed(1) + " ms max");
check("the 30-year run is deterministic (first 2 years, twice)", (() => { const a = S0({ seed: 77 }), b = S0({ seed: 77 }); for (let i = 0; i < 104; i++) { autoWeek(a); SIM.advanceWeek(a); autoWeek(b); SIM.advanceWeek(b); } return JSON.stringify(a) === JSON.stringify(b) && a.clients.length > 0; })());

/* ---- PR 7: career, studio, money, staff, the client archive and the save's size ---- */
const PI = y => SIM.priceIndex(y), RUB = (y, v) => Math.round(v * PI(y) / 10) * 10;
{ /* costs: the chair's cut of last week's takings, supplies for booked hours, studio rent and upkeep */
  const C1 = S0({ week: 10, year: 2004, studio: { stage: "chair", staff: [] }, cash: 50000 }); SIM.careerEnsure(C1); C1.career.split = "standard";
  C1.career.money.cur.in.sitting = 10000;
  C1.queue.push({ id: "q1", kind: "session", client: "c9", w: 11, y: 2004, hours: 4, sessionNo: 2, sessions: 2, price: 0, deposit: 0 });
  SIM.advanceWeek(C1); const o1 = C1.career.money.cur.out;
  check("costs: a chair pays the shop its cut of last week's takings", o1.chair === Math.round(10000 * SIM.CHAIR_SPLIT.standard), JSON.stringify(o1));
  check("costs: supplies are charged per booked hour", o1.supplies === RUB(2004, SIM.SUPPLIES.perHour * 4), JSON.stringify(o1));
  const C2 = S0({ week: 10, year: 2010, studio: { stage: "studio", staff: [], lease: { w: 1, y: 2010 }, build: { stations: 1 } }, cash: 500000 }); SIM.careerEnsure(C2);
  SIM.advanceWeek(C2); const o2 = C2.career.money.cur.out;
  check("costs: a studio pays rent, utilities and station upkeep every week", o2.rent === RUB(2010, SIM.LEASE.rentWeek + SIM.LEASE.utilities + SIM.STUDIO_STAGES.stations.upkeep), JSON.stringify(o2));
  check("costs: the week's ledger matches the cash", C2.cash === 500000 - Object.values(o2).reduce((a, b) => a + b, 0) + Object.values(C2.career.money.cur.in).reduce((a, b) => a + b, 0));
}
{ /* the soft fail: four weeks under the floor closes the studio; clients, pieces and rep stay */
  const mk = gw => { const F = S0({ week: 10, year: 2012, studio: { stage: "studio", staff: [], lease: { w: 1, y: 2010 }, build: { stations: 2, steril: 1 } }, cash: -1e6, rep: { walkins: 40, collectors: 30, peers: 30 } });
    SIM.careerEnsure(F); F.career.mentor.goodwill = gw; F.career.insp = 1e9;
    for (let i = 0; i < 6; i++) { const c = HC(); c.id = "c" + (i + 1); F.clients.push(c); SIM.addPiece(F, { client: c.id, design: rose, out: GOOD, heal: "crisp" }); }
    F.studio.staff.push({ id: "s1", name: "Lev Orlov", first: "Lev", style: "blackwork", skill: 5, ego: 0.3, cut: 0.4, poach: 0, loyalty: 0.9, pieces: 0, earned: 0 }); F.studio.nextStaff = 2;
    return F; };
  const F = mk(0.2), nC = F.clients.length, rep0 = clone(F.rep), myPieces = F.pieces.filter(p => !p.by).length; let wk = 0;
  while (F.studio.stage === "studio" && wk < 8) { F.cash = Math.min(F.cash, -1e6); SIM.advanceWeek(F); wk++; }
  check("soft fail: four weeks under BROKE.floor closes the studio and drops you to a chair", F.studio.stage === "chair" && wk === SIM.BROKE.weeks, wk + " weeks, " + F.studio.stage);
  check("soft fail: staff go, the lease and the build-out go", F.studio.staff.length === 0 && !F.studio.lease && F.studio.build.stations === 0 && F.career.alumni.some(a => a.id === "s1"));
  check("soft fail: clients, your pieces and your reputation stay", F.clients.length === nC && F.pieces.filter(p => !p.by).length === myPieces && F.rep.collectors >= rep0.collectors - 1 && F.rep.peers >= rep0.peers - 1);
  check("soft fail: a scene for the app and a fresh start in cash", F.career.scene && F.career.scene.kind === "broke" && F.career.scene.staff[0] === "Lev Orlov" && F.cash === RUB(2012, SIM.BROKE.restart) && F.career.fails === 1);
  const L = mk(0.9); for (let i = 0; i < 4; i++) { L.cash = Math.min(L.cash, -1e6); SIM.advanceWeek(L); }
  check("soft fail: once, a mentor with high goodwill lends you the money instead", L.studio.stage === "studio" && L.career.mentor.loan === true && L.career.money.cur.in.loan === RUB(2012, SIM.BROKE.loan));
}
{ /* the four acts and Act 1's tutorial */
  const A = S0({ seed: 5 }); A.career = SIM.careerFresh(); SIM.careerEnsure(A);
  check("Act 1: walk-ins stay closed until the friend step", SIM.walkinsOpen(A) === false && SIM.apprenticeGoal(A).id === "chore");
  const ch = SIM.doChore(A, SIM.CHORES[0].id);
  check("Act 1: a chore earns XP and goodwill and passes a week", A.career.chores === 1 && A.week === 2 && A.career.mentor.goodwill > SIM.MENTOR.goodwill.start && ch.line.length > 0);
  const fb = SIM.friendBooking(A);
  check("Act 1: a friend's piece is free and booked this week", fb && fb.friend && fb.price === 0 && SIM.weekIndex(fb.w, fb.y) === SIM.weekIndex(A.week, A.year) && A.career.friends.length === 1);
  SIM.finishSession(A, fb.id, { design: SIM.proxyDesign(fb.ask), out: GOOD });
  SIM.apprenticeSteps(A);
  check("Act 1: after the friend's piece, walk-ins open", SIM.walkinsOpen(A) === true && !!A.career.steps.friend && SIM.apprenticeGoal(A).id !== "friend");
  A.year = 2002; A.week = 1; const rc = SIM.rentChair(A);
  check("Act 2: renting a chair early costs Arkady's goodwill", rc.ok && rc.early && A.studio.stage === "chair" && A.career.reached.chair && A.career.mentor.left.early === true);
  check("Act 3: a lease needs cash and a year (or rep)", SIM.leaseStudio(A).ok === false);
  A.year = 2008; A.cash = 1e6; const ls = SIM.leaseStudio(A);
  check("Act 3: leasing sets the stage and charges the deposit", ls.ok && A.studio.stage === "studio" && A.cash === 1e6 - ls.cost && A.career.reached.studio);
  check("Act 4: Legacy waits for its years (or collectors)", SIM.goLegacy(A).ok === false);
  A.year = 2018; check("Act 4: Legacy sets the stage", SIM.goLegacy(A).ok && A.studio.stage === "legacy" && A.career.reached.legacy);
  const K = S0({ seed: 6 }); K.career = SIM.careerFresh(); SIM.skipBroom(K);
  check("Skip the broom: a rented chair in week 1 of 2003 with the tutorial done", K.year === 2003 && K.week === 1 && K.studio.stage === "chair" && SIM.apprenticeGoal(K) === null && SIM.walkinsOpen(K) && K.skills.linework > 0 && K.rate > 0);
}
{ /* staff: their pieces go to the shop gallery and shop rep, never your body of work */
  const T = S0({ week: 10, year: 2012, studio: { stage: "studio", staff: [], lease: { w: 1, y: 2010 }, build: { stations: 2 } }, cash: 2e6, rep: { walkins: 50, collectors: 30, peers: 30 } });
  SIM.careerEnsure(T); T.career.insp = 1e9;
  const cand = SIM.staffCandidates(T); const h1 = SIM.hireStaff(T, cand[0].cid), h2 = SIM.hireStaff(T, cand[1].cid), h3 = SIM.hireStaff(T, cand[2].cid);
  check("staff: hiring fills stations and no more", h1.ok && h2.ok && !h3.ok && h3.why === "stations" && T.studio.staff.length === 2);
  const mine0 = T.pieces.filter(p => !p.by).length;
  for (let i = 0; i < 12; i++) { T.cash = 2e6; SIM.advanceWeek(T); }
  const sp = T.pieces.filter(p => p.by);
  check("staff: they finish pieces from simStaffSession", sp.length > 4 && sp.every(p => p.out && p.out.lineQuality > 0 && p.out.trauma > 0), sp.length + " pieces");
  check("staff: their pieces are not yours (not in your body of work or the Legacy count)", T.pieces.filter(p => !p.by).length === mine0 && SIM.legacySummary(T).pieces === mine0 && SIM.legacySummary(T).shopPieces === sp.length);
  check("staff: shop pieces carry the guest client and name the artist", sp.every(p => p.guest && p.guest.n && !SIM.findClient(T, p.client) && T.studio.staff.concat(T.career.alumni).some(s => s.id === p.by)) && SIM.staffName(T, sp[0].by).length > 2);
  check("staff: heals move the shop's rep, not yours", sp.some(p => p.heal) && T.studio.rep !== 0);
  const o1 = SIM.simStaffSession({ id: "s1", skill: 2 }, rose, { r: SIM.rng(1) }), o2 = SIM.simStaffSession({ id: "s1", skill: 9 }, rose, { r: SIM.rng(1) });
  check("staff: simStaffSession is seeded and skill shows", JSON.stringify(o1) === JSON.stringify(SIM.simStaffSession({ id: "s1", skill: 2 }, rose, { r: SIM.rng(1) })) && o2.lineQuality > o1.lineQuality && o2.trauma < o1.trauma);
}
{ /* a convention: judged, charged, recorded */
  const V = clone(LONG); SIM.unpackSave(V); const cv = SIM.CONVENTIONS[0], cash0 = V.cash, fee = RUB(V.year, cv.fee + cv.travel);
  V.career.invites.push({ id: "conv:" + cv.id + ":t", kind: "conv", conv: cv.id, fee });
  const res = SIM.enterInvite(V, "conv:" + cv.id + ":t", true);
  const prizes = ((res.fresh && res.fresh.prize) || 0) + ((res.healed && res.healed.prize) || 0);
  check("convention: the fee is charged, prizes and booth paid, the result recorded (PR 8 judging)", res.ok && res.kind === "conv" && V.career.conv[V.career.conv.length - 1].id === cv.id && res.booth > 0 && V.cash === cash0 - fee + prizes + res.booth, JSON.stringify(res));
}
/* ---- PR 8: events, trends, rivals, social media, reckonings, the inspection, cover-ups, goals ---- */
const PR8 = {};
{ /* trend waves shape walk-in demand by year */
  const tm = SIM.trendMult;
  check("trends: fine line booms mid-2010s, watercolour spikes then fades, traditional stays evergreen",
    tm("fineline", 2017) > 1.3 && tm("fineline", 2005) === 1 && tm("watercolour", 2014) > 1.3 && tm("watercolour", 2020) < 0.8 &&
    [2000, 2005, 2010, 2015, 2020, 2025, 2030].every(y => tm("traditional", y) >= 1 && tm("traditional", y) <= 1.2),
    JSON.stringify({ fl17: tm("fineline", 2017), wc14: tm("watercolour", 2014), wc20: tm("watercolour", 2020) }));
  const share = (year, style) => { const r = SIM.rng(SEED).fork("trendshare:" + year); let n = 0;
    for (let i = 0; i < 800; i++) { const c = SIM.makeClient(r.fork("c" + i), { id: "x" + i, year, week: 20, stage: "chair" }); if (c.ask && c.ask.style === style) n++; } return n / 800; };
  PR8.share = { fl2005: share(2005, "fineline"), fl2017: share(2017, "fineline"), wc2014: share(2014, "watercolour"), wc2022: share(2022, "watercolour") };
  check("trends: walk-ins follow the waves (more fine line in 2017 than 2005, more watercolour in 2014 than 2022)",
    PR8.share.fl2017 > PR8.share.fl2005 * 1.5 && PR8.share.wc2014 > PR8.share.wc2022 * 1.5, JSON.stringify(PR8.share));
  const tl = LONG_EV.filter(l => l.k === "trend");
  check("trends: the Next log says when a wave starts, peaks and fades (every wave inside the 30 years)",
    SIM.TREND_WAVES.filter(w => w.rise >= 2001 && w.rise <= 2030).every(w => tl.some(l => l.wave === w.id && l.phase === "rise" && l.y === w.rise)), tl.length + " lines");
  const tn = SIM.trendNow({ year: 2017, week: 10 });
  check("trends: trendNow lists what's in demand", tn.top.length === 4 && tn.top.some(t => t.style === "fineline") && tn.waves.some(w => w.id === "fineline"), JSON.stringify(tn.top));
}
{ /* social media: only from 2016; posts change followers, followers book from far away */
  const far = LONG_EV.filter(l => l.social === "far");
  check("social: switched on in 2016, far-away bookings only from then", LONG.world.social.on && LONG.world.social.on.y === 2016 && far.length > 20 && far.every(l => l.y >= 2016), far.length + " far bookings, first " + (far[0] && far[0].y));
  const V = clone(LONG); SIM.unpackSave(V); SIM.worldEnsure(V);
  const p = V.pieces.slice().reverse().find(x => !x.by && x.heal === "crisp");
  const so = V.world.social, on = so.on; so.on = null; V.year = 2015;
  const before = SIM.postPiece(V, p.id);
  V.year = 2030; so.on = on; const f0 = so.followers, w0 = V.rep.walkins;
  const res = SIM.postPiece(V, p.id), again = SIM.postPiece(V, p.id);
  PR8.post = res;
  check("social: a post before 2016 does nothing; after it adds followers and reputation, once per piece",
    !before.ok && before.why === "year" && res.ok && res.gained > 0 && so.followers === f0 + res.gained && V.rep.walkins >= w0 && !again.ok && again.why === "posted", JSON.stringify({ before, res, again }));
  const T = SIM.followersTarget({ rep: { walkins: 50, collectors: 30, peers: 20 } }), T2 = SIM.followersTarget({ rep: { walkins: 100, collectors: 100, peers: 100 } });
  check("social: followers follow reputation (target grows with the rep sum)", T > 40 && T2 > T * 5, T + " / " + T2);
}
{ /* rivals appear, pull walk-ins, undercut */
  const ids = SIM.RIVALS.map(r => r.id), rv = LONG.career.rivals.filter(r => ids.indexOf(r.id) >= 0);
  check("rivals: named shops open in their windows", rv.length >= 3 && rv.every(r => { const d = SIM.RIVALS.find(x => x.id === r.id); return r.opened.y >= d.open[0] && r.opened.y <= d.open[1]; }),
    JSON.stringify(rv.map(r => [r.id, r.opened.y, r.status])));
  check("rivals: they act (poach, undercut or copy) and remember", LONG_EV.some(l => l.rival && /offered|prices|flash/.test(l.text)), LONG_EV.filter(l => l.rival).length + " rival lines");
  const V = clone(LONG); SIM.unpackSave(V); SIM.worldEnsure(V);
  const h = V.career.rivals.find(r => r.id === "heron"); h.status = "open"; h.str = 0.6; delete h.truce; delete h.last;
  const m1 = SIM.shopWalkins(V).mult; h.status = "gone"; const m0 = SIM.shopWalkins(V).mult; h.status = "open";
  const r0 = SIM.rateFor(V);
  V.world.pending.push({ id: "e900", kind: "undercut", rival: "heron", choices: SIM.EVENTS.undercut.choices, dflt: "hold", until: SIM.weekIndex(V.week, V.year) + 3 });
  const ch = SIM.eventChoose(V, "e900", "match"), r1 = SIM.rateFor(V);
  check("rivals: an open rival pulls walk-ins; matching an undercut lowers your rate", m1 < m0 && ch.ok && r1 < r0, JSON.stringify({ m0, m1, r0, r1, text: ch.text }));
}
{ /* reckonings: each fires exactly once */
  const beats = id => LONG_EV.filter(l => l.beat === id).length;
  check("reckonings: the first-year piece and Arkady's referral each fire once in 30 years", beats("first_year") === 1 && beats("mentor_ref") === 1 && LONG.world.fired.first_year && LONG.world.fired.mentor_ref,
    JSON.stringify(LONG.world.fired));
  const fy = LONG.world.fired.first_year;
  check("reckonings: the first-year client comes back in career years 12 to 18 with a year-one piece", fy && fy.y >= 2012 && fy.y <= 2018 && LONG.pieces.find(p => p.id === fy.piece).y <= 2001, JSON.stringify(fy));
  /* the reckoning sheet shows the old piece as it reads today: it must still read, faded. The run's own piece, and a worst
     case: an 8 mm fine-line sparkle (under its minimum size) done by an apprentice, soft heal, 13 years on */
  const fp = LONG.pieces.find(p => p.id === fy.piece), fc = SIM.findClient(LONG, fp.client) || {};
  const ra = SIM.age({ design: fp.design, out: fp.out, heal: fp.heal, ink: fp.ink, skinTone: fc.skinTone, sun: (fc.traits || {}).sun }, (fy.y - fp.y) + (fy.w - fp.w) / 52);
  const spk = SIM.age({ design: { placement: "forearm_r", sizeMm: 8, style: "fineline", elements: [{ id: "sparkle", x: 0.5, y: 0.5, scale: 1, rot: 0, lineWeight: 1, fill: 0.5, colour: null }] },
    out: { lineQuality: 0.7, depthQuality: 0.7, saturation: 0.7, trauma: 0.4 }, heal: "soft", skinTone: 0.14, sun: 0.3 }, 13);
  PR8.reckonReads = { piece: ra.readability, sparkle8mm13y: spk.readability };
  check("reckonings: the old piece still reads at that age (the run's piece, and a tiny 8 mm sparkle 13 years on)", ra.readability > 0.3 && spk.readability > 0 && spk.fade < 1,
    JSON.stringify({ piece: ra, sparkle: spk }));
  /* the pawn shop: an old machine on the shelf */
  const V = clone(LONG); SIM.unpackSave(V); SIM.worldEnsure(V); delete V.world.fired.pawn; V.world.pending = [];
  V.kit = Object.assign({ owned: {} }, V.kit); V.kit.owned.machines = ["coil_used", "rotary"]; V.kit.machine = "rotary";
  let n = 0; for (let i = 0; i < 3; i++) for (const l of SIM.advanceWeek(V)) if (l.text && /pawn shop/.test(l.text)) n++;
  const ev = V.world.pending.find(e => e.kind === "pawn"), cash0 = V.cash, res = ev ? SIM.eventChoose(V, ev.id, "sell") : {}, cash1 = V.cash;
  for (let i = 0; i < 6; i++) for (const l of SIM.advanceWeek(V)) if (l.text && /pawn shop/.test(l.text)) n++;
  check("reckonings: the pawn shop on the canal offers once; selling pays and takes the old machine", n === 1 && res.ok && cash1 > cash0 && V.kit.owned.machines.indexOf("coil_used") < 0,
    JSON.stringify({ n, res, owned: V.kit.owned.machines }));
  /* the client who bad-mouthed a patchy heal comes back once you're known */
  const B = clone(LONG); SIM.unpackSave(B); SIM.worldEnsure(B); delete B.world.fired.bad_mouth;
  const c = B.clients.find(x => !x.compact && (x.pieces || []).length && !B.queue.some(q => q.client === x.id));
  const pc = B.pieces.find(x => x.id === c.pieces[0]); pc.heal = "patchy";
  SIM.clientLog(c, { w: 10, y: pc.y, kind: "review", piece: pc.id, stars: 1, text: "patchy, would not go back" });
  let bm = 0, item = null;
  for (let i = 0; i < 5 && !item; i++) { for (const l of SIM.advanceWeek(B)) if (l.beat === "bad_mouth") bm++; item = B.queue.find(q => q.beat === "bad_mouth"); }
  const fix = item ? SIM.reckoningChoose(B, item.id, "fix") : {};
  for (let i = 0; i < 8; i++) for (const l of SIM.advanceWeek(B)) if (l.beat === "bad_mouth") bm++;
  check("reckonings: the bad-mouthing client returns once; fixing it books a free sitting", bm === 1 && item && item.ret.piece === pc.id && fix.ok && fix.item && fix.item.price === 0,
    JSON.stringify({ bm, item: item && item.id, fix: fix.text }));
}
{ /* the inspection: a fail can close the shop; sittings move, walk-ins stop, it reopens */
  let V = null, seed = 0, now = 0;
  for (; seed < 40 && !V; seed++) {
    const T = clone(LONG); SIM.unpackSave(T); SIM.worldEnsure(T); T.seed = SEED + seed * 7919;
    T.studio.build.steril = 0; T.studio.rep = 0; T.kit.ink = "budget"; T.career.closed = null;
    const mine = T.pieces.filter(p => !p.by).slice(-2); for (const p of mine) p.heal = "infected";
    now = SIM.weekIndex(T.week, T.year); T.career.insp = now + 1;
    const due = SIM.weekFrom(now + 2), c = T.clients.find(x => !x.compact);
    T.queue.push({ id: "q9999", kind: "session", client: c.id, w: due.w, y: due.y, hours: 2, sessionNo: 1, sessions: 1, price: 1000, deposit: 0, ask: c.ask });
    SIM.advanceWeek(T); if (T.career.closed) V = T;
  }
  const C = V && V.career.closed, q = V && V.queue.find(x => x.id === "q9999");
  const open0 = V && SIM.walkinsOpen(V);
  let reopened = false; if (V) for (let i = 0; i < 6 && !reopened; i++) for (const l of SIM.advanceWeek(V)) if (/reopens/.test(l.text)) reopened = true;
  check("inspection: a fail with infections on record closes the shop, stops walk-ins, moves sittings, then reopens",
    !!V && C.until > now && open0 === false && q && SIM.weekIndex(q.w, q.y) >= C.until && reopened && !V.career.closed && V.career.inspLast && V.career.inspLast.pass === false,
    JSON.stringify({ found: !!V, closed: C, q: q && [q.w, q.y], reopened }));
}
{ /* goals */
  const G = Object.keys(LONG.goals);
  check("goals: the 30-year run reaches the shop goals", ["first_heal", "first_custom", "first_return", "studio", "hire", "five_pieces", "survive_rival", "twenty_reads"].every(g => G.indexOf(g) >= 0), G.join(" "));
  const V = clone(LONG); SIM.unpackSave(V);
  check("goals: each is marked once (a second check reaches nothing new)", SIM.checkGoals(V, true).length === 0 && LONG_EV.filter(l => l.k === "goal").length === G.length, LONG_EV.filter(l => l.k === "goal").length + " goal lines");
  V.career.conv.push({ id: "mostograd_fair", name: "t", y: 2030, place: 2 });
  check("goals: a convention place marks the award goal", SIM.checkGoals(V, false).indexOf("first_award") >= 0);
}
{ /* cover-ups: how much of the old piece a design hides */
  const box = SIM.placementBox("forearm_l", "neutral"), f = { label: "blown-out swallow", tags: ["bird"], placement: "forearm_l", sizeMm: 50, y: 2005 };
  const old = SIM.foreignDesign(f);
  const big = { placement: "forearm_l", style: "blackwork", sizeMm: 110, pos: old.pos, elements: [{ id: "fill_solid", x: 0.5, y: 0.5, scale: 1, rot: 0, fill: 1, colour: "black" }] };
  const thin = { placement: "forearm_l", style: "fineline", sizeMm: 20, pos: { x: 0.5, y: 0.9 }, elements: [{ id: "swallow", x: 0.5, y: 0.5, scale: 1, rot: 0, fill: 0, colour: "black" }] };
  const a = SIM.coverScore(big, old, box), b = SIM.coverScore(thin, old, box), e = SIM.coverScore({ placement: "forearm_l", sizeMm: 50, elements: [] }, old, box);
  PR8.cover = { big: a.coverage, thin: b.coverage, empty: e.coverage };
  check("cover-ups: a big dark fill buries the old piece, a small fine-line piece beside it doesn't", a.coverage >= 0.85 && b.coverage < 0.3 && e.coverage === 0, JSON.stringify(PR8.cover));
  const ev = LONG_EV.filter(l => l.puzzle);
  check("cover-ups: cover-up jobs turn up as events with someone else's old piece", ev.length > 0, ev.length + " jobs");
}
{ /* conventions: pick the pieces */
  const V = clone(LONG); SIM.unpackSave(V); const cv = SIM.CONVENTIONS[0], fee = RUB(V.year, cv.fee + cv.travel), cand = SIM.convCandidates(V);
  V.career.invites.push({ id: "conv:t2", kind: "conv", conv: cv.id, fee });
  const res = SIM.enterInvite(V, "conv:t2", true, { fresh: null, healed: cand.healed[0] && cand.healed[0].id });
  check("conventions: you pick a fresh and a healed piece; each category is judged on its own", cand.healed.length > 0 && res.ok && !res.fresh && res.healed && res.healed.piece === cand.healed[0].id && res.booth > 0, JSON.stringify({ place: res.place, healed: res.healed }));
}
/* ---- 0.1.13.0: the reputation events REP_TRACKS names (flash days, Friday the 13th, Kontur, the Drawbridge Prize) ---- */
const REV = {};
{ const RE = SIM.REP_EVENTS, T = SIM.REP_TRACKS;
  check("rep events: each opens at its REP_TRACKS number, and every REP_TRACKS event is in the game",
    ["flash_day", "friday_13", "magazine", "award"].every(id => RE[id] && SIM.repEventAt(id) === T[RE[id].track].events[id]) &&
    T.collectors.events.waiting_list === 60 && T.peers.events.guest_spot === SIM.GUEST.peers && T.peers.events.convention === SIM.CONVENTIONS.find(c => c.id === "capital_expo").peers,
    JSON.stringify(["flash_day", "friday_13", "magazine", "award"].map(SIM.repEventAt)));
  /* Friday the 13th falls on real dates */
  let f13ok = true, f13n = 0;
  for (let y = 2000; y <= 2030; y++) { const L = SIM.friday13Weeks(y); f13n += L.length; if (L.length < 1 || L.length > 3) f13ok = false;
    for (const f of L) { const d = new Date(Date.UTC(y, f.month, 13)), doy = Math.round((d - Date.UTC(y, 0, 1)) / 864e5);
      if (d.getUTCDay() !== 5 || f.w !== Math.min(52, Math.floor(doy / 7) + 1)) f13ok = false; } }
  check("Friday the 13th: every year 2000-2030 has one to three, each on a real Friday 13 in the right calendar week", f13ok &&
    JSON.stringify(SIM.friday13Weeks(2009).map(f => f.w)) === "[7,11,46]" && JSON.stringify(SIM.friday13Weeks(2012).map(f => f.date)) === '["Friday 13 January","Friday 13 April","Friday 13 July"]', f13n + " in 31 years");
  const f13 = LONG_EV.filter(l => l.repEv === "friday_13");
  REV.f13 = f13.length;
  check("Friday the 13th: in the 30-year run the card comes only in weeks that hold one, once walk-ins reach 60", f13.length >= 15 &&
    f13.every(l => SIM.friday13Weeks(l.y).some(f => f.w === l.w) && l.y - 2000 >= 10), f13.length + " cards, first " + (f13[0] && f13[0].y));
  check("rep events: no flash day without your own flash, no magazine without a portfolio (the auto career has neither)",
    !LONG_EV.some(l => l.repEv === "flash_day" || l.repEv === "magazine"));
  const aw = LONG.world.repEv.award;
  REV.award = aw;
  check("rep events (0.1.13.1): the Drawbridge Prize opens at peers 75 (was 85), the magazine at collectors 65 (was 75)", T.peers.events.award === 75 && T.collectors.events.magazine === 65 && SIM.repEventAt("award") === 75 && SIM.repEventAt("magazine") === 65);
  check("the Drawbridge Prize: once a year only while peers are at 75 (the run reaches it in 2026), judged on healed pieces",
    aw.length === 4 && aw[0].y === 2026 && aw.every((a, i) => i === 0 || a.y > aw[i - 1].y) && aw.every(a => a.pieces.length === RE.award.pieces && a.place >= 0 && a.place <= 3 &&
    a.pieces.every(id => { const p = LONG.pieces.find(x => x.id === id); return p && !p.by && p.heal && p.heal !== "infected" && p.y <= a.y - 1; })) && aw[0].pieces.length === RE.award.pieces && aw[0].place >= 0 && aw[0].place <= 3 &&
    aw[0].pieces.every(id => { const p = LONG.pieces.find(x => x.id === id); return p && !p.by && p.heal && p.heal !== "infected" && p.y <= 2028; }), JSON.stringify(aw));
  /* a flash day, forced on a copy of year 30: walk-ins at 50 and five sheets of your own flash */
  const fresh = () => { const V = clone(LONG); SIM.unpackSave(V); SIM.worldEnsure(V); V.world.pending = []; V.rep.walkins = 50; V.rep.peers = 40; V.career.books = "open";
    V.flash = [0, 1, 2, 3, 4].map(i => ({ id: "mf" + i, name: SIM.FLASH[i].name, design: SIM.FLASH[i], w: 1, y: 2029 })); return V; };
  const V = fresh(), ch0 = RE.flash_day.chance; RE.flash_day.chance = 1;
  let card = null; for (let i = 0; i < 3 && !card; i++) { SIM.advanceWeek(V); card = V.world.pending.find(e => e.kind === "flash_day"); }
  const cash0 = V.cash, rep0 = { w: V.rep.walkins, p: V.rep.peers }, sit0 = V.world.repEv.flash_day.sittings;
  const res = card ? SIM.eventChoose(V, card.id, "run") : {};
  const n = V.world.repEv.flash_day.sittings - sit0;
  REV.flash = { n, cash: V.cash - cash0, walkins: +(V.rep.walkins - rep0.w).toFixed(2), peers: +(V.rep.peers - rep0.p).toFixed(2) };
  check("flash day: the card comes once walk-ins and your own flash are there; running it gives many quick sittings, money and walk-in and peer rep",
    card && res.ok && n >= 8 && V.cash > cash0 && V.rep.walkins > rep0.w && V.rep.peers > rep0.p && /off your wall/.test(res.text), JSON.stringify(REV.flash));
  let again = 0; for (let i = 0; i < 10; i++) { SIM.advanceWeek(V); if (V.world.pending.some(e => e.kind === "flash_day")) again++; }
  check("flash day: not offered again inside its cool-down", again === 0);
  RE.flash_day.chance = ch0;
  const D1 = fresh(), D2 = fresh(); RE.flash_day.chance = 1; SIM.advanceWeek(D1); SIM.advanceWeek(D2);
  const c1 = D1.world.pending.find(e => e.kind === "flash_day"), c2 = D2.world.pending.find(e => e.kind === "flash_day");
  if (c1 && c2) { SIM.eventChoose(D1, c1.id, "run"); SIM.eventChoose(D2, c2.id, "run"); } RE.flash_day.chance = ch0;
  check("flash day: the same save plays out the same way", c1 && c2 && JSON.stringify(D1) === JSON.stringify(D2));
  /* left alone, a flash day card does nothing */
  const L0 = fresh(); RE.flash_day.chance = 1; SIM.advanceWeek(L0); RE.flash_day.chance = ch0; const lc = L0.world.pending.find(e => e.kind === "flash_day"), lsit = L0.world.repEv.flash_day.n;
  for (let i = 0; i < 5; i++) SIM.advanceWeek(L0);
  check("flash day: a card left alone takes its default (no flash day)", lc && !L0.world.pending.some(e => e.id === lc.id) && L0.world.repEv.flash_day.n === lsit);
  /* Kontur: forced on a copy with collectors at 68 (over the 0.1.13.1 gate of 65) and a healed portfolio */
  const M = fresh(); M.rep.collectors = 68; let pf = 0; for (let i = M.pieces.length - 1; i >= 0 && pf < 6; i--) { const p = M.pieces[i]; if (!p.by && p.heal === "crisp" && M.year - p.y >= 2 && SIM.pieceReads(M, p) > 0.6) { p.portfolio = true; pf++; } }
  const mc0 = RE.magazine.chance; RE.magazine.chance = 1; let mcard = null; for (let i = 0; i < 2 && !mcard; i++) { SIM.advanceWeek(M); mcard = M.world.pending.find(e => e.kind === "magazine"); } RE.magazine.chance = mc0;
  const q0 = M.queue.length, mrep = M.rep.collectors, mres = mcard ? SIM.eventChoose(M, mcard.id, "yes") : {};
  REV.mag = { pf, collectors: +(M.rep.collectors - mrep).toFixed(2) };
  check("Kontur: features you with collectors at 65 and a healed portfolio; yes raises collectors and books a reader",
    mcard && mres.ok && /Kontur/.test(mcard.text) && M.rep.collectors > mrep && M.queue.some(q => q.from === "magazine") && M.world.repEv.magazine.length === 1, JSON.stringify(REV.mag));
  const M2 = fresh(); M2.rep.collectors = 80; RE.magazine.chance = 1; SIM.advanceWeek(M2); RE.magazine.chance = mc0;
  check("Kontur: no portfolio, no feature", !M2.world.pending.some(e => e.kind === "magazine"));
  /* the award's judging */
  const A = fresh(), ar = SIM.awardJudge(A, SIM.rng(SEED).fork("award-test")), cand = SIM.convCandidates(A).healed.slice(0, 3).map(p => p.id);
  check("the Drawbridge Prize: judges your three best healed pieces and records the result", JSON.stringify(ar.pieces) === JSON.stringify(cand) && A.world.repEv.award.length === LONG.world.repEv.award.length + 1 && ar.score > 0.3, JSON.stringify(ar));
  /* 0.1.13.1: the Drawbridge goal (first place only; first_award stays conventions) */
  const firstWin = aw.find(a => a.place === 1);
  check("Drawbridge goal: the 30-year run ticks it the year it first wins, not the convention goal by itself",
    firstWin && LONG.goals.drawbridge && LONG.goals.drawbridge.y === firstWin.y && SIM.GOALS.some(g => g.id === "drawbridge" && g.name === "Win the Drawbridge Prize"), JSON.stringify(LONG.goals.drawbridge));
  const G1 = fresh(); delete G1.goals.drawbridge; delete G1.goals.first_award; G1.career.conv = []; G1.world.repEv.award = [];
  const ap0 = RE.award.places.slice(); RE.award.places = [0, 0, 0];   // any score wins first place
  const ge = { id: "e9999", kind: "award", repEv: true, choices: RE.award.choices, dflt: RE.award.dflt, w: G1.week, y: G1.year, until: SIM.weekIndex(G1.week, G1.year) + 2, text: "t" };
  const none0 = SIM.checkGoals(G1, true); G1.world.pending.push(ge);
  const gr = SIM.eventChoose(G1, "e9999", "enter"), got = SIM.checkGoals(G1, false); RE.award.places = ap0;
  check("Drawbridge goal: first place ticks it on the next check (what evGoalsNow runs straight after the card); first_award stays conventions only",
    none0.indexOf("drawbridge") < 0 && gr.ok && G1.world.repEv.award[0].place === 1 && got.indexOf("drawbridge") >= 0 && got.indexOf("first_award") < 0 && !G1.goals.first_award, JSON.stringify({ none0, got }));
  const G2 = fresh(); G2.world.repEv.award = [{ y: 2029, place: 2, score: 0.6, pieces: [] }]; delete G2.goals.drawbridge;
  check("Drawbridge goal: second place doesn't tick it", SIM.checkGoals(G2, true).indexOf("drawbridge") < 0);
  const G3 = clone(LONG); SIM.unpackSave(G3); delete G3.goals.drawbridge; const G3l = SIM.goalList(G3).find(g => g.id === "drawbridge");
  check("Drawbridge goal: a save from before 0.1.13.1 lists it as not done, then ticks it if a win is already on record",
    G3l && G3l.done === null && SIM.checkGoals(G3, false).indexOf("drawbridge") >= 0 && G3.goals.drawbridge.y === G3.year);
  /* older saves hydrate */
  const O = clone(LONG); SIM.unpackSave(O); delete O.world.repEv; SIM.worldEnsure(O);
  const O2 = clone(LONG); SIM.unpackSave(O2); O2.world.repEv = { magazine: "x", flash_day: 3 }; SIM.worldEnsure(O2);
  check("rep events: a save from before 0.1.13.0 (or a damaged repEv) gets a clean history on worldEnsure",
    O.world.repEv && Array.isArray(O.world.repEv.award) && O.world.repEv.flash_day.n === 0 && Array.isArray(O2.world.repEv.magazine) && O2.world.repEv.flash_day.sittings === 0 && Array.isArray(O2.world.repEv.award));
}
check("PR 8: advanceWeek at year 30 stays under 50 ms (max)", max30 < 50, max30.toFixed(1) + " ms");
/* the client archive (CLIENT_CAP) and the packed save */
const ids30 = LONG.pieces.map(p => p.id);
check("archive: at most CLIENT_CAP full client records at year 30", LONG.clients.filter(c => !c.compact).length <= SIM.CLIENT_CAP + 20 && LONG.clients.some(c => c.compact), LONG.clients.filter(c => !c.compact).length + " full");
check("archive: pieces are never dropped (p1..pN, every one)", ids30.every((id, i) => id === "p" + (i + 1)));
check("archive: compacted clients came back during the run", LONG.clients.some(c => (c.history || []).some(h => h.kind === "note" && /back after a long while/.test(h.text))));
{ const X = clone(LONG), cc = X.clients.find(c => c.compact && (c.pieces || []).length), np = cc.pieces.length; SIM.expandClient(X, cc);
  check("archive: expandClient brings a compacted client back with their pieces", !cc.compact && cc.ask && cc.brief && cc.pieces.length === np && cc.history.length === 1); }
const PK = JSON.stringify(SIM.packSave(LONG)), UN = SIM.unpackSave(JSON.parse(PK));
check("packed save: every piece comes back (ids, names, placements, heals, artists)", UN.pieces.length === LONG.pieces.length && UN.pieces.every((p, i) => { const q = LONG.pieces[i]; return p.id === q.id && p.client === q.client && p.name === q.name && p.design.placement === q.design.placement && p.heal === q.heal && p.by === q.by && Math.abs(p.out.lineQuality - q.out.lineQuality) < 0.001; }));
check("packed save: compacted clients come back with their pieces lists", UN.clients.length === LONG.clients.length && UN.clients.every((c, i) => c.id === LONG.clients[i].id && (c.pieces || []).length === (LONG.clients[i].pieces || []).length));
check("packed save: packing the unpacked save gives the same JSON", JSON.stringify(SIM.packSave(UN)) === PK);
const SZ = AUTO_SIZES[30];
check("save size: ink-save JSON at year 30 under 2 MB, the backup code under 1.2 MB", SZ.json < 2e6 && SZ.code < 1.2e6, JSON.stringify(SZ));
check("save size: packing at year 30 takes under 150 ms", SZ.packMs < 150, SZ.packMs.toFixed(1) + " ms");
{ const sig = SIM.signatureOf(LONG), sum = SIM.legacySummary(LONG);
  check("signature: thirty years of work settle into a signature", sig.ready && sig.style && sig.strength > 0, JSON.stringify(sig));
  check("Legacy: the summary has the oldest piece that reads, the busiest client, decades and apprentices", sum.oldest && sum.most && sum.most.n > 1 && Object.keys(sum.decades).length >= 3 && sum.pieces + sum.shopPieces === LONG.pieces.length && Array.isArray(sum.apprentices), JSON.stringify({ oldest: sum.oldest, most: sum.most, dec: sum.decades }));
  check("Legacy: the 30-year auto career reached all four acts ", ["chair", "studio", "legacy"].every(k => LONG.career.reached[k])); }

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
  const retN = LONG.clients.filter(c => (c.history || []).some(h => h.kind === "consult" && h.src === "return")).length;
  console.log("\n30-year run: " + LONG.clients.length + " clients, " + LONG.pieces.length + " pieces, " + LONG.clients.filter(c => c.referredBy).length + " referred, " + retN + " came back, queue " + LONG.queue.length +
    ", cash " + LONG.cash.toLocaleString("en-CA") + " RUB, S as JSON " + Math.round(JSON.stringify(LONG).length / 1024) + " KB unpacked. whole run " + Math.round(runMs) + " ms");
  console.log("last advanceWeek log: " + lastLog.map(l => l.text).join(" | "));
  console.log("\nheals (300 pieces each): good outputs + good aftercare " + JSON.stringify(hGood) + "; rough + bad aftercare " + JSON.stringify(hRoughBad) +
    "; rough but low trauma " + JSON.stringify(hLowT) + "; good with 8 blowouts " + JSON.stringify(hBlow));
  const lg = LONG.pieces.reduce((a, p) => (a[p.heal || "none"] = (a[p.heal || "none"] || 0) + 1, a), {});
  console.log("30-year run heals: " + JSON.stringify(lg) + "; rep after 12 clean heals from 20/20/20: " + JSON.stringify(HR.rep));
}
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(LONG));   // DUMP=file: the year-30 state, for poking at
if (process.env.DUMPEV) fs.writeFileSync(process.env.DUMPEV, JSON.stringify(LONG_EV));
console.log("save size by year (ink-save JSON / INK1 backup code): " + Object.keys(AUTO_SIZES).map(y => y + ": " + Math.round(AUTO_SIZES[y].json / 1024) + " KB / " + Math.round(AUTO_SIZES[y].code / 1024) + " KB (" + AUTO_SIZES[y].pieces + " pieces, " + AUTO_SIZES[y].staffPieces + " by staff, " + AUTO_SIZES[y].clients + " clients)").join("; "));
console.log("PR 8: walk-in style share " + JSON.stringify(PR8.share) + "; post " + JSON.stringify({ reach: PR8.post.reach, gained: PR8.post.gained, q: PR8.post.q }) + "; cover " + JSON.stringify(PR8.cover) + "; reckoning reads " + JSON.stringify(PR8.reckonReads) +
  "; 30 years: " + LONG.world.social.followers + " followers, " + LONG.world.social.booked + " far bookings, rivals " + LONG.career.rivals.map(r => r.id + ":" + r.status).join(" ") + ", fired " + Object.keys(LONG.world.fired).join(" ") + ", goals " + Object.keys(LONG.goals).length + "/" + SIM.GOALS.length);
console.log("0.1.13.0 rep events: " + REV.f13 + " Friday 13th cards in 30 years; flash day " + JSON.stringify(REV.flash) + "; Kontur " + JSON.stringify(REV.mag) + "; Drawbridge Prize " + JSON.stringify(REV.award));
console.log("30-year run: " + LONG.clients.length + " clients; advanceWeek at year 30: " + avg30.toFixed(2) + " ms avg, " + max30.toFixed(1) + " ms max");

/* ---- timing ---- */
const N = 10000, cl = Object.values(TEST_CLIENTS);
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) SIM.scoreDesign(TEST_DESIGNS[i % TEST_DESIGNS.length].design, cl[i % cl.length], SKILLS);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(passes + " passed, " + fails + " failed. scoreDesign: " + (ms / N).toFixed(4) + " ms per call (" + N + " calls, " + Math.round(ms) + " ms)");
process.exit(fails ? 1 : 0);
