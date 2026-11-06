/* ===================== app/legacy.js: scenes and the Legacy screen (PR 7) =====================
   S.career.scene is set by the sim when something needs the whole screen:
     broke    the studio closed (sim/career.js softFail): what went, what stayed (clients, pieces, reputation), Arkady's
              word, and one button back to work in a rented chair. Nothing is taken away from the body of work.
     legacy   week 52 of 2030: straight to the Legacy screen.
   lgSceneOpen() shows a waiting scene as a sheet (once per page load); lgSceneCard() keeps it at the top of the Career
   tab until you tap through, so a closed sheet never loses it.
   lgOpen(): the Legacy screen (INK_SIM.legacySummary): the oldest piece that still reads, the client with the most
   pieces, pieces per decade, the best heal, conventions, apprentices and the shop. It opens from the Career tab once you
   have a studio, and by itself at the end. The save stays playable afterwards. PR 9: Share card draws it as a picture
   (app/share.js shLegacyCard). */
const LG={shown:""};
function lgScene(){return S.career&&S.career.scene||null;}
function lgSceneKey(sc){return sc?sc.kind+":"+sc.w+":"+sc.y:"";}
function lgBrokeHtml(sc,inSheet){
  const staff=(sc.staff||[]).length;
  return`<div class="lgScene${inSheet?"":" card"}">${inSheet?"":`<span class="clK">Week ${sc.w}, ${sc.y}</span><h2>The shop closes</h2>`}
<p>Four weeks under water was all the bank would wait. The lease goes back, the stations get sold off${staff?`, and ${esc(sc.staff.join(", "))} ${staff===1?"has":"have"} to find other chairs`:""}.</p>
${sc.line?`<p class="caLater lgLine">${esc(sc.line)}</p>`:""}
<ul class="lgKeep"><li><b>Your clients</b> stay with you: ${S.clients.length} of them.</li><li><b>Your work</b> stays: every piece you've done, ${S.pieces.filter(p=>!p.by).length} in all, still healing and aging on real people.</li><li><b>Your reputation</b> stays. People remember the work, not the lease.</li></ul>
<p class="hint">You're back in ${S.career&&S.career.split==="mentor"?"your chair in Arkady's front room":"a rented chair across town"} with ${fmtMoney(S.cash)} to start again. You can lease another studio when the money's there.</p>
<div class="row"><button class="btn pri" id="${inSheet?"lgBack":"lgBackC"}" style="flex:1">Back to work</button></div></div>`;}
function lgSceneCard(){const sc=lgScene();if(!sc||sc.kind!=="broke")return"";return lgBrokeHtml(sc,false);}
function lgDone(){if(S.career)S.career.scene=null;save();if(sheetOn())closeSheet();renderAll();}
function lgSceneWire(){for(const id of ["lgBack","lgBackC"]){const b=$(id);if(b&&!b.dataset.w){b.dataset.w="1";b.addEventListener("click",lgDone);}}}
function lgSceneOpen(){
  const sc=lgScene();if(!sc)return;
  if(sc.kind==="legacy"){S.career.legacySeen=true;S.career.scene=null;save();lgOpen(true);return;}
  const k=lgSceneKey(sc);if(LG.shown===k)return;LG.shown=k;
  openSheet("The shop closes",lgBrokeHtml(sc,true));lgSceneWire();}

/* ---- the Legacy screen ---- */
function lgPiece(id){return S.pieces.find(p=>p.id===id)||null;}
function lgFig(id,cap){const p=lgPiece(id);if(!p||typeof gvSvg!=="function")return"";const t=gvSvg(p,{cls:"gvSm"});
  return`<figure class="lgFig" data-gp="${esc(p.id)}" role="button" tabindex="0">${t.svg}<figcaption>${esc(cap)}</figcaption></figure>`;}
