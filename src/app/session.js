/* ===================== app/session.js: the Session tab, the chair (PR 4) =====================
   The tattoo session on top of sim/session.js (INK_SIM.sessionNew and friends). Four screens:
     the lobby    sittings due this week (booked from the Clients tab, with a design), a sample walk-in's piece waiting for its
                  next sitting, and Practice on fake skin (pick the board's design or a flash piece). The empty state says
                  "No one in the chair. Book a client from the Clients tab." with a Practice button.
     placement    drag the purple stencil on the client's body in 3D (PR 6: the one WebGL canvas is borrowed from the Studio
                  view), or on the flat placement box (fake skin, no WebGL, or the "Flat view" toggle, S.settings.flatStencil);
                  turn it 15 degrees a tap (INK_SIM.sessionRotate); flow and creases are re-checked (INK_SIM.stencilCheck).
     the chair    linework (plan Q4: trace-and-rhythm), then shading and colour zones. Four stacked canvases: base (skin and
                  the purple stencil), fill (shading and colour), ink (the lines you lay, drawn bit by bit from your finger)
                  and overlay (the pacing marker, the finger dot; only the rectangles that changed are cleared). The frame loop
                  runs only while a finger is down, capped at SE_FPS (30 on Lite). With reduced motion the marker is a static
                  highlight of the next stretch of line. Meters: steady hand (pace ratio against the band), pain and fatigue
                  (bars with notches, a hatch or dot pattern and an icon, so they read without colour), and the saturation
                  meter in zones. Break, Numb (costs rubles) and Chat sit on a rail on your free hand's side (Settings ›
                  Session › Handedness). Liner chips say what each needle lays ("lays 1–5RL").
     results      the sitting's numbers, XP, money and what happens next.
   Where the work comes from:
     booked       sessionStartBooked(item), called by the Clients tab (app/clients.js clSession). Progress between sittings
                  rides on the queue item (item.progress, numbers only); INK_SIM.finishSession books the next sitting or makes
                  the piece and pays. A last sitting cut short (pain or fatigue) keeps the item and moves it a week, unpaid.
     sample       "Tattoo this" on the Design tab with a sample walk-in: a one-off test. Pays SE_PAY.sample of the price per
                  sitting; the next sitting can start straight away (S.session.next) since sample clients aren't on the calendar.
     practice     fake skin: no pain, no fatigue, no money, no piece, only XP (SKILL_XP.practice).
   0.1.16.0, the offset machine and the close-up view:
     holding      by default (S.settings.needle "offset") a touch on the skin puts a drawn machine in your hand (#sePen, a
                  DOM svg moved with a transform, shaped like the kit's coil, rotary or pen) with its needle SE_PEN.dy px
                  above your finger and a little to the side away from your drawing hand, a ring and crosshair on the tip.
                  Everything the sim hears (penDown/penMove/penUp) is the TIP's position, never the finger's. A line starts
                  when you slide the tip onto the dot (penDown is tried at every move until it lands inside the sim's start
                  tolerance), so a touch beside the dot is not a miss. "Needle under finger" in Settings › Session
                  ("direct") is the old way: the needle is the fingertip and a touch off the dot is a nudge.
     close-up     the canvases sit in a camera (#seCam): the view fits the current line or zone into the part of the skin
                  the tip can reach (SE.R, seFrameTarget, SE_ZOOM; up to SE_ZOOM.max times the whole-sitting fit) and
                  re-centres between lines, never while the needle is down, so the sim's millimetres never move under your
                  finger. The re-centre is a short CSS move of the camera then one redraw at the new scale (a jump with
                  reduced motion). The Whole / Close up button, or a two-finger pinch while no line is being drawn,
                  switches views. The ink laid on the current line is kept as segments (SE.laid) so a redraw keeps its
                  rushed and blown-out marks.
   0.1.21.0, aim before the machine starts: a finger going down aims, it doesn't ink. For SE_ARM.ms (SE_ARM.rearm when the
                  line or zone is already started) the needle (or, with "Needle under finger", the #seAim reticle at the
                  fingertip) follows the finger as a hollow, dashed outline while a ring fills round the tip; nothing reaches
                  the sim (no penDown, no pace marker, no buzz), though the dot still lights when the tip is near it. Then
                  the machine arms (seArm): a short pulse, the solid "on" pen, penDown at the tip where it is, and the old
                  flow from there (a line still starts once the tip is on the dot; the buzz spins up, sound/synth.js
                  BUZZ.spin). A lift before that inks nothing and says so; a two-finger pinch cancels the aim. With reduced
                  motion the ring is a static dashed circle and there is no pulse; the timer is the same.
   S.session = {live: the sitting in progress (the sim's object: numbers and short strings, saved at every finger lift and
   every action, so a reload resumes it), next: a sample piece waiting for its next sitting}. A finished piece gets heal:null
   and healDue {w, y} SE_HEAL_WEEKS on (PR 5 shows the heal). window.__inkSessFps() reports the loop's frame rate. */
const SE_PAY={sample:0.35};          // a sample walk-in pays you this share of the price, split across its sittings (the shop keeps the rest)
const SE_HEAL_WEEKS=2;               // the heal is due this many weeks after the last sitting
const SE_FPS={lite:30,full:60,ultra:60};
const SE_DPR={lite:1.5,full:2,ultra:2.5};
const SE_SKIN=[[0,[243,217,192]],[0.35,[217,169,130]],[0.65,[168,113,74]],[1,[91,58,38]]];   // skin tone 0..1 to a colour
const SE_FAKE=[236,214,186];         // practice skin: a pale rubber pad
const SE_STENCIL={light:"#6a3fc8",dark:"#cbb6ff",w:1.1,cur:2.4,alpha:0.7};
const SE_LAYOUT={rail:56,minH:240,maxH:620,chrome:310,ahead:0.8};   // px; ahead = seconds of line the reduced-motion highlight shows
/* the offset machine (0.1.16.0), CSS px: the needle tip sits dy above the finger and dx to the side away from the drawing
   hand; pad keeps the work that far inside the skin the tip can reach; near = how many start tolerances away the dot lights up */
const SE_PEN={dy:68,dx:24,pad:10,near:3};
/* the close-up view: at most max times the whole-sitting fit; a line or zone is framed with padMm round it and at least
   minMm (or minShare of the sitting's size) across; anim = ms for the re-centre; top = px kept clear for the view button
   in direct mode; pinch = the spread (or squeeze) ratio that switches views */
/* aim before the machine starts (0.1.21.0), ms: a touch aims for ms (rearm when the current line or zone is already under
   way, so lifting and carrying on is quicker), then the machine arms; go = how long the switch pulse shows */
const SE_ARM={ms:900,rearm:450,go:320};
const SE_ZOOM={max:3,minMm:16,minShare:0.3,padMm:4,anim:260,top:52,pinch:1.25};
const SE_CHAT=["They tell you the bridges went up before they could get home last night. Two hours on the wrong bank.",
  "Talk turns to the canal ice. Nobody on the embankment trusts it before January.",
  "They ask how long you've been at this. Long enough to stop shaking, you say.",
  "A long story about their grandmother's tram route out on the ring road.",
  "You compare notes on the best dumplings near the market by the river.",
  "They want to know what the flash wall looked like when the shop opened."];
