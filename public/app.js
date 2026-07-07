const elements = {
  topBar: document.getElementById("topBar"),
  leftRail: document.getElementById("leftRail"),
  pageRoot: document.getElementById("pageRoot"),
  railToggle: document.getElementById("railToggle"),
  pagePanels: document.querySelectorAll("[data-page-panel]"),
  pageButtons: document.querySelectorAll("[data-page]"),
  rateStatus: document.getElementById("rateStatus"),
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
  topSpreadCards: document.getElementById("topSpreadCards"),
  sortPills: document.getElementById("sortPills"),
  form: document.getElementById("filters"),
  refresh: document.getElementById("refresh"),
  watchlist: document.getElementById("watchlist"),
  watchlistSuggestions: document.getElementById("watchlistSuggestions"),
  watchlistChips: document.getElementById("watchlistChips"),
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
  productRefresh: document.getElementById("productRefresh"),
  productSummary: document.getElementById("productSummary"),
  productHealth: document.getElementById("productHealth"),
  productHealthSub: document.getElementById("productHealthSub"),
  productMethodsCount: document.getElementById("productMethodsCount"),
  productOppCount: document.getElementById("productOppCount"),
  productBestEv: document.getElementById("productBestEv"),
  productBestEvSub: document.getElementById("productBestEvSub"),
  productMethods: document.getElementById("productMethods"),
  productOpportunities: document.getElementById("productOpportunities"),
  primeRelics: document.getElementById("primeRelics"),
  expansionMethods: document.getElementById("expansionMethods"),
  productTabs: document.querySelectorAll("[data-product-view]"),
  productViewPanels: document.querySelectorAll("[data-product-view-panel]"),
  runNowSummary: document.getElementById("runNowSummary"),
  runNowList: document.getElementById("runNowList"),
  runNowPager: document.getElementById("runNowPager"),
  dataHealthSummary: document.getElementById("dataHealthSummary"),
  dataHealthSources: document.getElementById("dataHealthSources"),
  profileForm: document.getElementById("profileForm"),
  profileDisplayName: document.getElementById("profileDisplayName"),
  assumptionTrace: document.getElementById("assumptionTrace"),
  assumptionEndo: document.getElementById("assumptionEndo"),
  assumptionCredits: document.getElementById("assumptionCredits"),
  assumptionUnlocked: document.getElementById("assumptionUnlocked"),
  privacyPrivate: document.getElementById("privacyPrivate"),
  privacyAggregates: document.getElementById("privacyAggregates"),
  deleteUserData: document.getElementById("deleteUserData"),
  todoForm: document.getElementById("todoForm"),
  todoTitle: document.getElementById("todoTitle"),
  todoMethod: document.getElementById("todoMethod"),
  todoDue: document.getElementById("todoDue"),
  todoNotes: document.getElementById("todoNotes"),
  todoList: document.getElementById("todoList"),
  portfolioList: document.getElementById("portfolioList"),
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
  marketsPager: document.getElementById("marketsPager"),
  rankedOverlay: document.getElementById("rankedOverlay"),
  rankedKicker: document.getElementById("rankedKicker"),
  rankedTitle: document.getElementById("rankedTitle"),
  rankedCount: document.getElementById("rankedCount"),
  rankedList: document.getElementById("rankedList"),
  rankedPager: document.getElementById("rankedPager"),
};

let latestState = null;
let latestEnrichedOpps = [];
let latestInstantWins = [];
let scatterHits = [];
let controlsHydrated = false;
let sortState = { key: "expectedProfit", direction: "desc" };
let heroOpportunity = null;
let spotlightTimer = null;
let spotlightCloseTimer = 0;
let spotlightMorphNode = null;
let spotlightMorphAnimation = null;
let motionRevealTimer = 0;
let spotlightItems = [];
let spotlightIndex = -1;
let spotlightFilter = null;
let currentPage = "home";
let expandedOpportunityKey = null;
let copiedOpportunityKey = null;
let opportunityRenderToken = 0;
let opportunityRenderIdleHandle = null;
let opportunityVisibleCount = 25;
let heatmapVisibleCount = 9;
let arcaneDissolveVisibleCount = 6;
let arcanePackStrategy = "high_value_maxed";
let renderedOpportunityByKey = new Map();
let watchlistSelections = [];
let watchlistSuggestionTimer = 0;
let runNowPage = 0;
let marketsPage = 0;
let rankedOverlayState = null;
let tickerItems = [];
let tickerHtmlCache = "";
let chartTooltipKey = null;
let chartTooltipSize = { width: 260, height: 120 };
let filtersRevealTimer = 0;
let lastOpportunityScrollTop = 0;
let pendingChartPointer = null;
let chartPointerFrame = 0;
let chartResizeFrame = 0;
let currentProductView = "engines";
let opportunityViewCache = {
  source: null,
  filter: null,
  sortKey: null,
  sortDirection: null,
  filtered: [],
  sorted: [],
};


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
const SIGNAL_RANK = new Map(SIGNAL_PRIORITY.map((signal, index) => [signal, index]));

const TIER_COLORS = { A: "#4ade80", B: "#38bdf8", C: "#fbbf24", D: "#f87171" };

const RESULT_BUDGETS = browserResultBudgets();
const IDLE_RENDER_TIMEOUT_MS = 80;
const TOP_SPREAD_COUNT = 5;
const HEATMAP_SHOW_MORE_BATCH = 9;
const ARCANE_PREVIEW_COUNT = 5;
const PRODUCT_METHOD_PREVIEW_COUNT = 8;
const PRODUCT_OPPORTUNITY_PREVIEW_COUNT = 6;
const RUN_NOW_PAGE_SIZE = 6;
const MARKETS_PAGE_SIZE = 15;
const OVERLAY_PAGE_SIZE = 10;
const OPPORTUNITY_PAGE_SIZE = 25;
const HEARTBEAT_MS = 30_000;
const SPOTLIGHT_CLOSE_MS = 110;
const SPOTLIGHT_MORPH_MS = 160;
const SPOTLIGHT_CLONE_FADE_MS = 45;
const MOTION_REVEAL_MS = 220;
const NUMBER_FORMATTER = new Intl.NumberFormat();
const HTML_ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
const CONFIDENCE_BAR_SEGMENTS = Array.from({ length: 6 }, (_, filled) => {
  let html = "";
  for (let index = 0; index < 5; index += 1) html += `<span${index < filled ? " class=\"on\"" : ""}></span>`;
  return html;
});

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

function triggerMotionReveal() {
  window.clearTimeout(motionRevealTimer);
  if (prefersReducedMotion()) {
    document.body.classList.remove("motion-reveal");
    return;
  }
  document.body.classList.remove("motion-reveal");
  void document.body.offsetWidth;
  document.body.classList.add("motion-reveal");
  motionRevealTimer = window.setTimeout(() => document.body.classList.remove("motion-reveal"), MOTION_REVEAL_MS);
}

function setOpportunityFiltersHidden(hidden) {
  document.querySelector(".opportunities-grid")?.classList.toggle("filters-auto-hidden", hidden);
}

function handlePageRootScroll() {
  const root = elements.pageRoot;
  if (!root) return;
  if (currentPage !== "opportunities") {
    lastOpportunityScrollTop = root.scrollTop;
    setOpportunityFiltersHidden(false);
    return;
  }
  const nextTop = root.scrollTop;
  const delta = nextTop - lastOpportunityScrollTop;
  lastOpportunityScrollTop = nextTop;
  window.clearTimeout(filtersRevealTimer);
  if (nextTop < 24) setOpportunityFiltersHidden(false);
  else if (Math.abs(delta) > 3) setOpportunityFiltersHidden(true);
  filtersRevealTimer = window.setTimeout(() => setOpportunityFiltersHidden(false), 720);
}

function navigate(page, options = {}) {
  currentPage = page;
  for (const panel of elements.pagePanels) panel.classList.toggle("active", panel.dataset.pagePanel === page);
  for (const button of elements.pageButtons) button.classList.toggle("active", button.dataset.page === page);
  triggerMotionReveal();
  if (page === "settings") {
    populateMcp();
    switchSettingsTab(options.settingsTab ?? "data");
  }
  renderVisiblePageSurfaces();
  elements.pageRoot?.scrollTo({ top: 0, behavior: "auto" });
  lastOpportunityScrollTop = 0;
  setOpportunityFiltersHidden(false);
}

for (const button of elements.pageButtons) {
  button.addEventListener("click", () => {
    const page = button.dataset.page;
    if (!page) return;
    navigate(page, { settingsTab: button.dataset.settingsTabTarget });
  });
}
if (elements.pageRoot) elements.pageRoot.addEventListener("scroll", handlePageRootScroll, { passive: true });

for (const button of elements.arcaneStrategyButtons) {
  button.addEventListener("click", () => {
    const nextStrategy = button.dataset.arcaneStrategy;
    if (!ARCANE_RAW_PLAT_STRATEGIES[nextStrategy]) return;
    arcanePackStrategy = nextStrategy;
    renderArcanes(latestState?.arcanes);
  });
}

if (elements.railToggle) {
  elements.railToggle.addEventListener("click", () => {
    const collapsed = elements.leftRail?.classList.toggle("collapsed");
    elements.railToggle.textContent = collapsed ? "›" : "‹";
    elements.railToggle.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
  });
}


for (const tab of elements.productTabs) {
  tab.addEventListener("click", () => switchProductView(tab.dataset.productView || "engines"));
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const arcaneButton = target?.closest("[data-open-arcane-overlay]");
  if (arcaneButton) {
    openArcaneOverlay(arcaneButton.dataset.openArcaneOverlay);
    return;
  }
  const productButton = target?.closest("[data-open-product-overlay]");
  if (productButton) {
    openProductOverlay(productButton.dataset.openProductOverlay);
    return;
  }
  const expansionButton = target?.closest("[data-open-expansion-overlay]");
  if (expansionButton) {
    openProductOverlay("expansion", expansionButton.dataset.openExpansionOverlay);
  }
});

if (elements.rankedOverlay) {
  elements.rankedOverlay.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.rankedClose !== undefined) closeRankedOverlay();
  });
}

if (elements.rankedPager) {
  elements.rankedPager.addEventListener("click", (event) => {
    const delta = pageMeterDelta(event, elements.rankedPager);
    if (!delta || !rankedOverlayState) return;
    rankedOverlayState.page = Math.max(0, rankedOverlayState.page + delta);
    renderRankedOverlay();
  });
}

function switchProductView(view) {
  currentProductView = view;
  for (const tab of elements.productTabs) {
    const active = tab.dataset.productView === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const panel of elements.productViewPanels) {
    panel.classList.toggle("active", panel.dataset.productViewPanel === view);
  }
}

