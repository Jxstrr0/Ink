/* ===== sim/career.js: the career (PR 7): the four acts, the mentor, money, the studio build-out, staff, the signature,
   skills, conventions and guest spots, Act 4's offers, the soft fail and the Legacy summary =====
   Tables (every tuning number lives here; rubles are 2000 rubles x SIM.priceIndex(year) unless a comment says otherwise):
     ACTS             the four acts: apprentice (years 1-3), chair (3-8), studio (8-20), legacy (20-30); S.studio.stage
     MENTOR           Arkady Sedov, who runs the shop on Kanatnaya Street where you start, and his lines by topic
     APPRENTICE_STEPS Act 1 is the tutorial: one-line goals in order, each with the tab it happens on and a check
     CHORES           what an apprentice does for Arkady; each one moves the clock a week
     FRIENDS          free pieces on friends in Act 1
     CHAIR_SPLIT      the share of your takings the shop keeps while you rent a chair (and Arkady's cut while you apprentice)
     RATE_BY_REP      your hourly rate: S.rate = (base by act + reputation) x signature x PRICE_INDEX
     SUPPLIES, LEASE, MARKETING, STUDIO_STAGES, VIBES   what the work and the shop cost, and what the build-out does
     STAFF            hired artists: style, skill, ego, the shop's cut, poach risk; STAFF_NAMES-free (names from clients.js)
     NOSHOW, INSPECTION, BROKE   deposits kept when people don't show, health inspections, the soft fail
     SIGNATURE        what you do most, and what it does once it shows
     SKILLS           the skills and what each one does; SKILL_XP (sim/session.js) gains consult and chore XP here
     CONVENTIONS, GUEST_SPOTS, LEGACY_OFFERS, APPRENTICES   events of Acts 2 to 4
     LEGACY           the Legacy screen's numbers
   Functions (S in, S changed; rng forked from S.seed + a label, never Math.random):
     SIM.careerEnsure(S)  fills S.career / S.studio for an old or bare save     SIM.cashIn / cashOut(S, amount, kind)
     SIM.apprenticeSteps(S), SIM.mentorLine(S, topic, sub)                      SIM.doChore(S, id) -> log (one week on)
     SIM.friendBooking(S), SIM.rentChair(S), SIM.leaseStudio(S), SIM.goLegacy(S), SIM.softFail(S), SIM.skipBroom(S)
     SIM.buildUp(S, key), SIM.setVibe, SIM.setMarketing, SIM.staffCandidates(S), SIM.hireStaff(S, cand), SIM.letGo(S, id)
     SIM.simStaffSession(staff, design, {kit, shop, r}) -> session outputs        SIM.signatureOf(S)
     SIM.enterInvite(S, id, yes), SIM.takeApprentice(S), SIM.legacyAct(S, id), SIM.legacySummary(S)
     WEEK_HOOKS.costs = careerWeek: the shop's cut, supplies, rent, staff, apprentices, sales, no-shows, inspections,
     invites, the soft fail, the client archive (sim/archive.js). Private helpers start with ca. ===== */

const ACTS={
  apprentice:{act:1,name:"Apprentice",years:[0,3]},
  chair:{act:2,name:"Rented chair",years:[3,8]},
  studio:{act:3,name:"Your studio",years:[8,20]},
  legacy:{act:4,name:"Legacy",years:[20,30]}
};
/* the mentor: an old-school traditional artist with a canal-side shop. Lines are picked stably per week (hash), so a
   screen reads the same until the clock moves */
const MENTOR={
  name:"Arkady Sedov",first:"Arkady",addr:"Arkady Lvovich",shop:"Sedov's on Kanatnaya Street",style:"traditional",
  goodwill:{start:0.5,chore:0.015,practice:0.01,friend:0.03,walkin:0.04,crisp:0.02,bad:-0.02,onTime:0.08,early:-0.12,earlyPerYear:-0.18,max:1},
  splitAt:0.55,          // goodwill at or above this: his chair at CHAIR_SPLIT.mentor when you leave
  loanAt:0.6,            // goodwill at or above this: he covers you once when the studio is about to close (BROKE.loan)
  lines:{
    intro:["Broom's behind the door. Everyone starts on the floor, even the famous ones.","You want to tattoo? First you learn to keep a shop clean enough to tattoo in."],
    chore:["Good. A clean shop is half the work.","Floor's done. Now the tubes, and do them properly.","You're quicker than last week. Don't get sloppy about it.","The customers notice a clean counter before they notice the flash."],
    practice:["Again. Slower. The machine does the work, you just steer it.","Better. Your lines still wobble at the ends. Finish the stroke.","Fake skin forgives you. People won't. Keep at it."],
    flash:["That's a sheet. Not a good one yet, but a sheet.","Bold lines, few colours. It has to read from across the street.","Put it on the wall. Let's see if anyone picks it."],
    friend:["Your friend? Fine. Free means you can't blame the money if it goes wrong.","Small, simple, clean. Don't show off on a friend."],
    walkin:["Someone's paying for your work now. Act like it.","A paying stranger. Talk to them properly before you touch them."],
    idle:["Quiet week. Draw something.","When the door's quiet, the pencil isn't.","Sweep, then draw. That's the job between clients."],
    crisp:["That healed like it should. Remember how your hand felt.","Clean. I'd have put that one on my wall."],
    soft:["It settled soft. Your depth wanders when you get tired.","Not bad. Not crisp either. Slow down on the long lines."],
    patchy:["Patchy. You weren't packing it. Watch the saturation.","They'll need a touch-up. Do it for free and do it right."],
    blownout:["Blown out. You went too deep and too fast. Feel the skin.","That spread. Ease off the voltage and slow your hand."],
    infected:["An infection in my shop. We go over every step of the setup tonight.","Never again. Gloves, film, wrap, every time. Every time."],
    ready:["Three years. You're ready for your own chair. I'll miss the help.","Time you had your own chair. Come back and show me your work."],
    early:["Leaving already? Fine. Don't come asking for favours.","You're not ready, but you won't hear it from me twice. Go."],
    onTime:["Go on, then. My door's open if you need it.","You did your time properly. That counts for something round here."],
    later:{high:["Arkady drops by and looks at your wall for a long time. 'Good,' he says.","Arkady sends a client your way. 'Tell them I said hello.'"],
           low:["You pass Arkady on the embankment. He nods and keeps walking.","Word gets back that Arkady thinks you left too soon."]},
    loan:["Arkady turns up with an envelope. 'Pay me back when you can. Not before.'"],
    broke:{high:["Arkady comes round with a thermos. 'Everyone loses a shop once. Rent a chair, keep your clients, start again.'"],
           low:["You hear Arkady heard. He doesn't call."]}
  }
};
/* Act 1 is the tutorial: a one-line goal at a time, each on the tab where it happens */
const APPRENTICE_STEPS=[
  {id:"chore",goal:"Do a chore for Arkady: sweep up and clean the tubes.",tab:"career",how:"Career tab › Chores"},
  {id:"practice",goal:"Practise on fake skin: follow the stencil at a steady pace.",tab:"session",how:"Session tab › Practice"},
  {id:"flash",goal:"Draw a flash sheet: put a design together and save it to your flash.",tab:"design",how:"Design tab › Save to my flash"},
  {id:"friend",goal:"A friend wants a small one, free. Design it and tattoo it.",tab:"career",how:"Career tab › Do a friend"},
  {id:"walkin",goal:"Take a paying walk-in: consult them, design it, finish the piece.",tab:"clients",how:"Career tab › Next, then Clients"},
  {id:"chair",goal:"Finish your three years (week 1, 2003), or leave early and rent a chair.",tab:"career",how:"Career tab › Rent a chair"}
];
const CHORES=[
  {id:"sweep",name:"Sweep up and clean the tubes",xp:{speed:0.012},text:"You sweep, scrub the tubes and wipe every surface down."},
  {id:"stencils",name:"Trace stencils for Arkady",xp:{linework:0.03},text:"You trace a stack of Arkady's stencils. Your lines get steadier."},
  {id:"counter",name:"Mind the front counter",xp:{consult:0.04},text:"You talk to people who come in to look. Most of them only want to look."},
  {id:"autoclave",name:"Run the autoclave and set up stations",xp:{shading:0.012},text:"Bags, wraps, the autoclave log. The boring part that keeps people safe."}
];
const FRIENDS={max:3,sizes:["tiny","small"],loyalty:0.55,
  lines:["You've been promising me one for months. Something small. I'll bring the beer.","I trust you. Mostly. Something little, somewhere I can hide it.","Practise on me. I mean it. Just keep it small."]};
