
let activities=[], risks=[], insurers=[], brokers=[], currentRisk=null, activeTab='insurer';
let insuredPersons=[], clientInfoItems=[], infoTemplates=[];
const $ = id => document.getElementById(id);
const LS_INSURERS='astorie_risk_hub_insurers_v07';
const LS_BROKERS='astorie_risk_hub_brokers_v07';
const LS_INFO_TEMPLATES='astorie_risk_hub_info_templates_v07';
const LS_DRAFT='astorie_risk_hub_draft_v07';

const DEFAULT_INFO_TEMPLATES = [
  {id:'exclusions', name:'Požadavky na výluky / omezení', hint:'Např. klient nechce výluku na konkrétní činnost, subdodavatele, výrobek, území apod.'},
  {id:'special_clauses', name:'Požadovaná zvláštní ujednání', hint:'Např. věci převzaté, věci užívané, demontáž/montáž, spojení/smísení, regresy.'},
  {id:'contract_requirements', name:'Smluvní požadavky odběratele', hint:'Např. požadovaný limit, územní rozsah, pojmenování připojištěných osob, doložky.'},
  {id:'claims_history', name:'Škodní průběh / předchozí škody', hint:'Popis škod, četnost, výše, opatření po škodě.'},
  {id:'documents', name:'Podklady pro pojišťovnu', hint:'Smlouvy, certifikáty, BOZP, provozní řády, přehled zakázek, technické listy.'},
  {id:'other', name:'Jiné sdělení klienta', hint:'Vlastní poznámka poradce.'}
];

const esc = v => String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const val = id => $(id)?.value || '';
const checked = id => !!$(id)?.checked;
const money = v => v || 'dle dohody s klientem a požadavků pojišťovny';
const isCustomChoice = v => /jin(á|ý|e|í)/i.test(v);

function customChoice(selectId, customId){
  const v = val(selectId);
  return isCustomChoice(v) ? (val(customId) || v) : v;
}

async function init(){
  activities = await (await fetch('/api/activities')).json();
  const initialInsurers = await (await fetch('/api/insurers')).json();
  const initialBrokers = await (await fetch('/api/brokers')).json();

  insurers = JSON.parse(localStorage.getItem(LS_INSURERS)||'null') || initialInsurers.map(x=>({...x,selected:true}));
  brokers = JSON.parse(localStorage.getItem(LS_BROKERS)||'null') || initialBrokers;
  infoTemplates = JSON.parse(localStorage.getItem(LS_INFO_TEMPLATES)||'null') || DEFAULT_INFO_TEMPLATES;

  $('activitySelect').innerHTML = activities.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
  fillBroker(brokers[0]||{});
  wire();
  renderInsurers();
  renderQuestions();
  await loadActivity();
  addInsuredPerson();
  addClientInfo({type:'exclusions', title:'Požadavky na výluky / omezení'});
  loadDraft();
  renderClientInfo();
  updateCustomFields();
  updateAll(false);
}

function wire(){
  $('activitySelect').addEventListener('change', loadActivity);
  $('aresBtn').addEventListener('click', loadAres);
  ['insuranceTerm','territory','export'].forEach(id=>$(id).addEventListener('change',()=>{updateCustomFields();updateAll();}));

  $('addRiskBtn').addEventListener('click', addCustomRisk);
  $('closeRiskModal').addEventListener('click', ()=>$('riskModal').classList.add('hidden'));
  $('saveRisk').addEventListener('click', saveRisk);

  $('copyOutput').addEventListener('click', copyOutput);
  $('addInsuredBtn').addEventListener('click', addInsuredPerson);
  $('addClientInfoBtn').addEventListener('click', ()=>addClientInfo());

  $('adminInsurersBtn').addEventListener('click', openAdmin);
  $('closeAdminModal').addEventListener('click', ()=>$('adminModal').classList.add('hidden'));
  $('addInsurerRow').addEventListener('click', ()=>{insurers.push({id:'poj_'+Date.now(),name:'Nová pojišťovna',short:'',email:'',active:true,selected:true,note:''}); renderAdminInsurers();});
  $('addBrokerRow').addEventListener('click', ()=>{brokers.push({name:'Nový poradce',email:'',phone:'',role:'Poradce',company:'ASTORIE a.s.',reg:''}); renderAdminBrokers();});
  $('addInfoTemplateRow').addEventListener('click', ()=>{infoTemplates.push({id:'tpl_'+Date.now(),name:'Nový typ informace',hint:''}); renderAdminInfoTemplates();});
  $('saveAdminAll').addEventListener('click', saveAdminAll);

  document.querySelectorAll('.admin-tab').forEach(b=>b.addEventListener('click',()=>switchAdminTab(b.dataset.adminTab)));
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeTab=b.dataset.tab;renderOutput();}));
  document.querySelectorAll('input,textarea,select').forEach(el=>el.addEventListener('input', updateAll));
}

