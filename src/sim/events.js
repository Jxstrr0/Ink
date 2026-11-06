/* ===== sim/events.js: events, trends, rivals, social media, reckonings, cover-ups, conventions and goals (PR 8) =====
   Tables (every tuning number lives here; rubles are 2000 rubles x SIM.priceIndex(year)):
     TREND_WAVES   named fashion waves: a bump on one style's demand between rise and fall (peak in the middle).
                   SIM.trendMult(style, year) multiplies STYLES[*].demandCurve in clients.js styleDemand, so walk-ins follow it
     SOCIAL        social media from 2016 (plan Q2): posting a healed piece, reach, followers, far-away bookings, the one
                   viral piece a career can have, clients posting bad heals, and how followers stay in step with reputation
     RIVALS, RIVAL named shops in Mostograd (all invented) that open nearby, undercut, poach staff and copy your flash
     RECKONINGS    scripted beats that fire once per career (plan Q13): your first-year piece walks back in aged, the client
                   who bad-mouthed a patchy heal, Arkady's referral in Act 3, the pawn shop on the canal (a Lombard nod, Q16)
     COVER_PUZZLE  cover-up jobs that arrive as events with someone else's dark old piece to design around
     COVER_SCORE   how coverScore reads a design laid over an old piece
     CONV_JUDGE    conventions: fresh-work and healed-work categories, booth sales, collectors, rivals' booths
     GOALS         the career's goals (S.goals: id -> {w, y}); checkGoals marks them
     EVENTS        the event sheets: how long a choice waits, and every line they say
     REP_EVENTS    the reputation events REP_TRACKS names (0.1.13.0): flash days, the Friday 13th special, a feature in
                   Kontur (an invented Mostograd magazine) and the Drawbridge Prize (the Guild's yearly award, healed work)
   S.world (worldFresh): {fired {reckoning id: {w, y, ...}}, plan {first_year: week index}, pending [events waiting for a
   choice], nextEv, mods {rate: {mult, until}, fresh: until}, social {on {w,y} | null, followers, posts [[piece no, week
   index, reach]], viral {piece, w, y} | null, booked, bad, gained}, repEv (REP_EVENTS' history, below)}. Rivals live in S.career.rivals; a closed shop in
   S.career.closed {until, w, y} (sim/career.js, the inspection).
   Functions: SIM.worldFresh, SIM.worldEnsure(S), SIM.trendMult(style, year), SIM.trendNow(S), SIM.postPiece(S, pieceId),
   SIM.canPost(S, piece), SIM.followersTarget(S), SIM.eventChoose(S, id, choice), SIM.reckoningChoose(S, itemId, choice),
   SIM.onReturn(item, S), SIM.rivalsCopy(S, sig, ctx), SIM.rivalWalkins(S, out), SIM.coverOld(S, item),
   SIM.coverScore(design, old, box), SIM.convCandidates(S), SIM.checkGoals(S, slow), SIM.goalList(S),
   SIM.friday13Weeks(year), SIM.awardJudge(S, r), SIM.repEventAt(id).
   WEEK_HOOKS.events = evWeek (closure, expired choices, social, rivals, reckonings, reputation events, cover-ups, goals) and
   WEEK_HOOKS.trend = evTrend (a k:"trend" line when a wave starts, peaks or fades). Every draw is forked from the
   week's rng (ctx.r) or rng(S.seed), so the same save always plays out the same way. Private helpers start with ev. ===== */

/* fashion waves: amp is the extra demand at the peak (negative = a backlash). Lines go in the Next log */
const TREND_WAVES=[
  {id:"script_ribs",style:"lettering",name:"script on the ribs",rise:2006,peak:2009,fall:2013,amp:0.3,
    lines:{rise:"Script is catching on: people want a line of lettering down the ribs.",peak:"Every second walk-in wants script this year.",fall:"The script craze is cooling off."}},
  {id:"old_school",style:"traditional",name:"the old-school revival",rise:2008,peak:2011,fall:2015,amp:0.15,
    lines:{rise:"Bold lines and five colours are back. Old-school flash sells again.",peak:"Traditional is having its moment. Arkady's wall would empty today.",fall:"The old-school crowd settles back to the regulars."}},
  {id:"portraits",style:"realism",name:"portraits",rise:2010,peak:2013,fall:2017,amp:0.2,
    lines:{rise:"People bring photographs now: pets, grandparents, faces.",peak:"Portrait work is everywhere this year.",fall:"Fewer people are asking for portraits."}},
  {id:"watercolour",style:"watercolour",name:"the watercolour craze",rise:2011,peak:2014,fall:2017,amp:0.4,
    lines:{rise:"Soft colour with no outlines: watercolour is starting to show up on the embankment.",peak:"Watercolour is everywhere. Everyone wants a splash with no lines.",fall:"The first watercolour pieces are blurring, and people have noticed."}},
  {id:"watercolour_backlash",style:"watercolour",name:"the watercolour backlash",rise:2017,peak:2020,fall:2025,amp:-0.3,
    lines:{rise:"Clients ask if watercolour lasts. Some come in to have theirs outlined.",peak:"Hardly anyone asks for watercolour now.",fall:"Watercolour is quietly coming back, with outlines this time."}},
  {id:"dotwork",style:"geometric",name:"dotwork and sacred geometry",rise:2012,peak:2016,fall:2020,amp:0.3,
    lines:{rise:"Dotwork mandalas and clean geometry are turning up in people's phones.",peak:"Geometric work is booked out across the city.",fall:"The geometry wave is settling down."}},
  {id:"fineline",style:"fineline",name:"the fine-line boom",rise:2013,peak:2017,fall:2023,amp:0.4,
    lines:{rise:"Tiny, delicate pieces: fine line is catching on with first-timers.",peak:"The fine-line boom: single-needle work is all anyone shows you on their phone.",fall:"Fine line is cooling. People are asking how it will age."}},
  {id:"neotrad",style:"neotrad",name:"neo-traditional",rise:2014,peak:2018,fall:2022,amp:0.2,
    lines:{rise:"Neo-trad is picking up: old-school lines with more colour and detail.",peak:"Neo-traditional is big this year.",fall:"Neo-trad settles into the regular mix."}},
  {id:"blackout",style:"blackwork",name:"heavy blackwork",rise:2017,peak:2021,fall:2026,amp:0.25,
    lines:{rise:"Big solid black is starting to show up: bands, blackout sleeves.",peak:"Heavy blackwork is the thing this year.",fall:"The heavy blackwork wave is easing off."}},
  {id:"japanese",style:"japanese",name:"big Japanese work",rise:2022,peak:2026,fall:2030,amp:0.2,
    lines:{rise:"Collectors are asking for big Japanese pieces again: backs, full sleeves.",peak:"Japanese backpieces are booked a year out in every good shop.",fall:"The Japanese wave is levelling off."}},
  {id:"trad_again",style:"traditional",name:"traditional comes round again",rise:2021,peak:2025,fall:2030,amp:0.15,
    lines:{rise:"Traditional is coming round again. It always does.",peak:"Bold old-school work is popular again.",fall:"Traditional settles back where it always sits."}}
];
/* social media (plan Q2: from 2016). Followers are the public face of reputation: they drift toward followersTarget(S)
   (perRep x reputation sum squared / 10) each week, and followers gained from posts feed walk-ins and collectors back */
