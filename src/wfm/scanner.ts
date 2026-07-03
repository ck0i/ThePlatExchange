import { WarframeMarketClient } from "./client.js";
import { analyzeMarket, DEFAULT_CONFIG, normalizeConfig, slugify } from "./opportunities.js";
import type { DashboardState, ReferenceSnapshot, RivenAuction, RivenWeapon, ScanStatus, TraderConfig } from "./types.js";

export interface ScannerOptions {
  client: WarframeMarketClient;
  config?: Partial<TraderConfig>;
  refreshMs?: number;
  concurrency?: number;
  weaponLimit?: number | null;
}

type StateListener = (state: DashboardState) => void;

export class RivenTraderService {
  private readonly client: WarframeMarketClient;
  private readonly listeners = new Set<StateListener>();
  private readonly auctionsByWeapon = new Map<string, RivenAuction[]>();
  private readonly scannedAtByWeapon = new Map<string, string>();
  private reference: ReferenceSnapshot | null = null;
  private config: TraderConfig;
  private refreshTimer: NodeJS.Timeout | undefined;
  private activeRefresh: Promise<void> | null = null;
  private status: ScanStatus = {
    initialized: false,
    running: false,
    reason: "startup",
    scannedWeapons: 0,
    totalWeapons: 0,
    lastMessage: "Waiting for launch",
  };

  readonly refreshMs: number;
  readonly concurrency: number;
  readonly weaponLimit: number | null;

  constructor(options: ScannerOptions) {
    this.client = options.client;
    this.config = normalizeConfig(options.config ?? DEFAULT_CONFIG);
    this.refreshMs = Math.max(60_000, options.refreshMs ?? 60_000);
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
    this.weaponLimit = options.weaponLimit === undefined ? null : options.weaponLimit;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (!this.refreshTimer) {
      this.status.nextRefreshAt = new Date(Date.now() + this.refreshMs).toISOString();
      this.refreshTimer = setInterval(() => {
        this.status.nextRefreshAt = new Date(Date.now() + this.refreshMs).toISOString();
        void this.refresh("scheduled");
      }, this.refreshMs);
    }
    void this.refresh("startup");
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  updateConfig(update: Partial<TraderConfig>): TraderConfig {
    this.config = normalizeConfig({ ...this.config, ...update });
    this.emitState();
    return this.config;
  }

  async refresh(reason: string): Promise<void> {
    if (this.activeRefresh) {
      this.status.lastMessage = `Skipped overlapping ${reason} refresh; current ${this.status.reason} scan is still running`;
      this.emitState();
      return this.activeRefresh;
    }
    this.activeRefresh = this.runRefresh(reason);
    try {
      await this.activeRefresh;
    } finally {
      this.activeRefresh = null;
    }
  }

  getState(): DashboardState {
    const weapons = this.reference?.rivenWeapons ?? [];
    const analysis = analyzeMarket(weapons, this.auctionsByWeapon, this.config, this.scannedAtByWeapon);
    let auctionCount = 0;
    for (const auctions of this.auctionsByWeapon.values()) auctionCount += auctions.length;
    const reference: DashboardState["reference"] = {
      weapons: weapons.length,
      attributes: this.reference?.rivenAttributes.length ?? 0,
    };
    if (this.reference?.versionsUpdatedAt) reference.versionsUpdatedAt = this.reference.versionsUpdatedAt;
    return {
      generatedAt: new Date().toISOString(),
      refreshMs: this.refreshMs,
      apiBase: this.client.baseUrl,
      config: this.config,
      status: { ...this.status },
      reference,
      totals: {
        weaponsWithAuctions: this.auctionsByWeapon.size,
        auctions: auctionCount,
        opportunities: analysis.opportunities.length,
      },
      opportunities: analysis.opportunities,
      weaponSummaries: analysis.weaponSummaries,
    };
  }

  private async runRefresh(reason: string): Promise<void> {
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
    this.emitState();

    try {
      if (!this.reference) {
        this.reference = await this.client.loadReference();
        this.status.initialized = true;
      }

      const targets = this.scanTargets(this.reference.rivenWeapons);
      this.status.totalWeapons = targets.length;
      this.status.lastMessage = targets.length === 0 ? "No weapons matched the current watchlist" : `Scanning ${targets.length} riven weapon auction books`;
      this.emitState();

      await this.runWithConcurrency(targets, async (weapon) => {
        this.status.lastMessage = `Scanning ${weapon.name}`;
        const auctions = await this.client.searchRivenAuctions(weapon.slug);
        this.auctionsByWeapon.set(weapon.slug, auctions);
        this.scannedAtByWeapon.set(weapon.slug, new Date().toISOString());
        this.status.scannedWeapons += 1;
        this.emitState();
      });

      this.status.running = false;
      this.status.finishedAt = new Date().toISOString();
      this.status.nextRefreshAt = new Date(Date.now() + this.refreshMs).toISOString();
      this.status.lastMessage = `Finished ${reason} scan: ${this.status.scannedWeapons}/${this.status.totalWeapons} weapon books refreshed`;
      this.emitState();
    } catch (error) {
      this.status.running = false;
      this.status.finishedAt = new Date().toISOString();
      this.status.lastError = error instanceof Error ? error.message : String(error);
      this.status.lastMessage = `Refresh failed: ${this.status.lastError}`;
      this.emitState();
    }
  }

  private scanTargets(weapons: RivenWeapon[]): RivenWeapon[] {
    const requested = this.config.watchlist.map(slugify);
    let selected: RivenWeapon[];
    if (requested.length === 0) {
      selected = this.config.scanAllWhenWatchlistEmpty ? weapons : [];
    } else {
      const requestedSet = new Set(requested);
      selected = weapons.filter((weapon) => {
        const nameSlug = slugify(weapon.name);
        for (const request of requestedSet) {
          if (weapon.slug === request || nameSlug === request || weapon.slug.includes(request) || nameSlug.includes(request)) return true;
        }
        return false;
      });
    }
    if (this.weaponLimit !== null && this.weaponLimit > 0) return selected.slice(0, this.weaponLimit);
    return selected;
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

  private emitState(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}
