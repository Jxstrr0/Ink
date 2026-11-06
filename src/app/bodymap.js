/* ===================== app/bodymap.js: the body diagram on the Design tab (PR 2) =====================
   An original front/back drawing of the neutral, stylized mannequin (smooth capsule limbs, no face, no anatomical detail),
   dressed in a crop top and shorts so the ribs/side are bare. Drawn for Ink; no traced art.
     bmSvg(view, sel, shape, tone) -> SVG string. view "front" | "back", sel = the selected PLACEMENTS id, shape = a
       BODY_SHAPES id (changes the shoulders, waist, hips and limb thickness), tone 0..1 (tints the skin).
   Every PLACEMENTS id has a tappable zone on one or both views (<g class="bmz" data-p="forearm_l" tabindex="0">); the
   Design tab wires the taps and the keyboard. The front view shows the figure's left on the viewer's right; the back view
   shows it on the viewer's left. Geometry is in a 200 x 420 box. */
/* zones drawn on one view only (the rest are on both) */
const BM_BACK_ONLY=/^(upperback|fullback|nape|calf_[lr])$/,BM_FRONT_ONLY=/^(shin_[lr]|foot_[lr]|neck_[lr]|ribs_[lr]|chest_[lr]|sternum)$/;
const BM_SHAPES={masc:{sh:52,wa:33,hp:30,lm:1.12},femme:{sh:44,wa:28,hp:34,lm:0.9},neutral:{sh:48,wa:31,hp:32,lm:1}};
/* skin tint stops for tone 0..1 (fill, outline) */
const BM_SKIN=[[0,"#f5dcc5","#b48a6c"],[0.33,"#dba57c","#9c6c4a"],[0.66,"#9b6442","#5f3a24"],[1,"#4d2f21","#24150d"]];
const BM_CLOTH={top:"#5e6e6b",shorts:"#3d4350",seam:"rgba(0,0,0,.25)"};
function bmMix(a,b,t){const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const A=p(a),B=p(b);
  return"#"+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,"0")).join("");}
function bmSkin(tone){tone=clamp(+tone||0,0,1);
  for(let i=1;i<BM_SKIN.length;i++)if(tone<=BM_SKIN[i][0]){const a=BM_SKIN[i-1],b=BM_SKIN[i],t=(tone-a[0])/(b[0]-a[0]);return[bmMix(a[1],b[1],t),bmMix(a[2],b[2],t)];}
  return[BM_SKIN[3][1],BM_SKIN[3][2]];}
const bmN=v=>Math.round(v*10)/10;
/* a smooth closed outline through points (Catmull-Rom as cubic Beziers) */
function bmSmooth(ps){
  const n=ps.length,P=i=>ps[(i+n)%n];let d="M"+bmN(ps[0][0])+" "+bmN(ps[0][1]);
  for(let i=0;i<n;i++){const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);
    d+="C"+[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6,p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6,p2[0],p2[1]].map(bmN).join(" ");}
  return d+"Z";}
/* the figure's joints for a shape; g = +1 draws on the viewer's right, -1 on the left */
function bmPts(k){const c={};
  c.S=g=>[100+g*(k.sh-4),88];c.E=g=>[100+g*(k.sh+9),160];c.W=g=>[100+g*(k.sh+19),226];c.H=g=>[100+g*(k.sh+24),256];
  c.Hip=g=>[100+g*k.hp*0.55,236];c.K=g=>[100+g*k.hp*0.6,318];c.A=g=>[100+g*k.hp*0.64,390];c.T=g=>[100+g*k.hp*0.7,404];
  return c;}
function bmTorso(k){
  const R=[[10,66],[k.sh*0.72,75],[k.sh+2,86],[k.sh-9,112],[k.wa+7,142],[k.wa,186],[k.hp+2,222],[k.hp-3,246],[5,254]];
  const pts=R.map(p=>[100+p[0],p[1]]).concat(R.slice().reverse().map(p=>[100-p[0],p[1]]));
  return bmSmooth(pts);}
