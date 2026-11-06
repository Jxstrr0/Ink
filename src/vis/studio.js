/* ===== vis/studio.js: the shop interiors (PR 6; a room per career stage since 0.1.14.0) =====
   Five rooms built from primitives, one per career stage (two for the rented chair), and only the current one shows (vsStage):
     apprentice  Arkady's back room: small, low and worn. Dingy green paint with the brick showing through, cardboard
                 boxes, cluttered shelves, a mop and bucket, the broom, a practice table with fake skin, his old flash pinned
                 on a corkboard, a bare bulb on a cord and a small high window onto the canal.
     chair       your rented chair in a busy shop across town: high ceiling, checkered lino, white tiles to shoulder height,
                 strip lights, the shop's flash wall behind you, a partition with a few of your own sheets taped to it and
                 the next artist's lamp and chair beyond it.
     sedov       0.1.15.0: the rented chair when you left Arkady on good terms (his chair at the friend's split): the public
                 front room of Sedov's on Kanatnaya Street. The back room's family of look, warmer and kept: green paint over
                 a varnished dado, worn planks, a tall window onto the canal with a half curtain, his old-school flash
                 covering the back wall, his own chair and trolley, a third chair, the glass counter by the door, the
                 curtained doorway to the back room, a clock and a green enamel pendant.
     studio      your own studio: warm plaster over a dark dado, parquet, a rug, the big canal window, your flash wall,
                 the ИГЛА sign above the chair, the plant, shelves, the waiting bench, a brass pendant.
     legacy      the studio grown up: bigger, deep green walls over a tall oak wainscot with a brass rail, a patterned rug,
                 the trophy cabinet, framed photos of healed work, two plants, two brass pendants and a second artist's
                 station by the window.
   The room for a stage is vrKey(stage, shop): shop "sedov" turns the chair stage into Sedov's front room. The app decides
   (INK_VIS.setStudio(stage, shop)); nothing here reads the save.
   Your flash on your walls (0.1.15.0): the studio's and the legacy studio's flash walls, and the sheets taped to the rented
   chair's partition, show your own flash sheets (INK_VIS.setFlash: S.flash, newest first, drawn from the curated element
   library like every other sheet, with the name the Flash tab gives them). Frames past your last sheet get the shop's
   generic flash. All of it is one shared canvas (vrOwnPaint: the wall's 5 x 2 sheets on the top half, the partition's
   3 sheets under it; 512 px square on Lite, 1024 on Full and Ultra), repainted only when the list changes. Arkady's rooms
   keep his old-school sheets.
   Shared by every room (built once): the tattoo chair, its two armrests (moved under the client's forearms per body shape),
   your station (trolley, ink caps, paper roll; the coil machine, the rotary and the wireless pen: vsMachine puts the one the
   kit uses up front on the tray, a spare at the back corner and hides the third), the angle lamp on its stand and your
   stool. The client sits at the origin facing +z; the back wall is at -z. The camera's box (core.js ROOM) follows the room
   on every stage change.
   vsRoom() returns {grp, stages (by room key), lights, armrests, props, mats, stageMats, texScale, flash}; vsStage(stage) shows one room.
   Every prop is a named group in `props` (chair, station, machine, rotary, pen, lamp, stool, shelves, bench, flashframe,
   sign, plant, plant2, photos, trophies), built at its home spot (ASSETS.props[k].at in vis/assets.js) and moved per room
   as a whole group by VR_PLACE (an origin and a turn round it), so a Blender model that vis/assets.js swaps into the group
   moves with it. Each room's floor, walls and dado have their own materials (`stageMats[room]`, the studio's are also
   `mats.floor`/`plaster`/`dado`) so vis/assets.js can put the photo textures on them, tinted per room.
   Lite: Lambert materials, no shadows, about 2.5k to 3k triangles a room. Full / Ultra: Standard materials and one
   shadow-casting lamp. Canvas textures are drawn once per build (the own-flash canvas again when your flash changes). ===== */
const VR_STAGES=["apprentice","chair","studio","legacy"];
/* every room, by key (the chair stage has two) */
const VR_KEYS=["apprentice","chair","sedov","studio","legacy"];
function vrKey(stage,shop){const s=VR_STAGES[Math.max(0,VR_STAGES.indexOf(stage))];return s==="chair"&&shop==="sedov"?"sedov":s;}
/* each room: walls (x and z extents, height), colours, the window on the back wall [x, y, w, h], the door's x on the front
   wall, and its light: hemisphere sky/ground/intensity, the pendant light's colour, intensity and height, the moonlight */
const VR_ROOMS={
  apprentice:{x:[-1.75,1.85],z:[-1.55,2.45],h:2.4,wall:"#626b55",dado:"#3a3026",dadoH:0.9,rail:"#1d1812",ceil:"#1e1c17",floor:"planks",floorTint:"#8e8170",
    win:[0.2,1.7,0.6,0.45],door:1.1,light:{sky:"#e4dcc2",ground:"#1d1a14",hemi:0.52,pend:"#ffcd84",pi:0.85,py:1.98,moon:0.12}},
  chair:{x:[-3.2,2.9],z:[-2.6,2.5],h:3.0,wall:"#9ba395",dado:"tile",dadoH:1.2,rail:"#4b4f4a",ceil:"#bdbcb3",floor:"checker",
    win:[-2.35,1.85,0.95,1.2],door:1.6,light:{sky:"#eef3f2",ground:"#3a3631",hemi:0.74,pend:"#eef3ff",pi:0.62,py:2.85,moon:0.1}},
  sedov:{x:[-3.0,2.6],z:[-2.4,2.45],h:2.9,wall:"#6f7655",dado:"#3e2a1b",dadoH:1.0,rail:"#24190f",ceil:"#3a3326",floor:"planks",floorTint:"#a08268",
    win:[-2.05,1.55,1.0,1.55],door:1.2,light:{sky:"#f1e2c4",ground:"#2a1e14",hemi:0.6,pend:"#ffd18f",pi:0.8,py:2.25,moon:0.16}},
  studio:{x:[-2.8,2.8],z:[-2.35,2.55],h:2.8,wall:"#86664d",dado:"#3a2618",dadoH:0.9,rail:"#151210",ceil:"#2a211b",floor:"planks",floorTint:"#ffffff",
    win:[-1.85,1.62,1.05,1.3],door:1.6,light:{sky:"#f3e4d2",ground:"#2a1c12",hemi:0.62,pend:"#ffdcae",pi:0.7,py:2.1,moon:0.22}},
  legacy:{x:[-3.4,3.4],z:[-2.9,2.6],h:3.1,wall:"#3d5143",dado:"#4a2e1c",dadoH:1.15,rail:"#b48a46",ceil:"#231a14",floor:"planks",floorTint:"#b0927a",
    win:[-1.85,1.72,1.05,1.5],door:1.9,light:{sky:"#f7dcbe",ground:"#2a160c",hemi:0.6,pend:"#ffc987",pi:0.85,py:2.3,moon:0.18}}};
