/* ===== sim/calendar.js: the week clock: advanceWeek(S) is the only thing that moves time (PR 3) =====
   A career is 2000 week 1 to 2030 week 52 (1,612 weeks; a "30-year" run is 1,560). Each advanceWeek closes the week that
   is ending (walk-ins nobody saw leave, booked consults that waited too long give up), moves the clock one week (52 rolls
   to week 1 of the next year), then runs WEEK_ORDER, in the plan's order:
     heals     the bandage comes off pieces done WEEK.healWeeks ago (PR 5 fills in the grade through SIM.healPiece)
     aging     on a year boundary: clients turn a year older and pieces cross a year (PR 5 re-renders them)
     bookings  walk-ins from market.js, returns (RETURN_RULES), referrals (REFERRAL), then the week's chair hours are
               filled from the queue; sessions that don't fit move to next week
     costs     the shop's cut, supplies, rent, staff, sales (PR 7: sim/career.js careerWeek replaces the stub)
     events    queued events, reckonings, inspections (set by sim/events.js, PR 8)
     trend     the trend wave (set by sim/events.js, PR 8)
   Later PRs replace a stub by assigning SIM.WEEK_HOOKS.<name> = function(S, ctx){...}. ctx = {r (an rng forked for that hook and
   week), log, yearRolled, now (SIM.weekIndex of the new week)}; a hook pushes {k, text, ...} lines onto ctx.log.
   advanceWeek returns that log: [{k, text, client?, piece?, item?}], k one of week left gaveup heal year walkin return referral
   booked carried cost event trend goal note end. At 2030 week 52 it stops: the log ends with {k:"end"} and log.end = true.
   SIM.nextStop(S): the Career tab's Next button. Advances until a client is due (a booked session, a return, a referral or a
   walk-in), a heal or an event, never more than WEEK.maxSkip weeks; returns {weeks, why, line, log}.
   SIM.finishSession(S, itemId, {design, out, heal}): a sitting is done (PR 4 calls it): pays the share of the balance,
   books the next sitting WEEK.sessionGap weeks later, or on the last one creates the piece (SIM.addPiece).
   Private helpers start with cal. ===== */

/* chair hours and bookings by career stage (S.studio.stage) */
const WEEK={
  stages:{
    apprentice:{hours:8,maxBookings:2,walkinSlots:1},    // mostly sweeping and practising; a little flash
    chair:{hours:30,maxBookings:8,walkinSlots:3},        // a rented chair
    studio:{hours:36,maxBookings:10,walkinSlots:5},      // your own shop (your own chair; staff are PR 7)
    legacy:{hours:28,maxBookings:6,walkinSlots:2}        // fewer, bigger pieces off the waiting list
  },
  healWeeks:2,          // weeks from the session to the bandage coming off (PR 5)
  sessionGap:3,         // weeks between sittings of a multi-session piece
  consultWait:CAL_CONSULT_WAIT,   // weeks a booked consult waits (see clients.js)
  maxSkip:4,            // Next never jumps more than this
  nextStopsOnWalkins:true,        // a walk-in at the door stops Next (Kelbo may prefer only booked clients)
  first:{w:1,y:2000},last:{w:52,y:2030}
};
function weekHours(S){const st=WEEK.stages[(S.studio&&S.studio.stage)||"apprentice"]||WEEK.stages.chair;return st.hours;}
function careerOver(S){return S.year>WEEK.last.y||(S.year===WEEK.last.y&&S.week>=WEEK.last.w);}
const calWho=(S,item)=>{const c=item.newClient||findClient(S,item.client);return c?c.name:"a client";};
const calFirst=(S,item)=>{const c=item.newClient||findClient(S,item.client);return c?c.first:"a client";};