const SOCIAL={
  from:2016,
  start:{perRep:3,min:40},                  // followersTarget = perRep x (walkins + collectors + peers)^2 / 10, at least min
  drift:0.01,                               // the weekly pull toward the target
  reach:{base:60,score:900,follow:0.08,sd:0.3,heal:{crisp:1,soft:0.75,patchy:0.25,blownout:0.1,infected:0.05}},
  follow:0.03,                              // share of a post's reach that follows you
  toRep:{per:1000,walkins:0.6,collectors:0.25},   // reputation per 1,000 followers gained from posts
  bookings:{per:40000,max:0.35},             // weekly chance of a far-away booking: followers / per, at most max
  viral:{minQ:0.62,minFollowers:250,chance:0.12,mult:25,rep:{walkins:8,collectors:4,peers:1}},
  bad:{chance:{patchy:0.2,blownout:0.4,infected:0.6},lose:0.04,rep:{walkins:-1.5,peers:-0.5}},
  postsCap:2000,
  far:["the capital","the Baltic coast","a port town up north","abroad, a night flight away","a city down the river"],
  lines:{
    start:"Everyone has a camera in their pocket now. You start posting healed work for the shop.",
    far:["I've followed your account for a year. I'm coming in from {far} for this.","I saw a piece of yours online and booked the train from {far} the same night.","Your healed work is all over my feed. I'll travel from {far}, just tell me when."],
    bad:["{first} posts a photo of the {grade} heal on {pos} {label}. The comments aren't kind.","A photo of {first}'s {label} goes round online: {grade}, with your shop tagged."],
    viral:"Your post of {name} goes everywhere. Strangers share it, other artists argue about it, and your phone doesn't stop."}
};
/* rival shops: invented names on Lombard's streets; they open in their window whatever you do */
const RIVALS=[
  {id:"seventh",name:"Seventh Bridge Tattoo",where:"by the Old Bridge",style:"traditional",tactic:"poach",open:[2007,2010],pull:0.1,
    says:"a big street shop with six chairs and a neon sign"},
  {id:"heron",name:"the Grey Heron",where:"on Lodochnaya Embankment",style:"fineline",tactic:"undercut",open:[2011,2014],pull:0.08,
    says:"a bright little fine-line studio with plants in the window"},
  {id:"nochnoy",name:"Atelier Nochnoy",where:"on Kanatnaya Street",style:"realism",tactic:"copy",open:[2014,2018],pull:0.06,
    says:"an appointment-only studio that keeps its blinds down"},
  {id:"konveyer",name:"Konveyer",where:"on the outer ring",style:"lettering",tactic:"undercut",open:[2016,2020],pull:0.12,
    says:"a cheap walk-in place that does twenty small pieces a day"}
];
const RIVAL={
  openChance:0.04,stylePull:0.3,
  str:{start:0.5,grow:0.002,press:0.006,min:0.05,closeAt:0.12,closeAfter:104},   // strength drifts down once your rep sum passes close.repSum
  close:{repSum:160},
  act:{undercut:0.012,poach:0.008,copy:0.03},cool:26,   // weekly chances x strength x 2 x (1 + grudge); a rival waits cool weeks between moves
  undercut:{match:0.9,weeks:12,hold:{walkins:-1.5},truce:52},
  poach:{cut:0.05,loyalty:0.25},
  copy:{call:{peers:1,low:-0.5},let:{walkins:-0.8},fresh:{collectors:1,xp:0.05}},
  respect:{at:0.3,chance:0.01},
  apprentice:{str:0.4,mem:0.2}
};
/* reckonings: once per career each (S.world.fired) */
const RECKONINGS={
  first_year:{years:[12,18],plan:[12,15],wait:4,
    brief:["Do you remember me? You did the {label} on my {place} in {year}, {when}. {yrs} years. Look at it now.",
      "It's {first}. The {label} on my {place}, {year}: one of your first. It's been on me {yrs} years. What do we do with it?"],
    choices:{rework:{label:"Rework it, free",says:"You go over every line you laid down {yrs} years ago. It's still your hand, just a better one now."},
      cover:{label:"Cover it",says:"You talk it through: something bigger and darker over the top. A paid job, booked properly."},
      leave:{label:"Leave it as it is",says:"You both look at it for a while. {first} decides it stays: it's part of the story."}},
    rep:{rework:{peers:1.5},leave:{collectors:0.5}},loyalty:{rework:0.2,cover:0.05,leave:0.05}},
  bad_mouth:{repSum:150,collectors:50,stars:2,wait:4,
    brief:["I'm the one who told everyone at work my {label} healed patchy. I said worse than that. Now everyone says you're the best in Mostograd. Can you fix it?",
      "You probably remember my review. The {label} from {year}. I was angry. People keep telling me to come back to you, so here I am."],
    choices:{fix:{label:"Fix it, free",says:"You fix it properly and don't mention the review. {first} does, twice."},
      charge:{label:"Book it at your rate",says:"Fair is fair: a proper touch-up at your normal rate."},
      refuse:{label:"Turn them away",says:"You tell {first} to find another shop. It feels good for about an hour."}},
    rep:{fix:{walkins:1,peers:0.5},refuse:{walkins:-0.5}},loyalty:{fix:0.3,charge:0.05}},
  mentor_ref:{weeks:8,high:0.45,wait:3,
    high:"Arkady Lvovich sent me. He said you're the only one in the city he'd let near my back.",
    low:"Arkady did my panther thirty years ago. He's put his machines away; he says it's your hands now.",
    line:{high:"Arkady calls: \"I'm sending you someone. Don't make me look bad.\"",low:"Arkady sends an old client of his your way, without a word to you."}},
  pawn:{from:2010,pay:{coil_used:1200,coil:3000,rotary:5500,pen:11000},
    text:"The pawn shop on the canal will take your old {machine}. The man behind the counter says he'll give a fair price for it.",
    choices:{sell:{label:"Sell it at the pawn shop",says:"The pawnbroker turns it over twice, names a price and doesn't haggle. {pay} in your pocket."},
      keep:{label:"Keep it on the shelf",says:"It goes on the shelf above your station. Some things you keep."}}}
};
/* cover-up jobs: someone else's old piece, pre-placed on the board as a locked dark layer */
const COVER_PUZZLE={peers:18,chance:0.018,size:[30,90],wait:3,
  lines:["I've got a {foreign} on my {place}, from {year}, {where}. Everyone says you're the one for cover-ups.","There's a {foreign} on my {place}. {Where}, {year}. I've hidden it for years. I'm done hiding it."]};
/* how a design covers an old piece: points on the old ink count as covered by dark, filled work over them */
const COVER_SCORE={grid:14,oldK:0.85,newK:0.72,   // ellipse sizes: an element fills about this share of its box
  family:{fill:0.95,texture:0.85},lineOnly:0.35,fillW:0.6,need:0.75,good:0.85,ok:0.6,
  rep:{good:0.5,bad:-0.5},loyalty:0.3};
/* conventions (PR 7 CONVENTIONS + this): a fresh piece and a healed piece, judged separately */
const CONV_JUDGE={
  freshWeeks:16,healedYears:1,list:12,
  fresh:{design:0.5,outputs:0.3,skill:0.1,sig:0.1},
  healed:{reads:0.45,heal:0.25,years:0.15,sig:0.15},
  heal:{crisp:1,soft:0.7,patchy:0.3,blownout:0.1,infected:0},
  sd:0.06,places:[0.72,0.62,0.52],prizeShare:0.6,
  booth:{perSheet:120,min:3,attendance:{mostograd_fair:1,capital_expo:1.8,baltic_show:1.3}},
  collector:{chance:0.35,perPlace:0.15}
};
/* the career's goals; checks marked slow run on a year boundary or every 13 weeks */
const GOALS=[
  {id:"first_heal",name:"First clean heal",says:"a piece of yours heals crisp"},
  {id:"first_custom",name:"First custom piece",says:"a paid piece you designed yourself, not flash"},
  {id:"first_return",name:"First return client",says:"someone comes back for more work"},
  {id:"first_award",name:"First convention award",says:"place at a convention"},
  {id:"studio",name:"Open the studio",says:"lease your own shop"},
  {id:"hire",name:"Hire an artist",says:"put someone on a station in your shop"},
  {id:"five_pieces",name:"A client with five of your pieces",says:"one person wears five pieces of yours"},
  {id:"survive_rival",name:"Survive a rival",says:"outlast a rival shop: it closes, or three years pass without losing yours"},
  {id:"twenty_reads",name:"Twenty years and it still reads",says:"a piece of yours twenty years old that still reads",slow:true},
  {id:"apprentice_shop",name:"An apprentice opens a shop",says:"someone you trained goes out on their own"},
  {id:"drawbridge",name:"Win the Drawbridge Prize",says:"take first place at the Mostograd Tattoo Guild's yearly prize"}   // 0.1.13.1: REP_EVENTS.award
];
const EVENTS={wait:3,
  undercut:{text:"{rival} {where} has dropped its prices well under yours. Walk-ins are noticing.",
    choices:[["match","Match their prices for a while"],["hold","Hold your price"],["talk","Go round and talk to them"]],dflt:"hold",
    says:{match:"You drop your rate for a few months. The walk-ins stay; the margins don't.",hold:"Some walk-ins go to {rival} for the price. Your regulars don't.",
      truce:"Over tea in their back room you agree not to cut each other's throats. For a year, anyway.",snub:"They laugh you out of the shop. They'll remember you tried."}},
  poach:{text:"{rival} has offered {staff} a station and a better cut.",
    choices:[["let","Wish them well"],["match","Take a smaller cut to keep them"],["talk","Talk to them"]],dflt:"let",
    says:{let:"{staff} packs up their station. Some of their regulars follow them to {rival}.",match:"You take a smaller cut. {staff} stays, and knows what it cost you.",
      stay:"You talk late into the evening. {staff} stays.",go:"{staff} hears you out, then goes anyway.",gone:"{staff} had already gone."}},
  copy:{text:"Your {style} flash is on {rival}'s wall, nearly line for line.",
    choices:[["call","Call them out"],["let","Let it go"],["fresh","Draw new flash and move on"]],dflt:"let",
    says:{call:"Word gets round. Other artists know whose work it really is.",callLow:"You call them out, but your own style isn't known enough yet. It looks like sour grapes.",
      let:"You let it go. A few walk-ins get your designs cheaper across town.",fresh:"You draw a new sheet over a week of evenings. It's better than the old one."}},
  rivalOpen:"A new shop opens {where}: {rival}, {says}.",
  rivalGone:"{rival} {where} closes its doors. Some of their regulars find their way to you.",
  rivalRespect:"{rival} sends someone over: \"They want a cover-up. We don't do those. You do.\"",
  closed:"The shop is closed until week {w}, {y}. Bookings move, walk-ins go elsewhere.",
  reopen:"The shop reopens after the inspection. The autoclave log is spotless now.",
  moved:"The shop is closed: {n} booked {sittings} moved to week {w}.",
  reckoning:{first_year:"{first} is booked in: one of your first clients, with the {label} from {year}.",
    bad_mouth:"{first} is booked in about the {label} from {year}. The one with the bad review.",
    mentor_ref:"{line}"},
  puzzle:"A cover-up job is booked in: {first} wants the {foreign} on {pos} {place} gone.",
  goal:"Goal reached: {name}."
};

/* the reputation events REP_TRACKS names (0.1.13.0): each opens at its track's REP_TRACKS[track].events[id] number and
   arrives as a choice card (S.world.pending, like a rival's move). Rubles are 2000 rubles x SIM.priceIndex(year).
     flash_day   a day of small, cheap pieces off your own flash wall: many quick sittings, walk-ins and peers notice
     friday_13   the old Friday-the-13th flash special, only in a week that really holds a Friday the 13th (calendar
                 weeks are days 1-7, 8-14, ... of the year, so the date is exact; week 52 runs to 30 or 31 December)
     magazine    Kontur, Mostograd's tattoo quarterly (invented; "outline"), features you once your collectors and portfolio are there
     award       the Drawbridge Prize, the Mostograd Tattoo Guild's yearly award, judged on your best healed pieces
   S.world.repEv (worldFresh): {flash_day {last, n, sittings}, friday_13 {last, n, sittings}, magazine [{w, y, at (week index), piece, yes}],
   award [{y, place, score, pieces [ids]}]}; last is the week index the card was last offered */