/* where each named prop stands in each room: absent = not in that room; {} = its home spot (ASSETS.props[k].at);
   {at, turn} = its origin moved to `at` and turned by `turn` round the up axis (on top of its ASSETS rot). The machine
   machines (coil, rotary, wireless pen) are placed by vsMachine (the kit), not here; they are in every room. */
const VR_BASE={chair:{},station:{},machine:{},rotary:{},pen:{},lamp:{},stool:{}};
const VR_PLACE={
  apprentice:Object.assign({},VR_BASE,{shelves:{at:[-1.12,0,-1.43],turn:-Math.PI/2}}),
  chair:Object.assign({},VR_BASE,{flashframe:{at:[0.05,1.72,-2.56]},bench:{}}),
  sedov:Object.assign({},VR_BASE,{flashframe:{at:[0.6,1.6,-2.36]},bench:{at:[-1.35,0,2.2]}}),
  studio:Object.assign({},VR_BASE,{flashframe:{at:[1.0,1.72,-2.31]},sign:{at:[-0.62,2.02,-2.32],turn:Math.PI/2},plant:{at:[-2.4,0,-1.95]},shelves:{},bench:{}}),
  legacy:Object.assign({},VR_BASE,{flashframe:{at:[2.0,1.72,-2.86]},sign:{at:[-0.85,2.12,-2.87],turn:Math.PI/2},photos:{at:[-0.02,1.5,-2.87],turn:Math.PI/2},
    trophies:{at:[-2.95,0,-2.74],turn:-Math.PI/2},plant:{at:[3.0,0,-2.5]},plant2:{at:[-3.05,0,-1.55]},shelves:{at:[-3.26,0,-0.4]},bench:{at:[-1.3,0,2.33]}})};
/* the two spots on the tray: up front (the machine in use) and set aside at the back corner */
const VR_TRAY={front:[0.74,0.81,0.38,0.4],back:[0.79,0.81,0.22,-0.3]};
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
/* a flash sheet board: sheets with flash on them. o: {n, from (first FLASH entry), cols, rows, w, h, bg (the board),
   paper, pins (pin colour), tilt, list (0.1.15.0: the designs to draw, one per sheet, instead of INK_SIM.FLASH from `from`)} */
const VR_FLASH0={n:10,from:0,cols:5,rows:2,w:1024,h:512,bg:"#3b2b1f",paper:"#f3ead8",pins:"#7a1f17",tilt:1};
function vrFlash(o){o=Object.assign({},VR_FLASH0,o||{});return vrCanvas(o.w,o.h,(g,w,h)=>vrFlashPaint(g,0,0,w,h,o));}
/* paint a board into the w x h box at (x0, y0) of a canvas. A design is {name, sizeMm, elements} (a FLASH entry, or one
   of your sheets as the app hands it over); every motif is a curated element's path (dcPath), never free text */
function vrFlashPaint(g,x0,y0,w,h,o){
  g.save();g.translate(x0,y0);g.fillStyle=o.bg;g.fillRect(0,0,w,h);
  const F=o.list||(typeof INK_SIM!=="undefined"&&INK_SIM.FLASH)||[],cols=o.cols,rows=o.rows,sw=w/cols,sh=h/rows;
  for(let i=0;i<cols*rows;i++){if(i>=o.n)break;const cx=(i%cols)*sw,cy=Math.floor(i/cols)*sh,f=o.list?F[i]:F[(i+o.from)%Math.max(1,F.length)];
    g.save();g.translate(cx+sw/2,cy+sh/2);g.rotate(((i*37+o.from*11)%7-3)*0.006*o.tilt);
    g.fillStyle=o.paper;g.fillRect(-sw*0.42,-sh*0.43,sw*0.84,sh*0.86);
    g.fillStyle=o.pins;g.beginPath();g.arc(0,-sh*0.4,Math.max(2,sh*0.016),0,7);g.fill();
    if(f&&Array.isArray(f.elements)&&f.elements.length){const fp=INK_SIM.footprintOf(f),k=sh*0.62/Math.max(f.sizeMm,1);g.save();g.translate(0,sh*0.02);g.scale(k,k);
      for(const e of f.elements){const P=dcPath(e.id);if(!P)continue;const b=P.b,ek=(e.scale*f.sizeMm)/Math.max(b.w,b.h,1e-6);
        g.save();g.translate((e.x-fp.cx)*f.sizeMm,(e.y-fp.cy)*f.sizeMm);g.rotate((e.rot||0)*Math.PI/180);g.scale(ek,ek);g.translate(-(b.x+b.w/2),-(b.y+b.h/2));
        if(P.f&&e.fill>0){g.globalAlpha=Math.min(1,e.fill);g.fillStyle=e.colour?dcHex(e.colour):DC_INK;g.fill(P.f);g.globalAlpha=1;}
        g.strokeStyle=DC_INK;g.lineWidth=Math.max(1.2/k,INK_SIM.lineMm(e.lineWeight||7))/ek;g.lineCap=g.lineJoin="round";g.stroke(P.d);g.restore();}
      g.restore();
      /* the sheet's name, as the Flash tab shows it, shrunk to fit the paper */
      const nm=String(f.name||"").toUpperCase().slice(0,34);let fs=Math.round(sh*0.06);g.font=`600 ${fs}px Oswald, 'Arial Narrow', sans-serif`;
      const tw=g.measureText(nm).width;if(tw>sw*0.78){fs=Math.max(6,Math.floor(fs*sw*0.78/tw));g.font=`600 ${fs}px Oswald, 'Arial Narrow', sans-serif`;}
      g.fillStyle="#2a1d14";g.textAlign="center";g.fillText(nm,0,sh*0.38);}
    g.restore();}
  g.restore();}
/* 0.1.15.0: your own flash on your walls. One shared canvas: the wall's 5 x 2 sheets on the top half, the partition's
   3 x 1 strip under it (the strip is the partition plane's shape, 0.96 x 0.38). `list` is your sheets, newest first,
   as {name, sizeMm, elements}; frames past the end get the shop's generic flash (FLASH from `from`) */
const VR_OWN={wall:{cols:5,rows:2,from:3},strip:{cols:3,rows:1,from:3,h:0.396,bg:"#d6d2c6",paper:"#f6efe0",pins:"#c9a35e",tilt:2},size:{lite:512,full:1024,ultra:1024}};
function vrOwnList(list,n,from){const F=(typeof INK_SIM!=="undefined"&&INK_SIM.FLASH)||[],out=(list||[]).slice(0,n);
  for(let i=0;out.length<n&&F.length;i++)out.push(F[(from+i)%F.length]);return out;}
function vrOwnPaint(g,w,h,list){const A=VR_OWN.wall,B=VR_OWN.strip;
  g.fillStyle="#1a140f";g.fillRect(0,0,w,h);
  vrFlashPaint(g,0,0,w,h/2,Object.assign({},VR_FLASH0,{n:A.cols*A.rows,cols:A.cols,rows:A.rows,from:A.from,list:vrOwnList(list,A.cols*A.rows,A.from)}));
  vrFlashPaint(g,0,h/2,w,h*B.h,Object.assign({},VR_FLASH0,B,{n:B.cols,list:vrOwnList(list,B.cols,B.from)}));}
