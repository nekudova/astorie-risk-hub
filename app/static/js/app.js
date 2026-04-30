const activities = window.ASTORIE_ACTIVITIES || [];
const allRisks = window.ASTORIE_RISKS || [];
const riskMap = Object.fromEntries(allRisks.map(r => [r.id, r]));
let state = { activity:null, risks:[], editing:null };

const $ = id => document.getElementById(id);

function moneySafe(v){return (v||'').trim();}
function cloneRisk(r){return {...r, active:true, custom:false};}

async function loadAres(){
  const ico = $('ico').value.trim();
  $('aresStatus').textContent = 'Načítám údaje z ARES…';
  try{
    const res = await fetch(`/api/ares/${encodeURIComponent(ico)}`);
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'ARES se nepodařilo načíst.');
    $('clientName').value = data.client.name || '';
    $('clientAddress').value = data.client.address || '';
    $('clientDic').value = data.client.dic || '';
    $('aresStatus').textContent = 'Údaje byly načteny z ARES. Zkontrolujte je s klientem.';
    updateOutput();
  }catch(e){
    $('aresStatus').textContent = e.message;
  }
}

function clearClient(){
  ['ico','clientName','clientAddress','clientDic','contactPerson','contactInfo','turnover','employees','currentInsurer','mainActivity','sideActivities','contracts'].forEach(id=>$(id).value='');
  ['worksAtCustomer','takesProperty','hasProduct','usesSubcontractors','exports','contractualLimits'].forEach(id=>$(id).checked=false);
  $('aresStatus').textContent='';
  updateOutput();
}

function renderActivity(){
  const box = $('activityProfile');
  if(!state.activity){box.className='profile empty';box.textContent='Vyberte činnost klienta. Zobrazí se rizikový profil a doporučené otázky.';return;}
  box.className='profile';
  box.innerHTML = `<div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start"><div><h3>${state.activity.name}</h3><p>${state.activity.summary}</p><p><b>Orientační limit:</b> ${state.activity.limitHint}</p></div><span class="badge">Rizikovost: ${state.activity.riskLevel}</span></div>`;
}

function renderRisks(){
  const grid = $('riskGrid');
  if(!state.risks.length){grid.innerHTML='<p class="profile empty">Po výběru činnosti se zde zobrazí typická rizika. Vlastní riziko lze přidat ručně.</p>'; return;}
  grid.innerHTML = state.risks.map((r,i)=>`<article class="risk-card ${r.active?'':'off'}" data-i="${i}"><div class="risk-top"><h3>${r.name}</h3><span class="priority">${r.priority}</span></div><p>${r.explanation}</p><div class="limit">Limit: ${r.defaultLimit}</div><small>${r.active?'Zahrnuto do poptávky':'Vyřazeno z poptávky'}</small></article>`).join('');
  grid.querySelectorAll('.risk-card').forEach(el=>el.addEventListener('click',()=>openRisk(Number(el.dataset.i))));
}

function selectActivity(id){
  state.activity = activities.find(a=>a.id===id) || null;
  state.risks = state.activity ? state.activity.defaultRiskIds.map(id=>cloneRisk(riskMap[id])).filter(Boolean) : [];
  applyQuestionnaireHints();
  renderActivity(); renderRisks(); updateOutput();
}

function applyQuestionnaireHints(){
  if(!state.risks.length) return;
  const ensure = id => { if(!state.risks.some(r=>r.id===id) && riskMap[id]) state.risks.push(cloneRisk(riskMap[id])); };
  if($('takesProperty')?.checked) ensure('prevzate_veci');
  if($('hasProduct')?.checked){ ensure('odpovednost_vyrobek'); ensure('stazeni_vyrobku'); }
  if($('usesSubcontractors')?.checked) ensure('subdodavatele');
  if($('exports')?.checked) ensure('export_usa_kanada');
  if($('worksAtCustomer')?.checked) ensure('vadna_prace');
}

function openRisk(i){
  state.editing = i;
  const r = state.risks[i];
  $('modalTitle').textContent = 'Detail rizika: ' + r.name;
  $('modalActive').checked = !!r.active;
  $('modalName').value = r.name || '';
  $('modalPriority').value = r.priority || '';
  $('modalLimit').value = r.defaultLimit || '';
  $('modalQuestion').value = r.clientQuestion || '';
  $('modalExplanation').value = r.explanation || '';
  $('modalClientNote').value = r.clientNote || '';
  $('modalRecommendation').value = r.recommendation || '';
  $('riskDialog').showModal();
}

