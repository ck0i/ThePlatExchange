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
}

export interface Opportunity {
  auctionId: string;
  weaponSlug: string;
  weaponName: string;
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
}

export interface ReferenceSnapshot {
  versions: Record<string, string>;
  versionsUpdatedAt?: string;
  rivenWeapons: RivenWeapon[];
  rivenAttributes: RivenAttribute[];
  loadedAt: string;
}
