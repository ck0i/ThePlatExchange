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
import { isRecord, readBoolean, readNumber, readPositiveInteger, readString, readStringArray } from "./wfm/guards.js";
import { attributeSignature, slugify } from "./wfm/opportunities.js";
import type { ProductDashboardState, ProductOpportunity, ProductOpportunityAction, SourceHealth } from "./wfm/product.js";
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
    if (name === "product_health") return this.productHealthTool(request.id);
    if (name === "product_refresh") return this.productRefreshTool(request.id);
    if (name === "product_methods") return this.productMethodsTool(request.id, argumentsRecord);
    if (name === "product_opportunities") return this.productOpportunitiesTool(request.id, argumentsRecord);
    if (name === "product_prime_relics") return this.productPrimeRelicsTool(request.id, argumentsRecord);
    if (name === "product_run_now") return this.productRunNowTool(request.id, argumentsRecord);
    if (name === "product_expansion_markets") return this.productExpansionMarketsTool(request.id, argumentsRecord);
    if (name === "product_advanced_analytics") return this.productAdvancedAnalyticsTool(request.id, argumentsRecord);
    if (name === "product_planner") return this.productPlannerTool(request.id, argumentsRecord);
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

  private productHealthTool(id: unknown): Record<string, unknown> {
    const product = this.service.getProductState();
    const meta = this.buildProductMeta(product);
    const data = {
      generatedAt: product.generatedAt,
      status: product.dataHealth.status,
      sources: product.dataHealth.sources,
      warnings: product.dataHealth.warnings,
      counts: {
        methods: product.methods.length,
        opportunities: product.opportunities.length,
        runNowActivities: product.runNow.activities.length,
        runNowRejectedActivities: product.runNow.rejectedActivities.length,
        primeRelics: product.prime.relicCount,
        primeRewards: product.prime.rewardCount,
        expansion: {
          mods: product.expansion.mods.length,
          syndicates: product.expansion.syndicates.length,
          baro: product.expansion.baro.length,
          resources: product.expansion.resources.length,
          eventShocks: product.expansion.eventShocks.length,
          bespokeMarkets: product.expansion.bespokeMarkets.length,
        },
        planner: {
          watchlists: product.personalization.watchlists.length,
          portfolio: product.personalization.portfolio.length,
          todos: product.personalization.todos.length,
          notificationRules: product.personalization.notificationRules.length,
          tradeJournal: product.personalization.tradeJournal.length,
        },
      },
      methods: product.methods,
    };
    return ok(id, this.finalizeEnvelope(toEnvelope(data, meta)));
  }

  private productRefreshTool(id: unknown): Record<string, unknown> {
    void this.service.refreshProduct("mcp-product");
    const product = this.service.getProductState();
    const meta = this.buildProductMeta(product);
    return ok(id, this.finalizeEnvelope(toEnvelope({ accepted: true, reason: "product refresh scheduled" }, meta)));
  }

  private productMethodsTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 25);
    const product = this.service.getProductState();
    const meta = this.buildProductMeta(product);
    const sourcesById = new Map(product.dataHealth.sources.map((source) => [source.id, source]));
    const ids = readStringSet(args, ["methodId", "method_id", "id"], ["methodIds", "method_ids", "ids"]);
    const statuses = readStringSet(args, ["status"], ["statuses"]);
    const needle = (readString(args, "query") ?? readString(args, "q") ?? "").trim().toLowerCase();
    const methods = product.methods
      .filter((method) => ids.size === 0 || ids.has(method.id))
      .filter((method) => statuses.size === 0 || statuses.has(method.status))
      .filter((method) => !needle || method.id.toLowerCase().includes(needle) || method.label.toLowerCase().includes(needle) || method.description.toLowerCase().includes(needle))
      .map((method) => ({
        ...method,
        sources: method.sourceIds.map((sourceId) => sourcesById.get(sourceId)).filter((source): source is SourceHealth => source !== undefined),
      }))
      .slice(0, limit);
    return ok(id, this.finalizeEnvelope(toEnvelope(methods, meta)));
  }

  private productOpportunitiesTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 25);
    const product = this.service.getProductState();
    const meta = this.buildProductMeta(product);
    const opportunities = filterProductOpportunities(product.opportunities, args)
      .sort((left, right) => compareProductOpportunitiesForTool(left, right, readProductOpportunitySort(args)))
      .slice(0, limit);
    return ok(id, this.finalizeEnvelope(toEnvelope(opportunities, meta)));
  }

  private productPrimeRelicsTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 10);
    const product = this.service.getProductState();
    const meta = this.buildProductMeta(product);
    const section = readPrimeSection(args);
    const minConfidence = readNumber(args, "minConfidence") ?? readNumber(args, "min_confidence");
    const prime = product.prime;
    const data: Record<string, unknown> = {
      generatedAt: prime.generatedAt,
      summary: prime.summary,
      relicCount: prime.relicCount,
      rewardCount: prime.rewardCount,
      scannedMarketItems: prime.scannedMarketItems,
      sources: prime.sources,
      warnings: prime.warnings,
      section,
    };
    const include = (name: PrimeSection) => section === "all" || section === name;
    const relicFilter = <T extends { confidence?: number }>(entries: readonly T[]) => entries
      .filter((entry) => minConfidence === undefined || (entry.confidence ?? 0) >= minConfidence)
      .slice(0, limit);
    const opportunityFilter = (entries: readonly ProductOpportunity[]) => filterProductOpportunities(entries, args).slice(0, limit);
    if (include("best_relics_to_sell")) data.bestRelicsToSell = relicFilter(prime.bestRelicsToSell);
    if (include("best_relics_to_crack")) data.bestRelicsToCrack = relicFilter(prime.bestRelicsToCrack);
    if (include("best_aya_purchases")) data.bestAyaPurchases = relicFilter(prime.bestAyaPurchases);
    if (include("set_completion")) data.setCompletion = opportunityFilter(prime.setCompletion);
    if (include("ducat_recommendations")) data.ducatRecommendations = opportunityFilter(prime.ducatRecommendations);
    if (include("fissures")) data.fissures = relicFilter(prime.fissures);
    if (include("supply_shocks")) data.supplyShocks = opportunityFilter(prime.supplyShocks);
    if (section !== "all") data.items = firstProductSlice(data);
    return ok(id, this.finalizeEnvelope(toEnvelope(data, meta)));
  }

  private productRunNowTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 10);
    const product = this.service.getProductState();
    const meta = this.buildProductMeta(product);
    const query = (readString(args, "query") ?? readString(args, "q") ?? "").trim().toLowerCase();
    const activityType = (readString(args, "activityType") ?? readString(args, "activity_type") ?? "").trim().toLowerCase();
    const minPriority = readNumber(args, "minPriority") ?? readNumber(args, "min_priority");
    const minEvPerMinute = readNumber(args, "minEvPerMinute") ?? readNumber(args, "min_ev_per_minute");
    const includeRejected = readBoolean(args, "includeRejected") ?? readBoolean(args, "include_rejected") ?? false;
    const activities = [...product.runNow.activities]
      .filter((activity) => !activityType || activity.activityType.toLowerCase() === activityType)
      .filter((activity) => !query || activity.title.toLowerCase().includes(query) || activity.node?.toLowerCase().includes(query) || activity.missionType?.toLowerCase().includes(query))
      .filter((activity) => minPriority === undefined || activity.priority >= minPriority)
      .filter((activity) => minEvPerMinute === undefined || activity.evPerMinute >= minEvPerMinute)
      .sort((left, right) => right.priority - left.priority || right.evPerMinute - left.evPerMinute || right.confidenceScore - left.confidenceScore)
      .slice(0, limit);
    const data: Record<string, unknown> = {
      generatedAt: product.runNow.generatedAt,
      activities,
      warnings: product.runNow.warnings,
    };
    if (includeRejected) data.rejectedActivities = product.runNow.rejectedActivities.slice(0, limit);
    return ok(id, this.finalizeEnvelope(toEnvelope(data, meta)));
  }

  private productExpansionMarketsTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 10);
    const product = this.service.getProductState();
    const meta = this.buildProductMeta(product);
    const sections = readExpansionSections(args);
    const includeGated = readBoolean(args, "includeGated") ?? readBoolean(args, "include_gated") ?? true;
    const data: Record<string, unknown> = { generatedAt: product.generatedAt, sections: [...sections] };
    const include = (section: ExpansionSection) => sections.has("all") || sections.has(section);
    if (include("mods")) data.mods = filterProductOpportunities(product.expansion.mods, args).slice(0, limit);
    if (include("syndicates")) data.syndicates = filterProductOpportunities(product.expansion.syndicates, args).slice(0, limit);
    if (include("baro")) data.baro = filterProductOpportunities(product.expansion.baro, args).slice(0, limit);
    if (include("resources")) data.resources = filterProductOpportunities(product.expansion.resources, args).slice(0, limit);
    if (include("event_shocks")) data.eventShocks = filterProductOpportunities(product.expansion.eventShocks, args).slice(0, limit);
    if (includeGated && include("bespoke_markets")) data.bespokeMarkets = product.expansion.bespokeMarkets.slice(0, limit);
    if (!sections.has("all")) data.items = firstProductSlice(data);
    return ok(id, this.finalizeEnvelope(toEnvelope(data, meta)));
  }

  private productAdvancedAnalyticsTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 10);
    const product = this.service.getProductState();
    const meta = this.buildProductMeta(product);
    const section = readAdvancedSection(args);
    const advanced = product.advanced;
    const data: Record<string, unknown> = { generatedAt: product.generatedAt, section };
    const include = (name: AdvancedSection) => section === "all" || section === name;
    if (include("trade_journal")) data.tradeJournal = advanced.tradeJournal;
    if (include("portfolio_aging")) data.portfolioAging = advanced.portfolioAging.slice(0, limit);
    if (include("aggregate_trends")) data.aggregateTrends = advanced.aggregateTrends.slice(0, limit);
    if (include("team_watchlists")) data.teamWatchlists = advanced.teamWatchlists.slice(0, limit);
    if (include("method_guides")) data.methodGuides = advanced.methodGuides.slice(0, limit);
    if (section !== "all") data.items = firstProductSlice(data);
    return ok(id, this.finalizeEnvelope(toEnvelope(data, meta)));
  }

  private productPlannerTool(id: unknown, args: Record<string, unknown>): Record<string, unknown> {
    const limit = readPositiveInteger(args, "limit", 25);
    const product = this.service.getProductState();
    const meta = this.buildProductMeta(product);
    const section = readPlannerSection(args);
    const personalization = product.personalization;
    const query = (readString(args, "query") ?? readString(args, "q") ?? "").trim().toLowerCase();
    const methodIds = readStringSet(args, ["methodId", "method_id"], ["methodIds", "method_ids"]);
    const todoStatuses = readStringSet(args, ["status"], ["statuses"]);
    const data: Record<string, unknown> = { generatedAt: product.generatedAt, section, warnings: personalization.warnings };
    const include = (name: PlannerSection) => section === "all" || section === name;
    if (include("profile")) data.profile = personalization.profile;
    if (include("watchlists")) data.watchlists = personalization.watchlists
      .filter((entry) => !query || entry.name.toLowerCase().includes(query) || entry.itemRefs.some((item) => item.name.toLowerCase().includes(query) || item.wfmSlug?.toLowerCase().includes(query)))
      .slice(0, limit);
    if (include("portfolio")) data.portfolio = personalization.portfolio
      .filter((entry) => !query || entry.item.name.toLowerCase().includes(query) || entry.item.wfmSlug?.toLowerCase().includes(query))
      .slice(0, limit);
    if (include("todos")) data.todos = personalization.todos
      .filter((entry) => todoStatuses.size === 0 || todoStatuses.has(entry.status))
      .filter((entry) => methodIds.size === 0 || (entry.methodId !== undefined && methodIds.has(entry.methodId)))
      .filter((entry) => !query || entry.title.toLowerCase().includes(query) || entry.itemRefs.some((item) => item.name.toLowerCase().includes(query) || item.wfmSlug?.toLowerCase().includes(query)))
      .slice(0, limit);
    if (include("notification_rules")) data.notificationRules = personalization.notificationRules
      .filter((entry) => methodIds.size === 0 || entry.methodIds.some((methodId) => methodIds.has(methodId)))
      .filter((entry) => !query || entry.name.toLowerCase().includes(query))
      .slice(0, limit);
    if (include("deliveries")) data.deliveries = personalization.deliveries.slice(0, limit);
    if (include("trade_journal")) data.tradeJournal = personalization.tradeJournal
      .filter((entry) => !query || entry.item.name.toLowerCase().includes(query) || entry.item.wfmSlug?.toLowerCase().includes(query))
      .slice(0, limit);
    data.exportAvailable = personalization.exportAvailable;
    data.deleteAvailable = personalization.deleteAvailable;
    if (section !== "all") data.items = firstProductSlice(data);
    return ok(id, this.finalizeEnvelope(toEnvelope(data, meta)));
  }

  private buildProductMeta(product: ProductDashboardState): EnvelopeMeta {
    const responseAtMs = Date.now();
    const generatedAt = new Date(responseAtMs).toISOString();
    const productGeneratedAtMs = Date.parse(product.generatedAt);
    const healthGeneratedAtMs = Date.parse(product.dataHealth.generatedAt);
    const sourceTimes = [
      productGeneratedAtMs,
      healthGeneratedAtMs,
      ...product.dataHealth.sources.map((source) => Date.parse(source.lastSuccessAt ?? source.lastFailureAt ?? "")),
    ].filter((value) => Number.isFinite(value));
    const newestSourceAt = sourceTimes.length > 0 ? Math.max(...sourceTimes) : Number.NaN;
    const freshness = Number.isFinite(newestSourceAt)
      ? Math.max(0, responseAtMs - newestSourceAt)
      : Number.MAX_SAFE_INTEGER;
    const totalSources = product.dataHealth.sources.length;
    const healthySources = product.dataHealth.sources.filter((source) => source.status !== "red").length;
    const computed = computeMeta({
      generated_at: generatedAt,
      data_source: freshness < LIVE_WINDOW_MS ? "live" : "cache",
      freshness_ms: freshness,
      scanned: healthySources,
      total: totalSources,
      scan_running: false,
    });
    return {
      ...computed,
      quality: worseQuality(computed.quality, product.dataHealth.status),
    };
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
      {
        name: "product_health",
        description: "Return expanded TPE product health, source warnings, method counts, and planner counts. Product source warnings stay in `data`; `meta.quality` is downgraded from product.dataHealth.status.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        outputSchema: outputSchemas.productHealth,
      },
      {
        name: "product_refresh",
        description: "Start a non-overlapping refresh for the expanded product engine (Prime/Relics, Run Now, mods, syndicates, Baro, resources, and analytics) without triggering riven or arcane scans.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        outputSchema: outputSchemas.action,
      },
      {
        name: "product_methods",
        description: "List expanded TPE methods with source-health details: Prime/Relics, Run Now, Mods/Endo, Syndicates, Baro/Ducats, resources, and gated bespoke markets.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 25 },
            methodId: { type: "string" },
            methodIds: { type: "array", items: { type: "string" } },
            status: { enum: ["green", "yellow", "red"] },
            statuses: { type: "array", items: { enum: ["green", "yellow", "red"] } },
            query: { type: "string" },
            q: { type: "string" },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.productMethods,
      },
      {
        name: "product_opportunities",
        description: "Return ranked non-riven product opportunities across the expanded TPE methods. Supports method, action, query, tag, profit, ROI, confidence, liquidity, risk, and sort filters.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 25 },
            methodId: { type: "string" },
            methodIds: { type: "array", items: { type: "string" } },
            action: { enum: ["buy", "sell", "farm", "open", "refine", "hold", "convert", "rank", "run_mission", "complete_set"] },
            actions: { type: "array", items: { enum: ["buy", "sell", "farm", "open", "refine", "hold", "convert", "rank", "run_mission", "complete_set"] } },
            query: { type: "string" },
            q: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            minExpectedProfitPlat: { type: "number" },
            minRoi: { type: "number" },
            minConfidence: { type: "number", minimum: 0, maximum: 1 },
            minLiquidity: { type: "number", minimum: 0, maximum: 1 },
            maxRisk: { type: "number", minimum: 0, maximum: 1 },
            sort: { enum: ["default", "expected_profit", "expected_plat", "roi", "confidence", "liquidity", "risk", "expires_soon"] },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.productOpportunities,
      },
      {
        name: "product_prime_relics",
        description: "Return Prime/Relic/Aya slices: relics to sell, relics to crack, Aya purchases, set completion, ducat recommendations, fissures, and supply shocks.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 10 },
            section: { enum: ["all", "best_relics_to_sell", "best_relics_to_crack", "best_aya_purchases", "set_completion", "ducat_recommendations", "fissures", "supply_shocks"] },
            minConfidence: { type: "number", minimum: 0, maximum: 1 },
            query: { type: "string" },
            q: { type: "string" },
            minExpectedProfitPlat: { type: "number" },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.productPrimeRelics,
      },
      {
        name: "product_run_now",
        description: "Return live Run Now activities ranked by priority and EV/minute, with optional rejected live activities for debugging source gates.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 10 },
            activityType: { type: "string" },
            query: { type: "string" },
            q: { type: "string" },
            minPriority: { type: "number" },
            minEvPerMinute: { type: "number" },
            includeRejected: { type: "boolean", default: false },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.productRunNow,
      },
      {
        name: "product_expansion_markets",
        description: "Return expanded non-riven/non-arcane market slices: Mods/Endo, Syndicates, Baro/Ducats, tradable resources, event shocks, and gated bespoke markets.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 10 },
            section: { enum: ["all", "mods", "syndicates", "baro", "resources", "event_shocks", "bespoke_markets"] },
            sections: { type: "array", items: { enum: ["all", "mods", "syndicates", "baro", "resources", "event_shocks", "bespoke_markets"] } },
            query: { type: "string" },
            q: { type: "string" },
            minExpectedProfitPlat: { type: "number" },
            minRoi: { type: "number" },
            minConfidence: { type: "number", minimum: 0, maximum: 1 },
            maxRisk: { type: "number", minimum: 0, maximum: 1 },
            includeGated: { type: "boolean", default: true },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.productExpansionMarkets,
      },
      {
        name: "product_advanced_analytics",
        description: "Return advanced product analytics slices: trade-journal rollups, portfolio aging, anonymous aggregate trends, team watchlists, and generated method guides.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 10 },
            section: { enum: ["all", "trade_journal", "portfolio_aging", "aggregate_trends", "team_watchlists", "method_guides"] },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.productAdvancedAnalytics,
      },
      {
        name: "product_planner",
        description: "Opt-in exposure of local private planning data. Defaults to todos only; pass section=all or a specific section to expose profile/email if stored, watchlists, portfolio, notification rules, deliveries, or trade journal.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, default: 25 },
            section: { enum: ["all", "profile", "watchlists", "portfolio", "todos", "notification_rules", "deliveries", "trade_journal"] },
            status: { enum: ["open", "in_progress", "blocked", "done", "archived"] },
            statuses: { type: "array", items: { enum: ["open", "in_progress", "blocked", "done", "archived"] } },
            methodId: { type: "string" },
            methodIds: { type: "array", items: { type: "string" } },
            query: { type: "string" },
            q: { type: "string" },
          },
          additionalProperties: false,
        },
        outputSchema: outputSchemas.productPlanner,
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

