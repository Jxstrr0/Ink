/* ===================== app/career.js: the Career tab =====================
   The week clock's Next button, the acts (apprentice, chair, studio, legacy), skills, goals and the Legacy screen (PR 3,
   PR 7). */
function renderCareer(){
  $("careerBody").innerHTML=`<div class="card"><h2>Career</h2><p class="hint" style="margin-top:0">Thirty years, 2000 to 2030. Apprentice, then a rented chair, then your own studio, then a waiting list.</p>
<dl class="kv"><dt>Act</dt><dd>1 · Apprentice</dd><dt>Date</dt><dd>Week ${S.week}, ${S.year}</dd></dl></div>`;}
