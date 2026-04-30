let CATALOG = null;
let state = {
  id:null,
  adviser:{}, client:{}, questionnaire:{}, activity:null,
  risks:[], selected_insurers:[], additional_requirements:[], offers:{},
  title:"", status:"rozpracováno"
};
let currentRiskIndex = null;
let currentUser = null;

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
    const user = (CATALOG.advisers||[]).find(u=>(u.email||'').toLowerCase()===email && u.password===pass);
    if(!user){ alert('Neplatné přihlášení.'); return; }
    localStorage.setItem('arh_user', JSON.stringify(user));
    enterApp(user);
  };
  $('logoutBtn').onclick = ()=>{ localStorage.removeItem('arh_user'); location.reload(); };
}

function enterApp(user){
  currentUser = user;
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('logoutBtn').classList.remove('hidden');
  state.adviser = {name:user.name,email:user.email,role:user.role,company:user.company,registration:user.registration};
  document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden', user.role !== 'admin'));
  fillAdviser();
  renderCatalogs();
  resetInquiry(false);
  renderAdmin();
  showView('inquiryView');
}

function fillAdviser(){
  $('adviserName').value = state.adviser.name || '';
  $('adviserEmail').value = state.adviser.email || '';
  $('adviserRole').value = state.adviser.role === 'admin' ? 'Admin / makléř' : 'Poradce / makléř';
  $('adviserCompany').value = state.adviser.company || 'ASTORIE a.s.';
  $('adviserRegistration').value = state.adviser.registration || 'samostatný zprostředkovatel';
}

function bindUI(){
  document.querySelectorAll('.nav-btn').forEach(btn=>btn.onclick=()=>showView(btn.dataset.view));
  $('aresBtn').onclick = loadAres;
  $('activitySelect').onchange = ()=>selectActivity($('activitySelect').value);
  $('addRiskBtn').onclick = addCustomRisk;
  $('addRequirementBtn').onclick = ()=>addRequirement();
  $('saveInquiryBtn').onclick = saveInquiry;
  $('loadListBtn').onclick = loadInquiries;
  $('newInquiryBtn').onclick = ()=>resetInquiry(true);
  $('refreshOffersBtn').onclick = renderOffers;
  $('closeModal').onclick = ()=>$('riskModal').classList.add('hidden');
  $('saveRiskDetail').onclick = saveRiskModal;
  document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>showTab(btn.dataset.tab));
  document.querySelectorAll('.admin-tab').forEach(btn=>btn.onclick=()=>showAdminTab(btn.dataset.adminTab));
  $('addInsurerAdmin').onclick = addAdminInsurer;
  $('addAdviserAdmin').onclick = addAdminAdviser;
  $('addReqTypeAdmin').onclick = addAdminReqType;
  $('saveAdminCatalogs').onclick = saveAdminCatalogs;
  if($('refreshGuideBtn')) $('refreshGuideBtn').onclick = renderGuide;
  if($('saveSuggestionBtn')) $('saveSuggestionBtn').onclick = saveSuggestion;
  if($('loadSuggestionsBtn')) $('loadSuggestionsBtn').onclick = loadSuggestions;
  document.querySelectorAll('input[name=advisorMode]').forEach(r=>r.onchange=renderGuide);
  ['insuranceStart','insurancePeriodSelect','insurancePeriodCustom','turnover','employees','territorySelect','territoryCustom','exportSelect','exportCustom','clientIco','clientName','clientLegal','clientAddress','clientDataBox','clientContact','clientEmail','clientPhone','clientWeb','adviserName','adviserEmail','adviserCompany','adviserRegistration'].forEach(id=>$(id).addEventListener('input', updateAll));
}

function showView(id){
  collectForm();
  document.querySelectorAll('.app-section').forEach(x=>x.classList.add('hidden'));
  $(id).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===id));
  if(id==='offersView') renderOffers();
  if(id==='comparisonView') renderComparison();
  if(id==='guideView') renderGuide();
  if(id==='suggestionsView') loadSuggestions();
  if(id==='adminView') renderAdmin();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderCatalogs(){
  $('activitySelect').innerHTML = (CATALOG.activities||[]).map(a=>`<option value="${a.code}">${a.name}</option>`).join('');
  $('insurersList').innerHTML = (CATALOG.insurers||[]).filter(i=>i.active).map(i=>`<label class="check"><input type="checkbox" value="${i.id}"> <b>${i.short||''}</b> ${i.name||''}</label>`).join('');
  $('insurersList').querySelectorAll('input').forEach(cb=>cb.onchange=()=>{ syncSelectedInsurers(); renderOffers(); updateAll(); });
}

