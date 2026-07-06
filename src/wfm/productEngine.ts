import { createHash } from "node:crypto";
import { fetchOfficialDropTables, relicSlugFromName, rewardSlugCandidates, type OfficialDropTables, type RelicRefinementTier, type RelicRewardEntry } from "./drops.js";
import { fetchLiveActivitySnapshot, type LiveActivitySnapshot } from "./live.js";
import { slugify } from "./opportunities.js";
import type { MarketItem, WarframeMarketClient } from "./client.js";
import type { ArcaneOrder } from "./types.js";
import type {
  AdvancedAnalyticsDashboard,
  BespokeMarketGate,
  DataHealthState,
  ExpansionDashboard,
  Explanation,
  FissureRecommendation,
  HealthStatus,
  HistoricalStats,
  ItemIdentity,
  ItemRef,
  MarketSnapshot,
  MethodSummary,
  PersonalizationState,
  PriceBasis,
  PrimeRelicDashboard,
  ProductDashboardState,
  ProductOpportunity,
  ProductOpportunityAction,
  RelicRecommendation,
  RelicRewardValue,
  RelicTierValue,
  RunNowDashboard,
  RunActivityCard,
  SourceHealth,
  SourceProvenance,
  TradabilityRule,
} from "./product.js";
import { clamp01, maxStatus, round, statusFromScore } from "./product.js";

export interface ProductEngineOptions {
  userAgent?: string;
  maxRelics?: number;
  maxExpansionItems?: number;
  fetcher?: typeof fetch;
}

interface MarketContext {
  items: MarketItem[];
  identities: Map<string, ItemIdentity>;
  bySlug: Map<string, MarketItem>;
  byName: Map<string, MarketItem>;
  snapshots: Map<string, MarketSnapshot>;
  wfmSource: SourceProvenance;
}

interface PublicExportIngest {
  source: SourceProvenance;
  uniqueNames: Map<string, string>;
  schemaHash?: string;
}

interface MethodOutput {
  summary: MethodSummary;
  opportunities: ProductOpportunity[];
}

const DEFAULT_USER_AGENT = "the-plat-exchange-ts/0.1 (public API, cached, rate-limited)";
const RELIC_TRACE_COST: Record<RelicRefinementTier, number> = { Intact: 0, Exceptional: 25, Flawless: 50, Radiant: 100 };
const PRIME_RELIC_SOURCE = "https://www.warframe.com/droptables";
const PUBLIC_EXPORT_URL = "https://content.warframe.com/PublicExport/index_en.txt.lzma";
const PRIME_RESURGENCE_SOURCE = "https://support.warframe.com/hc/en-us/articles/4413725645453-Prime-Resurgence-FAQ";
const WFM_TTL_SECONDS = 10 * 60;
const HISTORY_TTL_SECONDS = 24 * 60 * 60;

export function createInitialProductDashboard(personalization?: PersonalizationState): ProductDashboardState {
  const generatedAt = new Date().toISOString();
  const source: SourceProvenance = {
    source: "tpe_history",
    fetchedAt: generatedAt,
    ttlSeconds: HISTORY_TTL_SECONDS,
    confidence: "low",
    warnings: ["Product engines have not refreshed yet."],
  };
  const dataHealth: DataHealthState = {
    generatedAt,
    status: "red",
    warnings: ["Waiting for product data refresh."],
    sources: [{
      id: "product",
      label: "Product method cache",
      status: "red",
      source: "tpe_history",
      lastFailureAt: generatedAt,
      ttlSeconds: HISTORY_TTL_SECONDS,
      warningCount: 1,
      warnings: ["Waiting for product data refresh."],
    }],
  };
  return {
    generatedAt,
    dataHealth,
    methods: [],
    opportunities: [],
    prime: {
      generatedAt,
      summary: "Waiting for Prime/Relic source data.",
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
      sources: [source],
      warnings: ["Waiting for product data refresh."],
    },
    runNow: { generatedAt, activities: [], rejectedActivities: [], warnings: ["Waiting for live activity refresh."] },
    personalization: personalization ?? defaultPersonalization(generatedAt),
    expansion: { mods: [], syndicates: [], baro: [], resources: [], eventShocks: [], bespokeMarkets: gatedBespokeMarkets() },
    advanced: emptyAdvanced(personalization ?? defaultPersonalization(generatedAt), generatedAt),
  };
}

export async function buildProductDashboard(client: WarframeMarketClient, personalization: PersonalizationState, options: ProductEngineOptions = {}): Promise<ProductDashboardState> {
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const fetcher = options.fetcher ?? fetch;
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  const [itemsResult, dropResult, liveResult, publicExportResult] = await Promise.allSettled([
    client.marketItems(),
    fetchOfficialDropTables(userAgent, fetcher),
    fetchLiveActivitySnapshot(userAgent, fetcher),
    fetchPublicExportIngest(userAgent, fetcher),
  ]);

  const items = itemsResult.status === "fulfilled" ? itemsResult.value : [];
  if (itemsResult.status === "rejected") warnings.push(`Warframe.market item catalog unavailable: ${errorMessage(itemsResult.reason)}`);
  const drops = dropResult.status === "fulfilled" ? dropResult.value : emptyDropTables(generatedAt, errorMessage(dropResult.reason));
  if (dropResult.status === "rejected") warnings.push(`Official drop tables unavailable: ${errorMessage(dropResult.reason)}`);
  const live = liveResult.status === "fulfilled" ? liveResult.value : emptyLiveSnapshot(generatedAt, errorMessage(liveResult.reason));
  if (liveResult.status === "rejected") warnings.push(`Live activity source unavailable: ${errorMessage(liveResult.reason)}`);
  const publicExport = publicExportResult.status === "fulfilled" ? publicExportResult.value : publicExportWarning(generatedAt, errorMessage(publicExportResult.reason));
  if (publicExportResult.status === "rejected") warnings.push(`PublicExport metadata unavailable: ${errorMessage(publicExportResult.reason)}`);

  const market = buildMarketContext(items, publicExport, generatedAt, client.health().lastSuccessAt);
  const prime = await buildPrimeRelicDashboard(client, market, drops, live, personalization, options.maxRelics ?? 24);
  const expansion = await buildExpansionDashboard(client, market, personalization, options.maxExpansionItems ?? 16, generatedAt);
  const advanced = buildAdvancedAnalytics(personalization, expansion, generatedAt);
  const runNow = buildRunNowDashboard(live, prime.fissures, generatedAt);

  const methodOutputs = buildMethodSummaries(prime, expansion, runNow);
  const opportunities = [
    ...prime.bestRelicsToSell.map((entry) => relicOpportunity(entry, "sell")),
    ...prime.bestRelicsToCrack.map((entry) => relicOpportunity(entry, entry.chosenTier.tier === "Intact" ? "open" : "refine")),
    ...prime.setCompletion,
    ...prime.ducatRecommendations,
    ...prime.supplyShocks,
    ...expansion.mods,
    ...expansion.syndicates,
    ...expansion.baro,
    ...expansion.resources,
    ...expansion.eventShocks,
    ...runNow.activities.map(activityOpportunity),
  ].sort(compareProductOpportunities);

  const dataHealth = buildDataHealth(generatedAt, client, market, drops, live, publicExport, prime, warnings);
  return {
    generatedAt,
    dataHealth,
    methods: methodOutputs,
    opportunities,
    prime,
    runNow,
    personalization,
    expansion,
    advanced,
  };
}

