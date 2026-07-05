const elements = {
  topBar: document.getElementById("topBar"),
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
  instantWinsPanel: document.getElementById("instantWinsPanel"),
  instantList: document.getElementById("instantList"),
  instantSummary: document.getElementById("instantSummary"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  modeHint: document.getElementById("modeHint"),
  dataStatusLine: document.getElementById("dataStatusLine"),
  settingsButton: document.getElementById("settingsButton"),
  settingsModal: document.getElementById("settingsModal"),
  settingsTabs: document.querySelectorAll(".settings-tab"),
  settingsPanels: document.querySelectorAll(".settings-panel"),
  mcpEndpoint: document.getElementById("mcpEndpoint"),
  mcpConfigDesktop: document.getElementById("mcpConfigDesktop"),
  mcpConfigCli: document.getElementById("mcpConfigCli"),
  mcpToolList: document.getElementById("mcpToolList"),
  mcpTestButton: document.getElementById("mcpTestButton"),
  mcpTestResult: document.getElementById("mcpTestResult"),
  heroDeal: document.getElementById("heroDeal"),
  heroThumb: document.getElementById("heroThumb"),
  heroWeapon: document.getElementById("heroWeapon"),
  heroTier: document.getElementById("heroTier"),
  heroRiven: document.getElementById("heroRiven"),
  heroBuy: document.getElementById("heroBuy"),
  heroTarget: document.getElementById("heroTarget"),
  heroProfit: document.getElementById("heroProfit"),
  heroRoi: document.getElementById("heroRoi"),
  heroComps: document.getElementById("heroComps"),
  heroSignals: document.getElementById("heroSignals"),
  heroOpen: document.getElementById("heroOpen"),
  spotlight: document.getElementById("spotlight"),
  spotlightInput: document.getElementById("spotlightInput"),
  spotlightResults: document.getElementById("spotlightResults"),
  spotlightOverlay: document.getElementById("spotlightOverlay"),
  spotlightTrigger: document.getElementById("spotlightTrigger"),
  weaponModal: document.getElementById("weaponModal"),
  wdContent: document.getElementById("wdContent"),
};

let latestState = null;
let latestEnrichedOpps = [];
let latestInstantWins = [];
let scatterHits = [];
let controlsHydrated = false;
let sortState = { key: "expectedProfit", direction: "desc" };
let heroOpportunity = null;
let spotlightTimer = null;
let spotlightItems = [];
let spotlightIndex = -1;
let spotlightFilter = null;

const SIGNAL_PRIORITY = [
  "undervalued_signature",
  "fast_moving",
  "disposition_rising",
  "sentiment_hot",
  "new_seller",
  "stale_seller",
  "stuck_signature",
  "low_comparables",
  "disposition_falling",
  "outlier_price",
];

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
    const filtered = applySpotlightFilter(latestEnrichedOpps);
    renderTable(sortedOpportunities(filtered));
    drawChart(filtered);
    renderInstantWins(latestInstantWins);
    renderHero(filtered[0] ?? latestEnrichedOpps[0] ?? null);
  } catch {
    // ignore
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
  elements.statOpps.textContent = String(state.totals.opportunities);
  const totalRefWeapons = state.reference?.weapons ?? 0;
  const covered = state.totals?.weaponsWithAuctions ?? 0;
  elements.statWeapons.textContent = `${covered}/${totalRefWeapons}`;
  const running = state.status.running;
  const tierLabel = state.status.reason && state.status.reason.includes("-") ? state.status.reason.split("-").pop() : null;
  if (elements.statWeaponsSub) {
    elements.statWeaponsSub.textContent = running
      ? ` · scanning ${state.status.scannedWeapons}/${state.status.totalWeapons}${tierLabel ? ` (${tierLabel})` : ""}`
      : "";
  }
  elements.statAuctions.textContent = String(state.totals.auctions);
  const best = state.opportunities.reduce((winner, opportunity) => !winner || opportunity.expectedProfit > winner.expectedProfit ? opportunity : winner, null);
  elements.statBest.textContent = best ? `Best +${best.expectedProfit}p` : "";
  elements.statBest.style.display = best ? "" : "none";
  elements.statRefresh.textContent = shortTime(state.status.finishedAt || state.generatedAt);
  elements.summary.textContent = state.status.lastError ? state.status.lastError : state.status.lastMessage;
  updateModeUi(state.scanMode ?? "tiered", state);
  renderWeapons(state.weaponSummaries);
  if (latestEnrichedOpps.length === 0) {
    const filtered = applySpotlightFilter(state.opportunities);
    renderTable(sortedOpportunities(filtered));
    drawChart(filtered);
    renderHero(filtered[0] ?? state.opportunities?.[0] ?? null);
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
}

function renderHero(opportunity) {
  if (!opportunity || !elements.heroDeal) {
    if (elements.heroDeal) elements.heroDeal.hidden = true;
    heroOpportunity = null;
    return;
  }
  heroOpportunity = opportunity;
  elements.heroDeal.hidden = false;
  elements.heroThumb.innerHTML = weaponThumb(opportunity.imageName, opportunity.weaponName, "lg");
  elements.heroWeapon.textContent = opportunity.weaponName;
  const tier = opportunity.quality?.tier ?? "D";
  elements.heroTier.textContent = tier;
  elements.heroTier.className = `tier-badge tier-${tier}`;
  elements.heroRiven.textContent = opportunity.rivenName;
  elements.heroBuy.textContent = `${opportunity.buyPrice}p`;
  elements.heroTarget.textContent = `${opportunity.conservativeSellPrice}p`;
  elements.heroTarget.title = `Median target · p75 aggressive ${opportunity.targetSellPrice}p`;
  elements.heroProfit.textContent = `+${opportunity.expectedProfit}p profit`;
  elements.heroRoi.textContent = `${Math.round(opportunity.roi * 100)}% ROI`;
  elements.heroComps.textContent = `${opportunity.comparableListings} comparable listing${opportunity.comparableListings === 1 ? "" : "s"}`;
  elements.heroSignals.innerHTML = topSignalsFor(opportunity, 3)
    .map((signal) => `<span class="signal signal-${signal}">${signal.replace(/_/g, " ")}</span>`)
    .join("");
}

if (elements.heroOpen) {
  elements.heroOpen.addEventListener("click", () => {
    if (heroOpportunity?.url) window.open(heroOpportunity.url, "_blank", "noopener");
  });
}

function topSignalsFor(opportunity, limit) {
  const signals = opportunity.quality?.signals ?? [];
  const ranked = [...signals].sort((left, right) => {
    const li = SIGNAL_PRIORITY.indexOf(left);
    const ri = SIGNAL_PRIORITY.indexOf(right);
    return (li === -1 ? 99 : li) - (ri === -1 ? 99 : ri);
  });
  return ranked.slice(0, limit);
}

function renderTable(opportunities) {
  elements.opps.textContent = "";
  for (const [index, opportunity] of opportunities.entries()) {
    const row = document.createElement("tr");
    const tier = opportunity.quality?.tier ?? "D";
    row.className = `tier-${tier}`;
    const topSignals = topSignalsFor(opportunity, 2);
    const signalHtml = topSignals.map((signal) => `<span class="signal signal-${signal}">${signal.replace(/_/g, " ")}</span>`).join("");
    row.title = `${opportunity.seller.ingameName} · ${opportunity.status} · rep ${opportunity.seller.reputation}\n${opportunity.comparableListings} comparable · ${opportunity.groupType}\nScore ${opportunity.score}/100 · confidence ${Math.round(opportunity.confidence * 100)}%`;
    row.innerHTML = `
      <td class="rank-cell">${index + 1}</td>
      <td>
        <div class="weapon-cell" data-weapon-slug="${escapeHtml(opportunity.weaponSlug)}">
          ${weaponThumb(opportunity.imageName, opportunity.weaponName, "sm")}
          <div class="weapon-cell-text">
            <strong>${escapeHtml(opportunity.weaponName)}</strong>
            <div class="small">${escapeHtml(opportunity.rivenName)}</div>
          </div>
        </div>
      </td>
      <td class="trade-cell">
        <span class="trade-buy">${opportunity.buyPrice}p</span>
        <span class="trade-arrow">→</span>
        <span class="trade-target" title="Median of trimmed comparables">${opportunity.conservativeSellPrice}p</span>
      </td>
      <td class="profit-cell">+${opportunity.expectedProfit}<span class="p-suffix">p</span></td>
      <td class="roi-cell">${Math.round(opportunity.roi * 100)}%</td>
      <td class="signals-cell">${signalHtml || `<span class="signal-empty">—</span>`}</td>
      <td class="tier-cell"><span class="tier-badge tier-${tier}">${tier}</span></td>
    `;
    row.addEventListener("click", (event) => {
      const weaponCell = event.target instanceof HTMLElement ? event.target.closest("[data-weapon-slug]") : null;
      if (weaponCell) {
        openWeaponDetail(weaponCell.dataset.weaponSlug);
        event.stopPropagation();
        return;
      }
      window.open(opportunity.url, "_blank", "noopener");
    });
    elements.opps.appendChild(row);
  }
  if (opportunities.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="7" class="small" style="padding:24px 16px">No opportunities match. Adjust filters, clear the search, or wait for the next scan.</td>`;
    elements.opps.appendChild(row);
  }
}

function renderInstantWins(items) {
  const panel = elements.instantWinsPanel;
  if (!items || items.length === 0) {
    if (panel) panel.hidden = true;
    return;
  }
  if (panel) panel.hidden = false;
  elements.instantList.textContent = "";
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
        · ${value.sample_count} samples · conf ${Math.round(value.confidence * 100)}%
      </div>
      <div class="signals">${topSignalsFor(opportunity, 3).map((s) => `<span class="signal signal-${s}">${s.replace(/_/g, " ")}</span>`).join("")}</div>`;
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
    card.dataset.weaponSlug = summary.slug;
    card.innerHTML = `<div class="weapon-card-head">${weaponThumb(summary.imageName, summary.name, "sm")}<h3>${escapeHtml(summary.name)}</h3></div>
      <dl>
        <dt>Listings</dt><dd>${summary.directListings}</dd>
        <dt>Online</dt><dd>${summary.onlineListings}</dd>
        <dt>Median</dt><dd>${stats ? `${stats.median}p` : "—"}</dd>
        <dt>P75</dt><dd>${stats ? `${stats.p75}p` : "—"}</dd>
        <dt>Dispo</dt><dd>${summary.disposition.toFixed(2)}</dd>
      </dl>`;
    card.addEventListener("click", () => openWeaponDetail(summary.slug));
    elements.weapons.appendChild(card);
  }
}

const TIER_COLORS = { A: "#5eead4", B: "#7dd3fc", C: "#fbbf24", D: "#f87171" };

function drawChart(opportunities) {
  const canvas = elements.chart;
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0 && Math.abs(canvas.width - rect.width) > 2) canvas.width = Math.floor(rect.width);
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const marginX = 46;
  const marginY = 28;
  const plotW = width - marginX * 2;
  const plotH = height - marginY * 2;

  context.strokeStyle = "rgba(28, 38, 50, 0.9)";
  context.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = marginY + (i * plotH) / 4;
    context.beginPath(); context.moveTo(marginX, y); context.lineTo(width - marginX, y); context.stroke();
    const x = marginX + (i * plotW) / 4;
    context.beginPath(); context.moveTo(x, marginY); context.lineTo(x, height - marginY); context.stroke();
  }

  scatterHits = [];
  if (opportunities.length === 0) {
    context.fillStyle = "#4a5566";
    context.font = "13px Inter, sans-serif";
    context.fillText("Waiting for opportunities…", marginX + 4, height / 2);
    return;
  }

  const maxRoi = Math.max(1, ...opportunities.map((entry) => entry.roi ?? 0));
  const maxProfit = Math.max(1, ...opportunities.map((entry) => entry.expectedProfit ?? 0));

  context.fillStyle = "#7d8b9c";
  context.font = "10.5px Inter, sans-serif";
  for (let i = 0; i <= 4; i += 1) {
    const roi = ((i * maxRoi) / 4).toFixed(1);
    context.fillText(`${roi}×`, marginX + (i * plotW) / 4 - 8, height - 8);
    const profit = Math.round(((4 - i) * maxProfit) / 4);
    context.fillText(`${profit}p`, 4, marginY + (i * plotH) / 4 + 4);
  }

  for (const opportunity of opportunities) {
    const roi = Math.max(0, Math.min(maxRoi, opportunity.roi ?? 0));
    const profit = Math.max(0, Math.min(maxProfit, opportunity.expectedProfit ?? 0));
    const cx = marginX + (roi / maxRoi) * plotW;
    const cy = height - marginY - (profit / maxProfit) * plotH;
    const tier = opportunity.quality?.tier ?? "D";
    const undervalued = (opportunity.quality?.signals ?? []).includes("undervalued_signature");
    context.fillStyle = TIER_COLORS[tier] ?? TIER_COLORS.D;
    context.beginPath(); context.arc(cx, cy, 4.5, 0, Math.PI * 2); context.fill();
    if (undervalued) {
      context.strokeStyle = "rgba(255,255,255,0.85)"; context.lineWidth = 1.5;
      context.beginPath(); context.arc(cx, cy, 8, 0, Math.PI * 2); context.stroke();
    }
    scatterHits.push({ cx, cy, r: 4.5, opportunity });
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
  let best = null; let bestDist = Infinity;
  for (const hit of scatterHits) {
    const dx = hit.cx - mx; const dy = hit.cy - my;
    const dist = dx * dx + dy * dy;
    const limit = (hit.r + tolerance) ** 2;
    if (dist <= limit && dist < bestDist) { best = hit; bestDist = dist; }
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
      elements.chartTip.style.left = `${Math.min(px, elements.chart.width - 240)}px`;
      elements.chartTip.style.top = `${py}px`;
      const tier = opportunity.quality?.tier ?? "D";
      const signals = topSignalsFor(opportunity, 3).map((s) => `<span class="signal signal-${s}">${s.replace(/_/g, " ")}</span>`).join("");
      elements.chartTip.innerHTML = `
        <div class="tt-head">
          ${weaponThumb(opportunity.imageName, opportunity.weaponName, "sm")}
          <div>
            <div><span class="tier-badge tier-${tier}">${tier}</span> <strong>${escapeHtml(opportunity.weaponName)}</strong></div>
            <div class="small">${escapeHtml(opportunity.rivenName)}</div>
          </div>
        </div>
        <div class="tt-body">
          <div><span class="price">${opportunity.buyPrice}p</span> → <strong>${opportunity.targetSellPrice}p</strong> <span class="profit">+${opportunity.expectedProfit}p</span> <span class="roi">${Math.round(opportunity.roi * 100)}%</span></div>
          <div class="small">${escapeHtml(opportunity.seller.ingameName)} · ${opportunity.status} · ${opportunity.comparableListings} comps</div>
          ${signals ? `<div class="signals">${signals}</div>` : ""}
          <div class="tt-hint">click to open</div>
        </div>`;
      elements.chart.style.cursor = "pointer";
    } else {
      elements.chartTip.hidden = true;
      elements.chart.style.cursor = "default";
    }
  });
  elements.chart.addEventListener("mouseleave", () => { elements.chartTip.hidden = true; elements.chart.style.cursor = "default"; });
  elements.chart.addEventListener("click", (event) => {
    const { mx, my } = canvasPointFromEvent(event);
    const hit = findScatterHit(mx, my, 6);
    if (hit) window.open(hit.opportunity.url, "_blank", "noopener");
  });
}

