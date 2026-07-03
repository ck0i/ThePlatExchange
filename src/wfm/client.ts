import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compact, isRecord, readArray, readBooleanWithDefault, readNullableNumber, readNumberWithDefault, readRecord, readString, readStringWithDefault } from "./guards.js";
import { delay, TokenBucket } from "./rateLimit.js";
import type { AuctionAttribute, AuctionOwner, ReferenceSnapshot, RivenAttribute, RivenAuction, RivenWeapon, SellerStatus } from "./types.js";

type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

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
  cacheDir: ".cache/wf-riventrader",
  ratePerSecond: 3,
  burst: 20,
  maxRetries: 6,
  userAgent: "wf-riventrader-ts/0.1 (public API, cached, rate-limited)",
};

export class WarframeMarketClient {
  readonly baseUrl: string;
  private readonly cacheDir: string;
  private readonly bucket: TokenBucket;
  private readonly maxRetries: number;
  private readonly headers: Record<string, string>;
  private readonly fetcher: Fetcher;

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
      return cached;
    }

    const weaponsPromise = this.rivenWeapons();
    const attributesPromise = this.rivenAttributes();
    const [rivenWeapons, rivenAttributes] = await Promise.all([weaponsPromise, attributesPromise]);
    if (rivenWeapons.length === 0 || rivenAttributes.length === 0) {
      if (cached && isUsableReferenceCache(cached)) return cached;
      throw new Error("refusing to overwrite reference cache with empty Warframe.market riven reference payloads");
    }

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

  async searchRivenAuctions(weaponSlug: string): Promise<RivenAuction[]> {
    const payload = await this.getV1("/v1/auctions/search", {
      type: "riven",
      weapon_url_name: weaponSlug,
      sort_by: "price_asc",
      buyout_policy: "direct",
    });
    if (!isRecord(payload)) return [];
    return compact(readArray(payload, "auctions").map(parseRivenAuction));
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
        return response.json();
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await delay(250 * 2 ** attempt + Math.random() * 250);
      }
    }
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
  if (icon) weapon.icon = icon;
  if (thumb) weapon.thumb = thumb;
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
