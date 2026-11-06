/* ===== sim/design.js: design scoring: scoreDesign(design, client, skills), the stress report from COMBOS (PR 1) =====
   Scores a design on the board before it goes on skin. Every number that tunes it is in a named table at the top.
     SIM.scoreDesign(design, client, skills, opts) -> {readability, flow, balance, coherence, fit, total,
                                                       agePrediction:{5,10,20}, hours, sessions, price, stress:[{id,sev,text}]}
   How it thinks (see docs/SIM-CONTRACT.md for the shapes):
   - readability: is each element big enough (minSizeMm at its real size, scale*sizeMm), are the gaps between its strokes
     wider than its lines (LINE_MM), does its colour show on this client's skin (SKIN_CONTRAST), is the piece crowded.
     The same function re-scores an aged piece: aging.js widens the lines and fades the ink, and the gaps close up.
   - flow: does each element run with the placement's flow lines, is the piece wider than the wrap or longer than the box
     (after the body-shape scale), does it cross a joint crease.
   - balance: visual weight (area x (fill + line) x darkness) around the centre of the piece's footprint.
   - coherence: elements from other styles clash unless the style lists them in blendsWith; wildly different line weights
     fight; lines outside the style's range and colours outside its palette cost a little.
   - fit: the client's wants (style weights, size range, tags, colour appetite), must-haves (each missing one costs a lot),
     dealbreakers (one hit crushes it), a hard-to-hide spot for a job that needs cover, a painful spot for a low tolerance.
   - hours from the inked area and its detail (HOURS), sessions from hours and the spot's pain (SESSION_HOURS),
     price = hours x rate x repMult x SIM.priceIndex(year). Money is rubles (RATE_DEFAULT is a 2000 rate).
   Element geometry: an element's long side is scale*sizeMm; its short side and its natural long axis come from the
   bounding box of its SVG path (dzShape), or from its family when it has none (FAMILY_SHAPE: lettering is wide and reads
   across, motifs stand upright). rot is clockwise degrees, like CSS. Elements tagged band/armband/wrap are meant to
   go round the limb, so the piece is not marked down for being wider than the wrap.
   An optional design.pos {x,y} (0..1 in the placement box) says where the piece's centre sits; default the middle.
   client.traits.pain is read as pain TOLERANCE (1 = sits like a rock, 0 = can't sit still).
   Private helpers start with dz. Nothing here is random: the same design always scores the same. ===== */

/* line width on skin (mm) for each liner grouping in LINE_WEIGHTS */
const LINE_MM={1:0.3,3:0.5,5:0.75,7:0.95,9:1.15,11:1.35,14:1.7};
/* the rough shape of each element family: aspect = short side / long side, ink = share of its box that is inked,
   axis = its natural long axis (0 = upright, 90 = reads across), elong = how much its rotation matters for flow */
const FAMILY_SHAPE={
  motif:{aspect:0.8,ink:0.6,axis:0,elong:0.55},
  lettering:{aspect:0.3,ink:0.35,axis:90,elong:0.6},
  frame:{aspect:0.9,ink:0.35,axis:0,elong:0.35},
  fill:{aspect:1,ink:0.85,axis:0,elong:0.15},
  texture:{aspect:1,ink:0.7,axis:0,elong:0.15}
};
/* tags that mark a round, rotation-free element (a mandala looks the same at any angle) */
const ROUND_TAGS={mandala:1,radial:1,round:1,circle:1,dot:1,dotwork:1};
/* tags that mark an element meant to wrap round the limb (an armband): it should run ACROSS the flow, and the piece is
   not marked down for being wider than the wrap */
const WRAP_TAGS={band:1,armband:1,wrap:1};
/* how well an ink reads on skin: rows are ink lightness bands (COLOURS[].light), columns are skin tones 0..1.
   Bold black reads everywhere; light colours fade into darker skin. fineLine multiplies lines under READ.lineOk mm. */
const SKIN_CONTRAST={
  tones:[0,0.33,0.66,1],
  light:[0.10,0.40,0.70,0.92],
  read:[[1.00,1.00,0.97,0.93],
        [0.98,0.92,0.72,0.50],
        [0.80,0.62,0.36,0.16],
        [0.50,0.32,0.12,0.04]],
  fineLine:[1.00,0.95,0.84,0.72]
};
/* readability knobs */
const READ={
  sizeExp:1.4,               // below minSizeMm, the size factor is (real/min)^sizeExp
  gapWide:0.25,gapTight:0.04,// stroke pitch as a share of the element's size, from detail 0 (open) to detail 1 (dense)
  gapMin:0.2,gapOk:1.2,      // clear gap between strokes (mm) that reads not at all .. fully
  lineOk:0.5,lineFloor:0.8,  // lines thinner than lineOk mm read a bit weaker (down to lineFloor at 0 mm)
  fadeHit:0.8,               // how much of the faded share is lost contrast
  letterWeight:2,            // lettering counts double: if the words go, the piece goes
  minBlend:0.3,              // overall = mean*(1-minBlend) + worst element*minBlend
  crowdOk:0.6,crowdBad:1.2,crowdHit:0.4,   // room the motifs need / room they have (2+ motifs): fine .. mud, and the most it costs
  closed:0.3                 // stroke gaps under this have "closed up" (for the stress report's years)
};
/* flow knobs */
const FLOW={
  base:0.2,                  // the share of flow you keep however badly the elements are turned
  smallMis:0.4,bigShare:0.6,shapeFrom:0.2,   // small things barely fight the limb: an element's turn counts from smallMis (tiny)
                                             // to full at bigShare of the narrow side; the outline counts from shapeFrom to bigShare
  elemW:0.55,footW:0.45,     // element rotation vs the outline of the whole piece
  comfy:0.9,edge:0.85,wrapFall:4,lenFall:2.5,   // width/length share that is comfortable, the score at 100%, and the fall-off past it
  creaseMarginMm:4,creaseNearMm:8,creaseCross:0.45,creaseNear:0.88
};
const BALANCE={x:1,y:0.6,k:1.1,exp:1.2,minHalf:0.12,sparse:0.15,sparseFloor:0.7};
const COHERENCE={blend:0.85,clash:0.35,rangeStep:0.05,rangeFloor:0.7,lwGapFrom:6,lwGapTo:12,lwHit:0.3,paletteHit:0.94,paletteFloor:0.75};
const FIT={styleFloor:0.15,noWants:0.6,noTags:0.7,tagFloor:0.25,parts:{style:0.4,size:0.2,tags:0.25,colour:0.15},
  sizeUnder:1.5,sizeOver:1.2,colourSlope:1.2,mustMiss:0.55,dealbreaker:0.08,cover:0.6,smallShow:0.35,pain:0.5,painSlack:0.2};
