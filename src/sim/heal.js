/* ===== sim/heal.js: the heal two weeks after a session, and the three reputation tracks (PR 5) =====
   Two in-game weeks after the last sitting the bandage comes off (calendar.js calHeals calls SIM.healPiece). The grade is
   one of the HEAL_GRADES ids in aging.js (crisp, soft, patchy, blownout, infected) and from then on feeds the aging model.
     HEAL           how the session outputs and the client's aftercare trait become a grade:
                      infected  rare: needs trauma over infect.trauma AND aftercare under infect.care (low trauma never does)
                      blownout  a chance that climbs with the session's blowouts (none: never)
                      otherwise a heal score from lineQuality, depthQuality, saturation, (1 - trauma) and aftercare, with
                      a little dice: crisp over crisp, slightly soft over soft, else patchy; each join costs a little
     HEAL_REACTIONS what the client says when they see it, by grade x loyalty band (REVIEW_BANDS in clients.js)
     HEAL_APOLOGY   what you say when it got infected (the reveal's apology scene)
     REP_TRACKS     walk-ins (speed and price), collectors (custom work and style), peers (clean heals; conventions later).
                    Each is 0..100 in S.rep. unlocks: the client segments (WALKINS.seg in market.js) a track pulls in only
                    once it reaches that number; events: the PR 8 events it opens (data only until then)
     REP            how a heal, a review and the portfolio move each track; gains shrink as a track fills (soft cap), losses
                    don't; every track slips a little each week (decayWeek) so a reputation has to be kept up
   healPiece(S, piece, r, log): grades it once (piece.heal set, never changed after), stamps healW/healY, logs a heal line,
   writes the client's heal history, moves loyalty (LOYALTY[grade]), may write a review (writeReview), moves S.rep, and on
   an infection books a free fix (a price-0 session item with fix: piece id) for a client on the books. It queues the piece
   for the reveal in S.reveals (when S has that list; at most REVEAL_CAP waiting). Sample walk-ins aren't in S.clients:
   the app may set SIM.guestClient(id) -> {traits, skinTone} so their aftercare counts; their review rides on piece.review.
   Practice pieces are never saved, so they never heal.
   Private helpers start with hl (healing) and rp (reputation). ===== */

const HEAL={
  w:{line:0.28,depth:0.32,sat:0.18,trauma:0.22},   // the heal score's weights (trauma counts as 1 - trauma)
  care:0.3,careMid:0.55,                           // aftercare: + care x (aftercare - careMid)
  joinCost:0.012,joinMax:0.08,                      // each visible join takes this off the score, up to joinMax
  noise:0.05,                                       // sd of the dice on the score
  crisp:0.76,soft:0.6,                              // score thresholds; under soft is patchy
  infect:{trauma:0.55,care:0.45,max:0.5},           // both over/under or never; chance = max x trauma excess x care shortfall
  blow:{k:4,max:0.95},                              // chance of a blown-out heal = max x (1 - e^(-blowouts / k))
  careDefault:0.6,                                  // aftercare when the client isn't known
  fix:{weeksAfter:3,hoursPerMm:0.02,minHours:1,maxHours:4}   // the free fix after an infection: when, and how long
};
const REVEAL_CAP=12;
/* what the client says at the reveal: grade x loyalty band */
const HEAL_REACTIONS={
  crisp:{
    low:["Huh. That's actually really clean.","OK. Yes. That came out well."],
    mid:["Look at those lines. I keep catching it in shop windows.","It's perfect. My sister wants your number."],
    high:["Every time, you do this. It's the best one yet.","I didn't think it could look better than the day we did it. It does."]},
  soft:{
    low:["It's fine. Softer than I pictured.","A couple of the lines look a bit fuzzy, no?"],
    mid:["It settled in a bit soft, but I love it.","Not as sharp as day one, but it's mine."],
    high:["A line went soft. I don't care, I still love it.","Bit soft by the elbow. Next time we go bolder?"]},
  patchy:{
    low:["It looks half done. Is that normal?","There are gaps in the colour. I paid for all of it."],
    mid:["Some spots fell out. Can you fill them in?","It's patchy in places. Was it me? I did go swimming."],
    high:["Patchy, but I trust you'll fix it.","I picked at it, I'll admit it. Can we touch it up?"]},
  blownout:{
    low:["The lines have spread. It looks like it's bleeding.","This isn't what I paid for. It's all blurry."],
    mid:["Some of the lines blew out. Can anything be done?","It's gone blurry here and here. Honestly I'm upset."],
    high:["It blew out a bit. It happens, right? What can we do?","I'll be honest, the lines have spread. I still want you to fix it."]},
  infected:{
    low:["It got infected. I had to see a doctor.","Two weeks of antibiotics. I'm not happy."],
    mid:["It got infected. I'm OK now, but I was scared.","Doctor said it was infected. I didn't skip the cream, I swear. Mostly."],
    high:["It got infected. I know I didn't keep it clean. I'm still coming back.","Rough fortnight. The doctor sorted it. Can we fix the marks?"]}
};
/* the artist's apology when a piece got infected */
const HEAL_APOLOGY=[
  "I'm sorry. That should never happen in my chair. The fix is on me, and I'm going over every step of how I work.",
  "I'm truly sorry. Come back when it's settled and I'll make it right, no charge. I'm changing how I set up.",
  "That's on my shop, and I'm sorry. The touch-up is free, whenever your skin is ready."
];
/* the reputation tracks (S.rep, each 0..100). unlocks: segment -> the track value it starts pulling at (market.js reads
   WALKINS.seg weights; a segment under its unlock pulls nothing). events: for PR 8 (conventions, guest spots, ...) */
