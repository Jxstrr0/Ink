/* ===================== app/studio.js: the Studio tab =====================
   The shop at its current stage: the 3D view on top (INK_VIS, PR 6), then who is in the chair, then the shop's cards.
   Who sits in the 3D chair (stWho): the client of the sitting in progress, else the next booked client from S.queue,
   else your last client (the newest piece), else the board's client. Their pieces are on the model as they look today
   (stTattoos: years since the piece was made, its heal grade from PR 5, ink, the client's sun), and the sitting in
   progress shows as its purple stencil. Camera chips: Face-on (consult), The work (session, close on the newest piece) and
   Reveal; drag the view to look round (Lite allows less). stMount() puts the one WebGL canvas back in the Studio view
   (the Session tab borrows it for 3D stencil placement).
   The kit build panel (PR 4, plan Q9): S.kit is a machine, a tray of needle groupings (up to KIT_TRAY_MAX), an ink tier,
   voltage and stroke. A summary shows what the kit gives the session (INK_SIM.kitBands: the steady band, the line weights
   the tray lays, shading speed, skin trauma, ink fade); every option shows ▲/▼ deltas against the kit you have now
   (INK_SIM.kitDeltas, the PEW parts-shop pattern), with arrows and words as well as colour. Buying spends S.cash at
   INK_SIM.kitPrice (2000 rubles x the price index). PR 7 adds the studio build-out, staff and money here. */
const ST={view:null,key:""};
const ST_CAP={apprentice:"The back room at your mentor's shop",chair:"Your rented chair",studio:"Your studio",legacy:"Your studio, years on"};
function stGl(){return typeof INK_VIS!=="undefined"&&INK_VIS.ready();}
function stSkin(t){return typeof bmSkin==="function"?bmSkin(t)[0]:"#dba57c";}
/* a client record (real or a sample walk-in) as the 3D chair needs it */
function stWhoOf(id,o){
  const real=INK_SIM.findClient(S,id),samp=typeof DZ_SAMPLE_CLIENTS!=="undefined"?DZ_SAMPLE_CLIENTS.find(x=>x.id===id):null,c=real||samp;if(!c)return null;
  const onBoard=id===S.board.client;
  return Object.assign({id,name:real?real.name:c.name,sample:!real,shape:onBoard&&S.board.bodyShape?S.board.bodyShape:c.bodyShape||"neutral",
    tone:onBoard&&S.board.skinTone!=null?S.board.skinTone:c.skinTone!=null?c.skinTone:0.3,sun:(c.traits||{}).sun},o||{});}
function stWho(){
  const L=typeof seLive==="function"?seLive():null;
  if(L&&L.kind!=="practice"&&L.clientId){const w=stWhoOf(L.clientId,{why:"In the chair now",live:L});if(w){w.shape=L.bodyShape||w.shape;w.tone=L.skinTone!=null?L.skinTone:w.tone;return w;}}
  const wk=q=>INK_SIM.weekIndex(q.w,q.y),now=INK_SIM.weekIndex(S.week,S.year);
  const q=S.queue.filter(x=>x.kind==="session"&&INK_SIM.findClient(S,x.client)).sort((a,b)=>wk(a)-wk(b))[0];
  if(q){const w=stWhoOf(q.client,{why:wk(q)<=now?"In the chair this week":`Booked in for week ${q.w}, ${q.y}`,item:q});if(w)return w;}
  for(let i=S.pieces.length-1;i>=0;i--){const w=stWhoOf(S.pieces[i].client,{why:"Your last client"});if(w)return w;}
  return stWhoOf(S.board.client,{why:"On the design board"});}
/* their pieces as they look today */
function stTattoos(who){
  const now=INK_SIM.weekIndex(S.week,S.year);
  return S.pieces.filter(p=>p.client===who.id&&p.design&&Array.isArray(p.design.elements)&&p.design.elements.length)
    .map(p=>({design:p.design,out:p.out||null,heal:p.heal||null,ink:p.ink||null,years:Math.max(0,(now-INK_SIM.weekIndex(p.w,p.y))/52),skinTone:who.tone,sun:who.sun!=null?who.sun:0.4}));}
function stMount(){if(!stGl())return false;INK_VIS.mount($("studioView"));INK_VIS.setStencil(null);return true;}
/* put the client in the 3D chair and aim the camera */
function stShow(who,view){
  if(!stMount())return;
  const stage=(S.studio&&S.studio.stage)||"apprentice";INK_VIS.setStudio(stage);
  if(!who){INK_VIS.setClient(null);INK_VIS.setView("consult");return;}
  INK_VIS.setClient({bodyShape:who.shape,skinTone:who.tone,skin:stSkin(who.tone)});
  const list=stTattoos(who);INK_VIS.setTattoos(list);
  const live=who.live&&who.live.design;
  if(live)INK_VIS.setStencil(live);
  const work=live||(list.length?list[list.length-1].design:null);
  INK_VIS.setView(view==="consult"||!work?"consult":view,work?{placement:work.placement,size:work.sizeMm}:{});}
