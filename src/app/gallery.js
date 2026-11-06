/* ===================== app/gallery.js: the heal reveal and the body of work (PR 5) =====================
   Pictures of healed and aged pieces, all re-rendered from the sim (INK_SIM.age); nothing here is ever saved.
     gvSvg(piece, {years, fresh, ghost, big})  one piece on the client's skin: the design with the aging model's spread,
                  blur and fade for that many years (heal grade included); a blown-out heal gets a halo, a patchy or infected
                  one a mottled mask, and the stencil can be laid over it as a faint purple ghost so drift and blowouts show.
     gvToday(p)   the gallery's render: cached in memory (GV.cache) by piece id + whole years of age + heal + skin, so a piece
                  is drawn again only when it crosses a year or changes.
     the reveal   rvHtml / rvWire on the Career tab: S.reveals holds the healed pieces you haven't looked at yet (sim/heal.js
                  pushes them). Fresh next to healed, the grade as a shape and a word (never colour alone), the client's
                  reaction, the review if one was written, an apology scene when it got infected, and "Put it in your
                  portfolio?" (piece.portfolio via INK_SIM.setPortfolio). One tap moves on. PEW's analysis-screen verdict.
     the work     gvRenderWork(host): the Clients tab's third view. Every piece as it looks today, newest first, filtered by
                  year, style, client name and portfolio, 40 at a time ("Show more"). Tap one for its history (gvOpen): the
                  session outputs, the heal, how it looks at 0, 5 and 10 years and today, and the client's ledger.
   PR 7: pieces by your staff (p.by, sim/career.js) are the Shop gallery (GV.shop, the Work view's Yours / Shop switch),
   never your own work; their client is often only p.guest {n first name, t skin tone, a aftercare, s sun}.
   Sample walk-ins aren't in S.clients: INK_SIM.guestClient (set below) hands the sim their traits so their aftercare counts. */
const GV={cache:new Map(),CAP:1500,n:0,show:40,year:"",style:"",q:"",port:false,seq:0,shop:false};
const GV_BLOW="#263a63";      // a blowout: ink pushed too deep reads as a blue-black haze round the line
const GV_STENCIL="#7b52ea";   // the stencil ghost: transfer purple, dashed, over the healed ink
const GV_WORDS={crisp:"Crisp",soft:"Slightly soft",patchy:"Patchy",blownout:"Blown out",infected:"Infected"};
/* each grade's shape, so it reads without colour */
const GV_SHAPE={
  crisp:'<circle cx="12" cy="12" r="8" class="f"/>',
  soft:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" class="f"/>',
  patchy:'<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><circle cx="9" cy="10" r="1.6" class="f"/><circle cx="15" cy="14" r="1.6" class="f"/>',
  blownout:'<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"/><circle cx="12" cy="12" r="2.5" class="f"/>',
  infected:'<path d="M12 3 22 20H2z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="1" class="f"/>'};
const GV_SAYS={
  crisp:"Every line held its edge.",
  soft:"It settled in a little soft at the edges.",
  patchy:"Some of the ink didn't stay. It needs a touch-up.",
  blownout:"Ink spread under the skin where the needle went too deep.",
  infected:"It got infected while it healed. That one is on the shop."};
function gvShape(g,cls){return GV_SHAPE[g]?`<svg class="gvShape ${cls||""} g-${g}" viewBox="0 0 24 24" aria-hidden="true">${GV_SHAPE[g]}</svg>`:"";}
function gvGrade(g){return g?`<span class="gvGrade g-${g}">${gvShape(g)}${esc(GV_WORDS[g]||g)}</span>`:`<span class="gvGrade g-none">Healing</span>`;}

/* ---- who a piece belongs to: a real client, or a sample walk-in from the Design tab ---- */
function gvSample(id){return typeof DZ_SAMPLE_CLIENTS!=="undefined"?DZ_SAMPLE_CLIENTS.find(x=>x.id===id):null;}
function gvClient(p){
  const c=INK_SIM.findClient(S,p.client);if(c)return c;
  if(p.guest)return{id:p.client,first:p.guest.n,name:p.guest.n,skinTone:p.guest.t,traits:{aftercare:p.guest.a,sun:p.guest.s},guest:true,shop:true};
  const s=gvSample(p.client);
  return s?{id:s.id,first:s.name,name:s.name+" (sample walk-in)",skinTone:s.skinTone,traits:s.traits,guest:true}:{id:p.client,first:"a client",name:"A client",skinTone:0.3,traits:{},guest:true};}
