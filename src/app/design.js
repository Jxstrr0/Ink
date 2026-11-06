/* ===================== app/design.js: the Design tab, the design board (PR 2) =====================
   Three views on a segmented control:
     Body   the body diagram (app/bodymap.js): pick the spot, the body shape and the skin tone, and the sample walk-in.
     Board  the cream board (both themes, Q10): the placement's box at its true aspect (wrap x length, in mm) with its flow
            lines and joint creases, the elements on it, a toolbar for the selected one, the stress report.
     Flash  the shop's flash wall (INK_SIM.FLASH) and your own saved flash (S.flash), both at FLASH_DISCOUNT hours.
   A docked capsule (Body and Board) shows readability, flow, fit, hours, sessions and price with a ▲/▼ delta from before the
   last change, and the piece aged at 0/5/10/20 years (mini renders blurred and faded by agePrediction).
   The working model DZ.m keeps elements in millimetres on the placement box ({id, mx, my, mm, rot, lineWeight, fill,
   colour}); dzToDesign() turns it into a design in the docs/SIM-CONTRACT.md shape (sizeMm = the piece's longest side, x/y/
   scale normalised to it, pos = where its centre sits) and that is what S.board.design saves: parameters, never pictures.
   Rescoring is once per animation frame at most (dzQueue); a drag only moves one <g> and the selection box.
   The board scores against the client it's designing for (S.board.client, a real client from PR 3, with the Save to
   booking bar from app/clients.js), or else a sample walk-in (DZ_SAMPLE_CLIENTS). Undo/redo keeps DZ_UNDO_CAP snapshots in
   memory. The "Show all (sandbox)" switch (DZ.sandbox) unlocks every element for testers and is not saved. */
const DZ_SAMPLE_CLIENTS=[
  {id:"wk_office",name:"Darya",blurb:"accountant, first tattoo",pronouns:"she/her",age:29,bodyShape:"femme",skinTone:.15,job:"accountant",
   traits:{pain:.4,sun:.2,aftercare:.8,budget:.6,loyalty:.6,talkative:.5,trusting:.6},
   wants:{styles:{traditional:1,neotrad:.6,fineline:.5},tags:["flower","nature"],sizeMm:[50,110],colour:.6},mustHaves:[],dealbreakers:[]},
  {id:"wk_roofer",name:"Bogdan",blurb:"roofer, out in the sun all day",pronouns:"he/him",age:41,bodyShape:"masc",skinTone:.85,job:"roofer",
   traits:{pain:.8,sun:.9,aftercare:.4,budget:.4,loyalty:.7,talkative:.3,trusting:.5},
   wants:{styles:{blackwork:1,traditional:.7},tags:["animal"],sizeMm:[80,200],colour:.2},mustHaves:[],dealbreakers:[{kind:"colour",v:"yellow"}]},
  {id:"wk_student",name:"Sasha",blurb:"student, wants something small",pronouns:"they/them",age:19,bodyShape:"neutral",skinTone:.45,job:"student",
   traits:{pain:.3,sun:.4,aftercare:.6,budget:.25,loyalty:.5,talkative:.7,trusting:.7},
   wants:{styles:{fineline:1,geometric:.8,lettering:.5},tags:["moon","sky","script"],sizeMm:[20,60],colour:.1},mustHaves:[],dealbreakers:[]},
  {id:"wk_chef",name:"Ilya",blurb:"chef, building a collection",pronouns:"he/him",age:36,bodyShape:"neutral",skinTone:.6,job:"chef",
   traits:{pain:.7,sun:.3,aftercare:.7,budget:.8,loyalty:.8,talkative:.4,trusting:.6},
   wants:{styles:{japanese:1,neotrad:.8,traditional:.6},tags:["ocean","japanese"],sizeMm:[100,240],colour:.8},mustHaves:[],dealbreakers:[]}
];
const DZ_UNDO_CAP=60,FLASH_MINE_CAP=40;
const DZ_INK="#16120e";
/* the capsule: key, label, how to show a value, whether up is good (null = neither) */
const DZ_METRICS=[
  {k:"readability",l:"Read",f:v=>Math.round(v*100),good:1},{k:"flow",l:"Flow",f:v=>Math.round(v*100),good:1},{k:"fit",l:"Fit",f:v=>Math.round(v*100),good:1},
  {k:"hours",l:"Hours",f:v=>String(+v.toFixed(2)),good:null,u:"h"},{k:"sessions",l:"Visits",f:v=>v,good:null},{k:"price",l:"Price",f:v=>fmtMoney(v),good:null,money:1}
];
const DZ={view:"board",side:"front",sel:-1,sandbox:false,snap:false,undo:[],redo:[],m:null,cur:null,prev:null,base:null,snap0:null,
  drawer:{style:"",family:"",tag:""},raf:0,ptrs:new Map(),g:null,pxmm:1,vb:null,keys:false,capOpen:typeof innerHeight!=="number"||innerHeight>=640};

/* ---- small helpers ---- */
const dzR2=v=>Math.round(v*100)/100,dzR4=v=>Math.round(v*1e4)/1e4;
const dzEBc={};
function dzEB(id){return dzEBc[id]||(dzEBc[id]=INK_SIM.elementBox(id));}
function dzDef(id){return INK_SIM.elementById(id);}
function dzColHex(c){const C=INK_SIM.COLOURS[c||"black"];return C?C.hex:DZ_INK;}
function dzClient(){const b=S.board,real=typeof clReal==="function"?clReal(b.client):null;
  /* the board only knows what the consult found out: hidden must-haves and dealbreakers stay hidden until the reveal */
  if(real){const k=real.known||{};return Object.assign({},real,{name:real.first,bodyShape:b.bodyShape||real.bodyShape,skinTone:b.skinTone!=null?b.skinTone:real.skinTone,
    mustHaves:k.mustAll?real.mustHaves:(k.mustHaves||[]),dealbreakers:k.dealAll?real.dealbreakers:(k.dealbreakers||[])});}
  const c=DZ_SAMPLE_CLIENTS.find(x=>x.id===b.client)||DZ_SAMPLE_CLIENTS[0];
  return Object.assign({},c,{bodyShape:b.bodyShape||c.bodyShape,skinTone:b.skinTone!=null?b.skinTone:c.skinTone});}
function dzBox(pl){return INK_SIM.placementBox(pl||DZ.m.placement,S.board.bodyShape)||{wrapMm:100,lengthMm:200};}
function dzCap1(s){s=String(s||"");return s.charAt(0).toUpperCase()+s.slice(1);}
/* the element's long axis as scoring sees it (0 upright, 90 across), plus 90 for bands that wrap round the limb */
function dzAxis(id){const b=dzEB(id),d=dzDef(id);return(b.w>b.h*1.15?90:0)+((d&&d.tags||[]).some(t=>t==="band"||t==="armband"||t==="wrap")?90:0);}
function dzUnlocked(d){if(DZ.sandbox||!d||d.unlock==="start")return true;
  const m=/^style:(\w+):(\d+)$/.exec(d.unlock||"");return!!m&&(((S.skills||{}).styles||{})[m[1]]||0)>=+m[2];}
function dzLockText(d){const m=/^style:(\w+):(\d+)$/.exec(d.unlock||"");
  if(m){const st=INK_SIM.STYLES[m[1]];return(st?st.name:m[1])+" "+m[2];}
  const r=/^rnd:(\w+)$/.exec(d.unlock||"");return r?"Research: "+r[1].replace(/_/g," "):"Locked";}
const dzSig=els=>els.map(e=>e.id).sort().join(",");

