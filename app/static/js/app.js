let CATALOG = null;
let state = {
  id:null,
  adviser:{}, client:{}, questionnaire:{}, activity:null,
  risks:[], selected_insurers:[], additional_requirements:[], offers:{}, ai_imports:[],
  title:"", status:"rozpracováno", comparison_strategy:"bezpecnost", report:{advisor_note:"", client_selected_offer:"", client_choice_reason:""}
};
let currentRiskIndex = null;
let currentUser = null;
let currentAdminDetail = null;

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
  if($('changeInquiryBtn')) $('changeInquiryBtn').onclick = loadInquiries;
  if($('inquiryStatusSelect')) $('inquiryStatusSelect').onchange = ()=>{ state.status=$('inquiryStatusSelect').value; updateActiveInquiryBanner(); };
  if($('refreshMyInquiriesBtn')) $('refreshMyInquiriesBtn').onclick = renderMyInquiries;
  if($('myInquiryStatusFilter')) $('myInquiryStatusFilter').onchange = renderMyInquiries;
  if($('myInquirySearch')) $('myInquirySearch').oninput = renderMyInquiries;
  if($('refreshAdminInquiriesBtn')) $('refreshAdminInquiriesBtn').onclick = renderAdminInquiries;
  if($('adminInquiryStatusFilter')) $('adminInquiryStatusFilter').onchange = renderAdminInquiries;
  if($('adminInquirySearch')) $('adminInquirySearch').oninput = renderAdminInquiries;
  $('newInquiryBtn').onclick = ()=>resetInquiry(true);
  $('refreshOffersBtn').onclick = renderOffers;
  if($('copyAiPromptBtn')) $('copyAiPromptBtn').onclick = copyAIPrompt;
  if($('importAiJsonBtn')) $('importAiJsonBtn').onclick = importAIJson;
  if($('aiInsurerSelect')) $('aiInsurerSelect').onchange = renderAIPrompt;
  if($('aiOfferLabel')) $('aiOfferLabel').addEventListener('input', renderAIPrompt);
  if($('aiDocsLabel')) $('aiDocsLabel').addEventListener('input', renderAIPrompt);
  $('closeModal').onclick = ()=>$('riskModal').classList.add('hidden');
  $('saveRiskDetail').onclick = saveRiskModal;
  if($('closeSavedModal')) $('closeSavedModal').onclick = ()=>$('savedInquiryModal').classList.add('hidden');
  if($('closeAdminDetail')) $('closeAdminDetail').onclick = ()=>$('adminDetailModal').classList.add('hidden');
  if($('cancelAdminDetail')) $('cancelAdminDetail').onclick = ()=>$('adminDetailModal').classList.add('hidden');
  if($('saveAdminDetail')) $('saveAdminDetail').onclick = saveAdminDetailModal;
  setupAdminDetailObserver();
  document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>showTab(btn.dataset.tab));
  document.querySelectorAll('.admin-tab').forEach(btn=>btn.onclick=()=>showAdminTab(btn.dataset.adminTab));
  $('addInsurerAdmin').onclick = addAdminInsurer;
  $('addAdviserAdmin').onclick = addAdminAdviser;
  $('addReqTypeAdmin').onclick = addAdminReqType;
  $('saveAdminCatalogs').onclick = saveAdminCatalogs;
  if($('addRiskModelAdmin')) $('addRiskModelAdmin').onclick = addRiskModelRule;
  if($('addActivityAdmin')) $('addActivityAdmin').onclick = addAdminActivity;
  if($('addRiskAdmin')) $('addRiskAdmin').onclick = addAdminRisk;
  if($('addDictionaryAdmin')) $('addDictionaryAdmin').onclick = addAdminDictionary;
  if($('addPolicyRefAdmin')) $('addPolicyRefAdmin').onclick = addAdminPolicyRef;
  if($('runImportAdmin')) $('runImportAdmin').onclick = runCatalogImport;
  if($('exportCatalogAdmin')) $('exportCatalogAdmin').onclick = exportCatalogJson;
  if($('recalcComparisonBtn')) $('recalcComparisonBtn').onclick = renderComparison;
  if($('generateReportBtn')) $('generateReportBtn').onclick = renderClientReport;
  if($('copyReportBtn')) $('copyReportBtn').onclick = copyClientReport;
  if($('advisorReportNote')) $('advisorReportNote').addEventListener('input', ()=>{ state.report=state.report||{}; state.report.advisor_note=$('advisorReportNote').value; });
  if($('clientSelectedOffer')) $('clientSelectedOffer').addEventListener('input', ()=>{ state.report=state.report||{}; state.report.client_selected_offer=$('clientSelectedOffer').value; });
  if($('clientChoiceReason')) $('clientChoiceReason').addEventListener('input', ()=>{ state.report=state.report||{}; state.report.client_choice_reason=$('clientChoiceReason').value; });
  if($('comparisonStrategy')) $('comparisonStrategy').onchange = ()=>{ state.comparison_strategy=$('comparisonStrategy').value; renderComparison(); };
  if($('comparisonStrictness')) $('comparisonStrictness').onchange = renderComparison;
  if($('reportMode')) $('reportMode').onchange = renderClientReport;
  if($('refreshGuideBtn')) $('refreshGuideBtn').onclick = renderGuide;
  if($('saveSuggestionBtn')) $('saveSuggestionBtn').onclick = saveSuggestion;
  if($('loadSuggestionsBtn')) $('loadSuggestionsBtn').onclick = loadSuggestions;
  document.querySelectorAll('input[name=advisorMode]').forEach(r=>r.onchange=renderGuide);
  ['insuranceStart','insurancePeriodSelect','insurancePeriodCustom','turnover','employees','territorySelect','territoryCustom','exportSelect','exportCustom','clientIco','clientName','clientLegal','clientAddress','clientDataBox','clientContact','clientEmail','clientPhone','clientWeb','adviserName','adviserEmail','adviserCompany','adviserRegistration'].forEach(id=>$(id).addEventListener('input', updateAll));
  ['turnover'].forEach(id=>$(id).addEventListener('blur', e=>{ normaliseMoneyInput(e.target); updateAll(); }));
}

function showView(id){
  collectForm();
  document.querySelectorAll('.app-section').forEach(x=>x.classList.add('hidden'));
  $(id).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===id));
  if(id==='myInquiriesView') renderMyInquiries();
  if(id==='aiView') renderAIWorkflow();
  if(id==='offersView') renderOffers();
  if(id==='comparisonView') renderComparison();
  if(id==='reportView') renderClientReport();
  if(id==='guideView') renderGuide();
  if(id==='suggestionsView') loadSuggestions();
  if(id==='adminView') renderAdmin();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderCatalogs(){
  $('activitySelect').innerHTML = (CATALOG.activities||[]).map(a=>`<option value="${a.code}">${a.name}</option>`).join('');
  $('insurersList').innerHTML = (CATALOG.insurers||[]).filter(i=>i.active).map(i=>`<label class="check"><input type="checkbox" value="${i.id}"> <b>${i.short||''}</b> ${i.name||''}</label>`).join('');
  if($('aiInsurerSelect')) $('aiInsurerSelect').innerHTML = (CATALOG.insurers||[]).filter(i=>i.active).map(i=>`<option value="${i.id}">${i.short||''} – ${i.name||''}</option>`).join('');
  $('insurersList').querySelectorAll('input').forEach(cb=>cb.onchange=()=>{ syncSelectedInsurers(); renderOffers(); updateAll(); });
}

function resetInquiry(confirmIt){
  if(confirmIt && !confirm('Opravdu založit novou poptávku? Neuložené změny se ztratí.')) return;
  const user = state.adviser;
  state = { id:null, adviser:user, client:{}, questionnaire:{}, activity:null, risks:[], selected_insurers:[], additional_requirements:[], offers:{}, ai_imports:[], title:"", status:"rozpracováno", comparison_strategy:"bezpecnost", report:{advisor_note:"", client_selected_offer:"", client_choice_reason:""} };
  $('inquiryId').value = '';
  ['clientIco','clientName','clientLegal','clientAddress','clientDataBox','clientContact','clientEmail','clientPhone','clientWeb','insuranceStart','insurancePeriodCustom','turnover','employees','territoryCustom','exportCustom'].forEach(id=>$(id).value='');
  $('insurancePeriodSelect').value='1 rok'; $('territorySelect').value='Česká republika'; $('exportSelect').value='Ne';
  $('insurersList').querySelectorAll('input').forEach(cb=>cb.checked=false);
  $('requirementsList').innerHTML='';
  $('inquiriesList').innerHTML='';
  fillAdviser();
  selectActivity((CATALOG.activities&&CATALOG.activities[0]?.code) || 'construction');
  updateActiveInquiryBanner();
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

function updateAll(){
  updateActiveInquiryBanner(); collectForm(); updateDocs(); renderComparison(); if(document.getElementById('guideView') && !document.getElementById('guideView').classList.contains('hidden')) renderGuide(); }
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
  $('offersList').querySelectorAll('input,select,textarea').forEach(el=>el.oninput=()=>{ collectOffers(true); renderComparison(); scheduleOfferAutosave(); });
  $('offersList').querySelectorAll('.money-input').forEach(el=>el.onblur=()=>{ normaliseMoneyInput(el); collectOffers(true); renderComparison(); scheduleOfferAutosave(); });
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
  return `<div class="offer-card" data-insurer-id="${insurer.id}"><div class="section-head"><div><h3>${insurer.short||''} – ${insurer.name||''}</h3><p class="muted">Nabídku nepřepisujeme volným textem. Každou položku párujeme na jednotné riziko ASTORIE, zapisujeme původní název z nabídky a zdroj ve VPP/DPP.</p></div><span class="pill">nabídka</span></div><div class="grid4"><label>Stav nabídky<select class="off-status"><option ${o.status==='čekáme na nabídku'?'selected':''}>čekáme na nabídku</option><option ${o.status==='doručeno'?'selected':''}>doručeno</option><option ${o.status==='doplnit dotaz'?'selected':''}>doplnit dotaz</option><option ${o.status==='nepoptáno/nepodáno'?'selected':''}>nepoptáno/nepodáno</option></select></label><label>Roční pojistné<input class="off-premium money-input" value="${o.premium||''}" placeholder="např. 48 000 Kč"></label><label>Spoluúčast<input class="off-deductible money-input" value="${o.deductible||''}" placeholder="např. 10 000 Kč"></label><label>Platnost nabídky<input class="off-valid date-input" type="date" value="${o.valid_until||''}"></label></div><label>Manažerské shrnutí nabídky<textarea class="off-note" placeholder="silné/slabé stránky, dotazy na pojišťovnu, podstatné výluky...">${o.note||''}</textarea></label><h4>Krytí podle jednotných rizik ASTORIE</h4><div class="coverage-table rich"><div class="coverage-head rich"><b>Riziko</b><b>Stav</b><b>Limit</b><b>Název v nabídce</b><b>Zdroj VPP/DPP</b><b>Poznámka</b></div>${coverageRows}</div></div>`;
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
function getRiskModel(riskId, activityCode){
  const rows = CATALOG.riskModel || [];
  return rows.find(x=>x.active!==false && x.risk_id===riskId && x.activity_code===activityCode) || rows.find(x=>x.active!==false && x.risk_id===riskId) || {};
}
function moneyNumber(v){
  const n = parseFloat((v||'').toString().replace(/[^0-9,.-]/g,'').replace(',', '.'));
  return isNaN(n) ? null : n;
}
function formatMoney(value){
  if(value === null || value === undefined || value === '') return '—';
  const n = moneyNumber(value);
  if(n === null) return value;
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n) + ' Kč';
}
function formatMoneyMaybe(value){
  if(!value) return '—';
  return formatMoney(value);
}
function normaliseMoneyInput(el){
  const n = moneyNumber(el.value);
  if(n !== null) el.value = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n) + ' Kč';
}
function formatDateCz(value){
  if(!value) return '—';
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
    const parts=value.split('-');
    return parts[2]+'.'+parts[1]+'.'+parts[0];
  }
  return value;
}