/* the share of your takings (sittings and deposits) the shop keeps: Arkady's cut while you apprentice, a chair's split after */
const CHAIR_SPLIT={apprentice:0.65,mentor:0.3,standard:0.4};
/* your hourly rate in 2000 rubles: base by act + per point of each reputation track, x (1 + sig x signature strength) */
const RATE_BY_REP={base:{apprentice:0,chair:700,studio:850,legacy:1100},perRep:{walkins:2,collectors:6,peers:3},sig:0.15,lighting:0.03,round:50};
const SUPPLIES={perHour:110,shopPerHour:90};   // gloves, film, needles, ink: per booked chair hour (yours; staff hours in the shop)
const LEASE={deposit:60000,rentWeek:2600,utilities:500,salvage:2000,
  need:{year:2006,repSum:90}};                 // lease from 2006, or earlier with walk-ins + collectors + peers >= repSum
const MARKETING=[{name:"Word of mouth",cost:0,walkins:0},{name:"Posters and the local paper",cost:700,walkins:0.1},
  {name:"Radio and magazines",cost:2200,walkins:0.22},{name:"Everything going",cost:5200,walkins:0.34}];
/* the build-out: each part has levels; cost[i] buys level i+1 */
const STUDIO_STAGES={
  stations:{name:"Stations",says:"chairs for the artists you hire",cost:[45000,70000,100000,140000],upkeep:400,
    levels:["One guest station","Two stations","Three stations","Four stations"]},
  waiting:{name:"Waiting area",says:"a sofa, a kettle, the portfolio books: more walk-ins stay",cost:[18000,35000,60000],walkins:0.1,
    levels:["A bench and a kettle","A proper sofa","A lounge with the books"]},
  flash:{name:"Flash wall",says:"framed flash: walk-ins pick off the wall, and sheets sell",cost:[12000,25000,45000],walkins:0.05,sales:280,
    levels:["A few sheets","A full wall","Framed and lit"]},
  steril:{name:"Sterilisation room",says:"its own room for the autoclave: cleaner heals, easier inspections",cost:[30000,55000,90000],trauma:0.035,inspect:0.1,
    levels:["An autoclave corner","A sealed room","Hospital standard"]},
  lighting:{name:"Lighting",says:"daylight lamps over every station: steadier lines",cost:[15000,30000,55000],staffLine:0.02,
    levels:["Daylight bulbs","Arm lamps","Shadowless lighting"]},
  storefront:{name:"Storefront",says:"how the shop looks from the street: the vibe sets who walks in",cost:[22000,45000,80000],walkins:0.07,
    levels:["A painted sign","A proper window","A shopfront people photograph"]}
};
/* the storefront vibe: who it pulls in (added to the reputation tracks' WALKINS.seg pull, x storefront level) */
const VIBES={
  street:{name:"Street shop",says:"walk-ins, first-timers, students, quick flash",seg:{walk_in:0.6,first_timer:0.5,students:0.4},walkins:0.08},
  gallery:{name:"Gallery",says:"collectors and big custom work; fewer walk-ins",seg:{collector:0.7,large_scale:0.5,creatives:0.4},walkins:-0.06},
  parlour:{name:"Old-school parlour",says:"regulars, trades and cover-ups",seg:{old_school:0.6,trades:0.4,cover_up:0.5},walkins:0.02}
};
/* hired artists. fairCut(skill) = the shop's cut a fair shop takes from an artist that good */
const STAFF={
  candidates:3,refreshWeeks:13,skill:[2,8],cutFair:[0.5,0.3],ego:[0.1,0.9],poach:[0.6,1.4],hireFee:4000,
  perWeek:0.7,rate:{base:650,perSkill:70},grow:0.025,
  loyalty:{start:0.45,fair:0.004,unfair:-0.006,slack:0.02},poachBase:0.0045,
  out:{line:0.46,lineSkill:0.045,depth:0.45,depthSkill:0.044,sat:0.5,satSkill:0.04,trauma:0.55,traumaSkill:-0.04,sd:0.06,blowSkill:0.35},
  shopRep:{crisp:0.4,soft:0.15,patchy:-0.4,blownout:-1,infected:-3},shopRepDecay:0.002,shopWalkins:0.4
};
const NOSHOW={base:0.05,loyal:-0.045};          // chance a first sitting with a deposit doesn't show; the deposit stays
/* the health inspector (PR 8 adds the checks and the closure). Pass chance = base + steril room + shop rep + the checks;
   a fail fines you and may close the shop for closeWeeks (always from 2 infections, likely from the second fail) */
const INSPECTION={gap:[26,44],first:[8,20],base:0.72,shopRep:0.001,recentInfect:-0.15,fine:9000,passRep:1,failRep:-4,min:0.2,max:0.98,
  checks:{supplies:-0.12,budgetInk:-0.06,debt:-0.08,stations:-0.03},closeWeeks:[1,3],closeChance:0.6,closeAlways:0.4};
const BROKE={floor:-15000,weeks:4,restart:2000,loan:30000};   // floor and restart in 2000 rubles x PRICE_INDEX
/* the signature: what you do most. Past `pieces` of your own with a top style share of `share`, it shows */
const SIGNATURE={pieces:12,share:0.32,full:60,askChance:0.32,collector:1.6,wtp:1.18,conv:0.15,
  lines:["I've seen your {style} work around the canal. I want your thing, the way you do it.","A friend has one of yours. I want the same hand on me: your {style}, your way.","Everyone on the embankment knows your {style}. That's what I came for."]};
const SKILLS={
  linework:{name:"Linework",says:"steadier pace band and wider accuracy in the chair"},
  shading:{name:"Shading",says:"shading zones pack faster"},
  colour:{name:"Colour",says:"colour zones pack faster"},
  speed:{name:"Speed",says:"less trauma per hour"},
  consult:{name:"Consult",says:"questions reveal more; clients trust you sooner"},
  styles:{name:"Styles",says:"each style's level unlocks its elements on the board"}
};
/* conventions: the local fair is open from Act 2; the bigger ones want peers at REP_TRACKS.peers.events.convention */
const CONVENTIONS=[
  {id:"mostograd_fair",name:"the Mostograd Tattoo Fair",where:"in the old port warehouses",week:38,fee:2500,travel:0,peers:0,prize:[12000,6000,3000]},
  {id:"capital_expo",name:"the big convention in the capital",where:"a night train away",week:16,fee:6000,travel:7000,peers:55,prize:[40000,18000,8000]},
  {id:"baltic_show",name:"the Baltic coast show",where:"by the sea",week:27,fee:4500,travel:5000,peers:40,prize:[25000,12000,5000]}
];
const CONV_SCORE={portfolio:0.35,skill:0.25,peers:0.2,sig:0.2,sd:0.08,places:[0.7,0.6,0.5],rep:{peers:[4,2.5,1.5,0.6],collectors:[3,2,1,0.3]},styleXp:0.12};
const GUEST_SPOTS=[
  {id:"capital",name:"the capital",travel:9000,weeks:2,walkins:1.8,styles:{realism:1.5,fineline:1.5,geometric:1.3}},
  {id:"resort",name:"a seaside resort on the Gulf",travel:5000,weeks:2,walkins:1.6,styles:{watercolour:1.6,fineline:1.4,lettering:1.3}},
  {id:"river_port",name:"a southern river port",travel:6000,weeks:2,walkins:1.5,styles:{traditional:1.5,japanese:1.4,blackwork:1.3}}
];
const GUEST={peers:30,chance:0.035,rep:{peers:1.2,walkins:0.6}};
/* Act 4: one-time projects and the TV offer (plan Q7: money against credibility, in PR 7) */
const LEGACY_OFFERS={
  book:{name:"A flash book",cost:40000,needFlash:10,weekly:550,rep:{collectors:2,walkins:2},says:"your flash, printed and bound. Royalties every week"},
  line:{name:"A product line",cost:80000,weekly:1100,rep:{peers:-3,walkins:3},says:"aftercare balm and prints with your name on. Money, and a little sneer from other artists"},
  conv:{name:"Your own convention",cost:150000,income:120000,rep:{peers:6,collectors:4},says:"a weekend at the old port warehouses with your name on the poster"},
  tv:{name:"The TV offer",pay:400000,rep:{walkins:10,peers:-8,collectors:-6},decline:{peers:2},collectors:45,year:2024,
      says:"a channel wants you for a tattoo makeover show. Good money; other artists will roll their eyes"}
};
const APPRENTICES={stipend:1200,weeks:104,bond:{start:0.45,week:0.003,sd:0.08,staffAt:0.55},skill:[1,3],grow:0.03,
  rivalLines:["opened a shop across the canal","took a chair in the capital and talks about you in interviews","runs a street shop on the outer ring"]};
const LEGACY={reads:0.45};
const CAREER_COMPACT_EVERY=4;   // weeks between client-archive passes (sim/archive.js)

