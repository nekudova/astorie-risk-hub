let CATALOG = null;
let state = { id:null, adviser:{}, client:{}, questionnaire:{}, activity:null, risks:[], selected_insurers:[], additional_requirements:[], title:"", status:"rozpracováno" };
let currentRiskIndex = null;

const $ = (id)=>document.getElementById(id);
const text = (v)=> (v ?? "").toString().trim();

async function api(path, opts={}){
  const r = await fetch(path, {headers:{"Content-Type":"application/json"}, ...opts});
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.detail || data.message || "Chyba požadavku");
  return data;
}

async function init(){
  CATALOG = await api('/api/catalog');
  bindLogin();
  bindUI();
  const savedUser = JSON.parse(localStorage.getItem('arh_user') || 'null');
  if(savedUser) enterApp(savedUser);
}

function bindLogin(){
  $('loginBtn').onclick = ()=>{
    const email = text($('loginEmail').value).toLowerCase();
    const pass = $('loginPassword').value;
    const user = CATALOG.advisers.find(u=>u.email.toLowerCase()===email && u.password===pass);
    if(!user){ alert('Neplatné přihlášení.'); return; }
    localStorage.setItem('arh_user', JSON.stringify(user));
    enterApp(user);
  };
  $('logoutBtn').onclick = ()=>{ localStorage.removeItem('arh_user'); location.reload(); };
}

function enterApp(user){
  $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden'); $('logoutBtn').classList.remove('hidden');
  state.adviser = {name:user.name,email:user.email,role:user.role,company:user.company,registration:user.registration};
  fillAdviser();
  renderCatalogs();
  resetInquiry(false);
  if(user.role === 'admin') { $('adminNavBtn').classList.remove('hidden'); renderAdmin(); }
  showMainApp();
}

function fillAdviser(){
  $('adviserName').value = state.adviser.name || '';
  $('adviserEmail').value = state.adviser.email || '';
  $('adviserRole').value = state.adviser.role === 'admin' ? 'Admin / makléř' : 'Poradce / makléř';
  $('adviserCompany').value = state.adviser.company || 'ASTORIE a.s.';
  $('adviserRegistration').value = state.adviser.registration || 'samostatný zprostředkovatel';
}

function bindUI(){
  $('aresBtn').onclick = loadAres;
  $('activitySelect').onchange = ()=>selectActivity($('activitySelect').value);
  $('addRiskBtn').onclick = addCustomRisk;
  $('addRequirementBtn').onclick = addRequirement;
  $('saveInquiryBtn').onclick = saveInquiry;
  $('loadListBtn').onclick = loadInquiries;
  $('newInquiryBtn').onclick = ()=>resetInquiry(true);
  $('closeModal').onclick = ()=>$('riskModal').classList.add('hidden');
  $('saveRiskDetail').onclick = saveRiskModal;
  document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>showTab(btn.dataset.tab));
  if($('adminNavBtn')) $('adminNavBtn').onclick = showAdminApp;
  if($('backToInquiryBtn')) $('backToInquiryBtn').onclick = showMainApp;
  document.querySelectorAll('.admin-tab').forEach(btn=>btn.onclick=()=>showAdminTab(btn.dataset.adminTab));
  if($('addInsurerAdmin')) $('addInsurerAdmin').onclick = addAdminInsurer;
  if($('addAdviserAdmin')) $('addAdviserAdmin').onclick = addAdminAdviser;
  if($('addReqTypeAdmin')) $('addReqTypeAdmin').onclick = addAdminReqType;
  if($('saveAdminCatalogs')) $('saveAdminCatalogs').onclick = saveAdminCatalogs;
  ['insuranceStart','insurancePeriodSelect','insurancePeriodCustom','turnover','employees','territorySelect','territoryCustom','exportSelect','exportCustom','clientIco','clientName','clientLegal','clientAddress','clientDataBox','clientContact','clientEmail','clientPhone','clientWeb'].forEach(id=>$(id).addEventListener('input', updateDocs));
}

function renderCatalogs(){
  $('activitySelect').innerHTML = CATALOG.activities.map(a=>`<option value="${a.code}">${a.name}</option>`).join('');
  $('insurersList').innerHTML = CATALOG.insurers.filter(i=>i.active).map(i=>`<label class="check"><input type="checkbox" value="${i.id}"> <b>${i.short}</b> ${i.name}</label>`).join('');
  $('insurersList').querySelectorAll('input').forEach(cb=>cb.onchange=()=>{ collectForm(); updateDocs(); });
}

