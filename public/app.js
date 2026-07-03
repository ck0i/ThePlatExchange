const elements = {
  sseBadge: document.getElementById("sseBadge"),
  scanBadge: document.getElementById("scanBadge"),
  statOpps: document.getElementById("statOpps"),
  statWeapons: document.getElementById("statWeapons"),
  statAuctions: document.getElementById("statAuctions"),
  statBest: document.getElementById("statBest"),
  statRefresh: document.getElementById("statRefresh"),
  summary: document.getElementById("summary"),
  opps: document.getElementById("opps"),
  weapons: document.getElementById("weapons"),
  chart: document.getElementById("profitChart"),
  form: document.getElementById("filters"),
  refresh: document.getElementById("refresh"),
  watchlist: document.getElementById("watchlist"),
  minProfit: document.getElementById("minProfit"),
  minRoi: document.getElementById("minRoi"),
  minGroupSize: document.getElementById("minGroupSize"),
  minBuyPrice: document.getElementById("minBuyPrice"),
  maxBuyPrice: document.getElementById("maxBuyPrice"),
  maxSellPrice: document.getElementById("maxSellPrice"),
  maxResults: document.getElementById("maxResults"),
};

let latestState = null;
let controlsHydrated = false;
let sortState = { key: "expectedProfit", direction: "desc" };

async function loadState() {
  const response = await fetch("/api/state");
  if (!response.ok) throw new Error(`state ${response.status}`);
  render(await response.json());
}

async function postJson(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  render(await response.json());
}

function render(state) {
  latestState = state;
  hydrateControls(state);
  const running = state.status.running;
  elements.scanBadge.textContent = running ? `${state.status.reason}: ${state.status.scannedWeapons}/${state.status.totalWeapons}` : state.status.lastMessage;
  elements.scanBadge.className = running ? "badge warn" : "badge good";
  elements.statOpps.textContent = String(state.totals.opportunities);
  elements.statWeapons.textContent = `${state.status.scannedWeapons}/${state.status.totalWeapons || state.reference.weapons}`;
  elements.statAuctions.textContent = String(state.totals.auctions);
  const sorted = sortedOpportunities(state.opportunities);
  const best = state.opportunities.reduce((winner, opportunity) => !winner || opportunity.expectedProfit > winner.expectedProfit ? opportunity : winner, null);
  elements.statBest.textContent = best ? `${best.expectedProfit}p` : "0p";
  elements.statRefresh.textContent = shortTime(state.status.finishedAt || state.generatedAt);
  elements.summary.textContent = state.status.lastError ? state.status.lastError : state.status.lastMessage;
  renderTable(sorted);
  renderWeapons(state.weaponSummaries);
  drawChart(sorted);
}

function hydrateControls(state) {
  if (controlsHydrated) return;
  controlsHydrated = true;
  elements.watchlist.value = state.config.watchlist.join("\n");
  elements.minProfit.value = state.config.minProfit;
  elements.minRoi.value = state.config.minRoi;
  elements.minGroupSize.value = state.config.minGroupSize;
  elements.minBuyPrice.value = state.config.minBuyPrice == null ? "" : state.config.minBuyPrice;
  elements.maxBuyPrice.value = state.config.maxBuyPrice == null ? "" : state.config.maxBuyPrice;
  elements.maxSellPrice.value = state.config.maxSellPrice == null ? "" : state.config.maxSellPrice;
  elements.maxResults.value = state.config.maxResults;
  for (const checkbox of document.querySelectorAll(".status")) {
    checkbox.checked = state.config.statuses.includes(checkbox.value);
  }
}

function renderTable(opportunities) {
  elements.opps.textContent = "";
  for (const [index, opportunity] of opportunities.entries()) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(opportunity.weaponName)}</strong><div class="small">${escapeHtml(opportunity.rivenName)}</div></td>
      <td class="price">${opportunity.buyPrice}p</td>
      <td>${opportunity.targetSellPrice}p<div class="small">median ${opportunity.conservativeSellPrice}p</div></td>
      <td class="profit">+${opportunity.expectedProfit}p</td>
      <td class="roi">${Math.round(opportunity.roi * 100)}%</td>
      <td>${escapeHtml(opportunity.seller.ingameName)}<div class="small">${opportunity.status} · rep ${opportunity.seller.reputation}</div></td>
      <td>${opportunity.comparableListings}<div class="small">${opportunity.groupType}</div></td>
      <td>${renderAttributes(opportunity)}</td>
      <td>${opportunity.score}/100<div class="small">conf ${Math.round(opportunity.confidence * 100)}%</div></td>`;
    row.addEventListener("click", () => window.open(opportunity.url, "_blank", "noopener"));
    elements.opps.appendChild(row);
  }
  if (opportunities.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="10" class="small">No opportunities yet. Wait for more weapon books, lower thresholds, or add offline sellers.</td>`;
    elements.opps.appendChild(row);
  }
}

function renderAttributes(opportunity) {
  const positives = opportunity.positives.map((value) => `<span class="flag good">+${escapeHtml(value)}</span>`).join("");
  const negatives = opportunity.negatives.map((value) => `<span class="flag bad">-${escapeHtml(value)}</span>`).join("");
  return `<div class="flags">${positives}${negatives}</div><div class="small">${opportunity.reasons.map(escapeHtml).join(" · ")}</div>`;
}

