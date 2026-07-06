import assert from "node:assert/strict";
import { McpSseServer } from "../src/mcp.js";
import { ENVELOPE_VERSION, EnvelopeSchema, type Envelope } from "../src/mcp/schemas.js";
import type { ThePlatExchangeService } from "../src/wfm/scanner.js";
import type {
  ArcaneDashboardState,
  ArcaneMarketSummary,
  ArcanePackValuation,
  DashboardState,
  PriceStats,
  ScanStatus,
  TraderConfig,
} from "../src/wfm/types.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: unknown;
  method: string;
  params?: unknown;
}

interface DispatchableMcpServer {
  dispatch(request: JsonRpcRequest): Promise<Record<string, unknown> | null>;
}

const nowIso = "2026-07-06T00:05:00.000Z";
const arcaneStartedIso = "2026-07-06T00:03:00.000Z";
const staleRivenFinishedIso = "2026-07-05T23:00:00.000Z";

const config: TraderConfig = {
  watchlist: [],
  minProfit: 10,
  minRoi: 0.2,
  minGroupSize: 3,
  minBuyPrice: null,
  maxBuyPrice: null,
  maxSellPrice: null,
  statuses: ["ingame", "online"],
  maxResults: 25,
  scanAllWhenWatchlistEmpty: true,
};

const rivenStatus: ScanStatus = {
  initialized: true,
  running: false,
  reason: "riven-stale-test-sentinel",
  finishedAt: staleRivenFinishedIso,
  scannedWeapons: 1,
  totalWeapons: 50,
  lastMessage: "Riven status is intentionally stale and partial; arcane tools must not use it.",
};

const arcaneStatus: ScanStatus = {
  initialized: true,
  running: true,
  reason: "arcane-hot-test",
  startedAt: arcaneStartedIso,
  scannedWeapons: 2,
  totalWeapons: 0,
  lastMessage: "Arcane scan in progress",
};


function summary(slug: string, name: string, sell: PriceStats, dissolutionVosfor: number): ArcaneMarketSummary {
  return {
    slug,
    name,
    rarity: "legendary",
    maxRank: 5,
    listings: sell.count,
    sellListings: sell.count,
    buyListings: 1,
    onlineSellListings: Math.max(0, sell.count - 1),
    onlineBuyListings: 1,
    rank0: {
      rank: 0,
      sell,
      buy: { count: 1, min: 50, p25: 50, median: 50, p75: 50, p90: 50, max: 50 },
      sellOrderCount: sell.count,
      buyOrderCount: 1,
      onlineSellOrderCount: Math.max(0, sell.count - 1),
      onlineBuyOrderCount: 1,
      totalSellQuantity: sell.count,
      totalBuyQuantity: 1,
    },
    dissolutionVosfor,
    priceVsVosfor: {
      rank: 0,
      sellPrice: sell.p25,
      platinumPerVosfor: Math.round((sell.p25 / dissolutionVosfor) * 1000) / 1000,
    },
    url: `https://warframe.market/items/${slug}`,
  };
}

const energizeSummary = summary(
  "arcane_energize",
  "Arcane Energize",
  { count: 4, min: 70, p25: 80, median: 95, p75: 110, p90: 125, max: 140 },
  98,
);
const graceSummary = summary(
  "arcane_grace",
  "Arcane Grace",
  { count: 3, min: 20, p25: 24, median: 30, p75: 35, p90: 40, max: 42 },
  42,
);