function updateCustomFields(){
  const pairs=[['insuranceTerm','insuranceTermCustom'],['territory','territoryCustom'],['export','exportCustom']];
  pairs.forEach(([sel,inp])=>$(inp).classList.toggle('hidden', !isCustomChoice(val(sel))));
}

function fillBroker(b){
  $('brokerName').value=b.name||'';
  $('brokerEmail').value=b.email||'';
  $('brokerPhone').value=b.phone||'';
  $('brokerRole').value=b.role||'';
  $('brokerCompany').value=b.company||'ASTORIE a.s.';
  $('brokerReg').value=b.reg||'';
}

async function loadAres(){
  const ico=val('ico').trim();
  $('aresStatus').textContent='Načítám ARES…';
  try{
    const r=await fetch('/api/ares/'+encodeURIComponent(ico));
    const d=await r.json();
    if(!d.ok) throw new Error(d.message||'ARES nenalezen');
    $('clientName').value=d.nazev||'';
    $('address').value=d.adresa||'';
    $('legalForm').value=d.pravni_forma||'';
    $('dataBox').value=d.datova_schranka||'';
    $('aresStatus').textContent='Údaje z ARES byly načteny. Zkontrolujte je a doplňte chybějící informace.';
  }catch(e){
    $('aresStatus').textContent=e.message||'ARES se nepodařilo načíst.';
  }
  updateAll();
}

async function loadActivity(){
  const id=val('activitySelect');
  const a=activities.find(x=>x.id===id)||{};
  $('activityProfile').innerHTML = `<b>${esc(a.name)}</b><br>${esc(a.desc)}<br><br><b>Orientační limit:</b> ${esc(a.limit)}<br><b>Rizikovost:</b> ${esc(a.risk_level)}`;
  risks = await (await fetch('/api/risks/'+id)).json();
  risks = risks.map(r=>({...r, clientNote:''}));
  renderRisks();
  updateAll(false);
}

function renderQuestions(){
 const qs=[
  ['qPremises','Má klient vlastní nebo pronajatou provozovnu?'],
  ['qAtCustomer','Pracuje u zákazníků / na cizím majetku?'],
  ['qEntrusted','Přebírá věci zákazníků k opravě, úpravě, servisu nebo skladování?'],
  ['qUsed','Užívá cizí věci, stroje, prostory nebo vybavení?'],
  ['qProduct','Vyrábí, dováží, distribuuje nebo prodává výrobky?'],
  ['qAfterHandover','Může se chyba projevit až po předání práce nebo výrobku?'],
  ['qSubcontractors','Používá subdodavatele?'],
  ['qExport','Má export nebo zakázky v zahraničí?'],
  ['qContracts','Mají odběratelé smluvní požadavky na limit nebo rozsah pojištění?'],
  ['qPollution','Pracuje s látkami, kapalinami, odpady nebo rizikem znečištění?'],
  ['qVehicles','Používá vozidla, přepravu nebo manipuluje s nákladem?'],
  ['qHighRisk','Pracuje ve výškách, na stavbách, v provozech nebo rizikovém prostředí?']
 ];
 $('questionGrid').innerHTML=qs.map(([id,t])=>`<label class="check-item"><input type="checkbox" id="${id}"><span>${esc(t)}</span></label>`).join('');
 qs.forEach(([id])=>$(id).addEventListener('change', applyQuestionLogic));
}

