/* ===================== app/clients.js: the Clients tab (PR 3) =====================
   Two views on a segmented control:
     This week  who is at the door (walk-ins, who leave at the end of the week), booked consults (returns and referrals),
                the sittings due in the chair this week and the ones coming up. Each sitting needs a design: "Design it"
                opens the board for that booking (S.board.client / S.board.item) and the board's "Save to booking" bar
                writes it onto the queue item.
     Clients    everyone who has come through the door, newest first, with filters and a search; tap one for their card:
                what you know, their pieces as they look today (re-rendered from the design and the aging model), and
                their history.
     Work       the body of work (PR 5, app/gallery.js gvRenderWork): every piece as it looks today, with filters.
   The consult replaces the tab while it runs: the chat transcript, 3 to 5 options a turn, then the quote. It is a pure
   state machine in sim/clients.js; this file only draws it. Each choice's dice are forked from the save's seed, the
   client, the week and the choice, so leaving and coming back replays the same answers. Nothing is written until the
   consult ends (consultCommit).
   clSession(item) starts a due sitting: PR 4's sessionStartBooked(item) when it exists; until then a quick, automatic
   sitting worked out from your skills (clQuickSession). */
const CL={view:"week",consult:null,done:null,filter:"all",q:"",show:40};
const clNow=()=>INK_SIM.weekIndex(S.week,S.year);
const clDue=q=>INK_SIM.weekIndex(q.w,q.y)<=clNow();
const clByWeek=(a,b)=>INK_SIM.weekIndex(a.w,a.y)-INK_SIM.weekIndex(b.w,b.y);
function clWho(q){return q.newClient||INK_SIM.findClient(S,q.client);}
function clReal(id){return id&&/^c\d/.test(id)&&typeof INK_SIM.findClient==="function"?INK_SIM.findClient(S,id):null;}
function clAge(c){return INK_SIM.clientAge?INK_SIM.clientAge(c,S.year):c.age;}
function clAskLine(a){a=a||{};const P=INK_SIM.PLACEMENTS[a.placement],st=INK_SIM.STYLES[a.style];
  return[st&&st.name,P&&P.name,a.sizeMm?`about ${Math.round(a.sizeMm)} mm`:""].filter(Boolean).join(" · ");}
function clWant(w){if(!w)return"";if(w.kind==="style"){const s=INK_SIM.STYLES[w.v];return s?s.name:w.v;}return w.kind==="colour"?w.v+" ink":w.v;}
function clWhat(c,known){known=known||c.known||{};const out=[];
  const must=(known.mustHaves||[]).map(clWant),deal=(known.dealbreakers||[]).map(clWant);
  if(must.length)out.push(`<span class="clChip must">Must have: ${esc(must.join(", "))}</span>`);
  if(deal.length)out.push(`<span class="clChip deal">Avoid: ${esc(deal.join(", "))}</span>`);
  const t=c.traits||{},band=v=>v<0.34?"low":v<0.67?"medium":"high";
  if(known.pain)out.push(`<span class="clChip">Pain tolerance ${band(t.pain)}</span>`);
  if(known.sun)out.push(`<span class="clChip">Sun ${band(t.sun)}</span>`);
  if(known.budget)out.push(`<span class="clChip">Budget ${band(t.budget)}</span>`);
  if(known.cover)out.push(`<span class="clChip">${(c.cover||0)>0.5?"Needs to cover it for work":"Can show it at work"}</span>`);
  if(known.aftercare)out.push(`<span class="clChip">Aftercare ${band(t.aftercare)}</span>`);
  return out.join("");}
/* loyalty as a bar with notches, so it reads without colour */
function clLoyal(v){v=clamp(v||0,0,1);return`<span class="clLoy" role="img" aria-label="Loyalty ${Math.round(v*100)} out of 100"><i style="width:${Math.round(v*100)}%"></i></span>`;}
function clSrc(q){if(q.kind==="walkin")return"Walk-in";
  if(q.beat==="first_year")return"One of your first";if(q.beat==="bad_mouth")return"The bad review";if(q.from==="mentor")return"Sent by Arkady";   // PR 8
  if(q.from==="convention")return"Met at a convention";if(q.src==="social")return"Found you online";if(q.puzzle)return"Cover-up job";if(q.src==="referral"){const f=clReal(q.from);return f?`Sent by ${f.first}`:"Referral";}
  if(q.ret)return"Coming back: "+(CL_RET[q.ret.rule]||"more work");return"Booked consult";}