function formatDateTimeCz(value){
  if(!value) return '';
  try{
    const d = new Date(value);
    if(isNaN(d.getTime())) return String(value);
    return d.toLocaleString('cs-CZ', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    });
  }catch(e){ return String(value); }
}
function coverageBase(c){
  const st=(c?.state||'').toLowerCase();
  if(st==='splněno') return 1;
  if(st==='částečně') return 0.55;
  if(st==='nesplněno') return 0;
  if(st==='výluka') return -0.6;
  return 0.15;
}
function priceScore(insurer, insurers){
  const vals = insurers.map(i=>moneyNumber(state.offers[i.id]?.premium)).filter(v=>v && v>0);
  const my = moneyNumber(state.offers[insurer.id]?.premium);
  if(!vals.length || !my) return 50;
  const min = Math.min(...vals), max=Math.max(...vals);
  if(max===min) return 100;
  return Math.max(0, Math.round(100 - ((my-min)/(max-min))*100));
}
function strategyWeights(){
  const strategy = $('comparisonStrategy')?.value || state.comparison_strategy || 'bezpecnost';
  if(strategy==='cena') return {coverage:0.30, price:0.70, label:'Cena'};
  if(strategy==='vyvazeny') return {coverage:0.50, price:0.50, label:'Vyvážený'};
  return {coverage:0.70, price:0.30, label:'Bezpečnost'};
}
function riskCoveragePoints(r, c){
  const m = getRiskModel(r.id, state.activity?.code);
  let weight = Number(m.weight || 50);
  if((m.criticality||'').toLowerCase()==='kritická') weight *= 1.25;
  if((m.obligation||'').toLowerCase()==='nutné') weight *= 1.15;
  return coverageBase(c) * weight;
}
function offerQuality(insurer){
  const offer=state.offers[insurer.id]||{};
  const risks=activeRisks();
  let earned=0, possible=0, missing=[], warnings=[];
  risks.forEach(r=>{
    const c=offer.coverages?.[r.id]||{};
    const m=getRiskModel(r.id, state.activity?.code);
    let weight=Number(m.weight||50);
    if((m.criticality||'').toLowerCase()==='kritická') weight*=1.25;
    if((m.obligation||'').toLowerCase()==='nutné') weight*=1.15;
    possible += Math.max(weight,1);
    earned += Math.max(0, riskCoveragePoints(r,c));
    const st=(c.state||'').toLowerCase();
    if(['nesplněno','výluka','nevyhodnoceno',''].includes(st)){
      missing.push(r.name);
      if(['kritická','vysoká'].includes((m.criticality||'').toLowerCase())) warnings.push(`${r.name}: ${st||'nevyhodnoceno'} – ${m.warning_text||'ověřit krytí a zdroj'}`);
    }
    if(st==='částečně' && ['kritická','vysoká'].includes((m.criticality||'').toLowerCase())) warnings.push(`${r.name}: částečné krytí – ověřit limit, sublimit a výluky.`);
  });
  const coverageScore = possible ? Math.round((earned/possible)*100) : 0;
  const insurers = selectedInsurers();
  const pScore = priceScore(insurer, insurers);
  const w = strategyWeights();
  const total = Math.round(coverageScore*w.coverage + pScore*w.price);
  let verdict = total>=80 ? 'Vhodná' : total>=55 ? 'S výhradami' : 'Nedoporučená';
  if(warnings.length && ($('comparisonStrictness')?.value==='strict')) verdict = total>=70 ? 'S výhradami' : 'Nedoporučená';
  return {score:total, coverageScore, priceScore:pScore, missing, warnings, verdict};
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
    ['Roční pojistné', i=>formatMoneyMaybe(state.offers[i.id]?.premium)],
    ['Spoluúčast', i=>formatMoneyMaybe(state.offers[i.id]?.deductible)],
    ['Platnost nabídky', i=>formatDateCz(state.offers[i.id]?.valid_until)],
    ['Celkové skóre', i=>offerQuality(i).score + ' / 100'],
    ['Skóre krytí', i=>offerQuality(i).coverageScore + ' / 100'],
    ['Skóre ceny', i=>offerQuality(i).priceScore + ' / 100'],
    ['Verdikt', i=>offerQuality(i).verdict],
    ['Poznámka', i=>state.offers[i.id]?.note||'—']
  ].map(([label,fn])=>`<tr><td><b>${label}</b></td>${insurers.map(i=>`<td>${fn(i)}</td>`).join('')}</tr>`).join('');
  const riskRows = activeRisks().map(r=>`<tr><td><b>${r.name}</b><br><span class="muted">Požadavek ASTORIE: ${formatMoneyMaybe(r.limit)}</span><br><small>${(()=>{const m=getRiskModel(r.id,state.activity?.code); return 'Kritičnost: '+(m.criticality||'—')+' · váha: '+(m.weight||'—')+' · povinnost: '+(m.obligation||'—');})()}</small></td>${insurers.map(i=>{ const c=state.offers[i.id]?.coverages?.[r.id]||{}; const src=c.source?`<br><small>Zdroj: ${c.source}</small>`:''; const orig=c.original?`<br><small>Název v nabídce: ${c.original}</small>`:''; return `<td><b class="cov ${slug(c.state)}">${c.state||'nevyhodnoceno'}</b><br>${formatMoneyMaybe(c.limit)}${orig}${src}${c.note?`<br><span class="muted">${c.note}</span>`:''}</td>`; }).join('')}</tr>`).join('');
  const strategy = strategyWeights();
  const recommendation = rec ? `<div class="recommend-box"><h3>Pracovní analytické upozornění systému</h3><p><b>Nejvyšší analytické skóre má: ${rec.insurer.short||rec.insurer.name}</b> – celkové skóre ${rec.score}/100, krytí ${rec.coverageScore}/100, cena ${rec.priceScore}/100. Režim: ${strategy.label}.</p><p>Toto není finální doporučení ani rozhodnutí. Poradce musí ověřit VPP/DPP/ZPP, sublimity, výluky a skutečné potřeby klienta.</p>${rec.warnings.length?`<p><b>Kritické body k ověření:</b><br>${rec.warnings.map(x=>'• '+x).join('<br>')}</p>`:(rec.missing.length?`<p><b>Body k ověření:</b> ${rec.missing.join(', ')}</p>`:'<p>U nabídky s nejvyšším skóre nejsou zatím evidována nesplněná hlavní rizika.</p>')}</div>` : '';
  $('comparisonDoc').innerHTML = `<h2>Porovnání nabídek</h2><p class="muted">Srovnání pracuje s jednotným názvoslovím ASTORIE. U každé položky zůstává původní název z nabídky pojišťovny a zdroj ve VPP/DPP, aby poradce mohl vše ověřit.</p>${recommendation}<h3>Základní parametry</h3><table><tbody>${head}${summaryRows}</tbody></table><h3>Krytí rizik + zdroje</h3><table><tbody>${head}${riskRows}</tbody></table>`;
}
function slug(v){ return (v||'').replaceAll('ě','e').replaceAll('š','s').replaceAll('č','c').replaceAll('ř','r').replaceAll('ž','z').replaceAll('ý','y').replaceAll('á','a').replaceAll('í','i').replaceAll('é','e').replaceAll('ů','u').replaceAll('ú','u').replace(/\s+/g,'-'); }


