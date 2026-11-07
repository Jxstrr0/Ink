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
                        0.1.20.0 packs those pieces harder: each tuple is then written as one comma-separated string
                        (AR_V2: the id and week as steps from the piece before, usual values as "0", the heal grade as a
                        digit). It is the same tuple, losslessly (whole numbers only), and each string is unpacked and
                        checked against the piece as a tuple is; a piece that won't go into a string stays a tuple. Nothing
                        is rounded further, so an old piece renders and ages exactly as before.
     unpackSave(o)      the reverse, in place (app/state.js hydrate). Plain objects pass through, and tuples (the 0.1.19.0
                        form) still unpack, so older saves load.
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
const AR_NUM_RE={};
function arNum(id,pre){const re=AR_NUM_RE[pre]||(AR_NUM_RE[pre]=new RegExp("^"+pre+"(\\d+)$"));const m=re.exec(id||"");return m?+m[1]:id;}
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
  let na=0,nb=0;
  if(Array.isArray(a)){for(let i=0;i<a.length;i++)if(a[i]!==undefined)na++;
    for(let i=0;i<b.length;i++){if(b[i]===undefined)continue;nb++;if(!arSame(a[i],b[i]))return false;}return na===nb;}
  for(const k in a)if(a[k]!==undefined)na++;
  for(const k in b){if(b[k]===undefined)continue;nb++;if(!arSame(a[k],b[k]))return false;}return na===nb;}
const arCache=new WeakMap();
function arPieceSig(p){return(p.heal||"")+"|"+(p.healW||"")+"|"+(p.portfolio?1:0)+"|"+(p.review?1:0)+"|"+(p.price||0)+"|"+p.client+"|"+(p.name||"");}
function arPieceSaved(p,byId){
  const sig=arPieceSig(p),hit=arCache.get(p);if(hit&&hit.sig===sig)return hit.t;
  let t=arPiecePack(p,byId);
  if(t){let ok=false;try{ok=arSame(arPieceUnpack(JSON.parse(JSON.stringify(t)),byId),p);}catch(e){ok=false;}if(!ok)t=p;}else t=p;
  arCache.set(p,{sig,t});return t;}
/* ---- 0.1.20.0: a packed piece's tuple as one string (AR_V2) ----
   Fields are split by "," and an empty field is "0"; lists inside a field (outputs, offset, guest, an element's parts)
   use " ", elements ";". The backup code's LZW learns its dictionary from the start of the save (the archived clients,
   plain JSON numbers), so a string of numbers and commas squeezes far better than one with new separators.
   fields, in order:  0 id step from the piece before, less 1  1 client number  2 week step from the piece before
     3 placement  4 size in mm  5 style  6 elements (x/y 500, scale 1000 and turn 0 left empty)  7 outputs
     8 heal grade (AR_V2.heal index + 1)  9 healed week, steps after the piece less 2 ("n" = not healed yet)  10 stage
     11 price / 100  12 placement offset  13 flash  14 "1" when the design had no flash field  15 kit + 1  16 by
     17 guest  18 return ("rule piece-number")  19 anything else, as JSON (last, so it may hold ",")
   "0" fields at the end are dropped. "The piece before" is the previous entry of S.pieces, whatever form it is saved in. */
const AR_V2={sep:",",sub:" ",fields:19,heal:["crisp","soft","patchy","blownout","infected"],el:{1:"500",2:"500",3:"1000",4:"0"}};
function arBase(p){if(!p||typeof p!=="object")return[0,0];const n=arNum(p.id,"p");
  return[typeof n==="number"?n:0,typeof p.w==="number"&&typeof p.y==="number"?weekIndex(p.w,p.y):0];}
const arOkS=v=>typeof v==="string"&&v!==""&&v!=="0"&&!/[, ;]/.test(v);
const arNumS=v=>typeof v==="number"&&isFinite(v);
const arC=v=>String(v/100),arCf=s=>Math.round(+s*100);
function arElsV2(s,pack){if(!s)return s;return s.split(";").map(e=>{const a=e.split(pack?":":AR_V2.sub);
  for(const i in AR_V2.el){if(pack&&a[i]===AR_V2.el[i])a[i]="";else if(!pack&&a[i]==="")a[i]=AR_V2.el[i];}return a.join(pack?AR_V2.sub:":");}).join(";");}
