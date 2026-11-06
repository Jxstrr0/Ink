/* tools/sim-fixtures.js: test clients and designs for tools/sim-test.js (node only, never shipped).
   TEST_CLIENTS: five clients that pull the scoring in different directions (light/dark skin, outdoor worker, low pain
   tolerance, an office job that needs cover, a blackwork collector). Shapes follow docs/SIM-CONTRACT.md.
   TEST_DESIGNS: { id, label, client (who it was drawn for), vs (a contrasting client), design } using element ids from
   src/sim/elements.js. Element x/y are the centre in the design box (0..1), scale is the element's longest side as a
   share of sizeMm, rot is clockwise degrees. design.pos (optional) puts the piece's centre in the placement box. */
"use strict";

const TEST_CLIENTS = {
  anya: { id: "anya", name: "Anya Sorokina", pronouns: "she/her", age: 27, bodyShape: "femme", skinTone: 0.1, job: "bank clerk",
    traits: { pain: 0.25, sun: 0.2, aftercare: 0.8, budget: 0.5, loyalty: 0.6, talkative: 0.4, trusting: 0.5 },
    wants: { styles: { fineline: 1, lettering: 0.8, watercolour: 0.3 }, tags: ["script", "floral", "memorial"], sizeMm: [10, 90], colour: 0.1 },
    mustHaves: [], dealbreakers: [{ kind: "tag", v: "skull" }] },
  dmitri: { id: "dmitri", name: "Dmitri Okafor", pronouns: "he/him", age: 41, bodyShape: "masc", skinTone: 0.85, job: "dock crane operator",
    traits: { pain: 0.8, sun: 0.85, aftercare: 0.4, budget: 0.6, loyalty: 0.7, talkative: 0.7, trusting: 0.6 },
    wants: { styles: { traditional: 1, japanese: 0.7, neotrad: 0.4 }, tags: ["nautical", "animal", "flower"], sizeMm: [60, 260], colour: 0.6 },
    mustHaves: [], dealbreakers: [] },
  lev: { id: "lev", name: "Lev Arkhipov", pronouns: "he/him", age: 34, bodyShape: "neutral", skinTone: 0.45, job: "sound engineer",
    traits: { pain: 0.9, sun: 0.3, aftercare: 0.9, budget: 0.8, loyalty: 0.9, talkative: 0.3, trusting: 0.7 },
    wants: { styles: { blackwork: 1, geometric: 0.8, japanese: 0.4 }, tags: ["geometric", "pattern"], sizeMm: [100, 600], colour: 0 },
    mustHaves: [], dealbreakers: [{ kind: "style", v: "watercolour" }] },
  zhenya: { id: "zhenya", name: "Zhenya Mbeki", pronouns: "they/them", age: 23, bodyShape: "neutral", skinTone: 0.7, job: "school teacher",
    traits: { pain: 0.5, sun: 0.4, aftercare: 0.6, budget: 0.3, loyalty: 0.5, talkative: 0.8, trusting: 0.4 },
    wants: { styles: { watercolour: 1, neotrad: 0.6, fineline: 0.4 }, tags: ["floral", "nature", "bird"], sizeMm: [40, 150], colour: 0.9 },
    mustHaves: [{ kind: "tag", v: "floral" }], dealbreakers: [] },
  oksana: { id: "oksana", name: "Oksana Belova", pronouns: "she/her", age: 52, bodyShape: "femme", skinTone: 0.3, job: "market gardener",
    traits: { pain: 0.6, sun: 0.9, aftercare: 0.5, budget: 0.4, loyalty: 0.8, talkative: 0.9, trusting: 0.8 },
    wants: { styles: { watercolour: 0.8, fineline: 0.6, traditional: 0.3 }, tags: ["floral", "bird", "nature"], sizeMm: [30, 120], colour: 0.8 },
    mustHaves: [], dealbreakers: [] }
};

/* element ids used below (see src/sim/elements.js) */
const E = {
  rose: "rose_trad", leaf: "oak_leaf", daisy: "daisy", olive: "olive_branch", splash: "fill_splash", script: "script_family",
  fern: "fern", wolf: "wolf_head", butterfly: "butterfly_line", dagger: "dagger", swallow: "swallow", koi: "koi", wave: "big_wave",
  blossom: "cherry_blossom", mandala: "mandala", ring: "mandala_ring", band: "band_triangles", sun: "sun", star: "nautical_star",
  feather: "feather", peony: "peony", bird: "hummingbird", moth: "moth"
};
const el = (id, x, y, scale, o) => Object.assign({ id, x, y, scale, rot: 0, lineWeight: 7, fill: 0, colour: null }, o || {});