/* skill: the design's style level (0..10) widens tolerance a little */
const DESIGN_SKILL={minSizeTol:0.10,cohRecover:0.2};
const DESIGN_WEIGHTS={readability:0.28,flow:0.2,balance:0.12,coherence:0.15,fit:0.25};
/* total = (1-geo) x weighted average + geo x weighted geometric mean, so one failed sub-score drags the total down
   instead of being averaged away by four good ones */
const TOTAL_BLEND={geo:0.5,floor:0.02};
/* hours: setup + inked cm2 x (simple .. detailed rate), more for shading and colour packing; speed 0..10 scales it */
const HOURS={setup:0.5,perCm2Simple:0.015,perCm2Detailed:0.04,fill:0.5,colour:0.25,speedSlow:1.25,speedFast:0.8,round:0.25};
/* longest sitting by pain: a forearm can take 6 hours, the ribs about 3.5 */
const SESSION_HOURS={easy:6,hard:3.5};
/* the default hourly rate for an average artist in 2000 rubles, and the shop minimum (hours) */
const RATE_DEFAULT={rate:850,minHours:1};
/* how much a job needs tattoos covered, by a word in client.job (first match wins); anything else is DEFAULT */
const JOB_COVER=[["bank",0.85],["lawyer",0.9],["solicitor",0.9],["notary",0.9],["judge",0.95],["accountant",0.75],["civil serv",0.8],
  ["official",0.8],["office",0.6],["clerk",0.6],["teacher",0.65],["doctor",0.6],["nurse",0.5],["police",0.7],["receptionist",0.6],
  ["hotel",0.6],["sales",0.5],["waiter",0.35],["chef",0.1],["cook",0.1],["builder",0.1],["courier",0.1],["mechanic",0.1],
  ["dock",0.1],["musician",0],["barista",0.1],["tattoo",0],["artist",0.05],["student",0.2],["DEFAULT",0.3]];
/* words for the stress report */
const REGION_WORDS={
  arm:{limb:"arm",past:"wraps past the side of the arm"},leg:{limb:"leg",past:"wraps past the side of the leg"},
  hand:{limb:"hand",past:"runs over the edge of the hand"},foot:{limb:"foot",past:"runs down the side of the foot"},
  side:{limb:"body",past:"wraps round onto the back and belly"},back:{limb:"back",past:"runs round the sides of the body"},
  chest:{limb:"chest",past:"runs into the armpit and over the collarbone"},neck:{limb:"neck",past:"wraps round to the throat"},
  shoulder:{limb:"shoulder",past:"wraps down past the shoulder cap"}
};
/* styles whose colour goes on the lines too (no black outline); everywhere else an element's colour is its fill and
   its lines stay black, so a red traditional rose still has a black outline that reads on any skin */
const COLOUR_LINES={watercolour:1};
/* a flash design (FLASH in sim/flash.js, or the artist's own saved flash) is drawn already and the stencil exists:
   design.flash set (or opts.flash) takes this share of the hours */
const FLASH_DISCOUNT={hours:0.8};
/* the default session outputs used for the aging prediction. trauma is the one output where lower is better (skin damage
   from the session, 0 = none); aging doesn't read it, the heal grade does (PR 5) */
const DEFAULT_OUT={lineQuality:0.75,depthQuality:0.75,saturation:0.75,trauma:0.25};

/* ---- small helpers ---- */
function dzLineMm(rl){
  if(LINE_MM[rl]!=null)return LINE_MM[rl];
  const ks=Object.keys(LINE_MM).map(Number).sort((a,b)=>a-b);
  if(!(rl>ks[0]))return LINE_MM[ks[0]];
  for(let i=1;i<ks.length;i++)if(rl<=ks[i])return lerp(LINE_MM[ks[i-1]],LINE_MM[ks[i]],(rl-ks[i-1])/(ks[i]-ks[i-1]));
  return LINE_MM[ks[ks.length-1]];
}
function dzInterp(xs,ys,x){
  if(x<=xs[0])return ys[0];
  for(let i=1;i<xs.length;i++)if(x<=xs[i])return lerp(ys[i-1],ys[i],(x-xs[i-1])/(xs[i]-xs[i-1]));
  return ys[ys.length-1];
}
/* SKIN_CONTRAST, bilinear in ink lightness and skin tone */
function dzContrast(light,tone){
  const T=SKIN_CONTRAST,rows=T.read.map(r=>dzInterp(T.tones,r,tone));
  return dzInterp(T.light,rows,light);
}
function dzFold(a){a=((a%180)+180)%180;return a>90?180-a:a;}   // angle between two undirected axes, 0..90
function dzColour(id){
  const C=SIM.COLOURS||{},c=C[id||"black"];
  if(c)return c;
  return{name:id||"black",light:id&&id!=="black"?0.5:0.06};
}
function dzStyle(id){return(SIM.STYLES||{})[id]||null;}
/* an element's real proportions from its SVG path (0..100 viewBox), cached: {aspect, axis} or null without a path.
   Reads absolute and relative M L H V C S Q T A Z; curve control points count (a little generous), arcs are sampled */
