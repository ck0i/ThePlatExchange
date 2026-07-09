// The contract for these tests is behavioral, not implementation-specific.
import assert from "node:assert/strict";
import { McpSseServer } from "../src/mcp.js";
import { ENVELOPE_VERSION, EnvelopeSchema, type Envelope } from "../src/mcp/schemas.js";
import type { ThePlatExchangeService } from "../src/wfm/scanner.js";
import { createInitialProductDashboard } from "../src/wfm/productEngine.js";
import type { DashboardState, ScanStatus, TraderConfig } from "../src/wfm/types.js";
import type { ProductDashboardState, ProductOpportunityAction } from "../src/wfm/product.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: unknown;
  method: string;
  params?: unknown;
}

interface DispatchableMcpServer {
  dispatch(request: JsonRpcRequest): Promise<Record<string, unknown> | null>;
}

const nowIso = new Date().toISOString();
const responseNowMs = Date.parse(nowIso) + 1_000;
const responseNowIso = new Date(responseNowMs).toISOString();
const originalDateNow = Date.now;
Date.now = () => responseNowMs;
const rivenGeneratedIso = "2026-07-06T00:05:00.000Z";
const rivenFinishedIso = "2026-07-05T23:00:00.000Z";

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
  reason: "stale-riven-sentinel",
  finishedAt: rivenFinishedIso,
  scannedWeapons: 1,
  totalWeapons: 200,
  lastMessage: "Riven scan status is intentionally stale; product tools must not reuse it",
};

function itemRef(id: string, name: string) {
  return { tpeId: id, name, tags: [] };
}

const sharedSource = {
  source: "tpe_history" as const,
  fetchedAt: nowIso,
  ttlSeconds: 60 * 60,
  confidence: "high" as const,
  warnings: [],
};

const baseSourceHealth = {
  id: "product",
  label: "Product method cache",
  status: "green" as const,
  source: "tpe_history" as const,
  lastSuccessAt: nowIso,
  ttlSeconds: 60 * 60,
  warningCount: 0,
  warnings: ["product cache is current"],
};

function makeExplanation(title: string) {
  return {
    recommendation: `Recommended because ${title}`,
    expectedOutcome: `${title} maximizes expected plat with acceptable risk.`,
    dataBasis: ["product health", "latest run-now window"],
    mechanics: ["ranked scoring", "cross-method composition"],
    liquidity: ["market source freshness", "exchange depth"],
    risks: ["market spread", "source latency"],
    alternatives: ["wait for better spread", "narrow confidence band"],
  };
}

function makeOpportunity(
  id: string,
  methodId: string,
  title: string,
  action: ProductOpportunityAction,
  query: string,
  expectedProfitPlat: number,
  confidenceScore: number,
  riskScore: number,
) {
  return {
    id,
    methodId,
    title,
    action,
    itemRefs: [itemRef(id, `${title} item`)],
    expectedPlat: expectedProfitPlat + 40,
    expectedCostPlat: expectedProfitPlat / 2,
    expectedProfitPlat,
    roi: expectedProfitPlat / Math.max(1, expectedProfitPlat / 2),
    timeToExecuteMinutes: 45,
    liquidityScore: 0.72,
    confidenceScore,
    riskScore,
    freshness: [sharedSource],
    assumptions: ["Assumption: market data is non-stale."],
    warnings: [`${title} generated for ${query}`],
    explanation: makeExplanation(title),
    url: `https://example.test/${id}`,
    expiresAt: nowIso,
    tags: [query.toLowerCase(), methodId],
  };
}

