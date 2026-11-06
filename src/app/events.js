/* ===================== app/events.js: events, trends, social media, rivals, goals, conventions, reckonings (PR 8) =====================
   Everything here draws what sim/events.js decides; nothing in it changes the numbers by itself.
   On the Career tab:
     evTopHtml()    the shop-closed banner (the inspector) and events waiting for a choice (rivals undercutting, poaching
                    or copying; the pawn shop on the canal), each with its buttons and what happens if you leave it
     evLowerHtml()  what's in demand (INK_SIM.trendNow), social media from 2016 (followers, far-away bookings, Post a
                    healed piece), rival shops, and the career's goals
     evWire()       their buttons. evAfterLog(log) toasts goals reached after Next.
   Sheets: evPostSheet (pick a healed piece to post), evConvOpen (pick a fresh and a healed piece for a convention, then
   the results), evReckonOpen (a reckoning: your old piece then and now, and three choices). evPostBtn(p) is the
   "Post it" button the piece sheet and the reveal use. Cover-ups draw on the design board (app/design.js dzOld). */
const EV={};
const EV_TACTIC={undercut:"undercuts on price",poach:"poaches artists",copy:"copies flash"};
function evOn(){return SIMOK("worldEnsure");}
function evStyle(id){return(INK_SIM.STYLES[id]||{}).name||id;}
function evWeekStr(wi){const w=INK_SIM.weekFrom(wi);return`week ${w.w}${w.y!==S.year?", "+w.y:""}`;}

/* ---- the top of the Career tab: closed shop, pending choices ---- */
function evTopHtml(){
  if(!evOn())return"";INK_SIM.worldEnsure(S);
  const C=S.career,W=S.world;let h="";
  if(C&&C.closed){const u=INK_SIM.weekFrom(C.closed.until);
    h+=`<div class="card evClosed" role="status"><span class="clK">Closed by the inspector</span><p><b>The shop is shut until week ${u.w}, ${u.y}.</b> ${esc(gvCapS(C.closed.why||""))}. Walk-ins go elsewhere and booked sittings move to the day you reopen.</p></div>`;}
  for(const e of W.pending){const dl=(e.choices||[]).find(c=>c[0]===e.dflt);
    h+=`<div class="card evCard" data-ev="${esc(e.id)}"><span class="clK">${e.kind==="pawn"?"The pawn shop":"A rival shop"} · week ${e.w}, ${e.y}</span><p>${esc(e.text)}</p>
<div class="row evCh">${(e.choices||[]).map(c=>`<button class="btn sm${c[0]===e.dflt?"":" pri"}" data-evc="${esc(c[0])}">${esc(c[1])}</button>`).join("")}</div>
<p class="clMeta">Leave it past ${esc(evWeekStr(e.until))} and it's “${esc(dl?dl[1].toLowerCase():"")}”.</p></div>`;}
  return h;}

