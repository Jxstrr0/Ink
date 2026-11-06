<script>
/* ===================== Ink: INK_VIS (three.js) =====================
   INK_VIS draws what the sim says: the mannequin, the tattoos as decals, the studio. One IIFE spread over src/vis/:
   this file opens it, vis/api.js closes it and sets window.INK_VIS. three.js r128 from the CDN.
   core.js: the renderer, the tier settings (lite / full / ultra) and on-demand rendering. Nothing draws every frame unless
   something is moving; a still scene renders once per change, which keeps phones cool. fps() reports the measured rate
   while a loop runs (null when idle) for app/perf.js. */
(function(){"use strict";
const V={renderer:null,scene:null,camera:null,canvas:null,tier:"lite",dirty:true,looping:false,fps:null,_f:0,_t0:0,raf:0};
const TIER={lite:{pr:1,aa:false,fpsCap:30},full:{pr:1.5,aa:true,fpsCap:60},ultra:{pr:2,aa:true,fpsCap:60}};
function hasGL(){return typeof THREE!=="undefined";}
function init(canvas,tier){
  if(!hasGL())return false;
  V.canvas=canvas;V.tier=TIER[tier]?tier:"lite";
  try{V.renderer=new THREE.WebGLRenderer({canvas,antialias:TIER[V.tier].aa,powerPreference:"low-power"});}catch(e){V.renderer=null;return false;}
  V.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,TIER[V.tier].pr));
  V.renderer.outputEncoding=THREE.sRGBEncoding;
  V.scene=new THREE.Scene();
  V.camera=new THREE.PerspectiveCamera(42,1,.1,60);
  resize();
  window.addEventListener("resize",()=>{resize();});
  return true;}
function resize(){if(!V.renderer||!V.canvas)return;const w=V.canvas.clientWidth||1,h=V.canvas.clientHeight||1;V.renderer.setSize(w,h,false);V.camera.aspect=w/h;V.camera.updateProjectionMatrix();V.dirty=true;draw();}
function setTier(t){if(!TIER[t]||!V.renderer)return;V.tier=t;V.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,TIER[t].pr));resize();}
/* render once if something changed */
function draw(){if(!V.renderer||!V.dirty)return;V.dirty=false;V.renderer.render(V.scene,V.camera);}
