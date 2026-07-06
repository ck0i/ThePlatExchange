import type {
  ArcaneDashboardState,
  ArcaneDissolveRecommendation,
  ArcaneItem,
  ArcaneMarketSummary,
  ArcaneOrder,
  ArcanePackDefinition,
  ArcanePackDrop,
  ArcanePackValuation,
  ArcanePackValuationDrop,
  ArcaneRarity,
  ArcaneRankMarket,
  PriceStats,
} from "./types.js";
import { slugify } from "./opportunities.js";

export const ARCANE_PACK_COST_VOSFOR = 200;
export const ARCANE_PACK_REWARD_COUNT = 3;
export const ARCANE_PACK_CREDIT_COST = 50_000;
export const ARCANE_PACK_SOURCE_URL = "https://wiki.warframe.com/w/Loid_(Original)#Arcane_Dissolution";
export const ARCANE_DISSOLUTION_SOURCE_URL = "https://wiki.warframe.com/w/Module:Arcane/data";

const PACK_PRICE_RANK = 0;
const PACK_PRICE_STAT: keyof Pick<PriceStats, "p25" | "median" | "min"> = "p25";

type PackPoolBlueprint = {
  rarity: Exclude<ArcaneRarity, "unknown">;
  chance: number;
  names: string[];
};

type PackBlueprint = {
  id: string;
  name: string;
  source: string;
  pools: PackPoolBlueprint[];
};

export interface ParsedArcaneWikiEntry {
  slug: string;
  name: string;
  rarity?: ArcaneRarity;
  type?: string;
  imageName?: string;
  iconName?: string;
  dissolutionVosfor?: number;
  cannotDissolve?: boolean;
}