function resetInquiry(confirmIt){
  if(confirmIt && !confirm('Opravdu založit novou poptávku? Neuložené změny se ztratí.')) return;
  const user = state.adviser;
  state = { id:null, adviser:user, client:{}, questionnaire:{}, activity:null, risks:[], selected_insurers:[], additional_requirements:[], offers:{}, title:"", status:"rozpracováno" };
  $('inquiryId').value = '';
  ['clientIco','clientName','clientLegal','clientAddress','clientDataBox','clientContact','clientEmail','clientPhone','clientWeb','insuranceStart','insurancePeriodCustom','turnover','employees','territoryCustom','exportCustom'].forEach(id=>$(id).value='');
  $('insurancePeriodSelect').value='1 rok'; $('territorySelect').value='Česká republika'; $('exportSelect').value='Ne';
  $('insurersList').querySelectorAll('input').forEach(cb=>cb.checked=false);
  $('requirementsList').innerHTML='';
  $('inquiriesList').innerHTML='';
  fillAdviser();
  selectActivity((CATALOG.activities&&CATALOG.activities[0]?.code) || 'construction');
  updateAll();
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
  updateAll();
}

function selectActivity(code){
  const activity = (CATALOG.activities||[]).find(a=>a.code===code) || (CATALOG.activities||[])[0];
  if(!activity) return;
  state.activity = activity;
  $('activitySelect').value = activity.code;
  $('activityProfile').innerHTML = `<h3>${activity.name}</h3><p>${activity.description||''}</p><p><b>Rizikovost:</b> ${activity.risk_level||''}</p><p><b>Orientační limit:</b> ${activity.limit_hint||''}</p>`;
  state.risks = JSON.parse(JSON.stringify((CATALOG.risks||{})[activity.code] || [])).map(r=>({...r, enabled: r.default_on !== false, note:''}));
  renderRisks(); updateAll();
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
  $('riskModal').classList.add('hidden'); renderRisks(); renderOffers(); updateAll();
}
function addCustomRisk(){
  state.risks.push({id:'custom_'+Date.now(),name:'Vlastní riziko',priority:'VLASTNÍ',enabled:true,description:'Doplňte popis rizika.',limit:'dle dohody s klientem a požadavků pojišťovny',question:'Doplňte otázku pro klienta.',reason:'Doplňte důvod doporučení.',note:''});
  renderRisks(); openRisk(state.risks.length-1);
}

function addRequirement(req={}){
  const id='req_'+Date.now()+'_'+Math.random().toString(16).slice(2);
  const types = (CATALOG.requirementTypes||[]).map(t=>`<option value="${t.id}" ${req.type===t.id?'selected':''}>${t.name}</option>`).join('');
  const div=document.createElement('div'); div.className='req-row'; div.dataset.id=id;
  div.innerHTML = `<label>Typ<select class="reqType">${types}</select></label><label>Text požadavku<input class="reqText" value="${req.text||''}" placeholder="např. požadavek na vyloučení konkrétní výluky"></label><label>Propisovat<select class="reqOutput"><option value="all">všude</option><option value="insurer">jen pojišťovně</option><option value="client">jen klientovi</option><option value="zzj">jen ZZJ</option></select></label><button class="secondary reqDel">Smazat</button>`;
  $('requirementsList').appendChild(div);
  if(req.output) div.querySelector('.reqOutput').value=req.output;
  div.querySelector('.reqDel').onclick=()=>{div.remove(); updateAll();};
  div.querySelectorAll('input,select').forEach(el=>el.oninput=updateAll);
  updateAll();
}

function syncSelectedInsurers(){
  state.selected_insurers = Array.from($('insurersList').querySelectorAll('input:checked')).map(cb=>cb.value);
}
function collectForm(){
  state.id = $('inquiryId').value ? Number($('inquiryId').value) : null;
  state.adviser = {name:$('adviserName').value,email:$('adviserEmail').value,role:$('adviserRole').value,company:$('adviserCompany').value,registration:$('adviserRegistration').value};
  state.client = {ico:$('clientIco').value,name:$('clientName').value,legal_form:$('clientLegal').value,address:$('clientAddress').value,data_box:$('clientDataBox').value,contact_person:$('clientContact').value,contact_email:$('clientEmail').value,contact_phone:$('clientPhone').value,website:$('clientWeb').value};
  const period = $('insurancePeriodSelect').value === 'custom' ? $('insurancePeriodCustom').value : $('insurancePeriodSelect').value;
  const territory = $('territorySelect').value === 'custom' ? $('territoryCustom').value : $('territorySelect').value;
  const exp = $('exportSelect').value === 'custom' ? $('exportCustom').value : $('exportSelect').value;
  state.questionnaire = {insurance_start:$('insuranceStart').value,insurance_period:period,turnover:$('turnover').value,employees:$('employees').value,territory,export_info:exp};
  syncSelectedInsurers();
  state.additional_requirements = Array.from(document.querySelectorAll('.req-row')).map(row=>({type:row.querySelector('.reqType').value,text:row.querySelector('.reqText').value,output:row.querySelector('.reqOutput').value})).filter(r=>text(r.text));
  collectOffers(false);
  state.title = `Poptávka – ${state.client.name || 'klient'} – ${state.activity?.name || ''}`;
}

