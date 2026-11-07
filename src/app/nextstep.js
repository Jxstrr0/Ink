/* ===================== app/nextstep.js: the "what to do now" line at the top of every tab (0.1.16.0) =====================
   One short line and (usually) one button above each tab's content, in its own slot (#nx-studio ... #nx-career in
   html/body.html), so a tab redraw never wipes it. nxStep() works out the one thing to do next from what's already in
   the save, most urgent first: a sitting left half done, the end of the thirty years, a consult left open, a healed piece
   to look at, a choice card, someone due in the chair (with or without a design), someone at the door, a sample piece
   with sittings left, Act 1's goal, and otherwise the next week. The words are in NX_COPY; {name} and {n} are filled in.
   A step is "quiet" (the line, no button) on the tab where its control is already on screen, and the bar hides itself
   in the chair (the session needs the room) and in a consult. Every render function is wrapped once at the bottom of
   this file so the line follows any redraw, and renderHeader (called after every clock tick and purchase) refreshes it. */
const NX_COPY={
  live:{t:"You left someone in the chair with the stencil on.",b:"Back to the chair"},
  over:{t:"Thirty years at the needle. Look back at the work.",b:"See your Legacy"},
  consult:{t:"{name} is still waiting in the middle of a consult.",b:"Back to the consult"},
  reveal:{t:"A piece has healed. See how it came out.",b:"See the heal"},
  choice:{t:"{n} to decide on the Career tab.",b:"Decide"},
  sitting:{t:"{name} is in the chair this week and the design is ready.",b:"Start the sitting"},
  design:{t:"{name}'s sitting needs a design.",b:"Design it"},
  designing:{t:"Designing for {name}. Press Save to booking when it's ready, then start the sitting."},
  door:{t:"{name} is at the door. Talk to them before the week is out.",b:"Talk to them"},
  sample:{t:"The sample walk-in's piece has sittings left.",b:"Next sitting"},
  chore:{t:"Start where everyone starts: a chore for Arkady.",b:"Sweep up"},
  practice:{t:"Practise a line on fake skin. No client, no pain.",b:"Practise now"},
  flash:{t:"Draw a flash sheet: put elements on the board, then Save to my flash.",b:"Open the board"},
  flashHere:{t:"Put elements on the board, then press Save to my flash."},
  friend:{t:"Tattoo a friend, free. Your first piece on real skin.",b:"Do a friend"},
  walkin:{t:"Your first paying walk-in comes with the week. Press Next.",b:"Next week"},
  next:{t:"Nothing waiting. Move the clock on to the next client or heal.",b:"Next week"},
  nextHere:{t:"Nothing waiting. Press Next to move the clock on."}};
const NX_TABS=["studio","design","session","clients","career"];
const NX_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const NX={busy:false};