const PACK_BLUEPRINTS: PackBlueprint[] = [
  {
    id: "cavia",
    name: "Cavia",
    source: ARCANE_PACK_SOURCE_URL,
    pools: [
      { rarity: "uncommon", chance: 0.45, names: ["Melee Fortification", "Melee Retaliation"] },
      { rarity: "rare", chance: 0.50, names: ["Arcane Battery", "Arcane Ice Storm", "Melee Afflictions", "Melee Animosity", "Melee Exposure", "Melee Influence", "Melee Vortex", "Secondary Fortifier", "Secondary Surge"] },
      { rarity: "legendary", chance: 0.05, names: ["Melee Crescendo", "Melee Duplicate"] },
    ],
  },
  {
    id: "duviri",
    name: "Duviri",
    source: ARCANE_PACK_SOURCE_URL,
    pools: [
      { rarity: "uncommon", chance: 0.45, names: ["Arcane Intention", "Magus Aggress"] },
      { rarity: "rare", chance: 0.50, names: ["Arcane Power Ramp", "Primary Blight", "Primary Exhilarate", "Primary Obstruct", "Shotgun Vendetta", "Akimbo Slip Shot", "Secondary Outburst"] },
      { rarity: "legendary", chance: 0.05, names: ["Arcane Reaper", "Longbow Sharpshot", "Secondary Shiver"] },
    ],
  },
  {
    id: "eidolon",
    name: "Eidolon",
    source: ARCANE_PACK_SOURCE_URL,
    pools: [
      { rarity: "common", chance: 0.40, names: ["Arcane Consequence", "Arcane Ice", "Arcane Momentum", "Arcane Nullifier", "Arcane Tempo", "Arcane Warmth"] },
      { rarity: "uncommon", chance: 0.35, names: ["Arcane Acceleration", "Arcane Agility", "Arcane Awakening", "Arcane Deflection", "Arcane Eruption", "Arcane Guardian", "Arcane Healing", "Arcane Phantasm", "Arcane Resistance", "Arcane Strike", "Arcane Trickery", "Arcane Velocity", "Arcane Victory"] },
      { rarity: "rare", chance: 0.20, names: ["Arcane Aegis", "Arcane Arachne", "Arcane Avenger", "Arcane Fury", "Arcane Precision", "Arcane Pulse", "Arcane Rage", "Arcane Ultimatum"] },
      { rarity: "legendary", chance: 0.05, names: ["Arcane Barrier", "Arcane Energize", "Arcane Grace"] },
    ],
  },
  {
    id: "holdfasts",
    name: "Holdfasts",
    source: ARCANE_PACK_SOURCE_URL,
    pools: [
      { rarity: "rare", chance: 1, names: ["Arcane Blessing", "Arcane Rise", "Molt Augmented", "Molt Efficiency", "Molt Reconstruct", "Molt Vigor", "Fractalized Reset", "Primary Frostbite", "Cascadia Accuracy", "Cascadia Empowered", "Cascadia Flare", "Cascadia Overcharge", "Conjunction Voltage", "Emergence Dissipate", "Emergence Renewed", "Emergence Savior", "Eternal Eradicate", "Eternal Logistics", "Eternal Onslaught"] },
    ],
  },
  {
    id: "hollvania",
    name: "Höllvania",
    source: ARCANE_PACK_SOURCE_URL,
    pools: [
      { rarity: "rare", chance: 0.95, names: ["Arcane Bellicose", "Arcane Camisado", "Arcane Crepuscular", "Arcane Impetus", "Arcane Truculence", "Melee Doughty", "Primary Crux", "Secondary Enervate"] },
      { rarity: "legendary", chance: 0.05, names: ["Arcane Escapist", "Arcane Hot Shot", "Arcane Universal Fallout"] },
    ],
  },
  {
    id: "necralisk",
    name: "Necralisk",
    source: ARCANE_PACK_SOURCE_URL,
    pools: [
      { rarity: "rare", chance: 1, names: ["Arcane Double Back", "Arcane Steadfast", "Theorem Contagion", "Theorem Demulcent", "Theorem Infection", "Primary Plated Round", "Secondary Encumber", "Secondary Kinship", "Residual Boils", "Residual Malodor", "Residual Shock", "Residual Viremia"] },
    ],
  },
  {
    id: "ostron",
    name: "Ostron",
    source: ARCANE_PACK_SOURCE_URL,
    pools: [
      { rarity: "common", chance: 0.60, names: ["Magus Husk", "Magus Vigor", "Virtuos Null", "Virtuos Tempo"] },
      { rarity: "uncommon", chance: 0.30, names: ["Exodia Triumph", "Exodia Valor", "Magus Cadence", "Magus Cloud", "Magus Replenish", "Virtuos Fury", "Virtuos Strike"] },
      { rarity: "rare", chance: 0.10, names: ["Exodia Brave", "Exodia Force", "Exodia Hunt", "Exodia Might", "Magus Elevate", "Magus Nourish", "Virtuos Ghost", "Virtuos Shadow"] },
    ],
  },
  {
    id: "solaris",
    name: "Solaris",
    source: ARCANE_PACK_SOURCE_URL,
    pools: [
      { rarity: "common", chance: 0.60, names: ["Magus Accelerant", "Magus Anomaly", "Magus Drive", "Magus Firewall", "Magus Overload", "Virtuos Spike", "Virtuos Surge"] },
      { rarity: "uncommon", chance: 0.30, names: ["Magus Glitch", "Magus Repair", "Virtuos Forge", "Virtuos Trojan"] },
      { rarity: "rare", chance: 0.10, names: ["Pax Bolt", "Pax Charge", "Pax Seeker", "Pax Soar", "Magus Destruct", "Magus Lockdown", "Magus Melt", "Magus Revert"] },
    ],
  },
  {
    id: "steel",
    name: "Steel",
    source: ARCANE_PACK_SOURCE_URL,
    pools: [
      { rarity: "rare", chance: 1, names: ["Arcane Blade Charger", "Arcane Bodyguard", "Arcane Pistoleer", "Arcane Primary Charger", "Arcane Tanker", "Primary Deadhead", "Primary Dexterity", "Primary Merciless", "Secondary Deadhead", "Secondary Dexterity", "Secondary Merciless"] },
    ],
  },
];

export function arcanePackDefinitions(): ArcanePackDefinition[] {
  return PACK_BLUEPRINTS.map((pack) => {
    const drops: ArcanePackDrop[] = [];
    for (const pool of pack.pools) {
      const chance = pool.names.length === 0 ? 0 : pool.chance / pool.names.length;
      for (const name of pool.names) {
        drops.push({
          arcaneSlug: slugify(name),
          arcaneName: name,
          rarity: pool.rarity,
          chance: round(chance, 8),
        });
      }
    }
    return {
      id: pack.id,
      name: pack.name,
      costVosfor: ARCANE_PACK_COST_VOSFOR,
      creditCost: ARCANE_PACK_CREDIT_COST,
      rewardsPerPack: ARCANE_PACK_REWARD_COUNT,
      source: pack.source,
      drops,
    };
  });
}

