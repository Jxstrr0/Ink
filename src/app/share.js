/* ===================== app/share.js: share cards (PR 9) =====================
   Three picture cards, all drawn on a plain 2D canvas (cheap on a Lite phone, no WebGL needed):
     shPieceCard(id)   a healed piece on its limb as it looks today, with the design's name, whose it is and where
                       ("Olga's forearm": the client's first name, 0.1.13.0; every client is invented), the style and year
     shGoalCard(id)    a trophy card for one of the career's GOALS (sim/events.js)
     shLegacyCard()    the Legacy screen's summary (INK_SIM.legacySummary)
   Every card is cream paper with black ink, like a flash sheet, and carries the credit line "© year Kelbo / Longlight
   Interactive". Pieces come from gvSvg (app/gallery.js), so the card is the same render as the body of work: nothing is
   saved, everything is drawn again from the sim. Names on the cards are the game's own invented ones.
   One share path, Prairie Engine Works' phoSave pattern (shSave): the phone's share sheet with the PNG file where the
   browser can share files, else a download; the toast says which one happened. */
const SHARE={w:1080,h:1350,pad:72,
  paper:"#f3ead8",ink:"#16120e",mute:"#6b6255",line:"#d8ccb4",red:"#b3432c",
  disp:'600 {px}px Oswald,"Arial Narrow",Impact,sans-serif',ui:'{w} {px}px "Space Grotesk",-apple-system,"Segoe UI",sans-serif',
  piece:{top:240,h:740,limb:0.62,minShare:0.24,maxZoom:2.4},   // the limb window: where it sits, how wide the limb is drawn, and
                                                              // how far a small piece on a big zone is zoomed in (to minShare)
  credit:()=>`© ${new Date().getFullYear()} Kelbo / Longlight Interactive`};
const SHR={busy:false};   // one card at a time
const SH_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>';   // the Share card buttons' icon
const shFont=(k,px,w)=>SHARE[k].replace("{px}",px).replace("{w}",w||500);
const shSlug=s=>String(s||"card").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"card";
/* shSave(canvas, file name, title): the share sheet with the file if this browser can share files, else a download */
async function shSave(c,fn,title){
  let blob=null;try{blob=await new Promise(r=>c.toBlob(r,"image/png"));}catch(e){blob=null;}
  if(!blob){toast("Couldn't make the picture here");return false;}
  let file=null;try{file=new File([blob],fn,{type:"image/png"});}catch(e){}
  if(file&&navigator.share&&navigator.canShare){let can=false;try{can=navigator.canShare({files:[file]});}catch(e){}
    if(can){try{await navigator.share({files:[file],title});toast("Card shared");return true;}
      catch(e){if(e&&e.name==="AbortError"){toast("Share cancelled");return false;}}}}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fn;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),8000);toast("Card downloaded (this browser can't share pictures)");return true;}
/* the canvas, with the fonts loaded first (they're the page's Google Fonts; a card drawn before they arrive falls back) */
async function shCanvas(){
  try{if(document.fonts&&document.fonts.load)await Promise.all([document.fonts.load(shFont("disp",40)),document.fonts.load(shFont("ui",30,500)),document.fonts.load(shFont("ui",30,700))]);}catch(e){}
  const c=document.createElement("canvas");c.width=SHARE.w;c.height=SHARE.h;const x=c.getContext("2d");
  x.fillStyle=SHARE.paper;x.fillRect(0,0,c.width,c.height);
  x.strokeStyle=SHARE.line;x.lineWidth=4;x.strokeRect(28,28,c.width-56,c.height-56);
  return{c,x};}