/* a plane's uv square squeezed onto one rectangle of a texture (u0..u1, v0..v1; v runs up from the canvas bottom) */
function vrUV(geo,u0,v0,u1,v1){const a=geo.attributes.uv;for(let i=0;i<a.count;i++)a.setXY(i,u0+a.getX(i)*(u1-u0),v0+a.getY(i)*(v1-v0));a.needsUpdate=true;return geo;}
function vrPlanks(){const t=vrCanvas(256,256,(g,w,h)=>{const r=vrRng(77);
  for(let i=0;i<8;i++){const y=i*h/8,l=r.range(0.82,1);g.fillStyle=`rgb(${Math.round(104*l)},${Math.round(70*l)},${Math.round(46*l)})`;g.fillRect(0,y,w,h/8);
    g.fillStyle="rgba(0,0,0,.35)";g.fillRect(0,y,w,1.5);const cut=r.range(20,230);g.fillRect(cut,y,1.5,h/8);
    g.fillStyle="rgba(255,230,190,.05)";for(let k=0;k<5;k++)g.fillRect(0,y+r.range(3,h/8-3),w,1);}});
  t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
/* the rented chair's shop floor: worn black-and-cream lino squares; and its white wall tiles */
function vrChecker(){const t=vrCanvas(128,128,(g,w,h)=>{const r=vrRng(311);
  for(let i=0;i<4;i++){const x=(i%2)*w/2,y=Math.floor(i/2)*h/2,d=(i%2)===Math.floor(i/2)%2;g.fillStyle=d?"#e4dcc8":"#2a2a2a";g.fillRect(x,y,w/2,h/2);}
  g.fillStyle="rgba(0,0,0,.18)";g.fillRect(0,0,w,1);g.fillRect(0,0,1,h);g.fillRect(0,h/2,w,1);g.fillRect(w/2,0,1,h);
  for(let k=0;k<30;k++){g.fillStyle=`rgba(90,80,60,${r.range(0.03,0.08)})`;g.fillRect(r.range(0,w),r.range(0,h),r.range(2,10),r.range(1,4));}});
  t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
function vrTiles(){const t=vrCanvas(128,128,(g,w,h)=>{g.fillStyle="#bdbab0";g.fillRect(0,0,w,h);
  for(let row=0;row<4;row++){const off=(row%2)*w/4;for(let c=-1;c<3;c++){g.fillStyle=row%2?"#ebe8df":"#e6e3da";g.fillRect(off+c*w/2+1.5,row*h/4+1.5,w/2-3,h/4-3);}}});
  t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
/* brick showing through old plaster in the back room */
function vrBrick(){return vrCanvas(128,96,(g,w,h)=>{const r=vrRng(902);g.fillStyle="#6a675a";g.fillRect(0,0,w,h);
  g.save();g.beginPath();g.ellipse(w/2,h/2,w*0.47,h*0.44,0.1,0,7);g.clip();g.fillStyle="#4a3a30";g.fillRect(0,0,w,h);
  for(let row=0;row<8;row++){const off=(row%2)*14;for(let c=-1;c<6;c++){const l=r.range(0.8,1.05);g.fillStyle=`rgb(${Math.round(132*l)},${Math.round(66*l)},${Math.round(48*l)})`;g.fillRect(off+c*28+1,row*12+1,26,10);}}
  g.restore();});}
/* the legacy rug: deep red with a border */
function vrRug(){return vrCanvas(256,192,(g,w,h)=>{g.fillStyle="#5a2420";g.fillRect(0,0,w,h);g.strokeStyle="#c79a52";g.lineWidth=6;g.strokeRect(10,10,w-20,h-20);
  g.strokeStyle="#2a1a2e";g.lineWidth=10;g.strokeRect(24,24,w-48,h-48);g.fillStyle="#7b3a2a";
  for(let i=0;i<5;i++){g.beginPath();g.ellipse(w/2,h/2,(w-90)/2-i*16,(h-90)/2-i*12,0,0,7);g.strokeStyle=i%2?"#8c4a2c":"#3c1c22";g.lineWidth=4;g.stroke();}});}
/* the studio sign: ИГЛА ("needle", an invented Mostograd shop word), spaced letters in Oswald. The page's Google Fonts CSS
   only fetches Oswald's Cyrillic subset when Cyrillic is used, so the sign asks for it and repaints once it is in; until
   then (or offline) the letters fall back to a system sans, which has Cyrillic too */
const VR_SIGN="ИГЛА",VR_SIGN_FONT="600 80px Oswald, 'Arial Narrow', sans-serif";
function vrSignPaint(g,w,h){g.fillStyle="#1b120c";g.fillRect(0,0,w,h);g.strokeStyle="#c9a35e";g.lineWidth=4;g.strokeRect(8,8,w-16,h-16);
  g.fillStyle="#f0c674";g.font=VR_SIGN_FONT;g.textAlign="center";g.textBaseline="middle";
  const n=VR_SIGN.length;for(let i=0;i<n;i++)g.fillText(VR_SIGN[i],w/2+(i-(n-1)/2)*88,h/2+4);}
function vrSign(){const t=vrCanvas(512,128,vrSignPaint);
  try{if(document.fonts&&document.fonts.load)document.fonts.load(VR_SIGN_FONT,VR_SIGN).then(f=>{if(!f||!f.length)return;
    const c=t.image;vrSignPaint(c.getContext("2d"),c.width,c.height);t.needsUpdate=true;V.dirty=true;draw();}).catch(()=>{});}catch(e){}
  return t;}
/* a prop's home spot (where its stand-in is built and its model sits inside the group) */
function vrHome(k){return(typeof ASSETS!=="undefined"&&ASSETS.props[k]&&ASSETS.props[k].at)||[0,0,0];}
/* move a prop group so its home origin lands on q.at, turned by q.turn round the up axis */
function vrPlace(g,k,q){const h=vrHome(k),at=q.at||h,turn=q.turn||0,v=new THREE.Vector3(h[0],h[1],h[2]).applyAxisAngle(new THREE.Vector3(0,1,0),turn);
  g.rotation.set(0,turn,0);g.position.set(at[0]-v.x,at[1]-v.y,at[2]-v.z);}

function vsRoom(){
  const T=TIER[V.tier],grp=new THREE.Group(),st={};for(const s of VR_KEYS){st[s]=new THREE.Group();st[s].name="room:"+s;}
  const add=(m,p,parent)=>{m.position.set(p[0],p[1],p[2]);m.castShadow=m.receiveShadow=T.shadows;(parent||grp).add(m);return m;};
  const box=(w,h,d,mat,p,par)=>add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat),p,par);
  const cyl=(r1,r2,h,seg,mat,p,par)=>add(new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg),mat),p,par);
  const plane=(w,h,mat,p,ry,par)=>{const m=add(new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat),p,par);m.rotation.y=ry||0;m.castShadow=false;return m;};
  /* a rod from a to b (handles, poles, arms) */
  const rod=(r,a,b,seg,mat,par)=>{const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),m=cyl(r,r,A.distanceTo(B),seg,mat,A.clone().add(B).multiplyScalar(0.5).toArray(),par);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.sub(A).normalize());return m;};
  /* PR 10: each coded prop sits in its own named group, so vis/assets.js can hide it when a model file stands in for it */
  const props={},pg=(name)=>{const g=new THREE.Group();g.name="prop:"+name;grp.add(g);props[name]=g;return g;};
  const M={wood:vsMat("#3a2618",{r:0.7}),leather:vsMat("#1f1a17",{r:0.45}),
    steel:vsMat("#9a968e",{r:0.35,m:0.6}),dark:vsMat("#151210",{r:0.6}),cream:vsMat("#efe5d2",{r:0.9}),paper:vsMat("#f4f1ea",{r:0.95}),
    brass:vsMat("#b48a46",{r:0.4,m:0.7}),lampshade:vsMat("#2b2b2b",{r:0.5,m:0.3}),bulb:vsMat("#fff4d6",{emissive:"#ffd9a0",ei:1.4}),
    rug:vsMat("#5c2a22",{r:1}),green:vsMat("#3f6b45",{r:0.9}),pot:vsMat("#8a4b2e",{r:0.9}),card:vsMat("#a07a52",{r:1}),
    fake:vsMat("#e2b391",{r:0.7}),tube:vsMat("#f2f6ff",{emissive:"#e6eeff",ei:1.2}),red:vsMat("#5a1f1c",{r:0.5})};
  const night=vrNight(),planks=vrPlanks(),SM={},TS={};
  /* ---- the four shells: floor, ceiling, walls, dado and rail, the window onto the canal, the door ---- */
  for(const s of VR_KEYS){const C=VR_ROOMS[s],P=st[s],W=C.x[1]-C.x[0],D=C.z[1]-C.z[0],cx=(C.x[0]+C.x[1])/2,cz=(C.z[0]+C.z[1])/2,H=C.h;
    const fmap=(C.floor==="checker"?vrChecker():planks.clone());fmap.needsUpdate=true;
    if(C.floor==="checker")fmap.repeat.set(W/0.9,D/0.9);else fmap.repeat.set(4*W/5.6,4*D/4.9);
    let dmap=null;if(C.dado==="tile"){dmap=vrTiles();dmap.repeat.set(W/0.6,C.dadoH/0.3);}
    const mats={floor:vsMat(C.floor==="checker"?"#ffffff":C.floorTint,{map:fmap,r:C.floor==="checker"?0.5:0.75}),plaster:vsMat(C.wall,{r:0.95}),
      dado:dmap?vsMat("#ffffff",{map:dmap,r:0.4}):vsMat(C.dado,{r:0.7}),ceil:vsMat(C.ceil,{r:1})};
    SM[s]=mats;TS[s]={floor:[W/5.6,D/4.9],plaster:[W/5.6,H/2.8],dado:[W/5.6,C.dadoH/0.9]};
    const floor=add(new THREE.Mesh(new THREE.PlaneGeometry(W,D),mats.floor),[cx,0,cz],P);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
    const ceil=add(new THREE.Mesh(new THREE.PlaneGeometry(W,D),mats.ceil),[cx,H,cz],P);ceil.rotation.x=Math.PI/2;ceil.castShadow=false;
    plane(W,H,mats.plaster,[cx,H/2,C.z[0]],0,P);plane(D,H,mats.plaster,[C.x[0],H/2,cz],Math.PI/2,P);
    plane(D,H,mats.plaster,[C.x[1],H/2,cz],-Math.PI/2,P);plane(W,H,mats.plaster,[cx,H/2,C.z[1]],Math.PI,P);
    const dh=C.dadoH,rail=vsMat(C.rail,{r:0.5,m:C.rail==="#b48a46"?0.7:0});
    box(W,dh,0.03,mats.dado,[cx,dh/2,C.z[0]+0.015],P);box(0.03,dh,D,mats.dado,[C.x[0]+0.015,dh/2,cz],P);box(0.03,dh,D,mats.dado,[C.x[1]-0.015,dh/2,cz],P);box(W,dh,0.03,mats.dado,[cx,dh/2,C.z[1]-0.015],P);
    box(W,0.05,0.05,rail,[cx,dh+0.02,C.z[0]+0.03],P);box(0.05,0.05,D,rail,[C.x[0]+0.03,dh+0.02,cz],P);box(0.05,0.05,D,rail,[C.x[1]-0.03,dh+0.02,cz],P);
    /* the window onto the canal, on the back wall */
    const [wx,wy,ww,wh]=C.win,wz=C.z[0];
    const win=add(new THREE.Mesh(new THREE.PlaneGeometry(ww,wh),new THREE.MeshBasicMaterial({map:night})),[wx,wy,wz+0.02],P);win.castShadow=win.receiveShadow=false;
    for(const [w,h,x,y] of [[ww+0.12,0.07,0,wh/2+0.03],[ww+0.12,0.07,0,-wh/2-0.03],[0.07,wh+0.13,-ww/2-0.025,0],[0.07,wh+0.13,ww/2+0.025,0],[0.04,wh,0,0],[ww,0.04,0,wh*0.17]])
      box(w,h,0.06,M.wood,[wx+x,wy+y,wz+0.04],P);
    box(ww+0.25,0.05,0.18,M.wood,[wx,wy-wh/2-0.07,wz+0.09],P);
    /* the door on the front wall */
    box(0.95,2.05,0.05,M.wood,[C.door,1.025,C.z[1]-0.03],P);cyl(0.02,0.02,0.04,8,M.brass,[C.door-0.4,1.0,C.z[1]-0.06],P);}
  /* ---- shared: the chair, the armrests, your station, the lamp, the stool ---- */
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
  const tx=0.86,tz=0.32,PS=pg("station"),PM=pg("machine"),PR=pg("rotary"),PN=pg("pen");
  for(const [dx,dz] of [[-0.2,-0.15],[0.2,-0.15],[-0.2,0.15],[0.2,0.15]])cyl(0.012,0.012,0.8,6,M.steel,[tx+dx,0.4,tz+dz],PS);
  box(0.46,0.02,0.36,M.steel,[tx,0.8,tz],PS);box(0.46,0.02,0.36,M.steel,[tx,0.28,tz],PS);
  const mach=cyl(0.014,0.012,0.13,10,M.dark,[tx-0.08,0.825,tz+0.05],PM);mach.rotation.z=Math.PI/2;mach.rotation.y=0.4;
  box(0.05,0.03,0.035,M.brass,[tx-0.02,0.83,tz+0.03],PM);
  /* 0.1.12.0: a rotary pen beside it, lying along the tray's back-left corner: grip, body, a stroke ring, the needle cartridge */
  {const rq=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-0.3),ax=new THREE.Vector3(-1,0,0).applyQuaternion(rq),c=new THREE.Vector3(tx-0.07,0.823,tz-0.1);
    const seg=(r1,r2,a,b,mat)=>{const m=cyl(r1,r2,b-a,12,mat,c.clone().addScaledVector(ax,(a+b)/2).toArray(),PR);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),ax);return m;};
    const body=vsMat("#2e3b3f",{r:0.45,m:0.5});
    seg(0.0115,0.012,-0.068,-0.03,body);seg(0.013,0.013,-0.03,0.0,body);seg(0.0145,0.0145,0.0,0.008,vsMat("#7a2a22",{r:0.5,m:0.3}));
    seg(0.011,0.011,0.008,0.048,M.steel);seg(0.006,0.01,0.048,0.064,vsMat("#cfd6d8",{r:0.3}));seg(0.0012,0.005,0.064,0.078,M.steel);}
  /* 0.1.15.0: the wireless pen, at the same spot as the rotary (only one of the two lies at a time): a slim body, the
     battery collar at the back with its charge light, a stroke dial, a rubber grip, the cartridge and the needle; no cord */
  {const rq=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-0.3),ax=new THREE.Vector3(-1,0,0).applyQuaternion(rq),c=new THREE.Vector3(tx-0.07,0.8235,tz-0.1);
    const seg=(r1,r2,a,b,mat)=>{const m=cyl(r1,r2,b-a,12,mat,c.clone().addScaledVector(ax,(a+b)/2).toArray(),PN);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),ax);return m;};
    const collar=vsMat("#a8733f",{r:0.35,m:0.7}),body=vsMat("#25282d",{r:0.4,m:0.4});
    seg(0.0135,0.0135,-0.074,-0.05,collar);seg(0.0105,0.0105,-0.05,0.004,body);seg(0.0122,0.0122,0.004,0.011,vsMat("#4a4f55",{r:0.5,m:0.5}));
    seg(0.0108,0.0108,0.011,0.05,vsMat("#3b3e42",{r:0.85}));seg(0.006,0.0098,0.05,0.066,vsMat("#cfd6d8",{r:0.3}));seg(0.0012,0.005,0.066,0.08,M.steel);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.005,0.003,0.005),vsMat("#7fe0a0",{emissive:"#5fd88a",ei:1.2})),c.clone().addScaledVector(ax,-0.062).add(new THREE.Vector3(0,0.0135,0)).toArray(),PN);}
  ["#16120e","#9a1d1d","#1f4f8a","#2f7a3a","#d9a21a","#5e3a7a"].forEach((c,i)=>cyl(0.009,0.009,0.014,8,vsMat(c,{r:0.4}),[tx+0.05+(i%3)*0.03,0.817,tz-0.06+Math.floor(i/3)*0.03],PS));
  cyl(0.05,0.05,0.2,14,M.paper,[tx+0.14,0.91,tz+0.09],PS);cyl(0.012,0.012,0.22,6,M.steel,[tx+0.14,0.91,tz+0.09],PS);
  cyl(0.03,0.032,0.14,10,vsMat("#cfd8d4",{r:0.3}),[tx+0.15,0.88,tz-0.1],PS);
  box(0.36,0.08,0.26,M.cream,[tx,0.33,tz],PS);
  /* the lamp: a stand by the trolley, an arm reaching over the forearm, a shade aimed down at the work (the light itself stays coded) */
  const LS=[1.05,0,-0.45],LH=[0.5,1.5,-0.12],PL=pg("lamp");cyl(0.14,0.15,0.03,16,M.dark,[LS[0],0.015,LS[2]],PL);cyl(0.015,0.015,1.62,8,M.dark,[LS[0],0.82,LS[2]],PL);
  rod(0.011,[LS[0],1.62,LS[2]],[LH[0],LH[1]+0.06,LH[2]],8,M.dark,PL);
  const shade=add(new THREE.Mesh(new THREE.ConeGeometry(0.085,0.12,16,1,true),M.lampshade.clone()),LH,PL);shade.material.side=THREE.DoubleSide;
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-0.35,1.4,-0.4).normalize());
  add(new THREE.Mesh(new THREE.SphereGeometry(0.028,10,8),M.bulb),[LH[0]-0.01,LH[1]-0.05,LH[2]+0.01],PL);
  const PT=pg("stool");cyl(0.18,0.18,0.06,18,M.leather,[0.95,0.55,0.86],PT);cyl(0.025,0.025,0.5,8,M.steel,[0.95,0.27,0.86],PT);cyl(0.2,0.22,0.03,16,M.steel,[0.95,0.015,0.86],PT);
  /* ---- the props that move between rooms, built at their home spots (VR_PLACE moves the whole group) ---- */
  /* shelves (home: the studio's left wall), jars and a stack of sketchbooks */
  const PH=pg("shelves");for(const y of [1.25,1.62]){box(0.24,0.03,1.1,M.wood,[-2.66,y,-0.6],PH);
    for(let i=0;i<4;i++)cyl(0.04,0.04,0.12,10,vsMat(["#4c6a72","#8b6b3d","#6d3b2e","#53624a"][(i+(y>1.4?2:0))%4],{r:0.5}),[-2.66,y+0.075,-1.0+i*0.25],PH);}
  box(0.2,0.12,0.28,vsMat("#2c3540",{r:0.9}),[-2.66,1.33,-0.05],PH);
  /* the waiting bench by the front door */
  const PB=pg("bench");box(1.4,0.08,0.42,M.leather,[-1.3,0.46,2.25],PB);box(1.4,0.42,0.06,M.leather,[-1.3,0.7,2.47],PB);
  for(const x of [-1.9,-0.7])box(0.05,0.42,0.38,M.dark,[x,0.21,2.25],PB);
  /* the flash wall's frame (the sheets inside are each room's own) */
  const PF=pg("flashframe");for(const [w,h,x,y] of [[2.1,0.05,0,0.52],[2.1,0.05,0,-0.52],[0.05,1.09,-1.03,0],[0.05,1.09,1.03,0]])box(w,h,0.04,M.wood,[0.85+x,1.72+y,-2.31],PF);
  /* the lit sign, the plants, the photos of healed work, the trophy cabinet */
  const sign=add(new THREE.Mesh(new THREE.PlaneGeometry(1.0,0.25),new THREE.MeshBasicMaterial({map:vrSign()})),[2.77,2.05,-0.6],pg("sign"));sign.rotation.y=-Math.PI/2;
  const PP=pg("plant");cyl(0.16,0.12,0.3,14,M.pot,[2.45,0.15,-2.0],PP);add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3,1),M.green),[2.45,0.6,-2.0],PP);
  const P2=pg("plant2");cyl(0.14,0.11,0.26,14,M.pot,[-2.45,0.13,1.85],P2);add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.26,1),M.green),[-2.45,0.52,1.85],P2);
  const PG=pg("photos");for(let i=0;i<6;i++){const f=box(0.03,0.3,0.24,M.wood,[2.77,1.35+(i%2)*0.4,0.4+Math.floor(i/2)*0.42],PG);
    box(0.01,0.24,0.18,M.cream,[2.755,f.position.y,f.position.z],PG);}
  /* 0.1.14.0: a simple open cabinet with three cups stands in for the trophy model (home: the studio's left wall, facing +x) */
  const PY=pg("trophies"),ty=[-2.62,0,0.9],gold=vsMat("#c9a35e",{r:0.35,m:0.8});
  for(const dz of [-0.34,0.34])box(0.3,1.8,0.02,M.wood,[ty[0],0.9,ty[2]+dz],PY);
  box(0.01,1.78,0.66,M.wood,[ty[0]-0.145,0.9,ty[2]],PY);for(const y of [0.09,0.51,0.93,1.35,1.79])box(0.28,0.02,0.66,M.wood,[ty[0],y,ty[2]],PY);
  for(const [y,dz,s] of [[1.36,-0.15,1.25],[1.36,0.14,0.95],[0.1,0.16,1.1]]){cyl(0.03*s,0.012*s,0.12*s,8,gold,[ty[0],y+0.08*s,ty[2]+dz],PY);box(0.07*s,0.04*s,0.07*s,M.dark,[ty[0],y+0.02*s,ty[2]+dz],PY);}
  /* the flash sheets inside the frame, per room (the frame's spot from VR_PLACE, the sheets 2 cm behind its centre) */
  const sheets=(tex,s,mat)=>{const q=VR_PLACE[s].flashframe;const m=plane(2.0,1.0,mat||vsMat("#ffffff",{map:tex,r:0.9}),[q.at[0],q.at[1],q.at[2]-0.02],0,st[s]);return m;};
  /* 0.1.15.0: your own flash, one canvas for the studio's wall, the legacy wall and the rented chair's partition (vsFlash repaints it) */
  const OS=VR_OWN.size[V.tier]||512,own=vrCanvas(OS,OS,(g,w,h)=>vrOwnPaint(g,w,h,V.flash)),ownMat=vsMat("#ffffff",{map:own,r:0.9});
  const yours=s=>vrUV(sheets(null,s,ownMat).geometry,0,0.5,1,1);
  /* ---- apprentice: Arkady's back room ---- */
  {const A=st.apprentice,z0=VR_ROOMS.apprentice.z[0];
    /* his old flash, yellowed, pinned on a corkboard; brick through the plaster under the window */
    plane(0.78,0.58,vsMat("#ffffff",{map:vrFlash({n:4,from:6,cols:2,rows:2,w:512,h:384,bg:"#8a6a48",paper:"#e2cfa2",pins:"#2f3a5a",tilt:3}),r:0.95}),[0.98,1.36,z0+0.012],0,A);
    box(0.82,0.03,0.02,M.wood,[0.98,1.665,z0+0.02],A);box(0.82,0.03,0.02,M.wood,[0.98,1.055,z0+0.02],A);
    plane(0.5,0.34,vsMat("#ffffff",{map:vrBrick(),r:1}),[0.22,1.0,z0+0.01],0,A);
    /* boxes of supplies under the shelves */
    box(0.42,0.3,0.36,M.card,[-1.45,0.15,-1.3],A);box(0.36,0.26,0.3,M.card,[-1.43,0.43,-1.28],A);box(0.4,0.28,0.34,M.card,[-0.95,0.14,-1.33],A);
    box(0.3,0.04,0.22,vsMat("#c9b27a",{r:1}),[-1.43,0.58,-1.28],A);
    /* the mop in its bucket by the left wall, the broom against the back wall */
    cyl(0.15,0.12,0.28,12,vsMat("#56636b",{r:0.6,m:0.2}),[-1.42,0.14,-0.7],A);cyl(0.135,0.135,0.01,12,vsMat("#2a2f2c",{r:0.3}),[-1.42,0.24,-0.7],A);
    rod(0.012,[-1.42,0.2,-0.7],[-1.7,1.35,-0.62],6,M.wood,A);
    rod(0.012,[0.62,0.1,-1.32],[0.52,1.3,-1.52],6,M.wood,A);box(0.3,0.08,0.06,M.dark,[0.63,0.05,-1.31],A);
    /* the practice table: fake skin pads, a practice forearm, a sketch */
    box(0.8,0.04,0.45,M.wood,[1.35,0.72,-1.3],A);for(const [dx,dz] of [[-0.36,-0.19],[0.36,-0.19],[-0.36,0.19],[0.36,0.19]])box(0.04,0.7,0.04,M.wood,[1.35+dx,0.35,-1.3+dz],A);
    box(0.22,0.008,0.16,M.fake,[1.17,0.744,-1.24],A);box(0.2,0.008,0.15,vsMat("#d3a07c",{r:0.7}),[1.22,0.752,-1.36],A);
    const arm=cyl(0.042,0.036,0.34,10,M.fake,[1.5,0.78,-1.25],A);arm.rotation.z=Math.PI/2;arm.rotation.y=0.25;
    box(0.2,0.004,0.28,M.paper,[1.6,0.744,-1.4],A);
    /* the bare bulb on its cord */
    cyl(0.004,0.004,0.4,4,M.dark,[0,2.2,0.3],A);add(new THREE.Mesh(new THREE.SphereGeometry(0.035,10,8),M.bulb),[0,1.98,0.3],A);}
  /* ---- chair: your rented chair in a busy shop ---- */
  {const C=st.chair;
    sheets(vrFlash({from:12}),"chair");
    /* the partition between you and the next artist, with a few of your own sheets taped to it */
    box(0.04,1.5,1.8,vsMat("#d6d2c6",{r:0.8}),[-1.3,0.83,-1.1],C);box(0.06,0.05,1.84,M.dark,[-1.3,1.6,-1.1],C);
    for(const z of [-1.95,-0.25])box(0.3,0.04,0.06,M.dark,[-1.3,0.02,z],C);
    vrUV(plane(0.96,0.38,ownMat,[-1.277,1.2,-1.1],Math.PI/2,C).geometry,0,0.5-VR_OWN.strip.h,1,0.5);
    /* the next station over: their chair, their lamp leaning over the partition */
    box(0.5,0.09,0.46,M.red,[-2.2,0.43,-0.8],C);cyl(0.045,0.05,0.34,8,M.steel,[-2.2,0.2,-0.8],C);cyl(0.26,0.28,0.04,12,M.steel,[-2.2,0.02,-0.8],C);
    cyl(0.015,0.015,1.8,6,M.dark,[-2.0,0.9,-1.5],C);rod(0.011,[-2.0,1.8,-1.5],[-1.6,1.86,-1.2],6,M.dark,C);
    const ns=add(new THREE.Mesh(new THREE.ConeGeometry(0.08,0.12,12,1,true),M.lampshade),[-1.55,1.82,-1.18],C);ns.rotation.z=-0.5;
    add(new THREE.Mesh(new THREE.SphereGeometry(0.025,6,4),M.bulb),[-1.57,1.78,-1.18],C);
    /* strip lights */
    for(const z of [0.3,-1.5]){box(1.3,0.05,0.12,M.steel,[0.1,2.97,z],C);box(1.2,0.035,0.06,M.tube,[0.1,2.935,z],C);}}
  /* ---- sedov: your chair in the front room of Arkady's shop (0.1.15.0) ---- */
  {const F=st.sedov,z0=VR_ROOMS.sedov.z[0],xr=VR_ROOMS.sedov.x[1],cork="#8a6a48";
    /* his old-school flash over the back wall: the framed board, a row pinned above it, a narrow board beside it */
    sheets(vrFlash({from:5,bg:"#4a3626",paper:"#eadbb4",tilt:2}),"sedov");
    plane(2.3,0.5,vsMat("#ffffff",{map:vrFlash({n:5,from:9,cols:5,rows:1,w:1024,h:224,bg:cork,paper:"#e4d2a6",pins:"#2f3a5a",tilt:4}),r:0.95}),[0.6,2.5,z0+0.012],0,F);
    plane(0.7,1.0,vsMat("#ffffff",{map:vrFlash({n:4,from:1,cols:2,rows:2,w:448,h:640,bg:cork,paper:"#e8d8b0",pins:"#7a1f17",tilt:3}),r:0.95}),[2.1,1.6,z0+0.012],0,F);
    /* the half curtain on a brass rod across the canal window */
    const [wx,wy,ww,wh]=VR_ROOMS.sedov.win;plane(ww,wh*0.4,vsMat("#2f4a36",{r:1}),[wx,wy-wh*0.3,z0+0.08],0,F);rod(0.008,[wx-ww/2-0.05,wy-wh*0.1,z0+0.09],[wx+ww/2+0.05,wy-wh*0.1,z0+0.09],6,M.brass,F);
    /* the clock between the window and the flash */
    const ck=cyl(0.17,0.17,0.03,18,M.dark,[-1.0,2.25,z0+0.02],F);ck.rotation.x=Math.PI/2;const cf=cyl(0.15,0.15,0.034,18,M.cream,[-1.0,2.25,z0+0.022],F);cf.rotation.x=Math.PI/2;
    box(0.012,0.1,0.01,M.dark,[-1.0,2.29,z0+0.045],F);const mh=box(0.01,0.13,0.01,M.dark,[-0.97,2.24,z0+0.047],F);mh.rotation.z=-2.0;
    /* Arkady's own chair, trolley and lamp on the left */
    box(0.5,0.09,0.46,M.red,[-1.8,0.43,-0.6],F);box(0.52,0.025,0.48,M.dark,[-1.8,0.375,-0.6],F);cyl(0.045,0.05,0.34,8,M.steel,[-1.8,0.2,-0.6],F);cyl(0.26,0.28,0.04,12,M.steel,[-1.8,0.02,-0.6],F);
    box(0.4,0.02,0.32,M.steel,[-2.5,0.8,-1.15],F);box(0.4,0.02,0.32,M.steel,[-2.5,0.3,-1.15],F);
    for(const [dx,dz] of [[-0.18,-0.14],[0.18,-0.14],[-0.18,0.14],[0.18,0.14]])cyl(0.012,0.012,0.8,4,M.steel,[-2.5+dx,0.4,-1.15+dz],F);
    ["#16120e","#9a1d1d","#2f7a3a"].forEach((c,i)=>cyl(0.009,0.009,0.014,8,vsMat(c,{r:0.4}),[-2.6+i*0.03,0.817,-1.2],F));
    cyl(0.12,0.13,0.03,12,M.dark,[-2.6,0.015,-1.7],F);cyl(0.015,0.015,1.6,6,M.dark,[-2.6,0.8,-1.7],F);rod(0.011,[-2.6,1.6,-1.7],[-2.05,1.5,-0.95],6,M.dark,F);
    const al=add(new THREE.Mesh(new THREE.ConeGeometry(0.08,0.12,12,1,true),M.lampshade),[-2.02,1.45,-0.92],F);al.rotation.x=0.4;
    /* the third chair, empty, in the back corner */
    box(0.5,0.09,0.46,M.leather,[1.95,0.43,-1.6],F);cyl(0.045,0.05,0.34,8,M.steel,[1.95,0.2,-1.6],F);cyl(0.26,0.28,0.04,12,M.steel,[1.95,0.02,-1.6],F);
    cyl(0.16,0.16,0.05,12,M.leather,[1.4,0.55,-1.2],F);cyl(0.02,0.02,0.5,6,M.steel,[1.4,0.27,-1.2],F);
    /* the curtained doorway to the back room, in the right wall */
    plane(0.9,2.05,vsMat("#5a2420",{r:1}),[xr-0.02,1.025,-0.4],-Math.PI/2,F);
    box(0.06,0.08,1.06,M.wood,[xr-0.03,2.09,-0.4],F);
    for(const z of [-0.89,0.09])box(0.06,2.13,0.08,M.wood,[xr-0.03,1.065,z],F);
    /* the glass counter by the door, with the till */
    box(0.5,0.75,1.2,M.wood,[xr-0.33,0.375,1.5],F);const gl=vsMat("#cfe0dc",{r:0.1});gl.transparent=true;gl.opacity=0.35;box(0.5,0.2,1.2,gl,[xr-0.33,0.85,1.5],F);
    box(0.52,0.02,1.22,M.wood,[xr-0.33,0.96,1.5],F);box(0.28,0.16,0.24,M.dark,[xr-0.35,1.05,1.75],F);box(0.2,0.004,0.14,M.paper,[xr-0.33,0.972,1.25],F);
    /* the green enamel pendant */
    cyl(0.004,0.004,0.6,4,M.dark,[0,2.6,0.3],F);add(new THREE.Mesh(new THREE.SphereGeometry(0.035,10,8),M.bulb),[0,2.21,0.3],F);
    const gs=add(new THREE.Mesh(new THREE.ConeGeometry(0.22,0.15,18,1,true),vsMat("#2f5a3a",{r:0.4,m:0.2,side:THREE.DoubleSide})),[0,2.28,0.3],F);gs.castShadow=false;}
  /* ---- studio: your own ---- */
  {const S2=st.studio;yours("studio");
    const rug=add(new THREE.Mesh(new THREE.CircleGeometry(1.05,36),M.rug),[0,0.004,0.25],S2);rug.rotation.x=-Math.PI/2;rug.castShadow=false;
    cyl(0.004,0.004,0.6,4,M.dark,[0,2.5,0.3],S2);add(new THREE.Mesh(new THREE.SphereGeometry(0.035,10,8),M.bulb),[0,2.18,0.3],S2);
    const ps=add(new THREE.Mesh(new THREE.ConeGeometry(0.2,0.16,20,1,true),M.brass.clone()),[0,2.24,0.3],S2);ps.material.side=THREE.DoubleSide;}
  /* ---- legacy: the established studio ---- */
  {const L=st.legacy;yours("legacy");
    const rug=add(new THREE.Mesh(new THREE.PlaneGeometry(3.0,2.2),vsMat("#ffffff",{map:vrRug(),r:1})),[0,0.004,0.3],L);rug.rotation.x=-Math.PI/2;rug.castShadow=false;
    const shade=M.brass.clone();shade.side=THREE.DoubleSide;
    for(const [x,z] of [[0,0.3],[-1.9,-1.6]]){cyl(0.004,0.004,0.75,4,M.dark,[x,2.72,z],L);add(new THREE.Mesh(new THREE.SphereGeometry(0.035,10,8),M.bulb),[x,2.28,z],L);
      add(new THREE.Mesh(new THREE.ConeGeometry(0.2,0.16,20,1,true),shade),[x,2.34,z],L);}
    /* a second artist's station by the window: chair, trolley, lamp */
    box(0.5,0.09,0.46,M.leather,[-1.9,0.43,-1.75],L);cyl(0.045,0.05,0.34,8,M.steel,[-1.9,0.2,-1.75],L);cyl(0.26,0.28,0.04,12,M.steel,[-1.9,0.02,-1.75],L);
    box(0.4,0.02,0.32,M.steel,[-1.2,0.8,-2.2],L);box(0.4,0.02,0.32,M.steel,[-1.2,0.3,-2.2],L);
    for(const [dx,dz] of [[-0.18,-0.14],[0.18,-0.14],[-0.18,0.14],[0.18,0.14]])cyl(0.012,0.012,0.8,4,M.steel,[-1.2+dx,0.4,-2.2+dz],L);
    cyl(0.12,0.13,0.03,12,M.dark,[-2.55,0.015,-2.3],L);cyl(0.015,0.015,1.6,6,M.dark,[-2.55,0.8,-2.3],L);rod(0.011,[-2.55,1.6,-2.3],[-2.1,1.55,-1.95],6,M.dark,L);
    const ls=add(new THREE.Mesh(new THREE.ConeGeometry(0.08,0.12,12,1,true),M.lampshade),[-2.07,1.5,-1.93],L);ls.rotation.x=0.4;}
  for(const s of VR_KEYS)grp.add(st[s]);
  /* light: a hemisphere, the work lamp, the pendant (its colour, strength and height per room), a little cold moonlight */
  const hemi=new THREE.HemisphereLight(vsCol("#f3e4d2"),vsCol("#2a1c12"),0.6);grp.add(hemi);
  let lamp;
  if(T.shadows){lamp=new THREE.SpotLight(vsCol("#ffd29a"),1.6,6,0.9,0.5,1);lamp.target.position.set(0.24,0.74,0.16);grp.add(lamp.target);
    lamp.castShadow=true;lamp.shadow.mapSize.set(T.shadowMap,T.shadowMap);lamp.shadow.bias=-0.0006;lamp.shadow.camera.near=0.2;lamp.shadow.camera.far=6;}
  else lamp=new THREE.PointLight(vsCol("#ffd29a"),1.15,5,1);
  lamp.position.set(LH[0]-0.02,LH[1]-0.07,LH[2]+0.02);grp.add(lamp);
  const pend=new THREE.PointLight(vsCol("#ffdcae"),0.7,7,1);pend.position.set(0,2.1,0.3);grp.add(pend);
  const moon=new THREE.DirectionalLight(vsCol("#7d95c4"),0.22);moon.position.set(-1.5,2.2,-2);grp.add(moon);
  return{grp,stages:st,armrests,props,mats:Object.assign(M,{floor:SM.studio.floor,plaster:SM.studio.plaster,dado:SM.studio.dado,ceil:SM.studio.ceil}),stageMats:SM,texScale:TS,flash:own,lights:{hemi,lamp,pend,moon}};}