function renderStudio(){
  const stage=(S.studio&&S.studio.stage)||"apprentice",gl=stGl(),who=stWho();
  $("studioView").classList.toggle("nogl",!gl);
  $("studioCap").textContent=gl?ST_CAP[stage]||ST_CAP.apprentice:"The 3D shop needs WebGL, which this browser has turned off";
  const n=who?S.pieces.filter(p=>p.client===who.id).length:0,work=who&&(who.live||n);
  const key=who?who.id+"|"+(who.live?"live":"")+"|"+n:"";
  if(key!==ST.key){ST.key=key;ST.view=who&&who.live?"session":who&&n&&who.why==="Your last client"?"reveal":"consult";}
  if(!work&&ST.view!=="consult")ST.view="consult";
  const chair=who?`<div class="card stChair"><div class="stWho"><span class="clK">${esc(who.why)}</span><b>${esc(who.name)}</b>
<span class="clMeta">${who.sample?"Sample walk-in · ":""}${n?`${n} piece${n>1?"s":""} on them`:"No ink from you yet"}${who.live?" · stencil on":""}</span></div>
${gl?segHtml("stView",[["consult","Face-on"],["session","The work"],["reveal","Reveal"]],ST.view):""}
${gl?`<p class="hint" style="margin:8px 0 0">Drag the view to look around.</p>`:""}</div>`:"";
  $("studioBody").innerHTML=`${chair}<div class="card"><h2>The shop</h2>
<p class="hint" style="margin-top:0">You start as an apprentice in your mentor's shop on the canal in Mostograd: sweeping floors, cleaning tubes, drawing flash after closing.</p>
<dl class="kv"><dt>Stage</dt><dd>${esc(typeof STAGE_NAMES!=="undefined"&&STAGE_NAMES[stage]||stage)}</dd><dt>Date</dt><dd>Week ${S.week}, ${S.year}</dd><dt>Cash</dt><dd>${fmtMoney(S.cash)}</dd></dl></div>
<div class="card kp" id="kp"></div>`;
  const sv=$("stView");
  if(sv){if(!work)sv.querySelectorAll('button[data-v="session"],button[data-v="reveal"]').forEach(b=>{b.disabled=true;});
    sv.addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b||b.disabled)return;ST.view=b.dataset.v;INK_SOUND.tick();
      sv.querySelectorAll("button").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});stShow(stWho(),ST.view);});}
  stShow(who,ST.view);
  if(typeof INK_SIM.kitBands==="function")kpRender();else $("kp").remove();}
const KP={sec:"machine"};
/* the deltas the panel shows: key, label, which way is good (1 up, -1 down, 0 neither) */
const KP_DELTAS=[{k:"band",l:"steady band",good:1},{k:"pace",l:"marker speed",good:0},{k:"shade",l:"shading speed",good:1},
  {k:"trauma",l:"skin trauma",good:-1},{k:"fade",l:"ink fade",good:-1}];
function kpKit(){S.kit=INK_SIM.kitClean(S.kit);return S.kit;}
function kpSet(){return{assist:!!S.settings.assist};}
function kpSummary(kit){
  const B=INK_SIM.kitBands(kit,S.skills,kpSet()),mm=v=>v.toFixed(2).replace(/0$/,"");
  return`<div class="kpSum">
<div><span>Steady band</span><b>±${Math.round(B.paceBand*100)}%</b></div>
<div><span>Lines</span><b>${B.lineAll[0]}–${B.lineAll[1]}RL</b><em>${mm(B.lineMm[0])}–${mm(B.lineMm[1])} mm</em></div>
<div><span>Shading</span><b>×${B.shade.toFixed(2)}</b></div>
<div><span>Skin trauma</span><b>×${B.trauma.toFixed(2)}</b></div>
<div><span>Ink fade</span><b>×${B.fade.toFixed(2)}</b></div></div>`;}
/* ▲/▼ chips for changing the kit into `to` */
function kpDelta(to){
  const kit=kpKit(),d=INK_SIM.kitDeltas(kit,to,S.skills,kpSet()),out=[];
  for(const m of KP_DELTAS){const v=d[m.k];if(!v||Math.abs(v)<0.005)continue;
    const cls=m.good===0?"n":(v>0)===(m.good>0)?"up":"dn";
    out.push(`<span class="kpD ${cls}"><span aria-hidden="true">${v>0?"▲":"▼"}</span> ${Math.round(Math.abs(v)*100)}% ${m.l}</span>`);}
  if(d.lineLo||d.lineHi){const B=INK_SIM.kitBands(to,S.skills,kpSet()),A=INK_SIM.kitBands(kit,S.skills,kpSet());
    const better=d.lineLo<=0&&d.lineHi>=0,worse=d.lineLo>=0&&d.lineHi<=0;
    out.push(`<span class="kpD ${better?"up":worse?"dn":"n"}"><span aria-hidden="true">${better?"▲":worse?"▼":"◆"}</span> lines ${A.lineAll[0]}–${A.lineAll[1]} → ${B.lineAll[0]}–${B.lineAll[1]}RL</span>`);}
  return out.length?`<div class="kpDs">${out.join("")}</div>`:`<div class="kpDs"><span class="kpD n">No change to the session</span></div>`;}
