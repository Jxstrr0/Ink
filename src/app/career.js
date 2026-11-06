/* ===================== app/career.js: the Career tab =====================
   The week clock's Next button (PR 3): INK_SIM.nextStop(S) runs advanceWeek until a booked client, a walk-in, a heal or
   an event is due, never more than WEEK.maxSkip (4) weeks, and returns one line plus the week log. If people are waiting
   this week (walk-ins at the door, booked consults, sittings due), the first tap only warns and the second skips them:
   walk-ins leave, consults wait or give up, sittings move to next week. The last few lines are kept in memory (CR.lines),
   not in the save. PR 5: healed pieces wait in S.reveals and show at the top, one at a time (app/gallery.js rvHtml), and
   the Career card shows the three reputation tracks (REP_TRACKS) with what each opens next.
   PR 7 (sim/career.js): the act card under Next (Act 1's one-line goal and Arkady's word, chores, a friend's free piece,
   renting a chair; Act 2's split and the lease; Act 3's shop summary; Act 4's waiting list, projects and apprentices),
   invites (conventions, guest spots, the TV offer, Arkady's nudge), last week's money, skills and your signature, and
   the Legacy button. A full-screen scene (the shop closing, the end of the thirty years) is app/legacy.js. Every stage
   change goes through caStage(), which tells the 3D shop (INK_VIS.setStudio, PR 6). */
const STAGE_NAMES={apprentice:"Apprentice",chair:"Rented chair",studio:"Your studio",legacy:"Legacy"};
const STAGE_ACT={apprentice:1,chair:2,studio:3,legacy:4};
const CR={last:null,lines:[],arm:0,armT:0,LINES:8,say:null};
const CR_KIND={week:"",left:"Left",gaveup:"Gave up",heal:"Heal",year:"Year",walkin:"Walk-in",return:"Coming back",referral:"Referral",booked:"Chair",carried:"Moved",cost:"Costs",event:"Event",trend:"Trend",end:"The end"};
/* the ledger's words (sim/career.js cashIn / cashOut kinds) */
const CR_MONEY={sitting:"Sittings",deposit:"Deposits",flash:"Flash sales",book:"Flash book",merch:"Product line",convention:"Conventions",tv:"TV",loan:"Arkady's loan",staff:"Your artists' cut",
  mentor:"Arkady's cut",chair:"The shop's split",supplies:"Supplies",rent:"Rent and upkeep",marketing:"Marketing",apprentice:"Apprentice stipend",travel:"Travel",fine:"Fines",lease:"Lease deposit",build:"Build-out",kit:"Kit",line:"Product line",conv:"Your convention"};
function crWaiting(){const now=INK_SIM.weekIndex(S.week,S.year);let w=0,c=0,s=0;
  for(const q of S.queue){if(INK_SIM.weekIndex(q.w,q.y)>now)continue;if(q.kind==="walkin")w++;else if(q.kind==="consult")c++;else if(q.kind==="session")s++;}
  return{w,c,s,n:w+c+s};}
/* a stage change: the header, and the 3D shop's stage (PR 6) */
function caStage(){if(typeof INK_VIS!=="undefined"&&typeof INK_VIS.setStudio==="function")try{INK_VIS.setStudio((S.studio&&S.studio.stage)||"apprentice");}catch(e){}
  if(typeof ST!=="undefined")ST.key="";renderHeader();}