/* the one step: {id, tab (where its control lives), name, n, go()} */
function nxStep(){
  const first=c=>c?(c.first||String(c.name||"").split(" ")[0]||"Someone"):"Someone";
  if(typeof seLive==="function"&&seLive())return{id:"live",tab:"session",go:()=>showTab("session")};
  if(INK_SIM.careerOver&&INK_SIM.careerOver(S))return{id:"over",tab:"career",go:()=>{if(typeof lgOpen==="function")lgOpen();}};
  if(typeof CL!=="undefined"&&CL.consult&&CL.consult.stage!=="done")return{id:"consult",tab:"clients",name:first(CL.consult.client),go:()=>showTab("clients")};
  if(typeof rvPending==="function"&&rvPending())return{id:"reveal",tab:"career",go:()=>{showTab("career");$("panel").scrollTop=0;}};
  const pend=typeof evOn==="function"&&evOn()&&S.world&&Array.isArray(S.world.pending)?S.world.pending.length:0;
  if(pend)return{id:"choice",tab:"career",n:pend===1?"One thing":pend+" things",go:()=>{showTab("career");$("panel").scrollTop=0;}};
  const due=typeof clDue==="function"?S.queue.filter(clDue):[];
  const ses=due.filter(q=>q.kind==="session").sort((a,b)=>INK_SIM.weekIndex(a.w,a.y)-INK_SIM.weekIndex(b.w,b.y));
  const ready=ses.find(q=>q.design&&q.design.elements&&q.design.elements.length);
  if(ready)return{id:"sitting",tab:"",name:first(clWho(ready)),go:()=>sessionStartBooked(ready)};
  const need=ses[0];
  if(need){const nm=first(clWho(need));
    if(S.board.item===need.id)return{id:"designing",tab:"design",name:nm};
    return{id:"design",tab:"",name:nm,go:()=>clDesignFor(need.id)};}
  const door=due.find(q=>q.kind==="walkin"||q.kind==="consult");
  if(door)return{id:"door",tab:"",name:first(clWho(door)),go:()=>{clStartConsult(door.id);if(curTab!=="clients")showTab("clients");}};
  if(S.session&&S.session.next)return{id:"sample",tab:"",go:()=>seContinueSample()};
  const stage=(S.studio&&S.studio.stage)||"apprentice";
  if(stage==="apprentice"&&S.career&&INK_SIM.apprenticeGoal){const g=INK_SIM.apprenticeGoal(S);
    if(g&&g.id==="chore")return{id:"chore",tab:"career",go:()=>caChore(INK_SIM.CHORES[0].id)};
    if(g&&g.id==="practice")return{id:"practice",tab:"",go:()=>seStartPractice(SE.pick||"fl_moon")};
    if(g&&g.id==="flash"){if(curTab==="design"&&typeof DZ!=="undefined"&&DZ.view==="board")return{id:"flashHere",tab:"design"};
      return{id:"flash",tab:"",go:()=>{if(typeof DZ!=="undefined")DZ.view="board";showTab("design");}};}
    if(g&&g.id==="friend"&&typeof caDoFriend==="function"&&!S.queue.some(q=>q.friend))return{id:"friend",tab:"",go:caDoFriend};
    if(g&&g.id==="walkin")return{id:"walkin",tab:"career",go:nxNext};}
  if(curTab==="career")return{id:"nextHere",tab:"career"};
  return{id:"next",tab:"",go:nxNext};}
function nxNext(){if(curTab!=="career")showTab("career");crNext();$("panel").scrollTop=0;}

/* draw the line for one tab (the current one if none given) */
function nxRender(t){
  t=t||curTab;const host=$("nx-"+t);if(!host||NX.busy)return;
  if(!S||!Array.isArray(S.queue)){host.hidden=true;return;}
  if(t==="session"&&typeof seLive==="function"&&seLive()||t==="clients"&&typeof CL!=="undefined"&&CL.consult){host.hidden=true;host.innerHTML="";return;}
  let st;try{st=nxStep();}catch(e){host.hidden=true;return;}
  const C=NX_COPY[st.id];if(!C){host.hidden=true;return;}
  const txt=C.t.replace("{name}",st.name||"Someone").replace("{n}",st.n||""),quiet=!C.b||!st.go||st.tab===t;
  const key=t+"|"+st.id+"|"+txt+"|"+quiet;
  if(host._k===key&&!host.hidden)return;host._k=key;
  host.hidden=false;host.className="nx"+(quiet?" quiet":"");
  host.innerHTML=`<span class="nxK">Next</span><p class="nxT">${esc(txt)}</p>${quiet?"":`<button type="button" class="btn pri nxB" id="nxGo-${t}">${esc(C.b)}${NX_ICON}</button>`}`;
  const b=$("nxGo-"+t);if(b)b.addEventListener("click",()=>{const s=nxStep();if(s.id!==st.id||!s.go)return nxRender(t);INK_SOUND.tick();s.go();nxRender();});}

/* follow every redraw: wrap each tab's render function, and renderHeader for the current tab */
(function(){
  renderStudio=(f=>function(){const r=f.apply(this,arguments);nxRender("studio");return r;})(renderStudio);
  renderDesign=(f=>function(){const r=f.apply(this,arguments);nxRender("design");return r;})(renderDesign);
  renderSession=(f=>function(){const r=f.apply(this,arguments);nxRender("session");return r;})(renderSession);
  renderClients=(f=>function(){const r=f.apply(this,arguments);nxRender("clients");return r;})(renderClients);
  renderCareer=(f=>function(){const r=f.apply(this,arguments);nxRender("career");return r;})(renderCareer);
  renderHeader=(f=>function(){const r=f.apply(this,arguments);if(typeof curTab!=="undefined")nxRender(curTab);return r;})(renderHeader);
})();
