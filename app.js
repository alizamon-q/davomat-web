
const C = window.DAVOMAT_CONFIG;
const $ = s => document.querySelector(s);
const content = $("#content");
let me = null;
let deferredPrompt = null;
let activeRequests = 0;
function setBusy(on){
  let b=document.getElementById("busyBar");
  if(!b){b=document.createElement("div");b.id="busyBar";document.body.appendChild(b)}
  activeRequests=Math.max(0,activeRequests+(on?1:-1));
  b.classList.toggle("show",activeRequests>0);
}
function cacheGet(key,maxAge=30000){
  try{const x=JSON.parse(sessionStorage.getItem("davomat_cache_"+key)||"null");if(x&&Date.now()-x.t<maxAge)return x.v}catch(e){}return null;
}
function cacheSet(key,val){try{sessionStorage.setItem("davomat_cache_"+key,JSON.stringify({t:Date.now(),v:val}))}catch(e){}}
function cacheDrop(prefix=""){try{Object.keys(sessionStorage).filter(k=>k.startsWith("davomat_cache_"+prefix)).forEach(k=>sessionStorage.removeItem(k))}catch(e){}}
async function cachedApi(key,params,maxAge=30000){const c=cacheGet(key,maxAge);if(c)return c;const r=await api(params);cacheSet(key,r);return r}

function toast(msg, ok=true){const t=$("#toast");t.textContent=msg;t.style.background=ok?"#197a5d":"#a52d2d";t.style.display="block";setTimeout(()=>t.style.display="none",3500)}
function deviceId(){
  let id=localStorage.getItem("davomat_device_id");
  if(!id){id=(crypto.randomUUID?crypto.randomUUID():"dev-"+Date.now()+"-"+Math.random().toString(36).slice(2));localStorage.setItem("davomat_device_id",id)}
  return id;
}
async function sha256(s){
  const b=new TextEncoder().encode(s);const h=await crypto.subtle.digest("SHA-256",b);
  return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function api(params){
  setBusy(true);
  return new Promise((resolve,reject)=>{
    const cb="cb_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script");
    const q=new URLSearchParams({...params,device_id:deviceId(),callback:cb,_:Date.now()});
    const timer=setTimeout(()=>{cleanup();reject(new Error("Server javob bermadi"));},20000);
    function cleanup(){clearTimeout(timer);delete window[cb];script.remove();setBusy(false)}
    window[cb]=data=>{cleanup();data && data.ok ? resolve(data) : reject(new Error(data?.message||"Xatolik"))};
    script.onerror=()=>{cleanup();reject(new Error("Server bilan aloqa xatosi"))};
    script.src=C.API_URL+"?"+q.toString();document.body.appendChild(script);
  });
}
function token(){return localStorage.getItem("davomat_token")||""}
function setToken(t){localStorage.setItem("davomat_token",t)}
function clearSession(){localStorage.removeItem("davomat_token");sessionStorage.clear();me=null}
function fmtDate(s){if(!s)return "—";const d=new Date(s);return isNaN(d)?s:d.toLocaleString("uz-UZ")}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function badge(s){const c=s==="Tasdiqlandi"?"approved":s==="Rad etildi"?"rejected":"pending";return `<span class="badge ${c}">${esc(s)}</span>`}
function monthVal(){return new Date().toISOString().slice(0,7)}

async function bootstrap(){
  $("#sheetLink").href=C.SHEET_URL;
  const t=token();
  if(!t){showLogin();return}
  try{const r=await api({action:"me",token:t});me=r.user;showApp()}catch(e){clearSession();showLogin()}
}
function showLogin(){
  $("#appShell").classList.add("hidden");$("#loginPage").classList.remove("hidden");$("#loginError").classList.add("hidden");
}
function showApp(){
  $("#loginPage").classList.add("hidden");$("#appShell").classList.remove("hidden");
  $("#currentUserName").textContent=me.full_name+(me.role==="admin"?" — Administrator":"");
  $("#adminNav").classList.toggle("hidden",me.role!=="admin");
  $("#employeeNav").classList.toggle("hidden",me.role==="admin");
  go(me.role==="admin"?"adminDashboard":"profile");
}
$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const err=$("#loginError");err.classList.add("hidden");
  const username=$("#username").value.trim();const password=$("#password").value;
  try{
    const ph=await sha256(password);
    const r=await api({action:"login",username,password_hash:ph,device_id:deviceId()});
    setToken(r.token);me=r.user;showApp();
  }catch(ex){err.textContent=ex.message;err.classList.remove("hidden")}
});
$("#logoutBtn").onclick=()=>{clearSession();showLogin()};
$("#menuBtn").onclick=()=>$("#sidebar").classList.toggle("open");
document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{go(b.dataset.page);$("#sidebar").classList.remove("open")});