type ProductOpportunitySort = "default" | "expected_profit" | "expected_plat" | "roi" | "confidence" | "liquidity" | "risk" | "expires_soon";
type PrimeSection = "all" | "best_relics_to_sell" | "best_relics_to_crack" | "best_aya_purchases" | "set_completion" | "ducat_recommendations" | "fissures" | "supply_shocks";
type ExpansionSection = "all" | "mods" | "syndicates" | "baro" | "resources" | "event_shocks" | "bespoke_markets";
type AdvancedSection = "all" | "trade_journal" | "portfolio_aging" | "aggregate_trends" | "team_watchlists" | "method_guides";
type PlannerSection = "all" | "profile" | "watchlists" | "portfolio" | "todos" | "notification_rules" | "deliveries" | "trade_journal";

function readStringSet(record: Record<string, unknown>, singleKeys: readonly string[], arrayKeys: readonly string[]): Set<string> {
  const values: string[] = [];
  for (const key of singleKeys) {
    const value = readString(record, key);
    if (value) values.push(value);
  }
  for (const key of arrayKeys) values.push(...readStringArray(record, key));
  return new Set(values.map((value) => value.trim()).filter((value) => value.length > 0));
}

function readProductOpportunitySort(record: Record<string, unknown>): ProductOpportunitySort {
  const value = readString(record, "sort");
  switch (value) {
    case "expected_profit":
    case "expected_plat":
    case "roi":
    case "confidence":
    case "liquidity":
    case "risk":
    case "expires_soon":
      return value;
    default:
      return "default";
  }
}