const CL_RET={touchup:"touch-up",addon:"add-on",sleeve:"sleeve",cover_own:"cover your old work",cover_other:"cover-up"};
function clAskOf(q){return q.ask||(clWho(q)||{}).ask||{};}

function renderClients(){
  const host=$("clientsBody");
  if(typeof INK_SIM.consultStart!=="function"){host.innerHTML=`<div class="card"><p class="hint">The client model isn't in this build.</p></div>`;return;}
  if(CL.consult)return clRenderConsult();
  const n=S.clients.length;
  host.innerHTML=`<div class="cl">${segHtml("clSeg",[["week","This week"],["list",`Clients${n?` · ${n}`:""}`],["work","Work"]],CL.view)}<div id="clView"></div></div>`;
  $("clSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b||b.dataset.v===CL.view)return;CL.view=b.dataset.v;INK_SOUND.tick();renderClients();});
  if(CL.view==="list")clRenderList();else if(CL.view==="work"&&typeof gvRenderWork==="function")gvRenderWork($("clView"));else clRenderWeek();}

/* ---- This week ---- */
function clCard(q){
  const c=clWho(q);if(!c)return"";
  const a=clAskOf(q);
  if(q.kind==="session"){
    const label=q.design&&q.design.elements&&q.design.elements.length?INK_SIM.pieceLabel(q.design):(a.tags||[]).slice(0,3).join(", ")||"a piece";
    const ready=!!(q.design&&q.design.elements&&q.design.elements.length);
    return`<article class="clQ ses"><header><span class="clK">In the chair</span><h3>${esc(c.name)}</h3><span class="clMeta">${clAge(c)} · ${esc(c.pronouns)}</span></header>
<p class="clAsk">${esc(clAskLine(a))}</p>
<p class="clMeta">Sitting ${q.sessionNo||1} of ${q.sessions||1} · ${+(q.hours||0).toFixed(1)} h · ${q.fix?"free fix after an infection":`${fmtMoney(q.price||0)} (${fmtMoney(q.deposit||0)} paid up front)`}${q.moved?` · moved ${q.moved}×`:""}</p>
<p class="clDz ${ready?"ok":"todo"}"><span aria-hidden="true">${ready?"●":"○"}</span> ${ready?`Design ready: ${esc(label)}`:"Needs a design"}</p>
<div class="row"><button class="btn sm${ready?"":" pri"}" data-dz="${q.id}">${ready?"Edit design":"Design it"}</button><button class="btn sm${ready?" pri":""}" data-ses="${q.id}"${ready?"":" disabled"}>${typeof sessionStartBooked==="function"?"Start session":"Quick session"}</button></div></article>`;}
  const exp=q.expires!=null?INK_SIM.weekFrom(q.expires):null;
  return`<article class="clQ ${q.kind}"><header><span class="clK">${esc(clSrc(q))}</span><h3>${esc(c.name)}</h3><span class="clMeta">${clAge(c)} · ${esc(c.pronouns)} · ${esc(c.job||"")}</span></header>
<blockquote>${esc(q.brief||c.brief||"")}</blockquote>
<p class="clMeta">${q.kind==="walkin"?"Leaves at the end of the week if nobody talks to them.":exp?`Will wait until week ${exp.w}, ${exp.y}.`:""}</p>
<div class="row"><button class="btn sm pri" data-con="${q.id}">Consult</button></div></article>`;}
function clRenderWeek(){
  const due=S.queue.filter(clDue),door=due.filter(q=>q.kind==="walkin"),cons=due.filter(q=>q.kind==="consult"),chair=due.filter(q=>q.kind==="session").sort(clByWeek);
  const later=S.queue.filter(q=>q.kind==="session"&&!clDue(q)).sort(clByWeek);
  const used=chair.reduce((h,q)=>h+(q.hours||0),0),cap=INK_SIM.weekHours(S),wait=INK_SIM.waitWeeks(S);
  const sec=(t,items)=>items.length?`<h2 class="clH">${t} <span class="dzTag">${items.length}</span></h2><div class="clQs">${items.map(clCard).join("")}</div>`:"";
  let h=`<div class="card clSum"><dl class="kv"><dt>Week</dt><dd>${S.week}, ${S.year}</dd><dt>Chair this week</dt><dd>${+used.toFixed(1)} of ${cap} h booked</dd><dt>Waiting list</dt><dd>${wait<0.5?"none":`about ${Math.ceil(wait)} week${Math.ceil(wait)===1?"":"s"}`}</dd></dl></div>`;
  h+=sec("At the door",door)+sec("Booked consults",cons)+sec("In the chair",chair);
  if(!door.length&&!cons.length&&!chair.length)h+=`<div class="card empty"><svg viewBox="0 0 24 24"><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M2 21h20"/><circle cx="15" cy="12" r="1"/></svg><p><b>Nobody at the door this week.</b></p><p>Practise, draw flash, then press Next on the Career tab.</p><div class="row" style="justify-content:center"><button class="btn pri" id="clGoNext">Go to Next</button></div></div>`;
  if(later.length)h+=`<h2 class="clH">Coming up</h2><div class="card clLater">${later.slice(0,8).map(q=>{const c=clWho(q);return`<div class="clRow"><b>Week ${q.w}, ${q.y}</b><span>${esc(c?c.name:"?")}</span><span class="clMeta">sitting ${q.sessionNo||1} of ${q.sessions||1} · ${+(q.hours||0).toFixed(1)} h${q.design?"":" · needs a design"}</span>${q.design?"":`<button class="btn sm" data-dz="${q.id}">Design it</button>`}</div>`;}).join("")}${later.length>8?`<p class="hint">And ${later.length-8} more.</p>`:""}</div>`;
  $("clView").innerHTML=h;
  const v=$("clView");
  v.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
    if(b.id==="clGoNext")return showTab("career");
    if(b.dataset.con)clStartConsult(b.dataset.con);else if(b.dataset.dz)clDesignFor(b.dataset.dz);else if(b.dataset.ses)clSession(b.dataset.ses);});}