/* show one room: its shell and dressing, the props VR_PLACE puts in it (moved to their spots there), its light, the camera's box.
   shop (0.1.15.0): "sedov" makes the chair stage Arkady's front room; undefined keeps the last one */
function vsStage(stage,shop){
  if(shop!==undefined)V.shop=shop||null;
  const R=V.room;const s=VR_STAGES[Math.max(0,VR_STAGES.indexOf(stage))];V.stage=s;if(!R)return;
  const key=vrKey(s,V.shop),C=VR_ROOMS[key],P=VR_PLACE[key],T=TIER[V.tier];
  for(const k of VR_KEYS)R.stages[k].visible=k===key;
  for(const k in R.props){const g=R.props[k],q=P[k];g.visible=!!q;if(q&&!VR_MACHINE_OF[k])vrPlace(g,k,q);}
  const L=R.lights,l=C.light;
  L.hemi.color.copy(vsCol(l.sky));L.hemi.groundColor.copy(vsCol(l.ground));L.hemi.intensity=l.hemi*(T.std?0.97:1);
  L.pend.color.copy(vsCol(l.pend));L.pend.intensity=l.pi*(T.std?1:0.8);L.pend.position.set(0,l.py,0.3);L.moon.intensity=l.moon;
  ROOM.x[0]=C.x[0]+0.18;ROOM.x[1]=C.x[1]-0.18;ROOM.z[0]=C.z[0]+0.13;ROOM.z[1]=C.z[1]-0.13;ROOM.y[1]=C.h-0.2;
  vsMachine(V.machine);if(V.cam&&V.renderer)vsApplyCam();V.dirty=true;}