function resetInquiry(confirmIt){
  if(confirmIt && !confirm('Opravdu založit novou poptávku? Neuložené změny se ztratí.')) return;
  const user = state.adviser;
  state = { id:null, adviser:user, client:{}, questionnaire:{}, activity:null, risks:[], selected_insurers:[], additional_requirements:[], title:"", status:"rozpracováno" };
  $('inquiryId').value = '';
  ['clientIco','clientName','clientLegal','clientAddress','clientDataBox','clientContact','clientEmail','clientPhone','clientWeb','insuranceStart','insurancePeriodCustom','turnover','employees','territoryCustom','exportCustom'].forEach(id=>$(id).value='');
  $('insurancePeriodSelect').value='1 rok'; $('territorySelect').value='Česká republika'; $('exportSelect').value='Ne';
  $('insurersList').querySelectorAll('input').forEach(cb=>cb.checked=false);
  $('requirementsList').innerHTML='';
  fillAdviser(); selectActivity(CATALOG.activities[0].code);
}

async function loadAres(){
  $('aresMsg').textContent = 'Načítám údaje z ARES...';
  try{
    const d = await api('/api/ares/' + encodeURIComponent($('clientIco').value));
    $('clientIco').value = d.ico || $('clientIco').value;
    $('clientName').value = d.name || '';
    $('clientLegal').value = d.legal_form || '';
    $('clientAddress').value = d.address || '';
    $('clientDataBox').value = d.data_box || '';
    $('aresMsg').textContent = 'Údaje z ARES byly načteny. Zkontrolujte je a doplňte chybějící informace.';
  }catch(e){ $('aresMsg').textContent = e.message; }
  updateDocs();
}

function selectActivity(code){
  const activity = CATALOG.activities.find(a=>a.code===code) || CATALOG.activities[0];
  state.activity = activity;
  $('activitySelect').value = activity.code;
  $('activityProfile').innerHTML = `<h3>${activity.name}</h3><p>${activity.description}</p><p><b>Rizikovost:</b> ${activity.risk_level}</p><p><b>Orientační limit:</b> ${activity.limit_hint}</p>`;
  state.risks = JSON.parse(JSON.stringify(CATALOG.risks[activity.code] || [])).map(r=>({...r, enabled: r.default_on !== false, note:''}));
  renderRisks(); updateDocs();
}

function renderRisks(){
  $('risksGrid').innerHTML = state.risks.map((r,i)=>`<div class="risk-card ${r.enabled?'':'off'}" data-i="${i}"><span class="pill">${r.priority||'VLASTNÍ'}</span><h3>${r.name}</h3><p>${r.description||''}</p><p><b>Limit:</b> ${r.limit||''}</p><p>${r.enabled?'Zahrnuto do poptávky':'Vyřazeno z poptávky'}</p></div>`).join('');
  $('risksGrid').querySelectorAll('.risk-card').forEach(card=>card.onclick=()=>openRisk(+card.dataset.i));
}
function openRisk(i){
  currentRiskIndex=i; const r=state.risks[i];
  $('modalTitle').textContent = r.name; $('modalEnabled').value=String(!!r.enabled); $('modalLimit').value=r.limit||''; $('modalQuestion').value=r.question||''; $('modalDescription').value=r.description||''; $('modalReason').value=r.reason||''; $('modalNote').value=r.note||''; $('riskModal').classList.remove('hidden');
}
function saveRiskModal(){
  const r=state.risks[currentRiskIndex];
  r.enabled = $('modalEnabled').value === 'true'; r.limit=$('modalLimit').value; r.question=$('modalQuestion').value; r.description=$('modalDescription').value; r.reason=$('modalReason').value; r.note=$('modalNote').value;
  $('riskModal').classList.add('hidden'); renderRisks(); updateDocs();
}
function addCustomRisk(){
  state.risks.push({id:'custom_'+Date.now(),name:'Vlastní riziko',priority:'VLASTNÍ',enabled:true,description:'Doplňte popis rizika.',limit:'dle dohody s klientem a požadavků pojišťovny',question:'Doplňte otázku pro klienta.',reason:'Doplňte důvod doporučení.',note:''});
  renderRisks(); openRisk(state.risks.length-1);
}