const REP_TRACKS={
  walkins:{name:"Walk-ins",says:"speed and price: quick, fair, open doors",
    unlocks:{walk_in:0,first_timer:0,students:15,trades:25},
    events:{flash_day:40,friday_13:60}},
  collectors:{name:"Collectors",says:"custom work and style: people who plan a body of work",
    unlocks:{creatives:10,memorial:15,collector:25,large_scale:45},
    events:{waiting_list:50,magazine:75}},
  peers:{name:"Peers",says:"clean heals: what other artists notice",
    unlocks:{old_school:20,cover_up:35},
    events:{guest_spot:30,convention:55,award:85}}
};
/* how things move the tracks (points on 0..100) */
const REP={
  full:100,soft:0.85,          // a gain is x (1 - soft x track / full), so a track fills slower as it rises
  decayWeek:0.0015,            // every track loses this share of itself each week
  heal:{                       // when a piece heals, by grade
    walkins:{crisp:0.3,soft:0.18,patchy:-0.2,blownout:-0.6,infected:-1.5},
    peers:{crisp:0.3,soft:0.08,patchy:-0.3,blownout:-1,infected:-2.5}
  },
  flash:{walkins:0.12},        // a flash piece (quick and cheap) adds this to walk-ins
  small:{mm:60,walkins:0.08},  // a piece this small or smaller adds this to walk-ins
  custom:{collectors:0.15,perMm:0.003,maxMm:250},   // a custom (not flash) piece: + this + perMm x size (to maxMm)
  collectorGrade:{crisp:1,soft:0.7,patchy:0.2,blownout:-0.6,infected:-1.2},   // the custom gain x this
  styleOk:{collectors:0.06,skill:6},                // a piece in a style you hold at skill or above adds this
  review:{walkins:0.25,collectors:0.12,peers:0.05}, // per star from 3 (5 stars = +2 x, 1 star = -2 x)
  portfolio:{collectors:0.5}   // putting a healed piece in your portfolio (taking it out takes it back)
};