/* ---- the consult ---- */
function clStartConsult(id){
  const q=S.queue.find(x=>x.id===id);if(!q)return;const c=clWho(q);if(!c)return;
  if(q.beat&&!q.beatDone&&typeof evReckonOpen==="function"&&INK_SIM.RECKONINGS&&INK_SIM.RECKONINGS[q.beat]&&INK_SIM.RECKONINGS[q.beat].choices&&evReckonOpen(q))return;   // PR 8
  CL.consult=INK_SIM.consultStart(c,S,{item:q});CL.done=null;INK_SOUND.tick();renderClients();$("panel").scrollTop=0;}
function clRenderConsult(){
  const c=CL.consult,cl=c.client,opts=INK_SIM.consultOptions(c);
  const bub=t=>t.who==="note"?`<p class="clNote">${esc(t.text)}</p>`:`<div class="clB ${t.who}"><span class="clBw">${t.who==="client"?esc(cl.first):"You"}</span>${esc(t.text)}</div>`;
  const left=Math.max(0,c.max-c.step);
  let foot;
  if(c.stage==="done"){
    const o=c.outcome,it=CL.done&&CL.done.item;
    const line=o==="accepted"?`Booked. ${it?`First sitting week ${it.w}, ${it.y}. `:""}${c.quote&&c.quote.deposit?`${fmtMoney(c.quote.deposit)} deposit taken.`:""}`:o==="walked"?`${cl.first} walked out.`:`No booking this time.`;
    foot=`<div class="card clEnd ${o}"><p><b>${esc(line)}</b></p>${o==="accepted"?`<p class="hint">Design the piece before the sitting: the board scores it against what ${esc(cl.first)} wants, including anything you found out.</p>`:`<p class="hint">${esc(cl.first)} will remember how this went.</p>`}
<div class="row">${o==="accepted"&&it?`<button class="btn pri" id="clEndDz">Design it now</button>`:""}<button class="btn" id="clEndBack">Back to this week</button></div></div>`;}
  else foot=`<div class="clOpts" role="group" aria-label="What do you say?">${opts.map(o=>`<button class="btn clOpt k-${o.kind}" data-o="${esc(o.id)}">${esc(o.text)}</button>`).join("")}</div>`;
  const q=c.quote;
  $("clientsBody").innerHTML=`<div class="cl clCon">
<div class="card clConHd"><div class="clConT"><button class="btn sm" id="clConX" aria-label="Leave the consult">‹ Back</button><div><h2>${esc(cl.name)}</h2><p class="clMeta">${esc(cl.job||"")} · ID checked, 18+ · ${c.stage==="done"?"done":`${left} exchange${left===1?"":"s"} left`}</p></div></div>
<p class="clAsk">${esc(clAskLine(c.ask))}${(c.ask.tags||[]).length?` · ${esc(c.ask.tags.slice(0,4).join(", "))}`:""}</p>
<div class="clChips">${clWhat(cl,c.known)||`<span class="clMeta">Ask questions to find out what matters to them.</span>`}</div>
${q?`<p class="clQuote">Quote: <b>${fmtMoney(q.price)}</b> · ${fmtMoney(q.deposit)} deposit · ${+q.hours.toFixed(1)} h over ${q.sessions} sitting${q.sessions===1?"":"s"}</p>`:`<p class="clMeta">Rough size of the job: ${+c.est.hours.toFixed(1)} h${c.est.sessions>1?` over ${c.est.sessions} sittings`:""} · your rate ${fmtMoney(c.rate)} an hour${c.wait>0.5?` · ${Math.ceil(c.wait)} week wait`:""}</p>`}</div>
<div class="clChat" id="clChat" aria-live="polite">${c.transcript.map(bub).join("")}</div>
${foot}</div>`;
  $("clConX").addEventListener("click",()=>{if(c.stage!=="done"&&!confirm(`Leave the consult? ${cl.first} is still waiting; you can come back to it this week.`))return;CL.consult=null;CL.done=null;renderClients();});
  const ch=$("clChat");if(ch.lastElementChild&&c.step)ch.lastElementChild.scrollIntoView({block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches||S.settings.reduced?"auto":"smooth"});
  if(c.stage==="done"){
    $("clEndBack").addEventListener("click",()=>{CL.consult=null;CL.done=null;CL.view="week";renderClients();});
    const dz=$("clEndDz");if(dz)dz.addEventListener("click",()=>{const id=CL.done.item.id;CL.consult=null;CL.done=null;clDesignFor(id);});
    return;}
  $("clientsBody").querySelector(".clOpts").addEventListener("click",e=>{const b=e.target.closest("button[data-o]");if(b)clChoose(b.dataset.o);});}