function filterProductOpportunities(entries: readonly ProductOpportunity[], args: Record<string, unknown>): ProductOpportunity[] {
  const methodIds = readStringSet(args, ["methodId", "method_id"], ["methodIds", "method_ids"]);
  const actionValues = readStringSet(args, ["action"], ["actions"]);
  const actions = new Set<ProductOpportunityAction>();
  for (const value of actionValues) {
    if (isProductAction(value)) actions.add(value);
  }
  const tagValues = Array.from(readStringSet(args, ["tag"], ["tags"]), (value) => value.toLowerCase());
  const query = (readString(args, "query") ?? readString(args, "q") ?? "").trim().toLowerCase();
  const minExpectedProfit = readNumber(args, "minExpectedProfitPlat") ?? readNumber(args, "min_expected_profit_plat") ?? readNumber(args, "minProfit") ?? readNumber(args, "min_profit");
  const minRoi = readNumber(args, "minRoi") ?? readNumber(args, "min_roi");
  const minConfidence = readNumber(args, "minConfidence") ?? readNumber(args, "min_confidence");
  const minLiquidity = readNumber(args, "minLiquidity") ?? readNumber(args, "min_liquidity");
  const maxRisk = readNumber(args, "maxRisk") ?? readNumber(args, "max_risk");
  return entries
    .filter((entry) => methodIds.size === 0 || methodIds.has(entry.methodId))
    .filter((entry) => actions.size === 0 || actions.has(entry.action))
    .filter((entry) => tagValues.length === 0 || (entry.tags ?? []).some((tag) => tagValues.includes(tag.toLowerCase())))
    .filter((entry) => !query || productOpportunityMatchesQuery(entry, query))
    .filter((entry) => minExpectedProfit === undefined || expectedProductProfit(entry) >= minExpectedProfit)
    .filter((entry) => minRoi === undefined || productOpportunityRoi(entry) >= minRoi)
    .filter((entry) => minConfidence === undefined || entry.confidenceScore >= minConfidence)
    .filter((entry) => minLiquidity === undefined || entry.liquidityScore >= minLiquidity)
    .filter((entry) => maxRisk === undefined || entry.riskScore <= maxRisk);
}

