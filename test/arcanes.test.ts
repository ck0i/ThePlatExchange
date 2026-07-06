import assert from "node:assert/strict";
import { analyzeArcaneMarket } from "../src/wfm/arcanes.js";
import type { ArcaneDashboardState, ArcaneDissolveRecommendation, ArcaneItem, ArcaneOrder, ArcanePackDefinition, ArcanePackValuation } from "../src/wfm/types.js";

const nowIso = "2026-07-06T00:00:00.000Z";

function makeArcane(slug: string, name: string, dissolutionVosfor?: number, maxRank = 5): ArcaneItem {
  const item: ArcaneItem = {
    id: slug,
    slug,
    name,
    tags: ["arcane_enhancement"],
    rarity: "rare",
    maxRank,
    tradable: true,
    bulkTradable: true,
    tradingTax: 2_000,
  };
  if (dissolutionVosfor !== undefined) item.dissolutionVosfor = dissolutionVosfor;
  return item;
}

function sellOrder(slug: string, price: number, id = `${slug}-${price}`, rank = 0): ArcaneOrder {
  return {
    id,
    type: "sell",
    platinum: price,
    unitPrice: price,
    quantity: 1,
    perTrade: 1,
    rank,
    visible: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    itemId: slug,
    user: {
      id: `${id}-seller`,
      ingameName: `${id}-seller`,
      slug: `${id}-seller`,
      reputation: 10,
      status: "online",
      platform: "pc",
      crossplay: true,
    },
  };
}

function makePack(
  id: string,
  drops: ArcanePackDefinition["drops"],
  patch: Partial<Pick<ArcanePackDefinition, "costVosfor" | "rewardsPerPack">> = {},
): ArcanePackDefinition {
  return {
    id,
    name: id,
    costVosfor: patch.costVosfor ?? 200,
    creditCost: 0,
    rewardsPerPack: patch.rewardsPerPack ?? 3,
    source: "test",
    drops,
  };
}

function findPack(analysis: ArcaneDashboardState, id: string): ArcanePackValuation {
  const pack = analysis.packs.find((entry) => entry.packId === id);
  assert(pack, `${id} pack missing`);
  return pack;
}

function findRecommendation(analysis: ArcaneDashboardState, slug: string): ArcaneDissolveRecommendation {
  const recommendation = analysis.dissolveRecommendations.find((entry) => entry.slug === slug);
  assert(recommendation, `${slug} recommendation missing`);
  return recommendation;
}

function findStrategyRecommendation(analysis: ArcaneDashboardState, strategy: "high_value_maxed" | "rank0_bulk", slug: string): ArcaneDissolveRecommendation {
  const recommendation = analysis.dissolveRecommendationsByStrategy[strategy].find((entry) => entry.slug === slug);
  assert(recommendation, `${slug} ${strategy} recommendation missing`);
  return recommendation;
}

const valuationItems = [
  makeArcane("weighted_high", "Weighted High"),
  makeArcane("weighted_low", "Weighted Low"),
  makeArcane("jackpot_rare", "Jackpot Rare"),
  makeArcane("jackpot_filler", "Jackpot Filler"),
  makeArcane("steady_drop", "Steady Drop"),
  makeArcane("priced_half", "Priced Half"),
  makeArcane("unpriced_half", "Unpriced Half"),
];

const valuationOrders = new Map<string, ArcaneOrder[]>([
  ["weighted_high", [sellOrder("weighted_high", 100)]],
  ["weighted_low", [sellOrder("weighted_low", 20)]],
  ["jackpot_rare", [sellOrder("jackpot_rare", 1_000)]],
  ["jackpot_filler", [sellOrder("jackpot_filler", 1)]],
  ["steady_drop", [sellOrder("steady_drop", 20)]],
  ["priced_half", [sellOrder("priced_half", 20)]],
]);

