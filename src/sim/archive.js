/* ===== sim/archive.js: keeping a 30-year save small (PR 7) =====
   A 30-year career meets 5,000+ people and makes 5,000+ pieces. Pieces are never dropped; clients never disappear.
   Two things keep the save small enough for localStorage:
     compactClients(S)  every CAREER_COMPACT_EVERY weeks (sim/career.js): S.clients keeps full records for the CLIENT_CAP
                        most recent or loyal clients (plus anyone on the books, on the board, in the chair or healing) and
                        compacts the rest IN PLACE (the same object, so references stay good) to
                        {id, name, first, pronouns, born, age, bodyShape, skinTone, traits, loyalty, since, lastSeen, visits,
                        pieces, referredBy, src, compact:true}. Walk-ins who walked out (no pieces) compact after
                        ARCHIVE.walkoutWeeks whatever the cap. Full records keep their last HISTORY_CAP history lines.
     expandClient(S, c) a compacted client who comes back (scheduleReturns) gets a fresh brief, wants and known from an rng
                        forked from their id and the week; everything the shop remembers (name, body, traits, loyalty, pieces)
                        stays. Their old history lines are gone; one note says so.
     packSave(S)        the form that is saved (ink-save, slots, backup codes): compacted clients and every piece but the
                        newest ARCHIVE.pieceFull become short arrays (numbers to 3 decimals, names and labels dropped when the
                        sim can rebuild them). Anything a tuple can't carry stays a plain object, so packing never loses a
                        field: every packed piece is unpacked and compared once (and cached per piece).
     unpackSave(o)      the reverse, in place (app/state.js hydrate). Plain objects pass through, so older saves load.
   Private helpers start with ar. ===== */
const CLIENT_CAP=200;
const HISTORY_CAP=30;
const ARCHIVE={loyalWeeks:180,pieceWeeks:12,walkoutWeeks:26,healingWeeks:8,pieceFull:50};
const AR_KEEP=["id","name","first","pronouns","born","age","bodyShape","skinTone","traits","loyalty","since","lastSeen","visits","pieces","referredBy","src","compact"];
const AR_STAGE={apprentice:"a",chair:"c",studio:"s",legacy:"l"},AR_STAGE_R={a:"apprentice",c:"chair",s:"studio",l:"legacy"};
const AR_SRC=["walkin","referral","return","friend"],AR_PRON=["she/her","he/him","they/them"],AR_BODY=["neutral","femme","masc"];
const AR_TRAITS=["pain","sun","aftercare","budget","loyalty","talkative","trusting"];

/* ---- compaction ---- */
function arProtected(S){
  const keep=new Set(),now=weekIndex(S.week,S.year);
  for(const q of S.queue||[])if(q.client)keep.add(q.client);
  if(S.board&&S.board.client)keep.add(S.board.client);
  const L=S.session&&S.session.live;if(L&&L.clientId)keep.add(L.clientId);
  for(let i=(S.pieces||[]).length-1;i>=0;i--){const p=S.pieces[i];if(now-weekIndex(p.w,p.y)>ARCHIVE.healingWeeks)break;keep.add(p.client);}
  const C=S.career;if(C){for(const id of C.friends||[])keep.add(id);for(const a of C.apprentices||[])if(a.shared)keep.add(a.shared);}
  return keep;}
function arScore(c){const ls=c.lastSeen||c.since||{w:1,y:2000};return weekIndex(ls.w||1,ls.y||2000)+(c.loyalty||0)*ARCHIVE.loyalWeeks+Math.min(10,(c.pieces||[]).length)*ARCHIVE.pieceWeeks;}
function clientCompact(c){
  for(const k of Object.keys(c))if(AR_KEEP.indexOf(k)<0)delete c[k];
  c.compact=true;if(!Array.isArray(c.pieces))c.pieces=[];
  return c;}
/* compactClients(S) -> how many were compacted this pass */
function compactClients(S){
  const keep=arProtected(S),now=weekIndex(S.week,S.year),full=[];let n=0;
  for(const c of S.clients){
    if(c.compact)continue;
    if(Array.isArray(c.history)&&c.history.length>HISTORY_CAP)c.history.splice(0,c.history.length-HISTORY_CAP);
    if(keep.has(c.id))continue;
    const ls=c.lastSeen||c.since||{w:1,y:2000};
    if(!(c.pieces||[]).length&&now-weekIndex(ls.w||1,ls.y||2000)>ARCHIVE.walkoutWeeks){clientCompact(c);n++;continue;}
    full.push(c);}
  let room=CLIENT_CAP-S.clients.filter(c=>!c.compact&&keep.has(c.id)).length;
  if(full.length>room){
    full.sort((a,b)=>arScore(b)-arScore(a));
    for(let i=Math.max(0,room);i<full.length;i++){clientCompact(full[i]);n++;}}
  return n;}
