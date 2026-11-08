/* ===== sim/flash.js: FLASH, the pre-composed designs on the shop's flash wall (PR 2). Data only. =====
   Each entry is a design in the shape docs/SIM-CONTRACT.md gives ("A design"), plus an id, a name and a note. The board
   loads one onto the client's placement; scoreDesign gives it FLASH_DISCOUNT (design.flash set) because the drawing and
   the stencil already exist. The artist's own saved designs (S.flash, app/design.js) join the wall over time.
   Every element id must exist in ELEMENTS and every placement in PLACEMENTS (tools/sim-test.js checks). ===== */
const FLASH=[
  {id:"fl_sailor_rose",name:"Sailor's rose",note:"A red rose with green leaves over a banner. The first thing on every wall.",placement:"forearm_l",style:"traditional",sizeMm:95,
    elements:[{id:"rose_trad",x:.5,y:.36,scale:.62,rot:0,lineWeight:9,fill:.75,colour:"red"},
              {id:"banner_scroll",x:.5,y:.8,scale:.95,rot:0,lineWeight:9,fill:.35,colour:"yellow"}]},
  {id:"fl_swallows",name:"Swallow pair",note:"Two swallows facing each other: home and back again.",placement:"chest_l",style:"traditional",sizeMm:120,
    elements:[{id:"swallow",x:.26,y:.5,scale:.48,rot:-12,lineWeight:9,fill:.7,colour:"blue"},
              {id:"swallow",x:.74,y:.5,scale:.48,rot:12,lineWeight:9,fill:.7,colour:"blue"}]},
  {id:"fl_anchor_heart",name:"Anchor and heart",note:"Steady and true. Bold enough to read across a bar.",placement:"forearm_r",style:"traditional",sizeMm:90,
    elements:[{id:"anchor",x:.5,y:.45,scale:.85,rot:0,lineWeight:9,fill:.6,colour:"green"},
              {id:"heart_trad",x:.5,y:.32,scale:.34,rot:0,lineWeight:9,fill:.85,colour:"red"}]},
  {id:"fl_dagger_heart",name:"Dagger and heart",note:"Courage, and what it costs.",placement:"upperarm_l",style:"traditional",sizeMm:110,
    elements:[{id:"heart_trad",x:.5,y:.5,scale:.48,rot:0,lineWeight:9,fill:.85,colour:"red"},
              {id:"dagger",x:.5,y:.5,scale:.95,rot:0,lineWeight:9,fill:.4,colour:"teal"}]},
  {id:"fl_compass",name:"Compass and star",note:"For the travellers. Geometric enough for the modern crowd.",placement:"upperarm_r",style:"traditional",sizeMm:85,
    elements:[{id:"compass_rose",x:.5,y:.5,scale:.88,rot:0,lineWeight:7,fill:.4,colour:null},
              {id:"nautical_star",x:.86,y:.14,scale:.24,rot:0,lineWeight:9,fill:.8,colour:"red"}]},
  {id:"fl_sprig",name:"Fern sprig",note:"A fine-line sprig with a sparkle. Small, quick, popular.",placement:"forearm_l",style:"fineline",sizeMm:70,
    elements:[{id:"fern",x:.5,y:.5,scale:.95,rot:-8,lineWeight:3,fill:0,colour:null},
              {id:"sparkle",x:.8,y:.18,scale:.2,rot:0,lineWeight:3,fill:0,colour:null}]},
  {id:"fl_moon",name:"Moon and stars",note:"Crescent moon with two sparkles. A first tattoo for the inner wrist.",placement:"forearm_r",style:"fineline",sizeMm:50,
    elements:[{id:"moon_crescent",x:.42,y:.55,scale:.7,rot:0,lineWeight:3,fill:0,colour:null},
              {id:"sparkle",x:.82,y:.2,scale:.3,rot:0,lineWeight:3,fill:0,colour:null},
              {id:"sparkle",x:.84,y:.62,scale:.18,rot:0,lineWeight:3,fill:0,colour:null}]},
  {id:"fl_peaks",name:"Mountain line",note:"Peaks, a pine and the river. Fine-line landscape for the hikers.",placement:"calf_l",style:"fineline",sizeMm:80,
    elements:[{id:"mountains",x:.5,y:.42,scale:1,rot:0,lineWeight:3,fill:0,colour:null},
              {id:"pine_tree",x:.22,y:.6,scale:.32,rot:0,lineWeight:5,fill:0,colour:null},
              {id:"river",x:.6,y:.8,scale:.6,rot:90,lineWeight:3,fill:0,colour:null}]},
  {id:"fl_wave",name:"Great wave",note:"A bold breaking wave. Japanese, built to hold for decades.",placement:"calf_r",style:"japanese",sizeMm:130,
    elements:[{id:"big_wave",x:.5,y:.55,scale:.95,rot:0,lineWeight:11,fill:.65,colour:"blue"},
              {id:"wave_curl",x:.22,y:.2,scale:.34,rot:0,lineWeight:7,fill:.4,colour:"blue"}]},
  {id:"fl_band",name:"Linework band",note:"Clean lines round the arm. Wraps, so it ignores the wrap width.",placement:"forearm_l",style:"blackwork",sizeMm:100,
    elements:[{id:"band_lines",x:.5,y:.5,scale:1,rot:0,lineWeight:5,fill:.5,colour:null}]},
  {id:"fl_hummingbird",name:"Hummingbird",note:"A hummingbird on a soft wash. Pretty now; touch it up later.",placement:"shoulder_l",style:"watercolour",sizeMm:85,
    elements:[{id:"fill_wash",x:.55,y:.55,scale:.85,rot:20,lineWeight:1,fill:.45,colour:"pink"},
              {id:"hummingbird",x:.48,y:.45,scale:.8,rot:-10,lineWeight:5,fill:.6,colour:"teal"}]},
  {id:"fl_bold_rose",name:"Blackwork rose",note:"A solid black rose. Reads on every skin tone, ages like a brick.",placement:"thigh_l",style:"blackwork",sizeMm:110,
    elements:[{id:"rose_bold",x:.5,y:.5,scale:.95,rot:0,lineWeight:9,fill:1,colour:null}]},
  {id:"fl_love_banner",name:"Love banner",note:"A heart with the word across it. Make the word big enough or it closes up.",placement:"upperarm_l",style:"traditional",sizeMm:90,
    elements:[{id:"heart_trad",x:.5,y:.42,scale:.7,rot:0,lineWeight:9,fill:.85,colour:"red"},
              {id:"script_love",x:.5,y:.72,scale:.75,rot:0,lineWeight:5,fill:0,colour:null}]}
];
SIM.FLASH=FLASH;