const valuation = analyzeArcaneMarket(valuationItems, valuationOrders, new Map(), [
  makePack("weighted", [
    { arcaneSlug: "weighted_high", arcaneName: "Weighted High", rarity: "legendary", chance: 0.25 },
    { arcaneSlug: "weighted_low", arcaneName: "Weighted Low", rarity: "rare", chance: 0.75 },
  ]),
  makePack("jackpot", [
    { arcaneSlug: "jackpot_rare", arcaneName: "Jackpot Rare", rarity: "legendary", chance: 0.01 },
    { arcaneSlug: "jackpot_filler", arcaneName: "Jackpot Filler", rarity: "common", chance: 0.99 },
  ]),
  makePack("steady", [
    { arcaneSlug: "steady_drop", arcaneName: "Steady Drop", rarity: "rare", chance: 1 },
  ]),
  makePack("partial", [
    { arcaneSlug: "priced_half", arcaneName: "Priced Half", rarity: "rare", chance: 0.5 },
    { arcaneSlug: "unpriced_half", arcaneName: "Unpriced Half", rarity: "rare", chance: 0.5 },
  ]),
]);

const weighted = findPack(valuation, "weighted");
assert.equal(weighted.expectedPlat, 120, "pack EV must multiply per-drop sell prices by chance and three reward slots");
assert.equal(weighted.expectedPlatPerVosfor, 0.6);
assert.equal(weighted.coveragePct, 1);
assert.equal(weighted.confidence, 1);
const weightedHigh = weighted.topDrops.find((drop) => drop.arcaneSlug === "weighted_high");
assert(weightedHigh, "weighted high drop missing");
assert.equal(weightedHigh.expectedCopies, 0.75);
assert.equal(weightedHigh.expectedPlat, 75);
assert.equal(weightedHigh.sourcePrice, "rank0_sell_p25");
const weightedLow = weighted.topDrops.find((drop) => drop.arcaneSlug === "weighted_low");
assert(weightedLow, "weighted low drop missing");
assert.equal(weightedLow.expectedCopies, 2.25);
assert.equal(weightedLow.expectedPlat, 45);

const jackpot = findPack(valuation, "jackpot");
const steady = findPack(valuation, "steady");
assert.equal(jackpot.expectedPlat, 32.97, "1% jackpot EV should be discounted by its chance weight");
assert.equal(steady.expectedPlat, 60);
assert(steady.expectedPlat > jackpot.expectedPlat, "steady value must beat a high-list-price jackpot when jackpot chance is too low");

const partial = findPack(valuation, "partial");
assert.equal(partial.expectedPlat, 30, "missing drops contribute no phantom platinum to EV");
assert.equal(partial.coveragePct, 0.5);
assert.equal(partial.confidence, 0.5);
assert.equal(partial.pricedDropCount, 1);
assert.equal(partial.missingPriceCount, 1);
assert(partial.confidence < weighted.confidence, "missing prices must reduce confidence instead of crashing or implying full coverage");
const missingDrop = partial.topDrops.find((drop) => drop.arcaneSlug === "unpriced_half");
assert(missingDrop, "unpriced drop should still be represented for coverage diagnostics");
assert.equal(missingDrop.priceUsed, null);
assert.equal(missingDrop.expectedPlat, 0);
assert.equal(missingDrop.sourcePrice, "missing");

assert.equal(
  weighted.highValueTargetCount,
  0,
  "rank-0 prices alone must not make a pack a high-value max-out target",
);
assert.equal(weighted.expectedHighValueMaxedPlat, 0);
assert.equal(weighted.strategyMetrics.high_value_maxed.expectedPlat, 0);
assert.equal(weighted.strategyMetrics.rank0_bulk.expectedPlat, 120);

