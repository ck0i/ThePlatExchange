import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compact, isRecord, readArray, readBoolean, readBooleanWithDefault, readNullableNumber, readNumber, readNumberWithDefault, readRecord, readString, readStringArray, readStringWithDefault } from "./guards.js";
import { delay, TokenBucket } from "./rateLimit.js";
import { ARCANE_DISSOLUTION_SOURCE_URL, arcanePackDefinitions, mergeArcaneWikiData, parseArcaneWikiData } from "./arcanes.js";
import type { ParsedArcaneWikiEntry } from "./arcanes.js";
import type { ArcaneItem, ArcaneOrder, ArcaneReferenceSnapshot, AuctionAttribute, AuctionOwner, ReferenceSnapshot, RivenAttribute, RivenAuction, RivenWeapon, SellerStatus } from "./types.js";
import { enrichWeaponsWithImageNames, fetchWarframestatImageMap } from "./warframestat.js";

type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

export interface MarketItem {
  id: string;
  slug: string;
  name: string;
  tags: string[];
  tradable: boolean;
  bulkTradable: boolean;
  maxRank?: number;
  ducats?: number;
  tradingTax?: number;
  gameRef?: string;
  icon?: string;
  thumb?: string;
  imageName?: string;
}

export interface WarframeMarketHealth {
  userAgent: string;
  orderCacheEntries: number;
  itemCatalogLoadedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailure?: string;
}


interface ClientOptions {
  baseUrl: string;
  cacheDir: string;
  ratePerSecond: number;
  burst: number;
  maxRetries: number;
  userAgent: string;
}

export interface WarframeMarketClientOptions extends Partial<ClientOptions> {
  fetcher?: Fetcher;
}


interface VersionInfo {
  collections: Record<string, string>;
  updatedAt?: string;
}

const DEFAULT_OPTIONS: ClientOptions = {
  baseUrl: "https://api.warframe.market",
  cacheDir: ".cache/the-plat-exchange",
  ratePerSecond: 3,
  burst: 20,
  maxRetries: 6,
  userAgent: "the-plat-exchange-ts/0.1 (public API, cached, rate-limited)",
};
const RIVEN_AUCTION_SEARCH_CAP = 500;
const MAX_REASONABLE_RIVEN_BUYOUT = 100_000;
const RIVEN_AUCTION_SORTS = ["price_asc", "price_desc"] as const;

export class WarframeMarketClient {
  readonly baseUrl: string;
  private readonly cacheDir: string;
  private readonly bucket: TokenBucket;
  private readonly maxRetries: number;
  private readonly headers: Record<string, string>;
  private readonly fetcher: Fetcher;
  private marketItemsCache: { version: string | undefined; loadedAt: string; items: MarketItem[] } | null = null;
  private marketItemsInflight: Promise<MarketItem[]> | null = null;
  private readonly itemOrderCache = new Map<string, { expiresAt: number; fetchedAt: string; orders: ArcaneOrder[] }>();
  private readonly itemOrderInflight = new Map<string, Promise<ArcaneOrder[]>>();
  private lastSuccessAt: string | undefined;
  private lastFailureAt: string | undefined;
  private lastFailure: string | undefined;


  constructor(options: WarframeMarketClientOptions = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    this.baseUrl = merged.baseUrl;
    this.cacheDir = merged.cacheDir;
    this.fetcher = options.fetcher ?? fetch;
    this.bucket = new TokenBucket(merged.ratePerSecond, merged.burst);
    this.maxRetries = merged.maxRetries;
    this.headers = {
      "User-Agent": merged.userAgent,
      Language: "en",
      Platform: "pc",
      Crossplay: "true",
      Accept: "application/json",
    };
  }