/* expandClient(S, c): a compacted client back as a full record (in place). A full client is returned as it is */
function expandClient(S,c){
  if(!c||!c.compact)return c;
  const n=makeClient(rng(S.seed).fork("expand:"+c.id+":"+weekIndex(S.week,S.year)),{id:c.id,year:S.year,week:S.week,stage:(S.studio&&S.studio.stage)||"chair",badIdea:false,src:"return"});
  const first=c.first||String(c.name||"").split(" ")[0];
  Object.assign(c,{first,surname:String(c.name||"").slice(first.length+1),patronymic:null,addr:first,job:n.job,cover:n.cover,wants:n.wants,mustHaves:n.mustHaves,
    dealbreakers:n.dealbreakers,known:n.known,brief:n.brief,ask:n.ask,theme:n.theme,briefId:n.briefId,firstTattoo:false,
    history:[{w:S.week,y:S.year,kind:"note",text:"back after a long while; older notes are archived"}]});
  if(c.born!=null)c.age=S.year-c.born;
  if(!c.traits)c.traits=n.traits;
  delete c.compact;
  return c;}

/* ---- packing ---- */
const arI=v=>Math.round(v*1000),arF=v=>v/1000,arH=v=>Math.round(v*100),arHf=v=>v/100;
function arNum(id,pre){const m=new RegExp("^"+pre+"(\\d+)$").exec(id||"");return m?+m[1]:id;}
function arId(v,pre){return typeof v==="number"?pre+v:v;}
const AR_EL=["id","x","y","scale","rot","lineWeight","fill","colour"];
function arElsPack(els){
  const out=[];for(const e of els){for(const k in e)if(AR_EL.indexOf(k)<0)return null;
    if(typeof e.id!=="string"||e.id.indexOf(":")>=0||e.id.indexOf(";")>=0)return null;
    out.push([e.id,arI(e.x!=null?e.x:0.5),arI(e.y!=null?e.y:0.5),arI(e.scale!=null?e.scale:0.5),arH(e.rot||0),e.lineWeight!=null?e.lineWeight:"",arI(e.fill||0),e.colour||""].join(":"));}
  return out.join(";");}
function arElsUnpack(s){if(!s)return[];return s.split(";").map(t=>{const a=t.split(":");
  return{id:a[0],x:arF(+a[1]),y:arF(+a[2]),scale:arF(+a[3]),rot:arHf(+a[4]),lineWeight:a[5]===""?undefined:+a[5],fill:arF(+a[6]),colour:a[7]||null};});}
const AR_D=["placement","sizeMm","style","pos","flash","elements"];
function arDesignPack(d){
  if(!d||typeof d!=="object"||!Array.isArray(d.elements))return null;
  const els=arElsPack(d.elements);if(els==null)return null;
  const x={};for(const k in d)if(AR_D.indexOf(k)<0)x[k]=d[k];
  const pos=d.pos&&typeof d.pos==="object"?[arI(d.pos.x),arI(d.pos.y)]:0;
  return[d.placement,arH(d.sizeMm||0),d.style,pos,d.flash||0,els,Object.keys(x).length?x:0];}
function arDesignUnpack(t){
  const d={placement:t[0],sizeMm:arHf(t[1]),style:t[2]};
  if(t[3])d.pos={x:arF(t[3][0]),y:arF(t[3][1])};
  d.flash=t[4]||null;d.elements=arElsUnpack(t[5]);if(t[6])Object.assign(d,t[6]);
  if(d.flash===null&&t[7]===1)delete d.flash;
  return d;}