/* ---- the state's career fields (also used by app/state.js freshState through SIM.careerFresh) ---- */
function careerFresh(){return{
  mentor:{goodwill:MENTOR.goodwill.start,left:null,loan:false},
  steps:{},chores:0,practice:0,friends:[],paid:0,
  sig:{n:0,at:0,styles:{},els:{},places:{}},
  money:{cur:{in:{},out:{}},prev:null,total:{in:0,out:0}},
  broke:0,fails:0,scene:null,invites:[],conv:[],guest:null,offers:{},apprentices:[],alumni:[],rivals:[],
  reached:{},books:"open",legacySeen:false,skipped:false,insp:null,cand:null,
  closed:null,inspLast:null,inspFails:0,lastFail:null};}
function studioFresh(){return{stage:"apprentice",staff:[],build:{stations:0,waiting:0,flash:0,steril:0,lighting:0,storefront:0},
  vibe:"street",marketing:0,rep:0,lease:null,nextStaff:1};}
function caFill(dst,src){for(const k in src){if(dst[k]==null)dst[k]=src[k];else if(src[k]&&typeof src[k]==="object"&&!Array.isArray(src[k])&&typeof dst[k]==="object"&&!Array.isArray(dst[k]))caFill(dst[k],src[k]);}return dst;}
/* a save from before PR 7 (or a bare test state) gets a career with Act 1's tutorial already behind it (old:true), so an
   apprentice mid-way through isn't suddenly cut off from walk-ins */
function careerEnsure(S){
  if(!S.career||typeof S.career!=="object"||Array.isArray(S.career)){S.career=careerFresh();S.career.old=true;}else caFill(S.career,careerFresh());
  if(!S.studio||typeof S.studio!=="object")S.studio=studioFresh();else caFill(S.studio,studioFresh());
  if(!Array.isArray(S.studio.staff))S.studio.staff=[];
  return S.career;}
const caPI=S=>SIM.priceIndex(S.year);
const caRub=(S,v)=>Math.round(v*caPI(S)/10)*10;
const caStage=S=>(S.studio&&S.studio.stage)||"apprentice";
const caR3=v=>Math.round(v*1000)/1000;
function caLog(ctx,k,text,extra){if(ctx&&ctx.log)ctx.log.push(Object.assign({k,text},extra||{}));}

/* ---- money: every ruble in or out goes through these, so the week has a ledger ---- */
function cashIn(S,amt,kind){amt=Math.round(+amt||0);if(!amt)return 0;S.cash=(S.cash||0)+amt;
  if(S.career&&S.career.money){const m=S.career.money;m.cur.in[kind]=(m.cur.in[kind]||0)+amt;m.total.in+=amt;}return amt;}
function cashOut(S,amt,kind){amt=Math.round(+amt||0);if(!amt)return 0;S.cash=(S.cash||0)-amt;
  if(S.career&&S.career.money){const m=S.career.money;m.cur.out[kind]=(m.cur.out[kind]||0)+amt;m.total.out+=amt;}return amt;}
function caSum(o){let s=0;for(const k in o||{})s+=o[k];return s;}

/* ---- the rate ---- */
function rateFor(S){
  const st=caStage(S),R=RATE_BY_REP;if(!R.base[st])return 0;
  let r=R.base[st];for(const k in R.perRep)r+=R.perRep[k]*((S.rep&&+S.rep[k])||0);
  const sig=signatureOf(S);r*=1+R.sig*(sig.ready?sig.strength:0);
  r*=1+R.lighting*((S.studio&&S.studio.build&&S.studio.build.lighting)||0);
  if(typeof SIM.rateMod==="function")r*=SIM.rateMod(S);   // PR 8: matching a rival's prices
  return Math.round(r*caPI(S)/R.round)*R.round;}

/* ---- skills: one curve for every source (SKILL_XP.diminish, as the session uses) ---- */
SKILL_XP.consult={accepted:0.06,walked:0.03,declined:0.03,talkWon:0.03};
SKILL_XP.convention=0.12;
SKILL_XP.skip={linework:2,shading:1.5,colour:1,speed:1.5,consult:2,styles:{traditional:2,blackwork:1,lettering:1}};
function skillGain(S,k,base){
  if(!S.skills)S.skills={styles:{}};const sk=S.skills;if(!sk.styles)sk.styles={};
  const st=/^style:(\w+)$/.exec(k),lvl=st?(+sk.styles[st[1]]||0):(+sk[k]||0);
  const g=base*(1-SKILL_XP.diminish*clamp(lvl,0,10)/10),v=Math.round(Math.min(10,lvl+g)*1000)/1000;
  if(st)sk.styles[st[1]]=v;else sk[k]=v;return g;}
/* the next element a style level opens: {level, names[]} or null */
function skillNextUnlock(style,level){
  let best=null;for(const e of SIM.ELEMENTS||[]){const m=/^style:(\w+):(\d+)$/.exec(e.unlock||"");if(!m||m[1]!==style)continue;const n=+m[2];
    if(n>Math.floor(level||0)&&(!best||n<best.level))best={level:n,names:[e.name]};else if(best&&n===best.level)best.names.push(e.name);}
  return best;}

/* ---- the signature ---- */
function caPlaceBase(id){return String(id||"").replace(/_[lr]$/,"");}
function caSigUpdate(S){
  const C=S.career,sg=C.sig;
  for(let i=sg.at;i<S.pieces.length;i++){const p=S.pieces[i];if(!p||p.by||!p.design)continue;
    const d=p.design;sg.n++;if(d.style)sg.styles[d.style]=(sg.styles[d.style]||0)+1;
    const el=caTopEl(d);if(el)sg.els[el]=(sg.els[el]||0)+1;
    const pl=caPlaceBase(d.placement);if(pl)sg.places[pl]=(sg.places[pl]||0)+1;}
  sg.at=S.pieces.length;}
function caTopEl(d){let best=null,bs=-1;for(const e of d.elements||[]){const el=SIM.elementById?SIM.elementById(e.id):null;if(!el||el.family==="fill"||el.family==="texture")continue;if((e.scale||0)>bs){bs=e.scale||0;best=e.id;}}return best;}
const caTop=o=>{let b=null,n=0,t=0;for(const k in o||{}){t+=o[k];if(o[k]>n){n=o[k];b=k;}}return{k:b,n,t};};
/* signatureOf(S) -> {ready, style, el, place, share, strength 0..1, n} */
function signatureOf(S){
  const sg=S.career&&S.career.sig;if(!sg||!sg.n)return{ready:false,style:null,el:null,place:null,share:0,strength:0,n:0};
  const st=caTop(sg.styles),el=caTop(sg.els),pl=caTop(sg.places),share=st.t?st.n/st.t:0;
  const ready=sg.n>=SIGNATURE.pieces&&share>=SIGNATURE.share;
  const strength=ready?caR3(clamp((share-SIGNATURE.share)/(1-SIGNATURE.share)*0.6+0.4,0,1)*Math.min(1,sg.n/SIGNATURE.full)):0;
  return{ready,style:st.k,el:el.k,place:pl.k,share:caR3(share),strength,n:sg.n};}
/* a walk-in who asks for "your thing" (called by market.js generateWalkins) */
function sigApply(c,sig,r){
  const A=c.ask;A.style=sig.style;A.sig=true;
  const el=sig.el&&SIM.elementById?SIM.elementById(sig.el):null;
  if(el&&el.tags&&el.tags[0]&&A.tags.indexOf(el.tags[0])<0)A.tags.unshift(el.tags[0]);
  c.wants.styles[sig.style]=1;if(c.known&&c.known.styles.indexOf(sig.style)<0)c.known.styles.push(sig.style);
  const nm=((SIM.STYLES||{})[sig.style]||{}).name||"";
  c.brief=r.pick(SIGNATURE.lines).replace("{style}",nm.toLowerCase())+" "+c.brief;
  return c;}

/* ---- Act 1: the tutorial, the mentor, chores and friends ---- */
function caFriendDone(S){const ids=S.career.friends||[];if(!ids.length)return 0;let n=0;for(const p of S.pieces)if(!p.by&&ids.indexOf(p.client)>=0)n++;return n;}
function caPaidDone(S){let n=0;for(const p of S.pieces)if(!p.by&&p.price>0&&p.stage==="apprentice"&&(S.career.friends||[]).indexOf(p.client)<0&&/^c\d/.test(p.client))n++;return n;}
/* apprenticeSteps(S) -> [{id, goal, tab, how, done}] (done steps are remembered in S.career.steps) */
function apprenticeSteps(S){
  const C=careerEnsure(S),st=caStage(S);
  const check={chore:()=>C.chores>0,practice:()=>C.practice>0,flash:()=>(S.flash||[]).length>0,friend:()=>caFriendDone(S)>0,
    walkin:()=>caPaidDone(S)>0,chair:()=>st!=="apprentice"};
  return APPRENTICE_STEPS.map(s=>{
    if(!C.steps[s.id]&&((C.skipped||C.old)&&s.id!=="chair"||check[s.id]()))C.steps[s.id]={w:S.week,y:S.year};
    return Object.assign({},s,{done:!!C.steps[s.id]});});}
