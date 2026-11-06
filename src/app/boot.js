/* ===================== app/boot.js: tabs, the sheet, Settings, PWA, start =====================
   showTab(t) swaps the five tabs (Studio, Design, Session, Clients, Career) and remembers each one's scroll place.
   The sheet (#sheet) hosts Settings, Back up and Restore. The PWA part (lifted from PEW's pwa.js) registers sw.js on a
   real host (never localhost unless ?sw=1, never file://), shows the "New version ready" bar when a new worker waits,
   and offers Install in Settings when the browser allows it. start() runs once, from html/tail.html. */
let curTab="studio";
const TABS=["studio","design","session","clients","career"];
const tabScroll={};
function showTab(t){if(!TABS.includes(t))t="studio";const pn=$("panel");tabScroll[curTab]=pn.scrollTop;curTab=t;
  document.documentElement.setAttribute("data-tab",t);
  document.querySelectorAll("#tabs button").forEach(b=>{const on=b.dataset.tab===t;b.classList.toggle("on",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
  document.querySelectorAll(".tabpage").forEach(p=>p.classList.toggle("on",p.id==="tab-"+t));
  renderTab(t);pn.scrollTop=tabScroll[t]||0;
  if(t==="studio"&&typeof INK_VIS!=="undefined"&&INK_VIS.ready())INK_VIS.resize();}
function renderTab(t){({studio:renderStudio,design:renderDesign,session:renderSession,clients:renderClients,career:renderCareer})[t]();}
function renderHeader(){$("whenLbl").textContent=`Week ${S.week}, ${S.year}`;$("cashLbl").textContent=fmtMoney(S.cash);}
function renderAll(){renderHeader();renderTab(curTab);}

/* ---- the sheet ---- */
let sheetBack=null;
function openSheet(title,html){sheetBack=document.activeElement;$("sheetTitle").textContent=title;$("sheetBody").innerHTML=html;$("sheet").classList.add("on");$("scrim").classList.add("on");$("sheetBody").scrollTop=0;}
function closeSheet(){$("sheet").classList.remove("on");$("scrim").classList.remove("on");if(sheetBack&&sheetBack.focus)try{sheetBack.focus({preventScroll:true});}catch(e){}sheetBack=null;}
function sheetOn(){return $("sheet").classList.contains("on");}

/* ---- Settings ---- */
function segHtml(id,opts,cur){return `<div class="seg" id="${id}" role="group">${opts.map(([v,l])=>`<button type="button" data-v="${v}" class="${String(v)===String(cur)?"on":""}" aria-pressed="${String(v)===String(cur)}">${l}</button>`).join("")}</div>`;}
function openSettings(){
  const st=S.settings;
  openSheet("Settings",`
<section><h3>Look</h3><div class="row">${segHtml("setTheme",[["dark","Dark"],["light","Light"],["auto","Auto"]],st.theme)}</div>
<div class="row" style="margin-top:8px">${segHtml("setReduced",[["0","Effects on"],["1","Reduced"]],st.reduced?1:0)}</div></section>
<section><h3>Graphics</h3><div class="row">${segHtml("setGfx",[["","Auto"],["lite","Lite"],["full","Full"],["ultra","Ultra"]],st.gfx||"")}</div>
<div class="row" style="margin-top:8px">${segHtml("setGfxAuto",[["1","Auto-adjust on"],["0","Off"]],st.gfxAuto===false?0:1)}</div>
<p class="hint">Lite is the phone default. Auto-adjust steps down a tier if the studio stutters.</p></section>
<section><h3>Sound</h3><div class="row">${segHtml("setSound",[["1","On"],["0","Off"]],st.sound===false?0:1)}</div></section>
<section><h3>Save</h3><p class="hint" style="margin-top:0">Your game saves itself on this device. A backup code or file moves it to another phone.</p>
<div class="row"><button class="btn" id="bkCode">Back up</button><button class="btn" id="bkRestore">Restore</button><button class="btn" id="bkFile">Save file</button><button class="btn" id="bkLoad">Load file</button></div></section>
<section id="set-app" hidden><h3>App</h3><div class="row"><button class="btn pri" id="pwaInstall" hidden>Install app</button></div>
<p class="hint" id="pwaIos" hidden>On iPhone or iPad: tap Share, then <b>Add to Home Screen</b>.</p></section>
<section><h3>About</h3><p class="hint" style="margin-top:0">Ink ${VERSION}. © ${new Date().getFullYear()} Kelbo / Longlight Interactive.</p>
<p class="hint">Some design elements are icons by Lorc and Delapouite from <a href="https://game-icons.net/" target="_blank" rel="noopener">game-icons.net</a>, licensed <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a> and reshaped for tattoo flash. Full list: <a href="https://github.com/Jxstrr0/Ink/blob/main/art/CREDITS.md" target="_blank" rel="noopener">art/CREDITS.md</a>.</p></section>`);
  const seg=(id,fn)=>$(id).addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b)return;
    $(id).querySelectorAll("button").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});fn(b.dataset.v);save();});
  seg("setTheme",v=>{st.theme=v;applyTheme();});
  seg("setReduced",v=>{st.reduced=v==="1";applySettings();});
  seg("setGfx",v=>{st.gfx=v||null;PERF.manual=true;perfReset(true);applyGfx();});
  seg("setGfxAuto",v=>{st.gfxAuto=v==="1";PERF.dropped=PERF.manual=false;perfReset(true);});
  seg("setSound",v=>{st.sound=v==="1";INK_SOUND.setOn(st.sound);});
  $("bkCode").addEventListener("click",buBackupOpen);$("bkRestore").addEventListener("click",buRestoreOpen);
  $("bkFile").addEventListener("click",buFileSave);$("bkLoad").addEventListener("click",buFileLoad);
  pwaSync();}

