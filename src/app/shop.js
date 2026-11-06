/* ===================== app/shop.js: the shop cards on the Studio tab (PR 7) =====================
   Under the 3D view and the chair (app/studio.js), the shop at its stage (sim/career.js):
     apprentice  Arkady's shop and his goodwill
     chair       your rented chair: the split, your rate, what supplies cost
     studio      (Act 3 and 4) the shop's reputation, rent, marketing and the storefront vibe; the build-out
                 (STUDIO_STAGES: stations, waiting area, flash wall, sterilisation, lighting, storefront), each level with
                 its cost; your artists (STAFF): hire from this quarter's candidates, set the shop's cut, let them go. Their
                 pieces go to the Shop gallery (Clients › Work › Shop), never your own body of work.
   shopHtml(stage) returns the cards, shopWire() wires them; renderStudio calls both. */
const SH={hire:false};
function shRub(v){return Math.round(v*INK_SIM.priceIndex(S.year)/10)*10;}
function shStyle(id){return(INK_SIM.STYLES[id]||{}).name||id;}
function shopHtml(stage){
  if(!SIMOK("careerEnsure"))return"";
  const C=INK_SIM.careerEnsure(S),M=INK_SIM.MENTOR;
  if(stage==="apprentice")return`<div class="card"><h2>${esc(M.shop)}</h2>
<p class="hint" style="margin-top:0">${esc(M.name)}'s shop on the canal: three chairs, a wall of old-school flash and a back room that smells of green soap. You sweep, clean tubes and draw after closing. Arkady takes ${Math.round(INK_SIM.CHAIR_SPLIT.apprentice*100)}% of what you earn here and supplies the needles and ink.</p>
<div class="caRow"><span class="clMeta">Arkady's goodwill</span>${caBar(C.mentor.goodwill,"Arkady's goodwill")}</div>
<dl class="kv" style="margin-top:8px"><dt>Date</dt><dd>Week ${S.week}, ${S.year}</dd><dt>Cash</dt><dd>${fmtMoney(S.cash)}</dd></dl></div>`;
  if(stage==="chair"){const split=INK_SIM.CHAIR_SPLIT[C.split||"standard"];
    return`<div class="card"><h2>Your chair</h2><p class="hint" style="margin-top:0">${C.split==="mentor"?`Arkady's own chair at ${esc(M.shop)}, at a friend's split.`:"A rented chair in a busy shop off the embankment."} The shop keeps ${Math.round(split*100)}% of your sittings and deposits; gloves, film, needles and ink are yours to buy, about ${fmtMoney(shRub(INK_SIM.SUPPLIES.perHour))} a booked hour.</p>
<dl class="kv"><dt>Your rate</dt><dd>${fmtMoney(S.rate)} an hour</dd><dt>Cash</dt><dd>${fmtMoney(S.cash)}</dd></dl>
<div class="row" style="margin-top:10px"><button class="btn" id="shCareer">Your own studio: see the Career tab</button></div></div>`;}
  const st=S.studio,b=st.build||{},B=INK_SIM.STUDIO_STAGES,room=INK_SIM.staffRoom(S),mine=S.pieces.filter(p=>p.by).length;
  const rent=shRub(INK_SIM.LEASE.rentWeek+INK_SIM.LEASE.utilities+B.stations.upkeep*(b.stations||0));
  const mk=INK_SIM.MARKETING,V=INK_SIM.VIBES;
  const build=Object.keys(B).map(k=>{const T=B[k],lv=b[k]||0,max=T.cost.length,cost=INK_SIM.buildCost(S,k);
    return`<div class="shB"><span class="shBN"><b>${esc(T.name)}</b><span class="clMeta">${lv?esc(T.levels[lv-1]):"Not yet"} · ${esc(T.says)}</span>
<span class="shLv" aria-label="Level ${lv} of ${max}">${Array.from({length:max},(_,i)=>`<i class="${i<lv?"on":""}"></i>`).join("")}</span></span>
${cost!=null?`<button class="btn sm" data-build="${k}"${S.cash<cost?" disabled":""}>${lv?"Upgrade":"Build"} · ${fmtMoney(cost)}</button>`:`<span class="clMeta ok">Done</span>`}</div>`;}).join("");
  const staff=st.staff.map(s=>{const fair=INK_SIM.fairCut(s.skill),hi=s.cut>fair+0.02;
    return`<div class="shS"><div class="shSH"><b>${esc(s.name)}</b><span class="clMeta">${esc(shStyle(s.style))} · skill ${s.skill.toFixed(1)} · ${s.pieces||0} pieces</span></div>
<div class="caRow"><span class="clMeta">Loyalty</span>${caBar(s.loyalty,s.name+" loyalty")}</div>
<div class="row shCut"><span class="clMeta">Shop's cut</span><button class="btn sm" data-cut="${esc(s.id)}" data-d="-0.05" aria-label="Lower the shop's cut">−</button><b>${Math.round(s.cut*100)}%</b><button class="btn sm" data-cut="${esc(s.id)}" data-d="0.05" aria-label="Raise the shop's cut">+</button>
<span class="clMeta ${hi?"warn":""}">${hi?`Fair is about ${Math.round(fair*100)}%: they'll drift`:`Fair (about ${Math.round(fair*100)}%)`}</span></div>
<div class="row"><button class="btn sm" data-letgo="${esc(s.id)}">Let go</button></div></div>`;}).join("");
  const cands=SH.hire&&room>0?INK_SIM.staffCandidates(S):[],fee=shRub(INK_SIM.STAFF.hireFee);
  return`<div class="card"><h2>${stage==="legacy"?"Your studio, years on":"Your studio"}</h2>
<dl class="kv"><dt>Shop's reputation</dt><dd>${Math.round(st.rep||0)} / 100</dd><dt>Rent and upkeep</dt><dd>${fmtMoney(rent)} a week</dd><dt>Cash</dt><dd>${fmtMoney(S.cash)}</dd></dl>
<h3 style="margin-top:12px">Storefront vibe</h3>${segHtml("shVibe",Object.keys(V).map(k=>[k,V[k].name]),st.vibe)}
<p class="hint">${esc(V[st.vibe].says)}.${(b.storefront||0)?"":" It counts once you build a storefront."}</p>
<h3 style="margin-top:12px">Marketing</h3><label class="shSel"><span class="sr">Marketing</span><select id="shMk">${mk.map((m,i)=>`<option value="${i}"${i===(st.marketing||0)?" selected":""}>${esc(m.name)}${m.cost?` · ${fmtMoney(shRub(m.cost))} a week`:""}</option>`).join("")}</select></label></div>
<div class="card"><h2>Build-out</h2><div class="shBs">${build}</div></div>
<div class="card"><h2>Artists</h2>${staff||`<p class="hint" style="margin-top:0">Nobody yet. Each station holds one artist. They take walk-ins in their own style; the shop keeps its cut.</p>`}
${room>0?(SH.hire?`<h3 style="margin-top:10px">Looking for a chair this season</h3>${cands.length?cands.map(c=>`<div class="shS cand"><div class="shSH"><b>${esc(c.name)}</b><span class="clMeta">${esc(shStyle(c.style))} · skill ${c.skill.toFixed(1)} · wants the shop's cut at ${Math.round(c.cut*100)}%</span></div>
<div class="row"><button class="btn sm pri" data-hire="${esc(c.cid)}"${S.cash<fee?" disabled":""}>Hire · ${fmtMoney(fee)}</button></div></div>`).join(""):`<p class="hint">Nobody else this season. New artists come round every quarter.</p>`}`
:`<div class="row" style="margin-top:8px"><button class="btn" id="shHire">Hire an artist (${room} free station${room>1?"s":""})</button></div>`)
:`<p class="hint">${(b.stations||0)?"Every station is taken. Build another to hire.":"Build a station to hire an artist."}</p>`}
<div class="row" style="margin-top:10px"><button class="btn" id="shGal"${mine?"":" disabled"}>Shop gallery · ${mine}</button></div>
<p class="hint">A shop piece builds the shop's name, not yours. An infection on one of them is still on the shop.</p></div>`;}
function shopWire(){
  const on=(id,f)=>{const e=$(id);if(e)e.addEventListener("click",f);},body=$("studioBody"),re=()=>{save();renderHeader();renderStudio();};
  on("shCareer",()=>showTab("career"));
  on("shHire",()=>{SH.hire=true;INK_SOUND.tick();renderStudio();});
  on("shGal",()=>{if(typeof GV!=="undefined"){GV.shop=true;GV.show=40;}if(typeof CL!=="undefined")CL.view="work";showTab("clients");});
  const vb=$("shVibe");if(vb)vb.addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b)return;INK_SIM.setVibe(S,b.dataset.v);INK_SOUND.tick();re();});
  const mk=$("shMk");if(mk)mk.addEventListener("change",e=>{INK_SIM.setMarketing(S,+e.target.value);re();});
  if(!body)return;
  body.querySelectorAll("[data-build]").forEach(b=>b.addEventListener("click",()=>{const k=b.dataset.build,r=INK_SIM.buildUp(S,k);
    if(!r||r.ok===false){toast("Not enough cash");return;}toast(`${INK_SIM.STUDIO_STAGES[k].name}: ${INK_SIM.STUDIO_STAGES[k].levels[(S.studio.build[k]||1)-1]}`);re();}));
  body.querySelectorAll("[data-hire]").forEach(b=>b.addEventListener("click",()=>{const r=INK_SIM.hireStaff(S,b.dataset.hire);
    if(!r.ok){toast(r.why==="cash"?"Not enough cash for the hiring fee":r.why==="stations"?"No free station":"They've taken another job");return;}
    SH.hire=false;toast(`${r.staff.name} starts at your shop`);re();}));
  body.querySelectorAll("[data-cut]").forEach(b=>b.addEventListener("click",()=>{const s=S.studio.staff.find(x=>x.id===b.dataset.cut);if(!s)return;
    INK_SIM.setStaffCut(S,s.id,Math.round((s.cut+(+b.dataset.d))*100)/100);INK_SOUND.tick();re();}));
  body.querySelectorAll("[data-letgo]").forEach(b=>b.addEventListener("click",()=>{const s=S.studio.staff.find(x=>x.id===b.dataset.letgo);if(!s)return;
    if(!confirm(`Let ${s.name} go?`))return;INK_SIM.letGo(S,s.id,"let go");toast(`${s.first||s.name} clears out their station`);re();}));}
