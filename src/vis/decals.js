/* ===== vis/decals.js: tattoos on the skin texture (PR 6; the tattoo look 0.1.17.0) =====
   One skin texture per visible client: a canvas (Lite 1024 px, Full and Ultra 2048 px) that is white with the ink on it;
   the skin material multiplies it by the client's skin colour, so ink sits under the skin the way it does in life (pale
   colours sink into dark skin) and a skin-tone change needs no repaint.
   Each piece is drawn with the same maths as the board (app/design.js dzToDesign / dzElSvg): elements in millimetres on
   the placement box (pos x box, footprint-centred offsets x sizeMm), each one translate(mx,my) rotate(rot) scale(k)
   about its path's box centre, Path2D from the element's SVG paths (cached per element), colour on the fill and black
   lines (watercolour and fill-less colour take colour lines). It is drawn into a small offscreen canvas in the zone's
   neutral millimetres (the body shape stretches the box across, so across is divided by the shape's wrap multiplier),
   then copied onto its island in bands that follow the zone's centre line, and clipped to the island: nothing is ever
   drawn across islands.
   0.1.17.0, how ink looks (DC_LOOK; visual only, the sim's numbers never change):
     - lines are INK_SIM.lineMm x lineK wide with a soft bleed of their own ink under them, not a hairline;
     - packed colour: a fill of 0.7 reads nearly solid (1 - (1 - fill)^fillGamma), with soft black shading inside the
       fill along its outline; watercolour fills get a soft edge instead;
     - fresh vs healed: a piece not yet healed (heal null, under freshWeeks) has a faint red halo round the ink and a
       gloss mask; both settle by the heal, a little sheen stays until settleWeeks; an infected heal keeps some redness;
       blacks drift blue-grey as they fade;
     - detail tiles: the atlas only gives an arm about 0.75 px per mm on Lite (1.5 on Full), far too few for the close
       views, and the UVs are fixed (the mannequin shares them). So each piece (pieces on one island that overlap share
       one) also gets a tile in a second canvas (TIER dt: Lite 1024, Full and Ultra 2048) at up to TIER dtPpm px per mm
       (Lite 7, Full 10, Ultra 12), packed at one density that fits; the skin shader (dcPatch) looks the fragment up in
       the tile list (TIER tiles, Lite 8, Full and Ultra 16) and samples the tile instead of the atlas. Pieces past the
       tile count stay on the atlas, which always holds every piece, so a material without the patch still shows them.
     - gloss: a small linear canvas (TIER gl: Lite 512, Full and Ultra 1024) over the whole atlas, white = matte skin;
       on Full and Ultra it is also the skin's roughnessMap (fresh ink at glossRough); on every tier the patch adds a
       soft view-space highlight from it (DC_LOOK.sheen; Lambert on Lite has no specular of its own).
     - pigment: the patch lets ink show a share of its own colour over the skin (DC_LOOK.pigment), so a blue or green
       still reads on warm or dark skin instead of turning muddy under the multiply.
   0.1.25.0: an element's second part (fill2, the leaves) is filled, shaded and aged in its own colour (INK_SIM.fill2Colour)
   under the main fill, or with it as one path (fu) in the same ink; the halo and gloss silhouette take both parts.
   Aging: INK_SIM.age(piece, years) gives blur, fade and spread (with the piece.heal grade from PR 5); spread widens the
   lines and the bleed, fade lowers the alpha, blur softens the offscreen copy (canvas filter where the browser has it,
   else a downscale).
   dcCompose(list, shape) repaints only when the list or the shape changed (a signature check), never per frame.
   The stencil overlay (dcStencil) is a second, small canvas for one island, mapped onto that island's rect with the
   texture's offset/repeat, so dragging the stencil repaints a few hundred pixels and never the skin. ===== */