function isProductAction(value: string): value is ProductOpportunityAction {
  switch (value) {
    case "buy":
    case "sell":
    case "farm":
    case "open":
    case "refine":
    case "hold":
    case "convert":
    case "rank":
    case "run_mission":
    case "complete_set":
      return true;
    default:
      return false;
  }
}

function productOpportunityMatchesQuery(entry: ProductOpportunity, query: string): boolean {
  if (entry.id.toLowerCase().includes(query) || entry.methodId.toLowerCase().includes(query) || entry.title.toLowerCase().includes(query)) return true;
  if ((entry.tags ?? []).some((tag) => tag.toLowerCase().includes(query))) return true;
  return entry.itemRefs.some((item) =>
    item.name.toLowerCase().includes(query)
    || (item.wfmSlug ?? "").toLowerCase().includes(query)
    || (item.tpeId ?? "").toLowerCase().includes(query),
  );
}

function expectedProductProfit(entry: ProductOpportunity): number {
  return entry.expectedProfitPlat ?? entry.expectedPlat - (entry.expectedCostPlat ?? 0);
}

function productOpportunityRoi(entry: ProductOpportunity): number {
  if (entry.roi !== undefined) return entry.roi;
  const cost = entry.expectedCostPlat ?? 0;
  return cost > 0 ? expectedProductProfit(entry) / cost : 0;
}

