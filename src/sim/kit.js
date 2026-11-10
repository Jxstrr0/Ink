/* ===== sim/kit.js: the kit: MACHINES, NEEDLES, INKS, VOLTAGE and STROKE, and the session bands they give (PR 4) =====
   The kit is a build system (plan Q9): a machine, a tray of needle groupings, an ink tier and two sliders. Nothing in the
   game depends on it except the session (sim/session.js reads the bands) and aging (sim/aging.js reads INKS for fade and
   spread). INKS is the one table of ink tiers: aging.js reads SIM.INKS at call time, and SIM.INK_TIERS is the same object.
     kit = {machine: MACHINES id, needles: [NEEDLES ids on the tray], ink: INKS id, voltage, stroke (mm),
            owned: {machines:[ids], needles:[ids], inks:[ids]}}    (S.kit; KIT_DEFAULT is the apprentice's starter kit)
     SIM.kitBands(kit, skills, settings, opts?) -> the session bands (below). opts.liner picks the liner in use (default the
       first liner on the tray). settings.assist widens the bands and slows the marker (ASSIST).
     SIM.kitDeltas(kitA, kitB, skills?, settings?) -> what changing kitA into kitB does, for the Studio build panel:
       {band, pace, lineLo, lineHi, shade, trauma, fade} (band/pace/shade/trauma/fade are ratios - 1, so +0.12 = 12% more;
       lineLo/lineHi are steps in LINE_WEIGHTS for the tray's whole line range)
     SIM.kitPrice(kind, id, year) -> rubles in that year (prices in the tables are 2000 rubles x SIM.priceIndex(year))
     SIM.kitClean(kit) -> a valid kit (unknown ids dropped, sliders clamped, the starter kit for anything missing)
   The bands:
     paceBand   how far your speed may stray from the target pace and still count as steady (0.35 = within 35%)
     accFrac    how far off the stencil line still counts as on it, as a share of the view size (session.js turns it to mm)
     pace       the target pace multiplier (1 = PACE.frac of the view per second); faster machines set a quicker marker
     hit        how hard the needle hits at the target pace (1 = ideal depth); depthTol how forgiving depth is
     trauma     multiplier on skin trauma; pain the machine's share of the client's pain rate
     shade, colour   saturation per unit of sweeping (mags fill fastest)
     lineBand [lo, hi] RL the liner in use lays cleanly; lineAll [lo, hi] for the whole tray; lineMm [lo, hi] in mm
     fade, spread, sat    the ink tier (sat caps how solid colour and black pack)
     buzz       the machine's synth profile (sound/synth.js)
   Private helpers start with kt. ===== */

/* machines. band widens the pace band, trauma multiplies skin damage, depth widens the depth tolerance, pain adds to the
   client's pain rate; buzz is the synth voice {wave, hz (base pitch), cut (lowpass Hz), rough (rattle 0..1)}. price is
   2000 rubles; from = the first year you can buy one */
const MACHINES={
  coil_used:{id:"coil_used",name:"Used coil",kind:"coil",band:0.88,trauma:1.15,depth:0.85,pain:1.08,price:2500,from:2000,
    note:"Your mentor's old spare. Loud, runs hot, a little unsteady.",buzz:{wave:"sawtooth",hz:118,cut:2400,rough:0.4}},
  coil:{id:"coil",name:"Coil machine",kind:"coil",band:1,trauma:1,depth:1,pain:1,price:7000,from:2000,
    note:"A new pair of coils. The classic buzz, punchy for lining.",buzz:{wave:"sawtooth",hz:128,cut:2800,rough:0.15}},
  rotary:{id:"rotary",name:"Rotary",kind:"rotary",band:1.14,trauma:0.86,depth:1.08,pain:0.94,price:14000,from:2000,
    note:"Quiet and smooth. Gentler on skin, a softer hit for shading.",buzz:{wave:"triangle",hz:92,cut:1500,rough:0.05}},
  pen:{id:"pen",name:"Wireless pen",kind:"pen",band:1.3,trauma:0.76,depth:1.15,pain:0.9,price:32000,from:2014,
    note:"Battery pen, no cord, no clip cord drag. The steadiest hand money can buy.",buzz:{wave:"sine",hz:84,cut:1000,rough:0.02}}
};
/* needle groupings. A liner lays line weights `reach` steps either side of its own grouping in one clean pass; shade is
   how fast it fills a shaded or coloured zone (mags are made for it). price is 2000 rubles for a box */