function applyQuestionLogic(){
 const map={
  qProduct:['product_liability','recall','connection_mixing','dismantling'],
  qAfterHandover:['completed_operations'],
  qEntrusted:['entrusted_property'],
  qUsed:['used_property'],
  qSubcontractors:['subcontractors'],
  qPollution:['pollution'],
  qExport:['product_liability'],
  qContracts:['financial_loss'],
  qAtCustomer:['entrusted_property','used_property','completed_operations'],
  qVehicles:['carrier_liability']
 };
 Object.entries(map).forEach(([qid,ids])=>{
   if(checked(qid)){
     ids.forEach(key=>{ const r=risks.find(x=>x.id===key || (x.name||'').toLowerCase().includes(key.replace('_',' '))); if(r) r.included=true; });
   }
 });
 renderRisks(); updateAll(false);
}

function renderRisks(){
  $('riskGrid').innerHTML = risks.map((r,i)=>`<div class="risk ${r.included?'':'excluded'}" onclick="openRisk(${i})"><span class="badge">${esc(r.priority||'VLASTNÍ')}</span><h3>${esc(r.name)}</h3><p>${esc(r.desc||'')}</p><b>Limit: ${esc(money(r.limit))}</b><br><small>${r.included?'Zahrnuto do poptávky':'Vyřazeno z poptávky'}</small></div>`).join('');
}
function openRisk(i){
  currentRisk=i; const r=risks[i];
  $('modalTitle').textContent=r.name;
  $('mIncluded').checked=!!r.included;
  $('mLimit').value=r.limit||'';
  $('mQuestion').value=r.question||'';
  $('mDesc').value=r.desc||'';
  $('mReason').value=r.reason||'';
  $('mClientNote').value=r.clientNote||'';
  $('riskModal').classList.remove('hidden');
}
function saveRisk(){
  const r=risks[currentRisk];
  Object.assign(r,{included:$('mIncluded').checked,limit:val('mLimit'),question:val('mQuestion'),desc:val('mDesc'),reason:val('mReason'),clientNote:val('mClientNote')});
  $('riskModal').classList.add('hidden'); renderRisks(); updateAll();
}
function addCustomRisk(){
  risks.push({id:'custom_'+Date.now(),name:'Vlastní riziko',priority:'VLASTNÍ',limit:'',included:true,desc:'Doplňte popis rizika.',question:'Doplňte otázku pro klienta.',reason:'Doplňte důvod doporučení.',clientNote:''});
  renderRisks(); openRisk(risks.length-1);
}

function addInsuredPerson(data={}){
  insuredPersons.push({name:data.name||'',ico:data.ico||'',address:data.address||'',activity:data.activity||''});
  renderInsured();
}
function renderInsured(){
  $('insuredList').innerHTML=insuredPersons.map((p,i)=>`<div class="entity"><div class="entity-head"><b>Další pojištěná osoba ${i+1}</b><button class="small-danger" onclick="removeInsured(${i})">Odebrat</button></div><div class="grid"><label>Název / jméno<input data-insured="${i}" data-field="name" value="${esc(p.name)}"></label><label>IČ/RČ<input data-insured="${i}" data-field="ico" value="${esc(p.ico)}"></label><label>Sídlo / adresa<input data-insured="${i}" data-field="address" value="${esc(p.address)}"></label><label>Činnost / vztah ke klientovi<input data-insured="${i}" data-field="activity" value="${esc(p.activity)}"></label></div></div>`).join('');
  document.querySelectorAll('[data-insured]').forEach(el=>el.addEventListener('input',e=>{insuredPersons[+e.target.dataset.insured][e.target.dataset.field]=e.target.value; updateAll();}));
}
function removeInsured(i){ insuredPersons.splice(i,1); renderInsured(); updateAll(); }