function addRequirement(req={}){
  const id='req_'+Date.now()+'_'+Math.random().toString(16).slice(2);
  const types = CATALOG.requirementTypes.map(t=>`<option value="${t.id}" ${req.type===t.id?'selected':''}>${t.name}</option>`).join('');
  const div=document.createElement('div'); div.className='req-row'; div.dataset.id=id;
  div.innerHTML = `<label>Typ<select class="reqType">${types}</select></label><label>Text požadavku<input class="reqText" value="${req.text||''}" placeholder="např. požadavek na vyloučení konkrétní výluky"></label><label>Propisovat<select class="reqOutput"><option value="all">všude</option><option value="insurer">jen pojišťovně</option><option value="client">jen klientovi</option><option value="zzj">jen ZZJ</option></select></label><button class="secondary reqDel">Smazat</button>`;
  $('requirementsList').appendChild(div);
  div.querySelector('.reqDel').onclick=()=>{div.remove(); updateDocs();};
  div.querySelectorAll('input,select').forEach(el=>el.oninput=updateDocs);
  updateDocs();
}

function collectForm(){
  state.id = $('inquiryId').value ? Number($('inquiryId').value) : null;
  state.adviser = {name:$('adviserName').value,email:$('adviserEmail').value,role:$('adviserRole').value,company:$('adviserCompany').value,registration:$('adviserRegistration').value};
  state.client = {ico:$('clientIco').value,name:$('clientName').value,legal_form:$('clientLegal').value,address:$('clientAddress').value,data_box:$('clientDataBox').value,contact_person:$('clientContact').value,contact_email:$('clientEmail').value,contact_phone:$('clientPhone').value,website:$('clientWeb').value};
  const period = $('insurancePeriodSelect').value === 'custom' ? $('insurancePeriodCustom').value : $('insurancePeriodSelect').value;
  const territory = $('territorySelect').value === 'custom' ? $('territoryCustom').value : $('territorySelect').value;
  const exportInfo = $('exportSelect').value === 'custom' ? $('exportCustom').value : $('exportSelect').value;
  state.questionnaire = {insurance_start:$('insuranceStart').value, insurance_period:period, turnover:$('turnover').value, employees:$('employees').value, territory, export_info:exportInfo};
  state.selected_insurers = Array.from($('insurersList').querySelectorAll('input:checked')).map(cb=>CATALOG.insurers.find(i=>i.id===cb.value));
  state.additional_requirements = Array.from(document.querySelectorAll('.req-row')).map(row=>({type:row.querySelector('.reqType').value, typeName: CATALOG.requirementTypes.find(t=>t.id===row.querySelector('.reqType').value)?.name, text:row.querySelector('.reqText').value, output:row.querySelector('.reqOutput').value})).filter(r=>text(r.text));
  state.title = `Poptávka – ${state.client.name || 'klient'} – ${state.activity?.name || ''}`;
  return state;
}

async function saveInquiry(){
  collectForm();
  if(!text(state.client.name)){ alert('Doplň název klienta.'); return; }
  $('saveStatus').textContent = 'Ukládám...';
  try{
    const res = await api('/api/inquiries', {method:'POST', body:JSON.stringify(state)});
    if(res.id){ state.id=res.id; $('inquiryId').value=res.id; }
    $('saveStatus').textContent = res.message || 'Uloženo.';
    await loadInquiries();
  }catch(e){ $('saveStatus').textContent = 'Chyba: '+e.message; }
}

async function loadInquiries(){
  const box=$('inquiriesList'); box.innerHTML='Načítám...';
  try{
    const res=await api('/api/inquiries');
    if(!res.items.length){box.innerHTML='<p class="muted">Zatím nejsou uložené žádné poptávky.</p>'; return;}
    box.innerHTML=res.items.map(it=>`<div class="item"><div><b>${it.title}</b><br><span class="muted">${it.client_name||''} · ${it.ico||''} · ${it.status||''} · ${it.updated_at ? new Date(it.updated_at).toLocaleString('cs-CZ') : ''}</span></div><button class="secondary" data-id="${it.id}">Otevřít</button></div>`).join('');
    box.querySelectorAll('button').forEach(b=>b.onclick=()=>openInquiry(b.dataset.id));
  }catch(e){ box.innerHTML='<p class="muted">Nepodařilo se načíst poptávky: '+e.message+'</p>'; }
}