const eidolonPack: ArcanePackValuation = {
  packId: "eidolon_pack",
  packName: "Eidolon Pack",
  costVosfor: 200,
  creditCost: 50_000,
  rewardsPerPack: 3,
  expectedPlat: 120,
  expectedPlatPerVosfor: 0.6,
  expectedVosforReturn: 210,
  netVosforBurn: -10,
  coveragePct: 1,
  confidence: 0.91,
  missingPriceCount: 0,
  pricedDropCount: 2,
  maxRankCoveragePct: 1,
  highValueConfidence: 0.91,
  missingMaxRankPriceCount: 0,
  maxRankPricedDropCount: 2,
  highValueThreshold: 180,
  highValueTargetCount: 1,
  highValueTargetChance: 0.25,
  chanceAtLeastOneHighValue: 0.57813,
  expectedHighValueCopies: 0.75,
  expectedHighValueMaxedPlat: 30,
  expectedHighValueMaxedPlatPerVosfor: 0.15,
  defaultStrategy: "high_value_maxed",
  strategyMetrics: {
    high_value_maxed: {
      strategy: "high_value_maxed",
      label: "High-value max-out",
      expectedPlat: 30,
      expectedPlatPerVosfor: 0.15,
      confidence: 0.91,
      coveragePct: 1,
      targetChance: 0.25,
      chanceAtLeastOneTarget: 0.57813,
      expectedTargetCopies: 0.75,
      targetCount: 1,
    },
    rank0_bulk: {
      strategy: "rank0_bulk",
      label: "Rank-0 bulk EV",
      expectedPlat: 120,
      expectedPlatPerVosfor: 0.6,
      confidence: 0.91,
      coveragePct: 1,
      targetChance: 1,
      chanceAtLeastOneTarget: 1,
      expectedTargetCopies: 3,
      targetCount: 2,
    },
  },
  topDrops: [
    {
      arcaneSlug: "arcane_energize",
      arcaneName: "Arcane Energize",
      rarity: "legendary",
      chance: 0.25,
      rank: 0,
      priceUsed: 80,
      dissolutionVosfor: 98,
      expectedCopies: 0.75,
      expectedPlat: 60,
      expectedVosfor: 73.5,
      sourcePrice: "rank0_sell_p25",
      maxRank: 5,
      copiesToMax: 21,
      maxRankPrice: 840,
      highValueTarget: true,
      expectedHighValueMaxedPlat: 30,
      sourceMaxRankPrice: "rank5_sell_p25",
    },
    {
      arcaneSlug: "arcane_grace",
      arcaneName: "Arcane Grace",
      rarity: "rare",
      chance: 0.75,
      rank: 0,
      priceUsed: 24,
      dissolutionVosfor: 42,
      expectedCopies: 2.25,
      expectedPlat: 54,
      expectedVosfor: 94.5,
      sourcePrice: "rank0_sell_p25",
      maxRank: 5,
      copiesToMax: 21,
      maxRankPrice: 100,
      highValueTarget: false,
      expectedHighValueMaxedPlat: 0,
      sourceMaxRankPrice: "rank5_sell_p25",
    },
  ],
  source: "test fixture",
  notes: [],
};

const secondaryPack: ArcanePackValuation = {
  ...eidolonPack,
  packId: "secondary_pack",
  packName: "Secondary Pack",
  expectedPlat: 30,
  expectedPlatPerVosfor: 0.15,
  confidence: 0.5,
  highValueConfidence: 0.95,
  highValueTargetCount: 1,
  highValueTargetChance: 1,
  chanceAtLeastOneHighValue: 1,
  expectedHighValueCopies: 3,
  expectedHighValueMaxedPlat: 120,
  expectedHighValueMaxedPlatPerVosfor: 0.6,
  strategyMetrics: {
    high_value_maxed: {
      strategy: "high_value_maxed",
      label: "High-value max-out",
      expectedPlat: 120,
      expectedPlatPerVosfor: 0.6,
      confidence: 0.95,
      coveragePct: 1,
      targetChance: 1,
      chanceAtLeastOneTarget: 1,
      expectedTargetCopies: 3,
      targetCount: 1,
    },
    rank0_bulk: {
      strategy: "rank0_bulk",
      label: "Rank-0 bulk EV",
      expectedPlat: 30,
      expectedPlatPerVosfor: 0.15,
      confidence: 0.5,
      coveragePct: 1,
      targetChance: 1,
      chanceAtLeastOneTarget: 1,
      expectedTargetCopies: 3,
      targetCount: 1,
    },
  },
  topDrops: [
    {
      arcaneSlug: "arcane_grace",
      arcaneName: "Arcane Grace",
      rarity: "rare",
      chance: 1,
      rank: 0,
      priceUsed: 10,
      dissolutionVosfor: 42,
      expectedCopies: 3,
      expectedPlat: 30,
      expectedVosfor: 126,
      sourcePrice: "rank0_sell_p25",
      maxRank: 5,
      copiesToMax: 21,
      maxRankPrice: 840,
      highValueTarget: true,
      expectedHighValueMaxedPlat: 120,
      sourceMaxRankPrice: "rank5_sell_p25",
    },
  ],
};
const highValueRecommendations: ArcaneDashboardState["dissolveRecommendations"] = [
  {
    slug: "arcane_energize",
    name: "Arcane Energize",
    rank: 0,
    sellPrice: 80,
    dissolutionVosfor: 98,
    bestPackId: "secondary_pack",
    bestPackName: "Secondary Pack",
    estimatedRollValue: 58.8,
    sellValuePerVosfor: 0.816,
    rollValuePerVosfor: 0.6,
    deltaPlat: -21.2,
    action: "sell",
    strategy: "high_value_maxed",
    confidence: 0.95,
    reasons: ["High-value max-out roll value trails direct sale."],
    url: energizeSummary.url,
  },
  {
    slug: "arcane_grace",
    name: "Arcane Grace",
    rank: 0,
    sellPrice: 24,
    dissolutionVosfor: 42,
    bestPackId: "secondary_pack",
    bestPackName: "Secondary Pack",
    estimatedRollValue: 25.2,
    sellValuePerVosfor: 0.571,
    rollValuePerVosfor: 0.6,
    deltaPlat: 1.2,
    action: "hold",
    strategy: "high_value_maxed",
    confidence: 0.95,
    reasons: ["Hold because values are too close."],
    url: graceSummary.url,
  },
];