function apprenticeGoal(S){const s=apprenticeSteps(S).find(x=>!x.done);return s||null;}
/* walk-ins reach an apprentice only after the friend step (market.js asks) */
function walkinsOpen(S){
  const C=S.career;if(!C)return true;
  if(C.books==="closed"||C.closed)return false;
  if(caStage(S)!=="apprentice"||C.skipped||C.old)return true;
  return !!C.steps.friend||caFriendDone(S)>0;}
function mentorLine(S,topic,sub){
  const L=MENTOR.lines;let list=L[topic];
  if(list&&!Array.isArray(list))list=list[sub]||list.high||[];
  if(!list||!list.length)return "";
  return list[hash(topic+":"+(sub||"")+":"+S.year+":"+S.week+":"+(S.seed||0))%list.length];}
function caGoodwill(S,d){const m=S.career.mentor;m.goodwill=caR3(clamp(m.goodwill+d,0,MENTOR.goodwill.max));return m.goodwill;}
/* doChore(S, id) -> {chore, line, log}: the chore's XP and goodwill, then one week passes */
function doChore(S,id){
  const C=careerEnsure(S),ch=CHORES.find(c=>c.id===id)||CHORES[0];
  for(const k in ch.xp)skillGain(S,k,ch.xp[k]);
  C.chores++;if(caStage(S)==="apprentice")caGoodwill(S,MENTOR.goodwill.chore);
  const log=advanceWeek(S);
  return{chore:ch,line:mentorLine(S,"chore"),log};}
/* friendBooking(S) -> the free sitting booked this week for a friend (Act 1), or null */
function friendBooking(S){
  const C=careerEnsure(S);if(caStage(S)!=="apprentice"||C.friends.length>=FRIENDS.max)return null;
  if(S.queue.some(q=>q.friend))return null;
  const r=rng(S.seed).fork("friend:"+C.friends.length);
  const c=makeClient(r,{id:clNextId(S),year:S.year,week:S.week,stage:"apprentice",sizes:FRIENDS.sizes,src:"friend",badIdea:false});
  c.brief=r.pick(FRIENDS.lines);c.loyalty=Math.max(c.loyalty,FRIENDS.loyalty);
  clientLog(c,{w:S.week,y:S.year,kind:"note",text:"a friend: a free piece while you apprentice"});
  S.clients.push(c);C.friends.push(c.id);
  const est=clEstimate(c.ask,c,S.skills||{});
  const item={id:queueId(S),kind:"session",client:c.id,w:S.week,y:S.year,hours:Math.max(0.5,Math.round(est.hours*4)/4),sessionNo:1,sessions:1,
    price:0,deposit:0,paid:0,ask:c.ask,design:null,booked:{w:S.week,y:S.year},moved:0,friend:true};
  S.queue.push(item);return item;}
/* the practice counter (the app calls this when a fake-skin sitting ends) */
function notePractice(S){const C=careerEnsure(S);C.practice++;if(caStage(S)==="apprentice")caGoodwill(S,MENTOR.goodwill.practice);}

/* ---- the acts ---- */
function caReach(S,st){const C=S.career;if(!C.reached[st])C.reached[st]={w:S.week,y:S.year};}
/* rentChair(S) -> {ok, early, goodwill, split}. Before week 1 of 2003 it is leaving early and costs Arkady's goodwill */
function rentChair(S){
  const C=careerEnsure(S);if(caStage(S)!=="apprentice")return{ok:false};
  const left=weekIndex(1,2000+ACTS.apprentice.years[1])-weekIndex(S.week,S.year),early=left>0,G=MENTOR.goodwill;
  caGoodwill(S,early?G.early+G.earlyPerYear*left/WEEKS_PER_YEAR:G.onTime);
  C.mentor.left={w:S.week,y:S.year,early};
  S.studio.stage="chair";caReach(S,"chair");C.steps.chair={w:S.week,y:S.year};
  C.split=C.mentor.goodwill>=MENTOR.splitAt?"mentor":"standard";
  S.rate=rateFor(S);
  return{ok:true,early,goodwill:C.mentor.goodwill,split:C.split,line:mentorLine(S,early?"early":"onTime")};}
function leaseNeed(S){
  const st=caStage(S),repSum=["walkins","collectors","peers"].reduce((a,k)=>a+((S.rep&&+S.rep[k])||0),0),cost=caRub(S,LEASE.deposit);
  return{stage:st==="chair",cash:(S.cash||0)>=cost,cost,when:S.year>=LEASE.need.year||repSum>=LEASE.need.repSum,repSum:Math.round(repSum),year:LEASE.need.year,needRep:LEASE.need.repSum};}
function leaseStudio(S){
  careerEnsure(S);const n=leaseNeed(S);if(!(n.stage&&n.cash&&n.when))return{ok:false,need:n};
  cashOut(S,n.cost,"lease");S.studio.stage="studio";S.studio.lease={w:S.week,y:S.year};caReach(S,"studio");
  S.career.insp=weekIndex(S.week,S.year)+rng(S.seed).fork("insp:first").int(INSPECTION.first[0],INSPECTION.first[1]);
  S.rate=rateFor(S);return{ok:true,cost:n.cost};}
function legacyNeed(S){return{stage:caStage(S)==="studio",when:S.year>=2000+ACTS.legacy.years[0]-2||((S.rep&&S.rep.collectors)||0)>=60};}
function goLegacy(S){careerEnsure(S);const n=legacyNeed(S);if(!(n.stage&&n.when))return{ok:false,need:n};
  S.studio.stage="legacy";caReach(S,"legacy");S.rate=rateFor(S);return{ok:true};}
/* skipBroom(S): a new career that starts at Act 2 (plan Q3): week 1 of 2003, a rented chair, basic skills */
function skipBroom(S){
  const C=careerEnsure(S),K=SKILL_XP.skip;
  S.year=2000+ACTS.apprentice.years[1];S.week=1;S.studio.stage="chair";C.skipped=true;
  for(const s of APPRENTICE_STEPS)C.steps[s.id]={w:1,y:S.year};
  C.mentor.left={w:1,y:S.year,early:false};C.split="standard";caReach(S,"chair");
  S.skills=Object.assign({},S.skills,{linework:K.linework,shading:K.shading,colour:K.colour,speed:K.speed,consult:K.consult,styles:Object.assign({},K.styles)});
  S.rep={walkins:10,collectors:5,peers:8};S.cash=caRub(S,6000);S.rate=rateFor(S);
  return S;}
/* softFail(S): the studio closes (plan Q12). Staff go, apprentices go, the lease and the build-out go; you rent a chair
   again with your clients, pieces and reputation. Sets S.career.scene for the app's full-screen scene */
function softFail(S,ctx){
  const C=careerEnsure(S),from=caStage(S),staff=S.studio.staff.map(s=>s.name),debt=Math.min(0,S.cash||0);
  for(const s of S.studio.staff)C.alumni.push({id:s.id,name:s.name,style:s.style,y:S.year,why:"let go when the shop closed",pieces:s.pieces||0});
  for(const a of C.apprentices)if(a.status==="training"){a.status="gone";a.end={w:S.week,y:S.year};a.where="found another shop when yours closed";}
  S.studio.staff=[];S.studio.build=studioFresh().build;S.studio.lease=null;S.studio.marketing=0;S.studio.rep=Math.round((S.studio.rep||0)*0.5*100)/100;
  S.studio.stage="chair";C.split="standard";C.broke=0;C.fails++;C.closed=null;C.lastFail={w:S.week,y:S.year};
  S.cash=caRub(S,BROKE.restart);
  const gw=C.mentor.goodwill>=MENTOR.loanAt?"high":"low";
  C.scene={kind:"broke",w:S.week,y:S.year,from,staff,debt,line:mentorLine(S,"broke",gw)};
  S.rate=rateFor(S);
  caLog(ctx,"event","The shop closes. You're back in a rented chair; your clients and your work come with you.");
  return C.scene;}

/* ---- the studio: build-out, vibe, marketing ---- */
function buildCost(S,key){const B=STUDIO_STAGES[key];if(!B)return null;const lv=(S.studio.build&&S.studio.build[key])||0;return lv>=B.cost.length?null:caRub(S,B.cost[lv]);}
function buildUp(S,key){
  careerEnsure(S);const st=caStage(S);if(st!=="studio"&&st!=="legacy")return{ok:false,why:"no studio"};
  const cost=buildCost(S,key);if(cost==null)return{ok:false,why:"maxed"};if((S.cash||0)<cost)return{ok:false,why:"cash",cost};
  cashOut(S,cost,"build");S.studio.build[key]=(S.studio.build[key]||0)+1;return{ok:true,cost,level:S.studio.build[key]};}