const NEEDLES={
  "1RL":{id:"1RL",name:"1RL liner",kind:"liner",rl:1,reach:1,shade:0.2,price:300},
  "3RL":{id:"3RL",name:"3RL liner",kind:"liner",rl:3,reach:1,shade:0.3,price:250},
  "5RL":{id:"5RL",name:"5RL liner",kind:"liner",rl:5,reach:1,shade:0.38,price:250},
  "7RL":{id:"7RL",name:"7RL liner",kind:"liner",rl:7,reach:1,shade:0.45,price:280},
  "9RL":{id:"9RL",name:"9RL liner",kind:"liner",rl:9,reach:1,shade:0.52,price:300},
  "11RL":{id:"11RL",name:"11RL liner",kind:"liner",rl:11,reach:1,shade:0.58,price:320},
  "14RL":{id:"14RL",name:"14RL liner",kind:"liner",rl:14,reach:1,shade:0.64,price:350},
  "7M1":{id:"7M1",name:"7 magnum",kind:"mag",rl:null,shade:1,price:300},
  "9M1":{id:"9M1",name:"9 magnum",kind:"mag",rl:null,shade:1.2,price:340},
  "13RM":{id:"13RM",name:"13 curved mag",kind:"mag",rl:null,shade:1.45,price:420},
  "15RM":{id:"15RM",name:"15 curved mag",kind:"mag",rl:null,shade:1.65,price:480}
};
/* ink tiers, brand-less. fade and spread multiply the aging model's rates; sat caps how solid it packs. price 2000 rubles */
const INKS={
  budget:{id:"budget",name:"Budget",fade:1.25,spread:1.1,sat:0.86,price:600,note:"Cheap and thin. Greys out early."},
  standard:{id:"standard",name:"Standard",fade:1,spread:1,sat:1,price:2200,note:"What most shops pour."},
  premium:{id:"premium",name:"Premium",fade:0.82,spread:0.95,sat:1.08,price:5200,note:"Dense pigment. Packs solid, holds for decades."}
};
/* the two sliders */
const VOLTAGE={min:5,max:10,def:7,step:0.1,unit:"V"};
const STROKE={min:2.5,max:4.5,def:3.5,step:0.1,unit:"mm"};
/* how the sliders and the rest turn into bands. dv = volts over VOLTAGE.def, ds = mm over STROKE.def */
const KIT_TUNE={
  paceBase:0.36,accBase:0.03,depthTol:0.45,   // pace band (share), stencil tolerance (share of the view), depth tolerance (log)
  paceV:0.09,paceS:0.1,                      // target pace per volt and per mm of stroke
  bandV:0.07,bandS:0.06,bandFloor:0.45,      // the band narrows per volt / mm (never below bandFloor of itself)
  hitV:0.05,hitS:0.09,                       // the needle hits harder per volt / mm
  traumaV:0.08,traumaS:0.12,                 // trauma per volt / mm
  painV:0.04,                                // pain per volt
  shadeS:0.12,shadeV:0.04,colour:0.85,       // shading fills faster with a longer stroke; colour packs at this share of shade
  noMag:0.55,                                // with no mag on the tray, the biggest liner shades at this share of its rate
  skillBand:0.45,skillAcc:0.35,skillDepth:0.4,skillShade:0.3   // skill 10 adds these shares
};
/* Assist (Settings): a wider pace band and stencil tolerance, a slower marker */
const ASSIST={band:1.6,acc:1.4,slow:0.75};
/* the first sitting on real skin (the first friend's piece): a wider margin before a stroke counts as off the line */
const FIRST_SITTING={acc:1.5};
/* the apprentice's starter kit (freshState in app/state.js writes the same literal) */
const KIT_DEFAULT={machine:"coil_used",needles:["3RL","7RL","7M1"],ink:"budget",voltage:7,stroke:3.5,
  owned:{machines:["coil_used"],needles:["3RL","7RL","7M1"],inks:["budget"]}};
