/* ===== vis/body.js: the mannequin (PR 6) =====
   One low-poly adult mannequin, seated in the tattoo chair: smooth capsule limbs, no face, no anatomical detail, dressed in
   shorts and a crop top (separate fitted meshes, always on) so the ribs/side stay bare. Built from code, not a model file:
   every body part is a generalised tube (rings along a Catmull-Rom spine), the torso a stack of ellipses. PR 10 can swap
   the parts for Blender meshes as long as they keep the same islands.
   Body shapes: the three BODY_SHAPES (masc/femme/neutral) are built from the SAME topology with different ring sizes, so
   the UVs are identical across shapes and a tattoo never moves when the shape changes. Girth comes straight from
   INK_SIM.BODY_SHAPES[shape].wrap (the multipliers the board uses), so the sim, the board and the model agree. A shape
   change lerps the vertex positions on the CPU (no morph shaders), only when it happens.
   UV layout: one island per limb or zone, exactly INK_SIM.ISLANDS (arm_l/arm_r, leg_l/leg_r, back, chest, side_l/side_r,
   neck, hand_l/hand_r, foot_l/foot_r) plus a tiny "blank" island for skin that never takes ink (head, thumbs, belly).
   Each island is unwrapped in true millimetres of the NEUTRAL body: x is the arc round each ring from the island's face
   line (rightward as you look at the skin), y the distance down each column from the island's start (shoulder to wrist,
   hip to ankle, neck to waist...), the same directions as the board. Islands are shelf-packed into the unit square with a
   density weight (arms and chest get more pixels per mm than the backs of the legs).
   Zones: BD_ZONES places each PLACEMENTS box on its island: which way round the ring its centre sits (frac of the ring,
   0 = the face line), any sideways offset, and the joint it hangs from (the same crease the board draws). bdZone(id)
   resolves left/right and gives the centre line, so decals.js and the stencil drag share one mapping. ===== */
const BD_FORM={neutral:{sh:0.19,waist:1,hip:1,depth:1},masc:{sh:0.207,waist:1.05,hip:0.99,depth:1.06},femme:{sh:0.173,waist:0.88,hip:1.07,depth:0.95}};
const BD_SHAPES=["neutral","masc","femme"];
/* pixels-per-mm weight per island in the texture atlas */
const BD_ISLAND_W={arm_l:1.4,arm_r:1.4,leg_l:0.72,leg_r:0.72,back:1,chest:1.2,side_l:1,side_r:1,neck:1.1,hand_l:1.15,hand_r:1.15,foot_l:0.85,foot_r:0.85,blank:1};
const BD_CLOTH={top:"#5e6e6b",shorts:"#3d4350"};   // the same colours as the 2D body diagram (app/bodymap.js BM_CLOTH)
/* where each placement box sits on its island (left side; the right mirrors frac and xOff):
   frac = share of the ring round from the face line to the box centre, xOff = extra mm sideways (torso patches),
   anchor = a ring landmark, at = where on the box's length that landmark falls (the board's crease), dy = mm extra down */
const BD_ZONES={
  forearm:{isl:"arm",frac:0,anchor:"elbow",at:0.03},
  upperarm:{isl:"arm",frac:0.25,anchor:"elbow",at:0.97},
  shoulder:{isl:"arm",frac:0.25,anchor:"top",at:0,dy:6},
  hand:{isl:"hand",frac:0,anchor:"wrist",at:0.03},
  thigh:{isl:"leg",frac:0,anchor:"knee",at:0.97},
  calf:{isl:"leg",frac:0.5,anchor:"knee",at:0.03},
  shin:{isl:"leg",frac:0,anchor:"knee",at:0.03},
  foot:{isl:"foot",frac:0,anchor:"ankle",at:0.03},
  ribs:{isl:"side",frac:0,anchor:"armpit",at:0,dy:8},
  neck:{isl:"neck",frac:-0.25,anchor:"top",at:0,dy:4},
  upperback:{isl:"back",anchor:"top",at:0,dy:38},
  fullback:{isl:"back",anchor:"top",at:0,dy:18},
  chest_l:{isl:"chest",xOff:82,anchor:"top",at:0,dy:70},
  chest_r:{isl:"chest",xOff:-82,anchor:"top",at:0,dy:70},
  sternum:{isl:"chest",xOff:0,anchor:"top",at:0,dy:80},
  nape:{isl:"neck",frac:0,anchor:"top",at:0,dy:14}
};
const BD={built:false,parts:[],islands:{},zones:{},cur:"neutral",curW:null};