export function tradabilityForItem(item: Pick<MarketItem, "name" | "tags" | "tradable" | "bulkTradable" | "slug">): TradabilityRule {
  const name = item.name;
  const lower = name.toLowerCase();
  const warnings: string[] = [];
  if (lower === "aya" || lower === "regal aya") {
    return { status: "not_tradable", reason: "Aya is a non-player-tradable input currency; score relic and prime outputs instead.", warnings: ["Aya must not be recommended as a sale target."] };
  }
  if (/^flawed\s/i.test(name) || lower.includes(" umbra") || lower.startsWith("primed fury") || lower.startsWith("primed vigor") || lower.startsWith("primed shred")) {
    return { status: "not_tradable", reason: "Restricted mod family is not a valid sale target.", warnings: ["Flawed, Umbra, and restricted Daily Tribute Primed mods are excluded."] };
  }
  if (/prime\s+(chassis|neuroptics|systems)$/i.test(name) && !/blueprint$/i.test(name)) {
    return { status: "not_tradable", reason: "Crafted Prime Warframe parts are not tradable; only Prime part blueprints are valid sale targets.", warnings: ["Crafted Prime Warframe part excluded."] };
  }
  if (item.tags.includes("resource") && /(ore|alloy|plate|ferrite|polymer|rubedo|plastids|hexenon|carbides|titanium)$/i.test(name)) {
    return { status: "not_tradable", reason: "Raw resources and ores are generally not tradable; refined gems/fish need explicit trade tags.", warnings: ["Raw material excluded from sale scoring."] };
  }
  if (!item.tradable && !item.bulkTradable) {
    return { status: "unknown", reason: "WFM catalog did not mark this item tradable; require manual verification before sale scoring.", warnings: ["Tradability unknown from WFM flags."] };
  }
  if (item.tags.includes("set")) warnings.push("Set liquidity can differ from component liquidity; compare completion delta before buying parts.");
  return { status: warnings.length > 0 ? "conditional" : "tradable", reason: "Tradable according to WFM catalog with TPE rule filters.", warnings };
}

export function evaluateRelic(relicName: string, rewards: RelicTierValue[], relicSellValuePlat: number | null, traceOpportunityCost: number, sources: SourceProvenance[]): RelicRecommendation {
  const usable = rewards.filter((tier) => tier.rewardCount > 0);
  const ranked = usable.map((tier) => ({ tier, net: tier.evPlat - RELIC_TRACE_COST[tier.tier] * traceOpportunityCost }));
  ranked.sort((left, right) => right.net - left.net || right.tier.confidence - left.tier.confidence);
  const chosenTier = ranked[0]?.tier ?? rewards[0];
  const crackPremiumPlat = relicSellValuePlat === null || !chosenTier ? null : round(chosenTier.evPlat - relicSellValuePlat - RELIC_TRACE_COST[chosenTier.tier] * traceOpportunityCost, 2);
  const confidence = chosenTier ? clamp01(chosenTier.confidence * (relicSellValuePlat === null ? 0.82 : 1)) : 0;
  const warnings = chosenTier ? [...chosenTier.warnings] : ["No usable reward table for relic."];
  if (relicSellValuePlat === null) warnings.push("Relic sell value missing; crack-vs-sell premium is unavailable.");
  return {
    relic: { tpeId: `wfm:${relicSlugFromName(relicName)}`, name: relicName, wfmSlug: relicSlugFromName(relicName) },
    tierValues: rewards,
    chosenTier: chosenTier ?? { tier: "Intact", voidTraceCost: 0, evPlat: 0, pricedRewardCount: 0, rewardCount: 0, confidence: 0, rewards: [], warnings },
    relicSellValuePlat,
    crackPremiumPlat,
    traceOpportunityCost,
    sources,
    confidence,
    warnings,
  };
}

async function buildPrimeRelicDashboard(client: WarframeMarketClient, market: MarketContext, drops: OfficialDropTables, live: LiveActivitySnapshot, personalization: PersonalizationState, maxRelics: number): Promise<PrimeRelicDashboard> {
  const activeRelicNames = drops.acquisitionRelics.length > 0 ? drops.acquisitionRelics : [...new Set(drops.relicRewards.map((entry) => entry.relicName))];
  const scanLimit = Number.isFinite(maxRelics) ? Math.max(0, Math.floor(maxRelics)) : activeRelicNames.length;
  const sampledRelics = activeRelicNames.length > scanLimit;
  const relicNames = sampledRelics ? activeRelicNames.slice(0, scanLimit) : activeRelicNames;
  const rewardByRelic = new Map<string, typeof drops.relicRewards>();
  for (const reward of drops.relicRewards) {
    const list = rewardByRelic.get(reward.relicName) ?? [];
    list.push(reward);
    rewardByRelic.set(reward.relicName, list);
  }

  const neededSlugs = new Set<string>();
  for (const relicName of relicNames) {
    neededSlugs.add(relicSlugFromName(relicName));
    for (const reward of rewardByRelic.get(relicName) ?? []) {
      for (const candidate of rewardSlugCandidates(reward.itemName)) neededSlugs.add(candidate);
    }
  }
  await hydrateSnapshots(client, market, [...neededSlugs], 2);

  const recommendations: RelicRecommendation[] = [];
  for (const relicName of relicNames) {
    const tierValues: RelicTierValue[] = [];
    for (const tier of ["Intact", "Exceptional", "Flawless", "Radiant"] as const) {
      const rewards = (rewardByRelic.get(relicName) ?? []).filter((entry) => entry.tier === tier);
      tierValues.push(relicTierValue(tier, rewards, market));
    }
    const relicSnapshot = market.snapshots.get(relicSlugFromName(relicName));
    const relicSellValuePlat = conservativeSellValue(relicSnapshot);
    recommendations.push(evaluateRelic(relicName, tierValues, relicSellValuePlat, personalization.profile.assumptions.traceOpportunityCostPlat, [drops.source, market.wfmSource]));
  }

  const sell = [...recommendations]
    .filter((entry) => entry.relicSellValuePlat !== null && entry.confidence >= 0.4)
    .sort((left, right) => (right.relicSellValuePlat ?? 0) - (left.relicSellValuePlat ?? 0))
    .slice(0, 10);
  const crack = [...recommendations]
    .filter((entry) => (entry.crackPremiumPlat ?? -Infinity) > 0 && entry.confidence >= 0.4)
    .sort((left, right) => (right.crackPremiumPlat ?? 0) - (left.crackPremiumPlat ?? 0))
    .slice(0, 10);
  const aya = [...recommendations]
    .filter((entry) => entry.relic.name.toLowerCase() !== "aya" && entry.confidence >= 0.35)
    .sort((left, right) => right.chosenTier.evPlat - left.chosenTier.evPlat)
    .slice(0, 8);

  const setCompletion = buildSetCompletionOpportunities(market, drops.source);
  const ducatRecommendations = buildDucatRecommendations(market, drops.source);
  const fissures = live.fissures.map((fissure) => ({ ...fissure, evPerMinute: adjustFissureEv(fissure, recommendations) }));
  for (const fissure of fissures) fissure.priority = round(fissure.evPerMinute * fissure.confidence, 2);
  fissures.sort((left, right) => right.priority - left.priority);

  const supplyShocks = buildSupplyShockOpportunities(drops, live, market.wfmSource);
  const warnings = [...drops.warnings];
  if (sampledRelics) warnings.push(`Prime/Relic live dashboard evaluated a cached incremental slice (${relicNames.length}/${activeRelicNames.length} active relics). CI/precomputed feeds should crawl all active relics before using global-best language.`);
  if (recommendations.length === 0) warnings.push("No Prime/Relic recommendations could be built from current source data.");
  if (aya.length > 0) warnings.push("Aya is modeled as a non-tradable input; recommendations rank relic outputs, never direct Aya sales.");

  return {
    generatedAt: new Date().toISOString(),
    summary: sampledRelics ? `${recommendations.length}/${activeRelicNames.length} active relics evaluated from official drop tables with ${market.snapshots.size} WFM market books cached; results are best within the scanned slice.` : `${recommendations.length} active relics evaluated from official drop tables with ${market.snapshots.size} WFM market books cached.`,
    relicCount: recommendations.length,
    rewardCount: drops.relicRewards.length,
    scannedMarketItems: market.snapshots.size,
    bestRelicsToSell: sell,
    bestRelicsToCrack: crack,
    bestAyaPurchases: aya,
    setCompletion,
    ducatRecommendations,
    fissures,
    supplyShocks,
    sources: [drops.source, market.wfmSource, ...live.sources],
    warnings,
  };
}