/* ---- the model <-> a design (docs/SIM-CONTRACT.md) ---- */
function dzToDesign(m){
  m=m||DZ.m;const box=dzBox(m.placement);
  const base={placement:m.placement,style:m.style,flash:m.flash||null};
  if(!m.els.length)return Object.assign(base,{sizeMm:0,pos:{x:.5,y:.5},elements:[]});
  const el=e=>({id:e.id,rot:dzR2(e.rot),lineWeight:e.lineWeight,fill:dzR2(e.fill),colour:e.colour||null});
  const fp=INK_SIM.footprintOf({style:m.style,sizeMm:100,elements:m.els.map(e=>Object.assign(el(e),{x:e.mx/100,y:e.my/100,scale:e.mm/100}))});
  const W=fp.w*100,H=fp.h*100,cx=fp.cx*100,cy=fp.cy*100,size=Math.max(W,H,1);
  return Object.assign(base,{sizeMm:dzR2(size),pos:{x:dzR4(cx/box.wrapMm),y:dzR4(cy/box.lengthMm)},
    elements:m.els.map(e=>Object.assign(el(e),{x:dzR4((e.mx-cx)/size+.5),y:dzR4((e.my-cy)/size+.5),scale:dzR4(e.mm/size)}))});}
function dzFromDesign(d,placement){
  const pl=placement||d.placement,box=dzBox(pl),sz=d.sizeMm||0,els=(d.elements||[]).filter(e=>dzDef(e.id));
  const m={placement:pl,style:d.style||"traditional",flash:d.flash||null,els:[]};
  if(!els.length||!sz)return m;
  const fp=INK_SIM.footprintOf(Object.assign({},d,{elements:els})),pos=d.pos||{x:.5,y:.5};
  const cx=pos.x*box.wrapMm,cy=pos.y*box.lengthMm;
  m.els=els.map(e=>{const df=dzDef(e.id);return{id:e.id,mx:cx+((e.x!=null?e.x:.5)-fp.cx)*sz,my:cy+((e.y!=null?e.y:.5)-fp.cy)*sz,mm:(e.scale!=null?e.scale:.5)*sz,
    rot:e.rot||0,lineWeight:e.lineWeight||df.lineWeightDefault,fill:clamp(e.fill||0,0,1),colour:e.colour||null};});
  m.fsig=m.flash?dzSig(m.els):null;
  return m;}
function dzLoad(){
  const P=INK_SIM.PLACEMENTS,d=S.board.design;
  if(d&&P[d.placement])DZ.m=dzFromDesign(d);
  else DZ.m={placement:P.forearm_l?"forearm_l":Object.keys(P)[0],style:"traditional",flash:null,els:[]};
  DZ.sel=-1;DZ.cur=dzScore();DZ.prev=null;}
function dzStore(){S.board.design=dzToDesign();save();}

/* ---- scoring ---- */
function dzScore(m){const d=dzToDesign(m);
  try{return Object.assign(INK_SIM.scoreDesign(d,dzClient(),S.skills,{year:S.year,rate:S.rate>0?S.rate:undefined}),{_d:d});}catch(e){return null;}}
/* rescore at most once per frame; the capsule shows it against DZ.base (the score before the change being made) */
function dzQueue(full){if(full)DZ.qFull=true;if(DZ.raf)return;
  DZ.raf=requestAnimationFrame(()=>{DZ.raf=0;DZ.cur=dzScore();dzRenderCap();if(DZ.qFull){DZ.qFull=false;dzRenderAging();dzRenderStress();}});}

/* ---- changes, undo and redo ---- */
function dzBegin(){DZ.snap0=JSON.stringify(DZ.m);DZ.base=DZ.cur;}
function dzEnd(){
  if(DZ.snap0==null)return;const was=DZ.snap0;DZ.snap0=null;
  if(JSON.stringify(DZ.m)===was){DZ.base=null;return;}
  if(DZ.m.flash&&dzSig(DZ.m.els)!==DZ.m.fsig){DZ.m.flash=null;DZ.m.fsig=null;toast("New elements: a custom piece now, no flash discount");const t=$("dzFlashTag");if(t)t.remove();}
  DZ.undo.push(was);if(DZ.undo.length>DZ_UNDO_CAP)DZ.undo.shift();DZ.redo.length=0;
  DZ.prev=DZ.base||DZ.prev;DZ.base=null;
  dzStore();DZ.cur=dzScore();dzRenderCap();dzRenderAging();dzRenderStress();dzSyncUndo();}
function dzChange(fn,keepBoard){dzBegin();fn();if(DZ.sel>=DZ.m.els.length)DZ.sel=-1;dzEnd();if(!keepBoard)dzRenderBoard();dzRenderTools();}
function dzUndoRedo(back){
  const from=back?DZ.undo:DZ.redo,to=back?DZ.redo:DZ.undo;if(!from.length)return;
  const before=DZ.cur;to.push(JSON.stringify(DZ.m));DZ.m=JSON.parse(from.pop());
  if(DZ.sel>=DZ.m.els.length)DZ.sel=-1;
  DZ.prev=before;dzStore();DZ.cur=dzScore();
  if(DZ.view==="board"){dzRenderBoard();dzRenderTools();dzRenderStress();}else renderDesign();
  dzRenderCap();dzRenderAging();dzSyncUndo();}
function dzSyncUndo(){const u=$("dzUndo"),r=$("dzRedo");if(u)u.disabled=!DZ.undo.length;if(r)r.disabled=!DZ.redo.length;}

/* ---- drawing elements (board, minis) ---- */
/* one element as an SVG group in mm. Colour sits on the fill and the lines stay black; with no fill (or in watercolour)
   the colour is the lines, the same way scoreDesign reads it */
