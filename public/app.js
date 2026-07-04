const elements = {
  sseBadge: document.getElementById("sseBadge"),
  scanBadge: document.getElementById("scanBadge"),
  statOpps: document.getElementById("statOpps"),
  statWeapons: document.getElementById("statWeapons"),
  statWeaponsSub: document.getElementById("statWeaponsSub"),
  statAuctions: document.getElementById("statAuctions"),
  statBest: document.getElementById("statBest"),
  statRefresh: document.getElementById("statRefresh"),
  summary: document.getElementById("summary"),
  opps: document.getElementById("opps"),
  weapons: document.getElementById("weapons"),
  chart: document.getElementById("profitChart"),
  chartTip: document.getElementById("chartTip"),
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
  instantList: document.getElementById("instantList"),
  instantSummary: document.getElementById("instantSummary"),
  signatureForm: document.getElementById("signatureForm"),
  sigWeapon: document.getElementById("sigWeapon"),
  sigPositives: document.getElementById("sigPositives"),
  sigNegatives: document.getElementById("sigNegatives"),
  sigResult: document.getElementById("sigResult"),
  weaponSearch: document.getElementById("weaponSearch"),
  weaponResults: document.getElementById("weaponResults"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  modeHint: document.getElementById("modeHint"),
  mcpButton: document.getElementById("mcpConnectButton"),
  mcpModal: document.getElementById("mcpModal"),
  mcpEndpoint: document.getElementById("mcpEndpoint"),
  mcpConfigDesktop: document.getElementById("mcpConfigDesktop"),
  mcpConfigCli: document.getElementById("mcpConfigCli"),
  mcpToolList: document.getElementById("mcpToolList"),
  mcpTestButton: document.getElementById("mcpTestButton"),
  mcpTestResult: document.getElementById("mcpTestResult"),
};

let latestState = null;
let latestEnrichedOpps = [];
let latestInstantWins = [];
let scatterHits = [];
let controlsHydrated = false;
let sortState = { key: "expectedProfit", direction: "desc" };
let weaponSearchTimer = null;

async function loadState() {
  const response = await fetch("/api/state");
  if (!response.ok) throw new Error(`state ${response.status}`);
  render(await response.json());
  await refreshDerived();
}

async function refreshDerived() {
  try {
    const [opps, wins] = await Promise.all([
      fetch("/api/opportunities").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/instant-wins").then((r) => (r.ok ? r.json() : [])),
    ]);
    latestEnrichedOpps = Array.isArray(opps) ? opps : [];
    latestInstantWins = Array.isArray(wins) ? wins : [];
    renderTable(sortedOpportunities(latestEnrichedOpps));
    drawChart(latestEnrichedOpps);
    renderInstantWins(latestInstantWins);
  } catch {
    // network hiccup — try again on next tick
  }
}

async function postJson(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  render(await response.json());
  await refreshDerived();
}

function render(state) {
  latestState = state;
  hydrateControls(state);
  const running = state.status.running;
  const tierLabel = state.status.reason && state.status.reason.includes("-") ? state.status.reason.split("-").pop() : null;
  elements.scanBadge.textContent = running ? `${state.status.reason}: ${state.status.scannedWeapons}/${state.status.totalWeapons}` : state.status.lastMessage;
  elements.scanBadge.className = running ? "badge warn" : "badge good";
  elements.statOpps.textContent = String(state.totals.opportunities);
  const totalRefWeapons = state.reference?.weapons ?? 0;
  const covered = state.totals?.weaponsWithAuctions ?? 0;
  elements.statWeapons.textContent = `${covered}/${totalRefWeapons}`;
  if (elements.statWeaponsSub) {
    if (running) elements.statWeaponsSub.textContent = `scanning ${state.status.scannedWeapons}/${state.status.totalWeapons}${tierLabel ? ` (${tierLabel})` : ""}`;
    else elements.statWeaponsSub.textContent = tierLabel ? `last: ${tierLabel} tier` : "";
  }
  elements.statAuctions.textContent = String(state.totals.auctions);
  const best = state.opportunities.reduce((winner, opportunity) => !winner || opportunity.expectedProfit > winner.expectedProfit ? opportunity : winner, null);
  elements.statBest.textContent = best ? `${best.expectedProfit}p` : "0p";
  elements.statRefresh.textContent = shortTime(state.status.finishedAt || state.generatedAt);
  elements.summary.textContent = state.status.lastError ? state.status.lastError : state.status.lastMessage;
  updateModeUi(state.scanMode ?? "tiered");
  renderWeapons(state.weaponSummaries);
  if (latestEnrichedOpps.length === 0) {
    renderTable(sortedOpportunities(state.opportunities));
    drawChart(state.opportunities);
  }
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
  loadWeaponBrowser("");
}

function renderTable(opportunities) {
  elements.opps.textContent = "";
  for (const [index, opportunity] of opportunities.entries()) {
    const row = document.createElement("tr");
    const tier = opportunity.quality?.tier ?? "D";
    row.className = `tier-${tier}`;
    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="weapon-cell">${weaponThumb(opportunity.imageName, opportunity.weaponName, "sm")}<div><strong>${escapeHtml(opportunity.weaponName)}</strong><div class="small">${escapeHtml(opportunity.rivenName)}</div></div></td>
      <td class="price">${opportunity.buyPrice}p</td>
      <td>${opportunity.targetSellPrice}p<div class="small">median ${opportunity.conservativeSellPrice}p</div></td>
      <td class="profit">+${opportunity.expectedProfit}p</td>
      <td class="roi">${Math.round(opportunity.roi * 100)}%</td>
      <td>${escapeHtml(opportunity.seller.ingameName)}<div class="small">${opportunity.status} · rep ${opportunity.seller.reputation}</div></td>
      <td>${opportunity.comparableListings}<div class="small">${opportunity.groupType}</div></td>
      <td>${renderSignals(opportunity)}</td>
      <td><span class="tier-badge tier-${tier}">${tier}</span> ${opportunity.score}/100<div class="small">conf ${Math.round(opportunity.confidence * 100)}%</div></td>`;
    row.addEventListener("click", () => window.open(opportunity.url, "_blank", "noopener"));
    elements.opps.appendChild(row);
  }
  if (opportunities.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="10" class="small">No opportunities yet. Wait for more weapon books, lower thresholds, or add offline sellers.</td>`;
    elements.opps.appendChild(row);
  }
}

function renderSignals(opportunity) {
  const signals = opportunity.quality?.signals ?? [];
  const stats = [
    ...opportunity.positives.map((value) => `<span class="flag good">+${escapeHtml(value)}</span>`),
    ...opportunity.negatives.map((value) => `<span class="flag bad">-${escapeHtml(value)}</span>`),
  ].join("");
  const signalChips = signals
    .map((signal) => `<span class="signal signal-${signal}">${signal.replace(/_/g, " ")}</span>`)
    .join("");
  return `<div class="flags">${stats}</div><div class="signals">${signalChips}</div>`;
}

function renderInstantWins(items) {
  elements.instantList.textContent = "";
  if (items.length === 0) {
    elements.instantSummary.textContent = "No confirmed undervalued listings right now. Instant wins need signature history (≥ 8 samples per signature, confidence ≥ 0.6) before they appear.";
    return;
  }
  elements.instantSummary.textContent = `${items.length} listing${items.length === 1 ? "" : "s"} priced below their same-signature p25.`;
  for (const item of items) {
    const opportunity = item.opportunity;
    const value = item.signature_value;
    const card = document.createElement("article");
    card.className = "instant-card";
    card.innerHTML = `
      <div class="instant-head">
        <div class="instant-head-main">
          ${weaponThumb(opportunity.imageName, opportunity.weaponName, "md")}
          <div>
            <strong>${escapeHtml(opportunity.weaponName)}</strong>
            <div class="small">${escapeHtml(opportunity.rivenName)}</div>
          </div>
        </div>
        <div class="uplift">+${item.expected_uplift}p</div>
      </div>
      <div class="instant-body small">
        buy <span class="price">${opportunity.buyPrice}p</span>
        vs p25 <strong>${Math.round(value.p25)}p</strong>
        · median <strong>${Math.round(value.p50)}p</strong>
        · ${value.sample_count} samples · confidence ${Math.round(value.confidence * 100)}%
      </div>
      <div class="signals">${(opportunity.quality?.signals ?? []).map((s) => `<span class="signal signal-${s}">${s.replace(/_/g, " ")}</span>`).join("")}</div>`;
    card.addEventListener("click", () => window.open(opportunity.url, "_blank", "noopener"));
    elements.instantList.appendChild(card);
  }
}

function renderWeapons(summaries) {
  elements.weapons.textContent = "";
  for (const summary of summaries.slice(0, 24)) {
    const stats = summary.priceStats;
    const card = document.createElement("article");
    card.className = "panel weapon-card";
    card.innerHTML = `<div class="weapon-card-head">${weaponThumb(summary.imageName, summary.name, "lg")}<h3>${escapeHtml(summary.name)}</h3></div>
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

const TIER_COLORS = { A: "#71f6c5", B: "#7db4ff", C: "#ffd166", D: "#ff7a90" };

function drawChart(opportunities) {
  const canvas = elements.chart;
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0 && Math.abs(canvas.width - rect.width) > 2) canvas.width = Math.floor(rect.width);
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#0c141d";
  context.fillRect(0, 0, width, height);

  const marginX = 46;
  const marginY = 28;
  const plotW = width - marginX * 2;
  const plotH = height - marginY * 2;

  context.strokeStyle = "#26384b";
  context.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = marginY + (i * plotH) / 4;
    context.beginPath();
    context.moveTo(marginX, y);
    context.lineTo(width - marginX, y);
    context.stroke();
    const x = marginX + (i * plotW) / 4;
    context.beginPath();
    context.moveTo(x, marginY);
    context.lineTo(x, height - marginY);
    context.stroke();
  }

  scatterHits = [];
  if (opportunities.length === 0) {
    context.fillStyle = "#8ca3ba";
    context.font = "16px sans-serif";
    context.fillText("Waiting for opportunities", 60, height / 2);
    return;
  }

  const maxRoi = Math.max(1, ...opportunities.map((entry) => entry.roi ?? 0));
  const maxProfit = Math.max(1, ...opportunities.map((entry) => entry.expectedProfit ?? 0));

  context.fillStyle = "#8ca3ba";
  context.font = "11px sans-serif";
  for (let i = 0; i <= 4; i += 1) {
    const roi = ((i * maxRoi) / 4).toFixed(1);
    context.fillText(`${roi}x`, marginX + (i * plotW) / 4 - 8, height - 8);
    const profit = Math.round(((4 - i) * maxProfit) / 4);
    context.fillText(`${profit}p`, 4, marginY + (i * plotH) / 4 + 4);
  }

  for (const opportunity of opportunities) {
    const roi = Math.max(0, Math.min(maxRoi, opportunity.roi ?? 0));
    const profit = Math.max(0, Math.min(maxProfit, opportunity.expectedProfit ?? 0));
    const cx = marginX + (roi / maxRoi) * plotW;
    const cy = height - marginY - (profit / maxProfit) * plotH;
    const tier = opportunity.quality?.tier ?? "D";
    const signals = opportunity.quality?.signals ?? [];
    const undervalued = signals.includes("undervalued_signature");
    context.fillStyle = TIER_COLORS[tier] ?? TIER_COLORS.D;
    context.beginPath();
    context.arc(cx, cy, 5, 0, Math.PI * 2);
    context.fill();
    if (undervalued) {
      context.strokeStyle = "#ffffff";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(cx, cy, 9, 0, Math.PI * 2);
      context.stroke();
    }
    scatterHits.push({ cx, cy, r: 5, opportunity });
  }
}

function canvasPointFromEvent(event) {
  const canvas = elements.chart;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    mx: (event.clientX - rect.left) * scaleX,
    my: (event.clientY - rect.top) * scaleY,
    localX: event.clientX - rect.left,
    localY: event.clientY - rect.top,
  };
}

function findScatterHit(mx, my, tolerance = 3) {
  let best = null;
  let bestDist = Infinity;
  for (const hit of scatterHits) {
    const dx = hit.cx - mx;
    const dy = hit.cy - my;
    const dist = dx * dx + dy * dy;
    const limit = (hit.r + tolerance) ** 2;
    if (dist <= limit && dist < bestDist) {
      best = hit;
      bestDist = dist;
    }
  }
  return best;
}

if (elements.chart) {
  elements.chart.addEventListener("mousemove", (event) => {
    const { mx, my, localX, localY } = canvasPointFromEvent(event);
    const hit = findScatterHit(mx, my, 4);
    if (hit) {
      const opportunity = hit.opportunity;
      elements.chartTip.hidden = false;
      const wrap = elements.chart.parentElement.getBoundingClientRect();
      const rect = elements.chart.getBoundingClientRect();
      const px = rect.left - wrap.left + localX + 12;
      const py = rect.top - wrap.top + localY + 12;
      elements.chartTip.style.left = `${Math.min(px, elements.chart.width - 220)}px`;
      elements.chartTip.style.top = `${py}px`;
      const tier = opportunity.quality?.tier ?? "D";
      const signals = (opportunity.quality?.signals ?? []).slice(0, 3).map((s) => `<span class="signal signal-${s}">${s.replace(/_/g, " ")}</span>`).join("");
      elements.chartTip.innerHTML = `
        <div class="tt-head">
          ${weaponThumb(opportunity.imageName, opportunity.weaponName, "md")}
          <span class="tier-badge tier-${tier}">${tier}</span>
          <strong>${escapeHtml(opportunity.weaponName)}</strong>
        </div>
        <div class="tt-body">
          <div class="small">${escapeHtml(opportunity.rivenName)}</div>
          <div><span class="price">${opportunity.buyPrice}p</span> → <strong>${opportunity.targetSellPrice}p</strong> <span class="profit">+${opportunity.expectedProfit}p</span> <span class="roi">${Math.round(opportunity.roi * 100)}%</span></div>
          <div class="small">seller ${escapeHtml(opportunity.seller.ingameName)} · ${opportunity.status} · comps ${opportunity.comparableListings}</div>
          ${signals ? `<div class="signals">${signals}</div>` : ""}
          <div class="small tt-hint">click to open on warframe.market</div>
        </div>`;
      elements.chart.style.cursor = "pointer";
    } else {
      elements.chartTip.hidden = true;
      elements.chart.style.cursor = "default";
    }
  });

  elements.chart.addEventListener("mouseleave", () => {
    elements.chartTip.hidden = true;
    elements.chart.style.cursor = "default";
  });

  elements.chart.addEventListener("click", (event) => {
    const { mx, my } = canvasPointFromEvent(event);
    const hit = findScatterHit(mx, my, 6);
    if (hit) window.open(hit.opportunity.url, "_blank", "noopener");
  });
}

async function loadWeaponBrowser(query) {
  if (!elements.weaponResults) return;
  try {
    const params = new URLSearchParams({ q: query, limit: "40" });
    const response = await fetch(`/api/weapons?${params.toString()}`);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const items = await response.json();
    renderWeaponResults(items);
  } catch (error) {
    elements.weaponResults.innerHTML = `<div class="small">Search failed: ${escapeHtml(error.message)}</div>`;
  }
}

function renderWeaponResults(items) {
  elements.weaponResults.textContent = "";
  if (!items || items.length === 0) {
    elements.weaponResults.innerHTML = `<div class="small">No matches.</div>`;
    return;
  }
  const list = document.createElement("ul");
  list.className = "weapon-list";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "weapon-row" + (item.hasData ? " has-data" : "");
    const stats = item.summary?.priceStats;
    const priceLine = stats ? `median ${stats.median}p · p75 ${stats.p75}p` : "no scan data yet";
    const imageName = item.imageName ?? item.summary?.imageName;
    li.innerHTML = `
      ${weaponThumb(imageName, item.name, "sm")}
      <div class="wr-main">
        <strong>${escapeHtml(item.name)}</strong>
        <div class="small">${escapeHtml(item.group)} · dispo ${item.disposition.toFixed(2)}</div>
      </div>
      <div class="wr-side small">
        ${priceLine}
        <button class="secondary wr-open" type="button" data-slug="${escapeHtml(item.slug)}" title="Open on warframe.market">open ↗</button>
      </div>`;
    li.addEventListener("click", (event) => {
      if (event.target instanceof HTMLButtonElement) return;
      elements.sigWeapon.value = item.slug;
      elements.sigWeapon.focus();
      const traitSection = elements.signatureForm.closest("details");
      if (traitSection && !traitSection.open) traitSection.open = true;
    });
    li.querySelector(".wr-open").addEventListener("click", (event) => {
      event.stopPropagation();
      window.open(item.auctionsUrl, "_blank", "noopener");
    });
    list.appendChild(li);
  }
  elements.weaponResults.appendChild(list);
}

if (elements.weaponSearch) {
  elements.weaponSearch.addEventListener("input", () => {
    const value = elements.weaponSearch.value.trim();
    if (weaponSearchTimer) clearTimeout(weaponSearchTimer);
    weaponSearchTimer = setTimeout(() => loadWeaponBrowser(value), 180);
  });
}

async function submitSignatureLookup(event) {
  event.preventDefault();
  const weapon = elements.sigWeapon.value.trim();
  if (!weapon) {
    elements.sigResult.textContent = "Enter a weapon slug first.";
    return;
  }
  const positives = elements.sigPositives.value.split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const negatives = elements.sigNegatives.value.split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const params = new URLSearchParams();
  params.set("weapon_slug", weapon);
  for (const positive of positives) params.append("positives", positive);
  for (const negative of negatives) params.append("negatives", negative);
  elements.sigResult.textContent = "Looking up…";
  try {
    const response = await fetch(`/api/signature-value?${params.toString()}`);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data = await response.json();
    renderSignatureResult(data);
  } catch (error) {
    elements.sigResult.textContent = `Lookup failed: ${error.message}`;
  }
}

function renderSignatureResult(data) {
  if (!data || data.sample_count === 0) {
    elements.sigResult.innerHTML = `<div class="small">No matching samples yet.${data?.note ? ` (${escapeHtml(data.note)})` : ""}</div>`;
    return;
  }
  const velocity = data.velocity;
  const velocityLine = velocity
    ? `<div>velocity: ${velocity.classification} · vanish rate ${(velocity.vanish_rate * 100).toFixed(0)}% (n=${velocity.observed_listings})</div>`
    : "";
  elements.sigResult.innerHTML = `
    <div><strong>${data.sample_count}</strong> samples over ${data.window_days ?? 30} days · conf ${Math.round(data.confidence * 100)}%</div>
    <div>p25 <strong>${Math.round(data.p25 ?? 0)}p</strong> · median <strong>${Math.round(data.p50 ?? 0)}p</strong> · p75 <strong>${Math.round(data.p75 ?? 0)}p</strong> · p90 <strong>${Math.round(data.p90 ?? 0)}p</strong></div>
    ${velocityLine}
    <div class="small">signature: ${escapeHtml(data.signature ?? "")}</div>`;
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

function weaponThumb(imageName, alt, size = "sm") {
  if (!imageName) return `<span class="weapon-thumb weapon-thumb-${size} weapon-thumb-blank" aria-hidden="true"></span>`;
  const escaped = encodeURIComponent(imageName);
  return `<img class="weapon-thumb weapon-thumb-${size}" loading="lazy" src="/img/${escaped}" alt="${escapeHtml(alt)}" onerror="this.classList.add('weapon-thumb-blank'); this.removeAttribute('src');" />`;
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
    if (latestEnrichedOpps.length > 0) renderTable(sortedOpportunities(latestEnrichedOpps));
    else if (latestState) renderTable(sortedOpportunities(latestState.opportunities));
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

if (elements.signatureForm) {
  elements.signatureForm.addEventListener("submit", submitSignatureLookup);
}

const events = new EventSource("/events");
events.addEventListener("open", () => {
  elements.sseBadge.textContent = "SSE live";
  elements.sseBadge.className = "badge good";
});
events.addEventListener("state", async (event) => {
  render(JSON.parse(event.data));
  await refreshDerived();
});
events.addEventListener("error", () => {
  elements.sseBadge.textContent = "SSE reconnecting";
  elements.sseBadge.className = "badge warn";
});

loadState().catch((error) => {
  elements.summary.textContent = error.message;
});
setInterval(() => {
  refreshDerived().catch(() => undefined);
}, 60_000);
setInterval(() => {
  if (elements.weaponSearch && document.activeElement !== elements.weaponSearch) {
    loadWeaponBrowser(elements.weaponSearch.value.trim());
  }
}, 45_000);
window.addEventListener("resize", () => {
  drawChart(latestEnrichedOpps.length > 0 ? latestEnrichedOpps : latestState?.opportunities ?? []);
});

// -------- Data source toggle --------

function updateModeUi(activeMode) {
  const normalized = activeMode === "remote" ? "remote" : "tiered";
  for (const button of elements.modeButtons) {
    button.classList.toggle("active", button.dataset.mode === normalized);
  }
  if (elements.modeHint) {
    elements.modeHint.textContent = normalized === "remote"
      ? "Reading the CI-published feed. Refreshes every ~45s; no warframe.market traffic from this browser."
      : "Local tiered scan is active. Uses this machine's IP against warframe.market with a token-bucket limiter.";
  }
}

async function switchMode(mode) {
  try {
    const response = await fetch("/api/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      elements.summary.textContent = `Mode switch failed: ${payload.error ?? response.status}`;
      return;
    }
    render(await response.json());
    await refreshDerived();
  } catch (error) {
    elements.summary.textContent = `Mode switch failed: ${error.message}`;
  }
}

for (const button of elements.modeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    if (!mode || button.classList.contains("active")) return;
    switchMode(mode);
  });
}

// -------- MCP connect modal --------

function openMcpModal() {
  if (!elements.mcpModal) return;
  const origin = window.location.origin;
  const sseUrl = `${origin}/mcp/sse`;
  if (elements.mcpEndpoint) elements.mcpEndpoint.textContent = sseUrl;
  if (elements.mcpConfigDesktop) {
    elements.mcpConfigDesktop.textContent = JSON.stringify({
      mcpServers: {
        "wf-riventrader": {
          command: "npx",
          args: ["-y", "mcp-remote", sseUrl],
        },
      },
    }, null, 2);
  }
  if (elements.mcpConfigCli) {
    elements.mcpConfigCli.textContent = `claude mcp add wf-riventrader --transport sse ${sseUrl}`;
  }
  if (elements.mcpTestResult) elements.mcpTestResult.textContent = "";
  loadMcpToolList();
  elements.mcpModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeMcpModal() {
  if (!elements.mcpModal) return;
  elements.mcpModal.hidden = true;
  document.body.classList.remove("modal-open");
}

async function loadMcpToolList() {
  if (!elements.mcpToolList) return;
  elements.mcpToolList.innerHTML = `<li class="small">Loading…</li>`;
  try {
    const response = await fetch("/api/mcp-info");
    if (!response.ok) throw new Error(`status ${response.status}`);
    const info = await response.json();
    if (!Array.isArray(info.tools) || info.tools.length === 0) {
      elements.mcpToolList.innerHTML = `<li class="small">No tools registered.</li>`;
      return;
    }
    elements.mcpToolList.innerHTML = info.tools
      .map((tool) => `<li><strong>${escapeHtml(tool.name)}</strong><div class="small">${escapeHtml(tool.description)}</div></li>`)
      .join("");
  } catch (error) {
    elements.mcpToolList.innerHTML = `<li class="small">Failed to load tools: ${escapeHtml(error.message)}</li>`;
  }
}

async function testMcpConnection() {
  if (!elements.mcpTestResult) return;
  elements.mcpTestResult.textContent = "Opening SSE session…";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch("/mcp/sse", { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`status ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sessionOk = false;
    while (!sessionOk) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
      if (buffer.includes("event: endpoint")) sessionOk = true;
    }
    controller.abort();
    if (sessionOk) {
      elements.mcpTestResult.innerHTML = `<span class="good">✓ SSE handshake succeeded — endpoint event received.</span>`;
    } else {
      elements.mcpTestResult.innerHTML = `<span class="warn">Handshake ended without an endpoint event.</span>`;
    }
  } catch (error) {
    if (error.name === "AbortError") {
      elements.mcpTestResult.innerHTML = `<span class="good">✓ Session opened (aborted after handshake).</span>`;
    } else {
      elements.mcpTestResult.innerHTML = `<span class="warn">Handshake failed: ${escapeHtml(error.message)}</span>`;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied ✓";
    setTimeout(() => (button.textContent = original), 1600);
  } catch {
    button.textContent = "Copy blocked";
  }
}

if (elements.mcpButton) elements.mcpButton.addEventListener("click", openMcpModal);
if (elements.mcpModal) {
  elements.mcpModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.modalClose !== undefined) closeMcpModal();
  });
  elements.mcpModal.querySelectorAll(".mcp-copy").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-copy-target");
      const target = targetId ? document.getElementById(targetId) : null;
      if (target) copyText(target.textContent ?? "", button);
    });
  });
}
if (elements.mcpTestButton) elements.mcpTestButton.addEventListener("click", testMcpConnection);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.mcpModal && !elements.mcpModal.hidden) closeMcpModal();
});