export function analyzeArcaneMarket(
  items: readonly ArcaneItem[],
  ordersByArcane: ReadonlyMap<string, readonly ArcaneOrder[]>,
  scannedAtByArcane: ReadonlyMap<string, string> = new Map(),
  packs: readonly ArcanePackDefinition[] = arcanePackDefinitions(),
): ArcaneDashboardState {
  const summaries = items.map((item) => summarizeArcane(item, ordersByArcane.get(item.slug) ?? [], scannedAtByArcane.get(item.slug)));
  const summaryBySlug = new Map(summaries.map((summary) => [summary.slug, summary]));
  const packValuations = evaluateArcanePacks(packs, summaryBySlug);
  const dissolveRecommendations = recommendArcaneDissolutions(summaries, packValuations);
  let orders = 0;
  let itemsWithOrders = 0;
  for (const summary of summaries) {
    orders += summary.listings;
    if (summary.listings > 0) itemsWithOrders += 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    reference: {
      items: items.length,
      packs: packs.length,
      withDissolution: summaries.filter((summary) => summary.dissolutionVosfor !== undefined).length,
    },
    totals: {
      itemsWithOrders,
      orders,
      packs: packValuations.length,
      recommendations: dissolveRecommendations.filter((entry) => entry.action === "dissolve").length,
    },
    summaries: summaries.sort(compareArcaneSummaries),
    packs: packValuations,
    dissolveRecommendations,
    mechanics: {
      packCostVosfor: ARCANE_PACK_COST_VOSFOR,
      rewardsPerPack: ARCANE_PACK_REWARD_COUNT,
      priceRank: PACK_PRICE_RANK,
      priceStatistic: PACK_PRICE_STAT,
      sources: [ARCANE_PACK_SOURCE_URL, ARCANE_DISSOLUTION_SOURCE_URL],
    },
  };
}

export function evaluateArcanePacks(
  packs: readonly ArcanePackDefinition[],
  summaryBySlug: ReadonlyMap<string, ArcaneMarketSummary>,
): ArcanePackValuation[] {
  const valuations = packs.map((pack): ArcanePackValuation => {
    let expectedPlatPerSlot = 0;
    let expectedVosforPerSlot = 0;
    let missingPriceCount = 0;
    let pricedCount = 0;
    const drops = pack.drops.map((drop) => {
      const summary = summaryBySlug.get(drop.arcaneSlug);
      const priceUsed = summary ? packPrice(summary) : null;
      const dissolutionVosfor = summary?.dissolutionVosfor;
      if (priceUsed === null) missingPriceCount += 1;
      else {
        pricedCount += 1;
        expectedPlatPerSlot += drop.chance * priceUsed;
      }
      if (dissolutionVosfor !== undefined) expectedVosforPerSlot += drop.chance * dissolutionVosfor;
      const valuedDrop: ArcanePackValuationDrop = {
        ...drop,
        rank: PACK_PRICE_RANK,
        priceUsed,
        expectedCopies: round(pack.rewardsPerPack * drop.chance, 4),
        expectedPlat: round(pack.rewardsPerPack * drop.chance * (priceUsed ?? 0), 3),
        expectedVosfor: dissolutionVosfor === undefined ? null : round(pack.rewardsPerPack * drop.chance * dissolutionVosfor, 3),
        sourcePrice: priceUsed === null ? "missing" as const : `rank${PACK_PRICE_RANK}_sell_${PACK_PRICE_STAT}` as const,
      };
      if (dissolutionVosfor !== undefined) valuedDrop.dissolutionVosfor = dissolutionVosfor;
      return valuedDrop;
    });
    const expectedPlat = round(pack.rewardsPerPack * expectedPlatPerSlot, 3);
    const expectedVosforReturn = round(pack.rewardsPerPack * expectedVosforPerSlot, 3);
    const coveragePct = pack.drops.length === 0 ? 0 : pricedCount / pack.drops.length;
    const chanceMass = pack.drops.reduce((sum, drop) => sum + drop.chance, 0);
    const topDrops = drops
      .slice()
      .sort((left, right) => right.expectedPlat - left.expectedPlat)
      .slice(0, 8);
    return {
      packId: pack.id,
      packName: pack.name,
      costVosfor: pack.costVosfor,
      creditCost: pack.creditCost,
      rewardsPerPack: pack.rewardsPerPack,
      expectedPlat,
      expectedPlatPerVosfor: round(expectedPlat / pack.costVosfor, 5),
      expectedVosforReturn,
      netVosforBurn: round(pack.costVosfor - expectedVosforReturn, 3),
      coveragePct: round(coveragePct, 4),
      confidence: round(Math.max(0, Math.min(1, coveragePct * Math.min(1, chanceMass))), 4),
      missingPriceCount,
      pricedDropCount: pricedCount,
      topDrops,
      source: pack.source,
      notes: [
        `EV uses rank-${PACK_PRICE_RANK} ${PACK_PRICE_STAT} sell prices because Vosfor packs award unranked single arcanes.`,
        "Each pack has 3 independent reward slots.",
      ],
    };
  });
  valuations.sort((left, right) => {
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    return right.expectedPlat - left.expectedPlat;
  });
  return valuations;
}