if (elements.profileForm) {
  elements.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await postJson("/api/user/profile", {
      displayName: elements.profileDisplayName?.value,
      assumptions: {
        traceOpportunityCostPlat: numberOrUndefined(elements.assumptionTrace?.value),
        endoPlatPerThousand: numberOrUndefined(elements.assumptionEndo?.value),
        creditPlatPerMillion: numberOrUndefined(elements.assumptionCredits?.value),
        unlockedContent: splitCsv(elements.assumptionUnlocked?.value),
      },
      privacy: {
        privateByDefault: Boolean(elements.privacyPrivate?.checked),
        allowAnonymousAggregates: Boolean(elements.privacyAggregates?.checked),
      },
    });
  });
}

if (elements.todoForm) {
  elements.todoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await postJson("/api/todos", {
      title: elements.todoTitle?.value,
      methodId: elements.todoMethod?.value,
      dueAt: elements.todoDue?.value ? new Date(elements.todoDue.value).toISOString() : undefined,
      notes: elements.todoNotes?.value,
    });
    elements.todoForm.reset();
  });
}

if (elements.todoList) {
  elements.todoList.addEventListener("click", async (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("[data-todo-action]") : null;
    if (!button) return;
    const id = button.dataset.todoId;
    const status = button.dataset.todoAction;
    if (!id || !status) return;
    await requestJson(`/api/todos/${encodeURIComponent(id)}`, "PATCH", { status });
  });
}

if (elements.deleteUserData) {
  elements.deleteUserData.addEventListener("click", async () => {
    if (!window.confirm("Delete local TPE profile, todos, portfolio, and alerts?")) return;
    await postJson("/api/user/delete", {});
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
    renderVisiblePageSurfaces();
    if (latestState) {
      renderTicker(latestState, currentOpportunitySource());
      renderStatusFooter(latestState);
    }
  } catch {
    // Keep the last good UI state while EventSource or the next timer reconnects.
  }
}

async function requestJson(path, method, body) {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  render(await response.json());
  await refreshDerived();
}

async function postJson(path, body) {
  return requestJson(path, "POST", body);
}

function render(state) {
  const firstRender = latestState === null;
  latestState = state;
  if (firstRender) triggerMotionReveal();
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
  renderVisiblePageSurfaces();
  renderTicker(state, currentOpportunitySource());
}

function renderVisiblePageSurfaces() {
  if (!latestState) return;
  if (currentPage === "home") {
    renderHomeSurfaces();
    return;
  }
  if (currentPage === "opportunities") {
    renderOpportunityListSurface();
    return;
  }
  if (currentPage === "instant") {
    renderInstantWins(latestInstantWins);
    return;
  }
  if (currentPage === "arcanes") {
    renderArcanes(latestState.arcanes);
    return;
  }
  if (currentPage === "products") {
    renderProductEngine(latestState.product);
    return;
  }
  if (currentPage === "run-now") {
    renderRunNow(latestState.product);
    return;
  }
  if (currentPage === "data-health") {
    renderDataHealth(latestState.product);
    return;
  }
  if (currentPage === "planner") {
    renderPlanner(latestState.product);
    return;
  }
  if (currentPage === "markets") renderWeapons(latestState.weaponSummaries ?? []);
}

function renderHomeSurfaces() {
  const view = opportunityView();
  renderFreshOpportunities(view.sorted);
  const topSpreadOpportunities = topSpreadRows(view.filtered);
  renderTopSpreadCards(topSpreadOpportunities);
  drawChart(view.filtered);
  renderHero(view.sorted[0] ?? currentOpportunitySource()[0] ?? null);
  renderHeatmap(latestState?.weaponSummaries ?? []);
  renderInstantPreview(latestInstantWins);
}

function renderOpportunitySurfaces() {
  if (currentPage === "home") {
    renderHomeSurfaces();
    return;
  }
  if (currentPage === "opportunities") renderOpportunityListSurface();
}

function renderOpportunityListSurface() {
  renderOpportunities(opportunityView().sorted);
}

function resetOpportunityPagination() {
  opportunityVisibleCount = OPPORTUNITY_PAGE_SIZE;
  expandedOpportunityKey = null;
}

function opportunityView() {
  const source = currentOpportunitySource();
  if (
    opportunityViewCache.source === source &&
    opportunityViewCache.filter === spotlightFilter &&
    opportunityViewCache.sortKey === sortState.key &&
    opportunityViewCache.sortDirection === sortState.direction
  ) {
    return opportunityViewCache;
  }
  const filtered = applySpotlightFilter(source);
  const sorted = sortedOpportunities(filtered);
  opportunityViewCache = {
    source,
    filter: spotlightFilter,
    sortKey: sortState.key,
    sortDirection: sortState.direction,
    filtered,
    sorted,
  };
  return opportunityViewCache;
}

function currentOpportunitySource() {
  if (latestEnrichedOpps.length > 0) return latestEnrichedOpps;
  return latestState?.opportunities ?? [];
}

function hydrateControls(state) {
  if (controlsHydrated) return;
  if (!elements.watchlist) return;
  controlsHydrated = true;
  watchlistSelections = [...(state.config?.watchlist ?? [])];
  elements.watchlist.value = "";
  renderWatchlistChips();
  elements.minProfit.value = state.config?.minProfit ?? 25;
  elements.minRoi.value = state.config?.minRoi ?? 0.2;
  elements.minGroupSize.value = state.config?.minGroupSize ?? 3;
  elements.minBuyPrice.value = state.config?.minBuyPrice == null ? "" : state.config.minBuyPrice;
  elements.maxBuyPrice.value = state.config?.maxBuyPrice == null ? "" : state.config.maxBuyPrice;
  elements.maxSellPrice.value = state.config?.maxSellPrice == null ? "" : state.config.maxSellPrice;
  for (const checkbox of document.querySelectorAll(".status")) checkbox.checked = (state.config?.statuses ?? []).includes(checkbox.value);
  hydrateProductControls(state.product);
}

function addWatchlistSelection(name) {
  const clean = String(name ?? "").trim();
  if (!clean) return;
  if (!watchlistSelections.some((entry) => entry.toLowerCase() === clean.toLowerCase())) watchlistSelections.push(clean);
  if (elements.watchlist) elements.watchlist.value = "";
  if (elements.watchlistSuggestions) elements.watchlistSuggestions.hidden = true;
  renderWatchlistChips();
}

function removeWatchlistSelection(name) {
  const needle = String(name ?? "").toLowerCase();
  watchlistSelections = watchlistSelections.filter((entry) => entry.toLowerCase() !== needle);
  renderWatchlistChips();
}

function watchlistTermsForSubmit() {
  const transient = String(elements.watchlist?.value ?? "").trim();
  return [...watchlistSelections, transient].filter(Boolean);
}

function scheduleWatchlistSuggestions() {
  window.clearTimeout(watchlistSuggestionTimer);
  watchlistSuggestionTimer = window.setTimeout(updateWatchlistSuggestions, 120);
}

async function updateWatchlistSuggestions() {
  const query = String(elements.watchlist?.value ?? "").trim();
  if (!elements.watchlistSuggestions || query.length < 2) {
    if (elements.watchlistSuggestions) elements.watchlistSuggestions.hidden = true;
    return;
  }
  try {
    const response = await fetch(`/api/weapons?q=${encodeURIComponent(query)}&limit=6`);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const weapons = await response.json();
    const rows = Array.isArray(weapons) ? weapons : [];
    if (rows.length === 0) {
      elements.watchlistSuggestions.hidden = true;
      return;
    }
    elements.watchlistSuggestions.innerHTML = rows.map((weapon) => `
      <button type="button" data-watchlist-add="${escapeHtml(weapon.name)}">
        ${weaponThumb(weapon.imageName ?? weapon.summary?.imageName, weapon.name, "sm")}
        <span><strong>${escapeHtml(weapon.name)}</strong><small>${escapeHtml(weapon.group ?? "weapon")}</small></span>
      </button>
    `).join("");
    elements.watchlistSuggestions.hidden = false;
  } catch {
    elements.watchlistSuggestions.hidden = true;
  }
}

function renderWatchlistChips() {
  if (!elements.watchlistChips) return;
  if (watchlistSelections.length === 0) {
    elements.watchlistChips.innerHTML = `<span class="watchlist-empty">All weapons</span>`;
    return;
  }
  elements.watchlistChips.innerHTML = watchlistSelections.map((name) => `
    <button class="watchlist-chip" type="button" data-watchlist-remove="${escapeHtml(name)}">
      ${escapeHtml(name)} <span aria-hidden="true">×</span>
    </button>
  `).join("");
}

function renderStatusFooter(state) {
  const mode = state.scanMode ?? "tiered";
  const localScanning = mode === "tiered" || mode === "full";
  if (elements.statusMode) elements.statusMode.textContent = mode === "remote" ? "Remote feed" : mode === "full" ? "Full local scan" : "Tiered local scan";
  if (elements.footerRefresh) elements.footerRefresh.textContent = shortTime(state.status?.finishedAt || state.generatedAt);
  if (elements.rateStatus) elements.rateStatus.hidden = !localScanning;
  const total = Math.max(1, state.status?.totalWeapons ?? 0);
  const scanned = Math.max(0, state.status?.scannedWeapons ?? 0);
  const progress = state.status?.running ? Math.min(100, Math.round((scanned / total) * 100)) : 100;
  if (elements.rateBar) elements.rateBar.style.width = `${progress}%`;
  if (elements.rateLabel) elements.rateLabel.textContent = state.status?.running ? `${progress}%` : "idle";
  elements.liveBadge?.classList.toggle("warn", Boolean(state.status?.lastError));
}

function renderTicker(state, opportunities) {
  if (!elements.tickerItems) return;
  tickerItems = opportunities.slice(0, 10);
  if (tickerItems.length === 0) {
    const fallbackHtml = `<span class="ticker-item"><span class="ticker-dot"></span>${escapeHtml(state.status?.lastMessage ?? "Waiting for market feed…")}</span>`;
    if (tickerHtmlCache !== fallbackHtml) {
      tickerHtmlCache = fallbackHtml;
      elements.tickerItems.innerHTML = fallbackHtml;
    }
    return;
  }
  const html = tickerItems.map((opportunity, index) => {
    const delta = Math.round((opportunity.roi ?? 0) * 100);
    const trendClass = delta >= 0 ? "ticker-up" : "ticker-down";
    return `<span class="ticker-item"><button type="button" data-ticker-index="${index}"><span class="ticker-dot"></span>${escapeHtml(opportunity.weaponName)} <span class="ticker-price">${opportunity.buyPrice}◈ → ${opportunity.conservativeSellPrice ?? opportunity.targetSellPrice}◈</span> <span class="${trendClass}">+${opportunity.expectedProfit}◈ ${delta}%</span></button></span>`;
  }).join("");
  const nextHtml = html + html;
  if (tickerHtmlCache !== nextHtml) {
    tickerHtmlCache = nextHtml;
    elements.tickerItems.innerHTML = nextHtml;
  }
}

if (elements.tickerItems) {
  elements.tickerItems.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("[data-ticker-index]") : null;
    if (!button || !elements.tickerItems.contains(button)) return;
    const opportunity = tickerItems[Number(button.dataset.tickerIndex)];
    if (opportunity?.weaponSlug) openWeaponDetail(opportunity.weaponSlug);
  });
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
    const li = SIGNAL_RANK.get(left) ?? 99;
    const ri = SIGNAL_RANK.get(right) ?? 99;
    return li - ri;
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