// -------- Spotlight search --------

function parseSpotlightQuery(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return { text: "", filter: null };
  const priceRegex = /\s*(<=|>=|<|>|=)\s*(\d+)\s*p?\s*$/i;
  const match = trimmed.match(priceRegex);
  if (match) {
    const op = match[1];
    const price = Number(match[2]);
    const text = trimmed.slice(0, match.index ?? trimmed.length).trim();
    return { text, filter: { field: "buyPrice", op, value: price } };
  }
  return { text: trimmed, filter: null };
}

function applySpotlightFilter(opportunities) {
  if (!spotlightFilter) return opportunities;
  const { text, filter } = spotlightFilter;
  const needle = text.toLowerCase();
  return opportunities.filter((opportunity) => {
    if (needle && !(opportunity.weaponName.toLowerCase().includes(needle) || opportunity.weaponSlug.toLowerCase().includes(needle))) return false;
    if (!filter) return true;
    const value = opportunity[filter.field] ?? 0;
    switch (filter.op) {
      case "<": return value < filter.value;
      case "<=": return value <= filter.value;
      case ">": return value > filter.value;
      case ">=": return value >= filter.value;
      case "=": return value === filter.value;
      default: return true;
    }
  });
}

async function updateSpotlight(raw) {
  const parsed = parseSpotlightQuery(raw);
  const items = [];
  if (parsed.text.length > 0) {
    try {
      const response = await fetch(`/api/weapons?q=${encodeURIComponent(parsed.text)}&limit=8`);
      if (response.ok) {
        const arr = await response.json();
        for (const weapon of arr) {
          items.push({
            type: "weapon",
            slug: weapon.slug,
            name: weapon.name,
            group: weapon.group,
            disposition: weapon.disposition,
            imageName: weapon.imageName ?? weapon.summary?.imageName,
            summary: weapon.summary,
          });
        }
      }
    } catch { /* ignore */ }
  }
  if (parsed.filter) {
    items.unshift({ type: "filter", text: parsed.text, filter: parsed.filter });
  }
  spotlightItems = items;
  renderSpotlightResults(items);
}