function coverageLabel(stateVal){
  const st=(stateVal||'nevyhodnoceno').toLowerCase();
  if(st==='splněno') return 'splněno';
  if(st==='částečně') return 'částečně splněno';
  if(st==='výluka') return 'výluka / nekryto';
  if(st==='nesplněno') return 'nesplněno';
  return 'nutno ověřit';
}
function buildAdvisoryAlerts(){
  const insurers=selectedInsurers();
  const alerts=[];
  activeRisks().forEach(r=>{
    const m=getRiskModel(r.id,state.activity?.code);
    insurers.forEach(i=>{
      const c=state.offers[i.id]?.coverages?.[r.id]||{};
      const st=(c.state||'').toLowerCase();
      const critical=['kritická','vysoká'].includes((m.criticality||'').toLowerCase());
      if(critical && (!st || st==='nesplněno' || st==='výluka')) alerts.push(`${i.short||i.name}: ${r.name} – ${coverageLabel(st)}. ${m.recommendation||m.warning_text||'Doporučujeme ověřit s pojišťovnou a doplnit zdroj.'}`);
      if(critical && st==='částečně') alerts.push(`${i.short||i.name}: ${r.name} – krytí pouze částečně. Ověřit limit, sublimit, spoluúčast a výluky.`);
    });
  });
  return alerts;
}
function renderClientReport(){
  collectForm(); collectOffers(true);
  const insurers=selectedInsurers();
  const client=state.client||{};
  const q=state.questionnaire||{};
  const activity=state.activity||{};
  const risks=activeRisks();
  if($('advisorReportNote')) $('advisorReportNote').value = state.report?.advisor_note || '';
  if($('clientSelectedOffer')) $('clientSelectedOffer').value = state.report?.client_selected_offer || '';
  if($('clientChoiceReason')) $('clientChoiceReason').value = state.report?.client_choice_reason || '';
  if(!insurers.length){ $('clientReportDoc').innerHTML='<h2>Srovnávací zpráva</h2><p class="muted">Nejdříve vyber pojišťovny v poptávce.</p>'; return; }
  const mode = $('reportMode')?.value || 'internal';
  const isClientMode = mode === 'client';
  const alerts=buildAdvisoryAlerts();
  const summaryRows = insurers.map(i=>{
    const o=state.offers[i.id]||{}; const ql=offerQuality(i);
    return `<tr><td><b>${i.short||i.name}</b><br><span class="muted">${i.name||''}</span></td><td>${o.status||'čekáme na nabídku'}</td><td>${formatMoneyMaybe(o.premium)}</td><td>${formatMoneyMaybe(o.deductible)}</td><td>${ql.verdict}<br><small>analytické skóre ${ql.score}/100</small></td><td>${o.note||'—'}</td></tr>`;
  }).join('');
  const riskRows = risks.map(r=>{
    const m=getRiskModel(r.id,state.activity?.code);
    return `<tr><td><b>${r.name}</b><br><small>${m.obligation||'doporučené'} · ${m.criticality||'—'} · limit: ${formatMoneyMaybe(r.limit||m.default_limit)}</small></td>${insurers.map(i=>{ const c=state.offers[i.id]?.coverages?.[r.id]||{}; return `<td><b class="cov ${slug(c.state)}">${coverageLabel(c.state)}</b><br>${c.limit?formatMoneyMaybe(c.limit):'limit neuveden'}${c.original?`<br><small>Název v nabídce: ${c.original}</small>`:''}${c.source?`<br><small>Zdroj: ${c.source}</small>`:''}${c.note?`<br><span class="muted">${c.note}</span>`:''}</td>`; }).join('')}</tr>`;
  }).join('');
  const alertsHtml = isClientMode
    ? (alerts.length ? '<p>U některých variant byly identifikovány rozdíly v rozsahu krytí, limitech nebo výlukách. Tyto body budou s klientem projednány před výběrem finální varianty.</p>' : '<p>V zadaných podkladech nebyly evidovány zásadní rozdíly vyžadující zvláštní upozornění. Přesto je nutné finální variantu vždy projednat s klientem.</p>')
    : (alerts.length ? `<ul>${alerts.map(a=>`<li>${a}</li>`).join('')}</ul>` : '<p>V aktuálně zadaných datech nejsou evidována kritická upozornění. To nenahrazuje kontrolu nabídky, VPP/DPP/ZPP a případných výluk.</p>');
  const selected = state.report?.client_selected_offer || 'bude doplněno po projednání s klientem';
  const reason = state.report?.client_choice_reason || 'bude doplněno po projednání s klientem';
  $('clientReportDoc').innerHTML = `
    <h2>Srovnávací zpráva k nabídkám pojištění</h2>
    <p class="muted">${isClientMode ? 'Tento dokument shrnuje obdržené nabídky a hlavní rozdíly v rozsahu krytí, limitech a spoluúčastech. Slouží jako podklad pro společné projednání variant s klientem.' : 'Tento dokument je pracovní analytický podklad pro poradce. Aplikace strukturuje nabídky, upozorňuje na rozdíly a uvádí dostupné zdroje. Finální doporučení a volbu řešení potvrzuje poradce s klientem.'}</p>
    <h3>1. Identifikace klienta</h3>
    <table><tbody>
      <tr><td>Klient</td><td><b>${client.name||'—'}</b></td></tr>
      <tr><td>IČO</td><td>${client.ico||'—'}</td></tr>
      <tr><td>Činnost / typ klienta</td><td>${activity.name||'—'}</td></tr>
      <tr><td>Obrat / zaměstnanci</td><td>${q.turnover||'—'} / ${q.employees||'—'}</td></tr>
      <tr><td>Územní rozsah / export</td><td>${q.territory||'—'} / ${q.export_info||'—'}</td></tr>
      <tr><td>Poradce</td><td>${state.adviser?.name||'—'} (${state.adviser?.email||'—'})</td></tr>
    </tbody></table>
    <h3>2. Přehled nabídek</h3>
    <table><thead><tr><th>Pojišťovna</th><th>Stav</th><th>Roční pojistné</th><th>Spoluúčast</th><th>Analytické vyhodnocení</th><th>Poznámka</th></tr></thead><tbody>${summaryRows}</tbody></table>
    <h3>3. Porovnání krytí rizik</h3>
    <table><thead><tr><th>Riziko / požadavek</th>${insurers.map(i=>`<th>${i.short||i.name}</th>`).join('')}</tr></thead><tbody>${riskRows}</tbody></table>
    <h3>4. ${isClientMode ? 'Hlavní rozdíly k projednání' : 'Upozornění k ověření poradcem'}</h3>
    <div class="warning-list">${alertsHtml}</div>
    <h3>5. Další postup</h3>
    <p><b>Varianta zvolená klientem:</b> ${selected}</p>
    <p><b>Důvod volby klienta:</b> ${reason}</p>
    <p><b>Závěr poradce:</b> ${state.report?.advisor_note || 'bude doplněno poradcem po projednání s klientem.'}</p>
    ${isClientMode ? '<div class="client-note"><b>Poznámka:</b> Finální varianta bude zvolena po projednání rozsahu krytí, limitů, spoluúčastí a pojistného s klientem.</div>' : '<div class="legal-note"><b>Interní upozornění:</b> Výstup aplikace je analytická pomůcka. Nenahrazuje odborné posouzení poradcem, kontrolu pojistných podmínek ani záznam z jednání. Finální doporučení klientovi musí vycházet z jeho požadavků, cílů a potřeb.</div>'}
  `;
}
function copyClientReport(){
  renderClientReport();
  const t = $('clientReportDoc')?.innerText || '';
  navigator.clipboard.writeText(t).then(()=>alert('Srovnávací zpráva byla zkopírována.'));
}