/* ---- lower cards ---- */
function evTrendHtml(){
  const t=INK_SIM.trendNow(S),ar={up:"▲",down:"▼",flat:"–"},say={up:"rising",down:"falling",flat:"steady"};
  return`<div class="card evTrend"><h2>What's in demand</h2><p class="hint" style="margin-top:0">What walk-ins ask for this year, most wanted first.</p>
<ol class="evTop">${t.top.map(s=>`<li><b>${esc(s.name)}</b><span class="evDir ${s.dir}" aria-label="${say[s.dir]}">${ar[s.dir]}</span><span class="evBar" aria-hidden="true"><i style="width:${Math.min(100,s.demand/2*100).toFixed(0)}%"></i></span></li>`).join("")}</ol>
${t.waves.length?`<p class="clMeta">${t.waves.map(w=>esc(gvCapS(w.name))+" "+(w.amp<0?"(against "+esc(evStyle(w.style).toLowerCase())+")":"")+" is "+{rising:"rising",peak:"at its peak",fading:"fading"}[w.phase]).join(" · ")}.</p>`:""}</div>`;}
function evSocialHtml(){
  const so=S.world.social,P=INK_SIM.SOCIAL;
  if(S.year<P.from||!so.on)return S.year>=P.from-1?`<div class="card evSoc"><h2>Social media</h2><p class="hint" style="margin-top:0">Not yet. Around ${P.from} everyone starts carrying a camera, and healed work starts travelling.</p></div>`:"";
  const n=evPostable().length,t=INK_SIM.followersTarget(S);
  return`<div class="card evSoc"><h2>Social media</h2><dl class="kv"><dt>Followers</dt><dd>${so.followers.toLocaleString("en-CA")}</dd><dt>Posts</dt><dd>${so.posts.length}</dd>
<dt>Booked from far away</dt><dd>${so.booked}</dd>${so.bad?`<dt>Bad heals posted by clients</dt><dd class="out">${so.bad}</dd>`:""}${so.viral?`<dt>Went viral</dt><dd>week ${so.viral.w}, ${so.viral.y}</dd>`:""}</dl>
<p class="clMeta">Followers drift toward what your reputation earns (about ${t.toLocaleString("en-CA")} now). Good healed posts push past it; bad heals clients post pull it down.</p>
<div class="row"><button class="btn${n?" pri":""}" id="evPost"${n?"":" disabled"}>Post a healed piece${n?` (${n})`:""}</button></div></div>`;}
function evRivalsHtml(){
  const L=(S.career&&S.career.rivals)||[];if(!L.length)return"";
  const open=L.filter(r=>r.status==="open"),gone=L.filter(r=>r.status!=="open");
  return`<div class="card evRiv"><h2>Rival shops</h2>${open.length?`<ul class="evRivL">${open.map(r=>`<li><b>${esc(gvCapS(r.shop||r.name))}</b> <span class="clMeta">${esc(r.where||"")} · ${esc(evStyle(r.style))} · ${esc(EV_TACTIC[r.tactic]||"")}</span>
<span class="caRow"><span class="clMeta">Pull</span>${caBar(r.str,(r.shop||r.name)+" pull")}</span>${r.mem<-0.1?`<span class="clMeta">They hold a grudge.</span>`:r.mem>0.1?`<span class="clMeta">On good terms with you.</span>`:""}${r.truce&&INK_SIM.weekIndex(S.week,S.year)<r.truce?`<span class="clMeta">A truce on prices until ${esc(evWeekStr(r.truce))}.</span>`:""}</li>`).join("")}</ul>`:`<p class="hint" style="margin-top:0">No rival shop is open near you right now.</p>`}
${gone.length?`<p class="clMeta">Closed: ${gone.map(r=>esc(gvCapS(r.shop||r.name))+(r.gone?" ("+r.gone.y+")":"")).join(", ")}.</p>`:""}</div>`;}
function evGoalsHtml(){
  const G=INK_SIM.goalList(S),n=G.filter(g=>g.done).length;
  return`<div class="card evGoals"><h2>Goals <span class="clMeta">${n} of ${G.length}</span></h2><ul class="evGoalL">${G.map(g=>`<li class="${g.done?"done":""}"><span class="evTick" aria-hidden="true"></span><span><b>${esc(g.name)}</b><span class="clMeta">${g.done?`Reached week ${g.done.w}, ${g.done.y}`:esc(g.says)}</span></span><span class="sr">${g.done?"done":"not yet"}</span></li>`).join("")}</ul></div>`;}
function evLowerHtml(){
  if(!evOn())return"";INK_SIM.worldEnsure(S);
  return evTrendHtml()+evSocialHtml()+evRivalsHtml()+evGoalsHtml();}
function evWire(){
  document.querySelectorAll(".evCard").forEach(card=>card.addEventListener("click",e=>{const b=e.target.closest("[data-evc]");if(!b)return;
    const st0=S.studio.stage,r=INK_SIM.eventChoose(S,card.dataset.ev,b.dataset.evc);if(!r||!r.ok)return;
    if(S.studio.stage!==st0&&typeof caStage==="function")caStage();
    save();renderHeader();INK_SOUND.tick();if(r.text)openSheet("What happens",`<p>${esc(r.text)}</p><div class="row"><button class="btn pri" id="evOk">OK</button></div>`);
    const ok=$("evOk");if(ok)ok.addEventListener("click",closeSheet);renderCareer();}));
  const p=$("evPost");if(p)p.addEventListener("click",evPostSheet);}
/* goals reached after Next: one toast */
function evAfterLog(log){
  const g=(log||[]).filter(l=>l.k==="goal");if(!g.length)return;
  setTimeout(()=>toast(g[0].text+(g.length>1?` (and ${g.length-1} more)`:"")),300);}

