import assert from "node:assert/strict";
import { ThePlatExchangeService } from "../src/wfm/scanner.js";
import { createInitialProductDashboard } from "../src/wfm/productEngine.js";
import { DEFAULT_CONFIG } from "../src/wfm/opportunities.js";
import type { WarframeMarketClient } from "../src/wfm/client.js";
import type { AuctionOwner, DashboardState, InstantWin, Opportunity } from "../src/wfm/types.js";

const owner: AuctionOwner = {
  id: "seller-1",
  ingameName: "seller",
  slug: "seller",
  reputation: 20,
  status: "ingame",
  platform: "pc",
  crossplay: true,
};

const normal = opportunity("normal-roi", 10, 180);
const edgeRounded = opportunity("edge-rounded-roi", 10, 185.004, 17.5);
const insane = opportunity("insane-roi", 10, 970, 96);
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
    warnings: ["stale cold product live row"],
  }],
};
staleProduct.methods = [{
  id: "run_now",
  label: "Run Now",
  description: "stale live method",
  status: "red",
  opportunityCount: 0,
  sourceIds: ["live"],
  warnings: ["stale cold product method"],
}];

const runNowGeneratedAt = new Date().toISOString();
const runNowExpiresAt = new Date(Date.now() + 45 * 60_000).toISOString();
const remoteRunNowArtifact = {
  schemaVersion: 1,
  generatedAt: runNowGeneratedAt,
  live: {
    id: "live",
    label: "Live Warframe activities",
    status: "green",
    source: "warframestat",
    lastSuccessAt: runNowGeneratedAt,
    ttlSeconds: 300,
    coverage: { scanned: 1, total: 1, label: "validated activities" },
    warningCount: 0,
    warnings: [],
  },
  runNow: {
    generatedAt: runNowGeneratedAt,
    activities: [{
      id: "remote-live-fissure",
      activityType: "fissure",
      title: "Remote Live Fissure",
      node: "Ukko",
      missionType: "Capture",
      evPerMinute: 8,
      priority: 8,
      expiresAt: runNowExpiresAt,
      confidenceScore: 0.82,
      status: "green",
      warnings: [],
      source: { source: "warframestat", fetchedAt: runNowGeneratedAt, ttlSeconds: 300, confidence: "medium", warnings: [] },
      explanation: {
        recommendation: "Run the fresh remote fissure.",
        expectedOutcome: "Fresh run-now activity remains visible.",
        dataBasis: ["run-now live artifact"],
        mechanics: ["remote overlay"],
        liquidity: ["method-level"],
        risks: [],
        alternatives: [],
      },
    }],
    rejectedActivities: [],
    warnings: [],
  },
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
    lastMessage: "remote fixture",
  },
  reference: { weapons: 1, attributes: 0 },
  totals: { weaponsWithAuctions: 1, auctions: 3, opportunities: 3 },
  opportunities: [insane, edgeRounded, normal],
  instantWins: [instantWin(insane), instantWin(edgeRounded), instantWin(normal)],
  weaponSummaries: [],
  product: staleProduct,
};

const originalFetch = globalThis.fetch;
const client = {} as WarframeMarketClient;
const service = new ThePlatExchangeService({
  client,
  scanMode: "remote",
  remoteDataUrl: "https://example.test/latest/state.json",
  remotePollMs: 15_000,
});
const ready = Promise.withResolvers<DashboardState>();
let unsubscribe = (): void => {};
const runNowFetchUrls: string[] = [];
const fetchMock: typeof fetch = async (input) => {
  const url = fetchUrl(input);
  const parsedUrl = new URL(url);
  if (parsedUrl.pathname.endsWith("/latest/state.json")) return jsonResponse(remoteState);
  if (parsedUrl.pathname.endsWith("/reference/current.json")) return jsonResponse({ rivenWeapons: [], rivenAttributes: [], versions: {}, loadedAt: "2026-07-06T00:00:00.000Z" });
  if (parsedUrl.pathname.endsWith("/valuations/latest.json")) return jsonResponse({ valuations: {}, velocities: {} });
  if (parsedUrl.pathname.endsWith("/latest/run-now.json")) {
    runNowFetchUrls.push(url);
    return jsonResponse(remoteRunNowArtifact);
  }
  return new Response(JSON.stringify({ error: "unexpected url" }), { status: 404 });
};