const dzShapeCache={};
function dzPathBox(d){
  const tk=String(d||"").match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);if(!tk)return null;
  const N={m:2,l:2,h:1,v:1,c:6,s:4,q:4,t:2,a:7,z:0};
  let i=0,cmd="",x=0,y=0,sx=0,sy=0,x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,n=0;
  const add=(px,py)=>{x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);n++;};
  while(i<tk.length){
    if(/[a-zA-Z]/.test(tk[i])){cmd=tk[i++];if(cmd==="z"||cmd==="Z"){x=sx;y=sy;continue;}}
    const lc=cmd.toLowerCase(),k=N[lc];if(!k){i++;continue;}
    const a=tk.slice(i,i+k).map(Number);i+=k;if(a.length<k||a.some(v=>isNaN(v)))break;
    const rel=cmd!==cmd.toUpperCase(),ox=rel?x:0,oy=rel?y:0;
    if(lc==="h"){x=ox+a[0];add(x,y);continue;}
    if(lc==="v"){y=oy+a[0];add(x,y);continue;}
    if(lc==="a"){const ex=ox+a[5],ey=oy+a[6];dzArcPts(x,y,a[0],a[1],a[2],a[3],a[4],ex,ey,add);x=ex;y=ey;add(x,y);continue;}
    for(let j=0;j<k;j+=2)add(ox+a[j],oy+a[j+1]);
    x=ox+a[k-2];y=oy+a[k-1];
    if(lc==="m"){sx=x;sy=y;cmd=rel?"l":"L";}
  }
  return n>1?{x:x0,y:y0,w:x1-x0,h:y1-y0}:null;
}
/* sample an SVG arc (endpoint form) via its centre, so a circle drawn as two half arcs gets its real height */
function dzArcPts(x1,y1,rx,ry,phi,fa,fs,x2,y2,add){
  rx=Math.abs(rx);ry=Math.abs(ry);if(!rx||!ry)return;
  const c=Math.cos(phi*Math.PI/180),s=Math.sin(phi*Math.PI/180),dx=(x1-x2)/2,dy=(y1-y2)/2;
  const xp=c*dx+s*dy,yp=-s*dx+c*dy,lam=xp*xp/(rx*rx)+yp*yp/(ry*ry);
  if(lam>1){const k=Math.sqrt(lam);rx*=k;ry*=k;}
  const num=rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp,den=rx*rx*yp*yp+ry*ry*xp*xp;
  const co=(fa===fs?-1:1)*Math.sqrt(Math.max(0,num/(den||1)));
  const cxp=co*rx*yp/ry,cyp=-co*ry*xp/rx,cx=c*cxp-s*cyp+(x1+x2)/2,cy=s*cxp+c*cyp+(y1+y2)/2;
  const ang=(ux,uy,vx,vy)=>{const a=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);return a;};
  const t1=ang(1,0,(xp-cxp)/rx,(yp-cyp)/ry);let dt=ang((xp-cxp)/rx,(yp-cyp)/ry,(-xp-cxp)/rx,(-yp-cyp)/ry);
  if(!fs&&dt>0)dt-=2*Math.PI;else if(fs&&dt<0)dt+=2*Math.PI;
  for(let i=1;i<8;i++){const t=t1+dt*i/8,ex=rx*Math.cos(t),ey=ry*Math.sin(t);add(c*ex-s*ey+cx,s*ex+c*ey+cy);}
}
function dzShape(def){
  const k=def.id;if(k!=null&&dzShapeCache[k]!==undefined)return dzShapeCache[k];
  let r=null;
  const a=def.path?dzPathBox(def.path):null,b=def.fill?dzPathBox(def.fill):null;
  if(a||b){
    const w=Math.max(a?a.w:0,b?b.w:0),h=Math.max(a?a.h:0,b?b.h:0),mx=Math.max(w,h);
    if(mx>0)r={aspect:Math.max(0.15,Math.min(w,h)/mx),axis:w>h*1.15?90:0};
  }
  if(k!=null)dzShapeCache[k]=r;
  return r;
}
const DZ_UNKNOWN={name:"element",family:"motif",styles:[],minSizeMm:15,detail:0.5,lineWeightDefault:7,colourable:true,tags:[]};
function dzDef(id){return(SIM.elementById&&SIM.elementById(id))||Object.assign({},DZ_UNKNOWN,{id,name:String(id)});}
/* an element's name as it reads mid-sentence: "Rose" -> "rose", "Script: Family" -> '"Family" script' */
function dzName(def){
  const n=String(def.name||def.id||"element"),m=n.match(/^([^:]+):\s*(.+)$/);
  if(m)return'"'+m[2]+'" '+m[1].toLowerCase();
  return n.length>1&&n[1]===n[1].toLowerCase()?n[0].toLowerCase()+n.slice(1):n;
}
function dzBlends(a,b){
  if(a===b)return true;
  const sa=dzStyle(a),sb=dzStyle(b);
  return!!((sa&&(sa.blendsWith||[]).indexOf(b)>=0)||(sb&&(sb.blendsWith||[]).indexOf(a)>=0));
}
/* which of an element's styles it is drawn in here: the design's style if it can be, else the one whose line range
   fits the line weight it is drawn at and that sits with the design's style (a 1RL moth is fine-line, not neo-trad) */
function dzBestStyle(styles,style,rl){
  let best=styles[0]||style,bs=-1e9;
  for(const s of styles){
    const st=dzStyle(s),lr=st&&st.lineRange,off=lr?(rl<lr[0]?lr[0]-rl:rl>lr[1]?rl-lr[1]:0):0;
    const sc=(s===style?2:0)+(dzBlends(s,style)?1:0)-0.4*off;
    if(sc>bs){bs=sc;best=s;}
  }
  return best;
}
function dzJobCover(job){
  const j=String(job||"").toLowerCase();
  for(const [k,v] of JOB_COVER)if(k!=="DEFAULT"&&j.indexOf(k)>=0)return v;
  return JOB_COVER[JOB_COVER.length-1][1];
}
const dzR=(v,n)=>{const m=Math.pow(10,n==null?3:n);return Math.round(v*m)/m;};

