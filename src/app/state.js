<script>
/* ===================== Ink: app =====================
   The app script is one top-level script spread over src/app/ (state.js opens it, help.js closes it; html/tail.html then
   calls start()). It glues INK_SIM (numbers) and INK_VIS (pictures) to the page.
   state.js: VERSION, small helpers ($, esc, fmtMoney, toast), the state object S, save / load / snapshot / hydrate,
   the three save slots and the theme. S is defined ONCE, in freshState() below; later PRs add fields there (and to the
   S map in src/README.md), never inline. localStorage keys: ink-save, ink-slot1 .. ink-slot3 (all inside try/catch). */
const VERSION="0.1.15.0";
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/* money display: rubles, matching Lombard (plan Q15). Only this table changes the symbol */
const MONEY={sym:"₽",before:false};
const fmtMoney=n=>{const s=Math.round(Math.abs(n)).toLocaleString("en-CA");return(n<0?"-":"")+(MONEY.before?MONEY.sym+s:s+" "+MONEY.sym);};

/* ---- the state object ---- */
const SAVE_KEY="ink-save",SLOTS=3,slotKey=i=>"ink-slot"+i;
const SAVE_V=1;   // bump when a save needs migrating in hydrate()
function freshState(){return{
  v:SAVE_V,
  week:1,            // 1..52 within the year
  year:2000,         // 2000..2030
  cash:3000,         // money on hand; an apprentice starts with a little saved for needles and ink (PR 4)
  rate:0,            // your hourly rate (PR 7: RATE_BY_REP x PRICE_INDEX); 0 while an apprentice
  rep:{walkins:0,collectors:0,peers:0},   // the three reputation tracks, each 0..100 (sim/heal.js REP_TRACKS, PR 5)
  skills:{styles:{},consult:0,linework:0,shading:0,colour:0,speed:0},   // levels 0..10; styles keyed by STYLES id (SKILLS, PR 7)
  kit:{machine:"coil_used",needles:["3RL","7RL","7M1"],ink:"budget",voltage:7,stroke:3.5,owned:{machines:["coil_used"],needles:["3RL","7RL","7M1"],inks:["budget"]}},
                     // the kit (PR 4, sim/kit.js KIT_DEFAULT): machine, the needle groupings on the tray, ink tier, voltage (V),
                     // stroke (mm) and what you own. tools/session-test.js checks this literal matches KIT_DEFAULT
  session:null,      // the chair (PR 4): null, or {live: the sitting in progress (INK_SIM.sessionNew's object, numbers only)
                     // or null, next: a sample walk-in's piece waiting for its next sitting or null}
  clients:[],        // client records (PR 3); full for the CLIENT_CAP most recent/loyal, compacted after (PR 7)
  pieces:[],         // every tattoo: design parameters + session outputs + date, never pictures (PR 4); PR 5 adds heal,
                     // healW/healY, portfolio (true or absent) and, for a sample walk-in, review {stars, text}
  reveals:[],        // ids of healed pieces whose reveal you haven't seen yet, oldest first (PR 5, sim/heal.js REVEAL_CAP)
  queue:[],          // booked sessions, including later sessions of multi-session pieces (PR 3, PR 4)
  studio:SIMOK("studioFresh")?INK_SIM.studioFresh():{stage:"apprentice",staff:[]},
                     // the shop (PR 7, sim/career.js studioFresh): stage apprentice | chair | studio | legacy, staff [{id, name,
                     // style, skill, ego, cut, loyalty, pieces, earned, ...}], build {stations, waiting, flash, steril, lighting,
                     // storefront} levels, vibe, marketing (MARKETING index), rep (the shop's own 0..100), lease {w,y}, nextStaff
  career:SIMOK("careerFresh")?INK_SIM.careerFresh():null,
                     // the career (PR 7, sim/career.js careerFresh): mentor {goodwill, left, loan}, Act 1 steps/chores/practice/
                     // friends, sig (signature counts), money {cur, prev, total} ledger, broke weeks, fails, scene (a full-screen
                     // scene waiting: broke | legacy), invites, conv (conventions entered), guest (a guest spot running), offers
                     // (Act 4), apprentices, alumni, rivals (PR 8: rival shops), reached {chair, studio, legacy: {w,y}}, books,
                     // skipped, insp; PR 8: closed {until, w, y, why} (shut by the inspector), inspLast, inspFails, lastFail
  goals:{},          // GOALS done, id -> {w,y} (PR 8, sim/events.js GOALS)
  world:SIMOK("worldFresh")?INK_SIM.worldFresh():null,
                     // events, social media and reckonings (PR 8, sim/events.js worldFresh): fired {reckoning id: {w,y,...}},
                     // plan, pending [events waiting for a choice], nextEv, mods {rate, fresh}, social {on, followers, posts
                     // [[piece no, week index, reach]], viral, booked, bad, gained}
  board:{design:null,bodyShape:"neutral",skinTone:0.3,client:"wk_office",item:null},   // the design board (PR 2): the working design; client = a sample id or a real client id, item = the booking being designed for (PR 3)
                     // (a design as in docs/SIM-CONTRACT.md, null = empty), the body shape and skin tone it is drawn for,
                     // and the sample walk-in it is scored against (DZ_SAMPLE_CLIENTS id until PR 3 brings real clients)
  flash:[],          // your own flash: designs saved from the board, {id, name, design, w, y}; FLASH_MINE_CAP of them (PR 2)
  seed:(Date.now()>>>0)%2147483647||1,   // the career's rng seed (INK_SIM.rng); the only Date-based value in the game
  settings:{theme:"dark",gfx:null,gfxAuto:true,sound:true,reduced:false,handed:"right",assist:false,flatStencil:false,tips:true},   // handed and assist: the session (PR 4); flatStencil: the flat placement view (PR 6); tips: help overlays on (PR 9)
  help:{},           // help overlays already seen (PR 9, app/help.js HELP_TIPS): tip id -> {w, y}; a new career starts with none
  bkAt:0             // when the last backup code or file was made (app/savecode.js)
};}
let S=freshState();
function SIMOK(f){return typeof INK_SIM!=="undefined"&&typeof INK_SIM[f]==="function";}