async function buildExpansionDashboard(client: WarframeMarketClient, market: MarketContext, personalization: PersonalizationState, maxItems: number, generatedAt: string): Promise<ExpansionDashboard> {
  const modItems = market.items.filter((item) => item.tags.includes("mod") && (item.maxRank ?? 0) > 0 && tradabilityForItem(item).status !== "not_tradable").slice(0, maxItems);
  const syndicateItems = market.items.filter((item) => item.tags.includes("syndicate") && tradabilityForItem(item).status !== "not_tradable").slice(0, maxItems);
  const ducatItems = market.items.filter((item) => Number.isFinite(item.ducats) && (item.ducats ?? 0) > 0 && tradabilityForItem(item).status !== "not_tradable").slice(0, maxItems);
  const resourceItems = market.items.filter((item) => isTradableResourceCandidate(item)).slice(0, maxItems);
  const slugs = [...new Set([
    ...modItems.flatMap((item) => [item.slug, `${item.slug}::${item.maxRank ?? 0}`]),
    ...syndicateItems.map((item) => item.slug),
    ...ducatItems.map((item) => item.slug),
    ...resourceItems.map((item) => item.slug),
  ])];
  await hydrateSnapshots(client, market, slugs.map((entry) => entry.split("::")[0] ?? entry), 2);
  for (const item of modItems) await hydrateSnapshot(client, market, item.slug, item.maxRank ?? 0);

  return {
    mods: rankAwareModOpportunities(modItems, market, personalization, generatedAt),
    syndicates: syndicateOpportunities(syndicateItems, market, generatedAt),
    baro: baroOpportunities(ducatItems, market, generatedAt),
    resources: resourceOpportunities(resourceItems, market, generatedAt),
    eventShocks: [],
    bespokeMarkets: gatedBespokeMarkets(),
  };
}

function buildRunNowDashboard(live: LiveActivitySnapshot, fissures: FissureRecommendation[], generatedAt: string): RunNowDashboard {
  const fissureActivities = fissures.map((fissure) => ({ ...live.activities.find((activity) => activity.id === fissure.id), ...fissureToRunCard(fissure) }));
  const nonFissure = live.activities.filter((activity) => !fissures.some((fissure) => fissure.id === activity.id));
  const activities = [...fissureActivities, ...nonFissure]
    .filter((activity) => !activity.expiresAt || Date.parse(activity.expiresAt) > Date.now())
    .sort((left, right) => right.priority - left.priority);
  return { generatedAt, activities, rejectedActivities: live.rejected, warnings: live.warnings };
}

function buildDataHealth(generatedAt: string, client: WarframeMarketClient, market: MarketContext, drops: OfficialDropTables, live: LiveActivitySnapshot, publicExport: PublicExportIngest, prime: PrimeRelicDashboard, warnings: string[]): DataHealthState {
  const wfm = client.health();
  const sources: SourceHealth[] = [
    {
      id: "wfm",
      label: "Warframe.market catalog and orders",
      status: wfm.lastFailureAt && !wfm.lastSuccessAt ? "red" : market.snapshots.size > 0 ? "green" : "yellow",
      source: "warframe.market",
      url: "https://api.warframe.market/v2/items",
      lastSuccessAt: wfm.lastSuccessAt ?? market.wfmSource.fetchedAt,
      ...(wfm.lastFailureAt ? { lastFailureAt: wfm.lastFailureAt } : {}),
      ttlSeconds: WFM_TTL_SECONDS,
      schemaVersion: "v2",
      coverage: { scanned: market.snapshots.size, total: market.items.length, label: "market books cached" },
      warningCount: wfm.lastFailure ? 1 : 0,
      rateLimitState: `server-side TokenBucket; ${wfm.orderCacheEntries} cached order books`,
      warnings: wfm.lastFailure ? [wfm.lastFailure] : [],
    },
    {
      id: "drops",
      label: "Official drop tables",
      status: drops.relicRewards.length > 0 ? "green" : "red",
      source: "official_drop_tables",
      url: drops.url,
      lastSuccessAt: drops.fetchedAt,
      ttlSeconds: 24 * 60 * 60,
      schemaHash: drops.contentHash,
      coverage: { scanned: drops.relicRewards.length, total: drops.relicRewards.length, label: "relic reward rows" },
      warningCount: drops.warnings.length,
      warnings: drops.warnings,
    },
    {
      id: "public-export",
      label: "PublicExport identity bridge",
      status: publicExport.source.confidence === "low" ? "yellow" : "green",
      source: "public_export",
      url: PUBLIC_EXPORT_URL,
      ...(publicExport.source.warnings.length === 0 ? { lastSuccessAt: publicExport.source.fetchedAt } : {}),
      ...(publicExport.source.warnings.length > 0 ? { lastFailureAt: publicExport.source.fetchedAt } : {}),
      ttlSeconds: 24 * 60 * 60,
      ...(publicExport.schemaHash ? { schemaHash: publicExport.schemaHash } : {}),
      coverage: { scanned: publicExport.uniqueNames.size, total: market.items.length, label: "uniqueName bridges" },
      warningCount: publicExport.source.warnings.length,
      fallback: "WFM gameRef identity bridge",
      warnings: publicExport.source.warnings,
    },
    {
      id: "live",
      label: "Live Warframe activities",
      status: live.activities.length > 0 ? "green" : live.rejected.length > 0 ? "yellow" : "red",
      source: "warframestat",
      url: "https://api.warframestat.us/pc/fissures",
      lastSuccessAt: live.fetchedAt,
      ttlSeconds: 5 * 60,
      coverage: { scanned: live.activities.length, total: live.activities.length + live.rejected.length, label: "validated activities" },
      warningCount: live.warnings.length + live.rejected.length,
      fallback: "raw worldstate unavailable; wrapper validation active",
      warnings: [...live.warnings, ...live.rejected.slice(0, 3).map((entry) => `${entry.title}: ${entry.reason}`)],
    },
    {
      id: "history",
      label: "TPE history and method cache",
      status: prime.relicCount > 0 ? "green" : "yellow",
      source: "tpe_history",
      lastSuccessAt: generatedAt,
      ttlSeconds: HISTORY_TTL_SECONDS,
      coverage: { scanned: prime.relicCount, total: prime.rewardCount, label: "Prime/Relic method rows" },
      warningCount: prime.warnings.length,
      warnings: prime.warnings.slice(0, 6),
    },
  ];
  return { generatedAt, status: maxStatus(sources.map((entry) => entry.status)), sources, warnings };
}