async function saveInquiry(){
  collectForm();
  $('saveStatus').textContent='Ukládám...';
  try{
    const res = await api('/api/inquiries', {method:'POST', body:JSON.stringify(state)});
    if(res.id){ state.id=res.id; $('inquiryId').value=res.id; }
    backupInquiryLocally(state);
    $('saveStatus').textContent=res.message || 'Uloženo.';
    updateActiveInquiryBanner();
  }catch(e){
    backupInquiryLocally(state);
    $('saveStatus').textContent='DB chyba, uloženo alespoň lokálně v prohlížeči: '+e.message;
  }
}
function localInquiryBackups(){
  try{return JSON.parse(localStorage.getItem('arh_inquiry_backups')||'[]')}catch(e){return []}
}
function backupInquiryLocally(item){
  const backups=localInquiryBackups();
  const key = item.id ? 'db_'+item.id : 'local_'+Date.now();
  const clean = JSON.parse(JSON.stringify({...item, local_key:key, local_saved_at:new Date().toISOString()}));
  const idx=backups.findIndex(x=>(item.id && x.id===item.id) || x.local_key===key);
  if(idx>=0) backups[idx]=clean; else backups.unshift(clean);
  localStorage.setItem('arh_inquiry_backups', JSON.stringify(backups.slice(0,30)));
}
async function loadInquiries(){
  const target = $('savedInquiryModalList') || $('inquiriesList');
  if($('savedInquiryModal')) $('savedInquiryModal').classList.remove('hidden');
  target.innerHTML='Načítám uložené poptávky...';
  try{
    const res = await api('/api/inquiries');
    const dbItems=(res.items||[]).map(x=>({...x, source:'db'}));
    window.__lastInquiryItems = dbItems;
    const localItems=localInquiryBackups().map(x=>({id:x.id||'', local_key:x.local_key, title:x.title||('Poptávka – '+(x.client?.name||'klient')), client_name:x.client?.name||'', activity_name:x.activity?.name||'', updated_at:x.local_saved_at||'', source:'local'}));
    const seen=new Set();
    const items=[...dbItems,...localItems].filter(i=>{const k=(i.source==='db'?'db_'+i.id:(i.local_key||'')); if(seen.has(k)) return false; seen.add(k); return true;});
    renderInquiryList(items, target);
    if($('inquiriesList') && target!==$('inquiriesList')) renderInquiryList(items, $('inquiriesList'));
  }catch(e){
    const localItems=localInquiryBackups().map(x=>({id:x.id||'', local_key:x.local_key, title:x.title||('Poptávka – '+(x.client?.name||'klient')), client_name:x.client?.name||'', activity_name:x.activity?.name||'', updated_at:x.local_saved_at||'', source:'local'}));
    target.innerHTML='<p class="warning"><b>Databáze se nepodařila načíst.</b><br>'+e.message+'</p>';
    if(localItems.length){ target.innerHTML += '<h3>Lokální záloha v tomto prohlížeči</h3>'; renderInquiryList(localItems, target, true); }
  }
}
function renderInquiryList(items, container, append=false){
  const html = items.length ? items.map(i=>`<div class="item"><div><b>${i.source==='db'?'#'+i.id:'Lokální záloha'} ${i.title||''}</b><br><span class="muted">${i.client_name||''} · ${i.activity_name||''} · ${formatDateTimeCz(i.updated_at)||i.updated_at||''}</span><br><small>Stav: <b>${i.status||'rozpracováno'}</b> · Nabídek: <b>${i.offer_count ?? countOffersFromLocal(i)}</b></small></div><div class="item-actions"><span class="pill">${i.source==='db'?'DB':'lokálně'}</span><button class="secondary" data-id="${i.id||''}" data-local="${i.local_key||''}" data-source="${i.source}">Otevřít</button></div></div>`).join('') : '<p class="muted">Zatím nejsou uložené poptávky.</p>';
  if(append) container.innerHTML += html; else container.innerHTML = html;
  container.querySelectorAll('button[data-source]').forEach(b=>b.onclick=()=>openInquiry(b.dataset.id,b.dataset.source,b.dataset.local));
}
function countOffersFromLocal(i){ try{return Object.keys(i.offers||{}).length}catch(e){return 0} }
async function openInquiry(id, source='db', localKey=''){
  if(source==='local'){
    const item=localInquiryBackups().find(x=>x.local_key===localKey || String(x.id||'')===String(id));
    if(!item){ alert('Lokální záloha nebyla nalezena.'); return; }
    applyState(item);
  } else {
    const res = await api('/api/inquiries/'+id);
    applyState(res.item);
  }
  if($('savedInquiryModal')) $('savedInquiryModal').classList.add('hidden');
  showView('inquiryView');
  $('saveStatus').textContent='Poptávka načtena včetně nabídek a zprávy.';
  updateActiveInquiryBanner();
}
function applyState(s){
  state = {...state, ...s, offers:s.offers||{}};
  if((!state.offers || !Object.keys(state.offers).length) && state.id){
    const local = localInquiryBackups().find(x=>String(x.id||'')===String(state.id) && x.offers && Object.keys(x.offers).length);
    if(local){ state.offers = local.offers; $('saveStatus').textContent='Nabídky byly doplněny z lokální zálohy prohlížeče.'; }
  }
  $('inquiryId').value = state.id || '';
  if($('inquiryStatusSelect')) $('inquiryStatusSelect').value = state.status || 'rozpracováno';
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


function statusClass(st){
  const s=(st||'rozpracováno').toLowerCase();
  if(s.includes('uzav')) return 'done';
  if(s.includes('zru')) return 'bad';
  if(s.includes('klient')) return 'client';
  if(s.includes('nabíd')) return 'offers';
  if(s.includes('poji')) return 'sent';
  return 'draft';
}
function updateActiveInquiryBanner(){
  const b=$('activeInquiryBanner'); if(!b) return;
  const has=!!state.id;
  b.classList.toggle('hidden', !has);
  if(!has) return;
  const offerCount=Object.keys(state.offers||{}).length;
  const client=state.client?.name || 'Bez názvu klienta';
  const activity=state.activity?.name || 'bez činnosti';
  $('activeInquiryTitle').textContent = `#${state.id} – ${client}`;
  $('activeInquiryMeta').innerHTML = `<span class="workflow-badge ${statusClass(state.status)}">${state.status||'rozpracováno'}</span> · ${activity} · Nabídky: ${offerCount} · zdroj: DB`;
  if($('inquiryStatusSelect')) $('inquiryStatusSelect').value = state.status || 'rozpracováno';
}
function inquiryMatchesFilters(i, status, search){
  if(status && (i.status||'')!==status) return false;
  if(!search) return true;
  return JSON.stringify(i||{}).toLowerCase().includes(search.toLowerCase().trim());
}
async function getInquiryItems(){
  try{ const res=await api('/api/inquiries'); window.__lastInquiryItems=(res.items||[]).map(x=>({...x,source:'db'})); return window.__lastInquiryItems; }
  catch(e){ return localInquiryBackups().map(x=>({id:x.id||'', local_key:x.local_key, title:x.title||('Poptávka – '+(x.client?.name||'klient')), client_name:x.client?.name||'', activity_name:x.activity?.name||'', adviser_name:x.adviser?.name||'', adviser_email:x.adviser?.email||'', status:x.status||'rozpracováno', offer_count:Object.keys(x.offers||{}).length, updated_at:x.local_saved_at||'', source:'local'})); }
}

function workflowTilesHtml(items){
  const statuses=['rozpracováno','odesláno pojišťovnám','nabídky přijaty','odesláno klientovi','uzavřeno','zrušeno'];
  const counts=Object.fromEntries(statuses.map(s=>[s,0]));
  (items||[]).forEach(i=>{ const st=i.status||'rozpracováno'; counts[st]=(counts[st]||0)+1; });
  return `<div class="tile-row compact">${statuses.map(st=>`<div class="workflow-tile ${statusClass(st)}"><div>${st}</div><strong>${counts[st]||0}</strong></div>`).join('')}</div>`;
}
function workflowTableHtml(items, showAdvisor){
  if(!items.length) return '<div class="admin-empty">Žádná poptávka neodpovídá filtru.</div>';
  return `<table><thead><tr><th>ID</th><th>Klient</th><th>Činnost</th>${showAdvisor?'<th>Poradce</th>':''}<th>Stav</th><th>Nabídky</th><th>Poslední změna</th><th>Akce</th></tr></thead><tbody>${items.map(i=>`<tr><td>${i.source==='db'?'#'+i.id:'lokální'}</td><td><b>${i.client_name||i.title||'Bez názvu'}</b><br><small>${i.ico||''}</small></td><td>${i.activity_name||'—'}</td>${showAdvisor?`<td>${i.adviser_name||'—'}<br><small>${i.adviser_email||''}</small></td>`:''}<td><span class="workflow-badge ${statusClass(i.status)}">${i.status||'rozpracováno'}</span></td><td>${i.offer_count ?? 0}</td><td>${formatDateTimeCz(i.updated_at)||'—'}</td><td><button class="secondary small-open" data-id="${i.id||''}" data-local="${i.local_key||''}" data-source="${i.source||'db'}">Otevřít</button></td></tr>`).join('')}</tbody></table>`;
}
async function renderMyInquiries(){
  const el=$('myInquiriesTable'); if(!el) return;
  el.innerHTML='Načítám...';
  const items=(await getInquiryItems()).filter(i=>(i.adviser_email||'').toLowerCase()===(currentUser?.email||'').toLowerCase() || currentUser?.role==='admin');
  const status=$('myInquiryStatusFilter')?.value||''; const search=$('myInquirySearch')?.value||'';
  const filtered=items.filter(i=>inquiryMatchesFilters(i,status,search));
  if($('myInquiryTiles')) $('myInquiryTiles').innerHTML=workflowTilesHtml(items);
  el.innerHTML=workflowTableHtml(filtered,false);
  el.querySelectorAll('button[data-source]').forEach(b=>b.onclick=()=>openInquiry(b.dataset.id,b.dataset.source,b.dataset.local));
}
async function renderAdminInquiries(){
  const el=$('adminInquiriesTable'); if(!el) return;
  el.innerHTML='Načítám...';
  const status=$('adminInquiryStatusFilter')?.value||''; const search=$('adminInquirySearch')?.value||'';
  const items=(await getInquiryItems()).filter(i=>inquiryMatchesFilters(i,status,search));
  if($('adminInquiryTiles')) $('adminInquiryTiles').innerHTML=workflowTilesHtml(items);
  if($('adminInquiryCount')) $('adminInquiryCount').textContent=`Zobrazeno ${items.length} poptávek`;
  el.innerHTML=workflowTableHtml(items,true);
  el.querySelectorAll('button[data-source]').forEach(b=>b.onclick=()=>openInquiry(b.dataset.id,b.dataset.source,b.dataset.local));
}

function showAdminTab(id){
  document.querySelectorAll('.admin-section').forEach(x=>x.classList.add('hidden'));
  $(id).classList.remove('hidden');
  document.querySelectorAll('.admin-tab').forEach(t=>t.classList.toggle('active', t.dataset.adminTab===id));
}
function renderAdmin(){ ensureAdminFilters(); renderAdminInquiries(); renderAdminInsurers(); renderAdminAdvisers(); renderAdminActivities(); renderAdminRisks(); renderAdminReqTypes(); renderAdminDictionary(); renderAdminPolicyRefs(); renderRiskModelAdmin(); enhanceAdminDetailButtons(); }
function renderAdminInsurers(){
  ensureAdminFilters();
  const search = adminFilterText('adminInsurerSearch');
  const list = (CATALOG.insurers||[]).map((i,idx)=>({...i,_idx:idx})).filter(i=>rowMatchesSearch(i,search));
  const rows = list.map((i)=>`<div class="admin-row insurer" data-idx="${i._idx}"><input class="adm-id" value="${i.id||''}" placeholder="id"><input class="adm-name" value="${i.name||''}" placeholder="název pojišťovny"><input class="adm-short" value="${i.short||''}" placeholder="zkratka"><select class="adm-active"><option value="true" ${i.active?'selected':''}>aktivní</option><option value="false" ${!i.active?'selected':''}>neaktivní</option></select><button class="secondary adm-del">Smazat</button></div>`).join('');
  $('insurersAdminTable').innerHTML = `<div class="admin-row insurer admin-head"><div>ID</div><div>Název</div><div>Zkratka</div><div>Stav</div><div></div></div>${rows || '<div class="admin-empty">Žádná pojišťovna neodpovídá filtru.</div>'}`;
  $('insurersAdminTable').querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.insurers.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminInsurers(); renderCatalogs(); updateAll(); });
  $('insurersAdminTable').querySelectorAll('input,select').forEach(el=>el.oninput=collectAdminInsurers);
  enhanceAdminDetailButtons();
}
function collectAdminInsurers(){
  CATALOG.insurers = Array.from(document.querySelectorAll('#insurersAdminTable .admin-row.insurer:not(.admin-head)')).map(row=>({id:row.querySelector('.adm-id').value.trim() || ('ins_'+Date.now()), name:row.querySelector('.adm-name').value.trim(), short:row.querySelector('.adm-short').value.trim(), active:row.querySelector('.adm-active').value==='true'}));
  renderCatalogs(); updateAll();
}
function addAdminInsurer(){ collectAdminInsurers(); CATALOG.insurers.push({id:'nova_'+Date.now(), name:'Nová pojišťovna', short:'', active:true}); renderAdminInsurers(); renderCatalogs(); }
function renderAdminAdvisers(){
  ensureAdminFilters();
  const search = adminFilterText('adminAdviserSearch');
  const role = $('adminAdviserRoleFilter')?.value || '';
  const list = (CATALOG.advisers||[]).map((a,idx)=>({...a,_idx:idx})).filter(a=>(!role || a.role===role) && rowMatchesSearch(a,search));
  const rows = list.map((a)=>`<div class="admin-row adviser" data-idx="${a._idx}"><input class="adm-email" value="${a.email||''}" placeholder="email"><input class="adm-name" value="${a.name||''}" placeholder="jméno"><select class="adm-role"><option value="advisor" ${a.role!=='admin'?'selected':''}>poradce</option><option value="admin" ${a.role==='admin'?'selected':''}>admin</option></select><input class="adm-company" value="${a.company||'ASTORIE a.s.'}" placeholder="společnost"><input class="adm-reg" value="${a.registration||''}" placeholder="registrace"><button class="secondary adm-del">Smazat</button></div>`).join('');
  $('advisersAdminTable').innerHTML = `<div class="admin-row adviser admin-head"><div>E-mail</div><div>Jméno</div><div>Role</div><div>Společnost</div><div>Status</div><div></div></div>${rows || '<div class="admin-empty">Žádný poradce neodpovídá filtru.</div>'}`;
  $('advisersAdminTable').querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.advisers.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminAdvisers(); });
  $('advisersAdminTable').querySelectorAll('input,select').forEach(el=>el.oninput=collectAdminAdvisers);
  enhanceAdminDetailButtons();
}
function collectAdminAdvisers(){
  const oldByEmail = Object.fromEntries((CATALOG.advisers||[]).map(a=>[a.email,a]));
  CATALOG.advisers = Array.from(document.querySelectorAll('#advisersAdminTable .admin-row.adviser:not(.admin-head)')).map(row=>{ const email=row.querySelector('.adm-email').value.trim(); return {email, name:row.querySelector('.adm-name').value.trim(), role:row.querySelector('.adm-role').value, company:row.querySelector('.adm-company').value.trim(), registration:row.querySelector('.adm-reg').value.trim(), password:(oldByEmail[email]?.password || 'Astorie2026!')}; });
}
function addAdminAdviser(){ collectAdminAdvisers(); CATALOG.advisers.push({email:'novy.poradce@astorie.local', name:'Nový poradce', role:'advisor', company:'ASTORIE a.s.', registration:'samostatný zprostředkovatel', password:'Astorie2026!'}); renderAdminAdvisers(); }
function renderAdminReqTypes(){
  ensureAdminFilters();
  const search = adminFilterText('adminReqTypeSearch');
  const list = (CATALOG.requirementTypes||[]).map((r,idx)=>({...r,_idx:idx})).filter(r=>rowMatchesSearch(r,search));
  const rows = list.map((r)=>`<div class="admin-row reqtype" data-idx="${r._idx}"><input class="adm-id" value="${r.id||''}" placeholder="id"><input class="adm-name" value="${r.name||''}" placeholder="název"><button class="secondary adm-del">Smazat</button></div>`).join('');
  $('reqTypesAdminTable').innerHTML = `<div class="admin-row reqtype admin-head"><div>ID</div><div>Název</div><div></div></div>${rows || '<div class="admin-empty">Žádný typ neodpovídá filtru.</div>'}`;
  $('reqTypesAdminTable').querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.requirementTypes.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminReqTypes(); });
  $('reqTypesAdminTable').querySelectorAll('input').forEach(el=>el.oninput=collectAdminReqTypes);
  enhanceAdminDetailButtons();
}
function collectAdminReqTypes(){ CATALOG.requirementTypes = Array.from(document.querySelectorAll('#reqTypesAdminTable .admin-row.reqtype:not(.admin-head)')).map(row=>({id:row.querySelector('.adm-id').value.trim() || ('typ_'+Date.now()), name:row.querySelector('.adm-name').value.trim()})); }
function addAdminReqType(){ collectAdminReqTypes(); CATALOG.requirementTypes.push({id:'novy_'+Date.now(), name:'Nový typ doplňující informace'}); renderAdminReqTypes(); }