function saveRisk(){
  const i = state.editing;
  if(i === null) return;
  const r = state.risks[i];
  r.active = $('modalActive').checked;
  r.name = $('modalName').value;
  r.priority = $('modalPriority').value;
  r.defaultLimit = $('modalLimit').value;
  r.clientQuestion = $('modalQuestion').value;
  r.explanation = $('modalExplanation').value;
  r.clientNote = $('modalClientNote').value;
  r.recommendation = $('modalRecommendation').value;
  renderRisks(); updateOutput();
}

function addCustomRisk(){
  const r = {id:'custom_'+Date.now(), name:'Vlastní riziko', priority:'DOPLNIT', defaultLimit:'Doplnit', explanation:'Popište riziko.', clientQuestion:'Na co se má poradce klienta zeptat?', example:'', recommendation:'Doplnit důvod doporučení.', clientNote:'', active:true, custom:true};
  state.risks.push(r); renderRisks(); openRisk(state.risks.length-1); updateOutput();
}

function updateOutput(){
  const active = state.risks.filter(r=>r.active);
  const checks = [];
  if($('worksAtCustomer').checked) checks.push('klient pracuje u zákazníka / na cizím majetku');
  if($('takesProperty').checked) checks.push('klient přebírá věci zákazníků');
  if($('hasProduct').checked) checks.push('klient vyrábí nebo dodává výrobky');
  if($('usesSubcontractors').checked) checks.push('klient používá subdodavatele');
  if($('exports').checked) checks.push('klient má export / zahraniční odběratele');
  if($('contractualLimits').checked) checks.push('klient má smluvní požadavky na limit pojištění');
  const lines = [];
  lines.push('PRACOVNÍ PODKLAD – POPtÁVKA PODNIKATELSKÉHO POJIŠTĚNÍ');
  lines.push('');
  lines.push(`Klient: ${$('clientName').value || 'doplnit'} | IČO: ${$('ico').value || 'doplnit'}`);
  lines.push(`Sídlo: ${$('clientAddress').value || 'doplnit'}`);
  lines.push(`Kontakt: ${$('contactPerson').value || 'doplnit'}; ${$('contactInfo').value || ''}`);
  lines.push(`Obrat: ${$('turnover').value || 'doplnit'} | Zaměstnanci: ${$('employees').value || 'doplnit'}`);
  lines.push(`Činnost: ${state.activity ? state.activity.name : 'doplnit'}${$('mainActivity').value ? ' – '+$('mainActivity').value : ''}`);
  if($('sideActivities').value) lines.push(`Vedlejší činnosti: ${$('sideActivities').value}`);
  if($('contracts').value) lines.push(`Zakázky / odběratelé: ${$('contracts').value}`);
  if(checks.length) lines.push(`Zjištěné znaky rizika: ${checks.join('; ')}.`);
  lines.push('');
  lines.push('Navržená rizika k poptávce:');
  if(!active.length) lines.push('- zatím nejsou vybrána žádná aktivní rizika');
  active.forEach(r=>lines.push(`- ${r.name}; limit: ${r.defaultLimit}; důvod: ${r.recommendation || r.clientNote || 'doplnit'}`));
  $('clientOutput').value = lines.join('\n');
}

function bind(){
  $('loadAresBtn').addEventListener('click', loadAres);
  $('clearClientBtn').addEventListener('click', clearClient);
  $('activitySelect').addEventListener('change', e=>selectActivity(e.target.value));
  $('addRiskBtn').addEventListener('click', addCustomRisk);
  $('saveRiskBtn').addEventListener('click', saveRisk);
  $('copyOutputBtn').addEventListener('click', async()=>{await navigator.clipboard.writeText($('clientOutput').value); $('copyOutputBtn').textContent='Zkopírováno'; setTimeout(()=>$('copyOutputBtn').textContent='Kopírovat text',1500);});
  document.querySelectorAll('input,textarea').forEach(el=>el.addEventListener('input', updateOutput));
  document.querySelectorAll('.question-grid input').forEach(el=>el.addEventListener('change',()=>{applyQuestionnaireHints();renderRisks();updateOutput();}));
  renderRisks(); updateOutput();
}

document.addEventListener('DOMContentLoaded', bind);