const AR_OUT=["lineQuality","depthQuality","saturation","trauma"],AR_OUTN=["sessionsUsed","blowouts","joins"];
/* the kit a piece was done with, as one number: INKS index x 10 + MACHINES index (unknown ids stay as they are) */
function arKit(p){const I=Object.keys(SIM.INKS||{}),M=Object.keys(SIM.MACHINES||{}),i=I.indexOf(p.ink),m=M.indexOf(p.machine);return i>=0&&m>=0&&m<10?i*10+m:null;}
const AR_P=["id","client","design","out","heal","w","y","name","label","stage","price","healW","healY","healDue"];
/* who the piece's client is, for its name: a real client's first name, a staff piece's guest, else null */
function arFirst(p,byId){const c=byId.get(p.client);if(c)return c.first||String(c.name||"").split(" ")[0];if(p.guest&&p.guest.n)return p.guest.n;return null;}
function arPiecePack(p,byId){
  const d=arDesignPack(p.design);if(!d)return null;
  if(p.design.flash===undefined)d[7]=1;
  const x={};for(const k in p)if(AR_P.indexOf(k)<0)x[k]=p[k];
  let o=0;if(p.out&&typeof p.out==="object"){o=AR_OUT.map(k=>p.out[k]!=null?arI(p.out[k]):"");
    if(AR_OUTN.some(k=>p.out[k]!=null))for(const k of AR_OUTN)o.push(p.out[k]!=null?p.out[k]:"");
    const ox={};for(const k in p.out)if(AR_OUT.indexOf(k)<0&&AR_OUTN.indexOf(k)<0)ox[k]=p.out[k];if(Object.keys(ox).length)x["~o"]=ox;}
  else if(p.out!==null&&p.out!==undefined)return null;
  /* the session's copies of sittings, blowouts and joins, the kit, a staff piece's client */
  if(AR_OUTN.some(k=>x[k]!=null)){x["~s"]=AR_OUTN.map(k=>x[k]!=null?x[k]:"");for(const k of AR_OUTN)delete x[k];}
  if(x.ink!=null||x.machine!=null){const kc=arKit(p);if(kc!=null){x["~k"]=kc;delete x.ink;delete x.machine;}}
  if(x.guest&&typeof x.guest==="object"&&Object.keys(x.guest).join()==="n,t,a,s"&&String(x.guest.n).indexOf("|")<0){const g=x.guest;x["~g"]=[g.n,arH(g.t),arH(g.a),arH(g.s)].join("|");delete x.guest;}
  if(p.out===undefined)x["~u"]=1;
  const label=pieceLabel(p.design);if(p.label!==label)x.label=p.label;
  const first=arFirst(p,byId);if(first==null||p.name!==pieceName(p.label,{first},p.design.placement))x.name=p.name;
  const wi=weekIndex(p.w,p.y);
  if(p.healDue){const hd=weekFrom(wi+2);if(p.healDue.w!==hd.w||p.healDue.y!==hd.y)x.healDue=p.healDue;else x["~d"]=1;}
  const hw=p.healW!=null?weekIndex(p.healW,p.healY):-1;
  const cl=p.client==="x"+arNum(p.id,"p")?-1:arNum(p.client,"c");
  return[arNum(p.id,"p"),cl,wi,d,o,p.heal||0,hw,AR_STAGE[p.stage]||p.stage||0,p.price||0,Object.keys(x).length?x:0];}
function arPieceUnpack(t,byId){
  const wk=weekFrom(t[2]),x=t[9]||{};
  const p={id:arId(t[0],"p"),client:t[1]===-1?"x"+t[0]:arId(t[1],"c"),design:arDesignUnpack(t[3]),out:null,heal:t[5]||null,w:wk.w,y:wk.y};
  if(t[4]){p.out={};AR_OUT.forEach((k,i)=>{if(t[4][i]!=="")p.out[k]=arF(t[4][i]);});
    AR_OUTN.forEach((k,i)=>{const v=t[4][4+i];if(v!==undefined&&v!=="")p.out[k]=v;});if(x["~o"])Object.assign(p.out,x["~o"]);}
  if(x["~u"])delete p.out;
  p.label=x.label!=null?x.label:pieceLabel(p.design);
  for(const k in x)if(k.charAt(0)!=="~"&&k!=="label")p[k]=x[k];
  if(x["~s"])AR_OUTN.forEach((k,i)=>{if(x["~s"][i]!=="")p[k]=x["~s"][i];});
  if(x["~k"]!=null){p.ink=Object.keys(SIM.INKS||{})[Math.floor(x["~k"]/10)];p.machine=Object.keys(SIM.MACHINES||{})[x["~k"]%10];}
  if(x["~g"]){const g=x["~g"].split("|");p.guest={n:g[0],t:arHf(+g[1]),a:arHf(+g[2]),s:arHf(+g[3])};}
  if(p.name==null){const first=arFirst(p,byId);p.name=pieceName(p.label,{first},p.design.placement);}
  p.stage=AR_STAGE_R[t[7]]||t[7]||undefined;if(p.stage===undefined)delete p.stage;
  p.price=t[8]||0;
  if(t[6]>=0){const h=weekFrom(t[6]);p.healW=h.w;p.healY=h.y;}
  if(x["~d"])p.healDue=weekFrom(t[2]+2);
  return p;}
/* deep compare with a tolerance for numbers packed to 3 decimals (rotations and sizes to 2) */
function arSame(a,b){
  if(typeof a==="number"&&typeof b==="number")return Math.abs(a-b)<=0.0006+0.0006*Math.abs(b);
  if(a===b)return true;if(a==null||b==null)return false;
  if(typeof a!=="object"||typeof b!=="object"||Array.isArray(a)!==Array.isArray(b))return false;
  const ka=Object.keys(a).filter(k=>a[k]!==undefined),kb=Object.keys(b).filter(k=>b[k]!==undefined);
  if(ka.length!==kb.length)return false;for(const k of kb)if(!arSame(a[k],b[k]))return false;return true;}
