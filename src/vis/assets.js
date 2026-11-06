/* ===== vis/assets.js: optional asset files for Full and Ultra (PR 10) =====
   ASSETS lists every file the shop can use beyond its coded stand-ins: photo textures (Poly Haven, CC0) for the floor,
   walls and dado, and Kelbo's Blender models (glb, packed with tools/pack-model.py) for the props vis/studio.js builds as
   named groups. Credits: models/CREDITS.md. How to make the models: docs/BLENDER.md.
   Rules: Lite never loads any of it (vaLoad returns at once when the tier has no Standard materials, so a Lite phone makes
   no request at all). An entry with on:false is never fetched: that is how a model that does not exist yet ships, so there
   are no 404s. When a file is in, set its entry on:true in the same commit. A load that fails keeps the stand-in silently.
   Textures go through THREE.TextureLoader (core three.js); models need THREE.GLTFLoader, which comes from window.__inkLibs()
   (INK_LIBS in html/body.html) only when at least one model is on. Loaded textures and models are cached for the session,
   so a tier change (which rebuilds the room) re-applies the same objects without another fetch. Each one that lands renders the scene
   once (render on change still holds). The service worker caches everything under models/ as it is fetched.
   Models: metres, +Y up, the front facing +Z (Blender's -Y with the glTF exporter's +Y up), origin where `at` says
   (on the floor under the prop unless the note says otherwise); `rot` turns it round +Y. A model replaces every coded mesh
   in its group and sits in that group, so it shows and hides with its stage exactly as the stand-in did.
   The mannequin (ASSETS.body) is listed for the record only: nothing reads it yet. Swapping the coded body for Kelbo's needs
   his file to test against (same UV atlas, three shape keys); that is a small follow-up once models/ink-mannequin.glb exists. ===== */
const ASSETS={
  tex:{
    floor:{mat:"floor",file:"models/textures/floor-parquet.jpg",repeat:[1.65,1.45],tint:"#c9b19a",rough:0.72,on:true},
    wall:{mat:"plaster",file:"models/textures/wall-plaster.jpg",normal:"models/textures/wall-plaster-nor.jpg",normalScale:0.7,repeat:[2.8,1.4],tint:"#b68d6b",rough:0.95,on:true},
    dado:{mat:"dado",file:"models/textures/dado-planks.jpg",repeat:[2.8,0.45],tint:"#b28361",rough:0.7,on:true}},
  props:{
    chair:{file:"models/ink-chair.glb",at:[0,0,0.06],rot:0,on:false},
    station:{file:"models/ink-station.glb",at:[0.86,0,0.32],rot:0,on:false},
    machine:{file:"models/ink-machine-coil.glb",at:[0.78,0.81,0.37],rot:0.4,on:false},
    lamp:{file:"models/ink-lamp.glb",at:[1.05,0,-0.45],rot:0,on:false},
    stool:{file:"models/ink-stool.glb",at:[0.95,0,0.86],rot:0,on:false},
    shelves:{file:"models/ink-shelves.glb",at:[-2.66,0,-0.6],rot:Math.PI/2,on:false},
    bench:{file:"models/ink-bench.glb",at:[-1.3,0,2.25],rot:Math.PI,on:false},
    flashframe:{file:"models/ink-flash-frame.glb",at:[0.85,1.72,-2.31],rot:0,on:false},
    sign:{file:"models/ink-sign.glb",at:[2.77,2.05,-0.6],rot:-Math.PI/2,on:false},
    plant:{file:"models/ink-plant.glb",at:[2.45,0,-2.0],rot:0,on:false},
    photos:{file:"models/ink-photos.glb",at:[2.77,1.55,0.82],rot:-Math.PI/2,on:false},
    trophies:{file:"models/ink-trophies.glb",at:[-2.62,0,0.9],rot:Math.PI/2,on:false}},
  body:{file:"models/ink-mannequin.glb",on:false}
};
/* the session cache: key -> {st: "loading" | "in" | "failed", tex / scene} */
const VA={tex:{},nor:{},props:{}};
function vaTexture(file,srgb,done){
  const c=srgb?VA.tex:VA.nor;
  if(c[file]&&c[file].st==="in"){done(c[file].tex);return;}
  if(c[file]&&c[file].st==="loading"){c[file].wait.push(done);return;}
  if(c[file]&&c[file].st==="failed")return;
  const e=c[file]={st:"loading",wait:[done]};
  try{new THREE.TextureLoader().load(file,t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.encoding=THREE.sRGBEncoding;
      e.st="in";e.tex=t;const w=e.wait;e.wait=[];for(const f of w)f(t);},
    undefined,()=>{e.st="failed";e.wait=[];});}catch(err){e.st="failed";}}