function crMine(){let n=0;for(const p of S.pieces)if(!p.by)n++;return n;}
function renderCareer(){
  const host=$("careerBody");
  if(typeof INK_SIM.nextStop!=="function"){host.innerHTML=`<div class="card"><p class="hint">The week clock isn't in this build.</p></div>`;return;}
  if(SIMOK("careerEnsure"))INK_SIM.careerEnsure(S);
  const st=(S.studio&&S.studio.stage)||"apprentice",over=INK_SIM.careerOver(S),wt=crWaiting(),C=S.career;
  const parts=[wt.w&&`${wt.w} walk-in${wt.w>1?"s":""} at the door`,wt.c&&`${wt.c} consult${wt.c>1?"s":""} booked`,wt.s&&`${wt.s} sitting${wt.s>1?"s":""} due`].filter(Boolean);
  const last=CR.last,lg=last&&last.log?last.log.filter(l=>l.k!=="week"):[];
  host.innerHTML=`${typeof lgSceneCard==="function"?lgSceneCard():""}${typeof rvHtml==="function"?rvHtml():""}${C&&st==="apprentice"?caActHtml(st):""}<div class="card crNext">
<div class="crWhen"><span class="clK">Act ${STAGE_ACT[st]||1} · ${esc(STAGE_NAMES[st]||st)}</span><b>Week ${S.week}, ${S.year}</b></div>
${over?`<p><b>Week 52, 2030. Thirty years at the needle.</b></p><p class="hint">Your clients, pieces and save are all still here.</p><div class="row"><button class="btn pri" id="crLegacy2">See your Legacy</button></div>`
:`<p class="hint">${parts.length?`This week: ${esc(parts.join(", "))}.`:"Nothing waiting this week."} Next skips to the next booked client, walk-in or heal, at most 4 weeks.</p>
<button class="btn pri crBtn${CR.arm?" arm":""}" id="crNextB">${CR.arm?`Skip them? Tap again`:`Next <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg>`}</button>
${CR.arm?`<p class="crWarn">Walk-ins leave, sittings move to next week.</p>`:""}`}</div>
${C&&st!=="apprentice"?caActHtml(st):""}${C?caInvitesHtml():""}
${last?`<div class="card crLast"><h2>${last.weeks?`${last.weeks} week${last.weeks>1?"s":""} later`:"This week"}</h2><p>${esc(last.line||"")}</p>
${lg.length?`<ul class="crLog">${lg.slice(0,14).map(l=>`<li class="k-${esc(l.k)}">${CR_KIND[l.k]?`<span class="crK">${CR_KIND[l.k]}</span>`:""}${esc(l.text||"")}</li>`).join("")}${lg.length>14?`<li class="hint">…and ${lg.length-14} more.</li>`:""}</ul>`:""}
${["client","walkin"].includes(last.why)?`<div class="row"><button class="btn" id="crSee">See who's here</button></div>`:""}</div>`:""}
${CR.lines.length>1?`<div class="card"><h3>Earlier</h3><ul class="crLines">${CR.lines.slice(1).map(l=>`<li>${esc(l)}</li>`).join("")}</ul></div>`:""}
${C?caMoneyHtml():""}${C?caSkillsHtml():""}
<div class="card"><h2>Career</h2><p class="hint" style="margin-top:0">Thirty years, 2000 to 2030. Apprentice, then a rented chair, then your own studio, then a waiting list.</p>
<dl class="kv"><dt>Clients</dt><dd>${S.clients.length}</dd><dt>Your pieces</dt><dd>${crMine()}</dd>${S.pieces.length>crMine()?`<dt>Shop pieces</dt><dd>${S.pieces.length-crMine()}</dd>`:""}<dt>Cash</dt><dd>${fmtMoney(S.cash)}</dd>${S.rate?`<dt>Your rate</dt><dd>${fmtMoney(S.rate)} an hour</dd>`:""}</dl>${crRep()}
${C&&(st==="studio"||st==="legacy"||over)?`<div class="row" style="margin-top:12px"><button class="btn" id="crLegacy">See your Legacy</button></div>`:""}</div>`;
  if(typeof rvWire==="function")rvWire(()=>{renderCareer();$("panel").scrollTop=0;});
  if(typeof lgSceneWire==="function")lgSceneWire();
  const b=$("crNextB");if(b)b.addEventListener("click",crNext);
  const see=$("crSee");if(see)see.addEventListener("click",()=>{CL.view="week";showTab("clients");});
  for(const id of ["crLegacy","crLegacy2"]){const l=$(id);if(l)l.addEventListener("click",()=>{if(typeof lgOpen==="function")lgOpen();});}
  if(C){caActWire(st);caInvitesWire();}}
/* the three reputation tracks as notched bars (a number too, so it reads without colour) and what each opens next */
const CR_SEG={walk_in:"walk-ins off the street",first_timer:"first-timers",students:"students",trades:"trades",creatives:"creatives",memorial:"memorial pieces",
  collector:"collectors",large_scale:"large-scale work",old_school:"old-school regulars",cover_up:"cover-ups",flash_day:"flash days",friday_13:"Friday the 13th",
  waiting_list:"a waiting list",magazine:"a magazine feature",guest_spot:"guest spots",convention:"conventions",award:"awards"};
