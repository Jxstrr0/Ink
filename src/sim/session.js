/* ===== sim/session.js: the tattoo session: stencil, trace-and-rhythm scoring, shading, client meters, outputs (PR 4) =====
   A pure, deterministic model of one sitting in the chair. The app feeds it pointer samples in millimetres on the
   placement box (time in ms) and it keeps every running number in a plain object `sess` that saves as JSON (numbers and
   short strings only: never pointer streams). The same samples always give the same scores. Nothing here is random.

   The stencil. sessionPlan turns a design into what you tattoo: every element's SVG path is flattened (M L H V C S Q T A Z,
   absolute and relative), moved into placement millimetres exactly the way the board draws it (app/design.js dzTf: the
   piece's pos on the box, the element's x/y in the footprint, its scale and rot) and resampled every STENCIL.stepMm into a
   stroke. Strokes are split into STENCIL.segMm segments for scoring. Elements with fill > 0 give a zone from their fill path
   (nonzero rule like every renderer, so overlapping parts are one zone and a hole drawn the other way round stays bare):
   black or grey fills are shading zones, coloured fills are colour zones. The work list is every stroke, then every
   shading zone, then every colour zone; each item carries a share of the piece's hours (scoreDesign hours less setup) by its
   length or its area x fill. A piece of N sittings (scoreDesign sessions, or the booking's) splits that list at 1/N, 2/N...
   of the hours, so the first sitting is mostly linework; a zone worth more than a sitting is cut into bands (ssSplitZone). A sitting that ends early leaves the rest to the next one.

   Linework (plan Q4: trace-and-rhythm). The player starts on the dot and follows the stroke while a pacing marker runs at the
   target pace (PACE.frac of the view per second x the kit's pace). Each sample is projected onto the stroke (forward only, and never further than the finger moved, so loops, crossings
   and sharp corners work); pace is the finger's own speed over the last PACE.speedMs. Per segment, time-weighted:
     accuracy  = how close to the line (ACC; the tolerance is the kit's accFrac of the view, so it is the same on screen)
     pace      = how near the target speed, flat inside the band (kitBands paceBand: skill, machine, voltage, Assist)
     depth     = needle hit / pace (slow = deep, digging in; fast = shallow): DEPTH
   segment quality = accuracy x pace, a blowout (BLOW) if you rushed past the band for PACE.blowMs inside it, and every
   restart (lifting and putting the finger back, or stopping for PACE.stopMs and going again) is a join (JOIN). A liner that
   doesn't lay the line weight the element wants costs quality (LW_FIT). Lingering adds trauma.
   Shading and colour. Hold and sweep inside a shading zone, or swipe back and forth in a colour zone: the zone's saturation
   meter fills by the distance swept inside it (or within ZONE.slop of its edge) (ZONE), fastest with a mag, at a steady sweep speed, and colour packs properly only while
   you keep reversing (COLOUR). Past the zone's target (its fill) + ZONE.slack you are overworking the skin: trauma.
   Client meters. A sitting has a clock in hours that moves with the work (a stroke traced at pace uses its share of the
   hours; tracing slower uses more). pain rises with the placement's pain, the client's pain TOLERANCE (traits.pain, 1 =
   tough), the machine and voltage, how long they've sat, and any trauma you cause; fatigue rises steadily, faster in pain.
   Break (BREAK), numbing cream (NUMB: a consumable that costs rubles) and chat (CHAT: helps with a talkative client) push
   back. Either meter at 1 ends the sitting: the piece continues next time. Practice on fake skin has no meters.
   Outputs (aging.js tattoo.out): lineQuality, depthQuality, saturation (0..1, higher is better), trauma (0..1, LOWER is
   better), plus sessionsUsed, blowouts, joins.

   API (all pure; sess is the only thing changed, and only by the functions that say so):
     SIM.sessionNew(o) -> sess        o = {design, client (or null), skills, kit, settings:{assist}, bodyShape, skinTone,
                                       kind: "practice"|"sample"|"booked", itemId, part, partsTotal, progress, year, week}
     SIM.sessionPlan(sess) -> plan    {box, strokes:[{el, lw, colour, pts:[x0,y0,x1,...], cum, len, segs}], zones:[{el, kind,
                                       colour, target, polys:[[x,y,...]], area, box, band?, bands?}], items:[{k:"line"|"shade"|"colour", i, w}],
                                       hours, parts, dots}  (cached; never saved)
     SIM.sessionBands(sess)           the kit bands plus paceMmS, accMm, view (mm)
     SIM.sessionPlace(sess, pos)      move the stencil before the first line (pos 0..1 in the box); returns stencilCheck
     SIM.sessionRotate(sess, deg)     turn the stencil before the first line (about its own centre); returns stencilCheck
     SIM.stencilCheck(design, client, skills) -> {flow, issues:[{id, sev, text}]}   flow and crease, re-checked
     SIM.sessionItem(sess) -> the current item (with .stroke or .zone) or null
     SIM.penDown / penMove / penUp(sess, t, x, y) -> live {ok, r (pace ratio), d (mm off), u, rushed, stopped, blow, sat,
                                       inside, pain, fatigue, stop, done}   (mutate sess)
     SIM.sessionSetLiner(sess, id), SIM.sessionNextItem(sess) (leave a zone / give up the rest of a line), SIM.sessionAction(
       sess, "break"|"numb"|"chat") -> {ok, why, cost, talk}  (mutate sess)
     SIM.sessionFinish(sess) -> {done, early, stop, out, sitting, progress, part, partsTotal, sessionsUsed}   (pure)
     SIM.sessionXp(result, sess, skills) -> {linework, shading, colour, speed, styles:{id:+x}}   SKILL_XP
     SIM.sessionPainRate(sess) -> pain per hour now;  SIM.sessionSynth(sess, opts) -> contacts for tests
   Private helpers start with ss. ===== */

/* the stencil */
const STENCIL={curveStep:2.5,stepMm:1,minStrokeMm:2.5,segMm:8,minZoneMm2:8,areaGrid:48,splitAt:1,lineW:1,zoneW:0.12,colourW:1.2,viewPad:0.06,minView:24};
/* pace: target = view size x frac per second x the kit's pace. A ratio over 1 + band x rush is rushing */
const PACE={frac:0.11,speedMs:120,smoothMs:60,warmMs:160,stop:0.15,go:0.45,stopMs:350,rush:1.25,blowMs:110,fall:0.38,backMm:3,aheadMm:0.6,aheadK:1.4,
  startSlop:3.2,endSlop:1.6,doneShare:0.94};