function renderRiskModelAdmin(){
  ensureAdminFilters();
  const activity = $('adminRiskModelActivityFilter')?.value || '';
  const search = adminFilterText('adminRiskModelSearch');
  const all = (CATALOG.riskModel||[]).map((m,idx)=>({...m,_idx:idx}));
  const filtered = all.filter(m=>(!activity || m.activity_code===activity) && rowMatchesSearch(m,search));
  if($('adminRiskModelCount')) $('adminRiskModelCount').textContent = `Zobrazeno ${filtered.length} z ${all.length} pravidel`;
  const rows = filtered.map((m)=>`<div class="admin-row riskmodel" data-idx="${m._idx}">
    <input class="rm-act" value="${m.activity_code||''}" placeholder="kód činnosti">
    <input class="rm-risk" value="${m.risk_id||''}" placeholder="id rizika">
    <input class="rm-name" value="${m.risk_name||''}" placeholder="název rizika">
    <select class="rm-critical"><option ${m.criticality==='nízká'?'selected':''}>nízká</option><option ${m.criticality==='střední'?'selected':''}>střední</option><option ${m.criticality==='vysoká'?'selected':''}>vysoká</option><option ${m.criticality==='kritická'?'selected':''}>kritická</option></select>
    <select class="rm-obligation"><option ${m.obligation==='doporučené'?'selected':''}>doporučené</option><option ${m.obligation==='důležité'?'selected':''}>důležité</option><option ${m.obligation==='nutné'?'selected':''}>nutné</option><option ${m.obligation==='povinné'?'selected':''}>povinné</option></select>
    <input class="rm-weight" type="number" min="0" max="150" value="${m.weight||50}" placeholder="váha">
    <input class="rm-limit" value="${m.recommended_limit||''}" placeholder="doporučený limit">
    <textarea class="rm-rec" placeholder="text doporučení">${m.recommendation_text||''}</textarea>
    <button type="button" class="secondary adm-del">Smazat</button>
  </div>`).join('');
  $('riskModelAdminTable').innerHTML = `<div class="admin-row riskmodel admin-head"><div>Činnost</div><div>Riziko ID</div><div>Název</div><div>Kritičnost</div><div>Povinnost</div><div>Váha</div><div>Limit</div><div>Doporučení</div><div></div></div>${rows || '<div class="admin-empty">Žádné pravidlo neodpovídá filtru.</div>'}`;
  $('riskModelAdminTable').querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.riskModel.splice(+btn.closest('.admin-row').dataset.idx,1); renderRiskModelAdmin(); updateAll(); });
  $('riskModelAdminTable').querySelectorAll('input,select,textarea').forEach(el=>el.oninput=collectRiskModelAdmin);
  enhanceAdminDetailButtons();
}
function collectRiskModelAdmin(){
  CATALOG.riskModel = Array.from(document.querySelectorAll('#riskModelAdminTable .admin-row.riskmodel:not(.admin-head)')).map(row=>({
    activity_code: row.querySelector('.rm-act').value.trim(),
    risk_id: row.querySelector('.rm-risk').value.trim(),
    risk_name: row.querySelector('.rm-name').value.trim(),
    criticality: row.querySelector('.rm-critical').value,
    obligation: row.querySelector('.rm-obligation').value,
    weight: Number(row.querySelector('.rm-weight').value || 50),
    recommended_limit: row.querySelector('.rm-limit').value.trim(),
    evaluation_type: 'kombinace',
    recommendation_text: row.querySelector('.rm-rec').value.trim(),
    warning_text: 'Ověřte krytí, limit, sublimit, výluky a zdroj v pojistných podmínkách.',
    active: true
  }));
}
function addRiskModelRule(){
  collectRiskModelAdmin();
  const act=$('adminRiskModelActivityFilter')?.value || state.activity?.code || 'stavba';
  CATALOG.riskModel.push({activity_code:act, risk_id:'nove_riziko', risk_name:'Nové riziko', criticality:'střední', obligation:'doporučené', weight:50, recommended_limit:'', evaluation_type:'kombinace', recommendation_text:'', warning_text:'Ověřit v podmínkách.', active:true});
  renderRiskModelAdmin();
}

async function saveAdminCatalogs(){
  collectAdminInsurers(); collectAdminAdvisers(); collectAdminActivities(); collectAdminRisks(); collectAdminReqTypes(); collectAdminDictionary(); collectAdminPolicyRefs(); collectRiskModelAdmin();
  $('adminSaveStatus').textContent='Ukládám do databáze...';
  try{
    const res = await api('/api/admin/catalogs', {method:'POST', body:JSON.stringify({actor_email:state.adviser?.email||'', insurers:CATALOG.insurers, advisers:CATALOG.advisers, activities:CATALOG.activities, risks:CATALOG.risks, requirementTypes:CATALOG.requirementTypes, coverageDictionary:CATALOG.coverageDictionary, policyReferences:CATALOG.policyReferences, riskModel:CATALOG.riskModel})});
    $('adminSaveStatus').textContent=res.message || 'Uloženo.';
    renderCatalogs(); renderOffers(); updateAll();
  }catch(e){ $('adminSaveStatus').textContent='Chyba: '+e.message; }
}


