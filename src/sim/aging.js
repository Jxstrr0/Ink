/* ===== sim/aging.js: the aging model: age(tattoo, years) -> {blur, fade, spread, readability} (PR 1) =====
   How a tattoo looks after N years on a real person. Every line slowly spreads as ink migrates under the skin, edges soften,
   and pigment fades, lights first. What speeds it up:
     - placement (PLACEMENT_WEAR: hands and feet shed skin and rub, so they spread and fade far faster than a back),
     - sun (the client's sun trait x the placement's sun; darker skin shields a little),
     - the colours (COLOUR_FADE: yellow and white go first, black last),
     - the session (depthQuality: too shallow falls out, too deep blows out; lineQuality: ragged edges start soft;
       saturation: badly packed colour starts faded). trauma feeds the heal grade in PR 5, not aging directly,
     - the heal (HEAL_GRADES: a patchy heal starts with spread already applied, a blowout with a big one),
     - the ink (INKS in sim/kit.js: the one table of ink tiers, read here at call time), and the style's ageFactor (a nudge
       for what the numbers miss).
   Thin lines don't get wider so much as spread to nothing: the same ink over a wider area reads paler (the dilution term),
   so a 1RL line fades much faster than a 14RL one. Packed solid fill does not dilute.
   readability is the design re-scored with the aged lines and faded ink (design.js dzReadability), so 9 mm script closes up
   within a few years while a bold 80 mm rose still reads at 20.
     tattoo = {design, out:{lineQuality, depthQuality, saturation, trauma} (default 0.75), heal: HEAL_GRADES id or null,
               ink: INKS id (sim/kit.js) or null = standard, skinTone, sun}
   Private helpers start with ag. ===== */

/* share of pigment lost per year (an exponential rate) at baseline wear, by colour id */
const COLOUR_FADE={black:0.007,grey:0.011,brown:0.012,blue:0.015,green:0.016,red:0.017,purple:0.019,teal:0.019,orange:0.024,
  pink:0.028,skyblue:0.028,yellow:0.034,white:0.05,_default:0.02};
/* multipliers on spread and fade by placement region */
const PLACEMENT_WEAR={hand:{spread:1.8,fade:1.9},foot:{spread:1.7,fade:1.8},neck:{spread:1.1,fade:1.15},arm:{spread:1.05,fade:1.05},
  shoulder:{spread:1,fade:1},leg:{spread:1,fade:1},side:{spread:1,fade:0.95},chest:{spread:0.95,fade:0.95},back:{spread:0.9,fade:0.9}};
/* the heal result (PR 5). spread0/blur0 mm and fade0 are where year 0 starts; rate scales everything after */
const HEAL_GRADES={
  crisp:{name:"crisp",spread0:0,blur0:0,fade0:0,rate:0.92},
  soft:{name:"slightly soft",spread0:0.12,blur0:0.1,fade0:0.03,rate:1},
  patchy:{name:"patchy",spread0:0.3,blur0:0.15,fade0:0.15,rate:1.1},
  blownout:{name:"blown out",spread0:0.7,blur0:0.45,fade0:0.05,rate:1.2},
  infected:{name:"infected",spread0:0.45,blur0:0.35,fade0:0.25,rate:1.3}
};
const AG_NO_HEAL={spread0:0,blur0:0,fade0:0,rate:1};   // heal null: the prediction before the heal is known
/* ink quality comes from INKS in sim/kit.js (loaded after this file, read at call time); this is the fallback if it's missing */
const AG_INK_NONE={fade:1,spread:1};
/* the model's own knobs */
const AGING={
  spreadK:0.065,spreadExp:0.75,       // spread mm = spreadK x years^spreadExp x multipliers (+ the heal's head start)
  sunSpread:0.3,sunFade:1.3,          // how much full sun on a full-sun spot adds to spread and fade
  skinShield:0.35,                    // darker skin takes this much off the sun term at skinTone 1
  styleLo:1.35,styleHi:0.85,          // style multiplier at ageFactor 0 .. 1
  depthSpreadLo:1.7,depthSpreadHi:0.85,depthFadeLo:1.5,depthFadeHi:0.9,   // at depthQuality 0 .. 1
  lineBlur:0.25,                      // mm of edge blur from lineQuality 0
  satRef:0.85,satFade:0.4,            // saturation under satRef starts this much faded per point
  dilution:0.55,dilutionExp:1.5,fillHold:0.7,   // thin lines spreading to nothing; packed fill resists
  blurFromSpread:0.6,detailBlur:0.3   // blur radius from spread, more for dense detail
};