/* ---- social: posting ---- */
function evPostable(){const out=[];if(!evOn())return out;
  for(let i=S.pieces.length-1;i>=0&&out.length<12;i--){const p=S.pieces[i];if(!INK_SIM.canPost(S,p))out.push(p);if(S.pieces.length-i>300)break;}return out;}
function evPostBtn(p){return evOn()&&!INK_SIM.canPost(S,p)?`<button class="btn" id="evPostOne" data-pid="${esc(p.id)}">Post it</button>`:"";}
function evPostWire(after){const b=$("evPostOne");if(b)b.addEventListener("click",()=>{evPost(b.dataset.pid);if(after)after();});}
function evPost(pid){
  const r=INK_SIM.postPiece(S,pid);if(!r.ok){toast(r.why==="posted"?"Already posted":"Can't post that one");return r;}
  save();INK_SOUND.tick();
  if(r.viral)openSheet("It went everywhere",`<p>${esc(r.text)}</p><p class="hint">${r.reach.toLocaleString("en-CA")} people saw it. ${r.gained.toLocaleString("en-CA")} new followers.</p><div class="row"><button class="btn pri" id="evOk">OK</button></div>`),$("evOk").addEventListener("click",closeSheet);
  else toast(`Posted: ${r.reach.toLocaleString("en-CA")} people saw it, ${r.gained.toLocaleString("en-CA")} new followers`);
  return r;}
function evPostSheet(){
  const L=evPostable();
  openSheet("Post a healed piece",`<p class="hint" style="margin-top:0">Healed work only, your own. Crisp heals and well-designed pieces travel furthest.</p>
${L.length?`<div class="evPick">${L.map(p=>{const t=gvSvg(p,{cls:"evThumb"});return`<button class="evPk" data-pid="${esc(p.id)}">${t.svg}<span><b>${esc(gvCap(p.label||"piece"))}</b><span class="clMeta">${p.y} · ${esc((INK_SIM.HEAL_GRADES[p.heal]||{}).name||p.heal)} · reads ${Math.round(t.a.readability*100)}</span></span></button>`;}).join("")}</div>`:`<p>Nothing to post right now.</p>`}`);
  $("sheetBody").querySelectorAll(".evPk").forEach(b=>b.addEventListener("click",()=>{const r=evPost(b.dataset.pid);if(r&&r.ok&&!r.viral){closeSheet();}if(curTab==="career")renderCareer();}));}

/* ---- conventions: pick the pieces, then the results ---- */
function evConvOpen(invId){
  const inv=S.career.invites.find(i=>i.id===invId);if(!inv)return;
  const cv=INK_SIM.CONVENTIONS.find(c=>c.id===inv.conv)||{},cand=INK_SIM.convCandidates(S);
  EV.pick={fresh:cand.fresh[0]?cand.fresh[0].id:null,healed:cand.healed[0]?cand.healed[0].id:null};
  const row=(kind,list,label,says)=>`<section><h3>${label}</h3><p class="hint" style="margin-top:0">${says}</p>${list.length?`<div class="evPick" data-kind="${kind}">${list.map(p=>{const t=gvSvg(p,{cls:"evThumb",fresh:kind==="fresh"});
    return`<button class="evPk${EV.pick[kind]===p.id?" on":""}" data-pid="${esc(p.id)}" aria-pressed="${EV.pick[kind]===p.id}">${t.svg}<span><b>${esc(gvCap(p.label||"piece"))}</b><span class="clMeta">${p.y}${kind==="healed"?" · reads "+Math.round(t.a.readability*100):""}${p.portfolio?" · ★":""}</span></span></button>`;}).join("")}
<button class="evPk none${EV.pick[kind]?"":" on"}" data-pid="" aria-pressed="${!EV.pick[kind]}"><span><b>Don't enter this one</b></span></button></div>`:`<p class="clMeta">Nothing that qualifies.</p>`}</section>`;
  openSheet(gvCapS(cv.name||"Convention"),`<p class="hint" style="margin-top:0">Entry and travel ${fmtMoney(inv.fee)}. Your flash sells at the booth whatever the judges say.</p>
${row("fresh",cand.fresh,"Fresh work","Done in the last few months. Judged on the design and how cleanly it went in.")}
${row("healed",cand.healed,"Healed work","A year old or more. Judged on how it reads today and how it healed. This is where good work shows.")}
<div class="row"><button class="btn pri" id="evConvGo">Enter</button><button class="btn" id="evConvNo">Skip it</button></div>`);
  const body=$("sheetBody");
  body.querySelectorAll(".evPick").forEach(g=>g.addEventListener("click",e=>{const b=e.target.closest(".evPk");if(!b)return;EV.pick[g.dataset.kind]=b.dataset.pid||null;
    g.querySelectorAll(".evPk").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});INK_SOUND.tick();}));
  $("evConvNo").addEventListener("click",()=>{INK_SIM.enterInvite(S,invId,false);save();closeSheet();renderCareer();});
  $("evConvGo").addEventListener("click",()=>{const r=INK_SIM.enterInvite(S,invId,true,EV.pick);if(!r||!r.ok)return;save();renderHeader();evConvResult(r);renderCareer();});}
