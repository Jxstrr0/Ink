<script>
/* ===================== Ink: INK_SIM (the simulation) =====================
   INK_SIM holds design scoring, the aging model, client logic, the calendar and the economy. It never touches the DOM
   or three.js, and it runs in plain node (tools/sim-test.js cuts src/sim/*.js out and runs them). The sim files are one
   IIFE spread over src/sim/: this file opens it (SIM is the object every file adds to) and sim/market.js closes it.
   rng.js: the seeded random number generator. ALL randomness in the sim goes through INK_SIM.rng; no bare Math.random()
   anywhere in src/sim/ (PR 1 fills this in). */
const INK_SIM=(function(){"use strict";
const SIM={};