const DC_INK="#16120e";
const DC_STENCIL={light:"#6a3fc8",dark:"#cbb6ff",rl:5};   // the purple of the Session tab's flat stencil (app/session.js SE_STENCIL)
/* 0.1.17.0: the look of ink on the body (tuning; the per-tier texture sizes are in TIER, vis/core.js) */
const DC_LOOK={
  lineK:1.3,                  // drawn line = INK_SIM.lineMm x lineK + half the aging spread
  bleedMm:0.4,bleedA:0.6,    // the soft bleed under every line: blur radius (mm, plus the aging spread) and alpha
  fillGamma:2.2,               // packed colour: alpha = 1 - (1 - fill)^fillGamma (0.7 -> 0.93, 0.35 -> 0.61)
  shadeMm:1.5,shadeA:0.4,      // soft black shading inside a fill along its outline: blur radius (mm), alpha at fill 1
  washMm:1.4,                  // watercolour fills: the soft edge (mm)
  oldInk:"#2c3b46",oldK:1.2,   // faded black drifts to blue-grey: mix = fade x oldK
  freshWeeks:3,                // not yet healed: fresh 1 on the day, 0 at freshWeeks (the heal comes at two weeks)
  settleWeeks:10,settleGloss:0.22,   // after the heal a little sheen stays, gone at settleWeeks
  healHalo:{infected:0.75,blownout:0.2},   // heal grades that keep some redness until settleWeeks
  haloMm:2.4,haloA:0.55,haloCol:"224,96,76",  // the fresh red halo: blur (mm), alpha at fresh 1, colour (multiplied by the skin)
  glossMm:2.5,glossRough:0.42, // the gloss mask spreads this far round the ink; fresh ink's roughness on Full/Ultra (skin 0.62)
  sheen:{k:0.45,p:10,lift:0.08,l:[-0.3,0.62,0.72]},  // the soft highlight on fresh ink, both tiers: strength, breadth, its floor on black, view-space light
  pigment:{cover:0.4,lum:0.35},  // ink shows a share of its own colour over the skin's (cover), full at skin luminance lum
                               // (linear) and less on darker skin, so blues and greens read and pale colours still sink
  lodK:0.6,                    // tile mip bias: gradients x lodK (sharper lines at a distance; WebGL2 only)
  tileGain:1.4,gutter:8,maxPx:2048   // a tile must beat the atlas by tileGain; px between tiles; offscreen canvas cap
};
const DC_SKIN_ROUGH=0.62;   // the skin material's roughness (vis/api.js vsBuild); the gloss canvas scales it
const DC={canvas:null,ctx:null,tex:null,size:0,sig:"",paths:{},filter:null,tmp:null,minPx:1.1,
  dt:{canvas:null,ctx:null,tex:null,size:0,ppm:7,n:8,used:0},gl:{canvas:null,ctx:null,tex:null,size:0},U:null,grad:false,
  ov:{canvas:null,ctx:null,tex:null,isl:null,sig:"",size:512}};
function dcPath(id){
  let c=DC.paths[id];if(c)return c;
  const d=INK_SIM.elementById(id);if(!d)return null;
  try{c={d:new Path2D(d.path),f:d.fill?new Path2D(d.fill):null,b:INK_SIM.elementBox(id),def:d,
    /* 0.1.25.0: the second part (fill2, the leaves) alone, and fill + fill2 as one path (one ink, the silhouette) */
    f2:d.fill&&d.fill2?new Path2D(d.fill2):null,fu:d.fill&&d.fill2?new Path2D(d.fill+d.fill2):null};}catch(e){return null;}
  return(DC.paths[id]=c);}
function dcFilterOk(){
  if(DC.filter==null){try{const c=document.createElement("canvas").getContext("2d");c.filter="blur(2px)";DC.filter=c.filter==="blur(2px)";}catch(e){DC.filter=false;}}
  return DC.filter;}
