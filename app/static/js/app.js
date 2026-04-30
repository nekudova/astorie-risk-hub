const select = document.getElementById("activitySelect");
const info = document.getElementById("activityInfo");
const grid = document.getElementById("risksGrid");

select.addEventListener("change", async () => {
  const id = select.value;
  grid.innerHTML = "";
  if (!id) {
    info.className = "infoBox empty";
    info.textContent = "Vyberte činnost klienta. Zobrazí se rizikový profil a doporučené otázky.";
    return;
  }

  const res = await fetch(`/api/risks/${id}`);
  const data = await res.json();

  info.className = "infoBox";
  info.innerHTML = `
    <div class="infoTitle">
      <strong>${data.activity.name}</strong>
      <span class="riskLevel">Rizikovost: ${data.activity.riskLevel}</span>
    </div>
    <p>${data.activity.description}</p>
    <p><strong>Orientační limit:</strong> ${data.activity.recommendedLimit}</p>
  `;

  data.risks.forEach(r => {
    const card = document.createElement("article");
    card.className = "riskCard";
    card.innerHTML = `
      <div class="riskTop">
        <h3>${r.name}</h3>
        <span class="priority ${r.priority}">${r.priority}</span>
      </div>
      <p>${r.explain}</p>
      <div class="question"><strong>Otázka pro klienta:</strong><br>${r.question}</div>
      <p><strong>Příklad:</strong> ${r.example}</p>
      <p><strong>Nápověda limitu:</strong> ${r.limit_hint}</p>
      <div class="actions">
        <button class="btnPrimary">Ponechat</button>
        <button class="btnGhost">Upravit limit</button>
        <button class="btnGhost">Odebrat</button>
      </div>
    `;
    grid.appendChild(card);
  });
});