/* ---- small vector maths on [x,y,z] arrays ---- */
const bdAdd=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],bdSub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],bdMul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const bdDot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],bdCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const bdLen=a=>Math.hypot(a[0],a[1],a[2]),bdNrm=a=>{const l=bdLen(a)||1;return[a[0]/l,a[1]/l,a[2]/l];};
const bdClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function bdWrap(shape,region){const B=(typeof INK_SIM!=="undefined"&&INK_SIM.BODY_SHAPES)||{},s=B[shape]||B.neutral;return(s&&s.wrap&&s.wrap[region])||1;}

/* Catmull-Rom through the keys, sampled densely, with its arc length */
function bdSpline(keys){
  const n=keys.length,P=[bdSub(bdMul(keys[0],2),keys[1])].concat(keys,[bdSub(bdMul(keys[n-1],2),keys[n-2])]),pts=[];
  for(let i=1;i<n;i++){const p0=P[i-1],p1=P[i],p2=P[i+1],p3=P[i+2];
    for(let k=0;k<24;k++){const t=k/24,t2=t*t,t3=t2*t;
      pts.push([0,1,2].map(c=>0.5*(2*p1[c]+(-p0[c]+p2[c])*t+(2*p0[c]-5*p1[c]+4*p2[c]-p3[c])*t2+(-p0[c]+3*p1[c]-3*p2[c]+p3[c])*t3)));}}
  pts.push(keys[n-1].slice());
  const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+bdLen(bdSub(pts[i],pts[i-1])));
  return{pts,cum,L:cum[cum.length-1]};}
function bdAt(sp,u){
  const s=bdClamp(u,0,1)*sp.L,c=sp.cum;let lo=0,hi=c.length-2;
  while(lo<hi){const m=(lo+hi+1)>>1;if(c[m]<=s)lo=m;else hi=m-1;}
  const a=sp.pts[lo],b=sp.pts[lo+1],t=(s-c[lo])/((c[lo+1]-c[lo])||1);
  return{p:bdAdd(a,bdMul(bdSub(b,a),t)),T:bdNrm(bdSub(b,a))};}
function bdProf(prof,u){
  if(u<=prof[0][0])return[prof[0][1],prof[0][2]];
  for(let i=1;i<prof.length;i++)if(u<=prof[i][0]){const a=prof[i-1],b=prof[i],t=(u-a[0])/(b[0]-a[0]||1),e=t*t*(3-2*t),k=0.5*t+0.5*e;
    return[a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];}
  const z=prof[prof.length-1];return[z[1],z[2]];}
/* ring fractions: a few tight rings for the end caps, the rest even */
function bdRings(n,capA,capB){
  const out=[];const a=capA?[0,0.012,0.035,0.07]:[0],b=capB?[0.93,0.965,0.988,1]:[1];
  const lo=a[a.length-1],hi=b[0],m=n-a.length-b.length;
  for(const u of a)out.push(u);for(let i=1;i<=m;i++)out.push(lo+(hi-lo)*i/(m+1));for(const u of b)out.push(u);return out;}
const bdThetas=(segs,seam)=>{const t=[];for(let j=0;j<=segs;j++)t.push(seam+2*Math.PI*j/segs);return t;};

/* a tube: rings along the spine, N transported from `face`, B = T x N; a point is C + N rN cos(th) + B rB sin(th) */
function bdTube(o){
  const sp=bdSpline(o.keys),P=[],C=[],T=[];let N=null;
  for(const u of o.us){const a=bdAt(sp,u),t=a.T;
    N=bdNrm(N?bdSub(N,bdMul(t,bdDot(N,t))):bdSub(o.face,bdMul(t,bdDot(o.face,t))));
    const B=bdCross(t,N),r=bdProf(o.prof,u),rN=r[0]*o.g+(o.inflate||0),rB=r[1]*o.g+(o.inflate||0);
    P.push(o.thetas.map(th=>bdAdd(a.p,bdAdd(bdMul(N,rN*Math.cos(th)),bdMul(B,rB*Math.sin(th))))));C.push(a.p);T.push(t);}
  return{P,C,T};}
