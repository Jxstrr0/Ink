<script>
/* ===================== Ink: INK_VIS (three.js) =====================
   INK_VIS draws what the sim says: the mannequin, the tattoos as decals, the studio. One IIFE spread over src/vis/:
   this file opens it, vis/api.js closes it and sets window.INK_VIS. three.js r128 from the CDN. INK_VIS never reads or
   writes the game state S: the app hands it a client, a list of pieces and a view, and it draws them.
   core.js: the renderer, the tier settings (lite / full / ultra), materials, the camera rig and on-demand rendering.
   Nothing draws every frame unless something is moving: a still scene renders once per change, which keeps phones cool.
   A frame loop runs only during a camera move, a body-shape change or a drag, capped at the tier's fps (30 on Lite);
   fps() reports the measured rate while it runs and null when idle, so app/perf.js's auto-adjust only ever judges real
   motion. Drag on the view orbits the camera gently round what it looks at (Lite allows less); with a stencil handler
   set (the Session tab's placement step), a drag that lands on the stencil's island moves the stencil instead. ===== */
(function(){"use strict";
const V={renderer:null,scene:null,camera:null,canvas:null,tier:"lite",dirty:true,looping:false,fps:null,_f:0,_t0:0,_last:0,raf:0,
  reduced:false,lastInput:0,drag:null,cam:null,onStencil:null,mats:null,body:null,room:null,ovMeshes:[],built:"",
  shape:"neutral",shapeW:{neutral:1,masc:0,femme:0},shapeTw:null,tone:0.3,skin:"#dba57c",clientOn:false,
  tattoos:[],stencil:null,stage:"apprentice",view:"consult",viewOpt:{},ray:null};
const TIER={
  lite:{pr:1.5,aa:false,fpsCap:30,tex:1024,ov:512,std:false,shadows:false,shadowMap:0,aniso:1,minPx:1.15,orbit:[0.55,0.22]},
  full:{pr:1.5,aa:true,fpsCap:60,tex:2048,ov:1024,std:true,shadows:true,shadowMap:1024,aniso:4,minPx:1,orbit:[1.1,0.4]},
  ultra:{pr:2,aa:true,fpsCap:60,tex:2048,ov:1024,std:true,shadows:true,shadowMap:2048,aniso:8,minPx:1,orbit:[1.5,0.5]}};
const ROOM={x:[-2.62,2.62],y:[0.14,2.6],z:[-2.22,2.42]};   // where the camera may go (inside the walls)
function hasGL(){return typeof THREE!=="undefined";}
function vsCol(hex){return new THREE.Color(hex).convertSRGBToLinear();}
/* a material for this tier: Lambert on Lite, Standard (roughness, a little metal) on Full and Ultra */
function vsMat(hex,o){o=o||{};const T=TIER[V.tier];
  const p={color:vsCol(hex)};if(o.map)p.map=o.map;if(o.side)p.side=o.side;if(o.emissive){p.emissive=vsCol(o.emissive);p.emissiveIntensity=o.ei||1;}
  if(o.basic)return new THREE.MeshBasicMaterial(Object.assign({},p,{color:o.map?new THREE.Color(0xffffff):p.color}));
  return T.std?new THREE.MeshStandardMaterial(Object.assign(p,{roughness:o.r!=null?o.r:0.8,metalness:o.m||0})):new THREE.MeshLambertMaterial(p);}
function init(canvas,tier){
  if(!hasGL())return false;
  V.canvas=canvas;V.tier=TIER[tier]?tier:"lite";
  try{V.renderer=new THREE.WebGLRenderer({canvas,antialias:TIER[V.tier].aa,powerPreference:"low-power"});}catch(e){V.renderer=null;return false;}
  if(!V.renderer.getContext()){V.renderer=null;return false;}
  V.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,TIER[V.tier].pr));
  V.renderer.outputEncoding=THREE.sRGBEncoding;
  V.scene=new THREE.Scene();
  V.camera=new THREE.PerspectiveCamera(42,1,.05,40);
  V.cam={p:new THREE.Vector3(0.5,1.3,2.0),t:new THREE.Vector3(0,0.93,0.05),yaw:0,pitch:0,tw:null};
  V.ray=new THREE.Raycaster();
  canvas.style.touchAction="none";
  canvas.addEventListener("pointerdown",vsDown);canvas.addEventListener("pointermove",vsMove);
  canvas.addEventListener("pointerup",vsUp);canvas.addEventListener("pointercancel",vsUp);
  canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();V.lost=true;});
  canvas.addEventListener("webglcontextrestored",()=>{V.lost=false;V.built="";vsBuild();});
  resize();
  window.addEventListener("resize",()=>{resize();});
  return true;}
function resize(){if(!V.renderer||!V.canvas)return;const w=V.canvas.clientWidth||1,h=V.canvas.clientHeight||1;V.renderer.setSize(w,h,false);V.camera.aspect=w/h;
  V.camera.fov=w/h<0.8?52:42;V.camera.updateProjectionMatrix();V.dirty=true;draw();}
function setTier(t){if(!TIER[t]||!V.renderer)return;const was=TIER[V.tier];V.tier=t;V.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,TIER[t].pr));
  const T=TIER[t];if(was.std!==T.std||was.shadows!==T.shadows||was.tex!==T.tex||was.shadowMap!==T.shadowMap){V.built="";vsBuild();}resize();}
