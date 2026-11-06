/* ===== sim/market.js: walk-in generation and PRICE_INDEX by year (PR 3). Last sim file: it closes the INK_SIM IIFE. ===== */
/* PRICE_INDEX: what a ruble buys, by year (2000 = 1.0). A ruble-like curve: 10-14%/yr inflation in the early 2000s, a
   2008-09 and a 2015 jump, easing to about 4-7%/yr later (about x4 by the mid-2010s, x8.7 by 2030). Rates, rent and
   supplies all multiply by it, so a 2003 forearm piece and a 2027 one price like their era.
   SIM.priceIndex(year): clamped to 2000..2030, interpolated between years (2003.5 is half way from 2003 to 2004). */
const PRICE_INDEX={2000:1,2001:1.14,2002:1.29,2003:1.44,2004:1.60,2005:1.78,2006:1.96,2007:2.14,2008:2.40,2009:2.64,
  2010:2.85,2011:3.06,2012:3.25,2013:3.46,2014:3.72,2015:4.13,2016:4.41,2017:4.61,2018:4.80,2019:5.01,
  2020:5.21,2021:5.55,2022:6.11,2023:6.47,2024:6.80,2025:7.14,2026:7.46,2027:7.76,2028:8.07,2029:8.39,2030:8.73};
SIM.PRICE_INDEX=PRICE_INDEX;
SIM.priceIndex=year=>{
  const y=clamp(+year||2000,2000,2030),a=Math.floor(y),b=Math.min(2030,a+1);
  return lerp(PRICE_INDEX[a],PRICE_INDEX[b],y-a);
};
/* ---- walk-ins (PR 3) ----
   SIM.generateWalkins(S, r) -> [client]: who comes through the door this week. How many: WALKINS.base for the studio stage,
   times the season (WALKIN_SEASON: the White Nights bring the city out, January is dead), times the reputation tracks
   (S.rep, read on a 0..WALKINS.repFull scale until PR 5 sets REP_TRACKS), capped by WEEK walk-in slots. What they want:
   the brief and style are weighted by this year's style demand (STYLES[*].demandCurve; PR 8's trend wave multiplies in
   through SIM.trendMult(style, year) when it exists) and by client segments the reputation tracks attract (WALKINS.seg).
   The stage limits size (an apprentice only gets small flash). Booked clients come from returns and referrals, not here. */
const WALKINS={
  base:{apprentice:0.5,chair:2.2,studio:3.4,legacy:2.4},     // expected walk-ins a week, before season and reputation
  repFull:100,                                               // S.rep values read on 0..repFull
  rep:{walkins:0.9,collectors:0.25,peers:0.1},               // + share of the expected count at full reputation
  seg:{walkins:{walk_in:1,first_timer:0.8,students:0.4,trades:0.3},       // segments each reputation track pulls in
       collectors:{collector:1.5,large_scale:1.2,memorial:0.2,creatives:0.3},
       peers:{cover_up:0.8,old_school:0.4}},
  sizes:{apprentice:["tiny","small"],chair:["tiny","small","medium","large"],studio:["tiny","small","medium","large","huge"],legacy:["small","medium","large","huge"]}
};
/* [week, multiplier], piecewise linear over the year */
const WALKIN_SEASON=[[1,0.55],[4,0.75],[12,0.9],[20,1.1],[24,1.4],[28,1.4],[33,1.1],[40,0.95],[48,0.85],[51,1.05],[52,0.7]];
function mkSeason(w){
  const t=WALKIN_SEASON;if(w<=t[0][0])return t[0][1];
  for(let i=1;i<t.length;i++)if(w<=t[i][0]){const a=t[i-1],b=t[i];return lerp(a[1],b[1],(w-a[0])/((b[0]-a[0])||1));}
  return t[t.length-1][1];
}
function mkRep(S,k){return clamp(((S.rep&&S.rep[k])||0)/WALKINS.repFull,0,1);}
function mkSegBoost(S){
  const out={};
  for(const k in WALKINS.seg){const m=mkRep(S,k);for(const s in WALKINS.seg[k])out[s]=(out[s]||0)+WALKINS.seg[k][s]*m;}
  return out;
}
function mkPoisson(r,lambda){const L=Math.exp(-lambda);let k=0,p=1;do{k++;p*=r();}while(p>L&&k<50);return k-1;}
function generateWalkins(S,r){
  const stage=(S.studio&&S.studio.stage)||"apprentice";
  const slots=((typeof WEEK!=="undefined"&&WEEK.stages[stage])||{walkinSlots:3}).walkinSlots;
  let lambda=(WALKINS.base[stage]||WALKINS.base.chair)*mkSeason(S.week);
  for(const k in WALKINS.rep)lambda*=1+WALKINS.rep[k]*mkRep(S,k);
  const n=Math.min(slots,mkPoisson(r,lambda));
  const out=[],taken=[],segBoost=mkSegBoost(S),sizes=WALKINS.sizes[stage]||null;
  for(let i=0;i<n;i++){
    const id=clNextId(S,taken);taken.push(id);
    out.push(makeClient(r,{id,year:S.year,week:S.week,stage,segBoost,sizes,src:"walkin"}));
  }
  return out;
}
SIM.WALKINS=WALKINS;SIM.WALKIN_SEASON=WALKIN_SEASON;SIM.generateWalkins=generateWalkins;
return SIM;
})();
if(typeof module!=="undefined"&&module.exports)module.exports=INK_SIM;
</script>