INK_SIM.guestClient=id=>{const s=gvSample(id);return s?{traits:s.traits,loyalty:0.3,skinTone:s.skinTone}:null;};
function gvAgeYears(p){return Math.max(0,(S.year-p.y)+(S.week-p.w)/52);}
function gvCap(s){s=String(s||"");return s.charAt(0).toUpperCase()+s.slice(1);}

/* ---- drawing ---- */
/* one element: mode "ink" (fill + line), "halo" (a wide soft line: blowout), "ghost" (the stencil: a thin purple line) */
function gvEl(e,style,spread,mode,extra){
  const d=dzDef(e.id);if(!d)return"";
  const b=dzEB(e.id),k=e.mm/Math.max(b.w,b.h,1e-6),lw=INK_SIM.lineMm(e.lineWeight);
  const fc=e.colour?dzColHex(e.colour):DZ_INK,lc=e.colour&&(style==="watercolour"||!(e.fill>0))?fc:DZ_INK;
  let h=`<g transform="${dzTf(e)}">`;
  if(mode==="ghost")h+=`<path d="${d.path}" fill="none" stroke="${GV_STENCIL}" stroke-width="${dzR4(0.42/k)}" stroke-dasharray="${dzR4(1.4/k)} ${dzR4(0.9/k)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  else if(mode==="halo")h+=`<path d="${d.path}" fill="none" stroke="${GV_BLOW}" stroke-width="${dzR4((lw+extra)/k)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  else{if(d.fill&&e.fill>0)h+=`<path d="${d.fill}" fill="${fc}" fill-opacity="${dzR2(e.fill)}"/>`;
    h+=`<path d="${d.path}" fill="none" stroke="${lc}" stroke-width="${dzR4((lw+spread)/k)}" stroke-linecap="round" stroke-linejoin="round"/>`;}
  return h+"</g>";}
/* gvSvg(p, o) -> {svg, a}. o.years (default today), o.fresh (as drawn, no aging), o.ghost (stencil overlay), o.cls */
function gvSvg(p,o){
  o=o||{};const d=p.design||{},c=gvClient(p),tone=c.skinTone!=null?c.skinTone:0.3;
  const yrs=o.years!=null?o.years:gvAgeYears(p);
  let a={blur:0,fade:0,spread:0,readability:1};
  if(!o.fresh)try{a=INK_SIM.age({design:d,out:p.out,heal:p.heal,ink:p.ink,skinTone:tone,sun:(c.traits||{}).sun},yrs)||a;}catch(e){}
  const skin=seRgb(seSkinRgb(tone));
  if(!(d.elements||[]).length)return{svg:`<svg class="gvSvg ${o.cls||""}" viewBox="0 0 10 10" style="background:${skin}" aria-hidden="true"></svg>`,a};
  const m=dzFromDesign(d),box=dzBox(m.placement),sz=d.sizeMm||40,pos=d.pos||{x:.5,y:.5};
  const cx=pos.x*box.wrapMm,cy=pos.y*box.lengthMm,pad=sz*0.12,x0=cx-sz/2-pad,y0=cy-sz/2-pad,W=sz+2*pad;
  const id="gv"+(++GV.seq),fd=clamp(a.fade||0,0,1),blur=Math.max(0,a.blur||0),sp=Math.max(0,a.spread||0);
  const g=o.fresh?null:p.heal,blown=!o.fresh&&(g==="blownout"||g==="infected"||(p.blowouts||0)>0);
  let defs="",inkAttr="";
  if(!o.fresh&&(blur>0.02||fd>0.02)){
    defs+=`<filter id="${id}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${dzR4(blur*0.5)}"/><feColorMatrix type="saturate" values="${dzR2(1-fd*0.85)}"/></filter>`;
    inkAttr+=` filter="url(#${id}f)"`;}
  if(g==="patchy"||g==="infected"){   // a mottled heal: spots where the ink didn't take, the same spots every time
    let spots="",hs=INK_SIM.hash(p.id+":patch");const rr=()=>((hs=Math.imul(hs^(hs>>>15),2246822507)>>>0)%10000)/10000;
    const n=g==="infected"?16:11;
    for(let i=0;i<n;i++)spots+=`<circle cx="${dzR2(x0+pad+rr()*sz)}" cy="${dzR2(y0+pad+rr()*sz)}" r="${dzR2(sz*(0.04+rr()*0.07))}" fill="#000" fill-opacity="${dzR2(0.45+rr()*0.4)}"/>`;
    defs+=`<filter id="${id}s"><feGaussianBlur stdDeviation="${dzR4(sz*0.012)}"/></filter><mask id="${id}m" maskUnits="userSpaceOnUse" x="${dzR2(x0)}" y="${dzR2(y0)}" width="${dzR2(W)}" height="${dzR2(W)}"><rect x="${dzR2(x0)}" y="${dzR2(y0)}" width="${dzR2(W)}" height="${dzR2(W)}" fill="#fff"/><g filter="url(#${id}s)">${spots}</g></mask>`;
    inkAttr+=` mask="url(#${id}m)"`;}
  let body="";
  if(g==="infected"&&yrs<0.5)body+=`<radialGradient id="${id}r"><stop offset="0" stop-color="#c8553d" stop-opacity=".32"/><stop offset="1" stop-color="#c8553d" stop-opacity="0"/></radialGradient><rect x="${dzR2(x0)}" y="${dzR2(y0)}" width="${dzR2(W)}" height="${dzR2(W)}" fill="url(#${id}r)"/>`;
  if(blown){defs+=`<filter id="${id}h" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${dzR4(0.5+sp*0.6)}"/></filter>`;
    body+=`<g filter="url(#${id}h)" opacity="${dzR2(g==="blownout"?0.5:0.28)}">${m.els.map(e=>gvEl(e,m.style,0,"halo",0.9+sp*2.2)).join("")}</g>`;}
  body+=`<g${inkAttr} opacity="${dzR2(1-fd*0.72)}">${m.els.map(e=>gvEl(e,m.style,o.fresh?0:sp,"ink")).join("")}</g>`;
  if(o.ghost)body+=`<g class="gvGhost" opacity=".8">${m.els.map(e=>gvEl(e,m.style,0,"ghost")).join("")}</g>`;
  return{svg:`<svg class="gvSvg ${o.cls||""}" viewBox="${dzR2(x0)} ${dzR2(y0)} ${dzR2(W)} ${dzR2(W)}" style="background:${skin}" aria-hidden="true">${defs?`<defs>${defs}</defs>`:""}${body}</svg>`,a};}