const REP_EVENTS={
  flash_day:{track:"walkins",head:"Flash day",minFlash:3,chance:0.05,cool:26,wait:3,
    sittings:{base:6,perRep:0.08,spread:3},price:1500,supplies:250,rep:{walkins:2.5,peers:0.8},own:{walkins:1,full:12},xp:{speed:0.06,linework:0.04},
    text:"The shop next door says a flash day pulled a queue round the block. You've got {sheets} sheets of your own on the wall: small pieces, first come, first served, one fixed price.",
    choices:[["run","Run a flash day"],["skip","Not this time"]],dflt:"skip",
    says:{run:"Ten till close, one small piece after another: {n} of them off your wall, {top} the favourite. {pay} in the till after supplies. Artists from two other shops dropped by to watch.",
      skip:"You keep the week as it is. Booked clients only."}},
  friday_13:{track:"walkins",head:"Friday the 13th",wait:1,
    sittings:{base:10,perRep:0.12,spread:4},price:1300,supplies:200,rep:{walkins:3,peers:0.3},xp:{speed:0.08},
    text:"Friday the 13th falls this week ({date}). The old trick: small flash at a lucky price, the door open till the last one in the queue.",
    choices:[["run","Run the Friday 13th special"],["skip","Keep a normal week"]],dflt:"skip",
    says:{run:"The queue starts before you've unlocked the door. {n} small pieces by midnight, thirteens and black cats mostly. {pay} after supplies, and half the embankment knows your name.",
      skip:"You let the date pass. Somebody else's shop has the queue this year."}},
  magazine:{track:"collectors",head:"Kontur magazine",name:"Kontur",portfolio:4,chance:0.04,cool:260,max:3,wait:4,
    rep:{yes:{collectors:4,walkins:2,peers:1},no:{peers:0.3}},
    text:"Kontur, the city's tattoo quarterly, wants to feature you: an interview in the shop and a photographer for your healed portfolio. They'd lead with {piece}.",
    choices:[["yes","Do the interview"],["no","Turn it down"]],dflt:"no",
    says:{yes:"The issue comes out with {piece} across two pages and you squinting at the camera on Kanatnaya Street. Collectors start quoting it at you.",
      no:"You tell them you'd rather the work did the talking. A few artists hear about it and approve."},
    met:"I read about you in Kontur. I've kept the page."},
  award:{track:"peers",head:"The Drawbridge Prize",name:"the Drawbridge Prize",by:"the Mostograd Tattoo Guild",week:48,pieces:3,minPieces:2,wait:2,
    score:{healed:1,sig:0.1},sd:0.05,places:[0.66,0.58,0.5],prize:[30000,15000,7000],
    rep:{peers:[3,2,1,0.3],collectors:[2.5,1.5,0.8,0]},
    text:"The Mostograd Tattoo Guild has put you up for the Drawbridge Prize. The judges look at healed work only: three pieces, a year old or more.",
    choices:[["enter","Send your best healed pieces"],["pass","Not this year"]],dflt:"enter",
    says:{won:"{place} at the Drawbridge Prize, for {pieces}. {prize} and a brass plaque for the wall.",none:"No placing this year. The judges liked {pieces}, but the winners' work had more years on it.",
      pass:"You let the nomination go. The Guild will ask again."}}
};
const REP_EV_PLACE=["","First place","Second place","Third place"];
const REP_EV_MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];

/* ---- the state's world field (also used by app/state.js freshState through SIM.worldFresh) ---- */
function worldFresh(){return{fired:{},plan:{},pending:[],nextEv:1,mods:{},
  social:{on:null,followers:0,posts:[],viral:null,booked:0,bad:0,gained:0},
  repEv:{flash_day:{last:null,n:0,sittings:0},friday_13:{last:null,n:0,sittings:0},magazine:[],award:[]}};}
function worldEnsure(S){
  if(!S.world||typeof S.world!=="object"||Array.isArray(S.world))S.world=worldFresh();else caFill(S.world,worldFresh());
  if(!Array.isArray(S.world.pending))S.world.pending=[];
  if(!Array.isArray(S.world.social.posts))S.world.social.posts=[];
  const RE=S.world.repEv;if(!RE||typeof RE!=="object"||Array.isArray(RE))S.world.repEv=worldFresh().repEv;   // 0.1.13.0: older saves get it here
  else{for(const k of ["magazine","award"])if(!Array.isArray(RE[k]))RE[k]=[];
    for(const k of ["flash_day","friday_13"])if(!RE[k]||typeof RE[k]!=="object"||Array.isArray(RE[k]))RE[k]={last:null,n:0,sittings:0};}
  if(!S.goals||typeof S.goals!=="object"||Array.isArray(S.goals))S.goals={};
  careerEnsure(S);evRivalsFix(S);
  return S.world;}
const evNow=S=>weekIndex(S.week,S.year);
const evRub=(S,v)=>Math.round(v*SIM.priceIndex(S.year)/10)*10;
const evFmt=n=>Math.round(n).toLocaleString("en-CA")+" ₽";
const evCap=s=>{s=String(s||"");return s.charAt(0).toUpperCase()+s.slice(1);};
function evFill(t,o){return evCap(clSlotFill(String(t||""),o||{}));}
const evRepSum=S=>["walkins","collectors","peers"].reduce((a,k)=>a+((S.rep&&+S.rep[k])||0),0);
const evStart=S=>S.career&&S.career.skipped?2000+ACTS.apprentice.years[1]:2000;
function evLog(ctx,k,text,extra){if(ctx&&ctx.log)ctx.log.push(Object.assign({k,text},extra||{}));}
function evPending(S,cid){for(const q of S.queue)if((q.kind==="consult"||q.kind==="session")&&q.client===cid)return true;return false;}
const evPos=c=>(PRONOUN_WORDS[(c&&c.pronouns)||"she/her"]||{pos:"their"}).pos;

/* ===================== trends ===================== */
const EV_WAVES={};for(const w of TREND_WAVES)(EV_WAVES[w.style]=EV_WAVES[w.style]||[]).push(w);
function evWave(w,year){if(year<=w.rise||year>=w.fall)return 0;return year<=w.peak?(year-w.rise)/((w.peak-w.rise)||1):(w.fall-year)/((w.fall-w.peak)||1);}
/* trendMult(style, year): 1 + the waves on that style (never below 0.2) */
function trendMult(style,year){const L=EV_WAVES[style];if(!L)return 1;let m=1;for(const w of L)m+=w.amp*evWave(w,year);return Math.max(0.2,Math.round(m*1000)/1000);}
/* trendNow(S) -> {top: [{style, name, demand, dir: "up"|"down"|"flat"}] (the 4 most wanted), waves: [{name, style, phase}]} */
function trendNow(S){
  const y=S.year+(S.week-1)/WEEKS_PER_YEAR,st=SIM.STYLES||{};
  const top=Object.keys(st).map(k=>{const d=styleDemand(k,y),d0=styleDemand(k,y-1);return{style:k,name:st[k].name,demand:Math.round(d*100)/100,dir:d>d0*1.04?"up":d<d0*0.96?"down":"flat"};})
    .sort((a,b)=>b.demand-a.demand).slice(0,4);
  const waves=TREND_WAVES.filter(w=>evWave(w,y)>0.15).map(w=>({id:w.id,name:w.name,style:w.style,phase:y<w.peak-0.5?"rising":y<=w.peak+0.5?"peak":"fading",amp:w.amp}));
  return{top,waves};}
/* WEEK_HOOKS.trend: on a year boundary, a line for every wave that starts, peaks or turns */
function evTrend(S,ctx){
  if(!ctx.yearRolled)return;
  for(const w of TREND_WAVES){const k=S.year===w.rise?"rise":S.year===w.peak?"peak":S.year===w.fall?"fall":null;
    if(k)evLog(ctx,"trend",w.lines[k],{wave:w.id,style:w.style,phase:k});}}

/* ===================== social media ===================== */
function followersTarget(S){return Math.max(SOCIAL.start.min,Math.round(SOCIAL.start.perRep*Math.pow(evRepSum(S),2)/10));}
function evPostIndex(W){const m={};for(const p of W.social.posts)m[p[0]]=p;return m;}
const evPid=id=>+String(id).slice(1);
/* canPost(S, piece) -> null if it can be posted, else why */
function canPost(S,p){
  const W=worldEnsure(S);if(S.year<SOCIAL.from||!W.social.on)return "year";
  if(!p||p.by)return "shop";if(!p.heal)return "healing";
  if(W.social.posts.some(x=>x[0]===evPid(p.id)))return "posted";
  return null;}
/* the quality a post is judged on: half the design's total score for its client, half how it reads today */
function evPieceQ(S,p){
  const c=findClient(S,p.client);let tot=0.6;
  try{if(c&&c.wants)tot=scoreDesign(p.design,c,S.skills||{},{year:p.y}).total;}catch(e){}
  return clamp(0.5*tot+0.5*caReads(S,p),0,1);}
/* postPiece(S, pieceId) -> {ok, why?, reach, gained, followers, viral, q} */
function postPiece(S,id){
  const W=worldEnsure(S),p=S.pieces.find(x=>x.id===id),why=canPost(S,p);if(why)return{ok:false,why};
  const R=SOCIAL.reach,so=W.social,r=rng(S.seed).fork("post:"+id),q=evPieceQ(S,p);
  let reach=(R.base+R.score*q*q)*(R.heal[p.heal]!=null?R.heal[p.heal]:0.5)*(1+R.follow*Math.sqrt(so.followers))*Math.exp(r.normal(0,R.sd));
  let viral=false;const V=SOCIAL.viral;
  if(!so.viral&&q>=V.minQ&&p.heal==="crisp"&&so.followers>=V.minFollowers&&r.chance(V.chance)){viral=true;reach*=V.mult;so.viral={piece:p.id,w:S.week,y:S.year};
    for(const k in V.rep)repAdd(S,k,V.rep[k]);}
  reach=Math.round(reach);const gained=Math.round(reach*SOCIAL.follow);
  so.followers+=gained;so.gained+=gained;
  so.posts.push([evPid(p.id),evNow(S),reach]);if(so.posts.length>SOCIAL.postsCap)so.posts.splice(0,so.posts.length-SOCIAL.postsCap);
  const T=SOCIAL.toRep;repAdd(S,"walkins",gained/T.per*T.walkins);repAdd(S,"collectors",gained/T.per*T.collectors*q);
  return{ok:true,reach,gained,followers:so.followers,viral,q:Math.round(q*1000)/1000,text:viral?evFill(SOCIAL.lines.viral,{name:p.name}):null};}