  async loadReference(): Promise<ReferenceSnapshot> {
    const cached = await this.readReferenceCache();
    let versionInfo: VersionInfo;
    try {
      versionInfo = await this.versions();
    } catch (error) {
      if (cached && isUsableReferenceCache(cached)) return cached;
      throw error;
    }

    if (cached && referenceCacheMatches(cached, versionInfo)) {
      await this.backfillImageNames(cached);
      return cached;
    }

    const weaponsPromise = this.rivenWeapons();
    const attributesPromise = this.rivenAttributes();
    const [rivenWeapons, rivenAttributes] = await Promise.all([weaponsPromise, attributesPromise]);
    if (rivenWeapons.length === 0 || rivenAttributes.length === 0) {
      if (cached && isUsableReferenceCache(cached)) return cached;
      throw new Error("refusing to overwrite reference cache with empty Warframe.market riven reference payloads");
    }

    try {
      const imageMap = await fetchWarframestatImageMap(this.headers["User-Agent"] ?? "the-plat-exchange/0.1");
      enrichWeaponsWithImageNames(rivenWeapons, imageMap);
    } catch {
      // non-fatal — reference works without images
    }
    // fall-through to snapshot build below

    const snapshot: ReferenceSnapshot = {
      versions: versionInfo.collections,
      rivenWeapons,
      rivenAttributes,
      loadedAt: new Date().toISOString(),
    };
    if (versionInfo.updatedAt) snapshot.versionsUpdatedAt = versionInfo.updatedAt;

    await this.writeReferenceCache(snapshot);
    return snapshot;
  }

  async versions(): Promise<VersionInfo> {
    const payload = await this.getV2("/v2/versions");
    if (!isRecord(payload)) return { collections: {} };
    const collectionsRecord = readRecord(payload, "collections") ?? {};
    const collections: Record<string, string> = {};
    for (const [key, value] of Object.entries(collectionsRecord)) {
      if (typeof value === "string") collections[key] = value;
    }
    const info: VersionInfo = { collections };
    const updatedAt = readString(payload, "updatedAt");
    if (updatedAt) info.updatedAt = updatedAt;
    return info;
  }

  async rivenWeapons(): Promise<RivenWeapon[]> {
    const payload = await this.getV2("/v2/riven/weapons");
    return Array.isArray(payload) ? compact(payload.map(parseRivenWeapon)) : [];
  }

  async rivenAttributes(): Promise<RivenAttribute[]> {
    const payload = await this.getV2("/v2/riven/attributes");
    return Array.isArray(payload) ? compact(payload.map(parseRivenAttribute)) : [];
  }

  async marketItems(): Promise<MarketItem[]> {
    if (this.marketItemsInflight) return this.marketItemsInflight;
    this.marketItemsInflight = this.loadMarketItems();
    try {
      return await this.marketItemsInflight;
    } finally {
      this.marketItemsInflight = null;
    }
  }