function dcCanvas(w,h){const c=document.createElement("canvas");c.width=w;c.height=h;return c;}
/* the three canvases and their textures for a tier T (TIER in vis/core.js); gl2: the renderer is WebGL2 (textureGrad) */
function dcInit(T,gl2){
  const size=T.tex;DC.minPx=T.minPx||1.1;DC.grad=!!gl2;
  if(!(DC.canvas&&DC.size===size)){
    if(DC.tex)DC.tex.dispose();
    const c=dcCanvas(size,size);DC.canvas=c;DC.ctx=c.getContext("2d");DC.size=size;
    DC.ctx.fillStyle="#fff";DC.ctx.fillRect(0,0,size,size);
    DC.tex=new THREE.CanvasTexture(c);DC.tex.encoding=THREE.sRGBEncoding;}
  DC.tex.anisotropy=T.aniso||1;DC.sig="";
  const D=DC.dt,ds=T.dt||1024;D.ppm=T.dtPpm||7;D.n=T.tiles||8;
  if(!(D.canvas&&D.size===ds)){if(D.tex)D.tex.dispose();D.canvas=dcCanvas(ds,ds);D.ctx=D.canvas.getContext("2d");D.size=ds;
    D.ctx.fillStyle="#fff";D.ctx.fillRect(0,0,ds,ds);D.tex=new THREE.CanvasTexture(D.canvas);D.tex.encoding=THREE.sRGBEncoding;}
  D.tex.anisotropy=T.aniso||1;
  /* WebGL1 has no textureGrad, and a texture sampled in a branch has no trustworthy mip level: no mipmaps there */
  D.tex.generateMipmaps=DC.grad;D.tex.minFilter=DC.grad?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;D.tex.needsUpdate=true;
  const G=DC.gl,gs=T.gl||256;
  if(!(G.canvas&&G.size===gs)){if(G.tex)G.tex.dispose();G.canvas=dcCanvas(gs,gs);G.ctx=G.canvas.getContext("2d");G.size=gs;
    G.ctx.fillStyle="#fff";G.ctx.fillRect(0,0,gs,gs);G.tex=new THREE.CanvasTexture(G.canvas);}
  const n=D.n,v4=()=>{const a=[];for(let i=0;i<n;i++)a.push(new THREE.Vector4());return a;},S=DC_LOOK.sheen;
  DC.U={dcMap:{value:D.tex},dcA:{value:v4()},dcB:{value:v4()},dcN:{value:0},dcGloss:{value:G.tex},
    dcSheen:{value:new THREE.Vector3(S.k/(1-DC_LOOK.glossRough/DC_SKIN_ROUGH),S.p,DC_LOOK.lodK)},dcSheenL:{value:new THREE.Vector3().fromArray(S.l).normalize()},
    dcPig:{value:new THREE.Vector3(DC_LOOK.pigment.cover,DC_LOOK.pigment.lum,S.lift)}};
  return DC.tex;}
/* the skin shader patch: the detail tiles, the pigment mix and the fresh highlight, on both tiers. Material.clone() drops
   onBeforeCompile, so the app calls this for every skin material (vis/api.js vsSkinPatch, also the mannequin's clone) */
function dcGlsl(std){
  const pars=`#define DC_N ${DC.dt.n}\n${DC.grad?"#define DC_GRAD\n":""}uniform sampler2D dcMap;uniform vec4 dcA[DC_N];uniform vec4 dcB[DC_N];uniform float dcN;
uniform sampler2D dcGloss;uniform vec3 dcSheen;uniform vec3 dcSheenL;uniform vec3 dcPig;\n`+(std?"":"varying vec3 vDcN;varying vec3 vDcV;\n");
  const map=`#ifdef USE_MAP
  vec4 texelColor=texture2D(map,vUv);
  {vec2 dcC=vec2(vUv.x,1.0-vUv.y);
  #ifdef DC_GRAD
  vec2 dcGx=dFdx(vUv)*dcSheen.z,dcGy=dFdy(vUv)*dcSheen.z;
  #endif
  for(int i=0;i<DC_N;i++){if(float(i)>=dcN)break;vec4 a=dcA[i];
    if(dcC.x>=a.x&&dcC.y>=a.y&&dcC.x<=a.z&&dcC.y<=a.w){vec4 b=dcB[i];vec2 q=dcC*b.xy+b.zw;q.y=1.0-q.y;
      #ifdef DC_GRAD
      texelColor=textureGrad(dcMap,q,dcGx*b.xy,dcGy*b.xy);
      #else
      texelColor=texture2D(dcMap,q);
      #endif
      break;}}}
  texelColor=mapTexelToLinear(texelColor);
  {float dcK=(1.0-min(min(texelColor.r,texelColor.g),texelColor.b))*dcPig.x*clamp(dot(diffuse,vec3(0.2126,0.7152,0.0722))/dcPig.y,0.0,1.0);
  diffuseColor.rgb=mix(diffuseColor.rgb*texelColor.rgb,texelColor.rgb,dcK);}
#endif`;
  const nv=std?"normal,dcV=normalize(vViewPosition)":"normalize(vDcN),dcV=normalize(vDcV)";
  const sheen=`{float dcG=(1.0-texture2D(dcGloss,vUv).g)*dcSheen.x;
  if(dcG>0.002){vec3 dcNn=${nv};vec3 dcH=normalize(dcV+dcSheenL);
    outgoingLight+=dcG*pow(max(dot(dcNn,dcH),0.0),dcSheen.y)*(vec3(dcPig.z)+0.6*outgoingLight);}}
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`;
  return{pars,map,sheen};}
