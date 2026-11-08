<script>
/* ===================== Ink: INK_SOUND (sound/synth.js) =====================
   A small Web Audio synth. The audio context is made on the first tap (browsers block sound before one). tick() is the UI
   click. The machine buzz (PR 4): buzzStart(profile) on a finger down in the Session tab, buzzSet(ratio, rushed) as it moves,
   buzzStop() on lift. The profile is the machine's (sim/kit.js MACHINES buzz: wave, hz, cut, rough), so a used coil rattles
   and a pen hums; the pitch follows your pace (BUZZ.pitchLo + pitchK x pace ratio) and a rushed stroke makes it stutter (a
   square LFO gating the level). Parameters move by plain .value writes (no automation queue to pile up on a busy phone).
   Everything is quiet when S.settings.sound is off.
   PR 10: two short Kenney UI sounds (CC0, sounds/CREDITS.md): tick() plays sounds/tap.wav once it has loaded (the synth click
   until then, or if it fails), chime() plays sounds/toast.wav when a toast shows. They are fetched once, after the first tap
   has made the audio context (about 30 KB, every tier; the service worker caches sounds/). chime() never makes the context
   itself, so a toast before any tap stays silent. The machine buzz stays synthesised.
   0.1.21.0: the buzz spins up. It starts at BUZZ.spinFrom of its pitch (the rattle too) and reaches it over about BUZZ.spin
   seconds; buzzSet leaves the pitch alone until the spin-up is over.
   0.1.23.0: room ambience, sound effects and a shop radio, all made by Kelbo with ElevenLabs (sounds/CREDITS.md). Nothing
   loads before the first tap (unlock(): the first pointerup, touchend or key makes and resumes the audio context).
   Ambience: room(key, week) names the room (AMB_ROOMS, app/studio.js stAmb from renderHeader); only that room's 24 s loop
   is fetched, decoded and looped (leading and trailing mp3 padding trimmed off the loop points), crossfading over AMB.fade
   seconds when the room changes. AMB.rain layers amb-rain.mp3 quietly in the wet weeks of the year (AMB.rain.weeks: the
   game has no weather, and the shop window always shows the canal at night). The beds (ambience and radio) go through
   one gain that ducks under the machine buzz (AMB.duck). SFX: sfx(name) plays one of SFX if it has loaded (they are
   preloaded when the browser is idle after the unlock), never more than once per SFX_GAP ms each; it returns false when it
   did not play, so a caller can fall back to tick(). Radio: setRadio(on) streams RADIO.tracks through one <audio> element
   and a MediaElementSource (so a 90 s track is never decoded whole), one after the other; nothing is fetched while it is
   off. setAmbience(on) and setRadio(on) follow Settings › Sound; setOn(false) silences everything. A hidden page suspends
   the audio context and pauses the radio, and both come back when it is shown. Every failed fetch is silent. */
const UI_SOUNDS={tap:{file:"sounds/tap.wav",vol:0.32},toast:{file:"sounds/toast.wav",vol:0.28}};
/* ambience by room (the stage, or stShop's "sedov" for the chair in Arkady's front room); vol is the bed's level */
const AMB_ROOMS={apprentice:{file:"sounds/amb-back.mp3",vol:0.9},sedov:{file:"sounds/amb-back.mp3",vol:0.9},chair:{file:"sounds/amb-chair.mp3",vol:0.7},
  studio:{file:"sounds/amb-studio.mp3",vol:0.9},legacy:{file:"sounds/amb-legacy.mp3",vol:0.75}};
/* fade: crossfade seconds; duck: the beds' level while the machine buzzes, duckT its time constant; rain: the wet weeks */
const AMB={fade:1.5,duck:0.4,duckT:0.12,rain:{file:"sounds/amb-rain.mp3",vol:0.3,weeks:[[14,17],[37,46]]}};
const SFX={peel:{file:"sounds/sfx-peel.mp3",vol:0.55},glove:{file:"sounds/sfx-glove.mp3",vol:0.5},wipe:{file:"sounds/sfx-wipe.mp3",vol:0.5},
  ink:{file:"sounds/sfx-ink.mp3",vol:0.5},door:{file:"sounds/sfx-door.mp3",vol:0.45},till:{file:"sounds/sfx-till.mp3",vol:0.5},
  paper:{file:"sounds/sfx-paper.mp3",vol:0.55},reveal:{file:"sounds/sfx-reveal.mp3",vol:0.5},goal:{file:"sounds/sfx-goal.mp3",vol:0.45},
  tray:{file:"sounds/sfx-tray.mp3",vol:0.5}};