function dzElSvg(e,style,attrs,hit,spreadMm){
  const d=dzDef(e.id);if(!d)return"";
  const b=dzEB(e.id),k=e.mm/Math.max(b.w,b.h,1e-6),cx=b.x+b.w/2,cy=b.y+b.h/2;
  const fc=e.colour?dzColHex(e.colour):DZ_INK,lc=e.colour&&(style==="watercolour"||!(e.fill>0))?fc:DZ_INK;
  let h=`<g${attrs||""} transform="${dzTf(e)}">`;
  if(hit){const mu=hit/k,w=Math.max(b.w,mu),hh=Math.max(b.h,mu);h+=`<rect class="hit" x="${dzR2(cx-w/2)}" y="${dzR2(cy-hh/2)}" width="${dzR2(w)}" height="${dzR2(hh)}"/>`;}
  if(d.fill&&e.fill>0)h+=`<path d="${d.fill}" fill="${fc}" fill-opacity="${dzR2(e.fill)}"/>`;
  h+=`<path d="${d.path}" fill="none" stroke="${lc}" stroke-width="${dzR4((INK_SIM.lineMm(e.lineWeight)+(spreadMm||0))/k)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return h+"</g>";}
function dzTf(e){const b=dzEB(e.id),k=e.mm/Math.max(b.w,b.h,1e-6);
  return`translate(${dzR2(e.mx)} ${dzR2(e.my)}) rotate(${dzR2(e.rot)}) scale(${dzR4(k)}) translate(${dzR2(-(b.x+b.w/2))} ${dzR2(-(b.y+b.h/2))})`;}
/* the elements of a model (or a design) in a small square svg fitted to the piece */
function dzMini(m,cls,style,spreadMm){
  if(!m.els.length)return`<svg class="${cls||""}" viewBox="0 0 10 10"></svg>`;
  const d=dzToDesign(m),sz=d.sizeMm,cx=d.pos.x*dzBox(m.placement).wrapMm,cy=d.pos.y*dzBox(m.placement).lengthMm,pad=sz*0.08;
  return`<svg class="${cls||""}" viewBox="${dzR2(cx-sz/2-pad)} ${dzR2(cy-sz/2-pad)} ${dzR2(sz+2*pad)} ${dzR2(sz+2*pad)}"${style?` style="${style}"`:""} aria-hidden="true">${m.els.map(e=>dzElSvg(e,m.style,"",0,spreadMm)).join("")}</svg>`;}

/* ---- the tab ---- */
function renderDesign(){
  if(typeof INK_SIM.scoreDesign!=="function"){$("designBody").innerHTML=`<div class="card"><p class="hint">The scoring model isn't in this build.</p></div>`;return;}
  if(!DZ.m)dzLoad();
  dzKeysOnce();
  const v=DZ.view;
  $("designBody").innerHTML=`<div class="dz dz-${v}">
<div class="dzSeg seg" role="tablist" aria-label="Design views">${[["body","Body"],["board","Board"],["flash","Flash"]].map(([k,l])=>`<button type="button" role="tab" data-v="${k}" class="${k===v?"on":""}" aria-selected="${k===v}">${l}</button>`).join("")}</div>
${v==="flash"||typeof clBookingBar!=="function"?"":clBookingBar()}<div id="dzView"></div>
${v==="flash"?"":`<div class="dzCap${DZ.capOpen&&v==="board"?"":" shut"}${v==="body"?" mini":""}" id="dzCap" aria-live="off"></div>`}</div>`;
  if(typeof clBookingWire==="function")clBookingWire();
  $("designBody").querySelector(".dzSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b||b.dataset.v===DZ.view)return;DZ.view=b.dataset.v;INK_SOUND.tick();renderDesign();});
  DZ.cur=dzScore();
  if(v==="body")dzRenderBody();else if(v==="flash")dzRenderFlash();else dzRenderBoardView();
  if(v!=="flash"){dzRenderCap();dzRenderAging();}}

/* ---- Body view ---- */
function dzRenderBody(){
  const b=S.board,P=INK_SIM.PLACEMENTS,p=P[DZ.m.placement],box=dzBox(),cl=dzClient();
  const shapes=Object.keys(INK_SIM.BODY_SHAPES);
  const bar=(v,l)=>`<span class="dzBar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v*100)}" aria-label="${l}"><i style="width:${Math.round(v*100)}%"></i></span>`;
  const word=(v,w)=>w[Math.min(w.length-1,Math.floor(v*w.length))];
  const clientCard=`<div class="card dzClient"><div class="dzClientHd"><h2>Walk-in</h2><span class="dzTag">sample</span></div>
<label class="dzFull">Who's in the chair<select id="dzCl">${clReal&&clReal(b.client)?`<option value="" selected>${esc(clReal(b.client).name)} (booked)</option>`:""}${DZ_SAMPLE_CLIENTS.map(c=>`<option value="${c.id}"${c.id===b.client?" selected":""}>${esc(c.name)}, ${esc(c.blurb)}</option>`).join("")}</select></label>
<p class="hint">${esc(cl.name)} (${esc(cl.pronouns)}, ${cl.age}) likes ${esc(Object.keys(cl.wants.styles).map(s=>INK_SIM.STYLES[s].name.toLowerCase()).join(", "))}, about ${cl.wants.sizeMm[0]} to ${cl.wants.sizeMm[1]} mm.
Practice walk-ins for now: real clients with their own wants start booking in the next update.</p></div>`;
  $("dzView").innerHTML=`<div class="card dzBody">
<div class="dzBodyCtl">${segHtml("dzShape",shapes.map(s=>[s,INK_SIM.BODY_SHAPES[s].name]),b.bodyShape)}</div>
<label class="dzFull dzTone">Skin tone <span class="dzToneRow"><input type="range" id="dzTone" min="0" max="1" step="0.01" value="${b.skinTone}" aria-label="Skin tone, light to dark"><i class="dzToneChip" style="background:${bmSkin(b.skinTone)[0]}"></i></span></label>
<div class="dzBodyGrid"><div class="dzFigCol">${segHtml("dzSide",[["front","Front"],["back","Back"]],DZ.side)}<div class="dzFigWrap" id="dzFig">${bmSvg(DZ.side,DZ.m.placement,b.bodyShape,b.skinTone)}</div></div>
<div class="dzSpot" id="dzSpot">${p?`<h3>${esc(dzCap1(p.name))}</h3>
<dl class="kv"><dt>Room</dt><dd><b>${box.wrapMm} × ${box.lengthMm} mm</b><small>wrap × length, ${esc(INK_SIM.BODY_SHAPES[b.bodyShape].name.toLowerCase())} build</small></dd>
<dt>Pain</dt><dd>${bar(p.pain,"Pain")}<small>${word(p.pain,["Easy","Moderate","Sharp","Brutal"])}</small></dd>
<dt>Shows</dt><dd>${bar(p.visibility,"Visibility")}<small>${word(p.visibility,["Easy to hide","Sometimes shows","Often on show","Always on show"])}</small></dd>
<dt>Sun</dt><dd>${bar(p.sun,"Sun")}<small>${word(p.sun,["Rarely","Some","A lot","All day"])}</small></dd></dl>
${p.creases.length?`<p class="hint">Joint${p.creases.length>1?"s":""} at the ${esc(p.creases.map(c=>c.name).join(" and "))}: stay clear of the crease.</p>`:""}
<button class="btn pri dzGo" id="dzGo">Design on the ${esc(p.name)}</button>`:""}</div></div>
<label class="dzFull dzPlSel">Or pick from the list<select id="dzPl">${Object.values(P).map(x=>`<option value="${x.id}"${x.id===DZ.m.placement?" selected":""}>${esc(dzCap1(x.name))}</option>`).join("")}</select></label></div>${clientCard}`;
  const segW=(id,fn)=>$(id).addEventListener("click",e=>{const bt=e.target.closest("button[data-v]");if(!bt)return;fn(bt.dataset.v);});
  segW("dzShape",v=>dzSetBody({bodyShape:v}));
  segW("dzSide",v=>{DZ.side=v;dzRenderBody();});
  const tone=$("dzTone");
  tone.addEventListener("input",()=>{S.board.skinTone=+tone.value;$("dzTone").nextElementSibling.style.background=bmSkin(S.board.skinTone)[0];
    $("dzFig").innerHTML=bmSvg(DZ.side,DZ.m.placement,S.board.bodyShape,S.board.skinTone);if(!DZ.base)DZ.base=DZ.cur;dzQueue(true);});
  tone.addEventListener("change",()=>{DZ.prev=DZ.base||DZ.prev;DZ.base=null;save();DZ.cur=dzScore();dzRenderCap();dzRenderAging();});
  $("dzCl").addEventListener("change",e=>{const c=DZ_SAMPLE_CLIENTS.find(x=>x.id===e.target.value);if(!c)return;S.board.item=null;dzSetBody({client:c.id,bodyShape:c.bodyShape,skinTone:c.skinTone});});
  $("dzPl").addEventListener("change",e=>dzSetPlacement(e.target.value));
  const fig=$("dzFig");
  fig.addEventListener("click",e=>{const z=e.target.closest(".bmz");if(z){INK_SOUND.tick();dzSetPlacement(z.dataset.p);}});
  fig.addEventListener("keydown",e=>{const z=e.target.closest(".bmz");if(z&&(e.key==="Enter"||e.key===" ")){e.preventDefault();dzSetPlacement(z.dataset.p,true);}});
  const go=$("dzGo");if(go)go.addEventListener("click",()=>{DZ.view="board";renderDesign();$("panel").scrollTop=0;});}
/* a new body shape, skin tone or client: the piece keeps its size in mm and its place in the box */
function dzSetBody(o){const d=dzToDesign(),before=DZ.cur;Object.assign(S.board,o);DZ.m=Object.assign(dzFromDesign(d),{fsig:DZ.m.fsig});
  DZ.prev=before;save();renderDesign();}
function dzSetPlacement(id,focus){
  if(!INK_SIM.PLACEMENTS[id])return;
  if(id===DZ.m.placement){if(DZ.view!=="body")renderDesign();return;}
  if(BM_BACK_ONLY.test(id))DZ.side="back";else if(BM_FRONT_ONLY.test(id))DZ.side="front";
  const d=dzToDesign(),before=DZ.cur;DZ.undo.push(JSON.stringify(DZ.m));DZ.redo.length=0;
  DZ.m=Object.assign(dzFromDesign(Object.assign(d,{placement:id}),id),{fsig:DZ.m.fsig});DZ.prev=before;dzStore();
  if(DZ.view==="body"){dzRenderBody();DZ.cur=dzScore();dzRenderCap();dzRenderAging();
    if(focus){const z=document.querySelector(`.bmz[data-p="${id}"]`);if(z)z.focus();}}
  else renderDesign();}

/* ---- Board view ---- */
function dzRenderBoardView(){
  const m=DZ.m,p=INK_SIM.PLACEMENTS[m.placement],box=dzBox(),st=INK_SIM.STYLES;
  $("dzView").innerHTML=`<div class="dzBar1">
<button class="dzSpotBtn" id="dzSpotBtn" aria-label="Change the spot"><b>${esc(dzCap1(p.name))}</b><small>${box.wrapMm} × ${box.lengthMm} mm · ${esc(dzClient().name)}</small></button>
<label class="dzStyle"><span class="sr">Style</span><select id="dzStyleSel" aria-label="Style of the piece">${Object.values(st).map(s=>`<option value="${s.id}"${s.id===m.style?" selected":""}>${esc(s.name)}</option>`).join("")}</select></label></div>
<div class="dzBoardWrap" id="dzBoardWrap"><div class="board dzBoard" id="dzBoard"></div></div>
<div class="dzBar2">
<button class="btn pri" id="dzAdd"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Element</button>
<button class="ibtn dzIb" id="dzUndo" aria-label="Undo" title="Undo (Ctrl+Z)"><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button>
<button class="ibtn dzIb" id="dzRedo" aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg></button>
<button class="dzChip${DZ.snap?" on":""}" id="dzSnap" aria-pressed="${DZ.snap}" title="Rotation snaps to the flow of the limb"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3c-2 6 2 12 0 18M17 3c-2 6 2 12 0 18"/></svg>Snap to flow</button>
<span class="sp"></span>${m.flash?`<span class="dzFlashTag" id="dzFlashTag" title="Flash: ${Math.round((1-INK_SIM.FLASH_DISCOUNT.hours)*100)}% fewer hours">Flash −${Math.round((1-INK_SIM.FLASH_DISCOUNT.hours)*100)}% h</span>`:""}</div>
<div id="dzTools" class="dzTools"></div>
<div class="row dzBar3"><button class="btn sm" id="dzSaveFl"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>Save to my flash</button>
<button class="btn sm" id="dzClear"${m.els.length?"":" disabled"}>Clear board</button></div>
<div class="card dzStress" id="dzStress"></div>`;
  $("dzSpotBtn").addEventListener("click",()=>{DZ.view="body";renderDesign();});
  $("dzStyleSel").addEventListener("change",e=>{const v=e.target.value;dzChange(()=>{DZ.m.style=v;});dzRenderTools();});
  $("dzAdd").addEventListener("click",dzOpenDrawer);
  $("dzUndo").addEventListener("click",()=>dzUndoRedo(true));$("dzRedo").addEventListener("click",()=>dzUndoRedo(false));
  $("dzSnap").addEventListener("click",()=>{DZ.snap=!DZ.snap;const b=$("dzSnap");b.classList.toggle("on",DZ.snap);b.setAttribute("aria-pressed",DZ.snap);
    if(DZ.snap&&DZ.sel>=0)dzChange(()=>dzSnapEl(DZ.m.els[DZ.sel]));toast(DZ.snap?"Rotation snaps to the flow":"Free rotation");});
  $("dzSaveFl").addEventListener("click",dzSaveFlash);
  $("dzClear").addEventListener("click",()=>{if(!DZ.m.els.length)return;dzChange(()=>{DZ.m.els=[];DZ.m.flash=null;DZ.m.fsig=null;DZ.sel=-1;});$("dzClear").disabled=true;toast("Board cleared (Undo brings it back)");});
  dzRenderBoard();dzRenderTools();dzRenderStress();dzSyncUndo();
  const bw=$("dzBoardWrap");
  if(window.ResizeObserver&&!bw._ro){let w0=bw.clientWidth;bw._ro=new ResizeObserver(()=>{if(Math.abs(bw.clientWidth-w0)>2&&DZ.view==="board"){w0=bw.clientWidth;dzRenderBoard();}});bw._ro.observe(bw);}}

/* the board svg: viewBox in mm, the placement box at the origin with margins round it so a piece can hang off the edge */
function dzRenderBoard(){
  const host=$("dzBoard");if(!host)return;
  const m=DZ.m,p=INK_SIM.PLACEMENTS[m.placement],box=dzBox(),W=box.wrapMm,L=box.lengthMm;
  const wrap=$("dzBoardWrap"),cw=Math.max(200,(wrap?wrap.clientWidth:340)-2);
  const land=innerWidth>innerHeight&&innerHeight<560,mh=land?Math.max(220,innerHeight-130):innerWidth<700?clamp(innerHeight-(DZ.capOpen?400:330),200,520):Math.min(innerHeight*0.58,620);
  /* margins in mm, widened so the ruler's numbers (about 40 px) always fit on the left */
  let mx=clamp(W*0.2,14,40),my=clamp(L*0.06,10,30),sc=Math.min(cw/(W+2*mx),mh/(L+2*my));
  for(let i=0;i<3&&mx*sc<40;i++){mx=40/sc;sc=Math.min(cw/(W+2*mx),mh/(L+2*my));}
  const vb={x:-mx,y:-my,w:W+2*mx,h:L+2*my},pw=Math.round(vb.w*sc),ph=Math.round(vb.h*sc);
  DZ.pxmm=sc;DZ.vb=vb;
  const px=n=>dzR2(n/sc);   // n screen pixels in mm
  let h=`<svg id="dzSvg" class="dzSvg${DZ.sel>=0?" sel":""}" width="${pw}" height="${ph}" viewBox="${dzR2(vb.x)} ${dzR2(vb.y)} ${dzR2(vb.w)} ${dzR2(vb.h)}" role="application" aria-label="Design board, ${esc(p.name)}, ${W} by ${L} millimetres" tabindex="-1">
<defs><linearGradient id="dzLimbG" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#8a6a40" stop-opacity=".22"/><stop offset=".2" stop-color="#8a6a40" stop-opacity="0"/><stop offset=".8" stop-color="#8a6a40" stop-opacity="0"/><stop offset="1" stop-color="#8a6a40" stop-opacity=".22"/></linearGradient></defs>
<rect class="dzBg" x="${dzR2(vb.x)}" y="${dzR2(vb.y)}" width="${dzR2(vb.w)}" height="${dzR2(vb.h)}"/>
<rect class="dzLimb" x="0" y="0" width="${W}" height="${L}" rx="${dzR2(Math.min(W,L)*0.1)}"/>
<rect class="dzLimbE" x="0" y="0" width="${W}" height="${L}" rx="${dzR2(Math.min(W,L)*0.1)}"/>`;
  /* the mm ruler down the left margin */
  let rul="";for(let y=0;y<=L+0.01;y+=10){const big=y%50===0;rul+=`M${dzR2(-px(big?12:6))} ${y}H0`;}
  h+=`<path class="dzRuler" d="${rul}"/>`;
  for(let y=50;y<=L;y+=50)h+=`<text class="dzRulT" x="${dzR2(-px(14))}" y="${dzR2(y+px(4))}" font-size="${px(10)}" text-anchor="end">${y}</text>`;
  /* flow lines and creases */
  h+=`<g class="dzFlow">${p.flow.map(line=>`<polyline points="${line.map(q=>dzR2(q[0]*W)+","+dzR2(q[1]*L)).join(" ")}"/>`).join("")}</g>`;
  for(const c of p.creases||[]){const y=c.at*L;h+=`<line class="dzCrease" x1="${dzR2(-px(4))}" x2="${dzR2(W+px(4))}" y1="${dzR2(y)}" y2="${dzR2(y)}"/><text class="dzCreaseT" x="${dzR2(W/2)}" y="${dzR2(c.at<0.5?y-px(5):y+px(13))}" font-size="${px(10.5)}" text-anchor="middle">${esc(c.name)} crease</text>`;}
  /* the piece's footprint */
  const d=dzToDesign();
  if(m.els.length){const sz=d.sizeMm,fp=INK_SIM.footprintOf(d),fw=fp.w*sz,fh=fp.h*sz,fx=d.pos.x*W-fw/2,fy=d.pos.y*L-fh/2;
    h+=`<rect class="dzFoot" x="${dzR2(fx)}" y="${dzR2(fy)}" width="${dzR2(fw)}" height="${dzR2(fh)}"/><text class="dzFootT" x="${dzR2(fx+fw)}" y="${dzR2(fy-px(4))}" font-size="${px(10.5)}" text-anchor="end">${Math.round(fw)} × ${Math.round(fh)} mm</text>`;}
  else h+=`<text class="dzEmpty" x="${dzR2(W/2)}" y="${dzR2(L/2)}" font-size="${px(14)}" text-anchor="middle">Add an element</text><text class="dzEmpty sub" x="${dzR2(W/2)}" y="${dzR2(L/2+px(20))}" font-size="${px(11.5)}" text-anchor="middle">or start from the flash wall</text>`;
  h+=`<g id="dzEls">${m.els.map((e,i)=>dzElSvg(e,m.style,` class="dzEl${i===DZ.sel?" on":""}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(dzDef(e.id).name)}, ${Math.round(e.mm)} millimetres"`,44/sc)).join("")}</g>`;
  h+=`<g id="dzSelG"></g></svg>`;
  host.innerHTML=h;
  host.style.width=pw+"px";
  dzDrawSel();dzWireBoard();}
/* the selection box and its scale/rotate handle (screen-sized, drawn in the element's own frame) */
function dzDrawSel(){
  const g=$("dzSelG");if(!g)return;const e=DZ.m.els[DZ.sel];
  if(!e){g.innerHTML="";g.removeAttribute("transform");return;}
  const b=dzEB(e.id),k=e.mm/Math.max(b.w,b.h,1e-6),u=1/(DZ.pxmm*k),pad=4*u;
  g.setAttribute("transform",dzTf(e));
  g.innerHTML=`<rect class="dzSelR" x="${dzR2(b.x-pad)}" y="${dzR2(b.y-pad)}" width="${dzR2(b.w+2*pad)}" height="${dzR2(b.h+2*pad)}" stroke-width="${dzR4(1.5*u)}" stroke-dasharray="${dzR4(5*u)} ${dzR4(4*u)}"/>
<g class="dzHdl" data-h="1"><circle class="hit" cx="${dzR2(b.x+b.w+pad)}" cy="${dzR2(b.y+b.h+pad)}" r="${dzR2(22*u)}"/><circle class="dot" cx="${dzR2(b.x+b.w+pad)}" cy="${dzR2(b.y+b.h+pad)}" r="${dzR2(8*u)}" stroke-width="${dzR4(2*u)}"/>
<path class="arr" d="M${dzR2(b.x+b.w+pad-4*u)} ${dzR2(b.y+b.h+pad)}h${dzR2(8*u)}M${dzR2(b.x+b.w+pad)} ${dzR2(b.y+b.h+pad-4*u)}v${dzR2(8*u)}" stroke-width="${dzR4(1.6*u)}"/></g>`;}
/* move the selected element's group without redrawing the board */
function dzMoveEl(i){const e=DZ.m.els[i],g=document.querySelector(`#dzEls .dzEl[data-i="${i}"]`);if(g&&e)g.setAttribute("transform",dzTf(e));if(i===DZ.sel)dzDrawSel();}
function dzSelect(i){if(DZ.sel===i)return;DZ.sel=i;
  document.querySelectorAll("#dzEls .dzEl").forEach(g=>g.classList.toggle("on",+g.dataset.i===i));
  const svg=$("dzSvg");if(svg)svg.classList.toggle("sel",i>=0);dzDrawSel();dzRenderTools();}
function dzSvgPt(ev){const svg=$("dzSvg"),r=svg.getBoundingClientRect();
  return{x:DZ.vb.x+(ev.clientX-r.left)/DZ.pxmm,y:DZ.vb.y+(ev.clientY-r.top)/DZ.pxmm};}
/* snap an element's rotation so its long axis runs with the flow where it sits */
function dzSnapEl(e){if(!e)return;const loc=INK_SIM.flowAt(DZ.m.placement,S.board.bodyShape,e.mx,e.my),ax=dzAxis(e.id);
  const base=loc-ax;let best=base,bd=1e9;for(let k=-3;k<=3;k++){const r=base+k*180,dd=Math.abs(r-e.rot);if(dd<bd){bd=dd;best=r;}}
  e.rot=((Math.round(best*10)/10+540)%360)-180;}
/* pointers: one finger drags an element, the corner handle scales and turns it, two fingers pinch-scale and rotate */
function dzWireBoard(){
  const svg=$("dzSvg");if(!svg)return;
  svg.addEventListener("pointerdown",dzPDown);svg.addEventListener("pointermove",dzPMove);
  svg.addEventListener("pointerup",dzPUp);svg.addEventListener("pointercancel",dzPUp);svg.addEventListener("lostpointercapture",dzPUp);
  svg.addEventListener("focusin",e=>{const g=e.target.closest&&e.target.closest(".dzEl");if(g)dzSelect(+g.dataset.i);});}
function dzPDown(ev){
  const svg=$("dzSvg");const pt=dzSvgPt(ev);
  DZ.ptrs.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  try{svg.setPointerCapture(ev.pointerId);}catch(_){}
  if(DZ.ptrs.size===2&&DZ.sel>=0){dzPinchStart();ev.preventDefault();return;}
  if(DZ.ptrs.size>1)return;
  const hdl=ev.target.closest(".dzHdl"),g=ev.target.closest(".dzEl");
  if(hdl&&DZ.sel>=0){const e=DZ.m.els[DZ.sel];dzBegin();DZ.g={kind:"hdl",e,d0:Math.hypot(pt.x-e.mx,pt.y-e.my)||1,a0:Math.atan2(pt.y-e.my,pt.x-e.mx),mm0:e.mm,rot0:e.rot};ev.preventDefault();return;}
  if(g){const i=+g.dataset.i;dzSelect(i);const e=DZ.m.els[i];dzBegin();DZ.g={kind:"drag",e,ox:pt.x-e.mx,oy:pt.y-e.my,moved:false,x0:ev.clientX,y0:ev.clientY};ev.preventDefault();return;}
  if(DZ.sel>=0&&ev.pointerType!=="touch")dzSelect(-1);
  else if(DZ.sel>=0)DZ.g={kind:"tap",x0:ev.clientX,y0:ev.clientY};}
function dzPinchStart(){const [a,b]=[...DZ.ptrs.values()],e=DZ.m.els[DZ.sel];if(!e)return;
  if(!DZ.g||DZ.g.kind!=="pinch"){if(DZ.snap0==null)dzBegin();}
  DZ.g={kind:"pinch",e,d0:Math.hypot(b.x-a.x,b.y-a.y)||1,a0:Math.atan2(b.y-a.y,b.x-a.x),mm0:e.mm,rot0:e.rot,mx0:e.mx,my0:e.my,cx0:(a.x+b.x)/2,cy0:(a.y+b.y)/2};}
function dzPMove(ev){
  if(!DZ.ptrs.has(ev.pointerId))return;DZ.ptrs.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  const G=DZ.g;if(!G)return;const box=dzBox(),lim=Math.max(box.wrapMm,box.lengthMm);
  if(G.kind==="pinch"&&DZ.ptrs.size>=2){const [a,b]=[...DZ.ptrs.values()],e=G.e;
    e.mm=clamp(G.mm0*Math.hypot(b.x-a.x,b.y-a.y)/G.d0,4,lim*1.5);
    e.rot=G.rot0+(Math.atan2(b.y-a.y,b.x-a.x)-G.a0)*180/Math.PI;
    e.mx=G.mx0+((a.x+b.x)/2-G.cx0)/DZ.pxmm;e.my=G.my0+((a.y+b.y)/2-G.cy0)/DZ.pxmm;
    dzMoveEl(DZ.sel);dzQueue();ev.preventDefault();return;}
  const pt=dzSvgPt(ev),e=G.e,vb=DZ.vb;
  if(G.kind==="drag"){if(!G.moved&&Math.hypot(ev.clientX-G.x0,ev.clientY-G.y0)<3)return;G.moved=true;
    e.mx=clamp(pt.x-G.ox,vb.x,vb.x+vb.w);e.my=clamp(pt.y-G.oy,vb.y,vb.y+vb.h);dzMoveEl(DZ.sel);dzQueue();ev.preventDefault();}
  else if(G.kind==="hdl"){e.mm=clamp(G.mm0*(Math.hypot(pt.x-e.mx,pt.y-e.my)||1)/G.d0,4,lim*1.5);
    e.rot=G.rot0+(Math.atan2(pt.y-e.my,pt.x-e.mx)-G.a0)*180/Math.PI;dzMoveEl(DZ.sel);dzQueue();ev.preventDefault();}}
function dzPUp(ev){
  if(!DZ.ptrs.has(ev.pointerId))return;DZ.ptrs.delete(ev.pointerId);
  const G=DZ.g;
  if(DZ.ptrs.size){if(G&&G.kind==="pinch")DZ.g={kind:"wait",e:G.e};return;}   // one finger still down: wait for it
  DZ.g=null;
  if(G&&G.kind==="tap"){if(Math.hypot(ev.clientX-G.x0,ev.clientY-G.y0)<8)dzSelect(-1);return;}
  if(DZ.snap0==null)return;
  const e=G&&G.e;if(e){e.rot=((e.rot%360)+540)%360-180;if(DZ.snap&&(G.kind!=="drag"||G.moved))dzSnapEl(e);dzMoveEl(DZ.sel);}
  dzEnd();dzRenderBoard();dzRenderTools();}

/* ---- the selected element's toolbar ---- */
function dzRenderTools(){
  const host=$("dzTools");if(!host)return;const e=DZ.m.els[DZ.sel];
  if(!e){host.innerHTML=`<p class="dzToolHint">${DZ.m.els.length?"Tap an element to move, size or colour it. Two fingers on the board pinch and turn it.":"Add elements from the drawer. Lettering, motifs, frames and fills all score differently."}</p>`;return;}
  const d=dzDef(e.id),st=INK_SIM.STYLES[DZ.m.style],tone=dzClient().skinTone,LW=INK_SIM.LINE_WEIGHTS;
  const pal=["black"].concat((st&&st.palette||[]).filter(c=>c!=="black"));
  const tooSmall=e.mm<d.minSizeMm;
  const sw=pal.map(c=>{const r=INK_SIM.inkReads(c,tone),bad=r<0.2?"won't read":r<0.45?"faint":"",cur=(e.colour||"black")===c;
    return`<button type="button" class="dzSw${cur?" on":""}${bad?" weak":""}" data-c="${c}" aria-pressed="${cur}" aria-label="${esc(INK_SIM.COLOURS[c].name)}${bad?", "+bad+" on this skin":""}" title="${esc(INK_SIM.COLOURS[c].name)}${bad?": "+bad+" on this skin tone":""}"><i style="background:${dzColHex(c)}"></i>${bad?`<small>${bad}</small>`:""}</button>`;}).join("");
  host.innerHTML=`<div class="dzToolHd"><b>${esc(d.name)}</b><span class="${tooSmall?"bad":""}">${Math.round(e.mm)} mm${tooSmall?` <em>(needs ${d.minSizeMm})</em>`:""}</span><span class="sp"></span>
<button class="ibtn dzIb" data-a="dup" aria-label="Duplicate" title="Duplicate"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg></button>
<button class="ibtn dzIb" data-a="fwd" aria-label="Bring forward" title="Bring forward"><svg viewBox="0 0 24 24"><rect x="4" y="9" width="11" height="11" rx="2"/><rect x="9" y="4" width="11" height="11" rx="2" fill="currentColor" fill-opacity=".25"/></svg></button>
<button class="ibtn dzIb dzDel" data-a="del" aria-label="Delete" title="Delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div>
<div class="dzToolRow">
<div class="dzStep" role="group" aria-label="Size"><button data-a="s-" aria-label="Smaller">−</button><span>Size</span><button data-a="s+" aria-label="Bigger">+</button></div>
<div class="dzStep" role="group" aria-label="Rotate"><button data-a="r-" aria-label="Rotate left"><svg viewBox="0 0 24 24"><path d="M4 4v6h6"/><path d="M4.5 10A8 8 0 1 1 6 16"/></svg></button><span>${Math.round(e.rot)}°</span><button data-a="r+" aria-label="Rotate right"><svg viewBox="0 0 24 24"><path d="M20 4v6h-6"/><path d="M19.5 10A8 8 0 1 0 18 16"/></svg></button></div>
<div class="dzStep" role="group" aria-label="Line weight"><button data-a="l-" aria-label="Finer line">−</button><span>${e.lineWeight}RL</span><button data-a="l+" aria-label="Bolder line">+</button></div></div>
${d.fill?`<label class="dzFull dzFillL">Fill <input type="range" id="dzFill" min="0" max="1" step="0.05" value="${e.fill}" aria-label="Fill shading, 0 to 100 percent"><span id="dzFillV">${Math.round(e.fill*100)}%</span></label>`:`<p class="dzToolHint sm">Linework only: no area to fill.</p>`}
${d.colourable?`<div class="dzSws" role="group" aria-label="Colour (${esc(st?st.name:"")} palette)">${sw}</div>`:`<p class="dzToolHint sm">Black only.</p>`}`;
  host.querySelectorAll("button[data-a]").forEach(b=>b.addEventListener("click",()=>dzTool(b.dataset.a)));
  host.querySelectorAll(".dzSw").forEach(b=>b.addEventListener("click",()=>{const c=b.dataset.c;
    dzChange(()=>{const x=DZ.m.els[DZ.sel];x.colour=c==="black"?null:c;});}));
  const f=$("dzFill");if(f){f.addEventListener("input",()=>{if(DZ.snap0==null)dzBegin();DZ.m.els[DZ.sel].fill=+f.value;$("dzFillV").textContent=Math.round(f.value*100)+"%";
      const x=DZ.m.els[DZ.sel],g=document.querySelector(`#dzEls .dzEl[data-i="${DZ.sel}"]`);if(g)g.outerHTML=dzElSvg(x,DZ.m.style,` class="dzEl on" data-i="${DZ.sel}" tabindex="0" role="button" aria-label="${esc(d.name)}"`,44/DZ.pxmm);dzQueue();});
    f.addEventListener("change",()=>{dzEnd();dzRenderBoard();});}}
function dzTool(a){
  const i=DZ.sel,e=DZ.m.els[i];if(!e)return;const LW=INK_SIM.LINE_WEIGHTS,box=dzBox();
  const step=DZ.snap?90:15;
  if(a==="del"){dzChange(()=>{DZ.m.els.splice(i,1);DZ.sel=-1;});return;}
  if(a==="dup"){dzChange(()=>{const c=Object.assign({},e,{mx:e.mx+6,my:e.my+6});DZ.m.els.push(c);DZ.sel=DZ.m.els.length-1;});return;}
  if(a==="fwd"){if(i>=DZ.m.els.length-1){toast("Already on top");return;}dzChange(()=>{const t=DZ.m.els[i];DZ.m.els[i]=DZ.m.els[i+1];DZ.m.els[i+1]=t;DZ.sel=i+1;});return;}
  dzChange(()=>{
    if(a==="s-")e.mm=Math.max(4,e.mm/1.1);if(a==="s+")e.mm=Math.min(Math.max(box.wrapMm,box.lengthMm)*1.5,e.mm*1.1);
    if(a==="r-"||a==="r+"){e.rot+=a==="r+"?step:-step;e.rot=((e.rot%360)+540)%360-180;if(DZ.snap)dzSnapEl(e);}
    if(a==="l-"||a==="l+"){const k=LW.indexOf(e.lineWeight),n=clamp((k<0?3:k)+(a==="l+"?1:-1),0,LW.length-1);e.lineWeight=LW[n];}
  });}

/* ---- the capsule: live numbers, deltas, and the aging strip ---- */
function dzRenderCap(){
  const host=$("dzCap");if(!host||!DZ.cur)return;
  const c=DZ.cur,ref=DZ.base||DZ.prev;
  const cells=DZ_METRICS.map(M=>{
    const v=c[M.k];let dl="";
    if(ref&&ref[M.k]!=null&&DZ.m.els.length){const dv=M.k==="price"||M.k==="hours"||M.k==="sessions"?v-ref[M.k]:Math.round(v*100)-Math.round(ref[M.k]*100);
      if(Math.abs(dv)>1e-9){const up=dv>0,cls=M.good==null?"nu":(up?"up":"dn"),txt=M.money?fmtMoney(Math.abs(dv)):M.k==="hours"?(+Math.abs(dv).toFixed(2)+"h"):Math.abs(dv);
        dl=`<span class="d ${cls}" aria-label="${up?"up":"down"} ${txt}">${up?"▲":"▼"}${txt}</span>`;}}
    const has=DZ.m.els.length,warn=!has?"":M.good&&v<0.35?" bad":M.good&&v<0.6?" meh":"";
    return`<div class="dzM${warn}${M.money?" money":""}"><span class="l">${M.l}</span><b>${has?M.f(v):"–"}</b>${dl||`<span class="d"></span>`}</div>`;}).join("");
  if(!host.firstChild){host.innerHTML=`<div class="dzMs">${cells}</div><button class="dzCapT" id="dzCapT" aria-expanded="${DZ.capOpen}" aria-label="Show or hide the aging strip"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button><div class="dzAge" id="dzAge"></div>`;
    $("dzCapT").addEventListener("click",()=>{DZ.capOpen=!DZ.capOpen;host.classList.toggle("shut",!DZ.capOpen);$("dzCapT").setAttribute("aria-expanded",DZ.capOpen);if(DZ.view==="board")dzRenderBoard();});}
  else host.querySelector(".dzMs").innerHTML=cells;}
function dzRenderAging(){
  const host=$("dzAge");if(!host||!DZ.cur)return;
  if(!DZ.m.els.length){host.innerHTML=`<span class="dzAgeL">How it ages</span><span class="dzAgeNone">Nothing on the board yet</span>`;return;}
  const c=DZ.cur,d=c._d,minPx=44,mm=d.sizeMm*1.16,pxPer=minPx/mm;
  const years=[[0,{blur:0,fade:0,spread:0,readability:c.readability}],[5,c.agePrediction[5]],[10,c.agePrediction[10]],[20,c.agePrediction[20]]];
  host.innerHTML=`<span class="dzAgeL">How it ages</span>`+years.map(([y,a])=>{
    const bl=Math.max(0,a.blur*pxPer),fd=clamp(a.fade,0,1),r=a.readability,cls=r<0.35?"bad":r<0.6?"meh":"ok";
    return`<figure class="dzAgeF"><div class="dzAgeI">${dzMini(DZ.m,"",`filter:blur(${dzR2(bl)}px) saturate(${dzR2(1-fd*0.9)});opacity:${dzR2(1-fd*0.7)}`,a.spread||0)}</div>
<figcaption>${y?y+"y":"Now"} <b class="${cls}">${Math.round(r*100)}</b></figcaption></figure>`;}).join("");}

/* ---- the stress report ---- */
const DZ_SEV={3:{l:"Serious",i:`<svg viewBox="0 0 24 24"><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" fill="currentColor"/><path d="M12 7v6M12 16.5v.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`},
  2:{l:"Warning",i:`<svg viewBox="0 0 24 24"><path d="M12 2.5 22.5 21h-21z" fill="currentColor"/><path d="M12 9v5M12 17.3v.4" stroke="#1c1813" stroke-width="2.2" stroke-linecap="round"/></svg>`},
  1:{l:"Note",i:`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`}};
function dzRenderStress(){
  const host=$("dzStress");if(!host||!DZ.cur)return;const c=DZ.cur;
  const sub=`<p class="dzSub">Balance <b>${Math.round(c.balance*100)}</b> · Coherence <b>${Math.round(c.coherence*100)}</b> · Overall <b>${Math.round(c.total*100)}</b></p>`;
  if(!DZ.m.els.length){host.innerHTML=`<h2>Stress report</h2><p class="hint">Put something on the board and this lists what will go wrong with it on skin.</p>`;return;}
  host.innerHTML=`<h2>Stress report</h2>${sub}${c.stress.length?`<ul class="dzSt">${c.stress.map(s=>`<li class="sev${s.sev}"><span class="ic" role="img" aria-label="${DZ_SEV[s.sev].l}">${DZ_SEV[s.sev].i}</span><span>${esc(dzCap1(s.text))}</span></li>`).join("")}</ul>`
    :`<p class="dzOk"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>Nothing to worry about. This will hold up.</p>`}`;}

/* ---- the element drawer (in the sheet) ---- */
function dzOpenDrawer(){
  const E=INK_SIM.ELEMENTS,dr=DZ.drawer,tagN={};
  for(const e of E)for(const t of e.tags)tagN[t]=(tagN[t]||0)+1;
  const tags=Object.keys(tagN).filter(t=>tagN[t]>=3).sort();
  openSheet("Add an element",`<div class="dzDrF">
<label>Style<select id="dzDrS"><option value="">All styles</option>${Object.values(INK_SIM.STYLES).map(s=>`<option value="${s.id}"${s.id===dr.style?" selected":""}>${esc(s.name)}</option>`).join("")}</select></label>
<label>Tag<select id="dzDrT"><option value="">Any tag</option>${tags.map(t=>`<option value="${t}"${t===dr.tag?" selected":""}>${esc(t.replace(/_/g," "))}</option>`).join("")}</select></label></div>
<div class="dzDrFam">${segHtml("dzDrFam",[["","All"],["motif","Motifs"],["lettering","Lettering"],["frame","Frames"],["fill","Fills"],["texture","Textures"]],dr.family)}</div>
<label class="dzSand"><input type="checkbox" id="dzDrSb"${DZ.sandbox?" checked":""}> Show all (sandbox: unlock every element for testing)</label>
<div class="dzDrG" id="dzDrG"></div>`);
  const grid=()=>dzDrawerGrid();
  $("dzDrS").addEventListener("change",e=>{dr.style=e.target.value;grid();});
  $("dzDrT").addEventListener("change",e=>{dr.tag=e.target.value;grid();});
  $("dzDrFam").addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b)return;dr.family=b.dataset.v;
    $("dzDrFam").querySelectorAll("button").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});grid();});
  $("dzDrSb").addEventListener("change",e=>{DZ.sandbox=e.target.checked;grid();});
  $("dzDrG").addEventListener("click",e=>{const t=e.target.closest(".dzTile");if(!t)return;const d=dzDef(t.dataset.id);
    if(!dzUnlocked(d)){toast("Unlocks at "+dzLockText(d));return;}closeSheet();dzAddEl(d);});
  grid();}
