/* ===================== app/studio.js: the Studio tab =====================
   The shop at its current stage: the 3D view on top (INK_VIS; a placeholder room until PR 6), then the shop's cards.
   PR 4 adds the kit build panel here; PR 7 the studio build-out, staff and money. */
function renderStudio(){
  $("studioBody").innerHTML=`<div class="card"><h2>The shop</h2>
<p class="hint" style="margin-top:0">You start as an apprentice in your mentor's shop on the canal in Mostograd: sweeping floors, cleaning tubes, drawing flash after closing.</p>
<dl class="kv"><dt>Stage</dt><dd>Apprentice</dd><dt>Date</dt><dd>Week ${S.week}, ${S.year}</dd><dt>Cash</dt><dd>${fmtMoney(S.cash)}</dd></dl></div>`;}