function crRep(){
  const T=INK_SIM.REP_TRACKS;if(!T)return"";
  return`<h3 class="crRepH">Reputation</h3><div class="crRep">${Object.keys(T).map(k=>{const raw=(S.rep&&+S.rep[k])||0,v=Math.round(raw),shown=raw>0&&raw<10?raw.toFixed(1):String(v),n=INK_SIM.repNext(S,k);
    return`<div class="crRepR"><span class="crRepN"><b>${esc(T[k].name)}</b><span class="clMeta">${esc(T[k].says.split(":")[0])}</span></span><span class="crRepB" role="img" aria-label="${esc(T[k].name)} ${shown} out of 100"><i style="width:${Math.min(100,raw).toFixed(1)}%"></i></span><b class="crRepV">${shown}</b>
<span class="clMeta crRepX">${n?`At ${n.at}: ${esc(CR_SEG[n.id]||n.id.replace(/_/g," "))}${n.kind==="event"?" (later update)":""}`:"Everything open"}</span></div>`;}).join("")}</div>`;}
function crNext(){
  if(INK_SIM.careerOver(S))return;
  if(typeof seLive==="function"){const L=seLive();if(L&&L.kind==="booked"){toast("Finish the sitting in the chair first");showTab("session");return;}}
  if(crWaiting().n&&!CR.arm){CR.arm=1;clearTimeout(CR.armT);CR.armT=setTimeout(()=>{CR.arm=0;if(curTab==="career")renderCareer();},4000);INK_SOUND.tick();renderCareer();return;}
  CR.arm=0;clearTimeout(CR.armT);CR.say=null;
  if(typeof CL!=="undefined"){CL.consult=null;CL.done=null;}
  const st0=S.studio&&S.studio.stage;
  const res=INK_SIM.nextStop(S);CR.last=res;
  if(res.line){CR.lines.unshift(res.line);if(CR.lines.length>CR.LINES)CR.lines.length=CR.LINES;}
  crAfter(st0);}
/* after the clock moved (Next or a chore): tidy the board, save, redraw, and show any scene */
function crAfter(st0){
  if(S.board.item&&!S.queue.some(q=>q.id===S.board.item))S.board.item=null;
  if(S.studio&&S.studio.stage!==st0)caStage();
  save();renderHeader();renderCareer();INK_SOUND.tick();
  if(typeof lgSceneOpen==="function")lgSceneOpen();}

