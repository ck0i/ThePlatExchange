import { WarframeMarketClient } from "./client.js";
import type { PriceHistoryStore, SignatureValuation as SignatureValuationResult, SignatureVelocity as SignatureVelocityResult } from "./history.js";
import { analyzeArcaneMarket } from "./arcanes.js";
import { analyzeMarket, DEFAULT_CONFIG, deriveWeaponMarketIntel, MAX_REASONABLE_ROI, normalizeConfig, slugify, type MarketAnalysis } from "./opportunities.js";
import { buildProductDashboard, createInitialProductDashboard } from "./productEngine.js";
import { enforceRunNowWindow, isRunNowLiveArtifact, overlayRunNowArtifact, type RunNowLiveArtifact } from "./live.js";
import type { PersonalizationState, ProductDashboardState } from "./product.js";
import { UserStore, type NotificationRuleInput, type PortfolioInput, type ProfileUpdate, type TodoInput, type TodoUpdate } from "./userStore.js";
import type { ArcaneDashboardState, ArcaneItem, ArcaneOrder, ArcaneReferenceSnapshot, DashboardState, ReferenceSnapshot, RivenAuction, RivenWeapon, ScanStatus, TraderConfig, WeaponSummary } from "./types.js";

export type ScanTier = "hot" | "cold" | "full";
export type ScanMode = "tiered" | "full" | "remote";

export interface ScannerOptions {
  client: WarframeMarketClient;
  config?: Partial<TraderConfig>;
  refreshMs?: number;
  concurrency?: number;
  weaponLimit?: number | null;
  scanMode?: ScanMode;
  hotSize?: number;
  coldSliceSize?: number;
  hotIntervalMs?: number;
  coldIntervalMs?: number;
  emitDebounceMs?: number;
  history?: PriceHistoryStore;
  remoteDataUrl?: string;
  remoteDataBase?: string;
  remotePollMs?: number;
  remoteRunNowPollMs?: number;
  userStore?: UserStore;
}

interface RemoteValuationEntry {
  weapon_slug: string;
  signature: string;
  sample_count: number;
  window_days: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  min: number;
  max: number;
  last_seen_price: number;
  last_seen_at: number;
  confidence: number;
}

interface RemoteVelocityEntry {
  weapon_slug: string;
  signature: string;
  observed_listings: number;
  vanished_listings: number;
  vanish_rate: number;
  avg_time_on_market_days: number | null;
  classification: "fast_moving" | "stuck" | "unknown";
}

type StateListener = (state: DashboardState) => void;

const HOT_SCORE_MIN_HOURS_BETWEEN_RESCANS = 3;
const ARCANE_HOT_TARGET_PRIORITY: Record<string, number> = {
  arcane_hot_shot: 100,
  arcane_steadfast: 95,
  arcane_energize: 90,
  arcane_grace: 85,
  arcane_barrier: 84,
  arcane_reaper: 80,
  arcane_universal_fallout: 79,
  longbow_sharpshot: 78,
  melee_duplicate: 77,
  melee_crescendo: 76,
  molt_augmented: 72,
  secondary_encumber: 70,
};


export class ThePlatExchangeService {
  private readonly client: WarframeMarketClient;
  private readonly history: PriceHistoryStore | undefined;
  private readonly listeners = new Set<StateListener>();
  private readonly auctionsByWeapon = new Map<string, RivenAuction[]>();
  private readonly scannedAtByWeapon = new Map<string, string>();
  private readonly arcaneOrdersByItem = new Map<string, ArcaneOrder[]>();
  private readonly arcaneScannedAtByItem = new Map<string, string>();
  private reference: ReferenceSnapshot | null = null;
  private arcaneReference: ArcaneReferenceSnapshot | null = null;
  private config: TraderConfig;
  private timers: NodeJS.Timeout[] = [];
  private emitTimer: NodeJS.Timeout | undefined;
  private readonly userStore: UserStore;
  private productState: ProductDashboardState = createInitialProductDashboard();
  private activeProductRefresh: Promise<void> | null = null;
  private activeRefresh: Promise<void> | null = null;
  private activeArcaneRefresh: Promise<void> | null = null;
  private cachedAnalysis: { key: string; analysis: MarketAnalysis } | null = null;
  private cachedArcaneAnalysis: { key: string; analysis: ArcaneDashboardState } | null = null;
  private auctionsRevision = 0;
  private arcaneRevision = 0;
  private configRevision = 0;
  private coldCursor = 0;
  private arcaneColdCursor = 0;
  private status: ScanStatus = {
    initialized: false,
    running: false,
    reason: "startup",
    scannedWeapons: 0,
    totalWeapons: 0,
    lastMessage: "Waiting for launch",
  };
  private arcaneStatus: ScanStatus = {
    initialized: false,
    running: false,
    reason: "startup",
    scannedWeapons: 0,
    totalWeapons: 0,
    lastMessage: "Waiting for arcane scan",
  };

  readonly refreshMs: number;
  readonly concurrency: number;
  readonly weaponLimit: number | null;
  private mode: ScanMode;
  readonly hotSize: number;
  readonly coldSliceSize: number;
  readonly hotIntervalMs: number;
  readonly coldIntervalMs: number;
  readonly emitDebounceMs: number;
  readonly remoteDataUrl: string | undefined;
  readonly remoteDataBase: string | undefined;
  readonly remotePollMs: number;
  readonly remoteRunNowPollMs: number;
  private remoteState: DashboardState | null = null;
  private remoteReference: ReferenceSnapshot | null = null;
  private remoteRunNowArtifact: RunNowLiveArtifact | null = null;
  private readonly remoteValuations = new Map<string, RemoteValuationEntry>();
  private readonly remoteVelocities = new Map<string, RemoteVelocityEntry>();
  private lastRemoteFetchAt = 0;
  private lastRemoteReferenceFetchAt = 0;
  private lastRemoteValuationsFetchAt = 0;
  private lastRemoteRunNowFetchAt = 0;
  private scanGeneration = 0;

