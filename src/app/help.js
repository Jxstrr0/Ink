/* ===================== app/help.js: help overlays on the apprenticeship (PR 9). Last app file: closes the script. =====================
   There is no separate tutorial: Act 1 (sim/career.js) is the tutorial, one goal at a time on the Career tab. These tips sit
   on top of it, Prairie Engine Works' help.js pattern: a dimmed page with a spotlight on the real control and a short card.
   Each tip shows once (S.help: id -> {w, y}, reset by a new career) and goes away with Got it, a tap anywhere or Escape.
   Settings › Help turns tips off (S.settings.tips) or shows them all again. helpSoon() is called after a tab draws; it
   looks for the first tip whose moment has come on the tab you're on. */
const HELP_TIPS=[
  {id:"act",tab:"career",sel:".caAct .caGoal",when:()=>helpAct1(),
    title:"Arkady's shop",text:"This is your apprenticeship, and it's the tutorial too. Arkady sets one goal at a time here. Each chore takes a week; Next moves the calendar on to the next person or heal."},
  {id:"practice",tab:"session",sel:"#sePracCard",when:()=>helpAct1()&&helpGoal("practice"),
    title:"Practice on fake skin",text:"A rubber pad: no client, no pain, no money. Start on the dot and follow each stencil line at the marker's pace. Too fast blows the line out; stopping leaves a join."},
  {id:"flash",tab:"design",sel:"#dzBoard",when:()=>helpAct1()&&helpGoal("flash"),
    title:"Draw a flash sheet",text:"Add elements from the drawer, or start from the Flash wall at the top. The capsule under the board scores how it reads and how it will age. When you like it, Save to my flash."},
  {id:"friend",tab:"clients",sel:()=>{const q=S.queue.find(i=>i.friend);return q?document.querySelector(`#clientsBody [data-dz="${q.id}"]`):null;},when:()=>S.queue.some(i=>i.friend),
    title:"Your first piece, free",text:"A friend is in the chair this week. Design it for them first (keep it small and simple), then start the session. It heals two weeks after you finish."},
  {id:"heal",tab:"career",sel:"#rvCard",when:()=>typeof rvPending==="function"&&!!rvPending(),
    title:"The bandage comes off",text:"Every piece heals two weeks after its last sitting. Crisp, soft, patchy or blown out comes from how you worked and how the client looked after it. The purple dashes are your stencil: where the lines were meant to go."}
];
const HELP={on:null,t:0};
function helpAct1(){const C=S.career;return!!C&&!C.old&&!C.skipped&&(S.studio&&S.studio.stage)==="apprentice";}
function helpGoal(id){const g=SIMOK("apprenticeGoal")?INK_SIM.apprenticeGoal(S):null;return!!g&&g.id===id;}
function helpSeen(){if(!S.help||typeof S.help!=="object"||Array.isArray(S.help))S.help={};return S.help;}
function helpTarget(tip){const el=typeof tip.sel==="function"?tip.sel():document.querySelector(tip.sel);return el&&el.getClientRects().length?el:null;}
/* after a tab draws: show the first tip whose moment has come (one at a time, never over a sheet) */
function helpSoon(){clearTimeout(HELP.t);HELP.t=setTimeout(helpCheck,350);}
function helpCheck(){
  if(HELP.on)helpPlace();
  if(HELP.on||S.settings.tips===false||sheetOn())return;const seen=helpSeen();
  for(const tip of HELP_TIPS){if(seen[tip.id]||tip.tab!==curTab)continue;let ok=false;try{ok=tip.when();}catch(e){}
    if(!ok)continue;const el=helpTarget(tip);if(!el)continue;helpShow(tip,el);return;}}
function helpShow(tip,el){
  HELP.on=tip;const pn=$("panel");
  if(pn.contains(el)){const pr=pn.getBoundingClientRect(),r=el.getBoundingClientRect();pn.scrollTop+=r.top-pr.top-Math.max(12,pr.height*0.12);}
  $("helpK").textContent="Tip";$("helpT").textContent=tip.title;$("helpX").textContent=tip.text;
  $("help").hidden=false;document.documentElement.classList.add("helpOn");helpPlace();requestAnimationFrame(helpPlace);
  try{$("helpOk").focus({preventScroll:true});}catch(e){}}
/* the spotlight round the control, the card below it if there's room, else above */
function helpPlace(){
  const tip=HELP.on;if(!tip)return;const el=helpTarget(tip),spot=$("helpSpot"),box=$("helpBox"),vh=innerHeight,vw=innerWidth;
  if(!el||tip.tab!==curTab||S.settings.tips===false){helpHide();return;}   // its control has gone (a new career, another tab): put it away unseen
  const r=el.getBoundingClientRect(),pad=6,top=Math.max(4,r.top-pad),bot=Math.min(vh-4,r.bottom+pad);
  spot.style.display="";spot.style.left=Math.max(4,r.left-pad)+"px";spot.style.top=top+"px";spot.style.width=Math.max(20,Math.min(vw-8,r.right+pad)-Math.max(4,r.left-pad))+"px";spot.style.height=Math.max(20,bot-top)+"px";
  const bh=box.offsetHeight||180,tabs=$("tabs").getBoundingClientRect().top;
  if(bot+12+bh<tabs){box.style.top=(bot+12)+"px";box.style.bottom="auto";}
  else if(top-12-bh>0){box.style.top=(top-12-bh)+"px";box.style.bottom="auto";}
  else{box.style.top="auto";box.style.bottom=(vh-tabs+12)+"px";}}
function helpHide(){HELP.on=null;$("help").hidden=true;document.documentElement.classList.remove("helpOn");}
function helpClose(off){
  const tip=HELP.on;if(!tip)return;helpHide();
  helpSeen()[tip.id]={w:S.week,y:S.year};if(off)S.settings.tips=false;save();
  if(off)toast("Tips off. Settings › Help turns them back on.");else helpSoon();}
function helpOff(){if(HELP.on)helpHide();}
function helpReset(){S.help={};S.settings.tips=true;save();helpSoon();}
$("helpOk").addEventListener("click",e=>{e.stopPropagation();helpClose(false);});
$("helpOff").addEventListener("click",e=>{e.stopPropagation();helpClose(true);});
$("help").addEventListener("click",e=>{if(!$("helpBox").contains(e.target))helpClose(false);});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&HELP.on){helpClose(false);e.preventDefault();}});
addEventListener("resize",()=>{if(HELP.on)helpPlace();});
$("panel").addEventListener("scroll",()=>{if(HELP.on)helpPlace();},{passive:true});
</script>