/* ===================== the act card ===================== */
const CA_TOPIC={chore:"intro",practice:"practice",flash:"flash",friend:"friend",walkin:"walkin",chair:"idle"};
function caBar(v,label){v=clamp(v||0,0,1);return`<span class="crRepB caBar" role="img" aria-label="${esc(label)} ${Math.round(v*100)} out of 100"><i style="width:${(v*100).toFixed(1)}%"></i></span>`;}
function caSay(text,who){return text?`<blockquote class="caSay">“${esc(text)}”<cite>${esc(who||INK_SIM.MENTOR.addr)}</cite></blockquote>`:"";}
function caActHtml(st){
  const C=S.career,M=INK_SIM.MENTOR,gw=C.mentor.goodwill;
  if(st==="apprentice"){
    const steps=INK_SIM.apprenticeSteps(S),goal=steps.find(s=>!s.done),friendQ=S.queue.some(q=>q.friend);
    const say=CR.say||INK_SIM.mentorLine(S,goal?CA_TOPIC[goal.id]:"idle");
    const canFriend=C.friends.length<INK_SIM.FRIENDS.max&&!friendQ;
    const early=S.year<2000+INK_SIM.ACTS.apprentice.years[1];
    return`<div class="card caAct"><span class="clK">Act 1 · ${esc(M.shop)}</span>${caSay(say)}
${goal?`<div class="caGoal"><span class="clK">Your goal</span><b>${esc(goal.goal)}</b><span class="clMeta">${esc(goal.how)}</span></div>`:""}
<ol class="caSteps" aria-label="Apprenticeship steps">${steps.map(s=>`<li class="${s.done?"done":s===goal?"now":""}"><span class="sr">${s.done?"Done: ":s===goal?"Now: ":"Later: "}</span>${esc(s.goal.split(":")[0])}</li>`).join("")}</ol>
<div class="caRow"><span class="clMeta">Arkady's goodwill</span>${caBar(gw,"Arkady's goodwill")}</div>
<h3 style="margin-top:12px">Chores <span class="clMeta">(each one is a week)</span></h3>
<div class="caChores">${INK_SIM.CHORES.map(c=>`<button class="btn sm" data-chore="${c.id}">${esc(c.name)}</button>`).join("")}</div>
<div class="row" style="margin-top:10px">${canFriend?`<button class="btn${goal&&goal.id==="friend"?" pri":""}" id="caFriend">Do a friend, free</button>`:friendQ?`<button class="btn" id="caFriendGo">Your friend is booked: design it</button>`:""}
${goal&&goal.tab!=="career"?`<button class="btn${goal.id==="walkin"?"":" pri"}" id="caGoTab">Go to ${esc(goal.tab==="session"?"the Session tab":goal.tab==="design"?"the Design tab":"Clients")}</button>`:""}
<button class="btn" id="caChair">${early?"Leave early: rent a chair":"Rent a chair"}</button></div>
${early?`<p class="hint">Leaving before week 1 of ${2000+INK_SIM.ACTS.apprentice.years[1]} costs Arkady's goodwill. With it high he gives you his own chair at a fair split, and he'll cover you once if your studio ever goes under.</p>`:""}</div>`;}
  if(st==="chair"){
    const n=INK_SIM.leaseNeed(S),split=INK_SIM.CHAIR_SPLIT[C.split||"standard"],where=C.split==="mentor"?`Arkady's chair at ${M.shop}`:"a rented chair in a shop off the embankment";
    const later=C.mentor.left?INK_SIM.mentorLine(S,"later",gw>=M.splitAt?"high":"low"):"";
    return`<div class="card caAct"><span class="clK">Act 2 · Rented chair</span><p style="margin:4px 0 8px">You work from ${esc(where)}. The shop keeps <b>${Math.round(split*100)}%</b> of what you take; you buy your own supplies.</p>
${later?`<p class="hint caLater">${esc(later)}</p>`:""}
<dl class="kv"><dt>Your rate</dt><dd>${fmtMoney(S.rate)} an hour</dd><dt>Clients</dt><dd>${S.clients.length}</dd></dl>
<h3 style="margin-top:12px">Your own studio</h3>
<ul class="caNeed"><li class="${n.when?"ok":""}">${n.when?"✓":"·"} From ${n.year}, or sooner with reputation ${n.needRep} (you have ${n.repSum})</li><li class="${n.cash?"ok":""}">${n.cash?"✓":"·"} ${fmtMoney(n.cost)} for the lease deposit</li></ul>
<p class="hint">Rent and upkeep then run every week. Four weeks below ${fmtMoney(caFloor())} closes the shop and puts you back in a chair, with your clients and work.</p>
<div class="row"><button class="btn${n.when&&n.cash?" pri":""}" id="caLease"${n.when&&n.cash?"":" disabled"}>Lease a studio</button></div></div>`;}
  const ln=INK_SIM.legacyNeed(S),b=S.studio.build||{},tr=C.apprentices.find(a=>a.status==="training");
  if(st==="studio")return`<div class="card caAct"><span class="clK">Act 3 · Your studio</span>
<dl class="kv"><dt>Stations</dt><dd>${b.stations||0}, ${S.studio.staff.length} artist${S.studio.staff.length===1?"":"s"}</dd><dt>Shop's reputation</dt><dd>${Math.round(S.studio.rep||0)} / 100</dd><dt>Your rate</dt><dd>${fmtMoney(S.rate)} an hour</dd>${C.broke?`<dt>Under the floor</dt><dd class="crit">${C.broke} of ${INK_SIM.BROKE.weeks} weeks</dd>`:""}</dl>
${caAppHtml(tr)}
<div class="row" style="margin-top:10px"><button class="btn" id="caShop">Run the shop (Studio tab)</button>${ln.when?`<button class="btn pri" id="caLegacy">Open a waiting list (Act 4)</button>`:""}</div>
${ln.when?"":`<p class="hint">Act 4 opens from ${2000+INK_SIM.ACTS.legacy.years[0]-2}, or sooner with collectors at 60.</p>`}</div>`;
  /* legacy */
  const O=INK_SIM.LEGACY_OFFERS;
  return`<div class="card caAct"><span class="clK">Act 4 · Legacy</span>
<p style="margin:4px 0 8px">${C.books==="closed"?"Your books are closed: no walk-ins, only regulars, referrals and the waiting list.":"Your books are open: walk-ins still get a chair."}</p>
<div class="row">${segHtml("caBooks",[["open","Books open"],["closed","Waiting list only"]],C.books||"open")}</div>
<h3 style="margin-top:12px">Projects</h3><div class="caProj">${["book","line","conv"].map(id=>{const o=O[id],done=C.offers[id];
  return`<div class="caPr"><b>${esc(o.name)}</b><span class="clMeta">${esc(o.says)}</span>${done?`<span class="clMeta ok">Done, ${done.y}</span>`:`<button class="btn sm" data-proj="${id}">${fmtMoney(caRub(o.cost))}</button>`}</div>`;}).join("")}</div>
${caAppHtml(tr)}
${C.offers.tv?`<p class="hint">The TV offer: ${C.offers.tv==="yes"?"you did the show.":"you turned it down."}</p>`:""}
<div class="row" style="margin-top:10px"><button class="btn" id="caShop">Run the shop (Studio tab)</button></div></div>`;}
function caAppHtml(tr){const C=S.career,past=C.apprentices.filter(a=>a.status!=="training");
  return`<h3 style="margin-top:12px">Apprentices</h3>${tr?`<p class="hint" style="margin-top:0"><b>${esc(tr.name)}</b> is learning in your shop (${esc((INK_SIM.STYLES[tr.style]||{}).name||tr.style)}${tr.el?", your way":""}). Stipend ${fmtMoney(caRub(INK_SIM.APPRENTICES.stipend))} a week.</p>`
  :`<div class="row"><button class="btn sm" id="caApp">Take an apprentice</button></div><p class="hint">Two years at ${fmtMoney(caRub(INK_SIM.APPRENTICES.stipend))} a week. They come out on your staff, or across the canal as a rival.</p>`}
${past.length?`<ul class="caPast">${past.map(a=>`<li><b>${esc(a.name)}</b> <span class="clMeta">${esc(a.where||a.status)}</span></li>`).join("")}</ul>`:""}`;}
function caRub(v){return Math.round(v*INK_SIM.priceIndex(S.year)/10)*10;}
function caFloor(){return caRub(INK_SIM.BROKE.floor);}
function caActWire(st){
  const C=S.career,on=(id,f)=>{const e=$(id);if(e)e.addEventListener("click",f);};
  const card=document.querySelector(".caAct");if(!card)return;
  card.querySelectorAll("[data-chore]").forEach(b=>b.addEventListener("click",()=>caChore(b.dataset.chore)));
  on("caFriend",()=>{const it=INK_SIM.friendBooking(S);if(!it){toast("Not now");return;}const c=INK_SIM.findClient(S,it.client);
    CR.say=INK_SIM.mentorLine(S,"friend");save();toast(`${c?c.first:"Your friend"} is in this week. Design it, then tattoo it.`);if(typeof CL!=="undefined")CL.view="week";showTab("clients");});
  on("caFriendGo",()=>{if(typeof CL!=="undefined")CL.view="week";showTab("clients");});
  on("caGoTab",()=>{const g=INK_SIM.apprenticeGoal(S);if(!g)return;if(g.tab==="clients"&&typeof CL!=="undefined")CL.view="week";showTab(g.tab);});
  on("caChair",()=>{const early=S.year<2000+INK_SIM.ACTS.apprentice.years[1];
    if(!confirm(early?"Leave Arkady's shop early and rent a chair?\n\nHe won't be pleased: it costs his goodwill.":"Leave Arkady's shop and rent your own chair?"))return;
    const r=INK_SIM.rentChair(S);if(!r.ok)return;CR.say=null;caStage();save();
    toast(r.split==="mentor"?"Arkady gives you his own chair at a fair split":"You rent a chair in a shop off the embankment");
    CR.last={weeks:0,line:`${INK_SIM.MENTOR.first}: “${r.line}”`,log:[]};renderCareer();});
  on("caLease",()=>{const n=INK_SIM.leaseNeed(S);if(!confirm(`Sign a lease? ${fmtMoney(n.cost)} deposit now, then rent and upkeep every week.`))return;
    const r=INK_SIM.leaseStudio(S);if(!r.ok){toast("Not yet");return;}caStage();save();toast("The keys are yours. Build it out on the Studio tab.");renderCareer();});
  on("caShop",()=>showTab("studio"));
  on("caLegacy",()=>{const r=INK_SIM.goLegacy(S);if(!r.ok)return;caStage();save();toast("Act 4: people wait for you now");renderCareer();});
  on("caApp",()=>{const r=INK_SIM.takeApprentice(S);if(!r.ok){toast(r.why==="stage"?"You need your own studio first":"One apprentice at a time");return;}
    save();toast(`${r.apprentice.name} starts on the broom on Monday`);renderCareer();});
  const bk=$("caBooks");if(bk)bk.addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b)return;C.books=b.dataset.v==="closed"?"closed":"open";save();INK_SOUND.tick();renderCareer();});
  card.querySelectorAll("[data-proj]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.proj,o=INK_SIM.LEGACY_OFFERS[id];
    if(!confirm(`${o.name}: ${fmtMoney(caRub(o.cost))}. Go ahead?`))return;
    const r=INK_SIM.legacyAct(S,id);if(!r.ok){toast(r.why==="flash"?`You need ${r.need} sheets of your own flash`:r.why==="cash"?"Not enough cash":"Not now");return;}
    save();renderHeader();toast(`${o.name}: done`);renderCareer();}));}