/* accuracy: full marks inside acc mm (a little off-centre is fine), falling to nothing at acc x (1 + fall) */
const ACC={minMm:1,inner:0.25,fall:2};
/* depth: depth = hit / ratio^paceExp; scored by how far log(depth) is from 0 against the kit's depthTol */
const DEPTH={paceExp:0.6,deep:0.3,minRatio:0.15};
const BLOW={q:0.6};                       // a segment with a blowout keeps this share of its quality
const JOIN={q:0.9};                       // each join keeps this share of the stroke's quality
/* the line weight the element wants against the liner in use: per LINE_WEIGHTS step outside its band */
const LW_FIT={under:0.82,over:0.86,overRush:0.85,passTrauma:0.015};
/* zones: one full pass of saturation = sqrt(area) x passes mm of sweeping. Sweep speed band as view shares per second */
const ZONE={slop:0.02,slopMin:1.2,passes:3.2,slack:0.12,vLo:0.04,vHi:0.45,depthW:0.6};
const COLOUR={windowMs:550,minLegShare:0.015,sweepK:0.35,turnDot:-0.2};
/* skin trauma: per hour of work, per second lingering on a line (x log depth past DEPTH.deep), each blowout, overworking a zone, holding still in a zone */
const TRAUMA={perHour:0.035,linger:0.02,blow:0.05,over:0.6,dig:0.05};
/* the client's meters: per hour. pain = k x (placement pain + floor) x tolerance factor x machine x (1 + ramp x hours) */
const PAIN={k:0.24,floor:0.1,tolLo:1.6,tolHi:0.55,ramp:0.25,trauma:0.6,limit:1};
const FATIGUE={k:0.15,pain:0.45,limit:1};
const BREAK={hours:0.25,pain:0.4,fatigue:0.28,fade:0.65,max:4};
const NUMB={price:250,mult:0.45,now:0.25,hours:2,max:1};   // price in 2000 rubles x priceIndex
const CHAT={hours:0.75,fatigue:0.6,max:3,quiet:0.3,annoy:0.04};
const CLOCK={maxDt:0.3};                  // seconds: a longer gap between samples counts as this much work time
/* XP for a sitting (added straight onto the 0..10 skill levels), less as the level climbs */
const SKILL_XP={practice:{linework:0.05,shading:0.04,colour:0.04,style:0.02,speed:0.01},
  sample:{linework:0.08,shading:0.06,colour:0.06,style:0.04,speed:0.015},
  booked:{linework:0.1,shading:0.08,colour:0.08,style:0.05,speed:0.02},
  diminish:0.75,floor:0.3};

/* ---- the SVG flattener: path data -> subpaths [{pts:[x,y,...], closed}] in path units ---- */
function ssFlatten(d){
  const tk=String(d||"").match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)||[];
  const N={m:2,l:2,h:1,v:1,c:6,s:4,q:4,t:2,a:7,z:0},subs=[];
  let cur=null,i=0,cmd="",x=0,y=0,sx=0,sy=0,c2x=0,c2y=0,qx=0,qy=0,prev="";
  const start=(px,py)=>{cur={pts:[px,py],closed:false};subs.push(cur);};
  const to=(px,py)=>{if(!cur)start(x,y);cur.pts.push(px,py);};
  const steps=l=>clamp(Math.ceil(l/STENCIL.curveStep),3,48);
  const cubic=(x0,y0,x1,y1,x2,y2,x3,y3)=>{
    const n=steps(Math.hypot(x1-x0,y1-y0)+Math.hypot(x2-x1,y2-y1)+Math.hypot(x3-x2,y3-y2));
    for(let j=1;j<=n;j++){const t=j/n,u=1-t;to(u*u*u*x0+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x3,u*u*u*y0+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3);}};
  const quad=(x0,y0,x1,y1,x2,y2)=>{
    const n=steps(Math.hypot(x1-x0,y1-y0)+Math.hypot(x2-x1,y2-y1));
    for(let j=1;j<=n;j++){const t=j/n,u=1-t;to(u*u*x0+2*u*t*x1+t*t*x2,u*u*y0+2*u*t*y1+t*t*y2);}};
  while(i<tk.length){
    if(/[a-zA-Z]/.test(tk[i])){cmd=tk[i++];
      if(cmd==="z"||cmd==="Z"){if(cur){cur.closed=true;if(x!==sx||y!==sy)cur.pts.push(sx,sy);}x=sx;y=sy;cur=null;prev="z";continue;}}
    const lc=cmd.toLowerCase(),k=N[lc];if(!k){i++;continue;}
    const a=tk.slice(i,i+k).map(Number);i+=k;if(a.length<k||a.some(v=>isNaN(v)))break;
    const rel=cmd!==cmd.toUpperCase(),ox=rel?x:0,oy=rel?y:0;
    if(lc==="m"){x=ox+a[0];y=oy+a[1];sx=x;sy=y;start(x,y);cmd=rel?"l":"L";}
    else if(lc==="l"){x=ox+a[0];y=oy+a[1];to(x,y);}
    else if(lc==="h"){x=ox+a[0];to(x,y);}
    else if(lc==="v"){y=oy+a[0];to(x,y);}
    else if(lc==="c"){cubic(x,y,ox+a[0],oy+a[1],ox+a[2],oy+a[3],ox+a[4],oy+a[5]);c2x=ox+a[2];c2y=oy+a[3];x=ox+a[4];y=oy+a[5];}
    else if(lc==="s"){const r1x=prev==="c"||prev==="s"?2*x-c2x:x,r1y=prev==="c"||prev==="s"?2*y-c2y:y;
      cubic(x,y,r1x,r1y,ox+a[0],oy+a[1],ox+a[2],oy+a[3]);c2x=ox+a[0];c2y=oy+a[1];x=ox+a[2];y=oy+a[3];}
    else if(lc==="q"){quad(x,y,ox+a[0],oy+a[1],ox+a[2],oy+a[3]);qx=ox+a[0];qy=oy+a[1];x=ox+a[2];y=oy+a[3];}
    else if(lc==="t"){const cx=prev==="q"||prev==="t"?2*x-qx:x,cy=prev==="q"||prev==="t"?2*y-qy:y;
      quad(x,y,cx,cy,ox+a[0],oy+a[1]);qx=cx;qy=cy;x=ox+a[0];y=oy+a[1];}
    else if(lc==="a"){const ex=ox+a[5],ey=oy+a[6];ssArc(x,y,a[0],a[1],a[2],a[3],a[4],ex,ey,to);x=ex;y=ey;}
    prev=lc;
  }
  return subs.filter(s=>s.pts.length>=4);
}
/* an SVG arc (endpoint form) sampled through its centre; ends exactly on (x2, y2) */
function ssArc(x1,y1,rx,ry,phi,fa,fs,x2,y2,to){
  rx=Math.abs(rx);ry=Math.abs(ry);if(!rx||!ry||(x1===x2&&y1===y2)){to(x2,y2);return;}
  const c=Math.cos(phi*Math.PI/180),s=Math.sin(phi*Math.PI/180),dx=(x1-x2)/2,dy=(y1-y2)/2;
  const xp=c*dx+s*dy,yp=-s*dx+c*dy,lam=xp*xp/(rx*rx)+yp*yp/(ry*ry);
  if(lam>1){const k=Math.sqrt(lam);rx*=k;ry*=k;}
  const num=rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp,den=rx*rx*yp*yp+ry*ry*xp*xp;
  const co=(fa===fs?-1:1)*Math.sqrt(Math.max(0,num/(den||1)));
  const cxp=co*rx*yp/ry,cyp=-co*ry*xp/rx,cx=c*cxp-s*cyp+(x1+x2)/2,cy=s*cxp+c*cyp+(y1+y2)/2;
  const ang=(ux,uy,vx,vy)=>Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
  const t1=ang(1,0,(xp-cxp)/rx,(yp-cyp)/ry);let dt=ang((xp-cxp)/rx,(yp-cyp)/ry,(-xp-cxp)/rx,(-yp-cyp)/ry);
  if(!fs&&dt>0)dt-=2*Math.PI;else if(fs&&dt<0)dt+=2*Math.PI;
  const n=clamp(Math.ceil(Math.abs(dt)*Math.max(rx,ry)/STENCIL.curveStep),4,64);
  for(let i=1;i<n;i++){const t=t1+dt*i/n,ex=rx*Math.cos(t),ey=ry*Math.sin(t);to(c*ex-s*ey+cx,s*ex+c*ey+cy);}
  to(x2,y2);
}
/* resample a polyline every `step` mm: {pts, cum, len} */
function ssResample(p,step){
  let L=0;const raw=[0];for(let i=2;i<p.length;i+=2){L+=Math.hypot(p[i]-p[i-2],p[i+1]-p[i-1]);raw.push(L);}
  if(L<=0)return{pts:[p[0],p[1]],cum:[0],len:0};
  const n=Math.max(1,Math.round(L/step)),pts=[],cum=[];let j=1;
  for(let k=0;k<=n;k++){const u=L*k/n;while(j<raw.length-1&&raw[j]<u)j++;
    const a=raw[j-1],b=raw[j],t=b>a?(u-a)/(b-a):0;pts.push(lerp(p[2*j-2],p[2*j],t),lerp(p[2*j-1],p[2*j+1],t));cum.push(u);}
  return{pts,cum,len:L};
}
function ssAreaOf(poly){let a=0;for(let i=0,n=poly.length;i<n;i+=2){const j=(i+2)%n;a+=poly[i]*poly[j+1]-poly[j]*poly[i+1];}return a/2;}
/* inside a zone, or within slop mm of its edge (a finger is wider than a sliver of leaf) */
function ssNear(polys,x,y,slop){if(ssInside(polys,x,y))return true;if(!(slop>0))return false;const s2=slop*slop;
  for(const p of polys)for(let i=0,n=p.length,j=n-2;i<n;j=i,i+=2){const ax=p[j],ay=p[j+1],dx=p[i]-ax,dy=p[i+1]-ay,l2=dx*dx+dy*dy||1e-9;
    const t=clamp(((x-ax)*dx+(y-ay)*dy)/l2,0,1),qx=ax+t*dx-x,qy=ay+t*dy-y;if(qx*qx+qy*qy<=s2)return true;}
  return false;}