function rankedPreviewNote(label, shown, total) {
  if (shown >= total) return "";
  return `<div class="result-limit-note compact-preview-note">Showing top ${formatNumber(shown)} of ${formatNumber(total)} ${escapeHtml(label)}. Open ranked view for the full paged list.</div>`;
}

function renderPageMeter(container, page, totalPages, total, label) {
  if (!container) return;
  if (total <= 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  container.innerHTML = `
    <button class="page-meter-btn" type="button" data-page-delta="-1" ${page <= 0 ? "disabled" : ""}>‹</button>
    <span>Page ${formatNumber(page + 1)} / ${formatNumber(totalPages)} · ${formatNumber(total)} ${escapeHtml(label)}</span>
    <button class="page-meter-btn" type="button" data-page-delta="1" ${page >= totalPages - 1 ? "disabled" : ""}>›</button>
  `;
}

function pageMeterDelta(event, container) {
  const button = event.target instanceof HTMLElement ? event.target.closest("[data-page-delta]") : null;
  if (!button || !container?.contains(button) || button.disabled) return 0;
  return Number(button.dataset.pageDelta ?? 0);
}

function openRankedOverlay({ title, kicker, rows, renderRow, pageSize = OVERLAY_PAGE_SIZE }) {
  if (!elements.rankedOverlay || !elements.rankedList) return;
  rankedOverlayState = { title, kicker, rows: rows ?? [], renderRow, pageSize, page: 0 };
  elements.rankedOverlay.hidden = false;
  document.body.classList.add("modal-open");
  renderRankedOverlay();
}

function renderRankedOverlay() {
  if (!rankedOverlayState || !elements.rankedList) return;
  const { title, kicker, rows, renderRow, pageSize } = rankedOverlayState;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  rankedOverlayState.page = Math.min(rankedOverlayState.page, totalPages - 1);
  const start = rankedOverlayState.page * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  if (elements.rankedKicker) elements.rankedKicker.textContent = kicker ?? "Ranked view";
  if (elements.rankedTitle) elements.rankedTitle.textContent = title;
  if (elements.rankedCount) elements.rankedCount.textContent = `${formatNumber(rows.length)} total`;
  elements.rankedList.innerHTML = pageRows.length === 0
    ? `<div class="empty-state">No rows available.</div>`
    : pageRows.map((row, offset) => renderRow(row, start + offset)).join("");
  renderPageMeter(elements.rankedPager, rankedOverlayState.page, totalPages, rows.length, "rows");
}

function closeRankedOverlay() {
  if (!elements.rankedOverlay) return;
  elements.rankedOverlay.hidden = true;
  rankedOverlayState = null;
  if (elements.weaponModal?.hidden !== false) document.body.classList.remove("modal-open");
}

function openArcaneOverlay(kind) {
  const arcanes = latestState?.arcanes;
  const strategy = ARCANE_RAW_PLAT_STRATEGIES[arcanePackStrategy] ? arcanePackStrategy : "high_value_maxed";
  const summaries = arcanes?.summaries ?? [];
  const summaryBySlug = new Map(summaries.map((summary) => [summary.slug, summary]));
  const packs = [...(arcanes?.packs ?? [])].sort((left, right) => compareArcanePacksForStrategy(left, right, strategy, summaryBySlug));
  if (kind === "packs") {
    openRankedOverlay({ title: "Arcane Vosfor packs", kicker: ARCANE_RAW_PLAT_STRATEGIES[strategy].label, rows: packs, renderRow: (pack, index) => arcanePackCard(pack, index, strategy, summaryBySlug) });
    return;
  }
  if (kind === "dissolves") {
    const rows = arcaneRecommendationsForStrategy(arcanes, strategy, packs, summaryBySlug).sort(compareArcaneRecommendations);
    openRankedOverlay({ title: "Sell or dissolve ranking", kicker: ARCANE_RAW_PLAT_STRATEGIES[strategy].label, rows, renderRow: (entry) => arcaneDissolveCard(entry, strategy) });
    return;
  }
  if (kind === "market") {
    openRankedOverlay({ title: "Arcane market board", kicker: "Ranked by sell-side price", rows: arcaneMarketRows(summaries), renderRow: arcaneMarketRow });
  }
}

function openProductOverlay(kind, sectionId = null) {
  const product = latestState?.product;
  const opportunities = product?.opportunities ?? [];
  if (kind === "engines") {
    openRankedOverlay({ title: "Plat Engine method engines", kicker: "All engines", rows: product?.methods ?? [], renderRow: (method) => productMethodCard(method, opportunities) });
    return;
  }
  if (kind === "methods") {
    openRankedOverlay({ title: "Best methods", kicker: "Ranked by expected plat", rows: opportunities, renderRow: productOpportunityCard });
    return;
  }
  if (kind === "expansion" && sectionId) {
    const section = expansionSections(product?.expansion).find((entry) => entry.id === sectionId);
    if (!section) return;
    openRankedOverlay({ title: `${section.label} expansion`, kicker: "Paged opportunity list", rows: section.items, renderRow: productOpportunityCard });
  }
}

function chartRenderItems(opportunities) {
  if (!Array.isArray(opportunities)) return [];
  const actionable = opportunities
    .filter((entry) => (entry.expectedProfit ?? 0) > 0 && (entry.roi ?? 0) > 0)
    .sort((left, right) => chartImportance(right) - chartImportance(left));
  const limit = Math.min(64, RESULT_BUDGETS.chartPoints);
  if (actionable.length <= limit) return actionable;
  const selected = new Map();
  for (const item of actionable.slice(0, limit * 0.55)) selected.set(opportunityKey(item), item);
  for (const item of [...actionable].sort((left, right) => (right.roi ?? 0) - (left.roi ?? 0)).slice(0, limit * 0.2)) selected.set(opportunityKey(item), item);
  for (const item of [...actionable].sort((left, right) => (right.expectedProfit ?? 0) - (left.expectedProfit ?? 0)).slice(0, limit * 0.2)) selected.set(opportunityKey(item), item);
  for (const item of actionable.filter((entry) => (entry.quality?.signals ?? []).includes("undervalued_signature")).slice(0, limit * 0.15)) selected.set(opportunityKey(item), item);
  return [...selected.values()].slice(0, limit);
}

function chartImportance(opportunity) {
  const profit = Math.max(0, opportunity.expectedProfit ?? 0);
  const roi = Math.max(0, opportunity.roi ?? 0);
  const confidence = Math.max(0, Math.min(1, opportunity.confidence ?? opportunity.confidenceScore ?? 0.6));
  const tierBoost = ({ A: 1.25, B: 1.08, C: 0.92, D: 0.72 })[opportunity.quality?.tier ?? tierFromScore(opportunity.score)] ?? 0.8;
  const signalBoost = (opportunity.quality?.signals ?? []).includes("undervalued_signature") ? 1.2 : 1;
  return (Math.log1p(profit) * 0.62 + Math.log1p(roi * 100) * 0.38) * confidence * tierBoost * signalBoost;
}


function renderOpportunities(opportunities) {
  if (!elements.opps) return;
  cancelIdleRender(opportunityRenderIdleHandle);
  opportunityRenderIdleHandle = null;
  const renderToken = ++opportunityRenderToken;
  const nextRenderedOpportunityByKey = new Map();
  renderedOpportunityByKey = nextRenderedOpportunityByKey;
  elements.opps.textContent = "";
  if (opportunities.length === 0) {
    elements.opps.innerHTML = `<div class="empty-state">No opportunities match. Adjust filters, clear the search, or wait for the next scan.</div>`;
    updateSortControls();
    return;
  }

  const total = opportunities.length;
  opportunityVisibleCount = Math.min(Math.max(OPPORTUNITY_PAGE_SIZE, opportunityVisibleCount), total);
  const shown = opportunityVisibleCount;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < shown; index += 1) {
    if (renderToken !== opportunityRenderToken) return;
    const opportunity = opportunities[index];
    const key = opportunityKey(opportunity);
    nextRenderedOpportunityByKey.set(key, opportunity);
    fragment.appendChild(createOpportunityCard(opportunity, index, key));
  }
  elements.opps.appendChild(fragment);

  if (shown < total) {
    const remaining = total - shown;
    elements.opps.insertAdjacentHTML("beforeend", `
      <button class="show-more-button opportunity-show-more" type="button" data-show-more-opportunities>
        Show next ${formatNumber(Math.min(OPPORTUNITY_PAGE_SIZE, remaining))} opportunities
        <span>${formatNumber(shown)} of ${formatNumber(total)} shown</span>
      </button>
    `);
  }
  updateSortControls();
}

