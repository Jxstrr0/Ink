/* ===== sim/placements.js: PLACEMENTS (every allowed zone) and BODY_SHAPES (PR 1) =====
   Where a tattoo can go, and what each spot is like. Allowed zones only: arms (forearm incl. the inner wrist area, upper
   arm), shoulders, hands, legs (thigh, calf, shin), feet, back (upper, full), upper chest (left, right, sternum),
   ribs/side (left and right, the most painful spot in the table) and neck (side, nape). Nothing else.

   Each placement is a flat box the design board sits on: x runs ACROSS the body part (its usable width, wrapMm, the face
   you can see before it turns round the side), y runs ALONG it (lengthMm, down the board: shoulder to wrist, hip to
   ankle, neck to waist, ankle to toes, wrist to knuckles). Sizes are for an average adult; BODY_SHAPES scale the width.
     pain, visibility, sun   0..1 (how much it hurts, how hard it is to cover, how much daylight it gets)
     crease                  the main joint the box ends at, {at: 0..1 position, axis, name}; axis "x" means the crease
                             line runs across the box at y=at (every crease here does). creases lists every joint at the box's
                             ends (the forearm has the elbow AND the wrist); crease is creases[0]
     flowDeg                 the main flow direction: 0 = along the limb (down the board), 90 = across it. Angles turn
                             clockwise like an element's rot, so a line heading down and towards +x is negative
     flow                    2..5 polylines in the 0..1 box tracing how the muscle and bone run; design.js reads the local
                             direction from the nearest one (the ribs lines bow round the ribcage)
     curve                   0..1 how much the surface wraps away (ribs and shoulder cap high, upper back low)
   Paired zones are written once (as the left side) and mirrored for the right by plPair(); the island gets the side
   suffix when ISLANDS has one (arm_l), else stays shared (both sides of the neck are on "neck"). ===== */

/* the UV islands the 3D body unwraps into (PR 6); every placement lives on exactly one */
const ISLANDS=["arm_l","arm_r","leg_l","leg_r","back","chest","side_l","side_r","neck","hand_l","hand_r","foot_l","foot_r"];

/* wrap width multipliers per region: a bigger arm has more room before the design turns the corner. The 3D mannequin
   (vis/body.js) takes its limb and torso girth from these same numbers. 0.1.12.0 pushed Broad and Slight further apart
   (they were 1.14 / 0.88 on the arm) so the three builds read at a glance; the ids stay masc / femme for old saves */
const BODY_SHAPES={
  masc:{name:"Broad",wrap:{arm:1.24,leg:1.14,back:1.18,chest:1.18,side:1.10,neck:1.16,hand:1.12,foot:1.08,shoulder:1.24}},
  femme:{name:"Slight",wrap:{arm:0.82,leg:0.90,back:0.86,chest:0.88,side:0.90,neck:0.88,hand:0.88,foot:0.92,shoulder:0.84}},
  neutral:{name:"Average",wrap:{arm:1,leg:1,back:1,chest:1,side:1,neck:1,hand:1,foot:1,shoulder:1}}
};