/* inside by the nonzero rule, the rule the board, the flash wall and the body draw fills with (0.1.19.0; was even-odd):
   a hole is a subpath drawn the other way round inside its outline */
function ssWinding(polys,x,y){let w=0;
  for(const p of polys)for(let i=0,n=p.length,j=n-2;i<n;j=i,i+=2){const xi=p[i],yi=p[i+1],xj=p[j],yj=p[j+1],c=(xi-xj)*(y-yj)-(x-xj)*(yi-yj);
    if(yj<=y){if(yi>y&&c>0)w++;}else if(yi<=y&&c<0)w--;}
  return w;}
function ssInside(polys,x,y){return ssWinding(polys,x,y)!==0;}
/* a zone's inked area in mm2 by the nonzero rule. Separate subpaths add whatever way round they are drawn (a mirrored half
   runs the other way and no longer cancels its twin); when one subpath starts inside another (a hole, or an overlap) the
   area is counted on a STENCIL.areaGrid x areaGrid grid over the zone's box instead */
function ssZoneArea(polys){
  const ps=polys.filter(p=>p.length>=6);let nest=false;
  for(let i=0;i<ps.length&&!nest;i++)for(let j=0;j<ps.length;j++)if(i!==j&&ssWinding([ps[j]],ps[i][0],ps[i][1])!==0){nest=true;break;}
  if(!nest)return ps.reduce((s,p)=>s+Math.abs(ssAreaOf(p)),0);
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of ps)for(let i=0;i<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1]);}
  const g=STENCIL.areaGrid,dx=(x1-x0)/g,dy=(y1-y0)/g;let n=0;
  for(let a=0;a<g;a++)for(let b=0;b<g;b++)if(ssWinding(ps,x0+(a+0.5)*dx,y0+(b+0.5)*dy)!==0)n++;
  return n*dx*dy;}

/* A zone bigger than STENCIL.splitAt sittings' share of the work is cut into bands across its longer side, each about
   one sitting's worth, so a big colour area (a koi's whole body on a back piece) spreads over the sittings like the
   lines do instead of landing in one. Each subpath is clipped to the band (Sutherland-Hodgman on a convex slab keeps
   the nonzero winding inside it); the cuts fall at equal shares of the zone's area. */
function ssClipSlab(p,ax,a,b){
  let pts=[];for(let i=0;i<p.length;i+=2)pts.push([p[i],p[i+1]]);
  for(const [lim,keep] of [[a,1],[b,-1]]){
    const o=[],n=pts.length;if(!n)break;
    for(let i=0;i<n;i++){const P=pts[i],Q=pts[(i+1)%n],pin=(P[ax]-lim)*keep>=0,qin=(Q[ax]-lim)*keep>=0;
      if(pin)o.push(P);
      if(pin!==qin){const t=(lim-P[ax])/(Q[ax]-P[ax]);o.push([P[0]+(Q[0]-P[0])*t,P[1]+(Q[1]-P[1])*t]);}}
    pts=o;}
  const out=[];for(const q of pts)out.push(q[0],q[1]);return out;}
function ssSplitZone(z,k){
  const ax=z.box[2]-z.box[0]>=z.box[3]-z.box[1]?0:1,lo=z.box[ax],hi=z.box[ax+2],g=STENCIL.areaGrid*2,d=(hi-lo)/g;
  const cum=[0];for(let a=0;a<g;a++){let n=0;const u=lo+(a+0.5)*d;
    for(let c=0;c<g;c++){const v=z.box[1-ax]+(c+0.5)*(z.box[3-ax]-z.box[1-ax])/g;if(ssWinding(z.polys,ax?v:u,ax?u:v)!==0)n++;}
    cum.push(cum[a]+n);}
  const cuts=[lo];for(let j=1;j<k;j++){const want=cum[g]*j/k;let a=1;while(a<g&&cum[a]<want)a++;cuts.push(lo+a*d);}cuts.push(hi);
  const out=[];
  for(let j=0;j<k;j++){const polys=z.polys.map(p=>ssClipSlab(p,ax,cuts[j],cuts[j+1])).filter(p=>p.length>=6),area=ssZoneArea(polys);
    if(area<STENCIL.minZoneMm2)continue;
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of polys)for(let i=0;i<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1]);}
    out.push(Object.assign({},z,{polys,area,box:[x0,y0,x1,y1],cx:(x0+x1)/2,cy:(y0+y1)/2,band:j,bands:k}));}
  return out.length?out:[z];}