/* the torso: horizontal rings [y, half width, half depth, centre z] from the neck base down; the back is a little flatter */
function bdTorsoRings(f){
  const R=[[1.140,.050,.046,-.008],[1.128,.076,.058,-.010],[1.108,.122,.072,-.012],[1.085,.166,.086,-.010],[1.058,.190,.098,-.006],
    [1.025,.192,.108,-.002],[0.990,.184,.116,.002],[0.950,.176,.121,.006],[0.905,.167,.119,.006],[0.860,.157,.113,.004],[0.815,.147,.105,.002],
    [0.770,.141,.099,0],[0.725,.143,.099,-.004],[0.680,.151,.103,-.008],[0.635,.161,.109,-.012],[0.590,.167,.113,-.015],[0.548,.165,.111,-.016],
    [0.512,.151,.101,-.016],[0.492,.10,.066,-.016],[0.484,.02,.02,-.016]];
  const shK=f.sh/0.19;
  return R.map((r,i)=>{const w=i<=1?f.neck:i<=7?lerpV(f.neck,shK*f.chest,bdClamp((i-1)/3,0,1)):i<=12?lerpV(shK*f.chest,f.waist,bdClamp((i-7)/4,0,1)):lerpV(f.waist,f.hip,bdClamp((i-12)/3,0,1));
    return[r[0],r[1]*w,r[2]*(i<=1?f.neck:f.depth),r[3]];});}
function lerpV(a,b,t){return a+(b-a)*t;}
function bdTorsoAt(rings,y){   // a ring interpolated at height y (for the clothes)
  for(let i=1;i<rings.length;i++){const a=rings[i-1],b=rings[i];if(y<=a[0]&&y>=b[0]){const t=(a[0]-y)/((a[0]-b[0])||1);return a.map((v,k)=>v+(b[k]-v)*t);}}
  return rings[y>rings[0][0]?0:rings.length-1].slice();}
function bdEllipses(rings,thetas,inflate){
  const P=[],C=[],T=[],N=[0,0,1],B=[-1,0,0];
  for(const r of rings){const c=[0,r[0],r[3]],a=r[1]+(inflate||0),b=r[2]+(inflate||0);
    P.push(thetas.map(th=>{const cz=Math.cos(th);return bdAdd(c,bdAdd(bdMul(N,b*cz*(cz<0?0.9:1)),bdMul(B,a*Math.sin(th))));}));C.push(c);T.push([0,-1,0]);}
  return{P,C,T};}
/* torso columns: front +-62 deg (8 steps), each side 62..118 deg (6), back 118..242 deg (10) */
const BD_TORSO_TH=(()=>{const d=Math.PI/180,t=[];const seg=(a,b,n)=>{for(let i=0;i<n;i++)t.push((a+(b-a)*i/n)*d);};
  seg(-62,62,8);seg(62,118,6);seg(118,242,10);seg(242,298,6);t.push(298*d);return t;})();