globalThis.fetch = fetchMock;
try {
  unsubscribe = service.subscribe((state) => {
    if (state.status.initialized && state.status.reason === "remote" && !state.status.running && state.product?.runNow.activities.some((activity) => activity.id === "remote-live-fissure")) ready.resolve(state);
  });
  service.start();
  const state = await ready.promise;

  assert.deepEqual(state.opportunities.map((entry) => entry.auctionId), ["normal-roi"], "remote getState must remove chart-visible ROI outliers");
  assert.equal(state.opportunities[0]?.roi, 17, "remote getState should preserve under-cap ROI entries");
  assert.equal(state.totals.opportunities, 1, "remote totals must match filtered opportunities");
  assert.deepEqual(state.instantWins?.map((entry) => entry.opportunity.auctionId), ["normal-roi"], "remote instant wins must remove ROI outliers too");
  assert.equal(state.product?.runNow.activities[0]?.id, "remote-live-fissure", "remote mode must overlay the live Run Now artifact onto stale cold product data");
  assert.equal(state.product?.dataHealth.sources.find((source) => source.id === "live")?.status, "green", "remote live health must come from the live artifact");
  assert.ok(runNowFetchUrls.length > 0, "remote mode must fetch the standalone Run Now artifact");
  assert.ok(runNowFetchUrls.every((url) => new URL(url).searchParams.has("_")), "remote Run Now artifact fetches must cache-bust raw GitHub URLs");
} finally {
  unsubscribe();
  service.stop();
  globalThis.fetch = originalFetch;
}

console.log("scanner behavior tests passed");

function opportunity(id: string, buyPrice: number, conservativeSellPrice: number, staleRoi?: number): Opportunity {
  const expectedProfit = conservativeSellPrice - buyPrice;
  const roi = staleRoi ?? Math.round((expectedProfit / buyPrice) * 1000) / 1000;
  return {
    auctionId: id,
    weaponSlug: "war",
    weaponName: "War",
    rivenName: id,
    buyPrice,
    targetSellPrice: conservativeSellPrice,
    conservativeSellPrice,
    expectedProfit,
    roi,
    buyToSellRatio: conservativeSellPrice / buyPrice,
    confidence: 0.8,
    score: 90,
    seller: owner,
    status: owner.status,
    groupType: "exact-stats",
    comparableListings: 4,
    pricePercentile: 0,
    signature: "+critical_chance|-zoom",
    positives: ["critical_chance"],
    negatives: ["zoom"],
    reasons: ["fixture"],
    updated: "2026-07-06T00:00:00.000Z",
    url: "https://warframe.market/auctions/search?type=riven&weapon_url_name=war&sort_by=price_asc",
  };
}

function instantWin(entry: Opportunity): InstantWin {
  return {
    opportunity: entry,
    signature_value: {
      weapon_slug: entry.weaponSlug,
      signature: entry.signature,
      window_days: 0,
      sample_count: 4,
      p25: entry.conservativeSellPrice,
      p50: entry.conservativeSellPrice,
      p75: entry.conservativeSellPrice,
      p90: entry.conservativeSellPrice,
      min: entry.conservativeSellPrice,
      max: entry.conservativeSellPrice,
      last_seen_price: null,
      last_seen_at: null,
      confidence: 0.8,
      source: "live_signature",
      velocity: null,
    },
    expected_uplift: entry.expectedProfit,
    discount_to_p25: entry.expectedProfit,
    discount_pct: 0.5,
    basis: "same-signature",
    reasons: ["fixture"],
  };
}

function fetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