const KIT_TRAY_MAX=5;   // groupings on the tray at once

function ktCopy(o){return JSON.parse(JSON.stringify(o));}
function kitClean(kit){
  const k=kit&&typeof kit==="object"?kit:{},d=KIT_DEFAULT;
  const ow=k.owned&&typeof k.owned==="object"?k.owned:{};
  const list=(a,T,def)=>{const v=Array.isArray(a)?a.filter((x,i)=>T[x]&&a.indexOf(x)===i):[];return v.length?v:def.slice();};
  const owned={machines:list(ow.machines,MACHINES,d.owned.machines),needles:list(ow.needles,NEEDLES,d.owned.needles),inks:list(ow.inks,INKS,d.owned.inks)};
  const num=(v,R)=>typeof v==="number"&&isFinite(v)?clamp(Math.round(v*10)/10,R.min,R.max):R.def;
  let needles=list(k.needles,NEEDLES,d.needles).filter(n=>owned.needles.indexOf(n)>=0).slice(0,KIT_TRAY_MAX);
  if(!needles.length)needles=owned.needles.slice(0,KIT_TRAY_MAX);
  return{machine:MACHINES[k.machine]&&owned.machines.indexOf(k.machine)>=0?k.machine:owned.machines[0],
    needles,ink:INKS[k.ink]&&owned.inks.indexOf(k.ink)>=0?k.ink:owned.inks[0],
    voltage:num(k.voltage,VOLTAGE),stroke:num(k.stroke,STROKE),owned};
}
/* a liner's clean range in LINE_WEIGHTS terms */
function ktLinerBand(n){
  const LW=SIM.LINE_WEIGHTS||[1,3,5,7,9,11,14],i=LW.indexOf(n.rl);
  if(i<0)return[n.rl,n.rl];
  return[LW[Math.max(0,i-n.reach)],LW[Math.min(LW.length-1,i+n.reach)]];
}
function kitBands(kit,skills,settings,opts){
  kit=kit||KIT_DEFAULT;skills=skills||{};opts=opts||{};
  const T=KIT_TUNE,m=MACHINES[kit.machine]||MACHINES[KIT_DEFAULT.machine],ink=INKS[kit.ink]||INKS[KIT_DEFAULT.ink];
  const v=typeof kit.voltage==="number"?clamp(kit.voltage,VOLTAGE.min,VOLTAGE.max):VOLTAGE.def;
  const s=typeof kit.stroke==="number"?clamp(kit.stroke,STROKE.min,STROKE.max):STROKE.def;
  const dv=v-VOLTAGE.def,ds=s-STROKE.def,assist=!!(settings&&settings.assist);
  const sk=k=>clamp(+skills[k]||0,0,10)/10;
  const narrow=Math.max(T.bandFloor,(1-T.bandV*dv)*(1-T.bandS*ds));
  const ns=(Array.isArray(kit.needles)?kit.needles:[]).map(id=>NEEDLES[id]).filter(Boolean);
  const liners=ns.filter(n=>n.kind==="liner").map(n=>{const b=ktLinerBand(n);return{id:n.id,rl:n.rl,lo:b[0],hi:b[1]};});
  const mags=ns.filter(n=>n.kind==="mag");
  const act=liners.find(l=>l.id===opts.liner)||liners[0]||null;
  const lineBand=act?[act.lo,act.hi]:[1,1];
  const lineAll=liners.length?[Math.min(...liners.map(l=>l.lo)),Math.max(...liners.map(l=>l.hi))]:[1,1];
  const mm=rl=>SIM.lineMm?SIM.lineMm(rl):rl*0.12;
  let shade0=mags.length?Math.max(...mags.map(n=>n.shade)):0;
  if(!shade0){const big=ns.filter(n=>n.kind==="liner").sort((a,b)=>b.rl-a.rl)[0];shade0=big?big.shade*T.noMag:0.1;}
  const machineShade=lerp(1,1/m.trauma,0.5);
  const shade=shade0*(1+T.shadeS*ds)*(1+T.shadeV*dv)*machineShade;
  return{
    paceBand:T.paceBase*m.band*narrow*(1+T.skillBand*sk("linework"))*(assist?ASSIST.band:1),
    accFrac:T.accBase*Math.sqrt(m.band)*Math.sqrt(narrow)*(1+T.skillAcc*sk("linework"))*(assist?ASSIST.acc:1)*(settings&&settings.first?FIRST_SITTING.acc:1),
    pace:(1+T.paceV*dv)*(1+T.paceS*ds)*(assist?ASSIST.slow:1),
    hit:(1+T.hitV*dv)*(1+T.hitS*ds),
    depthTol:T.depthTol*m.depth*(1+T.skillDepth*sk("linework")),
    trauma:m.trauma*(1+T.traumaV*dv)*(1+T.traumaS*ds),
    pain:m.pain*(1+T.painV*dv),
    shade:shade*(1+T.skillShade*sk("shading")),
    colour:shade*T.colour*(1+T.skillShade*sk("colour")),
    liner:act?act.id:null,liners,lineBand,lineAll,lineMm:[mm(lineAll[0]),mm(lineAll[1])],
    fade:ink.fade,spread:ink.spread,sat:ink.sat,
    buzz:m.buzz,machine:m.id,ink:ink.id,assist
  };
}
function kitDeltas(a,b,skills,settings){
  const A=kitBands(a,skills,settings),B=kitBands(b,skills,settings),LW=SIM.LINE_WEIGHTS||[1,3,5,7,9,11,14];
  const r=(x,y)=>Math.round((y/x-1)*1000)/1000,st=v=>LW.indexOf(v);
  return{band:r(A.paceBand,B.paceBand),pace:r(A.pace,B.pace),lineLo:st(B.lineAll[0])-st(A.lineAll[0]),lineHi:st(B.lineAll[1])-st(A.lineAll[1]),
    shade:r(A.shade,B.shade),trauma:r(A.trauma,B.trauma),fade:r(A.fade,B.fade)};
}
function kitPrice(kind,id,year){
  const T=kind==="machine"?MACHINES:kind==="needle"?NEEDLES:INKS,it=T[id];if(!it)return 0;
  const pi=SIM.priceIndex?SIM.priceIndex(year||2000):1;
  return Math.round(it.price*pi/50)*50;
}
SIM.MACHINES=MACHINES;SIM.NEEDLES=NEEDLES;SIM.INKS=INKS;SIM.INK_TIERS=INKS;SIM.VOLTAGE=VOLTAGE;SIM.STROKE=STROKE;
SIM.KIT_TUNE=KIT_TUNE;SIM.ASSIST=ASSIST;SIM.FIRST_SITTING=FIRST_SITTING;SIM.KIT_DEFAULT=KIT_DEFAULT;SIM.KIT_TRAY_MAX=KIT_TRAY_MAX;
SIM.kitBands=kitBands;SIM.kitDeltas=kitDeltas;SIM.kitPrice=kitPrice;SIM.kitClean=kitClean;SIM.kitDefault=()=>ktCopy(KIT_DEFAULT);