/* the machines on the tray: a MACHINES kind -> its prop group, and the group -> its kind */
const VR_MACHINE={coil:"machine",rotary:"rotary",pen:"pen"},VR_MACHINE_OF={machine:"coil",rotary:"rotary",pen:"pen"};
/* the machine the kit uses (kind: coil, rotary or pen) goes up front on the tray, a spare to the back corner (spare: the
   kind the app names, else the coil, or the rotary when the coil is in use) and the third is put away */
function vsMachine(kind,spare){
  V.machine=VR_MACHINE[kind]?kind:"coil";if(spare!==undefined)V.spare=VR_MACHINE[spare]?spare:null;
  const R=V.room;if(!R)return;
  const sp=V.spare&&V.spare!==V.machine?V.spare:V.machine==="coil"?"rotary":"coil";
  for(const k in VR_MACHINE){const g=R.props[VR_MACHINE[k]],w=k===V.machine?"front":k===sp?"back":null;if(!g)continue;g.visible=!!w;if(!w)continue;
    const t=VR_TRAY[w],h=ASSETS.props[VR_MACHINE[k]];vrPlace(g,VR_MACHINE[k],{at:[t[0],t[1],t[2]],turn:t[3]-((h&&h.rot)||0)});}
  V.dirty=true;}
/* 0.1.15.0: your flash sheets for your walls, newest first: [{name, sizeMm, elements}] (at most 10 are used). Repaints the
   shared canvas only when the list changed; returns whether it did */