const bmLine=(a,b)=>`M${bmN(a[0])} ${bmN(a[1])}L${bmN(b[0])} ${bmN(b[1])}`;
function bmSvg(view,sel,shape,tone){
  const k=BM_SHAPES[shape]||BM_SHAPES.neutral,c=bmPts(k),fr=view!=="back",[skin,edge]=bmSkin(tone);
  const W={up:22*k.lm,fo:17.5*k.lm,ha:14*k.lm,th:34*k.lm,sh:23*k.lm,ft:15*k.lm};
  const torso=bmTorso(k);
  /* limbs as round-capped strokes: [from, to, width] for both sides */
  const limbs=[];
  for(const g of [-1,1]){limbs.push([c.S(g),c.E(g),W.up],[c.E(g),c.W(g),W.fo],[c.W(g),c.H(g),W.ha],[c.Hip(g),c.K(g),W.th],[c.K(g),c.A(g),W.sh],[c.A(g),c.T(g),W.ft]);}
  let h=`<svg class="bm" viewBox="0 0 200 420" role="group" aria-label="${fr?"Front":"Back"} of the body: tap a spot to tattoo">
<defs><clipPath id="bmClip${fr?"F":"B"}"><path d="${torso}"/></clipPath></defs>
<g class="bmFig">`;
  /* outline pass, then the skin */
  h+=`<g fill="none" stroke="${edge}" stroke-linecap="round">${limbs.map(l=>`<path d="${bmLine(l[0],l[1])}" stroke-width="${bmN(l[2]+2.4)}"/>`).join("")}</g>`;
  h+=`<rect x="${100-9*k.lm}" y="46" width="${18*k.lm}" height="30" rx="6" fill="${skin}" stroke="${edge}" stroke-width="1.2"/>`;
  h+=`<path d="${torso}" fill="${skin}" stroke="${edge}" stroke-width="1.2"/>`;
  h+=`<g fill="none" stroke="${skin}" stroke-linecap="round">${limbs.map(l=>`<path d="${bmLine(l[0],l[1])}" stroke-width="${bmN(l[2])}"/>`).join("")}</g>`;
  h+=`<ellipse cx="100" cy="30" rx="18" ry="22" fill="${skin}" stroke="${edge}" stroke-width="1.2"/>`;
  /* soft joints, so it reads as a mannequin */
  h+=`<g fill="none" stroke="${edge}" stroke-opacity=".35" stroke-width=".9">${[-1,1].map(g=>{const e=c.E(g),kn=c.K(g);return`<circle cx="${bmN(e[0])}" cy="${bmN(e[1])}" r="${bmN(W.fo*0.42)}"/><circle cx="${bmN(kn[0])}" cy="${bmN(kn[1])}" r="${bmN(W.sh*0.45)}"/>`;}).join("")}</g>`;
  /* clothes: crop top (scooped at the front) and shorts, clipped to the body */
  const clip=`clip-path="url(#bmClip${fr?"F":"B"})"`;
  const top=fr?`M40 102L86 102Q100 116 114 102L160 102L160 146L40 146Z`:`M40 100L160 100L160 140L40 140Z`;
  h+=`<g ${clip}><path d="${top}" fill="${BM_CLOTH.top}"/>`;
  for(const g of [-1,1])h+=`<path d="${bmLine([100+g*k.sh*0.42,70],[100+g*k.sh*0.56,104])}" stroke="${BM_CLOTH.top}" stroke-width="7" stroke-linecap="round"/>`;
  h+=`<rect x="20" y="212" width="160" height="50" fill="${BM_CLOTH.shorts}"/></g>`;
  for(const g of [-1,1]){const a=c.Hip(g),b=[a[0]+g*0.6,262];h+=`<path d="${bmLine(a,b)}" stroke="${BM_CLOTH.shorts}" stroke-width="${bmN(W.th+2.6)}" stroke-linecap="butt"/>`;}
  h+=`<path d="M100 214L100 ${fr?236:244}" stroke="${BM_CLOTH.seam}" stroke-width="1"/>`;
  /* quiet cues: collarbones at the front, the spine at the back */
  h+=fr?`<path d="M94 79Q${100-k.sh*0.4} 76 ${100-k.sh*0.75} 82M106 79Q${100+k.sh*0.4} 76 ${100+k.sh*0.75} 82" fill="none" stroke="${edge}" stroke-opacity=".45" stroke-width=".9"/>`
       :`<path d="M100 78L100 100M100 140L100 206" fill="none" stroke="${edge}" stroke-opacity=".35" stroke-width=".9"/>`;
  h+=`</g>`;
  /* ---- the zones ---- */
  const zs=[];
  const Z=(id,inner)=>{const p=INK_SIM.PLACEMENTS[id];if(!p)return;zs.push(`<g class="bmz${id===sel?" on":""}" data-p="${id}" tabindex="0" role="button" aria-pressed="${id===sel}" aria-label="${esc(p.name)}">${inner}</g>`);};
  const strokeZ=(a,b,w)=>`<path class="s" d="${bmLine(a,b)}" stroke-width="${bmN(w)}"/>`;
  const fillZ=(d,cl)=>`<path class="f" d="${d}"${cl?" "+clip:""}/>`;
  const rect=(x,y,w,hh,r)=>`M${bmN(x+r)} ${bmN(y)}H${bmN(x+w-r)}Q${bmN(x+w)} ${bmN(y)} ${bmN(x+w)} ${bmN(y+r)}V${bmN(y+hh-r)}Q${bmN(x+w)} ${bmN(y+hh)} ${bmN(x+w-r)} ${bmN(y+hh)}H${bmN(x+r)}Q${bmN(x)} ${bmN(y+hh)} ${bmN(x)} ${bmN(y+hh-r)}V${bmN(y+r)}Q${bmN(x)} ${bmN(y)} ${bmN(x+r)} ${bmN(y)}Z`;
  if(!fr){
    Z("fullback",fillZ(rect(30,80,140,170,8),true));
    Z("upperback",fillZ(rect(30,80,140,64,8),true));
    Z("nape",fillZ(rect(100-9*k.lm,46,18*k.lm,30,6)));
  }
  for(const s of ["l","r"]){
    const g=fr?(s==="l"?1:-1):(s==="l"?-1:1);
    Z("upperarm_"+s,strokeZ(c.S(g),c.E(g),W.up));
    Z("forearm_"+s,strokeZ(c.E(g),c.W(g),W.fo));
    Z("hand_"+s,strokeZ(c.W(g),c.H(g),W.ha));
    const S=c.S(g);Z("shoulder_"+s,`<circle class="f" cx="${bmN(S[0]+g*2)}" cy="${bmN(S[1]-1)}" r="${bmN(12*k.lm)}"/>`);
    const hp=c.Hip(g),kn=c.K(g);
    Z("thigh_"+s,strokeZ([hp[0]+g*0.6,fr?268:266],[kn[0],kn[1]-14],W.th-2));
    if(fr){
      Z("shin_"+s,strokeZ([kn[0],kn[1]+10],c.A(g),W.sh));
      Z("foot_"+s,strokeZ(c.A(g),c.T(g),W.ft));
      Z("neck_"+s,fillZ(g>0?rect(100,48,9*k.lm,26,3):rect(100-9*k.lm,48,9*k.lm,26,3)));
      Z("ribs_"+s,fillZ(bmSmooth([[100+g*(k.sh-11),114],[100+g*(k.wa+6),144],[100+g*(k.wa-1),190],[100+g*(k.wa-12),188],[100+g*(k.wa-6),146],[100+g*(k.sh-22),118]]),true));
    }else{
      Z("calf_"+s,strokeZ([kn[0],kn[1]+10],c.A(g),W.sh));
    }
  }
  if(fr){
    for(const s of ["l","r"]){const g=s==="l"?1:-1;Z("chest_"+s,fillZ(g>0?rect(101,80,k.sh-12,30,8):rect(100-(k.sh-11),80,k.sh-12,30,8),true));}
    Z("sternum",fillZ(rect(93,96,14,62,6)));
  }
  h+=`<g class="bmZones">${zs.join("")}</g>`;
  h+=`<text class="bmLbl" x="100" y="418" text-anchor="middle">${fr?"FRONT":"BACK"}</text></svg>`;
  return h;}