/* ---- the plan: stencil strokes, zones and the work list for a design (cached by design + body shape) ---- */
const ssPlanCache=new Map();
function ssPlanFor(design,bodyShape,client,skills,parts){
  const key=JSON.stringify([design,bodyShape||"neutral",parts||0]);
  const hit=ssPlanCache.get(key);if(hit)return hit;
  const P=SIM.PLACEMENTS[design.placement]||null;
  const box=P?SIM.placementBox(design.placement,bodyShape):{wrapMm:120,lengthMm:240};
  const sz=design.sizeMm||50,pos=design.pos||{x:0.5,y:0.5},fp=SIM.footprintOf(design);
  const strokes=[],zones=[];let dots=0;
  (design.elements||[]).forEach((el,ei)=>{
    const def=SIM.elementById(el.id);if(!def)return;
    const b=SIM.elementBox(el.id),k=((el.scale!=null?el.scale:0.5)*sz)/Math.max(b.w,b.h,1e-6),bcx=b.x+b.w/2,bcy=b.y+b.h/2;
    const mx=pos.x*box.wrapMm+((el.x!=null?el.x:0.5)-fp.cx)*sz,my=pos.y*box.lengthMm+((el.y!=null?el.y:0.5)-fp.cy)*sz;
    const th=(el.rot||0)*Math.PI/180,cs=Math.cos(th),sn=Math.sin(th);
    const tf=p=>{const o=[];for(let i=0;i<p.length;i+=2){const px=(p[i]-bcx)*k,py=(p[i+1]-bcy)*k;o.push(mx+px*cs-py*sn,my+px*sn+py*cs);}return o;};
    const lw=el.lineWeight!=null?el.lineWeight:(def.lineWeightDefault||7);
    const colour=el.colour||null,lineCol=colour&&(design.style==="watercolour"||!(el.fill>0))?colour:null;
    for(const sp of ssFlatten(def.path)){
      const r=ssResample(tf(sp.pts),STENCIL.stepMm);
      if(r.len<STENCIL.minStrokeMm){dots++;continue;}
      const segs=[],ns=Math.max(1,Math.round(r.len/STENCIL.segMm));for(let s=0;s<ns;s++)segs.push(r.len*(s+1)/ns);
      strokes.push({el:ei,lw,colour:lineCol,pts:r.pts,cum:r.cum,len:r.len,segs,closed:sp.closed,detail:def.detail||0.5});
    }
    if(def.fill&&el.fill>0){
      const polys=ssFlatten(def.fill).map(sp=>tf(sp.pts));
      const area=ssZoneArea(polys);
      if(area>=STENCIL.minZoneMm2){
        let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of polys)for(let i=0;i<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1]);}
        const col=colour&&colour!=="black"&&colour!=="grey";
        zones.push({el:ei,kind:col?"colour":"shade",colour:colour||"black",target:clamp(el.fill,0.05,1),polys,area,box:[x0,y0,x1,y1],cx:(x0+x1)/2,cy:(y0+y1)/2});
      }
    }
  });
  const sc=SIM.scoreDesign(design,client||null,skills||{});
  const nParts=Math.max(1,parts||sc.sessions);
  if(nParts>1){
    const zw=z=>z.area*z.target*STENCIL.zoneW*(z.kind==="colour"?STENCIL.colourW:1);
    const lineRaw=strokes.reduce((s,st)=>s+st.len*STENCIL.lineW*(0.8+0.4*st.detail),0),share=(lineRaw+zones.reduce((s,z)=>s+zw(z),0))/nParts;
    const cut=[];for(const z of zones){const k=Math.ceil(zw(z)/(share*STENCIL.splitAt)-1e-9);if(k>1)cut.push(...ssSplitZone(z,k));else cut.push(z);}
    zones.length=0;zones.push(...cut);
  }
  const items=[];
  strokes.forEach((s,i)=>items.push({k:"line",i,raw:s.len*STENCIL.lineW*(0.8+0.4*s.detail)}));
  zones.forEach((z,i)=>{if(z.kind==="shade")items.push({k:"shade",i,raw:z.area*z.target*STENCIL.zoneW});});
  zones.forEach((z,i)=>{if(z.kind==="colour")items.push({k:"colour",i,raw:z.area*z.target*STENCIL.zoneW*STENCIL.colourW});});
  const work=Math.max(0.25,sc.hours-((SIM.HOURS&&SIM.HOURS.setup)||0.5)),tot=items.reduce((s,it)=>s+it.raw,0)||1;
  let cw=0;for(const it of items){it.w=it.raw/tot*work;cw+=it.w;it.cw=cw;delete it.raw;}
  const plan={key,box,sizeMm:sz,strokes,zones,items,hours:sc.hours,work,parts:nParts,price:sc.price,dots,
    pain:P?P.pain:0.4,placement:design.placement};
  if(ssPlanCache.size>40)ssPlanCache.clear();
  ssPlanCache.set(key,plan);
  return plan;
}
function ssPlan(sess){return ssPlanFor(sess.design,sess.bodyShape,sess.client,sess.skills,sess.partsTotal);}
/* where this sitting's work ends: the items up to part/partsTotal of the hours (at least one item past `next`) */
function ssSitEnd(plan,next,part,partsTotal){
  const n=plan.items.length;if(part>=partsTotal)return n;
  const B=plan.work*part/partsTotal*0.985;let j=next+1;
  while(j<n&&plan.items[j-1].cw<B)j++;
  return Math.min(n,j);
}
/* the view: the bounding box of this sitting's work, padded (pace and tolerance scale with it) */
function ssSitView(plan,a,b){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(let i=a;i<b;i++){const it=plan.items[i];
    if(it.k==="line"){const p=plan.strokes[it.i].pts;for(let j=0;j<p.length;j+=2){x0=Math.min(x0,p[j]);x1=Math.max(x1,p[j]);y0=Math.min(y0,p[j+1]);y1=Math.max(y1,p[j+1]);}}
    else{const z=plan.zones[it.i];x0=Math.min(x0,z.box[0]);y0=Math.min(y0,z.box[1]);x1=Math.max(x1,z.box[2]);y1=Math.max(y1,z.box[3]);}}
  if(x0>x1){x0=0;y0=0;x1=plan.box.wrapMm;y1=plan.box.lengthMm;}
  const size=Math.max(STENCIL.minView,x1-x0,y1-y0),pad=size*STENCIL.viewPad,cx=(x0+x1)/2,cy=(y0+y1)/2;
  const w=Math.max(x1-x0,STENCIL.minView*0.6)+2*pad,h=Math.max(y1-y0,STENCIL.minView*0.6)+2*pad;
  return{x0:dsR(cx-w/2),y0:dsR(cy-h/2),w:dsR(w),h:dsR(h),size:dsR(size)};
}
const dsR=v=>Math.round(v*1000)/1000;