function vsFlash(list){
  const L=(Array.isArray(list)?list:[]).filter(f=>f&&Array.isArray(f.elements)&&f.elements.length).slice(0,VR_OWN.wall.cols*VR_OWN.wall.rows)
    .map(f=>({name:String(f.name||""),sizeMm:+f.sizeMm||60,elements:f.elements}));
  const sig=JSON.stringify(L);if(sig===V.flashSig)return false;V.flash=JSON.parse(sig);V.flashSig=sig;
  const R=V.room;if(R&&R.flash){const c=R.flash.image;vrOwnPaint(c.getContext("2d"),c.width,c.height,V.flash);R.flash.needsUpdate=true;V.dirty=true;}
  return true;}
/* move the armrests under the forearms for the current shape mix */
function vsArmrests(w){
  const R=V.room;if(!R)return;
  for(const s of ["l","r"]){let x=0,y=0,z=0,p=0;for(const sh of BD_SHAPES){const k=w[sh]||0;if(!k)continue;const a=bdArmrest(sh,s);x+=a.x*k;y+=a.y*k;z+=a.z*k;p+=a.pitch*k;}
    const A=R.armrests[s];A.g.position.set(x,y-0.004,z);A.tilt.rotation.x=-p;A.post.scale.y=y-0.03;A.post.position.set(0,-(y-0.03)/2-0.02,0.0);A.foot.position.set(0,-y+0.015,0);}}
