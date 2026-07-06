/*
 * scripts/scan-and-write.ts — one-shot CI scanner.
 *
 * Tiers:
 *   --tier hot: fetch /v2/versions; if the rivens hash differs from the
 *               cached reference, refetch weapons + attributes, diff
 *               dispositions, and write reference/current.json + events.
 *               ~1-2 API calls when nothing changed.
 *   --tier cold: full cold price scan. In default mode it publishes state.json,
 *                opportunities.json, samples/*.jsonl, signatures/*.jsonl,
 *                and rolls up 30-day valuations into valuations/latest.json.
 *                In shard mode it writes one partial JSON file; merge mode
 *                combines all shard partials and publishes the final files once.
 *   --tier reference: same as hot (kept for backward-compat with the old
 *                     reference-scan workflow).
 */
import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WarframeMarketClient } from "../src/wfm/client.js";
import { analyzeArcaneMarket } from "../src/wfm/arcanes.js";
import { attributeSignature, analyzeMarket, DEFAULT_CONFIG, normalizeConfig } from "../src/wfm/opportunities.js";
import type { ArcaneDashboardState, ArcaneItem, ArcaneOrder, ArcaneReferenceSnapshot, DashboardState, Opportunity, RivenAuction, RivenWeapon, ReferenceSnapshot, ScanStatus } from "../src/wfm/types.js";
import { enrichWeaponsWithImageNames, fetchWarframestatImageMap } from "../src/wfm/warframestat.js";

type Tier = "hot" | "cold" | "reference";
type ColdMode = "scan" | "shard" | "merge";

interface Args {
  tier: Tier;
  coldMode: ColdMode;
  dataDir: string;
  partialDir: string;
  shardId: number;
  shardCount: number;
  ratePerSecond: number;
  burst: number;
  concurrency: number;
  userAgent: string;
  valuationWindowDays: number;
  vanishThresholdDays: number;
  arcaneHotSize: number;
}

interface IndexFile {
  schema_version: 1;
  updated_at: string;
  tiers: {
    hot?: { last_run_at: string; version_hash?: string; reference_changed: boolean };
    cold?: { last_run_at: string; scanned_slugs: string[]; opportunity_count: number };
    reference?: { last_run_at: string; weapons: number; attributes: number; version_hash?: string };
    valuations?: { last_run_at: string; signature_count: number; window_days: number };
    arcanes?: { last_run_at: string; tier: Tier; scanned_slugs: string[]; item_count: number; recommendation_count: number; pack_count: number };
  };
}

interface CiStateExtras {
  schemaVersion: 1;
  tier: Tier;
  scannedWeaponSlugs: string[];
}

interface ScanFailure {
  slug: string;
  message: string;
}

interface RivenShardEntry {
  slug: string;
  scannedAt: string;
  auctions: RivenAuction[];
}

interface ArcaneShardEntry {
  slug: string;
  scannedAt: string;
  orders: ArcaneOrder[];
}

interface ColdShardPartial {
  schemaVersion: 1;
  tier: "cold";
  generatedAt: string;
  shard: { id: number; count: number };
  reference: {
    fingerprint: string;
    rivens: ReferenceSnapshot;
    arcanes: ArcaneReferenceSnapshot;
  };
  rivens: {
    total: number;
    assignedSlugs: string[];
    scanned: RivenShardEntry[];
    failures: ScanFailure[];
  };
  arcanes: {
    total: number;
    assignedSlugs: string[];
    scanned: ArcaneShardEntry[];
    failures: ScanFailure[];
  };
}

interface RivenScanResult {
  auctionsByWeapon: Map<string, RivenAuction[]>;
  scannedAtByWeapon: Map<string, string>;
  failures: ScanFailure[];
}

interface ArcaneScanResult {
  ordersByArcane: Map<string, ArcaneOrder[]>;
  scannedAtByArcane: Map<string, string>;
  failures: ScanFailure[];
}

function parseArgs(argv: string[], env: NodeJS.ProcessEnv): Args {
  const arg = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
  };
  const tierRaw = (arg("--tier") ?? env.WFM_TIER ?? "hot").toLowerCase();
  const tier: Tier = tierRaw === "cold" ? "cold" : tierRaw === "reference" ? "reference" : "hot";
  const coldMode = parseColdMode(arg("--cold-mode") ?? env.WFM_COLD_MODE ?? "scan");
  return {
    tier,
    coldMode,
    dataDir: arg("--data-dir") ?? env.WFM_DATA_DIR ?? "data",
    partialDir: arg("--partial-dir") ?? env.WFM_PARTIAL_DIR ?? "partials",
    shardId: integerOption(arg("--shard-id") ?? env.WFM_SHARD_ID, 0, "shard id"),
    shardCount: integerOption(arg("--shard-count") ?? env.WFM_SHARD_COUNT, 1, "shard count"),
    ratePerSecond: numberOr(env.WFM_RATE_PER_SEC, 2),
    burst: numberOr(env.WFM_BURST, 10),
    concurrency: positiveIntegerOption(env.WFM_CONCURRENCY, 3, "concurrency"),
    userAgent: env.WFM_USER_AGENT ?? "the-plat-exchange-ci/0.1 (+https://github.com/ck0i/ThePlatExchange)",
    valuationWindowDays: numberOr(env.WFM_VALUATION_WINDOW_DAYS, 30),
    vanishThresholdDays: numberOr(env.WFM_VELOCITY_VANISH_DAYS, 3),
    arcaneHotSize: numberOr(env.WFM_ARCANE_HOT_SIZE, 500),
  };
}

function numberOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseColdMode(value: string): ColdMode {
  const normalized = value.toLowerCase();
  if (normalized === "scan" || normalized === "shard" || normalized === "merge") return normalized;
  throw new Error(`unknown cold mode: ${value}`);
}