const productState = {
  ...createInitialProductDashboard(),
  generatedAt: nowIso,
  dataHealth: {
    generatedAt: nowIso,
    status: "green" as const,
    sources: [baseSourceHealth],
    warnings: ["fresh product state available"],
  },
  methods: [
    {
      id: "prime_relics",
      label: "Prime / Relics / Aya",
      description: "Rank-aware relic, crack, and Aya execution guidance.",
      status: "green" as const,
      opportunityCount: 2,
      bestOpportunityId: "op-prime-sell-omega",
      sourceIds: ["drops", "wfm"],
      warnings: [],
    },
    {
      id: "run_now",
      label: "Run Now",
      description: "Live mission opportunities with duration and expiry windows.",
      status: "yellow" as const,
      opportunityCount: 1,
      bestOpportunityId: "op-run-now-alpha",
      sourceIds: ["live", "wfm"],
      warnings: [],
    },
    {
      id: "mods",
      label: "Mods / Endo",
      description: "Endo/credits conversion candidates at current spread.",
      status: "green" as const,
      opportunityCount: 1,
      sourceIds: ["wfm"],
      warnings: [],
    },
  ],
  opportunities: [
    makeOpportunity("op-prime-sell-omega", "prime_relics", "Sell Omega relics", "sell", "omega", 180, 0.91, 0.62),
    makeOpportunity("op-prime-open-omega", "prime_relics", "Open Omega relic", "open", "omega", 55, 0.45, 0.22),
    makeOpportunity("op-run-now-alpha", "run_now", "Run Kappa mission", "run_mission", "run-now", 95, 0.68, 0.48),
    makeOpportunity("op-mods-rank", "mods", "Prime Vigor EV", "convert", "mods", 120, 0.88, 0.71),
  ],
  prime: {
    generatedAt: nowIso,
    summary: "Prime relic candidate surface",
    relicCount: 2,
    rewardCount: 3,
    scannedMarketItems: 10,
    bestRelicsToSell: [{ id: "prime-sell-1" }, { id: "prime-sell-2" }],
    bestRelicsToCrack: [{ id: "prime-crack-1" }],
    bestAyaPurchases: [{ id: "prime-aya-1" }],
    setCompletion: [{ id: "prime-set-1" }],
    ducatRecommendations: [{ id: "prime-ducat-1" }],
    fissures: [{ id: "fissure-1", expiresAt: nowIso, expected: 10 }],
    supplyShocks: [{ id: "prime-shock-1" }],
    sources: [
      {
        source: "manual_user" as const,
        fetchedAt: nowIso,
        ttlSeconds: 60 * 60,
        confidence: "medium" as const,
        warnings: ["No live prime shocks in cache."],
      },
    ],
    warnings: ["Prime surface has controlled assumptions."],
  },
  runNow: {
    generatedAt: nowIso,
    activities: [
      {
        id: "run-now-1",
        activityType: "Exterminate",
        title: "Priority Exterminate",
        node: "Earth",
        missionType: "Exterminate",
        evPerMinute: 12,
        priority: 0.91,
        expiresAt: nowIso,
        confidenceScore: 0.77,
        status: "green" as const,
        warnings: ["faction checks pass"],
        explanation: makeExplanation("run now 1"),
      },
      {
        id: "run-now-2",
        activityType: "Capture",
        title: "Capture Priority",
        node: "Mars",
        missionType: "Capture",
        evPerMinute: 9,
        priority: 0.52,
        confidenceScore: 0.42,
        status: "yellow" as const,
        warnings: ["lower expected return"],
        explanation: makeExplanation("run now 2"),
      },
    ],
    rejectedActivities: [
      {
        id: "run-rejected-1",
        title: "Rejected due to stale source",
        reason: "source window closed",
        source: {
          source: "manual_user" as const,
          fetchedAt: nowIso,
          ttlSeconds: 60 * 60,
          confidence: "low" as const,
          warnings: ["manual curation missing source ids"],
        },
      },
    ],
    warnings: ["Run-now surface is live-injected when available."],
  },
  personalization: {
    ...createInitialProductDashboard().personalization,
    profile: {
      id: "user-1",
      displayName: "Product Planner Tester",
      timezone: "UTC",
      platform: "pc",
      crossplay: true,
      assumptions: {
        traceOpportunityCostPlat: 65,
        endoPlatPerThousand: 100,
        creditPlatPerMillion: 220,
        preferredMissionTypes: ["Exterminate", "Capture"],
        unlockedContent: ["All"],
        accessibleSyndicates: ["Fortuna"],
      },
      privacy: {
        privateByDefault: true,
        allowAnonymousAggregates: false,
        teamSharingEnabled: false,
      },
    },
    watchlists: [
      {
        id: "watch-1",
        name: "Prime watch",
        itemRefs: [itemRef("item-prime", "Prime Relay")],
        methodIds: ["prime_relics", "mods"],
        createdAt: nowIso,
      },
      {
        id: "watch-2",
        name: "Risk watch",
        itemRefs: [itemRef("item-risk", "Risky Relic")],
        methodIds: ["mods"],
        createdAt: nowIso,
      },
    ],
    portfolio: [
      {
        id: "portfolio-1",
        userId: "user-1",
        item: itemRef("item-port-1", "Ported Prime"),
        quantity: 3,
      },
      {
        id: "portfolio-2",
        userId: "user-1",
        item: itemRef("item-port-2", "Ported Relic"),
        quantity: 1,
      },
    ],
    notificationRules: [
      {
        id: "rule-1",
        userId: "user-1",
        name: "High-value alerts",
        methodIds: ["prime_relics"],
        filters: { minProfit: 100 },
        threshold: {
          minExpectedProfitPlat: 75,
          minConfidence: 0.8,
          maxRisk: 0.8,
        },
        channels: ["in_app"],
        cooldownSeconds: 300,
        enabled: true,
      },
    ],
    todos: [
      {
        id: "todo-1",
        userId: "user-1",
        title: "Complete mission and convert",
        methodId: "run_now",
        itemRefs: [itemRef("item-todo", "Run Mission")],
        action: "run_mission" as const,
        status: "open" as const,
      },
      {
        id: "todo-2",
        userId: "user-1",
        title: "Sell Omega relic",
        methodId: "prime_relics",
        itemRefs: [itemRef("item-todo-2", "Omega relic")],
        action: "sell" as const,
        status: "in_progress" as const,
      },
    ],
    savedFilters: [
      {
        id: "saved-filter-1",
        name: "High confidence",
        filters: { minConfidence: 0.8 },
        createdAt: nowIso,
      },
      {
        id: "saved-filter-2",
        name: "Low risk",
        filters: { maxRisk: 0.6 },
        createdAt: nowIso,
      },
    ],
    deliveries: [
      {
        id: "delivery-1",
        ruleId: "rule-1",
        deliveredAt: nowIso,
        channel: "in_app",
        changedBecause: "initial",
        manualVerification: "pending",
      },
    ],
    tradeJournal: [
      {
        id: "trade-1",
        item: itemRef("item-trade", "Trade relic"),
        side: "buy",
        quantity: 1,
        pricePlat: 120,
        tradedAt: nowIso,
      },
      {
        id: "trade-2",
        item: itemRef("item-trade-2", "Trade relic 2"),
        side: "sell",
        quantity: 1,
        pricePlat: 220,
        tradedAt: nowIso,
      },
    ],
    auditLog: [
      {
        id: "audit-1",
        at: nowIso,
        event: "planner created",
      },
      {
        id: "audit-2",
        at: nowIso,
        event: "todo updated",
      },
    ],
    exportAvailable: true,
    deleteAvailable: false,
    warnings: [],
  },
  expansion: {
    mods: [makeOpportunity("exp-mods", "mods", "Convert Aya into Dupl", "convert", "mods", 88, 0.7, 0.54)],
    syndicates: [makeOpportunity("exp-synd", "mods", "Syndicate handoff", "sell", "synd", 44, 0.67, 0.61)],
    baro: [makeOpportunity("exp-baro", "mods", "Sell Baro crate", "sell", "baro", 99, 0.76, 0.33)],
    resources: [
      makeOpportunity(
        "exp-resource",
        "mods",
        "Gather Neural Scanner",
        "buy",
        "resource",
        25,
        0.52,
        0.4,
      ),
    ],
    eventShocks: [
      makeOpportunity(
        "exp-shock",
        "mods",
        "Event shock reroute",
        "farm",
        "shock",
        14,
        0.58,
        0.45,
      ),
    ],
    bespokeMarkets: [
      {
        id: "market-1",
        label: "Exclusive mission-only rerolls",
        status: "gated",
        warnings: ["Gated markets require market beta"],
      },
    ],
  },
  advanced: {
    tradeJournal: {
      realizedProfitPlat: 1432,
      tradeCount: 3,
      byMethod: [
        {
          methodId: "prime_relics",
          profitPlat: 420,
          tradeCount: 2,
        },
        {
          methodId: "mods",
          profitPlat: 122,
          tradeCount: 1,
        },
      ],
    },
    portfolioAging: [
      {
        entryId: "portfolio-1",
        itemName: "Ported Prime",
        daysHeld: 3,
        unrealizedPlat: 19,
        warnings: ["Noisy spread"],
      },
    ],
    aggregateTrends: [
      {
        id: "trend-1",
        label: "Weekly trend",
        value: 0.74,
        privacy: "anonymous_aggregate",
        warnings: [],
      },
    ],
    teamWatchlists: [
      {
        id: "team-watch-1",
        name: "Core Team",
        memberCount: 2,
        optIn: true,
      },
    ],
    methodGuides: [
      {
        methodId: "prime_relics",
        title: "Prime relic best-practice",
        generatedAt: nowIso,
        sourceIds: ["drops", "wfm"],
        summary: "Prefer higher confidence and lower risk, then scale by EV/minute.",
        warnings: ["Data snapshots can stale quickly"],
      },
      {
        methodId: "mods",
        title: "Mod EV guide",
        generatedAt: nowIso,
        sourceIds: ["wfm"],
        summary: "Normalize reward units before comparing endo and credit routes.",
        warnings: ["Confidence is directional only"],
      },
    ],
  },
} as unknown as ProductDashboardState;