/* ---- reputation ---- */
function rpEnsure(S){if(!S.rep||typeof S.rep!=="object")S.rep={walkins:0,collectors:0,peers:0};return S.rep;}
/* repAdd(S, track, delta) -> the new value. Gains are softened as the track fills; the result stays in 0..full */
function repAdd(S,k,d){
  const rep=rpEnsure(S),cur=+rep[k]||0;
  const eff=d>0?d*(1-REP.soft*cur/REP.full):d;
  rep[k]=Math.round(clamp(cur+eff,0,REP.full)*100)/100;
  return rep[k];
}
function repWeek(S){
  const rep=rpEnsure(S);
  for(const k in REP_TRACKS)if(rep[k]>0)rep[k]=Math.round(rep[k]*(1-REP.decayWeek)*1000)/1000;
}
/* repUnlocked(S, track, id): a segment or an event id the track has reached */
function repUnlocked(S,k,id){
  const t=REP_TRACKS[k];if(!t)return false;
  const at=t.unlocks[id]!=null?t.unlocks[id]:t.events[id];
  return at==null?true:((S.rep&&+S.rep[k])||0)>=at;
}
/* repNext(S, track) -> {id, kind:"segment"|"event", at} the next thing the track opens, or null */
function repNext(S,k){
  const t=REP_TRACKS[k],v=(S.rep&&+S.rep[k])||0;let best=null;
  if(!t)return null;
  for(const kind of ["unlocks","events"])for(const id in t[kind]){const at=t[kind][id];if(at>v&&(!best||at<best.at))best={id,kind:kind==="unlocks"?"segment":"event",at};}
  return best;
}
/* what a heal does to each track: {walkins, collectors, peers} in points before the soft cap */
function repHealDelta(S,piece){
  const g=piece.heal,d=piece.design||{},out={walkins:0,collectors:0,peers:0};
  out.walkins+=REP.heal.walkins[g]||0;out.peers+=REP.heal.peers[g]||0;
  if(d.flash)out.walkins+=REP.flash.walkins;
  if((d.sizeMm||0)>0&&d.sizeMm<=REP.small.mm)out.walkins+=REP.small.walkins;
  if(!d.flash){
    const mm=Math.min(REP.custom.maxMm,d.sizeMm||0);
    let c=REP.custom.collectors+REP.custom.perMm*mm;
    const lvl=((S.skills||{}).styles||{})[d.style]||0;
    if(lvl>=REP.styleOk.skill)c+=REP.styleOk.collectors;
    out.collectors+=c*(REP.collectorGrade[g]!=null?REP.collectorGrade[g]:0.5);
  }
  return out;
}
function repApply(S,delta){const after={};for(const k in delta)if(delta[k])after[k]=repAdd(S,k,delta[k]);return after;}
/* setPortfolio(S, piece, on): the piece's portfolio flag; collectors notice (a little). Only a healed piece. -> bool */
function setPortfolio(S,piece,on){
  on=!!on;if(!piece||!piece.heal||!!piece.portfolio===on)return !!(piece&&piece.portfolio);
  if(on)piece.portfolio=true;else delete piece.portfolio;
  const rep=rpEnsure(S);   // no soft cap here, so taking it out gives back exactly what putting it in gave
  rep.collectors=Math.round(clamp((+rep.collectors||0)+(on?1:-1)*REP.portfolio.collectors,0,REP.full)*100)/100;
  return on;
}