export function recommendArcaneDissolutions(
  summaries: readonly ArcaneMarketSummary[],
  packs: readonly ArcanePackValuation[],
): ArcaneDissolveRecommendation[] {
  const usablePacks = packs.filter((pack) => pack.confidence >= 0.45 && pack.expectedPlatPerVosfor > 0);
  const candidates = usablePacks.length > 0 ? usablePacks : packs.filter((pack) => pack.expectedPlatPerVosfor > 0);
  const bestPack = candidates.reduce<ArcanePackValuation | null>(
    (winner, pack) => !winner || pack.expectedPlatPerVosfor > winner.expectedPlatPerVosfor ? pack : winner,
    null,
  );
  if (!bestPack) return [];
  const recommendations: ArcaneDissolveRecommendation[] = [];
  for (const summary of summaries) {
    if (summary.dissolutionVosfor === undefined) continue;
    const sellPrice = packPrice(summary);
    if (sellPrice === null || sellPrice <= 0) continue;
    const rollValue = round(summary.dissolutionVosfor * bestPack.expectedPlatPerVosfor, 3);
    const sellValuePerVosfor = round(sellPrice / summary.dissolutionVosfor, 5);
    const deltaPlat = round(rollValue - sellPrice, 3);
    const action: ArcaneDissolveRecommendation["action"] = deltaPlat > Math.max(2, sellPrice * 0.12) && bestPack.confidence >= 0.45
      ? "dissolve"
      : deltaPlat < -Math.max(2, sellPrice * 0.10)
      ? "sell"
      : "hold";
    const reasons = [
      `rank-${PACK_PRICE_RANK} ${PACK_PRICE_STAT} sell: ${round(sellPrice, 2)}p`,
      `${summary.dissolutionVosfor} Vosfor × ${bestPack.packName} EV ${bestPack.expectedPlatPerVosfor}p/Vosfor = ${rollValue}p`,
    ];
    if (action === "dissolve") reasons.push("Dissolution EV clears the sell price by the safety margin.");
    else if (action === "sell") reasons.push("Current rank-0 sale value beats Vosfor EV.");
    else reasons.push("Sell and dissolve values are too close; avoid forced churn.");
    const recommendation: ArcaneDissolveRecommendation = {
      slug: summary.slug,
      name: summary.name,
      rank: PACK_PRICE_RANK,
      sellPrice: round(sellPrice, 2),
      dissolutionVosfor: summary.dissolutionVosfor,
      bestPackId: bestPack.packId,
      bestPackName: bestPack.packName,
      estimatedRollValue: rollValue,
      sellValuePerVosfor,
      rollValuePerVosfor: bestPack.expectedPlatPerVosfor,
      deltaPlat,
      action,
      confidence: bestPack.confidence,
      reasons,
      url: summary.url,
    };
    if (summary.imageName) recommendation.imageName = summary.imageName;
    recommendations.push(recommendation);
  }
  recommendations.sort((left, right) => {
    const actionRank = actionPriority(right.action) - actionPriority(left.action);
    if (actionRank !== 0) return actionRank;
    return right.deltaPlat - left.deltaPlat;
  });
  return recommendations.slice(0, 80);
}