const TEST_DESIGNS = [
  { id: "rose_trad", label: "traditional rose, forearm 85mm", client: "dmitri", vs: "anya",
    design: { placement: "forearm_r", sizeMm: 85, style: "traditional", elements: [
      el(E.rose, 0.5, 0.42, 0.72, { lineWeight: 14, fill: 0.6, colour: "red" }),
      el(E.leaf, 0.27, 0.8, 0.32, { rot: -35, lineWeight: 11, fill: 0.5, colour: "green" }),
      el(E.leaf, 0.73, 0.8, 0.32, { rot: 35, lineWeight: 11, fill: 0.5, colour: "green" })] } },
  { id: "rose_water", label: "watercolour daisy, forearm 85mm", client: "oksana", vs: "dmitri",
    design: { placement: "forearm_r", sizeMm: 85, style: "watercolour", elements: [
      el(E.daisy, 0.5, 0.42, 0.72, { lineWeight: 1, fill: 0.5, colour: "pink" }),
      el(E.splash, 0.5, 0.55, 0.9, { lineWeight: 1, fill: 0.4, colour: "skyblue" }),
      el(E.olive, 0.27, 0.8, 0.32, { rot: -35, lineWeight: 1, fill: 0.4, colour: "teal" })] } },
  { id: "script9", label: "script 9mm, inner wrist", client: "anya", vs: "dmitri",
    design: { placement: "forearm_l", sizeMm: 9, style: "lettering", pos: { x: 0.5, y: 0.88 }, elements: [
      el(E.script, 0.5, 0.5, 1, { lineWeight: 3 })] } },
  { id: "script40", label: "script 40mm, inner wrist", client: "anya", vs: "dmitri",
    design: { placement: "forearm_l", sizeMm: 40, style: "lettering", pos: { x: 0.5, y: 0.85 }, elements: [
      el(E.script, 0.5, 0.5, 1, { lineWeight: 3 })] } },
  { id: "water_hand", label: "watercolour feather, hand", client: "oksana", vs: "lev",
    design: { placement: "hand_r", sizeMm: 65, style: "watercolour", elements: [
      el(E.feather, 0.5, 0.5, 0.95, { rot: -10, lineWeight: 1, fill: 0.4, colour: "skyblue" }),
      el(E.splash, 0.45, 0.55, 0.8, { lineWeight: 1, fill: 0.35, colour: "pink" })] } },
  { id: "ribs_with", label: "fine-line flowers, ribs, with the flow", client: "anya", vs: "zhenya",
    design: { placement: "ribs_l", sizeMm: 200, style: "fineline", elements: [
      el(E.fern, 0.45, 0.25, 0.45, { rot: -8, lineWeight: 1 }),
      el(E.daisy, 0.5, 0.55, 0.3, { rot: -15, lineWeight: 1, fill: 0.15 }),
      el(E.fern, 0.58, 0.82, 0.4, { rot: -25, lineWeight: 1 })] } },
  { id: "ribs_against", label: "same flowers, ribs, across the flow", client: "anya", vs: "zhenya",
    design: { placement: "ribs_l", sizeMm: 200, style: "fineline", elements: [
      el(E.fern, 0.2, 0.45, 0.45, { rot: 80, lineWeight: 1 }),
      el(E.daisy, 0.5, 0.5, 0.3, { rot: 75, lineWeight: 1, fill: 0.15 }),
      el(E.fern, 0.8, 0.55, 0.4, { rot: 70, lineWeight: 1 })] } },
  { id: "mixed", label: "traditional wolf + fine-line butterfly", client: "dmitri", vs: "anya",
    design: { placement: "forearm_r", sizeMm: 110, style: "traditional", elements: [
      el(E.wolf, 0.45, 0.38, 0.62, { lineWeight: 14, fill: 0.7 }),
      el(E.butterfly, 0.55, 0.82, 0.32, { lineWeight: 1, fill: 0.1, colour: "grey" })] } },
  { id: "yellow_sun", label: "pale yellow sun, forearm 60mm", client: "zhenya", vs: "anya",
    design: { placement: "forearm_r", sizeMm: 60, style: "traditional", elements: [
      el(E.sun, 0.5, 0.5, 0.95, { lineWeight: 7, fill: 0.6, colour: "yellow" }),
      el(E.star, 0.5, 0.5, 0.3, { lineWeight: 7, fill: 0.5, colour: "orange" })] } },
  { id: "elbow", label: "dagger crossing the elbow", client: "dmitri", vs: "lev",
    design: { placement: "forearm_l", sizeMm: 130, style: "traditional", pos: { x: 0.5, y: 0.22 }, elements: [
      el(E.dagger, 0.5, 0.5, 1, { lineWeight: 11, fill: 0.5 }),
      el(E.rose, 0.5, 0.45, 0.35, { lineWeight: 11, fill: 0.6, colour: "red" })] } },
  { id: "koi", label: "japanese koi, upper arm 220mm", client: "dmitri", vs: "lev",
    design: { placement: "upperarm_r", sizeMm: 220, style: "japanese", elements: [
      el(E.koi, 0.5, 0.45, 0.7, { rot: 10, lineWeight: 9, fill: 0.7, colour: "orange" }),
      el(E.wave, 0.5, 0.85, 0.6, { lineWeight: 9, fill: 0.5, colour: "blue" }),
      el(E.blossom, 0.3, 0.12, 0.2, { lineWeight: 7, fill: 0.6, colour: "pink" }),
      el(E.blossom, 0.72, 0.18, 0.18, { lineWeight: 7, fill: 0.6, colour: "pink" })] } },
  { id: "mandala", label: "geometric mandala, upper back 230mm", client: "lev", vs: "zhenya",
    design: { placement: "upperback", sizeMm: 230, style: "geometric", elements: [
      el(E.mandala, 0.5, 0.5, 0.75, { lineWeight: 5, fill: 0.4 }),
      el(E.ring, 0.5, 0.5, 1, { lineWeight: 3, fill: 0.3 })] } },
  { id: "band", label: "blackwork band, calf", client: "lev", vs: "anya",
    design: { placement: "calf_r", sizeMm: 150, style: "blackwork", elements: [
      el(E.band, 0.5, 0.5, 1, { lineWeight: 14, fill: 0.9 })] } },
  { id: "tiny_hand", label: "fine-line swallow 14mm, hand", client: "anya", vs: "dmitri",
    design: { placement: "hand_l", sizeMm: 14, style: "fineline", elements: [
      el(E.swallow, 0.5, 0.5, 1, { lineWeight: 1 })] } },
  { id: "crowded", label: "eight elements in 55mm", client: "zhenya", vs: "oksana",
    design: { placement: "forearm_r", sizeMm: 55, style: "neotrad", elements: [
      el(E.peony, 0.35, 0.35, 0.5, { lineWeight: 7, fill: 0.6, colour: "purple" }), el(E.bird, 0.65, 0.35, 0.45, { lineWeight: 7, fill: 0.5, colour: "teal" }),
      el(E.leaf, 0.3, 0.7, 0.35, { lineWeight: 7, fill: 0.5, colour: "green" }), el(E.leaf, 0.7, 0.7, 0.35, { lineWeight: 7, fill: 0.5, colour: "green" }),
      el(E.star, 0.5, 0.15, 0.25, { lineWeight: 7, fill: 0.5, colour: "orange" }), el(E.moth, 0.5, 0.55, 0.4, { lineWeight: 7, fill: 0.5 }),
      el(E.blossom, 0.2, 0.5, 0.25, { lineWeight: 7, fill: 0.5, colour: "pink" }), el(E.feather, 0.8, 0.55, 0.4, { lineWeight: 7, fill: 0.5, colour: "white" })] } },
  { id: "neck_bird", label: "neotrad hummingbird, side of neck", client: "anya", vs: "dmitri",
    design: { placement: "neck_r", sizeMm: 70, style: "neotrad", elements: [
      el(E.bird, 0.5, 0.45, 0.8, { rot: -10, lineWeight: 7, fill: 0.5, colour: "teal" }),
      el(E.blossom, 0.35, 0.8, 0.3, { lineWeight: 7, fill: 0.5, colour: "pink" })] } },
  { id: "lopsided", label: "big rose hard left, one small star far right", client: "dmitri", vs: "oksana",
    design: { placement: "thigh_r", sizeMm: 160, style: "traditional", elements: [
      el(E.rose, 0.3, 0.55, 0.55, { lineWeight: 14, fill: 0.8, colour: "red" }),
      el(E.star, 0.95, 0.1, 0.1, { lineWeight: 9, fill: 0.3, colour: "yellow" })] } },
  { id: "wide_koi", label: "koi 150mm across a forearm", client: "dmitri", vs: "zhenya",
    design: { placement: "forearm_r", sizeMm: 150, style: "japanese", elements: [
      el(E.koi, 0.5, 0.5, 1, { rot: 90, lineWeight: 9, fill: 0.7, colour: "orange" })] } }
];

module.exports = { TEST_CLIENTS, TEST_DESIGNS, E };