function setVibe(S,v){careerEnsure(S);if(VIBES[v])S.studio.vibe=v;return S.studio.vibe;}
function setMarketing(S,n){careerEnsure(S);S.studio.marketing=clamp(Math.round(+n||0),0,MARKETING.length-1);return S.studio.marketing;}
/* the walk-in multiplier and the extra segments the shop adds (market.js) */
function shopWalkins(S){
  const st=caStage(S),b=(S.studio&&S.studio.build)||{},out={mult:1,seg:{}};if(!S.studio)return out;
  if(st==="studio"||st==="legacy"){
    for(const k of ["waiting","flash","storefront"])out.mult+=(STUDIO_STAGES[k].walkins||0)*(b[k]||0);
    const v=VIBES[S.studio.vibe];if(v){out.mult+=v.walkins*Math.min(1,b.storefront||0);for(const s in v.seg)out.seg[s]=v.seg[s]*(0.5+0.5*(b.storefront||0));}
    out.mult+=STAFF.shopWalkins*((S.studio.rep||0)/100);}
  if(st!=="apprentice")out.mult+=(MARKETING[S.studio.marketing||0]||MARKETING[0]).walkins;
  const g=S.career&&S.career.guest;
  if(g&&weekIndex(S.week,S.year)<=g.until){const G=GUEST_SPOTS.find(x=>x.id===g.id);if(G){out.mult*=G.walkins;out.styles=G.styles;out.guest=G.id;}}
  if(typeof SIM.rivalWalkins==="function")SIM.rivalWalkins(S,out);   // PR 8: rival shops pull walk-ins away
  out.mult=Math.max(0.3,out.mult);
  return out;}

/* ---- staff ---- */
function fairCut(skill){return caR3(lerp(STAFF.cutFair[0],STAFF.cutFair[1],clamp(skill/10,0,1)));}
function caName(r){const c=makeClient(r,{id:"x0",year:2010,badIdea:false});return{name:c.name,first:c.first,pronouns:c.pronouns};}
/* staffCandidates(S) -> 3 artists looking for a chair this quarter (the same three until the quarter turns) */
function staffCandidates(S){
  const C=careerEnsure(S),q=Math.floor(weekIndex(S.week,S.year)/STAFF.refreshWeeks);
  if(C.cand&&C.cand.q===q)return C.cand.list;
  const r=rng(S.seed).fork("cand:"+q),styles=Object.keys(SIM.STYLES||{traditional:1}),list=[];
  for(let i=0;i<STAFF.candidates;i++){const nm=caName(r.fork("n"+i)),skill=caR3(r.range(STAFF.skill[0],STAFF.skill[1])),ego=caR3(r.range(STAFF.ego[0],STAFF.ego[1]));
    const style=r.weighted(styles,s=>styleDemand(s,S.year));
    list.push({cid:"k"+q+"_"+i,name:nm.name,first:nm.first,pronouns:nm.pronouns,style,skill,ego,cut:caR3(clamp(fairCut(skill)-ego*0.06+r.normal(0,0.02),0.2,0.6)),poach:caR3(r.range(STAFF.poach[0],STAFF.poach[1]))});}
  C.cand={q,list};return list;}
function staffRoom(S){const st=caStage(S);if(st!=="studio"&&st!=="legacy")return 0;return((S.studio.build&&S.studio.build.stations)||0)-S.studio.staff.length;}
function hireStaff(S,cid){
  careerEnsure(S);const cand=staffCandidates(S).find(c=>c.cid===cid);if(!cand)return{ok:false,why:"gone"};
  if(staffRoom(S)<=0)return{ok:false,why:"stations"};const fee=caRub(S,STAFF.hireFee);if((S.cash||0)<fee)return{ok:false,why:"cash",fee};
  cashOut(S,fee,"staff");const id="s"+(S.studio.nextStaff++);
  const s={id,name:cand.name,first:cand.first,pronouns:cand.pronouns,style:cand.style,skill:cand.skill,ego:cand.ego,cut:cand.cut,poach:cand.poach,
    loyalty:STAFF.loyalty.start,hired:{w:S.week,y:S.year},pieces:0,earned:0};
  S.studio.staff.push(s);S.career.cand.list=S.career.cand.list.filter(c=>c.cid!==cid);return{ok:true,staff:s,fee};}
function letGo(S,id,why){careerEnsure(S);const i=S.studio.staff.findIndex(s=>s.id===id);if(i<0)return false;const s=S.studio.staff[i];
  S.studio.staff.splice(i,1);S.career.alumni.push({id:s.id,name:s.name,style:s.style,y:S.year,why:why||"let go",pieces:s.pieces||0});return true;}
/* staffName(S, id): who did a shop piece (on staff now, or gone) */
function staffName(S,id){const s=((S.studio&&S.studio.staff)||[]).find(x=>x.id===id)||((S.career&&S.career.alumni)||[]).find(x=>x.id===id);return s?s.name:"one of your artists";}
function setStaffCut(S,id,cut){const s=(S.studio.staff||[]).find(x=>x.id===id);if(!s)return null;s.cut=caR3(clamp(cut,0.15,0.6));return s.cut;}
/* simStaffSession(staff, design, {kit, shop, r}) -> outputs like the session's {lineQuality, depthQuality, saturation, trauma,
   sessionsUsed, blowouts, joins}: from the artist's skill, the shop's kit (SIM.kitBands) and its lighting and steril room.
   No minigame; the same heal and aging rules apply to what it makes */
function simStaffSession(staff,design,opts){
  opts=opts||{};const T=STAFF.out,sk=clamp(+staff.skill||0,0,10),shop=opts.shop||{},b=shop.build||{};
  const r=opts.r||rng(hash((staff.id||"s")+":"+JSON.stringify(design||{}).length+":"+((design&&design.sizeMm)||0)));
  const kb=kitBands(opts.kit||null,{linework:sk,shading:sk,colour:sk,speed:sk},{});
  const steady=clamp(kb.paceBand/0.25,0.7,1.4),light=STUDIO_STAGES.lighting.staffLine*(b.lighting||0);
  const lineQ=clamp(T.line+T.lineSkill*sk+0.08*(steady-1)+light+r.normal(0,T.sd),0.15,0.98);
  const depthQ=clamp(T.depth+T.depthSkill*sk+0.05*(steady-1)+r.normal(0,T.sd),0.15,0.98);
  const sat=clamp((T.sat+T.satSkill*sk)*clamp(kb.sat||1,0.8,1.2)+r.normal(0,T.sd),0.15,0.98);
  const trauma=clamp((T.trauma+T.traumaSkill*sk)*kb.trauma-STUDIO_STAGES.steril.trauma*(b.steril||0)+r.normal(0,T.sd),0.03,0.97);
  const lam=Math.max(0,(1-sk/10)*T.blowSkill*((design&&design.sizeMm)||60)/80);
  let blow=0;{const L=Math.exp(-lam);let p=1;do{blow++;p*=r();}while(p>L&&blow<20);blow--;}
  const joins=r.int(0,Math.max(0,Math.round(3-sk/3)));
  return{lineQuality:caR3(lineQ),depthQuality:caR3(depthQ),saturation:caR3(sat),trauma:caR3(trauma),sessionsUsed:1,blowouts:blow,joins};}
/* one staff piece: a client off the shop's walk-in flow, a design in the artist's style, the outputs; the shop takes its cut */
function caStaffPiece(S,s,r,ctx,client){
  const st=caStage(S),sizes=WALKINS.sizes[st]||WALKINS.sizes.studio;
  const c=client||makeClient(r.fork("c"),{id:"x0",year:S.year,week:S.week,stage:st,sizes,style:s.style,badIdea:false,styleMult:{[s.style]:3}});
  const ask=Object.assign({},c.ask,{style:s.style});
  const design=clProxyDesign(ask);if(!design.elements.length)return null;
  const out=simStaffSession(s,design,{kit:S.kit,shop:S.studio,r:r.fork("out")});
  const est=clEstimate(ask,c,{}),rate=(STAFF.rate.base+STAFF.rate.perSkill*s.skill)*caPI(S);
  const price=Math.round(Math.max(1,est.hours)*rate/100)*100;
  const real=!!client;
  const who=real?client:{id:"x"+(S.pieces.length+1),first:c.first,history:[],pieces:[]};
  const p=addPiece(S,{client:who,design,out,heal:null,price});
  p.by=s.id;if(!real)p.guest={n:c.first,t:c.skinTone,a:c.traits.aftercare,s:c.traits.sun};
  p.ink=(S.kit&&S.kit.ink)||"budget";p.machine=(S.kit&&S.kit.machine)||"coil_used";
  s.pieces=(s.pieces||0)+1;const cut=Math.round(price*s.cut);s.earned=(s.earned||0)+cut;cashIn(S,cut,"staff");
  return p;}