function insurerName(id){ const i=(CATALOG.insurers||[]).find(x=>x.id===id); return i ? `${i.short||''} ${i.name||''}`.trim() : id; }
function activeRisks(){ return (state.risks||[]).filter(r=>r.enabled); }
function selectedInsurers(){ return (state.selected_insurers||[]).map(id=>(CATALOG.insurers||[]).find(i=>i.id===id)).filter(Boolean); }

function updateAll(){ collectForm(); updateDocs(); renderComparison(); if(document.getElementById('guideView') && !document.getElementById('guideView').classList.contains('hidden')) renderGuide(); }
function showTab(id){
  document.querySelectorAll('.doc-view').forEach(x=>x.classList.add('hidden'));
  $(id).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===id));
}
function renderReqRows(output){
  const rows = state.additional_requirements.filter(r=>r.output==='all'||r.output===output).map(r=>`<tr><td>${labelReqType(r.type)}</td><td>${r.text}</td></tr>`).join('');
  return rows || `<tr><td colspan="2">Bez dalších požadavků nebo poznámek.</td></tr>`;
}
function labelReqType(id){ return ((CATALOG.requirementTypes||[]).find(t=>t.id===id)||{}).name || id || 'Poznámka'; }
function risksTable(){
  return activeRisks().map(r=>`<tr><td><b>${r.name}</b></td><td>${r.reason||r.description||''}${r.note?`<br><span class="muted">Pozn.: ${r.note}</span>`:''}</td><td>${r.limit||''}</td></tr>`).join('') || `<tr><td colspan="3">Zatím nejsou vybrána rizika.</td></tr>`;
}
function updateDocs(){
  collectForm();
  const insurers = selectedInsurers().map(i=>`${i.short||''} – ${i.name||''}`).join(', ') || 'Zatím nevybráno';
  const clientBlock = `<table><tr><th>Klient</th><td>${state.client.name||''}</td></tr><tr><th>IČO</th><td>${state.client.ico||''}</td></tr><tr><th>Sídlo</th><td>${state.client.address||''}</td></tr><tr><th>Kontakt</th><td>${state.client.contact_person||''} ${state.client.contact_email||''} ${state.client.contact_phone||''}</td></tr><tr><th>Činnost</th><td>${state.activity?.name||''}</td></tr><tr><th>Obrat / zaměstnanci</th><td>${state.questionnaire.turnover||''} / ${state.questionnaire.employees||''}</td></tr><tr><th>Územní rozsah</th><td>${state.questionnaire.territory||''}; export: ${state.questionnaire.export_info||''}</td></tr><tr><th>Pojistná doba</th><td>${state.questionnaire.insurance_period||''}; počátek: ${state.questionnaire.insurance_start||''}</td></tr><tr><th>Oslovené pojišťovny</th><td>${insurers}</td></tr></table>`;
  $('insurerDoc').innerHTML = `<h2>Poptávka pro pojišťovny</h2><p class="muted">Tento výstup je určený pro zaslání vybraným pojišťovnám. Obsahuje jednotné názvosloví ASTORIE, aby bylo možné nabídky následně porovnat.</p>${clientBlock}<h3>Požadovaná rizika a limity</h3><table><thead><tr><th>Riziko</th><th>Proč jej řešíme</th><th>Orientační limit</th></tr></thead><tbody>${risksTable()}</tbody></table><h3>Doplňující požadavky pro pojišťovnu</h3><table><thead><tr><th>Typ</th><th>Požadavek / poznámka</th></tr></thead><tbody>${renderReqRows('insurer')}</tbody></table>`;
  $('clientDoc').innerHTML = `<h2>Klientské shrnutí</h2><p>Na základě zjištěných údajů doporučujeme poptat níže uvedený rozsah pojištění. Konečné doporučení bude připraveno po vyhodnocení nabídek pojišťoven.</p>${clientBlock}<h3>Hlavní identifikovaná rizika</h3><table><thead><tr><th>Riziko</th><th>Proč je důležité</th><th>Limit</th></tr></thead><tbody>${risksTable()}</tbody></table><h3>Poznámky pro klienta</h3><table><tbody>${renderReqRows('client')}</tbody></table>`;
  $('zzjDoc').innerHTML = `<h2>Podklad pro záznam z jednání</h2><table><tr><th>Poradce</th><td>${state.adviser.name||''} (${state.adviser.email||''})</td></tr><tr><th>Klient</th><td>${state.client.name||''}, IČO ${state.client.ico||''}</td></tr><tr><th>Požadavky a potřeby</th><td>Klient požaduje poptání podnikatelského pojištění pro činnost: ${state.activity?.name||''}. Územní rozsah: ${state.questionnaire.territory||''}. Pojistná doba: ${state.questionnaire.insurance_period||''}.</td></tr><tr><th>Oslovené pojišťovny</th><td>${insurers}</td></tr></table><h3>Rizika zahrnutá do doporučení</h3><table><thead><tr><th>Riziko</th><th>Důvod</th><th>Limit</th></tr></thead><tbody>${risksTable()}</tbody></table><h3>Doplňující poznámky pro ZZJ</h3><table><tbody>${renderReqRows('zzj')}</tbody></table>`;
}