function renderWeapons(summaries) {
  elements.weapons.textContent = "";
  for (const summary of summaries.slice(0, 24)) {
    const stats = summary.priceStats;
    const card = document.createElement("article");
    card.className = "panel weapon-card";
    card.innerHTML = `<h3>${escapeHtml(summary.name)}</h3>
      <dl>
        <dt>Listings</dt><dd>${summary.directListings}</dd>
        <dt>Online</dt><dd>${summary.onlineListings}</dd>
        <dt>Median</dt><dd>${stats ? `${stats.median}p` : "—"}</dd>
        <dt>P75</dt><dd>${stats ? `${stats.p75}p` : "—"}</dd>
        <dt>Disposition</dt><dd>${summary.disposition.toFixed(2)}</dd>
      </dl>`;
    elements.weapons.appendChild(card);
  }
}

function drawChart(opportunities) {
  const canvas = elements.chart;
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#0c141d";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#26384b";
  context.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const y = 30 + i * 55;
    context.beginPath();
    context.moveTo(40, y);
    context.lineTo(width - 20, y);
    context.stroke();
  }
  const data = opportunities.slice(0, 20);
  if (data.length === 0) {
    context.fillStyle = "#8ca3ba";
    context.font = "18px sans-serif";
    context.fillText("Waiting for opportunities", 48, 148);
    return;
  }
  const maxProfit = Math.max(...data.map((entry) => entry.expectedProfit), 1);
  const barWidth = (width - 80) / data.length;
  data.forEach((entry, index) => {
    const x = 50 + index * barWidth;
    const barHeight = Math.max(4, (entry.expectedProfit / maxProfit) * (height - 70));
    const y = height - 34 - barHeight;
    const gradient = context.createLinearGradient(0, y, 0, height - 34);
    gradient.addColorStop(0, "#71f6c5");
    gradient.addColorStop(1, "#7db4ff");
    context.fillStyle = gradient;
    context.fillRect(x, y, Math.max(5, barWidth - 6), barHeight);
    context.fillStyle = "#8ca3ba";
    context.save();
    context.translate(x + 4, height - 14);
    context.rotate(-0.55);
    context.fillText(entry.weaponName.slice(0, 16), 0, 0);
    context.restore();
  });
}

function collectConfig() {
  const statuses = [...document.querySelectorAll(".status")].filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
  return {
    watchlistText: elements.watchlist.value,
    minProfit: Number(elements.minProfit.value),
    minRoi: Number(elements.minRoi.value),
    minGroupSize: Number(elements.minGroupSize.value),
    minBuyPrice: elements.minBuyPrice.value.trim() === "" ? null : Number(elements.minBuyPrice.value),
    maxBuyPrice: elements.maxBuyPrice.value.trim() === "" ? null : Number(elements.maxBuyPrice.value),
    maxSellPrice: elements.maxSellPrice.value.trim() === "" ? null : Number(elements.maxSellPrice.value),
    maxResults: Number(elements.maxResults.value),
    statuses,
  };
}

function shortTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function sortedOpportunities(opportunities) {
  const sorted = [...opportunities];
  sorted.sort((left, right) => {
    const leftValue = sortValue(left, sortState.key);
    const rightValue = sortValue(right, sortState.key);
    let comparison;
    if (typeof leftValue === "number" && typeof rightValue === "number") comparison = leftValue - rightValue;
    else comparison = String(leftValue).localeCompare(String(rightValue));
    return sortState.direction === "asc" ? comparison : -comparison;
  });
  updateSortHeaders();
  return sorted;
}

function sortValue(opportunity, key) {
  if (key === "rank") return opportunity.expectedProfit;
  if (key === "seller") return opportunity.seller.ingameName;
  return opportunity[key] ?? "";
}

function updateSortHeaders() {
  for (const header of document.querySelectorAll("th[data-sort]")) {
    header.classList.remove("sorted-asc", "sorted-desc");
    if (header.dataset.sort === sortState.key) header.classList.add(sortState.direction === "asc" ? "sorted-asc" : "sorted-desc");
  }
}

for (const header of document.querySelectorAll("th[data-sort]")) {
  header.addEventListener("click", () => {
    const key = header.dataset.sort;
    if (!key) return;
    if (sortState.key === key) sortState = { key, direction: sortState.direction === "asc" ? "desc" : "asc" };
    else sortState = { key, direction: key === "weaponName" || key === "seller" ? "asc" : "desc" };
    if (latestState) render(latestState);
  });
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.form.querySelector("button").disabled = true;
  try {
    await postJson("/api/scan", collectConfig());
  } finally {
    elements.form.querySelector("button").disabled = false;
  }
});

elements.refresh.addEventListener("click", async () => {
  elements.refresh.disabled = true;
  try {
    await postJson("/api/refresh", {});
  } finally {
    elements.refresh.disabled = false;
  }
});

const events = new EventSource("/events");
events.addEventListener("open", () => {
  elements.sseBadge.textContent = "SSE live";
  elements.sseBadge.className = "badge good";
});
events.addEventListener("state", (event) => render(JSON.parse(event.data)));
events.addEventListener("error", () => {
  elements.sseBadge.textContent = "SSE reconnecting";
  elements.sseBadge.className = "badge warn";
});

loadState().catch((error) => {
  elements.summary.textContent = error.message;
});
setInterval(() => {
  loadState().catch(() => undefined);
}, 60_000);
window.addEventListener("resize", () => {
  if (latestState) drawChart(latestState.opportunities);
});