function caStaffWeek(S,ctx){
  const r=ctx.r.fork("staff"),staff=S.studio.staff;if(!staff.length)return;
  let made=0,cuts=0;const leaving=[];
  const flow=STAFF.perWeek*(0.7+0.5*((S.studio.rep||0)/100)+0.3*(((S.rep&&S.rep.walkins)||0)/100))*mkSeason(S.week);
  for(const s of staff){
    const rs=r.fork(s.id);
    const n=Math.floor(flow)+(rs.chance(flow-Math.floor(flow))?1:0);
    for(let i=0;i<n;i++){const p=caStaffPiece(S,s,rs.fork("p"+i),ctx);if(p){made++;cuts+=Math.round(p.price*s.cut);}}
    s.skill=caR3(Math.min(10,s.skill+STAFF.grow*(1-s.skill/10)));
    const fair=s.cut<=fairCut(s.skill)+STAFF.loyalty.slack;
    s.loyalty=caR3(clamp(s.loyalty+(fair?STAFF.loyalty.fair:STAFF.loyalty.unfair*(1+s.ego)),0,1));
    const pq=STAFF.poachBase*s.poach*(1.4-s.loyalty)*(1+s.ego);
    if(rs.chance(pq))leaving.push(s);
  }
  for(const s of leaving){letGo(S,s.id,"poached by another shop");caLog(ctx,"event",s.name+" leaves for another shop. Their regulars may follow.",{staff:s.id});}
  if(made)caLog(ctx,"cost","Your artists finished "+made+(made===1?" piece":" pieces")+"; the shop's cut: "+caFmt(cuts)+".");}
const caFmt=n=>Math.round(n).toLocaleString("en-CA")+" ₽";

/* ---- apprentices (Act 4): they inherit a blend of your signature and their own leaning ---- */
function takeApprentice(S){
  const C=careerEnsure(S),st=caStage(S);if(st!=="studio"&&st!=="legacy")return{ok:false,why:"stage"};
  if(C.apprentices.some(a=>a.status==="training"))return{ok:false,why:"one"};
  const r=rng(S.seed).fork("app:"+C.apprentices.length),nm=caName(r.fork("n")),styles=Object.keys(SIM.STYLES||{traditional:1});
  const lean=r.pick(styles),sig=signatureOf(S),mine=sig.ready&&r.chance(0.35+0.5*sig.strength);
  const a={id:"a"+(C.apprentices.length+1),name:nm.name,first:nm.first,pronouns:nm.pronouns,lean,style:mine?sig.style:lean,el:mine?sig.el:null,
    skill:caR3(r.range(APPRENTICES.skill[0],APPRENTICES.skill[1])),bond:APPRENTICES.bond.start,start:{w:S.week,y:S.year},status:"training"};
  C.apprentices.push(a);return{ok:true,apprentice:a};}
function caApprenticeWeek(S,ctx){
  const C=S.career;for(const a of C.apprentices){if(a.status!=="training")continue;
    cashOut(S,caRub(S,APPRENTICES.stipend),"apprentice");
    a.skill=caR3(Math.min(10,a.skill+APPRENTICES.grow*(1-a.skill/10)));
    a.bond=caR3(clamp(a.bond+APPRENTICES.bond.week,0,1));
    if(weekIndex(S.week,S.year)-weekIndex(a.start.w,a.start.y)<APPRENTICES.weeks)continue;
    const r=ctx.r.fork("grad:"+a.id),stay=a.bond+r.normal(0,APPRENTICES.bond.sd)>=APPRENTICES.bond.staffAt&&staffRoom(S)>0;
    a.end={w:S.week,y:S.year};
    /* their first solo piece lands on a client you share: your most loyal regular on the books */
    let share=null;for(const c of S.clients)if(!c.compact&&(c.pieces||[]).length&&(!share||c.loyalty>share.loyalty))share=c;
    const s={id:"s"+(S.studio.nextStaff++),name:a.name,first:a.first,pronouns:a.pronouns,style:a.style,skill:Math.max(a.skill,3),ego:0.3,cut:fairCut(Math.max(a.skill,3)),poach:0.8,
      loyalty:0.7,hired:{w:S.week,y:S.year},pieces:0,earned:0,from:a.id};
    if(share){const p=caStaffPiece(S,s,r.fork("first"),ctx,share);if(p){a.piece=p.id;a.shared=share.id;}}
    if(stay){a.status="staff";a.where="took a station in your shop";S.studio.staff.push(s);
      caLog(ctx,"event",a.name+" finishes the apprenticeship and takes a station in your shop.",{apprentice:a.id});}
    else{a.status="rival";a.where=r.pick(APPRENTICES.rivalLines);C.rivals.push({name:a.name,style:a.style,el:a.el,from:"apprentice",y:S.year});
      caLog(ctx,"event",a.name+" finishes the apprenticeship and "+a.where+". Your style goes with them.",{apprentice:a.id});}
  }}

/* ---- invites: conventions, guest spots, the mentor's nudge, the TV offer ---- */
function caInvite(S,ctx,inv,text){const C=S.career;if(C.invites.some(i=>i.id===inv.id))return;inv.until=inv.until!=null?inv.until:weekIndex(S.week,S.year)+1;C.invites.push(inv);caLog(ctx,"event",text,{invite:inv.id});}
function caInvitesWeek(S,ctx){
  const C=S.career,now=weekIndex(S.week,S.year),st=caStage(S);
  C.invites=C.invites.filter(i=>i.until==null||i.until>=now);
  if(C.guest&&now>C.guest.until)C.guest=null;
  if(st==="apprentice"&&S.year>=2000+ACTS.apprentice.years[1]&&!C.invites.some(i=>i.kind==="chair"))
    caInvite(S,ctx,{id:"chair",kind:"chair",until:now+520},MENTOR.first+": \""+mentorLine(S,"ready")+"\"");
  if(st==="apprentice")return;
  const peers=(S.rep&&S.rep.peers)||0;
  for(const cv of CONVENTIONS){
    if(S.week!==cv.week||peers<cv.peers||C.conv.some(x=>x.id===cv.id&&x.y===S.year))continue;
    caInvite(S,ctx,{id:"conv:"+cv.id+":"+S.year,kind:"conv",conv:cv.id,fee:caRub(S,cv.fee+cv.travel)},cv.name.charAt(0).toUpperCase()+cv.name.slice(1)+" is on "+cv.where+" this week. Enter?");}
  if(!C.guest&&peers>=GUEST.peers&&!C.invites.some(i=>i.kind==="guest")&&ctx.r.fork("guest").chance(GUEST.chance)){
    const g=ctx.r.fork("guestPick").pick(GUEST_SPOTS);
    caInvite(S,ctx,{id:"guest:"+g.id+":"+now,kind:"guest",spot:g.id,fee:caRub(S,g.travel),until:now+3},"A shop in "+g.name+" offers you a guest spot for "+g.weeks+" weeks.");}
  if(st==="legacy"&&!C.offers.tv&&!C.invites.some(i=>i.kind==="tv")&&(((S.rep&&S.rep.collectors)||0)>=LEGACY_OFFERS.tv.collectors||S.year>=LEGACY_OFFERS.tv.year))
    caInvite(S,ctx,{id:"tv",kind:"tv",pay:caRub(S,LEGACY_OFFERS.tv.pay),until:now+8},"A TV channel calls: they want you for a tattoo makeover show.");
}
/* enterInvite(S, id, yes) -> {ok, kind, ...result} */
function enterInvite(S,id,yes,picks){
  const C=careerEnsure(S),i=C.invites.findIndex(x=>x.id===id);if(i<0)return{ok:false};
  const inv=C.invites[i];
  if(inv.kind==="chair"){if(!yes)return{ok:true,kind:"chair",later:true};C.invites.splice(i,1);return Object.assign({kind:"chair"},rentChair(S));}
  C.invites.splice(i,1);
  if(inv.kind==="tv"){C.offers.tv=yes?"yes":"no";const T=LEGACY_OFFERS.tv;
    if(yes){cashIn(S,inv.pay,"tv");for(const k in T.rep)repAdd(S,k,T.rep[k]);}else for(const k in T.decline)repAdd(S,k,T.decline[k]);
    return{ok:true,kind:"tv",yes,pay:yes?inv.pay:0};}
  if(!yes)return{ok:true,kind:inv.kind,yes:false};
  if(inv.kind==="guest"){const G=GUEST_SPOTS.find(g=>g.id===inv.spot);cashOut(S,inv.fee,"travel");
    C.guest={id:G.id,until:weekIndex(S.week,S.year)+G.weeks};for(const k in GUEST.rep)repAdd(S,k,GUEST.rep[k]);
    return{ok:true,kind:"guest",spot:G,fee:inv.fee};}
  if(inv.kind==="conv")return Object.assign({ok:true,kind:"conv"},typeof SIM.convJudge==="function"?SIM.convJudge(S,inv,picks):caConvention(S,inv));
  return{ok:false};}