function createOpportunityCard(opportunity, index, key = opportunityKey(opportunity)) {
  const tier = opportunity.quality?.tier ?? tierFromScore(opportunity.score);
  const expanded = expandedOpportunityKey === key;
  const topSignals = topSignalsFor(opportunity, 3);
  const positives = (opportunity.positives ?? []).slice(0, 4).map((p) => `<span class="flag good">+${escapeHtml(p)}</span>`).join("");
  const negatives = (opportunity.negatives ?? []).slice(0, 2).map((n) => `<span class="flag bad">-${escapeHtml(n)}</span>`).join("");
  const confidencePercent = Math.round((opportunity.confidence ?? 0) * 100);
  const inlineSignals = topSignals.slice(0, 2).map(signalChip).join("");
  const sellerName = opportunity.seller?.ingameName ?? "unknown";
  const card = document.createElement("article");
  card.className = `opp-card tier-${tier}${expanded ? " expanded" : ""}`;
  card.dataset.key = key;
  card.innerHTML = `
    <button class="opp-row" type="button" data-action="toggle" title="${escapeHtml(sellerName)} · ${escapeHtml(opportunity.status)} · ${opportunity.comparableListings} comparables · score ${Math.round(opportunity.score ?? 0)}">
      <span class="opp-rank">${String(index + 1).padStart(2, "0")}</span>
      <span class="opp-main" data-action="weapon" data-weapon-slug="${escapeHtml(opportunity.weaponSlug)}">
        ${weaponThumb(opportunity.imageName, opportunity.weaponName, "sm")}
        <span class="opp-title">
          <strong>${escapeHtml(opportunity.weaponName)}</strong>
          <span class="opp-riven-line">${escapeHtml(opportunity.rivenName)}</span>
          <span class="opp-context"><span class="chip">${escapeHtml(opportunity.status)}</span><span class="chip">${opportunity.comparableListings} comps</span><span class="chip">${timeAgo(opportunity.updated)}</span>${inlineSignals}</span>
        </span>
      </span>
      <span class="opp-metrics">
        <span class="opp-metric"><span class="opp-metric-label">Buy</span><strong class="buy">${opportunity.buyPrice}◈</strong></span>
        <span class="opp-metric"><span class="opp-metric-label">Sell</span><strong class="sell">${opportunity.conservativeSellPrice ?? opportunity.targetSellPrice}◈</strong></span>
        <span class="opp-metric"><span class="opp-metric-label">Profit</span><strong class="profit">+${opportunity.expectedProfit}◈</strong></span>
        <span class="opp-metric"><span class="opp-metric-label">ROI</span><strong class="roi">${Math.round((opportunity.roi ?? 0) * 100)}%</strong></span>
        <span class="opp-metric opp-confidence"><span class="opp-metric-label">Conf</span><strong>${confidencePercent}%</strong>${confidenceBar(opportunity.confidence ?? 0)}</span>
      </span>
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
      renderOpportunityListSurface();
      setTimeout(() => {
        if (copiedOpportunityKey === opportunityKey(opportunity)) {
          copiedOpportunityKey = null;
          renderOpportunityListSurface();
        }
      }, 1600);
    });
    return;
  }
  if (action === "toggle") {
    const key = opportunityKey(opportunity);
    expandedOpportunityKey = expandedOpportunityKey === key ? null : key;
    renderOpportunityListSurface();
  }
}

if (elements.opps) {
  elements.opps.addEventListener("click", (event) => {
    const showMore = event.target instanceof HTMLElement ? event.target.closest("[data-show-more-opportunities]") : null;
    if (showMore && elements.opps.contains(showMore)) {
      opportunityVisibleCount += OPPORTUNITY_PAGE_SIZE;
      renderOpportunityListSurface();
      return;
    }
    const card = event.target instanceof HTMLElement ? event.target.closest(".opp-card") : null;
    if (!card || !elements.opps.contains(card)) return;
    const opportunity = renderedOpportunityByKey.get(card.dataset.key);
    if (opportunity) handleOpportunityClick(event, opportunity);
  });
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

function topSpreadRows(opportunities) {
  const rows = Array.isArray(opportunities) ? opportunities : [];
  const scored = rows.map((opportunity) => {
    const profit = Math.max(0, opportunity.expectedProfit ?? 0);
    const roi = Math.max(0, opportunity.roi ?? 0);
    const confidence = Math.max(0, Math.min(1, opportunity.confidence ?? opportunity.confidenceScore ?? 0.5));
    const tier = opportunity.quality?.tier ?? tierFromScore(opportunity.score);
    const tierScore = ({ A: 48, B: 24, C: 10, D: 0 })[tier] ?? 0;
    const bonus = (opportunity.quality?.signals ?? []).includes("undervalued_signature") ? 18 : 0;
    return { opportunity, score: (profit * 0.75) + (roi * 90) + (confidence * 28) + tierScore + bonus };
  });
  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.opportunity.roi !== left.opportunity.roi) return (right.opportunity.roi ?? 0) - (left.opportunity.roi ?? 0);
    if ((right.opportunity.expectedProfit ?? 0) !== (left.opportunity.expectedProfit ?? 0)) return (right.opportunity.expectedProfit ?? 0) - (left.opportunity.expectedProfit ?? 0);
    return (right.opportunity.updated ?? 0) - (left.opportunity.updated ?? 0);
  });
  return scored.map((item) => item.opportunity).slice(0, TOP_SPREAD_COUNT);
}

function renderTopSpreadCards(opportunities) {
  if (!elements.topSpreadCards) return;
  const items = opportunities.slice(0, TOP_SPREAD_COUNT);
  if (items.length === 0) {
    elements.topSpreadCards.innerHTML = `<div class="empty-state">No deals yet.</div>`;
    return;
  }
  elements.topSpreadCards.innerHTML = items.map((opportunity, index) => {
    const tier = opportunity.quality?.tier ?? tierFromScore(opportunity.score);
    const buy = opportunity.buyPrice == null ? "?" : `${opportunity.buyPrice}◈`;
    const target = opportunity.conservativeSellPrice == null ? opportunity.targetSellPrice : opportunity.conservativeSellPrice;
    const targetText = target == null ? "?" : `${target}◈`;
    return `
      <button class="top-spread-card" type="button" data-url="${escapeHtml(opportunity.url ?? "")}" data-weapon-slug="${escapeHtml(opportunity.weaponSlug ?? "")}">
        <strong>${escapeHtml(opportunity.weaponName)}</strong>
        <span>${escapeHtml(opportunity.rivenName)}</span>
        <small class="top-spread-meta">#${index + 1} · ${escapeHtml(buy)} → ${escapeHtml(targetText)} · ${escapeHtml(tier)}-tier · ${Math.round((opportunity.roi ?? 0) * 100)}% ROI</small>
        <b>+${Math.round(opportunity.expectedProfit ?? 0)}◈</b>
      </button>
    `;
  }).join("");
}

if (elements.topSpreadCards) {
  elements.topSpreadCards.addEventListener("click", (event) => {
    const card = event.target instanceof HTMLElement ? event.target.closest(".top-spread-card") : null;
    if (!card || !elements.topSpreadCards.contains(card)) return;
    if (card.dataset.url) window.open(card.dataset.url, "_blank", "noopener");
    else if (card.dataset.weaponSlug) openWeaponDetail(card.dataset.weaponSlug);
  });
}

function renderInstantWins(items) {
  const wins = Array.isArray(items) ? items : [];
  if (elements.instantSummary) {
    elements.instantSummary.textContent = wins.length === 0
      ? "No undervalued raw-auction listings clear the confidence gate right now."
      : `${wins.length} listing${wins.length === 1 ? "" : "s"} below same-signature peers or the usable weapon floor.`;
  }
  renderInstantPreview(wins);
  if (!elements.instantList) return;
  elements.instantList.textContent = "";
  if (wins.length === 0) {
    elements.instantList.innerHTML = `<div class="empty-state">No instant wins match the current cache. Wait for the next heartbeat or widen filters.</div>`;
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
      <div class="instant-stat"><span>${item.basis === "market-floor" ? "Floor p25" : "Sig p25"}</span><strong>${Math.round(value.p25 ?? 0)}◈</strong></div>
      <div class="instant-stat hide-mobile"><span>Uplift</span><strong class="uplift">+${Math.round(item.expected_uplift ?? 0)}◈</strong></div>
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
  const summaries = arcanes?.summaries ?? [];
  const summaryBySlug = new Map(summaries.map((summary) => [summary.slug, summary]));
  const packs = [...(arcanes?.packs ?? [])].sort((left, right) => compareArcanePacksForStrategy(left, right, strategy, summaryBySlug));
  const recommendations = arcaneRecommendationsForStrategy(arcanes, strategy, packs, summaryBySlug).sort(compareArcaneRecommendations);
  const bestPack = packs[0] ?? null;
  const bestMetric = bestPack ? arcaneStrategyMetric(bestPack, strategy, summaryBySlug) : null;
  const dissolveCount = recommendations.filter((entry) => entry.action === "dissolve").length;
  const scanned = summaries.filter((entry) => entry.lastScannedAt).length;
  const candidateRates = recommendations.filter((entry) => entry.action === "dissolve" && entry.sellValuePerVosfor > 0).map((entry) => entry.sellValuePerVosfor);
  const vosforFloor = candidateRates.length > 0 ? Math.min(...candidateRates) : null;

  if (elements.arcaneBestPack) elements.arcaneBestPack.textContent = bestPack && bestMetric ? `${Math.round(bestMetric.expectedPlat)}◈` : "—";
  if (elements.arcaneDissolveCount) elements.arcaneDissolveCount.textContent = formatNumber(dissolveCount);
  if (elements.arcaneCoverage) elements.arcaneCoverage.textContent = `${formatNumber(scanned)}/${formatNumber(arcanes?.reference?.items ?? summaries.length)}`;
  if (elements.arcaneVosforRate) elements.arcaneVosforRate.textContent = vosforFloor === null ? "—" : `${vosforFloor.toFixed(2)}◈`;

  const marketRows = arcaneMarketRows(summaries);
  const visiblePacks = packs.slice(0, ARCANE_PREVIEW_COUNT);
  const visibleRecommendations = recommendations.slice(0, ARCANE_PREVIEW_COUNT);
  const visibleMarketRows = marketRows.slice(0, ARCANE_PREVIEW_COUNT);
  elements.arcanePacks.innerHTML = packs.length === 0
    ? `<div class="empty-state">No Vosfor pack valuations yet.</div>`
    : visiblePacks.map((pack, index) => arcanePackCard(pack, index, strategy, summaryBySlug)).join("") + rankedPreviewNote("packs", visiblePacks.length, packs.length);
  elements.arcaneDissolves.innerHTML = recommendations.length === 0
    ? `<div class="empty-state">No sell/dissolve recommendations yet for ${escapeHtml(ARCANE_RAW_PLAT_STRATEGIES[strategy].label)}.</div>`
    : visibleRecommendations.map((entry) => arcaneDissolveCard(entry, strategy)).join("") + rankedPreviewNote("recommendations", visibleRecommendations.length, recommendations.length);
  elements.arcaneMarket.innerHTML = marketRows.length === 0
    ? `<div class="empty-state">No Arcane market rows yet.</div>`
    : visibleMarketRows.map(arcaneMarketRow).join("") + rankedPreviewNote("market rows", visibleMarketRows.length, marketRows.length);
}

function compareArcaneRecommendations(left, right) {
  const actionScore = { dissolve: 0, hold: 1, sell: 2 };
  const leftScore = actionScore[left.action] ?? 3;
  const rightScore = actionScore[right.action] ?? 3;
  if (leftScore !== rightScore) return leftScore - rightScore;
  return (right.deltaPlat ?? 0) - (left.deltaPlat ?? 0);
}

function arcaneMarketRows(summaries) {
  return [...(summaries ?? [])].sort((left, right) => {
    const leftPrice = left.rankMax?.sell?.p25 ?? left.rank0?.sell?.p25 ?? 0;
    const rightPrice = right.rankMax?.sell?.p25 ?? right.rank0?.sell?.p25 ?? 0;
    return rightPrice - leftPrice;
  });
}

function arcanePackCard(pack, index, strategy, summaryBySlug) {
  const strategyCopy = ARCANE_RAW_PLAT_STRATEGIES[strategy];
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
}

function arcaneDissolveCard(entry, strategy) {
  const strategyCopy = ARCANE_RAW_PLAT_STRATEGIES[strategy];
  return `
    <article class="arcane-dissolve-card ${entry.action}">
      <div>
        <div class="arcane-card-title">${escapeHtml(entry.name)} <span>R${entry.rank}</span></div>
        <div class="arcane-card-meta">${entry.sellPrice}◈ sale · ${entry.dissolutionVosfor} Vosfor · ${escapeHtml(entry.bestPackName ?? "best pack")} · ${escapeHtml(strategyCopy.shortLabel)}</div>
      </div>
      <div class="arcane-action">
        <strong>${escapeHtml(entry.action)}</strong>
        <span>${entry.deltaPlat >= 0 ? "+" : ""}${entry.deltaPlat.toFixed(1)}◈ EV</span>
      </div>
    </article>`;
}

function arcaneMarketRow(entry) {
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
}

function renderProductEngine(product) {
  if (!elements.productMethods) return;
  const opportunities = product?.opportunities ?? [];
  const methods = product?.methods ?? [];
  const best = opportunities[0] ?? null;
  if (elements.productSummary) elements.productSummary.textContent = product ? `${formatNumber(opportunities.length)} ranked actions · ${formatNumber(methods.length)} engines` : "";
  if (elements.productHealth) elements.productHealth.textContent = product?.dataHealth ? `${product.dataHealth.sources?.length ?? 0}` : "—";
  if (elements.productHealthSub) elements.productHealthSub.textContent = product?.dataHealth ? `sources · updated ${timeAgo(product.dataHealth.generatedAt)}` : "Waiting for product data";
  if (elements.productMethodsCount) elements.productMethodsCount.textContent = formatNumber(methods.filter((method) => method.status !== "red").length);
  if (elements.productOppCount) elements.productOppCount.textContent = formatNumber(opportunities.length);
  if (elements.productBestEv) elements.productBestEv.textContent = best ? `${Math.round(best.expectedPlat ?? 0)}◈` : "—";
  if (elements.productBestEvSub) elements.productBestEvSub.textContent = best ? `${best.title} · ${Math.round((best.confidenceScore ?? 0) * 100)}% confidence` : "No ranked method yet";

  const visibleMethods = methods.slice(0, PRODUCT_METHOD_PREVIEW_COUNT);
  elements.productMethods.innerHTML = methods.length === 0
    ? `<div class="empty-state">No method outputs yet.</div>`
    : visibleMethods.map((method) => productMethodCard(method, opportunities)).join("") + rankedPreviewNote("engines", visibleMethods.length, methods.length);

  const visibleOpportunities = opportunities.slice(0, PRODUCT_OPPORTUNITY_PREVIEW_COUNT);
  elements.productOpportunities.innerHTML = opportunities.length === 0
    ? `<div class="empty-state">No product recommendations yet.</div>`
    : visibleOpportunities.map(productOpportunityCard).join("") + rankedPreviewNote("best methods", visibleOpportunities.length, opportunities.length);
  renderPrimeRelics(product?.prime);
  renderExpansionMethods(product?.expansion);
}

function productMethodCard(method, opportunities = []) {
  const methodOpp = opportunities.find((opportunity) => opportunity.id === method.bestOpportunityId || opportunity.methodId === method.id);
  return `
    <article class="product-method-card method-engine-card status-${escapeHtml(method.status)}">
      <div>
        <strong>${escapeHtml(method.label)}</strong>
        <span>${formatNumber(method.opportunityCount)} opportunities · ${methodOpp ? `${Math.round(methodOpp.expectedPlat ?? 0)}◈ best EV` : "no best pick"}</span>
      </div>
      <div class="product-method-meta"><b>${formatNumber(method.opportunityCount)}</b><small>opps</small></div>
    </article>`;
}

function renderPrimeRelics(prime) {
  if (!elements.primeRelics) return;
  if (!prime) {
    elements.primeRelics.innerHTML = `<div class="empty-state">Prime/Relic engine has not refreshed.</div>`;
    return;
  }
  const farmRows = [
    ...((prime.bestRelicsToCrack ?? []).slice(0, 4).map((entry) => productRelicRow(entry, "crack"))),
    ...((prime.bestRelicsToSell ?? []).slice(0, 2).map((entry) => productRelicRow(entry, "sell"))),
  ];
  elements.primeRelics.innerHTML = `
    <div class="product-summary-line relic-summary">${escapeHtml(prime.summary ?? "")}</div>
    ${farmRows.length === 0 ? `<div class="empty-state">No relic EV rows available.</div>` : farmRows.join("")}
  `;
}

function expansionSections(expansion) {
  return [
    { label: "Mods", id: "mods", items: expansion?.mods ?? [], hint: "Rank-aware mods and upgrade inputs with market depth checks." },
    { label: "Syndicates", id: "syndicates", items: expansion?.syndicates ?? [], hint: "Standing-to-plat conversions and access assumptions." },
    { label: "Baro", id: "baro", items: expansion?.baro ?? [], hint: "Ducat inputs, timed vendor inventory, and resale windows." },
    { label: "Resources", id: "resources", items: expansion?.resources ?? [], hint: "Tradable open-world commodities gated by cycle windows and liquidity." },
    { label: "Event shocks", id: "event_shocks", items: expansion?.eventShocks ?? [], hint: "Temporary supply/demand shifts from live events." },
  ];
}

function renderExpansionMethods(expansion) {
  if (!elements.expansionMethods) return;
  if (!expansion) {
    elements.expansionMethods.innerHTML = `<div class="empty-state">Expansion engines have not refreshed.</div>`;
    return;
  }
  const cards = expansionSections(expansion).map((section) => expansionSection(section, false));
  const gates = (expansion.bespokeMarkets ?? []).map((gate) => `
    <details class="expansion-section gated">
      <summary>
        <span><strong>${escapeHtml(gate.label)}</strong><small>Gated bespoke market</small></span>
        <b>${escapeHtml(gate.status)}</b>
      </summary>
      <div class="expansion-body"><div class="empty-state">${escapeHtml(gate.warnings?.[0] ?? "Manual verification required before this market can be scored.")}</div></div>
    </details>`);
  elements.expansionMethods.innerHTML = [...cards, ...gates].join("");
}

function expansionSection(section, open = false) {
  const items = section.items ?? [];
  const topItems = items.slice(0, 3);
  return `
    <details class="expansion-section" ${open ? "open" : ""}>
      <summary>
        <span><strong>${escapeHtml(section.label)}</strong><small>${escapeHtml(section.hint)}</small></span>
        <b>${formatNumber(items.length)} opps</b>
      </summary>
      <div class="expansion-body">
        ${topItems.length === 0 ? `<div class="empty-state">No validated ${escapeHtml(section.label.toLowerCase())} opportunities yet.</div>` : topItems.map(productOpportunityCard).join("")}
        ${items.length > topItems.length ? `<button class="show-more-button" type="button" data-open-expansion-overlay="${escapeHtml(section.id)}">View all ${formatNumber(items.length)} ${escapeHtml(section.label)} rows</button>` : ""}
      </div>
    </details>`;
}

function renderRunNow(product) {
  if (!elements.runNowList) return;
  const runNow = product?.runNow;
  const activities = runNow?.activities ?? [];
  const liveStatus = currentLiveStatus(product, activities);
  const usableActivities = liveStatus.live ? activities : [];
  const totalPages = Math.max(1, Math.ceil(usableActivities.length / RUN_NOW_PAGE_SIZE));
  runNowPage = Math.min(runNowPage, totalPages - 1);
  const start = runNowPage * RUN_NOW_PAGE_SIZE;
  const pageItems = usableActivities.slice(start, start + RUN_NOW_PAGE_SIZE);
  const disclaimer = liveStatus.live ? "" : `<div class="empty-state live-disclaimer">${escapeHtml(liveStatus.message)}</div>`;
  elements.runNowList.innerHTML = disclaimer + (pageItems.length === 0
    ? `<div class="empty-state">No live activities passed validation.</div>`
    : pageItems.map((activity, index) => runNowCard(activity, start + index)).join(""));
  renderPageMeter(elements.runNowPager, runNowPage, totalPages, usableActivities.length, "live activities");
}

function runNowCard(activity, index) {
  return `
    <article class="run-card run-activity-card status-${escapeHtml(activity.status)}">
      <div class="run-rank">#${index + 1}</div>
      <div>
        <div class="product-card-title">${escapeHtml(activity.title)}</div>
        <p>${escapeHtml(activity.explanation?.recommendation ?? "")}</p>
        <div class="product-card-meta"><span>${escapeHtml(activity.activityType)}</span><span>${escapeHtml(activity.missionType ?? "mission")}</span><span>${activity.expiresAt ? `Expires ${shortTime(activity.expiresAt)}` : "No expiry"}</span><span>${escapeHtml(activity.node ?? "node n/a")}</span></div>
      </div>
      <div class="product-score run-score"><strong>${activity.evPerMinute}◈/min</strong><span>${Math.round((activity.confidenceScore ?? 0) * 100)}% confidence · ${escapeHtml(activity.status)}</span></div>
    </article>`;
}

function currentLiveStatus(product, activities) {
  const liveSource = product?.dataHealth?.sources?.find((source) => source.id === "live")
    ?? activities.find((activity) => activity.source?.fetchedAt)?.source
    ?? null;
  const fetchedAt = liveSource?.lastSuccessAt ?? liveSource?.fetchedAt ?? null;
  const ageMs = fetchedAt ? Date.now() - Date.parse(fetchedAt) : Infinity;
  const fresh = Number.isFinite(ageMs) && ageMs <= 60 * 60 * 1000;
  const healthy = liveSource?.status ? liveSource.status !== "red" : true;
  const hasValidatedLiveRows = Array.isArray(activities) && activities.length > 0;
  if (fresh && healthy && hasValidatedLiveRows) return { live: true, message: "" };
  if (!fresh) return { live: false, message: "No live Warframe activity source has refreshed successfully within the last hour. Run Now is hidden until the heartbeat receives fresh live data." };
  if (!healthy) return { live: false, message: "The live activity source is reporting a failed health state. Run Now is hidden until the heartbeat recovers it." };
  return { live: false, message: "No validated live activities are available from the current Warframe activity feed." };
}

function renderDataHealth(product) {
  if (!elements.dataHealthSources) return;
  const health = product?.dataHealth;
  const sources = health?.sources ?? [];
  if (elements.dataHealthSummary) elements.dataHealthSummary.textContent = health ? `${health.status.toUpperCase()} · ${sources.length} sources · updated ${timeAgo(health.generatedAt)}` : "Waiting for product data health.";
  elements.dataHealthSources.innerHTML = sources.length === 0 ? `<div class="empty-state">No source health rows yet.</div>` : sources.map((source) => {
    const lastUpdated = source.lastSuccessAt ?? source.lastFailureAt ?? health?.generatedAt;
    const description = healthSourceDescription(source);
    return `
      <article class="health-source-card health-status-row status-${escapeHtml(source.status)}">
        <div class="health-status-line"></div>
        <div class="health-source-main">
          <div class="health-source-title"><strong>${escapeHtml(source.label)}</strong><span class="health-updated">Updated ${lastUpdated ? timeAgo(lastUpdated) : "never"}</span></div>
          <p>${escapeHtml(description)}</p>
        </div>
      </article>`;
  }).join("");
}

function healthSourceDescription(source) {
  if (source.warnings?.[0]) return source.warnings[0];
  if (source.coverage) return `Updated ${source.coverage.label} coverage from ${source.source}; ${source.coverage.scanned} of ${source.coverage.total} rows are represented.`;
  if (source.schemaHash) return `Validated ${source.source} schema ${source.schemaHash}.`;
  return `Latest ${source.source} refresh completed without source warnings.`;
}

function renderPlanner(product) {
  if (!elements.todoList || !elements.portfolioList) return;
  hydrateProductControls(product);
  const personalization = product?.personalization;
  const todos = personalization?.todos ?? [];
  elements.todoList.innerHTML = todos.length === 0 ? `<div class="empty-state">No todos yet. Add a task or convert a recommendation into one.</div>` : todos.map((todo) => `
    <article class="planner-row planner-task status-${escapeHtml(todo.status)}">
      <div class="planner-task-state">${escapeHtml(todo.status.replace(/_/g, " "))}</div>
      <div><strong>${escapeHtml(todo.title)}</strong><span>${escapeHtml(todo.methodId ?? "manual")} ${todo.dueAt ? `· due ${shortTime(todo.dueAt)}` : "· no due date"}</span><p>${escapeHtml(todo.notes ?? "")}</p></div>
      <div class="planner-actions">
        <button class="ghost-button" type="button" data-todo-action="in_progress" data-todo-id="${escapeHtml(todo.id)}">Start</button>
        <button class="primary-button" type="button" data-todo-action="done" data-todo-id="${escapeHtml(todo.id)}">Done</button>
      </div>
    </article>
  `).join("");
  const portfolio = personalization?.portfolio ?? [];
  const alerts = personalization?.notificationRules ?? [];
  const advanced = product?.advanced;
  elements.portfolioList.innerHTML = `
    <article class="planner-row planner-metric"><div><strong>Realized profit</strong><span>${advanced?.tradeJournal?.realizedProfitPlat ?? 0}◈ across ${formatNumber(advanced?.tradeJournal?.tradeCount ?? 0)} trades</span></div></article>
    <article class="planner-row planner-metric"><div><strong>Portfolio entries</strong><span>${formatNumber(portfolio.length)} tracked · ${formatNumber(advanced?.portfolioAging?.length ?? 0)} aged lots</span></div></article>
    <article class="planner-row planner-metric"><div><strong>Alert rules</strong><span>${formatNumber(alerts.length)} configured · in-app/email/webhook channels modeled</span></div></article>
    <article class="planner-row planner-metric"><div><strong>Privacy</strong><span>${personalization?.profile?.privacy?.privateByDefault ? "Private by default" : "Sharing allowed"} · ${personalization?.exportAvailable ? "export ready" : "export unavailable"} · ${personalization?.deleteAvailable ? "delete ready" : "delete unavailable"}</span></div></article>
  `;
}

function hydrateProductControls(product) {
  const profile = product?.personalization?.profile;
  if (!profile) return;
  if (elements.profileDisplayName && document.activeElement !== elements.profileDisplayName) elements.profileDisplayName.value = profile.displayName ?? "";
  if (elements.assumptionTrace && document.activeElement !== elements.assumptionTrace) elements.assumptionTrace.value = profile.assumptions?.traceOpportunityCostPlat ?? "";
  if (elements.assumptionEndo && document.activeElement !== elements.assumptionEndo) elements.assumptionEndo.value = profile.assumptions?.endoPlatPerThousand ?? "";
  if (elements.assumptionCredits && document.activeElement !== elements.assumptionCredits) elements.assumptionCredits.value = profile.assumptions?.creditPlatPerMillion ?? "";
  if (elements.assumptionUnlocked && document.activeElement !== elements.assumptionUnlocked) elements.assumptionUnlocked.value = (profile.assumptions?.unlockedContent ?? []).join(", ");
  if (elements.privacyPrivate) elements.privacyPrivate.checked = Boolean(profile.privacy?.privateByDefault);
  if (elements.privacyAggregates) elements.privacyAggregates.checked = Boolean(profile.privacy?.allowAnonymousAggregates);
}

function productOpportunityCard(opportunity) {
  return `
    <article class="product-opportunity-card">
      <div>
        <div class="product-card-title">${escapeHtml(opportunity.title)} <span class="chip">${escapeHtml(opportunity.methodId)}</span></div>
        <p>${escapeHtml(opportunity.explanation?.recommendation ?? "")}</p>
        <div class="product-card-meta"><span>${escapeHtml(opportunity.action)}</span><span>${Math.round((opportunity.confidenceScore ?? 0) * 100)}% confidence</span><span>${Math.round((opportunity.liquidityScore ?? 0) * 100)}% liquidity</span></div>
      </div>
      <div class="product-score"><strong>${Math.round(opportunity.expectedPlat ?? 0)}◈</strong><span>${opportunity.expectedProfitPlat == null ? "EV" : `+${Math.round(opportunity.expectedProfitPlat)}◈ profit`}</span></div>
    </article>`;
}

function productOpportunityCompact(opportunity) {
  return `<article class="product-compact-row"><strong>${escapeHtml(opportunity.title)}</strong><span>${Math.round(opportunity.expectedPlat ?? 0)}◈ · ${Math.round((opportunity.confidenceScore ?? 0) * 100)}% conf</span></article>`;
}

function productRelicRow(entry, mode) {
  const tier = entry.chosenTier ?? {};
  return `<article class="product-compact-row relic-row">${itemThumb(entry.relic, "sm")}<strong>${escapeHtml(entry.relic?.name ?? "Relic")} · ${escapeHtml(tier.tier ?? "Intact")}</strong><span>${mode} · EV ${Math.round(tier.evPlat ?? 0)}◈ · ${Math.round((entry.confidence ?? 0) * 100)}% conf</span></article>`;
}

function marketAssetUrl(path) {
  const raw = String(path ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/^\/+/, "").replace(/^static\/assets\//, "");
  return `https://warframe.market/static/assets/${normalized}`;
}