/* ---- the element table for a design: geometry, weight and looks of every element, and the piece's footprint ---- */
function dzElems(design){
  const S0=design.sizeMm||50,style=design.style,els=[];
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(const el of design.elements||[]){
    const def=dzDef(el.id),fam=FAMILY_SHAPE[def.family]?def.family:"motif",sh0=FAMILY_SHAPE[fam],ps=dzShape(def);
    const sh=ps?{aspect:ps.aspect,ink:sh0.ink,axis:ps.axis,elong:sh0.elong*clamp((1-ps.aspect)/0.5,0.1,1)}:sh0;
    const scale=el.scale!=null?el.scale:0.5,rl=el.lineWeight!=null?el.lineWeight:(def.lineWeightDefault||7);
    const colourId=el.colour||"black",col=dzColour(colourId),light=col.light!=null?col.light:0.5;
    const tags=def.tags||[],round=tags.some(t=>ROUND_TAGS[t]);
    const axis=sh.axis+(el.rot||0),th=axis*Math.PI/180,sn=Math.abs(Math.sin(th)),cs=Math.abs(Math.cos(th));
    const L=scale,Sh=scale*sh.aspect,hx=L/2*sn+Sh/2*cs,hy=L/2*cs+Sh/2*sn;
    const x=el.x!=null?el.x:0.5,y=el.y!=null?el.y:0.5;
    x0=Math.min(x0,x-hx);x1=Math.max(x1,x+hx);y0=Math.min(y0,y-hy);y1=Math.max(y1,y+hy);
    const fill=clamp(el.fill||0,0,1),lineMm=dzLineMm(rl),area=L*Sh*sh.ink;
    const styles=def.styles||[],best=dzBestStyle(styles,style,rl);
    const colShare=colourId==="black"||COLOUR_LINES[style]||fill<=0?1:fill/(fill+lineMm/1.7*0.6+0.15);
    const lightMix=lerp(dzColour("black").light!=null?dzColour("black").light:0.06,light,colShare);
    els.push({colShare,lightMix,el,def,id:el.id,name:dzName(def),fam,sh,x,y,scale,mm:scale*S0,rl,lineMm,colourId,col,light,fill,
      detail:def.detail!=null?def.detail:0.5,minMm:def.minSizeMm||10,styles,best,tags,axis,elong:round?0.1:sh.elong,area,
      w:area*(fill+lineMm/1.7*0.6+0.15)*(1-0.75*lightMix)});
  }
  if(!els.length){x0=y0=0.5;x1=y1=0.5;}
  const fw=Math.max(1e-3,x1-x0),fh=Math.max(1e-3,y1-y0);
  /* crowding: the room each motif or word needs to read (its minSizeMm squared, more for detail) against the room it has */
  let inked=0,need=0,nMotif=0;
  for(const e of els){inked+=e.area;if(e.fam==="motif"||e.fam==="lettering"){nMotif++;need+=(0.3+e.detail)*e.minMm*e.minMm;}}
  return{els,sizeMm:S0,fx0:x0,fy0:y0,fw,fh,cx:(x0+x1)/2,cy:(y0+y1)/2,Wmm:fw*S0,Hmm:fh*S0,
    coverage:inked/(fw*fh),crowd:nMotif>=2?need/(fw*fh*S0*S0):0,inkedCm2:Math.min(inked,fw*fh)*S0*S0/100};
}

/* ---- readability of one element; wear = {spread, blur, fade} from aging.js or null for fresh ink ---- */
function dzElemRead(e,tone,wear,tol){
  const sp=wear?wear.spread:0,bl=wear?wear.blur:0,fd=wear?wear.fade:0;
  const ratio=e.mm/(e.minMm*(1-(tol||0)));
  const sizeF=ratio>=1?1:Math.pow(Math.max(0,ratio),READ.sizeExp);
  const gapF=dzGap(e,sp,bl);
  const con0=e.colShare>=1?dzContrast(e.light,tone):lerp(dzContrast(dzColour("black").light||0.06,tone),dzContrast(e.light,tone),e.colShare);
  const con=con0*(1-READ.fadeHit*fd);
  let lineV=1;
  if(e.lineMm<READ.lineOk){
    const t=e.lineMm/READ.lineOk;
    lineV=lerp(READ.lineFloor,1,t)*lerp(dzInterp(SKIN_CONTRAST.tones,SKIN_CONTRAST.fineLine,tone),1,t);
    lineV=lerp(lineV,1,e.fill*0.6);
  }
  return sizeF*Math.pow(gapF,0.8)*con*lineV;
}
/* how open the gaps between an element's strokes still are, 0..1 (the letters "closing up") */
function dzGap(e,sp,bl){
  const pitch=e.mm*lerp(READ.gapWide,READ.gapTight,e.detail);
  return clamp((pitch-e.lineMm-(sp||0)-(bl||0)-READ.gapMin)/(READ.gapOk-READ.gapMin),0,1);
}
/* readability of the whole piece (and each element's, for the stress report) */
function dzReadability(E,tone,wears,tol){
  if(!E.els.length)return{score:0,each:[]};
  let sw=0,s=0,mn=1;const each=[];
  E.els.forEach((e,i)=>{
    const r=dzElemRead(e,tone,wears?wears[i]:null,tol);each.push(r);
    const imp=Math.sqrt(Math.max(1e-6,e.w))*(e.fam==="lettering"?READ.letterWeight:1);
    sw+=imp;s+=imp*r;mn=Math.min(mn,r);
  });
  const crowdF=1-READ.crowdHit*clamp((E.crowd-READ.crowdOk)/(READ.crowdBad-READ.crowdOk),0,1);
  return{score:clamp((s/sw*(1-READ.minBlend)+mn*READ.minBlend)*crowdF,0,1),each,crowdF};
}
/* for aging.js and the UI: readability of a design on a skin tone, optionally with per-element wear */
SIM.readabilityOf=(design,skinTone,wears)=>dzReadability(dzElems(design),skinTone==null?0.3:skinTone,wears||null,0).score;