function renderSpotlightResults(items) {
  if (!elements.spotlightResults) return;
  if (items.length === 0) {
    elements.spotlightResults.hidden = false;
    elements.spotlightResults.innerHTML = `<div class="spotlight-empty">No matches. Try a partial name or use a price filter like <code>&lt; 100p</code>.</div>`;
    return;
  }
  elements.spotlightResults.hidden = false;
  spotlightIndex = -1;
  const html = items.map((item, index) => {
    if (item.type === "filter") {
      const label = item.text ? `${item.text} · ` : "";
      return `<button class="spotlight-item spotlight-filter" data-index="${index}" type="button">
        <span class="spotlight-glyph">≡</span>
        <div class="spotlight-body">
          <div class="spotlight-title">Filter table</div>
          <div class="spotlight-sub">${escapeHtml(label)}buy price ${item.filter.op} ${item.filter.value}p</div>
        </div>
      </button>`;
    }
    const priceLine = item.summary?.priceStats
      ? `median ${item.summary.priceStats.median}p · p75 ${item.summary.priceStats.p75}p`
      : "";
    return `<button class="spotlight-item spotlight-weapon" data-index="${index}" data-slug="${escapeHtml(item.slug)}" type="button">
      ${weaponThumb(item.imageName, item.name, "sm")}
      <div class="spotlight-body">
        <div class="spotlight-title">${escapeHtml(item.name)}</div>
        <div class="spotlight-sub">${escapeHtml(item.group)} · dispo ${item.disposition.toFixed(2)}${priceLine ? ` · ${escapeHtml(priceLine)}` : ""}</div>
      </div>
      <span class="spotlight-arrow">↵</span>
    </button>`;
  }).join("");
  elements.spotlightResults.innerHTML = html;
  for (const button of elements.spotlightResults.querySelectorAll(".spotlight-item:not(.spotlight-hint)")) {
    button.addEventListener("click", () => activateSpotlightItem(Number(button.dataset.index)));
  }
}