/* ---- the heal ---- */
const hlR3=v=>Math.round(v*1000)/1000;
function hlAftercare(c){const t=c&&c.traits;return t&&t.aftercare!=null?clamp(t.aftercare,0,1):HEAL.careDefault;}
function hlBlowouts(piece){const o=piece.out||{};return Math.max(0,+(piece.blowouts!=null?piece.blowouts:o.blowouts)||0);}
function hlJoins(piece){const o=piece.out||{};return Math.max(0,+(piece.joins!=null?piece.joins:o.joins)||0);}
/* healOdds(piece, aftercare) -> {infect, blow, score} before the dice: the chances and the heal score with no noise */
function healOdds(piece,care){
  const o=Object.assign({},DEFAULT_OUT,piece.out||{}),W=HEAL.w,I=HEAL.infect;
  const t=clamp(o.trauma,0,1);
  const infect=t>I.trauma&&care<I.care?I.max*((t-I.trauma)/(1-I.trauma))*((I.care-care)/I.care):0;
  const b=hlBlowouts(piece),blow=b>0?HEAL.blow.max*(1-Math.exp(-b/HEAL.blow.k)):0;
  const score=W.line*clamp(o.lineQuality,0,1)+W.depth*clamp(o.depthQuality,0,1)+W.sat*clamp(o.saturation,0,1)+W.trauma*(1-t)
    +HEAL.care*(care-HEAL.careMid)-Math.min(HEAL.joinMax,HEAL.joinCost*hlJoins(piece));
  return{infect:hlR3(infect),blow:hlR3(blow),score:hlR3(score)};
}
/* healGrade(piece, aftercare, r) -> HEAL_GRADES id. Draw order is fixed (infection, blowout, score) so it replays */
function healGrade(piece,care,r){
  const k=healOdds(piece,care);
  const a=r(),b=r(),s=k.score+r.normal(0,HEAL.noise);
  if(k.infect>0&&a<k.infect)return "infected";
  if(k.blow>0&&b<k.blow)return "blownout";
  return s>=HEAL.crisp?"crisp":s>=HEAL.soft?"soft":"patchy";
}
const hlBand=l=>l<REVIEW_BANDS[0]?"low":l<REVIEW_BANDS[1]?"mid":"high";
/* healReaction(piece, loyalty) -> the client's line at the reveal (stable per piece) */
function healReaction(piece,loyalty){
  const row=HEAL_REACTIONS[piece.heal];if(!row)return "";
  const list=row[hlBand(loyalty||0)];return list[hash(piece.id+":react")%list.length];
}
function healApology(piece){return HEAL_APOLOGY[hash(piece.id+":sorry")%HEAL_APOLOGY.length];}
/* the review for a piece: the client's history entry, or piece.review for a sample walk-in */
function pieceReview(S,piece){
  if(piece.review)return piece.review;
  const c=findClient(S,piece.client);if(!c)return null;
  for(let i=(c.history||[]).length-1;i>=0;i--){const h=c.history[i];if(h.kind==="review"&&h.piece===piece.id)return h;}
  return null;
}
/* the free fix after an infection: a price-0 session for a client on the books, after the skin settles */
function hlBookFix(S,piece,c){
  const d=piece.design||{},F=HEAL.fix;
  const hours=Math.round(clamp((d.sizeMm||40)*F.hoursPerMm,F.minHours,F.maxHours)*4)/4;
  const due=weekFrom(weekIndex(S.week,S.year)+F.weeksAfter);
  const ask={placement:d.placement,sizeMm:d.sizeMm,style:d.style,tags:[],theme:"fix",size:"tiny",bad:null};
  const item={id:queueId(S),kind:"session",client:c.id,w:due.w,y:due.y,hours,sessionNo:1,sessions:1,price:0,deposit:0,paid:0,
    ask,design:JSON.parse(JSON.stringify(d)),booked:{w:S.week,y:S.year},moved:0,fix:piece.id,ret:{rule:"touchup",piece:piece.id}};
  S.queue.push(item);
  return item;
}
/* healPiece(S, piece, r, log) -> the grade (or the existing one: a piece heals exactly once) */
function healPiece(S,piece,r,log){
  if(!piece||piece.heal)return piece&&piece.heal;
  const real=findClient(S,piece.client);
  const guest=!real&&typeof SIM.guestClient==="function"?SIM.guestClient(piece.client):null;
  const c=real||{id:piece.client,first:"",traits:(guest&&guest.traits)||{},loyalty:guest&&guest.loyalty!=null?guest.loyalty:0.3,history:[]};
  const g=healGrade(piece,hlAftercare(c),r.fork("grade:"+piece.id));
  piece.heal=g;piece.healW=S.week;piece.healY=S.year;
  const name=HEAL_GRADES[g].name;
  let text="The bandage comes off "+piece.name+": "+(g==="infected"?"it got infected.":"healed "+name+".");
  if(real){clientLog(real,{w:S.week,y:S.year,kind:"heal",piece:piece.id,grade:g});loyaltyBump(real,g);}
  /* reputation: the heal, then the review */
  repApply(S,repHealDelta(S,piece));
  const rv=writeReview(c,piece,r.fork("review:"+piece.id));
  if(rv){
    if(!real)piece.review={stars:rv.stars,text:rv.text};
    const st=rv.stars-3;repApply(S,{walkins:st*REP.review.walkins,collectors:st*REP.review.collectors,peers:st*REP.review.peers});
  }
  if(g==="infected"&&real&&!real.compact){
    const fx=hlBookFix(S,piece,real);
    text+=" A free fix is booked for week "+fx.w+", "+fx.y+".";
  }
  if(Array.isArray(S.reveals)){S.reveals.push(piece.id);if(S.reveals.length>REVEAL_CAP)S.reveals.splice(0,S.reveals.length-REVEAL_CAP);}
  if(log)log.push({k:"heal",text,piece:piece.id,client:piece.client,grade:g,review:rv?rv.stars:null});
  return g;
}
/* every week: heal what is due (calendar.js), then each track slips a little */
const hlCalHeals=WEEK_HOOKS.heals;
WEEK_HOOKS.heals=function(S,ctx){hlCalHeals(S,ctx);repWeek(S);};

SIM.HEAL=HEAL;SIM.HEAL_REACTIONS=HEAL_REACTIONS;SIM.HEAL_APOLOGY=HEAL_APOLOGY;SIM.REVEAL_CAP=REVEAL_CAP;
SIM.REP_TRACKS=REP_TRACKS;SIM.REP=REP;SIM.repAdd=repAdd;SIM.repWeek=repWeek;SIM.repUnlocked=repUnlocked;SIM.repNext=repNext;
SIM.repHealDelta=repHealDelta;SIM.setPortfolio=setPortfolio;SIM.healOdds=healOdds;SIM.healGrade=healGrade;SIM.healPiece=healPiece;
SIM.healReaction=healReaction;SIM.healApology=healApology;SIM.pieceReview=pieceReview;
