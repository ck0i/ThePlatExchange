import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer } from "../src/server.js";
import { createInitialProductDashboard } from "../src/wfm/productEngine.js";
import { ThePlatExchangeService } from "../src/wfm/scanner.js";
import { DEFAULT_CONFIG } from "../src/wfm/opportunities.js";
import type { WarframeMarketClient } from "../src/wfm/client.js";
import type { DashboardState } from "../src/wfm/types.js";

const generatedAt = new Date().toISOString();
const expiresAt = new Date(Date.now() + 45 * 60_000).toISOString();
const staleProduct = createInitialProductDashboard();
staleProduct.generatedAt = "2026-07-06T00:00:00.000Z";
staleProduct.dataHealth = {
  ...staleProduct.dataHealth,
  generatedAt: "2026-07-06T00:00:00.000Z",
  sources: [{
    id: "live",
    label: "Live Warframe activities",
    status: "red",
    source: "warframestat",
    lastSuccessAt: "2026-07-06T00:00:00.000Z",
    ttlSeconds: 300,
    warningCount: 1,
    warnings: ["stale fallback live row"],
  }],
};

const remoteState: DashboardState = {
  generatedAt: "2026-07-06T00:00:00.000Z",
  refreshMs: 60_000,
  apiBase: "remote",
  scanMode: "remote",
  config: DEFAULT_CONFIG,
  status: {
    initialized: true,
    running: false,
    reason: "remote",
    scannedWeapons: 1,
    totalWeapons: 1,
    lastMessage: "remote fallback fixture",
  },
  reference: { weapons: 1, attributes: 0 },
  totals: { weaponsWithAuctions: 1, auctions: 0, opportunities: 0 },
  opportunities: [],
  instantWins: [],
  weaponSummaries: [],
  product: staleProduct,
};

const runNowArtifact = {
  schemaVersion: 1,
  generatedAt,
  live: {
    id: "live",
    label: "Live Warframe activities",
    status: "green",
    source: "warframestat",
    lastSuccessAt: generatedAt,
    ttlSeconds: 300,
    coverage: { scanned: 1, total: 1, label: "validated activities" },
    warningCount: 0,
    warnings: [],
  },
  runNow: {
    generatedAt,
    activities: [{
      id: "fallback-live-fissure",
      activityType: "fissure",
      title: "Fallback Live Fissure",
      node: "Ukko",
      missionType: "Capture",
      evPerMinute: 8,
      priority: 8,
      expiresAt,
      confidenceScore: 0.82,
      status: "green",
      warnings: [],
      source: { source: "warframestat", fetchedAt: generatedAt, ttlSeconds: 300, confidence: "medium", warnings: [] },
      explanation: {
        recommendation: "Run the fallback live fissure.",
        expectedOutcome: "Fallback path overlays live data.",
        dataBasis: ["run-now live artifact"],
        mechanics: ["server fallback overlay"],
        liquidity: ["method-level"],
        risks: [],
        alternatives: [],
      },
    }],
    rejectedActivities: [],
    warnings: [],
  },
};

const originalFetch = globalThis.fetch;
const service = new ThePlatExchangeService({
  client: {} as WarframeMarketClient,
  scanMode: "remote",
  remoteDataUrl: "https://example.test/latest/state.json",
});
const server = createAppServer(service, { remoteFallback: { url: "https://example.test/latest/state.json", cacheMs: 60_000 } });

const runNowFetchUrls: string[] = [];
globalThis.fetch = async (input, init) => {
  const url = requestUrl(input);
  const parsedUrl = new URL(url);
  if (parsedUrl.pathname.endsWith("/latest/state.json")) return jsonResponse(remoteState);
  if (parsedUrl.pathname.endsWith("/latest/run-now.json")) {
    runNowFetchUrls.push(url);
    return jsonResponse(runNowArtifact);
  }
  return originalFetch(input, init);
};

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object", "test server must listen on a TCP port");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/state`);
  assert.equal(response.ok, true, "/api/state fallback response must succeed");
  const payload: unknown = await response.json();
  assert.ok(payload && typeof payload === "object" && "product" in payload, "fallback response must include product state");
  const product = payload.product;
  assert.ok(product && typeof product === "object" && "runNow" in product && "dataHealth" in product, "fallback product must include Run Now and data health");
  const runNow = product.runNow;
  assert.ok(runNow && typeof runNow === "object" && "activities" in runNow && Array.isArray(runNow.activities), "fallback Run Now activities must be an array");
  assert.equal(runNow.activities[0]?.id, "fallback-live-fissure", "remote fallback must overlay latest/run-now.json before serving /api/state");
  const dataHealth = product.dataHealth;
  assert.ok(dataHealth && typeof dataHealth === "object" && "sources" in dataHealth && Array.isArray(dataHealth.sources), "fallback product data health must include sources");
  const liveSource = dataHealth.sources.find((source) => Boolean(source && typeof source === "object" && "id" in source && source.id === "live"));
  assert.ok(liveSource && typeof liveSource === "object" && "status" in liveSource, "fallback must include live source health");
  assert.equal(liveSource.status, "green", "fallback live source health must come from the live artifact, not stale cold state");
  assert.ok(runNowFetchUrls.length > 0, "fallback must fetch the standalone Run Now artifact");
  assert.ok(runNowFetchUrls.every((url) => new URL(url).searchParams.has("_")), "fallback Run Now artifact fetches must cache-bust raw GitHub URLs");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  globalThis.fetch = originalFetch;
}

console.log("run-now fallback overlay tests passed");

function requestUrl(input: string | URL | Request): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
