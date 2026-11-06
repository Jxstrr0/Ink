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
   in its group and sits in that group, so it shows and hides with its stage exactly as the stand-in did. `at` is the prop's
   home spot; since 0.1.14.0 vis/studio.js moves the whole group per room (VR_PLACE: an origin and a turn) and the machine
   and rotary per kit (VR_TRAY), so a model follows its stand-in into every room without any per-room numbers here.
   0.1.15.0: the wireless pen has its own slot (`pen`, models/ink-machine-pen.glb), and the texture tints have a row for
   the fifth room, `sedov` (the rented chair in the front room of Arkady's shop).
   PR 11 (the Blender batch, tools/blender/): every prop file is in, and the mannequin (ASSETS.body) swaps in too. The model
   is one smooth skin ("skin" material) plus the bandeau and shorts ("cloth_top", "cloth_shorts"), with the game's UV atlas
   and two shape keys, "masc" and "femme" (Average is the basis). vaBodyApply puts it in the coded body's group with the
   game's own materials (the skin wears the decal texture, so tattoos paint into the same atlas), drives the shape keys from
   the client's shape mix (vaBodyShape, called by vsApplyShape) and hides the coded meshes. The coded body stays built and
   keeps its shapes: the stencil drag raycasts it and the camera presets and armrests read it, and its surface is the one the
   model was made on, so both agree to a millimetre or two. glTF UVs run down from the top, the game's canvas UVs up, so the
   loader flips v once per file. A file without those names or keys, or one that fails to load, leaves the coded body. ===== */
const ASSETS={
  tex:{
    /* 0.1.14.0: a tint per room (null: that room keeps its coded floor or dado) */
    floor:{mat:"floor",file:"models/textures/floor-parquet.jpg",repeat:[1.65,1.45],tints:{apprentice:"#8f7b68",chair:null,sedov:"#a88f78",studio:"#c9b19a",legacy:"#a5826a"},rough:0.72,on:true},
    wall:{mat:"plaster",file:"models/textures/wall-plaster.jpg",normal:"models/textures/wall-plaster-nor.jpg",normalScale:0.7,repeat:[2.8,1.4],
      tints:{apprentice:"#8e9478",chair:"#d8decf",sedov:"#a2a67e",studio:"#c09a78",legacy:"#5e7a66"},rough:0.95,on:true},
    dado:{mat:"dado",file:"models/textures/dado-planks.jpg",repeat:[2.8,0.45],tints:{apprentice:"#8c705a",chair:null,sedov:"#9a7656",studio:"#b28361",legacy:"#a0704c"},rough:0.7,on:true}},
  props:{
    chair:{file:"models/ink-chair.glb",at:[0,0,0.06],rot:0,on:true},
    station:{file:"models/ink-station.glb",at:[0.86,0,0.32],rot:0,on:true},
    machine:{file:"models/ink-machine-coil.glb",at:[0.78,0.81,0.37],rot:0.4,on:true},
    rotary:{file:"models/ink-machine-rotary.glb",at:[0.79,0.81,0.22],rot:-0.3,on:true},   // 0.1.12.0: the rotary pen beside the coil
    pen:{file:"models/ink-machine-pen.glb",at:[0.79,0.81,0.22],rot:-0.3,on:true},   // 0.1.15.0: the wireless pen (same spot as the rotary; vsMachine shows two of the three)
    lamp:{file:"models/ink-lamp.glb",at:[1.05,0,-0.45],rot:0,on:true},
    stool:{file:"models/ink-stool.glb",at:[0.95,0,0.86],rot:0,on:true},
    shelves:{file:"models/ink-shelves.glb",at:[-2.66,0,-0.6],rot:Math.PI/2,on:true},
    bench:{file:"models/ink-bench.glb",at:[-1.3,0,2.25],rot:Math.PI,on:true},
    flashframe:{file:"models/ink-flash-frame.glb",at:[0.85,1.72,-2.31],rot:0,on:true},
    sign:{file:"models/ink-sign.glb",at:[2.77,2.05,-0.6],rot:-Math.PI/2,on:true},
    plant:{file:"models/ink-plant.glb",at:[2.45,0,-2.0],rot:0,on:true},
    plant2:{file:"models/ink-plant.glb",at:[-2.45,0,1.85],rot:2.2,scale:0.86,on:true},   // the legacy studio's second plant: the same file, smaller
    photos:{file:"models/ink-photos.glb",at:[2.77,1.55,0.82],rot:-Math.PI/2,on:true},
    trophies:{file:"models/ink-trophies.glb",at:[-2.62,0,0.9],rot:Math.PI/2,on:true}},
  body:{file:"models/ink-mannequin.glb",on:true}
};
/* the session cache: file -> {st: "loading" | "in" | "failed", tex / scene} (two slots may share a file) */
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
/* put one texture entry on each room's material (only if that room is still the one on screen). 0.1.14.0: every stage has
   its own floor, walls and dado (room.stageMats); `tints` gives each stage's tint, and a stage tinted null keeps its coded
   look (the rented chair's lino and tiles). Each stage gets its own copy of the texture, its repeat scaled to that room */
function vaTexApply(room,a){
  const sets=room.stageMats||{studio:room.mats};
  vaTexture(a.file,true,t=>{if(V.room!==room)return;
    for(const s in sets){const m=sets[s][a.mat],tint=a.tints?a.tints[s]:a.tint;if(!m||!m.isMeshStandardMaterial||tint===null||(a.tints&&tint===undefined))continue;
      const k=(room.texScale&&room.texScale[s]&&room.texScale[s][a.mat])||[1,1],x=t.clone();x.needsUpdate=true;
      x.repeat.set(a.repeat[0]*k[0],a.repeat[1]*k[1]);x.anisotropy=TIER[V.tier].aniso;
      m.map=x;m.color.copy(vsCol(tint||"#ffffff"));if(a.rough!=null)m.roughness=a.rough;m.needsUpdate=true;
      if(a.normal)vaTexture(a.normal,false,n=>{if(V.room!==room)return;const y=n.clone();y.needsUpdate=true;y.repeat.copy(x.repeat);
        m.normalMap=y;m.normalScale.set(a.normalScale||1,a.normalScale||1);m.needsUpdate=true;V.dirty=true;draw();});}
    V.dirty=true;draw();});}
function vaModel(key,a,done,prep){
  const e=VA.props[key];
  if(e&&e.st==="in"){done(e.scene);return;}
  if(e&&e.st==="loading"){e.wait.push(done);return;}
  if(e&&e.st==="failed")return;
  const n=VA.props[key]={st:"loading",wait:[done]};
  try{new THREE.GLTFLoader().load(a.file,g=>{try{if(prep)prep(g.scene);}catch(err){n.st="failed";n.wait=[];return;}
      n.st="in";n.scene=g.scene;const w=n.wait;n.wait=[];for(const f of w)f(g.scene);},
    undefined,()=>{n.st="failed";n.wait=[];});}catch(err){n.st="failed";}}
/* swap a loaded model in for the coded meshes of its prop group */
function vaPropApply(room,key,a){
  vaModel(a.file,a,src=>{
    const g=room.props&&room.props[key];if(V.room!==room||!g)return;
    const T=TIER[V.tier],o=src.clone(true);o.name="model:"+key;o.position.set(a.at[0],a.at[1],a.at[2]);o.rotation.y=a.rot||0;if(a.scale)o.scale.setScalar(a.scale);
    o.traverse(m=>{if(m.isMesh){m.castShadow=m.receiveShadow=T.shadows;}});
    for(const c of g.children)c.visible=false;g.add(o);V.dirty=true;draw();});}
/* ---- the mannequin (PR 11) ---- */
/* once per file: glTF v runs down from the top of the atlas, the game's canvas UVs (body.js bdUV) run up */
function vaBodyPrep(scene){
  scene.traverse(m=>{const a=m.isMesh&&m.geometry.attributes.uv;if(!a)return;
    const A=a.array,top=a.normalized?(A instanceof Uint8Array?255:A instanceof Uint16Array?65535:1):1;
    for(let i=1;i<A.length;i+=2)A[i]=top-A[i];a.needsUpdate=true;});}
function vaBodyMeshes(o){const out={};o.traverse(m=>{if(m.isMesh&&m.material&&!out[m.material.name])out[m.material.name]=m;});return out;}
/* the file the game can use: a skin with UVs and both shape keys, and the two clothes */
function vaBodyOk(M){const ok=m=>m&&m.morphTargetDictionary&&m.morphTargetDictionary.masc!=null&&m.morphTargetDictionary.femme!=null;
  return ok(M.skin)&&!!M.skin.geometry.attributes.uv&&ok(M.cloth_top)&&ok(M.cloth_shorts);}
function vaBodyApply(room){
  vaModel(ASSETS.body.file,ASSETS.body,src=>{
    const B=V.body;if(V.room!==room||!B||B.glb||!V.mats)return;
    if(!vaBodyOk(vaBodyMeshes(src)))return;   // not the mannequin the game expects: keep the coded body
    const T=TIER[V.tier],o=src.clone(true),M=vaBodyMeshes(o);o.name="model:body";
    const mm=m=>{const c=m.clone();c.morphTargets=true;c.morphNormals=true;return c;};
    V.mats.skinM=mm(V.mats.skin);V.mats.ovM=mm(V.mats.ov);V.mats.ovM.morphNormals=false;
    const use={skin:V.mats.skinM,cloth_top:mm(V.mats.top),cloth_shorts:mm(V.mats.shorts)},morph=[];
    for(const k in use){const m=M[k];m.material=use[k];m.castShadow=m.receiveShadow=T.shadows;m.frustumCulled=false;morph.push(m);}
    /* the stencil overlay: the skin's geometry again with the overlay material, sharing the skin's shape weights */
    const ov=new THREE.Mesh(M.skin.geometry,V.mats.ovM);ov.morphTargetDictionary=M.skin.morphTargetDictionary;ov.morphTargetInfluences=M.skin.morphTargetInfluences;
    ov.renderOrder=2;ov.frustumCulled=false;ov.visible=false;ov.userData.islands=Object.keys(BD.islands);M.skin.add(ov);
    for(const m of B.parts)m.visible=false;if(B.head)B.head.visible=false;for(const m of V.ovMeshes)m.visible=false;
    V.ovMeshes=[ov];
    let tris=0;for(const m of morph){const g=m.geometry;tris+=(g.index?g.index.count:g.attributes.position.count)/3;}
    B.glb={o,morph,tris};B.grp.add(o);
    vaBodyShape(V.shapeW);vsStencilApply();V.dirty=true;draw();},vaBodyPrep);}
/* the shape mix {neutral, masc, femme} on the model's shape keys (Average is the basis) */
function vaBodyShape(w){const G=V.body&&V.body.glb;if(!G)return;
  for(const m of G.morph){const d=m.morphTargetDictionary,f=m.morphTargetInfluences;f[d.masc]=w.masc||0;f[d.femme]=w.femme||0;}}
/* called by vsBuild after a new room is up */
function vaLoad(room){
  if(!room||!TIER[V.tier].std||typeof THREE==="undefined")return;   // Lite: nothing, ever
  for(const k in ASSETS.tex){const a=ASSETS.tex[k];if(a.on)vaTexApply(room,a);}
  const want=Object.keys(ASSETS.props).filter(k=>ASSETS.props[k].on);if(!want.length&&!ASSETS.body.on)return;
  const go=()=>{for(const k of want)vaPropApply(room,k,ASSETS.props[k]);if(ASSETS.body.on)vaBodyApply(room);};
  if(THREE.GLTFLoader)go();else if(window.__inkLibs)window.__inkLibs().then(ok=>{if(ok&&THREE.GLTFLoader&&V.room===room)go();});}
/* for tests: what each entry is doing */
function vaStatus(){
  const out={tier:V.tier,tex:{},props:{}};
  for(const k in ASSETS.tex){const a=ASSETS.tex[k],e=VA.tex[a.file];out.tex[k]=!a.on?"off":e?e.st:"not asked";}
  for(const k in ASSETS.props){const a=ASSETS.props[k],e=VA.props[a.file];out.props[k]=!a.on?"off":e?e.st:"not asked";}
  const b=VA.props[ASSETS.body.file];out.body=!ASSETS.body.on?"off":b?(b.st==="in"&&!(V.body&&V.body.glb)?"in, not used":b.st):"not asked";
  return out;}