function evSocialWeek(S,ctx){
  const W=S.world,so=W.social,now=ctx.now;
  if(S.year<SOCIAL.from)return;
  if(!so.on){so.on={w:S.week,y:S.year};so.followers=Math.max(so.followers,followersTarget(S));evLog(ctx,"event",SOCIAL.lines.start,{social:"start"});return;}
  so.followers=Math.max(0,Math.round(so.followers+(followersTarget(S)-so.followers)*SOCIAL.drift));
  /* clients post their bad heals (the heals hook ran earlier this week) */
  const B=SOCIAL.bad,rb=ctx.r.fork("badpost");
  for(let i=S.pieces.length-1;i>=0;i--){const p=S.pieces[i];if(now-weekIndex(p.w,p.y)>WEEK.healWeeks+1)break;
    if(p.by||!p.heal||p.healW!==S.week||p.healY!==S.year||!B.chance[p.heal])continue;
    if(!rb.fork(p.id).chance(B.chance[p.heal]))continue;
    const c=findClient(S,p.client);so.followers=Math.round(so.followers*(1-B.lose));so.bad++;for(const k in B.rep)repAdd(S,k,B.rep[k]);
    evLog(ctx,"event",evFill(rb.pick(SOCIAL.lines.bad),{first:c?c.first:"A client",label:p.label,pos:evPos(c),grade:(HEAL_GRADES[p.heal]||{}).name||p.heal}),{piece:p.id,client:p.client,social:"bad"});}
  /* followers far away book in */
  if(walkinsOpen(S)&&ctx.r.fork("far").chance(Math.min(SOCIAL.bookings.max,so.followers/SOCIAL.bookings.per))){
    const r=ctx.r.fork("farClient"),st=caStage(S),c=makeClient(r,{id:clNextId(S),year:S.year,week:S.week,stage:st,sizes:WALKINS.sizes[st]||null,src:"social",badIdea:false,segBoost:{collector:0.8,large_scale:0.4}});
    c.brief=evFill(r.pick(SOCIAL.lines.far),{far:r.pick(SOCIAL.far)})+" "+c.brief;
    const due=weekFrom(now+r.int(1,3));
    S.queue.push({id:queueId(S),kind:"consult",src:"social",client:c.id,newClient:c,w:due.w,y:due.y,expires:weekIndex(due.w,due.y)+WEEK.consultWait,brief:c.brief,ask:c.ask});
    so.booked++;evLog(ctx,"referral",c.name+" found you online and is booked for a consult.",{client:c.id,social:"far"});}}

/* ===================== rivals ===================== */
function evRivals(S){const C=S.career;if(!C)return[];if(!Array.isArray(C.rivals))C.rivals=[];return C.rivals;}
/* PR 7's apprentice rivals ({name, style, el, from:"apprentice", y}) become shops with the same fields as RIVALS */
function evRivalsFix(S){
  const L=evRivals(S);L.forEach((rv,i)=>{if(rv.id)return;
    Object.assign(rv,{id:"app"+(i+1),shop:rv.name+"'s shop",where:rv.where||"across the canal",tactic:"copy",str:RIVAL.apprentice.str,mem:RIVAL.apprentice.mem,
      opened:{w:1,y:rv.y||S.year},status:"open",acts:{},says:"run by someone you trained"});});}
function evRivalDef(rv){return RIVALS.find(x=>x.id===rv.id)||{pull:0.07,style:rv.style,where:rv.where,tactic:rv.tactic,name:rv.shop||rv.name};}
const evRivalName=rv=>rv.shop||rv.name;
/* rivalWalkins(S, out): open rivals pull walk-ins (and their style) away; shopWalkins in sim/career.js calls it */
function rivalWalkins(S,out){
  if(caStage(S)==="apprentice")return out;
  for(const rv of evRivals(S)){if(rv.status!=="open")continue;const d=evRivalDef(rv),s=clamp(rv.str||0.4,0,1);
    out.mult-=d.pull*s;
    if(rv.style){out.styles=Object.assign({},out.styles||{});out.styles[rv.style]=(out.styles[rv.style]||1)*(1-RIVAL.stylePull*s);}}
  return out;}
function evPush(S,ctx,ev,text){
  const W=S.world;ev.id="e"+(W.nextEv++);ev.w=S.week;ev.y=S.year;ev.until=evNow(S)+(ev.wait||EVENTS.wait);ev.text=text;
  if(ev.rival){const rv=evRivals(S).find(x=>x.id===ev.rival);if(rv)rv.last=evNow(S);}
  W.pending.push(ev);evLog(ctx,"event",text,{ev:ev.id,rival:ev.rival||undefined,repEv:ev.repEv?ev.kind:undefined});return ev;}
function evRivalsWeek(S,ctx){
  const L=evRivals(S),now=ctx.now,st=caStage(S),r=ctx.r.fork("rivals"),repSum=evRepSum(S),Rs=RIVAL.str;
  /* openings */
  for(const d of RIVALS){if(L.some(x=>x.id===d.id)||S.year<d.open[0]||S.year>d.open[1])continue;
    if(!(r.fork("open:"+d.id).chance(RIVAL.openChance)||(S.year===d.open[1]&&S.week>=40)))continue;
    const rv={id:d.id,name:d.name,shop:d.name,where:d.where,style:d.style,tactic:d.tactic,says:d.says,opened:{w:S.week,y:S.year},str:Rs.start,mem:0,acts:{},status:"open",from:"rival"};
    L.push(rv);evLog(ctx,"event",evFill(EVENTS.rivalOpen,{rival:d.name,where:d.where,says:d.says}),{rival:d.id});}
  for(const rv of L){if(rv.status!=="open")continue;
    const rr=r.fork(rv.id);
    rv.str=Math.round(clamp(rv.str+Rs.grow-Rs.press*Math.max(0,repSum-RIVAL.close.repSum)/100,Rs.min,1)*1000)/1000;
    if(rv.str<=Rs.closeAt&&now-weekIndex(rv.opened.w,rv.opened.y)>=Rs.closeAfter){rv.status="gone";rv.gone={w:S.week,y:S.year};
      evLog(ctx,"event",evFill(EVENTS.rivalGone,{rival:evRivalName(rv),where:rv.where}),{rival:rv.id});continue;}
    if(st==="apprentice"||(rv.truce&&now<rv.truce)||(rv.last&&now-rv.last<RIVAL.cool)||S.world.pending.some(e=>e.rival===rv.id))continue;
    const grudge=Math.max(0,-(rv.mem||0)),base=2*rv.str*(1+grudge);
    if(rv.tactic==="undercut"&&rr.chance(RIVAL.act.undercut*base)){
      evPush(S,ctx,{kind:"undercut",rival:rv.id,choices:EVENTS.undercut.choices,dflt:EVENTS.undercut.dflt},evFill(EVENTS.undercut.text,{rival:evRivalName(rv),where:rv.where}));}
    else if(rv.tactic==="poach"&&S.studio.staff.length&&rr.chance(RIVAL.act.poach*base)){
      const s=S.studio.staff.slice().sort((a,b)=>a.loyalty-b.loyalty)[0];
      evPush(S,ctx,{kind:"poach",rival:rv.id,staff:s.id,choices:EVENTS.poach.choices,dflt:EVENTS.poach.dflt},evFill(EVENTS.poach.text,{rival:evRivalName(rv),staff:s.name}));}
    else if((rv.mem||0)>=RIVAL.respect.at&&rr.chance(RIVAL.respect.chance))evCoverPuzzle(S,ctx,rr.fork("resp"),rv);}}
/* rivalsCopy(S, sig, ctx): sim/career.js calls it each week once your signature is ready */
function rivalsCopy(S,sig,ctx){
  worldEnsure(S);if(caStage(S)==="apprentice")return;
  const r=ctx.r.fork("copy");
  for(const rv of evRivals(S)){if(rv.status!=="open"||rv.tactic!=="copy"||(rv.truce&&ctx.now<rv.truce)||(rv.last&&ctx.now-rv.last<RIVAL.cool)||S.world.pending.some(e=>e.rival===rv.id))continue;
    if(!r.fork(rv.id).chance(RIVAL.act.copy*2*rv.str*(1+Math.max(0,-(rv.mem||0)))*sig.strength))continue;
    const style=((SIM.STYLES||{})[sig.style]||{}).name||sig.style;
    evPush(S,ctx,{kind:"copy",rival:rv.id,style:sig.style,choices:EVENTS.copy.choices,dflt:EVENTS.copy.dflt},evFill(EVENTS.copy.text,{rival:evRivalName(rv),style:String(style).toLowerCase()}));
    break;}}
/* the rate after a price war (sim/career.js rateFor multiplies it in) */
function evRateMod(S){const m=S.world&&S.world.mods&&S.world.mods.rate;return m&&evNow(S)<m.until?m.mult:1;}

