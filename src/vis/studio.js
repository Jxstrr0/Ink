/* ===== vis/studio.js: the shop interior (PR 6) =====
   A modest working shop built from primitives: plank floor, plaster walls over a dark wood dado, the tattoo chair (padded
   seat, two adjustable armrests that sit under the client's forearms), your station (a trolley with the machine, ink caps
   and a paper roll, an angle lamp on a stand pointed at the work, your stool), the flash wall (sheets drawn from
   INK_SIM.FLASH on canvas), and a window onto a Mostograd canal at night: facades with lit windows across the water, a
   drawbridge raised for the night, reflections. The client faces +z; the window and flash wall are on the back wall.
   vsRoom() returns {grp, stages, lights, armrests, props, mats}; vsStage(stage) shows the props for apprentice | chair |
   studio | legacy (small variations for now: PR 7 builds the stages out). Lite: Lambert materials, no shadows, about 3k
   triangles. Full / Ultra: Standard materials and one shadow-casting lamp. Canvas textures are drawn once per build.
   PR 10: every prop is a named group in `props` (chair, station, machine, lamp, stool, shelves, bench, flashframe, sign,
   plant, photos, trophies) and the floor, walls and dado have their own materials in `mats`, so vis/assets.js can put
   photo textures on them and swap a Blender model in for a coded prop on Full and Ultra. Lite never sees either. ===== */
const VR_STAGES=["apprentice","chair","studio","legacy"];
function vrCanvas(w,h,fn){const c=document.createElement("canvas");c.width=w;c.height=h;fn(c.getContext("2d"),w,h);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=TIER[V.tier].aniso;return t;}
function vrRng(seed){return typeof INK_SIM!=="undefined"&&INK_SIM.rng?INK_SIM.rng(seed):{range:(a,b)=>(a+b)/2,chance:()=>false,int:(a)=>a};}
/* the night view: sky, the far embankment's facades, a raised drawbridge, the canal */
function vrNight(){return vrCanvas(512,384,(g,w,h)=>{const r=vrRng(1703);
  const sky=g.createLinearGradient(0,0,0,h*0.62);sky.addColorStop(0,"#070d1c");sky.addColorStop(1,"#22304d");g.fillStyle=sky;g.fillRect(0,0,w,h);
  g.fillStyle="rgba(255,250,230,.8)";for(let i=0;i<40;i++){g.fillRect(r.range(0,w),r.range(0,h*0.3),1,1);}
  g.fillStyle="rgba(250,240,210,.9)";g.beginPath();g.arc(w*0.8,h*0.13,13,0,7);g.fill();
  const base=h*0.6;let x=-10;
  while(x<w){const bw=r.range(55,95),bh=r.range(95,150),tone=r.int(0,2);g.fillStyle=["#1a2030","#1e2536","#232a3a"][tone];g.fillRect(x,base-bh,bw,bh);
    g.fillStyle="#141926";g.fillRect(x,base-bh-4,bw,5);g.fillRect(x,base-bh*0.55,bw,2);
    for(let fy=base-bh+12;fy<base-12;fy+=19)for(let fx=x+8;fx<x+bw-10;fx+=15){const lit=r.chance(0.36);g.fillStyle=lit?(r.chance(0.7)?"#f2c46a":"#e9dcb0"):"#2b3245";g.fillRect(fx,fy,7,11);}
    x+=bw+r.range(0,4);}
  /* the drawbridge, both leaves up for the night, with its red lamps */
  g.save();g.translate(w*0.3,base);g.fillStyle="#10141e";g.fillRect(-60,-12,26,12);g.fillRect(34,-12,26,12);
  g.save();g.translate(-34,-8);g.rotate(-1.15);g.fillRect(0,-5,58,8);g.restore();g.save();g.translate(34,-8);g.rotate(1.15+Math.PI);g.fillRect(0,-3,58,8);g.restore();
  g.fillStyle="#ff4a3a";g.beginPath();g.arc(-12,-58,2.2,0,7);g.arc(12,-58,2.2,0,7);g.fill();g.restore();
  g.fillStyle="#3a3f48";g.fillRect(0,base,w,6);
  const wat=g.createLinearGradient(0,base+6,0,h);wat.addColorStop(0,"#0d1628");wat.addColorStop(1,"#05080f");g.fillStyle=wat;g.fillRect(0,base+6,w,h-base-6);
  for(let i=0;i<70;i++){const fx=r.range(0,w),fy=r.range(base+10,h),len=r.range(6,22);g.fillStyle=r.chance(0.6)?"rgba(242,196,106,.35)":"rgba(200,210,240,.18)";g.fillRect(fx,fy,len,1.5);}
  g.fillStyle="#3a3f48";g.fillRect(0,h-16,w,16);});}