/* ---- flow ---- */
const dzFlowCache={};
function dzFlowSegs(p,box){
  const k=p.id+":"+box.wrapMm+":"+box.lengthMm;
  if(dzFlowCache[k])return dzFlowCache[k];
  const segs=[];
  for(const line of p.flow||[])for(let i=1;i<line.length;i++){
    const ax=line[i-1][0]*box.wrapMm,ay=line[i-1][1]*box.lengthMm,bx=line[i][0]*box.wrapMm,by=line[i][1]*box.lengthMm;
    segs.push({ax,ay,dx:bx-ax,dy:by-ay,ang:Math.atan2(-(bx-ax),by-ay)*180/Math.PI});
  }
  return(dzFlowCache[k]=segs);
}
function dzLocalFlow(segs,px,py,fallback){
  let best=fallback,bd=1e18;
  for(const s of segs){
    const l2=s.dx*s.dx+s.dy*s.dy||1,t=clamp(((px-s.ax)*s.dx+(py-s.ay)*s.dy)/l2,0,1);
    const qx=s.ax+t*s.dx-px,qy=s.ay+t*s.dy-py,d=qx*qx+qy*qy;
    if(d<bd){bd=d;best=s.ang;}
  }
  return best;
}
function dzFlow(E,design,p,box){
  const pos=design.pos||{x:0.5,y:0.5},segs=dzFlowSegs(p,box);
  let sw=0,mis=0;const elMis=[],minSide=Math.min(box.wrapMm,box.lengthMm);
  for(const e of E.els){
    const px=pos.x*box.wrapMm+(e.x-E.cx)*E.sizeMm,py=pos.y*box.lengthMm+(e.y-E.cy)*E.sizeMm;
    const wraps=e.tags.some(t=>WRAP_TAGS[t]),loc=dzLocalFlow(segs,px,py,p.flowDeg||0)+(wraps?90:0),sn=Math.sin(dzFold(e.axis-loc)*Math.PI/180);
    const m=e.elong*sn*sn*lerp(FLOW.smallMis,1,clamp(e.mm/minSide/FLOW.bigShare,0,1));
    const imp=Math.sqrt(Math.max(1e-6,e.w));sw+=imp;mis+=imp*m;elMis.push(m);
  }
  const misE=sw?mis/sw:0;
  const W=E.Wmm,H=E.Hmm,elongF=Math.abs(H-W)/Math.max(H,W,1e-6),dAxis=H>=W?0:90;
  const band=E.els.some(e=>e.tags.some(t=>WRAP_TAGS[t]));
  const rel=Math.max(W/box.wrapMm,H/box.lengthMm),relF=clamp((rel-FLOW.shapeFrom)/(FLOW.bigShare-FLOW.shapeFrom),0,1);
  const sf=Math.sin(dzFold(dAxis-(p.flowDeg||0))*Math.PI/180),misF=band?0:elongF*sf*sf*relF;
  const orient=clamp(1-(FLOW.elemW*misE+FLOW.footW*misF),0,1);
  const fitShare=(r,fall)=>r<=FLOW.comfy?1:r<=1?lerp(1,FLOW.edge,(r-FLOW.comfy)/(1-FLOW.comfy)):FLOW.edge*Math.exp(-(r-1)*fall);
  const wr=W/box.wrapMm,lr=H/box.lengthMm;
  const wrapF=band?1:fitShare(wr,FLOW.wrapFall*(0.6+(p.curve||0.5))),lenF=fitShare(lr,FLOW.lenFall);
  let creaseF=1,cross=null,near=null;
  const yTop=pos.y*box.lengthMm-H/2,yBot=pos.y*box.lengthMm+H/2,xL=pos.x*box.wrapMm-W/2,xR=pos.x*box.wrapMm+W/2;
  for(const c of p.creases||(p.crease?[p.crease]:[])){
    const lo=c.axis==="y"?xL:yTop,hi=c.axis==="y"?xR:yBot,at=c.at*(c.axis==="y"?box.wrapMm:box.lengthMm);
    if(at>lo+FLOW.creaseMarginMm&&at<hi-FLOW.creaseMarginMm){creaseF=Math.min(creaseF,FLOW.creaseCross);cross=cross||c;}
    else{const d=Math.min(Math.abs(at-lo),Math.abs(at-hi));if(d<FLOW.creaseNearMm||(at>lo&&at<hi)){creaseF=Math.min(creaseF,FLOW.creaseNear);near=near||{c,d:Math.round(d)};}}
  }
  return{score:clamp((FLOW.base+(1-FLOW.base)*orient)*wrapF*lenF*creaseF,0,1),orient,misE,misF,elMis,wr:band?0:wr,lr,rel,cross,near};
}

/* ---- balance ---- */
function dzBalance(E){
  let sw=0,gx=0,gy=0;
  for(const e of E.els){sw+=e.w;gx+=e.w*e.x;gy+=e.w*e.y;}
  if(!sw)return 0;
  gx/=sw;gy/=sw;
  const dx=(gx-E.cx)/Math.max(E.fw/2,BALANCE.minHalf),dy=(gy-E.cy)/Math.max(E.fh/2,BALANCE.minHalf);
  const off=Math.sqrt(BALANCE.x*dx*dx+BALANCE.y*dy*dy);
  let b=1-BALANCE.k*Math.pow(off,BALANCE.exp);
  if(E.coverage<BALANCE.sparse)b*=lerp(BALANCE.sparseFloor,1,E.coverage/BALANCE.sparse);
  return clamp(b,0,1);
}

/* ---- coherence ---- */
function dzCoherence(E,design,lvl){
  const st=dzStyle(design.style);
  let sw=0,s=0,lo=99,hi=0,pal=1;
  for(const e of E.els){
    let m=e.best===design.style?1:dzBlends(e.best,design.style)?COHERENCE.blend:COHERENCE.clash;
    if(st&&st.lineRange){const d=e.rl<st.lineRange[0]?st.lineRange[0]-e.rl:e.rl>st.lineRange[1]?e.rl-st.lineRange[1]:0;m*=Math.max(COHERENCE.rangeFloor,1-COHERENCE.rangeStep*d);}
    const imp=Math.sqrt(Math.max(1e-6,e.w));sw+=imp;s+=imp*m;
    lo=Math.min(lo,e.rl);hi=Math.max(hi,e.rl);
    if(st&&st.palette&&e.colourId!=="black"&&st.palette.indexOf(e.colourId)<0)pal*=COHERENCE.paletteHit;
  }
  if(!sw)return 0;
  const lwF=1-COHERENCE.lwHit*clamp((hi-lo-COHERENCE.lwGapFrom)/(COHERENCE.lwGapTo-COHERENCE.lwGapFrom),0,1);
  const c=s/sw*lwF*Math.max(COHERENCE.paletteFloor,pal);
  return clamp(c+(1-c)*DESIGN_SKILL.cohRecover*lvl/10,0,1);
}