/* ===================== choices ===================== */
const EV_DO={
  undercut(S,ev,ch,rv,r){const E=EVENTS.undercut,U=RIVAL.undercut,o={rival:evRivalName(rv)};
    if(ch==="match"){S.world.mods.rate={mult:U.match,until:evNow(S)+U.weeks};rv.str=clamp(rv.str-0.05,RIVAL.str.min,1);S.rate=rateFor(S);return evFill(E.says.match,o);}
    if(ch==="talk"){if((rv.mem||0)>=-0.2&&r.chance(0.5+(rv.mem||0)/2)){rv.truce=evNow(S)+U.truce;rv.mem=caR3(clamp((rv.mem||0)+0.2,-1,1));return evFill(E.says.truce,o);}
      rv.mem=caR3(clamp((rv.mem||0)-0.15,-1,1));return evFill(E.says.snub,o);}
    for(const k in U.hold)repAdd(S,k,U.hold[k]);rv.str=clamp(rv.str+0.04,0,1);return evFill(E.says.hold,o);},
  poach(S,ev,ch,rv,r){const E=EVENTS.poach,s=S.studio.staff.find(x=>x.id===ev.staff),o={rival:evRivalName(rv),staff:s?s.name:"Your artist"};
    if(!s)return evFill(E.says.gone,o);
    if(ch==="match"){s.cut=caR3(Math.max(0.15,s.cut-RIVAL.poach.cut));s.loyalty=caR3(clamp(s.loyalty+RIVAL.poach.loyalty,0,1));return evFill(E.says.match,o);}
    if(ch==="talk"&&r.chance(clamp(s.loyalty+(s.from?0.3:0),0.05,0.95))){s.loyalty=caR3(clamp(s.loyalty+0.1,0,1));return evFill(E.says.stay,o);}
    letGo(S,s.id,"poached by "+evRivalName(rv));rv.str=clamp(rv.str+0.05,0,1);rv.acts.poach=(rv.acts.poach||0)+1;
    return evFill(ch==="talk"?E.says.go:E.says.let,o);},
  copy(S,ev,ch,rv,r){const E=EVENTS.copy,C=RIVAL.copy,o={rival:evRivalName(rv)};rv.acts.copy=(rv.acts.copy||0)+1;
    if(ch==="call"){const sig=signatureOf(S);rv.mem=caR3(clamp((rv.mem||0)-0.3,-1,1));
      if(sig.strength>=0.4){repAdd(S,"peers",C.call.peers);rv.str=clamp(rv.str-0.03,RIVAL.str.min,1);return evFill(E.says.call,o);}
      repAdd(S,"peers",C.call.low);return evFill(E.says.callLow,o);}
    if(ch==="fresh"){repAdd(S,"collectors",C.fresh.collectors);if(ev.style)skillGain(S,"style:"+ev.style,C.fresh.xp);S.world.mods.fresh=evNow(S)+26;return evFill(E.says.fresh,o);}
    for(const k in C.let)repAdd(S,k,C.let[k]);rv.str=clamp(rv.str+0.03,0,1);return evFill(E.says.let,o);},
  pawn(S,ev,ch){const P=RECKONINGS.pawn,c=P.choices[ch]||P.choices.keep;
    if(ch==="sell"){const own=S.kit&&S.kit.owned&&S.kit.owned.machines;const m=ev.machine;
      if(own&&own.indexOf(m)>=0&&S.kit.machine!==m){own.splice(own.indexOf(m),1);const pay=evRub(S,P.pay[m]||P.pay.coil_used);cashIn(S,pay,"pawn");return evFill(c.says,{pay:evFmt(pay)});}
      return "You look for it, but it's not on the shelf any more.";}
    return evFill(c.says,{});}
};
/* eventChoose(S, id, choice) -> {ok, kind, choice, text} */
function eventChoose(S,id,choice){
  const W=worldEnsure(S),i=W.pending.findIndex(e=>e.id===id);if(i<0)return{ok:false};
  const ev=W.pending[i];W.pending.splice(i,1);
  const ok=(ev.choices||[]).some(c=>c[0]===choice)?choice:ev.dflt;
  const rv=ev.rival?evRivals(S).find(x=>x.id===ev.rival):null,r=rng(S.seed).fork("choose:"+ev.id+":"+ok);
  const f=EV_DO[ev.kind],g=EV_REP_DO[ev.kind];
  const text=g?g(S,ev,ok,r):f?(rv||!ev.rival?f(S,ev,ok,rv||{acts:{}},r):"They've closed since."):"";
  if(rv&&rv.acts)rv.acts[ev.kind]=(rv.acts[ev.kind]||0)+(ev.kind==="poach"||ev.kind==="copy"?0:1);
  return{ok:true,kind:ev.kind,choice:ok,text};}

/* ===================== reckonings ===================== */
/* SIM.onReturn(item, S): scheduleReturns (sim/clients.js) calls it for every return; a cover_own of a first-year piece in
   career years 12-18 becomes the first_year reckoning */
function onReturn(item,S){
  if(!item||!item.ret||item.ret.rule!=="cover_own")return;
  const W=worldEnsure(S);if(W.fired.first_year)return;
  const st=evStart(S),R=RECKONINGS.first_year;if(S.year<st+R.years[0]||S.year>st+R.years[1])return;
  const p=S.pieces.find(x=>x.id===item.ret.piece),c=findClient(S,item.client);if(!p||!c||!evEarly(S,p))return;
  evBeat(S,item,"first_year",p,c,rng(S.seed).fork("reck:first_year:brief"));}
const evEarly=(S,p)=>!p.by&&(p.stage==="apprentice"||p.y<=evStart(S)+1);
function evBeat(S,item,id,p,c,r){
  const R=RECKONINGS[id];item.beat=id;
  item.brief=evFill(r.pick(R.brief),{first:c.first,label:p.label,place:clPlaceName(p.design.placement),year:p.y,yrs:S.year-p.y,when:p.stage==="apprentice"?"when you were still sweeping Arkady's floor":"back when you'd only just got your own chair"});
  item.expires=Math.max(item.expires||0,weekIndex(item.w,item.y)+R.wait);
  c.brief=item.brief;S.world.fired[id]={w:S.week,y:S.year,client:c.id,piece:p.id};}
function evReturnItem(S,c,p,ruleId,r){
  const rule=RETURN_RULES.find(x=>x.id===ruleId),due=weekFrom(evNow(S)+r.int(0,1));
  const ask=clReturnAsk(rule,p,c,r,null),ret={rule:ruleId,piece:p.id,label:p.label,year:p.y,w:p.w,place:p.design.placement};
  const item={id:queueId(S),kind:"consult",src:"return",client:c.id,w:due.w,y:due.y,expires:weekIndex(due.w,due.y)+WEEK.consultWait,brief:"",ask,ret};
  c.ask=ask;return item;}
function evReckonWeek(S,ctx){
  const W=S.world,F=W.fired,now=ctx.now,st=caStage(S),start=evStart(S);
  /* your first-year piece, aged in front of you (career years 12-18, at a week planned from the seed) */
  const R1=RECKONINGS.first_year;
  if(!F.first_year&&S.year>=start+R1.years[0]&&S.year<=start+R1.years[1]){
    if(W.plan.first_year==null){const r=rng(S.seed).fork("reck:first_year");W.plan.first_year=weekIndex(r.int(1,52),start+r.int(R1.plan[0],R1.plan[1]));}
    if(now>=W.plan.first_year)for(const p of S.pieces){if(p.y>start+1)break;if(!evEarly(S,p)||!p.heal)continue;
      const c=findClient(S,p.client);if(!c||evPending(S,c.id))continue;
      if(c.compact)expandClient(S,c);
      const r=ctx.r.fork("reck1"),it=evReturnItem(S,c,p,"cover_own",r);evBeat(S,it,"first_year",p,c,r);S.queue.push(it);
      evLog(ctx,"event",evFill(EVENTS.reckoning.first_year,{first:c.first,label:p.label,year:p.y}),{client:c.id,item:it.id,beat:"first_year"});break;}}
  /* the client who bad-mouthed a patchy heal, once you're known */
  const R2=RECKONINGS.bad_mouth;
  if(!F.bad_mouth&&now%4===0&&(evRepSum(S)>=R2.repSum||((S.rep&&S.rep.collectors)||0)>=R2.collectors)){
    for(const c of S.clients){if(c.compact||evPending(S,c.id))continue;
      const h=(c.history||[]).find(e=>e.kind==="review"&&e.stars<=R2.stars);if(!h)continue;
      const p=S.pieces.find(x=>x.id===h.piece);if(!p||p.by||["patchy","blownout","infected"].indexOf(p.heal)<0)continue;
      const r=ctx.r.fork("reck2"),it=evReturnItem(S,c,p,"touchup",r);evBeat(S,it,"bad_mouth",p,c,r);S.queue.push(it);
      evLog(ctx,"event",evFill(EVENTS.reckoning.bad_mouth,{first:c.first,label:p.label,year:p.y}),{client:c.id,item:it.id,beat:"bad_mouth"});break;}}
  /* Arkady's referral in Act 3 */
  const R3=RECKONINGS.mentor_ref,reached=S.career.reached.studio;
  if(!F.mentor_ref&&st==="studio"&&reached&&now-weekIndex(reached.w,reached.y)>=R3.weeks&&walkinsOpen(S)){
    const r=ctx.r.fork("reck3"),hi=S.career.mentor.goodwill>=R3.high;
    const c=makeClient(r,{id:clNextId(S),year:S.year,week:S.week,stage:st,src:"referral",badIdea:false,theme:hi?"collector":null,style:hi?null:"traditional",sizes:hi?["large","huge"]:["medium","large"]});
    c.brief=(hi?R3.high:R3.low)+" "+c.brief;c.mentor=true;
    const due=weekFrom(now+1);
    S.queue.push({id:queueId(S),kind:"consult",src:"referral",client:c.id,newClient:c,w:due.w,y:due.y,expires:weekIndex(due.w,due.y)+R3.wait,brief:c.brief,ask:c.ask,from:"mentor",beat:"mentor_ref"});
    F.mentor_ref={w:S.week,y:S.year,client:c.id,high:hi};
    evLog(ctx,"event",R3.line[hi?"high":"low"],{client:c.id,beat:"mentor_ref"});}
  /* the pawn shop on the canal (Lombard): sell an old machine once you've moved on from it */
  const R4=RECKONINGS.pawn,own=(S.kit&&S.kit.owned&&S.kit.owned.machines)||[];
  if(!F.pawn&&S.year>=R4.from&&st!=="apprentice"&&own.length>1){
    const m=own.find(x=>x!==S.kit.machine&&R4.pay[x]!=null);
    if(m){const nm=((SIM.MACHINES||{})[m]||{}).name||"machine";F.pawn={w:S.week,y:S.year,machine:m};
      evPush(S,ctx,{kind:"pawn",beat:"pawn",machine:m,choices:[["sell",R4.choices.sell.label],["keep",R4.choices.keep.label]],dflt:"keep",wait:8},evFill(R4.text,{machine:String(nm).toLowerCase()}));}}}
/* reckoningChoose(S, itemId, choice) -> {ok, text, consult (true: go on to a normal consult), item (a free sitting)} */
function reckoningChoose(S,itemId,choice){
  worldEnsure(S);const q=S.queue.find(x=>x.id===itemId);if(!q||!q.beat||q.beatDone)return{ok:false};
  const R=RECKONINGS[q.beat];if(!R||!R.choices||!R.choices[choice])return{ok:false};
  const c=findClient(S,q.client),p=q.ret&&S.pieces.find(x=>x.id===q.ret.piece);if(!c||!p)return{ok:false};
  const o={first:c.first,label:p.label,yrs:S.year-p.y,year:p.y},text=evFill(R.choices[choice].says,o);
  for(const k in (R.rep&&R.rep[choice])||{})repAdd(S,k,R.rep[choice][k]);
  if(R.loyalty&&R.loyalty[choice])loyaltyBump(c,R.loyalty[choice]);
  clientLog(c,{w:S.week,y:S.year,kind:"note",text:R.choices[choice].label.toLowerCase()+": the "+p.label+" from "+p.y});
  q.beatDone=choice;S.world.fired[q.beat].choice=choice;
  if(choice==="cover"||choice==="charge")return{ok:true,text,consult:true};
  S.queue=S.queue.filter(x=>x!==q);
  if(choice==="rework"||choice==="fix"){
    const est=clEstimate(Object.assign({},q.ask,{sizeMm:p.design.sizeMm||q.ask.sizeMm}),c,S.skills||{}),due=weekFrom(evNow(S)+1);
    const item={id:queueId(S),kind:"session",client:c.id,w:due.w,y:due.y,hours:Math.max(0.5,Math.round(est.hours*0.6*4)/4),sessionNo:1,sessions:1,
      price:0,deposit:0,paid:0,ask:Object.assign({},q.ask,{placement:p.design.placement,sizeMm:p.design.sizeMm,style:p.design.style,cover:false}),
      design:JSON.parse(JSON.stringify(p.design)),booked:{w:S.week,y:S.year},moved:0,ret:{rule:"touchup",piece:p.id},rework:true,beat:q.beat};
    S.queue.push(item);return{ok:true,text,item};}
  return{ok:true,text};}