/* a chore: a week passes (people waiting this week have to be seen or skipped with Next first) */
function caChore(id){
  if(crWaiting().n){toast("Someone's waiting this week. See them, or press Next to let them go.");return;}
  if(typeof seLive==="function"){const L=seLive();if(L&&L.kind==="booked"){toast("Finish the sitting in the chair first");return;}}
  const st0=S.studio.stage,r=INK_SIM.doChore(S,id);
  CR.say=r.line;CR.last={weeks:1,line:r.chore.text,log:r.log,why:""};if(crWaiting().n)CR.last.why="client";
  CR.lines.unshift(r.chore.text);if(CR.lines.length>CR.LINES)CR.lines.length=CR.LINES;
  crAfter(st0);}

/* ===================== invites ===================== */
function caInvitesHtml(){
  const C=S.career;if(!C.invites.length)return"";
  const one=i=>{
    if(i.kind==="chair")return[`${INK_SIM.MENTOR.first} says you're ready for your own chair.`,"Rent a chair","Not yet"];
    if(i.kind==="conv"){const cv=INK_SIM.CONVENTIONS.find(c=>c.id===i.conv)||{};return[`${gvCapS(cv.name||"A convention")}, ${cv.where||""}. Entry and travel ${fmtMoney(i.fee)}. You're judged on your best healed piece, your skill, your peers and how true it is to your style.`,"Enter","Skip it"];}
    if(i.kind==="guest"){const g=INK_SIM.GUEST_SPOTS.find(x=>x.id===i.spot)||{};return[`A guest spot in ${g.name||"another city"} for ${g.weeks||2} weeks: travel ${fmtMoney(i.fee)}, a new crowd of walk-ins and a little name among other artists.`,"Go","Turn it down"];}
    if(i.kind==="tv")return[`${INK_SIM.LEGACY_OFFERS.tv.says.charAt(0).toUpperCase()+INK_SIM.LEGACY_OFFERS.tv.says.slice(1)}. ${fmtMoney(i.pay)}.`,"Take it","Turn it down"];
    return[i.kind,"Yes","No"];};
  return`<div class="card caInv"><h2>Invitations</h2>${C.invites.map(i=>{const[t,y,n]=one(i);
    return`<div class="caInvR"><p>${esc(t)}</p><div class="row"><button class="btn sm pri" data-inv="${esc(i.id)}" data-yes="1">${esc(y)}</button><button class="btn sm" data-inv="${esc(i.id)}" data-yes="0">${esc(n)}</button></div></div>`;}).join("")}</div>`;}