function shFit(x,s,max){s=String(s==null?"":s);while(s.length>3&&x.measureText(s).width>max)s=s.slice(0,-2)+"…";return s;}
function shWrap(x,s,max){const out=[];let line="";for(const w of String(s||"").split(/\s+/)){const t=line?line+" "+w:w;if(x.measureText(t).width>max&&line){out.push(line);line=w;}else line=t;}if(line)out.push(line);return out;}
function shText(x,s,X,Y,font,col,align){x.font=font;x.fillStyle=col||SHARE.ink;x.textAlign=align||"left";x.textBaseline="alphabetic";x.fillText(s,X,Y);}
/* the brand at the top, the credit line at the foot */
function shFrame(x,kicker){const P=SHARE.pad,W=SHARE.w,H=SHARE.h;
  shText(x,"INK",P,P+60,shFont("disp",64),SHARE.ink);x.font=shFont("disp",64);const bw=x.measureText("INK").width;shText(x,".",P+bw+2,P+60,shFont("disp",64),SHARE.red);
  if(kicker)shText(x,shFit((x.font=shFont("ui",26,600),x),kicker.toUpperCase(),W-2*P-200),W-P,P+52,shFont("ui",26,600),SHARE.mute,"right");
  x.fillStyle=SHARE.line;x.fillRect(P,P+92,W-2*P,3);
  x.fillStyle=SHARE.line;x.fillRect(P,H-P-58,W-2*P,3);
  shText(x,SHARE.credit(),P,H-P,shFont("ui",26,500),SHARE.mute);
  shText(x,"Mostograd",W-P,H-P,shFont("ui",26,500),SHARE.mute,"right");}
/* an SVG string to an image at a pixel size */
function shImg(svg,w,h){return new Promise(res=>{
  const s=svg.replace("<svg ",`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" `).replace(/ class="[^"]*"/,"");
  const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(s);});}
function shRound(x,X,Y,w,h,r){r=Math.min(r,w/2,h/2);x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();}
/* one piece on its limb in a window: the placement's box as skin (rounded like the board's limb, shaded at the sides so it
   reads as round), the piece drawn on it today, zoomed in when the piece is small on a big zone */
async function shLimb(x,p,X,Y,W,H){
  const t=gvSvg(p,{bare:true}),box=t.box||{wrapMm:100,lengthMm:200},vb=t.vb;
  const L=SHARE.piece;let k=Math.min(W*L.limb/box.wrapMm,H*0.96/box.lengthMm);
  if(vb&&vb.w*k<W*L.minShare)k=Math.min(W*L.minShare/vb.w,k*L.maxZoom);
  const cx=vb?vb.x+vb.w/2:box.wrapMm/2,cy=vb?vb.y+vb.w/2:box.lengthMm/2;
  /* the window's mm origin: centre on the piece, but keep the limb in view where it fits */
  const vw=W/k,vh=H/k;let ox=cx-vw/2,oy=cy-vh/2;
  if(vw>=box.wrapMm)ox=(box.wrapMm-vw)/2;else ox=clamp(ox,-vw*0.08,box.wrapMm-vw*0.92);
  if(vh>=box.lengthMm)oy=(box.lengthMm-vh)/2;else oy=clamp(oy,-vh*0.08,box.lengthMm-vh*0.92);
  const mx=v=>X+(v-ox)*k,my=v=>Y+(v-oy)*k;
  x.save();x.beginPath();x.rect(X,Y,W,H);x.clip();
  const lx=mx(0),ly=my(0),lw=box.wrapMm*k,lh=box.lengthMm*k,r=Math.min(lw,lh)*0.22;
  shRound(x,lx,ly,lw,lh,r);x.fillStyle=t.skin||"#d9b38c";x.fill();
  x.save();shRound(x,lx,ly,lw,lh,r);x.clip();
  if(vb){const im=await shImg(t.svg,vb.w*k,vb.w*k);if(im)x.drawImage(im,mx(vb.x),my(vb.y),vb.w*k,vb.w*k);}
  const g=x.createLinearGradient(lx,0,lx+lw,0);g.addColorStop(0,"rgba(40,22,10,.28)");g.addColorStop(0.18,"rgba(40,22,10,0)");g.addColorStop(0.5,"rgba(255,248,235,.06)");g.addColorStop(0.82,"rgba(40,22,10,0)");g.addColorStop(1,"rgba(40,22,10,.3)");
  x.fillStyle=g;x.fillRect(lx,ly,lw,lh);x.restore();
  shRound(x,lx,ly,lw,lh,r);x.strokeStyle="rgba(22,18,14,.25)";x.lineWidth=3;x.stroke();
  x.restore();
  return t;}
