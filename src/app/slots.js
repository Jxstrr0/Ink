/* ===================== app/slots.js: save slots and New career (PR 7) =====================
   Three manual slots (localStorage ink-slot1 .. ink-slot3, already in every backup code) in Settings › Save: save the
   running career into one, load one back, clear one. A slot holds the packed save (as ink-save) squeezed with the
   backup code's own LZW (buZip): {z, savedAt, week, year, stage, pieces}. A plain save object in a slot (as older tests
   and hand-made backups have) still loads; buSlotData (app/savecode.js) reads either.
   New career: the start screen on a first visit, and Settings › Save › New career after that. Two ways in: as Arkady's
   apprentice in week 1 of 2000 (Act 1, the tutorial), or "Skip the broom" (plan Q3): week 1 of 2003 in a rented chair
   with basic skills (INK_SIM.skipBroom). Settings and the last-backup time carry over; nothing else does. */
function slMeta(i){const o=buStored(slotKey(i));if(!o)return null;
  return{i,savedAt:o.savedAt||0,week:o.week||1,year:o.year||2000,stage:o.stage||(o.studio&&o.studio.stage)||"apprentice",pieces:typeof o.pieces==="number"?o.pieces:Array.isArray(o.pieces)?o.pieces.length:null};}
function slHtml(){
  const rows=[];for(let i=1;i<=SLOTS;i++){const m=slMeta(i);
    rows.push(`<div class="slR"><span class="slN"><b>Slot ${i}</b><span class="clMeta">${m?`Week ${m.week}, ${m.year} · ${esc(STAGE_NAMES[m.stage]||m.stage)}${m.savedAt?` · saved ${new Date(m.savedAt).toLocaleDateString("en-CA",{month:"short",day:"numeric"})}`:""}`:"Empty"}</span></span>
<span class="row"><button class="btn sm" data-slsave="${i}">Save here</button>${m?`<button class="btn sm" data-slload="${i}">Load</button><button class="btn sm" data-slclear="${i}" aria-label="Clear slot ${i}">Clear</button>`:""}</span></div>`);}
  return`<div id="slBox"><div class="slList" id="slList">${rows.join("")}</div><div class="row" style="margin-top:8px"><button class="btn" id="slNew">New career</button></div></div>`;}
function slWire(){
  const L=$("slList");if(!L)return;
  L.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
    if(b.dataset.slsave)slSave(+b.dataset.slsave);else if(b.dataset.slload)slLoad(+b.dataset.slload);else if(b.dataset.slclear)slClear(+b.dataset.slclear);});
  const n=$("slNew");if(n)n.addEventListener("click",()=>slNewOpen(false));}
function slRefresh(){const B=$("slBox");if(!B)return;B.outerHTML=slHtml();slWire();}
function slSave(i){
  if(slMeta(i)&&!confirm(`Save over slot ${i}?`))return;
  let ok=false;
  try{const o={z:buZip(new TextEncoder().encode(saveJson())),savedAt:Date.now(),week:S.week,year:S.year,stage:(S.studio&&S.studio.stage)||"apprentice",pieces:S.pieces.filter(p=>!p.by).length};
    localStorage.setItem(slotKey(i),JSON.stringify(o));ok=true;}catch(e){ok=false;}
  toast(ok?`Saved to slot ${i}`:"No room on this phone for another slot. Make a backup code instead.");if(ok)slRefresh();}
function slLoad(i){
  const o=buStored(slotKey(i));if(!o)return;let d=null;try{d=buSlotData(o);}catch(e){d=null;}
  if(!d||!buSaveOk(d)){toast("That slot's save is damaged");return;}
  if(!confirm(`Load slot ${i} (week ${d.week||1}, ${d.year||2000})? Your current career is replaced unless you've saved it to a slot.`))return;
  closeSheet();slReset();applyLoaded(d,`Slot ${i} loaded`);if(typeof caStage==="function")caStage();}
function slClear(i){if(!confirm(`Clear slot ${i}?`))return;try{localStorage.removeItem(slotKey(i));}catch(e){}toast(`Slot ${i} cleared`);slRefresh();}
/* the running screens' memory of the old career */
function slReset(){if(typeof CR!=="undefined"){CR.last=null;CR.lines=[];CR.say=null;}if(typeof GV!=="undefined"){GV.shop=false;GV.cache.clear&&GV.cache.clear();}if(typeof SH!=="undefined")SH.hire=false;}
function slNewOpen(first){
  const used=[1,2,3].filter(i=>slMeta(i)).length;
  openSheet(first?"Ink":"New career",`<section class="slStart"><p class="lgBig">${first?"A tattoo career in Mostograd":"Start again"}</p>
<p class="hint" style="margin-top:0">${first?"Thirty years, 2000 to 2030: an apprentice sweeping floors on the canal, then a rented chair, your own studio, and a waiting list of people who keep walking back through your door. Every client is an adult; every piece ages on them.":`This replaces the career you're playing now. Save it to a slot first if you want to come back to it (${used} of ${SLOTS} slots used).`}</p>
<button class="slOpt pri" id="slApp"><b>Start as an apprentice</b><span>Week 1, 2000. Arkady Sedov hands you a broom. The tutorial walks you through it, one goal at a time.</span></button>
<button class="slOpt" id="slSkip"><b>Skip the broom</b><span>Week 1, 2003. Your own rented chair, basic skills and a little cash. For players who know the ropes.</span></button>
${first?`<p class="hint">Played before on another phone? <button class="btn sm" id="slRestore">Restore a backup</button></p>`:`<div class="row"><button class="btn" id="slSlot">Save the current career to a slot first</button></div>`}</section>`);
  $("slApp").addEventListener("click",()=>slStart(false,first));$("slSkip").addEventListener("click",()=>slStart(true,first));
  const r=$("slRestore");if(r)r.addEventListener("click",buRestoreOpen);
  const sl=$("slSlot");if(sl)sl.addEventListener("click",openSettings);}
function slStart(skip,first){
  if(!first&&!confirm(skip?"Start a new career in a rented chair (2003)? The current one is replaced.":"Start a new career as an apprentice (2000)? The current one is replaced."))return;
  const keep={settings:S.settings,bkAt:S.bkAt};
  S=freshState();S.settings=keep.settings;S.bkAt=keep.bkAt||0;
  if(skip&&SIMOK("skipBroom"))INK_SIM.skipBroom(S);
  slReset();save();closeSheet();if(typeof caStage==="function")caStage();
  if(typeof showTab==="function")showTab("career");
  toast(skip?"Week 1, 2003: your own chair":"Week 1, 2000: grab the broom");}
