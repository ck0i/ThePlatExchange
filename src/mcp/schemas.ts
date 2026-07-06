import { z } from "zod";
import type { Opportunity } from "../wfm/types.js";

export const ENVELOPE_VERSION = "the-plat-exchange/1" as const;

const WARNING_CODES = [
  "stale_data",
  "partial_scan",
  "no_comparables",
  "rate_limited",
  "validation_failed",
] as const;

export const WarningSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("stale_data"), age_minutes: z.number() }),
  z.object({ code: z.literal("partial_scan"), missing_weapons: z.number() }),
  z.object({ code: z.literal("no_comparables"), weapon: z.string(), comparables: z.number() }),
  z.object({ code: z.literal("rate_limited"), retry_after_s: z.number() }),
  z.object({ code: z.literal("validation_failed"), message: z.string() }),
]);
export type Warning = z.infer<typeof WarningSchema>;

export const QualityTierSchema = z.enum(["green", "yellow", "red"]);
export type QualityTier = z.infer<typeof QualityTierSchema>;

export const CoverageSchema = z.object({
  scanned: z.number(),
  total: z.number(),
  pct: z.number().min(0).max(1),
});

export const MetaSchema = z.object({
  generated_at: z.string(),
  data_source: z.enum(["live", "cache", "history"]),
  freshness_ms: z.number().int().nonnegative(),
  coverage: CoverageSchema,
  scan_running: z.boolean(),
  quality: QualityTierSchema,
  warnings: z.array(WarningSchema),
});
export type EnvelopeMeta = z.infer<typeof MetaSchema>;

export const EnvelopeSchema = z.object({
  version: z.literal(ENVELOPE_VERSION),
  data: z.unknown(),
  meta: MetaSchema,
});
export type Envelope<T = unknown> = { version: typeof ENVELOPE_VERSION; data: T; meta: EnvelopeMeta };

const OPPORTUNITY_SIGNALS = [
  "low_comparables",
  "stale_seller",
  "outlier_price",
  "new_seller",
  "disposition_rising",
  "disposition_falling",
  "undervalued_signature",
  "fast_moving",
  "stuck_signature",
  "sentiment_hot",
] as const;

export const OpportunitySignalSchema = z.enum(OPPORTUNITY_SIGNALS);
export type OpportunitySignal = z.infer<typeof OpportunitySignalSchema>;

export const OpportunityQualitySchema = z.object({
  tier: z.enum(["A", "B", "C", "D"]),
  data_age_seconds: z.number().nonnegative(),
  signals: z.array(OpportunitySignalSchema),
});
export type OpportunityQuality = z.infer<typeof OpportunityQualitySchema>;

export type EnrichedOpportunity = Opportunity & { quality: OpportunityQuality };

const STALE_THRESHOLD_MS = 30 * 60_000;
const YELLOW_THRESHOLD_MS = 5 * 60_000;
const COVERAGE_RED_PCT = 0.6;
const COVERAGE_YELLOW_PCT = 0.9;

export interface MetaComputeInput {
  generated_at: string;
  data_source: EnvelopeMeta["data_source"];
  freshness_ms: number;
  scanned: number;
  total: number;
  scan_running: boolean;
  extraWarnings?: Warning[];
}

export function computeMeta(input: MetaComputeInput): EnvelopeMeta {
  const pct = input.total === 0 ? 0 : Math.max(0, Math.min(1, input.scanned / input.total));
  const warnings: Warning[] = [...(input.extraWarnings ?? [])];
  if (input.freshness_ms > STALE_THRESHOLD_MS) {
    warnings.push({ code: "stale_data", age_minutes: Math.round(input.freshness_ms / 60_000) });
  }
  if (!input.scan_running && pct < COVERAGE_RED_PCT && input.total > 0) {
    warnings.push({ code: "partial_scan", missing_weapons: Math.max(0, input.total - input.scanned) });
  }
  let quality: QualityTier = "green";
  if (input.freshness_ms > STALE_THRESHOLD_MS || (input.total > 0 && pct < COVERAGE_RED_PCT && !input.scan_running)) {
    quality = "red";
  } else if (input.freshness_ms > YELLOW_THRESHOLD_MS || (input.total > 0 && pct < COVERAGE_YELLOW_PCT)) {
    quality = "yellow";
  }
  return {
    generated_at: input.generated_at,
    data_source: input.data_source,
    freshness_ms: input.freshness_ms,
    coverage: { scanned: input.scanned, total: input.total, pct },
    scan_running: input.scan_running,
    quality,
    warnings,
  };
}

