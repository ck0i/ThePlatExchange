const elements = {
  topBar: document.getElementById("topBar"),
  leftRail: document.getElementById("leftRail"),
  railToggle: document.getElementById("railToggle"),
  pagePanels: document.querySelectorAll("[data-page-panel]"),
  pageButtons: document.querySelectorAll("[data-page]"),
  railRefresh: document.getElementById("railRefresh"),
  homeRefresh: document.getElementById("homeRefresh"),
  instantRefresh: document.getElementById("instantRefresh"),
  arcaneRefresh: document.getElementById("arcaneRefresh"),
  tickerItems: document.getElementById("tickerItems"),
  liveBadge: document.getElementById("liveBadge"),
  statusMode: document.getElementById("statusMode"),
  footerRefresh: document.getElementById("footerRefresh"),
  footerMcp: document.getElementById("footerMcp"),
  rateBar: document.getElementById("rateBar"),
  rateLabel: document.getElementById("rateLabel"),
  statOpps: document.getElementById("statOpps"),
  statWeapons: document.getElementById("statWeapons"),
  statWeaponsSub: document.getElementById("statWeaponsSub"),
  statAuctions: document.getElementById("statAuctions"),
  statBest: document.getElementById("statBest"),
  statRefresh: document.getElementById("statRefresh"),
  summary: document.getElementById("summary"),
  heatmap: document.getElementById("heatmap"),
  freshOpps: document.getElementById("freshOpps"),
  opps: document.getElementById("opps"),
  weapons: document.getElementById("weapons"),
  chart: document.getElementById("profitChart"),
  chartTip: document.getElementById("chartTip"),
  sortPills: document.getElementById("sortPills"),
  form: document.getElementById("filters"),
  refresh: document.getElementById("refresh"),
  watchlist: document.getElementById("watchlist"),
  minProfit: document.getElementById("minProfit"),
  minRoi: document.getElementById("minRoi"),
  minGroupSize: document.getElementById("minGroupSize"),
  minBuyPrice: document.getElementById("minBuyPrice"),
  maxBuyPrice: document.getElementById("maxBuyPrice"),
  maxSellPrice: document.getElementById("maxSellPrice"),
  instantWinsPanel: document.getElementById("instantWinsPanel"),
  instantList: document.getElementById("instantList"),
  instantPreview: document.getElementById("instantPreview"),
  instantSummary: document.getElementById("instantSummary"),
  arcaneSummary: document.getElementById("arcaneSummary"),
  arcaneBestPack: document.getElementById("arcaneBestPack"),
  arcaneBestPackSub: document.getElementById("arcaneBestPackSub"),
  arcaneDissolveCount: document.getElementById("arcaneDissolveCount"),
  arcaneCoverage: document.getElementById("arcaneCoverage"),
  arcaneCoverageSub: document.getElementById("arcaneCoverageSub"),
  arcaneVosforRate: document.getElementById("arcaneVosforRate"),
  arcanePacks: document.getElementById("arcanePacks"),
  arcaneDissolves: document.getElementById("arcaneDissolves"),
  arcaneMarket: document.getElementById("arcaneMarket"),
  arcaneStrategyButtons: document.querySelectorAll("[data-arcane-strategy]"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  modeHint: document.getElementById("modeHint"),
  dataStatusLine: document.getElementById("dataStatusLine"),
  settingsButton: document.getElementById("settingsButton"),
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
let currentPage = "home";
let expandedOpportunityKey = null;
let copiedOpportunityKey = null;
let opportunityRenderToken = 0;
let opportunityRenderIdleHandle = null;
let heatmapVisibleCount = 9;
let arcaneDissolveVisibleCount = 6;
let arcanePackStrategy = "high_value_maxed";


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

const TIER_COLORS = { A: "#4ade80", B: "#38bdf8", C: "#fbbf24", D: "#f87171" };

const RESULT_BUDGETS = browserResultBudgets();
const IDLE_RENDER_TIMEOUT_MS = 80;
const HEATMAP_SHOW_MORE_BATCH = 9;
const ARCANE_DISSOLVE_SHOW_MORE_BATCH = 6;

const MODE_HINTS = {
  remote: "Reading the CI-published feed. Refreshes without browser-side Warframe.market traffic.",
  tiered: "Tiered local scan is active. Uses the remote seed, then scans uncovered weapons locally.",
  full: "Full local scan is active. This machine scans the whole riven weapon reference with rate limiting.",
};

const ARCANE_RAW_PLAT_STRATEGIES = {
  high_value_maxed: {
    label: "High-value max-out",
    shortLabel: "max-out EV",
    detail: "maxed ≥180p targets",
    empty: "No maxed ≥180p target prices are available for this pack.",
  },
  rank0_bulk: {
    label: "Rank-0 bulk EV",
    shortLabel: "rank-0 EV",
    detail: "sell every roll",
    empty: "No rank-0 prices are available for this pack.",
  },
};

function navigate(page, options = {}) {
  currentPage = page;
  for (const panel of elements.pagePanels) panel.classList.toggle("active", panel.dataset.pagePanel === page);
  for (const button of elements.pageButtons) button.classList.toggle("active", button.dataset.page === page);
  if (page === "settings") {
    populateMcp();
    switchSettingsTab(options.settingsTab ?? "data");
  }
  if (page === "instant") renderInstantWins(latestInstantWins);
  document.querySelector(".page-root")?.scrollTo({ top: 0, behavior: "auto" });
}

for (const button of elements.pageButtons) {
  button.addEventListener("click", () => {
    const page = button.dataset.page;
    if (!page) return;
    navigate(page, { settingsTab: button.dataset.settingsTabTarget });
  });
}

for (const button of elements.arcaneStrategyButtons) {
  button.addEventListener("click", () => {
    const nextStrategy = button.dataset.arcaneStrategy;
    if (!ARCANE_RAW_PLAT_STRATEGIES[nextStrategy]) return;
    arcanePackStrategy = nextStrategy;
    arcaneDissolveVisibleCount = ARCANE_DISSOLVE_SHOW_MORE_BATCH;
    renderArcanes(latestState?.arcanes);
  });
}

if (elements.railToggle) {
  elements.railToggle.addEventListener("click", () => {
    elements.leftRail?.classList.toggle("collapsed");
  });
}

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
    renderOpportunitySurfaces();
    renderInstantWins(latestInstantWins);
    if (latestState) {
      renderTicker(latestState, currentOpportunitySource());
      renderStatusFooter(latestState);
    }
  } catch {
    // Keep the last good UI state while EventSource or the next timer reconnects.
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

  const totalRefWeapons = state.reference?.weapons ?? 0;
  const covered = state.totals?.weaponsWithAuctions ?? 0;
  const best = (state.opportunities ?? []).reduce((winner, opportunity) => !winner || opportunity.expectedProfit > winner.expectedProfit ? opportunity : winner, null);

  if (elements.statOpps) elements.statOpps.textContent = formatNumber(Math.max(state.totals?.opportunities ?? 0, (state.opportunities ?? []).length));
  if (elements.statWeapons) elements.statWeapons.textContent = `${formatNumber(covered)}/${formatNumber(totalRefWeapons)}`;
  if (elements.statWeaponsSub) {
    const running = state.status?.running;
    const scanTotal = state.status?.totalWeapons ?? 0;
    const tierLabel = state.status?.reason && state.status.reason.includes("-") ? state.status.reason.split("-").pop() : null;
    elements.statWeaponsSub.textContent = running
      ? (scanTotal > 0 ? `scanning ${formatNumber(state.status.scannedWeapons)}/${formatNumber(scanTotal)}${tierLabel ? ` (${tierLabel})` : ""}` : "Loading reference data")
      : "Reference coverage";
  }
  if (elements.statAuctions) elements.statAuctions.textContent = formatNumber(state.totals?.auctions ?? 0);
  if (elements.statBest) elements.statBest.textContent = best ? `Best +${best.expectedProfit}◈ spread` : "No best spread yet";
  if (elements.statRefresh) elements.statRefresh.textContent = shortTime(state.status?.finishedAt || state.generatedAt);
  if (elements.summary) elements.summary.textContent = state.status?.lastError ? state.status.lastError : state.status?.lastMessage ?? "Waiting for data.";

  updateModeUi(state.scanMode ?? "tiered", state);
  renderStatusFooter(state);
  renderWeapons(state.weaponSummaries ?? []);
  renderHeatmap(state.weaponSummaries ?? []);
  renderArcanes(state.arcanes);

  if (latestEnrichedOpps.length === 0) renderOpportunitySurfaces();
  renderTicker(state, currentOpportunitySource());
}

function renderOpportunitySurfaces() {
  const filtered = applySpotlightFilter(currentOpportunitySource());
  const sorted = sortedOpportunities(filtered);
  renderOpportunities(sorted);
  renderFreshOpportunities(sorted);
  drawChart(filtered);
  renderHero(sorted[0] ?? currentOpportunitySource()[0] ?? null);
}

function currentOpportunitySource() {
  if (latestEnrichedOpps.length > 0) return latestEnrichedOpps;
  return latestState?.opportunities ?? [];
}

function hydrateControls(state) {
  if (controlsHydrated) return;
  if (!elements.watchlist) return;
  controlsHydrated = true;
  elements.watchlist.value = (state.config?.watchlist ?? []).join("\n");
  elements.minProfit.value = state.config?.minProfit ?? 25;
  elements.minRoi.value = state.config?.minRoi ?? 0.35;
  elements.minGroupSize.value = state.config?.minGroupSize ?? 4;
  elements.minBuyPrice.value = state.config?.minBuyPrice == null ? "" : state.config.minBuyPrice;
  elements.maxBuyPrice.value = state.config?.maxBuyPrice == null ? "" : state.config.maxBuyPrice;
  elements.maxSellPrice.value = state.config?.maxSellPrice == null ? "" : state.config.maxSellPrice;
  for (const checkbox of document.querySelectorAll(".status")) checkbox.checked = (state.config?.statuses ?? []).includes(checkbox.value);
}

function renderStatusFooter(state) {
  const mode = state.scanMode ?? "tiered";
  if (elements.statusMode) elements.statusMode.textContent = mode === "remote" ? "Remote feed" : mode === "full" ? "Full local scan" : "Tiered local scan";
  if (elements.footerRefresh) elements.footerRefresh.textContent = shortTime(state.status?.finishedAt || state.generatedAt);
  if (elements.footerMcp) elements.footerMcp.textContent = "MCP ready";
  const total = Math.max(1, state.status?.totalWeapons ?? 0);
  const scanned = Math.max(0, state.status?.scannedWeapons ?? 0);
  const progress = state.status?.running ? Math.min(100, Math.round((scanned / total) * 100)) : 100;
  if (elements.rateBar) elements.rateBar.style.width = `${progress}%`;
  if (elements.rateLabel) elements.rateLabel.textContent = state.status?.running ? `${progress}%` : "idle";
  elements.liveBadge?.classList.toggle("warn", Boolean(state.status?.lastError));
}

function renderTicker(state, opportunities) {
  if (!elements.tickerItems) return;
  const items = opportunities.slice(0, 10);
  if (items.length === 0) {
    elements.tickerItems.innerHTML = `<span class="ticker-item"><span class="ticker-dot"></span>${escapeHtml(state.status?.lastMessage ?? "Waiting for market feed…")}</span>`;
    return;
  }
  const html = items.map((opportunity, index) => {
    const delta = Math.round((opportunity.roi ?? 0) * 100);
    const trendClass = delta >= 0 ? "ticker-up" : "ticker-down";
    return `<span class="ticker-item"><button type="button" data-ticker-index="${index}"><span class="ticker-dot"></span>${escapeHtml(opportunity.weaponName)} <span class="ticker-price">${opportunity.buyPrice}◈ → ${opportunity.conservativeSellPrice ?? opportunity.targetSellPrice}◈</span> <span class="${trendClass}">+${opportunity.expectedProfit}◈ ${delta}%</span></button></span>`;
  }).join("");
  elements.tickerItems.innerHTML = html + html;
  for (const button of elements.tickerItems.querySelectorAll("[data-ticker-index]")) {
    button.addEventListener("click", () => {
      const opportunity = items[Number(button.dataset.tickerIndex)];
      if (opportunity?.weaponSlug) openWeaponDetail(opportunity.weaponSlug);
    });
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
  const tier = opportunity.quality?.tier ?? tierFromScore(opportunity.score);
  elements.heroTier.textContent = tier;
  elements.heroTier.className = `tier-badge tier-${tier}`;
  elements.heroRiven.textContent = opportunity.rivenName;
  elements.heroBuy.textContent = `${opportunity.buyPrice}◈`;
  elements.heroTarget.textContent = `${opportunity.conservativeSellPrice ?? opportunity.targetSellPrice}◈`;
  elements.heroTarget.title = `Median target · p75 aggressive ${opportunity.targetSellPrice}◈`;
  elements.heroProfit.textContent = `+${opportunity.expectedProfit}◈ profit`;
  elements.heroRoi.textContent = `${Math.round((opportunity.roi ?? 0) * 100)}% ROI`;
  elements.heroComps.textContent = `${opportunity.comparableListings} comparable listing${opportunity.comparableListings === 1 ? "" : "s"}`;
  elements.heroSignals.innerHTML = topSignalsFor(opportunity, 3).map(signalChip).join("");
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

function signalChip(signal) {
  return `<span class="signal signal-${escapeHtml(signal)}">${escapeHtml(signal.replace(/_/g, " "))}</span>`;
}

function browserResultBudgets() {
  const memory = Number(navigator.deviceMemory ?? 4);
  const cores = Number(navigator.hardwareConcurrency ?? 4);
  const constrained = (memory > 0 && memory <= 2) || (cores > 0 && cores <= 2);
  const highCapacity = memory >= 8 && cores >= 8;
  return {
    opportunityInitial: constrained ? 90 : highCapacity ? 240 : 160,
    opportunityBatch: constrained ? 60 : highCapacity ? 180 : 100,
    opportunityCards: constrained ? 500 : highCapacity ? 2400 : 1200,
    chartPoints: constrained ? 1200 : highCapacity ? 8000 : 3500,
    arcaneCards: constrained ? 16 : highCapacity ? 64 : 32,
    arcaneRecommendations: constrained ? 300 : highCapacity ? 1600 : 900,
    arcaneRows: constrained ? 350 : highCapacity ? 1800 : 1000,
    weaponCards: constrained ? 300 : highCapacity ? 1200 : 700,
    heatmapCards: constrained ? 48 : highCapacity ? 160 : 96,
    weaponDetailOpportunities: constrained ? 24 : 50,
  };
}

function scheduleIdleRender(callback) {
  if (typeof window.requestIdleCallback === "function") return window.requestIdleCallback(callback, { timeout: IDLE_RENDER_TIMEOUT_MS });
  return window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 16);
}

function cancelIdleRender(handle) {
  if (handle == null) return;
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}

function resultLimitNote(label, shown, total) {
  if (shown >= total) return "";
  return `<div class="result-limit-note">Showing ${formatNumber(shown)} of ${formatNumber(total)} ${escapeHtml(label)}. Narrow search or filters to inspect the rest without overloading the browser.</div>`;
}

function chartRenderItems(opportunities) {
  if (!Array.isArray(opportunities)) return [];
  if (opportunities.length <= RESULT_BUDGETS.chartPoints) return opportunities;
  const sampled = [];
  const step = opportunities.length / RESULT_BUDGETS.chartPoints;
  for (let index = 0; index < RESULT_BUDGETS.chartPoints; index += 1) {
    const item = opportunities[Math.floor(index * step)];
    if (item) sampled.push(item);
  }
  return sampled;
}


function renderOpportunities(opportunities) {
  if (!elements.opps) return;
  cancelIdleRender(opportunityRenderIdleHandle);
  opportunityRenderIdleHandle = null;
  const renderToken = ++opportunityRenderToken;
  elements.opps.textContent = "";
  if (opportunities.length === 0) {
    elements.opps.innerHTML = `<div class="empty-state">No opportunities match. Adjust filters, clear the search, or wait for the next scan.</div>`;
    updateSortControls();
    return;
  }

  const total = opportunities.length;
  const renderLimit = Math.min(total, RESULT_BUDGETS.opportunityCards);
  let cursor = 0;
  const appendBatch = (deadline, firstBatch = false) => {
    if (renderToken !== opportunityRenderToken) return;
    const fragment = document.createDocumentFragment();
    const batchTarget = firstBatch ? RESULT_BUDGETS.opportunityInitial : RESULT_BUDGETS.opportunityBatch;
    let appended = 0;
    while (cursor < renderLimit && appended < batchTarget) {
      if (!firstBatch && appended > 12 && !deadline.didTimeout && deadline.timeRemaining() < 3) break;
      fragment.appendChild(createOpportunityCard(opportunities[cursor], cursor));
      cursor += 1;
      appended += 1;
    }
    elements.opps.appendChild(fragment);
    if (cursor < renderLimit) {
      opportunityRenderIdleHandle = scheduleIdleRender((nextDeadline) => appendBatch(nextDeadline, false));
      return;
    }
    opportunityRenderIdleHandle = null;
    const note = resultLimitNote("opportunities", renderLimit, total);
    if (note) elements.opps.insertAdjacentHTML("beforeend", note);
  };

  appendBatch({ didTimeout: true, timeRemaining: () => 0 }, true);
  updateSortControls();
}

function createOpportunityCard(opportunity, index) {
  const key = opportunityKey(opportunity);
  const tier = opportunity.quality?.tier ?? tierFromScore(opportunity.score);
  const expanded = expandedOpportunityKey === key;
  const topSignals = topSignalsFor(opportunity, 3);
  const positives = (opportunity.positives ?? []).slice(0, 4).map((p) => `<span class="flag good">+${escapeHtml(p)}</span>`).join("");
  const negatives = (opportunity.negatives ?? []).slice(0, 2).map((n) => `<span class="flag bad">-${escapeHtml(n)}</span>`).join("");
  const card = document.createElement("article");
  card.className = `opp-card tier-${tier}${expanded ? " expanded" : ""}`;
  card.dataset.key = key;
  card.innerHTML = `
    <button class="opp-row" type="button" data-action="toggle" title="${escapeHtml(opportunity.seller?.ingameName ?? "seller")} · ${escapeHtml(opportunity.status)} · ${opportunity.comparableListings} comparables · score ${Math.round(opportunity.score ?? 0)}">
      <span class="opp-rank">${String(index + 1).padStart(2, "0")}</span>
      <span class="opp-main" data-action="weapon" data-weapon-slug="${escapeHtml(opportunity.weaponSlug)}">
        ${weaponThumb(opportunity.imageName, opportunity.weaponName, "sm")}
        <span class="opp-title"><strong>${escapeHtml(opportunity.weaponName)}</strong><span>${escapeHtml(opportunity.rivenName)}</span></span>
      </span>
      <span class="opp-metric"><span>Buy</span><strong class="buy">${opportunity.buyPrice}◈</strong></span>
      <span class="opp-metric"><span>Sell</span><strong class="sell">${opportunity.conservativeSellPrice ?? opportunity.targetSellPrice}◈</strong></span>
      <span class="opp-metric"><span>Profit</span><strong class="profit">+${opportunity.expectedProfit}◈</strong></span>
      <span class="opp-metric"><span>ROI</span><strong class="roi">${Math.round((opportunity.roi ?? 0) * 100)}%</strong></span>
      <span class="opp-metric"><span>Conf</span>${confidenceBar(opportunity.confidence ?? 0)}</span>
      <span class="opp-age">${timeAgo(opportunity.updated)}</span>
      <span class="opp-chevron">⌄</span>
    </button>
    ${expanded ? `<div class="opp-detail">
      <div>
        <h3>Signals and listing context</h3>
        <div class="signals">${topSignals.map(signalChip).join("") || `<span class="signal">no quality flags</span>`}</div>
        <div class="opp-flags">${positives}${negatives}<span class="tier-badge tier-${tier}">${tier}</span><span class="chip">${escapeHtml(opportunity.groupType)}</span><span class="chip">${opportunity.comparableListings} comps</span><span class="chip">seller ${escapeHtml(opportunity.seller?.ingameName ?? "unknown")}</span><span class="chip">${escapeHtml(opportunity.status)}</span></div>
        <p class="small">Median target ${opportunity.conservativeSellPrice ?? opportunity.targetSellPrice}◈ · p75 aggressive ${opportunity.targetSellPrice}◈ · score ${Math.round(opportunity.score ?? 0)}/100 · confidence ${Math.round((opportunity.confidence ?? 0) * 100)}%.</p>
      </div>
      <div class="opp-actions">
        <button class="primary-button" type="button" data-action="open">Open on WFM ↗</button>
        <button class="ghost-button" type="button" data-action="weapon" data-weapon-slug="${escapeHtml(opportunity.weaponSlug)}">Open weapon detail</button>
        <button class="ghost-button" type="button" data-action="copy">${copiedOpportunityKey === key ? "Copied ✓" : "Copy /w to seller"}</button>
      </div>
    </div>` : ""}
  `;
  card.addEventListener("click", (event) => handleOpportunityClick(event, opportunity));
  return card;
}

function handleOpportunityClick(event, opportunity) {
  const target = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
  if (!target) return;
  const action = target.dataset.action;
  if (action === "weapon") {
    event.preventDefault();
    event.stopPropagation();
    openWeaponDetail(target.dataset.weaponSlug || opportunity.weaponSlug);
    return;
  }
  if (action === "open") {
    event.preventDefault();
    event.stopPropagation();
    if (opportunity.url) window.open(opportunity.url, "_blank", "noopener");
    return;
  }
  if (action === "copy") {
    event.preventDefault();
    event.stopPropagation();
    copiedOpportunityKey = opportunityKey(opportunity);
    void copyText(tradeWhisper(opportunity), target).then(() => {
      renderOpportunities(sortedOpportunities(applySpotlightFilter(currentOpportunitySource())));
      setTimeout(() => {
        if (copiedOpportunityKey === opportunityKey(opportunity)) {
          copiedOpportunityKey = null;
          renderOpportunities(sortedOpportunities(applySpotlightFilter(currentOpportunitySource())));
        }
      }, 1600);
    });
    return;
  }
  if (action === "toggle") {
    const key = opportunityKey(opportunity);
    expandedOpportunityKey = expandedOpportunityKey === key ? null : key;
    renderOpportunities(sortedOpportunities(applySpotlightFilter(currentOpportunitySource())));
  }
}

function renderFreshOpportunities(opportunities) {
  if (!elements.freshOpps) return;
  const items = opportunities.slice(0, 5);
  if (items.length === 0) {
    elements.freshOpps.innerHTML = `<div class="empty-state">No fresh opportunities yet.</div>`;
    return;
  }
  elements.freshOpps.textContent = "";
  for (const opportunity of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fresh-card";
    button.innerHTML = `
      ${weaponThumb(opportunity.imageName, opportunity.weaponName, "sm")}
      <span><strong>${escapeHtml(opportunity.weaponName)}</strong><small>${escapeHtml(opportunity.rivenName)}</small></span>
      <span class="fresh-value"><strong>+${opportunity.expectedProfit}◈</strong><small>${Math.round((opportunity.roi ?? 0) * 100)}% ROI</small></span>
    `;
    button.addEventListener("click", () => openWeaponDetail(opportunity.weaponSlug));
    elements.freshOpps.appendChild(button);
  }
}

function renderInstantWins(items) {
  const wins = Array.isArray(items) ? items : [];
  if (elements.instantSummary) {
    elements.instantSummary.textContent = wins.length === 0
      ? "No same-signature undervalued listings right now."
      : `${wins.length} listing${wins.length === 1 ? "" : "s"} priced below their same-signature p25.`;
  }
  renderInstantPreview(wins);
  if (!elements.instantList) return;
  elements.instantList.textContent = "";
  if (wins.length === 0) {
    elements.instantList.innerHTML = `<div class="empty-state">No instant wins match the current cache. Refresh or widen filters.</div>`;
    return;
  }
  for (const item of wins) {
    const opportunity = item.opportunity;
    const value = item.signature_value ?? {};
    const key = opportunityKey(opportunity);
    const card = document.createElement("article");
    card.className = "instant-card";
    card.innerHTML = `
      <div class="instant-main">
        ${weaponThumb(opportunity.imageName, opportunity.weaponName, "md")}
        <div><strong>${escapeHtml(opportunity.weaponName)}</strong><span>${escapeHtml(opportunity.rivenName)} · ${escapeHtml(opportunity.seller?.ingameName ?? "seller")} · ${timeAgo(opportunity.updated)}</span></div>
      </div>
      <div class="instant-stat"><span>Listed</span><strong class="listed">${opportunity.buyPrice}◈</strong></div>
      <div class="instant-stat"><span>p25 value</span><strong>${Math.round(value.p25 ?? 0)}◈</strong></div>
      <div class="instant-stat hide-mobile"><span>Undervalue</span><strong class="uplift">+${Math.round(item.expected_uplift ?? 0)}◈</strong></div>
      <div class="instant-actions"><button class="ghost-button" data-action="open" type="button">Open</button><button class="primary-button" data-action="copy" type="button">${copiedOpportunityKey === key ? "Copied ✓" : "Copy /w"}</button></div>
    `;
    card.addEventListener("click", (event) => {
      const action = event.target instanceof HTMLElement ? event.target.closest("[data-action]")?.dataset.action : null;
      if (!action) return;
      if (action === "open" && opportunity.url) window.open(opportunity.url, "_blank", "noopener");
      if (action === "copy") {
        copiedOpportunityKey = key;
        void copyText(tradeWhisper(opportunity), event.target.closest("button")).then(() => {
          renderInstantWins(latestInstantWins);
          setTimeout(() => {
            if (copiedOpportunityKey === key) {
              copiedOpportunityKey = null;
              renderInstantWins(latestInstantWins);
            }
          }, 1600);
        });
      }
    });
    elements.instantList.appendChild(card);
  }
}

function renderInstantPreview(items) {
  if (!elements.instantPreview) return;
  const wins = items.slice(0, 3);
  elements.instantPreview.textContent = "";
  if (wins.length === 0) {
    elements.instantPreview.innerHTML = `<div class="empty-state">No instant wins right now.</div>`;
    return;
  }
  for (const item of wins) {
    const opportunity = item.opportunity;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "instant-preview-card";
    card.innerHTML = `<strong>${escapeHtml(opportunity.weaponName)}</strong><div class="small">${escapeHtml(opportunity.rivenName)} · buy ${opportunity.buyPrice}◈ · uplift +${Math.round(item.expected_uplift ?? 0)}◈</div>`;
    card.addEventListener("click", () => navigate("instant"));
    elements.instantPreview.appendChild(card);
  }
}

function renderArcanes(arcanes) {
  if (!elements.arcanePacks) return;
  const strategy = ARCANE_RAW_PLAT_STRATEGIES[arcanePackStrategy] ? arcanePackStrategy : "high_value_maxed";
  arcanePackStrategy = strategy;
  updateArcaneStrategyButtons(strategy);
  const strategyCopy = ARCANE_RAW_PLAT_STRATEGIES[strategy];
  const summaries = arcanes?.summaries ?? [];
  const summaryBySlug = new Map(summaries.map((summary) => [summary.slug, summary]));
  const packs = [...(arcanes?.packs ?? [])].sort((left, right) => compareArcanePacksForStrategy(left, right, strategy, summaryBySlug));
  const recommendations = arcaneRecommendationsForStrategy(arcanes, strategy, packs, summaryBySlug).sort((left, right) => {
    const actionScore = { dissolve: 0, hold: 1, sell: 2 };
    const leftScore = actionScore[left.action] ?? 3;
    const rightScore = actionScore[right.action] ?? 3;
    if (leftScore !== rightScore) return leftScore - rightScore;
    return (right.deltaPlat ?? 0) - (left.deltaPlat ?? 0);
  });
  const bestPack = packs[0] ?? null;
  const bestMetric = bestPack ? arcaneStrategyMetric(bestPack, strategy, summaryBySlug) : null;
  const dissolveCount = recommendations.filter((entry) => entry.action === "dissolve").length;
  const scanned = summaries.filter((entry) => entry.lastScannedAt).length;
  const candidateRates = recommendations.filter((entry) => entry.action === "dissolve" && entry.sellValuePerVosfor > 0).map((entry) => entry.sellValuePerVosfor);
  const vosforFloor = candidateRates.length > 0 ? Math.min(...candidateRates) : null;

  if (elements.arcaneSummary) {
    const baseMessage = arcanes?.status?.lastMessage ?? (arcanes ? `Tracking ${formatNumber(arcanes.reference?.items ?? summaries.length)} Arcanes across ${formatNumber(arcanes.reference?.packs ?? packs.length)} Vosfor packs.` : "Waiting for Arcane scan.");
    elements.arcaneSummary.textContent = arcanes ? `${baseMessage} Raw Plat Output: ${strategyCopy.label} (${strategyCopy.detail}).` : baseMessage;
  }
  if (elements.arcaneBestPack) elements.arcaneBestPack.textContent = bestPack && bestMetric ? `${Math.round(bestMetric.expectedPlat)}◈` : "—";
  if (elements.arcaneBestPackSub) {
    elements.arcaneBestPackSub.textContent = bestPack && bestMetric
      ? `${bestPack.packName} · ${(bestMetric.expectedPlatPerVosfor ?? 0).toFixed(3)}◈/Vosfor · ${formatArcanePercent(bestMetric.chanceAtLeastOneTarget)} hit/pack · ${Math.round((bestMetric.confidence ?? 0) * 100)}% confidence`
      : "No pack scan yet";
  }
  if (elements.arcaneDissolveCount) elements.arcaneDissolveCount.textContent = formatNumber(dissolveCount);
  if (elements.arcaneCoverage) elements.arcaneCoverage.textContent = `${formatNumber(scanned)}/${formatNumber(arcanes?.reference?.items ?? summaries.length)}`;
  if (elements.arcaneCoverageSub) elements.arcaneCoverageSub.textContent = `${formatNumber(arcanes?.totals?.orders ?? 0)} visible WFM orders cached`;
  if (elements.arcaneVosforRate) elements.arcaneVosforRate.textContent = vosforFloor === null ? "—" : `${vosforFloor.toFixed(2)}◈`;

  const visiblePacks = packs.slice(0, RESULT_BUDGETS.arcaneCards);
  elements.arcanePacks.innerHTML = packs.length === 0 ? `<div class="empty-state">No Vosfor pack valuations yet.</div>` : visiblePacks.map((pack, index) => {
    const metric = arcaneStrategyMetric(pack, strategy, summaryBySlug);
    const meta = strategy === "high_value_maxed"
      ? `${formatNumber(metric.targetCount ?? 0)} maxed ≥${formatNumber(pack.highValueThreshold ?? 180)}p targets · ${formatArcanePercent(metric.chanceAtLeastOneTarget)} hit/pack · ${Math.round((metric.confidence ?? 0) * 100)}% confidence`
      : `${Math.round((metric.coveragePct ?? pack.coveragePct ?? 0) * 100)}% priced · ${Math.round((metric.confidence ?? pack.confidence ?? 0) * 100)}% confidence · ${formatNumber(pack.missingPriceCount ?? 0)} missing prices`;
    return `
    <article class="arcane-pack-card">
      <div class="arcane-card-rank">#${index + 1}</div>
      <div class="arcane-card-body">
        <div class="arcane-card-title">${escapeHtml(pack.packName)} <span>${escapeHtml(strategyCopy.label)}</span></div>
        <div class="arcane-card-value">${Math.round(metric.expectedPlat)}◈ ${escapeHtml(strategyCopy.shortLabel)} <span>${(metric.expectedPlatPerVosfor ?? 0).toFixed(3)}◈/Vosfor</span></div>
        <div class="arcane-card-meta">${meta}</div>
        <div class="arcane-drop-row">${arcaneDropChips(pack, strategy, summaryBySlug)}</div>
      </div>
    </article>`;
  }).join("") + resultLimitNote("Vosfor packs", visiblePacks.length, packs.length);

  const recommendationLimit = Math.min(recommendations.length, RESULT_BUDGETS.arcaneRecommendations, arcaneDissolveVisibleCount);
  const visibleRecommendations = recommendations.slice(0, recommendationLimit);
  const dissolveMore = recommendationLimit < recommendations.length && recommendationLimit < RESULT_BUDGETS.arcaneRecommendations
    ? `<button class="show-more-button" type="button" data-show-more-dissolves>Show ${formatNumber(Math.min(ARCANE_DISSOLVE_SHOW_MORE_BATCH, recommendations.length - recommendationLimit))} more</button>`
    : resultLimitNote("dissolve recommendations", recommendationLimit, recommendations.length);
  elements.arcaneDissolves.innerHTML = recommendations.length === 0 ? `<div class="empty-state">No dissolve recommendations yet for ${escapeHtml(strategyCopy.label)}.</div>` : visibleRecommendations.map((entry) => `
    <article class="arcane-dissolve-card ${entry.action}">
      <div>
        <div class="arcane-card-title">${escapeHtml(entry.name)} <span>R${entry.rank}</span></div>
        <div class="arcane-card-meta">${entry.sellPrice}◈ sale · ${entry.dissolutionVosfor} Vosfor · ${entry.bestPackName} · ${escapeHtml(strategyCopy.shortLabel)}</div>
      </div>
      <div class="arcane-action">
        <strong>${escapeHtml(entry.action)}</strong>
        <span>${entry.deltaPlat >= 0 ? "+" : ""}${entry.deltaPlat.toFixed(1)}◈ EV</span>
      </div>
    </article>`).join("") + dissolveMore;
  elements.arcaneDissolves.querySelector("[data-show-more-dissolves]")?.addEventListener("click", () => {
    arcaneDissolveVisibleCount += ARCANE_DISSOLVE_SHOW_MORE_BATCH;
    renderArcanes(arcanes);
  });

  const marketRows = [...summaries].sort((left, right) => {
    const leftPrice = left.rankMax?.sell?.p25 ?? left.rank0?.sell?.p25 ?? 0;
    const rightPrice = right.rankMax?.sell?.p25 ?? right.rank0?.sell?.p25 ?? 0;
    return rightPrice - leftPrice;
  });
  const visibleMarketRows = marketRows.slice(0, RESULT_BUDGETS.arcaneRows);
  elements.arcaneMarket.innerHTML = marketRows.length === 0 ? `<div class="empty-state">No Arcane market rows yet.</div>` : visibleMarketRows.map((entry) => {
    const maxRank = entry.rankMax ?? null;
    const rank0 = entry.rank0 ?? null;
    const sellPrice = maxRank?.sell?.p25 ?? rank0?.sell?.p25 ?? null;
    const marketDepth = (entry.onlineSellListings ?? 0) + (entry.onlineBuyListings ?? 0);
    return `
      <article class="arcane-market-row">
        <div class="arcane-name-cell">${arcaneThumb(entry)}<div><strong>${escapeHtml(entry.name)}</strong><span>${escapeHtml(entry.rarity)} · ${entry.dissolutionVosfor ?? "?"} Vosfor</span></div></div>
        <div><span class="small-label">R0 p25</span><strong>${rank0?.sell?.p25 == null ? "—" : `${rank0.sell.p25}◈`}</strong></div>
        <div><span class="small-label">R${entry.maxRank} p25</span><strong>${sellPrice == null ? "—" : `${sellPrice}◈`}</strong></div>
        <div><span class="small-label">Depth</span><strong>${formatNumber(marketDepth)}</strong></div>
      </article>`;
  }).join("") + resultLimitNote("Arcane market rows", visibleMarketRows.length, marketRows.length);
}

function updateArcaneStrategyButtons(strategy) {
  for (const button of elements.arcaneStrategyButtons) {
    const active = button.dataset.arcaneStrategy === strategy;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function arcaneRecommendationsForStrategy(arcanes, strategy, packs, summaryBySlug) {
  const existing = arcanes?.dissolveRecommendationsByStrategy?.[strategy];
  if (strategy !== "high_value_maxed") return [...(existing ?? arcanes?.dissolveRecommendations ?? [])];
  const bestPack = packs.find((pack) => arcaneStrategyMetric(pack, strategy, summaryBySlug).expectedPlatPerVosfor > 0);
  if (!bestPack) return [...(existing ?? [])];
  const bestMetric = arcaneStrategyMetric(bestPack, strategy, summaryBySlug);
  const existingLooksUsable = existing && existing.length > 0 && existing.some((entry) => Number(entry.rollValuePerVosfor ?? 0) > 0 || Number(entry.estimatedRollValue ?? 0) > 0);
  if (existingLooksUsable) return [...existing];
  return [...summaryBySlug.values()].flatMap((summary) => {
    const sellPrice = arcaneRank0SellPrice(summary);
    const dissolutionVosfor = Number(summary.dissolutionVosfor ?? 0);
    if (!sellPrice || dissolutionVosfor <= 0) return [];
    const estimatedRollValue = roundUi(dissolutionVosfor * bestMetric.expectedPlatPerVosfor, 3);
    const deltaPlat = roundUi(estimatedRollValue - sellPrice, 3);
    const action = deltaPlat > Math.max(2, sellPrice * 0.12) && bestMetric.confidence >= 0.45
      ? "dissolve"
      : deltaPlat < -Math.max(2, sellPrice * 0.10)
      ? "sell"
      : "hold";
    return [{
      slug: summary.slug,
      name: summary.name,
      rank: 0,
      sellPrice,
      dissolutionVosfor,
      bestPackId: bestPack.packId,
      bestPackName: bestPack.packName,
      estimatedRollValue,
      sellValuePerVosfor: roundUi(sellPrice / dissolutionVosfor, 5),
      rollValuePerVosfor: bestMetric.expectedPlatPerVosfor,
      deltaPlat,
      action,
      strategy,
      confidence: bestMetric.confidence,
      reasons: [],
      url: summary.url,
    }];
  });
}

function arcaneStrategyMetric(pack, strategy, summaryBySlug = new Map()) {
  const metric = pack.strategyMetrics?.[strategy];
  if (strategy === "high_value_maxed") {
    const derived = derivedHighValueMetric(pack, summaryBySlug);
    if (!metric) return derived;
    if ((derived.targetCount ?? 0) > (metric.targetCount ?? 0) || (derived.expectedPlat ?? 0) > (metric.expectedPlat ?? 0)) return derived;
    return metric;
  }
  if (metric) return metric;
  return {
    expectedPlat: Number(pack.expectedPlat ?? 0),
    expectedPlatPerVosfor: Number(pack.expectedPlatPerVosfor ?? 0),
    confidence: Number(pack.confidence ?? 0),
    coveragePct: Number(pack.coveragePct ?? 0),
    targetCount: (pack.topDrops ?? []).length,
    chanceAtLeastOneTarget: 1,
    expectedTargetCopies: Number(pack.rewardsPerPack ?? 0),
  };
}

function derivedHighValueMetric(pack, summaryBySlug) {
  if (Number(pack.expectedHighValueMaxedPlatPerVosfor ?? 0) > 0 || Number(pack.highValueTargetCount ?? 0) > 0) {
    return {
      expectedPlat: Number(pack.expectedHighValueMaxedPlat ?? 0),
      expectedPlatPerVosfor: Number(pack.expectedHighValueMaxedPlatPerVosfor ?? 0),
      confidence: Number(pack.highValueConfidence ?? 0),
      coveragePct: Number(pack.maxRankCoveragePct ?? 0),
      targetCount: Number(pack.highValueTargetCount ?? 0),
      chanceAtLeastOneTarget: Number(pack.chanceAtLeastOneHighValue ?? 0),
      expectedTargetCopies: Number(pack.expectedHighValueCopies ?? 0),
    };
  }
  const drops = pack.topDrops ?? [];
  const rewardsPerPack = Number(pack.rewardsPerPack ?? 3);
  const threshold = Number(pack.highValueThreshold ?? 180);
  let expectedPlat = 0;
  let highValueChance = 0;
  let pricedCount = 0;
  let targetCount = 0;
  let chanceMass = 0;
  for (const drop of drops) {
    chanceMass += Number(drop.chance ?? 0);
    const derived = deriveHighValueDrop(drop, summaryBySlug, threshold, rewardsPerPack);
    if (derived.maxRankPrice !== null) pricedCount += 1;
    if (!derived.highValueTarget) continue;
    targetCount += 1;
    highValueChance += Number(drop.chance ?? 0);
    expectedPlat += derived.expectedHighValueMaxedPlat;
  }
  const coveragePct = drops.length === 0 ? 0 : pricedCount / drops.length;
  const confidence = Math.max(0, Math.min(1, coveragePct * Math.min(1, chanceMass)));
  return {
    expectedPlat: roundUi(expectedPlat, 3),
    expectedPlatPerVosfor: roundUi(expectedPlat / Number(pack.costVosfor ?? 200), 5),
    confidence: roundUi(confidence, 4),
    coveragePct: roundUi(coveragePct, 4),
    targetCount,
    chanceAtLeastOneTarget: roundUi(1 - Math.pow(1 - Math.max(0, Math.min(1, highValueChance)), rewardsPerPack), 5),
    expectedTargetCopies: roundUi(rewardsPerPack * highValueChance, 4),
  };
}

function compareArcanePacksForStrategy(left, right, strategy, summaryBySlug = new Map()) {
  const leftMetric = arcaneStrategyMetric(left, strategy, summaryBySlug);
  const rightMetric = arcaneStrategyMetric(right, strategy, summaryBySlug);
  if ((rightMetric.expectedPlatPerVosfor ?? 0) !== (leftMetric.expectedPlatPerVosfor ?? 0)) return (rightMetric.expectedPlatPerVosfor ?? 0) - (leftMetric.expectedPlatPerVosfor ?? 0);
  if ((rightMetric.chanceAtLeastOneTarget ?? 0) !== (leftMetric.chanceAtLeastOneTarget ?? 0)) return (rightMetric.chanceAtLeastOneTarget ?? 0) - (leftMetric.chanceAtLeastOneTarget ?? 0);
  if ((rightMetric.confidence ?? 0) !== (leftMetric.confidence ?? 0)) return (rightMetric.confidence ?? 0) - (leftMetric.confidence ?? 0);
  return (rightMetric.expectedPlat ?? 0) - (leftMetric.expectedPlat ?? 0);
}

function arcaneDropChips(pack, strategy, summaryBySlug = new Map()) {
  const strategyCopy = ARCANE_RAW_PLAT_STRATEGIES[strategy];
  const drops = [...(pack.topDrops ?? [])];
  const ranked = strategy === "high_value_maxed"
    ? drops
      .map((drop) => ({ ...drop, ...deriveHighValueDrop(drop, summaryBySlug, Number(pack.highValueThreshold ?? 180), Number(pack.rewardsPerPack ?? 3)) }))
      .filter((drop) => drop.highValueTarget)
      .sort((left, right) => (right.expectedHighValueMaxedPlat ?? 0) - (left.expectedHighValueMaxedPlat ?? 0))
    : drops.filter((drop) => drop.priceUsed != null).sort((left, right) => (right.expectedPlat ?? 0) - (left.expectedPlat ?? 0));
  const visibleDrops = ranked.slice(0, 8);
  if (visibleDrops.length === 0) return `<span>${escapeHtml(strategyCopy.empty)}</span>`;
  return visibleDrops.map((drop) => {
    if (strategy === "high_value_maxed") {
      const maxPrice = drop.maxRankPrice == null ? "—" : `${Math.round(drop.maxRankPrice)}◈ max`;
      const copies = drop.copiesToMax == null ? "? copies" : `${drop.copiesToMax} copies`;
      return `<span>${escapeHtml(drop.arcaneName)} <b>${formatArcanePercent(drop.chance ?? 0)}</b> ${maxPrice} · ${copies}</span>`;
    }
    return `<span>${escapeHtml(drop.arcaneName)} <b>${formatArcanePercent(drop.chance ?? 0)}</b> ${drop.priceUsed == null ? "—" : `${drop.priceUsed}◈`}</span>`;
  }).join("");
}

function deriveHighValueDrop(drop, summaryBySlug, threshold, rewardsPerPack) {
  const summary = summaryBySlug.get(drop.arcaneSlug);
  const maxRank = drop.maxRank ?? summary?.maxRank ?? null;
  const copiesToMax = drop.copiesToMax ?? (maxRank == null ? null : arcaneCopiesToMax(maxRank));
  const maxRankPrice = drop.maxRankPrice ?? arcaneMaxRankSellPrice(summary);
  const highValueTarget = drop.highValueTarget === true || (maxRankPrice !== null && copiesToMax !== null && maxRankPrice >= threshold);
  return {
    maxRank,
    copiesToMax,
    maxRankPrice,
    highValueTarget,
    expectedHighValueMaxedPlat: highValueTarget && maxRankPrice !== null && copiesToMax !== null
      ? roundUi(rewardsPerPack * Number(drop.chance ?? 0) * (maxRankPrice / copiesToMax), 3)
      : 0,
  };
}

function arcaneMaxRankSellPrice(summary) {
  const value = summary?.rankMax?.sell?.p25 ?? summary?.rankMax?.sell?.median ?? summary?.rankMax?.sell?.min ?? null;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function arcaneRank0SellPrice(summary) {
  const value = summary?.rank0?.sell?.p25 ?? summary?.rank0?.sell?.median ?? summary?.rank0?.sell?.min ?? null;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function arcaneCopiesToMax(maxRank) {
  const rank = Math.max(0, Math.floor(Number(maxRank) || 0));
  return ((rank + 1) * (rank + 2)) / 2;
}

function roundUi(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatArcanePercent(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function arcaneThumb(summary) {
  if (!summary.imageName) return `<span class="arcane-thumb-placeholder">✦</span>`;
  return `<span class="arcane-thumb" style="background-image:url('/img/${encodeURIComponent(summary.imageName)}')" aria-hidden="true"></span>`;
}

function renderWeapons(summaries) {
  if (!elements.weapons) return;
  elements.weapons.textContent = "";
  const visibleSummaries = summaries.slice(0, RESULT_BUDGETS.weaponCards);
  for (const summary of visibleSummaries) {
    const stats = summary.priceStats;
    const card = document.createElement("article");
    card.className = "weapon-card";
    card.dataset.weaponSlug = summary.slug;
    card.innerHTML = `
      <div class="weapon-card-head">${weaponThumb(summary.imageName, summary.name, "sm")}<h3>${escapeHtml(summary.name)}</h3></div>
      <dl>
        <dt>Listings</dt><dd>${formatNumber(summary.directListings ?? summary.listings ?? 0)}</dd>
        <dt>Online</dt><dd>${formatNumber(summary.onlineListings ?? 0)}</dd>
        <dt>Median</dt><dd>${stats ? `${stats.median}◈` : "—"}</dd>
        <dt>P75</dt><dd>${stats ? `${stats.p75}◈` : "—"}</dd>
        <dt>Dispo</dt><dd>${Number(summary.disposition ?? 0).toFixed(2)}</dd>
      </dl>`;
    card.addEventListener("click", () => openWeaponDetail(summary.slug));
    elements.weapons.appendChild(card);
  }
  if (visibleSummaries.length < summaries.length) elements.weapons.insertAdjacentHTML("beforeend", resultLimitNote("weapon summaries", visibleSummaries.length, summaries.length));
  if (summaries.length === 0) elements.weapons.innerHTML = `<div class="empty-state">No weapon market summaries yet.</div>`;
}

function renderHeatmap(summaries) {
  if (!elements.heatmap) return;
  const allItems = summaries.filter((summary) => (summary.directListings ?? summary.listings ?? 0) > 0);
  const visibleLimit = Math.min(allItems.length, RESULT_BUDGETS.heatmapCards, heatmapVisibleCount);
  const items = allItems.slice(0, visibleLimit);
  if (items.length === 0) {
    elements.heatmap.innerHTML = `<div class="empty-state">Market coverage appears after the first feed load.</div>`;
    return;
  }
  const maxListings = Math.max(1, ...allItems.map((summary) => summary.directListings ?? summary.listings ?? 0));
  elements.heatmap.textContent = "";
  for (const summary of items) {
    const listings = summary.directListings ?? summary.listings ?? 0;
    const actionable = summary.actionableListings ?? 0;
    const intensity = Math.min(0.28, 0.06 + (listings / maxListings) * 0.22);
    const positive = actionable > 0;
    const bg = positive ? `rgba(74, 222, 128, ${intensity})` : `rgba(123, 111, 239, ${intensity})`;
    const border = positive ? `rgba(74, 222, 128, ${Math.min(.45, intensity + .18)})` : `rgba(123, 111, 239, ${Math.min(.45, intensity + .18)})`;
    const text = positive ? "#4ade80" : "#a09af8";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "heat-card";
    button.style.background = bg;
    button.style.borderColor = border;
    button.style.flexGrow = String(Math.max(1, listings / Math.max(1, maxListings / 4)));
    button.style.flexBasis = `${Math.max(92, Math.min(190, 70 + listings * 2))}px`;
    button.style.height = `${Math.max(58, Math.min(96, 48 + listings))}px`;
    button.innerHTML = `<strong>${escapeHtml(summary.name)}</strong><span style="color:${text}">${formatNumber(listings)} listings · ${actionable} actionable</span>`;
    button.addEventListener("click", () => openWeaponDetail(summary.slug));
    elements.heatmap.appendChild(button);
  }
  if (visibleLimit < allItems.length && visibleLimit < RESULT_BUDGETS.heatmapCards) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "show-more-button heatmap-more";
    more.textContent = `Show ${formatNumber(Math.min(HEATMAP_SHOW_MORE_BATCH, allItems.length - visibleLimit))} more`;
    more.addEventListener("click", () => {
      heatmapVisibleCount += HEATMAP_SHOW_MORE_BATCH;
      renderHeatmap(summaries);
    });
    elements.heatmap.appendChild(more);
  } else if (visibleLimit < allItems.length) {
    elements.heatmap.insertAdjacentHTML("beforeend", resultLimitNote("market coverage cards", visibleLimit, allItems.length));
  }
}

function drawChart(opportunities) {
  const canvas = elements.chart;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0) canvas.width = Math.floor(rect.width);
  if (rect.height > 0) canvas.height = Math.floor(rect.height);
  const width = canvas.width || 1200;
  const height = canvas.height || 320;
  context.clearRect(0, 0, width, height);

  const marginX = 46;
  const marginY = 28;
  const plotW = width - marginX * 2;
  const plotH = height - marginY * 2;

  context.strokeStyle = "rgba(30, 30, 39, 0.95)";
  context.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = marginY + (i * plotH) / 4;
    context.beginPath(); context.moveTo(marginX, y); context.lineTo(width - marginX, y); context.stroke();
    const x = marginX + (i * plotW) / 4;
    context.beginPath(); context.moveTo(x, marginY); context.lineTo(x, height - marginY); context.stroke();
  }

  scatterHits = [];
  if (!opportunities || opportunities.length === 0) {
    context.fillStyle = "#6b6b7a";
    context.font = "13px Inter, sans-serif";
    context.fillText("Waiting for opportunities…", marginX + 4, height / 2);
    return;
  }

  const chartItems = chartRenderItems(opportunities);
  const maxRoi = Math.max(1, ...opportunities.map((entry) => entry.roi ?? 0));
  const maxProfit = Math.max(1, ...opportunities.map((entry) => entry.expectedProfit ?? 0));

  context.fillStyle = "#6b6b7a";
  context.font = "10px JetBrains Mono, monospace";
  for (let i = 0; i <= 4; i += 1) {
    const roi = Math.round(((i * maxRoi) / 4) * 100);
    context.fillText(`${roi}%`, marginX + (i * plotW) / 4 - 10, height - 8);
    const profit = Math.round(((4 - i) * maxProfit) / 4);
    context.fillText(`${profit}◈`, 4, marginY + (i * plotH) / 4 + 4);
  }
  if (chartItems.length < opportunities.length) {
    context.fillText(`${formatNumber(chartItems.length)}/${formatNumber(opportunities.length)} plotted`, width - marginX - 96, marginY - 8);
  }

  for (const opportunity of chartItems) {
    const roi = Math.max(0, Math.min(maxRoi, opportunity.roi ?? 0));
    const profit = Math.max(0, Math.min(maxProfit, opportunity.expectedProfit ?? 0));
    const cx = marginX + (roi / maxRoi) * plotW;
    const cy = height - marginY - (profit / maxProfit) * plotH;
    const tier = opportunity.quality?.tier ?? tierFromScore(opportunity.score);
    const undervalued = (opportunity.quality?.signals ?? []).includes("undervalued_signature");
    context.fillStyle = TIER_COLORS[tier] ?? TIER_COLORS.D;
    context.beginPath(); context.arc(cx, cy, 4.5, 0, Math.PI * 2); context.fill();
    if (undervalued) {
      context.strokeStyle = "rgba(255,255,255,0.86)"; context.lineWidth = 1.5;
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
      elements.chartTip.style.left = `${Math.min(px, Math.max(20, rect.width - 280))}px`;
      elements.chartTip.style.top = `${py}px`;
      const tier = opportunity.quality?.tier ?? tierFromScore(opportunity.score);
      const signals = topSignalsFor(opportunity, 3).map(signalChip).join("");
      elements.chartTip.innerHTML = `
        <div class="tt-head">
          ${weaponThumb(opportunity.imageName, opportunity.weaponName, "sm")}
          <div>
            <div><span class="tier-badge tier-${tier}">${tier}</span> <strong>${escapeHtml(opportunity.weaponName)}</strong></div>
            <div class="small">${escapeHtml(opportunity.rivenName)}</div>
          </div>
        </div>
        <div class="tt-body">
          <div><span class="price">${opportunity.buyPrice}◈</span> → <strong>${opportunity.targetSellPrice}◈</strong> <span class="profit">+${opportunity.expectedProfit}◈</span> <span class="roi">${Math.round((opportunity.roi ?? 0) * 100)}%</span></div>
          <div class="small">${escapeHtml(opportunity.seller?.ingameName ?? "seller")} · ${escapeHtml(opportunity.status)} · ${opportunity.comparableListings} comps</div>
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
    if (hit?.opportunity?.url) window.open(hit.opportunity.url, "_blank", "noopener");
  });
}

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
    if (needle && !(opportunity.weaponName.toLowerCase().includes(needle) || opportunity.weaponSlug.toLowerCase().includes(needle) || opportunity.rivenName.toLowerCase().includes(needle))) return false;
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
  const text = parsed.text.toLowerCase();
  if (parsed.filter) items.push({ type: "filter", text: parsed.text, filter: parsed.filter });
  for (const page of [
    { name: "Home", sub: "Market command center", page: "home" },
    { name: "Opportunities", sub: "Ranked buy-low / sell-high queue", page: "opportunities" },
    { name: "Instant Wins", sub: "Same-signature undervalued listings", page: "instant" },
    { name: "Arcanes", sub: "Raw Plat Output and dissolve recommendations", page: "arcanes" },
    { name: "Riven Markets", sub: "Weapon cards and price stats", page: "markets" },
    { name: "MCP Connect", sub: "Endpoint, configs, tool list", page: "settings", settingsTab: "mcp" },
    { name: "Data Source", sub: "Remote/tiered/full scan mode", page: "settings", settingsTab: "data" },
  ]) {
    if (text && (page.name.toLowerCase().includes(text) || page.sub.toLowerCase().includes(text))) items.push({ type: "page", ...page });
  }
  if (text && "refresh feed".includes(text)) items.push({ type: "action", name: "Refresh feed", sub: "Force-refresh market data", action: "refresh" });

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
    const arcaneHits = (latestState?.arcanes?.summaries ?? [])
      .filter((entry) => entry.name.toLowerCase().includes(text) || entry.slug.toLowerCase().includes(text))
      .slice(0, 8);
    for (const arcane of arcaneHits) items.push({ type: "arcane", ...arcane });
  }
  spotlightItems = items;
  renderSpotlightResults(items);
}

function renderSpotlightResults(items) {
  if (!elements.spotlightResults) return;
  if (items.length === 0) {
    elements.spotlightResults.hidden = false;
    elements.spotlightResults.innerHTML = `<div class="spotlight-empty">No matches. Try a weapon name, page name, or price filter like <code>&lt; 100p</code>.</div>`;
    return;
  }
  elements.spotlightResults.hidden = false;
  spotlightIndex = -1;
  const groups = groupSpotlightItems(items);
  const html = [];
  let index = 0;
  for (const [label, groupItems] of groups) {
    html.push(`<div class="spotlight-section-label">${label}</div>`);
    for (const item of groupItems) {
      const currentIndex = index;
      item.__index = currentIndex;
      index += 1;
      if (item.type === "filter") {
        const labelText = item.text ? `${item.text} · ` : "";
        html.push(`<button class="spotlight-item spotlight-filter" data-index="${currentIndex}" type="button"><span class="spotlight-glyph">≡</span><div class="spotlight-body"><div class="spotlight-title">Filter opportunities</div><div class="spotlight-sub">${escapeHtml(labelText)}buy price ${item.filter.op} ${item.filter.value}◈</div></div><span class="spotlight-arrow">↵</span></button>`);
      } else if (item.type === "weapon") {
        const priceLine = item.summary?.priceStats ? `median ${item.summary.priceStats.median}◈ · p75 ${item.summary.priceStats.p75}◈` : "no cached price stats";
        html.push(`<button class="spotlight-item spotlight-weapon" data-index="${currentIndex}" type="button">${weaponThumb(item.imageName, item.name, "sm")}<div class="spotlight-body"><div class="spotlight-title">${escapeHtml(item.name)}</div><div class="spotlight-sub">${escapeHtml(item.group)} · dispo ${Number(item.disposition ?? 0).toFixed(2)} · ${escapeHtml(priceLine)}</div></div><span class="spotlight-arrow">↵</span></button>`);
      } else if (item.type === "arcane") {
        const priceLine = item.rankMax?.sell?.p25 ?? item.rank0?.sell?.p25;
        html.push(`<button class="spotlight-item spotlight-arcane" data-index="${currentIndex}" type="button">${arcaneThumb(item)}<div class="spotlight-body"><div class="spotlight-title">${escapeHtml(item.name)}</div><div class="spotlight-sub">${escapeHtml(item.rarity)} · ${item.dissolutionVosfor ?? "?"} Vosfor · ${priceLine == null ? "no scanned price" : `${priceLine}◈ p25`}</div></div><span class="spotlight-arrow">↵</span></button>`);
      } else if (item.type === "page") {
        html.push(`<button class="spotlight-item" data-index="${currentIndex}" type="button"><span class="spotlight-glyph">⌂</span><div class="spotlight-body"><div class="spotlight-title">${escapeHtml(item.name)}</div><div class="spotlight-sub">${escapeHtml(item.sub)}</div></div><span class="spotlight-arrow">›</span></button>`);
      } else if (item.type === "action") {
        html.push(`<button class="spotlight-item" data-index="${currentIndex}" type="button"><span class="spotlight-glyph">ϟ</span><div class="spotlight-body"><div class="spotlight-title">${escapeHtml(item.name)}</div><div class="spotlight-sub">${escapeHtml(item.sub)}</div></div><span class="spotlight-arrow">↵</span></button>`);
      }
    }
  }
  elements.spotlightResults.innerHTML = html.join("");
  for (const button of elements.spotlightResults.querySelectorAll(".spotlight-item:not(.spotlight-hint)")) {
    button.addEventListener("click", () => activateSpotlightItem(Number(button.dataset.index)));
  }
}

function groupSpotlightItems(items) {
  const labels = new Map([
    ["filter", "Actions"],
    ["action", "Actions"],
    ["page", "Pages"],
    ["weapon", "Weapons"],
    ["arcane", "Arcanes"],
  ]);
  const grouped = [];
  for (const type of ["filter", "action", "page", "weapon", "arcane"]) {
    const groupItems = items.filter((item) => item.type === type);
    if (groupItems.length > 0) grouped.push([labels.get(type), groupItems]);
  }
  return grouped;
}

function activateSpotlightItem(index) {
  const item = spotlightItems.find((entry) => entry.__index === index) ?? spotlightItems[index];
  if (!item) return;
  if (item.type === "weapon") {
    openWeaponDetail(item.slug);
    closeSpotlightOverlay();
    elements.spotlightInput.value = "";
  } else if (item.type === "arcane") {
    closeSpotlightOverlay();
    navigate("arcanes");
    elements.spotlightInput.value = "";
  } else if (item.type === "filter") {
    spotlightFilter = { text: item.text, filter: item.filter };
    closeSpotlightOverlay();
    navigate("opportunities");
    renderOpportunitySurfaces();
  } else if (item.type === "page") {
    closeSpotlightOverlay();
    navigate(item.page, { settingsTab: item.settingsTab });
  } else if (item.type === "action" && item.action === "refresh") {
    closeSpotlightOverlay();
    void refreshNow();
  }
}

function closeSpotlight() {
  if (elements.spotlightResults) elements.spotlightResults.hidden = true;
  spotlightIndex = -1;
}

function moveSpotlightSelection(delta) {
  if (spotlightItems.length === 0) return;
  spotlightIndex = (spotlightIndex + delta + spotlightItems.length) % spotlightItems.length;
  for (const button of elements.spotlightResults.querySelectorAll(".spotlight-item")) button.classList.toggle("active", Number(button.dataset.index) === spotlightIndex);
}

function openSpotlightOverlay() {
  if (!elements.spotlightOverlay) return;
  elements.spotlightOverlay.removeAttribute("hidden");
  document.body.classList.add("spotlight-active");
  const value = (elements.spotlightInput?.value ?? "").trim();
  if (value === "") renderSpotlightHints();
  else void updateSpotlight(value);
  Promise.resolve().then(() => elements.spotlightInput?.focus());
}

function renderSpotlightHints() {
  const results = elements.spotlightResults;
  if (!results) return;
  spotlightItems = [
    { type: "page", name: "Opportunities", sub: "Ranked buy-low / sell-high queue", page: "opportunities", __index: 0 },
    { type: "page", name: "Instant Wins", sub: "Live undervalued signature listings", page: "instant", __index: 1 },
    { type: "page", name: "Arcanes", sub: "Vosfor EV and dissolve recommendations", page: "arcanes", __index: 2 },
    { type: "hint", title: "Search any weapon or Arcane", sub: "Type a name — e.g. bramma, steadfast, hot shot", __index: 3 },
    { type: "hint", title: "Filter by price", sub: "e.g. dark sword < 100p, > 500p, = 250p", __index: 4 },
  ];
  spotlightIndex = -1;
  results.removeAttribute("hidden");
  results.innerHTML = `
    <div class="spotlight-section-label">Try this</div>
    <button class="spotlight-item" data-index="0" type="button"><span class="spotlight-glyph">◎</span><div class="spotlight-body"><div class="spotlight-title">Opportunities</div><div class="spotlight-sub">Open the ranked trade queue</div></div><span class="spotlight-arrow">›</span></button>
    <button class="spotlight-item" data-index="1" type="button"><span class="spotlight-glyph">ϟ</span><div class="spotlight-body"><div class="spotlight-title">Instant Wins</div><div class="spotlight-sub">Open same-signature undervalued listings</div></div><span class="spotlight-arrow">›</span></button>
    <button class="spotlight-item" data-index="2" type="button"><span class="spotlight-glyph">✦</span><div class="spotlight-body"><div class="spotlight-title">Arcanes</div><div class="spotlight-sub">Open Vosfor exchange EV</div></div><span class="spotlight-arrow">›</span></button>
    <div class="spotlight-item spotlight-hint"><span class="spotlight-glyph">⌕</span><div class="spotlight-body"><div class="spotlight-title">Search any weapon or Arcane</div><div class="spotlight-sub">Type a name — e.g. bramma, steadfast, hot shot</div></div></div>
    <div class="spotlight-item spotlight-hint"><span class="spotlight-glyph">≡</span><div class="spotlight-body"><div class="spotlight-title">Filter by price</div><div class="spotlight-sub">e.g. dark sword &lt; 100p, &gt; 500p, = 250p</div></div></div>`;
  for (const button of results.querySelectorAll(".spotlight-item:not(.spotlight-hint)")) button.addEventListener("click", () => activateSpotlightItem(Number(button.dataset.index)));
}

function closeSpotlightOverlay() {
  document.body.classList.remove("spotlight-active");
  if (elements.spotlightOverlay) elements.spotlightOverlay.hidden = true;
  closeSpotlight();
}

if (elements.spotlightTrigger) elements.spotlightTrigger.addEventListener("click", () => openSpotlightOverlay());
if (elements.spotlightOverlay) {
  elements.spotlightOverlay.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.spotlightClose !== undefined) closeSpotlightOverlay();
  });
}
if (elements.spotlightInput) {
  elements.spotlightInput.addEventListener("input", () => {
    clearTimeout(spotlightTimer);
    const value = elements.spotlightInput.value;
    if (!value.trim()) {
      renderSpotlightHints();
      return;
    }
    spotlightTimer = setTimeout(() => updateSpotlight(value), 120);
  });
  elements.spotlightInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); closeSpotlightOverlay(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); moveSpotlightSelection(1); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); moveSpotlightSelection(-1); return; }
    if (event.key === "Enter" && spotlightIndex >= 0) { event.preventDefault(); activateSpotlightItem(spotlightIndex); }
  });
}
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (elements.spotlightOverlay?.hidden === false) closeSpotlightOverlay();
    else openSpotlightOverlay();
  } else if (event.key === "Escape") {
    if (elements.spotlightOverlay?.hidden === false) closeSpotlightOverlay();
    if (elements.weaponModal?.hidden === false) closeWeaponModal();
  }
});

async function openWeaponDetail(slug) {
  if (!slug || !elements.weaponModal) return;
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
  if (!elements.weaponModal) return;
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
        const classification = velocity?.classification && velocity.classification !== "unknown" ? signalChip(velocity.classification) : "";
        return `<div class="wd-signature">
          <div class="wd-signature-attrs"><div class="flags">${positives}${negatives}</div>${classification}</div>
          <div class="wd-signature-stats">
            <span><span class="small">p25</span> ${Math.round(entry.p25 ?? 0)}◈</span>
            <span><span class="small">median</span> <strong>${Math.round(entry.p50 ?? 0)}◈</strong></span>
            <span><span class="small">p75</span> ${Math.round(entry.p75 ?? 0)}◈</span>
            <span><span class="small">samples</span> ${entry.sample_count}</span>
            <span><span class="small">conf</span> ${Math.round((entry.confidence ?? 0) * 100)}%</span>
          </div>
        </div>`;
      }).join("")
    : `<div class="wd-empty">No signature history yet. Once cold-scans have logged samples for this weapon over ~30 days, common stat combos with p25/median/p75 pricing will appear here.</div>`;

  const opportunitiesHtml = (opportunities ?? []).length > 0
    ? opportunities.slice(0, RESULT_BUDGETS.weaponDetailOpportunities).map((opp) => {
        const tier = opp.quality?.tier ?? tierFromScore(opp.score);
        return `<div class="wd-opp" data-url="${escapeHtml(opp.url)}">
          <div class="wd-opp-price"><span class="price">${opp.buyPrice}◈</span> → ${opp.targetSellPrice}◈ <span class="profit">+${opp.expectedProfit}◈</span></div>
          <div class="wd-opp-meta small">${escapeHtml(opp.rivenName)} · ${escapeHtml(opp.seller?.ingameName ?? "seller")} · ${escapeHtml(opp.status)} · comps ${opp.comparableListings}</div>
          <div class="wd-opp-flags">${(opp.positives ?? []).slice(0, 4).map((p) => `<span class="flag good">+${escapeHtml(p)}</span>`).join("")}${(opp.negatives ?? []).slice(0, 2).map((n) => `<span class="flag bad">-${escapeHtml(n)}</span>`).join("")}<span class="tier-badge tier-${tier}">${tier}</span></div>
        </div>`;
      }).join("")
    : `<div class="wd-empty">No actionable listings match your current filters. Widen seller-status or lower min-profit to see more.</div>`;

  elements.wdContent.innerHTML = `
    <div class="wd-head">
      <div class="wd-head-thumb">${weaponThumb(weapon.imageName, weapon.name, "lg")}</div>
      <div class="wd-head-body">
        <div class="wd-eyebrow">${escapeHtml(weapon.group)} · MR ${weapon.reqMasteryRank}</div>
        <h2 class="wd-name">${escapeHtml(weapon.name)}</h2>
        <div class="wd-facts">
          <span>disposition <strong>${Number(weapon.disposition ?? 0).toFixed(2)}</strong></span>
          <span>direct listings <strong>${summary?.directListings ?? 0}</strong></span>
          <span>online <strong>${summary?.onlineListings ?? 0}</strong></span>
        </div>
      </div>
      <a class="wd-external" href="${escapeHtml(auctionsUrl)}" target="_blank" rel="noopener">Open on WFM ↗</a>
    </div>

    ${stats ? `<div class="wd-stats">
      <div class="wd-stat"><div class="wd-stat-label">Min</div><div class="wd-stat-value">${stats.min}◈</div></div>
      <div class="wd-stat"><div class="wd-stat-label">P25</div><div class="wd-stat-value">${stats.p25}◈</div></div>
      <div class="wd-stat wd-stat-primary"><div class="wd-stat-label">Median</div><div class="wd-stat-value">${stats.median}◈</div></div>
      <div class="wd-stat"><div class="wd-stat-label">P75</div><div class="wd-stat-value">${stats.p75}◈</div></div>
      <div class="wd-stat"><div class="wd-stat-label">P90</div><div class="wd-stat-value">${stats.p90}◈</div></div>
      <div class="wd-stat"><div class="wd-stat-label">Max</div><div class="wd-stat-value">${stats.max}◈</div></div>
    </div>` : `<div class="wd-empty">No live market data cached for this weapon yet.</div>`}

    <div class="wd-section">
      <div class="wd-section-head"><h3>Live listings that match your filters</h3><span class="small">${(opportunities ?? []).length} total</span></div>
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
  const positives = [];
  const negatives = [];
  for (const part of String(sig).split("|")) {
    if (part.startsWith("+")) positives.push(part.slice(1));
    else if (part.startsWith("-")) negatives.push(part.slice(1));
  }
  return [positives, negatives];
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
    statuses,
  };
}

function shortTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(value) {
  if (!value) return "—";
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff)) return shortTime(value);
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
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
  updateSortControls();
  return sorted;
}

function sortValue(opportunity, key) {
  if (key === "rank") return opportunity.expectedProfit;
  if (key === "seller") return opportunity.seller?.ingameName ?? "";
  if (key === "updated") return Date.parse(opportunity.updated ?? "") || 0;
  if (key === "confidence") return opportunity.confidence ?? 0;
  if (key === "score") return opportunity.score ?? 0;
  return opportunity[key] ?? "";
}

function updateSortControls() {
  for (const button of document.querySelectorAll("[data-sort]")) {
    button.classList.remove("active", "sorted-asc", "sorted-desc");
    if (button.dataset.sort === sortState.key) {
      button.classList.add("active", sortState.direction === "asc" ? "sorted-asc" : "sorted-desc");
    }
  }
}

for (const button of document.querySelectorAll("[data-sort]")) {
  button.addEventListener("click", () => {
    const key = button.dataset.sort;
    if (!key) return;
    if (sortState.key === key) sortState = { key, direction: sortState.direction === "asc" ? "desc" : "asc" };
    else sortState = { key, direction: key === "weaponName" ? "asc" : "desc" };
    renderOpportunitySurfaces();
  });
}

if (elements.form) {
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = elements.form.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = true;
    try {
      spotlightFilter = null;
      await postJson("/api/scan", collectConfig());
      navigate("opportunities");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

for (const refreshButton of [elements.refresh, elements.homeRefresh, elements.instantRefresh, elements.arcaneRefresh, elements.railRefresh].filter(Boolean)) {
  refreshButton.addEventListener("click", () => refreshNow(refreshButton));
}

async function refreshNow(button = null) {
  if (button) button.disabled = true;
  try {
    await postJson("/api/refresh", {});
  } finally {
    if (button) button.disabled = false;
  }
}

function openSettingsModal(defaultTab = "data") {
  navigate("settings", { settingsTab: defaultTab });
}

function switchSettingsTab(tabName) {
  for (const tab of elements.settingsTabs) tab.classList.toggle("active", tab.dataset.settingsTab === tabName);
  for (const panel of elements.settingsPanels) panel.hidden = panel.dataset.settingsPanel !== tabName;
}

for (const tab of elements.settingsTabs) tab.addEventListener("click", () => switchSettingsTab(tab.dataset.settingsTab));
if (elements.settingsButton) elements.settingsButton.addEventListener("click", () => openSettingsModal("data"));
for (const button of document.querySelectorAll(".mcp-copy")) {
  button.addEventListener("click", () => {
    const targetId = button.getAttribute("data-copy-target");
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) copyText(target.textContent ?? "", button);
  });
}

function populateMcp() {
  const origin = window.location.origin;
  const sseUrl = `${origin}/mcp/sse`;
  if (elements.mcpEndpoint) elements.mcpEndpoint.textContent = sseUrl;
  if (elements.mcpConfigDesktop) {
    elements.mcpConfigDesktop.textContent = JSON.stringify({
      mcpServers: {
        "the-plat-exchange": {
          command: "npx",
          args: ["-y", "mcp-remote", sseUrl],
        },
      },
    }, null, 2);
  }
  if (elements.mcpConfigCli) elements.mcpConfigCli.textContent = `claude mcp add the-plat-exchange --transport sse ${sseUrl}`;
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
    elements.mcpToolList.innerHTML = info.tools.map((tool) => `<li><strong>${escapeHtml(tool.name)}</strong><div class="small">${escapeHtml(tool.description)}</div></li>`).join("");
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
  if (!button) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied ✓";
    setTimeout(() => { button.textContent = original; }, 1600);
  } catch {
    button.textContent = "Copy blocked";
  }
}

if (elements.mcpTestButton) elements.mcpTestButton.addEventListener("click", testMcpConnection);

function updateModeUi(activeMode, state) {
  const normalized = ["remote", "tiered", "full"].includes(activeMode) ? activeMode : "tiered";
  for (const button of elements.modeButtons) button.classList.toggle("active", button.dataset.mode === normalized);
  if (elements.modeHint) elements.modeHint.textContent = MODE_HINTS[normalized] ?? MODE_HINTS.tiered;
  if (elements.dataStatusLine && state) elements.dataStatusLine.innerHTML = `<span class="small">${escapeHtml(state.status?.lastMessage ?? "")}</span>`;
}

async function switchMode(mode) {
  try {
    const response = await fetch("/api/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (elements.summary) elements.summary.textContent = `Mode switch failed: ${payload.error ?? response.status}`;
      return;
    }
    render(await response.json());
    await refreshDerived();
  } catch (error) {
    if (elements.summary) elements.summary.textContent = `Mode switch failed: ${error.message}`;
  }
}

for (const button of elements.modeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    if (!mode || button.classList.contains("active")) return;
    switchMode(mode);
  });
}

function confidenceBar(value) {
  const score = Math.max(0, Math.min(1, Number(value) || 0));
  const filled = Math.round(score * 5);
  return `<span class="confbar" aria-label="${Math.round(score * 100)}% confidence">${Array.from({ length: 5 }, (_, i) => `<span class="${i < filled ? "on" : ""}"></span>`).join("")}</span>`;
}

function tierFromScore(score) {
  const value = Number(score) || 0;
  if (value >= 85) return "A";
  if (value >= 70) return "B";
  if (value >= 50) return "C";
  return "D";
}

function opportunityKey(opportunity) {
  return opportunity.auctionId || `${opportunity.weaponSlug}:${opportunity.rivenName}:${opportunity.buyPrice}:${opportunity.seller?.ingameName ?? ""}`;
}

function tradeWhisper(opportunity) {
  const seller = opportunity.seller?.ingameName ?? "seller";
  return `/w ${seller} Hi! I want to buy your ${opportunity.rivenName} ${opportunity.weaponName} riven listed for ${opportunity.buyPrice} platinum.`;
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

if (window.EventSource) {
  const events = new EventSource("/events");
  events.addEventListener("state", async (event) => {
    render(JSON.parse(event.data));
    await refreshDerived();
  });
  events.addEventListener("error", () => {
    // Native EventSource reconnects automatically.
  });
}

loadState().catch((error) => {
  if (elements.summary) elements.summary.textContent = error.message;
});
setInterval(() => { refreshDerived().catch(() => undefined); }, 60_000);
window.addEventListener("resize", () => {
  drawChart(applySpotlightFilter(currentOpportunitySource()));
});
