/* ===================== app/design.js: the Design tab =====================
   PR 1 (text only): a sample piece is scored against a sample client and the raw score object is shown, so the sim can be
   checked on a phone. Pick a placement, a size and a client to see the numbers move. The real design board (body diagram,
   cream board, element drawer, live deltas, stress report, flash wall) replaces this in PR 2. */
const DZ_SAMPLE_CLIENTS=[
  {id:"t1",name:"Office worker, light skin",pronouns:"she/her",age:29,bodyShape:"femme",skinTone:.15,job:"accountant",
   traits:{pain:.4,sun:.2,aftercare:.8,budget:.6,loyalty:.6,talkative:.5,trusting:.6},
   wants:{styles:{traditional:1,neotrad:.6},tags:["nature"],sizeMm:[60,120],colour:.7},mustHaves:[],dealbreakers:[]},
  {id:"t2",name:"Roofer, dark skin, outdoors",pronouns:"he/him",age:41,bodyShape:"masc",skinTone:.85,job:"roofer",
   traits:{pain:.8,sun:.9,aftercare:.4,budget:.4,loyalty:.7,talkative:.3,trusting:.5},
   wants:{styles:{blackwork:1,traditional:.7},tags:[],sizeMm:[80,200],colour:.2},mustHaves:[],dealbreakers:[{kind:"colour",v:"yellow"}]}
];
const DZ={placement:null,size:90,client:0,colour:"red"};
function dzSampleDesign(){
  const E=INK_SIM.ELEMENTS||[],P=INK_SIM.PLACEMENTS||{};
  const pick=(fam,style)=>E.find(e=>e.family===fam&&e.styles.includes(style))||E.find(e=>e.family===fam)||E[0];
  const motif=pick("motif","traditional"),word=pick("lettering","lettering");
  if(!DZ.placement)DZ.placement=P.forearm_l?"forearm_l":Object.keys(P)[0];
  const els=[];
  if(motif)els.push({id:motif.id,x:.5,y:.4,scale:.7,rot:0,lineWeight:motif.lineWeightDefault,fill:.5,colour:DZ.colour});
  if(word)els.push({id:word.id,x:.5,y:.85,scale:.6,rot:0,lineWeight:word.lineWeightDefault,fill:0,colour:null});
  return{placement:DZ.placement,sizeMm:DZ.size,style:"traditional",elements:els};}
function renderDesign(){
  const P=INK_SIM.PLACEMENTS||{},ready=typeof INK_SIM.scoreDesign==="function";
  let out="The scoring model isn't in this build yet.";
  const d=ready?dzSampleDesign():null;
  if(ready){try{out=JSON.stringify(INK_SIM.scoreDesign(d,DZ_SAMPLE_CLIENTS[DZ.client],S.skills,{year:S.year}),(k,v)=>typeof v==="number"?Math.round(v*1000)/1000:v,2);}catch(e){out="scoreDesign threw: "+e.message;}}
  const opt=(v,l,cur)=>`<option value="${esc(v)}"${String(v)===String(cur)?" selected":""}>${esc(l)}</option>`;
  $("designBody").innerHTML=`<div class="card"><h2>Design board</h2>
<p class="hint" style="margin-top:0">The real board arrives next. For now: a sample piece scored by the sim. Change the placement, size, colour or client and watch the numbers move.</p>
<div class="row" style="margin:8px 0">
<label>Placement <select id="dzPl">${Object.values(P).map(p=>opt(p.id,p.name,DZ.placement)).join("")}</select></label>
<label>Size <select id="dzSz">${[9,20,40,60,90,140,220].map(n=>opt(n,n+" mm",DZ.size)).join("")}</select></label>
<label>Colour <select id="dzCol">${["red","yellow","black","skyblue","green"].map(c=>opt(c,c,DZ.colour)).join("")}</select></label>
<label>Client <select id="dzCl">${DZ_SAMPLE_CLIENTS.map((c,i)=>opt(i,c.name,DZ.client)).join("")}</select></label>
</div>
${d?`<p class="hint">Design: ${esc(d.elements.map(e=>e.id).join(" + "))} on ${esc((P[d.placement]||{}).name||d.placement)}</p>`:""}
<pre class="raw" id="dzOut"></pre></div>`;
  $("dzOut").textContent=out;
  const on=(id,f)=>{const el=$(id);if(el)el.addEventListener("change",()=>{f(el.value);renderDesign();});};
  on("dzPl",v=>DZ.placement=v);on("dzSz",v=>DZ.size=+v);on("dzCol",v=>DZ.colour=v);on("dzCl",v=>DZ.client=+v);}
