/* ===== vis/decals.js: tattoos on the skin texture (PR 6) =====
   One skin texture per visible client: a canvas (Lite 1024 px, Full and Ultra 2048 px) that is white with the ink on it;
   the skin material multiplies it by the client's skin colour, so ink sits under the skin the way it does in life (pale
   colours sink into dark skin) and a skin-tone change needs no repaint.
   Each piece is drawn with the same maths as the board (app/design.js dzToDesign / dzElSvg): elements in millimetres on
   the placement box (pos x box, footprint-centred offsets x sizeMm), each one translate(mx,my) rotate(rot) scale(k)
   about its path's box centre, Path2D from the element's SVG paths (cached per element), line width INK_SIM.lineMm plus
   the spread, colour on the fill and black lines (watercolour and fill-less colour take colour lines). It is drawn into
   a small offscreen canvas in the zone's neutral millimetres (the body shape stretches the box across, so across is
   divided by the shape's wrap multiplier), then copied onto its island in bands that follow the zone's centre line, and
   clipped to the island: nothing is ever drawn across islands.
   Aging: INK_SIM.age(piece, years) gives blur, fade and spread (with the piece.heal grade from PR 5); spread widens the
   lines, fade lowers the alpha, blur softens the offscreen copy (canvas filter where the browser has it, else a downscale).
   dcCompose(list, shape) repaints only when the list or the shape changed (a signature check), never per frame.
   The stencil overlay (dcStencil) is a second, small canvas for one island, mapped onto that island's rect with the
   texture's offset/repeat, so dragging the stencil repaints a few hundred pixels and never the skin. ===== */
const DC_INK="#16120e";
const DC_STENCIL={light:"#6a3fc8",dark:"#cbb6ff",rl:5};   // the purple of the Session tab's flat stencil (app/session.js SE_STENCIL)
const DC={canvas:null,ctx:null,tex:null,size:0,sig:"",paths:{},filter:null,tmp:null,minPx:1.1,
  ov:{canvas:null,ctx:null,tex:null,isl:null,sig:"",size:512}};
function dcPath(id){
  let c=DC.paths[id];if(c)return c;
  const d=INK_SIM.elementById(id);if(!d)return null;
  try{c={d:new Path2D(d.path),f:d.fill?new Path2D(d.fill):null,b:INK_SIM.elementBox(id),def:d};}catch(e){return null;}
  return(DC.paths[id]=c);}
function dcFilterOk(){
  if(DC.filter==null){try{const c=document.createElement("canvas").getContext("2d");c.filter="blur(2px)";DC.filter=c.filter==="blur(2px)";}catch(e){DC.filter=false;}}
  return DC.filter;}
function dcInit(size,aniso,minPx){
  if(DC.canvas&&DC.size===size){DC.minPx=minPx||DC.minPx;return DC.tex;}
  if(DC.tex)DC.tex.dispose();
  const c=document.createElement("canvas");c.width=c.height=size;
  DC.canvas=c;DC.ctx=c.getContext("2d");DC.size=size;DC.sig="";DC.minPx=minPx||1.1;
  DC.ctx.fillStyle="#fff";DC.ctx.fillRect(0,0,size,size);
  DC.tex=new THREE.CanvasTexture(c);DC.tex.encoding=THREE.sRGBEncoding;DC.tex.anisotropy=aniso||1;
  return DC.tex;}
/* the elements of a design in placement-box millimetres for a body shape (app/session.js seEls, the same transform) */
function dcEls(d,box){const sz=d.sizeMm||50,pos=d.pos||{x:.5,y:.5},fp=INK_SIM.footprintOf(d);
  return(d.elements||[]).filter(e=>INK_SIM.elementById(e.id)).map(e=>({id:e.id,mx:pos.x*box.wrapMm+((e.x!=null?e.x:.5)-fp.cx)*sz,my:pos.y*box.lengthMm+((e.y!=null?e.y:.5)-fp.cy)*sz,
    mm:(e.scale!=null?e.scale:.5)*sz,rot:e.rot||0,lineWeight:e.lineWeight||7,fill:e.fill||0,colour:e.colour||null}));}
function dcHex(c){const C=INK_SIM.COLOURS[c||"black"];return C?C.hex:DC_INK;}
/* draw one piece onto a destination {ctx, ox, oy, ppx, clip:[x,y,w,h]} where (ox,oy) is the island's (xmin,ymin) in px.
   mode "ink" (aged) or "stencil" (purple lines, opts.colour) */