export function mergeArcaneWikiData(items: readonly ArcaneItem[], wikiEntries: ReadonlyMap<string, ParsedArcaneWikiEntry>): ArcaneItem[] {
  return items.map((item) => {
    const wiki = wikiEntries.get(item.slug) ?? wikiEntries.get(slugify(item.name));
    if (!wiki) return item;
    return {
      ...item,
      rarity: item.rarity === "unknown" && wiki.rarity ? wiki.rarity : item.rarity,
      ...(wiki.dissolutionVosfor !== undefined ? { dissolutionVosfor: wiki.dissolutionVosfor } : {}),
      ...(wiki.cannotDissolve ? { cannotDissolve: true } : {}),
      ...(item.imageName ? {} : wiki.imageName ? { imageName: wiki.imageName } : {}),
    };
  });
}

export function parseArcaneWikiData(raw: string): Map<string, ParsedArcaneWikiEntry> {
  const entries = new Map<string, ParsedArcaneWikiEntry>();
  for (const { name, body } of extractLuaArcaneEntries(raw)) {
    const slug = slugify(name);
    const rarityRaw = parseLuaStringField(body, "Rarity");
    const rarity = parseRarity(rarityRaw);
    const dissolutionRaw = parseLuaNumberOrFalseField(body, "Dissolution");
    const imageName = parseLuaStringField(body, "Image");
    const iconName = parseLuaStringField(body, "Icon");
    const type = parseLuaStringField(body, "Type");
    const entry: ParsedArcaneWikiEntry = { slug, name };
    if (rarity) entry.rarity = rarity;
    if (type) entry.type = type;
    if (imageName) entry.imageName = imageName;
    if (iconName) entry.iconName = iconName;
    if (dissolutionRaw === false) entry.cannotDissolve = true;
    else if (typeof dissolutionRaw === "number") entry.dissolutionVosfor = dissolutionRaw;
    entries.set(slug, entry);
  }
  return entries;
}

function summarizeArcane(item: ArcaneItem, orders: readonly ArcaneOrder[], scannedAt: string | undefined): ArcaneMarketSummary {
  const visible = orders.filter((order) => order.visible && order.unitPrice > 0);
  const sell = visible.filter((order) => order.type === "sell");
  const buy = visible.filter((order) => order.type === "buy");
  const rank0 = rankMarket(0, visible);
  const rankMax = item.maxRank > 0 ? rankMarket(item.maxRank, visible) : undefined;
  const summary: ArcaneMarketSummary = {
    slug: item.slug,
    name: item.name,
    rarity: item.rarity,
    maxRank: item.maxRank,
    listings: visible.length,
    sellListings: sell.length,
    buyListings: buy.length,
    onlineSellListings: sell.filter(isLiveOrder).length,
    onlineBuyListings: buy.filter(isLiveOrder).length,
    rank0,
    url: `https://warframe.market/items/${encodeURIComponent(item.slug)}`,
  };
  if (rankMax) summary.rankMax = rankMax;
  if (item.dissolutionVosfor !== undefined) summary.dissolutionVosfor = item.dissolutionVosfor;
  if (item.icon) summary.icon = item.icon;
  if (item.thumb) summary.thumb = item.thumb;
  if (item.imageName) summary.imageName = item.imageName;
  if (scannedAt) summary.lastScannedAt = scannedAt;
  const price = packPrice(summary);
  if (price !== null && item.dissolutionVosfor !== undefined) {
    summary.priceVsVosfor = {
      rank: PACK_PRICE_RANK,
      sellPrice: round(price, 2),
      platinumPerVosfor: round(price / item.dissolutionVosfor, 5),
    };
  }
  return summary;
}