/* ---- the session object ---- */
function ssEmptyAcc(){return{lineLen:0,lineQ:0,depthW:0,depthQ:0,blow:0,joins:0,trauma:0,sittings:0,hours:0};}
function sessionNew(o){
  o=o||{};
  const kind=o.kind||"sample",design=JSON.parse(JSON.stringify(o.design||{}));
  const cl=o.client||null,practice=kind==="practice";
  const tr=cl&&cl.traits||{};
  const sess={v:1,kind,itemId:o.itemId||null,clientId:cl?cl.id||null:null,
    client:practice||!cl?null:{name:cl.name||"Client",pronouns:cl.pronouns||"",traits:{pain:tr.pain!=null?tr.pain:0.5,talkative:tr.talkative!=null?tr.talkative:0.5,sun:tr.sun!=null?tr.sun:0.4}},
    design,bodyShape:o.bodyShape||(cl&&cl.bodyShape)||"neutral",skinTone:o.skinTone!=null?o.skinTone:(cl&&cl.skinTone!=null?cl.skinTone:0.3),
    kit:SIM.kitClean(o.kit),settings:{assist:!!(o.settings&&o.settings.assist)},
    skills:{linework:+((o.skills||{}).linework)||0,shading:+((o.skills||{}).shading)||0,colour:+((o.skills||{}).colour)||0,speed:+((o.skills||{}).speed)||0,
      styles:Object.assign({},(o.skills||{}).styles||{})},
    year:o.year||2000,week:o.week||1,part:o.part||1,partsTotal:0,phase:"place",
    next:0,start:0,end:0,view:null,liner:null,cur:null,zsat:[],acc:ssEmptyAcc(),
    sit:{lineLen:0,lineQ:0,depthW:0,depthQ:0,blow:0,joins:0,trauma:0,zoneWork:{shade:0,colour:0}},
    m:{pain:0,fatigue:0,clock:0,breaks:0,numbH:0,numbs:0,chatH:0,chats:0},stop:null,pen:null};
  if(practice)sess.partsTotal=1;
  else sess.partsTotal=o.partsTotal||ssPlanFor(design,sess.bodyShape,sess.client,sess.skills,0).parts;
  const plan=ssPlan(sess),pr=o.progress||null;
  sess.zsat=plan.zones.map((z,i)=>pr&&Array.isArray(pr.zsat)&&typeof pr.zsat[i]==="number"?pr.zsat[i]:0);
  if(pr){sess.next=clamp(pr.next|0,0,plan.items.length);sess.acc=Object.assign(ssEmptyAcc(),pr.acc||{});sess.cur=pr.cur||null;
    if(sess.next>0||sess.cur)sess.phase="work";}
  ssStartSitting(sess);
  return sess;
}
function ssStartSitting(sess){
  const plan=ssPlan(sess);
  sess.start=sess.next;sess.end=ssSitEnd(plan,sess.next,sess.part,sess.partsTotal);
  sess.view=ssSitView(plan,sess.start,sess.end);
  const first=plan.items.slice(sess.start,sess.end).find(it=>it.k==="line");
  sess.liner=ssBestLiner(sess,first?plan.strokes[first.i].lw:7);
}
/* the liner on the tray whose clean band holds this line weight (or the nearest) */
function ssBestLiner(sess,lw){
  const B=SIM.kitBands(sess.kit,sess.skills,sess.settings),LW=SIM.LINE_WEIGHTS;let best=null,bd=1e9;
  for(const l of B.liners){const d=lw<l.lo?LW.indexOf(l.lo)-LW.indexOf(lw):lw>l.hi?LW.indexOf(lw)-LW.indexOf(l.hi):0;
    const dd=d*10+Math.abs(LW.indexOf(l.rl)-LW.indexOf(lw));if(dd<bd){bd=dd;best=l.id;}}
  return best;
}
const ssBandCache=new Map();
function ssBands(sess){
  const key=JSON.stringify([sess.kit,sess.skills.linework,sess.skills.shading,sess.skills.colour,sess.settings.assist,sess.liner,sess.view&&sess.view.size]);
  let b=ssBandCache.get(key);if(b)return b;
  b=Object.assign({},SIM.kitBands(sess.kit,sess.skills,sess.settings,{liner:sess.liner}));
  const v=sess.view?sess.view.size:50;
  b.view=v;b.paceMmS=v*PACE.frac*b.pace;b.accMm=Math.max(ACC.minMm,v*b.accFrac);
  if(ssBandCache.size>60)ssBandCache.clear();ssBandCache.set(key,b);
  return b;
}
function sessionItem(sess){
  const plan=ssPlan(sess);if(sess.next>=sess.end||sess.next>=plan.items.length)return null;
  const it=plan.items[sess.next];
  return Object.assign({idx:sess.next},it,it.k==="line"?{stroke:plan.strokes[it.i]}:{zone:plan.zones[it.i]});
}
/* stencil placement (only before any work): move the piece's centre, rebuild the plan, re-check flow and creases */
function stencilCheck(design,client,skills){
  const sc=SIM.scoreDesign(design,client||null,skills||{});
  const ids={crease:1,crease_near:1,too_wide:1,too_long:1,against_flow:1,against_shape:1};
  return{flow:sc.flow,issues:sc.stress.filter(s=>ids[s.id])};
}
function sessionPlace(sess,pos){
  if(sess.next>0||sess.cur||sess.acc.sittings>0)return stencilCheck(sess.design,sess.client,sess.skills);
  sess.design.pos={x:dsR(clamp(pos.x,0,1)),y:dsR(clamp(pos.y,0,1))};
  ssStartSitting(sess);
  return stencilCheck(sess.design,sess.client,sess.skills);
}
/* turn the whole stencil by deg about its footprint's centre. The real size of every element stays the same; if the turned
   design no longer fits its 0..1 box, the box is widened (sizeMm up, coordinates in) so the mm on skin don't change */
function sessionRotate(sess,deg){
  if(sess.next>0||sess.cur||sess.acc.sittings>0||!deg)return stencilCheck(sess.design,sess.client,sess.skills);
  const d=sess.design,fp=SIM.footprintOf(d),th=deg*Math.PI/180,cs=Math.cos(th),sn=Math.sin(th);
  d.elements=(d.elements||[]).map(el=>{const x=(el.x!=null?el.x:0.5)-fp.cx,y=(el.y!=null?el.y:0.5)-fp.cy;
    let r=((el.rot||0)+deg)%360;if(r>180)r-=360;if(r<=-180)r+=360;
    return Object.assign({},el,{x:fp.cx+x*cs-y*sn,y:fp.cy+x*sn+y*cs,rot:r});});
  const f2=SIM.footprintOf(d),k=Math.max(1,f2.w,f2.h);
  d.elements=d.elements.map(el=>Object.assign({},el,{x:dsR(0.5+(el.x-f2.cx)/k),y:dsR(0.5+(el.y-f2.cy)/k),scale:dsR((el.scale!=null?el.scale:0.5)/k),rot:Math.round(el.rot*10)/10}));
  if(k>1)d.sizeMm=Math.round((d.sizeMm||50)*k);
  ssStartSitting(sess);
  return stencilCheck(d,sess.client,sess.skills);
}

/* ---- the meters: advance the sitting clock by dH hours of work (and add any trauma) ---- */
function sessionPainRate(sess){
  if(sess.kind==="practice"||!sess.client)return 0;
  const plan=ssPlan(sess),b=ssBands(sess),tol=clamp(sess.client.traits.pain,0,1);
  return PAIN.k*(plan.pain+PAIN.floor)*lerp(PAIN.tolLo,PAIN.tolHi,tol)*b.pain*(1+PAIN.ramp*sess.m.clock)*(sess.m.numbH>0?NUMB.mult:1);
}
function ssClock(sess,dH,dT){
  const m=sess.m;dT=dT||0;
  const b=ssBands(sess);dT+=TRAUMA.perHour*b.trauma*dH;
  sess.acc.trauma+=dT;sess.sit.trauma+=dT;
  if(sess.kind==="practice"||!sess.client){m.clock+=dH;return;}
  const rate=sessionPainRate(sess);
  m.pain+=rate*dH+dT*PAIN.trauma;
  const talk=clamp(sess.client.traits.talkative,0,1);
  m.fatigue+=FATIGUE.k*(1+FATIGUE.pain*Math.min(1,m.pain))*(m.chatH>0?1-CHAT.fatigue*talk:1)*dH;
  m.clock+=dH;m.numbH=Math.max(0,m.numbH-dH);m.chatH=Math.max(0,m.chatH-dH);
  if(!sess.stop){if(m.pain>=PAIN.limit)sess.stop="pain";else if(m.fatigue>=FATIGUE.limit)sess.stop="fatigue";}
}