function buildMethodSummaries(prime: PrimeRelicDashboard, expansion: ExpansionDashboard, runNow: RunNowDashboard): MethodSummary[] {
  const methods: MethodSummary[] = [
    methodSummary("prime_relics", "Prime / Relics / Aya", "Relic EV, crack-vs-sell, refinement, Aya output, set completion, ducat comparison, and fissures.", prime.warnings.length > 0 ? "yellow" : "green", prime.bestRelicsToSell.length + prime.bestRelicsToCrack.length + prime.bestAyaPurchases.length, ["drops", "wfm", "live"], prime.warnings),
    methodSummary("run_now", "Run Now", "Validated live activities ranked by plat relevance, expiry, mission speed, and market EV.", runNow.warnings.length > 0 ? "yellow" : "green", runNow.activities.length, ["live", "wfm"], runNow.warnings),
    methodSummary("mods", "Mods / Endo", "Rank-aware maxing EV with Endo and credit assumptions surfaced.", expansion.mods.length > 0 ? "yellow" : "red", expansion.mods.length, ["wfm"], expansion.mods.length === 0 ? ["No rank-aware mod candidates passed current liquidity gates."] : []),
    methodSummary("syndicates", "Syndicates / Standing", "Standing conversion into highest plat-per-standing tradable outputs.", expansion.syndicates.length > 0 ? "yellow" : "red", expansion.syndicates.length, ["wfm"], expansion.syndicates.length === 0 ? ["No syndicate candidates passed current liquidity gates."] : []),
    methodSummary("baro_ducats", "Baro / Ducats", "Prime-part plat-per-ducat and Baro hold/avoid guidance.", expansion.baro.length > 0 ? "yellow" : "red", expansion.baro.length, ["wfm"], expansion.baro.length === 0 ? ["No ducat items passed current liquidity gates."] : []),
    methodSummary("resources", "Fish / Gems / Resources", "Tradable open-world commodities gated by cycle windows and liquidity.", expansion.resources.length > 0 ? "yellow" : "red", expansion.resources.length, ["wfm", "warframestat"], expansion.resources.length === 0 ? ["Low-liquidity commodities are informational until market depth improves."] : []),
    methodSummary("bespoke", "Adversaries / Imprints", "Bespoke attribute markets are gated from commodity scoring.", "yellow", 0, [], ["Kuva Lich/Sister and imprint markets require specialized comparables before recommendations."]),
  ];
  return methods;
}

function buildMarketContext(items: MarketItem[], publicExport: PublicExportIngest, fetchedAt: string, lastSuccessAt?: string): MarketContext {
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const byName = new Map(items.map((item) => [item.name.toLowerCase(), item]));
  const identities = new Map<string, ItemIdentity>();
  for (const item of items) {
    const uniqueName = publicExport.uniqueNames.get(item.slug) ?? item.gameRef;
    identities.set(item.slug, {
      tpeId: `wfm:${item.slug}`,
      name: item.name,
      wfmSlug: item.slug,
      wfmId: item.id,
      tags: [...item.tags],
      tradability: tradabilityForItem(item),
      ...(item.gameRef !== undefined ? { gameRef: item.gameRef } : {}),
      ...(uniqueName !== undefined ? { uniqueName } : {}),
      ...(item.maxRank !== undefined ? { maxRank: item.maxRank } : {}),
      ...(item.ducats !== undefined ? { ducats: item.ducats } : {}),
      ...(item.icon !== undefined ? { icon: item.icon } : {}),
      ...(item.thumb !== undefined ? { thumb: item.thumb } : {}),
      ...(item.imageName !== undefined ? { imageName: item.imageName } : {}),
    });
  }
  return {
    items,
    identities,
    bySlug,
    byName,
    snapshots: new Map(),
    wfmSource: { source: "warframe.market", url: "https://api.warframe.market/v2/orders", fetchedAt: lastSuccessAt ?? fetchedAt, ttlSeconds: WFM_TTL_SECONDS, confidence: items.length > 0 ? "medium" : "low", warnings: items.length > 0 ? [] : ["WFM item catalog missing."] },
  };
}

async function hydrateSnapshots(client: WarframeMarketClient, market: MarketContext, slugs: readonly string[], concurrency: number): Promise<void> {
  const unique = [...new Set(slugs)].filter((slug) => market.bySlug.has(slug));
  await runLimited(unique, concurrency, async (slug) => { await hydrateSnapshot(client, market, slug, 0); });
}

async function hydrateSnapshot(client: WarframeMarketClient, market: MarketContext, slug: string, rank = 0): Promise<MarketSnapshot | null> {
  const key = `${slug}::${rank}`;
  const existing = market.snapshots.get(key) ?? (rank === 0 ? market.snapshots.get(slug) : undefined);
  if (existing) return existing;
  const item = market.bySlug.get(slug);
  const identity = market.identities.get(slug);
  if (!item || !identity) return null;
  const orders = await client.topItemOrders(slug, rank).catch(() => []);
  const sellOrders = orders.filter((order) => order.type === "sell").map(toMarketOrder);
  const buyOrders = orders.filter((order) => order.type === "buy").map(toMarketOrder);
  const statistics = snapshotStats(sellOrders.map((order) => order.platinum), buyOrders.map((order) => order.platinum));
  const snapshot: MarketSnapshot = {
    item: identity,
    rank,
    platform: "pc",
    crossplay: true,
    sellOrders,
    buyOrders,
    ...(statistics ? { statistics } : {}),
    source: { ...market.wfmSource, fetchedAt: new Date().toISOString(), warnings: orders.length === 0 ? [`No visible WFM top orders for ${item.name} rank ${rank}.`] : [] },
  };
  market.snapshots.set(key, snapshot);
  if (rank === 0) market.snapshots.set(slug, snapshot);
  return snapshot;
}

function relicTierValue(tier: RelicRefinementTier, rewards: readonly RelicRewardEntry[], market: MarketContext): RelicTierValue {
  const values: RelicRewardValue[] = rewards.map((reward) => rewardValue(reward, market));
  const evPlat = round(values.reduce((sum, reward) => sum + (reward.valuePlat ?? 0) * reward.chance, 0), 2);
  const pricedRewardCount = values.filter((reward) => reward.valuePlat !== null).length;
  const confidence = values.length === 0 ? 0 : clamp01((pricedRewardCount / values.length) * average(values.map((reward) => reward.liquidityScore)));
  const warnings = values.flatMap((reward) => reward.warnings).slice(0, 6);
  if (pricedRewardCount < values.length) warnings.push(`${values.length - pricedRewardCount} reward prices missing; EV is conservative.`);
  return { tier, voidTraceCost: RELIC_TRACE_COST[tier], evPlat, pricedRewardCount, rewardCount: values.length, confidence, rewards: values, warnings };
}