const staleProductForState: ProductDashboardState = {
  ...productState,
  generatedAt: "2026-07-05T23:00:00.000Z",
  dataHealth: {
    generatedAt: "2026-07-05T23:00:00.000Z",
    status: "red" as const,
    sources: [
      {
        id: "stale",
        label: "Stale test surface",
        status: "red" as const,
        source: "tpe_history" as const,
        ttlSeconds: 60 * 60,
        warningCount: 1,
        warnings: ["Intentional stale state for isolation"],
      },
    ],
    warnings: ["intentional stale product state"],
  },
  opportunities: [],
  methods: [{ id: "stale", label: "stale", description: "stale", status: "red", opportunityCount: 0, sourceIds: [], warnings: [] }],
  prime: {
    generatedAt: "2026-07-05T23:00:00.000Z",
    summary: "Stale product state",
    relicCount: 0,
    rewardCount: 0,
    scannedMarketItems: 0,
    bestRelicsToSell: [],
    bestRelicsToCrack: [],
    bestAyaPurchases: [],
    setCompletion: [],
    ducatRecommendations: [],
    fissures: [],
    supplyShocks: [],
    sources: [],
    warnings: ["Stale"],
  },
  runNow: {
    generatedAt: "2026-07-05T23:00:00.000Z",
    activities: [],
    rejectedActivities: [],
    warnings: ["Stale"],
  },
  personalization: {
    ...productState.personalization,
    warnings: ["stale"],
  },
  expansion: {
    ...productState.expansion,
    mods: [],
    syndicates: [],
    baro: [],
    resources: [],
    eventShocks: [],
  },
  advanced: {
    tradeJournal: { realizedProfitPlat: 0, tradeCount: 0, byMethod: [] },
    portfolioAging: [],
    aggregateTrends: [],
    teamWatchlists: [],
    methodGuides: [],
  },
} as unknown as ProductDashboardState;