function dzDrawerGrid(){
  const dr=DZ.drawer,host=$("dzDrG");if(!host)return;
  const list=INK_SIM.ELEMENTS.filter(e=>(!dr.style||e.styles.includes(dr.style))&&(!dr.family||e.family===dr.family)&&(!dr.tag||e.tags.includes(dr.tag)));
  list.sort((a,b)=>(dzUnlocked(b)?1:0)-(dzUnlocked(a)?1:0));
  const sw=lw=>(0.7+lw*0.22).toFixed(2);
  host.innerHTML=list.length?list.map(e=>{const un=dzUnlocked(e),b=dzEB(e.id),s=Math.max(b.w,b.h),vx=b.x+b.w/2-s/2-4,vy=b.y+b.h/2-s/2-4;
    return`<button type="button" class="dzTile${un?"":" lock"}" data-id="${e.id}" aria-label="${esc(e.name)}${un?"":", locked: "+esc(dzLockText(e))}">
<svg viewBox="${dzR2(vx)} ${dzR2(vy)} ${dzR2(s+8)} ${dzR2(s+8)}" aria-hidden="true">${e.fill?`<path d="${e.fill}" fill="${DZ_INK}" fill-opacity="${e.fill===e.path?1:.35}"/>`:""}<path d="${e.path}" fill="none" stroke="${DZ_INK}" stroke-width="${dzR2(sw(e.lineWeightDefault)*s/100)}" stroke-linecap="round" stroke-linejoin="round"/></svg>
<b>${esc(e.name)}</b><small>${un?esc(e.family)+" · "+e.minSizeMm+" mm+":`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>${esc(dzLockText(e))}`}</small></button>`;}).join("")
    :`<p class="hint">Nothing matches those filters.</p>`;}