function activityOptionsHtml(selected='', includeAll=true){
  const opts = (CATALOG.activities||[]).map(a=>`<option value="${a.code||''}" ${selected===(a.code||'')?'selected':''}>${a.name||a.code||''}</option>`).join('');
  return (includeAll?'<option value="">Všechny činnosti</option>':'') + opts;
}
function adminFilterText(id){ return ($(id)?.value || '').toLowerCase().trim(); }
function ensureAdminFilters(){
  const bind = (id, fn)=>{ const el=$(id); if(el && el.dataset.bound!=='1'){ el.dataset.bound='1'; el.oninput=fn; el.onchange=fn; }};
  if($('adminRiskActivityFilter')) $('adminRiskActivityFilter').innerHTML = activityOptionsHtml($('adminRiskActivityFilter').value||'', true);
  if($('adminRiskModelActivityFilter')) $('adminRiskModelActivityFilter').innerHTML = activityOptionsHtml($('adminRiskModelActivityFilter').value||'', true);
  if($('adminPolicyInsurerFilter')) $('adminPolicyInsurerFilter').innerHTML = '<option value="">Všechny pojišťovny</option>' + (CATALOG.insurers||[]).map(i=>`<option value="${i.id||''}" ${($('adminPolicyInsurerFilter').value||'')===(i.id||'')?'selected':''}>${i.short||''} – ${i.name||''}</option>`).join('');
  bind('adminInsurerSearch', renderAdminInsurers);
  bind('adminAdviserSearch', renderAdminAdvisers);
  bind('adminAdviserRoleFilter', renderAdminAdvisers);
  bind('adminReqTypeSearch', renderAdminReqTypes);
  bind('adminActivitySearch', renderAdminActivities);
  bind('adminRiskActivityFilter', renderAdminRisks);
  bind('adminRiskSearch', renderAdminRisks);
  bind('adminRiskModelActivityFilter', renderRiskModelAdmin);
  bind('adminRiskModelSearch', renderRiskModelAdmin);
  bind('adminDictionarySearch', renderAdminDictionary);
  bind('adminPolicyInsurerFilter', renderAdminPolicyRefs);
  bind('adminPolicySearch', renderAdminPolicyRefs);
}
function rowMatchesSearch(obj, search){
  if(!search) return true;
  return JSON.stringify(obj||{}).toLowerCase().includes(search);
}
function saveCurrentWorkLocally(){
  try{ collectForm(); collectOffers(true); backupInquiryLocally(state); }catch(e){ console.warn('Lokální záloha se nepodařila', e); }
}
let offerAutosaveTimer=null;
function scheduleOfferAutosave(){
  saveCurrentWorkLocally();
  if(!state.id) return;
  clearTimeout(offerAutosaveTimer);
  offerAutosaveTimer=setTimeout(async()=>{
    try{ collectForm(); collectOffers(true); await api('/api/inquiries', {method:'POST', body:JSON.stringify(state)}); $('saveStatus').textContent='Nabídky byly automaticky uloženy.'; }
    catch(e){ $('saveStatus').textContent='Nabídky jsou v lokální záloze. DB uložení selhalo: '+e.message; }
  }, 900);
}

function renderAdminActivities(){
  ensureAdminFilters();
  const search = adminFilterText('adminActivitySearch');
  const base = (CATALOG.activities||[]).map((a,idx)=>({...a,_idx:idx})).filter(a=>rowMatchesSearch(a,search));
  const rows = base.map((a)=>`<div class="admin-row activity" data-idx="${a._idx}">
    <input class="act-code" value="${a.code||''}" placeholder="kód">
    <input class="act-name" value="${a.name||''}" placeholder="název činnosti">
    <textarea class="act-desc" placeholder="laický popis pro poradce">${a.description||''}</textarea>
    <input class="act-risk" value="${a.risk_level||''}" placeholder="rizikovost">
    <input class="act-limit" value="${a.limit_hint||''}" placeholder="orientační limit">
    <button type="button" class="secondary adm-del">Smazat</button>
  </div>`).join('');
  const el=$('activitiesAdminTable'); if(!el) return;
  el.innerHTML = `<div class="admin-row activity admin-head"><div>Kód</div><div>Název</div><div>Popis</div><div>Rizikovost</div><div>Limit</div><div></div></div>${rows || '<div class="admin-empty">Žádný záznam neodpovídá filtru.</div>'}`;
  el.querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.activities.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminActivities(); renderCatalogs(); updateAll(); });
  el.querySelectorAll('input,textarea').forEach(x=>x.oninput=collectAdminActivities);
  enhanceAdminDetailButtons();
}
function collectAdminActivities(){
  const el=$('activitiesAdminTable'); if(!el) return;
  CATALOG.activities = Array.from(el.querySelectorAll('.admin-row.activity:not(.admin-head)')).map(row=>({
    code: row.querySelector('.act-code').value.trim() || ('typ_'+Date.now()),
    name: row.querySelector('.act-name').value.trim(),
    description: row.querySelector('.act-desc').value.trim(),
    risk_level: row.querySelector('.act-risk').value.trim(),
    limit_hint: row.querySelector('.act-limit').value.trim()
  })).filter(a=>a.name || a.code);
}
function addAdminActivity(){ collectAdminActivities(); CATALOG.activities.push({code:'novy_typ_'+Date.now(), name:'Nový typ klienta', description:'Doplňte popis činnosti pro poradce.', risk_level:'střední', limit_hint:''}); renderAdminActivities(); renderCatalogs(); }

function allRiskRows(){
  const out=[]; const risks=CATALOG.risks||{};
  Object.keys(risks).forEach(activity_code => (risks[activity_code]||[]).forEach(r=>out.push({...r, activity_code})));
  return out;
}
function setRisksFromRows(rows){
  const grouped={};
  rows.forEach(r=>{ const act=r.activity_code||state.activity?.code||'univerzal'; if(!grouped[act]) grouped[act]=[]; const copy={...r}; delete copy.activity_code; grouped[act].push(copy); });
  CATALOG.risks = grouped;
}
function renderAdminRisks(){
  ensureAdminFilters();
  const activity = $('adminRiskActivityFilter')?.value || '';
  const search = adminFilterText('adminRiskSearch');
  const all = allRiskRows().map((r,idx)=>({...r,_idx:idx}));
  const filtered = all.filter(r=>(!activity || r.activity_code===activity) && rowMatchesSearch(r,search));
  if($('adminRiskCount')) $('adminRiskCount').textContent = `Zobrazeno ${filtered.length} z ${all.length} rizik`;
  const rows = filtered.map((r)=>`<div class="admin-row riskdef" data-idx="${r._idx}">
    <input class="risk-act" value="${r.activity_code||''}" placeholder="kód činnosti">
    <input class="risk-id" value="${r.id||''}" placeholder="id rizika">
    <input class="risk-name" value="${r.name||''}" placeholder="název rizika">
    <input class="risk-priority" value="${r.priority||''}" placeholder="priorita">
    <textarea class="risk-desc" placeholder="vysvětlení pro poradce">${r.description||''}</textarea>
    <input class="risk-limit" value="${r.limit||''}" placeholder="limit">
    <textarea class="risk-question" placeholder="otázka pro klienta">${r.question||''}</textarea>
    <textarea class="risk-reason" placeholder="důvod doporučení">${r.reason||''}</textarea>
    <select class="risk-default"><option value="true" ${r.default_on!==false?'selected':''}>předvolit</option><option value="false" ${r.default_on===false?'selected':''}>nepředvolit</option></select>
    <button type="button" class="secondary adm-del">Smazat</button>
  </div>`).join('');
  const el=$('risksAdminTable'); if(!el) return;
  el.innerHTML = `<div class="admin-row riskdef admin-head"><div>Činnost</div><div>ID</div><div>Název</div><div>Priorita</div><div>Popis</div><div>Limit</div><div>Otázka</div><div>Důvod</div><div>Stav</div><div></div></div>${rows || '<div class="admin-empty">Žádné riziko neodpovídá filtru.</div>'}`;
  el.querySelectorAll('.adm-del').forEach(btn=>{ btn.onclick=()=>{ const arr=allRiskRows(); arr.splice(+btn.closest('.admin-row').dataset.idx,1); setRisksFromRows(arr); renderAdminRisks(); renderCatalogs(); updateAll(); }; });
  el.querySelectorAll('input,select,textarea').forEach(x=>x.oninput=collectAdminRisks);
  enhanceAdminDetailButtons();
}
function collectAdminRisks(){
  const el=$('risksAdminTable'); if(!el) return;
  const rows = Array.from(el.querySelectorAll('.admin-row.riskdef:not(.admin-head)')).map(row=>({
    activity_code: row.querySelector('.risk-act').value.trim(),
    id: row.querySelector('.risk-id').value.trim() || ('risk_'+Date.now()),
    name: row.querySelector('.risk-name').value.trim(),
    priority: row.querySelector('.risk-priority').value.trim() || 'DOPORUČENÉ',
    description: row.querySelector('.risk-desc').value.trim(),
    limit: row.querySelector('.risk-limit').value.trim(),
    question: row.querySelector('.risk-question').value.trim(),
    reason: row.querySelector('.risk-reason').value.trim(),
    default_on: row.querySelector('.risk-default').value==='true'
  })).filter(r=>r.name || r.id);
  setRisksFromRows(rows);
}
function addAdminRisk(){ collectAdminRisks(); const rows=allRiskRows(); const act=$('adminRiskActivityFilter')?.value || state.activity?.code || 'univerzal'; rows.push({activity_code:act, id:'nove_riziko_'+Date.now(), name:'Nové riziko', priority:'DOPORUČENÉ', description:'Doplňte vysvětlení pro poradce.', limit:'', question:'Doplňte otázku pro klienta.', reason:'Doplňte důvod doporučení.', default_on:true}); setRisksFromRows(rows); renderAdminRisks(); renderCatalogs(); }

function renderAdminDictionary(){
  ensureAdminFilters();
  const search = adminFilterText('adminDictionarySearch');
  const data=(CATALOG.coverageDictionary||[]).map((d,idx)=>({...d,_idx:idx})).filter(d=>rowMatchesSearch(d,search));
  const rows = data.map((d)=>`<div class="admin-row dictionary" data-idx="${d._idx}"><input class="dict-risk" value="${d.risk_id||''}" placeholder="risk_id"><input class="dict-standard" value="${d.standard_name||''}" placeholder="jednotný název"><textarea class="dict-aliases" placeholder="alternativní názvy oddělené čárkou">${(d.aliases||[]).join(', ')}</textarea><button type="button" class="secondary adm-del">Smazat</button></div>`).join('');
  const el=$('dictionaryAdminTable'); if(!el) return;
  el.innerHTML = `<div class="admin-row dictionary admin-head"><div>Risk ID</div><div>Název ASTORIE</div><div>Názvy pojišťoven / synonyma</div><div></div></div>${rows || '<div class="admin-empty">Žádné mapování neodpovídá filtru.</div>'}`;
  el.querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.coverageDictionary.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminDictionary(); });
  el.querySelectorAll('input,textarea').forEach(x=>x.oninput=collectAdminDictionary);
  enhanceAdminDetailButtons();
}
function collectAdminDictionary(){
  const el=$('dictionaryAdminTable'); if(!el) return;
  CATALOG.coverageDictionary = Array.from(el.querySelectorAll('.admin-row.dictionary:not(.admin-head)')).map(row=>({risk_id:row.querySelector('.dict-risk').value.trim(), standard_name:row.querySelector('.dict-standard').value.trim(), aliases:row.querySelector('.dict-aliases').value.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean)})).filter(d=>d.risk_id || d.standard_name);
}
function addAdminDictionary(){ collectAdminDictionary(); CATALOG.coverageDictionary.push({risk_id:'nove_riziko', standard_name:'Nové mapování', aliases:[]}); renderAdminDictionary(); }