async function openInquiry(id){
  const res=await api('/api/inquiries/'+id); const item=res.item;
  state = item; state.id = Number(id);
  fillStateToForm(); renderRisks(); updateDocs(); window.scrollTo({top:0,behavior:'smooth'});
}
function fillStateToForm(){
  $('inquiryId').value=state.id||''; fillAdviser();
  const c=state.client||{}; $('clientIco').value=c.ico||''; $('clientName').value=c.name||''; $('clientLegal').value=c.legal_form||''; $('clientAddress').value=c.address||''; $('clientDataBox').value=c.data_box||''; $('clientContact').value=c.contact_person||''; $('clientEmail').value=c.contact_email||''; $('clientPhone').value=c.contact_phone||''; $('clientWeb').value=c.website||'';
  const q=state.questionnaire||{}; $('insuranceStart').value=q.insurance_start||''; $('insurancePeriodSelect').value=['1 rok','3 roky','neurčito'].includes(q.insurance_period)?q.insurance_period:'custom'; $('insurancePeriodCustom').value=$('insurancePeriodSelect').value==='custom'?q.insurance_period||'':''; $('turnover').value=q.turnover||''; $('employees').value=q.employees||''; $('territorySelect').value=['Česká republika','Česká republika + EU','Evropa','Svět bez USA/Kanady'].includes(q.territory)?q.territory:'custom'; $('territoryCustom').value=$('territorySelect').value==='custom'?q.territory||'':''; $('exportSelect').value=['Ne','Ano – EU','Ano – mimo EU','Ano – USA/Kanada'].includes(q.export_info)?q.export_info:'custom'; $('exportCustom').value=$('exportSelect').value==='custom'?q.export_info||'':'';
  const act=CATALOG.activities.find(a=>a.code===(state.activity?.code || state.activity_code)); if(act){state.activity=act; $('activitySelect').value=act.code; $('activityProfile').innerHTML=`<h3>${act.name}</h3><p>${act.description}</p><p><b>Rizikovost:</b> ${act.risk_level}</p><p><b>Orientační limit:</b> ${act.limit_hint}</p>`;}
  $('insurersList').querySelectorAll('input').forEach(cb=>cb.checked=(state.selected_insurers||[]).some(i=>i && i.id===cb.value));
  $('requirementsList').innerHTML=''; (state.additional_requirements||[]).forEach(addRequirement);
}

function updateDocs(){ collectForm(); renderDocs(); }
function riskRows(){return (state.risks||[]).filter(r=>r.enabled).map(r=>`<tr><td><b>${r.name}</b></td><td>${r.reason||r.description||''}</td><td>${r.limit||''}</td></tr>`).join('') || '<tr><td colspan="3">Bez vybraných rizik.</td></tr>';}
function reqList(output){ const rows=(state.additional_requirements||[]).filter(r=>r.output==='all'||r.output===output).map(r=>`<li><b>${r.typeName||r.type}:</b> ${r.text}</li>`).join(''); return rows?`<ul>${rows}</ul>`:'<p>Bez dalších požadavků.</p>';}
function insurersText(){return (state.selected_insurers||[]).map(i=>`${i.short} – ${i.name}`).join('<br>') || 'Pojišťovny zatím nejsou vybrány.';}
function renderDocs(){
  const c=state.client||{}, q=state.questionnaire||{}, a=state.activity||{};
  $('insurerDoc').innerHTML = `<h2>Poptávka na pojištění podnikatelských rizik</h2><h3>Klient</h3><table><tr><th>Název</th><td>${c.name||''}</td></tr><tr><th>IČO</th><td>${c.ico||''}</td></tr><tr><th>Sídlo</th><td>${c.address||''}</td></tr><tr><th>Kontakt</th><td>${c.contact_person||''} ${c.contact_email||''} ${c.contact_phone||''}</td></tr><tr><th>Činnost</th><td>${a.name||''}</td></tr><tr><th>Obrat / zaměstnanci</th><td>${q.turnover||''} / ${q.employees||''}</td></tr><tr><th>Území / export</th><td>${q.territory||''}; export: ${q.export_info||''}</td></tr><tr><th>Pojistná doba</th><td>${q.insurance_period||''}</td></tr></table><h3>Oslovené pojišťovny</h3><p>${insurersText()}</p><h3>Požadovaná rizika</h3><table><tr><th>Riziko</th><th>Důvod / poznámka</th><th>Limit</th></tr>${riskRows()}</table><h3>Doplňující požadavky</h3>${reqList('insurer')}`;
  $('clientDoc').innerHTML = `<h2>Klientské shrnutí návrhu poptávky</h2><p>Tento pracovní výstup shrnuje rizika, která byla identifikována podle činnosti klienta a odpovědí ve vstupním dotazníku.</p><table><tr><th>Klient</th><td>${c.name||''}</td></tr><tr><th>Činnost</th><td>${a.name||''}</td></tr><tr><th>Územní rozsah</th><td>${q.territory||''}</td></tr></table><h3>Hlavní identifikovaná rizika</h3><table><tr><th>Riziko</th><th>Proč jej řešíme</th><th>Orientační limit</th></tr>${riskRows()}</table><h3>Doplňující požadavky klienta</h3>${reqList('client')}`;
  $('zzjDoc').innerHTML = `<h2>Podklad pro záznam z jednání</h2><table><tr><th>Poradce</th><td>${state.adviser.name||''}, ${state.adviser.email||''}</td></tr><tr><th>Klient</th><td>${c.name||''}, IČO ${c.ico||''}</td></tr><tr><th>Požadavek klienta</th><td>Příprava poptávky podnikatelského pojištění pro oblast ${a.name||''}.</td></tr><tr><th>Oslovené pojišťovny</th><td>${insurersText()}</td></tr></table><h3>Důvody doporučených rizik</h3><table><tr><th>Riziko</th><th>Důvod</th><th>Limit</th></tr>${riskRows()}</table><h3>Doplňující informace do ZZJ</h3>${reqList('zzj')}`;
}
function showTab(id){ document.querySelectorAll('.doc-view').forEach(x=>x.classList.add('hidden')); $(id).classList.remove('hidden'); document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id)); }