async function shRun(fn){if(SHR.busy)return;SHR.busy=true;try{await fn();}catch(e){toast("Couldn't make the picture here");}finally{SHR.busy=false;}}

/* "Olga's forearm": the client's first name and the placement in words, or "" when the piece has no client on the books */
function shWhose(p){const c=SIMOK("findClient")?INK_SIM.findClient(S,p.client):null,d=p.design||{};
  if(!c||!c.first)return"";const pl=SIMOK("placeWords")?INK_SIM.placeWords(d.placement):((INK_SIM.PLACEMENTS[d.placement]||{}).name||"arm");
  return`${c.first}'s ${pl}`;}
/* ---- the piece card ---- */
function shPieceCard(id){return shRun(async()=>{
  const p=S.pieces.find(q=>q.id===id);if(!p){toast("That piece isn't here");return;}
  const{c,x}=await shCanvas(),P=SHARE.pad,W=SHARE.w,L=SHARE.piece,d=p.design||{};
  const pl=(INK_SIM.PLACEMENTS[d.placement]||{}).name||"",st=(INK_SIM.STYLES[d.style]||{}).name||"";
  const who=shWhose(p)||gvCap(pl);
  shFrame(x,p.by?"From the shop":"From the body of work");
  const t=await shLimb(x,p,P,L.top,W-2*P,L.h);
  const yrs=Math.floor(gvAgeYears(p)),grade=p.heal?(GV_WORDS[p.heal]||p.heal):"Healing";
  let Y=L.top+L.h+86;x.font=shFont("disp",68);
  shText(x,shFit(x,gvCap(p.label||"tattoo").toUpperCase(),W-2*P),P,Y,shFont("disp",68));
  Y+=54;shText(x,shFit((x.font=shFont("ui",34,600),x),[who,st,String(p.y)].filter(Boolean).join(" · "),W-2*P),P,Y,shFont("ui",34,600));
  Y+=46;shText(x,`Healed ${grade.toLowerCase()} · ${yrs<1?"fresh":yrs+(yrs===1?" year":" years")+" on the skin"} · reads ${Math.round((t.a.readability||0)*100)} today`,P,Y,shFont("ui",28,500),SHARE.mute);
  await shSave(c,`ink-${shSlug(p.label)}-${p.y}.png`,gvCap(p.label||"Tattoo"));});}

/* ---- the trophy card for a goal ---- */
function shGoalCard(gid){return shRun(async()=>{
  const g=(INK_SIM.GOALS||[]).find(q=>q.id===gid),done=S.goals&&S.goals[gid];if(!g||!done){toast("Not reached yet");return;}
  const{c,x}=await shCanvas(),P=SHARE.pad,W=SHARE.w,cx=W/2,cy=560;
  shFrame(x,"Goal reached");
  /* the badge: two rings, a star, notches round the edge (the shape reads without colour) */
  x.save();x.translate(cx,cy);x.lineWidth=10;x.strokeStyle=SHARE.ink;x.beginPath();x.arc(0,0,230,0,Math.PI*2);x.stroke();
  x.lineWidth=4;x.beginPath();x.arc(0,0,196,0,Math.PI*2);x.stroke();
  for(let i=0;i<36;i++){const a=i/36*Math.PI*2;x.beginPath();x.moveTo(Math.cos(a)*238,Math.sin(a)*238);x.lineTo(Math.cos(a)*262,Math.sin(a)*262);x.lineWidth=6;x.stroke();}
  x.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?62:150;x.lineTo(Math.cos(a)*r,Math.sin(a)*r);}x.closePath();x.fillStyle=SHARE.red;x.fill();x.lineWidth=8;x.strokeStyle=SHARE.ink;x.stroke();
  x.restore();
  let Y=cy+360;x.font=shFont("disp",76);
  for(const ln of shWrap(x,g.name.toUpperCase(),W-2*P).slice(0,2)){shText(x,ln,cx,Y,shFont("disp",76),SHARE.ink,"center");Y+=88;}
  x.font=shFont("ui",34,500);for(const ln of shWrap(x,gvCap(g.says)+".",W-2*P-40).slice(0,2)){shText(x,ln,cx,Y,shFont("ui",34,500),SHARE.mute,"center");Y+=46;}
  const st=(S.studio&&S.studio.stage)||"apprentice";
  shText(x,`Week ${done.w}, ${done.y}`,cx,Y+40,shFont("ui",34,700),SHARE.ink,"center");
  shText(x,`A tattoo career in Mostograd · ${typeof STAGE_NAMES!=="undefined"&&STAGE_NAMES[st]||st}`,cx,Y+88,shFont("ui",28,500),SHARE.mute,"center");
  await shSave(c,`ink-goal-${shSlug(g.name)}.png`,g.name);});}