/* arV2Pack(t, base) -> the string, or null when this tuple won't go into one */
function arV2Pack(t,base){
  if(!Array.isArray(t)||t.length!==10)return null;
  const [id,cl,wi,d,o,heal,hw,st,price,x0]=t,S_=AR_V2.sub;
  const I=Number.isInteger;
  if(!I(id)||!I(cl)||!I(wi)||!I(hw)||!I(price)||!Array.isArray(d)||(d.length!==7&&d.length!==8))return null;
  const [pl,sz,sty,pos,fl,els,dx,f7]=d;
  if(!arOkS(pl)||!I(sz)||!arOkS(sty)||typeof els!=="string"||/[, ]/.test(els)||dx!==0||(d.length===8&&f7!==1))return null;
  if(pos!==0&&!(Array.isArray(pos)&&pos.length===2&&arNumS(pos[0])&&arNumS(pos[1])))return null;
  if(fl!==0&&!arOkS(fl))return null;
  if(o!==0&&!(Array.isArray(o)&&o.length>1&&o.every(v=>v===""||arNumS(v))))return null;
  if(heal!==0&&AR_V2.heal.indexOf(heal)<0)return null;
  if(st!==0&&!arOkS(st))return null;
  if(x0!==0&&(!x0||typeof x0!=="object"||Array.isArray(x0)))return null;
  const x=Object.assign({},x0||{});let kit="0",by="0",g="0",ret="0";
  if(arNumS(x["~k"])&&x["~k"]>=0){kit=String(x["~k"]+1);delete x["~k"];}
  if(arOkS(x.by)){by=x.by;delete x.by;}
  if(typeof x["~g"]==="string"&&!/[, ]/.test(x["~g"])&&x["~g"]!=="0"){g=x["~g"].split("|").join(S_);delete x["~g"];}
  const R=x.ret;if(R&&typeof R==="object"&&Object.keys(R).join()==="rule,piece"&&arOkS(R.rule)&&(R.piece===null||/^p\d+$/.test(R.piece))){
    ret=R.rule+(R.piece===null?"":S_+R.piece.slice(1));delete x.ret;}
  const f=[String(id-base[0]-1),String(cl),String(wi-base[1]),pl,arC(sz),sty,arElsV2(els,true),o?o.join(S_):"0",
    heal?String(AR_V2.heal.indexOf(heal)+1):"0",hw===-1?"n":String(hw-wi-2),st||"0",arC(price),pos?pos.join(S_):"0",fl||"0",d.length===8?"1":"0",kit,by,g,ret];
  if(Object.keys(x).length)f.push(JSON.stringify(x));else while(f.length>7&&f[f.length-1]==="0")f.pop();
  return f.join(AR_V2.sep);}
/* arV2Unpack(s, base) -> the tuple */
function arV2Unpack(s,base){
  const f=[],S_=AR_V2.sub;let i=0;
  while(f.length<AR_V2.fields){const j=s.indexOf(AR_V2.sep,i);if(j<0){f.push(s.slice(i));i=-1;break;}f.push(s.slice(i,j));i=j+1;}
  const rest=i>=0&&f.length===AR_V2.fields?s.slice(i):"";while(f.length<AR_V2.fields)f.push("0");
  const wi=base[1]+(+f[2]),d=[f[3],arCf(f[4]),f[5],f[12]==="0"?0:f[12].split(S_).map(Number),f[13]==="0"?0:f[13],arElsV2(f[6],false),0];
  if(f[14]==="1")d.push(1);
  const x=rest?JSON.parse(rest):{};
  if(f[15]!=="0")x["~k"]=f[15]-1;if(f[16]!=="0")x.by=f[16];if(f[17]!=="0")x["~g"]=f[17].split(S_).join("|");
  if(f[18]!=="0"){const k=f[18].indexOf(S_);x.ret=k<0?{rule:f[18],piece:null}:{rule:f[18].slice(0,k),piece:"p"+f[18].slice(k+1)};}
  return[base[0]+1+(+f[0]),+f[1],wi,d,f[7]==="0"?0:f[7].split(S_).map(v=>v===""?"":+v),f[8]==="0"?0:AR_V2.heal[f[8]-1],
    f[9]==="n"?-1:wi+2+(+f[9]),f[10]==="0"?0:f[10],arCf(f[11]),Object.keys(x).length?x:0];}