function renderAdminPolicyRefs(){
  ensureAdminFilters();
  const insurer=$('adminPolicyInsurerFilter')?.value || '';
  const search=adminFilterText('adminPolicySearch');
  const data=(CATALOG.policyReferences||[]).map((r,idx)=>({...r,_idx:idx})).filter(r=>(!insurer || r.insurer_id===insurer) && rowMatchesSearch(r,search));
  const rows = data.map((r)=>`<div class="admin-row policyref" data-idx="${r._idx}"><input class="pr-insurer" value="${r.insurer_id||''}" placeholder="pojišťovna ID"><input class="pr-risk" value="${r.risk_id||''}" placeholder="risk_id"><input class="pr-doc" value="${r.document||''}" placeholder="dokument"><input class="pr-article" value="${r.article||''}" placeholder="článek/odstavec/strana"><textarea class="pr-note" placeholder="poznámka / výklad">${r.note||''}</textarea><input class="pr-url" value="${r.url||''}" placeholder="odkaz"><button type="button" class="secondary adm-del">Smazat</button></div>`).join('');
  const el=$('policyRefsAdminTable'); if(!el) return;
  el.innerHTML = `<div class="admin-row policyref admin-head"><div>Pojišťovna</div><div>Risk ID</div><div>Dokument</div><div>Článek</div><div>Poznámka</div><div>Odkaz</div><div></div></div>${rows || '<div class="admin-empty">Žádný zdroj neodpovídá filtru.</div>'}`;
  el.querySelectorAll('.adm-del').forEach(btn=>btn.onclick=()=>{ CATALOG.policyReferences.splice(+btn.closest('.admin-row').dataset.idx,1); renderAdminPolicyRefs(); });
  el.querySelectorAll('input,textarea').forEach(x=>x.oninput=collectAdminPolicyRefs);
  enhanceAdminDetailButtons();
}
function collectAdminPolicyRefs(){
  const el=$('policyRefsAdminTable'); if(!el) return;
  CATALOG.policyReferences = Array.from(el.querySelectorAll('.admin-row.policyref:not(.admin-head)')).map(row=>({insurer_id:row.querySelector('.pr-insurer').value.trim(), risk_id:row.querySelector('.pr-risk').value.trim(), document:row.querySelector('.pr-doc').value.trim(), article:row.querySelector('.pr-article').value.trim(), note:row.querySelector('.pr-note').value.trim(), url:row.querySelector('.pr-url').value.trim()})).filter(r=>r.insurer_id || r.risk_id || r.document);
}
function addAdminPolicyRef(){ collectAdminPolicyRefs(); CATALOG.policyReferences.push({insurer_id:'', risk_id:'', document:'', article:'', note:'', url:''}); renderAdminPolicyRefs(); }


function setupAdminDetailObserver(){
  const root = $('adminView');
  if(!root || root.dataset.detailObserver==='1') return;
  root.dataset.detailObserver='1';
  const obs = new MutationObserver(()=>enhanceAdminDetailButtons());
  obs.observe(root,{childList:true,subtree:true});
}
function enhanceAdminDetailButtons(){
  document.querySelectorAll('#adminView .admin-row:not(.admin-head)').forEach(row=>{
    if(row.querySelector('.adm-open-detail')) return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='secondary adm-open-detail';
    btn.textContent='Upravit detail';
    btn.onclick=(ev)=>{ev.preventDefault(); openAdminDetailModal(row);};
    const del=row.querySelector('.adm-del');
    if(del) row.insertBefore(btn,del); else row.appendChild(btn);
  });
}
function niceAdminLabel(el, idx){
  const ph = el.getAttribute('placeholder');
  if(ph) return ph.charAt(0).toUpperCase()+ph.slice(1);
  const cls=[...el.classList].find(c=>!['adm-open-detail','adm-del'].includes(c));
  const map={
    'adm-id':'ID','adm-name':'Název','adm-short':'Zkratka','adm-active':'Stav','adm-email':'E-mail','adm-role':'Role','adm-company':'Společnost','adm-reg':'Registrace / status',
    'act-code':'Kód činnosti','act-name':'Název činnosti','act-desc':'Popis činnosti','act-risk':'Rizikovost','act-limit':'Orientační limit',
    'risk-act':'Činnost','risk-id':'ID rizika','risk-name':'Název rizika','risk-priority':'Priorita','risk-desc':'Popis pro poradce','risk-limit':'Limit','risk-question':'Otázka pro klienta','risk-reason':'Důvod doporučení','risk-default':'Předvolba',
    'rm-act':'Činnost','rm-risk':'ID rizika','rm-name':'Název rizika','rm-critical':'Kritičnost','rm-obligation':'Povinnost','rm-weight':'Váha','rm-limit':'Doporučený limit','rm-rec':'Doporučení / upozornění',
    'dict-risk':'ID rizika','dict-standard':'Jednotný název ASTORIE','dict-aliases':'Synonyma / názvy pojišťoven',
    'pr-insurer':'Pojišťovna','pr-risk':'ID rizika','pr-doc':'Dokument','pr-article':'Článek / odstavec / strana','pr-note':'Poznámka / výklad','pr-url':'Odkaz'
  };
  return map[cls] || ('Pole '+(idx+1));
}
function openAdminDetailModal(row){
  currentAdminDetail = {row, fields:[]};
  const title = row.querySelector('input[value], textarea')?.value || row.querySelector('input')?.value || 'Detail záznamu';
  $('adminDetailTitle').textContent = 'Detail záznamu – ' + (title || 'úprava');
  const form=$('adminDetailForm'); form.innerHTML='';
  const fields=[...row.querySelectorAll('input, textarea, select')].filter(el=>!el.classList.contains('adm-open-detail') && !el.classList.contains('adm-del'));
  fields.forEach((el,idx)=>{
    const label=document.createElement('label');
    if(el.tagName==='TEXTAREA') label.classList.add('full');
    label.textContent=niceAdminLabel(el,idx);
    let clone;
    if(el.tagName==='SELECT'){
      clone=document.createElement('select');
      [...el.options].forEach(o=>{const no=document.createElement('option'); no.value=o.value; no.textContent=o.textContent; no.selected=o.selected; clone.appendChild(no);});
    }else if(el.tagName==='TEXTAREA'){
      clone=document.createElement('textarea'); clone.value=el.value || '';
    }else{
      clone=document.createElement('input'); clone.type=el.type||'text'; clone.value=el.value || '';
    }
    clone.dataset.fieldIndex=idx;
    label.appendChild(clone); form.appendChild(label);
    currentAdminDetail.fields.push({source:el, edit:clone});
  });
  $('adminDetailModal').classList.remove('hidden');
}
function saveAdminDetailModal(){
  if(!currentAdminDetail) return;
  currentAdminDetail.fields.forEach(f=>{
    f.source.value=f.edit.value;
    f.source.dispatchEvent(new Event('input',{bubbles:true}));
    f.source.dispatchEvent(new Event('change',{bubbles:true}));
  });
  $('adminDetailModal').classList.add('hidden');
  collectAdminInsurers(); collectAdminAdvisers(); collectAdminActivities(); collectAdminRisks(); collectAdminReqTypes(); collectAdminDictionary(); collectAdminPolicyRefs(); collectRiskModelAdmin();
  renderCatalogs(); updateAll(); enhanceAdminDetailButtons();
}

function parseDelimitedTable(raw){
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if(lines.length<2) return [];
  const delim = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
  const split = (line)=> line.split(delim).map(x=>x.trim().replace(/^"|"$/g,''));
  const headers = split(lines[0]).map(h=>h.trim());
  return lines.slice(1).map(line=>{ const vals=split(line); const o={}; headers.forEach((h,i)=>o[h]=vals[i]||''); return o; });
}
function normalizeBool(v){ return String(v||'').toLowerCase().trim(); }
function runCatalogImport(){
  const type=$('importCatalogType').value, fmt=$('importFormat').value, raw=$('importDataBox').value.trim();
  if(!raw){ $('importStatus').textContent='Vlož data k importu.'; return; }
  try{
    let data = fmt==='json' ? JSON.parse(raw) : parseDelimitedTable(raw);
    if(fmt==='json' && data[type]) data=data[type];
    if(type==='activities') CATALOG.activities = data.map(x=>({code:x.code||x.kod||x.id||'', name:x.name||x.nazev||'', description:x.description||x.popis||'', risk_level:x.risk_level||x.rizikovost||'', limit_hint:x.limit_hint||x.limit||''}));
    if(type==='risks'){
      const rows=data.map(x=>({activity_code:x.activity_code||x.cinnost||x.typ_klienta||'', id:x.id||x.risk_id||'', name:x.name||x.nazev||'', priority:x.priority||x.priorita||'DOPORUČENÉ', description:x.description||x.popis||'', limit:x.limit||x.limit_hint||'', question:x.question||x.otazka||'', reason:x.reason||x.duvod||'', default_on: !['ne','false','0'].includes(normalizeBool(x.default_on||x.predvolit))}));
      setRisksFromRows(rows);
    }
    if(type==='coverageDictionary') CATALOG.coverageDictionary = data.map(x=>({risk_id:x.risk_id||x.id||'', standard_name:x.standard_name||x.nazev_astorie||x.name||'', aliases:String(x.aliases||x.synonyma||x.nazvy||'').split(/[,;|]/).map(a=>a.trim()).filter(Boolean)}));
    if(type==='policyReferences') CATALOG.policyReferences = data.map(x=>({insurer_id:x.insurer_id||x.pojistovna||'', risk_id:x.risk_id||'', document:x.document||x.dokument||'', article:x.article||x.clanek||x.odstavec||'', note:x.note||x.poznamka||'', url:x.url||x.odkaz||''}));
    if(type==='riskModel') CATALOG.riskModel = data.map(x=>({activity_code:x.activity_code||x.cinnost||'', risk_id:x.risk_id||'', risk_name:x.risk_name||x.name||x.nazev||'', criticality:x.criticality||x.kriticnost||'střední', obligation:x.obligation||x.povinnost||'doporučené', weight:Number(x.weight||x.vaha||50), recommended_limit:x.recommended_limit||x.limit||'', evaluation_type:x.evaluation_type||'kombinace', recommendation_text:x.recommendation_text||x.doporuceni||'', warning_text:x.warning_text||x.upozorneni||'Ověřit v podmínkách.', active:true}));
    if(type==='insurers') CATALOG.insurers = data.map(x=>({id:x.id||x.short||x.zkratka||'', name:x.name||x.nazev||'', short:x.short||x.zkratka||'', active: !['ne','false','0'].includes(normalizeBool(x.active||x.aktivni))}));
    if(type==='advisers') CATALOG.advisers = data.map(x=>({email:x.email||'', name:x.name||x.jmeno||'', role:x.role||'advisor', company:x.company||'ASTORIE a.s.', registration:x.registration||'', password:x.password||'Poradce2026!'}));
    renderAdmin(); renderCatalogs(); updateAll();
    $('importStatus').textContent='Import načten do adminu. Pro trvalé uložení klikni na „Uložit admin číselníky do DB“.';
  }catch(e){ $('importStatus').textContent='Import se nepodařil: '+e.message; }
}
async function exportCatalogJson(){
  const type=$('importCatalogType').value; collectAdminInsurers(); collectAdminAdvisers(); collectAdminActivities(); collectAdminRisks(); collectAdminReqTypes(); collectAdminDictionary(); collectAdminPolicyRefs(); collectRiskModelAdmin();
  const data = JSON.stringify(CATALOG[type] || {}, null, 2);
  $('importDataBox').value = data;
  try{ await navigator.clipboard.writeText(data); $('importStatus').textContent='JSON zkopírován do schránky.'; }catch(e){ $('importStatus').textContent='JSON je připraven v poli.'; }
}