function activateSpotlightItem(index) {
  const item = spotlightItems[index];
  if (!item) return;
  if (item.type === "weapon") {
    openWeaponDetail(item.slug);
    closeSpotlightOverlay();
    elements.spotlightInput.value = "";
  } else if (item.type === "filter") {
    spotlightFilter = { text: item.text, filter: item.filter };
    closeSpotlightOverlay();
    void refreshDerived();
  }
}

function closeSpotlight() {
  if (elements.spotlightResults) elements.spotlightResults.hidden = true;
  spotlightIndex = -1;
}

function moveSpotlightSelection(delta) {
  if (spotlightItems.length === 0) return;
  spotlightIndex = (spotlightIndex + delta + spotlightItems.length) % spotlightItems.length;
  for (const button of elements.spotlightResults.querySelectorAll(".spotlight-item")) {
    button.classList.toggle("active", Number(button.dataset.index) === spotlightIndex);
  }
}

function openSpotlightOverlay() {
  if (!elements.spotlightOverlay) return;
  elements.spotlightOverlay.removeAttribute("hidden");
  document.body.classList.add("spotlight-active");
  // Render hints immediately so the dropdown paints on the same frame as the overlay,
  // before requestAnimationFrame or focus events have a chance to reorder things.
  const value = (elements.spotlightInput?.value ?? "").trim();
  if (value === "") renderSpotlightHints();
  else if (value.length > 0) updateSpotlight(value);
  // Focus after a microtask so the overlay is fully attached to the DOM
  Promise.resolve().then(() => elements.spotlightInput?.focus());
}