/* ---- fit to the client ---- */
function dzHas(E,design,m){
  if(m.kind==="tag")return E.els.some(e=>e.tags.indexOf(m.v)>=0);
  if(m.kind==="element")return E.els.some(e=>e.id===m.v);
  if(m.kind==="style")return design.style===m.v;
  if(m.kind==="colour")return E.els.some(e=>e.colourId===m.v);
  return false;
}
function dzColourShare(E){
  let sw=0,c=0;for(const e of E.els){sw+=e.w+1e-6;if(e.colourId!=="black"&&e.colourId!=="grey")c+=e.w+1e-6;}
  return sw?c/sw:0;
}
/* how much a piece shows: the spot's visibility, less for a piece that is small next to the spot (a watch hides it) */
function dzShows(p,F){return(p.visibility||0)*lerp(FIT.smallShow,1,clamp((F?F.rel:1)/0.6,0,1));}
function dzFit(E,design,cl,p,F){
  const wants=cl.wants||{},ws=wants.styles||{},vals=Object.keys(ws).map(k=>ws[k]),mx=Math.max(0,...vals);
  const style=mx>0?FIT.styleFloor+(1-FIT.styleFloor)*clamp((ws[design.style]||0)/mx,0,1):FIT.noWants;
  const sr=wants.sizeMm||[0,1e9],sz=design.sizeMm;
  const size=sz<sr[0]?Math.pow(sz/sr[0],FIT.sizeUnder):sz>sr[1]?Math.pow(sr[1]/sz,FIT.sizeOver):1;
  const wt=wants.tags||[];
  let tags=FIT.noTags;
  if(wt.length){const hits=wt.filter(t=>E.els.some(e=>e.tags.indexOf(t)>=0)).length;tags=clamp(FIT.tagFloor+(1-FIT.tagFloor)*hits/Math.min(2,wt.length),0,1);}
  const colour=wants.colour==null?0.7:clamp(1-Math.abs(dzColourShare(E)-wants.colour)*FIT.colourSlope,0,1);
  let f=FIT.parts.style*style+FIT.parts.size*size+FIT.parts.tags*tags+FIT.parts.colour*colour;
  for(const m of cl.mustHaves||[])if(!dzHas(E,design,m))f*=FIT.mustMiss;
  for(const m of cl.dealbreakers||[])if(dzHas(E,design,m))f*=FIT.dealbreaker;
  if(p){
    f*=1-FIT.cover*dzShows(p,F)*dzJobCover(cl.job);
    const tol=cl.traits&&cl.traits.pain!=null?cl.traits.pain:0.5;
    f*=1-FIT.pain*Math.max(0,(p.pain||0)-tol-FIT.painSlack);
  }
  return clamp(f,0,1);
}