function lgOpen(end){
  if(!SIMOK("legacySummary"))return;
  const L=INK_SIM.legacySummary(S),stN=id=>(INK_SIM.STYLES[id]||{}).name||id;
  const decs=Object.keys(L.decades).sort(),dmax=Math.max(1,...decs.map(d=>L.decades[d]));
  const yrs=Math.floor(L.years);
  openSheet(end?"Thirty years":"Your Legacy",`<div id="lgBody"><section class="lgHead"><p class="lgBig">${yrs} year${yrs===1?"":"s"} at the needle</p>
<p class="hint" style="margin-top:0">${L.pieces.toLocaleString("en-CA")} pieces of your own on ${L.clients.toLocaleString("en-CA")} people${L.shopPieces?`, and ${L.shopPieces.toLocaleString("en-CA")} more from your shop's artists`:""}. Earned ${fmtMoney(L.earned)}, spent ${fmtMoney(L.spent)}.</p></section>
<section><h3>Still reading</h3>${L.oldest?`<div class="lgPair">${lgFig(L.oldest.piece,`${L.oldest.y}, reads ${Math.round(L.oldest.reads*100)}`)}<p>The oldest piece that still reads: <b>${esc(L.oldest.name)}</b>, from ${L.oldest.y}.</p></div>`:`<p class="hint">Nothing old enough to tell yet.</p>`}</section>
<section><h3>The best heal</h3>${L.best?`<div class="lgPair">${lgFig(L.best.piece,String(L.best.y))}<p><b>${esc(L.best.name)}</b>, ${L.best.y}. Every line held.</p></div>`:`<p class="hint">No crisp heal yet.</p>`}</section>
<section><h3>Who kept coming back</h3>${L.most&&L.most.n>1?`<p><b>${esc(L.most.name)}</b> wears ${L.most.n} of your pieces.</p>`:`<p class="hint">Nobody has more than one yet.</p>`}</section>
<section><h3>Pieces by decade</h3>${decs.length?`<div class="lgDec">${decs.map(d=>`<div class="lgDecR"><span>${d}s</span><span class="crRepB"><i style="width:${(L.decades[d]/dmax*100).toFixed(1)}%"></i></span><b>${L.decades[d]}</b></div>`).join("")}</div>`:`<p class="hint">None yet.</p>`}</section>
<section><h3>Your signature</h3><p>${L.signature.ready?`People know your hand: <b>${esc(stN(L.signature.style))}</b>.`:"You never settled on one thing. Some artists don't."}</p></section>
<section><h3>Conventions</h3><p>${L.conv.entered?`Entered ${L.conv.entered}, won ${L.conv.won}.`:"You never entered one."}${S.career.offers.conv?" You ran your own, too.":""}</p>
${L.conv.list.length?`<ul class="caPast">${L.conv.list.map(c=>`<li>${c.y} · ${esc(gvCapS(c.name))}${c.own?"":c.place?` · ${["","first","second","third"][c.place]}`:" · no placing"}</li>`).join("")}</ul>`:""}</section>
<section><h3>Apprentices and the shop</h3>${L.apprentices.length?`<ul class="caPast">${L.apprentices.map(a=>`<li><b>${esc(a.name)}</b> <span class="clMeta">${esc(a.where)}</span></li>`).join("")}</ul>`:`<p class="hint">You never took one on.</p>`}
${L.staff.length?`<p class="hint">On your staff now: ${L.staff.map(s=>`${esc(s.name)} (${s.pieces} pieces)`).join(", ")}.</p>`:""}
${L.fails?`<p class="hint">You lost a shop ${L.fails===1?"once":L.fails+" times"} and kept going.</p>`:""}${L.tv?`<p class="hint">The TV show: ${L.tv==="yes"?"you did it.":"you said no."}</p>`:""}</section>
<section><p class="hint">${end?"The thirty years are done, but the shop isn't. Your save stays open: keep working, look back through your clients, or start a new career from Settings › Save.":"Everything here is worked out from your save as it stands today."}</p>
<div class="row"><button class="btn shBtn" id="lgCard">${SH_ICON}Share card</button><button class="btn pri" id="lgClose" style="flex:1">Back to the shop</button></div></section></div>`);
  $("lgClose").addEventListener("click",closeSheet);$("lgCard").addEventListener("click",shLegacyCard);
  const go=e=>{const f=e.target.closest("[data-gp]");if(f&&(e.type==="click"||e.key==="Enter"||e.key===" ")){e.preventDefault();if(typeof gvOpen==="function")gvOpen(f.dataset.gp);}};
  $("lgBody").addEventListener("click",go);$("lgBody").addEventListener("keydown",go);}