function itemThumb(item, size = "sm") {
  if (item?.imageName) return weaponThumb(item.imageName, item.name ?? "Item", size);
  const url = marketAssetUrl(item?.thumb ?? item?.icon);
  if (url) return `<img class="weapon-thumb weapon-thumb-${size}" loading="lazy" src="${escapeHtml(url)}" alt="${escapeHtml(item.name ?? "Item")}" onerror="this.classList.add('weapon-thumb-blank'); this.removeAttribute('src');" />`;
  return `<span class="weapon-thumb weapon-thumb-${size} weapon-thumb-blank" aria-hidden="true"></span>`;
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
  const assetUrl = marketAssetUrl(summary?.thumb ?? summary?.icon);
  if (assetUrl) return `<img class="arcane-thumb" loading="lazy" src="${escapeHtml(assetUrl)}" alt="" aria-hidden="true" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'arcane-thumb-placeholder', textContent: '✦' }));" />`;
  if (!summary?.imageName) return `<span class="arcane-thumb-placeholder">✦</span>`;
  const escaped = encodeURIComponent(summary.imageName);
  return `<img class="arcane-thumb" loading="lazy" src="/img/${escaped}" alt="" aria-hidden="true" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'arcane-thumb-placeholder', textContent: '✦' }));" />`;
}