function dcOBC(sh){
  const std=!!this.isMeshStandardMaterial,g=dcGlsl(std);Object.assign(sh.uniforms,DC.U);
  sh.fragmentShader=sh.fragmentShader.replace("#include <common>","#include <common>\n"+g.pars).replace("#include <map_fragment>",g.map)
    .replace("gl_FragColor = vec4( outgoingLight, diffuseColor.a );",g.sheen);
  if(!std)sh.vertexShader=sh.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 vDcN;varying vec3 vDcV;")
    .replace("#include <project_vertex>","#include <project_vertex>\nvDcN=normalize(transformedNormal);vDcV=-mvPosition.xyz;");}
function dcPatch(mat){
  if(!mat||!DC.U||mat.onBeforeCompile===dcOBC)return false;
  mat.onBeforeCompile=dcOBC;
  const key="dc"+DC.dt.n+(DC.grad?"g":"")+(mat.isMeshStandardMaterial?"s":"l");mat.customProgramCacheKey=()=>key;
  if(mat.isMeshStandardMaterial)mat.roughnessMap=DC.gl.tex;
  mat.needsUpdate=true;return true;}
/* the elements of a design in placement-box millimetres for a body shape (app/session.js seEls, the same transform) */
function dcEls(d,box){const sz=d.sizeMm||50,pos=d.pos||{x:.5,y:.5},fp=INK_SIM.footprintOf(d);
  return(d.elements||[]).filter(e=>INK_SIM.elementById(e.id)).map(e=>({id:e.id,mx:pos.x*box.wrapMm+((e.x!=null?e.x:.5)-fp.cx)*sz,my:pos.y*box.lengthMm+((e.y!=null?e.y:.5)-fp.cy)*sz,
    mm:(e.scale!=null?e.scale:.5)*sz,rot:e.rot||0,lineWeight:e.lineWeight||7,fill:e.fill||0,colour:e.colour||null}));}
function dcHex(c){const C=INK_SIM.COLOURS[c||"black"];return C?C.hex:DC_INK;}
function dcRgb(hex){const n=parseInt(String(hex).slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}
function dcRgba(hex,a){const c=dcRgb(hex);return`rgba(${c[0]},${c[1]},${c[2]},${(+a).toFixed(3)})`;}
function dcMix(h1,h2,t){const a=dcRgb(h1),b=dcRgb(h2);t=bdClamp(t,0,1);return"#"+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,"0")).join("");}
/* how fresh a piece is: {halo, gloss} 0..1 from its weeks since the sitting and its heal grade */
function dcFresh(t){
  const L=DC_LOOK,w=Math.max(0,t.years||0)*52,st=bdClamp(1-w/L.settleWeeks,0,1);
  const fresh=t.heal?0:bdClamp(1-w/L.freshWeeks,0,1);
  return{halo:Math.max(fresh,t.heal&&L.healHalo[t.heal]?L.healHalo[t.heal]*st:0),gloss:Math.max(fresh,t.heal?L.settleGloss*st:0)};}
/* measure one piece without drawing it: its elements, wear and freshness, its box in neutral mm (nx/ny, relative to the
   zone's centre line and start) and in island mm (ix/iy, clipped to the island). mode "ink" (aged) or "stencil" */
function dcMeasure(t,shape,mode){
  const d=t&&t.design;if(!d||!Array.isArray(d.elements)||!d.elements.length)return null;
  const z=bdZone(d.placement);if(!z)return null;const I=BD.islands[z.isl];if(!I)return null;
  const box=INK_SIM.placementBox(d.placement,shape)||{wrapMm:z.W,lengthMm:z.L},m=box.wrapMm/z.W;
  const els=dcEls(d,box);if(!els.length)return null;
  const ink=mode==="ink",L=DC_LOOK;let ag={blur:0,fade:0,spread:0};
  if(ink)try{ag=INK_SIM.age(t,Math.max(0,t.years||0))||ag;}catch(e){}
  const fr=ink?dcFresh(t):{halo:0,gloss:0};
  const pad=2+ag.spread*2+ag.blur*3+(ink?L.bleedMm*2+L.washMm:0)+(fr.halo>0.01?L.haloMm*2:0)+(fr.gloss>0.01?L.glossMm*2:0);
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const e of els){const r=e.mm*0.75;x0=Math.min(x0,e.mx-r);x1=Math.max(x1,e.mx+r);y0=Math.min(y0,e.my-r);y1=Math.max(y1,e.my+r);}
  const nx0=(x0-pad)/m,nx1=(x1+pad)/m,ny0=y0-pad,ny1=y1+pad,ya=z.y0+ny0,yb=z.y0+ny1;
  let ix0=1e9,ix1=-1e9;const xs=y=>{const x=bdZoneX(z,y)-z.W/2;ix0=Math.min(ix0,x+nx0);ix1=Math.max(ix1,x+nx1);};
  for(let k=0;k<=8;k++)xs(ya+(yb-ya)*k/8);for(const r of z.rows)if(r.y>ya&&r.y<yb)xs(r.y);
  ix0=Math.max(ix0,I.xmin);ix1=Math.min(ix1,I.xmax);const iy0=Math.max(ya,I.ymin),iy1=Math.min(yb,I.ymax);
  if(!(ix1>ix0&&iy1>iy0))return null;
  return{t,d,z,I,m,els,ag,fr,nx0,nx1,ny0,ny1,ix0,ix1,iy0,iy1};}