  async topItemOrders(slug: string, rank = 0, ttlMs = 60_000): Promise<ArcaneOrder[]> {
    const normalizedRank = Math.max(0, Math.floor(rank));
    const key = `${slug}::${normalizedRank}`;
    const now = Date.now();
    const cached = this.itemOrderCache.get(key);
    if (cached && cached.expiresAt > now) return cached.orders.map((order) => ({ ...order, user: { ...order.user } }));
    const inflight = this.itemOrderInflight.get(key);
    if (inflight) return inflight;
    const promise = this.fetchTopItemOrders(slug, normalizedRank, ttlMs);
    this.itemOrderInflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.itemOrderInflight.delete(key);
    }
  }

  health(): WarframeMarketHealth {
    const health: WarframeMarketHealth = {
      userAgent: this.headers["User-Agent"] ?? "the-plat-exchange",
      orderCacheEntries: this.itemOrderCache.size,
    };
    if (this.marketItemsCache?.loadedAt) health.itemCatalogLoadedAt = this.marketItemsCache.loadedAt;
    if (this.lastSuccessAt) health.lastSuccessAt = this.lastSuccessAt;
    if (this.lastFailureAt) health.lastFailureAt = this.lastFailureAt;
    if (this.lastFailure) health.lastFailure = this.lastFailure;
    return health;
  }

  async searchRivenAuctions(weaponSlug: string): Promise<RivenAuction[]> {
    const asc = await this.searchRivenAuctionsSorted(weaponSlug, "price_asc");
    const books = asc.length >= RIVEN_AUCTION_SEARCH_CAP
      ? [asc, await this.searchRivenAuctionsSorted(weaponSlug, "price_desc")]
      : [asc];
    const merged = new Map<string, RivenAuction>();
    for (const book of books) {
      for (const auction of book) {
        if (auction.buyoutPrice >= MAX_REASONABLE_RIVEN_BUYOUT) continue;
        if (!merged.has(auction.id)) merged.set(auction.id, auction);
      }
    }
    return [...merged.values()];
  }

  private async searchRivenAuctionsSorted(weaponSlug: string, sortBy: typeof RIVEN_AUCTION_SORTS[number]): Promise<RivenAuction[]> {
    const payload = await this.getV1("/v1/auctions/search", {
      type: "riven",
      weapon_url_name: weaponSlug,
      sort_by: sortBy,
      buyout_policy: "direct",
    });
    if (!isRecord(payload)) return [];
    return compact(readArray(payload, "auctions").map(parseRivenAuction));
  }

  async loadArcaneReference(): Promise<ArcaneReferenceSnapshot> {
    const cached = await this.readArcaneReferenceCache();
    let versionInfo: VersionInfo;
    try {
      versionInfo = await this.versions();
    } catch (error) {
      if (cached && isUsableArcaneReferenceCache(cached)) return cached;
      throw error;
    }

    if (cached && arcaneReferenceCacheMatches(cached, versionInfo)) return cached;

    const items = await this.arcaneItems();
    if (items.length === 0) {
      if (cached && isUsableArcaneReferenceCache(cached)) return cached;
      throw new Error("refusing to overwrite arcane reference cache with an empty Warframe.market item payload");
    }

    let enrichedItems = items;
    try {
      const wikiEntries = await this.fetchArcaneWikiData();
      enrichedItems = mergeArcaneWikiData(items, wikiEntries);
    } catch {
      if (cached && cached.items.some((item) => item.dissolutionVosfor !== undefined)) {
        const cachedBySlug = new Map(cached.items.map((item) => [item.slug, item]));
        enrichedItems = items.map((item) => {
          const prior = cachedBySlug.get(item.slug);
          if (!prior) return item;
          return {
            ...item,
            ...(prior.dissolutionVosfor !== undefined ? { dissolutionVosfor: prior.dissolutionVosfor } : {}),
            ...(prior.cannotDissolve ? { cannotDissolve: true } : {}),
            ...(prior.imageName ? { imageName: prior.imageName } : {}),
          };
        });
      }
    }

    const snapshot: ArcaneReferenceSnapshot = {
      versions: versionInfo.collections,
      items: enrichedItems,
      packs: arcanePackDefinitions(),
      loadedAt: new Date().toISOString(),
    };
    if (versionInfo.updatedAt) snapshot.versionsUpdatedAt = versionInfo.updatedAt;
    await this.writeArcaneReferenceCache(snapshot);
    return snapshot;
  }

  async arcaneItems(): Promise<ArcaneItem[]> {
    return compact((await this.marketItems()).map(arcaneItemFromMarketItem))
      .filter((item) => item.tags.includes("arcane_enhancement") && (item.tradable || item.bulkTradable));
  }

  async searchArcaneOrders(item: ArcaneItem): Promise<ArcaneOrder[]> {
    const ranks = item.maxRank > 0 ? [0, item.maxRank] : [0];
    const orders: ArcaneOrder[] = [];
    for (const rank of ranks) orders.push(...await this.topItemOrders(item.slug, rank));
    return orders;
  }

  private async loadMarketItems(): Promise<MarketItem[]> {
    const versionInfo = await this.versions().catch((): VersionInfo => ({ collections: {} }));
    const version = versionInfo.collections.items;
    if (this.marketItemsCache && (!version || this.marketItemsCache.version === version)) {
      return this.marketItemsCache.items.map((item) => ({ ...item, tags: [...item.tags] }));
    }
    const payload = await this.getV2("/v2/items");
    const items = Array.isArray(payload) ? compact(payload.map(parseMarketItem)) : [];
    if (items.length === 0 && this.marketItemsCache) return this.marketItemsCache.items.map((item) => ({ ...item, tags: [...item.tags] }));
    if (items.length === 0) throw new Error("refusing to cache empty Warframe.market item catalog");
    this.marketItemsCache = { version, loadedAt: new Date().toISOString(), items };
    return items.map((item) => ({ ...item, tags: [...item.tags] }));
  }

  private async fetchTopItemOrders(slug: string, rank: number, ttlMs: number): Promise<ArcaneOrder[]> {
    const key = `${slug}::${rank}`;
    const payload = await this.getV2(`/v2/orders/item/${encodeURIComponent(slug)}/top`, { rank });
    const orders = isRecord(payload)
      ? [
        ...compact(readArray(payload, "sell").map((order) => parseArcaneOrder(order, rank))),
        ...compact(readArray(payload, "buy").map((order) => parseArcaneOrder(order, rank))),
      ]
      : [];
    this.itemOrderCache.set(key, { expiresAt: Date.now() + ttlMs, fetchedAt: new Date().toISOString(), orders });
    return orders.map((order) => ({ ...order, user: { ...order.user } }));
  }

  private async backfillImageNames(snapshot: ReferenceSnapshot): Promise<void> {
    if (!snapshot.rivenWeapons.some((weapon) => !weapon.imageName)) return;
    try {
      const imageMap = await fetchWarframestatImageMap(this.headers["User-Agent"] ?? "the-plat-exchange/0.1");
      const matched = enrichWeaponsWithImageNames(snapshot.rivenWeapons, imageMap);
      if (matched > 0) await this.writeReferenceCache(snapshot);
    } catch {
      // non-fatal
    }
  }

  private async readReferenceCache(): Promise<ReferenceSnapshot | null> {
    try {
      const raw = await readFile(join(this.cacheDir, "reference.json"), "utf8");
      const parsed: unknown = JSON.parse(raw);
      return parseReferenceSnapshot(parsed);
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") return null;
      return null;
    }
  }

  private async writeReferenceCache(snapshot: ReferenceSnapshot): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const cachePath = join(this.cacheDir, "reference.json");
    const tempPath = join(this.cacheDir, `reference.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tempPath, JSON.stringify(snapshot, null, 2), "utf8");
    await rename(tempPath, cachePath);
  }

  private async readArcaneReferenceCache(): Promise<ArcaneReferenceSnapshot | null> {
    try {
      const raw = await readFile(join(this.cacheDir, "arcane-reference.json"), "utf8");
      const parsed: unknown = JSON.parse(raw);
      return parseArcaneReferenceSnapshot(parsed);
    } catch (error) {
      if (isRecord(error) && error.code === "ENOENT") return null;
      return null;
    }
  }

  private async writeArcaneReferenceCache(snapshot: ArcaneReferenceSnapshot): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const cachePath = join(this.cacheDir, "arcane-reference.json");
    const tempPath = join(this.cacheDir, `arcane-reference.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tempPath, JSON.stringify(snapshot, null, 2), "utf8");
    await rename(tempPath, cachePath);
  }

  private async fetchArcaneWikiData(): Promise<Map<string, ParsedArcaneWikiEntry>> {
    const url = new URL(`${ARCANE_DISSOLUTION_SOURCE_URL}?action=raw`);
    await this.bucket.take();
    const response = await this.fetcher(url, {
      headers: {
        "User-Agent": this.headers["User-Agent"] ?? "the-plat-exchange-ts/0.1",
        Accept: "text/plain, text/x-wiki;q=0.9, */*;q=0.1",
      },
    });
    if (!response.ok) throw new Error(`Arcane wiki data ${response.status}`);
    return parseArcaneWikiData(await response.text());
  }

  private async getV2(path: string, params?: Record<string, string | number | boolean>): Promise<unknown> {
    const body = await this.getJson(path, params);
    return unwrapEnvelope(body, "data", path);
  }

  private async getV1(path: string, params?: Record<string, string | number | boolean>): Promise<unknown> {
    const body = await this.getJson(path, params);
    return unwrapEnvelope(body, "payload", path);
  }

  private async getJson(path: string, params?: Record<string, string | number | boolean>): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, String(value));
    }

    let lastError = "unknown error";
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      await this.bucket.take();
      try {
        const response = await this.fetcher(url, { headers: this.headers });
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterSeconds = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
          const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 2 ** attempt * 1000;
          await delay(retryDelay + Math.random() * 500);
          continue;
        }
        if (!response.ok) {
          lastError = `${response.status} ${response.statusText} ${await response.text().catch(() => "")}`.trim();
          await delay(250 * 2 ** attempt + Math.random() * 250);
          continue;
        }
        this.lastSuccessAt = new Date().toISOString();
        return response.json();
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await delay(250 * 2 ** attempt + Math.random() * 250);
      }
    }
    this.lastFailureAt = new Date().toISOString();
    this.lastFailure = `${url.pathname}: ${lastError}`;
    throw new Error(`exhausted Warframe.market retries for ${url.pathname}: ${lastError}`);
  }
}

