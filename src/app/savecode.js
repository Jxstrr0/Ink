/* ===================== app/savecode.js: SAVE CODES (Back up / Restore) =====================
   Lifted from Prairie Engine Works' savecode.js. One code holds everything Ink keeps in the browser, so a player can move
   to another phone or keep a copy somewhere safe. All of it lives in localStorage on this device; nothing is sent anywhere.
     save    the current game ("ink-save"), taken live with snapshot(). Settings ride in it.
     slots   the 3 manual slots ("ink-slot1" .. "ink-slot3"), null for an empty one
   Code = "INK1:" + body + a 6-character checksum. body = that object as JSON -> UTF-8 bytes -> LZW (9..16-bit codes) ->
   base64url (A-Z a-z 0-9 - _ only), so it survives notes apps, email and chat.
   Tattoos are saved as design parameters + session outputs + dates, never as pictures; everything visual is re-rendered.
   Restore checks everything before it writes anything: checksum, unpack, JSON, the shape of every save and a trial
   hydrate() of each. Then buWrite() writes all four keys and puts the old values back if any write fails.
   A NEW localStorage key must be added to buMake and buWrite (and check-savecode.js), and asked about first.
   The next version of this format is INK2:. Tests: `node check-savecode.js` in the repo root. */
const BU_V=1,BU_PREFIX="INK"+BU_V+":";
const BU_B64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",BU_MAXCODES=65536;
const BU_MSG={
  empty:"Paste a backup code into the box first.",
  damaged:"That code is damaged or cut off. Copy the whole code again, from INK1: right to the end, and paste it here.",
  newer:"That code was made by a newer version of the game. Reload the page to update, then try again.",
  other:"That's a save code from a different game. Ink backup codes start with \"INK1:\".",
  notcode:"That doesn't look like a save code. Backup codes start with \"INK1:\".",
  bad:"That code opened, but the save inside doesn't look right, so nothing was changed.",
  store:"This browser wouldn't let the game save (storage may be full or blocked), so nothing was changed."
};
const buFail=k=>{const e=new Error(BU_MSG[k]);e.bu=k;return e;};   // an error with a message that's fine to show the player

/* ---- packing: bytes <-> base64url text ---- */
function buBits(n){let b=1;while(n>=2){n>>>=1;b++;}return b;}   // how many bits it takes to write n
/* LZW over bytes. Bits go MSB-first into 6-bit base64url characters and the tail is zero-padded. A code's width is the
   bit length of the largest code the reader could see next, so both sides always agree on it. */
function buZip(bytes){
  const out=[];let acc=0,nacc=0;
  const put=(v,w)=>{for(let i=w-1;i>=0;i--){acc=acc<<1|(v>>>i&1);if(++nacc===6){out.push(BU_B64[acc]);acc=0;nacc=0;}}};
  if(!bytes.length)return"";
  const dict=new Map();let next=256,cur=bytes[0];
  for(let i=1;i<bytes.length;i++){
    const key=cur*256+bytes[i],hit=dict.get(key);
    if(hit!==undefined){cur=hit;continue;}
    put(cur,buBits(next-1));
    if(next<BU_MAXCODES)dict.set(key,next++);
    cur=bytes[i];}
  put(cur,buBits(next-1));
  if(nacc)out.push(BU_B64[acc<<(6-nacc)]);
  return out.join("");}
function buUnzip(str){
  let pos=0;const total=str.length*6,out=[];
  const read=w=>{let v=0;for(let i=0;i<w;i++,pos++){const d=BU_B64.indexOf(str[pos/6|0]);if(d<0)throw buFail("damaged");v=v*2+(d>>(5-pos%6)&1);}return v;};
  if(total<8)return out;
  const prefix=[],suffix=[],first=[];for(let i=0;i<256;i++){prefix.push(-1);suffix.push(i);first.push(i);}
  let size=256;
  const emit=code=>{const at=out.length;while(code>=0){out.push(suffix[code]);code=prefix[code];}   // the bytes come out backwards
    for(let a=at,b=out.length-1;a<b;a++,b--){const t=out[a];out[a]=out[b];out[b]=t;}};
  let prev=read(8);emit(prev);
  for(;;){
    const w=buBits(Math.min(size,BU_MAXCODES-1));
    if(total-pos<w)break;   // what's left is padding
    const code=read(w);let fb;
    if(code<size)fb=first[code];
    else if(code===size)fb=first[prev];   // the code being defined right now (the classic LZW "KwKwK" case)
    else throw buFail("damaged");
    if(size<BU_MAXCODES){prefix.push(prev);suffix.push(fb);first.push(first[prev]);size++;}
    emit(code);prev=code;}
  return out;}
