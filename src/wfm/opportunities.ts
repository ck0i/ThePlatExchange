import type { AuctionAttribute, Opportunity, PriceStats, RivenAuction, RivenWeapon, SellerStatus, TraderConfig, WeaponSummary } from "./types.js";

export const DEFAULT_CONFIG: TraderConfig = {
  watchlist: [],
  minProfit: 25,
  minRoi: 0.35,
  minGroupSize: 4,
  minBuyPrice: null,
  maxBuyPrice: null,
  maxSellPrice: null,
  statuses: ["ingame", "online"],
  maxResults: 75,
  scanAllWhenWatchlistEmpty: true,
};

const HIGH_DEMAND_POSITIVES: Record<string, true> = {
  "base_damage_/_melee_damage": true,
  critical_chance: true,
  critical_damage: true,
  multishot: true,
  toxin_damage: true,
  cold_damage: true,
  electric_damage: true,
  heat_damage: true,
  status_chance: true,
  status_duration: true,
  attack_speed: true,
  "fire_rate_/_attack_speed": true,
  range: true,
  initial_combo: true,
  combo_duration: true,
};

const LOW_PAIN_NEGATIVES: Record<string, true> = {
  damage_vs_corpus: true,
  damage_vs_grineer: true,
  damage_vs_infested: true,
  zoom: true,
  weapon_recoil: true,
  ammo_maximum: true,
  projectile_speed: true,
};

export interface MarketAnalysis {
  opportunities: Opportunity[];
  weaponSummaries: WeaponSummary[];
}

export function normalizeConfig(input: Partial<TraderConfig> = {}): TraderConfig {
  const statuses = (input.statuses ?? DEFAULT_CONFIG.statuses).filter(isKnownStatus);
  const minBuyPrice = input.minBuyPrice === null || input.minBuyPrice === undefined ? null : Math.max(0, input.minBuyPrice);
  const maxBuyPrice = input.maxBuyPrice === null || input.maxBuyPrice === undefined ? null : Math.max(0, input.maxBuyPrice);
  const maxSellPrice = input.maxSellPrice === null || input.maxSellPrice === undefined ? null : Math.max(0, input.maxSellPrice);
  return {
    watchlist: uniqueSlugs(input.watchlist ?? DEFAULT_CONFIG.watchlist),
    minProfit: Math.max(0, input.minProfit ?? DEFAULT_CONFIG.minProfit),
    minRoi: Math.max(0, input.minRoi ?? DEFAULT_CONFIG.minRoi),
    minGroupSize: Math.max(2, Math.floor(input.minGroupSize ?? DEFAULT_CONFIG.minGroupSize)),
    minBuyPrice,
    maxBuyPrice,
    maxSellPrice,
    statuses: statuses.length > 0 ? statuses : DEFAULT_CONFIG.statuses,
    maxResults: Math.max(1, Math.floor(input.maxResults ?? DEFAULT_CONFIG.maxResults)),
    scanAllWhenWatchlistEmpty: input.scanAllWhenWatchlistEmpty ?? DEFAULT_CONFIG.scanAllWhenWatchlistEmpty,
  };
}