function unwrapEnvelope(body: unknown, key: "data" | "payload", path: string): unknown {
  if (!isRecord(body)) return body;
  const errorValue = body.error;
  if (errorValue !== undefined && errorValue !== null && errorValue !== false) {
    throw new Error(`Warframe.market error on ${path}: ${JSON.stringify(errorValue)}`);
  }
  const payload = body[key];
  return payload === undefined ? body : payload;
}

function parseReferenceSnapshot(value: unknown): ReferenceSnapshot | null {
  if (!isRecord(value)) return null;
  const versionsRecord = readRecord(value, "versions") ?? {};
  const versions: Record<string, string> = {};
  for (const [key, entry] of Object.entries(versionsRecord)) {
    if (typeof entry === "string") versions[key] = entry;
  }
  const rivenWeapons = compact(readArray(value, "rivenWeapons").map(parseRivenWeapon));
  const rivenAttributes = compact(readArray(value, "rivenAttributes").map(parseRivenAttribute));
  const loadedAt = readStringWithDefault(value, "loadedAt", new Date(0).toISOString());
  const snapshot: ReferenceSnapshot = { versions, rivenWeapons, rivenAttributes, loadedAt };
  const versionsUpdatedAt = readString(value, "versionsUpdatedAt");
  if (versionsUpdatedAt) snapshot.versionsUpdatedAt = versionsUpdatedAt;
  return snapshot;
}