const SFX_GAP=300;
/* the shop radio: played in turn, level well under the ambience peaks (the tracks are mastered 12 LU louder) */
const RADIO={tracks:["sounds/radio-1.mp3","sounds/radio-2.mp3"],vol:0.14};
const BUZZ={vol:0.06,pitchLo:0.8,pitchK:0.28,pitchMax:1.6,rattle:0.5,stutterHz:12,stutter:0.85,attack:0.02,release:0.04,spin:0.16,spinFrom:0.45};
const INK_SOUND=(function(){
let ctx=null,master=null,on=true;
let bed=null;   // the beds' bus (ambience and radio), ducked under the buzz
function init(){if(ctx)return true;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return false;ctx=new A();master=ctx.createGain();master.gain.value=.5;master.connect(ctx.destination);
  bed=ctx.createGain();bed.gain.value=1;bed.connect(master);uiLoad();setTimeout(()=>{ambApply();radioApply();sfxIdle();},0);return true;}catch(e){ctx=null;return false;}}
/* the unlock: browsers only start audio from a tap, so the first one makes (or resumes) the context; then it stops listening */
const UNLOCK=["pointerup","touchend","keydown"];
function unlock(){if(!on)return;if(!init())return;try{if(ctx.state==="suspended"&&!document.hidden)ctx.resume();}catch(e){}
  if(ctx.state==="running")UNLOCK.forEach(k=>document.removeEventListener(k,unlock,true));}
if(typeof document!=="undefined")UNLOCK.forEach(k=>document.addEventListener(k,unlock,true));
/* decoded buffers by file: one fetch each, null when it failed (never retried this visit) */
const cache={};
function load(file){if(!ctx||typeof fetch!=="function")return Promise.resolve(null);
  if(!cache[file])cache[file]=fetch(file).then(r=>r.ok?r.arrayBuffer():null).then(ab=>ab?new Promise(res=>{try{const p=ctx.decodeAudioData(ab,res,()=>res(null));if(p&&p.catch)p.catch(()=>res(null));}catch(e){res(null);}}):null).catch(()=>null)
    .then(b=>{cache[file].buf=b;return b;});
  return cache[file];}
function loaded(file){return cache[file]&&cache[file].buf||null;}
/* ---- sound effects ---- */
const sfxAt={};
function sfx(k){const d=SFX[k];if(!d||!on||!ctx||(typeof document!=="undefined"&&document.hidden))return false;
  const b=loaded(d.file);if(!b){load(d.file);return false;}
  const now=Date.now();if(sfxAt[k]&&now-sfxAt[k]<SFX_GAP)return true;sfxAt[k]=now;
  try{if(ctx.state==="suspended")ctx.resume();const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=b;g.gain.value=d.vol;s.connect(g);g.connect(master);s.start();return true;}catch(e){return false;}}
let sfxAsked=false;
function sfxIdle(){if(sfxAsked||!ctx||!on)return;sfxAsked=true;const go=()=>{for(const k in SFX)load(SFX[k].file);};
  if(typeof requestIdleCallback==="function")requestIdleCallback(go,{timeout:6000});else setTimeout(go,3000);}
/* ---- ambience: a bed per room, plus rain; each layer is {file, src, g} ---- */
let ambOn=true,want={room:null,rain:false},duck=false;const lay={bed:null,rain:null},tok={bed:0,rain:0};
/* the loop between the first and last sound, so the mp3's padding doesn't leave a gap every 24 s */
function trim(b){const d=b.getChannelData(0),n=d.length,lim=Math.min(n>>2,8192),th=1e-4;let a=0,z=n;
  while(a<lim&&Math.abs(d[a])<th)a++;while(z>n-lim&&Math.abs(d[z-1])<th)z--;return[a/b.sampleRate,z/b.sampleRate];}
function layOff(k){const L=lay[k];lay[k]=null;if(!L)return;try{const t=ctx.currentTime;L.g.gain.cancelScheduledValues(t);L.g.gain.setTargetAtTime(0,t,AMB.fade/4);L.src.stop(t+AMB.fade*1.5);}catch(e){}}
function layTo(k,file,vol){
  if(!file){tok[k]++;layOff(k);return;}
  const L=lay[k];if(L&&L.file===file){if(L.vol!==vol){L.vol=vol;try{L.g.gain.setTargetAtTime(vol,ctx.currentTime,AMB.fade/4);}catch(e){}}return;}
  const my=++tok[k];
  load(file).then(b=>{if(my!==tok[k]||!b||!ctx)return;layOff(k);
    try{const s=ctx.createBufferSource(),g=ctx.createGain(),t=ctx.currentTime,lp=trim(b);s.buffer=b;s.loop=true;s.loopStart=lp[0];s.loopEnd=lp[1];
      g.gain.setValueAtTime(0,t);g.gain.setTargetAtTime(vol,t,AMB.fade/4);s.connect(g);g.connect(bed);s.start(t,lp[0]);lay[k]={file,vol,src:s,g};}catch(e){}});}
function wet(w){return AMB.rain.weeks.some(r=>w>=r[0]&&w<=r[1]);}
function ambApply(){if(!ctx)return;const play=on&&ambOn,R=play&&AMB_ROOMS[want.room];
  layTo("bed",R?R.file:null,R?R.vol:0);layTo("rain",R&&want.rain?AMB.rain.file:null,AMB.rain.vol);}
function room(key,week){want.room=key;want.rain=wet(+week||0);ambApply();}
function setDuck(v){if(duck===!!v)return;duck=!!v;if(!bed)return;try{const t=ctx.currentTime;bed.gain.cancelScheduledValues(t);bed.gain.setTargetAtTime(duck?AMB.duck:1,t,AMB.duckT*(duck?1:3));}catch(e){}}
/* ---- the radio: one <audio> element streamed through the bed bus ---- */
let radOn=false,rEl=null,rSrc=null,rIdx=0,rFails=0;
function radioNext(){rIdx=(rIdx+1)%RADIO.tracks.length;rEl.src=RADIO.tracks[rIdx];radioApply();}
function radioApply(){
  const play=radOn&&on&&ctx&&!(typeof document!=="undefined"&&document.hidden)&&rFails<RADIO.tracks.length;
  if(!play){if(rEl&&!rEl.paused)try{rEl.pause();}catch(e){}return;}
  try{if(!rEl){rEl=new Audio();rEl.preload="none";
      rEl.addEventListener("ended",()=>{rFails=0;radioNext();});
      rEl.addEventListener("playing",()=>{rFails=0;});
      rEl.addEventListener("error",()=>{rFails++;if(rFails<RADIO.tracks.length)radioNext();});
      try{rSrc=ctx.createMediaElementSource(rEl);const g=ctx.createGain();g.gain.value=RADIO.vol;rSrc.connect(g);g.connect(bed);}catch(e){rSrc=null;rEl.volume=RADIO.vol;}
      rEl.src=RADIO.tracks[rIdx];}
    if(ctx.state==="suspended")ctx.resume();
    if(rEl.paused){const p=rEl.play();if(p&&p.catch)p.catch(()=>{});}}catch(e){}}
/* a hidden page goes quiet; it comes back when shown */
if(typeof document!=="undefined")document.addEventListener("visibilitychange",()=>{if(!ctx)return;
  try{if(document.hidden){buzzStop();ctx.suspend();}else if(on)ctx.resume();}catch(e){}radioApply();});
/* the UI samples: fetched and decoded once, quietly skipped if anything fails (offline, old browser) */
const bufs={};let uiAsked=false;
function uiLoad(){if(uiAsked||!ctx||typeof fetch!=="function")return;uiAsked=true;
  for(const k in UI_SOUNDS)fetch(UI_SOUNDS[k].file).then(r=>r.ok?r.arrayBuffer():null).then(ab=>{if(!ab)return;
    ctx.decodeAudioData(ab,b=>{bufs[k]=b;},()=>{});}).catch(()=>{});}
function uiPlay(k){const b=bufs[k];if(!b)return false;try{if(ctx.state==="suspended")ctx.resume();const s=ctx.createBufferSource(),g=ctx.createGain();
  s.buffer=b;g.gain.value=UI_SOUNDS[k].vol;s.connect(g);g.connect(master);s.start();return true;}catch(e){return false;}}
function chime(){if(!on||!ctx)return;uiPlay("toast");}
/* a short soft click for taps on tabs and buttons */
function tick(){if(!on||!init())return;if(uiPlay("tap"))return;try{if(ctx.state==="suspended")ctx.resume();const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
  o.type="triangle";o.frequency.setValueAtTime(1400,t);o.frequency.exponentialRampToValueAtTime(700,t+.04);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.08,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.06);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+.07);}catch(e){}}