/* ===================== cover-ups ===================== */
/* a foreign piece's stand-in design: one dark element that matches its tags, at its size and place */
function evForeignDesign(f){
  const E=SIM.ELEMENTS||[],tags=f.tags||(FOREIGN_PIECES.find(x=>x.label===f.label)||{}).tags||[];
  const words=String(f.label||"").split(/[^a-z]+/).filter(w=>w.length>3);
  let el=E.find(e=>(e.family==="motif"||e.family==="lettering")&&words.some(w=>e.id.indexOf(w)>=0))||E.find(e=>(e.family==="motif"||e.family==="lettering")&&tags.some(t=>(e.tags||[]).indexOf(t)>=0)&&(e.styles||[]).indexOf("traditional")>=0)
    ||E.find(e=>(e.family==="motif"||e.family==="lettering")&&tags.some(t=>(e.tags||[]).indexOf(t)>=0))||E.find(e=>e.family==="motif");
  return{placement:f.placement,style:"traditional",flash:null,sizeMm:f.sizeMm||50,pos:{x:0.5,y:0.45},
    elements:el?[{id:el.id,x:0.5,y:0.5,scale:1,rot:(hash(f.label+":"+f.y)%40)-20,lineWeight:11,fill:0.7,colour:null}]:[]};}
/* coverOld(S, item) -> the old piece a cover-up goes over: {design, years, heal, label, foreign} or null */
function coverOld(S,item){
  const ret=item&&item.ret;if(!ret||(ret.rule!=="cover_own"&&ret.rule!=="cover_other")||item.rework)return null;
  if(ret.foreign){const f=ret.foreign;return{design:evForeignDesign(f),years:Math.max(0,S.year-f.y),heal:"blownout",label:f.label,foreign:true,ink:"budget"};}
  const p=S.pieces.find(x=>x.id===ret.piece);if(!p)return null;
  return{design:p.design,years:Math.max(0,(S.year-p.y)+(S.week-p.w)/WEEKS_PER_YEAR),heal:p.heal,out:p.out,label:p.label,piece:p.id,foreign:false,ink:p.ink};}
/* the elements of a design as ellipses in placement millimetres (the board's dzFromDesign, without the DOM) */
function evEllipses(d,box,k){k=k||0.9;
  const els=(d&&d.elements||[]).filter(e=>SIM.elementById(e.id));if(!els.length||!d.sizeMm)return[];
  const fp=SIM.footprintOf(Object.assign({},d,{elements:els})),pos=d.pos||{x:0.5,y:0.5},sz=d.sizeMm,cx=pos.x*box.wrapMm,cy=pos.y*box.lengthMm;
  return els.map(e=>{const b=SIM.elementBox(e.id),mx=Math.max(b.w,b.h,1e-6),mm=(e.scale!=null?e.scale:0.5)*sz,el=SIM.elementById(e.id),a=(e.rot||0)*Math.PI/180;
    return{x:cx+((e.x!=null?e.x:0.5)-fp.cx)*sz,y:cy+((e.y!=null?e.y:0.5)-fp.cy)*sz,rx:Math.max(0.5,mm*b.w/mx/2*k),ry:Math.max(0.5,mm*b.h/mx/2*k),c:Math.cos(a),s:Math.sin(a),
      fam:el.family,fill:+e.fill||0,colour:e.colour||null};});}
const evIn=(E,x,y)=>{const dx=x-E.x,dy=y-E.y,u=dx*E.c+dy*E.s,v=-dx*E.s+dy*E.c;return(u*u)/(E.rx*E.rx)+(v*v)/(E.ry*E.ry)<=1;};
/* coverScore(design, old, box) -> {coverage 0..1, dark 0..1, text}: how much of the old piece's ink sits under dark, filled
   work. Lines alone don't hide a blowout; fills and textures in dark colours do */
function coverScore(design,old,box){
  const K=COVER_SCORE,O=evEllipses(old,box,K.oldK),N=evEllipses(design,box,K.newK);
  if(!O.length)return{coverage:1,dark:1,text:"Nothing to cover."};
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const E of O){const r=Math.max(E.rx,E.ry);x0=Math.min(x0,E.x-r);y0=Math.min(y0,E.y-r);x1=Math.max(x1,E.x+r);y1=Math.max(y1,E.y+r);}
  let pts=0,got=0,dk=0;
  for(let i=0;i<K.grid;i++)for(let j=0;j<K.grid;j++){const x=x0+(i+0.5)*(x1-x0)/K.grid,y=y0+(j+0.5)*(y1-y0)/K.grid;
    if(!O.some(E=>evIn(E,x,y)))continue;pts++;let best=0;
    for(const E of N){if(!evIn(E,x,y))continue;const col=(SIM.COLOURS||{})[E.colour||"black"],dark=1-0.8*((col&&col.light)||0.05);
      const dens=(K.family[E.fam]!=null?K.family[E.fam]:K.lineOnly+K.fillW*E.fill)*dark;if(dens>best)best=dens;}
    got+=Math.min(1,best/K.need);dk+=best;}
  const coverage=pts?got/pts:1,dark=pts?dk/pts:1;
  const text=coverage>=K.good?"The old piece is buried. Nobody will know it was there.":coverage>=K.ok?"Mostly covered, but the old lines may ghost through at the edges.":"The old piece will show through. It needs something bigger and darker over it.";
  return{coverage:Math.round(coverage*1000)/1000,dark:Math.round(Math.min(1,dark)*1000)/1000,text};}
/* a cover-up job turns up: a new client with someone else's old piece (or one a respectful rival sends over) */
function evCoverPuzzle(S,ctx,r,rv){
  const st=caStage(S),c=makeClient(r,{id:clNextId(S),year:S.year,week:S.week,stage:st,src:"cover",badIdea:false,segBoost:{cover_up:1}});
  const born=c.born!=null?c.born:S.year-(c.age||30),fy=Math.max(born+18,S.year-r.int(2,15));if(fy>=S.year)return null;
  const f=r.pick(FOREIGN_PIECES.filter(x=>!x.from||fy>=x.from)),pl=clPlace(r,r.pick(["forearm","upperarm","calf","shoulder"]));
  const foreign={label:f.label,where:f.where,placement:pl,sizeMm:r.int(COVER_PUZZLE.size[0],COVER_PUZZLE.size[1]),y:fy,tags:f.tags};
  const rule=RETURN_RULES.find(x=>x.id==="cover_other"),ask=clReturnAsk(rule,null,c,r,foreign);
  c.ask=ask;c.brief=evFill(rv?EVENTS.rivalRespect:r.pick(COVER_PUZZLE.lines),{rival:rv?evRivalName(rv):"",foreign:f.label,place:clPlaceName(pl),year:fy,where:f.where});
  const due=weekFrom(ctx.now+r.int(0,1)),ret={rule:"cover_other",piece:null,label:f.label,year:fy,w:1,place:pl,foreign};
  S.queue.push({id:queueId(S),kind:"consult",src:"cover",client:c.id,newClient:c,w:due.w,y:due.y,expires:weekIndex(due.w,due.y)+COVER_PUZZLE.wait,brief:c.brief,ask,ret,puzzle:true});
  evLog(ctx,"event",rv?evFill(EVENTS.rivalRespect,{rival:evRivalName(rv)}):evFill(EVENTS.puzzle,{first:c.first,foreign:f.label,pos:evPos(c),place:clPlaceName(pl)}),{client:c.id,puzzle:true});
  return c;}
/* finishing a cover-up: how well it covered goes into the client's loyalty, your peers and their history */
function evFinish(S,itemId,res){
  const q=S.queue.find(x=>x.id===itemId),old=q&&(q.sessionNo||1)>=(q.sessions||1)?coverOld(S,q):null;
  const out=finishSession(S,itemId,res);
  if(out&&out.piece&&old){
    const c=findClient(S,q.client),box=placementBox(out.piece.design.placement,(c&&c.bodyShape)||"neutral")||{wrapMm:100,lengthMm:200};
    const cs=coverScore(out.piece.design,old.design,box),K=COVER_SCORE;out.cover=cs;
    if(c){loyaltyBump(c,(cs.coverage-K.ok)*K.loyalty);clientLog(c,{w:S.week,y:S.year,kind:"note",text:"cover-up of the "+old.label+": "+Math.round(cs.coverage*100)+"% covered"});}
    if(cs.coverage>=K.good)repAdd(S,"peers",K.rep.good);else if(cs.coverage<K.ok)repAdd(S,"peers",K.rep.bad);}
  return out;}

/* ===================== conventions ===================== */
/* convCandidates(S) -> {fresh: [pieces done in the last freshWeeks], healed: [healed pieces a year old or more, portfolio
   first, best reading first]}, each at most CONV_JUDGE.list long, your own work only */
function convCandidates(S){
  const now=evNow(S),J=CONV_JUDGE,fresh=[],healed=[];
  for(let i=S.pieces.length-1;i>=0;i--){const p=S.pieces[i];if(p.by||!p.design||!(p.design.elements||[]).length)continue;
    const age=now-weekIndex(p.w,p.y);
    if(age<=J.freshWeeks){if(fresh.length<J.list*2)fresh.push(p);}
    else if(p.heal&&age>=J.healedYears*WEEKS_PER_YEAR&&p.heal!=="infected")healed.push(p);
    if(healed.length>J.list*12)break;}
  const hs=healed.map(p=>({p,v:caReads(S,p)+(p.portfolio?0.5:0)})).sort((a,b)=>b.v-a.v).slice(0,J.list).map(x=>x.p);
  const fs=fresh.map(p=>({p,v:evFreshQ(S,p)})).sort((a,b)=>b.v-a.v).slice(0,J.list).map(x=>x.p);
  return{fresh:fs,healed:hs};}
