/* ===== vis/api.js: the INK_VIS public object, IIFE close (PR 6) =====
   vsBuild() assembles the scene for the current tier (room, mannequin, skin texture, stencil overlay); a tier change that
   needs other materials, shadows or texture size rebuilds it. 0.1.17.0: every skin material gets the decal shader patch
   (vsSkinPatch -> dcPatch in vis/decals.js: the detail tiles, the pigment mix and the fresh-ink sheen), checked before
   each draw so the mannequin's cloned material gets it too. The API (all calls cheap when nothing changed; each one
   renders once at most, or starts a short frame loop for a move):
     init(canvas, tier) -> bool    ready()    setTier(t)    resize()    redraw()    fps() -> number while moving, else null
     mount(el)                     moves the one WebGL canvas into el (the Studio view, the Session tab's placement step)
     setClient(c)                  {bodyShape, skinTone 0..1, skin: "#hex" (the app passes bmSkin's colour so 2D and 3D
                                   agree)} or null for an empty chair; a shape change morphs over ~0.45 s (instant when reduced)
     setTattoos(list)              [{design, out, heal, ink, years, skinTone, sun}]: repaints the skin only if it changed
     setStencil(design, {drag})    the purple stencil on its island; drag(pos, "move"|"end") is called while it is dragged
     setView(name, {placement, size, instant})   consult (face-on) | stencil (the limb) | session (close on the work) | reveal
     setStudio(stage, shop)        apprentice | chair | studio | legacy (0.1.14.0: a different room for each); shop (0.1.15.0):
                                   "sedov" makes the chair stage the front room of Arkady's shop, null the shop across town
     setMachine(kind, spare)       coil | rotary | pen: the kit's machine goes up front on the tray (0.1.14.0), spare (0.1.15.0,
                                   another kind) at the back corner, the third put away
     setFlash(list)                0.1.15.0: your flash sheets, newest first, [{name, sizeMm, elements}], for the flash walls
                                   of your studio and legacy studio and the rented chair's partition; repaints only on a change
     setReduced(bool)              camera moves and shape changes become instant
     stats() -> {triangles, body, room, tier}   for the phone test
   PR 10: vsBuild ends with vaLoad(room) (vis/assets.js), which does nothing on Lite. PR 11: on Full and Ultra that also swaps
   in the Blender mannequin (vaBodyApply); vsApplyShape drives its shape keys, vsStencilApply its overlay, and the coded body
   stays built underneath (hidden) for the stencil raycast, the camera aims and the armrests. ===== */
function vsBuild(){
  if(!V.renderer)return;const T=TIER[V.tier],key=V.tier;if(V.built===key)return;V.built=key;
  const s=V.scene;while(s.children.length)s.remove(s.children[0]);
  s.background=vsCol("#0f0c09");s.fog=null;
  V.renderer.shadowMap.enabled=T.shadows;V.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  V.room=vsRoom();s.add(V.room.grp);
  const tex=dcInit(T,V.renderer.capabilities.isWebGL2);DC.sig="";DC.ov.size=T.ov;DC.ov.sig="";
  const skin=T.std?new THREE.MeshStandardMaterial({color:vsCol(V.skin),map:tex,roughness:0.62,metalness:0}):new THREE.MeshLambertMaterial({color:vsCol(V.skin),map:tex});
  dcPatch(skin);   // 0.1.17.0: the detail tiles and the gloss (vis/decals.js)
  V.mats={skin,top:vsMat(BD_CLOTH.top,{r:0.95,side:THREE.DoubleSide}),shorts:vsMat(BD_CLOTH.shorts,{r:0.95,side:THREE.DoubleSide})};
  const B=bdMeshes(V.mats);V.body={grp:B.grp,parts:B.parts,head:B.grp.children.find(m=>m.userData.part==="head")};
  /* the stencil overlay: a second copy of each skin part over the same geometry, drawn only where the overlay has lines */
  dcStencil(null);V.ovMeshes=[];
  const ovMat=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  ovMat.visible=false;V.mats.ov=ovMat;
  for(const m of B.parts){if(!m.userData.arr||/^(top|shorts|thumb)/.test(m.userData.part))continue;
    const o=new THREE.Mesh(m.geometry,ovMat);o.userData.islands=m.userData.islands;o.visible=false;o.renderOrder=2;B.grp.add(o);V.ovMeshes.push(o);}
  s.add(B.grp);B.grp.visible=V.clientOn;
  vsApplyShape(V.shapeW);vsStage(V.stage);
  dcCompose(V.tattoos,V.shape);vsStencilApply();
  vsView(V.view,Object.assign({},V.viewOpt,{instant:true}));V.dirty=true;draw();
  vaLoad(V.room);}   // PR 10: photo textures and Blender props on Full / Ultra (vis/assets.js); nothing on Lite