/* ---- the week that is ending ---- */
function calCloseWeek(S,log){
  const now=clNow(S);let left=0;const keep=[];
  for(const q of S.queue){
    if(q.kind==="walkin"&&weekIndex(q.w,q.y)<=now){left++;continue;}
    if(q.kind==="consult"&&q.expires!=null&&q.expires<=now){
      const c=q.newClient||findClient(S,q.client);
      if(c&&!q.newClient){loyaltyBump(c,"noShow");clientLog(c,{w:S.week,y:S.year,kind:"note",text:"gave up waiting for a consult"});}
      log.push({k:"gaveup",text:(c?c.name:"A client")+" gave up waiting for a consult.",client:c?c.id:null});
      continue;}
    keep.push(q);
  }
  S.queue=keep;
  if(left)log.push({k:"left",text:left===1?"A walk-in left without a consult.":left+" walk-ins left without a consult.",n:left});
}

/* ---- hooks ---- */
/* heals: pieces whose bandage comes off this week. PR 5 grades them via SIM.healPiece(S, piece, r, log) */
function calHeals(S,ctx){
  for(let i=S.pieces.length-1;i>=0;i--){
    const p=S.pieces[i],age=ctx.now-weekIndex(p.w,p.y);
    if(age>WEEK.healWeeks)break;
    if(age!==WEEK.healWeeks||p.heal)continue;
    if(typeof SIM.healPiece==="function")SIM.healPiece(S,p,ctx.r,ctx.log);
    else ctx.log.push({k:"heal",text:"The bandage comes off "+p.name+".",piece:p.id,client:p.client});
  }
}
/* aging: on week 1 every client turns a year older and every piece crosses a year (PR 5 re-renders pieces that did) */
function calAging(S,ctx){
  if(!ctx.yearRolled)return;
  for(const c of S.clients)if(c.born!=null)c.age=S.year-c.born;
  let n=0;for(const p of S.pieces)if(p.y<S.year)n++;
  ctx.log.push({k:"year",text:S.year+(n?". "+n+(n===1?" piece turns":" pieces turn")+" a year older.":". A new year."),n});
}
/* bookings: walk-ins, returns, referrals, then fill the week's chair hours */
function calBookings(S,ctx){
  const r=ctx.r,log=ctx.log,now=ctx.now,wk=weekFrom(now);
  /* walk-ins (market.js) */
  const walk=typeof generateWalkins==="function"?generateWalkins(S,r.fork("walkins")):[];
  for(const c of walk){
    S.queue.push({id:queueId(S),kind:"walkin",client:c.id,newClient:c,src:"walkin",w:wk.w,y:wk.y,expires:now,brief:c.brief,ask:c.ask});
  }
  if(walk.length)log.push({k:"walkin",text:(walk.length===1?"A walk-in: ":walk.length+" walk-ins: ")+walk.map(c=>c.first).join(", ")+".",n:walk.length});
  /* returns */
  for(const it of scheduleReturns(S,r.fork("returns"))){
    const c=findClient(S,it.client);
    log.push({k:"return",text:(c?c.name:"A client")+" is coming back: "+calRetWords(it.ret)+".",client:it.client,item:it.id});
  }
  /* referrals: a piece that healed REFERRAL.after weeks ago may send a friend */
  const rr=r.fork("referrals"),at=WEEK.healWeeks+REFERRAL.after;
  for(let i=S.pieces.length-1;i>=0;i--){
    const p=S.pieces[i],age=now-weekIndex(p.w,p.y);
    if(age>at)break;if(age!==at)continue;
    const c=findClient(S,p.client);if(!c||c.compact)continue;
    if(p.heal==="patchy"||p.heal==="blownout"||p.heal==="infected")continue;
    if(!rr.chance(lerp(REFERRAL.chance[0],REFERRAL.chance[1],c.loyalty||0)))continue;
    const n=referral(c,rr,{id:clNextId(S),year:S.year,week:S.week,label:p.label,segBoost:typeof mkSegBoost==="function"?mkSegBoost(S):null});
    const due=weekFrom(now+rr.int(0,1));
    S.queue.push({id:queueId(S),kind:"consult",src:"referral",client:n.id,newClient:n,w:due.w,y:due.y,expires:weekIndex(due.w,due.y)+WEEK.consultWait,brief:n.brief,ask:n.ask,from:c.id});
    clientLog(c,{w:S.week,y:S.year,kind:"referral",client:n.id});loyaltyBump(c,"referral");
    log.push({k:"referral",text:n.name+" is booked for a consult: "+c.first+" sent them.",client:n.id,from:c.id});
  }
  calAllocate(S,log,now);
}
function calRetWords(ret){
  const y=ret.year,l=ret.label;
  switch(ret.rule){
    case "touchup":return "a touch-up on the "+l+" ("+y+")";
    case "addon":return "something to go with the "+l+" ("+y+")";
    case "sleeve":return "a sleeve around the "+l+" ("+y+")";
    case "cover_own":return "the "+l+" from "+y+" needs covering";
    case "cover_other":return "a cover-up of a "+l+" from another shop ("+y+")";
  }
  return "the "+l+" ("+y+")";
}
/* fill this week's chair hours from the sessions that are due (oldest first); the rest move to next week */
function calAllocate(S,log,now){
  const st=WEEK.stages[(S.studio&&S.studio.stage)||"apprentice"]||WEEK.stages.chair;
  const due=S.queue.filter(q=>q.kind==="session"&&weekIndex(q.w,q.y)<=now).sort((a,b)=>weekIndex(a.w,a.y)-weekIndex(b.w,b.y)||(a.sessionNo>b.sessionNo?-1:1));
  let hrs=0,n=0;const moved=[],rolled=[];const nx=weekFrom(now+1);
  for(const q of due){
    if(n<st.maxBookings&&(hrs+q.hours<=st.hours||n===0)){
      if(weekIndex(q.w,q.y)<now)rolled.push(q);   // booked last week and not done: it rolls over
      hrs+=q.hours;n++;q.w=weekFrom(now).w;q.y=weekFrom(now).y;}
    else{q.w=nx.w;q.y=nx.y;q.moved=(q.moved||0)+1;moved.push(q);}
  }
  if(rolled.length)log.push({k:"carried",text:rolled.length===1?calFirst(S,rolled[0])+"'s session rolls over from last week.":rolled.length+" sessions roll over from last week.",n:rolled.length});
  if(n)log.push({k:"booked",text:n+(n===1?" session":" sessions")+" this week ("+hrs+" of "+st.hours+" hours).",n,hours:hrs});
  if(moved.length)log.push({k:"carried",text:moved.length===1?calFirst(S,moved[0])+"'s session moves to next week: no chair time left.":moved.length+" sessions move to next week: no chair time left.",n:moved.length});
}
function calNoop(){}
const WEEK_HOOKS={heals:calHeals,aging:calAging,bookings:calBookings,costs:calNoop,events:calNoop,trend:calNoop};
const WEEK_ORDER=["heals","aging","bookings","costs","events","trend"];