function evFreshQ(S,p){const c=findClient(S,p.client),o=p.out||{},J=CONV_JUDGE.fresh;let tot=0.55;
  try{if(c&&c.wants)tot=scoreDesign(p.design,c,S.skills||{},{year:p.y}).total;}catch(e){}
  const outs=o.lineQuality!=null?(o.lineQuality+o.depthQuality+(o.saturation||0.7)+(1-(o.trauma||0.4)))/4:0.6;
  return J.design*tot+J.outputs*outs;}
function evHealedQ(S,p){const J=CONV_JUDGE.healed,yrs=(S.year-p.y)+(S.week-p.w)/WEEKS_PER_YEAR;
  return J.reads*caReads(S,p)+J.heal*(CONV_JUDGE.heal[p.heal]||0)+J.years*Math.min(1,yrs/10);}
/* convJudge(S, inv, picks {fresh, healed: piece ids}) -> the convention record (sim/career.js enterInvite calls it) */
function convJudge(S,inv,picks){
  worldEnsure(S);const C=S.career,cv=CONVENTIONS.find(c=>c.id===inv.conv)||CONVENTIONS[0],r=rng(S.seed).fork("conv:"+inv.id),J=CONV_JUDGE,W=CONV_SCORE;
  cashOut(S,inv.fee,"convention");
  const cand=convCandidates(S),find=id=>id?S.pieces.find(p=>p.id===id&&!p.by):null;
  picks=picks||{};const fp=picks.fresh===undefined?cand.fresh[0]:find(picks.fresh),hp=picks.healed===undefined?cand.healed[0]:find(picks.healed);
  const sk=S.skills||{},avg=(["linework","shading","colour","speed"].reduce((a,k)=>a+(+sk[k]||0),0)/4)/10,sig=signatureOf(S);
  const onSig=p=>p&&sig.ready&&p.design.style===sig.style?1:sig.ready?0.4:0.2;
  const placeOf=v=>v>=J.places[0]?1:v>=J.places[1]?2:v>=J.places[2]?3:0;
  const cat=(p,kind)=>{if(!p)return null;const base=kind==="fresh"?evFreshQ(S,p)+J.fresh.skill*avg:evHealedQ(S,p);
    const sc=caR3(base+J[kind].sig*onSig(p)*Math.max(0.3,sig.strength)+r.fork(kind).normal(0,J.sd)),place=placeOf(sc);
    const prize=place?evRub(S,cv.prize[place-1]*J.prizeShare):0;if(prize)cashIn(S,prize,"convention");
    if(p.design.style)skillGain(S,"style:"+p.design.style,SKILL_XP.convention/2);
    return{piece:p.id,name:p.name,score:sc,place,prize};};
  const fr=cat(fp,"fresh"),he=cat(hp,"healed");
  const best=[fr,he].filter(x=>x&&x.place).sort((a,b)=>a.place-b.place)[0]||null,place=best?best.place:0;
  repAdd(S,"peers",W.rep.peers[place?place-1:3]);repAdd(S,"collectors",W.rep.collectors[place?place-1:3]);
  /* the booth: your flash sells to the crowd */
  const att=J.booth.attendance[cv.id]||1,sheets=Math.max(J.booth.min,Math.min(40,(S.flash||[]).length));
  const booth=evRub(S,J.booth.perSheet*sheets*att*(0.6+0.4*(((S.rep&&S.rep.walkins)||0)/100))*(0.8+0.4*r.fork("booth")()));cashIn(S,booth,"convention");
  /* collectors: one may book you */
  let met=null;
  if(r.fork("met").chance(J.collector.chance+J.collector.perPlace*(place?4-place:0))&&walkinsOpen(S)){
    const rc=r.fork("metClient"),st=caStage(S),c=makeClient(rc,{id:clNextId(S),year:S.year,week:S.week,stage:st,src:"referral",theme:"collector",badIdea:false});
    c.brief="We met at "+cv.name+". I stood at your booth for half an hour. "+c.brief;
    const due=weekFrom(evNow(S)+rc.int(2,4));
    S.queue.push({id:queueId(S),kind:"consult",src:"referral",client:c.id,newClient:c,w:due.w,y:due.y,expires:weekIndex(due.w,due.y)+WEEK.consultWait,brief:c.brief,ask:c.ask,from:"convention"});
    met={client:c.id,name:c.name,w:due.w,y:due.y};}
  /* rivals' booths */
  const rivals=[];for(const rv of evRivals(S)){if(rv.status!=="open")continue;const rs=caR3(0.45+0.3*rv.str+r.fork("rv:"+rv.id).normal(0,0.08)),rp=placeOf(rs);
    const style=((SIM.STYLES||{})[rv.style]||{}).name||rv.style;
    rivals.push({id:rv.id,name:evRivalName(rv),style,place:rp,line:evCap(evRivalName(rv))+"'s booth: "+String(style).toLowerCase()+" work, "+(rp?["","first","second","third"][rp]+" place":"no placing")+"."});
    if(place&&(!rp||place<rp)){rv.str=clamp(rv.str-0.04,RIVAL.str.min,1);rv.mem=caR3(clamp((rv.mem||0)-0.05,-1,1));}}
  const rec={id:cv.id,name:cv.name,y:S.year,place,piece:best?best.piece:(fr||he||{}).piece||null,score:best?best.score:Math.max((fr||{}).score||0,(he||{}).score||0),
    fresh:fr,healed:he,booth,met:met?met.client:null};
  C.conv.push(rec);
  return Object.assign({},rec,{metClient:met,rivals});}

/* ===================== reputation events (REP_EVENTS, 0.1.13.0) ===================== */
/* the number a track must reach for an event: REP_TRACKS is the one source */
const evRepAt=id=>{const E=REP_EVENTS[id],t=REP_TRACKS[E.track];return t&&t.events&&t.events[id]!=null?t.events[id]:101;};
const evRepOk=(S,id)=>((S.rep&&+S.rep[REP_EVENTS[id].track])||0)>=evRepAt(id);
/* friday13Weeks(year) -> [{w, month, date}]: the calendar weeks that hold a Friday the 13th (week w is days 7(w-1)+1 to
   7w of the year; days 365-366 count in week 52). Pure date maths, cached per year */
const EV_F13={};
function friday13Weeks(y){
  if(EV_F13[y])return EV_F13[y];const out=[],j1=Date.UTC(y,0,1);
  for(let m=0;m<12;m++){const t=Date.UTC(y,m,13);if(new Date(t).getUTCDay()!==5)continue;
    const doy=Math.round((t-j1)/864e5);out.push({w:Math.min(WEEKS_PER_YEAR,Math.floor(doy/7)+1),month:m,date:"Friday 13 "+REP_EV_MONTHS[m]});}
  return EV_F13[y]=out;}
/* sittings for a flash day or the Friday special: base + perRep x walk-ins + a little luck */
function evRepSittings(S,E,r){const k=E.sittings;return Math.max(1,Math.round(k.base+k.perRep*((S.rep&&+S.rep.walkins)||0)+r.int(0,k.spread)));}
/* the portfolio pieces a magazine would shoot: healed, your own, reading well today, best first */
function evPortfolio(S,max){const out=[];
  for(let i=S.pieces.length-1;i>=0;i--){const p=S.pieces[i];if(p.by||!p.portfolio||!p.heal||p.heal==="infected")continue;const rd=caReads(S,p);if(rd>=LEGACY.reads)out.push({p,rd});}
  return out.sort((a,b)=>b.rd-a.rd).slice(0,max||out.length).map(x=>x.p);}
function evRepWeek(S,ctx){
  const W=S.world,RE=W.repEv,now=ctx.now,st=caStage(S);
  if(st==="apprentice")return;
  const busy=k=>W.pending.some(e=>e.kind===k);
  /* a flash day: walk-ins at REP_TRACKS, three sheets of your own flash, the shop open */
  const F=REP_EVENTS.flash_day,fd=RE.flash_day,mine=(S.flash||[]).length;
  if(evRepOk(S,"flash_day")&&walkinsOpen(S)&&mine>=F.minFlash&&!busy("flash_day")&&(fd.last==null||now-fd.last>=F.cool)&&ctx.r.fork("rev:flash_day").chance(F.chance)){
    fd.last=now;evPush(S,ctx,{kind:"flash_day",repEv:true,choices:F.choices,dflt:F.dflt,wait:F.wait},evFill(F.text,{sheets:mine}));}
  /* Friday the 13th: only in a week that really has one */
  const T=REP_EVENTS.friday_13,fr=RE.friday_13,f13=friday13Weeks(S.year).find(x=>x.w===S.week);
  if(f13&&evRepOk(S,"friday_13")&&walkinsOpen(S)&&!busy("friday_13")&&fr.last!==now){
    fr.last=now;evPush(S,ctx,{kind:"friday_13",repEv:true,date:f13.date,choices:T.choices,dflt:T.dflt,wait:T.wait},evFill(T.text,{date:f13.date}));}
  /* Kontur: collectors at REP_TRACKS, a portfolio worth a photographer, at most max features, years apart */
  const M=REP_EVENTS.magazine,mg=RE.magazine,lastM=mg.length?mg[mg.length-1].at:null;
  if(evRepOk(S,"magazine")&&mg.length<M.max&&!busy("magazine")&&(lastM==null||now-lastM>=M.cool)&&ctx.r.fork("rev:magazine").chance(M.chance)){
    const pf=evPortfolio(S,M.portfolio);
    if(pf.length>=M.portfolio)evPush(S,ctx,{kind:"magazine",repEv:true,piece:pf[0].id,choices:M.choices,dflt:M.dflt,wait:M.wait},evFill(M.text,{piece:pf[0].name}));}
  /* the Drawbridge Prize: once a year, peers at REP_TRACKS, enough healed work to judge */
  const A=REP_EVENTS.award;
  if(S.week===A.week&&evRepOk(S,"award")&&!busy("award")&&!RE.award.some(x=>x.y===S.year)&&convCandidates(S).healed.length>=A.minPieces)
    evPush(S,ctx,{kind:"award",repEv:true,choices:A.choices,dflt:A.dflt,wait:A.wait},A.text);}