function renderWeapons(summaries) {
  if (!elements.weapons) return;
  elements.weapons.textContent = "";
  const totalPages = Math.max(1, Math.ceil((summaries?.length ?? 0) / MARKETS_PAGE_SIZE));
  marketsPage = Math.min(marketsPage, totalPages - 1);
  const start = marketsPage * MARKETS_PAGE_SIZE;
  const visibleSummaries = (summaries ?? []).slice(start, start + MARKETS_PAGE_SIZE);
  const fragment = document.createDocumentFragment();
  for (const summary of visibleSummaries) {
    const wrapper = document.createElement("template");
    wrapper.innerHTML = weaponSummaryCard(summary);
    fragment.appendChild(wrapper.content.firstElementChild);
  }
  elements.weapons.appendChild(fragment);
  if ((summaries ?? []).length === 0) elements.weapons.innerHTML = `<div class="empty-state">No weapon market summaries yet.</div>`;
  renderPageMeter(elements.marketsPager, marketsPage, totalPages, summaries?.length ?? 0, "weapons");
}

function weaponSummaryCard(summary) {
  const stats = summary.priceStats;
  const intel = summary.marketIntel ?? {};
  const strategy = intel.strategy ? intel.strategy.toUpperCase() : "—";
  const score = Number.isFinite(intel.marketScore) ? Math.round(intel.marketScore) : null;
  const spreadPct = Number.isFinite(intel.spreadPct) ? Math.round(intel.spreadPct * 100) : null;
  const floorPct = Number.isFinite(intel.floorDiscountPct) ? Math.round(intel.floorDiscountPct * 100) : null;
  return `
    <article class="weapon-card" data-weapon-slug="${escapeHtml(summary.slug)}">
      <div class="weapon-card-head">${weaponThumb(summary.imageName, summary.name, "sm")}<h3>${escapeHtml(summary.name)}</h3></div>
      <div class="weapon-card-tags"><span>${escapeHtml(strategy)}</span><span>${escapeHtml(intel.demand ?? "unknown")}</span>${score === null ? "" : `<span>${score} score</span>`}</div>
      <dl>
        <dt>Direct</dt><dd>${formatNumber(summary.directListings ?? summary.listings ?? 0)}</dd>
        <dt>Online</dt><dd>${formatNumber(summary.onlineListings ?? 0)}</dd>
        <dt>Floor/Med</dt><dd>${stats ? `${stats.min}◈/${stats.median}◈` : "—"}</dd>
        <dt>Spread</dt><dd>${spreadPct === null ? (stats ? `${stats.p25}→${stats.p75}` : "—") : `+${spreadPct}%`}</dd>
        <dt>Buy/Sell/Get</dt><dd>${Math.round(intel.buyScore ?? 0)}/${Math.round(intel.sellScore ?? 0)}/${Math.round(intel.farmScore ?? 0)}</dd>
        <dt>Dispo</dt><dd>${Number(summary.disposition ?? 0).toFixed(2)}${floorPct === null ? "" : ` · ${floorPct}% floor`}</dd>
      </dl>
    </article>`;
}

if (elements.weapons) {
  elements.weapons.addEventListener("click", (event) => {
    const card = event.target instanceof HTMLElement ? event.target.closest("[data-weapon-slug]") : null;
    if (!card || !elements.weapons.contains(card)) return;
    openWeaponDetail(card.dataset.weaponSlug);
  });
}

if (elements.marketsPager) {
  elements.marketsPager.addEventListener("click", (event) => {
    const delta = pageMeterDelta(event, elements.marketsPager);
    if (!delta) return;
    marketsPage = Math.max(0, marketsPage + delta);
    renderWeapons(latestState?.weaponSummaries ?? []);
  });
}