/* every part for one body shape. Left limbs are on +x (the figure's left), the figure faces +z */
function bdSpec(shape){
  /* girth from BODY_SHAPES; the chest width leans on the back multiplier (the shoulders already widen with sh) */
  const f0=BD_FORM[shape]||BD_FORM.neutral,f=Object.assign({},f0,{neck:bdWrap(shape,"neck"),chest:lerpV(1,bdWrap(shape,"back"),0.6),arm:bdWrap(shape,"arm"),
    leg:bdWrap(shape,"leg"),hand:bdWrap(shape,"hand"),foot:bdWrap(shape,"foot")});
  const out=[],sh=f.sh,rings=bdTorsoRings(f);
  out.push({id:"torso",kind:"torso",G:bdEllipses(rings,BD_TORSO_TH),marks:{top:0,armpit:6,waist:11},
    patches:[{isl:"chest",i0:0,i1:7,j0:0,j1:8,jc:4},{isl:"blank",i0:7,i1:19,j0:0,j1:8,jc:4},{isl:"side_r",i0:0,i1:19,j0:8,j1:14,jc:11},
      {isl:"back",i0:0,i1:19,j0:14,j1:24,jc:19},{isl:"side_l",i0:0,i1:19,j0:24,j1:30,jc:27}]});
  for(const s of [1,-1]){const L=s>0?"l":"r",X=v=>[v[0]*s,v[1],v[2]];
    /* the arm: shoulder dome, upper arm hanging, elbow bent, forearm forward on the armrest (face line up) */
    const aK=[[sh-0.012,1.083,-0.008],[sh+0.04,1.0,0],[sh+0.1,0.8,0.035],[sh+0.105,0.745,0.27]].map(X);
    const aUs=bdRings(22,true,false);
    out.push({id:"arm_"+L,kind:"tube",G:bdTube({keys:aK,us:aUs,thetas:bdThetas(14,Math.PI),face:[0,0,1],g:f.arm,
      prof:[[0,.006,.006],[.02,.03,.03],[.05,.045,.046],[.1,.052,.052],[.2,.049,.048],[.35,.046,.044],[.5,.042,.040],[.566,.040,.041],[.62,.039,.044],[.72,.036,.042],[.85,.029,.036],[.95,.022,.031],[1,.021,.030]]}),
      marks:{top:0,elbow:bdNear(aUs,0.566),wrist:aUs.length-1},patches:[{isl:"arm_"+L,jc:7}]});
    const w=aK[3],hK=[bdAdd(w,X([-0.002,0.002,-0.022])),bdAdd(w,X([0.003,-0.006,0.07])),bdAdd(w,X([0.004,-0.022,0.15])),bdAdd(w,X([0.004,-0.036,0.188]))];
    const hUs=bdRings(12,false,true);
    out.push({id:"hand_"+L,kind:"tube",G:bdTube({keys:hK,us:hUs,thetas:bdThetas(12,Math.PI),face:[0,1,0],g:f.hand,
      prof:[[0,.019,.028],[.12,.02,.03],[.35,.017,.043],[.6,.015,.045],[.75,.013,.043],[.9,.011,.038],[.97,.007,.03],[1,.002,.012]]}),
      marks:{wrist:bdNear(hUs,0.1)},patches:[{isl:"hand_"+L,jc:6}]});
    out.push({id:"thumb_"+L,kind:"tube",G:bdTube({keys:[bdAdd(w,X([-0.026,-0.006,0.03])),bdAdd(w,X([-0.044,-0.012,0.07])),bdAdd(w,X([-0.047,-0.016,0.098]))],
      us:bdRings(6,false,true),thetas:bdThetas(8,Math.PI),face:[0,1,0],g:f.hand,prof:[[0,.011,.012],[.5,.0095,.010],[.9,.007,.007],[1,.002,.002]]}),marks:{},patches:[{isl:"blank",jc:4}]});
    /* the leg: thigh forward on the seat, knee bent, shin down, foot flat; face line up the thigh and down the shin */
    const lK=[[0.09,0.6,-0.07],[0.1,0.555,0.10],[0.11,0.53,0.43],[0.115,0.32,0.455],[0.115,0.115,0.45]].map(X);
    const lUs=bdRings(24,false,false);
    out.push({id:"leg_"+L,kind:"tube",G:bdTube({keys:lK,us:lUs,thetas:bdThetas(16,s>0?Math.PI/2:-Math.PI/2),face:[0,1,0],g:f.leg,
      prof:[[0,.07,.08],[.06,.082,.088],[.2,.08,.085],[.4,.07,.072],[.55,.056,.058],[.62,.054,.056],[.7,.056,.058],[.8,.048,.047],[.92,.037,.036],[1,.034,.034]]}),
      marks:{hip:0,knee:bdNear(lUs,0.55),ankle:lUs.length-1},patches:[{isl:"leg_"+L,jc:s>0?12:4}]});
    const A=lK[4],fK=[bdAdd(A,X([0,-0.065,-0.055])),bdAdd(A,X([0,-0.066,0.02])),bdAdd(A,X([0.004,-0.08,0.12])),bdAdd(A,X([0.008,-0.086,0.2]))];
    const fUs=bdRings(13,true,true);
    out.push({id:"foot_"+L,kind:"tube",G:bdTube({keys:fK,us:fUs,thetas:bdThetas(12,Math.PI),face:[0,1,0],g:f.foot,
      prof:[[0,.004,.004],[.05,.03,.028],[.2,.042,.035],[.38,.04,.04],[.6,.027,.045],[.8,.018,.046],[.93,.014,.042],[1,.003,.02]]}),
      marks:{ankle:bdNear(fUs,0.3)},patches:[{isl:"foot_"+L,jc:6}]});}
  const nUs=bdRings(7,false,false);
  out.push({id:"neck",kind:"tube",G:bdTube({keys:[[0,1.245,0.005],[0,1.18,-0.002],[0,1.11,-0.012]],us:nUs,thetas:bdThetas(16,Math.PI),face:[0,0,-1],g:f.neck,
    prof:[[0,.045,.05],[.5,.047,.052],[1,.056,.062]]}),marks:{top:0},patches:[{isl:"neck",jc:8}]});
  /* clothes: a strapless bandeau and the shorts (hips plus the top of each thigh). The bandeau is a front panel only, under the
     chest island, so the chest, the ribs and the whole back stay bare for work (the mannequin is stylized: nothing holds it up) */
  const topR=[.952,.928,.904,.88,.857,.835].map(y=>bdTorsoAt(rings,y)),topTh=[];for(let k=0;k<=12;k++)topTh.push((-66+11*k)*Math.PI/180);
  const topG=bdEllipses(topR,topTh,0.006);topG.arc=true;
  out.push({id:"top",kind:"cloth",mat:"top",G:topG,patches:[{isl:"blank",jc:4}],open:true});
  const shR=[.70,.665,.63,.595,.56,.53,.505,.49,.484].map(y=>bdTorsoAt(rings,y));
  out.push({id:"shorts",kind:"cloth",mat:"shorts",G:bdEllipses(shR,BD_TORSO_TH,0.006),patches:[{isl:"blank",jc:4}],open:true});
  for(const s of [1,-1]){const L=s>0?"l":"r",X=v=>[v[0]*s,v[1],v[2]];
    const lK=[[0.09,0.6,-0.07],[0.1,0.555,0.10],[0.11,0.53,0.43],[0.115,0.32,0.455],[0.115,0.115,0.45]].map(X);
    const u1=0.24,us=[0,u1*0.25,u1*0.5,u1*0.75,u1*0.92,u1];
    const lp=[[0,.07,.08],[.06,.082,.088],[.2,.08,.085],[.4,.07,.072]];
    out.push({id:"shortsleg_"+L,kind:"cloth",mat:"shorts",G:bdTube({keys:lK,us,thetas:bdThetas(16,0),face:[0,1,0],g:f.leg,inflate:0.007,prof:lp}),patches:[{isl:"blank",jc:8}],open:true});}
  return out;}
