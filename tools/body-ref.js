/* tools/body-ref.js: export the coded PR 6 mannequin as a Blender reference (PR 10).
     node tools/body-ref.js [URL]      (default http://localhost:8000/ ; serve the repo root first: python3 -m http.server)
   Needs Playwright (npm i -g playwright, the same as tools/make-icons.js). Writes into models/base-mesh/reference/:
     ink-body-neutral.obj, ink-body-masc.obj, ink-body-femme.obj   the seated mannequin in each body shape, in metres, +Y up,
                                                                    facing +Z, one object per part, with the game's UVs
     ink-uv-atlas.png                                               the UV atlas (1024 px): every island, labelled, with
                                                                    the triangle wireframe; use it as the UV editor's backdrop
     ink-body.json                                                  islands (rects in the unit square, mm extents), triangle
                                                                    counts, the placement zones with their sizes in mm
   The three OBJ files share one topology and identical UVs (that is how the game builds them), so in Blender they import
   as the basis and two shape keys (Object > Shape Keys > Join as Shapes). docs/BLENDER.md says what to do with them. */
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "models", "base-mesh", "reference");
const URL = process.argv[2] || "http://localhost:8000/";
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 900 } })).newPage();
  await p.goto(URL);
  await p.waitForFunction(() => typeof INK_VIS !== "undefined" && INK_VIS.ready() && INK_VIS._state.body, null, { timeout: 30000 });
  const data = await p.evaluate(() => {
    const V = INK_VIS._state, parts = V.body.parts.concat([V.body.head]), out = { parts: [] };
    for (const m of parts) {
      const g = m.geometry, uv = Array.from(g.attributes.uv.array), idx = g.index ? Array.from(g.index.array) : null;
      const A = m.userData.arr, pos = {};
      for (const sh of ["neutral", "masc", "femme"]) pos[sh] = A ? Array.from(A[sh].p) : Array.from(g.attributes.position.array);
      out.parts.push({ id: m.userData.part, islands: m.userData.islands, pos, uv, idx });
    }
    const I = V.islands(); out.islands = {};
    for (const k in I) out.islands[k] = { rect: I[k].rect, mm: { x: [I[k].xmin, I[k].xmax], y: [I[k].ymin, I[k].ymax] }, pxPerMmAt2048: I[k].ppm * 2048 };
    out.zones = {};
    for (const id in INK_SIM.PLACEMENTS) { const z = V.zone(id), P = INK_SIM.PLACEMENTS[id]; if (z) out.zones[id] = { name: P.name, island: z.isl, wrapMm: P.wrapMm, lengthMm: P.lengthMm, startMm: +z.y0.toFixed(1) }; }
    out.stats = INK_VIS.stats();
    return out;
  });
  /* the OBJ files */
  for (const sh of ["neutral", "masc", "femme"]) {
    const L = ["# Ink mannequin (" + sh + "), exported from the coded PR 6 body by tools/body-ref.js. Metres, +Y up, facing +Z.", "# Original work: (c) Kelbo / Longlight Interactive."];
    let vb = 1;
    for (const q of data.parts) {
      L.push("o " + q.id);
      const n = q.pos[sh].length / 3;
      for (let i = 0; i < n; i++) L.push("v " + q.pos[sh].slice(i * 3, i * 3 + 3).map(x => x.toFixed(5)).join(" "));
      for (let i = 0; i < n; i++) L.push("vt " + q.uv[i * 2].toFixed(5) + " " + q.uv[i * 2 + 1].toFixed(5));
      const idx = q.idx || [...Array(n).keys()];
      for (let i = 0; i < idx.length; i += 3) { const f = [idx[i], idx[i + 1], idx[i + 2]].map(k => (k + vb) + "/" + (k + vb)); L.push("f " + f.join(" ")); }
      vb += n;
    }
    fs.writeFileSync(path.join(OUT, "ink-body-" + sh + ".obj"), L.join("\n") + "\n");
  }
  /* the atlas picture, drawn in the page's canvas */
  const png = await p.evaluate(d => {
    const S = 1024, c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d");
    g.fillStyle = "#f4efe4"; g.fillRect(0, 0, S, S);
    const col = { arm: "#d9e4f2", leg: "#e5f0d8", back: "#f2e1d3", chest: "#f2d8de", side: "#efe7c8", neck: "#e3dcf0", hand: "#d6eeea", foot: "#ece0ef", blank: "#dddddd" };
    for (const k in d.islands) { const r = d.islands[k].rect; g.fillStyle = col[k.replace(/_[lr]$/, "")] || "#eee"; g.fillRect(r.x * S, r.y * S, r.w * S, r.h * S); }
    g.strokeStyle = "rgba(40,40,60,.35)"; g.lineWidth = 1;
    for (const q of d.parts) { const idx = q.idx || [...Array(q.uv.length / 2).keys()];
      for (let i = 0; i < idx.length; i += 3) { g.beginPath(); for (let k = 0; k < 3; k++) { const j = idx[i + k]; const x = q.uv[j * 2] * S, y = (1 - q.uv[j * 2 + 1]) * S; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.stroke(); } }
    g.fillStyle = "#1b1b24"; g.font = "600 17px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const k in d.islands) { const r = d.islands[k].rect; g.strokeStyle = "#1b1b24"; g.lineWidth = 2; g.strokeRect(r.x * S, r.y * S, r.w * S, r.h * S);
      g.fillText(k, (r.x + r.w / 2) * S, (r.y + r.h / 2) * S); }
    return c.toDataURL("image/png");
  }, data);
  fs.writeFileSync(path.join(OUT, "ink-uv-atlas.png"), Buffer.from(png.split(",")[1], "base64"));
  const tris = {}; let total = 0;
  for (const q of data.parts) { const t = (q.idx ? q.idx.length : q.pos.neutral.length / 3) / 3; tris[q.id] = t; total += t; }
  fs.writeFileSync(path.join(OUT, "ink-body.json"), JSON.stringify({ note: "Generated by tools/body-ref.js from the coded PR 6 mannequin. UV rects are in the unit square, y down from the top (v = 1 - y).", trianglesTotal: total, triangles: tris, islands: data.islands, zones: data.zones }, null, 1) + "\n");
  console.log("wrote", fs.readdirSync(OUT).map(f => f + " " + Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + " KB").join(", "));
  console.log("triangles", total);
  await b.close();
})();