function renderSpotlightHints() {
  const results = elements.spotlightResults;
  if (!results) return;
  spotlightItems = [
    { type: "hint", title: "Search any weapon", sub: "Type a name — e.g. bramma, war, kuva karak" },
    { type: "hint", title: "Filter table by price", sub: "e.g. dark sword < 100p, > 500p, = 250p" },
    { type: "hint", title: "Click a weapon anywhere", sub: "Opens the full detail: live listings, price stats, common combos" },
  ];
  spotlightIndex = -1;
  results.removeAttribute("hidden");
  const glyphs = ["🔎", "≡", "⌕"];
  const html = ['<div class="spotlight-section-label">Try this</div>'];
  for (let i = 0; i < spotlightItems.length; i += 1) {
    const item = spotlightItems[i];
    html.push(
      `<div class="spotlight-item spotlight-hint" data-index="${i}">` +
        `<span class="spotlight-glyph">${glyphs[i] ?? "•"}</span>` +
        `<div class="spotlight-body">` +
          `<div class="spotlight-title">${escapeHtml(item.title)}</div>` +
          `<div class="spotlight-sub">${escapeHtml(item.sub)}</div>` +
        `</div>` +
      `</div>`,
    );
  }
  results.innerHTML = html.join("");
}

function closeSpotlightOverlay() {
  document.body.classList.remove("spotlight-active");
  if (elements.spotlightOverlay) elements.spotlightOverlay.hidden = true;
  closeSpotlight();
}