function integerOption(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function positiveIntegerOption(value: string | undefined, fallback: number, label: string): number {
  const parsed = integerOption(value, fallback, label);
  if (parsed < 1) throw new Error(`${label} must be at least 1`);
  return parsed;
}

function validateShardArgs(args: Args): void {
  if (args.shardCount < 1) throw new Error("shard count must be at least 1");
  if (args.shardId < 0 || args.shardId >= args.shardCount) {
    throw new Error(`shard id ${args.shardId} must be between 0 and ${args.shardCount - 1}`);
  }
}


function shardSlice<T>(items: readonly T[], shardId: number, shardCount: number): T[] {
  const start = Math.floor((items.length * shardId) / shardCount);
  const end = Math.floor((items.length * (shardId + 1)) / shardCount);
  return items.slice(start, end);
}


function referenceFingerprint(reference: ReferenceSnapshot, arcanes: ArcaneReferenceSnapshot): string {
  const rivenVersions = Object.fromEntries(Object.entries(reference.versions).sort(([left], [right]) => left.localeCompare(right)));
  const arcaneVersions = Object.fromEntries(Object.entries(arcanes.versions).sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify({
    rivenVersions,
    rivenWeapons: reference.rivenWeapons.map((weapon) => ({
      slug: weapon.slug,
      name: weapon.name,
      group: weapon.group,
      disposition: weapon.disposition,
      imageName: weapon.imageName ?? null,
    })),
    rivenAttributes: reference.rivenAttributes.map((attribute) => ({ slug: attribute.slug, group: attribute.group, name: attribute.name })),
    arcaneVersions,
    arcaneItems: arcanes.items.map((item) => ({
      slug: item.slug,
      name: item.name,
      rarity: item.rarity,
      maxRank: item.maxRank,
      dissolutionVosfor: item.dissolutionVosfor ?? null,
      cannotDissolve: item.cannotDissolve ?? false,
    })),
    arcanePacks: arcanes.packs.map((pack) => ({ id: pack.id, drops: pack.drops.map((drop) => drop.arcaneSlug) })),
  });
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function runVersionCheck(args: Args, client: WarframeMarketClient): Promise<void> {
  const cachedPath = join(args.dataDir, "reference", "current.json");
  const cached = await readJsonIfExists<ReferenceSnapshot>(cachedPath);
  const versionInfo = await client.versions();
  const currentHash = versionInfo.collections.rivens ?? "";
  const previousHash = cached?.versions?.rivens ?? "";

  const referenceChanged = !cached || currentHash === "" || currentHash !== previousHash;

  if (!referenceChanged) {
    console.log(`Riven versions unchanged (${currentHash || "unknown"}); no reference refresh needed.`);
    if (cached && cached.rivenWeapons.some((weapon) => !weapon.imageName)) {
      const imageMap = await fetchWarframestatImageMap(args.userAgent);
      const matched = enrichWeaponsWithImageNames(cached.rivenWeapons, imageMap);
      if (matched > 0) {
        await writeFile(cachedPath, JSON.stringify(cached, null, 2));
        console.log(`Backfilled ${matched} warframestat imageNames into cached reference.`);
      }
    }
    await updateIndex(args.dataDir, {
      hot: { last_run_at: new Date().toISOString(), version_hash: currentHash, reference_changed: false },
    });
    return;
  }

  console.log(
    cached
      ? `Riven versions changed (${previousHash || "n/a"} → ${currentHash || "unknown"}); refreshing reference.`
      : "No cached reference; fetching fresh.",
  );
  const fresh = await client.loadReference();
  await ensureDir(join(args.dataDir, "reference"));
  await writeFile(cachedPath, JSON.stringify(fresh, null, 2));

  if (cached) {
    const changes = diffDispositions(cached.rivenWeapons, fresh.rivenWeapons);
    if (changes.length > 0) {
      await appendEvents(args.dataDir, "disposition", changes);
      console.log(`Wrote ${changes.length} disposition-change events.`);
    }
  }

  await updateIndex(args.dataDir, {
    hot: { last_run_at: new Date().toISOString(), version_hash: currentHash, reference_changed: true },
    reference: {
      last_run_at: new Date().toISOString(),
      weapons: fresh.rivenWeapons.length,
      attributes: fresh.rivenAttributes.length,
      ...(currentHash ? { version_hash: currentHash } : {}),
    },
  });
}

function diffDispositions(previous: RivenWeapon[], current: RivenWeapon[]): Array<Record<string, unknown>> {
  const priorBySlug = new Map(previous.map((weapon) => [weapon.slug, weapon]));
  const events: Array<Record<string, unknown>> = [];
  const nowIso = new Date().toISOString();
  for (const weapon of current) {
    const prior = priorBySlug.get(weapon.slug);
    if (!prior) {
      events.push({
        ts: nowIso,
        source: "reference-diff",
        kind_detail: "weapon_added",
        weapon_slug: weapon.slug,
        weapon_name: weapon.name,
        disposition: weapon.disposition,
      });
      continue;
    }
    if (prior.disposition !== weapon.disposition) {
      events.push({
        ts: nowIso,
        source: "reference-diff",
        kind_detail: "disposition_change",
        weapon_slug: weapon.slug,
        weapon_name: weapon.name,
        old_disposition: prior.disposition,
        new_disposition: weapon.disposition,
        delta_pct: weapon.disposition === 0 ? 0 : (weapon.disposition - prior.disposition) / prior.disposition,
      });
    }
  }
  return events;
}

async function appendEvents(dataDir: string, kind: string, events: Array<Record<string, unknown>>): Promise<void> {
  if (events.length === 0) return;
  await ensureDir(join(dataDir, "events"));
  const date = new Date().toISOString().slice(0, 10);
  const path = join(dataDir, "events", `${date}.jsonl`);
  const enriched = events.map((event) => JSON.stringify({ kind, ...event }));
  await appendFile(path, enriched.join("\n") + "\n", "utf8");
}

async function loadCachedReference(dataDir: string): Promise<ReferenceSnapshot | null> {
  return readJsonIfExists<ReferenceSnapshot>(join(dataDir, "reference", "current.json"));
}

async function loadOrFetchReference(args: Args, client: WarframeMarketClient): Promise<ReferenceSnapshot> {
  const cached = await loadCachedReference(args.dataDir);
  if (cached && Array.isArray(cached.rivenWeapons) && cached.rivenWeapons.length > 0) return cached;
  const fresh = await client.loadReference();
  await ensureDir(join(args.dataDir, "reference"));
  await writeFile(join(args.dataDir, "reference", "current.json"), JSON.stringify(fresh, null, 2));
  return fresh;
}

async function loadCachedArcaneReference(dataDir: string): Promise<ArcaneReferenceSnapshot | null> {
  return readJsonIfExists<ArcaneReferenceSnapshot>(join(dataDir, "arcane", "reference", "current.json"));
}

async function loadOrFetchArcaneReference(args: Args, client: WarframeMarketClient): Promise<ArcaneReferenceSnapshot> {
  const cached = await loadCachedArcaneReference(args.dataDir);
  try {
    const fresh = await client.loadArcaneReference();
    await ensureDir(join(args.dataDir, "arcane", "reference"));
    await writeFile(join(args.dataDir, "arcane", "reference", "current.json"), JSON.stringify(fresh, null, 2));
    return fresh;
  } catch (error) {
    if (cached && Array.isArray(cached.items) && cached.items.length > 0) return cached;
    throw error;
  }
}

function buildArcaneDashboard(
  reference: ArcaneReferenceSnapshot,
  ordersByArcane: ReadonlyMap<string, readonly ArcaneOrder[]>,
  scannedAtByArcane: ReadonlyMap<string, string>,
  tier: Tier,
  generatedAt: string,
  totalTargets: number,
): ArcaneDashboardState {
  const arcanes = analyzeArcaneMarket(reference.items, ordersByArcane, scannedAtByArcane, reference.packs);
  arcanes.generatedAt = generatedAt;
  arcanes.status = {
    initialized: true,
    running: false,
    reason: `ci-${tier}-arcanes`,
    startedAt: generatedAt,
    finishedAt: generatedAt,
    scannedWeapons: ordersByArcane.size,
    totalWeapons: totalTargets,
    lastMessage: `CI ${tier} arcane scan wrote ${ordersByArcane.size}/${totalTargets} arcane order books`,
  };
  if (reference.versionsUpdatedAt) arcanes.reference.versionsUpdatedAt = reference.versionsUpdatedAt;
  return arcanes;
}

async function runArcaneScan(args: Args, client: WarframeMarketClient, tier: Tier): Promise<ArcaneDashboardState> {
  const reference = await loadOrFetchArcaneReference(args, client);
  const targets = tier === "hot" ? reference.items.slice(0, Math.min(args.arcaneHotSize, reference.items.length)) : reference.items;
  console.log(`${tier === "hot" ? "Hot" : "Cold"} arcane scan: ${targets.length}/${reference.items.length} arcanes.`);

  const scan = await scanArcaneTargets(client, targets, args.concurrency, false);
  return buildArcaneDashboard(reference, scan.ordersByArcane, scan.scannedAtByArcane, tier, new Date().toISOString(), targets.length);
}

async function writeArcaneArtifacts(args: Args, tier: Tier, arcanes: ArcaneDashboardState): Promise<void> {
  await ensureDir(join(args.dataDir, "latest"));
  await writeFile(join(args.dataDir, "latest", "arcanes.json"), JSON.stringify(arcanes, null, 2));
  const existing = await readJsonIfExists<DashboardState & CiStateExtras>(join(args.dataDir, "latest", "state.json"));
  const state: DashboardState & CiStateExtras = existing
    ? { ...existing, arcanes }
    : {
      schemaVersion: 1,
      tier,
      scannedWeaponSlugs: [],
      generatedAt: arcanes.generatedAt,
      refreshMs: 60 * 60_000,
      apiBase: "https://api.warframe.market",
      scanMode: "remote",
      config: normalizeConfig(DEFAULT_CONFIG),
      status: {
        initialized: true,
        running: false,
        reason: `ci-${tier}-arcanes`,
        finishedAt: arcanes.generatedAt,
        scannedWeapons: 0,
        totalWeapons: 0,
        lastMessage: "Arcane-only CI state; Riven cold scan has not populated this data branch yet.",
      },
      reference: { weapons: 0, attributes: 0 },
      totals: { weaponsWithAuctions: 0, auctions: 0, opportunities: 0 },
      opportunities: [],
      weaponSummaries: [],
      arcanes,
    };
  await writeFile(join(args.dataDir, "latest", "state.json"), JSON.stringify(state, null, 2));
  await updateIndex(args.dataDir, {
    arcanes: {
      last_run_at: arcanes.generatedAt,
      tier,
      scanned_slugs: arcanes.summaries.filter((summary) => summary.lastScannedAt).map((summary) => summary.slug),
      item_count: arcanes.reference.items,
      recommendation_count: arcanes.totals.recommendations,
      pack_count: arcanes.totals.packs,
    },
  });
}

async function runInParallel<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(workers);
}

async function scanRivenTargets(
  client: WarframeMarketClient,
  targets: readonly RivenWeapon[],
  concurrency: number,
  strict: boolean,
): Promise<RivenScanResult> {
  const auctionsByWeapon = new Map<string, RivenAuction[]>();
  const scannedAtByWeapon = new Map<string, string>();
  const failures: ScanFailure[] = [];
  let scannedOk = 0;
  await runInParallel([...targets], concurrency, async (weapon) => {
    try {
      const auctions = await client.searchRivenAuctions(weapon.slug);
      auctionsByWeapon.set(weapon.slug, auctions);
      scannedAtByWeapon.set(weapon.slug, new Date().toISOString());
      scannedOk += 1;
      if (scannedOk % 25 === 0) console.log(`  ${scannedOk}/${targets.length} weapons scanned`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ slug: weapon.slug, message });
      console.warn(`failed ${weapon.slug}: ${message}`);
    }
  });
  if (strict && failures.length > 0) throw new Error(`failed ${failures.length} riven scans: ${formatFailures(failures)}`);
  return { auctionsByWeapon, scannedAtByWeapon, failures };
}

async function scanArcaneTargets(
  client: WarframeMarketClient,
  targets: readonly ArcaneItem[],
  concurrency: number,
  strict: boolean,
): Promise<ArcaneScanResult> {
  const ordersByArcane = new Map<string, ArcaneOrder[]>();
  const scannedAtByArcane = new Map<string, string>();
  const failures: ScanFailure[] = [];
  let scannedOk = 0;
  await runInParallel([...targets], concurrency, async (item) => {
    try {
      const orders = await client.searchArcaneOrders(item);
      ordersByArcane.set(item.slug, orders);
      scannedAtByArcane.set(item.slug, new Date().toISOString());
      scannedOk += 1;
      if (scannedOk % 25 === 0) console.log(`  ${scannedOk}/${targets.length} arcanes scanned`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ slug: item.slug, message });
      console.warn(`failed arcane ${item.slug}: ${message}`);
    }
  });
  if (strict && failures.length > 0) throw new Error(`failed ${failures.length} arcane scans: ${formatFailures(failures)}`);
  return { ordersByArcane, scannedAtByArcane, failures };
}