function parseArcaneReferenceSnapshot(value: unknown): ArcaneReferenceSnapshot | null {
  if (!isRecord(value)) return null;
  const versionsRecord = readRecord(value, "versions") ?? {};
  const versions: Record<string, string> = {};
  for (const [key, entry] of Object.entries(versionsRecord)) {
    if (typeof entry === "string") versions[key] = entry;
  }
  const items = compact(readArray(value, "items").map(parseArcaneItem));
  const loadedAt = readStringWithDefault(value, "loadedAt", new Date(0).toISOString());
  const packs = readArray(value, "packs").length > 0 ? value.packs as ArcaneReferenceSnapshot["packs"] : arcanePackDefinitions();
  const snapshot: ArcaneReferenceSnapshot = { versions, items, packs, loadedAt };
  const versionsUpdatedAt = readString(value, "versionsUpdatedAt");
  if (versionsUpdatedAt) snapshot.versionsUpdatedAt = versionsUpdatedAt;
  return snapshot;
}

function isUsableArcaneReferenceCache(cache: ArcaneReferenceSnapshot): boolean {
  return cache.items.length > 0 && cache.packs.length > 0;
}

function arcaneReferenceCacheMatches(cache: ArcaneReferenceSnapshot, versionInfo: VersionInfo): boolean {
  const liveItemHash = versionInfo.collections.items;
  if (!liveItemHash) return isUsableArcaneReferenceCache(cache);
  return isUsableArcaneReferenceCache(cache) && cache.versions.items === liveItemHash;
}


function isUsableReferenceCache(cache: ReferenceSnapshot): boolean {
  return cache.rivenWeapons.length > 0 && cache.rivenAttributes.length > 0;
}