/* FNV-1a of the body, as 6 base64url characters: a missing, extra or changed character almost surely won't match */
function buSum(body){let h=2166136261;for(let i=0;i<body.length;i++){h^=body.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  let s="";for(let i=0;i<6;i++){s+=BU_B64[h&63];h=Math.floor(h/64);}return s;}

/* ---- making a code ---- */
function buStored(k){try{const j=localStorage.getItem(k);if(!j)return null;const o=JSON.parse(j);return o&&typeof o==="object"&&!Array.isArray(o)?o:null;}catch(e){return null;}}
function buMake(){const slots=[];for(let i=1;i<=SLOTS;i++)slots.push(buStored(slotKey(i)));
  return{v:BU_V,at:Date.now(),ver:VERSION,save:snapshot(),slots};}
function buCode(d){const body=buZip(new TextEncoder().encode(JSON.stringify(d||buMake())));return BU_PREFIX+body+buSum(body);}

/* ---- checking a save before anything is written ---- */
const buObj=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
const buNum=v=>typeof v==="number"&&isFinite(v);
/* the shape of an Ink save. Fields later PRs add are checked here when they arrive */
function buSaveOk(o){
  if(!buObj(o))return false;
  if("settings" in o&&!buObj(o.settings))return false;
  for(const k of ["week","year","cash","seed"])if(k in o&&!buNum(o[k]))return false;
  for(const k of ["clients","pieces","queue"])if(k in o&&!Array.isArray(o[k]))return false;
  return buTry(o);}
/* load a copy the way the game would (hydrate), then put the running game back exactly as it was */
function buTry(o){const keepS=S;let ok=false;
  try{ok=hydrate(JSON.parse(JSON.stringify(o)))===true;}catch(e){ok=false;}
  finally{S=keepS;}
  return ok;}
function buFullOk(d){return buObj(d)&&d.v===BU_V&&buSaveOk(d.save)&&Array.isArray(d.slots)&&d.slots.length<=SLOTS
  &&d.slots.every(o=>o===null||buSaveOk(o));}

/* ---- reading a code: {kind:"full",data}. Spaces, line breaks and text around the code are fine.
   Throws buFail(...) with a message for the player. ---- */
function buRead(text){
  const s=String(text==null?"":text).replace(/[\s​-‍⁠﻿]+/g,"");
  if(!s)throw buFail("empty");
  const m=/INK(\d+):/.exec(s);
  if(!m){
    if(/(^|[^A-Za-z0-9])[A-Za-z]{2,8}\d+:[A-Za-z0-9_-]/.test(s))throw buFail("other");   // e.g. PEW1:... from another game
    throw buFail("notcode");}
  const n=+m[1];
  if(n!==BU_V)throw buFail(n>BU_V?"newer":"notcode");
  const c=s.slice(m.index+m[0].length).replace(/[^A-Za-z0-9_-].*$/,"");   // drop quotes or punctuation pasted after it
  if(c.length<7)throw buFail("damaged");
  const body=c.slice(0,-6);
  if(buSum(body)!==c.slice(-6))throw buFail("damaged");
  let d;try{d=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(new Uint8Array(buUnzip(body))));}catch(e){throw buFail("damaged");}
  if(!buFullOk(d))throw buFail("bad");
  return{kind:"full",data:d};}

/* ---- writing a checked backup: all four keys, or none of them ---- */
function buWrite(d){
  const keys=[[SAVE_KEY,d.save]];for(let i=1;i<=SLOTS;i++)keys.push([slotKey(i),d.slots[i-1]||null]);
  const old=[];
  try{for(const [k] of keys)old.push([k,localStorage.getItem(k)]);}catch(e){return false;}
  try{for(const [k,v] of keys){if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v));}return true;}
  catch(e){   // put the old values back: clear all first, so a full storage has room for what fitted before
    try{for(const [k] of old)localStorage.removeItem(k);for(const [k,v] of old)if(v!=null)localStorage.setItem(k,v);}catch(_){}
    return false;}}

/* ---- the two sheets (Settings › Save) ---- */
function buSelect(ta){try{ta.select();ta.setSelectionRange(0,ta.value.length);}catch(e){}}
async function buCopy(ta){
  try{await navigator.clipboard.writeText(ta.value);buMarkBackup();toast("Copied. Paste it somewhere safe.");return;}catch(e){}   // no clipboard access: select it instead
  ta.focus();buSelect(ta);let ok=false;try{ok=document.execCommand("copy");}catch(e){}
  if(ok)buMarkBackup();
  toast(ok?"Copied. Paste it somewhere safe.":"Code selected. Long-press it and tap Copy.");}
function buBackupOpen(){let code="";try{code=buCode();}catch(e){}
  if(!code){toast("Couldn't make a backup code on this device");return;}
  openSheet("Back up",`<p class="hint" style="margin-top:0">This code is your whole game: the current career, all 3 save slots and your settings. Keep it in your notes, then paste it into <b>Restore</b> on any phone or browser.</p>
<textarea class="code" id="codeOut" readonly spellcheck="false" aria-label="Your backup code"></textarea>
<p class="hint">${code.length.toLocaleString("en-CA")} characters, starting with ${BU_PREFIX}</p>
<div class="row"><button class="btn pri" id="copyCode" style="flex:1">Copy code</button></div>`);
  const ta=$("codeOut");ta.value=code;ta.addEventListener("focus",()=>buSelect(ta));
  $("copyCode").addEventListener("click",()=>buCopy(ta));$("copyCode").focus({preventScroll:true});}