/* advanceWeek(S) -> log. The only function that changes S.week / S.year. */
function advanceWeek(S){
  const log=[];
  if(careerOver(S)){log.push({k:"end",text:"Week 52, 2030. Thirty years at the needle."});log.end=true;return log;}
  const close=[];calCloseWeek(S,close);
  const y0=S.year;
  S.week++;if(S.week>WEEKS_PER_YEAR){S.week=1;S.year++;}
  log.push({k:"week",text:"Week "+S.week+", "+S.year+"."});
  for(const l of close)log.push(l);
  const now=clNow(S),base=rng(S.seed).fork("week:"+S.year+":"+S.week);
  for(const k of WEEK_ORDER){
    const f=WEEK_HOOKS[k];
    if(typeof f==="function")f(S,{r:base.fork(k),log,yearRolled:S.year!==y0,now});
  }
  if(careerOver(S)){log.push({k:"end",text:"Week 52, 2030. Thirty years at the needle."});log.end=true;}
  return log;
}
/* what stops Next this week */
function calStopReason(S,log){
  if(log.some(l=>l.k==="event"))return "event";
  const now=clNow(S);
  for(const q of S.queue){
    if(weekIndex(q.w,q.y)!==now)continue;
    if(q.kind==="session"||q.kind==="consult")return "client";
    if(q.kind==="walkin"&&WEEK.nextStopsOnWalkins)return "walkin";
  }
  if(log.some(l=>l.k==="heal"))return "heal";
  return null;
}
/* one line for the Career tab */
function calSummary(from,S,all,why,weeks){
  const cnt=k=>all.filter(l=>l.k===k).reduce((a,l)=>a+(l.n||1),0);
  const parts=[];
  const head=weeks===1?"Week "+S.week+", "+S.year:"Weeks "+from.w+(from.y!==S.year?" ("+from.y+")":"")+" to "+S.week+", "+S.year;
  const left=cnt("left");if(left)parts.push(left===1?"a walk-in left unseen":left+" walk-ins left unseen");
  const gave=all.filter(l=>l.k==="gaveup").length;if(gave)parts.push(gave===1?"one consult gave up waiting":gave+" consults gave up waiting");
  for(const l of all)if(l.k==="return"||l.k==="referral"||l.k==="heal"||l.k==="year"||l.k==="event"||l.k==="carried"||l.k==="trend"||l.k==="goal"||l.k==="note")parts.push(l.text.replace(/\.$/,"").replace(/^(The|A|An) /,m=>m.toLowerCase()));
  const w=all.filter(l=>l.k==="walkin");if(w.length)parts.push(w[w.length-1].text.replace(/\.$/,"").replace(/^(The|A|An) /,m=>m.toLowerCase()));
  const b=all.filter(l=>l.k==="booked");if(b.length)parts.push(b[b.length-1].text.replace(/\.$/,""));
  if(why==="end")parts.push("the thirty years are up");
  else if(why==="cap")parts.push("a quiet stretch");
  return head+": "+(parts.length?parts.join("; "):"nothing much")+".";
}
/* nextStop(S) -> {weeks, why: "client"|"walkin"|"heal"|"event"|"cap"|"end", line, log} */
function nextStop(S){
  if(careerOver(S))return{weeks:0,why:"end",line:"Week 52, 2030: the thirty years are up.",log:[{k:"end",text:"Week 52, 2030. Thirty years at the needle."}]};
  const from=weekFrom(clNow(S)+1),all=[];let why="cap",weeks=0;
  while(weeks<WEEK.maxSkip){
    const log=advanceWeek(S);weeks++;
    for(const l of log)all.push(l);
    if(log.end){why="end";break;}
    const s=calStopReason(S,log);if(s){why=s;break;}
  }
  return{weeks,why,line:calSummary(from,S,all,why,weeks),log:all};
}
/* finishSession(S, itemId, {design, out, heal}) -> {piece, next, paid}. Removes the queue item, pays this sitting's share
   of the balance into S.cash, books the next sitting or (on the last) creates the piece. */