function referenceCacheMatches(cache: ReferenceSnapshot, versionInfo: VersionInfo): boolean {
  const liveRivenHash = versionInfo.collections.rivens;
  if (!liveRivenHash) return isUsableReferenceCache(cache);
  return isUsableReferenceCache(cache) && cache.versions.rivens === liveRivenHash;
}

function parseRivenWeapon(value: unknown): RivenWeapon | null {
  if (!isRecord(value)) return null;
  const slug = readString(value, "slug");
  if (!slug) return null;
  const i18n = readRecord(value, "i18n");
  const en = i18n ? readRecord(i18n, "en") : undefined;
  const cachedName = readString(value, "name");
  const weapon: RivenWeapon = {
    id: readStringWithDefault(value, "id", slug),
    slug,
    name: cachedName ?? (en ? readStringWithDefault(en, "name", titleFromSlug(slug)) : titleFromSlug(slug)),
    group: readStringWithDefault(value, "group", "unknown"),
    rivenType: readStringWithDefault(value, "rivenType", "unknown"),
    disposition: readNumberWithDefault(value, "disposition", 1),
    reqMasteryRank: readNumberWithDefault(value, "reqMasteryRank", 0),
  };
  const icon = readString(value, "icon") ?? (en ? readString(en, "icon") : undefined);
  const thumb = readString(value, "thumb") ?? (en ? readString(en, "thumb") : undefined);
  const imageName = readString(value, "imageName");
  if (icon) weapon.icon = icon;
  if (thumb) weapon.thumb = thumb;
  if (imageName) weapon.imageName = imageName;
  return weapon;
}

function parseRivenAttribute(value: unknown): RivenAttribute | null {
  if (!isRecord(value)) return null;
  const slug = readString(value, "slug");
  if (!slug) return null;
  const i18n = readRecord(value, "i18n");
  const en = i18n ? readRecord(i18n, "en") : undefined;
  return {
    id: readStringWithDefault(value, "id", slug),
    slug,
    group: readStringWithDefault(value, "group", "unknown"),
    prefix: readStringWithDefault(value, "prefix", ""),
    suffix: readStringWithDefault(value, "suffix", ""),
    name: readString(value, "name") ?? (en ? readStringWithDefault(en, "name", titleFromSlug(slug)) : titleFromSlug(slug)),
  };
}

function parseMarketItem(value: unknown): MarketItem | null {
  if (!isRecord(value)) return null;
  const slug = readString(value, "slug");
  if (!slug) return null;
  const i18n = readRecord(value, "i18n");
  const en = i18n ? readRecord(i18n, "en") : undefined;
  const item: MarketItem = {
    id: readStringWithDefault(value, "id", slug),
    slug,
    name: readString(value, "name") ?? (en ? readStringWithDefault(en, "name", titleFromSlug(slug)) : titleFromSlug(slug)),
    tags: readStringArray(value, "tags"),
    tradable: readBoolean(value, "tradable") ?? true,
    bulkTradable: readBoolean(value, "bulkTradable") ?? false,
  };
  const maxRank = readNumber(value, "maxRank");
  const ducats = readNumber(value, "ducats");
  const tradingTax = readNumber(value, "tradingTax");
  const gameRef = readString(value, "gameRef");
  const icon = readString(value, "icon") ?? (en ? readString(en, "icon") : undefined);
  const thumb = readString(value, "thumb") ?? (en ? readString(en, "thumb") : undefined);
  const imageName = readString(value, "imageName");
  if (maxRank !== undefined) item.maxRank = Math.max(0, Math.floor(maxRank));
  if (ducats !== undefined) item.ducats = ducats;
  if (tradingTax !== undefined) item.tradingTax = tradingTax;
  if (gameRef) item.gameRef = gameRef;
  if (icon) item.icon = icon;
  if (thumb) item.thumb = thumb;
  if (imageName) item.imageName = imageName;
  return item;
}