/* 0.1.17.0: every skin material carries the decal patch; Material.clone() drops it (the mannequin's skinM is a clone), so
   draw() runs this before each render: a no-op once patched */
function vsSkinPatch(){const M=V.mats;if(M.skin)dcPatch(M.skin);if(M.skinM)dcPatch(M.skinM);}
function vsApplyShape(w){V.shapeW=w;if(V.body){bdApplyShape(V.body.parts,w);vaBodyShape(w);}vsArmrests(w);V.dirty=true;}
function vsAfterShape(){if(V.view!=="consult")vsView(V.view,V.viewOpt);}
function vsStencilApply(){
  if(!V.mats)return;const isl=V.stencil&&V.clientOn?dcStencil(V.stencil,V.shape,V.tone):dcStencil(null);
  for(const ov of [V.mats.ov,V.mats.ovM]){if(!ov)continue;if(isl){ov.map=DC.ov.tex;ov.visible=true;ov.needsUpdate=true;}else ov.visible=false;}
  for(const o of V.ovMeshes)o.visible=!!isl&&o.userData.islands.indexOf(isl)>=0;
  V.dirty=true;}
/* where each view puts the camera */
function vsView(name,o){
  o=o||{};V.view=name;V.viewOpt={placement:o.placement||V.viewOpt.placement,size:o.size};
  let p,t;
  const z=(name!=="consult"&&V.clientOn&&V.body)?bdZone(V.viewOpt.placement||"forearm_l"):null,aim=z&&bdZoneAim(V.body.parts,z);
  if(!aim){p=new THREE.Vector3(0.62,1.3,2.05);t=new THREE.Vector3(0,0.92,0.08);V.view=name==="consult"||!V.clientOn?name:"consult";}
  else{const ext=Math.max(z.W,z.L)/1000,sz=(o.size||0)/1000;
    const D=name==="session"?Math.min(1.1,Math.max(0.3,(sz||ext)*2.1+0.16)):name==="reveal"?Math.min(1.7,Math.max(0.55,ext*1.8+0.38)):Math.min(1.4,Math.max(0.42,ext*1.5+0.22));
    /* look at the skin from its normal, leaning out from the body's centre line and a little from above */
    /* torso: lean out from the spine (front, back or side); limbs: lean out sideways, so the seat and the thighs stay out of the way */
    const torso=/^(chest|back|side|neck)/.test(z.isl);
    const out=torso?new THREE.Vector3(aim.p.x,0,aim.p.z):new THREE.Vector3(aim.p.x>=0?1:-1,0,0);if(out.lengthSq()<1e-6)out.set(0,0,1);out.normalize();
    /* the ribs are half hidden by the arm, so come from the front and a little below; skin that faces the chair (the calf)
       is seen from the side, low, so the seat stays out of the way */
    const side=/^side/.test(z.isl),back=!torso&&aim.n.z<-0.4;
    const dir=side?aim.n.clone().multiplyScalar(0.5).add(new THREE.Vector3(0,0.02,0.85)).add(out.multiplyScalar(0.8))
      :torso?aim.n.clone().multiplyScalar(0.5).add(new THREE.Vector3(0,0.25,0)).add(out.multiplyScalar(0.9))
      :back?aim.n.clone().multiplyScalar(0.35).add(new THREE.Vector3(0,0.08,0)).add(out.multiplyScalar(1))
      :aim.n.clone().multiplyScalar(0.7).add(new THREE.Vector3(0,0.28,0)).add(out.multiplyScalar(name==="session"?0.55:0.75));
    if(name==="reveal")dir.applyAxisAngle(new THREE.Vector3(0,1,0),aim.p.x>=0?0.5:-0.5);
    dir.normalize();if(dir.y>0.9){dir.y=0.9;const h=Math.sqrt(1-0.81),xz=new THREE.Vector2(dir.x,dir.z);if(xz.lengthSq()<1e-6)xz.set(0,1);xz.normalize().multiplyScalar(h);dir.x=xz.x;dir.z=xz.y;}
    t=aim.p.clone();p=t.clone().add(dir.multiplyScalar(D));}
  vsGoTo(p,t,o.instant);}