function rankMarket(rank: number, orders: readonly ArcaneOrder[]): ArcaneRankMarket {
  const rankOrders = orders.filter((order) => order.rank === rank);
  const sell = rankOrders.filter((order) => order.type === "sell");
  const buy = rankOrders.filter((order) => order.type === "buy");
  const liveSell = sell.filter(isLiveOrder);
  const liveBuy = buy.filter(isLiveOrder);
  const sellPrices = liveSell.map((order) => order.unitPrice).sort((a, b) => a - b);
  const buyPrices = liveBuy.map((order) => order.unitPrice).sort((a, b) => a - b);
  return {
    rank,
    sell: priceStats(sellPrices),
    buy: priceStats(buyPrices),
    sellOrderCount: sell.length,
    buyOrderCount: buy.length,
    onlineSellOrderCount: liveSell.length,
    onlineBuyOrderCount: liveBuy.length,
    totalSellQuantity: sell.reduce((sum, order) => sum + Math.max(1, order.quantity), 0),
    totalBuyQuantity: buy.reduce((sum, order) => sum + Math.max(1, order.quantity), 0),
  };
}

function packPrice(summary: ArcaneMarketSummary): number | null {
  const stats = summary.rank0.sell;
  if (!stats || stats.count === 0) return null;
  const value = stats[PACK_PRICE_STAT];
  return Number.isFinite(value) && value > 0 ? value : stats.min > 0 ? stats.min : null;
}

function priceStats(sortedPrices: readonly number[]): PriceStats | null {
  if (sortedPrices.length === 0) return null;
  return {
    count: sortedPrices.length,
    min: sortedPrices[0] ?? 0,
    p25: percentile(sortedPrices, 0.25),
    median: percentile(sortedPrices, 0.5),
    p75: percentile(sortedPrices, 0.75),
    p90: percentile(sortedPrices, 0.9),
    max: sortedPrices[sortedPrices.length - 1] ?? 0,
  };
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const idx = Math.max(0, Math.min(1, fraction)) * (sortedValues.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const lo = sortedValues[lower] ?? 0;
  const hi = sortedValues[upper] ?? lo;
  return round(lo + (hi - lo) * (idx - lower), 2);
}

function isLiveOrder(order: ArcaneOrder): boolean {
  return order.user.status === "ingame" || order.user.status === "online";
}

function compareArcaneSummaries(left: ArcaneMarketSummary, right: ArcaneMarketSummary): number {
  const leftPrice = packPrice(left) ?? -1;
  const rightPrice = packPrice(right) ?? -1;
  if (leftPrice !== rightPrice) return rightPrice - leftPrice;
  if (left.onlineSellListings !== right.onlineSellListings) return right.onlineSellListings - left.onlineSellListings;
  return left.name.localeCompare(right.name);
}

function actionPriority(action: ArcaneDissolveRecommendation["action"]): number {
  if (action === "dissolve") return 3;
  if (action === "hold") return 2;
  return 1;
}

function parseRarity(value: string | undefined): ArcaneRarity | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "common" || normalized === "uncommon" || normalized === "rare" || normalized === "legendary") return normalized;
  return undefined;
}

function parseLuaStringField(body: string, field: string): string | undefined {
  const match = new RegExp(`${field}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(body);
  return match?.[1]?.replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\"/g, "\"");
}

function parseLuaNumberOrFalseField(body: string, field: string): number | false | undefined {
  const falseMatch = new RegExp(`${field}\\s*=\\s*false`).exec(body);
  if (falseMatch) return false;
  const numberMatch = new RegExp(`${field}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)`).exec(body);
  if (!numberMatch?.[1]) return undefined;
  const parsed = Number(numberMatch[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractLuaArcaneEntries(raw: string): Array<{ name: string; body: string }> {
  const entries: Array<{ name: string; body: string }> = [];
  let cursor = raw.indexOf("Arcanes");
  if (cursor < 0) cursor = 0;
  while (cursor < raw.length) {
    const nameStart = raw.indexOf('["', cursor);
    if (nameStart < 0) break;
    const nameEnd = raw.indexOf('"]', nameStart + 2);
    if (nameEnd < 0) break;
    const name = raw.slice(nameStart + 2, nameEnd);
    const open = raw.indexOf("{", nameEnd);
    if (open < 0) break;
    const close = findMatchingBrace(raw, open);
    if (close < 0) break;
    entries.push({ name, body: raw.slice(open + 1, close) });
    cursor = close + 1;
  }
  return entries;
}

function findMatchingBrace(value: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let i = openIndex; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