/* ---- the Legacy card ---- */
function shLegacyCard(){return shRun(async()=>{
  if(!SIMOK("legacySummary"))return;
  const L=INK_SIM.legacySummary(S),{c,x}=await shCanvas(),P=SHARE.pad,W=SHARE.w,yrs=Math.floor(L.years);
  shFrame(x,"Legacy");
  let Y=P+210;shText(x,`${yrs} YEAR${yrs===1?"":"S"} AT THE NEEDLE`,P,Y,shFont("disp",84));
  Y+=58;shText(x,`${L.pieces.toLocaleString("en-CA")} pieces on ${L.clients.toLocaleString("en-CA")} people${L.shopPieces?` · ${L.shopPieces.toLocaleString("en-CA")} more from the shop`:""}`,P,Y,shFont("ui",34,600));
  /* two pieces side by side: the oldest still reading, the best heal */
  const fw=(W-2*P-40)/2,fh=430,fy=Y+44;
  const fig=async(id,X,cap1,cap2)=>{const p=id&&S.pieces.find(q=>q.id===id);
    x.strokeStyle=SHARE.line;x.lineWidth=3;x.strokeRect(X,fy,fw,fh);
    if(p)await shLimb(x,p,X+3,fy+3,fw-6,fh-6);else shText(x,"Nothing yet",X+fw/2,fy+fh/2,shFont("ui",30,500),SHARE.mute,"center");
    x.font=shFont("ui",28,700);shText(x,shFit(x,cap1,fw),X,fy+fh+44,shFont("ui",28,700));
    x.font=shFont("ui",26,500);shText(x,shFit(x,cap2,fw),X,fy+fh+80,shFont("ui",26,500),SHARE.mute);};
  const lbl=o=>{const p=o&&S.pieces.find(q=>q.id===o.piece);return p?`${gvCap(p.label||"tattoo")}, ${p.y}`:"";};   // the design's name, not the client's
  await fig(L.oldest&&L.oldest.piece,P,"Oldest that still reads",lbl(L.oldest));
  await fig(L.best&&L.best.piece,P+fw+40,"The best heal",lbl(L.best));
  /* pieces by decade, then a few lines */
  Y=fy+fh+130;const decs=Object.keys(L.decades).sort(),dmax=Math.max(1,...decs.map(d=>L.decades[d]));
  const bw=(W-2*P)/Math.max(3,decs.length);
  decs.forEach((d,i)=>{const bx=P+i*bw,h=Math.max(6,L.decades[d]/dmax*110);x.fillStyle=SHARE.ink;x.fillRect(bx+18,Y+110-h,bw-36,h);
    shText(x,`${d}s · ${L.decades[d]}`,bx+bw/2,Y+150,shFont("ui",26,600),SHARE.mute,"center");});
  Y+=196;const stN=id=>(INK_SIM.STYLES[id]||{}).name||id;
  const lines=[L.signature.ready?`Known for ${stN(L.signature.style).toLowerCase()}`:"",L.conv.entered?`Conventions: entered ${L.conv.entered}, won ${L.conv.won}`:"",
    L.most&&L.most.n>1?`One client wears ${L.most.n} pieces`:"",L.apprentices.length?`${L.apprentices.length} apprentice${L.apprentices.length===1?"":"s"} trained`:""].filter(Boolean);
  x.font=shFont("ui",30,500);for(const ln of shWrap(x,lines.join(" · "),W-2*P).slice(0,2)){shText(x,ln,P,Y,shFont("ui",30,500));Y+=40;}
  await shSave(c,`ink-legacy-${S.year}.png`,"Ink: Legacy");});}