export function analyzeMarket(
  weapons: RivenWeapon[],
  auctionsByWeapon: ReadonlyMap<string, RivenAuction[]>,
  configInput: Partial<TraderConfig> = {},
  scannedAtByWeapon: ReadonlyMap<string, string> = new Map(),
): MarketAnalysis {
  const config = normalizeConfig(configInput);
  const weaponBySlug = new Map(weapons.map((weapon) => [weapon.slug, weapon]));
  const targets = resolveTargetWeapons(weapons, config);
  const opportunities: Opportunity[] = [];
  const weaponSummaries: WeaponSummary[] = [];

  for (const weapon of targets) {
    const allAuctions = auctionsByWeapon.get(weapon.slug) ?? [];
    const directAuctions = allAuctions.filter(isTradableDirectListing);
    const actionableAuctions = directAuctions.filter((auction) => config.statuses.includes(auction.owner.status));
    const directPrices = directAuctions.map((auction) => auction.buyoutPrice).filter((price) => price > 0).sort((left, right) => left - right);
    const summary: WeaponSummary = {
      slug: weapon.slug,
      name: weapon.name,
      group: weapon.group,
      disposition: weapon.disposition,
      listings: allAuctions.length,
      directListings: directAuctions.length,
      actionableListings: actionableAuctions.length,
      onlineListings: directAuctions.filter((auction) => auction.owner.status === "ingame" || auction.owner.status === "online").length,
      priceStats: directPrices.length > 0 ? priceStats(directPrices) : null,
    };
    const lastScannedAt = scannedAtByWeapon.get(weapon.slug);
    if (lastScannedAt) summary.lastScannedAt = lastScannedAt;
    weaponSummaries.push(summary);

    if (directPrices.length < config.minGroupSize) continue;

    const groups = groupComparableAuctions(directAuctions);
    for (const auction of actionableAuctions) {
      if (config.minBuyPrice !== null && auction.buyoutPrice < config.minBuyPrice) continue;
      if (config.maxBuyPrice !== null && auction.buyoutPrice > config.maxBuyPrice) continue;
      const signature = attributeSignature(auction.attributes);
      const exactGroup = groups.get(signature) ?? [];
      const groupType: Opportunity["groupType"] = exactGroup.length >= config.minGroupSize ? "exact-stats" : "weapon-market";
      const comparables = groupType === "exact-stats" ? exactGroup : directAuctions;
      if (comparables.length < config.minGroupSize) continue;

      const comparablePrices = comparables.map((entry) => entry.buyoutPrice).filter((price) => price > 0).sort((left, right) => left - right);
      if (comparablePrices.length < config.minGroupSize) continue;

      const targetSellPrice = Math.round(percentile(comparablePrices, 0.75));
      if (config.maxSellPrice !== null && targetSellPrice > config.maxSellPrice) continue;
      const conservativeSellPrice = Math.round(percentile(comparablePrices, 0.5));
      const expectedProfit = targetSellPrice - auction.buyoutPrice;
      const roi = expectedProfit / auction.buyoutPrice;
      if (expectedProfit < config.minProfit || roi < config.minRoi) continue;

      const positives = auction.attributes.filter((attribute) => attribute.positive).map((attribute) => attribute.urlName).sort();
      const negatives = auction.attributes.filter((attribute) => !attribute.positive).map((attribute) => attribute.urlName).sort();
      const confidence = confidenceScore(auction, comparables.length, groupType, weapon);
      const statScore = statDemandMultiplier(auction.attributes);
      const score = normalizedOpportunityScore(expectedProfit, roi, confidence, comparables.length, statScore);
      const opportunity: Opportunity = {
        auctionId: auction.id,
        weaponSlug: weapon.slug,
        weaponName: weaponBySlug.get(weapon.slug)?.name ?? weapon.name,
        rivenName: auction.name,
        buyPrice: auction.buyoutPrice,
        targetSellPrice,
        conservativeSellPrice,
        expectedProfit,
        roi: rounded(roi, 3),
        buyToSellRatio: rounded(targetSellPrice / auction.buyoutPrice, 3),
        confidence: rounded(confidence, 3),
        score,
        seller: auction.owner,
        status: auction.owner.status,
        groupType,
        comparableListings: comparables.length,
        pricePercentile: rounded(pricePercentile(comparablePrices, auction.buyoutPrice), 3),
        signature,
        positives,
        negatives,
        reasons: opportunityReasons(auction, comparablePrices, groupType, confidence),
        updated: auction.updated,
        url: `https://warframe.market/auctions/search?type=riven&weapon_url_name=${encodeURIComponent(weapon.slug)}&sort_by=price_asc`,
      };
      opportunities.push(opportunity);
    }
  }

  opportunities.sort((left, right) => right.expectedProfit - left.expectedProfit || right.score - left.score || right.roi - left.roi);
  weaponSummaries.sort((left, right) => (right.priceStats?.p75 ?? 0) - (left.priceStats?.p75 ?? 0));

  return {
    opportunities: opportunities.slice(0, config.maxResults),
    weaponSummaries,
  };
}

export function attributeSignature(attributes: AuctionAttribute[]): string {
  const positives = attributes.filter((attribute) => attribute.positive).map((attribute) => attribute.urlName).sort();
  const negatives = attributes.filter((attribute) => !attribute.positive).map((attribute) => attribute.urlName).sort();
  return `+${positives.join("+")}|-${negatives.join("-")}`;
}

export function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const clamped = Math.min(1, Math.max(0, fraction));
  const index = clamped * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function uniqueSlugs(values: string[]): string[] {
  return [...new Set(values.map(slugify).filter((value) => value.length > 0))];
}

function isKnownStatus(value: SellerStatus): value is SellerStatus {
  return value === "ingame" || value === "online" || value === "offline" || value === "unknown";
}

function resolveTargetWeapons(weapons: RivenWeapon[], config: TraderConfig): RivenWeapon[] {
  if (config.watchlist.length === 0) {
    return config.scanAllWhenWatchlistEmpty ? weapons : [];
  }
  const matches = new Map<string, RivenWeapon>();
  for (const entry of config.watchlist) {
    for (const weapon of weapons) {
      const weaponNameSlug = slugify(weapon.name);
      if (weapon.slug === entry || weaponNameSlug === entry || weapon.slug.includes(entry) || weaponNameSlug.includes(entry)) {
        matches.set(weapon.slug, weapon);
      }
    }
  }
  return [...matches.values()];
}

