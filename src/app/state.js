<script>
/* ===================== Ink: app =====================
   The app script is one top-level script spread over src/app/ (state.js opens it, help.js closes it; html/tail.html then
   calls start()). It glues INK_SIM (numbers) and INK_VIS (pictures) to the page.
   state.js: VERSION, small helpers ($, esc, fmtMoney, toast), the state object S, save / load / snapshot / hydrate,
   the three save slots and the theme. S is defined ONCE, in freshState() below; later PRs add fields there (and to the
   S map in src/README.md), never inline. localStorage keys: ink-save, ink-slot1 .. ink-slot3 (all inside try/catch). */
const VERSION="0.1.4.0";
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
  rep:{walkins:0,collectors:0,peers:0},   // the three reputation tracks (REP_TRACKS, PR 5)
  skills:{styles:{},consult:0,linework:0,shading:0,colour:0,speed:0},   // levels 0..10; styles keyed by STYLES id (SKILLS, PR 7)
  kit:{machine:"coil_used",needles:["3RL","7RL","7M1"],ink:"budget",voltage:7,stroke:3.5,owned:{machines:["coil_used"],needles:["3RL","7RL","7M1"],inks:["budget"]}},
                     // the kit (PR 4, sim/kit.js KIT_DEFAULT): machine, the needle groupings on the tray, ink tier, voltage (V),
                     // stroke (mm) and what you own. tools/session-test.js checks this literal matches KIT_DEFAULT
  session:null,      // the chair (PR 4): null, or {live: the sitting in progress (INK_SIM.sessionNew's object, numbers only)
                     // or null, next: a sample walk-in's piece waiting for its next sitting or null}
  clients:[],        // client records (PR 3); full for the CLIENT_CAP most recent/loyal, compacted after (PR 7)
  pieces:[],         // every tattoo: design parameters + session outputs + date, never pictures (PR 4, PR 5)
  queue:[],          // booked sessions, including later sessions of multi-session pieces (PR 3, PR 4)
  studio:{stage:"apprentice",staff:[]},   // apprentice | chair | studio | legacy (PR 7)
  goals:{},          // GOALS done, id -> {w,y} (PR 8)
  board:{design:null,bodyShape:"neutral",skinTone:0.3,client:"wk_office",item:null},   // the design board (PR 2): the working design; client = a sample id or a real client id, item = the booking being designed for (PR 3)
                     // (a design as in docs/SIM-CONTRACT.md, null = empty), the body shape and skin tone it is drawn for,
                     // and the sample walk-in it is scored against (DZ_SAMPLE_CLIENTS id until PR 3 brings real clients)
  flash:[],          // your own flash: designs saved from the board, {id, name, design, w, y}; FLASH_MINE_CAP of them (PR 2)
  seed:(Date.now()>>>0)%2147483647||1,   // the career's rng seed (INK_SIM.rng); the only Date-based value in the game
  settings:{theme:"dark",gfx:null,gfxAuto:true,sound:true,reduced:false,handed:"right",assist:false},   // handed and assist: the session (PR 4)
  bkAt:0             // when the last backup code or file was made (app/savecode.js)
};}
let S=freshState();

function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot()));if(typeof buPersist==="function")buPersist();}catch(e){}}
function snapshot(){return JSON.parse(JSON.stringify(S));}
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
  if(S.session!=null&&(typeof S.session!=="object"||Array.isArray(S.session)))S.session=null;
  if(typeof INK_SIM!=="undefined"&&INK_SIM.kitClean)S.kit=INK_SIM.kitClean(S.kit);   // unknown ids dropped, sliders clamped
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
function toast(msg){const t=$("toast");if(!t)return;t.textContent=msg;t.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("on"),2600);}