function clChoose(id){
  const c=CL.consult;if(!c||c.stage==="done")return;
  const r=INK_SIM.rng(S.seed).fork(`consult:${c.clientId}:${S.year}:${S.week}:${c.step}:${id}`);
  CL.consult=INK_SIM.consultChoose(c,id,r);INK_SOUND.tick();
  if(CL.consult.stage==="done"){CL.done=INK_SIM.consultCommit(S,CL.consult);save();renderHeader();
    if(CL.consult.outcome==="accepted")toast(`${CL.consult.client.first} is booked`);}
  renderClients();}

/* ---- designing for a booking (the board's bar) ---- */
function clDesignFor(id){
  const q=S.queue.find(x=>x.id===id),c=q&&INK_SIM.findClient(S,q.client);if(!c)return;
  const a=clAskOf(q),old=typeof DZ!=="undefined"&&DZ.m&&DZ.m.els.length&&S.board.item!==id?JSON.stringify(DZ.m):null;
  Object.assign(S.board,{client:c.id,item:q.id,bodyShape:c.bodyShape||"neutral",skinTone:c.skinTone!=null?c.skinTone:0.3});
  S.board.design=q.design?JSON.parse(JSON.stringify(q.design)):{placement:INK_SIM.PLACEMENTS[a.placement]?a.placement:"forearm_l",style:a.style||"traditional",flash:null,sizeMm:0,pos:{x:.5,y:.5},elements:[]};
  if(typeof DZ!=="undefined"){DZ.m=null;DZ.undo.length=0;DZ.redo.length=0;DZ.base=null;DZ.prev=null;DZ.view="board";dzLoad();if(old)DZ.undo.push(old);}
  save();showTab("design");$("panel").scrollTop=0;toast(`Designing for ${c.first}${old?" (Undo brings back what was on the board)":""}`);}