function vsClient(c){
  const on=!!c;V.clientOn=on;if(V.body)V.body.grp.visible=on;
  if(c){const shape=BD_FORM[c.bodyShape]?c.bodyShape:"neutral";V.tone=c.skinTone!=null?+c.skinTone:0.3;if(c.skin)V.skin=c.skin;
    if(V.mats)for(const m of [V.mats.skin,V.mats.skinM])if(m)m.color.copy(vsCol(V.skin));
    if(shape!==V.shape){V.shape=shape;const w1={neutral:0,masc:0,femme:0};w1[shape]=1;
      if(V.reduced||!V.body){V.shapeTw=null;vsApplyShape(w1);vsAfterShape();}else{V.shapeTw={w0:Object.assign({},V.shapeW),w1,t0:performance.now(),dur:450};vsKick();}
      dcCompose(V.tattoos,V.shape);vsStencilApply();}}
  else vsStencilApply();
  V.dirty=true;draw();}
window.INK_VIS={
  init(canvas,tier){const ok=init(canvas,tier);if(ok){try{vsBuild();}catch(e){V.renderer=null;return false;}}return ok;},
  ready(){return !!V.renderer&&!V.lost;},
  setTier,resize,
  redraw(){V.dirty=true;draw();},
  fps(){return V.looping?V.fps:null;},
  mount(el){if(!V.canvas||!el)return false;if(V.canvas.parentNode!==el)el.insertBefore(V.canvas,el.firstChild);resize();return true;},
  setClient(c){if(!V.renderer)return;vsClient(c);},
  setTattoos(list){V.tattoos=Array.isArray(list)?list:[];if(!V.renderer)return;if(dcCompose(V.tattoos,V.shape)){V.dirty=true;draw();}},
  setStencil(design,o){V.stencil=design&&design.elements&&design.elements.length?design:null;V.onStencil=o&&o.drag||null;if(!V.renderer)return;vsStencilApply();draw();},
  setView(name,o){if(!V.renderer){V.view=name;return;}vsView(name||"consult",o);},
  setStudio(stage,shop){vsStage(stage||"apprentice",shop===undefined?null:shop);if(V.room)draw();},
  setMachine(kind,spare){vsMachine(kind,spare);if(V.room)draw();},
  setFlash(list){if(vsFlash(list)&&V.room)draw();},
  setReduced(b){V.reduced=!!b;},
  stats(){const tri=o=>{let n=0;o.traverseVisible(m=>{if(m.isMesh&&m.visible!==false&&!(m.material&&m.material.visible===false)){const g=m.geometry;n+=(g.index?g.index.count:g.attributes.position.count)/3;}});return n;};
    return V.renderer?{tier:V.tier,body:V.body?(V.body.glb?V.body.glb.tris:bdTriangles(V.body.parts.concat([V.body.head]))):0,bodyModel:!!(V.body&&V.body.glb),room:V.room?tri(V.room.grp):0,triangles:tri(V.scene),calls:V.renderer.info.render.calls}:null;},
  /* for tests only: the texture as a data URL, the zone and island tables, and what a screen point hits (island, box pos) */
  _state:Object.assign(V,{dc:()=>DC.canvas&&DC.canvas.toDataURL(),dcDetail:()=>DC.dt.canvas&&DC.dt.canvas.toDataURL(),dcGloss:()=>DC.gl.canvas&&DC.gl.canvas.toDataURL(),DC,zone:bdZone,islands:()=>BD.islands,assets:vaStatus,ASSETS,VA,
    hit:(cx,cy,pl)=>{const q=vsHit({clientX:cx,clientY:cy}),z=bdZone(pl);return q&&z&&q.isl===z.isl?bdZonePos(z,q.x,q.y):null;}})
};
})();
</script>