function compareProductOpportunitiesForTool(left: ProductOpportunity, right: ProductOpportunity, sort: ProductOpportunitySort): number {
  switch (sort) {
    case "expected_plat":
      return right.expectedPlat - left.expectedPlat || expectedProductProfit(right) - expectedProductProfit(left);
    case "roi":
      return productOpportunityRoi(right) - productOpportunityRoi(left) || expectedProductProfit(right) - expectedProductProfit(left);
    case "confidence":
      return right.confidenceScore - left.confidenceScore || expectedProductProfit(right) - expectedProductProfit(left);
    case "liquidity":
      return right.liquidityScore - left.liquidityScore || right.confidenceScore - left.confidenceScore;
    case "risk":
      return left.riskScore - right.riskScore || expectedProductProfit(right) - expectedProductProfit(left);
    case "expires_soon":
      return nullableAsc(parseOptionalTime(left.expiresAt), parseOptionalTime(right.expiresAt)) || expectedProductProfit(right) - expectedProductProfit(left);
    case "expected_profit":
    case "default":
      return expectedProductProfit(right) - expectedProductProfit(left) || right.confidenceScore - left.confidenceScore || right.liquidityScore - left.liquidityScore;
  }
}

function parseOptionalTime(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPrimeSection(record: Record<string, unknown>): PrimeSection {
  const value = readString(record, "section") ?? readString(record, "category");
  switch (value) {
    case "best_relics_to_sell":
    case "best_relics_to_crack":
    case "best_aya_purchases":
    case "set_completion":
    case "ducat_recommendations":
    case "fissures":
    case "supply_shocks":
      return value;
    default:
      return "all";
  }
}

function readExpansionSections(record: Record<string, unknown>): Set<ExpansionSection> {
  const values = [...readStringArray(record, "sections")];
  const single = readString(record, "section") ?? readString(record, "category");
  if (single) values.push(single);
  const sections = new Set<ExpansionSection>();
  for (const value of values) {
    switch (value) {
      case "all":
      case "mods":
      case "syndicates":
      case "baro":
      case "resources":
      case "event_shocks":
      case "bespoke_markets":
        sections.add(value);
        break;
      case "eventShocks":
        sections.add("event_shocks");
        break;
      case "bespokeMarkets":
        sections.add("bespoke_markets");
        break;
    }
  }
  if (sections.size === 0 || sections.has("all")) return new Set<ExpansionSection>(["all"]);
  return sections;
}

function readAdvancedSection(record: Record<string, unknown>): AdvancedSection {
  const value = readString(record, "section") ?? readString(record, "category");
  switch (value) {
    case "trade_journal":
    case "portfolio_aging":
    case "aggregate_trends":
    case "team_watchlists":
    case "method_guides":
      return value;
    default:
      return "all";
  }
}

function readPlannerSection(record: Record<string, unknown>): PlannerSection {
  const value = readString(record, "section") ?? readString(record, "category");
  switch (value) {
    case "all":
    case "profile":
    case "watchlists":
    case "portfolio":
    case "todos":
    case "notification_rules":
    case "deliveries":
    case "trade_journal":
      return value;
    default:
      return "todos";
  }
}

function firstProductSlice(data: Record<string, unknown>): unknown {
  for (const [key, value] of Object.entries(data)) {
    if (key === "generatedAt" || key === "summary" || key === "relicCount" || key === "rewardCount" || key === "scannedMarketItems" || key === "sources" || key === "warnings" || key === "section" || key === "sections" || key === "exportAvailable" || key === "deleteAvailable") continue;
    if (Array.isArray(value)) return value;
    if (key === "tradeJournal" && value && typeof value === "object") return value;
  }
  return [];
}

function worseQuality(left: EnvelopeMeta["quality"], right: EnvelopeMeta["quality"]): EnvelopeMeta["quality"] {
  const rank: Record<EnvelopeMeta["quality"], number> = { green: 0, yellow: 1, red: 2 };
  return rank[right] > rank[left] ? right : left;
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