function bdNear(us,u){let b=0;for(let i=1;i<us.length;i++)if(Math.abs(us[i]-u)<Math.abs(us[b]-u))b=i;return b;}

/* outward normals by finite differences round each ring and along each column */
function bdNormals(G){
  const n=G.P.length,m=G.P[0].length-1,out=[];
  for(let i=0;i<n;i++){const row=[];for(let j=0;j<=m;j++){const jj=j===m&&!G.arc?0:j;
    const a=G.arc?G.P[i][Math.min(m,j+1)]:G.P[i][(jj+1)%m],b=G.arc?G.P[i][Math.max(0,j-1)]:G.P[i][(jj-1+m)%m],c=G.P[Math.min(n-1,i+1)][jj],d=G.P[Math.max(0,i-1)][jj];
    let v=bdCross(bdSub(c,d),bdSub(a,b));const rad=bdSub(G.P[i][jj],G.C[i]);
    if(bdLen(v)<1e-10||bdLen(rad)<2e-4)v=bdMul(G.T[i],i<n/2?-1:1);else if(bdDot(v,rad)<0)v=bdMul(v,-1);
    row.push(bdNrm(v));}out.push(row);}
  return out;}
/* island coordinates (mm) for one patch of the neutral grid: x = -(arc from column jc), y = distance down each column */
function bdPatchXY(G,p){
  const X=[],Y=[];
  for(let i=p.i0;i<=p.i1;i++){const A=[0];for(let j=p.j0+1;j<=p.j1;j++)A.push(A[A.length-1]+bdLen(bdSub(G.P[i][j],G.P[i][j-1])));
    const ac=A[p.jc-p.j0];X.push(A.map(a=>-(a-ac)*1000));}
  const col=[];for(let j=p.j0;j<=p.j1;j++){let y=0;const c=[];for(let i=0;i<=p.i1;i++){if(i)y+=bdLen(bdSub(G.P[i][j],G.P[i-1][j]));if(i>=p.i0)c.push(y*1000);}col.push(c);}
  for(let k=0;k<=p.i1-p.i0;k++)Y.push(col.map(c=>c[k]));
  return{X,Y};}