function addClientInfo(data={}){
  clientInfoItems.push({
    type:data.type||'other',
    title:data.title||'',
    text:data.text||'',
    insurer:data.insurer!==false,
    client:data.client!==false,
    zzj:data.zzj!==false
  });
  renderClientInfo();
  updateAll();
}
function renderClientInfo(){
  if(!$('clientInfoList')) return;
  $('clientInfoList').innerHTML=clientInfoItems.map((it,i)=>`
    <div class="entity info-entity">
      <div class="entity-head"><b>Doplňující informace ${i+1}</b><button class="small-danger" onclick="removeClientInfo(${i})">Odebrat</button></div>
      <div class="grid two">
        <label>Typ informace
          <select data-info="${i}" data-field="type">${infoTemplates.map(t=>`<option value="${esc(t.id)}" ${it.type===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select>
        </label>
        <label>Vlastní nadpis / upřesnění<input data-info="${i}" data-field="title" value="${esc(it.title)}" placeholder="např. požadavek na nevyloučení práce ve výškách"></label>
        <label class="span2">Text pro poptávku / klienta / ZZJ<textarea data-info="${i}" data-field="text" placeholder="${esc((infoTemplates.find(t=>t.id===it.type)||{}).hint||'Doplňte vlastní text...')}">${esc(it.text)}</textarea></label>
      </div>
      <div class="chip-row">
        <label><input type="checkbox" data-info="${i}" data-field="insurer" ${it.insurer?'checked':''}> do poptávky pojišťovnám</label>
        <label><input type="checkbox" data-info="${i}" data-field="client" ${it.client?'checked':''}> do klientského shrnutí</label>
        <label><input type="checkbox" data-info="${i}" data-field="zzj" ${it.zzj?'checked':''}> do ZZJ</label>
      </div>
    </div>`).join('');
  document.querySelectorAll('[data-info]').forEach(el=>el.addEventListener(el.type==='checkbox'?'change':'input',e=>{
    const i=+e.target.dataset.info, f=e.target.dataset.field;
    clientInfoItems[i][f]=e.target.type==='checkbox'?e.target.checked:e.target.value;
    if(f==='type') renderClientInfo();
    updateAll();
  }));
}
function removeClientInfo(i){ clientInfoItems.splice(i,1); renderClientInfo(); updateAll(); }

function renderInsurers(){
  $('insurerGrid').innerHTML=insurers.filter(x=>x.active!==false).map((x,i)=>`<label class="insurer"><input type="checkbox" data-insurer="${i}" ${x.selected?'checked':''}><span><b>${esc(x.short||x.name)}</b><br>${esc(x.name)}<br><small>${esc(x.note||'')}</small></span></label>`).join('');
  document.querySelectorAll('[data-insurer]').forEach(el=>el.addEventListener('change',e=>{insurers[+e.target.dataset.insurer].selected=e.target.checked; saveInsurersLocal(); updateAll();}));
}
function selectedInsurers(){return insurers.filter(x=>x.selected&&x.active!==false)}
function inc(){return risks.filter(r=>r.included)}

function openAdmin(){
  renderAdminInsurers(); renderAdminBrokers(); renderAdminInfoTemplates();
  switchAdminTab('insurers');
  $('adminModal').classList.remove('hidden');
}
function switchAdminTab(tab){
  document.querySelectorAll('.admin-tab').forEach(b=>b.classList.toggle('active', b.dataset.adminTab===tab));
  $('adminPanelInsurers').classList.toggle('hidden', tab!=='insurers');
  $('adminPanelBrokers').classList.toggle('hidden', tab!=='brokers');
  $('adminPanelInfo').classList.toggle('hidden', tab!=='info');
}
function renderAdminInsurers(){
 $('adminInsurerRows').innerHTML=insurers.map((x,i)=>`<div class="admin-row insurers"><label>Název<input data-adm-ins="${i}" data-field="name" value="${esc(x.name)}"></label><label>Zkratka<input data-adm-ins="${i}" data-field="short" value="${esc(x.short)}"></label><label>E-mail<input data-adm-ins="${i}" data-field="email" value="${esc(x.email||'')}"></label><label>Poznámka<input data-adm-ins="${i}" data-field="note" value="${esc(x.note||'')}"></label><label>Aktivní<br><input type="checkbox" data-adm-ins="${i}" data-field="active" ${x.active!==false?'checked':''}></label></div>`).join('');
 document.querySelectorAll('[data-adm-ins]').forEach(el=>el.addEventListener(el.type==='checkbox'?'change':'input',e=>{const i=+e.target.dataset.admIns,f=e.target.dataset.field;insurers[i][f]=f==='active'?e.target.checked:e.target.value;}));
}
function renderAdminBrokers(){
 $('adminBrokerRows').innerHTML=brokers.map((x,i)=>`<div class="admin-row brokers"><label>Jméno<input data-adm-bro="${i}" data-field="name" value="${esc(x.name)}"></label><label>E-mail<input data-adm-bro="${i}" data-field="email" value="${esc(x.email||'')}"></label><label>Telefon<input data-adm-bro="${i}" data-field="phone" value="${esc(x.phone||'')}"></label><label>Role<input data-adm-bro="${i}" data-field="role" value="${esc(x.role||'Poradce')}"></label><label>Společnost<input data-adm-bro="${i}" data-field="company" value="${esc(x.company||'ASTORIE a.s.')}"></label><label>Status<input data-adm-bro="${i}" data-field="reg" value="${esc(x.reg||'')}"></label></div>`).join('');
 document.querySelectorAll('[data-adm-bro]').forEach(el=>el.addEventListener('input',e=>{const i=+e.target.dataset.admBro,f=e.target.dataset.field;brokers[i][f]=e.target.value;}));
}
function renderAdminInfoTemplates(){
 $('adminInfoRows').innerHTML=infoTemplates.map((x,i)=>`<div class="admin-row info"><label>Název typu<input data-adm-info="${i}" data-field="name" value="${esc(x.name)}"></label><label>Nápověda<input data-adm-info="${i}" data-field="hint" value="${esc(x.hint||'')}"></label></div>`).join('');
 document.querySelectorAll('[data-adm-info]').forEach(el=>el.addEventListener('input',e=>{const i=+e.target.dataset.admInfo,f=e.target.dataset.field;infoTemplates[i][f]=e.target.value;}));
}
function saveAdminAll(){
  localStorage.setItem(LS_INSURERS,JSON.stringify(insurers));
  localStorage.setItem(LS_BROKERS,JSON.stringify(brokers));
  localStorage.setItem(LS_INFO_TEMPLATES,JSON.stringify(infoTemplates));
  saveInsurersLocal();
  renderInsurers(); renderClientInfo(); fillBroker(brokers[0]||{});
  $('adminModal').classList.add('hidden'); updateAll();
}
function saveInsurersLocal(){localStorage.setItem(LS_INSURERS,JSON.stringify(insurers));}

function broker(){
  return {name:val('brokerName')||'[poradce]',email:val('brokerEmail'),phone:val('brokerPhone'),role:val('brokerRole'),company:val('brokerCompany'),reg:val('brokerReg')};
}
function client(){
  return {
    name:val('clientName')||'[název klienta]',ico:val('ico')||'[IČO]',legal:val('legalForm'),address:val('address')||'[sídlo]',box:val('dataBox'),
    contact:val('contactPerson')||'[kontaktní osoba]',email:val('contactEmail'),phone:val('contactPhone'),web:val('clientWeb'),start:val('insuranceStart'),
    term:customChoice('insuranceTerm','insuranceTermCustom'),turnover:val('turnover')||'[obrat]',employees:val('employees')||'[počet zaměstnanců]',
    territory:customChoice('territory','territoryCustom'),export:customChoice('export','exportCustom'),
    activityText:val('activityText'),secondary:val('secondaryActivities'),riskNote:val('riskProfileNote')
  };
}

function updateProgress(){
  const ids=['ico','clientName','address','contactPerson','turnover','employees','activityText'];
  let done=ids.filter(id=>val(id).trim()).length;
  if(selectedInsurers().length) done++;
  if(inc().length) done++;
  if(clientInfoItems.some(x=>x.text.trim())) done++;
  const pct=Math.round(done/(ids.length+3)*100);
  $('progressBar').style.width=pct+'%'; $('progressText').textContent=pct+' %';
}

function renderOutput(){
  const c=client(), b=broker(), a=activities.find(x=>x.id===val('activitySelect'))||{};
  let html='';
  if(activeTab==='insurer') html=insurerDoc(c,b,a);
  if(activeTab==='client') html=clientDoc(c,b,a);
  if(activeTab==='zzj') html=zzjDoc(c,b,a);
  $('output').innerHTML=html;
}

function additionalInfoTable(target){
  const rows=clientInfoItems.filter(x=>x.text.trim() && x[target]!==false);
  if(!rows.length) return '<p>Bez dalších požadavků nebo poznámek.</p>';
  return `<table><tr><th>Oblast</th><th>Požadavek / poznámka</th></tr>${rows.map(x=>{
    const tpl=infoTemplates.find(t=>t.id===x.type)||{};
    return `<tr><td><b>${esc(x.title||tpl.name||'Doplňující informace')}</b></td><td>${esc(x.text)}</td></tr>`;
  }).join('')}</table>`;
}
function insuredTable(){
  const rows=insuredPersons.filter(p=>p.name||p.ico||p.address||p.activity);
  if(!rows.length)return '<p>Bez dalších pojištěných osob.</p>';
  return `<table><tr><th>Název</th><th>IČ/RČ</th><th>Sídlo/adresa</th><th>Činnost/vztah</th></tr>${rows.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.ico)}</td><td>${esc(p.address)}</td><td>${esc(p.activity)}</td></tr>`).join('')}</table>`;
}

function insurerDoc(c,b,a){
  return `<h3>Poptávka pojištění odpovědnosti podnikatele</h3>
  <h4>1. Makléř / kontaktní osoba</h4><table><tr><th>Makléř</th><td>${esc(b.name)}, ${esc(b.company)}</td></tr><tr><th>Kontakt</th><td>${esc(b.email)} ${esc(b.phone)}</td></tr></table>
  <h4>2. Identifikace klienta</h4><table><tr><th>Název</th><td>${esc(c.name)}</td></tr><tr><th>IČO</th><td>${esc(c.ico)}</td></tr><tr><th>Sídlo</th><td>${esc(c.address)}</td></tr><tr><th>Kontaktní osoba</th><td>${esc(c.contact)} ${esc(c.email)} ${esc(c.phone)}</td></tr><tr><th>Obrat / zaměstnanci</th><td>${esc(c.turnover)} / ${esc(c.employees)}</td></tr><tr><th>Počátek / doba</th><td>${esc(c.start||'doplnit')} / ${esc(c.term)}</td></tr><tr><th>Územní rozsah / export</th><td>${esc(c.territory)} / ${esc(c.export)}</td></tr></table>
  <h4>3. Charakter činnosti</h4><p><b>${esc(a.name||'')}</b> – ${esc(c.activityText||a.desc||'')}</p>${c.secondary?`<p><b>Vedlejší činnosti:</b> ${esc(c.secondary)}</p>`:''}${c.riskNote?`<p><b>Poznámka poradce:</b> ${esc(c.riskNote)}</p>`:''}
  <h4>4. Další pojištěné osoby</h4>${insuredTable()}
  <h4>5. Doplňující požadavky a informace klienta</h4>${additionalInfoTable('insurer')}
  <h4>6. Oslovené pojišťovny</h4><p>${selectedInsurers().map(x=>esc(x.short||x.name)).join(', ')||'nevybráno'}</p>
  <h4>7. Požadovaný rozsah krytí</h4><table><tr><th>Riziko / rozšíření</th><th>Požadovaný limit</th><th>Upřesnění</th></tr>${inc().map(r=>`<tr><td><b>${esc(r.name)}</b><br>${esc(r.desc||'')}</td><td>${esc(money(r.limit))}</td><td>${esc(r.clientNote||r.question||'')}</td></tr>`).join('')}</table>
  <div class="doc-note"><b>Žádost:</b> Prosíme o nabídku včetně limitů, sublimitů, spoluúčastí, výluk, územního rozsahu, časové působnosti a případných podmínek pojistitelnosti.</div>`;
}
function clientDoc(c,b,a){
  return `<h3>Klientské shrnutí návrhu poptávky</h3><p>Pro klienta <b>${esc(c.name)}</b> byl připraven pracovní návrh rozsahu pojištění odpovědnosti podnikatele. Návrh vychází ze zadané činnosti, provozních údajů a předběžně identifikovaných rizik.</p>
  <h4>Základní profil</h4><table><tr><th>Činnost</th><td>${esc(c.activityText||a.name||'')}</td></tr><tr><th>Obrat / zaměstnanci</th><td>${esc(c.turnover)} / ${esc(c.employees)}</td></tr><tr><th>Územní rozsah</th><td>${esc(c.territory)}; export: ${esc(c.export)}</td></tr><tr><th>Pojistná doba</th><td>${esc(c.term)}</td></tr></table>
  <h4>Doplňující požadavky klienta</h4>${additionalInfoTable('client')}
  <h4>Hlavní identifikovaná rizika</h4><table><tr><th>Riziko</th><th>Proč jej řešíme</th><th>Orientační limit</th></tr>${inc().map(r=>`<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.reason||r.desc||'')}${r.clientNote?'<br><i>Poznámka: '+esc(r.clientNote)+'</i>':''}</td><td>${esc(money(r.limit))}</td></tr>`).join('')}</table>
  <div class="doc-note"><b>Upozornění:</b> Uvedené limity jsou pracovní návrh pro poptávku. Konečné doporučení bude stanoveno až po porovnání nabídek, výluk, sublimitů a spoluúčastí.</div>`;
}
function zzjDoc(c,b,a){
  return `<h3>Podklad pro záznam z jednání</h3><h4>Účastníci a podklad jednání</h4><table><tr><th>Klient</th><td>${esc(c.name)}, IČO ${esc(c.ico)}</td></tr><tr><th>Poradce/makléř</th><td>${esc(b.name)}, ${esc(b.company)}</td></tr></table>
  <h4>Požadavky, cíle a potřeby klienta</h4><p>Klient požaduje prověřit možnosti pojištění odpovědnosti podnikatele pro činnost: <b>${esc(c.activityText||a.name||'')}</b>. Cílem je nastavit pojistnou ochranu odpovídající charakteru podnikání, rozsahu zakázek, územnímu rozsahu a možným škodám vůči třetím osobám.</p>
  <h4>Doplňující požadavky a sdělení klienta</h4>${additionalInfoTable('zzj')}
  <h4>Projednaná rizika</h4><ul>${inc().map(r=>`<li><b>${esc(r.name)}</b> – ${esc(r.reason||r.desc||'')} Navržený limit/sublimit: ${esc(money(r.limit))}.</li>`).join('')}</ul>
  <h4>Další postup</h4><p>Poptávka bude odeslána na tyto pojišťovny: ${selectedInsurers().map(x=>esc(x.short||x.name)).join(', ')||'nevybráno'}. Po obdržení nabídek budou porovnány limity, sublimity, spoluúčasti, výluky a zvláštní ujednání. Teprve poté bude klientovi předloženo doporučení konkrétní varianty.</p>`;
}