const dashboardState: DashboardState = {
  generatedAt: rivenGeneratedIso,
  refreshMs: 60_000,
  apiBase: "https://api.warframe.market",
  config,
  status: rivenStatus,
  reference: {
    weapons: 200,
    attributes: 50,
  },
  totals: {
    weaponsWithAuctions: 0,
    auctions: 0,
    opportunities: 0,
  },
  opportunities: [],
  weaponSummaries: [],
  product: staleProductForState,
};

class FakeService {
  readonly refreshCalls: string[] = [];
  readonly refreshArcanesCalls: string[] = [];
  readonly refreshProductCalls: string[] = [];

  getState(): DashboardState {
    return dashboardState;
  }

  getProductState(): ProductDashboardState {
    return productState;
  }

  refresh(): Promise<void> {
    this.refreshCalls.push("called");
    return Promise.resolve();
  }

  refreshArcanes(): Promise<void> {
    this.refreshArcanesCalls.push("called");
    return Promise.resolve();
  }

  refreshProduct(): Promise<void> {
    this.refreshProductCalls.push("called");
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

function requireBoolean(value: unknown, label: string): boolean {
  assert.strictEqual(typeof value, "boolean", `${label} must be a boolean`);
  return value as boolean;
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
  assert(!envelope.meta.warnings.some((warning) => warning.code === "validation_failed"), `${label} envelope should satisfy the shared schema`);
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
  assert.equal(envelope.version, ENVELOPE_VERSION, `${label} envelope version must be ${ENVELOPE_VERSION}`);

  const content = requireArray(result.content, `${label} legacy content`);
  const firstContent = requireRecord(firstOf(content, `${label} legacy content`), `${label} first content entry`);
  assert.equal(firstContent.type, "text", `${label} first legacy content item must be text`);
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

const listResponse = await dispatch({
  jsonrpc: "2.0",
  id: "list-tools",
  method: "tools/list",
});
assert(!("error" in listResponse), "tools/list should not fail");
const toolsResult = requireRecord(listResponse.result, "tools/list result");
const tools = requireArray(toolsResult.tools, "tools/list tools").map((tool, index) => requireRecord(tool, `tool ${index} record`));
const toolNames = tools.map((tool, index) => requireString(tool.name, `tool ${index} name`));

for (const expectedName of [
  "product_health",
  "product_refresh",
  "product_methods",
  "product_opportunities",
  "product_prime_relics",
  "product_run_now",
  "product_expansion_markets",
  "product_advanced_analytics",
  "product_planner",
]) {
  assert(toolNames.includes(expectedName), `tools/list must expose ${expectedName}`);
}
assert.equal(new Set(toolNames).size, toolNames.length, "tools/list must not expose duplicate tool names");

const health = await callTool("product_health");
const healthData = requireRecord(health.data, "product_health data");
assert.equal(healthData.generatedAt, nowIso, "product_health data should use product data health timestamp");
assert.equal(healthData.status, "green", "product_health should expose product data health status");
const healthWarnings = requireArray(healthData.warnings, "product_health data warnings");
assert.equal(healthWarnings.at(0), "fresh product state available", "product_health exposes product-specific warnings when healthy");
assert.equal(health.meta.generated_at, responseNowIso, "product_health meta should use response time, not stale riven state time");
assert.equal(health.meta.freshness_ms, 1_000, "product_health freshness should be response time minus newest product/source timestamp");
assert.equal(health.meta.scan_running, false, "product_health should reflect non-running product sources");
assert.equal(health.meta.data_source, "live", "product_health should report fresh product state as live");
assert.deepEqual(health.meta.coverage, { scanned: 1, total: 1, pct: 1 }, "product_health coverage must come from product sources, not riven totals");
assert.equal(health.meta.quality, "green", "product_health should use product health quality");
assert(
  !health.meta.warnings.some((warning) => warning.code === "stale_data" || warning.code === "partial_scan"),
  "product_health should not include riven scan-derived freshness/coverage warnings in this healthy fixture",
);

const refresh = await callTool("product_refresh");
const refreshData = requireRecord(refresh.data, "product_refresh data");
assert.equal(requireBoolean(refreshData.accepted, "product_refresh accepted"), true, "product_refresh must accept a refresh request");
assert.equal(fakeService.refreshProductCalls.length, 1, "product_refresh must schedule exactly one product refresh");
assert.equal(fakeService.refreshCalls.length, 0, "product_refresh must not schedule a riven refresh");
assert.equal(fakeService.refreshArcanesCalls.length, 0, "product_refresh must not schedule an arcane refresh");

const methods = requireArray((await callTool("product_methods", { limit: 2 })).data, "product_methods data");
assert.equal(methods.length, 2, "product_methods should honor limit and return max 2 methods");
const methodIds = methods.map((entry, index) => requireString(requireRecord(entry, `product_methods entry ${index}`).id, `product_methods entry ${index} id`));
assert(methodIds.includes("prime_relics"), "product_methods should include prime_relics");
assert(methodIds.includes("run_now"), "product_methods should include run_now");

const opportunities = requireArray(
  await callTool("product_opportunities", {
    limit: 10,
    methodId: "prime_relics",
    action: "sell",
    query: "omega",
    tags: ["omega"],
    minExpectedProfitPlat: 120,
    minConfidence: 0.9,
    maxRisk: 0.8,
  }).then((result) => result.data),
  "product_opportunities data",
);
assert.equal(opportunities.length, 1, "product_opportunities filters should reduce to one matching row");
const firstOpportunity = requireRecord(firstOf(opportunities, "filtered product opportunities"), "filtered product opportunities first");
assert.equal(firstOpportunity.methodId, "prime_relics", "product_opportunities should apply methodId filter");
assert.equal(firstOpportunity.action, "sell", "product_opportunities should apply action filter");
assert.equal(requireString(firstOpportunity.title, "product opportunity title"), "Sell Omega relics", "product_opportunities query should match title/description");
assert.equal(
  requireArray(firstOpportunity.tags, "product opportunity tags").includes("omega"),
  true,
  "product_opportunities should preserve tag data and allow tag filters",
);
assert.equal(Number(firstOpportunity.expectedProfitPlat) >= 120, true, "product_opportunities should honor minExpectedProfitPlat");
assert.equal(Number(firstOpportunity.riskScore) <= 0.8, true, "product_opportunities should honor maxRisk");
assert.equal(Number(firstOpportunity.confidenceScore) >= 0.9, true, "product_opportunities should honor minConfidence");
const itemRefs = requireArray(firstOpportunity.itemRefs, "product_opportunities itemRefs");
assert(itemRefs.length >= 1, "product opportunities should expose itemRefs");
const explanation = requireRecord(firstOpportunity.explanation, "product opportunity explanation");
assert.equal(typeof explanation.recommendation, "string", "product opportunities should include full explanation.recommendation");
assert.equal(Array.isArray(explanation.alternatives), true, "product opportunities should include full explanation.alternatives");

const opportunitiesNoTagMatch = requireArray(
  await callTool("product_opportunities", {
    limit: 1,
    methodId: "prime_relics",
    action: "sell",
    query: "omega",
    tags: ["definitely-not-a-tag"],
    minExpectedProfitPlat: 120,
    minConfidence: 0.9,
    maxRisk: 0.8,
  }).then((result) => result.data),
  "product_opportunities no-match data",
);
assert.equal(opportunitiesNoTagMatch.length, 0, "product_opportunities tags should be applied");
const runNow = requireRecord((await callTool("product_run_now", { limit: 1, activityType: "Exterminate", query: "Priority", minPriority: 0.9 })).data, "product_run_now data");
const runNowActivities = requireArray(runNow.activities, "run-now activities");
assert.equal(runNowActivities.length, 1, "product_run_now should honor limit and filters for single-section activity slices");
const firstRunNow = requireRecord(firstOf(runNowActivities, "product_run_now activities"), "product_run_now first activity");
assert.equal(firstRunNow.activityType, "Exterminate", "product_run_now activityType filter should apply");
assert.equal(requireString(firstRunNow.title, "product_run_now title").toLowerCase().includes("priority"), true, "product_run_now query filter should apply");
assert.equal(Number(firstRunNow.priority) >= 0.9, true, "product_run_now minPriority should apply");

const prime = requireRecord((await callTool("product_prime_relics", { limit: 1, section: "best_relics_to_sell" })).data, "product_prime_relics data");
const bestRelicsToSell = requireArray(prime.bestRelicsToSell, "prime_relics bestRelicsToSell");
assert.equal(bestRelicsToSell.length, 1, "product_prime_relics should honor section filter and limit");
assert.equal(prime.section, "best_relics_to_sell", "product_prime_relics should expose selected section");
const primeItems = requireArray(prime.items, "prime_relics items");
assert.equal(primeItems.length, 1, "product_prime_relics should expose section items for non-all slices");
assert.deepEqual(primeItems, bestRelicsToSell, "product_prime_relics should place selected slice on `items`");
const firstPrime = requireRecord(firstOf(bestRelicsToSell, "best relic sells"), "best relic sell first");
assert.equal(firstPrime.id, "prime-sell-1", "product_prime_relics should expose prime recommendation identifiers");

const expansion = requireRecord(
  (await callTool("product_expansion_markets", { limit: 1, sections: ["mods"], query: "dupl" })).data,
  "product_expansion_markets data",
);
const expansionItems = requireArray(expansion.items, "expansion items");
const mods = requireArray(expansion.mods, "expansion mods");
assert.equal(requireArray(expansion.sections, "expansion sections").includes("mods"), true, "product_expansion_markets should accept a section filter");
assert.equal(mods.length, 1, "product_expansion_markets should honor section filter and limit for mods");
assert.equal(expansionItems.length, 1, "product_expansion_markets should expose section items for non-all slices");
assert.deepEqual(expansionItems, mods, "product_expansion_markets should place selected slice on `items`");
const marketActivity = requireRecord(firstOf(mods, "expansion mods"), "first expansion mod row");
assert.equal(marketActivity.methodId, "mods", "product_expansion_markets should return expansion opportunities");

const advanced = requireRecord(
  (await callTool("product_advanced_analytics", { limit: 1, section: "aggregate_trends" })).data,
  "product_advanced_analytics data",
);
const advancedItems = requireArray(advanced.items, "advanced items");
const aggregateTrends = requireArray(advanced.aggregateTrends, "advanced aggregateTrends");
assert.equal(advanced.section, "aggregate_trends", "product_advanced_analytics should expose selected section");
assert.equal(aggregateTrends.length, 1, "product_advanced_analytics should honor section filter and limit");
assert.equal(advancedItems.length, 1, "product_advanced_analytics should expose section items for non-all slices");
assert.deepEqual(advancedItems, aggregateTrends, "product_advanced_analytics should place selected slice on `items`");

const planner = requireRecord(
  (await callTool("product_planner", { limit: 1, section: "todos", methodId: "run_now", statuses: ["open"], query: "mission" })).data,
  "product_planner data",
);
const plannerItems = requireArray(planner.items, "planner items");
const todos = requireArray(planner.todos, "planner todos");
assert.equal(planner.section, "todos", "product_planner should expose selected section");
assert.equal(todos.length, 1, "product_planner should honor section filter and limit");
assert.equal(plannerItems.length, 1, "product_planner should expose section items for non-all slices");
const firstTodo = requireRecord(firstOf(todos, "planner todos"), "first planner todo");
assert.equal(firstTodo.id, "todo-1", "product_planner should return the requested todo slice");
assert.equal(firstTodo.methodId, "run_now", "product_planner should apply methodId filter");
assert.equal(firstTodo.status, "open", "product_planner should apply status filter");
assert.equal(requireRecord(plannerItems.at(0), "planner first item").id, "todo-1", "product_planner items should mirror selected `todos` slice");

Date.now = originalDateNow;
console.log("product MCP tool tests passed");