/* the saved form of an older piece: its string when the piece goes into one and unpacks from it to the same piece
   (arSame, as for a tuple), else what arPieceSaved gives (a checked tuple, or the record). Cached per piece */
const arCache2=new WeakMap();
function arPieceSavedV2(p,byId,prev){
  const sig=arPieceSig(p)+(prev&&typeof prev==="object"?"|"+prev.id+","+prev.w+","+prev.y:"|"),hit=arCache2.get(p);if(hit&&hit.sig===sig)return hit.s;
  const base=arBase(prev);let s=null;
  try{const t=arPiecePack(p,byId);s=t&&arV2Pack(t,base);if(s!=null&&!arSame(arPieceUnpack(arV2Unpack(s,base),byId),p))s=null;}catch(e){s=null;}
  if(s==null)s=arPieceSaved(p,byId);
  arCache2.set(p,{sig,s});return s;}
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
/* packSave(S, opt) -> the object that is saved. Shares S's objects for whatever isn't packed; JSON.stringify it right away.
   opt.tuples writes older pieces in the 0.1.19.0 form (tuples, no strings): tools/sim-test.js checks such saves still load */
function packSave(S,opt){
  const cl=S.clients||[],ps=S.pieces||[],byId=new Map();for(const c of cl)byId.set(c.id,c);
  const clients=cl.map(c=>c.compact?arClientPack(c):c);
  const cut=ps.length-ARCHIVE.pieceFull,pieces=ps.map((p,i)=>i<cut&&p&&typeof p==="object"?(opt&&opt.tuples?arPieceSaved(p,byId):arPieceSavedV2(p,byId,ps[i-1])):p);
  return Object.assign({},S,{clients,pieces});}
/* unpackSave(o): arrays back into records, in place; compacted clients get their pieces lists back. -> o */
function unpackSave(o){
  if(!o||typeof o!=="object")return o;
  let any=false;
  if(Array.isArray(o.clients))o.clients=o.clients.map(c=>{if(Array.isArray(c)){any=true;return arClientUnpack(c,o.year);}return c;});
  /* pieces: a string (0.1.20.0, decoded against the piece before it, already unpacked) or a tuple (0.1.19.0 and before) */
  if(Array.isArray(o.pieces)&&o.pieces.some(p=>Array.isArray(p)||typeof p==="string")){
    any=true;const byId=new Map();for(const c of o.clients||[])if(c&&c.id)byId.set(c.id,c);
    const L=o.pieces;for(let i=0;i<L.length;i++){const p=L[i];
      if(typeof p==="string")L[i]=arPieceUnpack(arV2Unpack(p,arBase(i?L[i-1]:null)),byId);else if(Array.isArray(p))L[i]=arPieceUnpack(p,byId);}}
  if(any){const byId=new Map();for(const c of o.clients||[])if(c&&c.compact){c.pieces=[];byId.set(c.id,c);}
    for(const p of o.pieces||[]){const c=p&&byId.get(p.client);if(c)c.pieces.push(p.id);}}
  return o;}

SIM.CLIENT_CAP=CLIENT_CAP;SIM.HISTORY_CAP=HISTORY_CAP;SIM.ARCHIVE=ARCHIVE;SIM.compactClients=compactClients;SIM.clientCompact=clientCompact;
SIM.expandClient=expandClient;SIM.packSave=packSave;SIM.unpackSave=unpackSave;SIM.AR_V2=AR_V2;