/* set the context to the element's transform on top of base (a, d, e, f: the offscreen's mm -> px), shifted dx px */
function dcElT(c,B,e,P,k,dx){const b=P.b;c.setTransform(B[0],0,0,B[1],B[2]+(dx||0),B[3]);c.translate(e.mx,e.my);c.rotate(e.rot*Math.PI/180);c.scale(k,k);c.translate(-(b.x+b.w/2),-(b.y+b.h/2));}
/* draw a measured piece into an offscreen canvas at ppx px per mm: {src, ppx, sil (the inked area, for halo and gloss)} */
function dcRender(M,ppx,mode,opts){
  const L=DC_LOOK,{m,els,ag,fr,d}=M;
  let cw=(M.nx1-M.nx0)*ppx,ch=(M.ny1-M.ny0)*ppx;const q=Math.min(1,L.maxPx/Math.max(cw,ch,1));ppx*=q;
  cw=Math.max(2,Math.ceil(cw*q));ch=Math.max(2,Math.ceil(ch*q));
  const oc=dcCanvas(cw,ch),c=oc.getContext("2d"),B=[ppx/m,ppx,-M.nx0*ppx,-M.ny0*ppx],OFF=cw+ch+64;
  c.lineCap="round";c.lineJoin="round";
  const minMm=(opts&&opts.minPx||DC.minPx)/(ppx/Math.max(m,1));
  const lineOf=e=>Math.max(INK_SIM.lineMm(e.lineWeight)*(mode==="stencil"?1:L.lineK)+ag.spread*0.5,minMm);
  if(mode==="stencil"){
    for(const e of els){const P=dcPath(e.id);if(!P)continue;const k=e.mm/Math.max(P.b.w,P.b.h,1e-6);dcElT(c,B,e,P,k);
      c.strokeStyle=opts.colour;c.lineWidth=Math.max(INK_SIM.lineMm(DC_STENCIL.rl),minMm)/k;c.globalAlpha=0.85;c.stroke(P.d);}
    return{src:oc,ppx,sil:null};}
  /* the inked area (fills, and lines widened by the gloss margin): the halo and the gloss mask grow from it */
  let sil=null;
  if(fr.halo>0.01||fr.gloss>0.01){sil=dcCanvas(cw,ch);const s=sil.getContext("2d");s.lineCap="round";s.lineJoin="round";s.fillStyle=s.strokeStyle="#000";
    for(const e of els){const P=dcPath(e.id);if(!P)continue;const k=e.mm/Math.max(P.b.w,P.b.h,1e-6);dcElT(s,B,e,P,k);
      if(P.f&&e.fill>0)s.fill(P.fu||P.f);s.lineWidth=(lineOf(e)+L.glossMm*0.6)/k;s.stroke(P.d);}}
  if(sil&&fr.halo>0.01){c.save();c.setTransform(1,0,0,1,0,0);c.shadowColor=`rgba(${L.haloCol},${(L.haloA*fr.halo).toFixed(3)})`;
    c.shadowBlur=L.haloMm*ppx*2;c.shadowOffsetX=OFF;c.drawImage(sil,-OFF,0);c.restore();}
  const wc=d.style==="watercolour",oldT=ag.fade*L.oldK;
  for(const e of els){const P=dcPath(e.id);if(!P)continue;const k=e.mm/Math.max(P.b.w,P.b.h,1e-6);
    const fc=e.colour?dcHex(e.colour):DC_INK,lc0=e.colour&&(wc||!(e.fill>0))?fc:DC_INK,lc=lc0===DC_INK||e.colour==="black"?dcMix(lc0,L.oldInk,oldT):lc0;
    if(P.f&&e.fill>0){const fa=1-Math.pow(1-bdClamp(e.fill,0,1),L.fillGamma);
      const part=(F,col)=>{
        if(wc){c.save();dcElT(c,B,e,P,k,-OFF);c.shadowColor=dcRgba(col,fa);c.shadowBlur=L.washMm*ppx*2;c.shadowOffsetX=OFF;c.fillStyle="#000";c.fill(F);c.restore();}
        else{dcElT(c,B,e,P,k);c.globalAlpha=fa;c.fillStyle=col;c.fill(F);c.globalAlpha=1;
          /* soft shading inside the fill along its outline (the lines' own shadow, clipped to the fill) */
          c.save();c.clip(F);dcElT(c,B,e,P,k,-OFF);c.shadowColor=dcRgba(DC_INK,L.shadeA*bdClamp(e.fill,0,1));c.shadowBlur=L.shadeMm*ppx*2;c.shadowOffsetX=OFF;
          c.strokeStyle="#000";c.lineWidth=lineOf(e)/k;c.stroke(P.d);c.restore();}};
      /* 0.1.25.0: the second part in its fixed colour (INK_SIM.fill2Colour) under the fill; in the element's own ink, one path */
      const c2=P.f2?INK_SIM.fill2Colour(P.def,e.colour,d.style):undefined,h2=c2===undefined?null:c2?dcHex(c2):DC_INK;
      if(h2&&h2!==fc)part(P.f2,h2);
      part(h2===fc?P.fu:P.f,fc);}
    dcElT(c,B,e,P,k);c.save();c.shadowColor=dcRgba(lc,L.bleedA);c.shadowBlur=(L.bleedMm+ag.spread*0.6)*ppx*2;
    c.strokeStyle=lc;c.lineWidth=lineOf(e)/k;c.stroke(P.d);c.restore();}
  /* aging blur */
  let src=oc;const bpx=ag.blur*ppx;
  if(bpx>0.45){const t2=dcCanvas(cw,ch),c2=t2.getContext("2d");
    if(dcFilterOk()){c2.filter=`blur(${Math.min(24,bpx).toFixed(2)}px)`;c2.drawImage(oc,0,0);}
    else{const f=1/(1+Math.min(16,bpx)*0.8),sw=Math.max(1,Math.round(cw*f)),sh=Math.max(1,Math.round(ch*f)),t3=dcCanvas(sw,sh);
      const c3=t3.getContext("2d");c3.imageSmoothingEnabled=true;c3.drawImage(oc,0,0,sw,sh);c2.imageSmoothingEnabled=true;c2.drawImage(t3,0,0,cw,ch);}
    src=t2;}
  return{src,ppx,sil};}