/* the flash wall: cream sheets with the shop's flash on them */
function vrFlash(n){return vrCanvas(1024,512,(g,w,h)=>{
  g.fillStyle="#3b2b1f";g.fillRect(0,0,w,h);
  const F=(typeof INK_SIM!=="undefined"&&INK_SIM.FLASH)||[],cols=5,rows=2,sw=w/cols,sh=h/rows;
  for(let i=0;i<cols*rows;i++){if(i>=n)break;const cx=(i%cols)*sw,cy=Math.floor(i/cols)*sh,f=F[i%Math.max(1,F.length)];
    g.save();g.translate(cx+sw/2,cy+sh/2);g.rotate(((i*37)%7-3)*0.006);
    g.fillStyle="#f3ead8";g.fillRect(-sw*0.42,-sh*0.43,sw*0.84,sh*0.86);
    g.fillStyle="#7a1f17";g.beginPath();g.arc(0,-sh*0.4,4,0,7);g.fill();
    if(f){const fp=INK_SIM.footprintOf(f),k=sh*0.62/Math.max(f.sizeMm,1);g.save();g.translate(0,sh*0.02);g.scale(k,k);
      for(const e of f.elements){const P=dcPath(e.id);if(!P)continue;const b=P.b,ek=(e.scale*f.sizeMm)/Math.max(b.w,b.h,1e-6);
        g.save();g.translate((e.x-fp.cx)*f.sizeMm,(e.y-fp.cy)*f.sizeMm);g.rotate((e.rot||0)*Math.PI/180);g.scale(ek,ek);g.translate(-(b.x+b.w/2),-(b.y+b.h/2));
        if(P.f&&e.fill>0){g.globalAlpha=Math.min(1,e.fill);g.fillStyle=e.colour?dcHex(e.colour):DC_INK;g.fill(P.f);g.globalAlpha=1;}
        g.strokeStyle=DC_INK;g.lineWidth=Math.max(1.2/k,INK_SIM.lineMm(e.lineWeight||7))/ek;g.lineCap=g.lineJoin="round";g.stroke(P.d);g.restore();}
      g.restore();
      g.fillStyle="#2a1d14";g.font="600 15px Oswald, 'Arial Narrow', sans-serif";g.textAlign="center";g.fillText(String(f.name||"").toUpperCase().slice(0,22),0,sh*0.38);}
    g.restore();}});}
function vrPlanks(){const t=vrCanvas(256,256,(g,w,h)=>{const r=vrRng(77);
  for(let i=0;i<8;i++){const y=i*h/8,l=r.range(0.82,1);g.fillStyle=`rgb(${Math.round(104*l)},${Math.round(70*l)},${Math.round(46*l)})`;g.fillRect(0,y,w,h/8);
    g.fillStyle="rgba(0,0,0,.35)";g.fillRect(0,y,w,1.5);const cut=r.range(20,230);g.fillRect(cut,y,1.5,h/8);
    g.fillStyle="rgba(255,230,190,.05)";for(let k=0;k<5;k++)g.fillRect(0,y+r.range(3,h/8-3),w,1);}});
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(4,4);return t;}
function vrSign(){return vrCanvas(512,128,(g,w,h)=>{g.fillStyle="#1b120c";g.fillRect(0,0,w,h);g.strokeStyle="#c9a35e";g.lineWidth=4;g.strokeRect(8,8,w-16,h-16);
  g.fillStyle="#f0c674";g.font="600 54px Oswald, 'Arial Narrow', sans-serif";g.textAlign="center";g.textBaseline="middle";g.fillText("TATTOO",w/2,h/2+2);});}