/* called by renderDesign: the bar above the board when it's working on a real client */
function clBookingBar(){
  const b=S.board,c=clReal(b.client);if(!c)return"";
  const q=b.item&&S.queue.find(x=>x.id===b.item);
  if(b.item&&!q)b.item=null;
  const a=q?clAskOf(q):c.ask||{},what=clWhat(c);
  return`<div class="card clBk"><div class="clBkT"><span class="clK">Designing for</span><b>${esc(c.name)}</b>${q?`<span class="clMeta">sitting ${q.sessionNo||1} of ${q.sessions||1}, week ${q.w}, ${q.y}</span>`:""}</div>
<p class="clAsk">Asked for: ${esc(clAskLine(a))}${(a.tags||[]).length?` · ${esc(a.tags.slice(0,4).join(", "))}`:""}</p>${what?`<div class="clChips">${what}</div>`:""}
<div class="row">${q?`<button class="btn sm pri" id="clBkSave">Save to booking</button>`:""}<button class="btn sm" id="clBkOff">${q?"Stop":"Back to sample clients"}</button></div></div>`;}
function clBookingWire(){
  const s=$("clBkSave"),o=$("clBkOff");
  if(s)s.addEventListener("click",()=>{const q=S.queue.find(x=>x.id===S.board.item),c=clReal(S.board.client);if(!q||!c)return;
    const d=dzToDesign();if(!d.elements.length){toast("Put something on the board first");return;}
    q.design=d;dzStore();toast(`Saved to ${c.first}'s booking`);INK_SOUND.tick();});
  if(o)o.addEventListener("click",()=>{S.board.item=null;S.board.client=DZ_SAMPLE_CLIENTS[0].id;const s0=DZ_SAMPLE_CLIENTS[0];S.board.bodyShape=s0.bodyShape;S.board.skinTone=s0.skinTone;
    DZ.m=Object.assign(dzFromDesign(dzToDesign()),{fsig:DZ.m.fsig});save();renderDesign();});}

/* ---- sittings ---- */
function clSession(id){
  const q=S.queue.find(x=>x.id===id);if(!q)return;
  if(!(q.design&&q.design.elements&&q.design.elements.length)){toast("Design it first");return;}
  if(typeof sessionStartBooked==="function")return sessionStartBooked(q);
  clQuickSession(q);}
/* until PR 4's session: a sitting worked out from your skills, on dice forked from the item and the week */
const CL_QUICK={base:0.55,perSkill:0.035,sd:0.06,trauma:0.25,traumaPerSkill:0.015};
function clQuickSession(q){
  const sk=S.skills||{},r=INK_SIM.rng(S.seed).fork(`quick:${q.id}:${S.year}:${S.week}`),K=CL_QUICK;
  const roll=k=>clamp(K.base+K.perSkill*(sk[k]||0)+r.normal(0,K.sd),0.2,0.98);
  const out={lineQuality:roll("linework"),depthQuality:roll("linework"),saturation:roll("shading"),trauma:clamp(K.trauma-K.traumaPerSkill*(sk.linework||0)+r.normal(0,K.sd),0,1)};
  for(const k in out)out[k]=Math.round(out[k]*1000)/1000;
  const res=INK_SIM.finishSession(S,q.id,{design:q.design,out,heal:null});if(!res)return;
  if(S.board.item===q.id)S.board.item=res.next?res.next.id:null;
  save();renderHeader();renderClients();INK_SOUND.tick();
  toast(res.piece?`Finished: ${res.piece.name}. ${fmtMoney(res.paid)} paid.`:`Sitting ${q.sessionNo||1} of ${q.sessions||1} done, ${fmtMoney(res.paid)} paid. Next sitting week ${res.next.w}.`);}

