/* ===================== app/perf.js: graphics tiers and auto-adjust =====================
   Three tiers: lite (phone default), full, ultra. S.settings.gfx is the player's pick (null = automatic: lite on phones,
   full elsewhere). Auto-adjust (S.settings.gfxAuto, on unless false), lifted from Prairie Engine Works: while INK_VIS runs
   a frame loop, watch its fps; if it stays under ~27 fps for ~8 s, step ONE tier down (ultra > full > lite) and say so.
   It never steps up, and a manual pick after an auto-drop is respected for the session. A still scene reports no fps,
   so nothing happens while the studio is idle. */
const PERF={T:["lite","full","ultra"],LOW:27,NEED:8000,SETTLE:6000,HOLD:3000,boot:performance.now(),f:null,fAt:0,sAt:0,low:0,tier:null,tab:null,holdTo:0,dropped:false,manual:false,force:null};
function perfTier(){return S.settings.gfx||(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)?"lite":"full");}
function applyGfx(){if(typeof INK_VIS!=="undefined"&&INK_VIS.ready())INK_VIS.setTier(perfTier());}
function perfReset(hold){PERF.low=0;PERF.sAt=0;if(hold)PERF.holdTo=performance.now()+PERF.HOLD;}
function perfPoll(){
  if(!S||typeof INK_VIS==="undefined"||!INK_VIS.ready())return;
  const now=performance.now();
  if(S.settings.gfxAuto===false||(PERF.dropped&&PERF.manual)||document.hidden||now-PERF.boot<PERF.SETTLE){perfReset(true);return;}
  if(navigator.webdriver&&PERF.force==null)return;
  const tier=perfTier();if(tier!==PERF.tier){PERF.tier=tier;perfReset(true);}
  if(curTab!==PERF.tab){PERF.tab=curTab;perfReset(true);}
  if(now<PERF.holdTo)return;
  const f=INK_VIS.fps();let fps;
  if(PERF.force!=null){fps=PERF.force;if(!PERF.sAt){PERF.sAt=now;return;}}
  else if(f!=null&&f!==PERF.f){PERF.f=f;PERF.fAt=now;fps=f;if(!PERF.sAt){PERF.sAt=now;return;}}
  else{if(now-PERF.fAt>1500)perfReset(false);return;}   // nothing drawn lately: start over
  const el=Math.min(now-PERF.sAt,1000);PERF.sAt=now;
  if(fps>0&&fps<PERF.LOW)PERF.low+=el;else PERF.low=Math.max(0,PERF.low-2*el);
  if(PERF.low<PERF.NEED)return;
  PERF.low=0;const i=PERF.T.indexOf(tier);if(i<1)return;
  const n=PERF.T[i-1];PERF.dropped=true;S.settings.gfx=n;applyGfx();save();perfReset(true);
  toast(`Graphics lowered to ${n[0].toUpperCase()+n.slice(1)} to keep things smooth. Change it in Settings.`);}
setInterval(perfPoll,500);