function formatFailures(failures: readonly ScanFailure[]): string {
  return failures.slice(0, 5).map((failure) => `${failure.slug} (${failure.message})`).join("; ");
}

async function writeReferenceSnapshots(dataDir: string, reference: ReferenceSnapshot, arcanes: ArcaneReferenceSnapshot): Promise<void> {
  await ensureDir(join(dataDir, "reference"));
  await writeFile(join(dataDir, "reference", "current.json"), JSON.stringify(reference, null, 2));
  await ensureDir(join(dataDir, "arcane", "reference"));
  await writeFile(join(dataDir, "arcane", "reference", "current.json"), JSON.stringify(arcanes, null, 2));
}

async function writeColdShardPartial(args: Args, partial: ColdShardPartial): Promise<void> {
  await ensureDir(args.partialDir);
  const path = join(args.partialDir, `cold-shard-${partial.shard.id}.json`);
  await writeFile(path, JSON.stringify(partial, null, 2));
  console.log(`Wrote cold shard partial ${path}`);
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path);
    }
  }
  return files.sort();
}


async function readColdShardPartials(args: Args): Promise<ColdShardPartial[]> {
  if (args.shardCount < 1) throw new Error("shard count must be at least 1");
  const files = await collectJsonFiles(args.partialDir);
  const partials = await Promise.all(files.map(async (path) => JSON.parse(await readFile(path, "utf8")) as ColdShardPartial));
  const coldPartials = partials.filter((partial) => partial.schemaVersion === 1 && partial.tier === "cold");
  if (coldPartials.length !== args.shardCount) {
    throw new Error(`expected ${args.shardCount} cold shard partials, found ${coldPartials.length}`);
  }
  coldPartials.sort((left, right) => left.shard.id - right.shard.id);
  for (let id = 0; id < args.shardCount; id += 1) {
    const partial = coldPartials[id];
    if (!partial || partial.shard.id !== id) throw new Error(`missing cold shard partial ${id}`);
    if (partial.shard.count !== args.shardCount) {
      throw new Error(`cold shard ${id} expected ${partial.shard.count} shards, merge expected ${args.shardCount}`);
    }
  }
  return coldPartials;
}