async function go(page){
  document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  if(!content.innerHTML.trim()) content.innerHTML=`<div class="card soft-loading">Ma’lumot olinmoqda...</div>`;
  try{
    if(page==="profile") return renderProfile();
    if(page==="attendance") return renderAttendance();
    if(page==="myStats") return renderMyStats();
    if(page==="adminDashboard") return renderAdminDashboard();
    if(page==="users") return renderUsers();
    if(page==="pending") return renderPending();
    if(page==="allAttendance") return renderAllAttendance();
    if(page==="monthly") return renderMonthly();
    if(page==="settings") return renderSettings();
  }catch(e){content.innerHTML=`<div class="alert danger">${esc(e.message)}</div>`}
}

function renderProfile(){
  content.innerHTML=`<h1 class="page-title">Mening profilim</h1>
  <div class="card profile-card"><img src="assets/logo.png" class="profile-logo"><div>
  <h2>${esc(me.full_name)}</h2><p><b>Bo‘lim:</b> ${esc(me.department||"—")}</p><p><b>Lavozim:</b> ${esc(me.position||"—")}</p>
  <p><b>Login:</b> ${esc(me.username)}</p></div></div>`;
}
function renderAttendance(){
  content.innerHTML=`<h1 class="page-title">Davomat yuborish</h1><div class="card">
  <h3>Davomatingizni belgilang</h3><div class="field"><label>Izoh</label><textarea id="attNote" rows="5" placeholder="Masalan: Ishxonadaman yoki Oqdaryo tumanidagi obyektdaman"></textarea></div>
  <div id="gpsStatus" class="note">Yashil tugmani bosganda lokatsiya avtomatik olinadi.</div>
  <button id="sendAttendance" class="success-btn">✓ MA’LUMOTNI TASDIQLAYMAN</button></div>`;
  $("#sendAttendance").onclick=submitAttendance;
}
async function submitAttendance(){
  const btn=$("#sendAttendance"), note=$("#attNote").value.trim();btn.disabled=true;btn.textContent="Lokatsiya olinmoqda...";
  if(!navigator.geolocation){toast("Brauzer GPS lokatsiyani qo‘llamaydi.",false);btn.disabled=false;btn.textContent="✓ MA’LUMOTNI TASDIQLAYMAN";return}
  navigator.geolocation.getCurrentPosition(async pos=>{
    try{
      btn.textContent="Yuborilmoqda...";
      await api({action:"submitAttendance",token:token(),note,lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:Math.round(pos.coords.accuracy||0)});
      cacheDrop("myStats:");cacheDrop("adminDashboard:");cacheDrop("attendance:");
      toast("Ma’lumot yuborildi. Admin tasdig‘i kutilmoqda.");
      content.innerHTML=`<h1 class="page-title">Davomat yuborish</h1><div class="card"><div class="alert success"><b>Ma’lumot muvaffaqiyatli yuborildi.</b><br>Holat: Kutilmoqda. Admin tasdiqlagandan keyin “Mening davomatim” bo‘limida ko‘rinadi.</div><button id="sendAgain" class="success-btn">Yana ma’lumot yuborish</button> <button id="openStats" class="secondary">Mening davomatim</button></div>`;
      $("#sendAgain").onclick=renderAttendance;$("#openStats").onclick=()=>go("myStats");
    }catch(e){toast(e.message,false);btn.disabled=false;btn.textContent="✓ MA’LUMOTNI TASDIQLAYMAN"}
  },err=>{
    let m="Lokatsiya olinmadi. Brauzerga GPS ruxsatini bering.";
    if(err.code===1)m="Lokatsiyaga ruxsat berilmadi. Brauzer sozlamasidan Location ruxsatini yoqing.";
    toast(m,false);btn.disabled=false;btn.textContent="✓ MA’LUMOTNI TASDIQLAYMAN";
  },{enableHighAccuracy:true,timeout:10000,maximumAge:30000});
}
async function renderMyStats(month=monthVal()){
  const r=await cachedApi("myStats:"+month,{action:"myAttendance",token:token(),month},60000);
  const rows=r.items.map((x,i)=>`<tr><td>${i+1}</td><td>${fmtDate(x.sent_at)}</td><td>${fmtDate(x.confirmed_at)}</td><td>${esc(x.note)}</td><td>${badge(x.status)}</td><td>${esc(x.admin_note||"")}</td><td><a class="map-link" target="_blank" href="${esc(x.maps_url)}">📍 ${esc(x.location_text)}</a></td></tr>`).join("");
  content.innerHTML=`<h1 class="page-title">Mening davomatim</h1><div class="card"><div class="toolbar"><input id="myMonth" type="month" value="${month}"><button id="myShow" class="success-btn">Ko‘rsatish</button></div>
  <div class="table-wrap"><table><thead><tr><th>№</th><th>Yuborilgan sana</th><th>Tasdiqlangan vaqt</th><th>Izoh</th><th>Holat</th><th>Admin izohi</th><th>Lokatsiya</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Ma’lumot yo‘q.</td></tr>'}</tbody></table></div></div>`;
  $("#myShow").onclick=()=>renderMyStats($("#myMonth").value);
}
async function renderAdminDashboard(month=monthVal()){
  const r=await cachedApi("adminDashboard:"+month,{action:"adminDashboard",token:token(),month},30000);
  content.innerHTML=`<h1 class="page-title">Boshqaruv paneli</h1>
  <div class="toolbar"><input id="dashMonth" type="month" value="${month}"><button id="dashShow" class="success-btn">Ko‘rsatish</button></div>
  <div class="kpis"><div class="kpi"><b>${r.total_users}</b><span>Faol xodim</span></div><div class="kpi"><b>${r.no_submission}</b><span>Umuman yubormagan</span></div><div class="kpi"><b>${r.pending}</b><span>Kutilmoqda</span></div><div class="kpi"><b>${r.approved}</b><span>Tasdiqlandi</span></div><div class="kpi"><b>${r.rejected}</b><span>Rad etildi</span></div></div>
  <div class="card"><h3>Xodimlar kesimida</h3><div class="table-wrap"><table><thead><tr><th>Xodim</th><th>Bo‘lim</th><th>Yuborganlar</th><th>Tasdiqlangan</th><th>Rad etilgan</th><th>Kutilmoqda</th></tr></thead><tbody>
  ${r.by_user.map(x=>`<tr><td>${esc(x.full_name)}</td><td>${esc(x.department)}</td><td>${x.total}</td><td>${x.approved}</td><td>${x.rejected}</td><td>${x.pending}</td></tr>`).join("")||'<tr><td colspan="6">Ma’lumot yo‘q</td></tr>'}
  </tbody></table></div></div>`;
  $("#dashShow").onclick=()=>renderAdminDashboard($("#dashMonth").value);
}
async function renderUsers(){
  const r=await cachedApi("users",{action:"listUsers",token:token()},60000);
  content.innerHTML=`<h1 class="page-title">Xodimlar</h1>
  <div class="card"><h3>Yangi xodim qo‘shish</h3><div class="form-row">
  <input id="uFull" placeholder="F.I.Sh."><input id="uLogin" placeholder="Login"><input id="uPass" type="password" placeholder="Boshlang‘ich parol"><input id="uDept" placeholder="Bo‘lim"><input id="uPos" placeholder="Lavozim"></div>
  <button id="addUserBtn" class="success-btn">Qo‘shish</button></div>
  <div class="card"><h3>Xodimlar ro‘yxati</h3><div class="table-wrap"><table><thead><tr><th>F.I.Sh.</th><th>Login</th><th>Bo‘lim</th><th>Lavozim</th><th>Qurilma</th><th>Holat</th><th>Amallar</th></tr></thead><tbody>
  ${r.items.map(u=>`<tr><td>${esc(u.full_name)}</td><td>${esc(u.username)}</td><td>${esc(u.department)}</td><td>${esc(u.position)}</td><td>${u.device_bound?"Biriktirilgan":"Biriktirilmagan"}</td><td><span class="badge ${u.active?"approved":"inactive"}">${u.active?"Faol":"Faol emas"}</span></td>
  <td><button class="secondary small edit-user" data-id="${u.id}">Tahrirlash</button> <button class="success-btn small reset-device" data-id="${u.id}">Qurilmani almashtirish</button> <button class="danger-btn small toggle-user" data-id="${u.id}" data-active="${u.active?1:0}">${u.active?"Ishdan bo‘shatish":"Faollashtirish"}</button></td></tr>`).join("")}</tbody></table></div></div>`;
  $("#addUserBtn").onclick=async()=>{
    const p=$("#uPass").value;if(!p)return toast("Boshlang‘ich parol kiriting.",false);
    try{await api({action:"addUser",token:token(),full_name:$("#uFull").value,username:$("#uLogin").value,password_hash:await sha256(p),department:$("#uDept").value,position:$("#uPos").value});cacheDrop("users");cacheDrop("adminDashboard:");toast("Xodim qo‘shildi");renderUsers()}catch(e){toast(e.message,false)}
  };
  document.querySelectorAll(".edit-user").forEach(b=>b.onclick=()=>editUser(r.items.find(x=>String(x.id)===b.dataset.id)));
  document.querySelectorAll(".reset-device").forEach(b=>b.onclick=async()=>{if(confirm("Qurilma bog‘lanishini tozalaysizmi?")){try{await api({action:"resetDevice",token:token(),id:b.dataset.id});cacheDrop("users");toast("Qurilma bog‘lanishi tozalandi");renderUsers()}catch(e){toast(e.message,false)}}});
  document.querySelectorAll(".toggle-user").forEach(b=>b.onclick=async()=>{const active=b.dataset.active==="1";if(confirm(active?"Xodimni faolsizlantirasizmi?":"Xodimni faollashtirasizmi?")){try{await api({action:"toggleUser",token:token(),id:b.dataset.id,active:active?0:1});cacheDrop("users");cacheDrop("adminDashboard:");renderUsers()}catch(e){toast(e.message,false)}}});
}
function editUser(u){
  document.body.insertAdjacentHTML("beforeend",`<div id="modal" class="modal"><div class="modal-card"><h2>Xodimni tahrirlash</h2>
  <div class="form-row"><div><label>F.I.Sh.</label><input id="eFull" value="${esc(u.full_name)}"></div><div><label>Login</label><input id="eLogin" value="${esc(u.username)}"></div><div><label>Bo‘lim</label><input id="eDept" value="${esc(u.department)}"></div><div><label>Lavozim</label><input id="ePos" value="${esc(u.position)}"></div><div><label>Yangi parol (ixtiyoriy)</label><input id="ePass" type="password"></div></div>
  <div class="modal-actions"><button id="cancelEdit" class="secondary">Bekor qilish</button><button id="saveEdit" class="success-btn">Saqlash</button></div></div></div>`);
  $("#cancelEdit").onclick=()=>$("#modal").remove();
  $("#saveEdit").onclick=async()=>{try{const p=$("#ePass").value;await api({action:"saveUser",token:token(),id:u.id,full_name:$("#eFull").value,username:$("#eLogin").value,department:$("#eDept").value,position:$("#ePos").value,password_hash:p?await sha256(p):""});$("#modal").remove();cacheDrop("users");cacheDrop("adminDashboard:");toast("Xodim ma’lumotlari yangilandi");renderUsers()}catch(e){toast(e.message,false)}};
}
async function renderPending(){
  const r=await api({action:"listAttendance",token:token(),status:"Kutilmoqda"});
  content.innerHTML=`<h1 class="page-title">Tasdiqlash kutilmoqda</h1><div class="card"><div class="table-wrap"><table><thead><tr><th>Xodim</th><th>Izoh</th><th>Lokatsiya</th><th>Yuborilgan</th><th>Admin izohi / qaror</th></tr></thead><tbody>
  ${r.items.map(x=>`<tr><td>${esc(x.full_name)}<br><small>${esc(x.department)}</small></td><td>${esc(x.note)}</td><td><a target="_blank" href="${esc(x.maps_url)}">📍 ${esc(x.location_text)}</a></td><td>${fmtDate(x.sent_at)}</td><td><input id="note_${x.id}" placeholder="Izoh (ixtiyoriy)"><button class="success-btn small decide" data-id="${x.id}" data-d="Tasdiqlandi">Tasdiqlash</button> <button class="danger-btn small decide" data-id="${x.id}" data-d="Rad etildi">Rad etish</button></td></tr>`).join("")||'<tr><td colspan="5">Kutilayotgan ma’lumot yo‘q.</td></tr>'}</tbody></table></div></div>`;
  document.querySelectorAll(".decide").forEach(b=>b.onclick=async()=>{try{await api({action:"decideAttendance",token:token(),id:b.dataset.id,decision:b.dataset.d,admin_note:$("#note_"+b.dataset.id).value});cacheDrop("attendance:");cacheDrop("adminDashboard:");cacheDrop("myStats:");toast("Qaror saqlandi");renderPending()}catch(e){toast(e.message,false)}})
}
async function renderAllAttendance(month=monthVal()){
  const r=await cachedApi("attendance:"+month,{action:"listAttendance",token:token(),month},30000);
  content.innerHTML=`<h1 class="page-title">Barcha davomatlar</h1><div class="card"><div class="toolbar"><input id="allMonth" type="month" value="${month}"><button id="allShow" class="success-btn">Ko‘rsatish</button></div><div class="table-wrap"><table><thead><tr><th>Xodim</th><th>Izoh</th><th>Lokatsiya</th><th>Yuborilgan</th><th>Tasdiqlangan</th><th>Holat</th><th>Admin izohi</th></tr></thead><tbody>
  ${r.items.map(x=>`<tr><td>${esc(x.full_name)}</td><td>${esc(x.note)}</td><td><a target="_blank" href="${esc(x.maps_url)}">📍 ${esc(x.location_text)}</a></td><td>${fmtDate(x.sent_at)}</td><td>${fmtDate(x.confirmed_at)}</td><td>${badge(x.status)}</td><td>${esc(x.admin_note||"")}</td></tr>`).join("")||'<tr><td colspan="7">Ma’lumot yo‘q.</td></tr>'}</tbody></table></div></div>`;
  $("#allShow").onclick=()=>renderAllAttendance($("#allMonth").value);
}
async function renderMonthly(month=monthVal()){
  const r=await cachedApi("adminDashboard:"+month,{action:"adminDashboard",token:token(),month},30000);
  content.innerHTML=`<h1 class="page-title">Oylik hisobot</h1><div class="card"><div class="toolbar"><input id="repMonth" type="month" value="${month}"><button id="repShow" class="success-btn">Ko‘rsatish</button></div>
  <h3>${esc(month)} oy yakuni</h3><p><b>${r.no_submission}</b> nafar xodim oy davomida davomat yubormagan.</p><p><b>${r.approved}</b> ta yozuv tasdiqlangan, <b>${r.rejected}</b> ta rad etilgan, <b>${r.pending}</b> ta kutilmoqda.</p>
  <div class="table-wrap"><table><thead><tr><th>Xodim</th><th>Bo‘lim</th><th>Jami yuborgan</th><th>Tasdiqlandi</th><th>Rad etildi</th><th>Kutilmoqda</th></tr></thead><tbody>${r.by_user.map(x=>`<tr><td>${esc(x.full_name)}</td><td>${esc(x.department)}</td><td>${x.total}</td><td>${x.approved}</td><td>${x.rejected}</td><td>${x.pending}</td></tr>`).join("")}</tbody></table></div></div>`;
  $("#repShow").onclick=()=>renderMonthly($("#repMonth").value);
}
async function renderSettings(){
  const r=await cachedApi("settings",{action:"getSettings",token:token()},120000);
  content.innerHTML=`<h1 class="page-title">Sozlamalar</h1><div class="card"><div class="field"><label>Tashkilot nomi</label><input id="orgName" value="${esc(r.settings.org_name||"")}"></div>
  <div class="field"><label>Google Sheet manzili</label><input value="${esc(C.SHEET_URL)}" disabled></div>
  <p class="note">Qurilma biriktirish: xodim birinchi kirgan qurilma avtomatik biriktiriladi. Telefon almashtirilsa Xodimlar bo‘limidan “Qurilmani almashtirish” bosing.</p>
  <button id="saveSettings" class="success-btn">Saqlash</button></div>`;
  $("#saveSettings").onclick=async()=>{try{await api({action:"saveSettings",token:token(),org_name:$("#orgName").value});cacheDrop("settings");toast("Sozlamalar saqlandi")}catch(e){toast(e.message,false)}};
}

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("#installBtn").classList.remove("hidden");$("#installBtnLogin").classList.remove("hidden")});
async function installPWA(){if(!deferredPrompt){toast("Brauzer menyusidan “Install app / Add to Home screen” ni tanlang.",false);return}deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}
$("#installBtn").onclick=installPWA;$("#installBtnLogin").onclick=installPWA;
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
bootstrap();