/* today's render for the gallery, cached by piece + whole years + heal + skin */
function gvToday(p){
  const c=gvClient(p),yr=Math.floor(gvAgeYears(p)),key=p.id+"|"+yr+"|"+(p.heal||"-")+"|"+(c.skinTone!=null?c.skinTone:"")+"|"+(p.design&&p.design.sizeMm);
  let hit=GV.cache.get(key);
  if(!hit){if(GV.cache.size>=GV.CAP)GV.cache.clear();hit=gvSvg(p,{years:yr});hit.yr=yr;GV.cache.set(key,hit);GV.n++;}
  return hit;}
const gvReads=r=>{r=clamp(r||0,0,1);const cls=r<0.35?"bad":r<0.6?"meh":"ok";return`<b class="gvR ${cls}">${Math.round(r*100)}</b>`;};

/* ===================== the reveal (Career tab) ===================== */
function rvPending(){
  if(!Array.isArray(S.reveals))S.reveals=[];
  while(S.reveals.length){const p=S.pieces.find(x=>x.id===S.reveals[0]);if(p&&p.heal)return p;S.reveals.shift();}
  return null;}
function rvStars(n){n=clamp(n||0,0,5);return`<span class="rvStars" role="img" aria-label="${n} out of 5 stars">${"★".repeat(n)}<span>${"☆".repeat(5-n)}</span></span>`;}
function rvHtml(){
  const p=rvPending();if(!p)return"";
  const c=gvClient(p),g=p.heal,left=S.reveals.length-1;
  const fresh=gvSvg(p,{fresh:true,cls:"rvImg"}),healed=gvSvg(p,{years:0,ghost:true,cls:"rvImg"});
  const loy=c.guest?0.3:c.loyalty,react=INK_SIM.healReaction(p,loy),rv=INK_SIM.pieceReview(S,p);
  const fix=g==="infected"?S.queue.find(q=>q.fix===p.id):null;
  const r=healed.a.readability;
  return`<article class="card rv g-${g}" id="rvCard" aria-labelledby="rvT">
<header class="rvHd"><span class="clK">The bandage comes off${left>0?` · ${left} more waiting`:""}</span><h2 id="rvT">${esc(gvCap(p.name))}</h2>
<span class="clMeta">Done week ${p.w}, ${p.y} · healed week ${p.healW||"?"}, ${p.healY||"?"}</span></header>
<div class="rvVerdict g-${g}">${gvShape(g,"big")}<div><div class="rvBig">${esc(GV_WORDS[g]||g)}</div><p>${esc(GV_SAYS[g]||"")} It reads ${Math.round(r*100)} today.</p></div></div>
<div class="rvPair"><figure><div class="rvFrame">${fresh.svg}</div><figcaption>The day you did it</figcaption></figure>
<figure><div class="rvFrame heal">${healed.svg}</div><figcaption>Healed <span class="rvKey"><i aria-hidden="true"></i>your stencil</span></figcaption></figure></div>
${g==="infected"?`<div class="rvScene"><div class="clB artist"><span class="clBw">You</span>${esc(INK_SIM.healApology(p))}</div></div>`:""}
${react?`<div class="rvScene"><div class="clB client"><span class="clBw">${esc(c.first||"Client")}</span>${esc(react)}</div></div>`:""}
${g==="infected"?`<p class="rvNote">${fix?`Free fix booked for week ${fix.w}, ${fix.y}. Reputation took a hit.`:"Reputation took a hit."}</p>`:""}
${rv?`<div class="rvRev"><span class="clK">${c.guest?"They left a review":`${esc(c.first)} left a review`}</span>${rvStars(rv.stars)}<blockquote>${esc(rv.text)}</blockquote></div>`:""}
<div class="rvAsk">${g==="infected"?`<div class="row"><button class="btn pri" data-rv="done">${left>0?"Next one":"Done"}</button></div>`
:`<p><b>Put it in your portfolio?</b> <span class="hint">Collectors look at it.</span></p><div class="row"><button class="btn${g==="crisp"||g==="soft"?" pri":""}" data-rv="yes">Add to portfolio</button><button class="btn${g==="crisp"||g==="soft"?"":" pri"}" data-rv="no">Not this one</button></div>`}</div>
</article>`;}
function rvWire(after){
  const card=$("rvCard");if(!card)return;
  card.addEventListener("click",e=>{const b=e.target.closest("button[data-rv]");if(!b)return;
    const p=rvPending();if(!p)return;
    if(b.dataset.rv==="yes"){INK_SIM.setPortfolio(S,p,true);toast("In your portfolio");}
    S.reveals.shift();save();INK_SOUND.tick();if(after)after();});}