function showMainApp(){
  document.querySelectorAll('#appView > section, #appView > .hero').forEach(el=>{
    if(el.id !== 'adminPanel') el.classList.remove('hidden');
  });
  $('adminPanel').classList.add('hidden');
  $('backToInquiryBtn')?.classList.add('hidden');
  if($('adminNavBtn') && state.adviser?.role === 'admin') $('adminNavBtn').classList.remove('hidden');
}
function showAdminApp(){
  document.querySelectorAll('#appView > section, #appView > .hero').forEach(el=>{
    if(el.id !== 'adminPanel') el.classList.add('hidden');
  });
  $('adminPanel').classList.remove('hidden');
  $('adminNavBtn')?.classList.add('hidden');
  $('backToInquiryBtn')?.classList.remove('hidden');
  renderAdmin();
  window.scrollTo({top:0,behavior:'smooth'});
}
function showAdminTab(id){
  document.querySelectorAll('.admin-section').forEach(x=>x.classList.add('hidden'));
  $(id).classList.remove('hidden');
  document.querySelectorAll('.admin-tab').forEach(t=>t.classList.toggle('active', t.dataset.adminTab===id));
}
function renderAdmin(){ renderAdminInsurers(); renderAdminAdvisers(); renderAdminReqTypes(); }
function renderAdminInsurers(){
  const rows = (CATALOG.insurers||[]).map((i,idx)=>`<div class="admin-row insurer" data-idx="${idx}"><input class="adm-id" value="${i.id||''}" placeholder="id"><input class="adm-name" value="${i.name||''}" placeholder="název pojišťovny"><input class="adm-short" value="${i.short||''}" placeholder="zkratka"><select class="adm-active"><option value="true" ${i.active?'selected':''}>aktivní</option><option value="false" ${!i.active?'selected':''}>neaktivní</option></select><button class="secondary adm-del">Smazat</button></div>`).join('');
  $('insurersAdminTable').innerHTML = `<div class="admin-row insurer admin-head"><div>ID</div><div>Název</div><div>Zkratka</div><div>Stav</div><div></div></div>${rows}`;
  $('insurersAdminTable').querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.insurers.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminInsurers(); renderCatalogs(); updateDocs(); });
  $('insurersAdminTable').querySelectorAll('input,select').forEach(el=>el.oninput=collectAdminInsurers);
}
function collectAdminInsurers(){
  CATALOG.insurers = Array.from(document.querySelectorAll('#insurersAdminTable .admin-row.insurer:not(.admin-head)')).map(row=>({id:row.querySelector('.adm-id').value.trim() || ('ins_'+Date.now()), name:row.querySelector('.adm-name').value.trim(), short:row.querySelector('.adm-short').value.trim(), active:row.querySelector('.adm-active').value==='true'}));
  renderCatalogs(); updateDocs();
}
function addAdminInsurer(){ collectAdminInsurers(); CATALOG.insurers.push({id:'nova_'+Date.now(), name:'Nová pojišťovna', short:'', active:true}); renderAdminInsurers(); renderCatalogs(); }
function renderAdminAdvisers(){
  const rows = (CATALOG.advisers||[]).map((a,idx)=>`<div class="admin-row adviser" data-idx="${idx}"><input class="adm-email" value="${a.email||''}" placeholder="email"><input class="adm-name" value="${a.name||''}" placeholder="jméno"><select class="adm-role"><option value="advisor" ${a.role!=='admin'?'selected':''}>poradce</option><option value="admin" ${a.role==='admin'?'selected':''}>admin</option></select><input class="adm-company" value="${a.company||'ASTORIE a.s.'}" placeholder="společnost"><input class="adm-reg" value="${a.registration||''}" placeholder="registrace"><button class="secondary adm-del">Smazat</button></div>`).join('');
  $('advisersAdminTable').innerHTML = `<div class="admin-row adviser admin-head"><div>E-mail</div><div>Jméno</div><div>Role</div><div>Společnost</div><div>Status</div><div></div></div>${rows}`;
  $('advisersAdminTable').querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.advisers.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminAdvisers(); });
  $('advisersAdminTable').querySelectorAll('input,select').forEach(el=>el.oninput=collectAdminAdvisers);
}
function collectAdminAdvisers(){
  const oldByEmail = Object.fromEntries((CATALOG.advisers||[]).map(a=>[a.email,a]));
  CATALOG.advisers = Array.from(document.querySelectorAll('#advisersAdminTable .admin-row.adviser:not(.admin-head)')).map(row=>{ const email=row.querySelector('.adm-email').value.trim(); return {email, name:row.querySelector('.adm-name').value.trim(), role:row.querySelector('.adm-role').value, company:row.querySelector('.adm-company').value.trim(), registration:row.querySelector('.adm-reg').value.trim(), password:(oldByEmail[email]?.password || 'Astorie2026!')}; });
}
function addAdminAdviser(){ collectAdminAdvisers(); CATALOG.advisers.push({email:'novy.poradce@astorie.local', name:'Nový poradce', role:'advisor', company:'ASTORIE a.s.', registration:'samostatný zprostředkovatel', password:'Astorie2026!'}); renderAdminAdvisers(); }
function renderAdminReqTypes(){
  const rows = (CATALOG.requirementTypes||[]).map((r,idx)=>`<div class="admin-row reqtype" data-idx="${idx}"><input class="adm-id" value="${r.id||''}" placeholder="id"><input class="adm-name" value="${r.name||''}" placeholder="název"><button class="secondary adm-del">Smazat</button></div>`).join('');
  $('reqTypesAdminTable').innerHTML = `<div class="admin-row reqtype admin-head"><div>ID</div><div>Název</div><div></div></div>${rows}`;
  $('reqTypesAdminTable').querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.requirementTypes.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminReqTypes(); });
  $('reqTypesAdminTable').querySelectorAll('input').forEach(el=>el.oninput=collectAdminReqTypes);
}
function collectAdminReqTypes(){
  CATALOG.requirementTypes = Array.from(document.querySelectorAll('#reqTypesAdminTable .admin-row.reqtype:not(.admin-head)')).map(row=>({id:row.querySelector('.adm-id').value.trim() || ('typ_'+Date.now()), name:row.querySelector('.adm-name').value.trim()}));
}
function addAdminReqType(){ collectAdminReqTypes(); CATALOG.requirementTypes.push({id:'novy_'+Date.now(), name:'Nový typ doplňující informace'}); renderAdminReqTypes(); }
async function saveAdminCatalogs(){
  collectAdminInsurers(); collectAdminAdvisers(); collectAdminReqTypes();
  $('adminSaveStatus').textContent='Ukládám do databáze...';
  try{
    const res = await api('/api/admin/catalogs', {method:'POST', body:JSON.stringify({actor_email:state.adviser?.email||'', insurers:CATALOG.insurers, advisers:CATALOG.advisers, requirementTypes:CATALOG.requirementTypes})});
    $('adminSaveStatus').textContent=res.message || 'Uloženo.';
    renderCatalogs(); updateDocs();
  }catch(e){ $('adminSaveStatus').textContent='Chyba: '+e.message; }
}

init();