/* copy a rendered piece onto a destination {ctx, ox, oy, ppx, clip:[x,y,w,h]} where (ox,oy) is the island's (xmin,ymin)
   in px, along the zone's centre line, in bands whole destination pixels tall (no seams when it scales down) */
function dcBlit(dst,M,src,sppx,alpha){
  const z=M.z,I=M.I,s=dst.ppx/sppx,cw=src.width,ch=src.height,g=dst.ctx;
  g.save();g.beginPath();g.rect(dst.clip[0],dst.clip[1],dst.clip[2],dst.clip[3]);g.clip();g.globalAlpha=alpha;
  g.imageSmoothingEnabled=true;if("imageSmoothingQuality" in g)g.imageSmoothingQuality=s<0.6?"high":"low";
  const dxAt=y=>dst.ox+(bdZoneX(z,y)-z.W/2+M.nx0-I.xmin)*dst.ppx,Y0=dst.oy+(z.y0+M.ny0-I.ymin)*dst.ppx,H=ch*s;
  if(z.flat)g.drawImage(src,dxAt(0),Y0,cw*s,H);
  else{const b0=Math.floor(Y0),b1=Math.ceil(Y0+H);
    for(let y=b0;y<b1;y+=3){const ya=Math.max(y,Y0),yb=Math.min(y+3,Y0+H);if(yb<=ya)continue;
      g.drawImage(src,0,(ya-Y0)/s,cw,(yb-ya)/s,dxAt(z.y0+M.ny0+((ya+yb)/2-Y0)/dst.ppx),ya,cw*s,yb-ya);}}
  g.restore();}