const SE_ICON={
  pain:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  fatigue:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  breakB:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3v3M12 3v3"/></svg>',
  numb:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v4l2 3v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V10l2-3z"/><path d="M7 13h10"/></svg>',
  chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  stop:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
  needle:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 15 9"/><path d="M13 7l4 4"/><path d="M16 4l4 4-2 2-4-4z"/></svg>',
  zoomOut:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  zoomIn:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8v6M8 11h6"/></svg>'};
/* the machine in your hand, drawn with its needle tip at (0,0) and the body running down +y towards the finger (about
   y 68). Shared: the tip ring and crosshair, the needle and the nozzle; the body per kind. Mirrored for the left hand */
const SE_MACHINE={
  coil:'<path class="body" d="M-6 30h12l1 56h-14z"/><path class="body" d="M7 38h8v58h-8"/><rect class="body" x="10" y="48" width="12" height="16" rx="3"/><rect class="body" x="10" y="68" width="12" height="16" rx="3"/><path class="cord" d="M0 86c0 22 6 34 18 52"/>',
  rotary:'<path class="body" d="M-6 30h12l2 46h-16z"/><rect class="body" x="-10" y="76" width="20" height="52" rx="9"/><path class="line" d="M-10 92h20"/><path class="cord" d="M0 128c0 10 4 18 12 26"/>',
  pen:'<rect class="body" x="-5.5" y="30" width="11" height="104" rx="5.5"/><path class="line" d="M-5.5 100h11M-5.5 104h11"/>'};
function seMachineKind(sess){const k=sess&&sess.kit,m=k&&INK_SIM.MACHINES[k.machine];return m&&SE_MACHINE[m.kind]?m.kind:"coil";}
function seMachineSvg(kind,left){
  return`<svg viewBox="-34 -22 68 182" width="68" height="182" style="left:-34px;top:-22px"${left?' class="lh"':""} aria-hidden="true"><g class="kind">${SE_MACHINE[kind]||SE_MACHINE.coil}</g>
<path class="noz" d="M-3 15h6l3 15h-12z"/><path class="ndl" d="M0 3v12"/>
<circle class="ringW" r="11"/><circle class="ring" r="11"/><path class="ring" d="M0-14v-6M-14 0h-6M14 0h6"/><circle class="tip" r="1.6"/>
<circle class="armT" r="17"/><circle class="arm" r="17" pathLength="100" transform="rotate(-90)"/><circle class="goR" r="11"/></svg>`;}
/* the aim reticle for "Needle under finger": a hollow crosshair at the fingertip with the same filling ring */
const SE_RETICLE=`<svg viewBox="-26 -26 52 52" width="52" height="52" style="left:-26px;top:-26px" aria-hidden="true"><circle class="ringW" r="12"/><circle class="ring" r="12"/>
<path class="ringW" d="M0-6v-12M0 6v12M-6 0h-12M6 0h12"/><path class="ring" d="M0-6v-12M0 6v12M-6 0h-12M6 0h12"/><circle class="armT" r="19"/><circle class="arm" r="19" pathLength="100" transform="rotate(-90)"/><circle class="goR" r="12"/></svg>`;
const SE={sess:null,result:null,pick:"",place:null,c:null,v:null,s:1,ox:0,oy:0,dpr:1,down:null,q:[],fillDirty:false,baseDirty:false,
  raf:0,lastF:0,frames:0,fpsT:0,fpsN:0,dirty:[],r:0,rushed:false,live:null,stopArm:0,stopT:0,status:"",ro:null,
  hold:null,aim:null,laid:null,zoomOut:false,anim:null,R:null,tox:0,toy:0,ptrs:new Map(),pinch:null};

/* ---- small helpers ---- */
function seSlot(){if(!S.session||typeof S.session!=="object")S.session={live:null,next:null};return S.session;}
function seLive(){return S.session&&S.session.live||null;}
function seOffset(){return S.settings.needle!=="direct";}
function seReduced(){return!!S.settings.reduced||(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);}
function seRgb(c){return`rgb(${c.map(Math.round).join(",")})`;}
function seSkinRgb(t,practice){if(practice)return SE_FAKE;t=clamp(t==null?0.3:t,0,1);
  for(let i=1;i<SE_SKIN.length;i++){const a=SE_SKIN[i-1],b=SE_SKIN[i];if(t<=b[0]){const k=(t-a[0])/(b[0]-a[0]);return a[1].map((v,j)=>v+(b[1][j]-v)*k);}}
  return SE_SKIN[SE_SKIN.length-1][1];}
function seColHex(c){const C=INK_SIM.COLOURS[c||"black"];return C?C.hex:DZ_INK;}
function seWeek(o){return INK_SIM.weekFrom(INK_SIM.weekIndex(S.week,S.year)+o);}
function seDue(q){return q.kind==="session"&&INK_SIM.weekIndex(q.w,q.y)<=INK_SIM.weekIndex(S.week,S.year);}
function seHasDesign(d){return!!(d&&Array.isArray(d.elements)&&d.elements.length);}
function seOpts(){return{skills:S.skills,kit:S.kit,settings:{assist:!!S.settings.assist},year:S.year,week:S.week};}
function sePct(v){return Math.round(clamp(v||0,0,1)*100)+"%";}
function seItemCounts(sess){const plan=INK_SIM.sessionPlan(sess);let line=0,shade=0,colour=0;
  for(let i=sess.start;i<sess.end;i++){const k=plan.items[i].k;if(k==="line")line++;else if(k==="shade")shade++;else colour++;}return{line,shade,colour,plan};}
/* the elements of a design in placement millimetres (the same transform as the board and sim/session.js) */
function seEls(design,box){const sz=design.sizeMm||50,pos=design.pos||{x:.5,y:.5},fp=INK_SIM.footprintOf(design);
  return(design.elements||[]).filter(e=>INK_SIM.elementById(e.id)).map(e=>({id:e.id,mx:pos.x*box.wrapMm+((e.x!=null?e.x:.5)-fp.cx)*sz,my:pos.y*box.lengthMm+((e.y!=null?e.y:.5)-fp.cy)*sz,
    mm:(e.scale!=null?e.scale:.5)*sz,rot:e.rot||0,lineWeight:e.lineWeight||7,fill:e.fill||0,colour:e.colour||null}));}
/* a finished-looking render of a design on skin, fitted to the piece; soft when the lines were poor */
function seRender(design,skin,out,bodyShape){
  const box=INK_SIM.placementBox(design.placement,bodyShape)||{wrapMm:100,lengthMm:200},els=seEls(design,box);
  if(!els.length)return"";
  const sz=design.sizeMm||50,pos=design.pos||{x:.5,y:.5},cx=pos.x*box.wrapMm,cy=pos.y*box.lengthMm,pad=sz*0.12;
  const blur=out?Math.max(0,(0.9-out.lineQuality)*1.6):0,op=out?0.55+0.45*out.saturation:1;
  return`<svg class="seRen" viewBox="${dzR2(cx-sz/2-pad)} ${dzR2(cy-sz/2-pad)} ${dzR2(sz+2*pad)} ${dzR2(sz+2*pad)}" style="background:${seRgb(skin)}" aria-hidden="true"><g style="opacity:${dzR2(op)};${blur>0.05?`filter:blur(${dzR2(blur*sz/100)}px)`:""}">${els.map(e=>dzElSvg(e,design.style)).join("")}</g></svg>`;}

/* ---- starting a sitting ---- */
function seBegin(sess){
  const slot=seSlot();slot.live=sess;SE.sess=sess;SE.result=null;SE.status="";SE.place=null;SE.laid=null;
  if(sess.kind==="practice")INK_SIM.sessionStart(sess);
  save();INK_SOUND.init();
  if(curTab!=="session")showTab("session");else renderSession();
  $("panel").scrollTop=0;}
function seBusy(){const L=seLive();if(!L)return false;toast("Finish the sitting in the chair first");if(curTab!=="session")showTab("session");return true;}
/* a booked sitting (the Clients tab's Start session button) */
function sessionStartBooked(q){
  if(!q)return;const L=seLive();
  if(L){if(L.itemId===q.id){showTab("session");return;}seBusy();return;}
  if(!seHasDesign(q.design)){toast("Design it first");return;}
  const c=INK_SIM.findClient(S,q.client);if(!c){toast("That client isn't on your books");return;}
  const sess=INK_SIM.sessionNew(Object.assign(seOpts(),{design:q.design,client:c,kind:"booked",itemId:q.id,part:q.sessionNo||1,partsTotal:q.sessions||1,
    progress:q.progress||null,bodyShape:c.bodyShape||"neutral",skinTone:c.skinTone!=null?c.skinTone:0.3}));
  seBegin(sess);}
/* "Tattoo this" on the board: the booking it's designing for, or else a sample walk-in */
function seTattooThis(){
  if(seBusy())return;
  const d=dzToDesign();if(!d.elements.length){toast("Put something on the board first");return;}
  if(S.board.item){const q=S.queue.find(x=>x.id===S.board.item);
    if(q){q.design=d;dzStore();
      if(!seDue(q)){toast(`Their sitting is week ${q.w}, ${q.y}. Saved to the booking.`);return;}
      return sessionStartBooked(q);}}
  const c=dzClient(),slot=seSlot();
  if(slot.next)toast("The unfinished sample piece is set aside");
  slot.next=null;
  seBegin(INK_SIM.sessionNew(Object.assign(seOpts(),{design:d,client:c,kind:"sample",bodyShape:S.board.bodyShape||c.bodyShape,skinTone:S.board.skinTone!=null?S.board.skinTone:c.skinTone})));}
function seContinueSample(){
  if(seBusy())return;const slot=seSlot(),n=slot.next;if(!n)return;
  const c=DZ_SAMPLE_CLIENTS.find(x=>x.id===n.client)||DZ_SAMPLE_CLIENTS[0];
  slot.next=null;
  seBegin(INK_SIM.sessionNew(Object.assign(seOpts(),{design:n.design,client:c,kind:"sample",part:n.part,partsTotal:n.partsTotal,progress:n.progress,bodyShape:n.bodyShape,skinTone:n.skinTone})));}
/* practice on fake skin: the board's design or a flash piece */
function sePracticeDesigns(){
  const out=[];const d=typeof DZ!=="undefined"&&DZ.m?dzToDesign():S.board.design;
  if(seHasDesign(d))out.push({id:"board",name:"What's on the board",design:d});
  for(const f of INK_SIM.FLASH)out.push({id:f.id,name:f.name,design:{placement:f.placement,style:f.style,flash:f.id,sizeMm:f.sizeMm,pos:{x:.5,y:.5},elements:f.elements}});
  return out;}
function seStartPractice(id){
  if(seBusy())return;
  const all=sePracticeDesigns(),p=all.find(x=>x.id===id)||all.find(x=>x.id==="fl_moon")||all[0];if(!p)return;
  seBegin(INK_SIM.sessionNew(Object.assign(seOpts(),{design:p.design,client:null,kind:"practice",bodyShape:"neutral",skinTone:0.2})));}

/* ---- the tab ---- */
function renderSession(){
  const host=$("sessionBody");
  if(typeof INK_SIM.sessionNew!=="function"){host.innerHTML=`<div class="card"><p class="hint">The session model isn't in this build.</p></div>`;return;}
  seStopLoop();
  const L=seLive();
  if(L){if(SE.sess!==L){SE.sess=INK_SIM.sessionResume(L);SE.place=null;}
    return L.phase==="place"?seRenderPlace():seRenderChair();}
  SE.sess=null;
  if(SE.result)return seRenderResult();
  seRenderLobby();}

/* ---- the lobby ---- */
function seRenderLobby(){
  const host=$("sessionBody"),slot=seSlot();
  const due=S.queue.filter(seDue).sort((a,b)=>INK_SIM.weekIndex(a.w,a.y)-INK_SIM.weekIndex(b.w,b.y));
  const n=slot.next,picks=sePracticeDesigns();
  if(!picks.some(p=>p.id===SE.pick))SE.pick=picks.some(p=>p.id==="board")?"board":"fl_moon";
  const K=INK_SIM.kitClean(S.kit),M=INK_SIM.MACHINES[K.machine],I=INK_SIM.INKS[K.ink];
  let h=`<div class="se">`;
  if(due.length)h+=`<div class="card"><h2>In the chair this week</h2>${due.map(q=>{const c=INK_SIM.findClient(S,q.client),ready=seHasDesign(q.design);
    return`<div class="seDue"><div class="seDueT"><b>${esc(c?c.name:"A client")}</b><span class="clMeta">${ready?esc(INK_SIM.pieceLabel(q.design)):"needs a design"} · sitting ${q.sessionNo||1} of ${q.sessions||1}${q.progress?" · carrying on":""}</span></div>
${ready?`<button class="btn sm pri" data-seq="${q.id}">Start</button>`:`<button class="btn sm" data-sedz="${q.id}">Design it</button>`}</div>`;}).join("")}</div>`;
  if(n){const c=DZ_SAMPLE_CLIENTS.find(x=>x.id===n.client);
    h+=`<div class="card seNext"><h2>Unfinished</h2><div class="seNextB">${seRender(n.design,seSkinRgb(n.skinTone),null,n.bodyShape)}<div><p><b>${esc(c?c.name:"A walk-in")}</b>'s ${esc(INK_SIM.pieceLabel(n.design))}</p>
<p class="clMeta">Sitting ${n.part} of ${n.partsTotal}. A sample walk-in: they can sit again straight away.</p>
<div class="row"><button class="btn sm pri" id="seCont">Next sitting</button><button class="btn sm" id="seDrop">Let it go</button></div></div></div></div>`;}
  if(!due.length&&!n)h+=`<div class="card empty"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="9" rx="1.5"/><path d="M10.5 12v4h3v-4"/><path d="M12 16v5"/><path d="M15 6h3a2 2 0 0 1 0 4h-3"/></svg>
<p><b>No one in the chair.</b></p><p>Book a client from the Clients tab.</p>
<div class="row" style="justify-content:center"><button class="btn pri" id="sePracQ">Practice on fake skin</button><button class="btn" id="toClients">Go to Clients</button></div></div>`;
  h+=`<div class="card" id="sePracCard"><h2>Practice on fake skin</h2><p class="hint" style="margin-top:0">A rubber pad on the bench: no client, no pain, no money. Every line still teaches your hand.</p>
<div class="row"><label class="seGrow"><span>Design</span><select id="sePick">${picks.map(p=>`<option value="${p.id}"${p.id===SE.pick?" selected":""}>${esc(p.name)}</option>`).join("")}</select></label>
<button class="btn pri" id="sePrac">Start practice</button></div></div>
<div class="card seKitLine"><span class="clK">Your kit</span><p>${esc(M.name)} · ${K.needles.join(" ")} · ${esc(I.name)} ink · ${K.voltage} V</p><button class="btn sm" id="seKit">Change in Studio</button></div></div>`;
  host.innerHTML=h;
  host.querySelectorAll("[data-seq]").forEach(b=>b.addEventListener("click",()=>{const q=S.queue.find(x=>x.id===b.dataset.seq);if(q)sessionStartBooked(q);}));
  host.querySelectorAll("[data-sedz]").forEach(b=>b.addEventListener("click",()=>clDesignFor(b.dataset.sedz)));
  const on=(id,fn)=>{const e=$(id);if(e)e.addEventListener("click",fn);};
  on("seCont",seContinueSample);
  on("seDrop",()=>{seSlot().next=null;save();toast("Let it go");renderSession();});
  on("sePracQ",()=>seStartPractice(SE.pick));on("sePrac",()=>seStartPractice(SE.pick));
  on("toClients",()=>showTab("clients"));on("seKit",()=>showTab("studio"));
  $("sePick").addEventListener("change",e=>{SE.pick=e.target.value;});}

/* ---- placement: drag the stencil, re-check flow and creases ---- */
function seRenderPlace(){
  const sess=SE.sess,host=$("sessionBody"),d=sess.design,P=INK_SIM.PLACEMENTS[d.placement];
  const box=INK_SIM.placementBox(d.placement,sess.bodyShape)||{wrapMm:100,lengthMm:200},W=box.wrapMm,L=box.lengthMm;
  const chk=SE.place||(SE.place=INK_SIM.stencilCheck(d,sess.client?Object.assign({},sess.client,{bodyShape:sess.bodyShape,skinTone:sess.skinTone}):null,sess.skills));
  const mx=W*0.12,my=L*0.05,skin=seSkinRgb(sess.skinTone),dark=sess.skinTone>0.6;
  const els=seEls(d,box),sw=INK_SIM.lineMm(5);
  /* PR 6: on a client the stencil goes on the 3D body (fake skin stays flat); Settings keeps the flat box as a fallback */
  const can3d=sess.kind!=="practice"&&typeof stGl==="function"&&stGl(),in3d=can3d&&!S.settings.flatStencil;
  host.innerHTML=`<div class="se">${seTopHtml(sess)}
<div class="card"><h2>Place the stencil</h2><p class="hint" style="margin-top:0">Drag it where it sits best on the ${esc(P?P.name.toLowerCase():"skin")}${in3d?"; drag off it to look around":""}. Flow and creases are checked again.</p>
${in3d?`<div class="sePlace3d" id="sePlace3d"></div>`:`<div class="sePlaceWrap"><svg id="sePlace" class="sePlace" viewBox="${dzR2(-mx)} ${dzR2(-my)} ${dzR2(W+2*mx)} ${dzR2(L+2*my)}" role="application" aria-label="Stencil on the ${esc(P?P.name:"skin")}, drag to move">
<rect x="0" y="0" width="${W}" height="${L}" rx="${dzR2(Math.min(W,L)*0.12)}" fill="${seRgb(skin)}"/>
<g class="seFlow">${(P?P.flow:[]).map(line=>`<polyline points="${line.map(q=>dzR2(q[0]*W)+","+dzR2(q[1]*L)).join(" ")}"/>`).join("")}</g>
${(P&&P.creases||[]).map(c=>`<line class="seCrease" x1="0" x2="${W}" y1="${dzR2(c.at*L)}" y2="${dzR2(c.at*L)}"/><text class="seCreaseT" x="${dzR2(W/2)}" y="${dzR2(c.at*L-2)}" font-size="${dzR2(Math.max(4,W*0.06))}" text-anchor="middle">${esc(c.name)}</text>`).join("")}
<g id="sePlaceG" class="seStencilG" style="color:${dark?SE_STENCIL.dark:SE_STENCIL.light}">${els.map(e=>{const df=INK_SIM.elementById(e.id),b=dzEB(e.id),k=e.mm/Math.max(b.w,b.h,1e-6);
    return`<g transform="${dzTf(e)}"><path d="${df.path}" fill="none" stroke="currentColor" stroke-width="${dzR4(sw/k)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;}).join("")}</g></svg></div>`}
<div class="row seRot"><button class="btn sm" data-serot="-15" aria-label="Turn the stencil 15 degrees anticlockwise">⟲ 15°</button><button class="btn sm" data-serot="15" aria-label="Turn the stencil 15 degrees clockwise">⟳ 15°</button>
${can3d?`<button class="btn sm" id="seFlat" aria-pressed="${!in3d}">${in3d?"Flat view":"3D view"}</button>`:""}</div>
<div class="seChk" id="seChk">${seChkHtml(chk)}</div>
<div class="row"><button class="btn pri" id="seGo">${INK_SIM.sessionItem(sess)&&INK_SIM.sessionItem(sess).k==="line"?"Start lining":"Start"}</button><button class="btn" id="seCancel">Not now</button></div></div></div>`;
  $("seGo").addEventListener("click",()=>{INK_SIM.sessionStart(sess);save();INK_SOUND.tick();renderSession();});
  $("seCancel").addEventListener("click",seCancel);
  host.querySelectorAll("[data-serot]").forEach(b=>b.addEventListener("click",()=>{SE.place=INK_SIM.sessionRotate(sess,+b.dataset.serot);save();INK_SOUND.tick();
    if(in3d){seChkUpdate();se3dStencil(sess);}else seRenderPlace();}));
  const fb=$("seFlat");if(fb)fb.addEventListener("click",()=>{S.settings.flatStencil=in3d;save();INK_SOUND.tick();seRenderPlace();});
  if(in3d){se3dPlace(sess);return;}
  /* drag */
  const svg=$("sePlace"),g=$("sePlaceG");let drag=null;
  const pt=ev=>{const m=svg.getScreenCTM();if(!m)return{x:0,y:0};const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;const q=p.matrixTransform(m.inverse());return{x:q.x,y:q.y};};
  svg.addEventListener("pointerdown",ev=>{drag={p:pt(ev),pos:Object.assign({},d.pos||{x:.5,y:.5}),dx:0,dy:0};svg.setPointerCapture(ev.pointerId);ev.preventDefault();});
  svg.addEventListener("pointermove",ev=>{if(!drag)return;const p=pt(ev);drag.dx=p.x-drag.p.x;drag.dy=p.y-drag.p.y;g.setAttribute("transform",`translate(${dzR2(drag.dx)} ${dzR2(drag.dy)})`);});
  const end=()=>{if(!drag)return;const dr=drag;drag=null;if(Math.abs(dr.dx)+Math.abs(dr.dy)<0.5){g.removeAttribute("transform");return;}
    SE.place=INK_SIM.sessionPlace(sess,{x:dr.pos.x+dr.dx/W,y:dr.pos.y+dr.dy/L});saveSoon();seRenderPlace();};
  svg.addEventListener("pointerup",end);svg.addEventListener("pointercancel",end);}
function seChkHtml(chk){
  return`<span class="seChkFlow">Flow ${Math.round((chk.flow||0)*100)}</span>${chk.issues.length?chk.issues.map(i=>`<p class="seIss ${i.sev>=3?"crit":"warn"}"><span aria-hidden="true">${i.sev>=3?"▲":"●"}</span> ${esc(dzCap1(i.text))}</p>`).join(""):`<p class="seIss ok"><span aria-hidden="true">✓</span> No creases or flow problems here.</p>`}`;}
function seChkUpdate(){const e=$("seChk");if(e&&SE.place)e.innerHTML=seChkHtml(SE.place);}
/* the 3D placement: the client on the chair with their other pieces, the purple stencil on the limb. A drag on the stencil
   moves it live (raycast to the body's UV, then placement mm, in vis/core.js); letting go places it in the sim, which
   re-checks flow and creases. A drag off the stencil orbits the camera */
function se3dStencil(sess){
  const h=(pos,ph)=>{if(ph==="move"){INK_VIS.setStencil(Object.assign({},sess.design,{pos}),{drag:h});return;}
    SE.place=INK_SIM.sessionPlace(sess,pos);saveSoon();seChkUpdate();INK_VIS.setStencil(sess.design,{drag:h});};
  INK_VIS.setStencil(sess.design,{drag:h});}
function se3dPlace(sess){
  const el=$("sePlace3d");if(!el||!INK_VIS.mount(el))return;
  const tone=sess.skinTone!=null?sess.skinTone:0.3,d=sess.design;
  INK_VIS.setClient({bodyShape:sess.bodyShape||"neutral",skinTone:tone,skin:stSkin(tone)});
  const c=sess.client;INK_VIS.setTattoos(c&&c.id?stTattoos({id:c.id,tone,sun:(c.traits||{}).sun}):[]);
  se3dStencil(sess);
  INK_VIS.setView("stencil",{placement:d.placement,size:d.sizeMm});}
function seCancel(){
  const sess=SE.sess;if(!sess)return;
  if(sess.next>sess.start||sess.cur){toast("You've started: end the sitting instead");return;}
  seSlot().live=null;SE.sess=null;save();toast(sess.kind==="practice"?"Pad back on the shelf":"Not now. The booking stays.");renderSession();}

/* ---- the chair ---- */
function seTopHtml(sess){
  const cnt=seItemCounts(sess),it=INK_SIM.sessionItem(sess),practice=sess.kind==="practice";
  const done=sess.next-sess.start,tot=sess.end-sess.start;
  const who=practice?"Fake skin":esc(sess.client?sess.client.name:"Client");
  const tag=practice?"Practice":sess.kind==="sample"?"Sample walk-in":"Booked";
  return`<div class="card seTop"><div class="seTopT"><span class="clK">${tag}</span><b>${who}</b><span class="clMeta">${esc(INK_SIM.pieceLabel(sess.design))}${sess.partsTotal>1?` · sitting ${sess.part} of ${sess.partsTotal}`:""}</span>
<span class="seProg" id="seProg">${seProgText(sess,it,done,tot,cnt)}</span></div>
${practice?"":`<div class="seMeters">${seMeterHtml("pain","Pain",sess.m.pain)}${seMeterHtml("fatigue","Fatigue",sess.m.fatigue)}</div>`}</div>`;}
function seProgText(sess,it,done,tot,cnt){
  if(!it)return`${tot} of ${tot} done`;
  const k=it.k==="line"?"Line":it.k==="shade"?"Shading":"Colour";
  return`${k} · ${done+1} of ${tot} · ${(sess.m.clock).toFixed(1)} h`;}
function seMeterHtml(k,label,v){v=clamp(v||0,0,1);
  return`<div class="seMeter ${k}${v>=0.75?" hi":""}" id="seM_${k}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v*100)}">
<span class="seMI">${SE_ICON[k]}</span><span class="seML">${label}</span><span class="seMB"><i style="width:${(v*100).toFixed(1)}%"></i><s></s></span><span class="seMV">${Math.round(v*100)}</span><span class="seWarn" aria-hidden="true">!</span></div>`;}
function seRenderChair(){
  const sess=SE.sess,host=$("sessionBody"),practice=sess.kind==="practice",hand=S.settings.handed==="left"?"left":"right";
  const numbCost=Math.round(INK_SIM.NUMB.price*INK_SIM.priceIndex(sess.year)/10)*10;
  const rail=practice?`<button class="seAct" id="seStop" aria-label="End practice">${SE_ICON.stop}<span>End</span></button>`
    :`<button class="seAct" id="seBreak" aria-label="Break">${SE_ICON.breakB}<span>Break</span></button>
<button class="seAct" id="seNumb" aria-label="Numbing cream, ${fmtMoney(numbCost)}">${SE_ICON.numb}<span>Numb</span><em>${fmtMoney(numbCost)}</em></button>
<button class="seAct" id="seChat" aria-label="Chat">${SE_ICON.chat}<span>Chat</span></button>
<button class="seAct" id="seStop" aria-label="End the sitting">${SE_ICON.stop}<span>End</span></button>`;
  host.innerHTML=`<div class="se" data-hand="${hand}">${seTopHtml(sess)}
<div class="seStage"><div class="seRail" role="group" aria-label="Client care">${rail}</div>
<div class="seWrap" id="seWrap" data-needle="${seOffset()?"offset":"direct"}"><div class="seCam" id="seCam"><canvas id="seBase"></canvas><canvas id="seFill"></canvas><canvas id="seInk"></canvas><canvas id="seOver" aria-label="${seOffset()?"Skin: hold the machine and bring the needle onto the dot":"Skin: trace the stencil"}" role="img"></canvas>
<div class="seDot" id="seDot" aria-hidden="true"></div></div>
<button type="button" class="seZoomB" id="seZoom" aria-pressed="${SE.zoomOut}">${seZoomLbl()}</button>
<div class="seAim" id="seAim" hidden aria-hidden="true">${SE_RETICLE}</div>
<div class="sePen" id="sePen" hidden aria-hidden="true">${seMachineSvg(seMachineKind(sess),hand==="left")}</div></div></div>
<div class="seUnder"><div id="seGauge"></div><p class="seStatus" id="seStatus" role="status" aria-live="polite"></p><div class="seTools" id="seTools"></div></div></div>`;
  const on=(id,fn)=>{const e=$(id);if(e)e.addEventListener("click",fn);};
  on("seBreak",()=>seAction("break"));on("seNumb",()=>seAction("numb"));on("seChat",()=>seAction("chat"));on("seStop",seStopTap);
  on("seZoom",()=>seZoomToggle());SE.ptrs.clear();SE.pinch=null;SE.hold=null;if(SE.aim){clearTimeout(SE.aim.timer);SE.aim=null;}
  seLayout();seRenderUnder();seWireCanvas();
  const wrap=$("seWrap");
  if(window.ResizeObserver){if(SE.ro)SE.ro.disconnect();let w0=wrap.clientWidth;SE.ro=new ResizeObserver(()=>{if(Math.abs(wrap.clientWidth-w0)>2&&$("seWrap")===wrap){w0=wrap.clientWidth;seLayout();}});SE.ro.observe(wrap);}
  if(sess.stop)setTimeout(()=>{if(SE.sess===sess&&!SE.down)seEnd();},400);}
/* canvas sizes, the part of the skin the needle tip can reach (SE.R), then the camera (SE.s, SE.ox, SE.oy) and a full redraw.
   In offset mode the tip rides SE_PEN.dy above the finger, so the skin is taller by about that and nothing is framed in
   the bottom band the tip can't reach; in direct mode the top strip stays clear for the view button */
function seLayout(){
  const sess=SE.sess,wrap=$("seWrap");if(!sess||!wrap)return;
  seAnimDone(true);
  const v=sess.view,cw=Math.max(160,wrap.clientWidth),off=seOffset(),P=SE_PEN;
  const tox=off?(S.settings.handed==="left"?1:-1)*P.dx:0,toy=off?-P.dy:0,top=off?0:SE_ZOOM.top,extra=off?P.dy:top;
  const fitW=cw-Math.abs(tox)-2*P.pad;
  const ch=Math.round(clamp(Math.min(innerHeight-SE_LAYOUT.chrome+extra*0.5,fitW*v.h/v.w*1.05+8+extra),SE_LAYOUT.minH+extra*0.5,SE_LAYOUT.maxH));
  wrap.style.height=ch+"px";
  const tier=perfTier(),dpr=Math.min(window.devicePixelRatio||1,SE_DPR[tier]||1.5);
  SE.dpr=dpr;SE.v=v;SE.cw=cw;SE.ch=ch;SE.tox=tox;SE.toy=toy;
  const x0=Math.max(0,tox),x1=Math.min(cw,cw+tox),y0=Math.max(top,toy),y1=Math.min(ch,ch+toy);
  SE.R={x:x0+P.pad,y:y0+P.pad,w:Math.max(40,x1-x0-2*P.pad),h:Math.max(40,y1-y0-2*P.pad)};
  SE.c={};for(const k of ["Base","Fill","Ink","Over"]){const c=$("se"+k);c.width=Math.round(cw*dpr);c.height=Math.round(ch*dpr);c.style.width=cw+"px";c.style.height=ch+"px";
    const x=c.getContext("2d");x.setTransform(dpr,0,0,dpr,0,0);SE.c[k.toLowerCase()]=x;}
  SE.dirty=[];SE.minDt=1000/(SE_FPS[tier]||30)-2;
  const f=seFrameTarget();SE.s=f.s;SE.ox=f.ox;SE.oy=f.oy;
  seDrawAll();seZoomSync();}
function seDrawAll(){const c=SE.c&&SE.c.over;if(!c)return;c.clearRect(0,0,SE.cw,SE.ch);SE.dirty=[];seDrawBase();seDrawFills();seDrawInkAll();seDrawOver(performance.now());seDot();}
/* the camera: the current line or zone (or, zoomed out, the whole sitting) fitted into the reachable part of the skin */
function seItemBox(sess){
  const it=INK_SIM.sessionItem(sess);if(!it)return null;
  if(it.k==="line"){const p=it.stroke.pts;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(let j=0;j<p.length;j+=2){x0=Math.min(x0,p[j]);x1=Math.max(x1,p[j]);y0=Math.min(y0,p[j+1]);y1=Math.max(y1,p[j+1]);}return[x0,y0,x1,y1];}
  return it.zone.box.slice();}
function seFrameTarget(){
  const v=SE.v,R=SE.R,sFit=Math.min(R.w/v.w,R.h/v.h);
  const ib=SE.zoomOut?null:seItemBox(SE.sess),bx=ib||[v.x0,v.y0,v.x0+v.w,v.y0+v.h];
  let bw=bx[2]-bx[0],bh=bx[3]-bx[1];
  if(ib){const m=Math.max(SE_ZOOM.minMm,v.size*SE_ZOOM.minShare);bw=Math.max(bw+2*SE_ZOOM.padMm,m);bh=Math.max(bh+2*SE_ZOOM.padMm,m);}
  const sc=clamp(Math.min(R.w/bw,R.h/bh),sFit,sFit*SE_ZOOM.max),cx=(bx[0]+bx[2])/2,cy=(bx[1]+bx[3])/2;
  return{s:sc,ox:R.x+R.w/2-(cx-v.x0)*sc,oy:R.y+R.h/2-(cy-v.y0)*sc,z:sc/sFit};}
/* move the camera to its target: a short CSS move of the canvases, then one redraw at the new scale. Never while the
   needle is down (seAfterItem and the view button call it between lines) */
function seRefit(anim){
  if(!SE.R||!$("seCam"))return;
  const t=seFrameTarget(),cam=$("seCam");seAnimDone(true);
  const same=Math.abs(t.s-SE.s)<1e-3&&Math.abs(t.ox-SE.ox)<0.5&&Math.abs(t.oy-SE.oy)<0.5;
  if(same||!anim||seReduced()){SE.s=t.s;SE.ox=t.ox;SE.oy=t.oy;seDrawAll();seZoomSync();return;}
  seDrawBase();seDrawInkAll();seDrawFills();   // the new current item and the finished line, at the old scale, then the move
  const k=t.s/SE.s,tx=t.ox-k*SE.ox,ty=t.oy-k*SE.oy;
  const d=$("seDot");if(d)d.hidden=true;
  cam.style.transition="none";cam.style.transform="none";void cam.offsetWidth;
  cam.style.transition=`transform ${SE_ZOOM.anim}ms cubic-bezier(.3,.7,.3,1)`;cam.style.transform=`translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${k.toFixed(4)})`;
  SE.anim={t,timer:setTimeout(()=>seAnimDone(false),SE_ZOOM.anim+20)};seZoomSync();}
function seAnimDone(skip){
  const a=SE.anim;if(!a)return;clearTimeout(a.timer);SE.anim=null;
  const cam=$("seCam");if(cam){cam.style.transition="none";cam.style.transform="none";}
  SE.s=a.t.s;SE.ox=a.t.ox;SE.oy=a.t.oy;if(!skip)seDrawAll();}
function seZoomLbl(){return SE.zoomOut?`${SE_ICON.zoomIn}<span>Close up</span>`:`${SE_ICON.zoomOut}<span>Whole</span>`;}
function seZoomSync(){const b=$("seZoom");if(!b)return;const html=seZoomLbl();if(b._h!==html){b._h=html;b.innerHTML=html;}b.setAttribute("aria-pressed",SE.zoomOut);
  b.setAttribute("aria-label",SE.zoomOut?"Close up on the current line":"See the whole design");}
function seZoomToggle(out){if(SE.down||!SE.sess)return;SE.zoomOut=out==null?!SE.zoomOut:!!out;INK_SOUND.tick();seRefit(true);}
/* Settings › Needle under finger (or the drawing hand) changed: redraw the chair if it's up */
function seNeedleChanged(){if(SE.sess&&$("seWrap")&&!SE.down)seRenderChair();}
const seX=x=>SE.ox+(x-SE.v.x0)*SE.s,seY=y=>SE.oy+(y-SE.v.y0)*SE.s;
function sePath(c,p,close){c.beginPath();c.moveTo(seX(p[0]),seY(p[1]));for(let i=2;i<p.length;i+=2)c.lineTo(seX(p[i]),seY(p[i+1]));if(close)c.closePath();}
function seLinerMm(sess){const n=INK_SIM.NEEDLES[sess.liner];return INK_SIM.lineMm(n&&n.rl?n.rl:7);}
/* base: skin (a little darker at the edges of the limb) and the purple stencil, the current item bolder */
function seDrawBase(){
  const sess=SE.sess,c=SE.c.base,plan=INK_SIM.sessionPlan(sess),practice=sess.kind==="practice";
  const skin=seSkinRgb(sess.skinTone,practice),dark=!practice&&sess.skinTone>0.6;
  c.clearRect(0,0,SE.cw,SE.ch);c.fillStyle=seRgb(skin);c.fillRect(0,0,SE.cw,SE.ch);
  const g=c.createLinearGradient(0,0,SE.cw,0),sh=seRgb(skin.map(v=>v*0.82));
  g.addColorStop(0,sh);g.addColorStop(0.18,"rgba(0,0,0,0)");g.addColorStop(0.82,"rgba(0,0,0,0)");g.addColorStop(1,sh);
  c.globalAlpha=practice?0.25:0.5;c.fillStyle=g;c.fillRect(0,0,SE.cw,SE.ch);c.globalAlpha=1;
  if(practice){c.strokeStyle="rgba(0,0,0,.07)";c.lineWidth=1;for(let y=8;y<SE.ch;y+=16){c.beginPath();c.moveTo(0,y);c.lineTo(SE.cw,y);c.stroke();}}
  const col=dark?SE_STENCIL.dark:SE_STENCIL.light;
  c.strokeStyle=col;c.lineCap="round";c.lineJoin="round";
  for(let i=sess.next;i<sess.end;i++){const it=plan.items[i],cur=i===sess.next;
    c.globalAlpha=cur?0.95:SE_STENCIL.alpha;
    if(it.k==="line"){c.setLineDash([]);c.lineWidth=cur?SE_STENCIL.cur:SE_STENCIL.w;sePath(c,plan.strokes[it.i].pts,false);c.stroke();}
    else{const z=plan.zones[it.i];c.setLineDash(cur?[]:[4,4]);c.lineWidth=cur?SE_STENCIL.cur:SE_STENCIL.w;for(const p of z.polys){sePath(c,p,true);c.stroke();}
      if(cur){c.globalAlpha=0.12;c.fillStyle=col;c.beginPath();for(const p of z.polys){c.moveTo(seX(p[0]),seY(p[1]));for(let j=2;j<p.length;j+=2)c.lineTo(seX(p[j]),seY(p[j+1]));c.closePath();}c.fill();}}}
  c.setLineDash([]);c.globalAlpha=1;SE.baseDirty=false;}
/* fill: every zone at its saturation; overworked skin goes angry red */
function seDrawFills(clip){
  const sess=SE.sess,c=SE.c.fill,plan=INK_SIM.sessionPlan(sess);
  c.save();if(clip){c.beginPath();c.rect(clip[0],clip[1],clip[2],clip[3]);c.clip();c.clearRect(clip[0],clip[1],clip[2],clip[3]);}else c.clearRect(0,0,SE.cw,SE.ch);
  plan.zones.forEach((z,i)=>{const s=sess.zsat[i]||0;if(s<=0)return;
    c.globalAlpha=clamp(s,0,1)*0.92;c.fillStyle=seColHex(z.colour);
    c.beginPath();for(const p of z.polys){c.moveTo(seX(p[0]),seY(p[1]));for(let j=2;j<p.length;j+=2)c.lineTo(seX(p[j]),seY(p[j+1]));c.closePath();}c.fill();
    const over=s-(z.target+INK_SIM.ZONE.slack);
    if(over>0){c.globalAlpha=clamp(over*1.5,0,0.5);c.fillStyle="#c0392f";c.fill();}});
  c.restore();SE.fillDirty=false;}
/* ink: lines finished before (drawn clean along the stencil) and the part of the current line already laid */
function seDrawInkAll(){
  const sess=SE.sess,c=SE.c.ink,plan=INK_SIM.sessionPlan(sess);c.clearRect(0,0,SE.cw,SE.ch);c.lineCap="round";c.lineJoin="round";
  const lw=Math.max(1.2,seLinerMm(sess)*SE.s);
  for(let i=0;i<Math.min(sess.next,plan.items.length);i++){const it=plan.items[i];if(it.k!=="line")continue;const st=plan.strokes[it.i];
    c.strokeStyle=st.colour?seColHex(st.colour):DZ_INK;c.lineWidth=Math.max(1.2,INK_SIM.lineMm(st.lw)*SE.s);sePath(c,st.pts,false);c.stroke();}
  const it=INK_SIM.sessionItem(sess);
  if(it&&it.k==="line"&&SE.laid&&SE.laid.item===sess.next&&SE.laid.segs.length){seInkSegs(c,SE.laid.segs,it.stroke);return;}
  if(it&&it.k==="line"&&sess.cur&&sess.cur.u>0){const st=it.stroke,pts=[];for(let u=0;u<sess.cur.u;u+=1){const p=INK_SIM.pointAt(st,u);pts.push(p[0],p[1]);}
    const e=INK_SIM.pointAt(st,sess.cur.u);pts.push(e[0],e[1]);c.strokeStyle=st.colour?seColHex(st.colour):DZ_INK;c.lineWidth=lw;sePath(c,pts,false);c.stroke();}}
/* the dot to start (or carry on) a line: a DOM element so its pulse is CSS (none with reduced motion) and costs no frames */
function seDot(){
  const sess=SE.sess,d=$("seDot");if(!d)return;const it=INK_SIM.sessionItem(sess);
  if(!it||it.k!=="line"||SE.down||sess.stop||SE.anim){d.hidden=true;return;}
  const p=INK_SIM.pointAt(it.stroke,sess.cur?sess.cur.u:0);d.hidden=false;d.style.transform=`translate(${(seX(p[0])).toFixed(1)}px,${(seY(p[1])).toFixed(1)}px)`;
  d.classList.toggle("still",seReduced());}
/* overlay: clear only what was drawn last frame, then the marker (or the static highlight) and the finger */
function seDrawOver(now){
  const sess=SE.sess,c=SE.c.over;if(!c)return;
  for(const r of SE.dirty)c.clearRect(r[0],r[1],r[2],r[3]);SE.dirty=[];
  const it=INK_SIM.sessionItem(sess),d=SE.down;if(!it||!d)return;
  const mark=(x0,y0,x1,y1,pad)=>SE.dirty.push([Math.min(x0,x1)-pad,Math.min(y0,y1)-pad,Math.abs(x1-x0)+2*pad,Math.abs(y1-y0)+2*pad]);
  if(it.k==="line"){
    const st=it.stroke,b=INK_SIM.sessionBands(sess);
    if(seReduced()){const u0=sess.cur?sess.cur.u:0,u1=Math.min(st.len,u0+b.paceMmS*SE_LAYOUT.ahead);if(u1>u0){const pts=[];for(let u=u0;u<u1;u+=1){const p=INK_SIM.pointAt(st,u);pts.push(p[0],p[1]);}
      const e=INK_SIM.pointAt(st,u1);pts.push(e[0],e[1]);c.strokeStyle="rgba(63,143,134,.55)";c.lineWidth=9;c.lineCap="round";sePath(c,pts,false);c.stroke();
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(let i=0;i<pts.length;i+=2){x0=Math.min(x0,seX(pts[i]));x1=Math.max(x1,seX(pts[i]));y0=Math.min(y0,seY(pts[i+1]));y1=Math.max(y1,seY(pts[i+1]));}mark(x0,y0,x1,y1,8);}}
    else{const um=Math.min(st.len,d.u0+b.paceMmS*Math.max(0,now-d.t0)/1000),p=INK_SIM.pointAt(st,um),x=seX(p[0]),y=seY(p[1]);
      c.beginPath();c.arc(x,y,9,0,Math.PI*2);c.strokeStyle="#2f7f77";c.lineWidth=3;c.stroke();c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fillStyle="#2f7f77";c.fill();mark(x,y,x,y,14);}}
  if(d.x!=null&&!(seOffset()&&it.k==="line")){const x=seX(d.x),y=seY(d.y),rad=it.k==="line"?5:Math.max(8,Math.sqrt(it.zone.area)*0.12*SE.s);
    c.beginPath();c.arc(x,y,rad,0,Math.PI*2);c.strokeStyle=SE.rushed?"#c0392f":"rgba(22,18,14,.75)";c.lineWidth=SE.rushed?3:1.5;c.stroke();mark(x,y,x,y,rad+4);}}
/* the loop: only while a finger is down, at most SE_FPS */
function seKick(){if(!SE.raf)SE.raf=requestAnimationFrame(seLoop);}
function seStopLoop(){if(SE.raf)cancelAnimationFrame(SE.raf);SE.raf=0;}
function seLoop(now){
  SE.raf=0;if(!SE.sess||!$("seOver"))return;
  if(now-SE.lastF<SE.minDt){if(SE.down||SE.q.length)SE.raf=requestAnimationFrame(seLoop);return;}
  if(SE.lastF&&SE.down){SE.fpsT+=Math.min(250,now-SE.lastF);SE.fpsN++;}
  SE.lastF=now;SE.frames++;
  seFlushInk();
  if(SE.fillDirty){const it=INK_SIM.sessionItem(SE.sess);if(it&&it.zone){const z=it.zone.box,p=12;seDrawFills([seX(z[0])-p,seY(z[1])-p,(z[2]-z[0])*SE.s+2*p,(z[3]-z[1])*SE.s+2*p]);}else seDrawFills();}
  seDrawOver(now);seUpdateLive();
  if(SE.down||SE.q.length)SE.raf=requestAnimationFrame(seLoop);else SE.lastF=0;}
window.__inkSessFps=()=>({fps:SE.fpsT>0?Math.round(SE.fpsN/(SE.fpsT/1000)*10)/10:null,frames:SE.frames,cap:SE_FPS[perfTier()]||30,tier:perfTier()});
/* ink laid since the last frame, straight from the needle; kept in SE.laid so a redraw (the camera moving) keeps it */
function seFlushInk(){
  if(!SE.q.length)return;const c=SE.c.ink,sess=SE.sess,it=INK_SIM.sessionItem(sess);
  if(it&&it.k==="line"){if(!SE.laid||SE.laid.item!==sess.next)SE.laid={item:sess.next,segs:[]};for(const q of SE.q)SE.laid.segs.push(q);}
  seInkSegs(c,SE.q,it&&it.stroke);SE.q.length=0;}
function seInkSegs(c,segs,st){
  const lw=Math.max(1.2,seLinerMm(SE.sess)*SE.s);c.lineCap="round";c.lineJoin="round";c.strokeStyle=st&&st.colour?seColHex(st.colour):DZ_INK;
  for(const g of segs){
    if(g[4]==="blow"){c.globalAlpha=0.28;c.lineWidth=lw*3.2;c.beginPath();c.moveTo(seX(g[0]),seY(g[1]));c.lineTo(seX(g[2]),seY(g[3]));c.stroke();}
    c.globalAlpha=g[4]==="rush"?0.7:1;c.lineWidth=lw;c.beginPath();c.moveTo(seX(g[0]),seY(g[1]));c.lineTo(seX(g[2]),seY(g[3]));c.stroke();}
  c.globalAlpha=1;}
/* meters, the steady-hand needle and the zone meter, from the last live result */
function seUpdateLive(){
  const sess=SE.sess;if(!sess)return;
  for(const k of ["pain","fatigue"]){const el=$("seM_"+k);if(!el)continue;const v=clamp(sess.m[k],0,1),pc=Math.round(v*100);
    if(el._v===pc)continue;el._v=pc;el.querySelector("i").style.width=(v*100).toFixed(1)+"%";el.querySelector(".seMV").textContent=pc;el.setAttribute("aria-valuenow",pc);el.classList.toggle("hi",v>=0.75);}
  const n=$("seNeedle");if(n){const x=seGaugeX(SE.r);if(Math.abs((n._x||0)-x)>0.3){n._x=x;n.style.left=x.toFixed(1)+"%";}n.classList.toggle("rush",!!SE.rushed);}
  const zb=$("seZoneBar");if(zb){const it=INK_SIM.sessionItem(sess);if(it&&it.zone){const s=sess.zsat[it.i]||0,top=seZoneTop(it.zone);zb.style.width=(clamp(s/top,0,1)*100).toFixed(1)+"%";
    const zv=$("seZoneV");if(zv)zv.textContent=Math.round(Math.min(s/it.zone.target,9.99)*100)+"%";}}}
/* the steady-hand gauge: log2 of the pace ratio from 1/4 to 4 */
function seGaugeX(r){return clamp((Math.log2(Math.max(r||0,1/4))+2)/4,0,1)*100;}
function seZoneTop(z){return(z.target+INK_SIM.ZONE.slack)*1.35;}
function seRenderUnder(){
  const sess=SE.sess,it=INK_SIM.sessionItem(sess),g=$("seGauge"),tools=$("seTools");if(!g)return;
  const b=INK_SIM.sessionBands(sess),L=INK_SIM.kitBands(sess.kit,sess.skills,sess.settings,{liner:sess.liner});
  if(!it){g.innerHTML="";tools.innerHTML="";seStatus(sess.stop==="done"?"That's this sitting done.":"");return;}
  if(it.k==="line"){
    const lo=seGaugeX(1/(1+b.paceBand)),hi=seGaugeX(1+b.paceBand),rush=seGaugeX(1+b.paceBand*INK_SIM.PACE.rush);
    g.innerHTML=`<div class="seGauge" role="img" aria-label="Steady hand: keep the needle in the middle band"><span class="seGL">Slow</span><div class="seGT">
<b class="band" style="left:${lo.toFixed(1)}%;width:${(hi-lo).toFixed(1)}%"></b><b class="rush" style="left:${rush.toFixed(1)}%"></b><i id="seNeedle" style="left:${seGaugeX(SE.r).toFixed(1)}%"></i></div><span class="seGL">Rushed</span></div>`;
    const lw=it.stroke.lw,fits=lw>=L.lineBand[0]&&lw<=L.lineBand[1],alt=fits?null:(L.liners.find(l=>lw>=l.lo&&lw<=l.hi)||{}).id||sess.autoLiner;
    tools.innerHTML=`<div class="seLiners" role="group" aria-label="Liner">${L.liners.map(l=>`<button class="seChipL${l.id===sess.liner?" on":""}${alt===l.id?" hint":""}" data-li="${l.id}" aria-pressed="${l.id===sess.liner}">${SE_ICON.needle}<b>${l.id}</b><span>lays ${l.lo}–${l.hi}RL</span></button>`).join("")}</div>
<p class="seLw ${fits?"ok":"bad"}"><span aria-hidden="true">${fits?"✓":"▲"}</span> This line wants ${lw}RL${fits?"":`: ${alt?`switch to ${alt}`:"nothing on the tray lays it cleanly (add one in Studio)"}`}</p>`;
    tools.querySelectorAll("[data-li]").forEach(bt=>bt.addEventListener("click",()=>{if(INK_SIM.sessionSetLiner(sess,bt.dataset.li)){INK_SOUND.tick();save();seRenderUnder();seDrawInkAll();}}));
    if(!SE.status)seStatus(seOffset()?(sess.cur&&sess.cur.u>0?"Hold the skin, bring the needle back onto the dot.":"Hold anywhere on the skin, slide the needle onto the dot, follow the marker."):(sess.cur&&sess.cur.u>0?"Carry on from the dot.":"Start on the dot and follow the line at the marker's pace."));}
  else{
    const z=it.zone,top=seZoneTop(z),s=sess.zsat[it.i]||0,col=it.k==="colour";
    g.innerHTML=`<div class="seZone"><span class="seGL">${col?"Colour":"Shading"}</span><div class="seZT" role="img" aria-label="Saturation: fill to the line, past the hatching is overworking the skin">
<i id="seZoneBar" style="width:${(clamp(s/top,0,1)*100).toFixed(1)}%;background:${seColHex(z.colour)}"></i><b class="tgt" style="left:${(z.target/top*100).toFixed(1)}%"></b><b class="over" style="left:${((z.target+INK_SIM.ZONE.slack)/top*100).toFixed(1)}%"></b></div><span class="seGL" id="seZoneV">${Math.round(s/z.target*100)}%</span></div>`;
    const cnt=seItemCounts(sess),left=sess.end-sess.next;
    tools.innerHTML=`<div class="row"><button class="btn sm${s>=z.target?" pri":""}" id="seNextZ">${left>1?"Next zone":"Finish"}</button><span class="hint">${cnt.shade+cnt.colour>0?`${left} zone${left>1?"s":""} left`:""}</span></div>`;
    $("seNextZ").addEventListener("click",()=>{if(SE.down)return;INK_SIM.sessionNextItem(sess);SE.status="";save();seAfterItem();});
    if(!SE.status)seStatus(col?"Swipe back and forth inside the zone to pack the colour in.":"Hold and sweep inside the zone. Fill it to the line, no further.");}}
function seStatus(t){SE.status=t;const e=$("seStatus");if(e&&e.textContent!==t)e.textContent=t;}
function seAfterItem(){
  const sess=SE.sess;
  SE.laid=null;seRefit(true);SE.status="";
  const p=$("seProg");if(p){const cnt=seItemCounts(sess);p.textContent=seProgText(sess,INK_SIM.sessionItem(sess),sess.next-sess.start,sess.end-sess.start,cnt);}
  seRenderUnder();
  if(sess.stop)seEnd();}
/* pointer input -> the sim, in mm on the placement box, with the event's own timestamps. In offset mode every position
   is the needle tip's (the finger plus SE.tox, SE.toy); a line starts the moment the tip reaches the dot */
function sePx(ev){const w=$("seWrap"),r=w.getBoundingClientRect();return[ev.clientX-r.left-w.clientLeft,ev.clientY-r.top-w.clientTop];}
function seTipPx(f){return[f[0]+SE.tox,f[1]+SE.toy];}
function seMm(p){return[(p[0]-SE.ox)/SE.s+SE.v.x0,(p[1]-SE.oy)/SE.s+SE.v.y0];}
function sePenAt(f){const pen=$("sePen");if(!pen)return;const t=seTipPx(f),a=Math.atan2(-(f[0]-t[0]),f[1]-t[1])*180/Math.PI;
  pen.style.transform=`translate(${t[0].toFixed(1)}px,${t[1].toFixed(1)}px) rotate(${a.toFixed(1)}deg)`;}
function sePenShow(on){const pen=$("sePen");if(!pen)return;pen.hidden=!on;if(!on){pen.classList.remove("on","rush","near","aim","go","still");clearTimeout(pen._go);}}
/* aiming (0.1.21.0): the hollow needle or reticle follows the finger while the ring fills; seArm starts the machine */
function seAimAt(f){const a=$("seAim");if(a)a.style.transform=`translate(${f[0].toFixed(1)}px,${f[1].toFixed(1)}px)`;}
function seStarted(sess,it){return it.k==="line"?!!(sess.cur&&sess.cur.u>0):(sess.zsat[it.i]||0)>0;}
function seAimLook(el,on,ms){if(!el)return;clearTimeout(el._go);el.classList.remove("go","on");
  if(on){el.style.setProperty("--arm",ms+"ms");el.classList.remove("aim");void el.getBoundingClientRect();el.classList.add("aim");el.classList.toggle("still",seReduced());}
  else el.classList.remove("aim","still");}
function seGo(el,hide){if(!el)return;el.classList.remove("aim","still");if(seReduced()){if(hide)el.hidden=true;return;}
  el.classList.add("go");clearTimeout(el._go);el._go=setTimeout(()=>{el.classList.remove("go");if(hide)el.hidden=true;},SE_ARM.go);}
function seAimStart(sess,it,id,f,t,over){
  const off=seOffset(),ms=seStarted(sess,it)?SE_ARM.rearm:SE_ARM.ms;
  SE.aim={id,f,t0:t,ms,sess,over,timer:setTimeout(()=>seArm(null),ms)};
  if(off){sePenAt(f);sePenShow(true);seAimLook($("sePen"),true,ms);}
  else{const a=$("seAim");if(a){seAimAt(f);a.hidden=false;seAimLook(a,true,ms);}}
  if(it.k==="line"){const m=seMm(off?seTipPx(f):f);seNear(sess,it,m[0],m[1]);}
  seStatus(it.k==="line"?(off?"Aim the needle at the dot. The machine starts in a beat.":"Aim at the dot. The machine starts in a beat."):"Aim inside the zone. The machine starts in a beat.");}
function seAimCancel(){const a=SE.aim;if(!a)return;clearTimeout(a.timer);SE.aim=null;sePenShow(false);
  const r=$("seAim");if(r){seAimLook(r,false);r.hidden=true;}const dt=$("seDot");if(dt)dt.classList.remove("near");}
/* the machine arms: penDown at the tip where it is now (t: the event's time, or now from the timer), then the old flow */
function seArm(t){
  const a=SE.aim;if(!a)return;clearTimeout(a.timer);SE.aim=null;
  const sess=SE.sess;if(a.sess!==sess||$("seOver")!==a.over||sess.stop||sess.phase!=="work"){sePenShow(false);const r=$("seAim");if(r)r.hidden=true;return;}
  const it=INK_SIM.sessionItem(sess);if(!it){sePenShow(false);const r=$("seAim");if(r)r.hidden=true;return;}
  const off=seOffset(),f=a.f,[x,y]=seMm(off?seTipPx(f):f);if(t==null)t=performance.now();
  if(off){SE.hold={id:a.id};seGo($("sePen"),false);}else seGo($("seAim"),true);
  const live=INK_SIM.penDown(sess,t,x,y);
  if(live.ok){seStrokeStart(sess,it,a.id,t,live,x,y);return;}
  if(live.why!=="start"){if(off){SE.hold=null;sePenShow(false);}return;}
  if(off){seStatus(sess.cur&&sess.cur.u>0?"Bring the needle back onto the dot to carry on.":"Bring the needle onto the dot to start the line.");seNear(sess,it,x,y);return;}
  seStatus("Start on the dot.");const d=$("seDot");if(d){d.classList.remove("nudge");void d.offsetWidth;d.classList.add("nudge");}}
/* the stroke starts: the sim accepted penDown at (x, y) */
function seStrokeStart(sess,it,id,t,live,x,y){
  SE.down={id,t0:t,u0:live.u||0,x,y,item:it.idx};SE.r=0;SE.rushed=false;
  const pen=$("sePen");if(pen){pen.classList.add("on");pen.classList.remove("near","aim","still");}
  const dt=$("seDot");if(dt)dt.classList.remove("near");
  if(it.k==="line")seStatus(seReduced()?"Keep a steady pace along the highlight.":"Keep up with the marker, not ahead of it.");
  if(it.k==="line")INK_SOUND.buzzStart(INK_SIM.sessionBands(sess).buzz);else INK_SOUND.buzzStart(Object.assign({},INK_SIM.sessionBands(sess).buzz,{hz:INK_SIM.sessionBands(sess).buzz.hz*0.9}));
  seDot();seKick();}
/* the tip on its way to the dot: light the dot (and the ring) up when it's close */
function seNear(sess,it,x,y){
  const d=$("seDot"),pen=$("sePen");if(!d||it.k!=="line")return;
  const b=INK_SIM.sessionBands(sess),at=INK_SIM.pointAt(it.stroke,sess.cur?sess.cur.u:0),slop=Math.max(b.accMm*INK_SIM.PACE.startSlop,b.view*0.05);
  const near=Math.hypot(x-at[0],y-at[1])<slop*SE_PEN.near;d.classList.toggle("near",near);if(pen)pen.classList.toggle("near",near);
  const r=$("seAim");if(r)r.classList.toggle("near",near);}
function seWireCanvas(){
  const over=$("seOver"),sess=SE.sess;
  const tipMm=ev=>{const f=sePx(ev);return seMm(seOffset()?seTipPx(f):f);};
  const curK=()=>{const it=INK_SIM.sessionItem(sess);return it?it.k:"";};
  /* two fingers while no line is being drawn: spread for the close-up, squeeze for the whole design */
  const pinchStart=()=>{const pts=[...SE.ptrs.values()],a=pts[0],b=pts[1];SE.pinch={d0:Math.hypot(b[0]-a[0],b[1]-a[1])||1,done:false};
    if(SE.hold){SE.hold=null;sePenShow(false);}
    if(SE.aim)seAimCancel();
    if(SE.down&&curK()!=="line"){INK_SOUND.buzzStop();seFlushInk();SE.down=null;INK_SIM.penUp(sess,performance.now());seDrawOver(performance.now());}};
  over.addEventListener("pointerdown",ev=>{
    if(sess.stop||sess.phase!=="work")return;ev.preventDefault();
    const f=sePx(ev);SE.ptrs.set(ev.pointerId,f);
    if(SE.ptrs.size===2){
      /* a second finger mid-line is a resting palm: ignore it. A zone touched a moment ago gives way to the pinch */
      if(!SE.down||(curK()!=="line"&&ev.timeStamp-SE.down.t0<150))pinchStart();
      return;}
    if(SE.ptrs.size>2||SE.down||SE.hold||SE.aim||SE.pinch)return;
    const it=INK_SIM.sessionItem(sess);if(!it)return;
    if(SE.anim)seAnimDone(false);
    try{over.setPointerCapture(ev.pointerId);}catch(e){}
    /* 0.1.21.0: the touch aims first; seArm (the timer, or a move past the time) starts the machine */
    seAimStart(sess,it,ev.pointerId,f,ev.timeStamp||performance.now(),over);});
  over.addEventListener("pointermove",ev=>{
    if(SE.ptrs.has(ev.pointerId))SE.ptrs.set(ev.pointerId,sePx(ev));
    if(SE.pinch){if(SE.ptrs.size>=2&&!SE.pinch.done){const pts=[...SE.ptrs.values()],a=pts[0],b=pts[1],r=Math.hypot(b[0]-a[0],b[1]-a[1])/SE.pinch.d0;
        if(r>SE_ZOOM.pinch||r<1/SE_ZOOM.pinch){SE.pinch.done=true;seZoomToggle(r<1);}}ev.preventDefault();return;}
    const A=SE.aim;
    if(A&&ev.pointerId===A.id){ev.preventDefault();const f=sePx(ev);A.f=f;
      if(seOffset())sePenAt(f);else seAimAt(f);
      const t=ev.timeStamp||performance.now();
      if(t-A.t0>=A.ms){seArm(t);return;}
      const it=INK_SIM.sessionItem(sess);if(it&&it.k==="line"){const m=seMm(seOffset()?seTipPx(f):f);seNear(sess,it,m[0],m[1]);}
      return;}
    const h=SE.hold,holding=!!(h&&ev.pointerId===h.id);
    if(holding)sePenAt(sePx(ev));
    if(SE.down?ev.pointerId!==SE.down.id:!holding)return;
    ev.preventDefault();
    const evs=ev.getCoalescedEvents?ev.getCoalescedEvents():[];
    for(const e of (evs.length?evs:[ev])){const [x,y]=tipMm(e),t=e.timeStamp||performance.now();
      if(!SE.down){const it=INK_SIM.sessionItem(sess);if(!it)return;
        const live=INK_SIM.penDown(sess,t,x,y);
        if(live.ok)seStrokeStart(sess,it,ev.pointerId,t,live,x,y);else seNear(sess,it,x,y);
        continue;}
      const d=SE.down;
      const live=INK_SIM.penMove(sess,t,x,y);if(!live.ok)continue;
      if(live.r!=null){SE.r=live.r;SE.rushed=!!live.rushed;}
      if(live.sat!=null){SE.fillDirty=true;SE.rushed=false;if(live.over&&!SE.overTold){SE.overTold=true;seStatus("Overworking the skin: move on.");}}
      else SE.q.push([d.x,d.y,x,y,live.blow?"blow":live.rushed?"rush":""]);
      if(live.blow)seStatus("Blowout: ink spread under the skin. Ease off.");
      else if(live.join)seStatus("A join: keep the line moving.");
      d.x=x;d.y=y;}
    if(SE.down){const pen=$("sePen");if(pen)pen.classList.toggle("rush",!!SE.rushed);INK_SOUND.buzzSet(SE.r,SE.rushed);seKick();}},{passive:false});
  const up=ev=>{
    SE.ptrs.delete(ev.pointerId);
    if(SE.pinch){if(!SE.ptrs.size)SE.pinch=null;return;}
    if(SE.aim&&ev.pointerId===SE.aim.id){seAimCancel();seStatus("Hold still a moment: the machine starts after a beat.");return;}
    const h=SE.hold,mine=!!(h&&ev.pointerId===h.id);
    if(mine){SE.hold=null;sePenShow(false);const dt=$("seDot");if(dt)dt.classList.remove("near");}
    const d=SE.down;
    if(!d){if(mine&&curK()==="line")seStatus("The line starts when the needle reaches the dot.");return;}
    if(ev.pointerId!==d.id)return;INK_SOUND.buzzStop();
    seFlushInk();SE.down=null;
    const live=INK_SIM.penUp(sess,ev.timeStamp||performance.now());
    seDrawOver(performance.now());SE.overTold=false;SE.r=0;SE.rushed=false;seUpdateLive();
    saveSoon();
    if(live.lineDone){const ls=sess.lastStroke;SE.status="";seAfterItem();
      if(ls&&!sess.stop)seStatus(`Line done: ${Math.round(ls.q*100)}% clean${ls.blowouts?`, ${ls.blowouts} blowout${ls.blowouts>1?"s":""}`:""}${ls.joins?`, ${ls.joins} join${ls.joins>1?"s":""}`:""}.`);}
    else{seDot();if(sess.stop)seEnd();else if(curK()==="line")seStatus(seOffset()?"Lifted. Bring the needle back onto the dot.":"Lifted. Carry on from the dot.");}};
  over.addEventListener("pointerup",up);over.addEventListener("pointercancel",up);}
/* Break, Numb, Chat */
function seAction(k){
  const sess=SE.sess;if(!sess||SE.down)return;
  if(k==="numb"){const cost=Math.round(INK_SIM.NUMB.price*INK_SIM.priceIndex(sess.year)/10)*10;if(sess.m.numbs<INK_SIM.NUMB.max&&(S.cash||0)<cost){toast(`Numbing cream is ${fmtMoney(cost)}. Not enough cash.`);return;}}
  const r=INK_SIM.sessionAction(sess,k);
  if(!r.ok){toast(r.why);return;}
  INK_SOUND.tick();
  if(k==="break")toast(r.eff>0.6?"A cigarette on the back step. They come back steadier.":"Another break. It helps less each time.");
  if(k==="numb"){S.cash-=r.cost;renderHeader();toast(`Numbing cream on: ${fmtMoney(r.cost)}. It takes the edge off for a couple of hours.`);}
  if(k==="chat"){const line=SE_CHAT[(sess.m.chats+((sess.client&&sess.client.name)||"").length)%SE_CHAT.length];
    toast(r.talk<INK_SIM.CHAT.quiet?"They'd rather not talk. It wears on them.":line);}
  save();seUpdateLive();const p=$("seProg");if(p)p.textContent=seProgText(sess,INK_SIM.sessionItem(sess),sess.next-sess.start,sess.end-sess.start,seItemCounts(sess));}
function seStopTap(){
  const sess=SE.sess;if(!sess||SE.down)return;
  if(sess.next===sess.start&&!sess.cur&&!(sess.zsat||[]).some((v,i)=>v>0)){seCancelChair();return;}
  if(!SE.stopArm){SE.stopArm=1;clearTimeout(SE.stopT);toast(sess.kind==="practice"?"Tap End again to stop practising":"Tap End again to finish the sitting here");
    SE.stopT=setTimeout(()=>{SE.stopArm=0;},2600);return;}
  SE.stopArm=0;clearTimeout(SE.stopT);seEnd();}
function seCancelChair(){const sess=SE.sess;seSlot().live=null;SE.sess=null;save();toast(sess.kind==="practice"?"Pad back on the shelf":"Not now. The booking stays.");renderSession();}

/* ---- the end of a sitting ---- */
const SE_STOP_TEXT={pain:"They couldn't take any more today.",fatigue:"They're worn out. Time to stop.",artist:"You called it there.",done:""};
function seEnd(){
  const sess=SE.sess;if(!sess||SE.down||SE.ending)return;SE.ending=true;
  try{
    const res=INK_SIM.sessionFinish(sess),xp=INK_SIM.sessionXp(res,sess,S.skills);
    seAddXp(xp);
    const R={kind:sess.kind,res,xp,paid:0,piece:null,next:null,who:sess.client?sess.client.name:"Fake skin",design:sess.design,skin:seSkinRgb(sess.skinTone,sess.kind==="practice"),
      bodyShape:sess.bodyShape,msg:SE_STOP_TEXT[res.stop]||"",part:sess.part,partsTotal:sess.partsTotal,item:null};
    if(sess.kind==="booked")seFinishBooked(sess,res,R);
    else if(sess.kind==="sample")seFinishSample(sess,res,R);
    seSlot().live=null;SE.sess=null;SE.result=R;
    save();renderHeader();
    INK_SOUND.tick();renderSession();$("panel").scrollTop=0;
  }finally{SE.ending=false;}}
function seAddXp(xp){
  const sk=S.skills||(S.skills={styles:{}});
  for(const k of ["linework","shading","colour","speed"])if(xp[k])sk[k]=Math.round(Math.min(10,(+sk[k]||0)+xp[k])*1000)/1000;
  if(!sk.styles)sk.styles={};for(const st in xp.styles||{})sk.styles[st]=Math.round(Math.min(10,(+sk.styles[st]||0)+xp.styles[st])*1000)/1000;}
function sePieceExtras(piece,sess,res){
  Object.assign(piece,{heal:null,healDue:seWeek(SE_HEAL_WEEKS),sessionsUsed:res.sessionsUsed,blowouts:res.out.blowouts,joins:res.out.joins,ink:sess.kit.ink,machine:sess.kit.machine});}
/* booked: progress rides on the queue item; finishSession pays and books the next sitting or makes the piece */
function seFinishBooked(sess,res,R){
  const q=S.queue.find(x=>x.id===sess.itemId);
  if(!q){R.msg="The booking has gone from the book, so this sitting wasn't paid.";return;}
  const last=(q.sessionNo||1)>=(q.sessions||1);
  if(!res.done&&last){   // the last sitting cut short: they come back next week to finish, paid then
    q.progress=res.progress;const w=seWeek(1);q.w=w.w;q.y=w.y;
    R.next={w:w.w,y:w.y,again:true};R.item=q.id;return;}
  if(res.done&&!last)q.sessions=q.sessionNo||1;   // finished ahead of plan: this is the last sitting, the balance is paid now
  q.progress=res.done?null:res.progress;
  const out=Object.assign({},res.out);
  const fin=INK_SIM.finishSession(S,q.id,{design:q.design,out,heal:null});if(!fin)return;
  R.paid=fin.paid;
  if(S.board.item===q.id)S.board.item=fin.next?fin.next.id:null;
  if(fin.piece){sePieceExtras(fin.piece,sess,res);R.piece=fin.piece.name;}
  else if(fin.next){R.next={w:fin.next.w,y:fin.next.y};R.item=fin.next.id;R.part=q.sessionNo||1;}}
/* sample walk-in: paid a share each sitting; the piece is made when the work is done */
function seFinishSample(sess,res,R){
  const c=DZ_SAMPLE_CLIENTS.find(x=>x.id===sess.clientId)||DZ_SAMPLE_CLIENTS[0];
  const price=INK_SIM.scoreDesign(sess.design,c,S.skills,{year:S.year}).price;
  const pay=Math.round(price*SE_PAY.sample/Math.max(1,sess.partsTotal)/10)*10;
  if(res.sitting.items>0){S.cash=(S.cash||0)+pay;R.paid=pay;}
  if(res.done){
    const p=INK_SIM.addPiece(S,{client:{id:c.id,first:c.name,history:[],pieces:[]},design:sess.design,out:Object.assign({},res.out),heal:null,price});
    sePieceExtras(p,sess,res);R.piece=p.name;seSlot().next=null;}
  else{seSlot().next={client:c.id,design:sess.design,bodyShape:sess.bodyShape,skinTone:sess.skinTone,progress:res.progress,part:res.nextPart,partsTotal:sess.partsTotal};R.next={now:true};}}
function seRenderResult(){
  const R=SE.result,res=R.res,host=$("sessionBody"),s=res.sitting,o=res.out;
  const title=R.kind==="practice"?"Practice done":R.piece?"Piece finished":res.early?"Stopped early":`Sitting ${R.part} of ${R.partsTotal} done`;
  const xp=["linework","shading","colour","speed"].filter(k=>R.xp[k]>0).map(k=>`<span class="clChip">+${R.xp[k].toFixed(2)} ${k}</span>`).concat(Object.keys(R.xp.styles||{}).map(k=>`<span class="clChip">+${R.xp.styles[k].toFixed(2)} ${esc((INK_SIM.STYLES[k]||{}).name||k)}</span>`));
  const row=(l,v,hint)=>`<dt>${l}</dt><dd>${v}${hint?` <span class="hint">${hint}</span>`:""}</dd>`;
  let next="";
  if(R.piece)next=`<p><b>${esc(R.piece.charAt(0).toUpperCase()+R.piece.slice(1))}</b> is done. The heal shows in two weeks.</p>`;
  else if(R.next&&R.next.now)next=`<p>There's more to do. A sample walk-in can sit again straight away.</p>`;
  else if(R.next&&R.next.again)next=`<p>The piece isn't finished. They're booked back for week ${R.next.w}, ${R.next.y} to finish it; the balance is paid then.</p>`;
  else if(R.next)next=`<p>Next sitting: week ${R.next.w}, ${R.next.y}.</p>`;
  host.innerHTML=`<div class="se"><div class="card seRes"><span class="clK">${esc(R.who)}</span><h2>${title}</h2>${R.msg?`<p class="seResMsg">${esc(R.msg)}</p>`:""}
<div class="seResB">${seRender(R.design,R.skin,o,R.bodyShape)}<dl class="kv">
${s.lineQuality!=null?row("Lines",sePct(s.lineQuality)):""}${s.depthQuality!=null?row("Depth",sePct(s.depthQuality)):""}
${row("Saturation",sePct(o.saturation))}${row("Trauma",sePct(o.trauma),"lower is better")}
${row("Blowouts",s.blowouts)}${row("Joins",s.joins)}${row("Time",s.hours.toFixed(1)+" h")}
${R.kind!=="practice"?row("Pain at the end",sePct(s.pain)):""}${R.paid?row("Paid",fmtMoney(R.paid)):""}</dl></div>
${xp.length?`<div class="clChips">${xp.join("")}</div>`:""}${next}
<div class="row">${R.next&&R.next.now?`<button class="btn pri" id="seResNext">Next sitting</button>`:""}<button class="btn${R.next&&R.next.now?"":" pri"}" id="seResOk">Done</button>${R.kind==="booked"?`<button class="btn" id="seResCl">Clients</button>`:""}${R.kind==="practice"?`<button class="btn" id="seResAgain">Again</button>`:""}</div></div></div>`;
  const on=(id,fn)=>{const e=$(id);if(e)e.addEventListener("click",fn);};
  on("seResOk",()=>{SE.result=null;renderSession();});
  on("seResNext",()=>{SE.result=null;seContinueSample();});
  on("seResCl",()=>{SE.result=null;showTab("clients");});
  on("seResAgain",()=>{SE.result=null;seStartPractice(SE.pick);});}