if (elements.runNowPager) {
  elements.runNowPager.addEventListener("click", (event) => {
    const delta = pageMeterDelta(event, elements.runNowPager);
    if (!delta) return;
    runNowPage = Math.max(0, runNowPage + delta);
    renderRunNow(latestState?.product);
  });
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
  const fragment = document.createDocumentFragment();
  for (const summary of items) {
    const listings = summary.directListings ?? summary.listings ?? 0;
    const strength = Math.max(0.12, Math.min(1, listings / maxListings));
    const score = Math.round(summary.marketIntel?.marketScore ?? 0);
    const hue = score >= 70 ? "74,222,128" : score >= 45 ? "56,189,248" : "251,191,36";
    const card = document.createElement("button");
    card.type = "button";
    card.className = "heat-card";
    card.style.background = `linear-gradient(135deg, rgba(${hue},${0.06 + strength * 0.18}), rgba(255,255,255,0.025))`;
    card.style.borderColor = `rgba(${hue},${0.16 + strength * 0.32})`;
    card.dataset.weaponSlug = summary.slug;
    card.innerHTML = `<strong>${escapeHtml(summary.name)}</strong><span>${formatNumber(listings)} listings · ${score || "—"} score</span>`;
    card.addEventListener("click", () => openWeaponDetail(summary.slug));
    fragment.appendChild(card);
  }
  elements.heatmap.appendChild(fragment);
  if (items.length < allItems.length) elements.heatmap.insertAdjacentHTML("beforeend", resultLimitNote("market tiles", items.length, allItems.length));
}

if (elements.heatmap) {
  elements.heatmap.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("[data-heatmap-more]") : null;
    if (!button) return;
    heatmapVisibleCount += HEATMAP_SHOW_MORE_BATCH;
    renderHeatmap(latestState?.summaries ?? []);
  });
}

function percentile(sortedValues, pct) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, pct * (sortedValues.length - 1)));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function roundRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawChart(opportunities) {
  const canvas = elements.chart;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0) {
    const nextWidth = Math.floor(rect.width);
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
  }
  if (rect.height > 0) {
    const nextHeight = Math.floor(rect.height);
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
  }
  const width = canvas.width || 1200;
  const height = canvas.height || 320;
  context.clearRect(0, 0, width, height);
  scatterHits = [];
  chartTooltipKey = null;
  if (elements.chartTip) elements.chartTip.hidden = true;

  const items = chartRenderItems(opportunities)
    .filter((entry) => (entry.expectedProfit ?? 0) > 0 && (entry.roi ?? 0) > 0)
    .sort((left, right) => chartImportance(right) - chartImportance(left))
    .slice(0, TOP_SPREAD_COUNT);

  const padding = { left: 18, right: 32, top: 18, bottom: 18 };
  const rowGap = 8;
  const rowHeight = Math.max(28, Math.min(46, (height - padding.top - padding.bottom - rowGap * Math.max(0, items.length - 1)) / Math.max(1, items.length)));
  const labelWidth = Math.min(310, Math.max(210, width * 0.28));
  const metricWidth = 218;
  const barX = padding.left + labelWidth;
  const barW = Math.max(120, width - padding.left - padding.right - labelWidth - metricWidth);
  const maxProfit = Math.max(1, ...items.map((entry) => Math.max(0, entry.expectedProfit ?? 0)));

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(74,222,128,0.08)");
  gradient.addColorStop(0.48, "rgba(123,111,239,0.045)");
  gradient.addColorStop(1, "rgba(56,189,248,0.05)");
  context.fillStyle = gradient;
  roundRectPath(context, 8, 8, width - 16, height - 16, 14);
  context.fill();

  if (items.length === 0) {
    context.fillStyle = "#a0a0b8";
    context.font = "13px Bricolage Grotesque, sans-serif";
    context.fillText("Waiting for ranked deals…", padding.left + 4, height / 2);
    return;
  }


  items.forEach((opportunity, index) => {
    const y = padding.top + index * (rowHeight + rowGap);
    const tier = opportunity.quality?.tier ?? tierFromScore(opportunity.score);
    const color = TIER_COLORS[tier] ?? TIER_COLORS.D;
    const profit = Math.max(0, opportunity.expectedProfit ?? 0);
    const roiPct = Math.round((opportunity.roi ?? 0) * 100);
    const fillW = Math.max(6, (profit / maxProfit) * barW);

    context.fillStyle = "rgba(255,255,255,0.035)";
    roundRectPath(context, padding.left, y, width - padding.left - padding.right, rowHeight, 10);
    context.fill();

    context.fillStyle = color;
    context.globalAlpha = 0.18;
    roundRectPath(context, barX, y + 7, barW, rowHeight - 14, 999);
    context.fill();
    context.globalAlpha = 0.95;
    roundRectPath(context, barX, y + 7, fillW, rowHeight - 14, 999);
    context.fill();
    context.globalAlpha = 1;

    context.fillStyle = "rgba(232,232,244,0.95)";
    context.font = "700 13px Bricolage Grotesque, sans-serif";
    context.fillText(`${index + 1}. ${opportunity.weaponName ?? "Unknown"}`, padding.left + 12, y + rowHeight * 0.48);
    context.fillStyle = "rgba(160,160,184,0.78)";
    context.font = "10px JetBrains Mono, monospace";
    context.fillText(`${opportunity.buyPrice ?? "?"}◈ → ${opportunity.targetSellPrice ?? "?"}◈`, padding.left + 12, y + rowHeight * 0.78);

    const metricX = barX + barW + 16;
    context.fillStyle = "rgba(74,222,128,0.96)";
    context.font = "700 15px JetBrains Mono, monospace";
    context.fillText(`+${Math.round(profit)}◈`, metricX, y + rowHeight * 0.45);
    context.fillStyle = "rgba(232,232,244,0.78)";
    context.font = "11px JetBrains Mono, monospace";
    context.fillText(`${roiPct}% ROI · ${tier}`, metricX, y + rowHeight * 0.76);

    scatterHits.push({ x: padding.left, y, w: width - padding.left - padding.right, h: rowHeight, cx: metricX, cy: y + rowHeight / 2, r: rowHeight / 2, opportunity });
  });
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
    if (Number.isFinite(hit.x) && Number.isFinite(hit.y) && Number.isFinite(hit.w) && Number.isFinite(hit.h)) {
      const inside = mx >= hit.x - tolerance && mx <= hit.x + hit.w + tolerance && my >= hit.y - tolerance && my <= hit.y + hit.h + tolerance;
      if (inside) {
        const centerX = hit.x + hit.w / 2;
        const centerY = hit.y + hit.h / 2;
        const dist = (centerX - mx) ** 2 + (centerY - my) ** 2;
        if (dist < bestDist) { best = hit; bestDist = dist; }
      }
      continue;
    }
    const dx = hit.cx - mx; const dy = hit.cy - my;
    const dist = dx * dx + dy * dy;
    const limit = (hit.r + tolerance) ** 2;
    if (dist <= limit && dist < bestDist) { best = hit; bestDist = dist; }
  }
  return best;
}

function scheduleChartRedraw() {
  if (currentPage !== "home" || chartResizeFrame) return;
  chartResizeFrame = window.requestAnimationFrame(() => {
    chartResizeFrame = 0;
    drawChart(opportunityView().filtered);
  });
}

function renderChartTooltip(hit) {
  const opportunity = hit.opportunity;
  const key = opportunityKey(opportunity);
  if (chartTooltipKey === key) return chartTooltipSize;
  chartTooltipKey = key;
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
  chartTooltipSize = {
    width: elements.chartTip.offsetWidth || 260,
    height: elements.chartTip.offsetHeight || 120,
  };
  return chartTooltipSize;
}

function positionChartTooltip(localX, localY, tipWidth, tipHeight) {
  const wrap = elements.chart.parentElement.getBoundingClientRect();
  const minLeft = 8;
  const maxLeft = Math.max(minLeft, wrap.width - tipWidth - 8);
  const left = Math.min(Math.max(localX + 12, minLeft), maxLeft);
  const below = localY + 12;
  const above = localY - tipHeight - 12;
  const maxTop = Math.max(8, wrap.height - tipHeight - 8);
  const top = below + tipHeight <= wrap.height - 8 ? below : Math.max(8, Math.min(above, maxTop));
  elements.chartTip.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

function updateChartPointer() {
  chartPointerFrame = 0;
  const pointer = pendingChartPointer;
  pendingChartPointer = null;
  if (!pointer || !elements.chart || !elements.chartTip) return;
  const rect = elements.chart.getBoundingClientRect();
  const scaleX = elements.chart.width / rect.width;
  const scaleY = elements.chart.height / rect.height;
  const localX = pointer.clientX - rect.left;
  const localY = pointer.clientY - rect.top;
  const hit = findScatterHit(localX * scaleX, localY * scaleY, 4);
  if (!hit) {
    elements.chartTip.hidden = true;
    chartTooltipKey = null;
    elements.chart.style.cursor = "default";
    return;
  }
  elements.chartTip.hidden = false;
  const size = renderChartTooltip(hit);
  const wrap = elements.chart.parentElement.getBoundingClientRect();
  positionChartTooltip(rect.left - wrap.left + localX, rect.top - wrap.top + localY, size.width, size.height);
  elements.chart.style.cursor = "pointer";
}

if (elements.chart) {
  elements.chart.addEventListener("mousemove", (event) => {
    pendingChartPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!chartPointerFrame) chartPointerFrame = window.requestAnimationFrame(updateChartPointer);
  });
  elements.chart.addEventListener("mouseleave", () => {
    pendingChartPointer = null;
    if (chartPointerFrame) {
      window.cancelAnimationFrame(chartPointerFrame);
      chartPointerFrame = 0;
    }
    elements.chartTip.hidden = true;
    chartTooltipKey = null;
    elements.chart.style.cursor = "default";
  });
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
        const intel = item.summary?.marketIntel ?? {};
        const priceLine = item.summary?.priceStats ? `score ${Math.round(intel.marketScore ?? 0)} · online ${item.summary.onlineListings ?? 0}/${item.summary.directListings ?? 0} · median ${item.summary.priceStats.median}◈` : "no cached price stats";
        html.push(`<button class="spotlight-item spotlight-weapon" data-index="${currentIndex}" type="button">${weaponThumb(item.imageName, item.name, "sm")}<div class="spotlight-body"><div class="spotlight-title">${escapeHtml(item.name)}</div><div class="spotlight-sub">${escapeHtml(item.group)} · ${escapeHtml(intel.strategy ?? "watch")} · ${escapeHtml(priceLine)}</div></div><span class="spotlight-arrow">↵</span></button>`);
      } else if (item.type === "arcane") {
        const priceLine = item.rankMax?.sell?.p25 ?? item.rank0?.sell?.p25;
        html.push(`<button class="spotlight-item spotlight-arcane" data-index="${currentIndex}" type="button">${arcaneThumb(item)}<div class="spotlight-body"><div class="spotlight-title">${escapeHtml(item.name)}</div><div class="spotlight-sub">${escapeHtml(item.rarity)} · ${item.dissolutionVosfor ?? "?"} Vosfor · ${priceLine == null ? "no scanned price" : `${priceLine}◈ p25`}</div></div><span class="spotlight-arrow">↵</span></button>`);
      } else if (item.type === "page") {
        html.push(`<button class="spotlight-item" data-index="${currentIndex}" type="button"><span class="spotlight-glyph">⌂</span><div class="spotlight-body"><div class="spotlight-title">${escapeHtml(item.name)}</div><div class="spotlight-sub">${escapeHtml(item.sub)}</div></div><span class="spotlight-arrow">›</span></button>`);
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
    ["page", "Pages"],
    ["weapon", "Weapons"],
    ["arcane", "Arcanes"],
  ]);
  const grouped = [];
  for (const type of ["filter", "page", "weapon", "arcane"]) {
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
    resetOpportunityPagination();
    closeSpotlightOverlay();
    navigate("opportunities");
  } else if (item.type === "page") {
    closeSpotlightOverlay();
    navigate(item.page, { settingsTab: item.settingsTab });
  }
}