/* shelf-pack the islands into the unit square at the largest scale that fits */
function bdPack(isl){
  const ids=Object.keys(isl).sort((a,b)=>isl[b].h*isl[b].wt-isl[a].h*isl[a].wt||(a<b?-1:1)),pad=6/1024;
  const fit=s=>{let x=pad,y=pad,row=0;const out={};
    for(const id of ids){const w=isl[id].w*isl[id].wt*s,h=isl[id].h*isl[id].wt*s;
      if(w+2*pad>1)return null;if(x+w+pad>1){x=pad;y+=row+pad;row=0;}
      out[id]={x,y,w,h};x+=w+pad;row=Math.max(row,h);}
    return y+row+pad<=1?out:null;};
  let lo=0,hi=1/200,best=null;
  for(let k=0;k<32;k++){const s=(lo+hi)/2,r=fit(s);if(r){best={s,r};lo=s;}else hi=s;}
  return best;}

/* build everything once: the three shapes, the islands and the atlas, the zones */
function bdBuild(){
  if(BD.built)return BD;
  const specs={};for(const sh of BD_SHAPES)specs[sh]=bdSpec(sh);
  const base=specs.neutral,isl={};
  base.forEach((part,k)=>{part.N={};for(const sh of BD_SHAPES){const G=specs[sh][k].G;part.N[sh]=bdNormals(G);if(sh!=="neutral")part["G_"+sh]=G;}
    part.G_neutral=part.G;
    for(const p of part.patches){if(p.i0==null){p.i0=0;p.i1=part.G.P.length-1;p.j0=0;p.j1=part.G.P[0].length-1;}
      p.xy=bdPatchXY(part.G,p);
      if(p.isl==="blank")continue;
      const I=isl[p.isl]||(isl[p.isl]={xmin:1e9,xmax:-1e9,ymin:1e9,ymax:-1e9});
      for(const r of p.xy.X)for(const x of r){I.xmin=Math.min(I.xmin,x);I.xmax=Math.max(I.xmax,x);}
      for(const r of p.xy.Y)for(const y of r){I.ymin=Math.min(I.ymin,y);I.ymax=Math.max(I.ymax,y);}}});
  isl.blank={xmin:0,xmax:12,ymin:0,ymax:12};
  const req={};for(const id in isl)req[id]={w:isl[id].xmax-isl[id].xmin,h:isl[id].ymax-isl[id].ymin,wt:BD_ISLAND_W[id]||1};
  const pk=bdPack(req);
  for(const id in isl){const r=pk.r[id];BD.islands[id]=Object.assign(isl[id],{id,rect:r,ppm:pk.s*req[id].wt});}
  BD.parts=base;
  for(const part of base)for(const p of part.patches)p.uv=p.xy.X.map((r,k)=>r.map((x,j)=>bdUV(p.isl,x,p.xy.Y[k][j])));
  for(const id in INK_SIM.PLACEMENTS)BD.zones[id]=bdZoneMake(id);
  BD.built=true;return BD;}
/* island mm -> atlas uv (three.js v runs up; the canvas runs down) */
function bdUV(id,x,y){const I=BD.islands[id];if(id==="blank")return[I.rect.x+I.rect.w/2,1-(I.rect.y+I.rect.h/2)];
  return[I.rect.x+(x-I.xmin)*I.ppm,1-(I.rect.y+(y-I.ymin)*I.ppm)];}
/* atlas uv -> {island, x, y} in mm, or null */
function bdFromUV(u,v){const cy=1-v;
  for(const id in BD.islands){if(id==="blank")continue;const I=BD.islands[id],r=I.rect;
    if(u>=r.x&&u<=r.x+r.w&&cy>=r.y&&cy<=r.y+r.h)return{isl:id,x:I.xmin+(u-r.x)/I.ppm,y:I.ymin+(cy-r.y)/I.ppm};}
  return null;}
