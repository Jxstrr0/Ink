#!/usr/bin/env node
/* Ink: checks for the Back up / Restore save codes (src/app/savecode.js). Same shape as Prairie Engine Works' checker.
 *
 *   node check-savecode.js        run every check, print one line each, exit 1 if any fail
 *
 * It loads src/app/savecode.js on its own with a pretend localStorage, plus the real freshState / hydrate / snapshot cut
 * out of src/app/state.js, so it runs in plain node with no browser. It also makes sure index.html was rebuilt with the
 * current savecode.js. Keys: ink-save, ink-slot1 .. ink-slot3. Zero dependencies (node >= 16).
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const ROOT = __dirname, SRC = path.join(ROOT, "src", "app", "savecode.js"), STATE = path.join(ROOT, "src", "app", "state.js");

/* ---- a pretend browser: localStorage in a Map, plus the game bits savecode.js calls ---- */
function fakeStorage() {
  const m = new Map();
  return {
    quota: Infinity,   // like a real browser's storage limit: a setItem that would go over it throws
    used: () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0),
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { v = String(v); const was = m.has(k) ? k.length + m.get(k).length : 0;
      if (this.used() - was + k.length + v.length > this.quota) throw new Error("QuotaExceededError"); m.set(k, v); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    dump: () => Object.fromEntries([...m].sort())
  };
}
/* the real state functions: everything in state.js from "const SAVE_KEY" up to the theme section */
function stateCore() {
  const s = fs.readFileSync(STATE, "utf8"), a = s.indexOf("const SAVE_KEY"), b = s.indexOf("/* ---- theme and settings");
  if (a < 0 || b < 0) throw new Error("couldn't find the state section in src/app/state.js");
  return s.slice(a, b).replace(/^let S=/m, "S=");
}
/* the real INK_SIM (every src/sim/ file in manifest order, without the <script> tags), for the PR 7 packed-save checks */
function simCode() {
  const list = fs.readFileSync(path.join(ROOT, "src", "manifest.txt"), "utf8").split("\n").map(l => l.trim()).filter(l => l.startsWith("sim/"));
  return list.map(f => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("").replace(/<\/?script>/g, "");
}
function load(withSim) {
  const code = fs.readFileSync(SRC, "utf8");
  const ctx = { localStorage: fakeStorage(), TextEncoder, TextDecoder, Uint8Array, VERSION: "test", S: null, Date, JSON };
  vm.createContext(ctx);
  if (withSim) vm.runInContext(simCode(), ctx, { filename: "sim.js" });
  vm.runInContext(stateCore() + "\n" + code + "\nthis.__set=o=>{S=o;};this.__get=()=>S;", ctx, { filename: "savecode.js" });
  return ctx;
}
const KEYS = ["ink-save", "ink-slot1", "ink-slot2", "ink-slot3"];

/* ---- realistic saves ---- */
function game(over) {
  return Object.assign({
    v: 1, week: 27, year: 2004, cash: 4825, seed: 123456789, bkAt: 0,
    settings: { theme: "light", gfx: "lite", gfxAuto: true, sound: false, reduced: false },
    clients: [{ id: "c1", name: "Darya Volkova · Дарья ✿", pronouns: "she/her", age: 31, skin: 0.42, history: [{ w: 12, y: 2003, k: "consult" }] }],
    pieces: [{ id: "p1", client: "c1", placement: "forearm_l", sizeMm: 90, style: "traditional", elements: [{ id: "rose", x: .5, y: .5, scale: 1, rot: 0, lineWeight: 5, fill: 1, colour: "red" }], out: { lineQuality: .82, depthQuality: .74 }, w: 14, y: 2003 }],
    queue: [],
    board: { design: { placement: "forearm_l", sizeMm: 84.5, style: "traditional", pos: { x: .5, y: .42 }, flash: null, elements: [{ id: "rose_trad", x: .5, y: .4, scale: .7, rot: 0, lineWeight: 9, fill: .5, colour: "red" }, { id: "script_love", x: .5, y: .85, scale: .6, rot: 90, lineWeight: 5, fill: 0, colour: null }] }, bodyShape: "femme", skinTone: 0.62, client: "wk_roofer" },
    flash: [{ id: "mf1", name: "Rose and banner", w: 3, y: 2001, design: { placement: "forearm_l", sizeMm: 90, style: "traditional", pos: { x: .5, y: .5 }, elements: [{ id: "rose_trad", x: .5, y: .5, scale: 1, rot: 0, lineWeight: 9, fill: .5, colour: "red" }] } }]
  }, over || {});
}
const seed = st => {
  st.clear();
  st.setItem("ink-save", JSON.stringify(game()));
  st.setItem("ink-slot1", JSON.stringify(Object.assign(game({ year: 2001 }), { savedAt: 1760000000000 })));
  st.setItem("ink-slot3", JSON.stringify(Object.assign(game({ week: 3, cash: 90 }), { savedAt: 1760100000000 })));
};
const plain = o => JSON.parse(JSON.stringify(o));   // objects made inside the vm have their own Object/Array, so copy them out before comparing
const msg = (ctx, text) => { try { ctx.buRead(text); } catch (e) { return e.bu || "crash:" + e.message; } return "ok"; };
const live = (ctx, o) => ctx.__set(JSON.parse(JSON.stringify(o)));

/* ---- the checks ---- */
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check("index.html carries the current savecode.js (run `node build.js` if not)", () => {
  assert(fs.readFileSync(path.join(ROOT, "index.html"), "utf8").includes(fs.readFileSync(SRC, "utf8")));
});
check("round trip: everything comes back on a fresh browser", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const code = a.buCode(), before = a.localStorage.dump();
  assert(code.startsWith("INK1:") && /^INK1:[A-Za-z0-9_-]+$/.test(code), "only base64url characters after INK1:");
  const b = load();   // another phone: nothing saved yet
  const r = b.buRead(code);
  assert.strictEqual(r.kind, "full");
  assert.deepStrictEqual(plain(r.data.save), game());
  assert.strictEqual(r.data.slots.length, 3);
  assert.strictEqual(r.data.slots[1], null, "empty slot 2 stays empty");
  assert(b.buWrite(r.data));
  assert.deepStrictEqual(Object.keys(b.localStorage.dump()).sort(), KEYS.filter(k => k !== "ink-slot2").sort());
  for (const k of ["ink-slot1", "ink-slot3"]) assert.deepStrictEqual(JSON.parse(b.localStorage.getItem(k)), JSON.parse(before[k]), k);
  assert.deepStrictEqual(JSON.parse(b.localStorage.getItem("ink-save")), game());
});
check("code is much shorter than the save it holds", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const raw = JSON.stringify(a.buMake()).length, code = a.buCode().length;
  assert(code < raw * 0.9, `code ${code} vs JSON ${raw}`);
});
check("spaces, line breaks and text around the code are fine", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const code = a.buCode(), mid = code.length >> 1;
  const messy = "here's my save:\n  " + code.slice(0, mid) + "\n ​" + code.slice(mid, mid + 40) + "  " + code.slice(mid + 40) + '" thanks!';
  assert.strictEqual(a.buRead(messy).kind, "full");
});
check("a damaged code is rejected (one character changed)", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const code = a.buCode();
  for (const at of [6, code.length >> 1, code.length - 3]) {
    const c = code[at] === "A" ? "B" : "A";
    assert.strictEqual(msg(a, code.slice(0, at) + c + code.slice(at + 1)), "damaged", "changed at " + at);
  }
});
check("a cut-off code is rejected", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const code = a.buCode();
  for (const n of [1, 6, 7, 50, code.length >> 1, code.length - 6]) assert.strictEqual(msg(a, code.slice(0, code.length - n)), "damaged", "cut " + n);
  assert.strictEqual(msg(a, code.slice(0, 200) + code.slice(260)), "damaged", "chunk missing from the middle");
  assert.strictEqual(msg(a, "INK1:"), "damaged");
});
check("a code from another game is rejected", () => {
  const a = load();
  assert.strictEqual(msg(a, "PEW1:CYQwLiBcIAQBYA6s9ccc5z"), "other");
  assert.strictEqual(msg(a, "GG1:abcdef123456"), "other");
});
check("a code from a newer version gets its own message", () => {
  const a = load(); live(a, game());
  const body = a.buCode().slice(5);
  assert.strictEqual(msg(a, "INK2:" + body), "newer");
  assert.strictEqual(msg(a, "INK12:" + body), "newer");
});
check("empty and junk pastes get a friendly message, never a crash", () => {
  const a = load();
  assert.strictEqual(msg(a, ""), "empty");
  assert.strictEqual(msg(a, "   \n "), "empty");
  assert.strictEqual(msg(a, null), "empty");
  assert.strictEqual(msg(a, "hello there"), "notcode");
  assert.strictEqual(msg(a, "INK1:!!!!!!!!!!!!"), "damaged");
  assert.strictEqual(msg(a, "INK0:" + "A".repeat(20)), "notcode");
});
check("an empty save (brand-new player) round trips, and restoring it clears the slots", () => {
  const a = load(); a.__set(a.freshState());
  const fresh = plain(a.freshState());
  const code = a.buCode(), r = a.buRead(code).data;
  assert.deepStrictEqual(plain(r.slots), [null, null, null]);
  delete fresh.seed; const got = plain(r.save); delete got.seed;
  assert.deepStrictEqual(got, fresh);
  const b = load(); seed(b.localStorage);
  assert(b.buWrite(r));
  assert.deepStrictEqual(Object.keys(b.localStorage.dump()), ["ink-save"]);
});
const pack = (a, d) => { const body = a.buZip(new TextEncoder().encode(JSON.stringify(d))); return "INK1:" + body + a.buSum(body); };
check("a well-formed code with a broken save inside is refused and nothing is written", () => {
  const a = load(); seed(a.localStorage); const before = a.localStorage.dump();
  const bad = [
    { v: 1, save: game({ settings: "dark" }), slots: [] },                          // settings not an object
    { v: 1, save: game({ settings: { needle: "sideways" } }), slots: [] },         // 0.1.16.0: needle not offset or direct
    { v: 1, save: game(), slots: [null, null, null, null] },                         // too many slots
    { v: 1, save: game(), slots: ["slot"] },                                         // slot not an object
    { v: 1, save: game({ cash: "lots" }), slots: [] },                               // cash not a number
    { v: 1, save: game({ week: null }), slots: [] },                                 // week not a number
    { v: 1, save: game({ clients: { 0: 1 } }), slots: [] },                          // clients not a list
    { v: 1, save: game({ pieces: "none" }), slots: [] },
    { v: 1, save: game({ board: "forearm" }), slots: [] },                           // board not an object
    { v: 1, save: game({ board: { design: { elements: "rose" } } }), slots: [] },    // design elements not a list
    { v: 1, save: game({ board: { design: null, skinTone: "dark" } }), slots: [] },  // skin tone not a number
    { v: 1, save: game({ flash: {} }), slots: [] },                                  // flash not a list
    { v: 1, save: game({ flash: [{ id: "mf1", design: null }] }), slots: [] },       // a flash entry without a design
    { v: 1, save: game({ kit: [] }), slots: [] },                                    // kit not an object
    { v: 1, save: game({ kit: { needles: "3RL" } }), slots: [] },                    // needles not a list
    { v: 1, save: game({ kit: { needles: [3] } }), slots: [] },                      // a needle that isn't a name
    { v: 1, save: game({ kit: { voltage: "hot" } }), slots: [] },                    // voltage not a number
    { v: 1, save: game({ kit: { owned: { machines: "coil" } } }), slots: [] },       // owned machines not a list
    { v: 1, save: game({ session: "chair" }), slots: [] },                           // session not an object
    { v: 1, save: game({ session: { live: { next: 2, design: null } } }), slots: [] },   // a sitting without a design
    { v: 1, save: game({ session: { live: { next: "a", design: { elements: [] } } } }), slots: [] },   // a sitting with no position
    { v: 1, save: game({ session: { live: { next: 2, design: { elements: [] }, base: "start" } } }), slots: [] },   // 0.1.22.0: a restart copy that isn't a sitting
    { v: 1, save: game({ session: { live: { next: 2, design: { elements: [] }, base: { next: 0, design: null } } } }), slots: [] },   // a restart copy without a design
    { v: 1, save: game({ reveals: "p1" }), slots: [] },                             // reveals not a list
    { v: 1, save: game({ reveals: [1, 2] }), slots: [] },                            // reveals that aren't piece ids
    { v: 1, save: game({ rep: [10, 20, 30] }), slots: [] },                          // rep not an object
    { v: 1, save: game({ rep: { walkins: "lots" } }), slots: [] },                   // a track that isn't a number
    { v: 2, save: game(), slots: [] },
    { v: 1, save: [game()], slots: [] },
    [game()], "just a string", 42, null
  ];
  for (const d of bad) assert.strictEqual(msg(a, pack(a, d)), "bad", JSON.stringify(d).slice(0, 80));
  assert.strictEqual(msg(a, pack(a, { v: 1, save: game(), slots: [] })), "ok", "and the same thing done right passes");
  const kitOk = { machine: "coil", needles: ["3RL", "9RL"], ink: "standard", voltage: 7.5, stroke: 3, owned: { machines: ["coil_used", "coil"], needles: ["3RL", "9RL"], inks: ["budget", "standard"] } };
  const sessOk = { live: { next: 3, kind: "practice", design: { elements: [] }, m: { pain: 0 } }, next: null };
  assert.strictEqual(msg(a, pack(a, { v: 1, save: game({ kit: kitOk, session: sessOk }), slots: [] })), "ok", "a kit and a sitting in progress pass");
  assert.strictEqual(msg(a, pack(a, { v: 1, save: game({ kit: {}, session: null }), slots: [] })), "ok", "an older save's empty kit passes");
  const sessBase = { live: Object.assign({}, sessOk.live, { base: { next: 0, kind: "practice", design: { elements: [] }, m: { pain: 0 } } }), next: null };
  assert.strictEqual(msg(a, pack(a, { v: 1, save: game({ session: sessBase }), slots: [] })), "ok", "a sitting with its restart copy (0.1.22.0) passes");
  const healed = game({ reveals: ["p1"], rep: { walkins: 12.5, collectors: 3, peers: 40 }, pieces: [Object.assign({}, game().pieces[0], { heal: "crisp", healW: 16, healY: 2003, portfolio: true })] });
  assert.strictEqual(msg(a, pack(a, { v: 1, save: healed, slots: [] })), "ok", "a save with heals, reveals, rep and a portfolio piece passes");
  assert.deepStrictEqual(a.localStorage.dump(), before);
});
check("a write that fails half way (storage full) puts every key back the way it was", () => {
  const a = load(); seed(a.localStorage); a.localStorage.setItem("ink-slot2", JSON.stringify(game({ year: 2002 })));
  const before = a.localStorage.dump();
  const huge = game({ pieces: Array.from({ length: 400 }, (_, i) => ({ id: "p" + i, sizeMm: i })) });
  const r = { v: 1, save: game({ cash: 99 }), slots: [game(), null, huge] };   // slot 3 won't fit
  a.localStorage.quota = a.localStorage.used() + 2000;
  assert.strictEqual(a.buWrite(r), false);
  assert.deepStrictEqual(a.localStorage.dump(), before);
  a.localStorage.quota = Infinity;
  assert.strictEqual(a.buWrite(r), true);
  assert.deepStrictEqual(JSON.parse(a.localStorage.getItem("ink-slot3")), huge);
});
check("trial load never changes the running game", () => {
  const a = load(); const running = game({ week: 9 }); a.__set(running);
  a.buRead(a.buCode());
  assert.strictEqual(a.__get(), running);
});
check("hydrate fills in fields a save doesn't have yet", () => {
  const a = load();
  assert(a.hydrate({ week: 5, year: 2001, settings: { theme: "light" } }));
  const s = plain(a.__get());
  assert.strictEqual(s.week, 5); assert.strictEqual(s.settings.theme, "light"); assert.strictEqual(s.settings.gfxAuto, true); assert.strictEqual(s.cash, 3000);
  assert.strictEqual(s.board.design, null); assert.strictEqual(s.board.bodyShape, "neutral"); assert.deepStrictEqual(s.flash, []);
  assert(a.hydrate({ week: 6, board: { skinTone: 0.8 } }), "a board missing fields gets the defaults");
  const t = plain(a.__get()); assert.strictEqual(t.board.skinTone, 0.8); assert.strictEqual(t.board.bodyShape, "neutral"); assert.strictEqual(t.board.client, "wk_office");
  assert.strictEqual(t.kit.machine, "coil_used"); assert.deepStrictEqual(t.kit.needles, ["3RL", "7RL", "7M1"]); assert.strictEqual(t.session, null);
  assert.strictEqual(t.settings.handed, "right"); assert.strictEqual(t.settings.assist, false); assert.strictEqual(t.settings.flatStencil, false);
  assert.strictEqual(t.settings.tips, true); assert.deepStrictEqual(t.help, {}, "PR 9: tips on and none seen");
  assert.strictEqual(t.settings.needle, "offset", "0.1.16.0: an older save holds the machine offset");
  assert(a.hydrate({ week: 6, settings: { needle: "direct" } })); assert.strictEqual(plain(a.__get()).settings.needle, "direct", "direct mode is kept");
  assert(a.hydrate({ week: 6, settings: { needle: 3 } })); assert.strictEqual(plain(a.__get()).settings.needle, "offset", "an odd needle setting goes back to offset");
  assert(a.hydrate({ week: 6, help: [1], settings: { tips: false } })); const h = plain(a.__get());
  assert.deepStrictEqual(h.help, {}, "a help field that isn't an object is dropped"); assert.strictEqual(h.settings.tips, false);
  assert(a.hydrate({ week: 7, kit: {} }), "an older save's kit:{} becomes the starter kit");
  const u = plain(a.__get()); assert.strictEqual(u.kit.ink, "budget"); assert.strictEqual(u.kit.voltage, 7); assert.deepStrictEqual(u.kit.owned.machines, ["coil_used"]);
  assert(a.hydrate({ week: 8, kit: { machine: "rotary", owned: { machines: ["coil_used", "rotary"] } }, session: "x" }));
  const v = plain(a.__get()); assert.strictEqual(v.kit.machine, "rotary"); assert.deepStrictEqual(v.kit.owned.inks, ["budget"], "owned lists not in the save keep the starter ones"); assert.strictEqual(v.session, null);
});
check("PR 5: reveals, rep and healed pieces round trip, and hydrate tidies them", () => {
  const a = load();
  const g = game({ reveals: ["p1"], rep: { walkins: 12.5, collectors: 3, peers: 40 }, pieces: [Object.assign({}, game().pieces[0], { heal: "patchy", healW: 16, healY: 2003, portfolio: true, review: { stars: 3, text: "Fine." } })] });
  live(a, g); const r = a.buRead(a.buCode());
  assert.deepStrictEqual(plain(r.data.save), g);
  assert(a.hydrate({ week: 5 })); let s = plain(a.__get());
  assert.deepStrictEqual(s.reveals, [], "an older save gets an empty reveal list"); assert.deepStrictEqual(s.rep, { walkins: 0, collectors: 0, peers: 0 });
  assert(a.hydrate({ week: 5, reveals: ["p2", 7, null, "p3"], rep: { walkins: 250, collectors: -4 } })); s = plain(a.__get());
  assert.deepStrictEqual(s.reveals, ["p2", "p3"], "junk ids dropped"); assert.deepStrictEqual(s.rep, { walkins: 100, collectors: 0, peers: 0 }, "tracks clamped to 0..100, missing ones 0");
  assert(a.hydrate({ week: 5, reveals: "x", rep: "y" })); s = plain(a.__get());
  assert.deepStrictEqual(s.reveals, []); assert.deepStrictEqual(s.rep, { walkins: 0, collectors: 0, peers: 0 });
});
check("packing survives big, varied saves (LZW dictionary fills up)", () => {
  const a = load();
  let x = 12345; const rnd = () => (x = (x * 1103515245 + 12345) >>> 0) / 4294967296;
  const big = game({ pieces: Array.from({ length: 4000 }, (_, i) => ({ id: "p" + i + "_" + rnd().toString(36), sizeMm: rnd() * 200, rot: rnd() * 6.28, note: "é ü ✿ " + i })) });
  live(a, big);
  const code = a.buCode();
  assert.deepStrictEqual(plain(a.buRead(code).data.save), big);
  const bytes = new TextEncoder().encode("abababababababababab");
  assert.deepStrictEqual(Array.from(a.buUnzip(a.buZip(bytes))), Array.from(bytes), "KwKwK case");
  assert.deepStrictEqual(plain(a.buUnzip(a.buZip(new Uint8Array(0)))), []);
});
check("PR 7: a slot squeezed with buZip round trips; a damaged one is refused", () => {
  const a = load(); seed(a.localStorage); live(a, game());
  const slot = { z: a.buZip(new TextEncoder().encode(JSON.stringify(game({ year: 2011 })))), savedAt: 1760200000000, week: 27, year: 2011, stage: "studio", pieces: 1 };
  a.localStorage.setItem("ink-slot2", JSON.stringify(slot));
  const r = load().buRead(a.buCode());
  assert.deepStrictEqual(plain(r.data.slots[1]), slot);
  assert.deepStrictEqual(plain(a.buSlotData(r.data.slots[1])), game({ year: 2011 }));
  assert.deepStrictEqual(plain(a.buSlotData(r.data.slots[0])).year, 2001, "a plain slot still reads");
  const bad = { v: 1, at: 0, ver: "t", save: game(), slots: [null, Object.assign({}, slot, { z: slot.z.slice(0, -9) + "zzzzzzzzz" }), null] };
  const body = a.buZip(new TextEncoder().encode(JSON.stringify(bad)));
  assert.strictEqual(msg(a, "INK1:" + body + a.buSum(body)), "bad");
});
check("PR 7: the career and studio are checked", () => {
  const a = load();
  for (const sv of [game({ career: "act 1" }), game({ career: { invites: "none" } }), game({ career: { money: [] } }), game({ studio: "chair" }), game({ studio: { stage: 2 } }), game({ studio: { staff: {} } })]) {
    const body = a.buZip(new TextEncoder().encode(JSON.stringify({ v: 1, at: 0, ver: "t", save: sv, slots: [] })));
    assert.strictEqual(msg(a, "INK1:" + body + a.buSum(body)), "bad", JSON.stringify({ career: sv.career, studio: sv.studio }));
  }
  const ok = game({ career: { mentor: { goodwill: 0.5 }, invites: [], money: { cur: { in: {}, out: {} }, total: { in: 0, out: 0 } } }, studio: { stage: "chair", staff: [] } });
  live(a, ok); assert.deepStrictEqual(plain(a.buRead(a.buCode()).data.save), ok);
});
check("PR 7: with the sim, a packed career round trips through a code and hydrate", () => {
  const a = load(true); a.__set(a.freshState());
  const S = a.__get(); assert(S.career && S.career.mentor && !S.career.old, "a new career starts in Act 1");
  vm.runInContext(`(() => { const S0 = S; S0.year = 2006; S0.studio.stage = "chair";
    for (let i = 0; i < 120; i++) { const c = INK_SIM.makeClient(INK_SIM.rng(i + 1), { id: "c" + (i + 1), year: 2006 }); S0.clients.push(c);
      const p = INK_SIM.addPiece(S0, { client: c.id, design: INK_SIM.proxyDesign(c.ask), out: { lineQuality: 0.81, depthQuality: 0.77, saturation: 0.8, trauma: 0.31 } }); p.heal = "crisp"; }
    return 1; })()`, a);
  const before = plain(a.__get()), packed = JSON.parse(a.saveJson());
  assert(packed.pieces.filter(p => typeof p === "string").length >= 60, "older pieces are packed (0.1.20.0: one string each)");
  const r = load(true).buRead(a.buCode());
  const b = load(true); assert(b.hydrate(r.data.save));
  const after = plain(b.__get());
  assert.strictEqual(after.pieces.length, 120);
  assert(after.pieces.every((p, i) => !Array.isArray(p) && p.id === before.pieces[i].id && p.name === before.pieces[i].name && p.design.placement === before.pieces[i].design.placement && Math.abs(p.out.trauma - 0.31) < 1e-6), "every piece comes back as a record");
  assert.strictEqual(after.studio.stage, "chair"); assert(after.career && !after.career.old);
  assert(b.hydrate({ week: 5, year: 2004 })); assert.strictEqual(plain(b.__get()).career.old, true, "a save from before PR 7 counts the tutorial as done");
  /* 0.1.20.0: a code written by 0.1.19.0 (older pieces as tuples, not strings) still restores, piece for piece */
  const oldSave = JSON.parse(vm.runInContext("JSON.stringify(INK_SIM.packSave(S, { tuples: true }))", a));
  assert(oldSave.pieces.filter(Array.isArray).length >= 60 && !oldSave.pieces.some(p => typeof p === "string"), "the 0.1.19.0 form is tuples");
  const ob = a.buZip(new TextEncoder().encode(JSON.stringify({ v: 1, at: 0, ver: "0.1.19.0", save: oldSave, slots: [null, null, null] })));
  const r2 = load(true).buRead("INK1:" + ob + a.buSum(ob)), c = load(true); assert(r2.ok !== false && c.hydrate(r2.data.save));
  assert.deepStrictEqual(plain(c.__get()).pieces, after.pieces, "a 0.1.19.0 code restores the same pieces as a 0.1.20.0 one");
  assert(JSON.parse(c.saveJson()).pieces.filter(p => typeof p === "string").length >= 60, "and saves them again in the 0.1.20.0 form");
});
check("PR 8: the world, goals, rivals and a closed shop are checked", () => {
  const a = load();
  for (const sv of [game({ world: "events" }), game({ world: { pending: {} } }), game({ world: { pending: [{ kind: "undercut" }] } }), game({ world: { social: { followers: "lots" } } }),
    game({ world: { social: { posts: [["p1", 2, 3]] } } }), game({ world: { fired: [] } }), game({ goals: [] }), game({ career: { rivals: "none" } }), game({ career: { closed: { until: "soon" } } }),
    game({ world: { repEv: [] } }), game({ world: { repEv: { award: "first" } } }), game({ world: { repEv: { flash_day: { n: "many" } } } })]) {
    const body = a.buZip(new TextEncoder().encode(JSON.stringify({ v: 1, at: 0, ver: "t", save: sv, slots: [] })));
    assert.strictEqual(msg(a, "INK1:" + body + a.buSum(body)), "bad", JSON.stringify({ world: sv.world, goals: sv.goals, career: sv.career }));
  }
  const ok = game({ goals: { first_heal: { w: 9, y: 2000 } }, world: { fired: { pawn: { w: 3, y: 2012, machine: "coil_used" } }, plan: {}, pending: [{ id: "e1", kind: "copy", until: 600 }], nextEv: 2, mods: {},
    social: { on: { w: 1, y: 2016 }, followers: 812, posts: [[12, 830, 1400]], viral: null, booked: 3, bad: 0, gained: 42 },
    repEv: { flash_day: { last: 700, n: 2, sittings: 23 }, friday_13: { last: null, n: 0, sittings: 0 }, magazine: [{ w: 9, y: 2021, at: 1101, piece: "p40", yes: true }], award: [{ y: 2027, place: 2, score: 0.61, pieces: ["p40", "p12"] }] } },
    career: { mentor: { goodwill: 0.5 }, rivals: [{ id: "heron", status: "open", str: 0.4 }], closed: { until: 640, w: 10, y: 2012 } } });
  live(a, ok); assert.deepStrictEqual(plain(a.buRead(a.buCode()).data.save), ok);
});
check("PR 8: with the sim, a new career has a world; an old save gets one on hydrate", () => {
  const a = load(true); a.__set(a.freshState());
  const S = plain(a.__get()); assert(S.world && Array.isArray(S.world.pending) && S.world.social && S.world.social.followers === 0, "a new career starts with an empty world");
  assert.strictEqual(S.v != null, true);
  const b = load(true); assert(b.hydrate({ week: 5, year: 2004 }));
  const T = plain(b.__get()); assert(T.world && T.world.social && T.goals && typeof T.goals === "object", "a save from before PR 8 gets a world and goals");
  assert(S.world.repEv && Array.isArray(S.world.repEv.award) && S.world.repEv.flash_day.n === 0, "0.1.13.0: a new career has an empty REP_EVENTS history");
  const d = load(true); assert(d.hydrate({ week: 5, year: 2012, world: { fired: {}, pending: [], social: { followers: 9, posts: [] } } }));
  const D = plain(d.__get()); assert(D.world.repEv && Array.isArray(D.world.repEv.magazine) && D.world.repEv.friday_13.sittings === 0 && D.world.social.followers === 9, "a 0.1.12 world gets repEv on hydrate and keeps the rest");
  const r = load(true).buRead(a.buCode()); const c = load(true); assert(c.hydrate(r.data.save));
  assert.deepStrictEqual(plain(c.__get()).world, S.world, "the world round trips through a code");
});

let bad = 0;
for (const [name, fn] of checks) {
  try { fn(); console.log("ok   " + name); }
  catch (e) { bad++; console.log("FAIL " + name + "\n     " + String(e && e.message || e).split("\n").join("\n     ")); }
}
console.log(bad ? `\n${bad} of ${checks.length} checks failed` : `\nall ${checks.length} save code checks passed`);
process.exit(bad ? 1 : 0);