/* ---- the client list and a client's card ---- */
const CL_FILTERS=[["all","All"],["regular","Regulars"],["booked","Booked"],["walked","Walked"]];
function clLastConsult(c){for(let i=(c.history||[]).length-1;i>=0;i--)if(c.history[i].kind==="consult")return c.history[i];return null;}
function clMatch(c,f,booked){
  if(f==="regular")return(c.pieces||[]).length>=2;
  if(f==="booked")return booked.has(c.id);
  if(f==="walked"){const l=clLastConsult(c);return!!l&&l.outcome!=="accepted";}
  return true;}
function clRenderList(){
  const booked=new Set(S.queue.filter(q=>q.client).map(q=>q.client)),qs=CL.q.trim().toLowerCase();
  const list=S.clients.filter(c=>clMatch(c,CL.filter,booked)&&(!qs||(c.name||"").toLowerCase().includes(qs)))
    .sort((a,b)=>INK_SIM.weekIndex((b.lastSeen||b.since||{}).w||1,(b.lastSeen||b.since||{}).y||2000)-INK_SIM.weekIndex((a.lastSeen||a.since||{}).w||1,(a.lastSeen||a.since||{}).y||2000));
  const rows=list.slice(0,CL.show).map(c=>{const ls=c.lastSeen||c.since||{},np=(c.pieces||[]).length;
    return`<button class="clLi" data-c="${esc(c.id)}"><span class="clLiN"><b>${esc(c.name)}</b><span class="clMeta">${clAge(c)} · ${esc(c.job||"")}</span></span><span class="clLiR"><span class="clMeta">${np} piece${np===1?"":"s"}${booked.has(c.id)?" · booked":""} · ${ls.y||""}</span>${clLoyal(c.loyalty)}</span></button>`;}).join("");
  $("clView").innerHTML=`<div class="card clFil"><div class="row">${segHtml("clF",CL_FILTERS,CL.filter)}</div>
<label class="clSearch"><span class="sr">Search by name</span><input id="clQ" type="search" placeholder="Search by name" value="${esc(CL.q)}" autocomplete="off"></label></div>
${S.clients.length?(list.length?`<div class="clLis">${rows}</div>${list.length>CL.show?`<div class="row" style="justify-content:center"><button class="btn" id="clMore">Show more (${list.length-CL.show})</button></div>`:""}`:`<div class="card empty"><p>Nobody matches.</p></div>`)
:`<div class="card empty"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/></svg><p><b>No clients yet.</b></p><p>Talk to whoever walks in. Everyone you consult is remembered here, even the ones who walk out.</p></div>`}`;
  $("clF").addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b)return;CL.filter=b.dataset.v;CL.show=40;clRenderList();});
  $("clQ").addEventListener("input",e=>{CL.q=e.target.value;CL.show=40;const pos=e.target.selectionStart;clRenderList();const i=$("clQ");i.focus();try{i.setSelectionRange(pos,pos);}catch(_){}});
  const m=$("clMore");if(m)m.addEventListener("click",()=>{CL.show+=40;clRenderList();});
  $("clView").querySelector(".clLis")?.addEventListener("click",e=>{const b=e.target.closest("[data-c]");if(b)clOpenClient(b.dataset.c);});}
/* a piece as it looks today: the design re-rendered, blurred and faded by the aging model for its age */
function clPieceToday(p,c){
  const yrs=Math.max(0,(S.year-p.y)+(S.week-p.w)/52);
  let a={blur:0,fade:0,spread:0,readability:1};
  try{a=INK_SIM.age({design:p.design,out:p.out,heal:p.heal,skinTone:c.skinTone,sun:(c.traits||{}).sun},yrs)||a;}catch(e){}
  const d=p.design||{};if(!(d.elements||[]).length)return{svg:`<svg viewBox="0 0 10 10"></svg>`,a,yrs};
  const m=dzFromDesign(d),pxPer=64/Math.max(1,(d.sizeMm||40)*1.16),fd=clamp(a.fade||0,0,1);
  return{svg:dzMini(m,"",`filter:blur(${dzR2(Math.max(0,(a.blur||0)*pxPer))}px) saturate(${dzR2(1-fd*0.9)});opacity:${dzR2(1-fd*0.7)}`,a.spread||0),a,yrs};}