/* ---- linework ---- */
function ssProject(st,x,y,u0,u1){
  const c=st.cum,p=st.pts;let lo=0,hi=c.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(c[mid]<u0)lo=mid+1;else hi=mid;}
  let best=1e18,bu=u0;const i0=Math.max(1,lo);
  for(let i=i0;i<c.length&&c[i-1]<=u1;i++){
    const ax=p[2*i-2],ay=p[2*i-1],dx=p[2*i]-ax,dy=p[2*i+1]-ay,l2=dx*dx+dy*dy||1e-9;
    const t=clamp(((x-ax)*dx+(y-ay)*dy)/l2,0,1),qx=ax+t*dx-x,qy=ay+t*dy-y,d=qx*qx+qy*qy;
    if(d<best){best=d;bu=c[i-1]+t*(c[i]-c[i-1]);}
  }
  return{u:bu,d:Math.sqrt(best)};
}
function ssPointAt(st,u){
  const c=st.cum,p=st.pts;u=clamp(u,0,st.len);let lo=1,hi=c.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(c[mid]<u)lo=mid+1;else hi=mid;}
  const i=Math.max(1,lo),a=c[i-1],b=c[i],t=b>a?(u-a)/(b-a):0;
  return[lerp(p[2*i-2],p[2*i],t),lerp(p[2*i-1],p[2*i+1],t)];
}
function ssNewCur(st){const n=st.segs.length,z=()=>new Array(n).fill(0);return{u:0,T:z(),A:z(),P:z(),PT:z(),D:z(),R:z(),B:z(),joins:0,contacts:0,t:0,linger:0};}
function ssLwSteps(sess,lw){
  const b=ssBands(sess),LW=SIM.LINE_WEIGHTS,i=LW.indexOf(lw);if(i<0||!b.liner)return 0;
  if(lw>b.lineBand[1])return i-LW.indexOf(b.lineBand[1]);
  if(lw<b.lineBand[0])return-(LW.indexOf(b.lineBand[0])-i);
  return 0;
}
function ssLive(sess,o){const m=sess.m;return Object.assign({ok:true,pain:dsR(m.pain),fatigue:dsR(m.fatigue),clock:dsR(m.clock),stop:sess.stop},o||{});}
function penDown(sess,t,x,y){
  const it=sessionItem(sess);if(!it||sess.phase!=="work")return{ok:false,why:"none"};
  if(it.k==="line"){
    const st=it.stroke,b=ssBands(sess);if(!sess.cur)sess.cur=ssNewCur(st);
    const c=sess.cur,at=ssPointAt(st,c.u),slop=Math.max(b.accMm*PACE.startSlop,b.view*0.05);
    if(Math.hypot(x-at[0],y-at[1])>slop)return{ok:false,why:"start",at};
    if(c.contacts>0&&c.u<st.len-PACE.endSlop){c.joins++;sess.sit.joins++;}
    c.contacts++;
    sess.pen={k:"line",t0:t,t,x,y,u:c.u,v:null,still:0,stopped:false,hx:[x],hy:[y],ht:[t]};
    return ssLive(sess,{u:c.u,r:0,d:Math.hypot(x-at[0],y-at[1])});
  }
  sess.pen={k:it.k,t0:t,t,x,y,dx:0,dy:0,leg:0,lastRev:-1e9};
  const b=ssBands(sess);return ssLive(sess,{inside:ssNear(it.zone.polys,x,y,Math.max(ZONE.slopMin,b.view*ZONE.slop)),sat:dsR(sess.zsat[it.i])});
}
function penMove(sess,t,x,y){
  const pen=sess.pen,it=sessionItem(sess);if(!pen||!it)return{ok:false,why:"up"};
  const dt=(t-pen.t)/1000;if(dt<=0)return ssLive(sess,{});
  const dtc=Math.min(dt,CLOCK.maxDt),b=ssBands(sess);
  if(pen.k==="line"){
    const st=it.stroke,c=sess.cur;
    const ahead=Math.hypot(x-pen.x,y-pen.y)*PACE.aheadK+PACE.aheadMm;   // progress can't outrun the finger (no jumping across a loop)
    const pr=ssProject(st,x,y,Math.max(0,pen.u-PACE.backMm),pen.u+ahead);
    /* pace is the finger's own speed over the last PACE.speedMs (a chord, so touch jitter averages out); du is progress */
    pen.hx.push(x);pen.hy.push(y);pen.ht.push(t);
    while(pen.ht.length>2&&pen.ht[1]<=t-PACE.speedMs){pen.hx.shift();pen.hy.shift();pen.ht.shift();}
    const du=Math.max(0,pr.u-pen.u),inst=Math.hypot(x-pen.hx[0],y-pen.hy[0])/Math.max(1e-3,(t-pen.ht[0])/1000);
    const al=1-Math.exp(-dt*1000/PACE.smoothMs);
    pen.v=pen.v==null?inst:pen.v+(inst-pen.v)*al;
    const r=pen.v/b.paceMmS;
    let joinNow=false;
    if(r<PACE.stop){pen.still+=dt*1000;if(pen.still>=PACE.stopMs)pen.stopped=true;}
    else{if(pen.stopped&&r>PACE.go){c.joins++;sess.sit.joins++;joinNow=true;pen.stopped=false;}if(r>=PACE.go)pen.still=0;}
    const u=pen.u+du,s=Math.min(st.segs.length-1,st.segs.findIndex(e=>u<=e+1e-9)<0?st.segs.length-1:st.segs.findIndex(e=>u<=e+1e-9));
    const steps=ssLwSteps(sess,st.lw),band=b.paceBand,rushAt=1+band*PACE.rush*(steps<0?Math.pow(LW_FIT.overRush,-steps):1);
    const accF=pr.d<=b.accMm?1-ACC.inner*Math.pow(pr.d/b.accMm,2):Math.max(0,(1-ACC.inner)*(1-(pr.d-b.accMm)/(b.accMm*ACC.fall)));
    const lr=Math.abs(Math.log(Math.max(r,1e-3))),lb=Math.log(1+band);
    const paceF=lr<=lb?1:Math.exp(-Math.pow((lr-lb)/PACE.fall,2));
    const depth=b.hit/Math.pow(Math.max(r,DEPTH.minRatio),DEPTH.paceExp),ld=Math.log(depth);
    const depthF=Math.exp(-Math.pow(ld/b.depthTol,2));
    const warm=t-pen.t0<PACE.warmMs;
    c.T[s]+=dtc;c.A[s]+=dtc*accF;c.D[s]+=dtc*depthF;
    if(!warm&&!pen.stopped){c.P[s]+=dtc*paceF;c.PT[s]+=dtc;}
    const rushed=!warm&&r>rushAt;let blow=false;
    if(rushed){c.R[s]+=dt*1000;if(c.R[s]>=PACE.blowMs&&!c.B[s]){c.B[s]=1;blow=true;}}
    let dT=0;if(ld>DEPTH.deep&&!warm)dT+=dtc*(ld-DEPTH.deep)*TRAUMA.linger*b.trauma;
    if(blow)dT+=TRAUMA.blow*b.trauma;
    c.t+=dtc;
    const target=st.len/b.paceMmS;
    ssClock(sess,it.w*dtc/Math.max(0.5,target),dT);
    pen.t=t;pen.x=x;pen.y=y;pen.u=u;c.u=u;
    return ssLive(sess,{u:dsR(u),r:dsR(r),d:dsR(pr.d),rushed,stopped:pen.stopped,blow,join:joinNow,seg:s,acc:dsR(accF),pace:dsR(paceF)});
  }
  /* zones */
  const z=it.zone,dx=x-pen.x,dy=y-pen.y,dist=Math.hypot(dx,dy),slop=Math.max(ZONE.slopMin,b.view*ZONE.slop);
  const inside=ssNear(z.polys,x,y,slop)&&ssNear(z.polys,pen.x,pen.y,slop);
  const vRel=dist/dt/b.view;let f=0,dT=0,depthF=1;
  if(inside){
    f=vRel<ZONE.vLo?vRel/ZONE.vLo:vRel>ZONE.vHi?ZONE.vHi/vRel:1;
    depthF=vRel<ZONE.vLo?lerp(0.55,1,vRel/ZONE.vLo):vRel>ZONE.vHi?Math.max(0.3,ZONE.vHi/vRel):1;
    if(vRel<ZONE.vLo*0.5)dT+=TRAUMA.dig*b.trauma*dtc;
    if(pen.k==="colour"){
      if(dist>1e-6){const ux=dx/dist,uy=dy/dist;
        if(pen.leg>0&&(ux*pen.dx+uy*pen.dy)<COLOUR.turnDot){if(pen.leg>=b.view*COLOUR.minLegShare)pen.lastRev=t;pen.leg=0;}
        pen.dx=ux;pen.dy=uy;pen.leg+=dist;}
      if(t-pen.lastRev>COLOUR.windowMs)f*=COLOUR.sweepK;
    }
  }
  const rate=pen.k==="colour"?b.colour:b.shade;
  const dSat=inside?dist/(Math.sqrt(z.area)*ZONE.passes)*rate*f:0;
  const before=sess.zsat[it.i],after=before+dSat,lim=z.target+ZONE.slack;
  const over=Math.max(0,after-lim)-Math.max(0,before-lim);
  if(over>0)dT+=over*TRAUMA.over*b.trauma;
  sess.zsat[it.i]=after;
  if(dSat>0){const w=dSat*ZONE.depthW*Math.sqrt(z.area)/10;sess.acc.depthW+=w;sess.acc.depthQ+=w*depthF;sess.sit.depthW+=w;sess.sit.depthQ+=w*depthF;sess.sit.zoneWork[pen.k]+=dSat;}
  ssClock(sess,it.w*dSat/Math.max(0.1,z.target),dT);
  pen.t=t;pen.x=x;pen.y=y;
  return ssLive(sess,{inside,sat:dsR(after),target:z.target,over:after>lim,f:dsR(f)});
}
function penUp(sess,t){
  const pen=sess.pen;sess.pen=null;const it=sessionItem(sess);
  if(!pen||!it)return ssLive(sess,{done:false});
  if(pen.k==="line"){
    const st=it.stroke,c=sess.cur;
    if(c&&c.u>=Math.min(st.len-PACE.endSlop,st.len*PACE.doneShare)){ssFinishStroke(sess);return ssLive(sess,{done:true,lineDone:true});}
    return ssLive(sess,{done:false,u:c?dsR(c.u):0});
  }
  return ssLive(sess,{done:false});
}
/* score the current stroke from its segment sums and move on */
function ssFinishStroke(sess){
  const it=sessionItem(sess);if(!it||it.k!=="line"){sess.cur=null;return null;}
  const st=it.stroke,c=sess.cur||ssNewCur(st),n=st.segs.length;
  let sq=0,sd=0,blows=0,last=null,lastD=null;
  for(let s=0;s<n;s++){
    const s0=s?st.segs[s-1]:0;let q,dq;
    if(c.T[s]>0){const acc=c.A[s]/c.T[s],pace=c.PT[s]>0?c.P[s]/c.PT[s]:1;q=acc*pace*(c.B[s]?BLOW.q:1);dq=c.D[s]/c.T[s];last=q;lastD=dq;}
    else if(c.u>=st.segs[s]-1e-9&&last!=null){q=last;dq=lastD;}   // skimmed past in one sample
    else if(c.u>s0){q=(last!=null?last:0.5)*clamp((c.u-s0)/(st.segs[s]-s0),0,1);dq=lastD!=null?lastD:0.5;}
    else{q=0;dq=0;}
    if(c.B[s])blows++;
    const L=st.segs[s]-s0;sq+=q*L;sd+=dq*L;
  }
  const steps=ssLwSteps(sess,st.lw);
  const lwF=steps>0?Math.pow(LW_FIT.under,steps):steps<0?Math.pow(LW_FIT.over,-steps):1;
  const q=clamp(sq/st.len*Math.pow(JOIN.q,c.joins)*lwF,0,1),dq=clamp(sd/st.len,0,1);
  for(const A of [sess.acc,sess.sit]){A.lineLen+=st.len;A.lineQ+=q*st.len;A.depthW+=st.len;A.depthQ+=dq*st.len;A.blow+=blows;}
  sess.acc.joins+=c.joins;
  if(steps>0)ssClock(sess,0,LW_FIT.passTrauma*steps);
  sess.cur=null;sess.next++;
  const res={q:dsR(q),depth:dsR(dq),blowouts:blows,joins:c.joins,lwSteps:steps};
  sess.lastStroke=res;
  ssAfterItem(sess);
  return res;
}
function ssAfterItem(sess){
  const plan=ssPlan(sess);
  if(sess.next>=sess.end||sess.next>=plan.items.length){if(!sess.stop)sess.stop="done";return;}
  const it=plan.items[sess.next];
  if(it.k==="line"){const lw=plan.strokes[it.i].lw,B=SIM.kitBands(sess.kit,sess.skills,sess.settings,{liner:sess.liner});
    if(!(lw>=B.lineBand[0]&&lw<=B.lineBand[1])){const best=ssBestLiner(sess,lw);if(best)sess.autoLiner=best;}else sess.autoLiner=null;}
}
function sessionSetLiner(sess,id){
  const B=SIM.kitBands(sess.kit,sess.skills,sess.settings);if(!B.liners.some(l=>l.id===id))return false;
  if(sess.pen)return false;sess.liner=id;sess.autoLiner=null;return true;
}
/* leave the current zone (or give up the rest of the current line) */
function sessionNextItem(sess){
  const it=sessionItem(sess);if(!it||sess.pen)return false;
  if(it.k==="line"){ssFinishStroke(sess);return true;}
  sess.next++;ssAfterItem(sess);return true;
}
function sessionAction(sess,kind){
  const m=sess.m;
  if(sess.kind==="practice"||!sess.client)return{ok:false,why:"Fake skin doesn't need a break."};
  if(kind==="break"){
    if(m.breaks>=BREAK.max)return{ok:false,why:"They want to get it finished, not another break."};
    const eff=Math.pow(BREAK.fade,m.breaks);m.pain*=1-BREAK.pain*eff;m.fatigue*=1-BREAK.fatigue*eff;m.breaks++;m.clock+=BREAK.hours;
    return{ok:true,eff:dsR(eff)};}
  if(kind==="numb"){
    if(m.numbs>=NUMB.max)return{ok:false,why:"The cream is already on."};
    m.numbs++;m.numbH=NUMB.hours;m.pain*=1-NUMB.now;
    return{ok:true,cost:Math.round(NUMB.price*(SIM.priceIndex?SIM.priceIndex(sess.year):1)/10)*10};}
  if(kind==="chat"){
    if(m.chats>=CHAT.max)return{ok:false,why:"You've talked yourselves out."};
    if(m.chatH>0)return{ok:false,why:"You're already chatting."};
    m.chats++;const talk=clamp(sess.client.traits.talkative,0,1);m.chatH=CHAT.hours;
    if(talk<CHAT.quiet)m.fatigue+=CHAT.annoy;
    return{ok:true,talk:dsR(talk)};}
  return{ok:false,why:"?"};
}
/* the piece's outputs from progress */
function ssOut(acc,zsat,plan,b){
  const lineQ=acc.lineLen>0?acc.lineQ/acc.lineLen:1,depthQ=acc.depthW>0?acc.depthQ/acc.depthW:0.75;
  let sw=0,ss=0;plan.zones.forEach((z,i)=>{const w=z.area*z.target;sw+=w;ss+=w*Math.min(1,(zsat[i]||0)/z.target);});
  const sat=sw>0?clamp(ss/sw*b.sat,0,1):clamp(b.sat*(0.72+0.28*depthQ),0,1);
  return{lineQuality:dsR(clamp(lineQ,0,1)),depthQuality:dsR(clamp(depthQ,0,1)),saturation:dsR(sat),trauma:dsR(1-Math.exp(-acc.trauma))};
}
function sessionFinish(sess){
  const plan=ssPlan(sess),b=ssBands(sess),done=sess.next>=plan.items.length;
  const acc=Object.assign({},sess.acc,{sittings:sess.acc.sittings+1,hours:dsR(sess.acc.hours+sess.m.clock)});
  const progress={next:sess.next,zsat:sess.zsat.map(dsR),acc,cur:done?null:sess.cur};
  const out=ssOut(acc,sess.zsat,plan,b),S0=sess.sit;
  const sitting={lineQuality:S0.lineLen>0?dsR(S0.lineQ/S0.lineLen):null,depthQuality:S0.depthW>0?dsR(S0.depthQ/S0.depthW):null,
    blowouts:S0.blow,joins:S0.joins,trauma:dsR(1-Math.exp(-S0.trauma)),hours:dsR(sess.m.clock),items:sess.next-sess.start,pain:dsR(sess.m.pain),fatigue:dsR(sess.m.fatigue)};
  const early=!done&&sess.next<sess.end;
  return{done,early,stop:sess.stop||(early?"artist":"done"),out:Object.assign({},out,{sessionsUsed:acc.sittings,blowouts:acc.blow,joins:acc.joins}),
    sitting,progress,part:sess.part,partsTotal:sess.partsTotal,sessionsUsed:acc.sittings,
    nextPart:done?null:early?sess.part:Math.min(sess.part+1,sess.partsTotal),left:plan.items.length-sess.next};
}
function sessionXp(res,sess,skills){
  const T=SKILL_XP[sess.kind]||SKILL_XP.sample,sk=skills||{},o={styles:{}};
  const g=(k,q)=>{const lvl=clamp(+sk[k]||0,0,10);return dsR(T[k]*(SKILL_XP.floor+(1-SKILL_XP.floor)*clamp(q,0,1))*(1-SKILL_XP.diminish*lvl/10));};
  const S0=sess.sit,lq=S0.lineLen>0?S0.lineQ/S0.lineLen:0;
  o.linework=S0.lineLen>0?g("linework",lq):0;
  o.shading=S0.zoneWork.shade>0?g("shading",res.out.saturation):0;
  o.colour=S0.zoneWork.colour>0?g("colour",res.out.saturation):0;
  o.speed=g("speed",1-res.out.trauma);
  const st=sess.design.style;if(st){const lvl=clamp(+((sk.styles||{})[st])||0,0,10);o.styles[st]=dsR(T.style*(1-SKILL_XP.diminish*lvl/10)*(0.5+0.5*lq));}
  return o;
}
/* a synthetic trace of the current stroke for tests: {speed (x target pace), noise (mm, deterministic wobble), dtMs,
   stopAt (share of the stroke), stopMs, lift (true: lift and come back instead of stopping)} -> [[t,x,y],...] contacts */