if (elements.spotlightTrigger) {
  elements.spotlightTrigger.addEventListener("click", () => openSpotlightOverlay());
}
if (elements.spotlightOverlay) {
  elements.spotlightOverlay.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.spotlightClose !== undefined) {
      closeSpotlightOverlay();
    }
  });
}

if (elements.spotlightInput) {
  elements.spotlightInput.addEventListener("input", () => {
    const value = elements.spotlightInput.value;
    if (spotlightTimer) clearTimeout(spotlightTimer);
    if (value.trim() === "") {
      if (spotlightFilter) { spotlightFilter = null; void refreshDerived(); }
      renderSpotlightHints();
      return;
    }
    spotlightTimer = setTimeout(() => updateSpotlight(value), 150);
  });
  elements.spotlightInput.addEventListener("focus", () => {
    if (elements.spotlightInput.value.trim().length > 0) updateSpotlight(elements.spotlightInput.value);
  });
  elements.spotlightInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      elements.spotlightInput.value = "";
      spotlightFilter = null;
      closeSpotlightOverlay();
      elements.spotlightInput.blur();
      void refreshDerived();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSpotlightSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSpotlightSelection(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (spotlightIndex >= 0) activateSpotlightItem(spotlightIndex);
      else if (spotlightItems.length > 0) activateSpotlightItem(0);
    }
  });
}

document.addEventListener("keydown", (event) => {
  const modKey = event.metaKey || event.ctrlKey;
  if (modKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSpotlightOverlay();
  }
  if (event.key === "Escape") {
    if (elements.weaponModal && !elements.weaponModal.hidden) closeWeaponModal();
    else if (elements.settingsModal && !elements.settingsModal.hidden) closeSettingsModal();
  }
});

// -------- Weapon detail modal --------

async function openWeaponDetail(slug) {
  if (!slug) return;
  elements.weaponModal.hidden = false;
  document.body.classList.add("modal-open");
  elements.wdContent.innerHTML = `<div class="wd-loading">Loading ${escapeHtml(slug)}…</div>`;
  try {
    const response = await fetch(`/api/weapon/${encodeURIComponent(slug)}`);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const detail = await response.json();
    renderWeaponDetail(detail);
  } catch (error) {
    elements.wdContent.innerHTML = `<div class="wd-loading">Failed to load: ${escapeHtml(error.message)}</div>`;
  }
}

function closeWeaponModal() {
  elements.weaponModal.hidden = true;
  document.body.classList.remove("modal-open");
}

if (elements.weaponModal) {
  elements.weaponModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.modalClose !== undefined) closeWeaponModal();
  });
}