/* a convention: judged on your best portfolio piece today, your skill, your peers and how true you are to your signature */
function caConvention(S,inv){
  const C=S.career,cv=CONVENTIONS.find(c=>c.id===inv.conv),r=rng(S.seed).fork("conv:"+inv.id),W=CONV_SCORE;
  cashOut(S,inv.fee,"convention");
  let best=null,br=0;for(let i=S.pieces.length-1;i>=0;i--){const p=S.pieces[i];if(p.by||!p.portfolio)continue;const rd=caReads(S,p);if(rd>br){br=rd;best=p;}}
  if(!best)for(let i=S.pieces.length-1;i>=0&&i>=S.pieces.length-60;i--){const p=S.pieces[i];if(p.by||!p.heal)continue;const rd=caReads(S,p);if(rd>br){br=rd;best=p;}}
  const sk=S.skills||{},avg=(["linework","shading","colour","speed"].reduce((a,k)=>a+(+sk[k]||0),0)/4)/10;
  const sig=signatureOf(S),onSig=best&&sig.ready&&best.design.style===sig.style?1:sig.ready?0.4:0.2;
  const score=W.portfolio*br+W.skill*avg+W.peers*(((S.rep&&S.rep.peers)||0)/100)+W.sig*onSig*Math.max(0.3,sig.strength)+r.normal(0,W.sd);
  const place=score>=W.places[0]?1:score>=W.places[1]?2:score>=W.places[2]?3:0;
  const prize=place?caRub(S,cv.prize[place-1]):0;if(prize)cashIn(S,prize,"convention");
  repAdd(S,"peers",W.rep.peers[place?place-1:3]);repAdd(S,"collectors",W.rep.collectors[place?place-1:3]);
  if(best&&best.design.style)skillGain(S,"style:"+best.design.style,SKILL_XP.convention);
  const rec={id:cv.id,name:cv.name,y:S.year,place,piece:best?best.id:null,score:caR3(score)};C.conv.push(rec);
  return rec;}
function caReads(S,p){const c=findClient(S,p.client),g=p.guest;
  const yrs=Math.max(0,(S.year-p.y)+(S.week-p.w)/WEEKS_PER_YEAR);
  try{return SIM.age({design:p.design,out:p.out,heal:p.heal,skinTone:c?c.skinTone:g?g.t:0.3,sun:c&&c.traits?c.traits.sun:g?g.s:0.4},yrs).readability||0;}catch(e){return 0;}}
/* Act 4 projects: book, line, conv -> {ok, why} */
function legacyAct(S,id){
  const C=careerEnsure(S),O=LEGACY_OFFERS[id];if(!O||id==="tv")return{ok:false};
  if(caStage(S)!=="legacy")return{ok:false,why:"stage"};if(C.offers[id])return{ok:false,why:"done"};
  if(id==="book"&&(S.flash||[]).length<O.needFlash)return{ok:false,why:"flash",need:O.needFlash};
  const cost=caRub(S,O.cost);if((S.cash||0)<cost)return{ok:false,why:"cash",cost};
  cashOut(S,cost,id);C.offers[id]={w:S.week,y:S.year};for(const k in O.rep||{})repAdd(S,k,O.rep[k]);
  if(id==="conv"){cashIn(S,caRub(S,O.income),"convention");C.conv.push({id:"own",name:"your own convention",y:S.year,place:0,own:true});}
  return{ok:true,cost};}

/* ---- the week (WEEK_HOOKS.costs) ---- */
function careerWeek(S,ctx){
  const C=careerEnsure(S),st=caStage(S),now=ctx.now,m=C.money;
  m.prev=m.cur;m.cur={in:{},out:{}};
  caSigUpdate(S);
  if(typeof SIM.rivalsCopy==="function"){const sg=signatureOf(S);if(sg.ready)SIM.rivalsCopy(S,sg,ctx);}   // PR 8: rivals copy your flash
  S.rate=rateFor(S);
  const out0=caSum(m.cur.out);
  /* the shop's cut of last week's takings */
  const took=((m.prev.in.sitting||0)+(m.prev.in.deposit||0));
  if(took>0&&(st==="apprentice"||st==="chair")){
    const k=st==="apprentice"?"apprentice":(C.split||"standard"),cut=Math.round(took*CHAIR_SPLIT[k]);
    cashOut(S,cut,st==="apprentice"?"mentor":"chair");}
  /* supplies for this week's booked hours (an apprentice uses the mentor's) */
  if(st!=="apprentice"){let h=0;for(const q of S.queue)if(q.kind==="session"&&weekIndex(q.w,q.y)===now)h+=q.hours||0;
    if(h)cashOut(S,caRub(S,SUPPLIES.perHour*h),"supplies");}
  if(st==="studio"||st==="legacy"){
    if(S.studio.lease)cashOut(S,caRub(S,LEASE.rentWeek+LEASE.utilities+STUDIO_STAGES.stations.upkeep*(S.studio.build.stations||0)),"rent");
    const mk=MARKETING[S.studio.marketing||0];if(mk&&mk.cost)cashOut(S,caRub(S,mk.cost),"marketing");
    if(!C.closed)caStaffWeek(S,ctx);
    if(S.studio.staff.length&&!C.closed)cashOut(S,caRub(S,SUPPLIES.shopPerHour*6*S.studio.staff.length),"supplies");
    caApprenticeWeek(S,ctx);
    S.studio.rep=Math.round((S.studio.rep||0)*(1-STAFF.shopRepDecay)*1000)/1000;
    caInspect(S,ctx);
  }
  if(st!=="apprentice"){
    const fl=(S.studio.build&&S.studio.build.flash)||0,mine=Math.min(40,(S.flash||[]).length);
    if(fl&&mine)cashIn(S,caRub(S,STUDIO_STAGES.flash.sales*fl*Math.min(1,mine/12)*(0.6+0.4*(((S.rep&&S.rep.walkins)||0)/100))),"flash");
    if(C.offers.book)cashIn(S,caRub(S,LEGACY_OFFERS.book.weekly),"book");
    if(C.offers.line)cashIn(S,caRub(S,LEGACY_OFFERS.line.weekly),"merch");
    caNoShows(S,ctx);}
  caInvitesWeek(S,ctx);
  /* the soft fail: cash under the floor for BROKE.weeks in a row closes the studio (once, Arkady may cover you) */
  if(st==="studio"||st==="legacy"){
    if((S.cash||0)<caRub(S,BROKE.floor)){C.broke++;
      if(C.broke>=BROKE.weeks){
        if(!C.mentor.loan&&C.mentor.goodwill>=MENTOR.loanAt){C.mentor.loan=true;C.broke=0;cashIn(S,caRub(S,BROKE.loan),"loan");
          caLog(ctx,"event",mentorLine(S,"loan"));}
        else softFail(S,ctx);}
      else caLog(ctx,"cost","Cash is under the floor: week "+C.broke+" of "+BROKE.weeks+" before the shop has to close.");}
    else C.broke=0;}
  else C.broke=0;
  const spent=caSum(m.cur.out)-out0,got=caSum(m.cur.in);
  if(spent||got)caLog(ctx,"cost","This week: "+(got?"in "+caFmt(got)+", ":"")+"out "+caFmt(spent)+".",{n:spent});
  if(typeof SIM.compactClients==="function"&&now%CAREER_COMPACT_EVERY===0)SIM.compactClients(S);
  if(careerOver(S)&&!C.legacySeen&&!C.scene)C.scene={kind:"legacy",w:S.week,y:S.year};
}
function caNoShows(S,ctx){
  const now=weekIndex(S.week,S.year),r=ctx.r.fork("noshow"),gone=[];
  for(const q of S.queue){if(q.kind!=="session"||weekIndex(q.w,q.y)!==now||(q.sessionNo||1)!==1||!(q.deposit>0)||q.fix||q.friend)continue;
    const c=findClient(S,q.client),p=NOSHOW.base+NOSHOW.loyal*((c&&c.loyalty)||0);
    if(r.fork(q.id).chance(p))gone.push(q);}
  for(const q of gone){S.queue=S.queue.filter(x=>x!==q);const c=findClient(S,q.client);
    if(c){loyaltyBump(c,"noShow");clientLog(c,{w:S.week,y:S.year,kind:"note",text:"didn't show for a booked sitting; the deposit stayed with you"});}
    caLog(ctx,"cost",(c?c.name:"A client")+" didn't show. The "+caFmt(q.deposit)+" deposit stays with you.",{client:q.client});}}