/* a zone: island, the box's start (y0, mm down the island), its centre line x(y) and a vertex to aim the camera at */
function bdZoneMake(id){
  const P=INK_SIM.PLACEMENTS[id];if(!P)return null;
  const side=P.side,base=side&&!BD_ZONES[id]?id.replace(/_[lr]$/,""):id,Z=BD_ZONES[base];if(!Z)return null;
  const mir=side==="r"&&base!==id?-1:1,isl=INK_SIM.ISLANDS.indexOf(Z.isl+"_"+side)>=0?Z.isl+"_"+side:Z.isl;
  const partId=Z.isl==="arm"||Z.isl==="leg"||Z.isl==="hand"||Z.isl==="foot"?Z.isl+"_"+side:Z.isl==="neck"?"neck":"torso";
  const part=BD.parts.find(p=>p.id===partId),patch=part.patches.find(p=>p.isl===isl);if(!patch)return null;
  const frac=(Z.frac||0)*mir,xOff=(Z.xOff||0)*(base!==id?mir:1);
  /* the centre line ring by ring: the point frac of the way round (x = frac x the ring's length), its y */
  const rows=[];
  for(let k=0;k<patch.xy.X.length;k++){const X=patch.xy.X[k],Y=patch.xy.Y[k],C=X[0]-X[X.length-1];
    const xt=frac*C+xOff;let y=Y[patch.jc-patch.j0];
    for(let j=0;j<X.length-1;j++){const a=X[j],b=X[j+1];if((xt<=a&&xt>=b)||(xt>=a&&xt<=b)){const t=(xt-a)/((b-a)||1);y=Y[j]+(Y[j+1]-Y[j])*t;break;}}
    rows.push({x:xt,y});}
  const ai=(part.marks[Z.anchor]||0)-patch.i0,anchorY=rows[bdClamp(ai,0,rows.length-1)].y;
  const y0=anchorY-(Z.at||0)*P.lengthMm+(Z.dy||0);
  const z={id,isl,part:part.id,frac,xOff,y0,W:P.wrapMm,L:P.lengthMm,region:P.region,rows,flat:frac===0};
  /* the camera's aim: the vertex nearest the box centre */
  const ym=y0+P.lengthMm/2,xm=bdZoneX(z,ym);let best=1e18,bi=0,off=0;
  for(const p of part.patches){const n=(p.i1-p.i0+1)*(p.j1-p.j0+1);
    if(p===patch)for(let k=0;k<p.xy.X.length;k++)for(let j=0;j<p.xy.X[k].length;j++){const d=(p.xy.X[k][j]-xm)**2+(p.xy.Y[k][j]-ym)**2;if(d<best){best=d;bi=off+k*(p.j1-p.j0+1)+j;}}
    off+=n;}
  z.vtx=bi;return z;}
function bdZoneX(z,y){const R=z.rows;if(z.flat||R.length<2)return R.length?R[0].x:0;
  if(y<=R[0].y)return R[0].x;for(let i=1;i<R.length;i++)if(y<=R[i].y){const t=(y-R[i-1].y)/((R[i].y-R[i-1].y)||1);return R[i-1].x+(R[i].x-R[i-1].x)*t;}
  return R[R.length-1].x;}
function bdZone(id){bdBuild();return BD.zones[id]||null;}
/* island mm on a zone -> the design's pos (0..1 of the box). Shape-free: the box width scales with the body */
function bdZonePos(z,x,y){return{x:(x-bdZoneX(z,y)+z.W/2)/z.W,y:(y-z.y0)/z.L};}