/* ===================== the body of work (Clients tab, Work view) ===================== */
function gvBy(p){return p.by&&SIMOK("staffName")?INK_SIM.staffName(S,p.by):"";}
function gvAll(){return S.pieces.filter(p=>!!p.by===!!GV.shop);}
function gvList(){
  const qs=GV.q.trim().toLowerCase(),out=[];
  for(let i=S.pieces.length-1;i>=0;i--){const p=S.pieces[i];if(!!p.by!==!!GV.shop)continue;
    if(GV.year&&String(p.y)!==GV.year)continue;
    if(GV.style&&(p.design||{}).style!==GV.style)continue;
    if(GV.port&&!p.portfolio)continue;
    if(qs){const c=gvClient(p);if(!(c.name||"").toLowerCase().includes(qs))continue;}
    out.push(p);}
  return out;}
function gvTile(p){
  const t=gvToday(p),c=gvClient(p),st=INK_SIM.STYLES[(p.design||{}).style];
  return`<button class="gvT${p.portfolio?" port":""}" data-p="${esc(p.id)}"><span class="gvA">${t.svg}${p.portfolio?`<span class="gvPort" title="In your portfolio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg><span class="sr">In your portfolio</span></span>`:""}</span>
<span class="gvL"><b>${esc(gvCap(p.label||"tattoo"))}</b><span class="clMeta">${p.y} · ${esc(c.first||"")}${p.by?` · by ${esc(gvBy(p))}`:st?` · ${esc(st.name)}`:""}</span><span class="gvM">${p.heal?gvShape(p.heal):""}<span class="clMeta">${t.yr<1?"fresh":t.yr+" yr"} · reads ${gvReads(t.a.readability)}</span></span></span></button>`;}
function gvRenderWork(host){
  const all=gvAll(),years=[...new Set(all.map(p=>p.y))].sort((a,b)=>b-a),styles=Object.keys(INK_SIM.STYLES).filter(k=>all.some(p=>(p.design||{}).style===k));
  const list=gvList(),nPort=all.filter(p=>p.portfolio).length;
  const nBy=S.pieces.filter(p=>p.by).length,sw=nBy||GV.shop?`<div class="row" style="margin-bottom:10px">${segHtml("gvWho",[["mine","Your work"],["shop",`Shop · ${nBy}`]],GV.shop?"shop":"mine")}</div>`:"";
  const wire=()=>{const w=$("gvWho");if(w)w.addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b)return;GV.shop=b.dataset.v==="shop";GV.show=40;INK_SOUND.tick();gvRenderWork(host);});};
  if(!all.length&&GV.shop){host.innerHTML=`${sw}<div class="card empty"><p><b>No shop pieces yet.</b></p><p>Pieces your artists finish land here, apart from your own work.</p></div>`;wire();return;}
  if(!all.length){host.innerHTML=`<div class="card empty"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/></svg><p><b>No finished pieces yet.</b></p><p>Every tattoo you finish lands here and ages with the person wearing it.</p></div>`;return;}
  host.innerHTML=`${sw}<div class="card gvFil">
<div class="gvSel"><label>Year<select id="gvY"><option value="">All years</option>${years.map(y=>`<option${String(y)===GV.year?" selected":""}>${y}</option>`).join("")}</select></label>
<label>Style<select id="gvS"><option value="">All styles</option>${styles.map(k=>`<option value="${k}"${k===GV.style?" selected":""}>${esc(INK_SIM.STYLES[k].name)}</option>`).join("")}</select></label></div>
<div class="row"><label class="clSearch gvQ"><span class="sr">Search by client</span><input id="gvQ" type="search" placeholder="Search by client" value="${esc(GV.q)}" autocomplete="off"></label>
<button class="btn sm gvPortB${GV.port?" on":""}" id="gvP" aria-pressed="${GV.port}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>Portfolio · ${nPort}</button></div>
<p class="clMeta gvCount">${list.length===all.length?`${all.length} piece${all.length===1?"":"s"}`:`${list.length} of ${all.length} pieces`}${GV.shop?" by your artists":""}, as they look in ${S.year}.</p></div>
${list.length?`<div class="gvGrid" id="gvGrid">${list.slice(0,GV.show).map(gvTile).join("")}</div>${list.length>GV.show?`<div class="row" style="justify-content:center"><button class="btn" id="gvMore">Show more (${list.length-GV.show})</button></div>`:""}`:`<div class="card empty"><p>Nothing matches.</p></div>`}`;
  const re=()=>{GV.show=40;gvRenderWork(host);};wire();
  $("gvY").addEventListener("change",e=>{GV.year=e.target.value;re();});
  $("gvS").addEventListener("change",e=>{GV.style=e.target.value;re();});
  $("gvP").addEventListener("click",()=>{GV.port=!GV.port;INK_SOUND.tick();re();});
  $("gvQ").addEventListener("input",e=>{GV.q=e.target.value;const pos=e.target.selectionStart;re();const i=$("gvQ");i.focus();try{i.setSelectionRange(pos,pos);}catch(_){}});
  const m=$("gvMore");if(m)m.addEventListener("click",()=>{GV.show+=40;gvRenderWork(host);});
  const g=$("gvGrid");if(g)g.addEventListener("click",e=>{const b=e.target.closest("[data-p]");if(b)gvOpen(b.dataset.p);});}
/* a piece's history in the sheet */
function gvOpen(id){
  const p=S.pieces.find(x=>x.id===id);if(!p)return;
  const c=gvClient(p),o=p.out||{},yrs=gvAgeYears(p),now=gvSvg(p,{cls:"gvBig"}),rv=INK_SIM.pieceReview(S,p);
  const pct=v=>v==null?"–":Math.round(clamp(v,0,1)*100)+"%";
  const strip=[0,5,10].map(y=>({y,lbl:y===0?"Healed":y+" years"+(y>yrs?" (forecast)":"")}));
  if(yrs>=1&&![0,5,10].includes(Math.floor(yrs)))strip.push({y:Math.floor(yrs),lbl:"Today, "+Math.floor(yrs)+" yr"});
  strip.sort((a,b)=>a.y-b.y);
  const ink=INK_SIM.INKS&&INK_SIM.INKS[p.ink],mach=INK_SIM.MACHINES&&INK_SIM.MACHINES[p.machine];
  const mine=c.guest?[p]:(c.pieces||[]).map(pid=>S.pieces.find(x=>x.id===pid)).filter(Boolean);
  const spent=mine.reduce((s,x)=>s+(x.price||0),0);
  openSheet(gvCap(p.label||"Piece"),`<section class="gvHist"><div class="gvHead"><div class="gvBigA">${now.svg}</div><div>
<p class="gvName">${esc(gvCap(p.name))}</p><p>${gvGrade(p.heal)}${p.portfolio?` <span class="gvGrade g-port">★ Portfolio</span>`:""}</p>
<p class="clMeta">${yrs<1?"Fresh":Math.floor(yrs)+(Math.floor(yrs)===1?" year":" years")+" on the skin"} · reads ${gvReads(now.a.readability)}</p>${p.by?`<p class="clMeta">By ${esc(gvBy(p))}, one of your shop's artists</p>`:""}</div></div></section>
<section><h3>The work</h3><dl class="kv"><dt>Done</dt><dd>Week ${p.w}, ${p.y}${p.stage?` · ${esc((typeof STAGE_NAMES!=="undefined"&&STAGE_NAMES[p.stage])||p.stage)}`:""}</dd>
<dt>Style</dt><dd>${esc((INK_SIM.STYLES[(p.design||{}).style]||{}).name||"")} · ${Math.round((p.design||{}).sizeMm||0)} mm${(p.design||{}).flash?" · flash":""}</dd>
${p.price?`<dt>Price</dt><dd>${fmtMoney(p.price)}</dd>`:""}${p.sessionsUsed?`<dt>Sittings</dt><dd>${p.sessionsUsed}</dd>`:""}
<dt>Lines</dt><dd>${pct(o.lineQuality)}</dd><dt>Depth</dt><dd>${pct(o.depthQuality)}</dd><dt>Saturation</dt><dd>${pct(o.saturation)}</dd><dt>Trauma</dt><dd>${pct(o.trauma)} <span class="hint">lower is better</span></dd>
${p.blowouts!=null?`<dt>Blowouts</dt><dd>${p.blowouts}</dd>`:""}${p.joins!=null?`<dt>Joins</dt><dd>${p.joins}</dd>`:""}
${ink||mach?`<dt>Kit</dt><dd>${esc([mach&&mach.name,ink&&(ink.name||p.ink)+" ink"].filter(Boolean).join(" · "))}</dd>`:""}
<dt>Heal</dt><dd>${p.heal?`${gvGrade(p.heal)} week ${p.healW||"?"}, ${p.healY||"?"}`:"Still under the bandage"}</dd></dl>
${rv?`<div class="rvRev">${rvStars(rv.stars)}<blockquote>${esc(rv.text)}</blockquote></div>`:""}</section>
<section><h3>How it ages</h3><div class="gvStrip">${strip.map(s=>{const t=gvSvg(p,{years:s.y,cls:"gvSm"});return`<figure>${t.svg}<figcaption>${esc(s.lbl)}<br>reads ${gvReads(t.a.readability)}</figcaption></figure>`;}).join("")}</div></section>
${p.heal&&!p.by?`<section><div class="row"><button class="btn${p.portfolio?"":" pri"}" id="gvPf">${p.portfolio?"Take it out of your portfolio":"Add to your portfolio"}</button></div></section>`:""}
<section><h3>${esc(c.first||"Client")}'s ledger</h3><ul class="clHist">${mine.map(x=>`<li><span class="clMeta">${x.y}</span> ${esc(gvCap(x.label||"tattoo"))}${x.heal?` · ${esc((INK_SIM.HEAL_GRADES[x.heal]||{}).name||x.heal)}`:""}${x.price?` · ${fmtMoney(x.price)}`:""}${x.id===p.id?" <b>(this one)</b>":""}</li>`).join("")}</ul>
<p class="clMeta">${mine.length} piece${mine.length===1?"":"s"}, ${fmtMoney(spent)} in all.</p>
${c.shop?`<p class="hint">A client of ${esc(gvBy(p))}'s: on the shop's books, not yours.</p>`:c.guest?`<p class="hint">A sample walk-in from the Design tab: not on your books.</p>`:`<div class="row"><button class="btn" id="gvCl">Open ${esc(c.first)}'s card</button></div>`}</section>`);
  const pf=$("gvPf");if(pf)pf.addEventListener("click",()=>{INK_SIM.setPortfolio(S,p,!p.portfolio);save();toast(p.portfolio?"In your portfolio":"Out of your portfolio");gvOpen(p.id);if(curTab==="clients"&&CL.view==="work")renderClients();});
  const cl=$("gvCl");if(cl)cl.addEventListener("click",()=>clOpenClient(c.id));}
