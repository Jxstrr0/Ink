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
return SIM;
})();
if(typeof module!=="undefined"&&module.exports)module.exports=INK_SIM;
</script>