/* put one texture entry on the room's material (only if that room is still the one on screen) */
function vaTexApply(room,a){
  const m=room.mats&&room.mats[a.mat];if(!m||!m.isMeshStandardMaterial)return;
  vaTexture(a.file,true,t=>{if(V.room!==room)return;const x=t;x.repeat.set(a.repeat[0],a.repeat[1]);if(x.anisotropy!==TIER[V.tier].aniso){x.anisotropy=TIER[V.tier].aniso;x.needsUpdate=true;}
    m.map=x;m.color.copy(vsCol(a.tint||"#ffffff"));if(a.rough!=null)m.roughness=a.rough;m.needsUpdate=true;V.dirty=true;draw();
    if(a.normal)vaTexture(a.normal,false,n=>{if(V.room!==room)return;const y=n;y.repeat.copy(x.repeat);
      m.normalMap=y;m.normalScale.set(a.normalScale||1,a.normalScale||1);m.needsUpdate=true;V.dirty=true;draw();});});}
function vaModel(key,a,done){
  const e=VA.props[key];
  if(e&&e.st==="in"){done(e.scene);return;}
  if(e&&e.st==="loading"){e.wait.push(done);return;}
  if(e&&e.st==="failed")return;
  const n=VA.props[key]={st:"loading",wait:[done]};
  try{new THREE.GLTFLoader().load(a.file,g=>{n.st="in";n.scene=g.scene;const w=n.wait;n.wait=[];for(const f of w)f(g.scene);},
    undefined,()=>{n.st="failed";n.wait=[];});}catch(err){n.st="failed";}}
/* swap a loaded model in for the coded meshes of its prop group */
function vaPropApply(room,key,a){
  vaModel(key,a,src=>{
    const g=room.props&&room.props[key];if(V.room!==room||!g)return;
    const T=TIER[V.tier],o=src.clone(true);o.name="model:"+key;o.position.set(a.at[0],a.at[1],a.at[2]);o.rotation.y=a.rot||0;
    o.traverse(m=>{if(m.isMesh){m.castShadow=m.receiveShadow=T.shadows;}});
    for(const c of g.children)c.visible=false;g.add(o);V.dirty=true;draw();});}
/* called by vsBuild after a new room is up */
function vaLoad(room){
  if(!room||!TIER[V.tier].std||typeof THREE==="undefined")return;   // Lite: nothing, ever
  for(const k in ASSETS.tex){const a=ASSETS.tex[k];if(a.on)vaTexApply(room,a);}
  const want=Object.keys(ASSETS.props).filter(k=>ASSETS.props[k].on);if(!want.length)return;
  const go=()=>{for(const k of want)vaPropApply(room,k,ASSETS.props[k]);};
  if(THREE.GLTFLoader)go();else if(window.__inkLibs)window.__inkLibs().then(ok=>{if(ok&&THREE.GLTFLoader&&V.room===room)go();});}
/* for tests: what each entry is doing */
function vaStatus(){
  const out={tier:V.tier,tex:{},props:{}};
  for(const k in ASSETS.tex){const a=ASSETS.tex[k],e=VA.tex[a.file];out.tex[k]=!a.on?"off":e?e.st:"not asked";}
  for(const k in ASSETS.props){const a=ASSETS.props[k],e=VA.props[k];out.props[k]=!a.on?"off":e?e.st:"not asked";}
  return out;}