function sessionSynth(sess,o){
  o=o||{};const it=sessionItem(sess);if(!it||it.k!=="line")return[];
  const st=it.stroke,b=ssBands(sess),v=b.paceMmS*(o.speed||1),dt=o.dtMs||16,u0=sess.cur?sess.cur.u:0,out=[];
  let t=o.t0||0,u=u0,cur=[],stopped=false,k=0;
  const wob=uu=>(o.noise||0)*Math.sin(uu*(o.wave||0.35)+0.4)*Math.cos(uu*(o.wave||0.35)*0.37);   // a slow hand wobble
  const pt=uu=>{const a=ssPointAt(st,uu),b2=ssPointAt(st,Math.min(st.len,uu+0.5)),nx=-(b2[1]-a[1]),ny=b2[0]-a[0],nl=Math.hypot(nx,ny)||1,w=wob(uu);return[a[0]+nx/nl*w,a[1]+ny/nl*w];};
  const push=uu=>{const p=pt(uu);cur.push([t,p[0],p[1]]);k++;};
  push(u);
  while(u<st.len){
    t+=dt;u=Math.min(st.len,u+v*dt/1000);
    if(o.stopAt!=null&&!stopped&&u>=st.len*o.stopAt){
      stopped=true;
      if(o.lift){push(u);out.push(cur);cur=[];t+=o.stopMs||600;push(u);continue;}
      const tEnd=t+(o.stopMs||600);while(t<tEnd){push(u);t+=dt;}
    }
    push(u);
  }
  out.push(cur);
  return out;
}
/* run contacts through the pen (tests and the browser check) */
function sessionTrace(sess,contacts){let last=null;
  for(const c of contacts){if(!c.length)continue;const d=penDown(sess,c[0][0],c[0][1],c[0][2]);if(!d.ok)return d;
    for(let i=1;i<c.length;i++)penMove(sess,c[i][0],c[i][1],c[i][2]);last=penUp(sess,c[c.length-1][0]);}
  return last;}