const gvCapS=s=>{s=String(s||"");return s.charAt(0).toUpperCase()+s.slice(1);};
function caInvitesWire(){
  const card=document.querySelector(".caInv");if(!card)return;
  card.addEventListener("click",e=>{const b=e.target.closest("[data-inv]");if(!b)return;
    const st0=S.studio.stage,r=INK_SIM.enterInvite(S,b.dataset.inv,b.dataset.yes==="1");if(!r||!r.ok)return;
    let msg="";
    if(r.kind==="conv")msg=r.place?`${["","First","Second","Third"][r.place]} place at ${r.name}!`:`No placing at ${r.name} this year. Peers saw your work, though.`;
    else if(r.kind==="guest"&&r.yes!==false)msg=`Off to ${r.spot.name} for ${r.spot.weeks} weeks`;
    else if(r.kind==="tv")msg=r.yes?"You're on television. Collectors wince; walk-ins queue.":"You turn the TV down. Other artists respect it.";
    else if(r.kind==="chair"&&r.later)msg="Arkady shrugs. 'When you're ready.'";
    else if(r.kind==="chair")msg="You rent your own chair";
    if(S.studio.stage!==st0)caStage();
    save();renderHeader();if(msg)toast(msg);INK_SOUND.tick();renderCareer();});}