/* one-shot draw (the stencil overlay): measure, render at the destination's density, copy */
function dcDraw(dst,t,shape,mode,opts){
  const M=dcMeasure(t,shape,mode);if(!M)return false;const R=dcRender(M,dst.ppx,mode,opts);
  dcBlit(dst,M,R.src,R.ppx,mode==="ink"?bdClamp(1-M.ag.fade,0.05,1):1);return true;}
/* pieces on one island whose boxes overlap share a group (and a tile); newest groups first */
function dcGroups(Ms){
  const G=[];
  for(const M of Ms){let g={isl:M.z.isl,I:M.I,x0:M.ix0,x1:M.ix1,y0:M.iy0,y1:M.iy1,ms:[M],last:M.i};
    for(let k=G.length-1;k>=0;k--){const h=G[k];
      if(h.isl===g.isl&&h.x0<g.x1&&g.x0<h.x1&&h.y0<g.y1&&g.y0<h.y1){
        g={isl:g.isl,I:g.I,x0:Math.min(g.x0,h.x0),x1:Math.max(g.x1,h.x1),y0:Math.min(g.y0,h.y0),y1:Math.max(g.y1,h.y1),ms:h.ms.concat(g.ms),last:Math.max(g.last,h.last)};
        G.splice(k,1);k=G.length;}}
    G.push(g);}
  return G.sort((a,b)=>b.last-a.last);}
/* shelf-pack groups into the detail canvas at d px per mm; null if they don't fit */
function dcShelf(G,d,size,gut){
  const ord=G.slice().sort((a,b)=>(b.y1-b.y0)-(a.y1-a.y0));let x=gut,y=gut,row=0;
  for(const g of ord){const w=Math.ceil((g.x1-g.x0)*d),h=Math.ceil((g.y1-g.y0)*d);
    if(w+2*gut>size||h+2*gut>size)return null;if(x+w+gut>size){x=gut;y+=row+gut;row=0;}
    if(y+h+gut>size)return null;g.tile=[x,y,w,h];x+=w+gut;row=Math.max(row,h);}
  return true;}
/* give the newest groups tiles at the highest density that fits (up to TIER dtPpm), and fill the shader's tile list */
function dcTiles(G){
  const D=DC.dt,L=DC_LOOK,U=DC.U;let use=G.slice(0,D.n),d=0;
  for(const g of G){g.tile=null;g.d=0;}
  while(use.length){const need=Math.max(...use.map(g=>g.I.ppm*DC.size))*L.tileGain;let lo=0,hi=D.ppm,ok=0;
    for(let k=0;k<18;k++){const mid=(lo+hi)/2;if(dcShelf(use,mid,D.size,L.gutter)){ok=mid;lo=mid;}else hi=mid;}
    if(ok>=need){d=ok;break;}use=use.slice(0,-1);}
  for(const g of G)g.tile=null;
  if(use.length)dcShelf(use,d,D.size,L.gutter);
  let n=0;
  for(const g of use){const I=g.I,r=I.rect,t=g.tile,p=I.ppm,S=D.size;g.d=d;
    const u0=r.x+(g.x0-I.xmin)*p,v0=r.y+(g.y0-I.ymin)*p;
    if(U){U.dcA.value[n].set(u0,v0,u0+(g.x1-g.x0)*p,v0+(g.y1-g.y0)*p);U.dcB.value[n].set(d/(p*S),d/(p*S),(t[0]-u0*d/p)/S,(t[1]-v0*d/p)/S);}
    n++;}
  if(U){U.dcN.value=n;for(let i=n;i<D.n;i++){U.dcA.value[i].set(0,0,-1,-1);U.dcB.value[i].set(0,0,0,0);}}
  D.used=n;return use;}