const rank0BulkRecommendations: ArcaneDashboardState["dissolveRecommendations"] = [
  {
    slug: "arcane_energize",
    name: "Arcane Energize",
    rank: 0,
    sellPrice: 80,
    dissolutionVosfor: 98,
    bestPackId: "eidolon_pack",
    bestPackName: "Eidolon Pack",
    estimatedRollValue: 100,
    sellValuePerVosfor: 0.816,
    rollValuePerVosfor: 1.02,
    deltaPlat: 20,
    action: "dissolve",
    strategy: "rank0_bulk",
    confidence: 0.91,
    reasons: ["Vosfor roll value beats direct sale."],
    url: energizeSummary.url,
  },
  {
    slug: "arcane_grace",
    name: "Arcane Grace",
    rank: 0,
    sellPrice: 24,
    dissolutionVosfor: 42,
    bestPackId: "eidolon_pack",
    bestPackName: "Eidolon Pack",
    estimatedRollValue: 42.86,
    sellValuePerVosfor: 0.571,
    rollValuePerVosfor: 1.02,
    deltaPlat: 18.86,
    action: "hold",
    strategy: "rank0_bulk",
    confidence: 0.91,
    reasons: ["Hold because market spread is thin."],
    url: graceSummary.url,
  },
];

const arcaneState: ArcaneDashboardState = {
  generatedAt: nowIso,
  reference: {
    items: 3,
    packs: 2,
    withDissolution: 2,
    versionsUpdatedAt: nowIso,
  },
  totals: {
    itemsWithOrders: 2,
    orders: 7,
    packs: 2,
    recommendations: 2,
  },
  status: arcaneStatus,
  summaries: [energizeSummary, graceSummary],
  packs: [eidolonPack, secondaryPack],
  dissolveRecommendations: highValueRecommendations,
  dissolveRecommendationsByStrategy: {
    high_value_maxed: highValueRecommendations,
    rank0_bulk: rank0BulkRecommendations,
  },
  mechanics: {
    packCostVosfor: 200,
    rewardsPerPack: 3,
    priceRank: 0,
    priceStatistic: "p25",
    defaultPackStrategy: "high_value_maxed",
    highValueThreshold: 180,
    copiesToMaxFormula: "triangular(maxRank + 1)",
    sources: ["test fixture"],
  },
};

const dashboardState: DashboardState = {
  generatedAt: nowIso,
  refreshMs: 60_000,
  apiBase: "https://example.invalid",
  scanMode: "tiered",
  config,
  status: rivenStatus,
  reference: {
    weapons: 50,
    attributes: 12,
    versionsUpdatedAt: staleRivenFinishedIso,
  },
  totals: {
    weaponsWithAuctions: 1,
    auctions: 1,
    opportunities: 0,
  },
  opportunities: [],
  weaponSummaries: [],
  arcanes: arcaneState,
};

class FakeService {
  readonly refreshCalls: string[] = [];
  readonly refreshArcaneCalls: string[] = [];

  getState(): DashboardState {
    return dashboardState;
  }

  refresh(reason: string): Promise<void> {
    this.refreshCalls.push(reason);
    return Promise.resolve();
  }