/* the day itself (a flash day or the Friday special): sittings, money after supplies, reputation and a little speed */
function evRepDay(S,id,r){
  const E=REP_EVENTS[id],n=evRepSittings(S,E,r),pay=evRub(S,n*(E.price-E.supplies));
  cashIn(S,evRub(S,n*E.price),id==="flash_day"?"flashday":"friday13");cashOut(S,evRub(S,n*E.supplies),"supplies");
  for(const k in E.rep)repAdd(S,k,E.rep[k]);
  for(const k in E.xp)skillGain(S,k,E.xp[k]);
  const rec=S.world.repEv[id];rec.n++;rec.sittings+=n;
  return{n,pay};}
const EV_REP_DO={
  flash_day(S,ev,ch,r){const E=REP_EVENTS.flash_day;if(ch!=="run")return evFill(E.says.skip,{});
    const d=evRepDay(S,"flash_day",r),mine=S.flash||[];
    repAdd(S,"walkins",E.own.walkins*Math.min(1,mine.length/E.own.full));   // a full wall of your own sheets draws a bigger crowd
    const top=mine.length?mine[r.int(0,mine.length-1)].name:"the swallows";
    return evFill(E.says.run,{n:d.n,top:String(top).toLowerCase(),pay:evFmt(d.pay)});},
  friday_13(S,ev,ch,r){const E=REP_EVENTS.friday_13;if(ch!=="run")return evFill(E.says.skip,{});
    const d=evRepDay(S,"friday_13",r);return evFill(E.says.run,{n:d.n,pay:evFmt(d.pay)});},
  magazine(S,ev,ch,r){const E=REP_EVENTS.magazine,p=S.pieces.find(x=>x.id===ev.piece),o={piece:p?p.name:"your best piece"};
    S.world.repEv.magazine.push({w:S.week,y:S.year,at:evNow(S),piece:ev.piece||null,yes:ch==="yes"});
    for(const k in E.rep[ch==="yes"?"yes":"no"])repAdd(S,k,E.rep[ch==="yes"?"yes":"no"][k]);
    if(ch==="yes"&&walkinsOpen(S)){const rc=r.fork("met"),c=makeClient(rc,{id:clNextId(S),year:S.year,week:S.week,stage:caStage(S),src:"referral",theme:"collector",badIdea:false});
      c.brief=E.met+" "+c.brief;const due=weekFrom(evNow(S)+rc.int(2,4));
      S.queue.push({id:queueId(S),kind:"consult",src:"referral",client:c.id,newClient:c,w:due.w,y:due.y,expires:weekIndex(due.w,due.y)+WEEK.consultWait,brief:c.brief,ask:c.ask,from:"magazine"});}
    return evFill(E.says[ch==="yes"?"yes":"no"],o);},
  award(S,ev,ch,r){const E=REP_EVENTS.award;if(ch!=="enter")return evFill(E.says.pass,{});
    const res=awardJudge(S,r);if(!res.pieces.length)return evFill(E.says.pass,{});
    const names=res.pieces.map(id=>{const p=S.pieces.find(x=>x.id===id);return p?p.label:"";}).filter(Boolean);
    const list=names.length>1?names.slice(0,-1).join(", ")+" and "+names[names.length-1]:names[0]||"your work";
    return res.place?evFill(E.says.won,{place:REP_EV_PLACE[res.place],pieces:"the "+list,prize:evFmt(res.prize)}):evFill(E.says.none,{pieces:"the "+list});}
};
/* awardJudge(S, r) -> {place 0..3, score, prize, pieces [ids]}: the best healed pieces (convCandidates), their mean
   healed score (how they read today, how they healed, their years) and how true they are to your signature, plus a little
   luck. Records the result in S.world.repEv.award, pays the prize and moves peers and collectors by place */
function awardJudge(S,r){
  worldEnsure(S);const E=REP_EVENTS.award,pk=convCandidates(S).healed.slice(0,E.pieces),sig=signatureOf(S);
  if(!pk.length)return{place:0,score:0,prize:0,pieces:[]};
  const q=pk.reduce((a,p)=>a+evHealedQ(S,p),0)/pk.length,on=pk.filter(p=>sig.ready&&p.design.style===sig.style).length/pk.length;
  const score=caR3(E.score.healed*q+E.score.sig*on*sig.strength+r.normal(0,E.sd));
  const place=score>=E.places[0]?1:score>=E.places[1]?2:score>=E.places[2]?3:0,prize=place?evRub(S,E.prize[place-1]):0;
  if(prize)cashIn(S,prize,"award");
  for(const k in E.rep)repAdd(S,k,E.rep[k][place?place-1:3]);
  const rec={y:S.year,place,score,pieces:pk.map(p=>p.id)};S.world.repEv.award.push(rec);
  return Object.assign({prize},rec);}

/* ===================== goals ===================== */
const EV_GOAL_CHECK={
  first_heal:S=>S.pieces.some(p=>!p.by&&p.heal==="crisp"),
  first_custom:S=>S.pieces.some(p=>!p.by&&p.price>0&&p.design&&!p.design.flash&&!(p.ret&&p.ret.rule==="touchup")),
  first_return:S=>S.pieces.some(p=>!p.by&&p.ret),
  first_award:S=>S.career.conv.some(c=>!c.own&&c.place>=1),
  studio:S=>!!S.career.reached.studio,
  hire:S=>(S.studio.nextStaff||1)>1||S.studio.staff.length>0,
  five_pieces:S=>S.clients.some(c=>(c.pieces||[]).length>=5),
  survive_rival:S=>{const now=evNow(S),lf=S.career.lastFail?weekIndex(S.career.lastFail.w,S.career.lastFail.y):-1;
    return evRivals(S).some(rv=>rv.status==="gone"||(rv.opened&&now-weekIndex(rv.opened.w,rv.opened.y)>=156&&caStage(S)!=="apprentice"&&lf<weekIndex(rv.opened.w,rv.opened.y)));},
  twenty_reads:S=>{for(const p of S.pieces){if(p.y>S.year-20)break;if(p.by||!p.heal)continue;if(S.year-p.y+(S.week-p.w)/WEEKS_PER_YEAR>=20&&caReads(S,p)>=LEGACY.reads)return true;}return false;},
  apprentice_shop:S=>S.career.apprentices.some(a=>a.status==="rival"),
  drawbridge:S=>((S.world&&S.world.repEv&&S.world.repEv.award)||[]).some(a=>a.place===1)   // first place only; first_award stays conventions
};
/* checkGoals(S, slow) -> [goal ids reached now] (S.goals[id] = {w, y}); slow checks only when slow is true */
function checkGoals(S,slow){
  worldEnsure(S);const out=[];
  for(const g of GOALS){if(S.goals[g.id]||(g.slow&&!slow))continue;let ok=false;try{ok=EV_GOAL_CHECK[g.id](S);}catch(e){ok=false;}
    if(ok){S.goals[g.id]={w:S.week,y:S.year};out.push(g.id);}}
  return out;}
function goalList(S){worldEnsure(S);return GOALS.map(g=>Object.assign({},g,{done:S.goals[g.id]||null}));}

/* ===================== the week (WEEK_HOOKS.events) ===================== */
function evWeek(S,ctx){
  const W=worldEnsure(S),C=S.career,now=ctx.now,st=caStage(S);
  /* a shop closed by the inspector: reopen, or move this week's sittings past the closure */
  if(C.closed){
    if(now>=C.closed.until){C.closed=null;evLog(ctx,"event",EVENTS.reopen);}
    else{const to=weekFrom(C.closed.until),mv=S.queue.filter(q=>q.kind==="session"&&weekIndex(q.w,q.y)<C.closed.until);
      for(const q of mv){q.w=to.w;q.y=to.y;q.moved=(q.moved||0)+1;}
      if(mv.length)evLog(ctx,"carried",evFill(EVENTS.moved,{n:mv.length,sittings:mv.length===1?"sitting":"sittings",w:to.w}),{n:mv.length});}}
  /* choices nobody made: the default happens */
  for(const ev of W.pending.slice())if(ev.until<now){const res=eventChoose(S,ev.id,ev.dflt);if(res.ok&&res.text)evLog(ctx,"note",res.text,{ev:ev.id});}
  evSocialWeek(S,ctx);
  evRivalsWeek(S,ctx);
  evReckonWeek(S,ctx);
  evRepWeek(S,ctx);
  if(st!=="apprentice"&&walkinsOpen(S)&&((S.rep&&S.rep.peers)||0)>=COVER_PUZZLE.peers&&!S.queue.some(q=>q.puzzle)&&ctx.r.fork("puzzle").chance(COVER_PUZZLE.chance))
    evCoverPuzzle(S,ctx,ctx.r.fork("puzzleClient"),null);
  for(const id of checkGoals(S,ctx.yearRolled||now%13===0)){const g=GOALS.find(x=>x.id===id);evLog(ctx,"goal",evFill(EVENTS.goal,{name:g.name}),{goal:id});}
}

WEEK_HOOKS.events=evWeek;WEEK_HOOKS.trend=evTrend;
SIM.TREND_WAVES=TREND_WAVES;SIM.SOCIAL=SOCIAL;SIM.RIVALS=RIVALS;SIM.RIVAL=RIVAL;SIM.RECKONINGS=RECKONINGS;SIM.COVER_PUZZLE=COVER_PUZZLE;
SIM.COVER_SCORE=COVER_SCORE;SIM.CONV_JUDGE=CONV_JUDGE;SIM.GOALS=GOALS;SIM.EVENTS=EVENTS;SIM.REP_EVENTS=REP_EVENTS;
SIM.friday13Weeks=friday13Weeks;SIM.awardJudge=awardJudge;SIM.repEventAt=evRepAt;
SIM.worldFresh=worldFresh;SIM.worldEnsure=worldEnsure;SIM.trendMult=trendMult;SIM.trendNow=trendNow;
SIM.followersTarget=followersTarget;SIM.canPost=canPost;SIM.postPiece=postPiece;SIM.eventChoose=eventChoose;
SIM.onReturn=onReturn;SIM.reckoningChoose=reckoningChoose;SIM.rivalsCopy=rivalsCopy;SIM.rivalWalkins=rivalWalkins;
SIM.coverOld=coverOld;SIM.coverScore=coverScore;SIM.foreignDesign=evForeignDesign;SIM.convCandidates=convCandidates;SIM.convJudge=convJudge;
SIM.checkGoals=checkGoals;SIM.goalList=goalList;SIM.finishSession=evFinish;SIM.rateMod=evRateMod;