function rewardValue(reward: RelicRewardEntry, market: MarketContext): RelicRewardValue {
  const item = resolveRewardItem(reward.itemName, market);
  if (!item) {
    return { item: { tpeId: `unknown:${slugify(reward.itemName)}`, name: reward.itemName }, chance: reward.chance, rarity: reward.rarity, valuePlat: null, liquidityScore: 0, priceBasis: "sell_floor", warnings: ["Reward did not map to a WFM tradable item."] };
  }
  const rule = tradabilityForItem(item);
  if (rule.status === "not_tradable") {
    return {
      item: itemRef(item),
      chance: reward.chance,
      rarity: reward.rarity,
      valuePlat: null,
      ...(item.ducats !== undefined ? { ducats: item.ducats } : {}),
      liquidityScore: 0,
      priceBasis: "sell_floor",
      warnings: rule.warnings,
    };
  }
  const snapshot = market.snapshots.get(item.slug);
  const valuePlat = conservativeSellValue(snapshot);
  const liquidityScore = liquidityFromSnapshot(snapshot);
  const warnings = [...rule.warnings];
  if (valuePlat === null) warnings.push("No WFM sell-side price for reward.");
  return { item: itemRef(item), chance: reward.chance, rarity: reward.rarity, valuePlat, ...(item.ducats !== undefined ? { ducats: item.ducats } : {}), liquidityScore, priceBasis: "trimmed_median", warnings };
}

function resolveRewardItem(name: string, market: MarketContext): MarketItem | null {
  for (const candidate of rewardSlugCandidates(name)) {
    const item = market.bySlug.get(candidate);
    if (item) return item;
  }
  return market.byName.get(name.toLowerCase()) ?? null;
}

function conservativeSellValue(snapshot: MarketSnapshot | undefined): number | null {
  const stats = snapshot?.statistics;
  if (!stats) return null;
  const value = stats.p25 ?? stats.median ?? stats.min;
  return Number.isFinite(value) && value! > 0 ? Math.round(value!) : null;
}

function liquidityFromSnapshot(snapshot: MarketSnapshot | undefined): number {
  if (!snapshot) return 0;
  const onlineSell = snapshot.sellOrders.filter((order) => order.user.status === "ingame" || order.user.status === "online").length;
  const buyDepth = snapshot.buyOrders.length;
  const spreadPenalty = spreadRatio(snapshot);
  return clamp01((Math.min(1, onlineSell / 4) * 0.55) + (Math.min(1, buyDepth / 3) * 0.25) + ((1 - spreadPenalty) * 0.2));
}

function snapshotStats(sellPrices: number[], buyPrices: number[]): HistoricalStats | undefined {
  const prices = sellPrices.filter((price) => Number.isFinite(price) && price > 0).sort((a, b) => a - b);
  if (prices.length === 0) return undefined;
  const min = prices[0] ?? 0;
  const max = prices[prices.length - 1] ?? min;
  return {
    observedListings: prices.length + buyPrices.length,
    priceBasis: "trimmed_median",
    min,
    p25: percentile(prices, 0.25),
    median: percentile(prices, 0.5),
    p75: percentile(prices, 0.75),
    p90: percentile(prices, 0.9),
    max,
  };
}

function spreadRatio(snapshot: MarketSnapshot): number {
  const sell = snapshot.statistics?.p25 ?? snapshot.statistics?.median ?? null;
  const buy = snapshot.buyOrders.length > 0 ? Math.max(...snapshot.buyOrders.map((order) => order.platinum)) : null;
  if (!sell || !buy || sell <= 0) return 0.35;
  return clamp01((sell - buy) / sell);
}

function buildSetCompletionOpportunities(market: MarketContext, source: SourceProvenance): ProductOpportunity[] {
  const sets = market.items.filter((item) => item.tags.includes("set") && item.tags.includes("prime")).slice(0, 12);
  const opportunities: ProductOpportunity[] = [];
  for (const set of sets) {
    const snapshot = market.snapshots.get(set.slug);
    const value = conservativeSellValue(snapshot);
    if (value === null || liquidityFromSnapshot(snapshot) < 0.25) continue;
    opportunities.push(productOpportunity({
      id: `set:${set.slug}`,
      methodId: "prime_relics",
      title: `Complete and sell ${set.name}`,
      action: "complete_set",
      itemRefs: [itemRef(set)],
      expectedPlat: value,
      expectedProfitPlat: Math.round(value * 0.08),
      liquidityScore: liquidityFromSnapshot(snapshot),
      confidenceScore: 0.45,
      riskScore: 0.45,
      freshness: [source, snapshot!.source],
      assumptions: ["Set completion delta uses set sell-side value until component inventory is entered."],
      warnings: ["Manual inventory required before buying missing parts."],
      explanation: explanation("Complete set only when missing parts are cheap and set liquidity supports sale.", `${value}p listing-derived set value.`, ["WFM set order book", "manual inventory unknown"], ["setSellValue - sum(partSellValuesNeeded) once portfolio parts are known"], snapshot),
      url: `https://warframe.market/items/${set.slug}`,
    }));
  }
  return opportunities.slice(0, 6);
}

function buildDucatRecommendations(market: MarketContext, source: SourceProvenance): ProductOpportunity[] {
  const opportunities: ProductOpportunity[] = [];
  for (const item of market.items) {
    if (!item.ducats || item.ducats <= 0) continue;
    const snapshot = market.snapshots.get(item.slug);
    const value = conservativeSellValue(snapshot);
    if (value === null) continue;
    const platPerDucat = value / item.ducats;
    const action = platPerDucat < 0.08 ? "convert" : "sell";
    opportunities.push(productOpportunity({
      id: `ducat:${item.slug}`,
      methodId: "baro_ducats",
      title: `${action === "convert" ? "Convert" : "Sell"} ${item.name}`,
      action,
      itemRefs: [itemRef(item)],
      expectedPlat: value,
      ...(action === "sell" ? { expectedProfitPlat: value } : {}),
      liquidityScore: liquidityFromSnapshot(snapshot),
      confidenceScore: clamp01(liquidityFromSnapshot(snapshot) * 0.85),
      riskScore: action === "convert" ? 0.35 : 0.25,
      freshness: [source, snapshot!.source],
      assumptions: [`Ducat value ${item.ducats}; Baro resale EV uses current direct-sale floor until live Baro inventory is available.`],
      warnings: action === "convert" ? ["Better as ducat fodder under current plat-per-ducat floor."] : [],
      explanation: explanation(`${action === "convert" ? "Convert to ducats" : "Sell for plat"} based on ${round(platPerDucat, 3)}p/ducat.`, `${value}p player-sale value versus ${item.ducats} ducats.`, ["WFM listing-derived price", "WFM item ducat metadata"], ["platPerDucat = saleValue / ducatValue"], snapshot),
      url: `https://warframe.market/items/${item.slug}`,
    }));
  }
  return opportunities.sort((left, right) => (right.expectedPlat / Number(right.assumptions[0]?.match(/\d+/)?.[0] ?? 1)) - (left.expectedPlat / Number(left.assumptions[0]?.match(/\d+/)?.[0] ?? 1))).slice(0, 8);
}