function dzAddEl(d){
  const box=dzBox(),mn=Math.min(box.wrapMm,box.lengthMm),n=DZ.m.els.length;
  const mm=clamp(Math.max(d.minSizeMm*1.15,mn*0.4),8,mn*0.9);
  const e={id:d.id,mx:box.wrapMm/2+(n%4)*6,my:box.lengthMm/2+(n%4)*6,mm,rot:0,lineWeight:d.lineWeightDefault,fill:d.fill?(d.fill===d.path?1:0.5):0,colour:null};
  dzChange(()=>{if(!n&&!d.styles.includes(DZ.m.style))DZ.m.style=d.styles[0];if(DZ.snap)dzSnapEl(e);DZ.m.els.push(e);DZ.sel=DZ.m.els.length-1;});
  if(DZ.view!=="board"){DZ.view="board";renderDesign();}
  else{const s=$("dzStyleSel");if(s)s.value=DZ.m.style;const c=$("dzClear");if(c)c.disabled=false;}}

/* ---- flash: the wall and your own ---- */
function dzSaveFlash(){
  if(!DZ.m.els.length){toast("Nothing on the board to save");return;}
  if(S.flash.length>=FLASH_MINE_CAP){toast(`Your flash book is full (${FLASH_MINE_CAP}). Delete one on the Flash tab first.`);return;}
  const nm=n=>{const q=/^([^:]+):\s*(.+)$/.exec(n);return q?q[2]+" "+q[1].toLowerCase():n;};   // "Script: Love" -> "Love script"
  const names=[...new Set(DZ.m.els.map(e=>nm(dzDef(e.id).name)))].slice(0,2).map((n,i)=>i&&!/script$/.test(n)?n.toLowerCase():n);
  let k=1;while(S.flash.some(f=>f.id==="mf"+k))k++;
  const d=dzToDesign();d.flash=null;
  S.flash.push({id:"mf"+k,name:names.join(" and "),design:d,w:S.week,y:S.year});save();
  toast("Saved to your flash");}