/* the zones. Left-side numbers; plPair mirrors them. island is the base name (+"_l"/"_r" for pairs) */
const PLACEMENT_BASE=[
  {id:"forearm",name:"forearm",region:"arm",island:"arm",wrapMm:100,lengthMm:240,pain:0.30,visibility:0.80,sun:0.75,curve:0.55,flowDeg:0,
    creases:[{at:0.03,axis:"x",name:"elbow"},{at:0.97,axis:"x",name:"wrist"}],
    flow:[[[0.22,0],[0.20,0.5],[0.28,1]],[[0.5,0],[0.5,0.5],[0.52,1]],[[0.78,0],[0.80,0.5],[0.74,1]]]},
  {id:"upperarm",name:"upper arm",region:"arm",island:"arm",wrapMm:120,lengthMm:250,pain:0.25,visibility:0.40,sun:0.50,curve:0.55,flowDeg:0,
    creases:[{at:0.97,axis:"x",name:"elbow"}],
    flow:[[[0.25,0],[0.22,0.5],[0.26,1]],[[0.5,0],[0.5,0.5],[0.5,1]],[[0.75,0],[0.78,0.5],[0.74,1]]]},
  {id:"shoulder",name:"shoulder",region:"shoulder",island:"arm",wrapMm:140,lengthMm:150,pain:0.30,visibility:0.35,sun:0.60,curve:0.75,flowDeg:0,
    creases:[],
    flow:[[[0.5,0],[0.5,0.5],[0.5,1]],[[0.3,0.05],[0.2,0.5],[0.25,1]],[[0.7,0.05],[0.8,0.5],[0.75,1]],[[0.1,0.3],[0.5,0.15],[0.9,0.3]]]},
  {id:"hand",name:"hand",region:"hand",island:"hand",wrapMm:80,lengthMm:85,pain:0.80,visibility:1.00,sun:0.90,curve:0.35,flowDeg:0,
    creases:[{at:0.03,axis:"x",name:"wrist"}],
    flow:[[[0.3,0],[0.22,0.5],[0.12,1]],[[0.5,0],[0.45,0.5],[0.4,1]],[[0.65,0],[0.7,0.5],[0.7,1]],[[0.8,0],[0.9,0.5],[0.98,1]]]},
  {id:"thigh",name:"thigh",region:"leg",island:"leg",wrapMm:190,lengthMm:360,pain:0.35,visibility:0.20,sun:0.20,curve:0.45,flowDeg:0,
    creases:[{at:0.97,axis:"x",name:"knee"}],
    flow:[[[0.25,0],[0.2,0.5],[0.3,1]],[[0.5,0],[0.5,0.5],[0.5,1]],[[0.75,0],[0.8,0.5],[0.7,1]]]},
  {id:"calf",name:"calf",region:"leg",island:"leg",wrapMm:140,lengthMm:280,pain:0.40,visibility:0.50,sun:0.50,curve:0.55,flowDeg:0,
    creases:[{at:0.03,axis:"x",name:"knee"}],
    flow:[[[0.25,0],[0.15,0.4],[0.32,1]],[[0.5,0],[0.5,0.4],[0.5,1]],[[0.75,0],[0.85,0.4],[0.68,1]]]},
  {id:"shin",name:"shin",region:"leg",island:"leg",wrapMm:85,lengthMm:290,pain:0.75,visibility:0.50,sun:0.50,curve:0.40,flowDeg:0,
    creases:[{at:0.03,axis:"x",name:"knee"},{at:0.97,axis:"x",name:"ankle"}],
    flow:[[[0.3,0],[0.32,0.5],[0.35,1]],[[0.5,0],[0.5,0.5],[0.5,1]],[[0.7,0],[0.68,0.5],[0.65,1]]]},
  {id:"foot",name:"foot",region:"foot",island:"foot",wrapMm:85,lengthMm:120,pain:0.85,visibility:0.50,sun:0.55,curve:0.50,flowDeg:0,
    creases:[{at:0.03,axis:"x",name:"ankle"}],
    flow:[[[0.35,0],[0.3,0.5],[0.2,1]],[[0.5,0],[0.5,0.5],[0.5,1]],[[0.65,0],[0.72,0.5],[0.82,1]]]},
  /* the ribs: the most painful spot, and the flow bows round the ribcage, tilting forward lower down */
  {id:"ribs",name:"ribs",region:"side",island:"side",wrapMm:160,lengthMm:300,pain:0.95,visibility:0.10,sun:0.15,curve:0.80,flowDeg:-15,
    creases:[],
    flow:[[[0.18,0],[0.2,0.3],[0.3,0.6],[0.45,0.88],[0.52,1]],[[0.42,0],[0.44,0.28],[0.52,0.55],[0.66,0.82],[0.76,1]],
          [[0.68,0],[0.7,0.25],[0.78,0.5],[0.9,0.75],[1,0.9]],[[0.05,0.25],[0.1,0.55],[0.2,0.85],[0.28,1]]]},
  {id:"neck",name:"side of the neck",region:"neck",island:"neck",wrapMm:75,lengthMm:110,pain:0.70,visibility:0.95,sun:0.75,curve:0.60,flowDeg:-10,
    creases:[],
    flow:[[[0.3,0],[0.32,0.5],[0.42,1]],[[0.55,0],[0.6,0.5],[0.7,1]],[[0.8,0],[0.85,0.5],[0.95,1]]]}
];
/* the single zones (no left/right) */
const PLACEMENT_SINGLE=[
  {id:"upperback",name:"upper back",region:"back",side:null,island:"back",wrapMm:380,lengthMm:240,pain:0.40,visibility:0.15,sun:0.35,curve:0.20,flowDeg:90,
    creases:[],
    flow:[[[0,0.2],[0.25,0.12],[0.5,0.15],[0.75,0.12],[1,0.2]],[[0,0.55],[0.25,0.45],[0.5,0.5],[0.75,0.45],[1,0.55]],
          [[0.05,0.9],[0.3,0.8],[0.5,0.85],[0.7,0.8],[0.95,0.9]],[[0.5,0],[0.5,0.5],[0.5,1]]]},
  {id:"fullback",name:"full back",region:"back",side:null,island:"back",wrapMm:400,lengthMm:600,pain:0.60,visibility:0.15,sun:0.30,curve:0.25,flowDeg:0,
    creases:[],
    flow:[[[0.5,0],[0.5,0.5],[0.5,1]],[[0.2,0],[0.12,0.35],[0.25,0.75],[0.3,1]],[[0.8,0],[0.88,0.35],[0.75,0.75],[0.7,1]],
          [[0.05,0.15],[0.5,0.08],[0.95,0.15]]]},
  {id:"chest_l",name:"left chest",region:"chest",side:"l",island:"chest",wrapMm:160,lengthMm:140,pain:0.55,visibility:0.30,sun:0.30,curve:0.35,flowDeg:90,
    creases:[],
    flow:[[[0,0.3],[0.4,0.2],[0.75,0.15],[1,0.05]],[[0,0.6],[0.4,0.5],[0.75,0.42],[1,0.3]],[[0.05,0.92],[0.45,0.82],[0.8,0.7],[1,0.6]]]},
  {id:"chest_r",name:"right chest",region:"chest",side:"r",island:"chest",wrapMm:160,lengthMm:140,pain:0.55,visibility:0.30,sun:0.30,curve:0.35,flowDeg:90,
    creases:[],
    flow:[[[1,0.3],[0.6,0.2],[0.25,0.15],[0,0.05]],[[1,0.6],[0.6,0.5],[0.25,0.42],[0,0.3]],[[0.95,0.92],[0.55,0.82],[0.2,0.7],[0,0.6]]]},
  {id:"sternum",name:"sternum",region:"chest",side:null,island:"chest",wrapMm:90,lengthMm:180,pain:0.85,visibility:0.35,sun:0.30,curve:0.30,flowDeg:0,
    creases:[],
    flow:[[[0.5,0],[0.5,0.5],[0.5,1]],[[0.2,0],[0.25,0.5],[0.35,1]],[[0.8,0],[0.75,0.5],[0.65,1]]]},
  {id:"nape",name:"nape",region:"neck",side:null,island:"neck",wrapMm:90,lengthMm:90,pain:0.55,visibility:0.60,sun:0.70,curve:0.40,flowDeg:0,
    creases:[],
    flow:[[[0.5,0],[0.5,0.5],[0.5,1]],[[0.25,0],[0.22,0.5],[0.3,1]],[[0.75,0],[0.78,0.5],[0.7,1]]]}
];