  refreshArcanes(reason: string): Promise<void> {
    this.refreshArcaneCalls.push(reason);
    return Promise.resolve();
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function requireString(value: unknown, label: string): string {
  assert(typeof value === "string", `${label} must be a string`);
  return value;
}

function requireEnvelope(value: unknown, label: string): Envelope<unknown> {
  const parsed = EnvelopeSchema.safeParse(value);
  assert(parsed.success, `${label} must be a valid MCP envelope: ${parsed.success ? "" : parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  return parsed.data;
}

function firstOf(values: readonly unknown[], label: string): unknown {
  const value = values.at(0);
  assert(value !== undefined, `${label} must contain at least one entry`);
  return value;
}

function assertNoEnvelopeValidationWarning(envelope: Envelope<unknown>, label: string): void {
  assert(
    !envelope.meta.warnings.some((warning) => warning.code === "validation_failed"),
    `${label} envelope should satisfy the shared schema`,
  );
}

const fakeService = new FakeService();
// The production constructor is nominal because ThePlatExchangeService has private members; this fake supplies the public surface MCP tools exercise.
const server = new McpSseServer(fakeService as unknown as ThePlatExchangeService);
// Private dispatch keeps the test in-process and avoids opening an HTTP/SSE server.
const dispatchable = server as unknown as DispatchableMcpServer;

async function dispatch(request: JsonRpcRequest): Promise<Record<string, unknown>> {
  const response = await dispatchable.dispatch(request);
  assert(response !== null, `${request.method} should return a JSON-RPC response`);
  return response;
}

function extractToolEnvelope(response: Record<string, unknown>, label: string): Envelope<unknown> {
  assert(!("error" in response), `${label} should not return a JSON-RPC error`);
  const result = requireRecord(response.result, `${label} result`);
  const envelope = requireEnvelope(result.structuredContent, `${label} structuredContent`);
  assert.equal(envelope.version, ENVELOPE_VERSION);

  const content = requireArray(result.content, `${label} legacy content`);
  const firstContent = requireRecord(firstOf(content, `${label} legacy content`), `${label} first content entry`);
  assert.equal(firstContent.type, "text");
  const parsedText: unknown = JSON.parse(requireString(firstContent.text, `${label} content text`));
  assert.deepEqual(parsedText, envelope, `${label} legacy text content must mirror structuredContent`);
  assertNoEnvelopeValidationWarning(envelope, label);
  return envelope;
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<Envelope<unknown>> {
  const response = await dispatch({
    jsonrpc: "2.0",
    id: `call-${name}`,
    method: "tools/call",
    params: { name, arguments: args },
  });
  return extractToolEnvelope(response, name);
}

const listResponse = await dispatch({ jsonrpc: "2.0", id: "list-tools", method: "tools/list" });
assert(!("error" in listResponse), "tools/list should not fail");
const toolsResult = requireRecord(listResponse.result, "tools/list result");
const tools = requireArray(toolsResult.tools, "tools/list tools").map((tool, index) => requireRecord(tool, `tool ${index}`));
const toolNames = tools.map((tool, index) => requireString(tool.name, `tool ${index} name`));
for (const expectedName of [
  "arcane_health",
  "arcane_refresh",
  "arcane_packs",
  "arcane_dissolve_recommendations",
  "arcane_market",
  "arcane_detail",
]) {
  assert(toolNames.includes(expectedName), `tools/list must expose ${expectedName}`);
}
assert.equal(new Set(toolNames).size, toolNames.length, "tools/list must not expose duplicate tool names");

const health = await callTool("arcane_health");
assert.equal(health.data, null, "arcane_health returns a meta-only envelope");
assert.deepEqual(
  health.meta.coverage,
  { scanned: 2, total: 3, pct: 2 / 3 },
  "arcane_health coverage must use arcane scanned count and arcane reference item count",
);
assert.equal(health.meta.scan_running, true, "arcane_health scan_running must come from arcane status");
assert.equal(health.meta.data_source, "live", "running fresh arcane scans should be reported as live");
assert.equal(health.meta.quality, "yellow", "2 of 3 arcane coverage should be yellow while the arcane scan is still running");
assert(
  !health.meta.warnings.some((warning) => warning.code === "stale_data" || warning.code === "partial_scan"),
  "arcane_health must not inherit stale or partial warnings from the riven scan status",
);

const refresh = await callTool("arcane_refresh");
const refreshData = requireRecord(refresh.data, "arcane_refresh data");
assert.equal(refreshData.accepted, true, "arcane_refresh accepts the refresh request");
assert.equal(fakeService.refreshArcaneCalls.length, 1, "arcane_refresh must schedule exactly one arcane refresh");
assert.equal(fakeService.refreshCalls.length, 0, "arcane_refresh must not schedule a riven refresh");

const packs = requireArray((await callTool("arcane_packs", { limit: 1 })).data, "arcane_packs data");
assert.equal(packs.length, 1, "arcane_packs honors the requested limit");
const firstPack = requireRecord(firstOf(packs, "arcane_packs data"), "first arcane pack");
assert.equal(firstPack.packId, "secondary_pack", "arcane_packs defaults to high-value max-out ranking");
assert.equal(firstPack.expectedHighValueMaxedPlat, 120);
assert.equal(firstPack.expectedHighValueMaxedPlatPerVosfor, 0.6);
const firstPackMetrics = requireRecord(firstPack.strategyMetrics, "first arcane pack strategyMetrics");
const firstPackHighValueMetrics = requireRecord(firstPackMetrics.high_value_maxed, "first arcane pack high-value metrics");
assert.equal(firstPackHighValueMetrics.expectedPlat, 120);
const rank0Packs = requireArray((await callTool("arcane_packs", { limit: 1, strategy: "rank0_bulk" })).data, "rank0 arcane_packs data");
const firstRank0Pack = requireRecord(firstOf(rank0Packs, "rank0 arcane_packs data"), "first rank0 arcane pack");
assert.equal(firstRank0Pack.packId, "eidolon_pack", "arcane_packs strategy=rank0_bulk switches back to old rank-0 EV ordering");
assert.equal(firstRank0Pack.expectedPlat, 120);
assert.equal(firstRank0Pack.expectedPlatPerVosfor, 0.6);
const firstRank0PackDrops = requireArray(firstRank0Pack.topDrops, "first rank0 arcane pack topDrops");
assert.equal(firstRank0PackDrops.length, 2, "arcane_packs includes the pack drop economics clients need to explain EV");

const recommendations = requireArray(
  (await callTool("arcane_dissolve_recommendations", { limit: 1 })).data,
  "arcane_dissolve_recommendations data",
);
assert.equal(recommendations.length, 1, "arcane_dissolve_recommendations honors the requested limit");
const firstRecommendation = requireRecord(firstOf(recommendations, "arcane recommendations"), "first recommendation");
assert.equal(firstRecommendation.slug, "arcane_energize");
assert.equal(firstRecommendation.action, "sell");
assert.equal(firstRecommendation.bestPackId, "secondary_pack");
assert.equal(firstRecommendation.strategy, "high_value_maxed");

const market = requireArray((await callTool("arcane_market", { limit: 1 })).data, "arcane_market data");
assert.equal(market.length, 1, "arcane_market honors the requested limit");
const marketSummary = requireRecord(firstOf(market, "arcane market"), "first market summary");
assert.equal(marketSummary.slug, "arcane_energize");
assert.equal(marketSummary.name, "Arcane Energize");
assert.deepEqual(marketSummary.rank0, energizeSummary.rank0, "arcane_market returns the observable rank market book for each arcane");

const detail = await callTool("arcane_detail", { slug: "arcane_energize" });
const detailData = requireRecord(detail.data, "arcane_detail data");
const detailSummary = requireRecord(detailData.summary, "arcane_detail summary");
assert.equal(detailSummary.slug, "arcane_energize", "arcane_detail returns the requested summary");
assert.equal(detailSummary.name, "Arcane Energize");
const detailRecommendation = requireRecord(detailData.recommendation, "arcane_detail recommendation");
assert.equal(detailRecommendation.slug, "arcane_energize", "arcane_detail returns the requested arcane's recommendation");
assert.equal(detailRecommendation.action, "sell");
assert.equal(detailRecommendation.strategy, "high_value_maxed");
const detailDrops = requireArray(detailData.topPackDrops, "arcane_detail topPackDrops");
assert.equal(detailDrops.length, 1, "arcane_detail returns only pack drops for the requested arcane");
const energizeDrop = requireRecord(firstOf(detailDrops, "arcane_detail topPackDrops"), "arcane_detail energize drop");
assert.equal(energizeDrop.packId, "eidolon_pack");
assert.equal(energizeDrop.packName, "Eidolon Pack");
assert.equal(energizeDrop.chance, 0.25);
assert.equal(energizeDrop.expectedCopies, 0.75);
assert.equal(energizeDrop.expectedPlat, 60);
assert.equal(energizeDrop.expectedVosfor, 73.5);
assert.equal(energizeDrop.priceUsed, 80);
assert.equal(energizeDrop.confidence, 0.91);
assert.equal(detailData.ordersUrl, energizeSummary.url, "arcane_detail exposes the market URL callers should open for orders");

console.log("arcane MCP tool tests passed");