function renderWeaponDetail(detail) {
  const { weapon, summary, opportunities, signatures, auctionsUrl } = detail;
  const stats = summary?.priceStats;
  const topSignatures = (signatures ?? []).filter((entry) => entry.sample_count > 0).slice(0, 8);

  const signaturesHtml = topSignatures.length > 0
    ? topSignatures.map((entry) => {
        const [pos, neg] = parseSignature(entry.signature);
        const positives = pos.map((p) => `<span class="flag good">+${escapeHtml(p)}</span>`).join("");
        const negatives = neg.map((n) => `<span class="flag bad">-${escapeHtml(n)}</span>`).join("");
        const velocity = entry.velocity;
        const classification = velocity?.classification && velocity.classification !== "unknown"
          ? `<span class="signal signal-${velocity.classification}">${velocity.classification.replace(/_/g, " ")}</span>`
          : "";
        return `<div class="wd-signature">
          <div class="wd-signature-attrs"><div class="flags">${positives}${negatives}</div>${classification}</div>
          <div class="wd-signature-stats">
            <span><span class="small">p25</span> ${Math.round(entry.p25 ?? 0)}p</span>
            <span><span class="small">median</span> <strong>${Math.round(entry.p50 ?? 0)}p</strong></span>
            <span><span class="small">p75</span> ${Math.round(entry.p75 ?? 0)}p</span>
            <span><span class="small">samples</span> ${entry.sample_count}</span>
            <span><span class="small">conf</span> ${Math.round((entry.confidence ?? 0) * 100)}%</span>
          </div>
        </div>`;
      }).join("")
    : `<div class="wd-empty">No signature history yet. Once cold-scans have logged samples for this weapon over ~30 days, common stat combos with p25/median/p75 pricing will appear here.</div>`;

  const opportunitiesHtml = opportunities.length > 0
    ? opportunities.slice(0, 8).map((opp) => {
        const tier = opp.quality?.tier ?? "D";
        return `<div class="wd-opp" data-url="${escapeHtml(opp.url)}">
          <div class="wd-opp-price"><span class="price">${opp.buyPrice}p</span> → ${opp.targetSellPrice}p <span class="profit">+${opp.expectedProfit}p</span></div>
          <div class="wd-opp-meta small">${escapeHtml(opp.rivenName)} · ${escapeHtml(opp.seller.ingameName)} · ${opp.status} · comps ${opp.comparableListings}</div>
          <div class="wd-opp-flags">${(opp.positives ?? []).slice(0, 4).map((p) => `<span class="flag good">+${escapeHtml(p)}</span>`).join("")}${(opp.negatives ?? []).slice(0, 2).map((n) => `<span class="flag bad">-${escapeHtml(n)}</span>`).join("")}<span class="tier-badge tier-${tier}">${tier}</span></div>
        </div>`;
      }).join("")
    : `<div class="wd-empty">No actionable listings that match your current filters. Widen seller-status or lower min-profit to see more.</div>`;

  elements.wdContent.innerHTML = `
    <div class="wd-head">
      <div class="wd-head-thumb">${weaponThumb(weapon.imageName, weapon.name, "lg")}</div>
      <div class="wd-head-body">
        <div class="wd-eyebrow">${escapeHtml(weapon.group)} · MR ${weapon.reqMasteryRank}</div>
        <h2 class="wd-name">${escapeHtml(weapon.name)}</h2>
        <div class="wd-facts">
          <span>disposition <strong>${weapon.disposition.toFixed(2)}</strong></span>
          <span>direct listings <strong>${summary?.directListings ?? 0}</strong></span>
          <span>online <strong>${summary?.onlineListings ?? 0}</strong></span>
        </div>
      </div>
      <a class="wd-external" href="${escapeHtml(auctionsUrl)}" target="_blank" rel="noopener">Open on WFM ↗</a>
    </div>

    ${stats ? `<div class="wd-stats">
      <div class="wd-stat"><div class="wd-stat-label">Min</div><div class="wd-stat-value">${stats.min}p</div></div>
      <div class="wd-stat"><div class="wd-stat-label">P25</div><div class="wd-stat-value">${stats.p25}p</div></div>
      <div class="wd-stat wd-stat-primary"><div class="wd-stat-label">Median</div><div class="wd-stat-value">${stats.median}p</div></div>
      <div class="wd-stat"><div class="wd-stat-label">P75</div><div class="wd-stat-value">${stats.p75}p</div></div>
      <div class="wd-stat"><div class="wd-stat-label">P90</div><div class="wd-stat-value">${stats.p90}p</div></div>
      <div class="wd-stat"><div class="wd-stat-label">Max</div><div class="wd-stat-value">${stats.max}p</div></div>
    </div>` : `<div class="wd-empty">No live market data cached for this weapon yet.</div>`}

    <div class="wd-section">
      <div class="wd-section-head"><h3>Live listings that match your filters</h3><span class="small">${opportunities.length} total</span></div>
      <div class="wd-opps">${opportunitiesHtml}</div>
    </div>

    <div class="wd-section">
      <div class="wd-section-head"><h3>Most common stat combos <span class="small">(30-day history)</span></h3><span class="small">${topSignatures.length} known</span></div>
      <div class="wd-signatures">${signaturesHtml}</div>
    </div>
  `;

  for (const el of elements.wdContent.querySelectorAll(".wd-opp")) {
    el.addEventListener("click", () => {
      const url = el.getAttribute("data-url");
      if (url) window.open(url, "_blank", "noopener");
    });
  }
}