function arcaneItemFromMarketItem(marketItem: MarketItem): ArcaneItem | null {
  if (!marketItem.tags.includes("arcane_enhancement")) return null;
  return {
    id: marketItem.id,
    slug: marketItem.slug,
    name: marketItem.name,
    tags: [...marketItem.tags],
    rarity: parseArcaneRarity(undefined, marketItem.tags),
    maxRank: marketItem.maxRank ?? 5,
    tradable: marketItem.tradable,
    bulkTradable: marketItem.bulkTradable,
    tradingTax: marketItem.tradingTax ?? 0,
    ...(marketItem.gameRef ? { gameRef: marketItem.gameRef } : {}),
    ...(marketItem.icon ? { icon: marketItem.icon } : {}),
    ...(marketItem.thumb ? { thumb: marketItem.thumb } : {}),
    ...(marketItem.imageName ? { imageName: marketItem.imageName } : {}),
  };
}

function parseArcaneItem(value: unknown): ArcaneItem | null {
  if (!isRecord(value)) return null;
  const slug = readString(value, "slug");
  if (!slug) return null;
  const tags = readStringArray(value, "tags");
  if (!tags.includes("arcane_enhancement")) return null;
  const i18n = readRecord(value, "i18n");
  const en = i18n ? readRecord(i18n, "en") : undefined;
  const name = readString(value, "name") ?? (en ? readStringWithDefault(en, "name", titleFromSlug(slug)) : titleFromSlug(slug));
  const tradable = readBoolean(value, "tradable");
  const bulkTradable = readBoolean(value, "bulkTradable");
  const item: ArcaneItem = {
    id: readStringWithDefault(value, "id", slug),
    slug,
    name,
    tags,
    rarity: parseArcaneRarity(readString(value, "rarity"), tags),
    maxRank: Math.max(0, Math.floor(readNumberWithDefault(value, "maxRank", 5))),
    tradable: tradable ?? true,
    bulkTradable: bulkTradable ?? true,
    tradingTax: readNumberWithDefault(value, "tradingTax", 0),
  };
  const gameRef = readString(value, "gameRef");
  const icon = readString(value, "icon") ?? (en ? readString(en, "icon") : undefined);
  const thumb = readString(value, "thumb") ?? (en ? readString(en, "thumb") : undefined);
  const imageName = readString(value, "imageName");
  const wikiLink = en ? readString(en, "wikiLink") : undefined;
  const dissolutionVosfor = readNumber(value, "dissolutionVosfor");
  if (gameRef) item.gameRef = gameRef;
  if (icon) item.icon = icon;
  if (thumb) item.thumb = thumb;
  if (imageName) item.imageName = imageName;
  if (wikiLink) item.wikiLink = wikiLink;
  if (dissolutionVosfor !== undefined) item.dissolutionVosfor = dissolutionVosfor;
  return item;
}

function parseArcaneOrder(value: unknown, fallbackRank = 0): ArcaneOrder | null {
  if (!isRecord(value)) return null;
  const id = readString(value, "id");
  const rawType = readString(value, "type");
  const userRecord = readRecord(value, "user");
  const platinum = readNumberWithDefault(value, "platinum", Number.NaN);
  if (!id || !userRecord || (rawType !== "sell" && rawType !== "buy") || !Number.isFinite(platinum) || platinum <= 0) return null;
  const perTrade = Math.max(1, Math.floor(readNumberWithDefault(value, "perTrade", 1)));
  return {
    id,
    type: rawType,
    platinum,
    unitPrice: Math.round((platinum / perTrade) * 1000) / 1000,
    quantity: Math.max(1, Math.floor(readNumberWithDefault(value, "quantity", 1))),
    perTrade,
    rank: Math.max(0, Math.floor(readNumberWithDefault(value, "rank", fallbackRank))),
    visible: readBooleanWithDefault(value, "visible", true),
    createdAt: readStringWithDefault(value, "createdAt", ""),
    updatedAt: readStringWithDefault(value, "updatedAt", ""),
    itemId: readStringWithDefault(value, "itemId", ""),
    user: parseArcaneOwner(userRecord),
  };
}