function closeSpotlight() {
  clearTimeout(spotlightTimer);
  spotlightTimer = null;
  if (elements.spotlightResults) elements.spotlightResults.hidden = true;
  spotlightIndex = -1;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function clearSpotlightMorph(removeMorphingClass = true) {
  if (spotlightMorphAnimation) {
    spotlightMorphAnimation.cancel();
    spotlightMorphAnimation = null;
  }
  if (spotlightMorphNode) {
    spotlightMorphNode.remove();
    spotlightMorphNode = null;
  }
  if (removeMorphingClass) elements.spotlightOverlay?.classList.remove("morphing");
}

function runSpotlightMorph() {
  const overlay = elements.spotlightOverlay;
  const trigger = elements.spotlightTrigger;
  const inputRow = elements.spotlight?.querySelector(".spotlight-input-row");
  if (!overlay || !trigger || !inputRow || prefersReducedMotion()) return false;
  clearSpotlightMorph(false);

  const triggerRect = trigger.getBoundingClientRect();
  const rowRect = inputRow.getBoundingClientRect();
  if (triggerRect.width <= 0 || triggerRect.height <= 0 || rowRect.width <= 0 || rowRect.height <= 0) return false;

  const clone = document.createElement("div");
  clone.className = "spotlight-morph";
  clone.setAttribute("aria-hidden", "true");
  clone.innerHTML = trigger.innerHTML;
  clone.style.left = `${triggerRect.left}px`;
  clone.style.top = `${triggerRect.top}px`;
  clone.style.width = `${triggerRect.width}px`;
  clone.style.height = `${triggerRect.height}px`;
  overlay.appendChild(clone);
  spotlightMorphNode = clone;

  if (typeof clone.animate !== "function") {
    clone.remove();
    spotlightMorphNode = null;
    return false;
  }
  const deltaX = rowRect.left - triggerRect.left;
  const deltaY = rowRect.top - triggerRect.top;
  const scaleX = rowRect.width / triggerRect.width;
  const scaleY = rowRect.height / triggerRect.height;
  const targetTransform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
  const animation = clone.animate([
    { transform: "translate3d(0, 0, 0) scale(1)" },
    { transform: targetTransform },
  ], {
    duration: SPOTLIGHT_MORPH_MS,
    easing: "cubic-bezier(.16, 1, .3, 1)",
    fill: "both",
  });
  spotlightMorphAnimation = animation;
  let morphFinished = false;
  const finish = () => {
    if (morphFinished) return;
    morphFinished = true;
    const ownsMorph = spotlightMorphNode === clone || spotlightMorphAnimation === animation;
    if (!ownsMorph) return;
    overlay.classList.remove("morphing");
    if (spotlightMorphAnimation === animation) spotlightMorphAnimation = null;
    const removeClone = () => {
      if (spotlightMorphNode === clone) {
        clone.remove();
        spotlightMorphNode = null;
      }
    };
    clone.animate([
      { opacity: 1 },
      { opacity: 0 },
    ], {
      duration: SPOTLIGHT_CLONE_FADE_MS,
      easing: "cubic-bezier(.16, 1, .3, 1)",
      fill: "forwards",
    }).finished.then(removeClone, removeClone);
    window.setTimeout(removeClone, SPOTLIGHT_CLONE_FADE_MS + 30);
  };
  if (animation.finished) animation.finished.then(finish, finish);
  else {
    animation.onfinish = finish;
    animation.oncancel = finish;
  }
  window.setTimeout(finish, SPOTLIGHT_MORPH_MS + 40);
  return true;
}

function moveSpotlightSelection(delta) {
  if (spotlightItems.length === 0) return;
  spotlightIndex = (spotlightIndex + delta + spotlightItems.length) % spotlightItems.length;
  let selected = null;
  for (const button of elements.spotlightResults.querySelectorAll(".spotlight-item")) {
    const active = Number(button.dataset.index) === spotlightIndex;
    button.classList.toggle("active", active);
    if (active) selected = button;
  }
  selected?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function openSpotlightOverlay() {
  const overlay = elements.spotlightOverlay;
  if (!overlay) return;
  window.clearTimeout(spotlightCloseTimer);
  if (overlay.hidden === false && !overlay.classList.contains("closing")) {
    elements.spotlightInput?.focus();
    return;
  }
  clearSpotlightMorph();
  overlay.classList.remove("closing", "opening", "morphing");
  overlay.hidden = false;
  document.body.classList.add("spotlight-active");
  const value = (elements.spotlightInput?.value ?? "").trim();
  if (value === "") renderSpotlightHints();
  else void updateSpotlight(value);
  const shouldMorph = !prefersReducedMotion();
  if (shouldMorph) overlay.classList.add("morphing");
  window.requestAnimationFrame(() => {
    overlay.classList.add("opening");
    const didMorph = shouldMorph && runSpotlightMorph();
    if (!didMorph) overlay.classList.remove("morphing");
    try {
      elements.spotlightInput?.focus({ preventScroll: true });
    } catch {
      elements.spotlightInput?.focus();
    }
  });
}

function renderSpotlightHints() {
  const results = elements.spotlightResults;
  if (!results) return;
  spotlightItems = [
    { type: "page", name: "Opportunities", sub: "", page: "opportunities", __index: 0 },
    { type: "page", name: "Instant Wins", sub: "", page: "instant", __index: 1 },
    { type: "page", name: "Arcanes", sub: "", page: "arcanes", __index: 2 },
  ];
  spotlightIndex = -1;
  results.removeAttribute("hidden");
  results.innerHTML = `
    <div class="spotlight-section-label">Try this</div>
    <button class="spotlight-item" data-index="0" type="button"><span class="spotlight-glyph">◎</span><div class="spotlight-body"><div class="spotlight-title">Opportunities</div></div><span class="spotlight-arrow">›</span></button>
    <button class="spotlight-item" data-index="1" type="button"><span class="spotlight-glyph">ϟ</span><div class="spotlight-body"><div class="spotlight-title">Instant Wins</div></div><span class="spotlight-arrow">›</span></button>
    <button class="spotlight-item" data-index="2" type="button"><span class="spotlight-glyph">✦</span><div class="spotlight-body"><div class="spotlight-title">Arcanes</div></div><span class="spotlight-arrow">›</span></button>
    <div class="spotlight-item spotlight-hint"><span class="spotlight-glyph">⌕</span><div class="spotlight-body"><div class="spotlight-title">Search items, weapons, filters...</div></div></div>`;
  for (const button of results.querySelectorAll(".spotlight-item:not(.spotlight-hint)")) button.addEventListener("click", () => activateSpotlightItem(Number(button.dataset.index)));
}

function closeSpotlightOverlay() {
  const overlay = elements.spotlightOverlay;
  document.body.classList.remove("spotlight-active");
  window.clearTimeout(spotlightCloseTimer);
  clearSpotlightMorph();
  if (!overlay) {
    closeSpotlight();
    return;
  }
  const finishClose = () => {
    overlay.hidden = true;
    overlay.classList.remove("closing", "opening", "morphing");
    closeSpotlight();
  };
  if (overlay.hidden || prefersReducedMotion()) {
    finishClose();
    return;
  }
  overlay.classList.remove("opening", "morphing");
  overlay.classList.add("closing");
  spotlightCloseTimer = window.setTimeout(finishClose, SPOTLIGHT_CLOSE_MS);
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
    if (elements.rankedOverlay?.hidden === false) closeRankedOverlay();
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
  const intel = summary?.marketIntel ?? {};
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
          <div class="wd-opp-price"><span class="price">${opp.buyPrice}◈</span> → ${opp.conservativeSellPrice ?? opp.targetSellPrice}◈ <span class="profit">+${opp.expectedProfit}◈</span></div>
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
          <span>market score <strong>${Math.round(intel.marketScore ?? 0)}</strong></span>
          <span>best for <strong>${escapeHtml(intel.strategy ?? "watch")}</strong></span>
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
    watchlistText: watchlistTermsForSubmit().join("\n"),
    minProfit: Number(elements.minProfit.value),
    minRoi: Number(elements.minRoi.value),
    minGroupSize: Number(elements.minGroupSize.value),
    minBuyPrice: elements.minBuyPrice.value.trim() === "" ? null : Number(elements.minBuyPrice.value),
    maxBuyPrice: elements.maxBuyPrice.value.trim() === "" ? null : Number(elements.maxBuyPrice.value),
    maxSellPrice: elements.maxSellPrice.value.trim() === "" ? null : Number(elements.maxSellPrice.value),
    statuses,
  };
}

function numberOrUndefined(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitCsv(value) {
  return String(value ?? "").split(/[,\n]+/).map((entry) => entry.trim()).filter(Boolean);
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
  return String(value ?? "").replace(/[&<>'"]/g, (character) => HTML_ESCAPE[character]);
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
    resetOpportunityPagination();
    renderOpportunitySurfaces();
  });
}

if (elements.watchlist) {
  elements.watchlist.addEventListener("input", scheduleWatchlistSuggestions);
  elements.watchlist.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addWatchlistSelection(elements.watchlist.value);
    }
    if (event.key === "Escape" && elements.watchlistSuggestions) elements.watchlistSuggestions.hidden = true;
  });
}

if (elements.watchlistSuggestions) {
  elements.watchlistSuggestions.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("[data-watchlist-add]") : null;
    if (!button || !elements.watchlistSuggestions.contains(button)) return;
    addWatchlistSelection(button.dataset.watchlistAdd);
  });
}

if (elements.watchlistChips) {
  elements.watchlistChips.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("[data-watchlist-remove]") : null;
    if (!button || !elements.watchlistChips.contains(button)) return;
    removeWatchlistSelection(button.dataset.watchlistRemove);
  });
}

if (elements.form) {
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = elements.form.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = true;
    try {
      spotlightFilter = null;
      resetOpportunityPagination();
      await postJson("/api/scan", collectConfig());
      navigate("opportunities");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
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
  return `<span class="confbar" aria-label="${Math.round(score * 100)}% confidence">${CONFIDENCE_BAR_SEGMENTS[filled]}</span>`;
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
  return NUMBER_FORMATTER.format(Number(value ?? 0));
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
setInterval(() => { loadState().catch(() => refreshDerived().catch(() => undefined)); }, HEARTBEAT_MS);
window.addEventListener("resize", scheduleChartRedraw);