function isTradableDirectListing(auction: RivenAuction): boolean {
  return auction.visible && !auction.closed && auction.isDirectSell && auction.buyoutPrice > 0;
}

function groupComparableAuctions(auctions: RivenAuction[]): Map<string, RivenAuction[]> {
  const groups = new Map<string, RivenAuction[]>();
  for (const auction of auctions) {
    const signature = attributeSignature(auction.attributes);
    const existing = groups.get(signature);
    if (existing) existing.push(auction);
    else groups.set(signature, [auction]);
  }
  return groups;
}

function priceStats(sortedPrices: number[]): PriceStats {
  const min = sortedPrices[0] ?? 0;
  const max = sortedPrices[sortedPrices.length - 1] ?? min;
  return {
    count: sortedPrices.length,
    min,
    p25: Math.round(percentile(sortedPrices, 0.25)),
    median: Math.round(percentile(sortedPrices, 0.5)),
    p75: Math.round(percentile(sortedPrices, 0.75)),
    p90: Math.round(percentile(sortedPrices, 0.9)),
    max,
  };
}

function pricePercentile(sortedPrices: number[], price: number): number {
  const cheaperOrEqual = sortedPrices.filter((entry) => entry <= price).length;
  return sortedPrices.length === 0 ? 1 : cheaperOrEqual / sortedPrices.length;
}

function confidenceScore(auction: RivenAuction, comparableCount: number, groupType: Opportunity["groupType"], weapon: RivenWeapon): number {
  const liquidity = Math.min(1, Math.log2(comparableCount + 1) / 4);
  const status = auction.owner.status === "ingame" ? 1 : auction.owner.status === "online" ? 0.82 : 0.35;
  const exactness = groupType === "exact-stats" ? 1 : 0.72;
  const daysOld = (Date.now() - Date.parse(auction.updated || auction.created)) / 86_400_000;
  const recency = Number.isFinite(daysOld) ? (daysOld <= 3 ? 1 : daysOld <= 21 ? 0.82 : daysOld <= 60 ? 0.62 : 0.42) : 0.55;
  const dispositionPenalty = Math.min(1.08, Math.max(0.84, 1.1 - weapon.disposition * 0.09));
  return Math.min(1, Math.max(0.05, liquidity * 0.3 + status * 0.25 + exactness * 0.2 + recency * 0.15 + dispositionPenalty * 0.1));
}

function statDemandMultiplier(attributes: AuctionAttribute[]): number {
  let score = 1;
  for (const attribute of attributes) {
    if (attribute.positive && HIGH_DEMAND_POSITIVES[attribute.urlName]) score += 0.08;
    if (!attribute.positive && LOW_PAIN_NEGATIVES[attribute.urlName]) score += 0.05;
    if (!attribute.positive && HIGH_DEMAND_POSITIVES[attribute.urlName]) score -= 0.18;
  }
  return Math.min(1.35, Math.max(0.65, score));
}

function opportunityReasons(auction: RivenAuction, comparablePrices: number[], groupType: Opportunity["groupType"], confidence: number): string[] {
  const median = Math.round(percentile(comparablePrices, 0.5));
  const p75 = Math.round(percentile(comparablePrices, 0.75));
  const reasons = [
    groupType === "exact-stats" ? "same stat signature comparables" : "weapon-market comparable fallback",
    `buy ${auction.buyoutPrice}p vs median ${median}p / p75 ${p75}p`,
    `seller ${auction.owner.status}`,
  ];
  const lowest = comparablePrices[0] ?? auction.buyoutPrice;
  if (auction.buyoutPrice <= lowest) reasons.push("lowest visible direct listing");
  if (confidence >= 0.75) reasons.push("strong liquidity and recency");
  return reasons;
}

function normalizedOpportunityScore(expectedProfit: number, roi: number, confidence: number, comparableCount: number, statMultiplier: number): number {
  const profitSignal = Math.min(1, expectedProfit / 500);
  const roiSignal = Math.min(1, roi / 2);
  const liquiditySignal = Math.min(1, Math.log2(comparableCount + 1) / 5);
  const statSignal = Math.min(1.15, Math.max(0.75, statMultiplier));
  const raw = 100 * (0.4 * profitSignal + 0.25 * roiSignal + 0.2 * confidence + 0.15 * liquiditySignal) * statSignal;
  return rounded(Math.min(100, Math.max(0, raw)), 1);
}

function rounded(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
