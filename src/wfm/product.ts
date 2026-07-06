export type SourceKind =
  | "warframe.market"
  | "official_drop_tables"
  | "public_export"
  | "worldstate"
  | "warframestat"
  | "warframe_wiki"
  | "manual_user"
  | "tpe_history";

export type SourceConfidence = "high" | "medium" | "low";
export type HealthStatus = "green" | "yellow" | "red";

export interface SourceProvenance {
  source: SourceKind;
  url?: string;
  fetchedAt: string;
  observedAt?: string;
  ttlSeconds: number;
  confidence: SourceConfidence;
  warnings: string[];
}

export interface ItemRef {
  tpeId: string;
  name: string;
  wfmSlug?: string;
  wfmId?: string;
  gameRef?: string;
  uniqueName?: string;
  rank?: number;
}

export type TradabilityStatus = "tradable" | "not_tradable" | "conditional" | "unknown";

export interface TradabilityRule {
  status: TradabilityStatus;
  reason: string;
  warnings: string[];
}

export interface ItemIdentity {
  tpeId: string;
  name: string;
  wfmSlug?: string;
  wfmId?: string;
  gameRef?: string;
  uniqueName?: string;
  tags: string[];
  tradability: TradabilityRule;
  maxRank?: number;
  ducats?: number;
  setParts?: ItemRef[];
  icon?: string;
  thumb?: string;
  imageName?: string;
}

export interface MarketOrder {
  id: string;
  type: "sell" | "buy";
  platinum: number;
  quantity: number;
  rank: number;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    status: "ingame" | "online" | "offline" | "unknown";
    ingameName: string;
    reputation: number;
  };
}

export interface HistoricalStats {
  observedListings: number;
  priceBasis: PriceBasis;
  min?: number;
  p25?: number;
  median?: number;
  p75?: number;
  p90?: number;
  max?: number;
}

export type PriceBasis =
  | "sell_floor"
  | "buy_ceiling"
  | "spread_mid"
  | "trimmed_median"
  | "weighted_listing_median"
  | "historical_listing_median"
  | "manual_assumption";

export interface MarketSnapshot {
  item: ItemIdentity;
  rank?: number;
  platform: "pc";
  crossplay: boolean;
  sellOrders: MarketOrder[];
  buyOrders: MarketOrder[];
  statistics?: HistoricalStats;
  source: SourceProvenance;
}

export interface Explanation {
  recommendation: string;
  expectedOutcome: string;
  dataBasis: string[];
  mechanics: string[];
  liquidity: string[];
  risks: string[];
  alternatives: string[];
}

export type ProductOpportunityAction =
  | "buy"
  | "sell"
  | "farm"
  | "open"
  | "refine"
  | "hold"
  | "convert"
  | "rank"
  | "run_mission"
  | "complete_set";

export interface ProductOpportunity {
  id: string;
  methodId: string;
  title: string;
  action: ProductOpportunityAction;
  itemRefs: ItemRef[];
  expectedPlat: number;
  expectedCostPlat?: number;
  expectedProfitPlat?: number;
  roi?: number;
  timeToExecuteMinutes?: number;
  liquidityScore: number;
  confidenceScore: number;
  riskScore: number;
  freshness: SourceProvenance[];
  assumptions: string[];
  warnings: string[];
  explanation: Explanation;
  expiresAt?: string;
  url?: string;
  tags?: string[];
}

export interface SourceHealth {
  id: string;
  label: string;
  status: HealthStatus;
  source: SourceKind;
  url?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  staleAgeSeconds?: number;
  ttlSeconds: number;
  schemaVersion?: string;
  schemaHash?: string;
  coverage?: { scanned: number; total: number; label: string };
  warningCount: number;
  rateLimitState?: string;
  fallback?: string;
  warnings: string[];
}

export interface DataHealthState {
  generatedAt: string;
  status: HealthStatus;
  sources: SourceHealth[];
  warnings: string[];
}

export interface MethodSummary {
  id: string;
  label: string;
  description: string;
  status: HealthStatus;
  opportunityCount: number;
  bestOpportunityId?: string;
  sourceIds: string[];
  warnings: string[];
}

export interface RelicRewardValue {
  item: ItemRef;
  chance: number;
  rarity: string;
  valuePlat: number | null;
  ducats?: number;
  liquidityScore: number;
  priceBasis: PriceBasis;
  warnings: string[];
}

export interface RelicTierValue {
  tier: "Intact" | "Exceptional" | "Flawless" | "Radiant";
  voidTraceCost: number;
  evPlat: number;
  pricedRewardCount: number;
  rewardCount: number;
  confidence: number;
  rewards: RelicRewardValue[];
  warnings: string[];
}

export interface RelicRecommendation {
  relic: ItemRef;
  tierValues: RelicTierValue[];
  chosenTier: RelicTierValue;
  relicSellValuePlat: number | null;
  crackPremiumPlat: number | null;
  traceOpportunityCost: number;
  sources: SourceProvenance[];
  confidence: number;
  warnings: string[];
}

export interface FissureRecommendation {
  id: string;
  node: string;
  missionType: string;
  tier: string;
  isStorm: boolean;
  isHard: boolean;
  expiresAt: string;
  evPerMinute: number;
  priority: number;
  confidence: number;
  warnings: string[];
  source: SourceProvenance;
}

