/* ===================== app/career.js: the Career tab =====================
   The week clock's Next button (PR 3): INK_SIM.nextStop(S) runs advanceWeek until a booked client, a walk-in, a heal or
   an event is due, never more than WEEK.maxSkip (4) weeks, and returns one line plus the week log. If people are waiting
   this week (walk-ins at the door, booked consults, sittings due), the first tap only warns and the second skips them:
   walk-ins leave, consults wait or give up, sittings move to next week. The last few lines are kept in memory (CR.lines),
   not in the save. The acts, skills, goals and the Legacy screen come in PR 7. */
const STAGE_NAMES={apprentice:"Apprentice",chair:"Rented chair",studio:"Your studio",legacy:"Legacy"};
const STAGE_ACT={apprentice:1,chair:2,studio:3,legacy:4};
const CR={last:null,lines:[],arm:0,armT:0,LINES:8};
const CR_KIND={week:"",left:"Left",gaveup:"Gave up",heal:"Heal",year:"Year",walkin:"Walk-in",return:"Coming back",referral:"Referral",booked:"Chair",carried:"Moved",cost:"Costs",event:"Event",trend:"Trend",end:"The end"};
function crWaiting(){const now=INK_SIM.weekIndex(S.week,S.year);let w=0,c=0,s=0;
  for(const q of S.queue){if(INK_SIM.weekIndex(q.w,q.y)>now)continue;if(q.kind==="walkin")w++;else if(q.kind==="consult")c++;else if(q.kind==="session")s++;}
  return{w,c,s,n:w+c+s};}
function renderCareer(){
  const host=$("careerBody");
  if(typeof INK_SIM.nextStop!=="function"){host.innerHTML=`<div class="card"><p class="hint">The week clock isn't in this build.</p></div>`;return;}
  const st=(S.studio&&S.studio.stage)||"apprentice",over=INK_SIM.careerOver(S),wt=crWaiting();
  const parts=[wt.w&&`${wt.w} walk-in${wt.w>1?"s":""} at the door`,wt.c&&`${wt.c} consult${wt.c>1?"s":""} booked`,wt.s&&`${wt.s} sitting${wt.s>1?"s":""} due`].filter(Boolean);
  const last=CR.last,lg=last&&last.log?last.log.filter(l=>l.k!=="week"):[];
  host.innerHTML=`<div class="card crNext">
<div class="crWhen"><span class="clK">Act ${STAGE_ACT[st]||1} · ${esc(STAGE_NAMES[st]||st)}</span><b>Week ${S.week}, ${S.year}</b></div>
${over?`<p><b>Week 52, 2030. Thirty years at the needle.</b></p><p class="hint">The Legacy screen arrives in a later update. Your clients, pieces and save are all still here.</p>`
:`<p class="hint">${parts.length?`This week: ${esc(parts.join(", "))}.`:"Nothing waiting this week."} Next skips to the next booked client, walk-in or heal, at most 4 weeks.</p>
<button class="btn pri crBtn${CR.arm?" arm":""}" id="crNextB">${CR.arm?`Skip them? Tap again`:`Next <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg>`}</button>
${CR.arm?`<p class="crWarn">Walk-ins leave, sittings move to next week.</p>`:""}`}</div>
${last?`<div class="card crLast"><h2>${last.weeks?`${last.weeks} week${last.weeks>1?"s":""} later`:"This week"}</h2><p>${esc(last.line||"")}</p>
${lg.length?`<ul class="crLog">${lg.slice(0,14).map(l=>`<li class="k-${esc(l.k)}">${CR_KIND[l.k]?`<span class="crK">${CR_KIND[l.k]}</span>`:""}${esc(l.text||"")}</li>`).join("")}${lg.length>14?`<li class="hint">…and ${lg.length-14} more.</li>`:""}</ul>`:""}
${["client","walkin"].includes(last.why)?`<div class="row"><button class="btn" id="crSee">See who's here</button></div>`:""}</div>`:""}
${CR.lines.length>1?`<div class="card"><h3>Earlier</h3><ul class="crLines">${CR.lines.slice(1).map(l=>`<li>${esc(l)}</li>`).join("")}</ul></div>`:""}
<div class="card"><h2>Career</h2><p class="hint" style="margin-top:0">Thirty years, 2000 to 2030. Apprentice, then a rented chair, then your own studio, then a waiting list.</p>
<dl class="kv"><dt>Clients</dt><dd>${S.clients.length}</dd><dt>Pieces</dt><dd>${S.pieces.length}</dd><dt>Cash</dt><dd>${fmtMoney(S.cash)}</dd></dl></div>`;
  const b=$("crNextB");if(b)b.addEventListener("click",crNext);
  const see=$("crSee");if(see)see.addEventListener("click",()=>{CL.view="week";showTab("clients");});}
function crNext(){
  if(INK_SIM.careerOver(S))return;
  if(typeof seLive==="function"){const L=seLive();if(L&&L.kind==="booked"){toast("Finish the sitting in the chair first");showTab("session");return;}}
  if(crWaiting().n&&!CR.arm){CR.arm=1;clearTimeout(CR.armT);CR.armT=setTimeout(()=>{CR.arm=0;if(curTab==="career")renderCareer();},4000);INK_SOUND.tick();renderCareer();return;}
  CR.arm=0;clearTimeout(CR.armT);
  if(typeof CL!=="undefined"){CL.consult=null;CL.done=null;}
  const res=INK_SIM.nextStop(S);CR.last=res;
  if(res.line){CR.lines.unshift(res.line);if(CR.lines.length>CR.LINES)CR.lines.length=CR.LINES;}
  if(S.board.item&&!S.queue.some(q=>q.id===S.board.item))S.board.item=null;
  save();renderHeader();renderCareer();INK_SOUND.tick();}