/* save(): the game into ink-save, packed (INK_SIM.packSave: older pieces and archived clients as short arrays; hydrate
   unpacks them). If the browser refuses (storage full), say so once in a while and offer a backup code */
const SAVE_WARN={at:0,gap:120000};
function save(){if(saveSoonT){clearTimeout(saveSoonT);saveSoonT=0;}try{localStorage.setItem(SAVE_KEY,saveJson());if(typeof buPersist==="function")buPersist();}catch(e){saveFull(e);}}
/* saveSoon: for saves that happen many times a minute (every finger lift in a session, every stencil drag), write once
   the player pauses for SAVE_SOON ms. A late career's save is over a megabyte, so writing it on every stroke could
   stutter a slow phone. A pending save is flushed when the page is hidden or closed, and any save() cancels it. */
const SAVE_SOON=1500;let saveSoonT=0;
function saveSoon(){clearTimeout(saveSoonT);saveSoonT=setTimeout(()=>{saveSoonT=0;save();},SAVE_SOON);}
function saveFlush(){if(saveSoonT){clearTimeout(saveSoonT);saveSoonT=0;save();}}
if(typeof addEventListener==="function"){addEventListener("pagehide",saveFlush);addEventListener("visibilitychange",()=>{if(typeof document!=="undefined"&&document.hidden)saveFlush();});}
function saveJson(){return JSON.stringify(SIMOK("packSave")?INK_SIM.packSave(S):S);}
function snapshot(){return JSON.parse(saveJson());}
function saveFull(e){const now=Date.now();if(now-SAVE_WARN.at<SAVE_WARN.gap||typeof document==="undefined")return;SAVE_WARN.at=now;
  if(typeof toast==="function")toast("This phone's storage is full, so the game couldn't save","warn");
  if(typeof openSheet!=="function"||typeof buBackupOpen!=="function"||(typeof sheetOn==="function"&&sheetOn()))return;
  openSheet("Storage full",`<p style="margin-top:0">This browser wouldn't let Ink save (its storage is full or blocked). Your career is still open here, but it may be lost when you close the page.</p>
<p class="hint">Make a backup code now and keep it in your notes. Clearing a save slot you don't need (Settings › Save) frees room too.</p>
<div class="row"><button class="btn pri" id="sfBack" style="flex:1">Back up now</button></div>`);$("sfBack").addEventListener("click",buBackupOpen);}
/* load a saved object into S on top of a fresh state, so a field added since that save gets its default. false if it
   isn't an Ink save. */