function updateAll(save=true){updateCustomFields(); updateProgress(); renderOutput(); if(save) saveDraft();}
function copyOutput(){navigator.clipboard.writeText($('output').innerText)}
function saveDraft(){
  const data={};
  document.querySelectorAll('input,textarea,select').forEach(el=>{if(el.id)data[el.id]=el.type==='checkbox'?el.checked:el.value});
  localStorage.setItem(LS_DRAFT,JSON.stringify({data,insuredPersons,clientInfoItems,insurers,brokers,infoTemplates,risks,activity:val('activitySelect')}));
}
function loadDraft(){
  try{
    const d=JSON.parse(localStorage.getItem(LS_DRAFT)||'null'); if(!d)return;
    Object.entries(d.data||{}).forEach(([id,v])=>{if($(id)){ if($(id).type==='checkbox')$(id).checked=v; else $(id).value=v; }});
    if(d.insuredPersons){insuredPersons=d.insuredPersons;renderInsured();}
    if(d.clientInfoItems){clientInfoItems=d.clientInfoItems;renderClientInfo();}
    if(d.insurers){insurers=d.insurers;renderInsurers();}
    if(d.brokers){brokers=d.brokers;}
    if(d.infoTemplates){infoTemplates=d.infoTemplates;renderClientInfo();}
  }catch(e){}
}
init();