const CL_HIST={consult:h=>`Consult: ${h.outcome==="accepted"?"booked":h.outcome==="walked"?"walked out":"no booking"}${h.talk==="won"?", talked out of a bad idea":h.talk==="lost"?", the talk went badly":""}${h.quote?` (${fmtMoney(h.quote.price)})`:""}`,
  piece:h=>`Finished ${h.name||"a piece"}`,session:h=>`Sitting ${h.n} of ${h.of}`,review:h=>`Review: ${"★".repeat(h.stars||0)}${"☆".repeat(5-(h.stars||0))} “${h.text||""}”`,
  referral:h=>{const r=clReal(h.client);return`Sent you ${r?r.first:"a friend"}`;},note:h=>h.text||"",heal:h=>`Healed: ${(INK_SIM.HEAL_GRADES[h.grade]||{}).name||h.grade||""}`};
function clOpenClient(id){
  const c=INK_SIM.findClient(S,id);if(!c)return;
  const pcs=(c.pieces||[]).map(pid=>S.pieces.find(p=>p.id===pid)).filter(Boolean);
  const ref=clReal(c.referredBy),since=c.since||{};
  const pieceHtml=pcs.length?`<div class="clPcs">${pcs.map(p=>{const t=clPieceToday(p,c),r=t.a.readability,cls=r<0.35?"bad":r<0.6?"meh":"ok";
    return`<figure class="clPc"${typeof gvOpen==="function"?` data-gp="${esc(p.id)}" role="button" tabindex="0"`:""}><div class="clPcA board">${t.svg}</div><figcaption><b>${esc(p.name)}</b><span class="clMeta">${p.y} · ${t.yrs<1?"fresh":Math.floor(t.yrs)+" yr"} · reads <b class="${cls}">${Math.round(r*100)}</b>${p.heal?` · healed ${esc((INK_SIM.HEAL_GRADES[p.heal]||{}).name||p.heal)}`:""}${p.portfolio?" · ★ portfolio":""}</span></figcaption></figure>`;}).join("")}</div>`:`<p class="hint">No pieces yet.</p>`;
  const hist=(c.history||[]).slice(-30).reverse().map(h=>{const f=CL_HIST[h.kind];return f?`<li><span class="clMeta">Wk ${h.w}, ${h.y}</span> ${esc(f(h))}</li>`:"";}).join("");
  openSheet(c.name,`<section><dl class="kv"><dt>Age</dt><dd>${clAge(c)}</dd><dt>Pronouns</dt><dd>${esc(c.pronouns)}</dd><dt>Job</dt><dd>${esc(c.job||"")}</dd>
<dt>First seen</dt><dd>Week ${since.w||"?"}, ${since.y||"?"}${ref?` · sent by ${esc(ref.name)}`:""}</dd><dt>Loyalty</dt><dd>${clLoyal(c.loyalty)}</dd></dl>
<div class="clChips" style="margin-top:10px">${clWhat(c)||`<span class="clMeta">You haven't found out much about them yet.</span>`}</div></section>
<section><h3>Their pieces, as they look today</h3>${pieceHtml}</section>
<section><h3>History</h3>${c.compact?`<p class="hint">It's been a long while. Older notes on ${esc(c.first||c.name)} are archived; they fill in again if they come back.</p>`:""}${hist?`<ul class="clHist">${hist}</ul>`:c.compact?"":`<p class="hint">Nothing yet.</p>`}</section>`);
  const pc=$("sheetBody").querySelector(".clPcs");
  if(pc&&typeof gvOpen==="function"){const go=e=>{const f=e.target.closest("[data-gp]");if(f&&(e.type==="click"||e.key==="Enter"||e.key===" ")){e.preventDefault();gvOpen(f.dataset.gp);}};pc.addEventListener("click",go);pc.addEventListener("keydown",go);}}