function kpWith(ch){return INK_SIM.kitClean(Object.assign(JSON.parse(JSON.stringify(kpKit())),ch));}
function kpBuyBtn(kind,id,from){
  const price=INK_SIM.kitPrice(kind,id,S.year);
  if(from&&S.year<from)return`<button class="btn sm" disabled>From ${from}</button>`;
  return`<button class="btn sm" data-buy="${kind}:${id}"${(S.cash||0)<price?" disabled":""}>Buy ${fmtMoney(price)}</button>`;}
function kpRender(){
  const host=$("kp");if(!host)return;const kit=kpKit(),o=kit.owned,live=typeof seLive==="function"&&seLive();
  let body="";
  if(KP.sec==="machine")body=Object.values(INK_SIM.MACHINES).map(m=>{const own=o.machines.includes(m.id),use=kit.machine===m.id;
    return`<div class="kpRow${use?" on":""}"><div class="kpRT"><b>${esc(m.name)}</b><span class="hint">${esc(m.note)}</span>${use?"":kpDelta(kpWith({machine:m.id,owned:Object.assign({},o,{machines:o.machines.concat(own?[]:[m.id])})}))}</div>
<div class="kpRB">${use?`<span class="kpUse">In use</span>`:own?`<button class="btn sm pri" data-use="machine:${m.id}">Use</button>`:kpBuyBtn("machine",m.id,m.from)}</div></div>`;}).join("");
  else if(KP.sec==="needles"){
    const N=Object.values(INK_SIM.NEEDLES),full=kit.needles.length>=INK_SIM.KIT_TRAY_MAX;
    body=`<p class="hint" style="margin-top:0">On the tray: ${kit.needles.length} of ${INK_SIM.KIT_TRAY_MAX}. A liner lays its own line weight and the one either side in a clean pass; mags fill shading and colour.</p>`+
    N.map(n=>{const own=o.needles.includes(n.id),on=kit.needles.includes(n.id);
      const what=n.kind==="liner"?`lays ${INK_SIM.LINE_WEIGHTS[Math.max(0,INK_SIM.LINE_WEIGHTS.indexOf(n.rl)-1)]}–${INK_SIM.LINE_WEIGHTS[Math.min(INK_SIM.LINE_WEIGHTS.length-1,INK_SIM.LINE_WEIGHTS.indexOf(n.rl)+1)]}RL`:`shading ×${n.shade}`;
      const to=on?kit.needles.filter(x=>x!==n.id):kit.needles.concat([n.id]);
      const dl=(on&&kit.needles.length>1)||(!on&&!full)?kpDelta(kpWith({needles:to,owned:Object.assign({},o,{needles:o.needles.concat(own?[]:[n.id])})})):"";
      return`<div class="kpRow sm${on?" on":""}"><div class="kpRT"><b>${esc(n.name)}</b><span class="hint">${what}</span>${dl}</div>
<div class="kpRB">${own?(on?`<button class="btn sm" data-tray="${n.id}"${kit.needles.length<=1?" disabled":""} aria-pressed="true">On tray ✓</button>`:`<button class="btn sm" data-tray="${n.id}"${full?" disabled":""} aria-pressed="false">Add to tray</button>`):kpBuyBtn("needle",n.id)}</div></div>`;}).join("");}
  else if(KP.sec==="ink")body=Object.values(INK_SIM.INKS).map(i=>{const own=o.inks.includes(i.id),use=kit.ink===i.id;
    return`<div class="kpRow${use?" on":""}"><div class="kpRT"><b>${esc(i.name)} ink</b><span class="hint">${esc(i.note)}</span>${use?"":kpDelta(kpWith({ink:i.id,owned:Object.assign({},o,{inks:o.inks.concat(own?[]:[i.id])})}))}</div>
<div class="kpRB">${use?`<span class="kpUse">In use</span>`:own?`<button class="btn sm pri" data-use="ink:${i.id}">Use</button>`:kpBuyBtn("ink",i.id)}</div></div>`;}).join("");
  else{const V=INK_SIM.VOLTAGE,T=INK_SIM.STROKE,d0=INK_SIM.kitDefault();
    body=`<label class="kpSl"><span>Voltage <b id="kpVv">${kit.voltage.toFixed(1)} V</b></span><input type="range" id="kpV" min="${V.min}" max="${V.max}" step="${V.step}" value="${kit.voltage}"></label>
<p class="hint">Higher runs the machine faster and hits harder: a quicker marker and a narrower steady band, more trauma, and it hurts more.</p>
<label class="kpSl"><span>Stroke <b id="kpSv">${kit.stroke.toFixed(1)} mm</b></span><input type="range" id="kpS" min="${T.min}" max="${T.max}" step="${T.step}" value="${kit.stroke}"></label>
<p class="hint">A long stroke packs and shades faster but is harder on skin; a short one is gentle and precise.</p>
<p class="kpVs">Against ${d0.voltage} V and ${d0.stroke} mm:</p><div id="kpTuneD">${kpDeltaFrom(kpWith({voltage:d0.voltage,stroke:d0.stroke}),kit)}</div>
<button class="btn sm" id="kpReset">Back to ${d0.voltage} V, ${d0.stroke} mm</button>`;}
  host.innerHTML=`<h2>Your kit</h2>${live?`<p class="hint" style="margin-top:0">There's a sitting in the chair: changes count from the next one.</p>`:""}${kpSummary(kit)}
${segHtml("kpSeg",[["machine","Machine"],["needles","Needles"],["ink","Ink"],["tune","Tune"]],KP.sec)}<div class="kpBody">${body}</div>`;
  $("kpSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b)return;KP.sec=b.dataset.v;INK_SOUND.tick();kpRender();});
  host.querySelectorAll("[data-use]").forEach(b=>b.addEventListener("click",()=>{const [k,id]=b.dataset.use.split(":");kpKit()[k]=id;kpDone(`${k==="machine"?INK_SIM.MACHINES[id].name:INK_SIM.INKS[id].name+" ink"} in use`);}));
  host.querySelectorAll("[data-tray]").forEach(b=>b.addEventListener("click",()=>{const id=b.dataset.tray,k=kpKit();
    if(k.needles.includes(id)){if(k.needles.length<=1)return;k.needles=k.needles.filter(x=>x!==id);}else{if(k.needles.length>=INK_SIM.KIT_TRAY_MAX)return;k.needles.push(id);}
    kpDone();}));
  host.querySelectorAll("[data-buy]").forEach(b=>b.addEventListener("click",()=>kpBuy(...b.dataset.buy.split(":"))));
  const sl=(id,key,lab,unit)=>{const el=$(id);if(!el)return;el.addEventListener("input",()=>{const k=kpKit();k[key]=Math.round(+el.value*10)/10;$(lab).textContent=k[key].toFixed(1)+" "+unit;
      $("kpTuneD").innerHTML=kpDeltaFrom(kpWith({voltage:INK_SIM.kitDefault().voltage,stroke:INK_SIM.kitDefault().stroke}),k);const s=host.querySelector(".kpSum");if(s)s.outerHTML=kpSummary(k);});
    el.addEventListener("change",()=>save());};
  sl("kpV","voltage","kpVv","V");sl("kpS","stroke","kpSv","mm");
  const r=$("kpReset");if(r)r.addEventListener("click",()=>{const k=kpKit(),d0=INK_SIM.kitDefault();k.voltage=d0.voltage;k.stroke=d0.stroke;kpDone("Back to the usual tune");});}
/* deltas from kit a to kit b (the Tune view compares against the default sliders) */
function kpDeltaFrom(a,b){const keep=S.kit;S.kit=a;try{return kpDelta(b);}finally{S.kit=keep;}}
function kpDone(msg){S.kit=INK_SIM.kitClean(S.kit);save();INK_SOUND.tick();if(msg)toast(msg);kpRender();}
function kpBuy(kind,id){
  const price=INK_SIM.kitPrice(kind,id,S.year),k=kpKit(),o=k.owned;
  if((S.cash||0)<price){toast("Not enough cash");return;}
  const T=kind==="machine"?INK_SIM.MACHINES:kind==="needle"?INK_SIM.NEEDLES:INK_SIM.INKS,it=T[id];if(!it)return;
  if(kind==="machine"&&it.from&&S.year<it.from)return;
  S.cash-=price;
  if(kind==="machine"){o.machines.push(id);k.machine=id;}
  else if(kind==="ink"){o.inks.push(id);k.ink=id;}
  else{o.needles.push(id);if(k.needles.length<INK_SIM.KIT_TRAY_MAX)k.needles.push(id);}
  renderHeader();kpDone(`Bought: ${it.name}${kind==="ink"?" ink":""} (${fmtMoney(price)})`);
  const c=$("studioBody").querySelector(".kv dd:last-child");if(c)c.textContent=fmtMoney(S.cash);}