/* the machine buzz: oscillator -> lowpass -> rattle (AM at half the pitch, depth from the machine's rough) -> level; the
   stutter LFO adds to the level only while rushed */
let bz=null;
function buzzStart(p){if(!on||!init())return;try{if(ctx.state==="suspended")ctx.resume();buzzStop();p=p||{};
  const t=ctx.currentTime,hz=p.hz||120,o=ctx.createOscillator(),f=ctx.createBiquadFilter(),am=ctx.createGain(),g=ctx.createGain();
  const lfo=ctx.createOscillator(),lg=ctx.createGain(),st=ctx.createOscillator(),sg=ctx.createGain();
  o.type=p.wave||"sawtooth";o.frequency.setValueAtTime(hz*BUZZ.pitchLo*BUZZ.spinFrom,t);o.frequency.setTargetAtTime(hz*BUZZ.pitchLo,t,BUZZ.spin/3);f.type="lowpass";f.frequency.value=p.cut||2400;f.Q.value=0.8;
  lfo.type="square";lfo.frequency.setValueAtTime(hz/2*BUZZ.spinFrom,t);lfo.frequency.setTargetAtTime(hz/2,t,BUZZ.spin/3);lg.gain.value=(p.rough||0)*BUZZ.rattle;am.gain.value=1;
  st.type="square";st.frequency.value=BUZZ.stutterHz;sg.gain.value=0;
  g.gain.setValueAtTime(0,t);g.gain.setTargetAtTime(BUZZ.vol,t,BUZZ.attack);
  o.connect(f);f.connect(am);am.connect(g);g.connect(master);lfo.connect(lg);lg.connect(am.gain);st.connect(sg);sg.connect(g.gain);
  o.start(t);lfo.start(t);st.start(t);bz={o,f,g,lfo,st,sg,hz,rushed:false,spun:t+BUZZ.spin};setDuck(true);}catch(e){bz=null;}}
function buzzSet(r,rushed){if(!bz)return;try{
  if(ctx.currentTime>=bz.spun)bz.o.frequency.value=bz.hz*Math.min(BUZZ.pitchMax,BUZZ.pitchLo+BUZZ.pitchK*Math.max(0,r||0));
  if(!!rushed!==bz.rushed){bz.rushed=!!rushed;bz.sg.gain.value=rushed?BUZZ.vol*BUZZ.stutter:0;}}catch(e){}}
function buzzStop(){if(!bz)return;const b=bz;bz=null;setDuck(false);try{const t=ctx.currentTime;b.sg.gain.value=0;b.g.gain.cancelScheduledValues(t);b.g.gain.setTargetAtTime(0,t,BUZZ.release);
  [b.o,b.lfo,b.st].forEach(x=>x.stop(t+BUZZ.release*6));}catch(e){}}
return{init,tick,chime,sfx,room,buzzStart,buzzSet,buzzStop,
  setOn(v){on=!!v;if(!on)buzzStop();else sfxIdle();ambApply();radioApply();},isOn(){return on;},
  setAmbience(v){ambOn=!!v;ambApply();},setRadio(v){radOn=!!v;if(radOn)rFails=0;radioApply();}};
})();
</script>