function renderAIWorkflow(){
  collectForm();
  if($('aiInsurerSelect')){
    const selected = selectedInsurers();
    const source = selected.length ? selected : (CATALOG.insurers||[]).filter(i=>i.active);
    const current = $('aiInsurerSelect').value;
    $('aiInsurerSelect').innerHTML = source.map(i=>`<option value="${i.id}">${i.short||''} – ${i.name||''}</option>`).join('');
    if(current && source.some(i=>i.id===current)) $('aiInsurerSelect').value=current;
  }
  renderAIPrompt();
  renderAIProtocol();
}
function aiRiskSchema(){
  return activeRisks().map(r=>{
    const dict=getDictionary(r.id);
    const aliases=(dict?.aliases||[]).join(', ');
    const m=getRiskModel(r.id, state.activity?.code);
    return `- risk_id: ${r.id}; jednotný název ASTORIE: ${r.name}; kritičnost: ${m.criticality||'—'}; povinnost: ${m.obligation||'—'}; váha: ${m.weight||'—'}; požadovaný/orientační limit: ${m.recommended_limit||r.limit||''}; možné názvy v nabídce: ${aliases||'nejsou předvyplněny'}`;
  }).join('\n');
}
function buildAIPrompt(){
  collectForm();
  const insurerId = $('aiInsurerSelect')?.value || (state.selected_insurers||[])[0] || '';
  const insurer = (CATALOG.insurers||[]).find(i=>i.id===insurerId) || {};
  const offerLabel = $('aiOfferLabel')?.value || 'nabídka pojišťovny';
  const docsLabel = $('aiDocsLabel')?.value || 'nabídka + VPP/DPP/ZPP/IPID přiložené v chatu';
  const requirements = (state.additional_requirements||[]).map(r=>`- ${labelReqType(r.type)}: ${r.text}`).join('\n') || '- bez doplňujících požadavků';
  return `Jsi seniorní pojistný analytik a specialista na podnikatelská pojištění. Zpracuj přiloženou nabídku pojišťovny a pojistné podmínky do jednotné struktury ASTORIE.

KONTEXT POPTÁVKY:
Klient: ${state.client?.name||''}, IČO: ${state.client?.ico||''}
Činnost: ${state.activity?.name||''}
Obrat / zaměstnanci: ${state.questionnaire?.turnover||''} / ${state.questionnaire?.employees||''}
Územní rozsah: ${state.questionnaire?.territory||''}; export: ${state.questionnaire?.export_info||''}
Pojistná doba: ${state.questionnaire?.insurance_period||''}; počátek: ${state.questionnaire?.insurance_start||''}
Pojišťovna: ${insurer.short||''} – ${insurer.name||''}
Nabídka: ${offerLabel}
Dokumenty: ${docsLabel}

DOPLŇUJÍCÍ POŽADAVKY KLIENTA:
${requirements}

JEDNOTNÁ RIZIKA ASTORIE, do kterých musíš nabídku namapovat:
${aiRiskSchema()}

ÚKOL:
1. Najdi v nabídce a pojistných podmínkách odpovídající krytí pro každé jednotné riziko ASTORIE.
2. Sjednoť rozdílné názvosloví pojišťovny na risk_id ASTORIE.
3. U každé položky uveď stav: "splněno", "částečně", "nesplněno", "výluka" nebo "nevyhodnoceno".
4. Uveď limit, sublimit, spoluúčast, původní název v nabídce pojišťovny a přesný zdroj: dokument, článek, odstavec/strana.
5. Pokud zdroj nelze ověřit, napiš "nutno ověřit" a nevymýšlej si článek.
6. Upozorni na výluky, omezení, rozpory, chybějící položky a dotazy na pojišťovnu.
7. Vrať POUZE validní JSON bez komentářů a bez markdownu.

POŽADOVANÝ JSON FORMÁT:
{
  "insurer_id": "${insurerId}",
  "insurer_name": "${insurer.name||''}",
  "offer_label": "${offerLabel}",
  "premium": "",
  "deductible": "",
  "valid_until": "",
  "status": "doručeno",
  "manager_summary": "stručné manažerské shrnutí silných a slabých míst nabídky",
  "questions_to_insurer": ["dotaz 1", "dotaz 2"],
  "exclusions_or_limits": ["výluka/omezení 1"],
  "coverages": [
    {
      "risk_id": "ID rizika z výše uvedeného seznamu",
      "state": "splněno|částečně|nesplněno|výluka|nevyhodnoceno",
      "limit": "limit/sublimit uvedený v nabídce",
      "deductible": "spoluúčast, pokud se liší nebo je relevantní",
      "original_name": "původní název v nabídce pojišťovny",
      "source": "název dokumentu, článek, odstavec, strana",
      "note": "praktický dopad pro klienta a poradce"
    }
  ]
}`;
}
function renderAIPrompt(){
  if(!$('aiPromptBox')) return;
  $('aiPromptBox').value = buildAIPrompt();
}
async function copyAIPrompt(){
  renderAIPrompt();
  try{ await navigator.clipboard.writeText($('aiPromptBox').value); $('aiImportStatus').textContent='Prompt zkopírován.'; }
  catch(e){ $('aiPromptBox').select(); document.execCommand('copy'); $('aiImportStatus').textContent='Prompt zkopírován.'; }
}
function importAIJson(){
  const raw = $('aiJsonInput').value.trim();
  if(!raw){ $('aiImportStatus').textContent='Vlož JSON výstup z ChatGPT.'; return; }
  let data;
  try{ data = JSON.parse(raw); }
  catch(e){ $('aiImportStatus').textContent='JSON není validní: '+e.message; return; }
  const insurerId = data.insurer_id || $('aiInsurerSelect')?.value;
  if(!insurerId){ $('aiImportStatus').textContent='Chybí insurer_id nebo výběr pojišťovny.'; return; }
  if(!state.offers[insurerId]) state.offers[insurerId]={premium:'',deductible:'',valid_until:'',status:'doručeno',note:'',coverages:{}};
  const offer = state.offers[insurerId];
  offer.status = data.status || 'doručeno';
  offer.premium = data.premium || offer.premium || '';
  offer.deductible = data.deductible || offer.deductible || '';
  offer.valid_until = data.valid_until || offer.valid_until || '';
  offer.note = data.manager_summary || data.note || offer.note || '';
  offer.ai_questions = data.questions_to_insurer || [];
  offer.ai_exclusions = data.exclusions_or_limits || [];
  offer.ai_offer_label = data.offer_label || '';
  (data.coverages||[]).forEach(c=>{
    if(!c.risk_id) return;
    offer.coverages[c.risk_id] = {
      state:c.state || 'nevyhodnoceno',
      limit:c.limit || '',
      original:c.original_name || c.original || '',
      source:c.source || '',
      note:[c.note, c.deductible ? ('Spoluúčast: '+c.deductible) : ''].filter(Boolean).join(' | ')
    };
  });
  state.ai_imports = state.ai_imports || [];
  state.ai_imports.push({insurer_id:insurerId, imported_at:new Date().toISOString(), offer_label:data.offer_label||'', warnings:[...(data.questions_to_insurer||[]), ...(data.exclusions_or_limits||[])]});
  $('aiImportStatus').textContent='AI výstup načten do nabídky. Zkontroluj modul Nabídky a Porovnání.';
  renderOffers(); renderComparison(); renderAIProtocol(); updateAll();
}
function renderAIProtocol(){
  if(!$('aiProtocol')) return;
  const items = state.ai_imports || [];
  if(!items.length){ $('aiProtocol').innerHTML='<p class="muted">Zatím nebyl načten žádný AI výstup. Po vložení JSON zde vznikne kontrolní protokol.</p>'; return; }
  $('aiProtocol').innerHTML = `<table><thead><tr><th>Pojišťovna</th><th>Čas importu</th><th>Nabídka</th><th>Body k ověření</th></tr></thead><tbody>${items.map(i=>`<tr><td>${insurerName(i.insurer_id)}</td><td>${i.imported_at||''}</td><td>${i.offer_label||''}</td><td>${(i.warnings||[]).join('<br>')||'—'}</td></tr>`).join('')}</tbody></table>`;
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