  constructor(options: ScannerOptions) {
    this.client = options.client;
    this.history = options.history;
    this.userStore = options.userStore ?? new UserStore();
    void this.userStore.load().then((state) => {
      this.productState = createInitialProductDashboard(state);
      this.emitStateImmediate();
    }).catch(() => undefined);
    this.config = normalizeConfig(options.config ?? DEFAULT_CONFIG);
    this.refreshMs = Math.max(60_000, options.refreshMs ?? 60_000);
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
    this.weaponLimit = options.weaponLimit === undefined ? null : options.weaponLimit;
    this.mode = options.scanMode ?? "tiered";
    this.hotSize = Math.max(1, Math.floor(options.hotSize ?? 40));
    this.coldSliceSize = Math.max(1, Math.floor(options.coldSliceSize ?? 150));
    this.hotIntervalMs = Math.max(60_000, options.hotIntervalMs ?? 5 * 60_000);
    this.coldIntervalMs = Math.max(this.hotIntervalMs, options.coldIntervalMs ?? 60 * 60_000);
    this.emitDebounceMs = Math.max(100, options.emitDebounceMs ?? 1500);
    this.remoteDataUrl = options.remoteDataUrl;
    this.remoteDataBase = options.remoteDataBase ?? inferRemoteBase(options.remoteDataUrl);
    this.remotePollMs = Math.max(15_000, options.remotePollMs ?? 45_000);
    this.remoteRunNowPollMs = Math.max(5_000, options.remoteRunNowPollMs ?? 5_000);
    this.hydrateFromHistory();
  }

  private remoteUrl(kind: "state" | "reference" | "valuations" | "run-now"): string | undefined {
    if (kind === "state" && this.remoteDataUrl) return this.remoteDataUrl;
    if (!this.remoteDataBase) return undefined;
    if (kind === "state") return `${this.remoteDataBase}/latest/state.json`;
    if (kind === "reference") return `${this.remoteDataBase}/reference/current.json`;
    if (kind === "run-now") return `${this.remoteDataBase}/latest/run-now.json`;
    return `${this.remoteDataBase}/valuations/latest.json`;
  }

  get scanMode(): ScanMode {
    return this.mode;
  }

  setMode(next: ScanMode): ScanMode {
    if (next === this.mode) return this.mode;
    if (next === "remote" && !this.remoteUrl("state")) throw new Error("remote mode requires WFM_DATA_URL or WFM_DATA_BASE to be set");
    this.stop();
    this.activeRefresh = null;
    this.activeArcaneRefresh = null;
    this.activeProductRefresh = null;
    this.scanGeneration += 1;
    this.mode = next;
    this.remoteState = null;
    this.remoteReference = null;
    this.remoteRunNowArtifact = null;
    this.remoteValuations.clear();
    this.remoteVelocities.clear();
    this.lastRemoteFetchAt = 0;
    this.lastRemoteReferenceFetchAt = 0;
    this.lastRemoteValuationsFetchAt = 0;
    this.lastRemoteRunNowFetchAt = 0;
    this.status = {
      ...this.status,
      running: false,
      reason: `switching-to-${next}`,
      scannedWeapons: 0,
      totalWeapons: 0,
      lastMessage: `Switched to ${next} mode`,
    };
    delete this.status.lastError;
    this.start();
    return this.mode;
  }