/* ---- PWA: install offer and the update bar ---- */
let pwaDeferred=null;
const pwaStandalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const pwaIos=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function pwaSync(){const sec=$("set-app");if(!sec)return;const inst=!!pwaDeferred&&!pwaStandalone(),tip=pwaIos()&&!pwaStandalone();
  $("pwaInstall").hidden=!inst;$("pwaIos").hidden=!tip;sec.hidden=!(inst||tip);
  $("pwaInstall").onclick=async()=>{if(!pwaDeferred)return;const p=pwaDeferred;pwaDeferred=null;pwaSync();try{p.prompt();const r=await p.userChoice;if(r&&r.outcome==="accepted")toast("Installed");}catch(_){}};}
function pwaInit(){
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();pwaDeferred=e;pwaSync();});
  window.addEventListener("appinstalled",()=>{pwaDeferred=null;pwaSync();});
  const bar=document.createElement("div");bar.id="pwaBar";bar.setAttribute("role","status");
  bar.innerHTML='<span>New version ready</span><button type="button" class="btn sm pri" id="pwaReload">Reload</button><button type="button" class="pwalater" id="pwaLater" aria-label="Dismiss until next visit">Later</button>';
  document.body.appendChild(bar);
  let waiting=null,reloading=false;
  const offer=w=>{waiting=w;bar.classList.add("on");};
  $("pwaLater").addEventListener("click",()=>bar.classList.remove("on"));
  $("pwaReload").addEventListener("click",()=>{if(waiting)waiting.postMessage({type:"SKIP_WAITING"});else location.reload();});
  const host=location.hostname,web=/^https?:$/.test(location.protocol),local=/^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/.test(host);
  if(!("serviceWorker" in navigator)||!web||(local&&!/[?&]sw=1(&|$)/.test(location.search)))return;
  const sw=navigator.serviceWorker;
  sw.addEventListener("controllerchange",()=>{if(reloading||!waiting)return;reloading=true;location.reload();});
  sw.register("sw.js").then(reg=>{
    const watch=w=>w&&w.addEventListener("statechange",()=>{if(w.state==="installed"&&sw.controller)offer(w);});
    if(reg.waiting&&sw.controller)offer(reg.waiting);
    watch(reg.installing);reg.addEventListener("updatefound",()=>watch(reg.installing));
    /* an installed app can stay open for days: look for a new version when it comes back to the front and every few hours */
    const chk=()=>{try{reg.update().catch(()=>{});}catch(_){}};
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)chk();});setInterval(chk,4*3600*1000);
  }).catch(()=>{});}

/* ---- start: load the save, wire the page, draw the studio ---- */
function start(){
  loadSaved();applySettings();
  document.querySelectorAll("#tabs button").forEach(b=>b.addEventListener("click",()=>{INK_SOUND.tick();const again=b.dataset.tab===curTab;showTab(b.dataset.tab);if(again)$("panel").scrollTo({top:0});}));
  $("setOpen").addEventListener("click",openSettings);
  $("sheetClose").addEventListener("click",closeSheet);$("scrim").addEventListener("click",closeSheet);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&sheetOn()){closeSheet();e.preventDefault();}});
  $("bkFileIn").addEventListener("change",e=>buFileRead(e.target));
  matchMedia("(prefers-color-scheme: light)").addEventListener("change",()=>{if(S.settings.theme==="auto")applyTheme();});
  try{if(typeof INK_VIS!=="undefined")INK_VIS.init($("gl"),perfTier());}catch(e){}
  pwaInit();
  renderHeader();showTab("studio");
  save();
  window.__ldDone&&__ldDone();}
