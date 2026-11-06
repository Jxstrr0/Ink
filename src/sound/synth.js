<script>
/* ===================== Ink: INK_SOUND (sound/synth.js) =====================
   A small Web Audio synth. The audio context is made on the first tap (browsers block sound before one). PR 0 has only
   the UI tick; PR 4 adds the machine buzz whose pitch follows the trace pace and whose timbre follows the machine.
   Everything is quiet when S.settings.sound is off. */
const INK_SOUND=(function(){
let ctx=null,master=null,on=true;
function init(){if(ctx)return true;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return false;ctx=new A();master=ctx.createGain();master.gain.value=.5;master.connect(ctx.destination);return true;}catch(e){ctx=null;return false;}}
/* a short soft click for taps on tabs and buttons */
function tick(){if(!on||!init())return;try{if(ctx.state==="suspended")ctx.resume();const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
  o.type="triangle";o.frequency.setValueAtTime(1400,t);o.frequency.exponentialRampToValueAtTime(700,t+.04);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.08,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.06);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+.07);}catch(e){}}
return{init,tick,setOn(v){on=!!v;},isOn(){return on;}};
})();
</script>
