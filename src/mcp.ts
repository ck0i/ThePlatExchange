/*
 * MCP-over-legacy-SSE transport with a versioned response envelope.
 *
 * Every tool returns { version, data, meta } — the meta block advertises
 * data freshness, coverage, and a quality tier (green/yellow/red) so clients
 * (and agents) can decide "is this trash?" without guessing.
 *
 * Legacy `content: [{type:"text", text:"<json>"}]` is preserved alongside
 * `structuredContent` so older MCP clients still work.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  computeMeta,
  enrichOpportunity,
  markEnvelopeInvalid,
  outputSchemas,
  toEnvelope,
  validateEnvelope,
  type EnrichedOpportunity,
  type Envelope,
  type EnvelopeMeta,
  type MetaComputeInput,
} from "./mcp/schemas.js";
import { isRecord, readNumber, readPositiveInteger, readString, readStringArray } from "./wfm/guards.js";
import { attributeSignature, slugify } from "./wfm/opportunities.js";
import type { ThePlatExchangeService } from "./wfm/scanner.js";
import type { ArcaneDashboardState, ArcaneDissolveRecommendation, ArcaneMarketSummary, ArcanePackStrategy, ArcanePackValuation, DashboardState, TraderConfig } from "./wfm/types.js";

interface McpSession {
  id: string;
  response: ServerResponse;
  createdAt: number;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: unknown;
  method: string;
  params?: unknown;
}

const LIVE_WINDOW_MS = 5 * 60_000;

export class McpSseServer {
  private readonly sessions = new Map<string, McpSession>();

  constructor(private readonly service: ThePlatExchangeService) {}

  handleSse(request: IncomingMessage, response: ServerResponse): void {
    const sessionId = randomUUID();
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const session: McpSession = { id: sessionId, response, createdAt: Date.now() };
    this.sessions.set(sessionId, session);
    this.writeEvent(response, "endpoint", `/mcp/messages?sessionId=${encodeURIComponent(sessionId)}`);
    this.writeEvent(response, "message", JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: { server: "the-plat-exchange" } }));
    request.on("close", () => {
      this.sessions.delete(sessionId);
    });
  }

  async handleMessage(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const session = this.sessions.get(sessionId);
    if (!session) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unknown MCP SSE session");
      return;
    }

    const body = await readRequestJson(request);
    const messages = Array.isArray(body) ? body : [body];
    for (const candidate of messages) {
      const parsed = parseJsonRpcRequest(candidate);
      if (!parsed) {
        this.sendMessage(session, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC request" } });
        continue;
      }
      const result = await this.dispatch(parsed);
      if (result !== null) this.sendMessage(session, result);
    }

    response.writeHead(202, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("accepted");
  }

  private async dispatch(request: JsonRpcRequest): Promise<Record<string, unknown> | null> {
    if (request.method.startsWith("notifications/")) return null;
    if (request.method === "initialize") {
      return ok(request.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: { name: "the-plat-exchange", version: "0.1.0" },
      });
    }
    if (request.method === "ping") return ok(request.id, {});
    if (request.method === "tools/list") return ok(request.id, { tools: this.tools() });
    if (request.method === "tools/call") return this.handleToolCall(request);
    if (request.method === "resources/list") {
      return ok(request.id, { resources: [{ uri: "the-plat-exchange://snapshot", name: "Current ThePlatExchange snapshot", mimeType: "application/json" }] });
    }
    if (request.method === "resources/read") {
      return ok(request.id, { contents: [{ uri: "the-plat-exchange://snapshot", mimeType: "application/json", text: JSON.stringify(this.service.getState(), null, 2) }] });
    }
    return err(request.id, -32601, `Unsupported MCP method: ${request.method}`, { retryable: false });
  }

  private async handleToolCall(request: JsonRpcRequest): Promise<Record<string, unknown>> {
    if (!isRecord(request.params)) return err(request.id, -32602, "tools/call requires params", { retryable: false });
    const name = readString(request.params, "name");
    const argumentsRecord = readRecordFromParams(request.params, "arguments");
    if (name === "the_plat_exchange_snapshot") return this.snapshotTool(request.id, argumentsRecord);
    if (name === "riven_opportunities") return this.opportunitiesTool(request.id, argumentsRecord);
    if (name === "riven_refresh") return this.refreshTool(request.id);
    if (name === "riven_set_watchlist") return this.watchlistTool(request.id, argumentsRecord);
    if (name === "riven_health") return this.healthTool(request.id);
    if (name === "riven_signature_value") return this.signatureValueTool(request.id, argumentsRecord);
    if (name === "riven_instant_wins") return this.instantWinsTool(request.id, argumentsRecord);
    if (name === "arcane_health") return this.arcaneHealthTool(request.id);
    if (name === "arcane_refresh") return this.arcaneRefreshTool(request.id);
    if (name === "arcane_packs") return this.arcanePacksTool(request.id, argumentsRecord);
    if (name === "arcane_dissolve_recommendations") return this.arcaneDissolveRecommendationsTool(request.id, argumentsRecord);
    if (name === "arcane_market") return this.arcaneMarketTool(request.id, argumentsRecord);
    if (name === "arcane_detail") return this.arcaneDetailTool(request.id, argumentsRecord);
    return err(request.id, -32602, `Unknown tool: ${name ?? "missing"}`, { retryable: false });
  }

  private buildSignatureLookup(): (weaponSlug: string, signature: string) => { valuation: null | { sample_count: number; confidence: number; p25: number | null; p50: number | null }; velocity: null | { classification: "fast_moving" | "stuck" | "unknown" } } {
    return (weaponSlug: string, signature: string) => {
      const valuation = this.service.getSignatureValuation(weaponSlug, signature);
      const velocity = this.service.getSignatureVelocity(weaponSlug, signature);
      return {
        valuation: valuation ? { sample_count: valuation.sample_count, confidence: valuation.confidence, p25: valuation.p25, p50: valuation.p50 } : null,
        velocity: velocity ? { classification: velocity.classification } : null,
      };
    };
  }

  private signatureValueTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const weaponSlug = readString(args, "weapon_slug") ?? readString(args, "weaponSlug");
    if (!weaponSlug) return err(id, -32602, "weapon_slug is required", { retryable: false });
    const explicitSignature = readString(args, "signature");
    const positives = readStringArray(args, "positives");
    const negatives = readStringArray(args, "negatives");
    const signature = explicitSignature ?? attributeSignature([
      ...positives.map((urlName) => ({ urlName, value: 1, positive: true })),
      ...negatives.map((urlName) => ({ urlName, value: -1, positive: false })),
    ]);
    const windowDays = Math.max(1, Math.floor(readNumber(args, "window_days") ?? readNumber(args, "windowDays") ?? 30));
    const valuation = this.service.getSignatureValuation(weaponSlug, signature, windowDays);
    const velocity = this.service.getSignatureVelocity(weaponSlug, signature, windowDays);
    const state = this.service.getState();
    const meta = this.buildMeta(state);
    if (!valuation) {
      return ok(id, this.finalizeEnvelope(toEnvelope({
        weapon_slug: weaponSlug,
        signature,
        window_days: windowDays,
        sample_count: 0,
        p25: null, p50: null, p75: null, p90: null, min: null, max: null,
        last_seen_price: null, last_seen_at: null,
        confidence: 0,
        velocity: null,
        note: "history disabled or no samples available yet",
      }, meta)));
    }
    const data = { ...valuation, velocity };
    return ok(id, this.finalizeEnvelope(toEnvelope(data, meta)));
  }

  private instantWinsTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 25);
    const requestedConfidence = readNumber(args, "minConfidence") ?? readNumber(args, "min_confidence") ?? 0.45;
    const minConfidence = Math.max(0, Math.min(1, requestedConfidence));
    const state = this.service.getState();
    const meta = this.buildMeta(state);
    const dispositionSignals = this.service.getDispositionSignals();
    const signatureLookup = this.buildSignatureLookup();
    const hits = [...(state.instantWins ?? [])]
      .filter((win) => (win.signature_value?.confidence ?? win.opportunity.confidence ?? 0) >= minConfidence)
      .sort((left, right) => right.expected_uplift - left.expected_uplift)
      .slice(0, limit)
      .map((win) => ({
        ...win,
        opportunity: enrichOpportunity(win.opportunity, Date.parse(state.generatedAt), { dispositionSignals, signatureLookup }),
      }));
    return ok(id, this.finalizeEnvelope(toEnvelope(hits, meta)));
  }

  private snapshotTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 25);
    const state = this.service.getState();
    const meta = this.buildMeta(state);
    const dispositionSignals = this.service.getDispositionSignals();
    const signatureLookup = this.buildSignatureLookup();
    const enriched = state.opportunities.slice(0, limit).map((opportunity) => enrichOpportunity(opportunity, Date.parse(state.generatedAt), { dispositionSignals, signatureLookup }));
    const enrichedWins = (state.instantWins ?? []).slice(0, limit).map((win) => ({
      ...win,
      opportunity: enrichOpportunity(win.opportunity, Date.parse(state.generatedAt), { dispositionSignals, signatureLookup }),
    }));
    const data = {
      totals: state.totals,
      opportunities: enriched,
      instantWins: enrichedWins,
      weaponSummaries: state.weaponSummaries.slice(0, limit),
      config: state.config,
      status: state.status,
    };
    return ok(id, this.finalizeEnvelope(toEnvelope(data, meta)));
  }

  private opportunitiesTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 25);
    const configUpdate: Partial<TraderConfig> = {};
    const minProfit = readNumber(args, "minProfit");
    const minRoi = readNumber(args, "minRoi");
    const minBuyPrice = readNumber(args, "minBuyPrice");
    const maxSellPrice = readNumber(args, "maxSellPrice");
    if (minProfit !== undefined) configUpdate.minProfit = minProfit;
    if (minRoi !== undefined) configUpdate.minRoi = minRoi;
    if (minBuyPrice !== undefined) configUpdate.minBuyPrice = minBuyPrice;
    if (maxSellPrice !== undefined) configUpdate.maxSellPrice = maxSellPrice;
    if (Object.keys(configUpdate).length > 0) this.service.updateConfig(configUpdate);
    const state = this.service.getState();
    const meta = this.buildMeta(state);
    const dispositionSignals = this.service.getDispositionSignals();
    const signatureLookup = this.buildSignatureLookup();
    const enriched: EnrichedOpportunity[] = state.opportunities
      .slice(0, limit)
      .map((opportunity) => enrichOpportunity(opportunity, Date.parse(state.generatedAt), { dispositionSignals, signatureLookup }));
    return ok(id, this.finalizeEnvelope(toEnvelope(enriched, meta)));
  }

  private refreshTool(id: unknown): Record<string, unknown> {
    void this.service.refresh("mcp");
    const state = this.service.getState();
    const meta = this.buildMeta(state);
    return ok(id, this.finalizeEnvelope(toEnvelope({ accepted: true, reason: "refresh scheduled" }, meta)));
  }

  private watchlistTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const watchlist = parseWatchlist(args);
    this.service.updateConfig({ watchlist });
    void this.service.refresh("mcp-watchlist");
    const state = this.service.getState();
    const meta = this.buildMeta(state);
    return ok(id, this.finalizeEnvelope(toEnvelope({ accepted: true, watchlist }, meta)));
  }

  private healthTool(id: unknown): Record<string, unknown> {
    const state = this.service.getState();
    const meta = this.buildMeta(state);
    return ok(id, this.finalizeEnvelope(toEnvelope(null, meta)));
  }

  private arcaneHealthTool(id: unknown): Record<string, unknown> {
    const state = this.service.getState();
    const meta = this.buildArcaneMeta(state);
    return ok(id, this.finalizeEnvelope(toEnvelope(null, meta)));
  }

  private arcaneRefreshTool(id: unknown): Record<string, unknown> {
    void this.service.refreshArcanes("mcp-arcane", "full");
    const state = this.service.getState();
    const meta = this.buildArcaneMeta(state);
    return ok(id, this.finalizeEnvelope(toEnvelope({ accepted: true, reason: "arcane refresh scheduled" }, meta)));
  }

  private arcanePacksTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 25);
    const minConfidence = readNumber(args, "minConfidence") ?? readNumber(args, "min_confidence") ?? 0;
    const strategy = readArcanePackStrategy(args);
    const state = this.service.getState();
    const meta = this.buildArcaneMeta(state);
    const packs = [...(state.arcanes?.packs ?? [])]
      .filter((pack) => packStrategyMetrics(pack, strategy).confidence >= minConfidence)
      .sort((left, right) => compareArcanePacks(left, right, strategy))
      .slice(0, limit);
    return ok(id, this.finalizeEnvelope(toEnvelope(packs, meta)));
  }

  private arcaneDissolveRecommendationsTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 25);
    const minDelta = readNumber(args, "minDeltaPlat") ?? readNumber(args, "min_delta_plat");
    const actions = parseArcaneActions(args);
    const strategy = readArcanePackStrategy(args);
    const state = this.service.getState();
    const meta = this.buildArcaneMeta(state);
    const recommendations = (state.arcanes?.dissolveRecommendationsByStrategy?.[strategy] ?? state.arcanes?.dissolveRecommendations ?? [])
      .filter((entry) => actions.size === 0 || actions.has(entry.action))
      .filter((entry) => minDelta === undefined || entry.deltaPlat >= minDelta)
      .slice(0, limit);
    return ok(id, this.finalizeEnvelope(toEnvelope(recommendations, meta)));
  }

  private arcaneMarketTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 25);
    const query = readString(args, "query") ?? readString(args, "q") ?? "";
    const rarityValues = [...readStringArray(args, "rarities"), ...readStringArray(args, "rarity")];
    const singleRarity = readString(args, "rarity");
    if (singleRarity) rarityValues.push(singleRarity);
    const rarityFilter = new Set(rarityValues.map((entry) => entry.toLowerCase()));
    const minOnlineSellListings = Math.max(0, Math.floor(readNumber(args, "minOnlineSellListings") ?? readNumber(args, "min_online_sell_listings") ?? 0));
    const sort = readArcaneMarketSort(args);
    const state = this.service.getState();
    const meta = this.buildArcaneMeta(state);
    const needle = query.trim().toLowerCase();
    const summaries = [...(state.arcanes?.summaries ?? [])]
      .filter((summary) => !needle || summary.name.toLowerCase().includes(needle) || summary.slug.toLowerCase().includes(needle))
      .filter((summary) => rarityFilter.size === 0 || rarityFilter.has(summary.rarity))
      .filter((summary) => summary.onlineSellListings >= minOnlineSellListings)
      .sort((left, right) => compareArcaneSummariesForTool(left, right, sort))
      .slice(0, limit);
    return ok(id, this.finalizeEnvelope(toEnvelope(summaries, meta)));
  }

  private arcaneDetailTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const requested = readString(args, "slug") ?? readString(args, "name") ?? readString(args, "query");
    if (!requested) return err(id, -32602, "slug or name is required", { retryable: false });
    const state = this.service.getState();
    const meta = this.buildArcaneMeta(state);
    const detail = state.arcanes ? computeArcaneDetail(state.arcanes, requested) : null;
    return ok(id, this.finalizeEnvelope(toEnvelope(detail, meta)));
  }

  private buildArcaneMeta(state: DashboardState): EnvelopeMeta {
    const arcanes = state.arcanes;
    const status = arcanes?.status;
    const generatedAt = arcanes?.generatedAt ?? state.generatedAt;
    const generatedAtMs = Date.parse(generatedAt);
    const fallbackLatestScan = latestArcaneScanAt(arcanes?.summaries ?? []);
    const lastSampleAt = status?.finishedAt ?? status?.startedAt ?? fallbackLatestScan;
    const freshness = lastSampleAt ? Math.max(0, generatedAtMs - Date.parse(lastSampleAt)) : Number.MAX_SAFE_INTEGER;
    const dataSource: EnvelopeMeta["data_source"] = status?.running || freshness < LIVE_WINDOW_MS ? "live" : "cache";
    const totalTargets = status && status.totalWeapons > 0 ? status.totalWeapons : arcanes?.reference.items ?? 0;
    const scannedTargets = status ? status.scannedWeapons : (arcanes?.summaries.filter((summary) => summary.lastScannedAt).length ?? 0);
    return computeMeta({
      generated_at: generatedAt,
      data_source: dataSource,
      freshness_ms: freshness,
      scanned: scannedTargets,
      total: totalTargets,
      scan_running: status?.running ?? false,
    });
  }

  private buildMeta(state: DashboardState): EnvelopeMeta {
    const nowMs = Date.parse(state.generatedAt);
    const lastSampleAt = state.status.finishedAt ?? state.status.startedAt;
    const freshness = lastSampleAt ? Math.max(0, nowMs - Date.parse(lastSampleAt)) : Number.MAX_SAFE_INTEGER;
    const dataSource: EnvelopeMeta["data_source"] = state.status.running || freshness < LIVE_WINDOW_MS ? "live" : "cache";
    const totalTargets = state.status.totalWeapons > 0 ? state.status.totalWeapons : state.reference.weapons;
    const input: MetaComputeInput = {
      generated_at: state.generatedAt,
      data_source: dataSource,
      freshness_ms: freshness,
      scanned: state.status.scannedWeapons,
      total: totalTargets,
      scan_running: state.status.running,
    };
    return computeMeta(input);
  }

  private finalizeEnvelope<T>(envelope: Envelope<T>): Record<string, unknown> {
    const validation = validateEnvelope(envelope);
    const safe = validation.ok ? envelope : markEnvelopeInvalid(envelope, validation.ok ? "" : validation.message);
    return {
      content: [{ type: "text", text: JSON.stringify(safe, null, 2) }],
      structuredContent: safe,
    };
  }

  describeTools(): Array<{ name: string; description: string }> {
    return this.tools().map((tool) => ({
      name: String(tool.name),
      description: String(tool.description ?? ""),
    }));
  }

  private tools(): Array<Record<string, unknown>> {
    return [
      {
        name: "the_plat_exchange_snapshot",
        description: "Return the current ThePlatExchange dashboard snapshot wrapped in a versioned envelope. Inspect `meta.quality` and `meta.warnings` before consuming `data.opportunities` — red means don't trust.",
        inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, default: 25 } }, additionalProperties: false },
        outputSchema: outputSchemas.snapshot,
      },
      {
        name: "riven_opportunities",
        description: "Return ranked buy-low/sell-high riven opportunities. Each opportunity carries a `quality` block (tier A–D and signal tags like low_comparables/new_seller/stale_seller).",
        inputSchema: {
          type: "object",
          properties: { limit: { type: "number", minimum: 1, default: 25 }, minProfit: { type: "number", minimum: 0 }, minRoi: { type: "number", minimum: 0 }, minBuyPrice: { type: "number", minimum: 0 }, maxSellPrice: { type: "number", minimum: 0 } },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.opportunities,
      },
      {
        name: "riven_refresh",
        description: "Start a non-overlapping Warframe.market riven refresh through the shared server-side token bucket.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        outputSchema: outputSchemas.action,
      },
      {
        name: "riven_set_watchlist",
        description: "Set a riven weapon watchlist and start a refresh. Empty watchlist scans all riven weapons.",
        inputSchema: {
          type: "object",
          properties: { watchlist: { type: "array", items: { type: "string" } }, watchlistText: { type: "string" } },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.action,
      },
      {
        name: "riven_health",
        description: "Return only the meta block (freshness, coverage, quality, warnings). Cheap probe for agents to check trust before calling other tools.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        outputSchema: outputSchemas.health,
      },
      {
        name: "riven_signature_value",
        description: "Look up the trailing p25/p50/p75/p90 sell price for a specific riven trait signature (positives + negatives) on a weapon, plus a velocity block estimating how fast listings with that signature actually move. Returns confidence 0..1; ignore when confidence is low.",
        inputSchema: {
          type: "object",
          properties: {
            weapon_slug: { type: "string" },
            positives: { type: "array", items: { type: "string" } },
            negatives: { type: "array", items: { type: "string" } },
            signature: { type: "string" },
            window_days: { type: "number", minimum: 1, default: 30 },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.signatureValue,
      },
      {
        name: "riven_instant_wins",
        description: "Return current raw-auction snipe candidates priced materially below same-signature peers or the usable weapon-market floor. Ranked by conservative uplift times confidence.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 25 },
            minConfidence: { type: "number", minimum: 0, maximum: 1, default: 0.45 },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.instantWins,
      },
      {
        name: "arcane_health",
        description: "Return only the arcane meta block (freshness, coverage, quality, warnings). Uses the arcane scan status, not riven weapon scan status.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        outputSchema: outputSchemas.health,
      },
      {
        name: "arcane_refresh",
        description: "Start a non-overlapping Warframe.market arcane order refresh through the shared server-side token bucket.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        outputSchema: outputSchemas.action,
      },
      {
        name: "arcane_packs",
        description: "Return ranked 200-Vosfor Arcane pack Raw Plat Output values. Defaults to high-value max-out targets (max-rank sale ≥180p) and can switch back to rank-0 bulk EV.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 25 },
            minConfidence: { type: "number", minimum: 0, maximum: 1, default: 0 },
            strategy: { enum: ["high_value_maxed", "rank0_bulk"], default: "high_value_maxed" },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.arcanePacks,
      },
      {
        name: "arcane_dissolve_recommendations",
        description: "Return Arcane sell-vs-dissolve recommendations. Defaults to high-value max-out Raw Plat Output; use strategy=rank0_bulk for the old direct rank-0 EV path.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 25 },
            action: { enum: ["dissolve", "sell", "hold"] },
            actions: { type: "array", items: { enum: ["dissolve", "sell", "hold"] } },
            minDeltaPlat: { type: "number" },
            strategy: { enum: ["high_value_maxed", "rank0_bulk"], default: "high_value_maxed" },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.arcaneDissolveRecommendations,
      },
      {
        name: "arcane_market",
        description: "Discover Arcane market rows with rank-0/max-rank price stats, liquidity, rarity, and platinum-per-Vosfor. Supports query, rarity, liquidity, and sort filters.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 25 },
            query: { type: "string" },
            q: { type: "string" },
            rarity: { anyOf: [{ type: "string", enum: ["common", "uncommon", "rare", "legendary", "unknown"] }, { type: "array", items: { enum: ["common", "uncommon", "rare", "legendary", "unknown"] } }] },
            rarities: { type: "array", items: { enum: ["common", "uncommon", "rare", "legendary", "unknown"] } },
            minOnlineSellListings: { type: "number", minimum: 0 },
            sort: { enum: ["default", "sell_price", "liquidity", "vosfor_value"] },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.arcaneMarket,
      },
      {
        name: "arcane_detail",
        description: "Look up one Arcane by slug or name and return its market summary, sell-vs-dissolve recommendation, and every Vosfor pack drop entry containing it.",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            name: { type: "string" },
            query: { type: "string" },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.arcaneDetail,
      },
    ];
  }

  private sendMessage(session: McpSession, payload: Record<string, unknown>): void {
    this.writeEvent(session.response, "message", JSON.stringify(payload));
  }

  private writeEvent(response: ServerResponse, event: string, data: string): void {
    response.write(`event: ${event}\n`);
    response.write(`data: ${data}\n\n`);
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

function parseJsonRpcRequest(value: unknown): JsonRpcRequest | null {
  if (!isRecord(value)) return null;
  const method = readString(value, "method");
  if (!method) return null;
  const parsed: JsonRpcRequest = { jsonrpc: "2.0", method };
  if (value.id !== undefined) parsed.id = value.id;
  if (value.params !== undefined) parsed.params = value.params;
  return parsed;
}

function readRecordFromParams(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function parseWatchlist(record: Record<string, unknown>): string[] {
  const arrayValues = readStringArray(record, "watchlist");
  const text = readString(record, "watchlistText");
  const textValues = text ? text.split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0) : [];
  return [...arrayValues, ...textValues];
}

type ArcaneAction = ArcaneDissolveRecommendation["action"];
type ArcaneMarketSort = "default" | "sell_price" | "liquidity" | "vosfor_value";

function readArcanePackStrategy(record: Record<string, unknown>): ArcanePackStrategy {
  const value = readString(record, "strategy") ?? readString(record, "rawPlatStrategy") ?? readString(record, "raw_plat_strategy");
  return value === "rank0_bulk" ? "rank0_bulk" : "high_value_maxed";
}

function parseArcaneActions(record: Record<string, unknown>): Set<ArcaneAction> {
  const values = [...readStringArray(record, "actions")];
  const single = readString(record, "action");
  if (single) values.push(single);
  const valid = new Set<ArcaneAction>();
  for (const value of values) {
    if (value === "dissolve" || value === "sell" || value === "hold") valid.add(value);
  }
  return valid;
}

function readArcaneMarketSort(record: Record<string, unknown>): ArcaneMarketSort {
  const value = readString(record, "sort");
  if (value === "sell_price" || value === "liquidity" || value === "vosfor_value") return value;
  return "default";
}

function packStrategyMetrics(pack: ArcanePackValuation, strategy: ArcanePackStrategy) {
  const metrics = pack.strategyMetrics?.[strategy];
  if (metrics) return metrics;
  if (strategy === "high_value_maxed") {
    const expectedPlat = Number(pack.expectedHighValueMaxedPlat ?? 0);
    const expectedPlatPerVosfor = Number(pack.expectedHighValueMaxedPlatPerVosfor ?? 0);
    return {
      strategy,
      label: "High-value max-out",
      expectedPlat,
      expectedPlatPerVosfor,
      confidence: Number(pack.highValueConfidence ?? 0),
      coveragePct: Number(pack.maxRankCoveragePct ?? 0),
      targetChance: Number(pack.highValueTargetChance ?? 0),
      chanceAtLeastOneTarget: Number(pack.chanceAtLeastOneHighValue ?? 0),
      expectedTargetCopies: Number(pack.expectedHighValueCopies ?? 0),
      targetCount: Number(pack.highValueTargetCount ?? 0),
    };
  }
  return {
    strategy,
    label: "Rank-0 bulk EV",
    expectedPlat: pack.expectedPlat,
    expectedPlatPerVosfor: pack.expectedPlatPerVosfor,
    confidence: pack.confidence,
    coveragePct: pack.coveragePct,
    targetChance: 1,
    chanceAtLeastOneTarget: 1,
    expectedTargetCopies: pack.rewardsPerPack,
    targetCount: pack.topDrops.length,
  };
}

function compareArcanePacks(left: ArcanePackValuation, right: ArcanePackValuation, strategy: ArcanePackStrategy): number {
  const leftMetrics = packStrategyMetrics(left, strategy);
  const rightMetrics = packStrategyMetrics(right, strategy);
  if (rightMetrics.expectedPlatPerVosfor !== leftMetrics.expectedPlatPerVosfor) return rightMetrics.expectedPlatPerVosfor - leftMetrics.expectedPlatPerVosfor;
  if (rightMetrics.chanceAtLeastOneTarget !== leftMetrics.chanceAtLeastOneTarget) return rightMetrics.chanceAtLeastOneTarget - leftMetrics.chanceAtLeastOneTarget;
  if (rightMetrics.confidence !== leftMetrics.confidence) return rightMetrics.confidence - leftMetrics.confidence;
  return rightMetrics.expectedPlat - leftMetrics.expectedPlat;
}

function compareArcaneSummariesForTool(left: ArcaneMarketSummary, right: ArcaneMarketSummary, sort: ArcaneMarketSort): number {
  const leftRank0Sell = left.rank0.sell?.p25 ?? left.rank0.sell?.median ?? left.rank0.sell?.min ?? null;
  const rightRank0Sell = right.rank0.sell?.p25 ?? right.rank0.sell?.median ?? right.rank0.sell?.min ?? null;
  if (sort === "sell_price") return nullableDesc(rightRank0Sell, leftRank0Sell) || right.onlineSellListings - left.onlineSellListings;
  if (sort === "liquidity") return right.onlineSellListings - left.onlineSellListings || right.sellListings - left.sellListings;
  if (sort === "vosfor_value") return nullableAsc(left.priceVsVosfor?.platinumPerVosfor ?? null, right.priceVsVosfor?.platinumPerVosfor ?? null);
  return (right.priceVsVosfor?.platinumPerVosfor ?? -1) - (left.priceVsVosfor?.platinumPerVosfor ?? -1) || right.onlineSellListings - left.onlineSellListings;
}

function nullableDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left - right;
}

function nullableAsc(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}


function computeArcaneDetail(arcanes: ArcaneDashboardState, query: string): Record<string, unknown> | null {
  const querySlug = slugify(query);
  const queryLower = query.trim().toLowerCase();
  const summary = arcanes.summaries.find((entry) => entry.slug === querySlug || entry.name.toLowerCase() === queryLower) ?? null;
  if (!summary) return null;
  const topPackDrops = arcanes.packs
    .map((pack) => {
      const drop = pack.topDrops.find((entry) => entry.arcaneSlug === summary.slug);
      if (!drop) return null;
      return {
        packId: pack.packId,
        packName: pack.packName,
        chance: drop.chance,
        expectedCopies: drop.expectedCopies,
        expectedPlat: drop.expectedPlat,
        expectedHighValueMaxedPlat: drop.expectedHighValueMaxedPlat ?? 0,
        expectedVosfor: drop.expectedVosfor,
        priceUsed: drop.priceUsed,
        maxRankPrice: drop.maxRankPrice ?? null,
        copiesToMax: drop.copiesToMax ?? null,
        highValueTarget: drop.highValueTarget ?? false,
        confidence: packStrategyMetrics(pack, "high_value_maxed").confidence,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => (right.expectedHighValueMaxedPlat ?? 0) - (left.expectedHighValueMaxedPlat ?? 0) || right.expectedPlat - left.expectedPlat);
  return {
    summary,
    recommendation: (arcanes.dissolveRecommendationsByStrategy?.high_value_maxed ?? arcanes.dissolveRecommendations).find((entry) => entry.slug === summary.slug) ?? null,
    topPackDrops,
    ordersUrl: summary.url,
  };
}

function latestArcaneScanAt(summaries: readonly ArcaneMarketSummary[]): string | undefined {
  let latest = 0;
  for (const summary of summaries) {
    if (!summary.lastScannedAt) continue;
    const parsed = Date.parse(summary.lastScannedAt);
    if (Number.isFinite(parsed) && parsed > latest) latest = parsed;
  }
  return latest > 0 ? new Date(latest).toISOString() : undefined;
}

function ok(id: unknown, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(id: unknown, code: number, message: string, data?: { retryable?: boolean; retry_after_s?: number }): Record<string, unknown> {
  const errorBody: Record<string, unknown> = { code, message };
  if (data !== undefined) errorBody.data = data;
  return { jsonrpc: "2.0", id: id ?? null, error: errorBody };
}