function renderOffers(){
  collectForm();
  const insurers = selectedInsurers();
  if(!insurers.length){ $('offersList').innerHTML='<div class="empty">Nejdříve vyber pojišťovny v poptávce.</div>'; return; }
  insurers.forEach(i=>{ if(!state.offers[i.id]) state.offers[i.id]={premium:'',deductible:'',valid_until:'',status:'čekáme na nabídku',note:'',coverages:{}}; });
  $('offersList').innerHTML = insurers.map(i=>offerCardHtml(i)).join('');
  $('offersList').querySelectorAll('input,select,textarea').forEach(el=>el.oninput=()=>{ collectOffers(true); renderComparison(); });
}
function getPolicyReference(insurerId, riskId){
  return (CATALOG.policyReferences||[]).find(x=>x.insurer_id===insurerId && x.risk_id===riskId) || null;
}
function getDictionary(riskId){
  return (CATALOG.coverageDictionary||[]).find(x=>x.risk_id===riskId) || null;
}
function offerCardHtml(insurer){
  const o = state.offers[insurer.id] || {};
  const coverageRows = activeRisks().map(r=>{
    const c=(o.coverages||{})[r.id]||{state:'nevyhodnoceno',limit:r.limit||'',note:'',original:'',source:''};
    const dict=getDictionary(r.id);
    const ref=getPolicyReference(insurer.id, r.id);
    const aliases=dict?.aliases?.length ? `<small>Možné názvy: ${dict.aliases.slice(0,4).join(', ')}</small>` : '';
    const sourceHint=ref ? `${ref.document}; ${ref.article}` : 'doplnit VPP/DPP, článek/odstavec';
    return `<div class="coverage-row rich" data-risk-id="${r.id}"><div><b>${r.name}</b><small>Požadavek: ${r.limit||''}</small>${aliases}</div><select class="cov-state"><option ${c.state==='nevyhodnoceno'?'selected':''}>nevyhodnoceno</option><option ${c.state==='splněno'?'selected':''}>splněno</option><option ${c.state==='částečně'?'selected':''}>částečně</option><option ${c.state==='nesplněno'?'selected':''}>nesplněno</option><option ${c.state==='výluka'?'selected':''}>výluka</option></select><input class="cov-limit" value="${c.limit||''}" placeholder="limit v nabídce"><input class="cov-original" value="${c.original||''}" placeholder="název v nabídce pojišťovny"><input class="cov-source" value="${c.source||sourceHint}" placeholder="VPP/DPP, článek"><input class="cov-note" value="${c.note||''}" placeholder="poznámka / rozdíl / výluka"></div>`;
  }).join('');
  return `<div class="offer-card" data-insurer-id="${insurer.id}"><div class="section-head"><div><h3>${insurer.short||''} – ${insurer.name||''}</h3><p class="muted">Nabídku nepřepisujeme volným textem. Každou položku párujeme na jednotné riziko ASTORIE, zapisujeme původní název z nabídky a zdroj ve VPP/DPP.</p></div><span class="pill">nabídka</span></div><div class="grid4"><label>Stav nabídky<select class="off-status"><option ${o.status==='čekáme na nabídku'?'selected':''}>čekáme na nabídku</option><option ${o.status==='doručeno'?'selected':''}>doručeno</option><option ${o.status==='doplnit dotaz'?'selected':''}>doplnit dotaz</option><option ${o.status==='nepoptáno/nepodáno'?'selected':''}>nepoptáno/nepodáno</option></select></label><label>Roční pojistné<input class="off-premium" value="${o.premium||''}" placeholder="např. 48 000 Kč"></label><label>Spoluúčast<input class="off-deductible" value="${o.deductible||''}" placeholder="např. 10 000 Kč"></label><label>Platnost nabídky<input class="off-valid" value="${o.valid_until||''}" placeholder="např. 30. 6. 2026"></label></div><label>Manažerské shrnutí nabídky<textarea class="off-note" placeholder="silné/slabé stránky, dotazy na pojišťovnu, podstatné výluky...">${o.note||''}</textarea></label><h4>Krytí podle jednotných rizik ASTORIE</h4><div class="coverage-table rich"><div class="coverage-head rich"><b>Riziko</b><b>Stav</b><b>Limit</b><b>Název v nabídce</b><b>Zdroj VPP/DPP</b><b>Poznámka</b></div>${coverageRows}</div></div>`;
}
function collectOffers(updateState){
  document.querySelectorAll('.offer-card').forEach(card=>{
    const id=card.dataset.insurerId;
    if(!state.offers[id]) state.offers[id]={coverages:{}};
    state.offers[id].status=card.querySelector('.off-status')?.value || state.offers[id].status || '';
    state.offers[id].premium=card.querySelector('.off-premium')?.value || '';
    state.offers[id].deductible=card.querySelector('.off-deductible')?.value || '';
    state.offers[id].valid_until=card.querySelector('.off-valid')?.value || '';
    state.offers[id].note=card.querySelector('.off-note')?.value || '';
    state.offers[id].coverages={};
    card.querySelectorAll('.coverage-row').forEach(row=>{
      state.offers[id].coverages[row.dataset.riskId]={state:row.querySelector('.cov-state').value,limit:row.querySelector('.cov-limit').value,original:row.querySelector('.cov-original')?.value||'',source:row.querySelector('.cov-source')?.value||'',note:row.querySelector('.cov-note').value};
    });
  });
}
function coverageScore(c){
  const st=(c?.state||'').toLowerCase();
  if(st==='splněno') return 2;
  if(st==='částečně') return 1;
  if(st==='nesplněno' || st==='výluka') return -2;
  return 0;
}
function offerQuality(insurer){
  const offer=state.offers[insurer.id]||{};
  let score=0, missing=[];
  activeRisks().forEach(r=>{
    const c=offer.coverages?.[r.id]||{};
    score += coverageScore(c);
    if(['nesplněno','výluka','nevyhodnoceno',''].includes((c.state||'').toLowerCase())) missing.push(r.name);
  });
  return {score, missing};
}
function recommendedInsurer(insurers){
  return insurers.map(i=>({insurer:i,...offerQuality(i)})).sort((a,b)=>b.score-a.score)[0] || null;
}
function renderComparison(){
  collectForm();
  const insurers = selectedInsurers();
  if(!insurers.length){ $('comparisonDoc').innerHTML='<h2>Porovnání nabídek</h2><p class="muted">Nejdříve vyber pojišťovny v poptávce.</p>'; return; }
  const rec = recommendedInsurer(insurers);
  const head = `<tr><th>Kritérium / riziko</th>${insurers.map(i=>`<th>${i.short||i.name}</th>`).join('')}</tr>`;
  const summaryRows = [
    ['Stav nabídky', i=>state.offers[i.id]?.status||'čekáme na nabídku'],
    ['Roční pojistné', i=>state.offers[i.id]?.premium||'—'],
    ['Spoluúčast', i=>state.offers[i.id]?.deductible||'—'],
    ['Platnost nabídky', i=>state.offers[i.id]?.valid_until||'—'],
    ['Skóre krytí', i=>offerQuality(i).score],
    ['Poznámka', i=>state.offers[i.id]?.note||'—']
  ].map(([label,fn])=>`<tr><td><b>${label}</b></td>${insurers.map(i=>`<td>${fn(i)}</td>`).join('')}</tr>`).join('');
  const riskRows = activeRisks().map(r=>`<tr><td><b>${r.name}</b><br><span class="muted">Požadavek ASTORIE: ${r.limit||''}</span></td>${insurers.map(i=>{ const c=state.offers[i.id]?.coverages?.[r.id]||{}; const src=c.source?`<br><small>Zdroj: ${c.source}</small>`:''; const orig=c.original?`<br><small>Název v nabídce: ${c.original}</small>`:''; return `<td><b class="cov ${slug(c.state)}">${c.state||'nevyhodnoceno'}</b><br>${c.limit||''}${orig}${src}${c.note?`<br><span class="muted">${c.note}</span>`:''}</td>`; }).join('')}</tr>`).join('');
  const recommendation = rec ? `<div class="recommend-box"><h3>Pracovní doporučení systému</h3><p><b>Nejlépe vychází: ${rec.insurer.short||rec.insurer.name}</b> podle vyhodnocení splnění požadovaných rizik. Toto není automatické rozhodnutí – poradce musí ověřit pojistné podmínky, výluky, sublimity a potřeby klienta.</p>${rec.missing.length?`<p><b>Body k ověření:</b> ${rec.missing.join(', ')}</p>`:'<p>U doporučené nabídky nejsou zatím evidována nesplněná hlavní rizika.</p>'}</div>` : '';
  $('comparisonDoc').innerHTML = `<h2>Porovnání nabídek</h2><p class="muted">Srovnání pracuje s jednotným názvoslovím ASTORIE. U každé položky zůstává původní název z nabídky pojišťovny a zdroj ve VPP/DPP, aby poradce mohl vše ověřit.</p>${recommendation}<h3>Základní parametry</h3><table><tbody>${head}${summaryRows}</tbody></table><h3>Krytí rizik + zdroje</h3><table><tbody>${head}${riskRows}</tbody></table>`;
}
function slug(v){ return (v||'').replaceAll('ě','e').replaceAll('š','s').replaceAll('č','c').replaceAll('ř','r').replaceAll('ž','z').replaceAll('ý','y').replaceAll('á','a').replaceAll('í','i').replaceAll('é','e').replaceAll('ů','u').replaceAll('ú','u').replace(/\s+/g,'-'); }