/* repaint the skin with these pieces: [{design, out, heal, ink, years, skinTone, sun}] */
function dcCompose(list,shape){
  if(!DC.ctx)return false;bdBuild();
  const sig=JSON.stringify([shape,DC.size,DC.dt.size,DC.dt.n,(list||[]).map(t=>[t.design,t.out||null,t.heal||null,t.ink||null,Math.round((t.years||0)*10)/10,Math.round((t.years||0)*52),t.skinTone,t.sun])]);
  if(sig===DC.sig)return false;DC.sig=sig;
  const g=DC.ctx,S0=DC.size,D=DC.dt,Gl=DC.gl,L=DC_LOOK;
  for(const [c,s] of [[g,S0],[D.ctx,D.size],[Gl.ctx,Gl.size]]){c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.fillStyle="#fff";c.fillRect(0,0,s,s);}
  const Ms=[];(list||[]).forEach((t,i)=>{try{const M=dcMeasure(t,shape,"ink");if(M){M.i=i;Ms.push(M);}}catch(e){}});
  const G=dcGroups(Ms);dcTiles(G);
  const gloss=1-DC_LOOK.glossRough/DC_SKIN_ROUGH;
  for(const grp of G)for(const M of grp.ms)M.g=grp;
  for(const M of Ms){try{
    const I=M.I,r=I.rect,grp=M.g,tile=grp&&grp.tile,R=dcRender(M,tile?grp.d:I.ppm*S0,"ink"),a=bdClamp(1-M.ag.fade,0.05,1);
    dcBlit({ctx:g,ox:r.x*S0,oy:r.y*S0,ppx:I.ppm*S0,clip:[r.x*S0,r.y*S0,r.w*S0,r.h*S0]},M,R.src,R.ppx,a);
    if(tile){const t=tile,d=grp.d;dcBlit({ctx:D.ctx,ox:t[0]-(grp.x0-I.xmin)*d,oy:t[1]-(grp.y0-I.ymin)*d,ppx:d,clip:t},M,R.src,R.ppx,a);}
    if(R.sil&&M.fr.gloss>0.01){const c=R.sil.getContext("2d");c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation="source-in";
      const v=Math.round(255*(1-gloss*M.fr.gloss));c.fillStyle=`rgb(${v},${v},${v})`;c.fillRect(0,0,R.sil.width,R.sil.height);
      const gp=I.ppm*Gl.size;dcBlit({ctx:Gl.ctx,ox:r.x*Gl.size,oy:r.y*Gl.size,ppx:gp,clip:[r.x*Gl.size,r.y*Gl.size,r.w*Gl.size,r.h*Gl.size]},M,R.sil,R.ppx,1);}
  }catch(e){}}
  DC.tex.needsUpdate=true;D.tex.needsUpdate=true;Gl.tex.needsUpdate=true;return true;}
/* the stencil overlay: a small canvas over one island. Returns the island id it covers (or null) */
function dcStencil(design,shape,tone){
  const ov=DC.ov;const z=design&&design.elements&&design.elements.length?bdZone(design.placement):null;
  if(!z){if(ov.ctx)ov.ctx.clearRect(0,0,ov.canvas.width,ov.canvas.height);ov.isl=null;ov.sig="";if(ov.tex)ov.tex.needsUpdate=true;return null;}
  const I=BD.islands[z.isl],r=I.rect;
  const big=ov.size,w=r.w>=r.h?big:Math.max(16,Math.round(big*r.w/r.h)),h=r.w>=r.h?Math.max(16,Math.round(big*r.h/r.w)):big;
  if(!ov.canvas||ov.canvas.width!==w||ov.canvas.height!==h){
    if(ov.tex)ov.tex.dispose();ov.canvas=document.createElement("canvas");ov.canvas.width=w;ov.canvas.height=h;ov.ctx=ov.canvas.getContext("2d");
    ov.tex=new THREE.CanvasTexture(ov.canvas);ov.tex.generateMipmaps=false;ov.tex.minFilter=THREE.LinearFilter;ov.tex.encoding=THREE.sRGBEncoding;
    ov.tex.wrapS=ov.tex.wrapT=THREE.ClampToEdgeWrapping;}
  ov.tex.repeat.set(1/r.w,1/r.h);ov.tex.offset.set(-r.x/r.w,-(1-r.y-r.h)/r.h);
  const sig=JSON.stringify([design,shape,tone>0.6,w]);
  if(sig!==ov.sig){ov.sig=sig;const g=ov.ctx;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);
    const ppx=w/(I.xmax-I.xmin);
    dcDraw({ctx:g,ox:0,oy:0,ppx,clip:[1,1,w-2,h-2]},{design},shape,"stencil",{colour:tone>0.6?DC_STENCIL.dark:DC_STENCIL.light,minPx:1.6});
    ov.tex.needsUpdate=true;}
  ov.isl=z.isl;return z.isl;}