function dcDraw(dst,t,shape,mode,opts){
  const d=t&&t.design;if(!d||!Array.isArray(d.elements)||!d.elements.length)return false;
  const z=bdZone(d.placement);if(!z)return false;const I=BD.islands[z.isl];if(!I)return false;
  const box=INK_SIM.placementBox(d.placement,shape)||{wrapMm:z.W,lengthMm:z.L},m=box.wrapMm/z.W,ppx=dst.ppx;
  const els=dcEls(d,box);if(!els.length)return false;
  let ag={blur:0,fade:0,spread:0};
  if(mode==="ink")try{ag=INK_SIM.age(t,Math.max(0,t.years||0))||ag;}catch(e){}
  const pad=2+ag.spread+ag.blur*3;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const e of els){const r=e.mm*0.75;x0=Math.min(x0,e.mx-r);x1=Math.max(x1,e.mx+r);y0=Math.min(y0,e.my-r);y1=Math.max(y1,e.my+r);}
  const nx0=(x0-pad)/m,nx1=(x1+pad)/m,ny0=y0-pad,ny1=y1+pad;
  const cw=Math.max(2,Math.min(2048,Math.ceil((nx1-nx0)*ppx))),ch=Math.max(2,Math.min(2048,Math.ceil((ny1-ny0)*ppx)));
  const oc=document.createElement("canvas");oc.width=cw;oc.height=ch;const c=oc.getContext("2d");
  c.setTransform(ppx/m,0,0,ppx,-nx0*ppx,-ny0*ppx);c.lineCap="round";c.lineJoin="round";
  const minMm=(opts&&opts.minPx||DC.minPx)/(ppx/Math.max(m,1));
  for(const e of els){const P=dcPath(e.id);if(!P)continue;const b=P.b,k=e.mm/Math.max(b.w,b.h,1e-6);
    c.save();c.translate(e.mx,e.my);c.rotate(e.rot*Math.PI/180);c.scale(k,k);c.translate(-(b.x+b.w/2),-(b.y+b.h/2));
    if(mode==="stencil"){c.strokeStyle=opts.colour;c.lineWidth=Math.max(INK_SIM.lineMm(DC_STENCIL.rl),minMm)/k;c.globalAlpha=0.85;c.stroke(P.d);}
    else{const fc=e.colour?dcHex(e.colour):DC_INK,lc=e.colour&&(d.style==="watercolour"||!(e.fill>0))?fc:DC_INK;
      if(P.f&&e.fill>0){c.globalAlpha=bdClamp(e.fill,0,1);c.fillStyle=fc;c.fill(P.f);c.globalAlpha=1;}
      c.strokeStyle=lc;c.lineWidth=Math.max(INK_SIM.lineMm(e.lineWeight)+ag.spread,minMm)/k;c.stroke(P.d);}
    c.restore();}
  /* aging blur */
  let src=oc;const bpx=ag.blur*ppx;
  if(mode==="ink"&&bpx>0.45){const t2=document.createElement("canvas");t2.width=cw;t2.height=ch;const c2=t2.getContext("2d");
    if(dcFilterOk()){c2.filter=`blur(${Math.min(12,bpx).toFixed(2)}px)`;c2.drawImage(oc,0,0);}
    else{const f=1/(1+Math.min(8,bpx)*0.8),sw=Math.max(1,Math.round(cw*f)),sh=Math.max(1,Math.round(ch*f)),t3=document.createElement("canvas");t3.width=sw;t3.height=sh;
      const c3=t3.getContext("2d");c3.imageSmoothingEnabled=true;c3.drawImage(oc,0,0,sw,sh);c2.imageSmoothingEnabled=true;c2.drawImage(t3,0,0,cw,ch);}
    src=t2;}
  /* copy onto the island along the zone's centre line, clipped to the island */
  const g=dst.ctx;g.save();g.beginPath();g.rect(dst.clip[0],dst.clip[1],dst.clip[2],dst.clip[3]);g.clip();
  g.globalAlpha=mode==="ink"?bdClamp(1-ag.fade,0.05,1):1;
  const dxAt=y=>dst.ox+(bdZoneX(z,y)-z.W/2+nx0-I.xmin)*ppx,dy0=dst.oy+(z.y0+ny0-I.ymin)*ppx;
  if(z.flat)g.drawImage(src,dxAt(0),dy0);
  else for(let py=0;py<ch;py+=3){const h=Math.min(3,ch-py);g.drawImage(src,0,py,cw,h,dxAt(z.y0+ny0+(py+h/2)/ppx),dy0+py,cw,h);}
  g.restore();return true;}
/* repaint the skin with these pieces: [{design, out, heal, ink, years, skinTone, sun}] */
function dcCompose(list,shape){
  if(!DC.ctx)return false;bdBuild();
  const sig=JSON.stringify([shape,DC.size,(list||[]).map(t=>[t.design,t.out||null,t.heal||null,t.ink||null,Math.round((t.years||0)*10)/10,t.skinTone,t.sun])]);
  if(sig===DC.sig)return false;DC.sig=sig;
  const g=DC.ctx,S0=DC.size;g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.fillStyle="#fff";g.fillRect(0,0,S0,S0);
  for(const t of list||[]){const z=t&&t.design&&bdZone(t.design.placement);if(!z)continue;const I=BD.islands[z.isl],r=I.rect;
    try{dcDraw({ctx:g,ox:r.x*S0,oy:r.y*S0,ppx:I.ppm*S0,clip:[r.x*S0,r.y*S0,r.w*S0,r.h*S0]},t,shape,"ink");}catch(e){}}
  DC.tex.needsUpdate=true;return true;}
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