/* ---- the stress report: rules with a test (returns a list of fill-ins, or nothing) and a plain-English template ---- */
const dzMm=v=>String(Math.round(v));
const dzPlace=ctx=>ctx.p?ctx.p.name:"spot";
const dzIs=ctx=>/s$/.test(dzPlace(ctx))&&!/ss$/.test(dzPlace(ctx))?"are":"is";   // "the ribs are", "the nape is"
const dzWords=ctx=>REGION_WORDS[ctx.p&&ctx.p.region]||REGION_WORDS.arm;
const dzStyleName=id=>{const s=dzStyle(id);return s?String(s.name||id).toLowerCase():String(id);};
const dzColName=e=>String(e.col.name||e.colourId).toLowerCase();
const dzWhen=y=>y<=0?"as soon as it heals":y<=2?"within 2 years":y<=5?"within 5 years":y<=10?"within 10 years":y<=20?"within 20 years":null;
/* first year (from a short list) at which an element's stroke gaps close under READ.closed */
function dzCloseYear(ctx,e){
  const env=agEnv(ctx.ageTattoo,ctx.p);
  for(const y of [0,1,2,3,5,7,10,15,20]){const w=agWear(e,env,y);if(dzGap(e,w.spread,w.blur)<READ.closed)return y;}
  return 99;
}
const COMBOS=[
  {id:"small_script",text:"{name} at {mm} mm: letters will close up {when}",
    test:ctx=>ctx.E.els.filter(e=>e.fam==="lettering"&&e.mm<e.minMm).map(e=>{
      const when=dzWhen(dzCloseYear(ctx,e));if(!when)return null;
      return{name:e.name,mm:dzMm(e.mm),when,sev:e.mm<e.minMm*0.6?3:2};}).filter(Boolean)},
  {id:"small_motif",text:"{name} at {mm} mm (needs {min} mm): the detail will blur into a blob",
    test:ctx=>ctx.E.els.filter(e=>e.fam!=="lettering"&&e.mm<e.minMm*0.9).map(e=>({name:e.name,mm:dzMm(e.mm),min:dzMm(e.minMm),sev:e.mm<e.minMm*0.6?3:2}))},
  {id:"watercolour_sun",text:"watercolour on the {place}: fades hard, {why}",
    test:ctx=>{
      const wc=ctx.design.style==="watercolour"||ctx.E.els.some(e=>e.best==="watercolour"&&e.w>=ctx.wTot*0.3);
      if(!wc||!ctx.p)return null;
      const ext=ctx.p.region==="hand"||ctx.p.region==="foot",sun=ctx.sun;
      if(!ext&&!(ctx.p.sun>=0.6&&sun>=0.55))return null;
      const why=sun>=0.7?"client works outdoors":sun>=0.55?"client is out in the sun a lot":ctx.p.region==="hand"?"hands wear fast, expect touch-ups":ctx.p.region==="foot"?"feet rub in shoes, expect touch-ups":"it gets a lot of sun";
      return[{place:dzPlace(ctx),why,sev:ext&&sun>=0.55?3:2}];}},
  {id:"style_fight",text:"two styles fighting: {sa} {na} in {la}RL lines next to {sb} {nb} in {lb}RL",
    test:ctx=>{
      const out=[],els=ctx.E.els;
      for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){
        let a=els[i],b=els[j];if(a.rl<b.rl){const t=a;a=b;b=t;}
        if(a.best!==b.best&&!dzBlends(a.best,b.best)&&a.rl-b.rl>=COHERENCE.lwGapFrom)
          out.push({sa:dzStyleName(a.best),na:a.name,la:a.rl,sb:dzStyleName(b.best),nb:b.name,lb:b.rl,sev:2});
      }
      return out;}},
  {id:"style_mix",text:"the {name} is {sb} on a {sa} piece: it will look pasted on",
    test:ctx=>ctx.E.els.filter(e=>e.styles.length&&!dzBlends(e.best,ctx.design.style)).map(e=>({name:e.name,sb:dzStyleName(e.best),sa:dzStyleName(ctx.design.style),sev:1}))},
  {id:"crease",text:"piece crosses the {crease} crease: distorts when bent",
    test:ctx=>ctx.F.cross?[{crease:ctx.F.cross.name||"joint",sev:3}]:null},
  {id:"crease_near",text:"piece stops {d} mm from the {crease} crease: the edge will soften with movement",
    test:ctx=>!ctx.F.cross&&ctx.F.near?[{crease:ctx.F.near.c.name||"joint",d:ctx.F.near.d,sev:1}]:null},
  {id:"pale_on_dark",text:"{adj}{colour} {name} on this skin tone: {verdict}",
    test:ctx=>{
      const seen={},out=[];
      for(const e of ctx.E.els){
        if(e.light<0.5||seen[e.colourId]||ctx.tone<0.45)continue;
        const c=dzContrast(e.light,ctx.tone);if(c>=0.45)continue;seen[e.colourId]=1;
        out.push({adj:e.light>=0.8?"pale ":"",colour:dzColName(e),name:e.name,verdict:c<0.2?"won't read at all":"will read faintly, outline it or go darker",sev:c<0.2?3:2});
      }
      return out;}},
  {id:"too_wide",text:"{w} mm wide on a {wrap} mm {place}: {past}",
    test:ctx=>ctx.F.wr>1.05?[{w:dzMm(ctx.E.Wmm),wrap:dzMm(ctx.box.wrapMm),place:dzPlace(ctx),past:dzWords(ctx).past,sev:ctx.F.wr>1.25?3:2}]:null},
  {id:"too_long",text:"{h} mm long on a {len} mm {place}: runs past the ends of the {place}",
    test:ctx=>ctx.F.lr>1.05?[{h:dzMm(ctx.E.Hmm),len:dzMm(ctx.box.lengthMm),place:dzPlace(ctx),sev:2}]:null},
  {id:"against_flow",text:"the {name} sits across the flow of the {place}: it will look crooked when the {limb} moves",
    test:ctx=>ctx.E.els.map((e,i)=>ctx.F.elMis[i]>=0.4&&e.w>=ctx.wTot*0.12?{name:e.name,place:dzPlace(ctx),limb:dzWords(ctx).limb,sev:2}:null).filter(Boolean)},
  {id:"against_shape",text:"the piece runs across the {place} instead of along it: it fights the shape of the {limb}",
    test:ctx=>ctx.F.misF>=0.35?[{place:dzPlace(ctx),limb:dzWords(ctx).limb,sev:2}]:null},
  {id:"fine_extremity",text:"{rl}RL fine line on the {place}: {why}, the lines will break up and blur within a couple of years",
    test:ctx=>{
      if(!ctx.p||(ctx.p.region!=="hand"&&ctx.p.region!=="foot"))return null;
      const e=ctx.E.els.filter(e=>e.lineMm<=READ.lineOk&&e.fill<0.5).sort((a,b)=>a.rl-b.rl)[0];if(!e)return null;
      return[{rl:e.rl,place:dzPlace(ctx),why:ctx.p.region==="hand"?"hands shed skin fast and get washed all day":"feet rub in shoes and shed skin fast",sev:e.rl<=1?3:2}];}},
  {id:"white_ink",text:"white ink on the {name}: turns yellowish and fades to a faint scar-like mark within a few years",
    test:ctx=>ctx.E.els.filter(e=>e.colourId==="white").slice(0,1).map(e=>({name:e.name,sev:2}))},
  {id:"crowded",text:"{n} elements packed into {w}×{h} mm: too much detail, it will read as mud from across a room",
    test:ctx=>ctx.E.crowd>READ.crowdOk?[{n:ctx.E.els.length,w:dzMm(ctx.E.Wmm),h:dzMm(ctx.E.Hmm),sev:ctx.E.crowd>READ.crowdBad?3:2}]:null},
  {id:"heavy_lines",text:"{rl}RL lines on a {mm} mm {name}: too heavy for the space, the gaps will fill in",
    test:ctx=>ctx.E.els.filter(e=>e.lineMm>e.mm*lerp(READ.gapWide,READ.gapTight,e.detail)*0.6).slice(0,2).map(e=>({rl:e.rl,mm:dzMm(e.mm),name:e.name,sev:2}))},
  {id:"fine_on_dark",text:"{rl}RL fine line on this skin tone: it will look faint, go to a 5RL or heavier",
    test:ctx=>{
      if(ctx.tone<0.6)return null;
      const e=ctx.E.els.filter(e=>e.lineMm<=READ.lineOk&&e.fill<0.4).sort((a,b)=>a.rl-b.rl)[0];
      return e?[{rl:e.rl,sev:ctx.tone>=0.8?2:1}]:null;}},
  {id:"sun_colour",text:"{colour} on a sun-exposed {place}: will fade fast, client is outdoors a lot",
    test:ctx=>{
      if(!ctx.p||ctx.p.sun<0.6||ctx.sun<0.6||ctx.design.style==="watercolour")return null;
      const e=ctx.E.els.filter(e=>e.light>=0.55&&e.w>=ctx.wTot*0.15)[0];
      return e?[{colour:dzColName(e),place:dzPlace(ctx),sev:1}]:null;}},
  {id:"pain",text:"the {place} {is} one of the most painful spots and this client has low pain tolerance: expect breaks or a session cut short",
    test:ctx=>ctx.p&&ctx.p.pain>=0.7&&ctx.painTol<=0.35?[{place:dzPlace(ctx),is:dzIs(ctx),sev:ctx.p.pain>=0.9?3:2}]:null},
  {id:"cover",text:"the {place} {is} hard to hide and this client's job ({job}) needs tattoos covered",
    test:ctx=>{const v=ctx.p?dzShows(ctx.p,ctx.F):0;return v>=0.6&&ctx.cover>=0.6?[{place:dzPlace(ctx),is:dzIs(ctx),job:ctx.client.job||"work",sev:v>=0.9?3:2}]:null;}}
];
function dzFill(t,v){return t.replace(/\{(\w+)\}/g,(m,k)=>v[k]!=null?String(v[k]):m);}
function dzStress(ctx){
  const out=[];
  for(const rule of COMBOS){
    let hits=rule.test(ctx);if(!hits)continue;
    if(!Array.isArray(hits))hits=[hits];
    for(const h of hits.slice(0,2)){const text=dzFill(rule.text,h);if(!out.some(o=>o.text===text))out.push({id:rule.id,sev:h.sev||1,text});}
  }
  return out.sort((a,b)=>b.sev-a.sev);
}