function vsRoom(){
  const T=TIER[V.tier],grp=new THREE.Group(),st={};for(const s of VR_STAGES)st[s]=new THREE.Group();
  st.apprenticeOnly=new THREE.Group();
  const add=(m,p,parent)=>{m.position.set(p[0],p[1],p[2]);m.castShadow=m.receiveShadow=T.shadows;(parent||grp).add(m);return m;};
  const box=(w,h,d,mat,p,par)=>add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat),p,par);
  const cyl=(r1,r2,h,seg,mat,p,par)=>add(new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg),mat),p,par);
  /* PR 10: each coded prop sits in its own named group, so vis/assets.js can hide it when a model file stands in for it */
  const props={},pg=(name,parent)=>{const g=new THREE.Group();g.name="prop:"+name;(parent||grp).add(g);props[name]=g;return g;};
  const M={plaster:vsMat("#7a5a43",{r:0.95}),wood:vsMat("#3a2618",{r:0.7}),dado:vsMat("#3a2618",{r:0.7}),floor:vsMat("#ffffff",{map:vrPlanks(),r:0.75}),leather:vsMat("#1f1a17",{r:0.45}),
    steel:vsMat("#9a968e",{r:0.35,m:0.6}),dark:vsMat("#151210",{r:0.6}),cream:vsMat("#efe5d2",{r:0.9}),paper:vsMat("#f4f1ea",{r:0.95}),
    brass:vsMat("#b48a46",{r:0.4,m:0.7}),lampshade:vsMat("#2b2b2b",{r:0.5,m:0.3}),bulb:vsMat("#fff4d6",{emissive:"#ffd9a0",ei:1.4}),
    rug:vsMat("#5c2a22",{r:1}),green:vsMat("#3f6b45",{r:0.9}),pot:vsMat("#8a4b2e",{r:0.9}),card:vsMat("#a07a52",{r:1}),ceil:vsMat("#2a211b",{r:1})};
  /* the shell */
  const floor=add(new THREE.Mesh(new THREE.PlaneGeometry(5.6,4.9),M.floor),[0,0,0.1]);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
  const ceil=add(new THREE.Mesh(new THREE.PlaneGeometry(5.6,4.9),M.ceil),[0,2.8,0.1]);ceil.rotation.x=Math.PI/2;
  const wall=(w,p,ry)=>{const m=add(new THREE.Mesh(new THREE.PlaneGeometry(w,2.8),M.plaster),[p[0],1.4,p[2]]);m.rotation.y=ry;m.castShadow=false;return m;};
  wall(5.6,[0,0,-2.35],0);wall(4.9,[-2.8,0,0.1],Math.PI/2);wall(4.9,[2.8,0,0.1],-Math.PI/2);wall(5.6,[0,0,2.55],Math.PI);
  box(5.6,0.9,0.03,M.dado,[0,0.45,-2.335]);box(0.03,0.9,4.9,M.dado,[-2.785,0.45,0.1]);box(0.03,0.9,4.9,M.dado,[2.785,0.45,0.1]);box(5.6,0.9,0.03,M.dado,[0,0.45,2.535]);
  box(5.6,0.05,0.05,M.dark,[0,0.92,-2.32]);box(0.05,0.05,4.9,M.dark,[-2.77,0.92,0.1]);box(0.05,0.05,4.9,M.dark,[2.77,0.92,0.1]);
  /* the window onto the canal (back wall, left) */
  const win=add(new THREE.Mesh(new THREE.PlaneGeometry(1.05,1.3),new THREE.MeshBasicMaterial({map:vrNight()})),[-1.45,1.62,-2.33]);win.castShadow=win.receiveShadow=false;
  for(const [w,h,x,y] of [[1.17,0.07,0,0.68],[1.17,0.07,0,-0.68],[0.07,1.43,-0.55,0],[0.07,1.43,0.55,0],[0.04,1.3,0,0],[1.05,0.04,0,0.22]])box(w,h,0.06,M.wood,[-1.45+x,1.62+y,-2.31]);
  box(1.3,0.05,0.18,M.wood,[-1.45,0.93,-2.27]);
  /* the flash wall (back wall, right): fuller from the rented chair on */
  const flashFull=add(new THREE.Mesh(new THREE.PlaneGeometry(2.0,1.0),vsMat("#ffffff",{map:vrFlash(10),r:0.9})),[0.85,1.72,-2.33],st.chair);
  const flashHalf=add(new THREE.Mesh(new THREE.PlaneGeometry(2.0,1.0),vsMat("#ffffff",{map:vrFlash(6),r:0.9})),[0.85,1.72,-2.33],st.apprenticeOnly);
  flashFull.castShadow=flashHalf.castShadow=false;
  const PF=pg("flashframe");for(const [w,h,x,y] of [[2.1,0.05,0,0.52],[2.1,0.05,0,-0.52],[0.05,1.09,-1.03,0],[0.05,1.09,1.03,0]])box(w,h,0.04,M.wood,[0.85+x,1.72+y,-2.31],PF);
  /* the chair: padded seat on a column, two armrests on posts (moved under the forearms per body shape; they stay coded) */
  const PC=pg("chair");box(0.5,0.09,0.46,M.leather,[0,0.425,0.06],PC);box(0.52,0.025,0.48,M.dark,[0,0.37,0.06],PC);
  cyl(0.045,0.05,0.34,12,M.steel,[0,0.2,0.06],PC);cyl(0.28,0.3,0.04,20,M.steel,[0,0.02,0.06],PC);
  const armrests={};
  for(const s of ["l","r"]){const g=new THREE.Group();grp.add(g);
    const pad=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.045,0.36),M.leather);pad.position.set(0,-0.0225,0);pad.castShadow=pad.receiveShadow=T.shadows;
    const tilt=new THREE.Group();tilt.add(pad);g.add(tilt);
    const post=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,1,8),M.steel);post.castShadow=T.shadows;g.add(post);
    const foot=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.12,0.03,14),M.steel);g.add(foot);
    armrests[s]={g,tilt,post,foot};}
  /* your station: trolley, machine, ink caps, paper roll, angle lamp, stool */
  const tx=0.86,tz=0.32,PS=pg("station"),PM=pg("machine");
  for(const [dx,dz] of [[-0.2,-0.15],[0.2,-0.15],[-0.2,0.15],[0.2,0.15]])cyl(0.012,0.012,0.8,6,M.steel,[tx+dx,0.4,tz+dz],PS);
  box(0.46,0.02,0.36,M.steel,[tx,0.8,tz],PS);box(0.46,0.02,0.36,M.steel,[tx,0.28,tz],PS);
  const mach=cyl(0.014,0.012,0.13,10,M.dark,[tx-0.08,0.825,tz+0.05],PM);mach.rotation.z=Math.PI/2;mach.rotation.y=0.4;
  box(0.05,0.03,0.035,M.brass,[tx-0.02,0.83,tz+0.03],PM);
  ["#16120e","#9a1d1d","#1f4f8a","#2f7a3a","#d9a21a","#5e3a7a"].forEach((c,i)=>cyl(0.009,0.009,0.014,8,vsMat(c,{r:0.4}),[tx+0.05+(i%3)*0.03,0.817,tz-0.06+Math.floor(i/3)*0.03],PS));
  cyl(0.05,0.05,0.2,14,M.paper,[tx+0.14,0.91,tz+0.09],PS);cyl(0.012,0.012,0.22,6,M.steel,[tx+0.14,0.91,tz+0.09],PS);
  cyl(0.03,0.032,0.14,10,vsMat("#cfd8d4",{r:0.3}),[tx+0.15,0.88,tz-0.1],PS);
  box(0.36,0.08,0.26,M.cream,[tx,0.33,tz],PS);
  /* the lamp: a stand by the trolley, an arm reaching over the forearm, a shade aimed down at the work (the light itself stays coded) */
  const LS=[1.05,0,-0.45],LH=[0.5,1.5,-0.12],PL=pg("lamp");cyl(0.14,0.15,0.03,16,M.dark,[LS[0],0.015,LS[2]],PL);cyl(0.015,0.015,1.62,8,M.dark,[LS[0],0.82,LS[2]],PL);
  {const a=new THREE.Vector3(LS[0],1.62,LS[2]),b=new THREE.Vector3(LH[0],LH[1]+0.06,LH[2]),m=a.clone().add(b).multiplyScalar(0.5),len=a.distanceTo(b);
    const arm=cyl(0.011,0.011,len,8,M.dark,[m.x,m.y,m.z],PL);arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());}
  const shade=add(new THREE.Mesh(new THREE.ConeGeometry(0.085,0.12,16,1,true),M.lampshade.clone()),LH,PL);shade.material.side=THREE.DoubleSide;
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-0.35,1.4,-0.4).normalize());
  add(new THREE.Mesh(new THREE.SphereGeometry(0.028,10,8),M.bulb),[LH[0]-0.01,LH[1]-0.05,LH[2]+0.01],PL);
  const PT=pg("stool");cyl(0.18,0.18,0.06,18,M.leather,[0.95,0.55,0.86],PT);cyl(0.025,0.025,0.5,8,M.steel,[0.95,0.27,0.86],PT);cyl(0.2,0.22,0.03,16,M.steel,[0.95,0.015,0.86],PT);
  /* the pendant over the chair: a bare bulb in the back room, a shade later */
  cyl(0.004,0.004,0.6,4,M.dark,[0,2.5,0.3]);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.035,10,8),M.bulb),[0,2.18,0.3]);
  const ps=add(new THREE.Mesh(new THREE.ConeGeometry(0.2,0.16,20,1,true),M.brass.clone()),[0,2.24,0.3],st.chair);ps.material.side=THREE.DoubleSide;
  /* shelves on the left wall, jars and a stack of sketchbooks */
  const PH=pg("shelves");for(const y of [1.25,1.62]){box(0.24,0.03,1.1,M.wood,[-2.66,y,-0.6],PH);
    for(let i=0;i<4;i++)cyl(0.04,0.04,0.12,10,vsMat(["#4c6a72","#8b6b3d","#6d3b2e","#53624a"][(i+(y>1.4?2:0))%4],{r:0.5}),[-2.66,y+0.075,-1.0+i*0.25],PH);}
  box(0.2,0.12,0.28,vsMat("#2c3540",{r:0.9}),[-2.66,1.33,-0.05],PH);
  /* the front wall: the door to the shop floor, a bench for whoever is waiting */
  box(0.95,2.05,0.05,M.wood,[1.6,1.025,2.52]);cyl(0.02,0.02,0.04,8,M.brass,[1.2,1.0,2.49]);
  const PB=pg("bench");box(1.4,0.08,0.42,M.leather,[-1.3,0.46,2.25],PB);box(1.4,0.42,0.06,M.leather,[-1.3,0.7,2.47],PB);
  for(const x of [-1.9,-0.7])box(0.05,0.42,0.38,M.dark,[x,0.21,2.25],PB);
  /* apprentice: boxes of supplies stacked in the corner and the broom you sweep with */
  box(0.42,0.3,0.36,M.card,[-2.35,0.15,-1.95],st.apprenticeOnly);box(0.36,0.26,0.3,M.card,[-2.33,0.43,-1.93],st.apprenticeOnly);
  box(0.4,0.28,0.34,M.card,[-1.9,0.14,-2.05],st.apprenticeOnly);
  const broom=cyl(0.012,0.012,1.3,6,M.wood,[2.62,0.68,-1.7],st.apprenticeOnly);broom.rotation.z=0.12;box(0.3,0.08,0.06,M.dark,[2.54,0.06,-1.7],st.apprenticeOnly);
  /* the rented chair: a rug under the chair */
  const rug=add(new THREE.Mesh(new THREE.CircleGeometry(1.05,36),M.rug),[0,0.004,0.25],st.chair);rug.rotation.x=-Math.PI/2;rug.castShadow=false;
  /* your studio: a lit sign and a plant */
  const sign=add(new THREE.Mesh(new THREE.PlaneGeometry(1.0,0.25),new THREE.MeshBasicMaterial({map:vrSign()})),[2.77,2.05,-0.6],pg("sign",st.studio));sign.rotation.y=-Math.PI/2;
  const PP=pg("plant",st.studio);cyl(0.16,0.12,0.3,14,M.pot,[2.45,0.15,-2.0],PP);add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3,1),M.green),[2.45,0.6,-2.0],PP);
  /* legacy: framed photos of healed work along the right wall and a second plant; vis/assets.js adds the trophy shelf when its file exists */
  const PG=pg("photos",st.legacy);for(let i=0;i<6;i++){const f=box(0.03,0.3,0.24,M.wood,[2.77,1.35+(i%2)*0.4,0.4+Math.floor(i/2)*0.42],PG);
    box(0.01,0.24,0.18,M.cream,[2.755,f.position.y,f.position.z],PG);}
  cyl(0.14,0.11,0.26,14,M.pot,[-2.45,0.13,1.85],st.legacy);add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.26,1),M.green),[-2.45,0.52,1.85],st.legacy);
  pg("trophies",st.legacy);   // empty: no coded stand-in, a model only
  for(const s of VR_STAGES)grp.add(st[s]);grp.add(st.apprenticeOnly);
  /* light: warm hemisphere, the work lamp, the pendant, a little cold moonlight through the window */
  const hemi=new THREE.HemisphereLight(vsCol("#f3e4d2"),vsCol("#2a1c12"),T.std?0.6:0.62);grp.add(hemi);
  let lamp;
  if(T.shadows){lamp=new THREE.SpotLight(vsCol("#ffd29a"),1.6,6,0.9,0.5,1);lamp.target.position.set(0.24,0.74,0.16);grp.add(lamp.target);
    lamp.castShadow=true;lamp.shadow.mapSize.set(T.shadowMap,T.shadowMap);lamp.shadow.bias=-0.0006;lamp.shadow.camera.near=0.2;lamp.shadow.camera.far=6;}
  else lamp=new THREE.PointLight(vsCol("#ffd29a"),1.15,5,1);
  lamp.position.set(LH[0]-0.02,LH[1]-0.07,LH[2]+0.02);grp.add(lamp);
  const pend=new THREE.PointLight(vsCol("#ffdcae"),T.std?0.7:0.55,7,1);pend.position.set(0,2.1,0.3);grp.add(pend);
  const moon=new THREE.DirectionalLight(vsCol("#7d95c4"),0.22);moon.position.set(-1.5,2.2,-2);grp.add(moon);
  return{grp,stages:st,armrests,props,mats:M,lights:{hemi,lamp,pend,moon}};}
/* show the props for a stage (cumulative: the studio keeps the rented chair's rug and flash) */
function vsStage(stage){
  const R=V.room;if(!R)return;const i=Math.max(0,VR_STAGES.indexOf(stage));V.stage=VR_STAGES[i];
  VR_STAGES.forEach((s,k)=>{R.stages[s].visible=k<=i;});R.stages.apprenticeOnly.visible=i===0;V.dirty=true;}
/* move the armrests under the forearms for the current shape mix */
function vsArmrests(w){
  const R=V.room;if(!R)return;
  for(const s of ["l","r"]){let x=0,y=0,z=0,p=0;for(const sh of BD_SHAPES){const k=w[sh]||0;if(!k)continue;const a=bdArmrest(sh,s);x+=a.x*k;y+=a.y*k;z+=a.z*k;p+=a.pitch*k;}
    const A=R.armrests[s];A.g.position.set(x,y-0.004,z);A.tilt.rotation.x=-p;A.post.scale.y=y-0.03;A.post.position.set(0,-(y-0.03)/2-0.02,0.0);A.foot.position.set(0,-y+0.015,0);}}