function assertSetMatches(name: string, actual: ReadonlySet<string>, expectedValues: readonly string[]): void {
  const expected = new Set(expectedValues);
  const missing = [...expected].filter((slug) => !actual.has(slug));
  const extra = [...actual].filter((slug) => !expected.has(slug));
  if (missing.length > 0 || extra.length > 0 || actual.size !== expected.size) {
    throw new Error(`${name} mismatch: missing [${missing.slice(0, 5).join(", ")}], extra [${extra.slice(0, 5).join(", ")}]`);
  }
}

interface ColdMergeInput {
  reference: ReferenceSnapshot;
  arcaneReference: ArcaneReferenceSnapshot;
  auctionsByWeapon: Map<string, RivenAuction[]>;
  scannedAtByWeapon: Map<string, string>;
  ordersByArcane: Map<string, ArcaneOrder[]>;
  scannedAtByArcane: Map<string, string>;
}

async function loadColdShardMergeInput(args: Args): Promise<ColdMergeInput> {
  const partials = await readColdShardPartials(args);
  const first = partials[0];
  if (!first) throw new Error("no cold shard partials found");

  const auctionsByWeapon = new Map<string, RivenAuction[]>();
  const scannedAtByWeapon = new Map<string, string>();
  const ordersByArcane = new Map<string, ArcaneOrder[]>();
  const scannedAtByArcane = new Map<string, string>();
  const assignedRivens = new Set<string>();
  const assignedArcanes = new Set<string>();

  for (const partial of partials) {
    if (partial.reference.fingerprint !== first.reference.fingerprint) {
      throw new Error(`cold shard ${partial.shard.id} used a different reference snapshot`);
    }
    if (partial.rivens.total !== first.reference.rivens.rivenWeapons.length) {
      throw new Error(`cold shard ${partial.shard.id} expected ${partial.rivens.total} riven weapons, reference has ${first.reference.rivens.rivenWeapons.length}`);
    }
    if (partial.arcanes.total !== first.reference.arcanes.items.length) {
      throw new Error(`cold shard ${partial.shard.id} expected ${partial.arcanes.total} arcanes, reference has ${first.reference.arcanes.items.length}`);
    }
    if (partial.rivens.failures.length > 0) {
      throw new Error(`cold shard ${partial.shard.id} contains riven failures: ${formatFailures(partial.rivens.failures)}`);
    }
    if (partial.arcanes.failures.length > 0) {
      throw new Error(`cold shard ${partial.shard.id} contains arcane failures: ${formatFailures(partial.arcanes.failures)}`);
    }

    assertSetMatches(`cold shard ${partial.shard.id} riven scans`, new Set(partial.rivens.scanned.map((entry) => entry.slug)), partial.rivens.assignedSlugs);
    assertSetMatches(`cold shard ${partial.shard.id} arcane scans`, new Set(partial.arcanes.scanned.map((entry) => entry.slug)), partial.arcanes.assignedSlugs);

    for (const slug of partial.rivens.assignedSlugs) {
      if (assignedRivens.has(slug)) throw new Error(`duplicate riven assignment ${slug}`);
      assignedRivens.add(slug);
    }
    for (const entry of partial.rivens.scanned) {
      if (auctionsByWeapon.has(entry.slug)) throw new Error(`duplicate riven scan ${entry.slug}`);
      auctionsByWeapon.set(entry.slug, entry.auctions);
      scannedAtByWeapon.set(entry.slug, entry.scannedAt);
    }

    for (const slug of partial.arcanes.assignedSlugs) {
      if (assignedArcanes.has(slug)) throw new Error(`duplicate arcane assignment ${slug}`);
      assignedArcanes.add(slug);
    }
    for (const entry of partial.arcanes.scanned) {
      if (ordersByArcane.has(entry.slug)) throw new Error(`duplicate arcane scan ${entry.slug}`);
      ordersByArcane.set(entry.slug, entry.orders);
      scannedAtByArcane.set(entry.slug, entry.scannedAt);
    }
  }

  assertSetMatches("riven shard coverage", assignedRivens, first.reference.rivens.rivenWeapons.map((weapon) => weapon.slug));
  assertSetMatches("arcane shard coverage", assignedArcanes, first.reference.arcanes.items.map((item) => item.slug));

  return {
    reference: first.reference.rivens,
    arcaneReference: first.reference.arcanes,
    auctionsByWeapon,
    scannedAtByWeapon,
    ordersByArcane,
    scannedAtByArcane,
  };
}