function evConvResult(r){
  const pl=n=>n?["","First place","Second place","Third place"][n]:"No placing";
  const cat=(c,l)=>c?`<div class="evRes p${c.place}"><span class="clK">${l}</span><b>${pl(c.place)}</b><span class="clMeta">${esc(gvCap(c.name||""))} · scored ${Math.round(c.score*100)}${c.prize?" · "+fmtMoney(c.prize):""}</span></div>`:"";
  openSheet(gvCapS(r.name),`${cat(r.fresh,"Fresh work")}${cat(r.healed,"Healed work")}${!r.fresh&&!r.healed?`<p>You only worked the booth this time.</p>`:""}
<dl class="kv"><dt>Booth sales</dt><dd class="in">+${fmtMoney(r.booth)}</dd></dl>
${r.metClient?`<p>${esc(r.metClient.name)} stood at your booth for half an hour and booked a consult for week ${r.metClient.w}.</p>`:`<p class="clMeta">Plenty of people stopped at the booth. Nobody booked on the spot.</p>`}
${r.rivals&&r.rivals.length?`<section><h3>Other shops from Mostograd</h3><ul class="caPast">${r.rivals.map(x=>`<li>${esc(x.line)}</li>`).join("")}</ul></section>`:""}
<div class="row"><button class="btn pri" id="evOk">Back to the shop</button></div>`);
  $("evOk").addEventListener("click",closeSheet);}

/* ---- reckonings: the old piece, then and now ---- */
function evReckonOpen(q){
  const R=INK_SIM.RECKONINGS[q.beat],c=clWho(q),p=q.ret&&S.pieces.find(x=>x.id===q.ret.piece);if(!R||!c||!p)return false;
  const then=gvSvg(p,{fresh:true,cls:"rvImg"}),now=gvSvg(p,{cls:"rvImg"}),yrs=Math.floor(gvAgeYears(p));
  const head=q.beat==="first_year"?"One of your first":"The bad review";
  openSheet(head,`<div class="rvScene"><div class="clB client"><span class="clBw">${esc(c.first)}</span>${esc(q.brief||"")}</div></div>
<div class="rvPair"><figure><div class="rvFrame">${then.svg}</div><figcaption>The day you did it, ${p.y}</figcaption></figure>
<figure><div class="rvFrame heal">${now.svg}</div><figcaption>Today, ${yrs} year${yrs===1?"":"s"} on · reads ${Math.round(now.a.readability*100)}</figcaption></figure></div>
<p class="clMeta">${esc(gvCap(p.name))}${p.stage==="apprentice"?" · done while you were an apprentice":""}.</p>
<div class="evChoices">${Object.keys(R.choices).map(k=>`<button class="btn${k===Object.keys(R.choices)[0]?" pri":""}" data-rc="${esc(k)}">${esc(R.choices[k].label)}</button>`).join("")}</div>`);
  $("sheetBody").querySelectorAll("[data-rc]").forEach(b=>b.addEventListener("click",()=>{
    const r=INK_SIM.reckoningChoose(S,q.id,b.dataset.rc);if(!r.ok)return;save();INK_SOUND.tick();
    if(r.consult){closeSheet();toast(r.text);clStartConsult(q.id);return;}
    $("sheetBody").innerHTML=`<p>${esc(r.text)}</p>${r.item?`<p class="hint">A free sitting is booked for week ${r.item.w}, ${r.item.y}. The design is the old one; open it on the board to rework it.</p>`:""}<div class="row"><button class="btn pri" id="evOk">OK</button></div>`;
    $("evOk").addEventListener("click",closeSheet);if(typeof renderClients==="function"&&curTab==="clients")renderClients();}));
  return true;}