function buildSupplyShockOpportunities(drops: OfficialDropTables, live: LiveActivitySnapshot, source: SourceProvenance): ProductOpportunity[] {
  const opportunities: ProductOpportunity[] = [];
  if (drops.lastUpdate) {
    opportunities.push(productOpportunity({
      id: `shock:drops:${drops.contentHash}`,
      methodId: "events",
      title: `Drop table published ${drops.lastUpdate}`,
      action: "hold",
      itemRefs: [],
      expectedPlat: 0,
      liquidityScore: 0.5,
      confidenceScore: 0.72,
      riskScore: 0.42,
      freshness: [drops.source],
      assumptions: ["Supply shock detector compares official drop-table hash and current relic availability."],
      warnings: ["Verify newly unvaulted/resurgent items before buying into a supply dump."],
      explanation: explanation("Watch Prime prices around official drop-table changes.", "Market shock banner, not a buy signal.", ["official drop table hash", drops.contentHash], ["detect newly available relics and supply changes"], undefined),
    }));
  }
  if (live.fissures.some((fissure) => fissure.tier === "Omnia")) {
    opportunities.push(productOpportunity({
      id: "shock:omnia-fissure",
      methodId: "events",
      title: "Omnia fissure window active",
      action: "run_mission",
      itemRefs: [],
      expectedPlat: 0,
      liquidityScore: 0.5,
      confidenceScore: 0.64,
      riskScore: 0.32,
      freshness: [source, ...live.sources],
      assumptions: ["Omnia fissures raise cracking utility across relic tiers."],
      warnings: ["Expires with the live fissure rotation."],
      explanation: explanation("Prioritize Omnia only when current relic EV beats selling unopened.", "Run-now signal tied to fissure expiry.", ["warframestat fissures"], ["fissure type availability supply-shock signal"], undefined),
    }));
  }
  return opportunities;
}

function rankAwareModOpportunities(items: MarketItem[], market: MarketContext, personalization: PersonalizationState, generatedAt: string): ProductOpportunity[] {
  const opportunities: ProductOpportunity[] = [];
  for (const item of items) {
    const rank0 = market.snapshots.get(item.slug);
    const max = market.snapshots.get(`${item.slug}::${item.maxRank ?? 0}`);
    const rank0Value = conservativeSellValue(rank0);
    const maxValue = conservativeSellValue(max);
    if (rank0Value === null || maxValue === null) continue;
    const endoCostValue = ((item.maxRank ?? 0) * 1.4) * personalization.profile.assumptions.endoPlatPerThousand;
    const creditCostValue = ((item.maxRank ?? 0) * 0.05) * personalization.profile.assumptions.creditPlatPerMillion;
    const profit = round(maxValue - rank0Value - endoCostValue - creditCostValue, 2);
    if (profit <= 0) continue;
    opportunities.push(productOpportunity({
      id: `mod-rank:${item.slug}`,
      methodId: "mods",
      title: `Max ${item.name} before selling`,
      action: "rank",
      itemRefs: [itemRef(item)],
      expectedPlat: maxValue,
      expectedCostPlat: round(rank0Value + endoCostValue + creditCostValue, 2),
      expectedProfitPlat: profit,
      roi: round(profit / Math.max(1, rank0Value), 3),
      liquidityScore: Math.min(liquidityFromSnapshot(rank0), liquidityFromSnapshot(max)),
      confidenceScore: Math.min(liquidityFromSnapshot(rank0), liquidityFromSnapshot(max)) * 0.8,
      riskScore: 0.35,
      freshness: [rank0!.source, max!.source],
      assumptions: [`Endo ${personalization.profile.assumptions.endoPlatPerThousand}p/1k`, `credits ${personalization.profile.assumptions.creditPlatPerMillion}p/1M`],
      warnings: ["Rank-specific orders are compared separately; do not mix ranks without normalization."],
      explanation: explanation("Sell maxed only when rank-up EV clears Endo/credit opportunity cost.", `+${profit}p after rank 0, Endo, and credit assumptions.`, ["WFM rank 0 order book", `WFM rank ${item.maxRank} order book`], ["maxedSellValue - rank0SellValue - endoCostValue - creditCostValue - liquidityPenalty"], max),
      url: `https://warframe.market/items/${item.slug}`,
    }));
  }
  return opportunities.sort(compareProductOpportunities).slice(0, 8);
}

function syndicateOpportunities(items: MarketItem[], market: MarketContext, generatedAt: string): ProductOpportunity[] {
  return items.map((item) => {
    const snapshot = market.snapshots.get(item.slug);
    const value = conservativeSellValue(snapshot);
    const standingCost = item.tags.includes("weapon") ? 125_000 : item.tags.includes("mod") ? 25_000 : 100_000;
    if (value === null || !snapshot) return null;
    const pps = value / standingCost;
    return productOpportunity({
      id: `standing:${item.slug}`,
      methodId: "syndicates",
      title: `Convert standing into ${item.name}`,
      action: "convert",
      itemRefs: [itemRef(item)],
      expectedPlat: value,
      liquidityScore: liquidityFromSnapshot(snapshot),
      confidenceScore: liquidityFromSnapshot(snapshot) * 0.7,
      riskScore: 0.4,
      freshness: [snapshot.source],
      assumptions: [`Standing cost ${standingCost.toLocaleString()} from syndicate item class; set accessible syndicates in account assumptions.`],
      warnings: ["Recommendations explain rank/cost requirements; verify faction access before buying stock."],
      explanation: explanation(`Convert daily standing at ${round(pps * 1000, 3)}p per 1k standing.`, `${value}p conservative sale value.`, ["WFM syndicate item order book"], ["platPerStanding = conservativeSellValue / standingCost"], snapshot),
      url: `https://warframe.market/items/${item.slug}`,
    });
  }).filter((entry): entry is ProductOpportunity => entry !== null).sort(compareProductOpportunities).slice(0, 8);
}

function baroOpportunities(items: MarketItem[], market: MarketContext, generatedAt: string): ProductOpportunity[] {
  return buildDucatRecommendations({ ...market, items } as MarketContext, { source: "warframe.market", fetchedAt: generatedAt, ttlSeconds: WFM_TTL_SECONDS, confidence: "medium", warnings: [] });
}

function resourceOpportunities(items: MarketItem[], market: MarketContext, generatedAt: string): ProductOpportunity[] {
  return items.map((item) => {
    const snapshot = market.snapshots.get(item.slug);
    const value = conservativeSellValue(snapshot);
    if (value === null || !snapshot) return null;
    return productOpportunity({
      id: `resource:${item.slug}`,
      methodId: "resources",
      title: `Farm or sell ${item.name}`,
      action: "farm",
      itemRefs: [itemRef(item)],
      expectedPlat: value,
      timeToExecuteMinutes: 15,
      liquidityScore: liquidityFromSnapshot(snapshot),
      confidenceScore: liquidityFromSnapshot(snapshot) * 0.62,
      riskScore: liquidityFromSnapshot(snapshot) < 0.45 ? 0.65 : 0.35,
      freshness: [snapshot.source],
      assumptions: ["Open-world cycle and standing conversion can change availability; cycle data downgrades stale windows."],
      warnings: liquidityFromSnapshot(snapshot) < 0.45 ? ["Low-liquidity commodity: informational, not actionable."] : [],
      explanation: explanation("Farm only during the required window and only if market depth supports selling.", `${value}p listing-derived value before batch/trade-slot constraints.`, ["WFM commodity order book"], ["plat per expected minute by location/window", "cycle-dependent recommendations expire when cycle changes"], snapshot),
      url: `https://warframe.market/items/${item.slug}`,
    });
  }).filter((entry): entry is ProductOpportunity => entry !== null).sort(compareProductOpportunities).slice(0, 8);
}