function caInspect(S,ctx){
  const C=S.career,now=weekIndex(S.week,S.year),I=INSPECTION;
  if(C.insp==null){C.insp=now+ctx.r.fork("insp0").int(I.first[0],I.first[1]);return;}
  if(now<C.insp)return;
  const r=ctx.r.fork("insp");C.insp=now+r.int(I.gap[0],I.gap[1]);
  let inf=0;for(let i=S.pieces.length-1;i>=0;i--){const p=S.pieces[i];if(now-weekIndex(p.w,p.y)>26)break;if(p.heal==="infected")inf++;}
  /* the checks: sterilisation (the room, recent infections) and supplies (paid for, decent ink, the bills) */
  const K=I.checks,b=S.studio.build,prevSup=C.money&&C.money.prev&&C.money.prev.out?C.money.prev.out.supplies||0:0;
  const ck={steril:b.steril||0,infected:inf,supplies:prevSup>0||!S.queue.some(q=>q.kind==="session"),ink:(S.kit&&S.kit.ink)||"budget",debt:(S.cash||0)<0,stations:(b.stations||0)>0};
  const pass=clamp(I.base+STUDIO_STAGES.steril.inspect*ck.steril+I.shopRep*(S.studio.rep||0)+I.recentInfect*inf
    +(ck.supplies?0:K.supplies)+(ck.ink==="budget"?K.budgetInk:0)+(ck.debt?K.debt:0)+(ck.stations?0:K.stations),I.min,I.max);
  const ok=r.chance(pass);C.inspLast=Object.assign({w:S.week,y:S.year,pass:ok,chance:caR3(pass)},ck);
  if(ok){S.studio.rep=Math.min(100,(S.studio.rep||0)+I.passRep);caLog(ctx,"event","A health inspector goes over the shop. Everything passes.",{insp:"pass"});return;}
  const f=caRub(S,I.fine);cashOut(S,f,"fine");S.studio.rep=Math.max(0,(S.studio.rep||0)+I.failRep);
  const why=inf?"infections on the record":!ck.steril?"no proper sterilisation room":!ck.supplies?"running short of clean supplies":ck.ink==="budget"?"cheap unlabelled ink":"the paperwork";
  C.inspFails=(C.inspFails||0)+1;C.inspLast.why=why;
  if((C.inspFails>=2&&r.chance(I.closeChance))||inf>=2||r.chance(I.closeAlways*(1-pass))){
    const wk=r.int(I.closeWeeks[0],I.closeWeeks[1]),until=now+wk,u=weekFrom(until);C.closed={until,w:S.week,y:S.year,why};C.inspLast.closed=wk;
    caLog(ctx,"event","A health inspector writes the shop up for "+why+": a "+caFmt(f)+" fine, and the shop is closed for "+wk+(wk===1?" week":" weeks")+", until week "+u.w+".",{insp:"closed"});}
  else caLog(ctx,"event","A health inspector writes the shop up for "+why+": a "+caFmt(f)+" fine."+(b.steril?"":" A sterilisation room would help."),{insp:"fail"});}

/* the shop's reputation from a staff heal (sim/heal.js calls it) */
function shopRepHeal(S,piece){
  if(!S.studio)return 0;const d=STAFF.shopRep[piece.heal]||0,cur=S.studio.rep||0;
  S.studio.rep=Math.round(clamp(cur+(d>0?d*(1-0.8*cur/100):d),0,100)*100)/100;return d;}

/* ---- the Legacy screen ---- */
function legacySummary(S){
  careerEnsure(S);
  const C=S.career,mine=S.pieces.filter(p=>!p.by),shop=S.pieces.length-mine.length;
  let oldest=null;for(const p of mine){if(!p.heal)continue;const rd=caReads(S,p);if(rd>=LEGACY.reads){oldest={piece:p.id,name:p.name,y:p.y,reads:caR3(rd)};break;}}
  const per={};for(const c of S.clients){const n=(c.pieces||[]).length;if(n)per[c.id]=n;}
  let most=null;for(const id in per)if(!most||per[id]>most.n)most={id,n:per[id]};
  if(most){const c=findClient(S,most.id);most.name=c?c.name:"a client";}
  const dec={};for(const p of mine){const d=Math.floor(p.y/10)*10;dec[d]=(dec[d]||0)+1;}
  let best=null,bs=-1;for(const p of mine){if(p.heal!=="crisp"||!p.out)continue;const o=p.out,s=0.28*o.lineQuality+0.32*o.depthQuality+0.18*o.saturation+0.22*(1-o.trauma);if(s>bs){bs=s;best=p;}}
  const won=C.conv.filter(c=>c.place===1).length;
  return{from:{w:1,y:2000},to:{w:S.week,y:S.year},years:S.year-2000+(S.week-1)/WEEKS_PER_YEAR,clients:S.clients.length,pieces:mine.length,shopPieces:shop,
    oldest,most,decades:dec,best:best?{piece:best.id,name:best.name,y:best.y,score:caR3(bs)}:null,
    conv:{entered:C.conv.filter(c=>!c.own).length,won,list:C.conv.slice(-8)},
    apprentices:C.apprentices.map(a=>({name:a.name,status:a.status,where:a.where||"still training",style:a.style})),
    staff:S.studio.staff.map(s=>({name:s.name,pieces:s.pieces||0})),alumni:C.alumni.length,
    earned:C.money.total.in,spent:C.money.total.out,cash:S.cash,fails:C.fails,mentor:C.mentor,signature:signatureOf(S),
    rep:Object.assign({},S.rep),shopRep:S.studio.rep||0,tv:C.offers.tv||null};}
const SHARE_CARD=null;   // PR 9: the Legacy screen's share card

WEEK_HOOKS.costs=careerWeek;
SIM.ACTS=ACTS;SIM.MENTOR=MENTOR;SIM.APPRENTICE_STEPS=APPRENTICE_STEPS;SIM.CHORES=CHORES;SIM.FRIENDS=FRIENDS;SIM.CHAIR_SPLIT=CHAIR_SPLIT;
SIM.RATE_BY_REP=RATE_BY_REP;SIM.SUPPLIES=SUPPLIES;SIM.LEASE=LEASE;SIM.MARKETING=MARKETING;SIM.STUDIO_STAGES=STUDIO_STAGES;SIM.VIBES=VIBES;
SIM.STAFF=STAFF;SIM.NOSHOW=NOSHOW;SIM.INSPECTION=INSPECTION;SIM.BROKE=BROKE;SIM.SIGNATURE=SIGNATURE;SIM.SKILLS=SKILLS;
SIM.CONVENTIONS=CONVENTIONS;SIM.CONV_SCORE=CONV_SCORE;SIM.GUEST_SPOTS=GUEST_SPOTS;SIM.GUEST=GUEST;SIM.LEGACY_OFFERS=LEGACY_OFFERS;
SIM.APPRENTICES=APPRENTICES;SIM.LEGACY=LEGACY;SIM.SHARE_CARD=SHARE_CARD;
SIM.careerFresh=careerFresh;SIM.studioFresh=studioFresh;SIM.careerEnsure=careerEnsure;SIM.cashIn=cashIn;SIM.cashOut=cashOut;SIM.rateFor=rateFor;
SIM.skillGain=skillGain;SIM.skillNextUnlock=skillNextUnlock;SIM.signatureOf=signatureOf;SIM.sigApply=sigApply;
SIM.apprenticeSteps=apprenticeSteps;SIM.apprenticeGoal=apprenticeGoal;SIM.walkinsOpen=walkinsOpen;SIM.mentorLine=mentorLine;
SIM.doChore=doChore;SIM.friendBooking=friendBooking;SIM.notePractice=notePractice;SIM.rentChair=rentChair;SIM.leaseNeed=leaseNeed;
SIM.leaseStudio=leaseStudio;SIM.legacyNeed=legacyNeed;SIM.goLegacy=goLegacy;SIM.skipBroom=skipBroom;SIM.softFail=softFail;
SIM.buildCost=buildCost;SIM.buildUp=buildUp;SIM.setVibe=setVibe;SIM.setMarketing=setMarketing;SIM.shopWalkins=shopWalkins;
SIM.fairCut=fairCut;SIM.staffCandidates=staffCandidates;SIM.staffRoom=staffRoom;SIM.hireStaff=hireStaff;SIM.letGo=letGo;SIM.setStaffCut=setStaffCut;
SIM.simStaffSession=simStaffSession;SIM.takeApprentice=takeApprentice;SIM.enterInvite=enterInvite;SIM.legacyAct=legacyAct;
SIM.shopRepHeal=shopRepHeal;SIM.staffName=staffName;SIM.legacySummary=legacySummary;SIM.careerWeek=careerWeek;SIM.pieceReads=caReads;
