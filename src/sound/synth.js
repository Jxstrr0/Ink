<script>
/* ===================== Ink: INK_SOUND (sound/synth.js) =====================
   A small Web Audio synth. The audio context is made on the first tap (browsers block sound before one). tick() is the UI
   click. The machine buzz (PR 4): buzzStart(profile) on a finger down in the Session tab, buzzSet(ratio, rushed) as it moves,
   buzzStop() on lift. The profile is the machine's (sim/kit.js MACHINES buzz: wave, hz, cut, rough), so a used coil rattles
   and a pen hums; the pitch follows your pace (BUZZ.pitchLo + pitchK x pace ratio) and a rushed stroke makes it stutter (a
   square LFO gating the level). Parameters move by plain .value writes (no automation queue to pile up on a busy phone).
   Everything is quiet when S.settings.sound is off. */
const BUZZ={vol:0.06,pitchLo:0.8,pitchK:0.28,pitchMax:1.6,rattle:0.5,stutterHz:12,stutter:0.85,attack:0.02,release:0.04};
const INK_SOUND=(function(){
let ctx=null,master=null,on=true;
function init(){if(ctx)return true;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return false;ctx=new A();master=ctx.createGain();master.gain.value=.5;master.connect(ctx.destination);return true;}catch(e){ctx=null;return false;}}
/* a short soft click for taps on tabs and buttons */
function tick(){if(!on||!init())return;try{if(ctx.state==="suspended")ctx.resume();const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
  o.type="triangle";o.frequency.setValueAtTime(1400,t);o.frequency.exponentialRampToValueAtTime(700,t+.04);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.08,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.06);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+.07);}catch(e){}}
/* the machine buzz: oscillator -> lowpass -> rattle (AM at half the pitch, depth from the machine's rough) -> level; the
   stutter LFO adds to the level only while rushed */
let bz=null;
function buzzStart(p){if(!on||!init())return;try{if(ctx.state==="suspended")ctx.resume();buzzStop();p=p||{};
  const t=ctx.currentTime,hz=p.hz||120,o=ctx.createOscillator(),f=ctx.createBiquadFilter(),am=ctx.createGain(),g=ctx.createGain();
  const lfo=ctx.createOscillator(),lg=ctx.createGain(),st=ctx.createOscillator(),sg=ctx.createGain();
  o.type=p.wave||"sawtooth";o.frequency.value=hz*BUZZ.pitchLo;f.type="lowpass";f.frequency.value=p.cut||2400;f.Q.value=0.8;
  lfo.type="square";lfo.frequency.value=hz/2;lg.gain.value=(p.rough||0)*BUZZ.rattle;am.gain.value=1;
  st.type="square";st.frequency.value=BUZZ.stutterHz;sg.gain.value=0;
  g.gain.setValueAtTime(0,t);g.gain.setTargetAtTime(BUZZ.vol,t,BUZZ.attack);
  o.connect(f);f.connect(am);am.connect(g);g.connect(master);lfo.connect(lg);lg.connect(am.gain);st.connect(sg);sg.connect(g.gain);
  o.start(t);lfo.start(t);st.start(t);bz={o,f,g,lfo,st,sg,hz,rushed:false};}catch(e){bz=null;}}
function buzzSet(r,rushed){if(!bz)return;try{
  bz.o.frequency.value=bz.hz*Math.min(BUZZ.pitchMax,BUZZ.pitchLo+BUZZ.pitchK*Math.max(0,r||0));
  if(!!rushed!==bz.rushed){bz.rushed=!!rushed;bz.sg.gain.value=rushed?BUZZ.vol*BUZZ.stutter:0;}}catch(e){}}
function buzzStop(){if(!bz)return;const b=bz;bz=null;try{const t=ctx.currentTime;b.sg.gain.value=0;b.g.gain.cancelScheduledValues(t);b.g.gain.setTargetAtTime(0,t,BUZZ.release);
  [b.o,b.lfo,b.st].forEach(x=>x.stop(t+BUZZ.release*6));}catch(e){}}
return{init,tick,buzzStart,buzzSet,buzzStop,setOn(v){on=!!v;if(!on)buzzStop();},isOn(){return on;}};
})();
</script>