function parseArcaneOwner(record: Record<string, unknown>): AuctionOwner {
  const rawStatus = readString(record, "status");
  const owner: AuctionOwner = {
    id: readStringWithDefault(record, "id", ""),
    ingameName: readString(record, "ingameName") ?? readStringWithDefault(record, "ingame_name", "unknown"),
    slug: readStringWithDefault(record, "slug", "unknown"),
    reputation: readNumberWithDefault(record, "reputation", 0),
    status: parseSellerStatus(rawStatus),
    platform: readStringWithDefault(record, "platform", "pc"),
    crossplay: readBooleanWithDefault(record, "crossplay", true),
  };
  const lastSeen = readString(record, "lastSeen") ?? readString(record, "last_seen");
  if (lastSeen) owner.lastSeen = lastSeen;
  return owner;
}

function parseArcaneRarity(value: string | undefined, tags: readonly string[]): ArcaneItem["rarity"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "common" || normalized === "uncommon" || normalized === "rare" || normalized === "legendary") return normalized;
  for (const tag of tags) {
    if (tag === "common" || tag === "uncommon" || tag === "rare" || tag === "legendary") return tag;
  }
  return "unknown";
}

function parseRivenAuction(value: unknown): RivenAuction | null {
  if (!isRecord(value)) return null;
  const item = readRecord(value, "item");
  const ownerRecord = readRecord(value, "owner");
  if (!item || !ownerRecord) return null;
  const id = readString(value, "id");
  const weaponSlug = readString(item, "weapon_url_name");
  if (!id || !weaponSlug) return null;
  const attributes = compact(readArray(item, "attributes").map(parseAuctionAttribute));
  return {
    id,
    weaponSlug,
    name: readStringWithDefault(item, "name", "unnamed"),
    buyoutPrice: readNumberWithDefault(value, "buyout_price", 0),
    startingPrice: readNumberWithDefault(value, "starting_price", 0),
    topBid: readNullableNumber(value, "top_bid"),
    isDirectSell: readBooleanWithDefault(value, "is_direct_sell", false),
    visible: readBooleanWithDefault(value, "visible", true),
    closed: readBooleanWithDefault(value, "closed", false),
    platform: readStringWithDefault(value, "platform", "pc"),
    crossplay: readBooleanWithDefault(value, "crossplay", true),
    created: readStringWithDefault(value, "created", ""),
    updated: readStringWithDefault(value, "updated", ""),
    owner: parseOwner(ownerRecord),
    masteryLevel: readNumberWithDefault(item, "mastery_level", 0),
    modRank: readNumberWithDefault(item, "mod_rank", 0),
    reRolls: readNumberWithDefault(item, "re_rolls", 0),
    polarity: readStringWithDefault(item, "polarity", "unknown"),
    attributes,
    noteRaw: readStringWithDefault(value, "note_raw", ""),
  };
}

function parseOwner(record: Record<string, unknown>): AuctionOwner {
  const rawStatus = readString(record, "status");
  const owner: AuctionOwner = {
    id: readStringWithDefault(record, "id", ""),
    ingameName: readStringWithDefault(record, "ingame_name", "unknown"),
    slug: readStringWithDefault(record, "slug", "unknown"),
    reputation: readNumberWithDefault(record, "reputation", 0),
    status: parseSellerStatus(rawStatus),
    platform: readStringWithDefault(record, "platform", "pc"),
    crossplay: readBooleanWithDefault(record, "crossplay", true),
  };
  const lastSeen = readString(record, "last_seen");
  if (lastSeen) owner.lastSeen = lastSeen;
  return owner;
}

function parseAuctionAttribute(value: unknown): AuctionAttribute | null {
  if (!isRecord(value)) return null;
  const urlName = readString(value, "url_name");
  const attrValue = readNumberWithDefault(value, "value", Number.NaN);
  if (!urlName || Number.isNaN(attrValue)) return null;
  return {
    urlName,
    value: attrValue,
    positive: readBooleanWithDefault(value, "positive", true),
  };
}

function parseSellerStatus(value: string | undefined): SellerStatus {
  if (value === "ingame" || value === "online" || value === "offline") return value;
  return "unknown";
}

function titleFromSlug(slug: string): string {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