/* everything about a tattoo that doesn't change element to element */
function agEnv(t,p){
  const design=t.design||{},out=Object.assign({},DEFAULT_OUT,t.out||{});
  p=p||(SIM.PLACEMENTS&&SIM.PLACEMENTS[design.placement])||{region:"arm",sun:0.5};
  const wear=PLACEMENT_WEAR[p.region]||{spread:1,fade:1};
  const heal=(t.heal&&HEAL_GRADES[t.heal])||AG_NO_HEAL;
  const inks=SIM.INKS||{};
  const ink=(t.ink&&inks[t.ink])||inks.standard||AG_INK_NONE;
  const tone=t.skinTone!=null?t.skinTone:0.3,sun=(t.sun!=null?t.sun:0.4)*(p.sun!=null?p.sun:0.5)*(1-AGING.skinShield*tone);
  const st=(SIM.STYLES||{})[design.style],af=st&&st.ageFactor!=null?st.ageFactor:0.6;
  const styleM=lerp(AGING.styleLo,AGING.styleHi,af),dq=clamp(out.depthQuality,0,1);
  return{
    spreadM:wear.spread*lerp(AGING.depthSpreadLo,AGING.depthSpreadHi,dq)*(ink.spread||1)*styleM*heal.rate*(1+AGING.sunSpread*sun),
    fadeM:wear.fade*lerp(AGING.depthFadeLo,AGING.depthFadeHi,dq)*(ink.fade||1)*styleM*heal.rate*(1+AGING.sunFade*sun),
    lineBlur:(1-clamp(out.lineQuality,0,1))*AGING.lineBlur,
    fade0:1-(1-heal.fade0)*(1-Math.max(0,AGING.satRef-clamp(out.saturation,0,1))*AGING.satFade),
    heal,tone
  };
}
/* one element's wear after `years`: {spread, blur, fade} */
function agWear(e,env,years){
  const y=Math.max(0,years||0);
  const spread=env.heal.spread0+AGING.spreadK*env.spreadM*Math.pow(y,AGING.spreadExp);
  const blur=env.heal.blur0+env.lineBlur+spread*AGING.blurFromSpread*(1+AGING.detailBlur*e.detail);
  const cr=COLOUR_FADE[e.colourId]!=null?COLOUR_FADE[e.colourId]:COLOUR_FADE._default;
  const rate=lerp(COLOUR_FADE.black,cr,e.colShare!=null?e.colShare:1)*env.fadeM;
  const col=1-Math.exp(-rate*y);
  const dil=AGING.dilution*Math.pow(spread/(e.lineMm+spread||1),AGING.dilutionExp)*(1-AGING.fillHold*e.fill);
  return{spread,blur,fade:clamp(1-(1-env.fade0)*(1-col)*(1-dil),0,1)};
}
/* the whole piece: wear weighted by each element's visual weight, plus readability re-scored with it */
function agAge(t,years,E,tol){
  E=E||dzElems(t.design||{});
  const env=agEnv(t,null),wears=E.els.map(e=>agWear(e,env,years));
  let sw=0,b=0,f=0,s=0;
  E.els.forEach((e,i)=>{const w=e.w+1e-6;sw+=w;b+=w*wears[i].blur;f+=w*wears[i].fade;s+=w*wears[i].spread;});
  const R=dzReadability(E,env.tone,wears,tol||0);
  return{blur:dzR(sw?b/sw:0),fade:dzR(sw?f/sw:0),spread:dzR(sw?s/sw:0),readability:dzR(R.score)};
}
function age(tattoo,years){return agAge(tattoo||{},years,null,0);}
SIM.age=age;SIM.COLOUR_FADE=COLOUR_FADE;SIM.PLACEMENT_WEAR=PLACEMENT_WEAR;SIM.HEAL_GRADES=HEAL_GRADES;SIM.AGING=AGING;
