export type SellerStatus = "ingame" | "online" | "offline" | "unknown";

export interface RivenWeapon {
  id: string;
  slug: string;
  name: string;
  group: string;
  rivenType: string;
  disposition: number;
  reqMasteryRank: number;
  icon?: string;
  thumb?: string;
  imageName?: string;
}

export interface RivenAttribute {
  id: string;
  slug: string;
  group: string;
  prefix: string;
  suffix: string;
  name: string;
}

export interface AuctionAttribute {
  urlName: string;
  value: number;
  positive: boolean;
}

export interface AuctionOwner {
  id: string;
  ingameName: string;
  slug: string;
  reputation: number;
  status: SellerStatus;
  platform: string;
  crossplay: boolean;
  lastSeen?: string;
}

export interface RivenAuction {
  id: string;
  weaponSlug: string;
  name: string;
  buyoutPrice: number;
  startingPrice: number;
  topBid: number | null;
  isDirectSell: boolean;
  visible: boolean;
  closed: boolean;
  platform: string;
  crossplay: boolean;
  created: string;
  updated: string;
  owner: AuctionOwner;
  masteryLevel: number;
  modRank: number;
  reRolls: number;
  polarity: string;
  attributes: AuctionAttribute[];
  noteRaw: string;
}

export interface PriceStats {
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
}

export type ArcaneRarity = "common" | "uncommon" | "rare" | "legendary" | "unknown";

export interface ArcaneItem {
  id: string;
  slug: string;
  name: string;
  tags: string[];
  rarity: ArcaneRarity;
  maxRank: number;
  tradable: boolean;
  bulkTradable: boolean;
  tradingTax: number;
  gameRef?: string;
  icon?: string;
  thumb?: string;
  imageName?: string;
  wikiLink?: string;
  dissolutionVosfor?: number;
  cannotDissolve?: boolean;
}

export interface ArcaneOrder {
  id: string;
  type: "sell" | "buy";
  platinum: number;
  unitPrice: number;
  quantity: number;
  perTrade: number;
  rank: number;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  itemId: string;
  user: AuctionOwner;
}

export interface ArcaneRankMarket {
  rank: number;
  sell: PriceStats | null;
  buy: PriceStats | null;
  sellOrderCount: number;
  buyOrderCount: number;
  onlineSellOrderCount: number;
  onlineBuyOrderCount: number;
  totalSellQuantity: number;
  totalBuyQuantity: number;
}

export interface ArcaneMarketSummary {
  slug: string;
  name: string;
  rarity: ArcaneRarity;
  maxRank: number;
  listings: number;
  sellListings: number;
  buyListings: number;
  onlineSellListings: number;
  onlineBuyListings: number;
  rank0: ArcaneRankMarket;
  rankMax?: ArcaneRankMarket;
  dissolutionVosfor?: number;
  icon?: string;
  thumb?: string;
  imageName?: string;
  lastScannedAt?: string;
  priceVsVosfor?: {
    rank: number;
    sellPrice: number;
    platinumPerVosfor: number;
  };
  url: string;
}

export interface ArcanePackDrop {
  arcaneSlug: string;
  arcaneName: string;
  rarity: Exclude<ArcaneRarity, "unknown">;
  chance: number;
}

export interface ArcanePackDefinition {
  id: string;
  name: string;
  costVosfor: number;
  creditCost: number;
  rewardsPerPack: number;
  source: string;
  drops: ArcanePackDrop[];
}

export type ArcanePackStrategy = "high_value_maxed" | "rank0_bulk";

export interface ArcanePackStrategyMetrics {
  strategy: ArcanePackStrategy;
  label: string;
  expectedPlat: number;
  expectedPlatPerVosfor: number;
  confidence: number;
  coveragePct: number;
  targetChance: number;
  chanceAtLeastOneTarget: number;
  expectedTargetCopies: number;
  targetCount: number;
}

export interface ArcanePackValuationDrop extends ArcanePackDrop {
  rank: number;
  priceUsed: number | null;
  dissolutionVosfor?: number;
  expectedCopies: number;
  expectedPlat: number;
  expectedVosfor: number | null;
  sourcePrice: "missing" | `rank${number}_sell_${string}`;
  maxRank: number | null;
  copiesToMax: number | null;
  maxRankPrice: number | null;
  highValueTarget: boolean;
  expectedHighValueMaxedPlat: number;
  sourceMaxRankPrice: "missing" | `rank${number}_sell_${string}`;
}

