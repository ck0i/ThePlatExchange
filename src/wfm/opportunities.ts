import type { AuctionAttribute, InstantWin, InstantWinBasis, InstantWinSignatureValue, Opportunity, PriceStats, RivenAuction, RivenWeapon, SellerStatus, TraderConfig, WeaponMarketIntel, WeaponSummary } from "./types.js";

export const DEFAULT_CONFIG: TraderConfig = {
  watchlist: [],
  minProfit: 25,
  minRoi: 0.2,
  minGroupSize: 3,
  minBuyPrice: null,
  maxBuyPrice: null,
  maxSellPrice: null,
  statuses: ["ingame", "online"],
  maxResults: 500,
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

const INSTANT_WIN_LIMIT = 500;
const INSTANT_MIN_PEERS = 3;
const MARKET_FLOOR_MIN_PEERS = 8;
const SAME_SIGNATURE_DISCOUNT = 0.10;
const MARKET_FLOOR_DISCOUNT = 0.25;
const HIGH_SIDE_OUTLIER_MIN_BOOK = 3;
const HIGH_SIDE_OUTLIER_MIN_BASELINE = 2;
const HIGH_SIDE_OUTLIER_MAX_TAIL_FRACTION = 0.4;
const HIGH_SIDE_OUTLIER_MIN_MEDIAN_RATIO = 10;
const HIGH_SIDE_OUTLIER_IQR_MULTIPLIER = 8;
export const MAX_REASONABLE_ROI = 17.5;

export interface MarketAnalysis {
  opportunities: Opportunity[];
  instantWins: InstantWin[];
  weaponSummaries: WeaponSummary[];
}

export interface WeaponMarketIntelInput {
  disposition: number;
  directListings: number;
  actionableListings: number;
  onlineListings: number;
  priceStats: PriceStats | null;
}

interface ValueEstimate {
  groupType: Opportunity["groupType"];
  comparablePrices: number[];
  targetSellPrice: number;
  conservativeSellPrice: number;
  comparableListings: number;
  basisReason: string;
}

interface MarketIntelInput {
  weapon: RivenWeapon;
  directListings: number;
  actionableListings: number;
  onlineListings: number;
  ingameListings: number;
  priceStats: PriceStats | null;
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
  const targets = resolveTargetWeapons(weapons, config);
  const opportunities: Opportunity[] = [];
  const instantWins: InstantWin[] = [];
  const weaponSummaries: WeaponSummary[] = [];
  const summariesBySlug = new Map<string, WeaponSummary>();

  for (const weapon of targets) {
    const allAuctions = auctionsByWeapon.get(weapon.slug) ?? [];
    const rawDirectAuctions = allAuctions.filter(isTradableDirectListing);
    const directAuctions = filterHighSideOutlierAuctions(rawDirectAuctions);
    const actionableAuctions = directAuctions.filter((auction) => config.statuses.includes(auction.owner.status));
    const directPrices = sortedBuyoutPrices(directAuctions);
    const directStats = directPrices.length > 0 ? priceStats(directPrices) : null;
    const onlineListings = directAuctions.filter((auction) => auction.owner.status === "ingame" || auction.owner.status === "online").length;
    const ingameListings = directAuctions.filter((auction) => auction.owner.status === "ingame").length;
    const summary: WeaponSummary = {
      slug: weapon.slug,
      name: weapon.name,
      group: weapon.group,
      disposition: weapon.disposition,
      listings: allAuctions.length,
      directListings: directAuctions.length,
      actionableListings: actionableAuctions.length,
      onlineListings,
      priceStats: directStats,
    };
    if (weapon.imageName) summary.imageName = weapon.imageName;
    const lastScannedAt = scannedAtByWeapon.get(weapon.slug);
    if (lastScannedAt) summary.lastScannedAt = lastScannedAt;
    summary.marketIntel = buildWeaponMarketIntel({
      weapon,
      directListings: directAuctions.length,
      actionableListings: actionableAuctions.length,
      onlineListings,
      ingameListings,
      priceStats: directStats,
    });
    weaponSummaries.push(summary);
    summariesBySlug.set(weapon.slug, summary);

    if (directPrices.length < config.minGroupSize) continue;

    const groups = groupComparableAuctions(directAuctions);
    for (const auction of actionableAuctions) {
      const estimate = estimateAuctionValue(auction, directAuctions, groups, config);
      const opportunity = estimate ? buildOpportunity(weapon, auction, estimate, summary, config) : null;
      if (opportunity) opportunities.push(opportunity);
    }

    instantWins.push(...collectInstantWins(weapon, actionableAuctions, directAuctions, groups, summary, config));
  }

  opportunities.sort(compareOpportunities);
  annotateOpportunityCounts(weaponSummaries, opportunities);
  weaponSummaries.sort(compareWeaponSummaries);
  instantWins.sort(compareInstantWins);

  return {
    opportunities,
    instantWins: instantWins.slice(0, INSTANT_WIN_LIMIT),
    weaponSummaries,
  };
}

export function attributeSignature(attributes: AuctionAttribute[]): string {
  const positives = attributes.filter((attribute) => attribute.positive).map((attribute) => attribute.urlName).sort();
  const negatives = attributes.filter((attribute) => !attribute.positive).map((attribute) => attribute.urlName).sort();
  return `+${positives.join("+")}|-${negatives.join("-")}`;
}

function buildOpportunity(
  weapon: RivenWeapon,
  auction: RivenAuction,
  estimate: ValueEstimate,
  summary: WeaponSummary,
  config: TraderConfig,
): Opportunity | null {
  if (config.minBuyPrice !== null && auction.buyoutPrice < config.minBuyPrice) return null;
  if (config.maxBuyPrice !== null && auction.buyoutPrice > config.maxBuyPrice) return null;
  if (config.maxSellPrice !== null && estimate.targetSellPrice > config.maxSellPrice) return null;

  const expectedProfit = estimate.conservativeSellPrice - auction.buyoutPrice;
  const roi = auction.buyoutPrice > 0 ? expectedProfit / auction.buyoutPrice : 0;
  if (expectedProfit < config.minProfit || roi < config.minRoi || roi > MAX_REASONABLE_ROI) return null;

  const statMultiplier = statDemandMultiplier(auction.attributes);
  const priceRank = pricePercentile(estimate.comparablePrices, auction.buyoutPrice);
  const confidence = confidenceScore(auction, estimate.comparableListings, estimate.groupType, weapon, summary.marketIntel, priceRank, statMultiplier);
  const score = normalizedOpportunityScore(expectedProfit, roi, confidence, estimate.comparableListings, statMultiplier, priceRank, summary.marketIntel);
  return makeOpportunity(weapon, auction, estimate, confidence, score, priceRank, opportunityReasons(auction, estimate, confidence, summary.marketIntel));
}

function makeOpportunity(
  weapon: RivenWeapon,
  auction: RivenAuction,
  estimate: ValueEstimate,
  confidence: number,
  score: number,
  priceRank: number,
  reasons: string[],
): Opportunity {
  const positives = auction.attributes.filter((attribute) => attribute.positive).map((attribute) => attribute.urlName).sort();
  const negatives = auction.attributes.filter((attribute) => !attribute.positive).map((attribute) => attribute.urlName).sort();
  const expectedProfit = estimate.conservativeSellPrice - auction.buyoutPrice;
  const roi = auction.buyoutPrice > 0 ? expectedProfit / auction.buyoutPrice : 0;
  return {
    auctionId: auction.id,
    weaponSlug: weapon.slug,
    weaponName: weapon.name,
    ...(weapon.imageName ? { imageName: weapon.imageName } : {}),
    rivenName: auction.name,
    buyPrice: auction.buyoutPrice,
    targetSellPrice: estimate.targetSellPrice,
    conservativeSellPrice: estimate.conservativeSellPrice,
    expectedProfit,
    roi: rounded(roi, 3),
    buyToSellRatio: rounded(estimate.targetSellPrice / auction.buyoutPrice, 3),
    confidence: rounded(confidence, 3),
    score,
    seller: auction.owner,
    status: auction.owner.status,
    groupType: estimate.groupType,
    comparableListings: estimate.comparableListings,
    pricePercentile: rounded(priceRank, 3),
    signature: attributeSignature(auction.attributes),
    positives,
    negatives,
    reasons,
    updated: auction.updated || auction.created,
    url: `https://warframe.market/auctions/search?type=riven&weapon_url_name=${encodeURIComponent(weapon.slug)}&sort_by=price_asc`,
  };
}

function estimateAuctionValue(
  auction: RivenAuction,
  directAuctions: readonly RivenAuction[],
  groups: ReadonlyMap<string, RivenAuction[]>,
  config: TraderConfig,
): ValueEstimate | null {
  const signature = attributeSignature(auction.attributes);
  const exactPeers = (groups.get(signature) ?? []).filter((entry) => entry.id !== auction.id);
  if (exactPeers.length >= config.minGroupSize) {
    const comparablePrices = comparableBuyoutPrices(exactPeers);
    if (comparablePrices.length >= config.minGroupSize) {
      return {
        groupType: "exact-stats",
        comparablePrices,
        targetSellPrice: Math.round(percentile(comparablePrices, 0.75)),
        conservativeSellPrice: Math.round(percentile(comparablePrices, 0.5)),
        comparableListings: comparablePrices.length,
        basisReason: "same stat signature peers",
      };
    }
  }

  const weaponPeers = directAuctions.filter((entry) => entry.id !== auction.id);
  const comparablePrices = comparableBuyoutPrices(weaponPeers);
  if (comparablePrices.length < config.minGroupSize) return null;
  const statMultiplier = statDemandMultiplier(auction.attributes);
  const conservativeFraction = statMultiplier >= 1.22 ? 0.58 : statMultiplier >= 1.08 ? 0.5 : statMultiplier >= 0.94 ? 0.42 : 0.3;
  const targetFraction = statMultiplier >= 1.22 ? 0.78 : statMultiplier >= 1.08 ? 0.68 : statMultiplier >= 0.94 ? 0.58 : 0.42;
  const statAdjustment = Math.min(1.08, Math.max(0.84, 1 + (statMultiplier - 1) * 0.35));
  const conservativeSellPrice = Math.round(percentile(comparablePrices, conservativeFraction) * statAdjustment);
  const targetSellPrice = Math.max(conservativeSellPrice, Math.round(percentile(comparablePrices, targetFraction) * statAdjustment));
  return {
    groupType: "weapon-market",
    comparablePrices,
    targetSellPrice,
    conservativeSellPrice,
    comparableListings: comparablePrices.length,
    basisReason: statMultiplier >= 1 ? "weapon market adjusted for demanded stats" : "weapon market adjusted down for weak stats",
  };
}

function collectInstantWins(
  weapon: RivenWeapon,
  actionableAuctions: readonly RivenAuction[],
  directAuctions: readonly RivenAuction[],
  groups: ReadonlyMap<string, RivenAuction[]>,
  summary: WeaponSummary,
  config: TraderConfig,
): InstantWin[] {
  const wins = new Map<string, InstantWin>();
  const minProfit = Math.max(10, config.minProfit * 0.5);
  for (const auction of actionableAuctions) {
    const signature = attributeSignature(auction.attributes);
    const exactPeers = (groups.get(signature) ?? []).filter((entry) => entry.id !== auction.id);
    const sameSignature = buildInstantWinCandidate({
      basis: "same-signature",
      source: "live_signature",
      weapon,
      auction,
      peerAuctions: exactPeers,
      summary,
      minPeers: INSTANT_MIN_PEERS,
      minDiscount: SAME_SIGNATURE_DISCOUNT,
      minProfit,
    });
    if (sameSignature) wins.set(auction.id, sameSignature);

    if (sameSignature) continue;
    const marketPeers = directAuctions.filter((entry) => entry.id !== auction.id);
    const marketFloor = buildInstantWinCandidate({
      basis: "market-floor",
      source: "live_weapon_market",
      weapon,
      auction,
      peerAuctions: marketPeers,
      summary,
      minPeers: Math.max(MARKET_FLOOR_MIN_PEERS, config.minGroupSize),
      minDiscount: MARKET_FLOOR_DISCOUNT,
      minProfit,
    });
    if (marketFloor) wins.set(auction.id, marketFloor);
  }
  return [...wins.values()];
}

function buildInstantWinCandidate(input: {
  basis: InstantWinBasis;
  source: InstantWinSignatureValue["source"];
  weapon: RivenWeapon;
  auction: RivenAuction;
  peerAuctions: readonly RivenAuction[];
  summary: WeaponSummary;
  minPeers: number;
  minDiscount: number;
  minProfit: number;
}): InstantWin | null {
  if (input.peerAuctions.length < input.minPeers) return null;
  const statMultiplier = statDemandMultiplier(input.auction.attributes);
  if (input.basis === "market-floor" && statMultiplier < 0.98) return null;

  const peerPrices = comparableBuyoutPrices(input.peerAuctions);
  if (peerPrices.length < input.minPeers) return null;
  const p25 = percentile(peerPrices, 0.25);
  const p50 = input.basis === "same-signature"
    ? percentile(peerPrices, 0.5)
    : Math.max(input.auction.buyoutPrice, estimateMarketFloorExit(peerPrices, statMultiplier));
  const p75 = percentile(peerPrices, 0.75);
  const p90 = percentile(peerPrices, 0.9);
  const discountToP25 = p25 - input.auction.buyoutPrice;
  const discountPct = p25 > 0 ? discountToP25 / p25 : 0;
  const expectedProfit = Math.round(p50 - input.auction.buyoutPrice);
  const roi = input.auction.buyoutPrice > 0 ? expectedProfit / input.auction.buyoutPrice : 0;
  if (discountPct < input.minDiscount || expectedProfit < input.minProfit || roi > MAX_REASONABLE_ROI) return null;
  if (input.basis === "market-floor" && pricePercentile(peerPrices, input.auction.buyoutPrice) > 0.12) return null;

  const confidence = instantWinConfidence(input.auction, peerPrices.length, discountPct, input.basis, input.summary.marketIntel);
  if (confidence < 0.35) return null;
  const estimate: ValueEstimate = {
    groupType: input.basis === "same-signature" ? "exact-stats" : "weapon-market",
    comparablePrices: peerPrices,
    targetSellPrice: Math.max(Math.round(p75), Math.round(p50)),
    conservativeSellPrice: Math.round(p50),
    comparableListings: peerPrices.length,
    basisReason: input.basis === "same-signature" ? "priced below same-signature peer p25" : "priced below weapon-market floor with usable stats",
  };
  const priceRank = pricePercentile(peerPrices, input.auction.buyoutPrice);
  const score = normalizedOpportunityScore(expectedProfit, input.auction.buyoutPrice > 0 ? expectedProfit / input.auction.buyoutPrice : 0, confidence, peerPrices.length, statMultiplier, priceRank, input.summary.marketIntel);
  const opportunity = makeOpportunity(input.weapon, input.auction, estimate, confidence, score, priceRank, instantWinReasons(input.auction, input.basis, p25, p50, peerPrices.length, discountPct));
  const signatureValue: InstantWinSignatureValue = {
    weapon_slug: input.weapon.slug,
    signature: opportunity.signature,
    window_days: 0,
    sample_count: peerPrices.length,
    p25: rounded(p25, 2),
    p50: rounded(p50, 2),
    p75: rounded(p75, 2),
    p90: rounded(p90, 2),
    min: peerPrices[0] ?? null,
    max: peerPrices[peerPrices.length - 1] ?? null,
    last_seen_price: null,
    last_seen_at: input.auction.updated ? Math.floor(Date.parse(input.auction.updated) / 1000) : null,
    confidence: rounded(confidence, 3),
    source: input.source,
    velocity: null,
  };
  return {
    opportunity,
    signature_value: signatureValue,
    expected_uplift: rounded((p50 - input.auction.buyoutPrice) * confidence, 2),
    discount_to_p25: rounded(discountToP25, 2),
    discount_pct: rounded(discountPct, 4),
    basis: input.basis,
    reasons: opportunity.reasons,
  };
}

function estimateMarketFloorExit(peerPrices: readonly number[], statMultiplier: number): number {
  const fraction = statMultiplier >= 1.2 ? 0.5 : statMultiplier >= 1.08 ? 0.42 : 0.35;
  const adjustment = Math.min(1.06, Math.max(0.92, 1 + (statMultiplier - 1) * 0.25));
  return percentile(peerPrices, fraction) * adjustment;
}

function trimOutliers(sortedValues: readonly number[], trimPct: number = 0.05): number[] {
  if (sortedValues.length < 20) return [...sortedValues];
  const drop = Math.max(1, Math.floor(sortedValues.length * trimPct));
  return sortedValues.slice(drop, sortedValues.length - drop);
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

function groupComparableAuctions(auctions: readonly RivenAuction[]): Map<string, RivenAuction[]> {
  const groups = new Map<string, RivenAuction[]>();
  for (const auction of auctions) {
    const signature = attributeSignature(auction.attributes);
    const existing = groups.get(signature);
    if (existing) existing.push(auction);
    else groups.set(signature, [auction]);
  }
  return groups;
}

function sortedBuyoutPrices(auctions: readonly RivenAuction[]): number[] {
  return auctions.map((entry) => entry.buyoutPrice).filter((price) => price > 0).sort((left, right) => left - right);
}

function filterHighSideOutlierAuctions(auctions: readonly RivenAuction[]): RivenAuction[] {
  const cutoff = highSideOutlierCutoff(sortedBuyoutPrices(auctions));
  if (cutoff === null) return [...auctions];
  return auctions.filter((auction) => auction.buyoutPrice <= cutoff);
}

function comparableBuyoutPrices(auctions: readonly RivenAuction[]): number[] {
  const prices = sortedBuyoutPrices(auctions);
  const filteredPrices = filterHighSideOutlierPrices(prices);
  return trimOutliers(filteredPrices);
}

function filterHighSideOutlierPrices(sortedPrices: readonly number[]): number[] {
  const cutoff = highSideOutlierCutoff(sortedPrices);
  if (cutoff === null) return [...sortedPrices];
  return sortedPrices.filter((price) => price <= cutoff);
}

function highSideOutlierCutoff(sortedPrices: readonly number[]): number | null {
  if (sortedPrices.length < HIGH_SIDE_OUTLIER_MIN_BOOK) return null;
  const maxTail = Math.max(1, Math.floor(sortedPrices.length * HIGH_SIDE_OUTLIER_MAX_TAIL_FRACTION));
  let cutoff: number | null = null;
  let strongestMargin = 1;
  for (let index = HIGH_SIDE_OUTLIER_MIN_BASELINE; index < sortedPrices.length; index += 1) {
    const tailCount = sortedPrices.length - index;
    if (tailCount > maxTail || tailCount > index) continue;
    const lowerPrices = sortedPrices.slice(0, index);
    const upper = sortedPrices[index] ?? 0;
    const median = percentile(lowerPrices, 0.5);
    if (upper <= 0 || median <= 0) continue;
    const p25 = percentile(lowerPrices, 0.25);
    const p75 = percentile(lowerPrices, 0.75);
    const iqrCutoff = p75 + HIGH_SIDE_OUTLIER_IQR_MULTIPLIER * Math.max(0, p75 - p25);
    const ratioCutoff = median * HIGH_SIDE_OUTLIER_MIN_MEDIAN_RATIO;
    const candidateCutoff = Math.max(iqrCutoff, ratioCutoff);
    if (upper <= candidateCutoff) continue;
    const margin = upper / candidateCutoff;
    if (margin > strongestMargin) {
      strongestMargin = margin;
      cutoff = candidateCutoff;
    }
  }
  return cutoff;
}

function priceStats(sortedPrices: readonly number[]): PriceStats {
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

function pricePercentile(sortedPrices: readonly number[], price: number): number {
  if (sortedPrices.length === 0) return 1;
  let cheaperOrEqual = 0;
  for (const entry of sortedPrices) {
    if (entry <= price) cheaperOrEqual += 1;
    else break;
  }
  return cheaperOrEqual / sortedPrices.length;
}

function buildWeaponMarketIntel(input: MarketIntelInput): WeaponMarketIntel {
  return deriveWeaponMarketIntel({
    disposition: input.weapon.disposition,
    directListings: input.directListings,
    actionableListings: input.actionableListings,
    onlineListings: input.onlineListings,
    priceStats: input.priceStats,
  });
}

export function deriveWeaponMarketIntel(input: WeaponMarketIntelInput): WeaponMarketIntel {
  const stats = input.priceStats;
  const direct = input.directListings;
  const actionableRatio = direct > 0 ? input.actionableListings / direct : 0;
  const onlineRatio = direct > 0 ? input.onlineListings / direct : 0;
  const depthScore = clamp(Math.log2(direct + 1) / Math.log2(128), 0, 1);
  const onlineScore = clamp(input.onlineListings / 18, 0, 1);
  const liquidityScore = rounded(0.42 * depthScore + 0.24 * onlineRatio + 0.22 * actionableRatio + 0.12 * onlineScore, 3);
  const spread = stats ? Math.max(0, stats.p75 - stats.p25) : null;
  const spreadPct = stats && stats.median > 0 ? spread! / stats.median : null;
  const floorDiscountPct = stats && stats.median > 0 ? Math.max(0, stats.median - stats.min) / stats.median : null;
  const outlierRisk = stats && stats.median > 0 ? clamp((stats.p90 - stats.median) / stats.median / 2, 0, 1) : 0.5;
  const spreadScore = rounded(clamp((spreadPct ?? 0) / 0.85, 0, 1), 3);
  const floorScore = clamp((floorDiscountPct ?? 0) / 0.65, 0, 1);
  const priceScore = stats ? clamp(Math.log2(stats.median + 1) / Math.log2(1501), 0, 1) : 0;
  const dispositionScore = clamp((input.disposition - 0.5) / 1.0, 0, 1);
  const buyScore = Math.round(100 * (0.3 * floorScore + 0.25 * spreadScore + 0.2 * onlineScore + 0.15 * liquidityScore + 0.1 * actionableRatio));
  const sellScore = Math.round(100 * (0.34 * liquidityScore + 0.22 * onlineScore + 0.2 * priceScore + 0.14 * (1 - outlierRisk) + 0.1 * actionableRatio));
  const farmScore = Math.round(100 * (0.28 * priceScore + 0.22 * liquidityScore + 0.18 * spreadScore + 0.17 * onlineScore + 0.15 * dispositionScore));
  const marketScore = Math.round(100 * (0.28 * liquidityScore + 0.21 * spreadScore + 0.18 * floorScore + 0.16 * onlineScore + 0.1 * priceScore + 0.07 * dispositionScore));
  const demand = input.onlineListings >= 18 && liquidityScore >= 0.6 ? "hot" : input.onlineListings >= 6 && liquidityScore >= 0.38 ? "steady" : input.onlineListings > 0 ? "thin" : "dead";
  const strategy = marketScore < 20 || input.actionableListings === 0 ? "avoid" : buyScore >= sellScore && buyScore >= farmScore ? "buy" : sellScore >= farmScore ? "sell" : "farm";
  const reasons: string[] = [];
  if (stats) reasons.push(`${input.onlineListings} online / ${direct} direct listings`);
  if (spreadPct !== null) reasons.push(`${Math.round(spreadPct * 100)}% p25→p75 spread`);
  if (floorDiscountPct !== null) reasons.push(`${Math.round(floorDiscountPct * 100)}% floor-to-median gap`);
  if (input.disposition >= 1.1) reasons.push(`high ${input.disposition.toFixed(2)} disposition`);
  if (demand === "dead") reasons.push("no online direct sellers");
  return {
    liquidityScore,
    spreadScore,
    buyScore,
    sellScore,
    farmScore,
    marketScore,
    demand,
    strategy,
    spread,
    spreadPct: spreadPct === null ? null : rounded(spreadPct, 4),
    floorDiscountPct: floorDiscountPct === null ? null : rounded(floorDiscountPct, 4),
    actionableRatio: rounded(actionableRatio, 4),
    onlineRatio: rounded(onlineRatio, 4),
    opportunityCount: 0,
    bestOpportunityProfit: null,
    bestOpportunityScore: null,
    reasons,
  };
}

function annotateOpportunityCounts(summaries: WeaponSummary[], opportunities: readonly Opportunity[]): void {
  const counts = new Map<string, { count: number; profit: number; score: number }>();
  for (const opportunity of opportunities) {
    const existing = counts.get(opportunity.weaponSlug) ?? { count: 0, profit: Number.NEGATIVE_INFINITY, score: Number.NEGATIVE_INFINITY };
    existing.count += 1;
    if (opportunity.expectedProfit > existing.profit) existing.profit = opportunity.expectedProfit;
    if (opportunity.score > existing.score) existing.score = opportunity.score;
    counts.set(opportunity.weaponSlug, existing);
  }
  for (const summary of summaries) {
    if (!summary.marketIntel) continue;
    const hit = counts.get(summary.slug);
    if (!hit) continue;
    summary.marketIntel = {
      ...summary.marketIntel,
      opportunityCount: hit.count,
      bestOpportunityProfit: hit.profit,
      bestOpportunityScore: hit.score,
      marketScore: Math.min(100, summary.marketIntel.marketScore + Math.min(10, Math.log2(hit.count + 1) * 2)),
      reasons: [...summary.marketIntel.reasons, `${hit.count} ranked buy-low candidates`],
    };
  }
}

function compareWeaponSummaries(left: WeaponSummary, right: WeaponSummary): number {
  const leftIntel = left.marketIntel;
  const rightIntel = right.marketIntel;
  return (rightIntel?.marketScore ?? 0) - (leftIntel?.marketScore ?? 0)
    || (rightIntel?.liquidityScore ?? 0) - (leftIntel?.liquidityScore ?? 0)
    || (right.priceStats?.median ?? 0) - (left.priceStats?.median ?? 0)
    || right.disposition - left.disposition;
}

function compareOpportunities(left: Opportunity, right: Opportunity): number {
  return right.score - left.score
    || right.expectedProfit - left.expectedProfit
    || right.roi - left.roi
    || right.confidence - left.confidence;
}

function compareInstantWins(left: InstantWin, right: InstantWin): number {
  return right.expected_uplift - left.expected_uplift
    || right.opportunity.confidence - left.opportunity.confidence
    || right.discount_pct - left.discount_pct
    || right.opportunity.expectedProfit - left.opportunity.expectedProfit;
}

function confidenceScore(
  auction: RivenAuction,
  comparableCount: number,
  groupType: Opportunity["groupType"],
  weapon: RivenWeapon,
  marketIntel: WeaponMarketIntel | undefined,
  priceRank: number,
  statMultiplier: number,
): number {
  const liquidity = Math.min(1, Math.log2(comparableCount + 1) / 5);
  const marketLiquidity = marketIntel?.liquidityScore ?? 0.45;
  const status = auction.owner.status === "ingame" ? 1 : auction.owner.status === "online" ? 0.84 : 0.35;
  const exactness = groupType === "exact-stats" ? 1 : 0.68;
  const daysOld = (Date.now() - Date.parse(auction.updated || auction.created)) / 86_400_000;
  const recency = Number.isFinite(daysOld) ? (daysOld <= 2 ? 1 : daysOld <= 14 ? 0.84 : daysOld <= 45 ? 0.62 : 0.38) : 0.55;
  const pricePosition = clamp(1 - priceRank, 0, 1);
  const statSignal = clamp(0.78 + (statMultiplier - 1) * 0.65, 0.35, 1);
  const dispositionSignal = clamp((weapon.disposition - 0.45) / 1.1, 0, 1);
  return clamp(
    liquidity * 0.2 + marketLiquidity * 0.15 + status * 0.16 + exactness * 0.14 + recency * 0.13 + pricePosition * 0.12 + statSignal * 0.06 + dispositionSignal * 0.04,
    0.05,
    1,
  );
}

function instantWinConfidence(
  auction: RivenAuction,
  comparableCount: number,
  discountPct: number,
  basis: InstantWinBasis,
  marketIntel: WeaponMarketIntel | undefined,
): number {
  const sample = 1 - Math.exp(-comparableCount / 4);
  const discount = clamp(discountPct / 0.4, 0, 1);
  const status = auction.owner.status === "ingame" ? 1 : auction.owner.status === "online" ? 0.85 : 0.35;
  const daysOld = (Date.now() - Date.parse(auction.updated || auction.created)) / 86_400_000;
  const recency = Number.isFinite(daysOld) ? (daysOld <= 2 ? 1 : daysOld <= 14 ? 0.85 : daysOld <= 45 ? 0.62 : 0.4) : 0.55;
  const marketLiquidity = marketIntel?.liquidityScore ?? 0.45;
  const basisWeight = basis === "same-signature" ? 1 : 0.82;
  return clamp((0.3 * sample + 0.26 * discount + 0.18 * status + 0.14 * marketLiquidity + 0.12 * recency) * basisWeight, 0, 1);
}

function statDemandMultiplier(attributes: AuctionAttribute[]): number {
  let score = 1;
  let positives = 0;
  let negatives = 0;
  for (const attribute of attributes) {
    if (attribute.positive) {
      positives += 1;
      if (HIGH_DEMAND_POSITIVES[attribute.urlName]) score += 0.09;
      else if (LOW_PAIN_NEGATIVES[attribute.urlName]) score -= 0.02;
    } else {
      negatives += 1;
      if (LOW_PAIN_NEGATIVES[attribute.urlName]) score += 0.06;
      else if (HIGH_DEMAND_POSITIVES[attribute.urlName]) score -= 0.24;
      else score -= 0.04;
    }
  }
  if (positives >= 3) score += 0.04;
  if (negatives === 0) score -= 0.03;
  return Math.min(1.42, Math.max(0.58, score));
}

function opportunityReasons(auction: RivenAuction, estimate: ValueEstimate, confidence: number, intel: WeaponMarketIntel | undefined): string[] {
  const median = Math.round(percentile(estimate.comparablePrices, 0.5));
  const p75 = Math.round(percentile(estimate.comparablePrices, 0.75));
  const reasons = [
    estimate.basisReason,
    `buy ${auction.buyoutPrice}p vs peer median ${median}p / p75 ${p75}p`,
    `seller ${auction.owner.status}`,
  ];
  const lowest = estimate.comparablePrices[0] ?? auction.buyoutPrice;
  if (auction.buyoutPrice < lowest) reasons.push("below every peer listing");
  if (confidence >= 0.75) reasons.push("strong liquidity, recency, and seller signal");
  if ((intel?.marketScore ?? 0) >= 65) reasons.push(`weapon market score ${intel!.marketScore}`);
  return reasons;
}

function instantWinReasons(auction: RivenAuction, basis: InstantWinBasis, p25: number, p50: number, sampleCount: number, discountPct: number): string[] {
  const label = basis === "same-signature" ? "same-signature" : "weapon-floor";
  return [
    `${label} undervalue: buy ${auction.buyoutPrice}p vs p25 ${Math.round(p25)}p / median ${Math.round(p50)}p`,
    `${sampleCount} peer listings excluding this auction`,
    `${Math.round(discountPct * 100)}% below p25`,
    `seller ${auction.owner.status}`,
  ];
}

function normalizedOpportunityScore(
  expectedProfit: number,
  roi: number,
  confidence: number,
  comparableCount: number,
  statMultiplier: number,
  priceRank: number,
  marketIntel: WeaponMarketIntel | undefined,
): number {
  const profitSignal = Math.min(1, Math.max(0, expectedProfit) / 500);
  const roiSignal = Math.min(1, Math.max(0, roi) / 2);
  const liquiditySignal = Math.min(1, Math.log2(comparableCount + 1) / 6);
  const undervalueSignal = clamp(1 - priceRank, 0, 1);
  const marketSignal = (marketIntel?.marketScore ?? 45) / 100;
  const statSignal = Math.min(1.18, Math.max(0.72, statMultiplier));
  const raw = 100 * (0.24 * profitSignal + 0.2 * roiSignal + 0.2 * confidence + 0.14 * liquiditySignal + 0.14 * undervalueSignal + 0.08 * marketSignal) * statSignal;
  return rounded(Math.min(100, Math.max(0, raw)), 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