export function toEnvelope<T>(data: T, meta: EnvelopeMeta): Envelope<T> {
  return { version: ENVELOPE_VERSION, data, meta };
}

export function validateEnvelope<T>(envelope: Envelope<T>): { ok: true; envelope: Envelope<T> } | { ok: false; message: string } {
  const parsed = EnvelopeSchema.safeParse(envelope);
  if (parsed.success) return { ok: true, envelope };
  return { ok: false, message: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
}

export function markEnvelopeInvalid<T>(envelope: Envelope<T>, message: string): Envelope<T> {
  const meta: EnvelopeMeta = {
    ...envelope.meta,
    quality: "red",
    warnings: [...envelope.meta.warnings, { code: "validation_failed", message }],
  };
  return { ...envelope, meta };
}

export interface SignatureLookupHit {
  valuation: { sample_count: number; confidence: number; p25: number | null; p50: number | null } | null;
  velocity: { classification: "fast_moving" | "stuck" | "unknown" } | null;
}

export interface EnrichContext {
  dispositionSignals?: ReadonlyMap<string, "rising" | "falling">;
  signatureLookup?: (weaponSlug: string, signature: string) => SignatureLookupHit;
  sentimentHotSet?: ReadonlySet<string>;
}

export function enrichOpportunity(opportunity: Opportunity, generatedAtMs: number, ctx: EnrichContext = {}): EnrichedOpportunity {
  const dataAgeSeconds = Math.max(0, Math.round((generatedAtMs - Date.parse(opportunity.updated)) / 1000));
  const signals: OpportunitySignal[] = [];
  if (opportunity.comparableListings < 6) signals.push("low_comparables");
  if (opportunity.seller.reputation < 5) signals.push("new_seller");
  if (opportunity.status === "offline" || opportunity.status === "unknown") signals.push("stale_seller");
  const dispositionSignal = ctx.dispositionSignals?.get(opportunity.weaponSlug);
  if (dispositionSignal === "rising") signals.push("disposition_rising");
  else if (dispositionSignal === "falling") signals.push("disposition_falling");
  if (ctx.signatureLookup) {
    const hit = ctx.signatureLookup(opportunity.weaponSlug, opportunity.signature);
    const valuation = hit.valuation;
    if (valuation && valuation.p25 !== null && valuation.sample_count >= 8 && valuation.confidence >= 0.6 && opportunity.buyPrice < valuation.p25) {
      signals.push("undervalued_signature");
    }
    const velocity = hit.velocity;
    if (velocity?.classification === "fast_moving") signals.push("fast_moving");
    else if (velocity?.classification === "stuck") signals.push("stuck_signature");
  }
  if (ctx.sentimentHotSet?.has(opportunity.weaponSlug)) signals.push("sentiment_hot");
  const tier = deriveTier(opportunity.confidence, opportunity.comparableListings);
  return { ...opportunity, quality: { tier, data_age_seconds: dataAgeSeconds, signals } };
}

function deriveTier(confidence: number, comparables: number): OpportunityQuality["tier"] {
  if (confidence >= 0.8 && comparables >= 10) return "A";
  if (confidence >= 0.6 && comparables >= 6) return "B";
  if (confidence >= 0.4 && comparables >= 4) return "C";
  return "D";
}

const envelopeJsonSchema = (dataSchema: Record<string, unknown>): Record<string, unknown> => ({
  type: "object",
  required: ["version", "data", "meta"],
  additionalProperties: false,
  properties: {
    version: { const: ENVELOPE_VERSION },
    data: dataSchema,
    meta: metaJsonSchema,
  },
});

const warningJsonSchema: Record<string, unknown> = {
  type: "object",
  required: ["code"],
  properties: { code: { enum: [...WARNING_CODES] } },
};

const metaJsonSchema: Record<string, unknown> = {
  type: "object",
  required: ["generated_at", "data_source", "freshness_ms", "coverage", "scan_running", "quality", "warnings"],
  properties: {
    generated_at: { type: "string" },
    data_source: { enum: ["live", "cache", "history"] },
    freshness_ms: { type: "integer", minimum: 0 },
    coverage: {
      type: "object",
      required: ["scanned", "total", "pct"],
      properties: {
        scanned: { type: "integer", minimum: 0 },
        total: { type: "integer", minimum: 0 },
        pct: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    scan_running: { type: "boolean" },
    quality: { enum: ["green", "yellow", "red"] },
    warnings: { type: "array", items: warningJsonSchema },
  },
};

const opportunityJsonSchema: Record<string, unknown> = {
  type: "object",
  required: ["auctionId", "weaponSlug", "weaponName", "buyPrice", "targetSellPrice", "expectedProfit", "roi", "score", "quality"],
  properties: {
    auctionId: { type: "string" },
    weaponSlug: { type: "string" },
    weaponName: { type: "string" },
    rivenName: { type: "string" },
    buyPrice: { type: "number" },
    targetSellPrice: { type: "number" },
    conservativeSellPrice: { type: "number" },
    expectedProfit: { type: "number" },
    roi: { type: "number" },
    score: { type: "number" },
    confidence: { type: "number" },
    comparableListings: { type: "integer" },
    groupType: { enum: ["exact-stats", "weapon-market"] },
    positives: { type: "array", items: { type: "string" } },
    negatives: { type: "array", items: { type: "string" } },
    reasons: { type: "array", items: { type: "string" } },
    url: { type: "string" },
    quality: {
      type: "object",
      required: ["tier", "data_age_seconds", "signals"],
      properties: {
        tier: { enum: ["A", "B", "C", "D"] },
        data_age_seconds: { type: "number", minimum: 0 },
        signals: { type: "array", items: { enum: [...OPPORTUNITY_SIGNALS] } },
      },
    },
  },
};

const signatureValueDataSchema: Record<string, unknown> = {
  type: "object",
  required: ["weapon_slug", "signature", "sample_count", "confidence"],
  properties: {
    weapon_slug: { type: "string" },
    signature: { type: "string" },
    window_days: { type: "integer" },
    sample_count: { type: "integer", minimum: 0 },
    p25: { type: ["number", "null"] },
    p50: { type: ["number", "null"] },
    p75: { type: ["number", "null"] },
    p90: { type: ["number", "null"] },
    min: { type: ["number", "null"] },
    max: { type: ["number", "null"] },
    last_seen_price: { type: ["number", "null"] },
    last_seen_at: { type: ["integer", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    source: { enum: ["live_signature", "live_weapon_market"] },
    velocity: {
      anyOf: [
        {
          type: "object",
          properties: {
            observed_listings: { type: "integer" },
            vanished_listings: { type: "integer" },
            vanish_rate: { type: "number" },
            avg_time_on_market_days: { type: ["number", "null"] },
            classification: { enum: ["fast_moving", "stuck", "unknown"] },
          },
        },
        { type: "null" },
      ],
    },
  },
};

const priceStatsJsonSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    count: { type: "integer" },
    min: { type: "number" },
    p25: { type: "number" },
    median: { type: "number" },
    p75: { type: "number" },
    p90: { type: "number" },
    max: { type: "number" },
  },
};

const arcaneRankMarketJsonSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    rank: { type: "integer" },
    sell: { anyOf: [priceStatsJsonSchema, { type: "null" }] },
    buy: { anyOf: [priceStatsJsonSchema, { type: "null" }] },
    sellOrderCount: { type: "integer" },
    buyOrderCount: { type: "integer" },
    onlineSellOrderCount: { type: "integer" },
    onlineBuyOrderCount: { type: "integer" },
    totalSellQuantity: { type: "integer" },
    totalBuyQuantity: { type: "integer" },
  },
};

const arcaneMarketSummaryJsonSchema: Record<string, unknown> = {
  type: "object",
  required: ["slug", "name", "rarity", "rank0", "url"],
  properties: {
    slug: { type: "string" },
    name: { type: "string" },
    rarity: { enum: ["common", "uncommon", "rare", "legendary", "unknown"] },
    maxRank: { type: "integer" },
    listings: { type: "integer" },
    sellListings: { type: "integer" },
    buyListings: { type: "integer" },
    onlineSellListings: { type: "integer" },
    onlineBuyListings: { type: "integer" },
    rank0: arcaneRankMarketJsonSchema,
    rankMax: arcaneRankMarketJsonSchema,
    dissolutionVosfor: { type: "number" },
    icon: { type: "string" },
    thumb: { type: "string" },
    imageName: { type: "string" },
    lastScannedAt: { type: "string" },
    priceVsVosfor: {
      type: "object",
      properties: {
        rank: { type: "integer" },
        sellPrice: { type: "number" },
        platinumPerVosfor: { type: "number" },
      },
    },
    url: { type: "string" },
  },
};

const arcanePackDropJsonSchema: Record<string, unknown> = {
  type: "object",
  required: ["arcaneSlug", "arcaneName", "chance", "expectedPlat"],
  properties: {
    arcaneSlug: { type: "string" },
    arcaneName: { type: "string" },
    rarity: { enum: ["common", "uncommon", "rare", "legendary"] },
    chance: { type: "number" },
    rank: { type: "integer" },
    priceUsed: { type: ["number", "null"] },
    dissolutionVosfor: { type: "number" },
    expectedCopies: { type: "number" },
    expectedPlat: { type: "number" },
    expectedVosfor: { type: ["number", "null"] },
    sourcePrice: { type: "string" },
    maxRank: { type: ["integer", "null"] },
    copiesToMax: { type: ["integer", "null"] },
    maxRankPrice: { type: ["number", "null"] },
    highValueTarget: { type: "boolean" },
    expectedHighValueMaxedPlat: { type: "number" },
    sourceMaxRankPrice: { type: "string" },
  },
};

const arcanePackStrategyMetricsJsonSchema: Record<string, unknown> = {
  type: "object",
  required: ["strategy", "label", "expectedPlat", "expectedPlatPerVosfor", "confidence", "targetChance", "chanceAtLeastOneTarget", "expectedTargetCopies", "targetCount"],
  properties: {
    strategy: { enum: ["high_value_maxed", "rank0_bulk"] },
    label: { type: "string" },
    expectedPlat: { type: "number" },
    expectedPlatPerVosfor: { type: "number" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    coveragePct: { type: "number" },
    targetChance: { type: "number" },
    chanceAtLeastOneTarget: { type: "number" },
    expectedTargetCopies: { type: "number" },
    targetCount: { type: "integer" },
  },
};

const arcanePackJsonSchema: Record<string, unknown> = {
  type: "object",
  required: ["packId", "packName", "expectedPlat", "expectedPlatPerVosfor", "confidence", "topDrops"],
  properties: {
    packId: { type: "string" },
    packName: { type: "string" },
    costVosfor: { type: "number" },
    creditCost: { type: "number" },
    rewardsPerPack: { type: "number" },
    expectedPlat: { type: "number" },
    expectedPlatPerVosfor: { type: "number" },
    expectedVosforReturn: { type: "number" },
    netVosforBurn: { type: "number" },
    coveragePct: { type: "number" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    missingPriceCount: { type: "integer" },
    pricedDropCount: { type: "integer" },
    maxRankCoveragePct: { type: "number" },
    highValueConfidence: { type: "number", minimum: 0, maximum: 1 },
    missingMaxRankPriceCount: { type: "integer" },
    maxRankPricedDropCount: { type: "integer" },
    highValueThreshold: { type: "number" },
    highValueTargetCount: { type: "integer" },
    highValueTargetChance: { type: "number" },
    chanceAtLeastOneHighValue: { type: "number" },
    expectedHighValueCopies: { type: "number" },
    expectedHighValueMaxedPlat: { type: "number" },
    expectedHighValueMaxedPlatPerVosfor: { type: "number" },
    defaultStrategy: { enum: ["high_value_maxed", "rank0_bulk"] },
    strategyMetrics: {
      type: "object",
      properties: {
        high_value_maxed: arcanePackStrategyMetricsJsonSchema,
        rank0_bulk: arcanePackStrategyMetricsJsonSchema,
      },
    },
    topDrops: { type: "array", items: arcanePackDropJsonSchema },
    source: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
  },
};

const arcaneDissolveRecommendationJsonSchema: Record<string, unknown> = {
  type: "object",
  required: ["slug", "name", "action", "deltaPlat", "confidence"],
  properties: {
    slug: { type: "string" },
    name: { type: "string" },
    rank: { type: "integer" },
    sellPrice: { type: "number" },
    dissolutionVosfor: { type: "number" },
    bestPackId: { type: "string" },
    bestPackName: { type: "string" },
    estimatedRollValue: { type: "number" },
    sellValuePerVosfor: { type: "number" },
    rollValuePerVosfor: { type: "number" },
    deltaPlat: { type: "number" },
    action: { enum: ["dissolve", "sell", "hold"] },
    strategy: { enum: ["high_value_maxed", "rank0_bulk"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasons: { type: "array", items: { type: "string" } },
    url: { type: "string" },
    imageName: { type: "string" },
  },
};

const arcaneDetailDataSchema: Record<string, unknown> = {
  anyOf: [
    { type: "null" },
    {
      type: "object",
      properties: {
        summary: arcaneMarketSummaryJsonSchema,
        recommendation: { anyOf: [arcaneDissolveRecommendationJsonSchema, { type: "null" }] },
        topPackDrops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              packId: { type: "string" },
              packName: { type: "string" },
              chance: { type: "number" },
              expectedCopies: { type: "number" },
              expectedPlat: { type: "number" },
              expectedHighValueMaxedPlat: { type: "number" },
              expectedVosfor: { type: ["number", "null"] },
              priceUsed: { type: ["number", "null"] },
              maxRankPrice: { type: ["number", "null"] },
              copiesToMax: { type: ["integer", "null"] },
              highValueTarget: { type: "boolean" },
              confidence: { type: "number" },
            },
          },
        },
        ordersUrl: { type: "string" },
      },
    },
  ],
};

export const outputSchemas = {
  snapshot: envelopeJsonSchema({
    type: "object",
    properties: {
      totals: {
        type: "object",
        properties: {
          weaponsWithAuctions: { type: "integer" },
          auctions: { type: "integer" },
          opportunities: { type: "integer" },
        },
      },
      opportunities: { type: "array", items: opportunityJsonSchema },
      instantWins: {
        type: "array",
        items: {
          type: "object",
          required: ["opportunity", "signature_value", "expected_uplift"],
          properties: {
            opportunity: opportunityJsonSchema,
            signature_value: signatureValueDataSchema,
            expected_uplift: { type: "number" },
            discount_to_p25: { type: "number" },
            discount_pct: { type: "number" },
            basis: { enum: ["same-signature", "market-floor"] },
            reasons: { type: "array", items: { type: "string" } },
          },
        },
      },
      weaponSummaries: { type: "array", items: { type: "object" } },
      config: { type: "object" },
      status: { type: "object" },
    },
  }),
  opportunities: envelopeJsonSchema({
    type: "array",
    items: opportunityJsonSchema,
  }),
  action: envelopeJsonSchema({
    type: "object",
    properties: {
      accepted: { type: "boolean" },
      reason: { type: "string" },
    },
  }),
  health: envelopeJsonSchema({ type: "null" }),
  signatureValue: envelopeJsonSchema(signatureValueDataSchema),
  instantWins: envelopeJsonSchema({
    type: "array",
    items: {
      type: "object",
      required: ["opportunity", "signature_value", "expected_uplift"],
      properties: {
        opportunity: opportunityJsonSchema,
        signature_value: signatureValueDataSchema,
        expected_uplift: { type: "number" },
        discount_to_p25: { type: "number" },
        discount_pct: { type: "number" },
        basis: { enum: ["same-signature", "market-floor"] },
        reasons: { type: "array", items: { type: "string" } },
      },
    },
  }),
  arcanePacks: envelopeJsonSchema({
    type: "array",
    items: arcanePackJsonSchema,
  }),
  arcaneDissolveRecommendations: envelopeJsonSchema({
    type: "array",
    items: arcaneDissolveRecommendationJsonSchema,
  }),
  arcaneMarket: envelopeJsonSchema({
    type: "array",
    items: arcaneMarketSummaryJsonSchema,
  }),
  arcaneDetail: envelopeJsonSchema(arcaneDetailDataSchema),
};