function hydrate(o){
  if(!o||typeof o!=="object"||Array.isArray(o))return false;
  if(o.settings!=null&&(typeof o.settings!=="object"||Array.isArray(o.settings)))return false;
  const f=freshState();
  const ob=o.board&&typeof o.board==="object"&&!Array.isArray(o.board)?o.board:{};
  const ok=o.kit&&typeof o.kit==="object"&&!Array.isArray(o.kit)?o.kit:{};
  S=Object.assign(f,o,{settings:Object.assign(f.settings,o.settings||{}),board:Object.assign(f.board,ob),
    kit:Object.assign(f.kit,ok,{owned:Object.assign(f.kit.owned,ok.owned&&typeof ok.owned==="object"?ok.owned:{})})});
  if(!Array.isArray(S.flash))S.flash=[];
  if(!S.help||typeof S.help!=="object"||Array.isArray(S.help))S.help={};   // PR 9
  S.reveals=Array.isArray(S.reveals)?S.reveals.filter(x=>typeof x==="string"):[];   // PR 5
  if(!S.rep||typeof S.rep!=="object"||Array.isArray(S.rep))S.rep=freshState().rep;
  for(const k of ["walkins","collectors","peers"])S.rep[k]=Math.max(0,Math.min(100,+S.rep[k]||0));
  if(S.session!=null&&(typeof S.session!=="object"||Array.isArray(S.session)))S.session=null;
  if(typeof INK_SIM!=="undefined"&&INK_SIM.kitClean)S.kit=INK_SIM.kitClean(S.kit);   // unknown ids dropped, sliders clamped
  /* PR 7: a save from before the career has no career (careerEnsure then treats the tutorial as done); packed pieces and
     archived clients come back as records; studio and career get any field added since */
  if(!o.career||typeof o.career!=="object"||Array.isArray(o.career))S.career=null;
  if(!o.studio||typeof o.studio!=="object"||Array.isArray(o.studio))S.studio=freshState().studio;
  if(SIMOK("unpackSave"))INK_SIM.unpackSave(S);
  if(SIMOK("careerEnsure"))INK_SIM.careerEnsure(S);
  if(!o.world||typeof o.world!=="object"||Array.isArray(o.world))S.world=null;   // PR 8: worldEnsure fills it
  if(SIMOK("worldEnsure"))INK_SIM.worldEnsure(S);
  S.v=SAVE_V;
  return true;}
function loadSaved(){try{const j=localStorage.getItem(SAVE_KEY);if(j&&hydrate(JSON.parse(j)))return true;}catch(e){}S=freshState();return false;}
/* a restored or slot-loaded game takes over the running one */
function applyLoaded(o,msg){if(!hydrate(o)){toast("That save couldn't be loaded");return;}save();applySettings();renderAll();toast(msg||"Loaded");}

/* ---- theme and settings ---- */
function applyTheme(){const t=S.settings.theme||"dark";const eff=t==="auto"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):t;
  document.documentElement.setAttribute("data-theme",eff);
  const m=document.querySelector("meta[name=theme-color]");if(m)m.setAttribute("content",eff==="light"?"#f4efe6":"#17130f");}
function applySettings(){applyTheme();document.documentElement.classList.toggle("noanim",!!S.settings.reduced);INK_SOUND.setOn(S.settings.sound!==false);applyGfx();}

/* ---- toast ---- */
/* toast(msg, kind): kind names why it matters. Only the kinds in TOAST_CHIME play the chime (0.1.13.0); every other toast
   (a hint, a confirmation, "Saved to slot 2") shows silently */
const TOAST_CHIME={goal:1,event:1,heal:1,reveal:1,piece:1,money:1,milestone:1,warn:1};
function toast(msg,kind){const t=$("toast");if(!t)return;t.textContent=msg;t.classList.add("on");
  if(kind&&TOAST_CHIME[kind]&&typeof INK_SOUND!=="undefined")INK_SOUND.chime();clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("on"),2600);}