/* ---- the meshes ---- */
function bdGeometry(part){
  const pos=[],uv=[],idx=[],sets={};for(const sh of BD_SHAPES)sets[sh]={p:[],n:[]};
  let base=0;
  for(const p of part.patches){const cols=p.j1-p.j0+1,rows=p.i1-p.i0+1;
    for(let i=p.i0;i<=p.i1;i++)for(let j=p.j0;j<=p.j1;j++){
      for(const sh of BD_SHAPES){const q=part["G_"+sh].P[i][j],nv=part.N[sh][i][j];sets[sh].p.push(q[0],q[1],q[2]);sets[sh].n.push(nv[0],nv[1],nv[2]);}
      const t=p.uv[i-p.i0][j-p.j0];uv.push(t[0],t[1]);}
    for(let i=0;i<rows-1;i++)for(let j=0;j<cols-1;j++){const a=base+i*cols+j,b=a+1,c=a+cols,d=c+1;idx.push(a,b,c,c,b,d);}
    base+=rows*cols;}
  const g=new THREE.BufferGeometry();
  const arr={};for(const sh of BD_SHAPES)arr[sh]={p:new Float32Array(sets[sh].p),n:new Float32Array(sets[sh].n)};
  g.setAttribute("position",new THREE.BufferAttribute(arr.neutral.p.slice(),3));
  g.setAttribute("normal",new THREE.BufferAttribute(arr.neutral.n.slice(),3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeBoundingSphere();
  return{g,arr};}
/* the head: a smooth egg, no features */
function bdHead(){const g=new THREE.SphereGeometry(1,18,12);g.scale(0.084,0.112,0.098);g.translate(0,1.305,0.012);
  const c=bdUV("blank",0,0),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,c[0],c[1]);return g;}
/* build the mannequin's meshes into a group with the materials given: {skin, top, shorts} */
function bdMeshes(mats){
  bdBuild();const grp=new THREE.Group();grp.name="body";const parts=[];
  for(const part of BD.parts){const G=bdGeometry(part),m=part.kind==="cloth"?mats[part.mat]:mats.skin;
    const mesh=new THREE.Mesh(G.g,m);mesh.userData.part=part.id;mesh.userData.arr=G.arr;mesh.userData.islands=part.patches.map(p=>p.isl);
    mesh.castShadow=true;mesh.receiveShadow=true;grp.add(mesh);parts.push(mesh);}
  const head=new THREE.Mesh(bdHead(),mats.skin);head.castShadow=true;head.userData.part="head";head.userData.islands=["blank"];grp.add(head);
  return{grp,parts};}
/* set the vertex positions for a mix of shapes: w = {neutral, masc, femme} weights summing to 1 */
function bdApplyShape(parts,w){
  for(const mesh of parts){const A=mesh.userData.arr;if(!A)continue;
    const P=mesh.geometry.attributes.position.array,N=mesh.geometry.attributes.normal.array,n=P.length;
    const a=A.neutral,b=A.masc,c=A.femme,wa=w.neutral||0,wb=w.masc||0,wc=w.femme||0;
    for(let i=0;i<n;i++){P[i]=a.p[i]*wa+b.p[i]*wb+c.p[i]*wc;N[i]=a.n[i]*wa+b.n[i]*wb+c.n[i]*wc;}
    mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.attributes.normal.needsUpdate=true;mesh.geometry.computeBoundingSphere();}}
/* world point and normal of a zone's aim vertex for the current shape mix */
function bdZoneAim(parts,z){
  const mesh=parts.find(m=>m.userData.part===z.part);if(!mesh)return null;
  const P=mesh.geometry.attributes.position.array,N=mesh.geometry.attributes.normal.array,i=z.vtx*3;
  return{p:new THREE.Vector3(P[i],P[i+1],P[i+2]),n:new THREE.Vector3(N[i],N[i+1],N[i+2]).normalize()};}
/* the forearm's underside for an armrest, per shape: {x, y, z, pitch} of the pad's top centre */
function bdArmrest(shape,side){
  bdBuild();const part=BD.parts.find(p=>p.id==="arm_"+side),G=part["G_"+shape];if(!G)return null;
  const n=G.P.length,a=Math.round(n*0.72),b=n-2,lowest=i=>G.P[i].reduce((m,q)=>q[1]<m[1]?q:m,[0,9,0]);
  const pa=lowest(a),pb=lowest(b);
  return{x:(pa[0]+pb[0])/2,y:(pa[1]+pb[1])/2,z:(pa[2]+pb[2])/2+0.03,pitch:Math.atan2(pa[1]-pb[1],pb[2]-pa[2])};}
function bdTriangles(parts){let t=0;for(const m of parts){const g=m.geometry;t+=(g.index?g.index.count:g.attributes.position.count)/3;}return t;}
