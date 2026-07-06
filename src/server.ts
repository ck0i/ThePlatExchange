import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { McpSseServer } from "./mcp.js";
import { enrichOpportunity, type SignatureLookupHit } from "./mcp/schemas.js";
import { attributeSignature } from "./wfm/opportunities.js";
import { isRecord, readBoolean, readNumber, readString } from "./wfm/guards.js";
import type { ThePlatExchangeService } from "./wfm/scanner.js";
import type { DashboardState, Opportunity, SellerStatus, TraderConfig } from "./wfm/types.js";

export interface AppServerOptions {
  publicDir?: string;
  remoteFallback?: RemoteFallbackOptions;
  imageCacheDir?: string;
}

const WARFRAMESTAT_IMAGE_BASE = "https://cdn.warframestat.us/img/";
const IMAGE_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const IMAGE_ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

class ImageProxy {
  private readonly inflight = new Map<string, Promise<void>>();
  constructor(private readonly cacheDir: string) {}

  async serve(response: ServerResponse, requestedName: string): Promise<void> {
    const safeName = sanitizeImageName(requestedName);
    if (!safeName) {
      sendText(response, 400, "invalid image name");
      return;
    }
    const cachedPath = resolve(this.cacheDir, safeName);
    if (!cachedPath.startsWith(resolve(this.cacheDir))) {
      sendText(response, 400, "invalid image path");
      return;
    }
    try {
      if (!existsSync(cachedPath)) {
        await this.fetchToCache(safeName, cachedPath);
      }
      const data = await readFile(cachedPath);
      const ext = extname(safeName).toLowerCase();
      response.writeHead(200, {
        "Content-Type": IMAGE_MIME_BY_EXT[ext] ?? "application/octet-stream",
        "Cache-Control": `public, max-age=${IMAGE_CACHE_MAX_AGE_SECONDS}, immutable`,
      });
      response.end(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendText(response, 502, `upstream image error: ${message}`);
    }
  }

  private async fetchToCache(name: string, targetPath: string): Promise<void> {
    let inflight = this.inflight.get(name);
    if (inflight) return inflight;
    inflight = (async () => {
      const response = await fetch(`${WARFRAMESTAT_IMAGE_BASE}${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error(`upstream ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await mkdir(this.cacheDir, { recursive: true });
      const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tempPath, buffer);
      await rename(tempPath, targetPath);
    })();
    this.inflight.set(name, inflight);
    try {
      await inflight;
    } finally {
      this.inflight.delete(name);
    }
  }
}

function sanitizeImageName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return null;
  const ext = extname(trimmed).toLowerCase();
  if (!IMAGE_ALLOWED_EXTENSIONS.has(ext)) return null;
  return trimmed;
}

export interface RemoteFallbackOptions {
  url: string;
  cacheMs?: number;
}

class RemoteFallback {
  private lastFetch = 0;
  private cached: unknown = null;
  private readonly url: string;
  private readonly cacheMs: number;

  constructor(options: RemoteFallbackOptions) {
    this.url = options.url;
    this.cacheMs = options.cacheMs ?? 60_000;
  }