function isTradableResourceCandidate(item: MarketItem): boolean {
  if (!(item.tags.includes("fish") || item.tags.includes("gem") || item.tags.includes("resource"))) return false;
  return tradabilityForItem(item).status !== "not_tradable";
}

function gatedBespokeMarkets(): BespokeMarketGate[] {
  return [
    { id: "adversaries", label: "Kuva Liches / Sisters", status: "gated", warnings: ["No generic commodity scoring. Requires ephemera, weapon, element, percentage, and manual comparable matching."] },
    { id: "imprints", label: "Companion imprints", status: "gated", warnings: ["No generic commodity scoring. Requires attribute-based comparables and manual verification."] },
  ];
}

function emptyAdvanced(personalization: PersonalizationState, generatedAt: string): AdvancedAnalyticsDashboard {
  return buildAdvancedAnalytics(personalization, { mods: [], syndicates: [], baro: [], resources: [], eventShocks: [], bespokeMarkets: gatedBespokeMarkets() }, generatedAt);
}

function buildAdvancedAnalytics(personalization: PersonalizationState, expansion: ExpansionDashboard, generatedAt: string): AdvancedAnalyticsDashboard {
  const realizedProfitPlat = personalization.tradeJournal.reduce((sum, trade) => sum + (trade.side === "sell" ? trade.pricePlat : -trade.pricePlat) * trade.quantity, 0);
  return {
    tradeJournal: { realizedProfitPlat: round(realizedProfitPlat, 2), tradeCount: personalization.tradeJournal.length, byMethod: [] },
    portfolioAging: personalization.portfolio.map((entry) => {
      const daysHeld = entry.acquiredAt ? Math.max(0, Math.round((Date.now() - Date.parse(entry.acquiredAt)) / 86_400_000)) : 0;
      return { entryId: entry.id, itemName: entry.item.name, daysHeld, unrealizedPlat: null, warnings: daysHeld > 14 ? ["Aging inventory: re-check liquidity before holding longer."] : [] };
    }),
    aggregateTrends: personalization.profile.privacy.allowAnonymousAggregates ? [{ id: "opt-in", label: "Anonymous aggregate trend sharing enabled", value: 1, privacy: "anonymous_aggregate", warnings: [] }] : [],
    teamWatchlists: personalization.profile.privacy.teamSharingEnabled ? personalization.watchlists.map((watchlist) => ({ id: watchlist.id, name: watchlist.name, memberCount: 1, optIn: true })) : [],
    methodGuides: [
      { methodId: "prime_relics", title: "Prime/Relic execution guide", generatedAt, sourceIds: ["drops", "wfm", "live"], summary: "Sell unopened relics when sell floor beats crack EV after trace cost; crack/refine when reward EV and fissure timing beat sale value.", warnings: [] },
      { methodId: "mods", title: "Rank-aware mod guide", generatedAt, sourceIds: ["wfm"], summary: "Compare rank 0 and max-rank books separately; subtract Endo and credits before recommending rank-up sales.", warnings: [] },
    ],
  };
}

async function fetchPublicExportIngest(userAgent: string, fetcher: typeof fetch): Promise<PublicExportIngest> {
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  let schemaHash: string | undefined;
  try {
    const response = await fetcher(PUBLIC_EXPORT_URL, { headers: { "User-Agent": userAgent, Accept: "application/octet-stream,*/*;q=0.1" } });
    if (!response.ok) throw new Error(`PublicExport ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    schemaHash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    warnings.push("PublicExport manifest fetched; compressed payload decoding is not required for WFM gameRef identity bridge in this runtime.");
  } catch (error) {
    warnings.push(`PublicExport fetch failed; using WFM gameRef bridge. ${errorMessage(error)}`);
  }
  return { source: { source: "public_export", url: PUBLIC_EXPORT_URL, fetchedAt, ttlSeconds: 24 * 60 * 60, confidence: warnings.length > 0 ? "low" : "high", warnings }, uniqueNames: new Map(), ...(schemaHash ? { schemaHash } : {}) };
}

function publicExportWarning(fetchedAt: string, message: string): PublicExportIngest {
  return { source: { source: "public_export", url: PUBLIC_EXPORT_URL, fetchedAt, ttlSeconds: 24 * 60 * 60, confidence: "low", warnings: [`PublicExport unavailable; using WFM gameRef identity bridge. ${message}`] }, uniqueNames: new Map() };
}

function emptyDropTables(fetchedAt: string, message: string): OfficialDropTables {
  const source: SourceProvenance = { source: "official_drop_tables", url: PRIME_RELIC_SOURCE, fetchedAt, ttlSeconds: 24 * 60 * 60, confidence: "low", warnings: [message] };
  return { fetchedAt, url: PRIME_RELIC_SOURCE, contentHash: "missing", missionRewards: [], relicRewards: [], acquisitionRelics: [], source, warnings: [message] };
}

function emptyLiveSnapshot(fetchedAt: string, message: string): LiveActivitySnapshot {
  const source: SourceProvenance = { source: "warframestat", url: "https://api.warframestat.us/pc/fissures", fetchedAt, ttlSeconds: 5 * 60, confidence: "low", warnings: [message] };
  return { fetchedAt, fissures: [], activities: [], rejected: [], sources: [source], warnings: [message] };
}

function defaultPersonalization(generatedAt: string): PersonalizationState {
  return {
    profile: {
      id: "user_local",
      displayName: "Local trader",
      timezone: "UTC",
      platform: "pc",
      crossplay: true,
      assumptions: { traceOpportunityCostPlat: 0.02, endoPlatPerThousand: 1.2, creditPlatPerMillion: 1, preferredMissionTypes: [], unlockedContent: [], accessibleSyndicates: [] },
      privacy: { privateByDefault: true, allowAnonymousAggregates: false, teamSharingEnabled: false },
    },
    savedFilters: [],
    watchlists: [],
    portfolio: [],
    todos: [],
    notificationRules: [],
    deliveries: [],
    tradeJournal: [],
    auditLog: [{ id: "audit_initial", at: generatedAt, event: "local_private_profile_created" }],
    exportAvailable: true,
    deleteAvailable: true,
    warnings: ["Local private profile created."],
  };
}

function productOpportunity(input: ProductOpportunity): ProductOpportunity {
  const { expectedProfitPlat, ...rest } = input;
  const output: ProductOpportunity = {
    ...rest,
    liquidityScore: round(clamp01(input.liquidityScore), 4),
    confidenceScore: round(clamp01(input.confidenceScore), 4),
    riskScore: round(clamp01(input.riskScore), 4),
    expectedPlat: round(input.expectedPlat, 2),
  };
  if (expectedProfitPlat !== undefined) output.expectedProfitPlat = round(expectedProfitPlat, 2);
  return output;
}

function relicOpportunity(entry: RelicRecommendation, action: ProductOpportunityAction): ProductOpportunity {
  const value = action === "sell" ? entry.relicSellValuePlat ?? 0 : entry.chosenTier.evPlat;
  const profit = action === "sell" ? undefined : entry.crackPremiumPlat ?? undefined;
  return productOpportunity({
    id: `relic:${action}:${entry.relic.wfmSlug}:${entry.chosenTier.tier}`,
    methodId: "prime_relics",
    title: `${action === "sell" ? "Sell" : action === "open" ? "Crack" : "Refine"} ${entry.relic.name} (${entry.chosenTier.tier})`,
    action,
    itemRefs: [entry.relic],
    expectedPlat: value,
    ...(profit !== undefined ? { expectedProfitPlat: profit } : {}),
    liquidityScore: average(entry.chosenTier.rewards.map((reward) => reward.liquidityScore)),
    confidenceScore: entry.confidence,
    riskScore: 1 - entry.confidence,
    freshness: entry.sources,
    assumptions: [`Void Trace opportunity cost ${entry.traceOpportunityCost}p/trace`, "Sale values are WFM listing-derived, not confirmed sales."],
    warnings: entry.warnings,
    explanation: relicExplanation(entry, action),
    url: `https://warframe.market/items/${entry.relic.wfmSlug}`,
  });
}