/* build the left and right versions of a paired zone (the right side mirrors x and the flow angle) */
function plPair(b){
  const out={};
  for(const side of ["l","r"]){
    const m=side==="r";
    const flow=b.flow.map(line=>line.map(p=>[m?+(1-p[0]).toFixed(3):p[0],p[1]]));
    const creases=b.creases.map(c=>Object.assign({},c));
    out[b.id+"_"+side]=Object.assign({},b,{id:b.id+"_"+side,name:(side==="l"?"left ":"right ")+b.name,side,island:ISLANDS.indexOf(b.island+"_"+side)>=0?b.island+"_"+side:b.island,
      flowDeg:m?-b.flowDeg:b.flowDeg,flow,creases,crease:creases[0]||null});
  }
  return out;
}
const PLACEMENTS={};
for(const b of PLACEMENT_BASE)Object.assign(PLACEMENTS,plPair(b));
for(const b of PLACEMENT_SINGLE)PLACEMENTS[b.id]=Object.assign({},b,{crease:b.creases[0]||null});

/* the usable box for a placement on a body shape: width scaled by the shape's region multiplier, length as is */
function placementBox(placementId,bodyShape){
  const p=PLACEMENTS[placementId];if(!p)return null;
  const sh=BODY_SHAPES[bodyShape]||BODY_SHAPES.neutral;
  return{wrapMm:Math.round(p.wrapMm*(sh.wrap[p.region]||1)),lengthMm:p.lengthMm};
}
SIM.PLACEMENTS=PLACEMENTS;SIM.ISLANDS=ISLANDS;SIM.BODY_SHAPES=BODY_SHAPES;SIM.placementBox=placementBox;
