/* ===================== app/session.js: the Session tab =====================
   The chair: stencil placement, linework (trace-and-rhythm), shading, colour packing, the client's pain and fatigue
   meters (PR 4). Empty state while nobody is booked in. */
function renderSession(){
  $("sessionBody").innerHTML=`<div class="card empty"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="9" rx="1.5"/><path d="M10.5 12v4h3v-4"/><path d="M12 16v5"/><path d="M15 6h3a2 2 0 0 1 0 4h-3"/></svg>
<p><b>No one in the chair.</b></p><p>Book a client from the Clients tab.</p>
<button class="btn" id="toClients">Go to Clients</button></div>`;
  $("toClients").addEventListener("click",()=>showTab("clients"));}