  async fetchIfStale(): Promise<unknown | null> {
    const now = Date.now();
    if (this.cached && now - this.lastFetch < this.cacheMs) return this.cached;
    try {
      const response = await fetch(this.url);
      if (!response.ok) return this.cached;
      const parsed = await response.json();
      this.cached = parsed;
      this.lastFetch = now;
      return parsed;
    } catch {
      return this.cached;
    }
  }
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function createAppServer(service: ThePlatExchangeService, options: AppServerOptions = {}): Server {
  const publicDir = options.publicDir ?? join(process.cwd(), "public");
  const mcp = new McpSseServer(service);
  const remote = options.remoteFallback ? new RemoteFallback(options.remoteFallback) : null;
  const imageCacheDir = options.imageCacheDir ?? join(process.cwd(), ".cache", "the-plat-exchange", "images");
  const imageProxy = new ImageProxy(imageCacheDir);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      if (request.method === "GET" && url.pathname.startsWith("/img/")) {
        const name = decodeURIComponent(url.pathname.slice(5));
        await imageProxy.serve(response, name);
        return;
      }
      if (request.method === "GET" && url.pathname === "/events") {
        handleDashboardSse(request, response, service);
        return;
      }
      if (request.method === "GET" && url.pathname === "/mcp/sse") {
        mcp.handleSse(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/mcp/messages") {
        await mcp.handleMessage(request, response, url);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        const state = service.getState();
        if (remote && state.status.scannedWeapons === 0 && !state.status.running) {
          const fallback = await remote.fetchIfStale();
          if (fallback) {
            sendJson(response, 200, fallback);
            return;
          }
        }
        sendJson(response, 200, state);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/opportunities") {
        const state = service.getState();
        const ctx = buildEnrichmentContext(service);
        const enriched = state.opportunities.map((opportunity) => enrichOpportunity(opportunity, Date.parse(state.generatedAt), ctx));
        sendJson(response, 200, enriched);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/instant-wins") {
        sendJson(response, 200, computeInstantWins(service, url));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/arcanes") {
        sendJson(response, 200, service.getState().arcanes?.summaries ?? []);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/arcanes/recommendations") {
        sendJson(response, 200, service.getState().arcanes?.dissolveRecommendations ?? []);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/vosfor-packs") {
        sendJson(response, 200, service.getState().arcanes?.packs ?? []);
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/arcane/")) {
        const slug = decodeURIComponent(url.pathname.slice("/api/arcane/".length));
        const detail = computeArcaneDetail(service, slug);
        sendJson(response, detail ? 200 : 404, detail ?? { error: `unknown arcane: ${slug}` });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/signature-value") {
        const result = computeSignatureValue(service, url);
        sendJson(response, result ? 200 : 400, result ?? { error: "weapon_slug required" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/weapons") {
        sendJson(response, 200, listWeapons(service, url));
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/weapon/")) {
        const slug = decodeURIComponent(url.pathname.slice("/api/weapon/".length));
        const detail = computeWeaponDetail(service, slug);
        sendJson(response, detail ? 200 : 404, detail ?? { error: `unknown weapon: ${slug}` });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/mcp-info") {
        sendJson(response, 200, {
          endpoint: "/mcp/sse",
          messages_endpoint: "/mcp/messages",
          transport: "sse",
          server: { name: "the-plat-exchange", version: "0.1.0" },
          tools: mcp.describeTools(),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/scan") {
        const payload = await readRequestJson(request);
        service.updateConfig(configUpdateFromPayload(payload));
        void service.refresh("manual");
        sendJson(response, 202, service.getState());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/refresh") {
        void service.refresh("manual");
        sendJson(response, 202, service.getState());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/mode") {
        const payload = await readRequestJson(request);
        const modeRaw = (isRecord(payload) ? readString(payload, "mode") : undefined) ?? "";
        const nextMode = modeRaw === "remote" ? "remote" : modeRaw === "full" ? "full" : modeRaw === "tiered" ? "tiered" : null;
        if (!nextMode) {
          sendJson(response, 400, { error: "mode must be one of tiered|full|remote" });
          return;
        }
        try {
          service.setMode(nextMode);
          sendJson(response, 200, service.getState());
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendJson(response, 400, { error: message });
        }
        return;
      }
      if (request.method === "GET") {
        await serveStatic(response, publicDir, url.pathname);
        return;
      }
      sendText(response, 405, "Method not allowed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 500, { error: message });
    }
  });
}

function buildEnrichmentContext(service: ThePlatExchangeService): { dispositionSignals: Map<string, "rising" | "falling">; signatureLookup: (slug: string, signature: string) => SignatureLookupHit } {
  const dispositionSignals = service.getDispositionSignals();
  const signatureLookup = (weaponSlug: string, signature: string): SignatureLookupHit => {
    const valuation = service.getSignatureValuation(weaponSlug, signature);
    const velocity = service.getSignatureVelocity(weaponSlug, signature);
    return {
      valuation: valuation ? { sample_count: valuation.sample_count, confidence: valuation.confidence, p25: valuation.p25, p50: valuation.p50 } : null,
      velocity: velocity ? { classification: velocity.classification } : null,
    };
  };
  return { dispositionSignals, signatureLookup };
}

function computeInstantWins(service: ThePlatExchangeService, url: URL): Array<{ opportunity: unknown; signature_value: unknown; expected_uplift: number }> {
  const limit = Math.max(1, Math.floor(Number(url.searchParams.get("limit") ?? 25)));
  const minConfidence = Number(url.searchParams.get("minConfidence") ?? url.searchParams.get("min_confidence") ?? 0.6);
  const state = service.getState();
  const ctx = buildEnrichmentContext(service);
  const hits: Array<{ opportunity: unknown; signature_value: unknown; expected_uplift: number }> = [];
  for (const opportunity of state.opportunities) {
    const valuation = service.getSignatureValuation(opportunity.weaponSlug, opportunity.signature);
    if (!valuation || valuation.sample_count < 8) continue;
    if (valuation.confidence < minConfidence) continue;
    if (valuation.p25 === null || valuation.p50 === null) continue;
    if (opportunity.buyPrice >= valuation.p25) continue;
    const velocity = service.getSignatureVelocity(opportunity.weaponSlug, opportunity.signature);
    const uplift = (valuation.p50 - opportunity.buyPrice) * valuation.confidence;
    hits.push({
      opportunity: enrichOpportunity(opportunity, Date.parse(state.generatedAt), ctx),
      signature_value: { ...valuation, velocity },
      expected_uplift: Math.round(uplift * 100) / 100,
    });
  }
  hits.sort((left, right) => right.expected_uplift - left.expected_uplift);
  return hits.slice(0, limit);
}

function computeArcaneDetail(service: ThePlatExchangeService, slug: string): Record<string, unknown> | null {
  const arcanes = service.getState().arcanes;
  if (!arcanes) return null;
  const summary = arcanes.summaries.find((entry) => entry.slug === slug);
  if (!summary) return null;
  const topPackDrops = arcanes.packs
    .map((pack) => {
      const drop = pack.topDrops.find((entry) => entry.arcaneSlug === slug);
      if (!drop) return null;
      return {
        packId: pack.packId,
        packName: pack.packName,
        chance: drop.chance,
        expectedCopies: drop.expectedCopies,
        expectedPlat: drop.expectedPlat,
        priceUsed: drop.priceUsed,
        confidence: pack.confidence,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const recommendation = arcanes.dissolveRecommendations.find((entry) => entry.slug === slug) ?? null;
  return {
    summary,
    recommendation,
    topPackDrops,
    ordersUrl: summary.url,
  };
}

function listWeapons(service: ThePlatExchangeService, url: URL): Array<Record<string, unknown>> {
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(500, Math.floor(Number(url.searchParams.get("limit") ?? 60))));
  const weapons = service.getAllWeapons();
  const state = service.getState();
  const summaryBySlug = new Map(state.weaponSummaries.map((summary) => [summary.slug, summary]));
  const matches = query
    ? weapons.filter((weapon) => weapon.name.toLowerCase().includes(query) || weapon.slug.toLowerCase().includes(query) || weapon.group.toLowerCase().includes(query))
    : weapons;
  const sorted = [...matches].sort((left, right) => {
    const leftLive = summaryBySlug.get(left.slug)?.priceStats?.p75 ?? -1;
    const rightLive = summaryBySlug.get(right.slug)?.priceStats?.p75 ?? -1;
    if (leftLive !== rightLive) return rightLive - leftLive;
    return right.disposition - left.disposition;
  });
  return sorted.slice(0, limit).map((weapon) => {
    const summary = summaryBySlug.get(weapon.slug);
    return {
      slug: weapon.slug,
      name: weapon.name,
      group: weapon.group,
      disposition: weapon.disposition,
      hasData: Boolean(summary),
      summary: summary ?? null,
      ...(weapon.imageName ? { imageName: weapon.imageName } : {}),
      auctionsUrl: `https://warframe.market/auctions/search?type=riven&weapon_url_name=${encodeURIComponent(weapon.slug)}&sort_by=price_asc`,
    };
  });
}

function computeWeaponDetail(service: ThePlatExchangeService, slug: string): Record<string, unknown> | null {
  const weapons = service.getAllWeapons();
  const weapon = weapons.find((entry) => entry.slug === slug);
  if (!weapon) return null;
  const state = service.getState();
  const summary = state.weaponSummaries.find((entry) => entry.slug === slug) ?? null;
  const ctx = buildEnrichmentContext(service);
  const opportunities = state.opportunities
    .filter((entry) => entry.weaponSlug === slug)
    .map((entry) => enrichOpportunity(entry, Date.parse(state.generatedAt), ctx))
    .slice(0, 50);
  const signatures = service.getSignaturesForWeapon(slug, 24);
  return {
    weapon,
    summary,
    opportunities,
    signatures,
    auctionsUrl: `https://warframe.market/auctions/search?type=riven&weapon_url_name=${encodeURIComponent(slug)}&sort_by=price_asc`,
  };
}

function computeSignatureValue(service: ThePlatExchangeService, url: URL): Record<string, unknown> | null {
  const weaponSlug = url.searchParams.get("weapon_slug") ?? url.searchParams.get("weaponSlug");
  if (!weaponSlug) return null;
  const explicit = url.searchParams.get("signature");
  const positives = url.searchParams.getAll("positives");
  const negatives = url.searchParams.getAll("negatives");
  const signature = explicit ?? attributeSignature([
    ...positives.map((urlName) => ({ urlName, value: 1, positive: true })),
    ...negatives.map((urlName) => ({ urlName, value: -1, positive: false })),
  ]);
  const windowDays = Math.max(1, Math.floor(Number(url.searchParams.get("window_days") ?? url.searchParams.get("windowDays") ?? 30)));
  const valuation = service.getSignatureValuation(weaponSlug, signature, windowDays);
  const velocity = service.getSignatureVelocity(weaponSlug, signature, windowDays);
  if (!valuation) {
    return { weapon_slug: weaponSlug, signature, sample_count: 0, note: "history disabled or no samples available yet" };
  }
  return { ...valuation, velocity };
}

function handleDashboardSse(request: IncomingMessage, response: ServerResponse, service: ThePlatExchangeService): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendState = (state: DashboardState) => {
    writeSse(response, "state", JSON.stringify(state));
  };
  const unsubscribe = service.subscribe(sendState);
  const heartbeat: NodeJS.Timeout = setInterval(() => {
    writeSse(response, "heartbeat", new Date().toISOString());
  }, 30_000);

  request.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

async function serveStatic(response: ServerResponse, publicDir: string, pathname: string): Promise<void> {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = normalize(decodeURIComponent(requested)).replace(/^\.\.(?:\/|\\|$)/, "");
  const filePath = join(publicDir, normalizedPath);
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" });
    response.end(content);
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  }
  if (body.trim().length === 0) return {};
  return JSON.parse(body);
}

function configUpdateFromPayload(payload: unknown): Partial<TraderConfig> {
  if (!isRecord(payload)) return {};
  const update: Partial<TraderConfig> = {};
  const watchlistValue = payload.watchlist;
  if (typeof watchlistValue === "string") {
    update.watchlist = splitWatchlist(watchlistValue);
  } else if (Array.isArray(watchlistValue)) {
    update.watchlist = watchlistValue.filter((entry): entry is string => typeof entry === "string");
  }

  const statusesValue = payload.statuses;
  if (Array.isArray(statusesValue)) {
    const statuses = statusesValue.filter((entry): entry is SellerStatus => entry === "ingame" || entry === "online" || entry === "offline" || entry === "unknown");
    if (statuses.length > 0) update.statuses = statuses;
  }

  const minProfit = readNumber(payload, "minProfit");
  const minRoi = readNumber(payload, "minRoi");
  const minGroupSize = readNumber(payload, "minGroupSize");
  const maxResults = readNumber(payload, "maxResults");
  const scanAllWhenWatchlistEmpty = readBoolean(payload, "scanAllWhenWatchlistEmpty");
  if (minProfit !== undefined) update.minProfit = minProfit;
  if (minRoi !== undefined) update.minRoi = minRoi;
  if (minGroupSize !== undefined) update.minGroupSize = minGroupSize;
  if (maxResults !== undefined) update.maxResults = maxResults;
  if (scanAllWhenWatchlistEmpty !== undefined) update.scanAllWhenWatchlistEmpty = scanAllWhenWatchlistEmpty;

  if (payload.minBuyPrice === null) {
    update.minBuyPrice = null;
  } else {
    const minBuyPrice = readNumber(payload, "minBuyPrice");
    if (minBuyPrice !== undefined) update.minBuyPrice = minBuyPrice;
  }

  if (payload.maxBuyPrice === null) {
    update.maxBuyPrice = null;
  } else {
    const maxBuyPrice = readNumber(payload, "maxBuyPrice");
    if (maxBuyPrice !== undefined) update.maxBuyPrice = maxBuyPrice;
  }
  if (payload.maxSellPrice === null) {
    update.maxSellPrice = null;
  } else {
    const maxSellPrice = readNumber(payload, "maxSellPrice");
    if (maxSellPrice !== undefined) update.maxSellPrice = maxSellPrice;
  }


  const watchlistText = readString(payload, "watchlistText");
  if (watchlistText !== undefined) update.watchlist = splitWatchlist(watchlistText);
  return update;
}

function splitWatchlist(value: string): string[] {
  return value.split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response: ServerResponse, status: number, payload: string): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(payload);
}

function writeSse(response: ServerResponse, event: string, data: string): void {
  response.write(`event: ${event}\n`);
  for (const line of data.split("\n")) response.write(`data: ${line}\n`);
  response.write("\n");
}