function dzFlashCard(f,mine){
  const m=dzFromDesign(f.design||f),sc=INK_SIM.scoreDesign(Object.assign({},f.design||f,{flash:f.id,placement:DZ.m.placement}),dzClient(),S.skills,{year:S.year,rate:S.rate>0?S.rate:undefined});
  const st=INK_SIM.STYLES[(f.design||f).style];
  return`<article class="dzFl"><div class="dzFlArt board">${dzMini(m,"")}</div>
<div class="dzFlTx"><h3>${esc(f.name)}</h3><p class="dzFlMeta">${esc(st?st.name:"")} · ${Math.round((f.design||f).sizeMm)} mm${mine?` · week ${f.w}, ${f.y}`:""}</p>
${f.note?`<p class="hint">${esc(f.note)}</p>`:""}
<p class="dzFlNum"><span>${sc.hours} h</span><span>${fmtMoney(sc.price)}</span><span>Read ${Math.round(sc.readability*100)}</span></p>
<div class="row"><button class="btn sm pri" data-use="${esc(f.id)}" aria-label="Use ${esc(f.name)} on the ${esc(INK_SIM.PLACEMENTS[DZ.m.placement].name)}">Use it</button>${mine?`<button class="btn sm" data-del="${esc(f.id)}" aria-label="Delete ${esc(f.name)} from your flash">Delete</button>`:""}</div></div></article>`;}
function dzRenderFlash(){
  const wall=INK_SIM.FLASH||[],mine=S.flash||[],off=Math.round((1-INK_SIM.FLASH_DISCOUNT.hours)*100);
  $("dzView").innerHTML=`<div class="card dzFlHd"><h2>Flash wall</h2><p class="hint">Drawn already, stencil ready: flash takes ${off}% fewer hours. Prices are for ${esc(dzClient().name)} on the ${esc(INK_SIM.PLACEMENTS[DZ.m.placement].name)}. Using one replaces the board (Undo brings it back).</p></div>
<div class="dzFls">${wall.map(f=>dzFlashCard(f,false)).join("")}</div>
<div class="card dzFlHd"><h2>My flash <span class="dzTag">${mine.length}/${FLASH_MINE_CAP}</span></h2><p class="hint">${mine.length?"Your own designs, saved from the board. They take the flash discount too.":"Nothing yet. On the board, Save to my flash keeps a design here; over the years it becomes your own wall."}</p></div>
<div class="dzFls">${mine.map(f=>dzFlashCard(f,true)).join("")}</div>`;
  $("dzView").addEventListener("click",e=>{
    const u=e.target.closest("[data-use]"),dl=e.target.closest("[data-del]");
    if(u){const f=wall.find(x=>x.id===u.dataset.use)||mine.find(x=>x.id===u.dataset.use);if(f)dzUseFlash(f);}
    if(dl){const i=mine.findIndex(x=>x.id===dl.dataset.del);if(i>=0){mine.splice(i,1);save();renderDesign();toast("Deleted from your flash");}}});}