/* render once if something changed */
function draw(){if(!V.renderer||!V.dirty||V.lost)return;V.dirty=false;V.renderer.render(V.scene,V.camera);}
function vsKick(){V.lastInput=performance.now();if(V.raf||!V.renderer)return;V._t0=0;V._last=0;V.raf=requestAnimationFrame(vsLoop);}
function vsLoop(now){
  V.raf=0;
  const busy=V.cam.tw||V.shapeTw||V.drag||now-V.lastInput<220;
  if(!busy){V.looping=false;V.fps=null;V.dirty=true;draw();return;}
  V.looping=true;V.raf=requestAnimationFrame(vsLoop);
  const cap=TIER[V.tier].fpsCap;if(V._last&&now-V._last<1000/cap-3)return;
  V._last=now;vsStep(now);V.dirty=true;draw();
  if(!V._t0){V._t0=now;V._f=0;return;}
  V._f++;if(now-V._t0>=500){V.fps=Math.round(V._f*1000/(now-V._t0));V._t0=now;V._f=0;}}
const vsEase=t=>t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function vsStep(now){
  const c=V.cam;
  if(c.tw){const k=Math.min(1,(now-c.tw.t0)/c.tw.dur),e=vsEase(k);
    c.p.lerpVectors(c.tw.p0,c.tw.p1,e);c.t.lerpVectors(c.tw.t0v,c.tw.t1,e);if(k>=1)c.tw=null;}
  if(V.shapeTw){const s=V.shapeTw,k=Math.min(1,(now-s.t0)/s.dur),e=vsEase(k),w={};
    for(const n in s.w1)w[n]=s.w0[n]+(s.w1[n]-s.w0[n])*e;vsApplyShape(w);if(k>=1){V.shapeTw=null;vsAfterShape();}}
  vsApplyCam();}
/* the camera: base position and target, plus the orbit offsets (yaw round the up axis, pitch round the side axis) */
function vsApplyCam(){
  const c=V.cam,off=c.p.clone().sub(c.t);
  if(c.yaw)off.applyAxisAngle(new THREE.Vector3(0,1,0),c.yaw);
  if(c.pitch){const ax=new THREE.Vector3().crossVectors(off,new THREE.Vector3(0,1,0));if(ax.lengthSq()>1e-8)off.applyAxisAngle(ax.normalize(),c.pitch);}
  const p=c.t.clone().add(off);
  p.x=Math.max(ROOM.x[0],Math.min(ROOM.x[1],p.x));p.y=Math.max(ROOM.y[0],Math.min(ROOM.y[1],p.y));p.z=Math.max(ROOM.z[0],Math.min(ROOM.z[1],p.z));
  V.camera.position.copy(p);V.camera.lookAt(c.t);V.dirty=true;}
function vsGoTo(p,t,instant){
  const c=V.cam;
  if(instant||V.reduced||!V.renderer){c.p.copy(p);c.t.copy(t);c.yaw=c.pitch=0;c.tw=null;vsApplyCam();draw();return;}
  /* start from where the camera is now (orbit included) */
  const p0=V.camera.position.clone(),t0=c.t.clone();c.yaw=c.pitch=0;
  c.tw={p0,t0v:t0,p1:p.clone(),t1:t.clone(),t0:performance.now(),dur:Math.min(900,350+p0.distanceTo(p)*260)};vsKick();}

/* ---- pointer: orbit, or drag the stencil ---- */
function vsHit(ev){
  if(!V.body)return null;const r=V.canvas.getBoundingClientRect();
  const m=new THREE.Vector2(((ev.clientX-r.left)/r.width)*2-1,-((ev.clientY-r.top)/r.height)*2+1);
  V.ray.setFromCamera(m,V.camera);const h=V.ray.intersectObjects(V.body.parts.concat(V.body.head?[V.body.head]:[]),false)[0];
  if(!h||!h.uv||!h.object.userData.arr||h.object.userData.part==="head")return null;
  if(/^(top|shorts)/.test(h.object.userData.part))return null;
  const q=bdFromUV(h.uv.x,h.uv.y);return q;}
function vsDown(ev){
  if(!V.renderer||(ev.button!=null&&ev.button>0))return;
  V.drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,mode:"orbit",moved:0};
  if(V.onStencil&&V.stencil&&V.clientOn){const z=bdZone(V.stencil.placement),q=vsHit(ev);
    if(z&&q&&q.isl===z.isl){V.drag.mode="stencil";V.drag.z=z;V.drag.p0=bdZonePos(z,q.x,q.y);V.drag.s0=Object.assign({x:.5,y:.5},V.stencil.pos||{});V.drag.pos=V.drag.s0;}}
  try{V.canvas.setPointerCapture(ev.pointerId);}catch(e){}
  vsKick();ev.preventDefault();}
function vsMove(ev){
  const d=V.drag;if(!d||d.id!==ev.pointerId)return;
  const dx=ev.clientX-d.x,dy=ev.clientY-d.y;d.x=ev.clientX;d.y=ev.clientY;d.moved+=Math.abs(dx)+Math.abs(dy);
  if(d.mode==="stencil"){const q=vsHit(ev);
    if(q&&q.isl===d.z.isl){const p=bdZonePos(d.z,q.x,q.y);d.pos={x:Math.max(0,Math.min(1,d.s0.x+p.x-d.p0.x)),y:Math.max(0,Math.min(1,d.s0.y+p.y-d.p0.y))};
      V.onStencil(d.pos,"move");}}
  else{const o=TIER[V.tier].orbit,c=V.cam;c.yaw=Math.max(-o[0],Math.min(o[0],c.yaw-dx*0.006));c.pitch=Math.max(-o[1],Math.min(o[1],c.pitch-dy*0.004));vsApplyCam();}
  vsKick();}
function vsUp(ev){
  const d=V.drag;if(!d||d.id!==ev.pointerId)return;V.drag=null;
  if(d.mode==="stencil"&&d.moved>2&&V.onStencil)V.onStencil(d.pos,"end");
  vsKick();}