/* ---- the main entry ---- */
const DZ_CLIENT={skinTone:0.3,bodyShape:"neutral",traits:{pain:0.5,sun:0.4},wants:{},mustHaves:[],dealbreakers:[]};
function scoreDesign(design,client,skills,opts){
  design=design||{};client=client||DZ_CLIENT;skills=skills||{};opts=opts||{};
  const p=SIM.PLACEMENTS&&SIM.PLACEMENTS[design.placement]||null;
  const box=p?SIM.placementBox(design.placement,client.bodyShape):{wrapMm:120,lengthMm:240};
  const pf=p||{id:"none",name:"spot",region:"arm",flow:[[[0.5,0],[0.5,1]]],flowDeg:0,creases:[],curve:0.5,pain:0.3,visibility:0.5,sun:0.5};
  const E=dzElems(design),tone=client.skinTone!=null?client.skinTone:0.3;
  const lvl=clamp(((skills.styles||{})[design.style])||0,0,10),tol=DESIGN_SKILL.minSizeTol*lvl/10;
  const R=dzReadability(E,tone,null,tol),F=dzFlow(E,design,pf,box);
  const readability=R.score,flow=F.score,balance=dzBalance(E),coherence=dzCoherence(E,design,lvl),fit=dzFit(E,design,client,p,F);
  const Wt=DESIGN_WEIGHTS,wsum=Wt.readability+Wt.flow+Wt.balance+Wt.coherence+Wt.fit;
  const sub={readability,flow,balance,coherence,fit};
  let ar=0,lg=0;for(const k in sub){ar+=Wt[k]*sub[k];lg+=Wt[k]*Math.log(Math.max(TOTAL_BLEND.floor,sub[k]));}
  const total=lerp(ar/wsum,Math.exp(lg/wsum),TOTAL_BLEND.geo);
  /* aging at 5/10/20 with default session outputs */
  const sun=client.traits&&client.traits.sun!=null?client.traits.sun:0.4;
  const ageTattoo={design,out:DEFAULT_OUT,heal:null,ink:null,skinTone:tone,sun};
  const agePrediction={};
  for(const y of [5,10,20])agePrediction[y]=agAge(ageTattoo,y,E,tol);
  /* time and money */
  let dsum=0,fsum=0,sw=0;for(const e of E.els){const a=e.area+1e-6;sw+=a;dsum+=a*e.detail;fsum+=a*e.fill;}
  const det=sw?dsum/sw:0.5,fl=sw?fsum/sw:0,speed=clamp(skills.speed||0,0,10);
  let hours=(HOURS.setup+E.inkedCm2*lerp(HOURS.perCm2Simple,HOURS.perCm2Detailed,det)*(1+HOURS.fill*fl)*(1+HOURS.colour*dzColourShare(E)))*lerp(HOURS.speedSlow,HOURS.speedFast,speed/10);
  if(design.flash||opts.flash)hours*=FLASH_DISCOUNT.hours;
  hours=Math.max(HOURS.round*2,Math.round(hours/HOURS.round)*HOURS.round);
  const sessions=Math.max(1,Math.ceil(hours/lerp(SESSION_HOURS.easy,SESSION_HOURS.hard,clamp(((pf.pain||0)-0.25)/0.7,0,1))-1e-9));
  const rate=opts.rate!=null?opts.rate:RATE_DEFAULT.rate,rep=opts.repMult!=null?opts.repMult:1,year=opts.year!=null?opts.year:2000;
  const price=Math.round(Math.max(RATE_DEFAULT.minHours,hours)*rate*rep*SIM.priceIndex(year));
  /* stress */
  let wTot=0;for(const e of E.els)wTot+=e.w;
  const ctx={design,client,p,box,E,F,tone,tol,sun,wTot,ageTattoo,painTol:client.traits&&client.traits.pain!=null?client.traits.pain:0.5,cover:dzJobCover(client.job)};
  const stress=dzStress(ctx);
  return{readability:dzR(readability),flow:dzR(flow),balance:dzR(balance),coherence:dzR(coherence),fit:dzR(fit),total:dzR(total),
    agePrediction,hours,sessions,price,stress};
}
SIM.scoreDesign=scoreDesign;
SIM.LINE_MM=LINE_MM;SIM.FAMILY_SHAPE=FAMILY_SHAPE;SIM.SKIN_CONTRAST=SKIN_CONTRAST;SIM.COMBOS=COMBOS;SIM.DESIGN_WEIGHTS=DESIGN_WEIGHTS;
/* helpers for the design board (app/design.js) */
/* the piece's footprint in the design's normalised box: {x0, y0, w, h, cx, cy} (multiply by sizeMm for millimetres) */
SIM.footprintOf=design=>{const E=dzElems(design||{});return{x0:E.fx0,y0:E.fy0,w:E.fw,h:E.fh,cx:E.cx,cy:E.cy};};
/* how well an ink colour reads on a skin tone, 0..1 (SKIN_CONTRAST; under 0.45 reads faintly, under 0.2 not at all) */
SIM.inkReads=(colourId,skinTone)=>dzContrast(dzColour(colourId).light,skinTone==null?0.3:skinTone);
/* an element's path bounding box in its 0..100 viewBox {x, y, w, h}, the same box scoring takes its proportions from */
SIM.elementBox=id=>{const d=dzDef(id),a=d.path?dzPathBox(d.path):null,b=d.fill&&d.fill!==d.path?dzPathBox(d.fill):null;
  if(!a&&!b)return{x:0,y:0,w:100,h:100};if(!a||!b)return a||b;
  const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return{x,y,w:Math.max(a.x+a.w,b.x+b.w)-x,h:Math.max(a.y+a.h,b.y+b.h)-y};};
/* the local flow direction (degrees, like rot) at a point in mm on a placement for a body shape */
SIM.flowAt=(placementId,bodyShape,xMm,yMm)=>{const p=SIM.PLACEMENTS[placementId];if(!p)return 0;
  return dzLocalFlow(dzFlowSegs(p,SIM.placementBox(placementId,bodyShape)),xMm,yMm,p.flowDeg||0);};
SIM.FLASH_DISCOUNT=FLASH_DISCOUNT;
SIM.HOURS=HOURS;SIM.SESSION_HOURS=SESSION_HOURS;SIM.RATE_DEFAULT=RATE_DEFAULT;SIM.JOB_COVER=JOB_COVER;SIM.lineMm=dzLineMm;