const arCache=new WeakMap();
function arPieceSig(p){return(p.heal||"")+"|"+(p.healW||"")+"|"+(p.portfolio?1:0)+"|"+(p.review?1:0)+"|"+(p.price||0)+"|"+p.client+"|"+(p.name||"");}
function arPieceSaved(p,byId){
  const sig=arPieceSig(p),hit=arCache.get(p);if(hit&&hit.sig===sig)return hit.t;
  let t=arPiecePack(p,byId);
  if(t){let ok=false;try{ok=arSame(arPieceUnpack(JSON.parse(JSON.stringify(t)),byId),p);}catch(e){ok=false;}if(!ok)t=p;}else t=p;
  arCache.set(p,{sig,t});return t;}
function arClientPack(c){
  const x={};for(const k in c)if(AR_KEEP.indexOf(k)<0||k==="age")x[k]=c[k];delete x.age;
  const first=String(c.name||"").split(" ")[0],tr=c.traits||{};
  const pi=AR_PRON.indexOf(c.pronouns),bi=AR_BODY.indexOf(c.bodyShape),si=AR_SRC.indexOf(c.src);
  const since=c.since?weekIndex(c.since.w,c.since.y):-1,last=c.lastSeen?weekIndex(c.lastSeen.w,c.lastSeen.y):-1;
  return[arNum(c.id,"c"),c.name,c.first===first?0:c.first,pi>=0?pi:c.pronouns,c.born!=null?c.born:-1,bi>=0?bi:c.bodyShape,arH(c.skinTone||0),
    AR_TRAITS.map(k=>tr[k]!=null?arH(tr[k]):""),arH(c.loyalty||0),since,last,c.visits||0,c.referredBy?arNum(c.referredBy,"c"):0,si>=0?si:(c.src||""),Object.keys(x).length?x:0];}
function arClientUnpack(t,year){
  const c={id:arId(t[0],"c"),name:t[1],first:t[2]||String(t[1]||"").split(" ")[0],pronouns:typeof t[3]==="number"?AR_PRON[t[3]]:t[3]};
  if(t[4]>=0){c.born=t[4];c.age=(year||2000)-t[4];}
  c.bodyShape=typeof t[5]==="number"?AR_BODY[t[5]]:t[5];c.skinTone=arHf(t[6]);
  c.traits={};AR_TRAITS.forEach((k,i)=>{if(t[7][i]!=="")c.traits[k]=arHf(t[7][i]);});
  c.loyalty=arHf(t[8]);if(t[9]>=0)c.since=weekFrom(t[9]);if(t[10]>=0)c.lastSeen=weekFrom(t[10]);
  c.visits=t[11];c.pieces=[];c.referredBy=t[12]?arId(t[12],"c"):null;c.src=typeof t[13]==="number"?AR_SRC[t[13]]:t[13];
  if(t[14])Object.assign(c,t[14]);c.compact=true;
  return c;}
/* packSave(S) -> the object that is saved. Shares S's objects for whatever isn't packed; JSON.stringify it right away */
function packSave(S){
  const cl=S.clients||[],ps=S.pieces||[],byId=new Map();for(const c of cl)byId.set(c.id,c);
  const clients=cl.map(c=>c.compact?arClientPack(c):c);
  const cut=ps.length-ARCHIVE.pieceFull,pieces=ps.map((p,i)=>i<cut&&p&&typeof p==="object"?arPieceSaved(p,byId):p);
  return Object.assign({},S,{clients,pieces});}
/* unpackSave(o): arrays back into records, in place; compacted clients get their pieces lists back. -> o */
function unpackSave(o){
  if(!o||typeof o!=="object")return o;
  let any=false;
  if(Array.isArray(o.clients))o.clients=o.clients.map(c=>{if(Array.isArray(c)){any=true;return arClientUnpack(c,o.year);}return c;});
  if(Array.isArray(o.pieces)&&o.pieces.some(Array.isArray)){
    any=true;const byId=new Map();for(const c of o.clients||[])if(c&&c.id)byId.set(c.id,c);
    o.pieces=o.pieces.map(p=>Array.isArray(p)?arPieceUnpack(p,byId):p);}
  if(any){const byId=new Map();for(const c of o.clients||[])if(c&&c.compact){c.pieces=[];byId.set(c.id,c);}
    for(const p of o.pieces||[]){const c=p&&byId.get(p.client);if(c)c.pieces.push(p.id);}}
  return o;}

SIM.CLIENT_CAP=CLIENT_CAP;SIM.HISTORY_CAP=HISTORY_CAP;SIM.ARCHIVE=ARCHIVE;SIM.compactClients=compactClients;SIM.clientCompact=clientCompact;
SIM.expandClient=expandClient;SIM.packSave=packSave;SIM.unpackSave=unpackSave;