function dzUseFlash(f){
  const src=JSON.parse(JSON.stringify(f.design||f)),box=dzBox();
  src.flash=f.id;src.pos={x:.5,y:.5};
  /* shrink it to fit the spot if it's bigger than the box */
  const fp=INK_SIM.footprintOf(src),fit=Math.min(1,box.wrapMm*0.92/(fp.w*src.sizeMm||1),box.lengthMm*0.92/(fp.h*src.sizeMm||1));
  if(fit<1&&!(src.elements||[]).some(e=>(dzDef(e.id).tags||[]).includes("band")))src.sizeMm*=fit;
  const before=DZ.cur;DZ.undo.push(JSON.stringify(DZ.m));DZ.redo.length=0;
  DZ.m=dzFromDesign(src,DZ.m.placement);DZ.sel=-1;DZ.prev=before;dzStore();
  DZ.view="board";renderDesign();$("panel").scrollTop=0;toast(`${f.name}: flash, ${Math.round((1-INK_SIM.FLASH_DISCOUNT.hours)*100)}% fewer hours`);}

/* ---- keyboard (desktop): arrows nudge, +/- size, [ ] turn, Delete, Ctrl+Z / Ctrl+Shift+Z ---- */
function dzKeysOnce(){
  if(DZ.keys)return;DZ.keys=true;
  document.addEventListener("keydown",ev=>{
    if(curTab!=="design"||DZ.view!=="board"||sheetOn())return;
    const t=ev.target,tag=t&&t.tagName;if(tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA")return;
    const k=ev.key,mod=ev.ctrlKey||ev.metaKey;
    if(mod&&(k==="z"||k==="Z")){ev.preventDefault();dzUndoRedo(!ev.shiftKey);return;}
    if(mod&&(k==="y"||k==="Y")){ev.preventDefault();dzUndoRedo(false);return;}
    const e=DZ.m.els[DZ.sel];if(!e||mod)return;
    const st=ev.shiftKey?5:1,mv={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[k];
    if(mv){ev.preventDefault();if(DZ.snap0==null)dzBegin();e.mx+=mv[0];e.my+=mv[1];dzMoveEl(DZ.sel);dzQueue();clearTimeout(DZ.kt);DZ.kt=setTimeout(()=>{dzEnd();dzRenderBoard();dzRenderTools();const g=document.querySelector(`#dzEls .dzEl[data-i="${DZ.sel}"]`);if(g)g.focus({preventScroll:true});},350);return;}
    const a={"+":"s+","=":"s+","-":"s-","_":"s-","]":"r+","[":"r-",Delete:"del",Backspace:"del"}[k];
    if(a){ev.preventDefault();dzTool(a);const g=document.querySelector(`#dzEls .dzEl[data-i="${DZ.sel}"]`);if(g)g.focus({preventScroll:true});}
    if(k==="Escape"&&DZ.sel>=0){dzSelect(-1);}
  });}