export interface PrimeRelicDashboard {
  generatedAt: string;
  summary: string;
  relicCount: number;
  rewardCount: number;
  scannedMarketItems: number;
  bestRelicsToSell: RelicRecommendation[];
  bestRelicsToCrack: RelicRecommendation[];
  bestAyaPurchases: RelicRecommendation[];
  setCompletion: ProductOpportunity[];
  ducatRecommendations: ProductOpportunity[];
  fissures: FissureRecommendation[];
  supplyShocks: ProductOpportunity[];
  sources: SourceProvenance[];
  warnings: string[];
}

export interface RunActivityCard {
  id: string;
  activityType: string;
  title: string;
  node?: string;
  missionType?: string;
  evPerMinute: number;
  priority: number;
  expiresAt?: string;
  confidenceScore: number;
  status: HealthStatus;
  warnings: string[];
  source: SourceProvenance;
  explanation: Explanation;
}

export interface RunNowDashboard {
  generatedAt: string;
  activities: RunActivityCard[];
  rejectedActivities: Array<{ id: string; title: string; reason: string; source: SourceProvenance }>;
  warnings: string[];
}

export interface PortfolioEntry {
  id: string;
  userId: string;
  item: ItemRef;
  quantity: number;
  rank?: number;
  acquiredAt?: string;
  costBasisPlat?: number;
  notes?: string;
}

export type TodoStatus = "open" | "in_progress" | "blocked" | "done" | "archived";

export interface Todo {
  id: string;
  userId: string;
  title: string;
  methodId?: string;
  itemRefs: ItemRef[];
  action: ProductOpportunityAction;
  status: TodoStatus;
  dueAt?: string;
  sourceOpportunityId?: string;
  notes?: string;
}

export interface NotificationThreshold {
  minExpectedProfitPlat?: number;
  minRoi?: number;
  minConfidence?: number;
  maxRisk?: number;
  itemRefs?: ItemRef[];
}

export type NotificationChannel = "in_app" | "email" | "discord_webhook";

export interface NotificationRule {
  id: string;
  userId: string;
  name: string;
  methodIds: string[];
  filters: Record<string, unknown>;
  threshold: NotificationThreshold;
  channels: NotificationChannel[];
  cooldownSeconds: number;
  enabled: boolean;
  lastTriggeredAt?: string;
  dedupeKey?: string;
  changedBecause?: string;
}

export interface UserAssumptions {
  traceOpportunityCostPlat: number;
  endoPlatPerThousand: number;
  creditPlatPerMillion: number;
  preferredMissionTypes: string[];
  unlockedContent: string[];
  accessibleSyndicates: string[];
}

export interface PrivacySettings {
  privateByDefault: boolean;
  allowAnonymousAggregates: boolean;
  teamSharingEnabled: boolean;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email?: string;
  timezone: string;
  platform: "pc";
  crossplay: boolean;
  assumptions: UserAssumptions;
  privacy: PrivacySettings;
}

export interface PersonalizationState {
  profile: UserProfile;
  savedFilters: Array<{ id: string; name: string; filters: Record<string, unknown>; createdAt: string }>;
  watchlists: Array<{ id: string; name: string; itemRefs: ItemRef[]; methodIds: string[]; createdAt: string }>;
  portfolio: PortfolioEntry[];
  todos: Todo[];
  notificationRules: NotificationRule[];
  deliveries: Array<{ id: string; ruleId: string; deliveredAt: string; channel: string; changedBecause: string; manualVerification: string }>;
  tradeJournal: Array<{ id: string; item: ItemRef; side: "buy" | "sell"; quantity: number; pricePlat: number; tradedAt: string; notes?: string }>;
  auditLog: Array<{ id: string; at: string; event: string }>;
  exportAvailable: boolean;
  deleteAvailable: boolean;
  warnings: string[];
}

export interface BespokeMarketGate {
  id: string;
  label: string;
  status: "gated";
  warnings: string[];
}

export interface ExpansionDashboard {
  mods: ProductOpportunity[];
  syndicates: ProductOpportunity[];
  baro: ProductOpportunity[];
  resources: ProductOpportunity[];
  eventShocks: ProductOpportunity[];
  bespokeMarkets: BespokeMarketGate[];
}

export interface AdvancedAnalyticsDashboard {
  tradeJournal: {
    realizedProfitPlat: number;
    tradeCount: number;
    byMethod: Array<{ methodId: string; profitPlat: number; tradeCount: number }>;
  };
  portfolioAging: Array<{ entryId: string; itemName: string; daysHeld: number; unrealizedPlat: number | null; warnings: string[] }>;
  aggregateTrends: Array<{ id: string; label: string; value: number; privacy: "anonymous_aggregate"; warnings: string[] }>;
  teamWatchlists: Array<{ id: string; name: string; memberCount: number; optIn: boolean }>;
  methodGuides: Array<{ methodId: string; title: string; generatedAt: string; sourceIds: string[]; summary: string; warnings: string[] }>;
}

export interface ProductDashboardState {
  generatedAt: string;
  dataHealth: DataHealthState;
  methods: MethodSummary[];
  opportunities: ProductOpportunity[];
  prime: PrimeRelicDashboard;
  runNow: RunNowDashboard;
  personalization: PersonalizationState;
  expansion: ExpansionDashboard;
  advanced: AdvancedAnalyticsDashboard;
}

export function statusFromScore(score: number): HealthStatus {
  if (score >= 0.75) return "green";
  if (score >= 0.45) return "yellow";
  return "red";
}

export function maxStatus(statuses: readonly HealthStatus[]): HealthStatus {
  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";
  return "green";
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