  private hydrateFromHistory(): void {
    if (!this.history) return;
    const snapshot = this.history.warmStart();
    if (snapshot.restoredWeaponCount === 0) return;
    for (const [slug, auctions] of snapshot.auctionsByWeapon) this.auctionsByWeapon.set(slug, auctions);
    for (const [slug, scannedAt] of snapshot.scannedAtByWeapon) this.scannedAtByWeapon.set(slug, scannedAt);
    this.auctionsRevision += 1;
    const latestIso = snapshot.latestSnapshotTs !== null ? new Date(snapshot.latestSnapshotTs * 1000).toISOString() : undefined;
    this.status = {
      ...this.status,
      lastMessage: `Warm-started ${snapshot.restoredWeaponCount} weapons from history (${latestIso ?? "unknown time"})`,
    };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.timers.length > 0) return;
    if (this.mode === "remote") {
      this.startRemotePolling();
      return;
    }
    if (this.mode === "tiered") {
      this.scheduleNextRefreshAt();
      this.timers.push(setInterval(() => {
        this.scheduleNextRefreshAt();
        void this.refresh("hot-scheduled", "hot");
        void this.refreshArcanes("arcane-hot-scheduled", "hot");
      }, this.hotIntervalMs));
      this.timers.push(setInterval(() => {
        void this.refresh("cold-scheduled", "cold");
        void this.refreshArcanes("arcane-cold-scheduled", "cold");
      }, this.coldIntervalMs));
      void this.refresh("startup-hot", "hot");
      void this.refreshArcanes("arcane-startup-hot", "hot");
    } else {
      this.scheduleNextRefreshAt();
      this.timers.push(setInterval(() => {
        this.scheduleNextRefreshAt();
        void this.refresh("scheduled", "full");
        void this.refreshArcanes("arcane-scheduled", "full");
      }, this.refreshMs));
      void this.refresh("startup", "full");
      void this.refreshArcanes("arcane-startup", "full");
    }
    this.timers.push(setInterval(() => {
      void this.refreshProduct("product-scheduled");
    }, Math.max(15 * 60_000, this.hotIntervalMs * 3)));
    void this.refreshProduct("product-startup");
  }

  private startRemotePolling(): void {
    const stateUrl = this.remoteUrl("state");
    if (!stateUrl) {
      this.status = {
        ...this.status,
        running: false,
        reason: "remote",
        lastMessage: "Remote mode requested but no WFM_DATA_URL / WFM_DATA_BASE set. No data source active.",
      };
      this.emitStateImmediate();
      return;
    }
    this.status = {
      initialized: this.status.initialized,
      running: true,
      reason: "remote",
      startedAt: new Date().toISOString(),
      scannedWeapons: 0,
      totalWeapons: 0,
      lastMessage: `Polling ${stateUrl} every ${Math.round(this.remotePollMs / 1000)}s; Run Now artifact every ${Math.round(this.remoteRunNowPollMs / 1000)}s`,
    };
    this.emitStateImmediate();
    void this.pollRemote();
    void this.pollRemoteRunNow();
    this.timers.push(setInterval(() => void this.pollRemote(), this.remotePollMs));
    if (this.remoteUrl("run-now")) this.timers.push(setInterval(() => void this.pollRemoteRunNow(), this.remoteRunNowPollMs));
  }

  private async pollRemote(): Promise<void> {
    const stateUrl = this.remoteUrl("state");
    if (!stateUrl) return;
    const now = Date.now();
    const promises: Array<Promise<void>> = [this.pollRemoteState(stateUrl)];
    if (now - this.lastRemoteReferenceFetchAt > 5 * 60_000) promises.push(this.pollRemoteReference());
    if (now - this.lastRemoteValuationsFetchAt > 5 * 60_000) promises.push(this.pollRemoteValuations());
    await Promise.all(promises);
  }

  private async pollRemoteState(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.status.lastError = `remote state ${response.status}`;
        this.emitStateImmediate();
        return;
      }
      const parsed = await response.json();
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.opportunities)) {
        this.status.lastError = "remote state payload malformed";
        this.emitStateImmediate();
        return;
      }
      this.remoteState = parsed as DashboardState;
      this.lastRemoteFetchAt = Date.now();
      const scannedWeapons = parsed.status?.scannedWeapons ?? 0;
      const totalWeapons = parsed.status?.totalWeapons ?? scannedWeapons;
      const opportunityCount = parsed.totals?.opportunities ?? 0;
      const instantWins = Array.isArray(parsed.instantWins) ? parsed.instantWins.length : null;
      const hasMarketIntel = Array.isArray(parsed.weaponSummaries) && parsed.weaponSummaries.some((summary: unknown) =>
        Boolean(summary && typeof summary === "object" && "marketIntel" in summary),
      );
      const legacySnapshot = instantWins === null || !hasMarketIntel;
      const remoteSummary = legacySnapshot
        ? `Remote snapshot fetched legacy pre-overhaul feed: ${opportunityCount} opportunities across ${scannedWeapons} weapons; waiting for next cold scan to publish raw instant wins`
        : `Remote snapshot fetched: ${opportunityCount} opportunities and ${instantWins} instant wins across ${scannedWeapons} weapons`;
      this.status = {
        initialized: true,
        running: false,
        reason: "remote",
        finishedAt: new Date().toISOString(),
        scannedWeapons,
        totalWeapons,
        lastMessage: remoteSummary,
      };
      delete this.status.lastError;
      this.emitStateImmediate();
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : String(error);
      this.emitStateImmediate();
    }
  }

  private async pollRemoteReference(): Promise<void> {
    const url = this.remoteUrl("reference");
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const parsed = await response.json();
      if (parsed && Array.isArray(parsed.rivenWeapons) && Array.isArray(parsed.rivenAttributes)) {
        this.remoteReference = parsed as ReferenceSnapshot;
        this.lastRemoteReferenceFetchAt = Date.now();
      }
    } catch {
      // silently skip on network hiccup — retried on next cycle
    }
  }

  private async pollRemoteValuations(): Promise<void> {
    const url = this.remoteUrl("valuations");
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const parsed = await response.json();
      if (!parsed || typeof parsed !== "object") return;
      const valuations = parsed.valuations && typeof parsed.valuations === "object" ? parsed.valuations : {};
      const velocities = parsed.velocities && typeof parsed.velocities === "object" ? parsed.velocities : {};
      this.remoteValuations.clear();
      this.remoteVelocities.clear();
      for (const [key, value] of Object.entries(valuations)) {
        if (value && typeof value === "object") this.remoteValuations.set(key, value as RemoteValuationEntry);
      }
      for (const [key, value] of Object.entries(velocities)) {
        if (value && typeof value === "object") this.remoteVelocities.set(key, value as RemoteVelocityEntry);
      }
      this.lastRemoteValuationsFetchAt = Date.now();
    } catch {
      // silently skip; next cycle will retry
    }
  }

  private async pollRemoteRunNow(): Promise<void> {
    const url = this.remoteUrl("run-now");
    if (!url) return;
    try {
      const previousKey = this.remoteRunNowArtifact ? runNowArtifactKey(this.remoteRunNowArtifact) : "";
      const response = await fetch(cacheBustedUrl(url), { cache: "no-store", headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } });
      if (!response.ok) return;
      const parsed = await response.json();
      if (!isRunNowLiveArtifact(parsed)) return;
      const nextKey = runNowArtifactKey(parsed);
      this.remoteRunNowArtifact = parsed;
      this.lastRemoteRunNowFetchAt = Date.now();
      if (nextKey !== previousKey) this.emitStateImmediate();
    } catch {
      // silently skip; the cold state remains usable and the next live poll retries
    }
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = undefined;
    }
  }

  updateConfig(update: Partial<TraderConfig>): TraderConfig {
    this.config = normalizeConfig({ ...this.config, ...update });
    this.configRevision += 1;
    this.emitStateImmediate();
    return this.config;
  }

  async refresh(reason: string, tier: ScanTier = "full"): Promise<void> {
    if (this.activeRefresh) {
      this.status.lastMessage = `Skipped overlapping ${reason} refresh; current ${this.status.reason} scan is still running`;
      this.emitStateImmediate();
      return this.activeRefresh;
    }
    this.activeRefresh = this.runRefresh(reason, tier);
    try {
      await this.activeRefresh;
    } finally {
      this.activeRefresh = null;
    }
  }

  async refreshArcanes(reason: string, tier: ScanTier = "full"): Promise<void> {
    if (this.activeArcaneRefresh) {
      this.arcaneStatus.lastMessage = `Skipped overlapping ${reason} refresh; current ${this.arcaneStatus.reason} scan is still running`;
      this.emitStateImmediate();
      return this.activeArcaneRefresh;
    }
    this.activeArcaneRefresh = this.runArcaneRefresh(reason, tier);
    try {
      await this.activeArcaneRefresh;
    } finally {
      this.activeArcaneRefresh = null;
    }
  }

  async refreshProduct(reason: string): Promise<void> {
    if (this.activeProductRefresh) return this.activeProductRefresh;
    this.activeProductRefresh = this.runProductRefresh(reason);
    try {
      await this.activeProductRefresh;
    } finally {
      this.activeProductRefresh = null;
    }
  }

  getSignatureValuation(weaponSlug: string, signature: string, windowDays: number = 30): SignatureValuationResult | null {
    if (this.mode === "remote") {
      const remote = this.remoteValuations.get(`${weaponSlug}::${signature}`);
      if (remote) return { ...remote };
    }
    if (!this.history) return null;
    try {
      return this.history.signatureValuation(weaponSlug, signature, windowDays);
    } catch {
      return null;
    }
  }

  getSignatureVelocity(weaponSlug: string, signature: string, windowDays: number = 30): SignatureVelocityResult | null {
    if (this.mode === "remote") {
      const remote = this.remoteVelocities.get(`${weaponSlug}::${signature}`);
      if (remote) return { ...remote };
    }
    if (!this.history) return null;
    try {
      return this.history.signatureVelocity(weaponSlug, signature, windowDays);
    } catch {
      return null;
    }
  }

  getAllWeapons(): RivenWeapon[] {
    if (this.mode === "remote") return this.remoteReference?.rivenWeapons ?? this.reference?.rivenWeapons ?? [];
    return this.reference?.rivenWeapons ?? [];
  }

  getSignaturesForWeapon(weaponSlug: string, limit: number = 20): Array<SignatureValuationResult & { velocity: SignatureVelocityResult | null }> {
    const results: Array<SignatureValuationResult & { velocity: SignatureVelocityResult | null }> = [];
    if (this.mode === "remote") {
      const prefix = `${weaponSlug}::`;
      for (const [key, valuation] of this.remoteValuations) {
        if (!key.startsWith(prefix)) continue;
        const velocity = this.remoteVelocities.get(key) ?? null;
        results.push({ ...valuation, velocity });
      }
    } else if (this.history) {
      try {
        const signatures = this.history.listSignaturesForWeapon(weaponSlug, limit);
        for (const signature of signatures) {
          const valuation = this.history.signatureValuation(weaponSlug, signature);
          if (valuation.sample_count === 0) continue;
          const velocity = this.history.signatureVelocity(weaponSlug, signature);
          results.push({ ...valuation, velocity });
        }
      } catch {
        // ignore
      }
    }
    results.sort((left, right) => right.sample_count - left.sample_count);
    return results.slice(0, limit);
  }

  private buildRemoteImageMap(): Map<string, string> {
    const map = new Map<string, string>();
    const source = this.remoteReference?.rivenWeapons ?? this.reference?.rivenWeapons ?? [];
    for (const weapon of source) {
      if (weapon.imageName) map.set(weapon.slug, weapon.imageName);
    }
    return map;
  }

  private enrichRemoteWeaponSummaries(imageMap: ReadonlyMap<string, string>): WeaponSummary[] {
    const summaries = this.remoteState?.weaponSummaries ?? [];
    return summaries
      .map((summary) => {
        const withImage = summary.imageName ? summary : { ...summary, ...(imageMap.get(summary.slug) ? { imageName: imageMap.get(summary.slug)! } : {}) };
        if (withImage.marketIntel) return withImage;
        return {
          ...withImage,
          marketIntel: deriveWeaponMarketIntel({
            disposition: withImage.disposition,
            directListings: withImage.directListings,
            actionableListings: withImage.actionableListings,
            onlineListings: withImage.onlineListings,
            priceStats: withImage.priceStats,
          }),
        };
      })
      .sort((left, right) =>
        (right.marketIntel?.marketScore ?? 0) - (left.marketIntel?.marketScore ?? 0)
        || (right.marketIntel?.liquidityScore ?? 0) - (left.marketIntel?.liquidityScore ?? 0)
        || (right.priceStats?.median ?? 0) - (left.priceStats?.median ?? 0),
      );
  }

  getDispositionSignals(sinceSeconds: number = 30 * 24 * 60 * 60): Map<string, "rising" | "falling"> {
    const map = new Map<string, "rising" | "falling">();
    if (!this.history) return map;
    const cutoff = Math.floor(Date.now() / 1000) - sinceSeconds;
    try {
      const rows = this.history.recentDispositionChanges(cutoff);
      for (const row of rows) map.set(row.weapon_slug, row.delta > 0 ? "rising" : "falling");
    } catch {
      // history query failure is non-fatal
    }
    return map;
  }

  private async runProductRefresh(reason: string): Promise<void> {
    const personalization = await this.userStore.load();
    this.productState = await this.buildProductFromPersonalization(personalization, reason);
    this.emitStateImmediate();
  }

  private async buildProductFromPersonalization(personalization: PersonalizationState, reason: string): Promise<ProductDashboardState> {
    try {
      return await buildProductDashboard(this.client, personalization);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...this.productState,
        personalization,
        generatedAt: new Date().toISOString(),
        dataHealth: {
          ...this.productState.dataHealth,
          generatedAt: new Date().toISOString(),
          status: "red",
          warnings: [`${reason}: ${message}`, ...this.productState.dataHealth.warnings],
        },
      };
    }
  }

  getState(): DashboardState {
    if (this.mode === "remote") {
      if (this.remoteState) {
        const imageMap = this.buildRemoteImageMap();
        const enriched = this.remoteState.opportunities
          .map((opportunity) => {
            const withImage = opportunity.imageName ? opportunity : { ...opportunity, ...(imageMap.get(opportunity.weaponSlug) ? { imageName: imageMap.get(opportunity.weaponSlug)! } : {}) };
            // Sanity-recompute profit/ROI from the displayed median so trades that
            // used to look attractive under the p75-based math but are actually
            // losses at the real (median) sell price get dropped or corrected.
            const medianProfit = withImage.conservativeSellPrice - withImage.buyPrice;
            if (medianProfit <= 0) return null;
            const rawRoi = withImage.buyPrice > 0 ? medianProfit / withImage.buyPrice : Number.POSITIVE_INFINITY;
            if (rawRoi > MAX_REASONABLE_ROI) return null;
            const roi = Math.round(rawRoi * 1000) / 1000;
            return {
              ...withImage,
              expectedProfit: medianProfit,
              roi,
              buyToSellRatio: Math.round((withImage.conservativeSellPrice / withImage.buyPrice) * 1000) / 1000,
            };
          })
          .filter((opportunity): opportunity is NonNullable<typeof opportunity> => opportunity !== null)
          .sort((left, right) => right.expectedProfit - left.expectedProfit);
        const instantWins = (this.remoteState.instantWins ?? [])
          .map((win) => {
            const opportunity = win.opportunity.imageName ? win.opportunity : {
              ...win.opportunity,
              ...(imageMap.get(win.opportunity.weaponSlug) ? { imageName: imageMap.get(win.opportunity.weaponSlug)! } : {}),
            };
            const expectedProfit = opportunity.conservativeSellPrice - opportunity.buyPrice;
            if (expectedProfit <= 0) return null;
            const rawRoi = opportunity.buyPrice > 0 ? expectedProfit / opportunity.buyPrice : Number.POSITIVE_INFINITY;
            if (rawRoi > MAX_REASONABLE_ROI) return null;
            const roi = Math.round(rawRoi * 1000) / 1000;
            return {
              ...win,
              opportunity: {
                ...opportunity,
                expectedProfit,
                roi,
                buyToSellRatio: Math.round((opportunity.conservativeSellPrice / opportunity.buyPrice) * 1000) / 1000,
              },
            };
          })
          .filter((win): win is NonNullable<typeof win> => win !== null);
        return {
          ...this.remoteState,
          scanMode: "remote",
          generatedAt: new Date().toISOString(),
          status: { ...this.status },
          totals: {
            ...this.remoteState.totals,
            opportunities: enriched.length,
          },
          opportunities: enriched,
          instantWins,
          weaponSummaries: this.enrichRemoteWeaponSummaries(imageMap),
          product: this.productForRemoteState(),
        };
      }
      return {
        generatedAt: new Date().toISOString(),
        refreshMs: this.remotePollMs,
        apiBase: this.remoteDataUrl ?? "remote",
        scanMode: "remote",
        config: this.config,
        status: { ...this.status },
        reference: { weapons: 0, attributes: 0 },
        totals: { weaponsWithAuctions: 0, auctions: 0, opportunities: 0 },
        opportunities: [],
        instantWins: [],
        weaponSummaries: [],
        product: enforceRunNowWindow(this.productState),
      };
    }
    const weapons = this.reference?.rivenWeapons ?? [];
    const key = this.analysisKey();
    let analysis = this.cachedAnalysis && this.cachedAnalysis.key === key ? this.cachedAnalysis.analysis : null;
    if (!analysis) {
      analysis = analyzeMarket(weapons, this.auctionsByWeapon, this.config, this.scannedAtByWeapon);
      this.cachedAnalysis = { key, analysis };
    }
    let auctionCount = 0;
    for (const auctions of this.auctionsByWeapon.values()) auctionCount += auctions.length;
    const reference: DashboardState["reference"] = {
      weapons: weapons.length,
      attributes: this.reference?.rivenAttributes.length ?? 0,
    };
    if (this.reference?.versionsUpdatedAt) reference.versionsUpdatedAt = this.reference.versionsUpdatedAt;
    return {
      generatedAt: new Date().toISOString(),
      refreshMs: this.mode === "tiered" ? this.hotIntervalMs : this.refreshMs,
      apiBase: this.client.baseUrl,
      scanMode: this.mode,
      config: this.config,
      status: { ...this.status },
      reference,
      totals: {
        weaponsWithAuctions: this.auctionsByWeapon.size,
        auctions: auctionCount,
        opportunities: analysis.opportunities.length,
      },
      opportunities: analysis.opportunities,
      instantWins: analysis.instantWins,
      weaponSummaries: analysis.weaponSummaries,
      arcanes: this.getArcaneState(),
      product: enforceRunNowWindow(this.productState),
    };
  }

  getProductState(): ProductDashboardState {
    return this.mode === "remote" ? this.productForRemoteState() : enforceRunNowWindow(this.productState);
  }

  private productForRemoteState(): ProductDashboardState {
    const waiting = this.productState.dataHealth.sources.some((source) => source.id === "product" && source.warnings.some((warning) => warning.includes("Waiting for product data refresh")));
    const base = waiting && this.remoteState?.product ? this.remoteState.product : this.productState;
    const current = enforceRunNowWindow(base);
    return this.remoteRunNowArtifact ? overlayRunNowArtifact(current, this.remoteRunNowArtifact) : current;
  }

  async updateUserProfile(update: ProfileUpdate): Promise<ProductDashboardState> {
    const personalization = await this.userStore.updateProfile(update);
    this.productState = await this.buildProductFromPersonalization(personalization, "profile-update");
    this.emitStateImmediate();
    return this.productState;
  }

  async addTodo(input: TodoInput): Promise<ProductDashboardState> {
    const personalization = await this.userStore.addTodo(input);
    this.productState = { ...this.productState, personalization };
    this.emitStateImmediate();
    return this.productState;
  }

  async updateTodo(id: string, update: TodoUpdate): Promise<ProductDashboardState> {
    const personalization = await this.userStore.updateTodo(id, update);
    this.productState = { ...this.productState, personalization };
    this.emitStateImmediate();
    return this.productState;
  }

  async addPortfolio(input: PortfolioInput): Promise<ProductDashboardState> {
    const personalization = await this.userStore.addPortfolio(input);
    this.productState = await this.buildProductFromPersonalization(personalization, "portfolio-update");
    this.emitStateImmediate();
    return this.productState;
  }

  async addNotificationRule(rule: NotificationRuleInput): Promise<ProductDashboardState> {
    const personalization = await this.userStore.addNotificationRule(rule);
    this.productState = { ...this.productState, personalization };
    this.emitStateImmediate();
    return this.productState;
  }

  async deleteUserData(): Promise<ProductDashboardState> {
    const personalization = await this.userStore.deleteAll();
    this.productState = createInitialProductDashboard(personalization);
    this.emitStateImmediate();
    return this.productState;
  }

  private getArcaneState(): ArcaneDashboardState {
    const key = this.arcaneAnalysisKey();
    let analysis = this.cachedArcaneAnalysis && this.cachedArcaneAnalysis.key === key ? this.cachedArcaneAnalysis.analysis : null;
    if (!analysis) {
      analysis = analyzeArcaneMarket(
        this.arcaneReference?.items ?? [],
        this.arcaneOrdersByItem,
        this.arcaneScannedAtByItem,
        this.arcaneReference?.packs,
      );
      this.cachedArcaneAnalysis = { key, analysis };
    }
    const reference = { ...analysis.reference };
    if (this.arcaneReference?.versionsUpdatedAt) reference.versionsUpdatedAt = this.arcaneReference.versionsUpdatedAt;
    return {
      ...analysis,
      generatedAt: new Date().toISOString(),
      reference,
      status: { ...this.arcaneStatus },
    };
  }

  private arcaneAnalysisKey(): string {
    return `${this.arcaneRevision}|${this.arcaneStatus.running ? "running" : "idle"}`;
  }

  private analysisKey(): string {
    return `${this.auctionsRevision}|${this.configRevision}`;
  }

  private scheduleNextRefreshAt(): void {
    const next = this.scanMode === "tiered" ? this.hotIntervalMs : this.refreshMs;
    this.status.nextRefreshAt = new Date(Date.now() + next).toISOString();
  }

  private async runRefresh(reason: string, tier: ScanTier): Promise<void> {
    const myGeneration = this.scanGeneration;
    const stillCurrent = () => this.scanGeneration === myGeneration && this.mode !== "remote";
    const startedAt = new Date().toISOString();
    this.status = {
      initialized: this.status.initialized,
      running: true,
      reason,
      startedAt,
      scannedWeapons: 0,
      totalWeapons: 0,
      lastMessage: "Loading Warframe.market reference data",
    };
    this.emitStateImmediate();

    try {
      if (!this.reference) {
        this.reference = await this.client.loadReference();
        if (!stillCurrent()) return;
        this.status.initialized = true;
        this.auctionsRevision += 1;
      }

      const targets = this.scanTargets(this.reference.rivenWeapons, tier);
      if (!stillCurrent()) return;
      this.status.totalWeapons = targets.length;
      const tierLabel = this.scanMode === "tiered" && tier !== "full" ? ` (${tier})` : "";
      this.status.lastMessage = targets.length === 0
        ? `No weapons matched the current watchlist${tierLabel}`
        : `Scanning ${targets.length} riven weapon auction books${tierLabel}`;
      this.emitStateImmediate();

      const scannedThisCycle: string[] = [];
      await this.runWithConcurrency(targets, async (weapon) => {
        if (!stillCurrent()) return;
        this.status.lastMessage = `Scanning ${weapon.name}${tierLabel}`;
        const auctions = await this.client.searchRivenAuctions(weapon.slug);
        if (!stillCurrent()) return;
        this.auctionsByWeapon.set(weapon.slug, auctions);
        this.scannedAtByWeapon.set(weapon.slug, new Date().toISOString());
        this.status.scannedWeapons += 1;
        this.auctionsRevision += 1;
        scannedThisCycle.push(weapon.slug);
        this.emitStateDebounced();
      });

      if (!stillCurrent()) return;
      this.persistScan(scannedThisCycle);

      this.status.running = false;
      this.status.finishedAt = new Date().toISOString();
      this.scheduleNextRefreshAt();
      this.status.lastMessage = `Finished ${reason} scan: ${this.status.scannedWeapons}/${this.status.totalWeapons} weapon books refreshed`;
      this.emitStateImmediate();
    } catch (error) {
      if (!stillCurrent()) return;
      this.status.running = false;
      this.status.finishedAt = new Date().toISOString();
      this.status.lastError = error instanceof Error ? error.message : String(error);
      this.status.lastMessage = `Refresh failed: ${this.status.lastError}`;
      this.emitStateImmediate();
    }
  }

  private async runArcaneRefresh(reason: string, tier: ScanTier): Promise<void> {
    const myGeneration = this.scanGeneration;
    const stillCurrent = () => this.scanGeneration === myGeneration && this.mode !== "remote";
    const startedAt = new Date().toISOString();
    this.arcaneStatus = {
      initialized: this.arcaneStatus.initialized,
      running: true,
      reason,
      startedAt,
      scannedWeapons: 0,
      totalWeapons: 0,
      lastMessage: "Loading Warframe.market arcane reference data",
    };
    this.emitStateImmediate();

    try {
      if (!this.arcaneReference) {
        this.arcaneReference = await this.client.loadArcaneReference();
        if (!stillCurrent()) return;
        this.arcaneStatus.initialized = true;
        this.arcaneRevision += 1;
      }

      const targets = this.arcaneScanTargets(this.arcaneReference.items, tier);
      if (!stillCurrent()) return;
      this.arcaneStatus.totalWeapons = targets.length;
      const tierLabel = this.scanMode === "tiered" && tier !== "full" ? ` (${tier})` : "";
      this.arcaneStatus.lastMessage = targets.length === 0
        ? `No arcanes matched the ${tier} scan`
        : `Scanning ${targets.length} arcane order books${tierLabel}`;
      this.emitStateImmediate();

      await this.runWithConcurrency(targets, async (item) => {
        if (!stillCurrent()) return;
        this.arcaneStatus.lastMessage = `Scanning ${item.name}${tierLabel}`;
        const orders = await this.client.searchArcaneOrders(item);
        if (!stillCurrent()) return;
        this.arcaneOrdersByItem.set(item.slug, orders);
        this.arcaneScannedAtByItem.set(item.slug, new Date().toISOString());
        this.arcaneStatus.scannedWeapons += 1;
        this.arcaneRevision += 1;
        this.emitStateDebounced();
      });

      if (!stillCurrent()) return;
      this.arcaneStatus.running = false;
      this.arcaneStatus.finishedAt = new Date().toISOString();
      this.arcaneStatus.nextRefreshAt = new Date(Date.now() + (this.scanMode === "tiered" ? this.hotIntervalMs : this.refreshMs)).toISOString();
      this.arcaneStatus.lastMessage = `Finished ${reason} scan: ${this.arcaneStatus.scannedWeapons}/${this.arcaneStatus.totalWeapons} arcane books refreshed`;
      delete this.arcaneStatus.lastError;
      this.emitStateImmediate();
    } catch (error) {
      if (!stillCurrent()) return;
      this.arcaneStatus.running = false;
      this.arcaneStatus.finishedAt = new Date().toISOString();
      this.arcaneStatus.lastError = error instanceof Error ? error.message : String(error);
      this.arcaneStatus.lastMessage = `Arcane refresh failed: ${this.arcaneStatus.lastError}`;
      this.emitStateImmediate();
    }
  }

  private persistScan(scannedSlugs: string[]): void {
    if (!this.history || scannedSlugs.length === 0 || !this.reference) return;
    const dispositionBySlug = new Map<string, number>();
    for (const weapon of this.reference.rivenWeapons) dispositionBySlug.set(weapon.slug, weapon.disposition);
    try {
      this.history.writeScan({
        tsSeconds: Math.floor(Date.now() / 1000),
        scannedSlugs,
        auctionsByWeapon: this.auctionsByWeapon,
        dispositionBySlug,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status.lastError = `history write failed: ${message}`;
    }
  }

  private scanTargets(weapons: RivenWeapon[], tier: ScanTier): RivenWeapon[] {
    const requested = this.config.watchlist.map(slugify);
    let candidates: RivenWeapon[];
    if (requested.length === 0) {
      candidates = this.config.scanAllWhenWatchlistEmpty ? weapons : [];
    } else {
      const requestedSet = new Set(requested);
      candidates = weapons.filter((weapon) => {
        const nameSlug = slugify(weapon.name);
        for (const request of requestedSet) {
          if (weapon.slug === request || nameSlug === request || weapon.slug.includes(request) || nameSlug.includes(request)) return true;
        }
        return false;
      });
    }
    if (this.weaponLimit !== null && this.weaponLimit > 0) candidates = candidates.slice(0, this.weaponLimit);
    if (this.scanMode !== "tiered" || tier === "full") return candidates;
    if (requested.length > 0) return candidates;
    return tier === "hot" ? this.pickHot(candidates) : this.pickCold(candidates);
  }

  private pickHot(pool: RivenWeapon[]): RivenWeapon[] {
    if (pool.length === 0) return [];
    const oppSlugs = new Set(
      (this.cachedAnalysis?.analysis.opportunities ?? []).map((opportunity) => opportunity.weaponSlug),
    );
    const now = Date.now();
    const rescanThresholdMs = HOT_SCORE_MIN_HOURS_BETWEEN_RESCANS * 60 * 60_000;
    const scored = pool.map((weapon) => {
      let score = 0;
      if (oppSlugs.has(weapon.slug)) score += 10;
      const listings = this.auctionsByWeapon.get(weapon.slug)?.length ?? 0;
      if (listings > 0) score += Math.min(2, Math.log2(listings + 1) / 4);
      const lastScan = this.scannedAtByWeapon.get(weapon.slug);
      if (!lastScan) score += 1.5;
      else {
        const ageMs = now - Date.parse(lastScan);
        if (Number.isFinite(ageMs) && ageMs > rescanThresholdMs) score += 0.5;
      }
      return { weapon, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(this.hotSize, scored.length)).map((entry) => entry.weapon);
  }

  private pickCold(pool: RivenWeapon[]): RivenWeapon[] {
    if (pool.length === 0) return [];
    const hotSet = new Set(this.pickHot(pool).map((weapon) => weapon.slug));
    const cold = pool.filter((weapon) => !hotSet.has(weapon.slug));
    if (cold.length === 0) return [];
    const size = Math.min(this.coldSliceSize, cold.length);
    const start = ((this.coldCursor % cold.length) + cold.length) % cold.length;
    const slice: RivenWeapon[] = [];
    for (let i = 0; i < size; i += 1) {
      const item = cold[(start + i) % cold.length];
      if (item !== undefined) slice.push(item);
    }
    this.coldCursor = (start + size) % cold.length;
    return slice;
  }

  private arcaneScanTargets(items: ArcaneItem[], tier: ScanTier): ArcaneItem[] {
    if (this.scanMode !== "tiered" || tier === "full") return items;
    return tier === "hot" ? this.pickHotArcanes(items) : this.pickColdArcanes(items);
  }

  private pickHotArcanes(pool: ArcaneItem[]): ArcaneItem[] {
    if (pool.length === 0) return [];
    const now = Date.now();
    const rescanThresholdMs = HOT_SCORE_MIN_HOURS_BETWEEN_RESCANS * 60 * 60_000;
    const scored = pool.map((item) => {
      let score = ARCANE_HOT_TARGET_PRIORITY[item.slug] ?? 0;
      const orders = this.arcaneOrdersByItem.get(item.slug)?.length ?? 0;
      if (orders > 0) score += Math.min(5, Math.log2(orders + 1));
      if (item.dissolutionVosfor !== undefined) score += Math.min(4, item.dissolutionVosfor / 24);
      const lastScan = this.arcaneScannedAtByItem.get(item.slug);
      if (!lastScan) score += 10;
      else {
        const ageMs = now - Date.parse(lastScan);
        if (Number.isFinite(ageMs) && ageMs > rescanThresholdMs) score += 2;
      }
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(this.hotSize, scored.length)).map((entry) => entry.item);
  }

  private pickColdArcanes(pool: ArcaneItem[]): ArcaneItem[] {
    if (pool.length === 0) return [];
    const hotSet = new Set(this.pickHotArcanes(pool).map((item) => item.slug));
    const cold = pool.filter((item) => !hotSet.has(item.slug));
    if (cold.length === 0) return [];
    const size = Math.min(this.coldSliceSize, cold.length);
    const start = ((this.arcaneColdCursor % cold.length) + cold.length) % cold.length;
    const slice: ArcaneItem[] = [];
    for (let i = 0; i < size; i += 1) {
      const item = cold[(start + i) % cold.length];
      if (item !== undefined) slice.push(item);
    }
    this.arcaneColdCursor = (start + size) % cold.length;
    return slice;
  }

  private async runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
    let cursor = 0;
    const workerCount = Math.min(this.concurrency, items.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        if (item !== undefined) await worker(item);
      }
    });
    await Promise.all(workers);
  }

  private emitStateImmediate(): void {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = undefined;
    }
    this.deliverState();
  }

  private emitStateDebounced(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined;
      this.deliverState();
    }, this.emitDebounceMs);
  }

  private deliverState(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}

function inferRemoteBase(dataUrl: string | undefined): string | undefined {
  if (!dataUrl) return undefined;
  return dataUrl
    .replace(/\/latest\/state\.json$/, "")
    .replace(/\/latest\/opportunities\.json$/, "")
    .replace(/\/state\.json$/, "");
}

function cacheBustedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("_", Date.now().toString());
    return parsed.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
  }
}

function runNowArtifactKey(artifact: RunNowLiveArtifact): string {
  return [
    artifact.generatedAt,
    artifact.live.lastSuccessAt ?? "",
    artifact.runNow.activities.map((activity) => `${activity.id}:${activity.expiresAt ?? ""}`).join(","),
    artifact.runNow.rejectedActivities.length.toString(),
  ].join("|");
}