function buRestoreOpen(){
  openSheet("Restore",`<p class="hint" style="margin-top:0">Paste a backup code (it starts with ${BU_PREFIX}). Restoring replaces your current career and all 3 save slots on this device.</p>
<textarea class="code" id="codeIn" placeholder="${BU_PREFIX}…" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-label="Backup code to restore" aria-describedby="codeErr"></textarea>
<p class="hint buerr" id="codeErr" role="alert"></p>
<div class="row"><button class="btn pri" id="doImport" style="flex:1">Restore</button></div>`);
  const ta=$("codeIn"),err=$("codeErr");
  ta.addEventListener("input",()=>{err.textContent="";});
  $("doImport").addEventListener("click",()=>buRestore(ta.value,err));
  if(matchMedia("(hover:hover) and (pointer:fine)").matches)ta.focus({preventScroll:true});}   // no surprise keyboard on phones
function buAsk(d){const when=buNum(d.at)?new Date(d.at).toLocaleString("en-CA",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"";
  const o=d.save,n=d.slots.filter(Boolean).length;
  return `Restore this backup?\n\n${when?"Made "+when+"\n":""}Week ${o.week||1}, ${o.year||2000}\n${n} of ${SLOTS} save slots used\n\nIt replaces your current career and all ${SLOTS} save slots on this device.`;}
function buRestore(text,err){
  const say=k=>{err.textContent=BU_MSG[k]||BU_MSG.damaged;};
  err.textContent="";
  let r;try{r=buRead(text);}catch(e){say(e&&e.bu||"damaged");return;}
  {const o=r.data.save,bk=S&&buNum(S.bkAt)?S.bkAt:0;if(bk>(buNum(o.bkAt)?o.bkAt:0))o.bkAt=bk;}   // this device's last-backup time survives a restore
  if(!confirm(buAsk(r.data)))return;
  if(!buWrite(r.data)){say("store");return;}
  closeSheet();applyLoaded(r.data.save,"Backup restored");buPersist();}

/* ---- backup files and keep-my-storage (from PEW 1.76.66). Every Longlight game lives at jxstrr0.github.io and shares
   one storage pot, which a phone short on space may clear all at once. buPersist() asks the browser to keep it;
   buFileSave() puts the same INK1: code in a text file; buFileLoad() runs a file through the Restore checks. ---- */
const BU_FILE_MAX=4e6;
let buPersistAsked=false;
function buPersist(){if(buPersistAsked)return;buPersistAsked=true;
  try{const st=typeof navigator!=="undefined"&&navigator.storage;if(!st||!st.persist||!st.persisted)return;
    st.persisted().then(p=>p||st.persist()).then(()=>{},()=>{});}catch(e){}}
function buMarkBackup(){if(!S)return;S.bkAt=Date.now();try{save();}catch(e){}buPersist();}
function buFileName(){const d=new Date(),p=n=>String(n).padStart(2,"0");return`ink-backup-${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}.txt`;}
async function buFileSave(){let code="";try{code=buCode();}catch(e){}
  if(!code){toast("Couldn't make a backup on this device");return;}
  const name=buFileName(),text=code+"\n";
  let file=null;try{file=new File([text],name,{type:"text/plain"});}catch(e){}
  if(file&&navigator.canShare&&navigator.share){let can=false;try{can=navigator.canShare({files:[file]});}catch(e){}
    if(can){try{await navigator.share({files:[file]});buMarkBackup();toast("Backup file saved");return;}
      catch(e){if(e&&e.name==="AbortError")return;}}}   // cancelled: not saved. Any other refusal falls back to a download
  try{const url=URL.createObjectURL(new Blob([text],{type:"text/plain"})),a=document.createElement("a");
    a.href=url;a.download=name;a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
    buMarkBackup();toast("Backup file saved: "+name);}
  catch(e){toast("Couldn't save a file here. Use Back up and copy the code.");}}
function buFileLoad(){const inp=$("bkFileIn");if(inp){inp.value="";inp.click();}}
async function buFileRead(inp){const f=inp.files&&inp.files[0];inp.value="";if(!f)return;
  let text="";
  if(f.size>BU_FILE_MAX)text="\u0000";   // far too big to be a backup: the Restore sheet says it isn't a code
  else{try{text=await f.text();}catch(e){text="";}}
  text=String(text).trim();
  buRestoreOpen();$("codeIn").value=text;
  buRestore(text||"\u0000",$("codeErr"));}