function sessionResume(sess){sess.pen=null;return sess;}
function sessionStart(sess){if(sess.phase==="place")sess.phase="work";return sess;}

SIM.STENCIL=STENCIL;SIM.PACE=PACE;SIM.ACC=ACC;SIM.DEPTH=DEPTH;SIM.BLOW=BLOW;SIM.JOIN=JOIN;SIM.LW_FIT=LW_FIT;SIM.ZONE=ZONE;
SIM.COLOUR_PACK=COLOUR;SIM.TRAUMA=TRAUMA;SIM.PAIN=PAIN;SIM.FATIGUE=FATIGUE;SIM.BREAK=BREAK;SIM.NUMB=NUMB;SIM.CHAT=CHAT;SIM.SKILL_XP=SKILL_XP;
SIM.flattenPath=ssFlatten;SIM.sessionNew=sessionNew;SIM.sessionPlan=ssPlan;SIM.sessionBands=ssBands;SIM.sessionPlace=sessionPlace;SIM.sessionRotate=sessionRotate;
SIM.stencilCheck=stencilCheck;SIM.sessionItem=sessionItem;SIM.sessionStart=sessionStart;SIM.sessionResume=sessionResume;
SIM.penDown=penDown;SIM.penMove=penMove;SIM.penUp=penUp;SIM.sessionSetLiner=sessionSetLiner;SIM.sessionNextItem=sessionNextItem;
SIM.sessionAction=sessionAction;SIM.sessionFinish=sessionFinish;SIM.sessionXp=sessionXp;SIM.sessionPainRate=sessionPainRate;
SIM.sessionSynth=sessionSynth;SIM.sessionTrace=sessionTrace;SIM.pointAt=ssPointAt;SIM.insideZone=ssInside;SIM.zoneArea=ssZoneArea;