function parseSignature(sig) {
  if (!sig) return [[], []];
  const [posPart = "", negPart = ""] = sig.split("|");
  const positives = posPart.split("+").filter(Boolean);
  const negatives = negPart.split("-").filter(Boolean);
  return [positives, negatives];
}

// -------- Weapon browser (now driven by spotlight only, but keep function) --------
async function loadWeaponBrowser() { /* deprecated; spotlight handles search now */ }

// -------- Filters form --------

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
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    else sortState = { key, direction: key === "weaponName" ? "asc" : "desc" };
    void refreshDerived();
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

// -------- Settings modal (merges data source + MCP) --------

function openSettingsModal(defaultTab = "data") {
  if (!elements.settingsModal) return;
  elements.settingsModal.hidden = false;
  document.body.classList.add("modal-open");
  switchSettingsTab(defaultTab);
  populateMcp();
}

function closeSettingsModal() {
  if (!elements.settingsModal) return;
  elements.settingsModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function switchSettingsTab(tabName) {
  for (const tab of elements.settingsTabs) {
    tab.classList.toggle("active", tab.dataset.settingsTab === tabName);
  }
  for (const panel of elements.settingsPanels) {
    panel.hidden = panel.dataset.settingsPanel !== tabName;
  }
}

for (const tab of elements.settingsTabs) {
  tab.addEventListener("click", () => switchSettingsTab(tab.dataset.settingsTab));
}

if (elements.settingsButton) {
  elements.settingsButton.addEventListener("click", () => openSettingsModal("data"));
}
if (elements.settingsModal) {
  elements.settingsModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.modalClose !== undefined) closeSettingsModal();
  });
  elements.settingsModal.querySelectorAll(".mcp-copy").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-copy-target");
      const target = targetId ? document.getElementById(targetId) : null;
      if (target) copyText(target.textContent ?? "", button);
    });
  });
}

function populateMcp() {
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
  void loadMcpToolList();
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
    elements.mcpToolList.innerHTML = `<li class="small">Failed: ${escapeHtml(error.message)}</li>`;
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
    elements.mcpTestResult.innerHTML = sessionOk
      ? `<span class="good">✓ SSE handshake succeeded — endpoint event received.</span>`
      : `<span class="warn">Handshake ended without an endpoint event.</span>`;
  } catch (error) {
    elements.mcpTestResult.innerHTML = error.name === "AbortError"
      ? `<span class="good">✓ Session opened.</span>`
      : `<span class="warn">Handshake failed: ${escapeHtml(error.message)}</span>`;
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

if (elements.mcpTestButton) elements.mcpTestButton.addEventListener("click", testMcpConnection);

// -------- Data source toggle --------

function updateModeUi(activeMode, state) {
  const normalized = activeMode === "remote" ? "remote" : "tiered";
  for (const button of elements.modeButtons) {
    button.classList.toggle("active", button.dataset.mode === normalized);
  }
  if (elements.modeHint) {
    elements.modeHint.textContent = normalized === "remote"
      ? "Reading the CI-published feed. Refreshes every ~45s; no warframe.market traffic from this browser."
      : "Local tiered scan is active. Uses this machine's IP against warframe.market with a token-bucket limiter.";
  }
  if (elements.dataStatusLine && state) {
    elements.dataStatusLine.innerHTML = `<span class="small">${escapeHtml(state.status.lastMessage ?? "")}</span>`;
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

// -------- SSE --------

const events = new EventSource("/events");
events.addEventListener("state", async (event) => {
  render(JSON.parse(event.data));
  await refreshDerived();
});
events.addEventListener("error", () => {
  // silently reconnect
});

loadState().catch((error) => { elements.summary.textContent = error.message; });
setInterval(() => { refreshDerived().catch(() => undefined); }, 60_000);
window.addEventListener("resize", () => {
  const source = applySpotlightFilter(latestEnrichedOpps.length > 0 ? latestEnrichedOpps : latestState?.opportunities ?? []);
  drawChart(source);
});