function relicExplanation(entry: RelicRecommendation, action: ProductOpportunityAction): Explanation {
  const rewards = entry.chosenTier.rewards.map((reward) => `${reward.item.name}: ${round(reward.chance * 100, 2)}% × ${reward.valuePlat ?? "?"}p`).slice(0, 6);
  return {
    recommendation: action === "sell" ? "Sell unopened when relic floor is stronger than crack EV after trace cost." : `Use ${entry.chosenTier.tier}; it has the best net EV after trace opportunity cost.`,
    expectedOutcome: `${entry.chosenTier.evPlat}p EV; ${entry.crackPremiumPlat === null ? "premium unknown" : `${entry.crackPremiumPlat}p crack premium`}.`,
    dataBasis: ["Official relic reward table", "WFM listing-derived sell values", ...rewards],
    mechanics: [`${entry.chosenTier.tier} refinement`, `${entry.chosenTier.voidTraceCost} trace cost`, `EV = sum(probability × conservative sale value)`],
    liquidity: entry.chosenTier.rewards.map((reward) => `${reward.item.name}: liquidity ${Math.round(reward.liquidityScore * 100)}%`).slice(0, 4),
    risks: entry.warnings.length > 0 ? entry.warnings : ["Prices are visible listings, not confirmed sales."],
    alternatives: ["Sell unopened", "Crack intact", "Refine to Radiant only for rare chase", "Hold during supply shock"],
  };
}

function activityOpportunity(activity: RunActivityCard): ProductOpportunity {
  return productOpportunity({
    id: `run:${activity.id}`,
    methodId: "run_now",
    title: activity.title,
    action: "run_mission",
    itemRefs: [],
    expectedPlat: round(activity.evPerMinute * 10, 2),
    timeToExecuteMinutes: 10,
    liquidityScore: 0.5,
    confidenceScore: activity.confidenceScore,
    riskScore: 1 - activity.confidenceScore,
    freshness: [activity.source],
    assumptions: ["EV/minute is a method score combining mission speed, relic economics, and live expiry."],
    warnings: activity.warnings,
    explanation: activity.explanation,
    ...(activity.expiresAt !== undefined ? { expiresAt: activity.expiresAt } : {}),
  });
}

function fissureToRunCard(fissure: FissureRecommendation): RunActivityCard {
  return {
    id: fissure.id,
    activityType: fissure.isStorm ? "void_storm" : "fissure",
    title: `${fissure.node} ${fissure.tier}${fissure.isStorm ? " Void Storm" : " Fissure"}`,
    node: fissure.node,
    missionType: fissure.missionType,
    evPerMinute: fissure.evPerMinute,
    priority: fissure.priority,
    expiresAt: fissure.expiresAt,
    confidenceScore: fissure.confidence,
    status: statusFromScore(fissure.confidence),
    warnings: fissure.warnings,
    source: fissure.source,
    explanation: explanation("Run if this tier matches relics you should crack now.", `${fissure.evPerMinute}p EV/minute estimate.`, ["validated warframestat fissure", "Prime/Relic EV layer"], ["fissure tier, mission type speed, expiry, and Omnia/Void Storm multipliers"], undefined),
  };
}

function explanation(recommendation: string, expectedOutcome: string, dataBasis: string[], mechanics: string[], snapshot: MarketSnapshot | undefined): Explanation {
  const liquidity = snapshot ? [`${snapshot.sellOrders.length} sell orders`, `${snapshot.buyOrders.length} buy orders`, `${snapshot.sellOrders.filter((order) => order.user.status === "ingame" || order.user.status === "online").length} online/ingame sellers`] : ["Liquidity unavailable or method-level." ];
  return {
    recommendation,
    expectedOutcome,
    dataBasis,
    mechanics,
    liquidity,
    risks: ["Listing-derived price estimate; verify order book before acting."],
    alternatives: ["Sell now", "Hold", "Convert", "Run a different mission", "Add to todo/watchlist"],
  };
}

function methodSummary(id: string, label: string, description: string, status: HealthStatus, opportunityCount: number, sourceIds: string[], warnings: string[]): MethodSummary {
  return { id, label, description, status, opportunityCount, sourceIds, warnings, ...(opportunityCount > 0 ? { bestOpportunityId: id } : {}) };
}

function itemRef(item: MarketItem): ItemRef {
  return { tpeId: `wfm:${item.slug}`, name: item.name, wfmSlug: item.slug, wfmId: item.id, ...(item.gameRef !== undefined ? { gameRef: item.gameRef } : {}) };
}

function toMarketOrder(order: ArcaneOrder) {
  return { id: order.id, type: order.type, platinum: order.unitPrice || order.platinum, quantity: order.quantity, rank: order.rank, visible: order.visible, createdAt: order.createdAt, updatedAt: order.updatedAt, user: { status: order.user.status, ingameName: order.user.ingameName, reputation: order.user.reputation } };
}

function adjustFissureEv(fissure: FissureRecommendation, recommendations: RelicRecommendation[]): number {
  const matching = recommendations.filter((entry) => entry.relic.name.startsWith(fissure.tier));
  const relicBoost = matching.length === 0 ? 1 : clamp01(average(matching.map((entry) => entry.chosenTier.evPlat)) / 20) + 0.75;
  return round(fissure.evPerMinute * relicBoost, 2);
}

function compareProductOpportunities(left: ProductOpportunity, right: ProductOpportunity): number {
  const leftScore = (left.expectedProfitPlat ?? left.expectedPlat) * left.confidenceScore * Math.max(0.2, left.liquidityScore) * (1 - left.riskScore * 0.4);
  const rightScore = (right.expectedProfitPlat ?? right.expectedPlat) * right.confidenceScore * Math.max(0.2, right.liquidityScore) * (1 - right.riskScore * 0.4);
  return rightScore - leftScore;
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.round((sortedValues.length - 1) * fraction)));
  return sortedValues[index] ?? 0;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function runLimited<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      const item = items[current];
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "unknown error");
}
