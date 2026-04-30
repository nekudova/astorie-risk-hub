
let activities=[], risks=[], currentRisk=null, activeTab='insurer';

const $ = id => document.getElementById(id);
function money(v){return v||'dle dohody s klientem a požadavků pojišťovny'}

async function init(){
  activities = await (await fetch('/api/activities')).json();
  const sel=$('activitySelect'); sel.innerHTML = activities.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  sel.addEventListener('change', loadActivity);
  $('aresBtn').addEventListener('click', loadAres);
  $('addRiskBtn').addEventListener('click', addCustomRisk);
  $('closeModal').addEventListener('click', ()=>$('modal').classList.add('hidden'));
  $('saveRisk').addEventListener('click', saveRisk);
  $('copyOutput').addEventListener('click', copyOutput);
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeTab=b.dataset.tab;renderOutput();}));
  ['clientName','address','contactPerson','turnover','employees'].forEach(id=>$(id).addEventListener('input', renderOutput));
  await loadActivity();
}
async function loadAres(){
  const ico=$('ico').value.trim(); $('aresStatus').textContent='Načítám ARES…';
  try{
    const r=await fetch('/api/ares/'+encodeURIComponent(ico)); const d=await r.json();
    if(!d.ok) throw new Error(d.message||'ARES nenalezen');
    $('clientName').value=d.nazev||''; $('address').value=d.adresa||''; $('aresStatus').textContent='Údaje z ARES byly načteny. Zkontrolujte je a případně doplňte.';
  }catch(e){$('aresStatus').textContent=e.message||'ARES se nepodařilo načíst.'}
  renderOutput();
}
async function loadActivity(){
  const id=$('activitySelect').value; const a=activities.find(x=>x.id===id);
  $('activityProfile').innerHTML = `<b>${a.name}</b><br>${a.desc}<br><br><b>Orientační limit:</b> ${a.limit}<br><b>Rizikovost:</b> ${a.risk_level}`;
  risks = await (await fetch('/api/risks/'+id)).json();
  risks = risks.map(r=>({...r, clientNote:''}));
  renderRisks(); renderOutput();
}
function renderRisks(){
  $('riskGrid').innerHTML = risks.map((r,i)=>`
    <div class="risk ${r.included?'':'excluded'}" onclick="openRisk(${i})">
      <span class="badge">${r.priority||'VLASTNÍ'}</span>
      <h3>${r.name}</h3>
      <p>${r.desc||''}</p>
      <b>Limit: ${money(r.limit)}</b><br>
      <small>${r.included?'Zahrnuto do poptávky':'Vyřazeno z poptávky'}</small>
    </div>`).join('');
}
function openRisk(i){
  currentRisk=i; const r=risks[i];
  $('modalTitle').textContent=r.name; $('mIncluded').checked=!!r.included; $('mLimit').value=r.limit||''; $('mQuestion').value=r.question||''; $('mDesc').value=r.desc||''; $('mReason').value=r.reason||''; $('mClientNote').value=r.clientNote||'';
  $('modal').classList.remove('hidden');
}
function saveRisk(){
  const r=risks[currentRisk];
  r.included=$('mIncluded').checked; r.limit=$('mLimit').value; r.question=$('mQuestion').value; r.desc=$('mDesc').value; r.reason=$('mReason').value; r.clientNote=$('mClientNote').value;
  $('modal').classList.add('hidden'); renderRisks(); renderOutput();
}
function addCustomRisk(){
  risks.push({id:'custom_'+Date.now(),name:'Vlastní riziko',priority:'VLASTNÍ',limit:'',included:true,desc:'Doplňte popis rizika.',question:'Doplňte otázku pro klienta.',reason:'Doplňte důvod doporučení.',clientNote:''});
  renderRisks(); openRisk(risks.length-1);
}
function client(){return {name:$('clientName').value||'[název klienta]', ico:$('ico').value||'[IČO]', address:$('address').value||'[sídlo]', contact:$('contactPerson').value||'[kontaktní osoba]', turnover:$('turnover').value||'[obrat]', employees:$('employees').value||'[počet zaměstnanců]'}}
function inc(){return risks.filter(r=>r.included)}
function renderOutput(){
  const c=client(); const a=activities.find(x=>x.id===$('activitySelect').value)||{};
  let html='';
  if(activeTab==='insurer') html = insurerDoc(c,a);
  if(activeTab==='client') html = clientDoc(c,a);
  if(activeTab==='zzj') html = zzjDoc(c,a);
  $('output').innerHTML=html;
}
function insurerDoc(c,a){
  return `<h3>Poptávka pojištění odpovědnosti podnikatele</h3>
  <h4>1. Identifikace klienta</h4>
  <table><tr><th>Název</th><td>${c.name}</td></tr><tr><th>IČO</th><td>${c.ico}</td></tr><tr><th>Sídlo</th><td>${c.address}</td></tr><tr><th>Kontaktní osoba</th><td>${c.contact}</td></tr><tr><th>Obrat / zaměstnanci</th><td>${c.turnover} / ${c.employees}</td></tr></table>
  <h4>2. Charakter činnosti</h4><p>${a.name||''}: ${a.desc||''}</p>
  <h4>3. Požadovaný rozsah krytí</h4>
  <table><tr><th>Riziko / rozšíření</th><th>Požadovaný limit</th><th>Upřesnění pro pojišťovnu</th></tr>${inc().map(r=>`<tr><td><b>${r.name}</b><br>${r.desc||''}</td><td>${money(r.limit)}</td><td>${r.clientNote||r.question||''}</td></tr>`).join('')}</table>
  <div class="doc-note"><b>Žádost:</b> Prosíme o nabídku včetně uvedení limitů, sublimitů, spoluúčastí, územního rozsahu, výluk a případných podmínek pojistitelnosti.</div>`;
}
function clientDoc(c,a){
  return `<h3>Klientské shrnutí návrhu poptávky</h3>
  <p>Na základě dosud zjištěných informací o činnosti klienta <b>${c.name}</b> byl připraven pracovní návrh rozsahu pojištění odpovědnosti.</p>
  <h4>Hlavní identifikovaná rizika</h4>
  <table><tr><th>Riziko</th><th>Proč jej řešíme</th><th>Orientační limit</th></tr>${inc().map(r=>`<tr><td><b>${r.name}</b></td><td>${r.reason||r.desc||''}${r.clientNote?'<br><i>Poznámka: '+r.clientNote+'</i>':''}</td><td>${money(r.limit)}</td></tr>`).join('')}</table>
  <div class="doc-note"><b>Upozornění:</b> Uvedené limity jsou pracovní návrh pro poptávku. Konečné doporučení bude stanoveno až po vyhodnocení nabídek pojišťoven, výluk, sublimitů a spoluúčastí.</div>`;
}
function zzjDoc(c,a){
  return `<h3>Podklad pro záznam z jednání</h3>
  <h4>Požadavky, cíle a potřeby klienta</h4>
  <p>Klient požaduje prověřit možnosti pojištění odpovědnosti podnikatele pro činnost: <b>${a.name||''}</b>. Cílem je nastavit pojistnou ochranu odpovídající charakteru činnosti, rozsahu zakázek a možným škodám vůči třetím osobám.</p>
  <h4>Projednaná rizika</h4>
  <ul>${inc().map(r=>`<li><b>${r.name}</b> – ${r.reason||r.desc||''} Navržený limit/sublimit: ${money(r.limit)}.</li>`).join('')}</ul>
  <h4>Důvod dalšího postupu</h4>
  <p>Na základě zjištěných údajů bude zpracována poptávka na vybrané pojišťovny. Po obdržení nabídek budou porovnány limity, sublimity, spoluúčasti, výluky a zvláštní ujednání. Teprve poté bude klientovi předloženo doporučení konkrétní varianty.</p>`;
}
function copyOutput(){navigator.clipboard.writeText($('output').innerText)}
init();