function finishSession(S,itemId,res){
  res=res||{};
  const i=S.queue.findIndex(q=>q.id===itemId);if(i<0)return null;
  const q=S.queue[i];S.queue.splice(i,1);
  const balance=Math.max(0,(q.price||0)-(q.deposit||0)),share=Math.round(balance/Math.max(1,q.sessions||1));
  cashIn(S,share,"sitting");   // PR 7: through the ledger (sim/career.js)
  const design=res.design||q.design||null;
  if((q.sessionNo||1)<(q.sessions||1)){
    const due=weekFrom(clNow(S)+WEEK.sessionGap);
    const next=Object.assign({},q,{id:queueId(S),w:due.w,y:due.y,sessionNo:(q.sessionNo||1)+1,design,paid:(q.paid||0)+share,moved:0});
    S.queue.push(next);
    const c=findClient(S,q.client);if(c)clientLog(c,{w:S.week,y:S.year,kind:"session",n:q.sessionNo||1,of:q.sessions});
    return{piece:null,next,paid:share};
  }
  const piece=addPiece(S,{client:q.client,design:design||{},out:res.out||null,heal:res.heal||null,price:q.price||0,ret:q.ret?{rule:q.ret.rule,piece:q.ret.piece}:null});
  if(!piece.ret)delete piece.ret;
  return{piece,next:null,paid:share};
}

SIM.WEEK=WEEK;SIM.WEEK_HOOKS=WEEK_HOOKS;SIM.WEEK_ORDER=WEEK_ORDER;SIM.weekHours=weekHours;SIM.careerOver=careerOver;
SIM.advanceWeek=advanceWeek;SIM.nextStop=nextStop;SIM.finishSession=finishSession;