const highValueItems = [
  makeArcane("rank0_only_expensive", "Rank 0 Only Expensive"),
  makeArcane("max_rank_five_target", "Max Rank Five Target"),
  makeArcane("max_rank_three_target", "Max Rank Three Target", undefined, 3),
];
const highValueOrders = new Map<string, ArcaneOrder[]>([
  ["rank0_only_expensive", [sellOrder("rank0_only_expensive", 1_000)]],
  [
    "max_rank_five_target",
    [
      sellOrder("max_rank_five_target", 10),
      sellOrder("max_rank_five_target", 210, "max_rank_five_target-r5", 5),
    ],
  ],
  [
    "max_rank_three_target",
    [
      sellOrder("max_rank_three_target", 10),
      sellOrder("max_rank_three_target", 200, "max_rank_three_target-r3", 3),
    ],
  ],
]);
const highValueAnalysis = analyzeArcaneMarket(highValueItems, highValueOrders, new Map(), [
  makePack("high_value_math", [
    { arcaneSlug: "rank0_only_expensive", arcaneName: "Rank 0 Only Expensive", rarity: "legendary", chance: 0.25 },
    { arcaneSlug: "max_rank_five_target", arcaneName: "Max Rank Five Target", rarity: "legendary", chance: 0.5 },
    { arcaneSlug: "max_rank_three_target", arcaneName: "Max Rank Three Target", rarity: "rare", chance: 0.25 },
  ]),
]);
const highValuePack = findPack(highValueAnalysis, "high_value_math");
assert.equal(highValuePack.highValueTargetCount, 2, "max-rank p25 sell prices at or above 180p must create high-value targets");
assert.equal(highValuePack.highValueTargetChance, 0.75);
assert.equal(highValuePack.expectedHighValueCopies, 2.25);
assert.equal(highValuePack.chanceAtLeastOneHighValue, 0.98438);
assert.equal(highValuePack.expectedHighValueMaxedPlat, 30);
assert.equal(highValuePack.expectedHighValueMaxedPlatPerVosfor, 0.15);
assert.equal(highValuePack.strategyMetrics.high_value_maxed.expectedPlat, 30);
assert.equal(highValuePack.strategyMetrics.high_value_maxed.targetCount, 2);
const rank0OnlyDrop = highValuePack.topDrops.find((drop) => drop.arcaneSlug === "rank0_only_expensive");
assert(rank0OnlyDrop, "rank-0-only high price drop missing");
assert.equal(rank0OnlyDrop.highValueTarget, false);
assert.equal(rank0OnlyDrop.maxRankPrice, null);
assert.equal(rank0OnlyDrop.expectedHighValueMaxedPlat, 0);
const maxRankFiveDrop = highValuePack.topDrops.find((drop) => drop.arcaneSlug === "max_rank_five_target");
assert(maxRankFiveDrop, "rank 5 high-value drop missing");
assert.equal(maxRankFiveDrop.maxRank, 5);
assert.equal(maxRankFiveDrop.copiesToMax, 21);
assert.equal(maxRankFiveDrop.maxRankPrice, 210);
assert.equal(maxRankFiveDrop.highValueTarget, true);
assert.equal(maxRankFiveDrop.expectedHighValueMaxedPlat, 15);
assert.equal(maxRankFiveDrop.sourceMaxRankPrice, "rank5_sell_p25");
const maxRankThreeDrop = highValuePack.topDrops.find((drop) => drop.arcaneSlug === "max_rank_three_target");
assert(maxRankThreeDrop, "rank 3 high-value drop missing");
assert.equal(maxRankThreeDrop.maxRank, 3);
assert.equal(maxRankThreeDrop.copiesToMax, 10);
assert.equal(maxRankThreeDrop.maxRankPrice, 200);
assert.equal(maxRankThreeDrop.highValueTarget, true);
assert.equal(maxRankThreeDrop.expectedHighValueMaxedPlat, 15);
assert.equal(maxRankThreeDrop.sourceMaxRankPrice, "rank3_sell_p25");

const recommendationItems = [
  makeArcane("roll_prize", "Roll Prize"),
  makeArcane("dissolve_clear", "Dissolve Clear", 100),
  makeArcane("dissolve_close", "Dissolve Close", 100),
  makeArcane("dissolve_negative", "Dissolve Negative", 100),
];

const recommendationOrders = new Map<string, ArcaneOrder[]>([
  ["roll_prize", [sellOrder("roll_prize", 100), sellOrder("roll_prize", 210, "roll_prize-r5", 5)]],
  ["dissolve_clear", [sellOrder("dissolve_clear", 130)]],
  ["dissolve_close", [sellOrder("dissolve_close", 140)]],
  ["dissolve_negative", [sellOrder("dissolve_negative", 170)]],
]);

