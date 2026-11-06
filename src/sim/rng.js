<script>
/* ===================== Ink: INK_SIM (the simulation) =====================
   INK_SIM holds design scoring, the aging model, client logic, the calendar and the economy. It never touches the DOM
   or three.js, and it runs in plain node (tools/sim-test.js cuts src/sim/*.js out and runs them). The sim files are one
   IIFE spread over src/sim/: this file opens it (SIM is the object every file adds to) and sim/market.js closes it.
   rng.js: the seeded random number generator. ALL randomness in the sim goes through INK_SIM.rng; no bare Math.random()
   anywhere in src/sim/.
     const r=SIM.rng(seed)      a generator (mulberry32). r() or r.next() -> [0,1)
     r.range(a,b) r.int(a,b) (inclusive) r.chance(p) r.pick(list) r.weighted(list, w=>weight) r.shuffle(list) r.normal(mean,sd)
     r.fork(label)              a new, independent generator seeded from this seed + a label, so adding a draw in one system
                                never shifts the numbers in another (e.g. SIM.rng(S.seed).fork("walkins:"+week))
     SIM.hash(str)              32-bit FNV-1a of a string, for stable per-thing seeds */
const INK_SIM=(function(){"use strict";
const SIM={};
function hash(str){let h=2166136261;str=String(str);for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function rng(seed){
  const base=(seed>>>0)||0x9e3779b9;let a=base;
  const next=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
  const r=()=>next();
  r.next=next;
  r.range=(lo,hi)=>lo+(hi-lo)*next();
  r.int=(lo,hi)=>lo+Math.floor(next()*(hi-lo+1));
  r.chance=p=>next()<p;
  r.pick=list=>list[Math.floor(next()*list.length)];
  r.weighted=(list,wf)=>{let tot=0;const ws=list.map(x=>{const w=Math.max(0,+wf(x)||0);tot+=w;return w;});if(!tot)return list[0];let t=next()*tot;for(let i=0;i<list.length;i++){t-=ws[i];if(t<0)return list[i];}return list[list.length-1];};
  r.shuffle=list=>{const o=list.slice();for(let i=o.length-1;i>0;i--){const j=Math.floor(next()*(i+1));const t=o[i];o[i]=o[j];o[j]=t;}return o;};
  r.normal=(m,sd)=>{const u=Math.max(1e-12,next()),v=next();return m+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  r.fork=label=>rng((base^hash(label))>>>0||1);
  r.seed=base;
  return r;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
SIM.rng=rng;SIM.hash=hash;SIM.clamp=clamp;SIM.lerp=lerp;