export interface ArcanePackValuation {
  packId: string;
  packName: string;
  costVosfor: number;
  creditCost: number;
  rewardsPerPack: number;
  expectedPlat: number;
  expectedPlatPerVosfor: number;
  expectedVosforReturn: number;
  netVosforBurn: number;
  coveragePct: number;
  confidence: number;
  missingPriceCount: number;
  pricedDropCount: number;
  maxRankCoveragePct: number;
  highValueConfidence: number;
  missingMaxRankPriceCount: number;
  maxRankPricedDropCount: number;
  highValueThreshold: number;
  highValueTargetCount: number;
  highValueTargetChance: number;
  chanceAtLeastOneHighValue: number;
  expectedHighValueCopies: number;
  expectedHighValueMaxedPlat: number;
  expectedHighValueMaxedPlatPerVosfor: number;
  defaultStrategy: ArcanePackStrategy;
  strategyMetrics: Record<ArcanePackStrategy, ArcanePackStrategyMetrics>;
  topDrops: ArcanePackValuationDrop[];
  source: string;
  notes: string[];
}

export interface ArcaneDissolveRecommendation {
  slug: string;
  name: string;
  rank: number;
  sellPrice: number;
  dissolutionVosfor: number;
  bestPackId: string;
  bestPackName: string;
  estimatedRollValue: number;
  sellValuePerVosfor: number;
  rollValuePerVosfor: number;
  deltaPlat: number;
  action: "dissolve" | "sell" | "hold";
  strategy: ArcanePackStrategy;
  confidence: number;
  reasons: string[];
  url: string;
  imageName?: string;
}

export interface ArcaneDashboardState {
  generatedAt: string;
  reference: {
    items: number;
    packs: number;
    withDissolution: number;
    versionsUpdatedAt?: string;
  };
  totals: {
    itemsWithOrders: number;
    orders: number;
    packs: number;
    recommendations: number;
  };
  status?: ScanStatus;
  summaries: ArcaneMarketSummary[];
  packs: ArcanePackValuation[];
  dissolveRecommendations: ArcaneDissolveRecommendation[];
  dissolveRecommendationsByStrategy: Record<ArcanePackStrategy, ArcaneDissolveRecommendation[]>;
  mechanics: {
    packCostVosfor: number;
    rewardsPerPack: number;
    priceRank: number;
    priceStatistic: string;
    defaultPackStrategy: ArcanePackStrategy;
    highValueThreshold: number;
    copiesToMaxFormula: string;
    sources: string[];
  };
}

export interface ArcaneReferenceSnapshot {
  versions: Record<string, string>;
  versionsUpdatedAt?: string;
  items: ArcaneItem[];
  packs: ArcanePackDefinition[];
  loadedAt: string;
}

export interface WeaponSummary {
  slug: string;
  name: string;
  group: string;
  disposition: number;
  listings: number;
  directListings: number;
  actionableListings: number;
  onlineListings: number;
  priceStats: PriceStats | null;
  lastScannedAt?: string;
  imageName?: string;
}

export interface Opportunity {
  auctionId: string;
  weaponSlug: string;
  weaponName: string;
  imageName?: string;
  rivenName: string;
  buyPrice: number;
  targetSellPrice: number;
  conservativeSellPrice: number;
  expectedProfit: number;
  roi: number;
  buyToSellRatio: number;
  confidence: number;
  score: number;
  seller: AuctionOwner;
  status: SellerStatus;
  groupType: "exact-stats" | "weapon-market";
  comparableListings: number;
  pricePercentile: number;
  signature: string;
  positives: string[];
  negatives: string[];
  reasons: string[];
  updated: string;
  url: string;
}

export interface TraderConfig {
  watchlist: string[];
  minProfit: number;
  minRoi: number;
  minGroupSize: number;
  minBuyPrice: number | null;
  maxBuyPrice: number | null;
  maxSellPrice: number | null;
  statuses: SellerStatus[];
  maxResults: number;
  scanAllWhenWatchlistEmpty: boolean;
}

export interface ScanStatus {
  initialized: boolean;
  running: boolean;
  reason: string;
  startedAt?: string;
  finishedAt?: string;
  nextRefreshAt?: string;
  scannedWeapons: number;
  totalWeapons: number;
  lastError?: string;
  lastMessage: string;
}

export interface DashboardState {
  generatedAt: string;
  refreshMs: number;
  apiBase: string;
  scanMode?: "tiered" | "full" | "remote";
  config: TraderConfig;
  status: ScanStatus;
  reference: {
    weapons: number;
    attributes: number;
    versionsUpdatedAt?: string;
  };
  totals: {
    weaponsWithAuctions: number;
    auctions: number;
    opportunities: number;
  };
  opportunities: Opportunity[];
  weaponSummaries: WeaponSummary[];
  arcanes?: ArcaneDashboardState;
}

export interface ReferenceSnapshot {
  versions: Record<string, string>;
  versionsUpdatedAt?: string;
  rivenWeapons: RivenWeapon[];
  rivenAttributes: RivenAttribute[];
  loadedAt: string;
}