/* ===================== money, skills, signature ===================== */
function caMoneyHtml(){
  const m=S.career.money,p=m.prev||m.cur,row=(o,sign)=>Object.keys(o).filter(k=>o[k]).sort((a,b)=>o[b]-o[a]).map(k=>`<dt>${esc(CR_MONEY[k]||k)}</dt><dd class="${sign}">${sign==="out"?"-":"+"}${fmtMoney(o[k])}</dd>`).join("");
  const tin=Object.values(p.in).reduce((a,b)=>a+b,0),tout=Object.values(p.out).reduce((a,b)=>a+b,0);
  if(!tin&&!tout&&!m.total.in&&!m.total.out)return"";
  return`<div class="card caMoney"><h2>Money</h2><p class="hint" style="margin-top:0">Last week: in ${fmtMoney(tin)}, out ${fmtMoney(tout)}.</p>
${tin||tout?`<dl class="kv">${row(p.in,"in")}${row(p.out,"out")}</dl>`:""}
<p class="clMeta" style="margin:8px 0 0">Career so far: earned ${fmtMoney(m.total.in)}, spent ${fmtMoney(m.total.out)}.</p></div>`;}
function caSkillsHtml(){
  const sk=S.skills||{},K=INK_SIM.SKILLS,sig=INK_SIM.signatureOf(S),styles=Object.entries(sk.styles||{}).filter(e=>e[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const lv=v=>(Math.floor((v||0)*10)/10).toFixed(1);
  const stN=id=>(INK_SIM.STYLES[id]||{}).name||id;
  return`<div class="card caSk"><h2>Skills</h2><div class="caSkL">${["linework","shading","colour","speed","consult"].map(k=>`<div class="caSkR"><span><b>${esc(K[k].name)}</b><span class="clMeta">${esc(K[k].says)}</span></span>${caBar((sk[k]||0)/10,K[k].name)}<b class="crRepV">${lv(sk[k])}</b></div>`).join("")}</div>
${styles.length?`<h3 style="margin-top:12px">Styles</h3><div class="caSkL">${styles.map(([id,v])=>{const nx=INK_SIM.skillNextUnlock(id,v);
  return`<div class="caSkR"><span><b>${esc(stN(id))}</b><span class="clMeta">${nx?`At ${nx.level}: ${esc(nx.names.slice(0,3).join(", "))}${nx.names.length>3?"…":""}`:"Every element open"}</span></span>${caBar(v/10,stN(id))}<b class="crRepV">${lv(v)}</b></div>`;}).join("")}</div>`:""}
<p class="hint">Skills grow from sittings, practice on fake skin, consults and chores, quickly at first and slower near the top.</p>
<h3 style="margin-top:12px">Your signature</h3>${sig.ready?`<p style="margin:2px 0">People know you for <b>${esc(stN(sig.style))}</b>${sig.el&&INK_SIM.elementById&&INK_SIM.elementById(sig.el)?`, and your ${esc(INK_SIM.elementById(sig.el).name.toLowerCase())}`:""}.</p>${caBar(sig.strength,"Signature strength")}
<p class="hint">Some walk-ins ask for "your thing", collectors pay more for it, and convention judges look for it.</p>`
:`<p class="hint" style="margin-top:2px">Not yet. After ${INK_SIM.SIGNATURE.pieces} pieces of your own with one style in about a third of them, people start to know your hand.${sig.n?` (${sig.n} pieces so far${sig.style?`, mostly ${esc(stN(sig.style))}`:""}.)`:""}</p>`}</div>`;}

/* practice on fake skin counts for Act 1 (the session asks the sim for practice XP when a pad sitting ends) */
if(typeof INK_SIM!=="undefined"&&typeof INK_SIM.sessionXp==="function"&&!INK_SIM.sessionXp.pr7){
  const f=INK_SIM.sessionXp;INK_SIM.sessionXp=function(res,sess,skills){if(sess&&sess.kind==="practice"&&SIMOK("notePractice"))INK_SIM.notePractice(S);return f.apply(this,arguments);};
  INK_SIM.sessionXp.pr7=true;}