const recommendations = analyzeArcaneMarket(recommendationItems, recommendationOrders, new Map(), [
  makePack("vosfor_roll", [
    { arcaneSlug: "roll_prize", arcaneName: "Roll Prize", rarity: "rare", chance: 1 },
  ]),
]);

assert.deepEqual(
  recommendations.dissolveRecommendations,
  recommendations.dissolveRecommendationsByStrategy.high_value_maxed,
  "default dissolve recommendations must use the high-value max-out strategy",
);
const defaultClear = findRecommendation(recommendations, "dissolve_clear");
assert.equal(defaultClear.strategy, "high_value_maxed");
assert.equal(defaultClear.bestPackId, "vosfor_roll");
assert.equal(defaultClear.estimatedRollValue, 15);
assert.equal(defaultClear.deltaPlat, -115);
assert.equal(defaultClear.action, "sell", "high-value max-out EV should be the default dissolve recommendation path");

const clear = findStrategyRecommendation(recommendations, "rank0_bulk", "dissolve_clear");
assert.equal(clear.strategy, "rank0_bulk");
assert.equal(clear.bestPackId, "vosfor_roll");
assert.equal(clear.estimatedRollValue, 150);
assert.equal(clear.deltaPlat, 20);
assert.equal(clear.action, "dissolve", "Vosfor EV above the 12% safety margin should recommend dissolving under the rank-0 bulk strategy");

const close = findStrategyRecommendation(recommendations, "rank0_bulk", "dissolve_close");
assert.equal(close.estimatedRollValue, 150);
assert.equal(close.deltaPlat, 10);
assert.equal(close.action, "hold", "positive Vosfor EV inside the sale-price margin should not force a dissolve recommendation under the rank-0 bulk strategy");

const negative = findStrategyRecommendation(recommendations, "rank0_bulk", "dissolve_negative");
assert.equal(negative.estimatedRollValue, 150);
assert.equal(negative.deltaPlat, -20);
assert.equal(negative.action, "sell", "sale value beyond the negative margin should recommend selling rather than dissolving under the rank-0 bulk strategy");

const bulkDissolveCount = 85;
const bulkDissolveItems = [
  makeArcane("bulk_roll_prize", "Bulk Roll Prize"),
  ...Array.from({ length: bulkDissolveCount }, (_, index) =>
    makeArcane(`bulk_dissolve_${String(index).padStart(3, "0")}`, `Bulk Dissolve ${index}`, 100),
  ),
];
const bulkDissolveOrders = new Map<string, ArcaneOrder[]>([
  ["bulk_roll_prize", [sellOrder("bulk_roll_prize", 100), sellOrder("bulk_roll_prize", 210, "bulk_roll_prize-r5", 5)]],
  ...bulkDissolveItems
    .filter((item) => item.slug !== "bulk_roll_prize")
    .map((item): [string, ArcaneOrder[]] => [item.slug, [sellOrder(item.slug, 1)]]),
]);
const bulkDissolveAnalysis = analyzeArcaneMarket(bulkDissolveItems, bulkDissolveOrders, new Map(), [
  makePack("bulk_vosfor_roll", [
    { arcaneSlug: "bulk_roll_prize", arcaneName: "Bulk Roll Prize", rarity: "rare", chance: 1 },
  ]),
]);
assert.equal(
  bulkDissolveAnalysis.dissolveRecommendations.length,
  bulkDissolveCount,
  "arcane analysis should preserve every dissolve recommendation instead of truncating to the old 80-row cap",
);
assert.equal(
  bulkDissolveAnalysis.totals.recommendations,
  bulkDissolveCount,
  "dashboard totals should count every preserved dissolve recommendation",
);
assert(
  bulkDissolveAnalysis.dissolveRecommendations.some((entry) => entry.slug === "bulk_dissolve_084"),
  "arcane analysis should keep dissolve candidates beyond the old 80-row cap",
);

console.log("arcane pack EV + dissolve recommendation tests passed");