function computePriceSample(slug: string, auctions: readonly RivenAuction[], disposition: number | undefined, tsIso: string): Record<string, unknown> {
  const direct = auctions.filter((auction) => auction.visible && !auction.closed && auction.isDirectSell && auction.buyoutPrice > 0);
  const online = direct.filter((auction) => auction.owner.status === "ingame" || auction.owner.status === "online");
  const sortedPrices = direct.map((auction) => auction.buyoutPrice).sort((a, b) => a - b);
  const stats = sortedPrices.length > 0 ? {
    min: sortedPrices[0],
    max: sortedPrices[sortedPrices.length - 1],
    p25: percentile(sortedPrices, 0.25),
    p50: percentile(sortedPrices, 0.5),
    p75: percentile(sortedPrices, 0.75),
    p90: percentile(sortedPrices, 0.9),
  } : null;
  return {
    ts: tsIso,
    weapon_slug: slug,
    listings: auctions.length,
    direct_listings: direct.length,
    online_listings: online.length,
    disposition: disposition ?? null,
    price_stats: stats,
  };
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const clamped = Math.min(1, Math.max(0, fraction));
  const idx = clamped * (sortedValues.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const lo = sortedValues[lower] ?? 0;
  const hi = sortedValues[upper] ?? lo;
  return lo + (hi - lo) * (idx - lower);
}

function computeSignatureSamples(slug: string, auctions: readonly RivenAuction[], tsIso: string): Array<Record<string, unknown>> {
  return auctions
    .filter((auction) => auction.visible && !auction.closed && auction.isDirectSell && auction.buyoutPrice > 0)
    .map((auction) => ({
      ts: tsIso,
      auction_id: auction.id,
      weapon_slug: slug,
      signature: attributeSignature(auction.attributes),
      buyout_price: auction.buyoutPrice,
    }));
}

interface SignatureSampleRow {
  ts: number;
  auction_id: string;
  weapon_slug: string;
  signature: string;
  buyout_price: number;
}

interface ValuationOutput {
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

interface VelocityOutput {
  weapon_slug: string;
  signature: string;
  observed_listings: number;
  vanished_listings: number;
  vanish_rate: number;
  avg_time_on_market_days: number | null;
  classification: "fast_moving" | "stuck" | "unknown";
}

async function rollupValuations(dataDir: string, windowDays: number, vanishThresholdDays: number): Promise<{ valuations: number }> {
  const nowMs = Date.now();
  const windowStartMs = nowMs - windowDays * 86_400_000;
  const vanishThresholdMs = nowMs - vanishThresholdDays * 86_400_000;
  const sigDir = join(dataDir, "signatures");
  if (!existsSync(sigDir)) {
    console.log("No signatures directory; skipping valuation rollup.");
    return { valuations: 0 };
  }

  const files = (await readdir(sigDir)).filter((f) => f.endsWith(".jsonl")).sort();
  const bySignature = new Map<string, SignatureSampleRow[]>();

  for (const file of files) {
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
    if (!dateMatch) continue;
    const fileDay = new Date(dateMatch[1] + "T00:00:00.000Z").getTime();
    if (Number.isNaN(fileDay) || fileDay < windowStartMs - 86_400_000) continue;

    const content = await readFile(join(sigDir, file), "utf8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row: unknown = JSON.parse(line);
        if (typeof row !== "object" || row === null) continue;
        const record = row as Record<string, unknown>;
        const ts = typeof record.ts === "string"
          ? new Date(record.ts).getTime()
          : typeof record.ts === "number"
          ? record.ts * (record.ts > 1e12 ? 1 : 1000)
          : Number.NaN;
        if (!Number.isFinite(ts) || ts < windowStartMs) continue;
        const auctionId = typeof record.auction_id === "string" ? record.auction_id : "";
        const weaponSlug = typeof record.weapon_slug === "string" ? record.weapon_slug : "";
        const signature = typeof record.signature === "string" ? record.signature : "";
        const buyoutPrice = typeof record.buyout_price === "number" ? record.buyout_price : Number.NaN;
        if (!auctionId || !weaponSlug || !signature || !Number.isFinite(buyoutPrice) || buyoutPrice <= 0) continue;
        const key = `${weaponSlug}::${signature}`;
        const list = bySignature.get(key) ?? [];
        list.push({ ts, auction_id: auctionId, weapon_slug: weaponSlug, signature, buyout_price: buyoutPrice });
        bySignature.set(key, list);
      } catch {
        continue;
      }
    }
  }

  const valuations: Record<string, ValuationOutput> = {};
  const velocities: Record<string, VelocityOutput> = {};

  for (const [key, samples] of bySignature) {
    const first = samples[0];
    if (first === undefined) continue;
    const { weapon_slug, signature } = first;
    const prices = samples.map((s) => s.buyout_price).sort((a, b) => a - b);
    const min = prices[0] ?? 0;
    const max = prices[prices.length - 1] ?? 0;

    const auctionLife = new Map<string, { first: number; last: number }>();
    for (const sample of samples) {
      const entry = auctionLife.get(sample.auction_id);
      if (!entry) auctionLife.set(sample.auction_id, { first: sample.ts, last: sample.ts });
      else {
        if (sample.ts < entry.first) entry.first = sample.ts;
        if (sample.ts > entry.last) entry.last = sample.ts;
      }
    }
    const observed = auctionLife.size;
    let vanished = 0;
    let ttmSumSec = 0;
    let ttmCount = 0;
    for (const [, entry] of auctionLife) {
      if (entry.last < vanishThresholdMs) {
        vanished += 1;
        ttmSumSec += (entry.last - entry.first) / 1000;
        ttmCount += 1;
      }
    }
    const vanishRate = observed > 0 ? vanished / observed : 0;
    const avgTtmDays = ttmCount > 0 ? ttmSumSec / ttmCount / 86_400 : null;
    let classification: VelocityOutput["classification"] = "unknown";
    if (observed >= 8 && vanishRate >= 0.5 && avgTtmDays !== null && avgTtmDays < 3) classification = "fast_moving";
    else if (observed >= 10 && vanishRate < 0.2) classification = "stuck";

    const latest = samples.reduce((acc, cur) => (cur.ts > acc.ts ? cur : acc), first);

    valuations[key] = {
      weapon_slug,
      signature,
      sample_count: samples.length,
      window_days: windowDays,
      p25: percentile(prices, 0.25),
      p50: percentile(prices, 0.5),
      p75: percentile(prices, 0.75),
      p90: percentile(prices, 0.9),
      min,
      max,
      last_seen_price: latest.buyout_price,
      last_seen_at: Math.floor(latest.ts / 1000),
      confidence: 1 - Math.exp(-samples.length / 10),
    };
    velocities[key] = {
      weapon_slug,
      signature,
      observed_listings: observed,
      vanished_listings: vanished,
      vanish_rate: vanishRate,
      avg_time_on_market_days: avgTtmDays,
      classification,
    };
  }

  await ensureDir(join(dataDir, "valuations"));
  const payload = {
    generatedAt: new Date().toISOString(),
    windowDays,
    signatureCount: bySignature.size,
    keySchema: "weapon_slug::signature",
    valuations,
    velocities,
  };
  // Minified — pretty-printing this was writing 3M+ line diffs per hourly commit.
  await writeFile(join(dataDir, "valuations", "latest.json"), JSON.stringify(payload));
  return { valuations: bySignature.size };
}

async function runColdShard(args: Args, client: WarframeMarketClient): Promise<void> {
  validateShardArgs(args);
  const reference = await loadOrFetchReference(args, client);
  const arcaneReference = await loadOrFetchArcaneReference(args, client);
  const rivenTargets = shardSlice(reference.rivenWeapons, args.shardId, args.shardCount);
  const arcaneTargets = shardSlice(arcaneReference.items, args.shardId, args.shardCount);
  console.log(
    `Cold shard ${args.shardId}/${args.shardCount}: ${rivenTargets.length}/${reference.rivenWeapons.length} riven weapons, ` +
    `${arcaneTargets.length}/${arcaneReference.items.length} arcanes.`,
  );

  const rivenScan = await scanRivenTargets(client, rivenTargets, args.concurrency, true);
  const arcaneScan = await scanArcaneTargets(client, arcaneTargets, args.concurrency, true);
  const generatedAt = new Date().toISOString();
  await writeColdShardPartial(args, {
    schemaVersion: 1,
    tier: "cold",
    generatedAt,
    shard: { id: args.shardId, count: args.shardCount },
    reference: {
      fingerprint: referenceFingerprint(reference, arcaneReference),
      rivens: reference,
      arcanes: arcaneReference,
    },
    rivens: {
      total: reference.rivenWeapons.length,
      assignedSlugs: rivenTargets.map((weapon) => weapon.slug),
      scanned: rivenTargets.map((weapon) => ({
        slug: weapon.slug,
        scannedAt: rivenScan.scannedAtByWeapon.get(weapon.slug) ?? generatedAt,
        auctions: rivenScan.auctionsByWeapon.get(weapon.slug) ?? [],
      })),
      failures: rivenScan.failures,
    },
    arcanes: {
      total: arcaneReference.items.length,
      assignedSlugs: arcaneTargets.map((item) => item.slug),
      scanned: arcaneTargets.map((item) => ({
        slug: item.slug,
        scannedAt: arcaneScan.scannedAtByArcane.get(item.slug) ?? generatedAt,
        orders: arcaneScan.ordersByArcane.get(item.slug) ?? [],
      })),
      failures: arcaneScan.failures,
    },
  });
}

async function runColdMerge(args: Args): Promise<void> {
  const input = await loadColdShardMergeInput(args);
  await writeReferenceSnapshots(args.dataDir, input.reference, input.arcaneReference);

  const config = normalizeConfig(DEFAULT_CONFIG);
  const analysis = analyzeMarket(input.reference.rivenWeapons, input.auctionsByWeapon, config, input.scannedAtByWeapon);
  const nowIso = new Date().toISOString();
  const arcanes = buildArcaneDashboard(input.arcaneReference, input.ordersByArcane, input.scannedAtByArcane, "cold", nowIso, input.arcaneReference.items.length);
  const status: ScanStatus = {
    initialized: true,
    running: false,
    reason: "ci-cold",
    startedAt: nowIso,
    finishedAt: nowIso,
    scannedWeapons: input.auctionsByWeapon.size,
    totalWeapons: input.reference.rivenWeapons.length,
    lastMessage: `CI cold scan merged ${args.shardCount} shards with ${input.auctionsByWeapon.size}/${input.reference.rivenWeapons.length} weapons`,
  };
  const dashboardReference: DashboardState["reference"] = {
    weapons: input.reference.rivenWeapons.length,
    attributes: input.reference.rivenAttributes.length,
  };
  if (input.reference.versionsUpdatedAt) dashboardReference.versionsUpdatedAt = input.reference.versionsUpdatedAt;
  const state: DashboardState & CiStateExtras = {
    schemaVersion: 1,
    tier: "cold",
    scannedWeaponSlugs: [...input.auctionsByWeapon.keys()],
    generatedAt: nowIso,
    refreshMs: 60 * 60_000,
    apiBase: "https://api.warframe.market",
    config,
    status,
    reference: dashboardReference,
    totals: {
      weaponsWithAuctions: input.auctionsByWeapon.size,
      auctions: Array.from(input.auctionsByWeapon.values()).reduce((sum, entries) => sum + entries.length, 0),
      opportunities: analysis.opportunities.length,
    },
    opportunities: analysis.opportunities,
    instantWins: analysis.instantWins,
    weaponSummaries: analysis.weaponSummaries,
    arcanes,
  };

  await ensureDir(join(args.dataDir, "latest"));
  await writeFile(join(args.dataDir, "latest", "state.json"), JSON.stringify(state, null, 2));
  await writeFile(join(args.dataDir, "latest", "opportunities.json"), JSON.stringify(analysis.opportunities, null, 2));
  await writeFile(join(args.dataDir, "latest", "instant-wins.json"), JSON.stringify(analysis.instantWins, null, 2));
  await writeArcaneArtifacts(args, "cold", arcanes);

  await ensureDir(join(args.dataDir, "samples"));
  const dispositionBySlug = new Map(input.reference.rivenWeapons.map((weapon) => [weapon.slug, weapon.disposition]));
  const samples: string[] = [];
  const signatures: string[] = [];
  for (const [slug, auctions] of input.auctionsByWeapon) {
    samples.push(JSON.stringify(computePriceSample(slug, auctions, dispositionBySlug.get(slug), nowIso)));
    for (const row of computeSignatureSamples(slug, auctions, nowIso)) signatures.push(JSON.stringify(row));
  }
  if (samples.length > 0) {
    const date = nowIso.slice(0, 10);
    await appendFile(join(args.dataDir, "samples", `${date}.jsonl`), samples.join("\n") + "\n", "utf8");
    await ensureDir(join(args.dataDir, "signatures"));
    if (signatures.length > 0) {
      await appendFile(join(args.dataDir, "signatures", `${date}.jsonl`), signatures.join("\n") + "\n", "utf8");
    }
  }

  const rollup = await rollupValuations(args.dataDir, args.valuationWindowDays, args.vanishThresholdDays);
  console.log(`Wrote valuations for ${rollup.valuations} signatures.`);

  await updateIndex(args.dataDir, {
    cold: {
      last_run_at: nowIso,
      scanned_slugs: [...input.auctionsByWeapon.keys()],
      opportunity_count: analysis.opportunities.length,
    },
    valuations: {
      last_run_at: nowIso,
      signature_count: rollup.valuations,
      window_days: args.valuationWindowDays,
    },
  });

  console.log(`Cold merge finished: ${input.auctionsByWeapon.size} weapons, ${analysis.opportunities.length} opportunities.`);
}

async function runCold(args: Args, client: WarframeMarketClient): Promise<void> {
  const reference = await loadOrFetchReference(args, client);
  const targets = reference.rivenWeapons;
  console.log(`Cold scan: ${targets.length} riven weapons.`);

  const auctionsByWeapon = new Map<string, RivenAuction[]>();
  let scannedOk = 0;
  await runInParallel(targets, args.concurrency, async (weapon) => {
    try {
      const auctions = await client.searchRivenAuctions(weapon.slug);
      auctionsByWeapon.set(weapon.slug, auctions);
      scannedOk += 1;
      if (scannedOk % 25 === 0) console.log(`  ${scannedOk}/${targets.length} weapons scanned`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`skip ${weapon.slug}: ${message}`);
    }
  });

  const config = normalizeConfig(DEFAULT_CONFIG);
  const analysis = analyzeMarket(reference.rivenWeapons, auctionsByWeapon, config);
  const arcanes = await runArcaneScan(args, client, "cold");
  const nowIso = new Date().toISOString();
  const status: ScanStatus = {
    initialized: true,
    running: false,
    reason: "ci-cold",
    startedAt: nowIso,
    finishedAt: nowIso,
    scannedWeapons: auctionsByWeapon.size,
    totalWeapons: targets.length,
    lastMessage: `CI cold scan wrote ${auctionsByWeapon.size}/${targets.length} weapons`,
  };
  const dashboardReference: DashboardState["reference"] = {
    weapons: reference.rivenWeapons.length,
    attributes: reference.rivenAttributes.length,
  };
  if (reference.versionsUpdatedAt) dashboardReference.versionsUpdatedAt = reference.versionsUpdatedAt;
  const state: DashboardState & CiStateExtras = {
    schemaVersion: 1,
    tier: "cold",
    scannedWeaponSlugs: [...auctionsByWeapon.keys()],
    generatedAt: nowIso,
    refreshMs: 60 * 60_000,
    apiBase: "https://api.warframe.market",
    config,
    status,
    reference: dashboardReference,
    totals: {
      weaponsWithAuctions: auctionsByWeapon.size,
      auctions: Array.from(auctionsByWeapon.values()).reduce((sum, entries) => sum + entries.length, 0),
      opportunities: analysis.opportunities.length,
    },
    opportunities: analysis.opportunities,
    instantWins: analysis.instantWins,
    weaponSummaries: analysis.weaponSummaries,
    arcanes,
  };

  await ensureDir(join(args.dataDir, "latest"));
  await writeFile(join(args.dataDir, "latest", "state.json"), JSON.stringify(state, null, 2));
  await writeFile(join(args.dataDir, "latest", "opportunities.json"), JSON.stringify(analysis.opportunities, null, 2));
  await writeFile(join(args.dataDir, "latest", "instant-wins.json"), JSON.stringify(analysis.instantWins, null, 2));
  await writeArcaneArtifacts(args, "cold", arcanes);

  await ensureDir(join(args.dataDir, "samples"));
  const dispositionBySlug = new Map(reference.rivenWeapons.map((weapon) => [weapon.slug, weapon.disposition]));
  const samples: string[] = [];
  const signatures: string[] = [];
  for (const [slug, auctions] of auctionsByWeapon) {
    samples.push(JSON.stringify(computePriceSample(slug, auctions, dispositionBySlug.get(slug), nowIso)));
    for (const row of computeSignatureSamples(slug, auctions, nowIso)) signatures.push(JSON.stringify(row));
  }
  if (samples.length > 0) {
    const date = nowIso.slice(0, 10);
    await appendFile(join(args.dataDir, "samples", `${date}.jsonl`), samples.join("\n") + "\n", "utf8");
    await ensureDir(join(args.dataDir, "signatures"));
    if (signatures.length > 0) {
      await appendFile(join(args.dataDir, "signatures", `${date}.jsonl`), signatures.join("\n") + "\n", "utf8");
    }
  }

  const rollup = await rollupValuations(args.dataDir, args.valuationWindowDays, args.vanishThresholdDays);
  console.log(`Wrote valuations for ${rollup.valuations} signatures.`);

  await updateIndex(args.dataDir, {
    cold: {
      last_run_at: nowIso,
      scanned_slugs: [...auctionsByWeapon.keys()],
      opportunity_count: analysis.opportunities.length,
    },
    valuations: {
      last_run_at: nowIso,
      signature_count: rollup.valuations,
      window_days: args.valuationWindowDays,
    },
  });

  console.log(`Cold scan finished: ${auctionsByWeapon.size} weapons, ${analysis.opportunities.length} opportunities.`);
}

async function updateIndex(dataDir: string, patch: Partial<IndexFile["tiers"]>): Promise<void> {
  const path = join(dataDir, "index.json");
  const current = (await readJsonIfExists<IndexFile>(path)) ?? { schema_version: 1 as const, updated_at: new Date().toISOString(), tiers: {} };
  const next: IndexFile = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    tiers: { ...current.tiers, ...patch },
  };
  await writeFile(path, JSON.stringify(next, null, 2));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.env);
  await ensureDir(args.dataDir);
  const cacheDir = process.env.WFM_CACHE_DIR ?? join(args.dataDir, ".wfm-cache");
  const client = new WarframeMarketClient({
    ratePerSecond: args.ratePerSecond,
    burst: args.burst,
    userAgent: args.userAgent,
    cacheDir,
  });

  if (args.tier === "reference") {
    await runVersionCheck(args, client);
    return;
  }

  if (args.tier === "hot") {
    await runVersionCheck(args, client);
    const arcanes = await runArcaneScan(args, client, "hot");
    await writeArcaneArtifacts(args, "hot", arcanes);
    return;
  }

  if (args.coldMode === "shard") {
    await runColdShard(args, client);
    return;
  }
  if (args.coldMode === "merge") {
    await runColdMerge(args);
    return;
  }

  await runCold(args, client);
}

main().catch((error) => {
  console.error("scan-and-write failed:", error);
  process.exit(1);
});