async function saveInquiry(){
  collectForm();
  $('saveStatus').textContent='Ukládám...';
  try{
    const res = await api('/api/inquiries', {method:'POST', body:JSON.stringify(state)});
    if(res.id){ state.id=res.id; $('inquiryId').value=res.id; }
    $('saveStatus').textContent=res.message || 'Uloženo.';
  }catch(e){ $('saveStatus').textContent='Chyba: '+e.message; }
}
async function loadInquiries(){
  $('inquiriesList').innerHTML='Načítám...';
  try{
    const res = await api('/api/inquiries');
    const items=res.items||[];
    $('inquiriesList').innerHTML = items.length ? items.map(i=>`<div class="item"><div><b>#${i.id} ${i.title||''}</b><br><span class="muted">${i.client_name||''} · ${i.activity_name||''} · ${i.updated_at||''}</span></div><button class="secondary" data-id="${i.id}">Otevřít</button></div>`).join('') : '<p class="muted">Zatím nejsou uložené poptávky.</p>';
    $('inquiriesList').querySelectorAll('button').forEach(b=>b.onclick=()=>openInquiry(b.dataset.id));
  }catch(e){ $('inquiriesList').innerHTML='Chyba: '+e.message; }
}
async function openInquiry(id){
  const res = await api('/api/inquiries/'+id);
  applyState(res.item);
  showView('inquiryView');
  $('saveStatus').textContent='Poptávka načtena.';
}
function applyState(s){
  state = {...state, ...s, offers:s.offers||{}};
  $('inquiryId').value = state.id || '';
  fillAdviser();
  $('clientIco').value=state.client?.ico||''; $('clientName').value=state.client?.name||''; $('clientLegal').value=state.client?.legal_form||''; $('clientAddress').value=state.client?.address||''; $('clientDataBox').value=state.client?.data_box||''; $('clientContact').value=state.client?.contact_person||''; $('clientEmail').value=state.client?.contact_email||''; $('clientPhone').value=state.client?.contact_phone||''; $('clientWeb').value=state.client?.website||'';
  $('insuranceStart').value=state.questionnaire?.insurance_start||''; $('turnover').value=state.questionnaire?.turnover||''; $('employees').value=state.questionnaire?.employees||'';
  setSelectOrCustom('insurancePeriodSelect','insurancePeriodCustom',state.questionnaire?.insurance_period||'1 rok'); setSelectOrCustom('territorySelect','territoryCustom',state.questionnaire?.territory||'Česká republika'); setSelectOrCustom('exportSelect','exportCustom',state.questionnaire?.export_info||'Ne');
  const act=state.activity?.code || (CATALOG.activities||[])[0]?.code; if(act) { $('activitySelect').value=act; $('activityProfile').innerHTML=`<h3>${state.activity?.name||''}</h3><p>${state.activity?.description||''}</p>`; }
  renderRisks();
  $('requirementsList').innerHTML=''; (state.additional_requirements||[]).forEach(r=>addRequirement(r));
  $('insurersList').querySelectorAll('input').forEach(cb=>cb.checked=(state.selected_insurers||[]).includes(cb.value));
  renderOffers(); updateAll();
}
function setSelectOrCustom(selectId, customId, value){
  const sel=$(selectId); const exists=Array.from(sel.options).some(o=>o.value===value||o.text===value);
  if(exists) sel.value=value; else {sel.value='custom'; $(customId).value=value;}
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
  $('insurersAdminTable').querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.insurers.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminInsurers(); renderCatalogs(); updateAll(); });
  $('insurersAdminTable').querySelectorAll('input,select').forEach(el=>el.oninput=collectAdminInsurers);
}
function collectAdminInsurers(){
  CATALOG.insurers = Array.from(document.querySelectorAll('#insurersAdminTable .admin-row.insurer:not(.admin-head)')).map(row=>({id:row.querySelector('.adm-id').value.trim() || ('ins_'+Date.now()), name:row.querySelector('.adm-name').value.trim(), short:row.querySelector('.adm-short').value.trim(), active:row.querySelector('.adm-active').value==='true'}));
  renderCatalogs(); updateAll();
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
function collectAdminReqTypes(){ CATALOG.requirementTypes = Array.from(document.querySelectorAll('#reqTypesAdminTable .admin-row.reqtype:not(.admin-head)')).map(row=>({id:row.querySelector('.adm-id').value.trim() || ('typ_'+Date.now()), name:row.querySelector('.adm-name').value.trim()})); }
function addAdminReqType(){ collectAdminReqTypes(); CATALOG.requirementTypes.push({id:'novy_'+Date.now(), name:'Nový typ doplňující informace'}); renderAdminReqTypes(); }
async function saveAdminCatalogs(){
  collectAdminInsurers(); collectAdminAdvisers(); collectAdminReqTypes();
  $('adminSaveStatus').textContent='Ukládám do databáze...';
  try{
    const res = await api('/api/admin/catalogs', {method:'POST', body:JSON.stringify({actor_email:state.adviser?.email||'', insurers:CATALOG.insurers, advisers:CATALOG.advisers, requirementTypes:CATALOG.requirementTypes})});
    $('adminSaveStatus').textContent=res.message || 'Uloženo.';
    renderCatalogs(); renderOffers(); updateAll();
  }catch(e){ $('adminSaveStatus').textContent='Chyba: '+e.message; }
}

init();

// ===================== V0.13: průvodce pro nováčky + náměty poradců =====================
function currentAdvisorMode(){
  const checked = document.querySelector('input[name="advisorMode"]:checked');
  return checked ? checked.value : 'novice';
}
function renderGuide(){
  collectForm();
  const mode = currentAdvisorMode();
  const checks = [
    {label:'Klient', ok:!!text(state.client?.name), warn:!!text(state.client?.ico), hint:text(state.client?.name)?'Identifikace klienta je vyplněná.':'Doplňte název klienta nebo načtěte ARES.'},
    {label:'Kontakt', ok:!!(text(state.client?.contact_person)||text(state.client?.contact_email)||text(state.client?.contact_phone)), hint:'Doplňte alespoň kontaktní osobu, e-mail nebo telefon.'},
    {label:'Rizika', ok:activeRisks().length>0, hint: activeRisks().length ? `Vybráno ${activeRisks().length} rizik.` : 'Vyberte nebo přidejte alespoň jedno riziko.'},
    {label:'Pojišťovny', ok:(state.selected_insurers||[]).length>0, hint:(state.selected_insurers||[]).length ? `Vybráno ${(state.selected_insurers||[]).length} pojišťoven.` : 'Vyberte pojišťovny pro poptávku.'},
    {label:'Obrat', ok:!!text(state.questionnaire?.turnover), hint:'Obrat pomáhá orientačně posoudit limit.'},
    {label:'Území', ok:!!text(state.questionnaire?.territory), hint:'Územní rozsah je důležitý pro nabídku i výluky.'},
    {label:'Pojistná doba', ok:!!text(state.questionnaire?.insurance_period), hint:'Doplňte požadovanou dobu nebo vlastní variantu.'},
    {label:'Nabídky', ok:Object.values(state.offers||{}).some(o=>text(o.premium)||text(o.status)==='doručeno'), hint:'Po doručení nabídek vyplňte modul Nabídky.'}
  ];
  $('readinessBox').innerHTML = checks.map(c=>`<div class="ready-card ${c.ok?'ok':(c.warn?'warn':'bad')}"><b>${c.ok?'✓':'!'} ${c.label}</b><span>${c.ok?c.hint:c.hint}</span></div>`).join('');
  const baseQuestions = [
    ['Jaká je hlavní činnost klienta a co přesně klient fakturuje?', 'Pomáhá ověřit, zda vybraná činnost odpovídá reálnému riziku.'],
    ['Kde klient činnost vykonává – u sebe, u zákazníka, na stavbě, v zahraničí?', 'Mění se tím riziko odpovědnosti, územní rozsah i požadované doložky.'],
    ['Má klient smlouvy, kde je předepsaný minimální limit nebo konkrétní pojištění?', 'Smluvní požadavky mají přednost před orientačním limitem.'],
    ['Jaká je nejvyšší možná škoda z jedné události?', 'Tato odpověď je důležitější než samotný roční obrat.'],
    ['Byly v minulosti škody nebo reklamace?', 'Škodní průběh ovlivňuje nabídku i doporučení.']
  ];
  const riskQuestions = activeRisks().map(r=>[r.question || `Je pro klienta relevantní riziko: ${r.name}?`, r.reason || r.description || 'Riziko bylo navrženo podle činnosti klienta.']);
  const qs = mode==='expert' ? riskQuestions.slice(0,8) : baseQuestions.concat(riskQuestions).slice(0,18);
  $('advisorQuestions').innerHTML = qs.map((q,i)=>`<div class="question-item"><b>${i+1}. ${q[0]}</b><span class="why">Proč se ptáme: ${q[1]}</span></div>`).join('') || '<p class="muted">Nejdříve vyberte činnost a rizika.</p>';
  const warns = [];
  if(!text(state.client?.contact_email) && !text(state.client?.contact_phone)) warns.push(['Kontakt na klienta','Bez kontaktu se špatně dokládá jednání a doplnění údajů.', false]);
  if((state.selected_insurers||[]).length < 2) warns.push(['Pojišťovny','Pro kvalitní porovnání doporučujeme poptat více než jednu pojišťovnu.', false]);
  if(activeRisks().some(r=>/výrobek|stažení|export|usa|kanada/i.test((r.name+' '+r.description+' '+r.reason)))) warns.push(['Vyšší expozice','Zkontrolujte export, výrobkovou odpovědnost, USA/Kanada a smluvní požadavky odběratelů.', true]);
  if(!text(state.questionnaire?.turnover)) warns.push(['Obrat','Bez obratu je návrh limitu pouze velmi orientační.', false]);
  $('guideWarnings').innerHTML = warns.length ? warns.map(w=>`<div class="warning-item ${w[2]?'critical':''}"><b>${w[0]}</b><p>${w[1]}</p></div>`).join('') : '<div class="warning-item"><b>Bez zásadních upozornění</b><p>Poptávka zatím neobsahuje zjevné kritické mezery. Přesto ji před odesláním zkontrolujte.</p></div>';
}
async function saveSuggestion(){
  collectForm();
  const payload = {
    type: $('suggestionType').value,
    area: $('suggestionArea').value || state.activity?.name || '',
    priority: $('suggestionPriority').value,
    title: $('suggestionTitle').value,
    detail: $('suggestionDetail').value,
    actor_email: state.adviser?.email || currentUser?.email || ''
  };
  if(!text(payload.title) || !text(payload.detail)){ $('suggestionStatus').textContent='Doplňte název a popis námětu.'; return; }
  $('suggestionStatus').textContent='Ukládám...';
  try{
    const res = await api('/api/suggestions', {method:'POST', body:JSON.stringify(payload)});
    $('suggestionStatus').textContent=res.message || 'Námět uložen.';
    $('suggestionTitle').value=''; $('suggestionDetail').value='';
    await loadSuggestions();
  }catch(e){ $('suggestionStatus').textContent='Chyba: '+e.message; }
}
async function loadSuggestions(){
  if(!$('suggestionsList')) return;
  $('suggestionsList').innerHTML='Načítám...';
  try{
    const res = await api('/api/suggestions');
    const items = res.items || [];
    $('suggestionsList').innerHTML = items.length ? items.map(s=>`<div class="suggestion-card"><div class="meta">${s.type||''} · ${s.priority||''} · ${s.area||''}</div><h3>${s.title||''}</h3><p>${s.detail||''}</p><p class="muted">${s.actor_email||''} · ${s.created_at||''}</p></div>`).join('') : '<p class="muted">Zatím nejsou uložené žádné náměty.</p>';
  }catch(e){ $('suggestionsList').innerHTML='Chyba: '+e.message; }
}
