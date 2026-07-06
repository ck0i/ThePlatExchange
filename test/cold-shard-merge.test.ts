import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { ArcaneItem, ArcaneOrder, ArcanePackDefinition, ArcaneReferenceSnapshot, AuctionAttribute, ReferenceSnapshot, RivenAuction, RivenWeapon, SellerStatus } from "../src/wfm/types.js";

const execFileAsync = promisify(execFile);
const nowIso = "2026-07-06T00:00:00.000Z";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface ScanFailure {
  slug: string;
  message: string;
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
    scanned: Array<{ slug: string; scannedAt: string; auctions: RivenAuction[] }>;
    failures: ScanFailure[];
  };
  arcanes: {
    total: number;
    assignedSlugs: string[];
    scanned: Array<{ slug: string; scannedAt: string; orders: ArcaneOrder[] }>;
    failures: ScanFailure[];
  };
}

const critAttrs: AuctionAttribute[] = [
  { urlName: "critical_chance", value: 120, positive: true },
  { urlName: "critical_damage", value: 90, positive: true },
  { urlName: "zoom", value: -30, positive: false },
];

const multishotAttrs: AuctionAttribute[] = [
  { urlName: "multishot", value: 95, positive: true },
  { urlName: "weapon_recoil", value: -35, positive: false },
];

function weapon(slug: string, name: string): RivenWeapon {
  return {
    id: slug,
    slug,
    name,
    group: "rifle",
    rivenType: "rifle",
    disposition: 1.1,
    reqMasteryRank: 8,
  };
}

function arcane(slug: string, name: string): ArcaneItem {
  return {
    id: slug,
    slug,
    name,
    tags: ["arcane_enhancement"],
    rarity: "rare",
    maxRank: 5,
    tradable: true,
    bulkTradable: true,
    tradingTax: 2_000,
  };
}

function auction(id: string, weaponSlug: string, price: number, status: SellerStatus, attributes: AuctionAttribute[]): RivenAuction {
  return {
    id,
    weaponSlug,
    name: id,
    buyoutPrice: price,
    startingPrice: price,
    topBid: null,
    isDirectSell: true,
    visible: true,
    closed: false,
    platform: "pc",
    crossplay: true,
    created: nowIso,
    updated: nowIso,
    owner: {
      id: `${id}-owner`,
      ingameName: `${id}-seller`,
      slug: `${id}-seller`,
      reputation: 10,
      status,
      platform: "pc",
      crossplay: true,
    },
    masteryLevel: 16,
    modRank: 0,
    reRolls: 0,
    polarity: "madurai",
    attributes,
    noteRaw: "",
  };
}

function sellOrder(id: string, itemId: string, price: number): ArcaneOrder {
  return {
    id,
    type: "sell",
    platinum: price,
    unitPrice: price,
    quantity: 1,
    perTrade: 1,
    rank: 0,
    visible: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    itemId,
    user: {
      id: `${id}-owner`,
      ingameName: `${id}-seller`,
      slug: `${id}-seller`,
      reputation: 10,
      status: "online",
      platform: "pc",
      crossplay: true,
    },
  };
}

function makeReferences(): { riven: ReferenceSnapshot; arcane: ArcaneReferenceSnapshot } {
  const arcanes = [arcane("arcane_energize", "Arcane Energize"), arcane("arcane_grace", "Arcane Grace")];
  const pack: ArcanePackDefinition = {
    id: "vosfor_test_pack",
    name: "Vosfor Test Pack",
    costVosfor: 200,
    creditCost: 0,
    rewardsPerPack: 3,
    source: "test",
    drops: [
      { arcaneSlug: "arcane_energize", arcaneName: "Arcane Energize", rarity: "rare", chance: 0.5 },
      { arcaneSlug: "arcane_grace", arcaneName: "Arcane Grace", rarity: "rare", chance: 0.5 },
    ],
  };

  return {
    riven: {
      versions: { rivens: "riven-test-version" },
      versionsUpdatedAt: nowIso,
      rivenWeapons: [weapon("war", "War"), weapon("boltor", "Boltor")],
      rivenAttributes: [
        { id: "critical_chance", slug: "critical_chance", group: "base", prefix: "Crita", suffix: "cron", name: "Critical Chance" },
        { id: "critical_damage", slug: "critical_damage", group: "base", prefix: "Crita", suffix: "tox", name: "Critical Damage" },
        { id: "zoom", slug: "zoom", group: "curse", prefix: "Acri", suffix: "itis", name: "Zoom" },
      ],
      loadedAt: nowIso,
    },
    arcane: {
      versions: { arcanes: "arcane-test-version" },
      versionsUpdatedAt: nowIso,
      items: arcanes,
      packs: [pack],
      loadedAt: nowIso,
    },
  };
}

function makePartial(id: number, fingerprint = "shared-reference-fingerprint"): ColdShardPartial {
  const { riven, arcane } = makeReferences();
  const common = {
    schemaVersion: 1 as const,
    tier: "cold" as const,
    generatedAt: nowIso,
    shard: { id, count: 2 },
    reference: { fingerprint, rivens: riven, arcanes: arcane },
  };

  if (id === 0) {
    return {
      ...common,
      rivens: {
        total: 2,
        assignedSlugs: ["war"],
        scanned: [
          {
            slug: "war",
            scannedAt: nowIso,
            auctions: [
              auction("war-cheap", "war", 50, "ingame", critAttrs),
              auction("war-mid-1", "war", 140, "online", critAttrs),
              auction("war-mid-2", "war", 160, "online", critAttrs),
              auction("war-high", "war", 200, "online", critAttrs),
            ],
          },
        ],
        failures: [],
      },
      arcanes: {
        total: 2,
        assignedSlugs: ["arcane_energize"],
        scanned: [{ slug: "arcane_energize", scannedAt: nowIso, orders: [sellOrder("energize-sell", "arcane_energize", 90)] }],
        failures: [],
      },
    };
  }

  return {
    ...common,
    rivens: {
      total: 2,
      assignedSlugs: ["boltor"],
      scanned: [
        {
          slug: "boltor",
          scannedAt: nowIso,
          auctions: [auction("boltor-single", "boltor", 75, "online", multishotAttrs)],
        },
      ],
      failures: [],
    },
    arcanes: {
      total: 2,
      assignedSlugs: ["arcane_grace"],
      scanned: [{ slug: "arcane_grace", scannedAt: nowIso, orders: [sellOrder("grace-sell", "arcane_grace", 70)] }],
      failures: [],
    },
  };
}

async function writePartial(dir: string, partial: ColdShardPartial): Promise<void> {
  await writeFile(join(dir, `cold-shard-${partial.shard.id}.json`), JSON.stringify(partial, null, 2));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function runMerge(tmpRoot: string, shardCount: number): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    "npx",
    [
      "tsx",
      "scripts/scan-and-write.ts",
      "--tier",
      "cold",
      "--cold-mode",
      "merge",
      "--shard-count",
      String(shardCount),
      "--data-dir",
      join(tmpRoot, "data"),
      "--partial-dir",
      join(tmpRoot, "partials"),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        WFM_CACHE_DIR: join(tmpRoot, ".wfm-cache"),
        WFM_VALUATION_WINDOW_DAYS: "30",
        WFM_VELOCITY_VANISH_DAYS: "3",
      },
    },
  );
}

async function assertMergeFails(tmpRoot: string, shardCount: number, expectedMessage: string): Promise<void> {
  await assert.rejects(
    () => runMerge(tmpRoot, shardCount),
    (error: unknown) => {
      assert(error instanceof Error, "merge failure should surface an Error");
      const details = `${error.message}\n${"stderr" in error ? String(error.stderr) : ""}\n${"stdout" in error ? String(error.stdout) : ""}`;
      assert(details.includes(expectedMessage), `expected merge failure to mention ${expectedMessage}, got:\n${details}`);
      return true;
    },
  );
}

async function withShardTemp<T>(name: string, fn: (tmpRoot: string) => Promise<T>): Promise<T> {
  const tmpRoot = await mkdtemp(join(tmpdir(), `${name}-`));
  try {
    await mkdir(join(tmpRoot, "partials"), { recursive: true });
    return await fn(tmpRoot);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

await withShardTemp("cold-shard-merge", async (tmpRoot) => {
  const partialDir = join(tmpRoot, "partials");
  await writePartial(partialDir, makePartial(0));
  await writePartial(partialDir, makePartial(1));

  const { stdout } = await runMerge(tmpRoot, 2);
  assert(stdout.includes("Cold merge finished: 2 weapons"), "merge command should report the shard rollup, not perform live scanning");

  const dataDir = join(tmpRoot, "data");
  const state = await readJson<Record<string, any>>(join(dataDir, "latest", "state.json"));
  assert.equal(state.tier, "cold");
  assert.deepEqual(state.scannedWeaponSlugs, ["war", "boltor"], "merged state should preserve scans from both shard partials");
  assert.equal(state.status.scannedWeapons, 2);
  assert.equal(state.status.totalWeapons, 2);
  assert.equal(state.status.lastMessage, "CI cold scan merged 2 shards with 2/2 weapons");
  assert.equal(state.reference.weapons, 2);
  assert.equal(state.reference.attributes, 3);
  assert.equal(state.totals.weaponsWithAuctions, 2);
  assert.equal(state.totals.auctions, 5);
  assert(state.opportunities.some((entry: Record<string, unknown>) => entry.auctionId === "war-cheap"), "merged riven auctions should feed opportunity analysis");
  assert.equal(state.weaponSummaries.length, 2);
  assert(state.weaponSummaries.every((summary: Record<string, unknown>) => summary.lastScannedAt === nowIso), "per-shard scannedAt values should survive the merge");

  const opportunities = await readJson<Array<Record<string, unknown>>>(join(dataDir, "latest", "opportunities.json"));
  assert.deepEqual(opportunities, state.opportunities, "standalone opportunities artifact should match the dashboard state");

  const arcanes = await readJson<Record<string, any>>(join(dataDir, "latest", "arcanes.json"));
  assert.equal(arcanes.status.scannedWeapons, 2);
  assert.equal(arcanes.status.totalWeapons, 2);
  assert.deepEqual(arcanes.summaries.map((summary: Record<string, string>) => summary.slug).sort(), ["arcane_energize", "arcane_grace"]);
  assert.equal(arcanes.totals.orders, 2);
  assert.equal(arcanes.packs[0]?.packId, "vosfor_test_pack");
  assert.equal(arcanes.packs[0]?.coveragePct, 1, "arcane pack valuation should see orders merged from both shards");

  const rivenReference = await readJson<ReferenceSnapshot>(join(dataDir, "reference", "current.json"));
  assert.deepEqual(rivenReference.rivenWeapons.map((entry) => entry.slug), ["war", "boltor"]);
  const arcaneReference = await readJson<ArcaneReferenceSnapshot>(join(dataDir, "arcane", "reference", "current.json"));
  assert.deepEqual(arcaneReference.items.map((entry) => entry.slug), ["arcane_energize", "arcane_grace"]);

  const sampleFiles = await readdir(join(dataDir, "samples"));
  assert.equal(sampleFiles.length, 1, "merge should publish one dated price-sample batch");
  assert(sampleFiles[0], "sample file should exist");
  const sampleRows = (await readFile(join(dataDir, "samples", sampleFiles[0]), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.deepEqual(sampleRows.map((row) => row.weapon_slug), ["war", "boltor"]);
  assert.deepEqual(sampleRows.map((row) => row.listings), [4, 1]);

  const signatureFiles = await readdir(join(dataDir, "signatures"));
  assert.equal(signatureFiles.length, 1, "direct listings should publish signature samples for valuation rollup");
  assert(signatureFiles[0], "signature file should exist");
  const signatureRows = (await readFile(join(dataDir, "signatures", signatureFiles[0]), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(signatureRows.length, 5);
  assert(signatureRows.some((row) => row.auction_id === "war-cheap"));

  const valuations = await readJson<Record<string, any>>(join(dataDir, "valuations", "latest.json"));
  assert.equal(valuations.signatureCount, 2, "valuation rollup should consume merged signature samples from both shards");
  assert(valuations.valuations["war::+critical_chance+critical_damage|-zoom"], "war signature valuation missing");
  assert(valuations.valuations["boltor::+multishot|-weapon_recoil"], "boltor signature valuation missing");

  const index = await readJson<Record<string, any>>(join(dataDir, "index.json"));
  assert.deepEqual(index.tiers.cold.scanned_slugs, ["war", "boltor"]);
  assert.equal(index.tiers.cold.opportunity_count, opportunities.length);
  assert.deepEqual(index.tiers.arcanes.scanned_slugs.sort(), ["arcane_energize", "arcane_grace"]);
  assert.equal(index.tiers.valuations.signature_count, 2);
});

await withShardTemp("cold-shard-missing", async (tmpRoot) => {
  await writePartial(join(tmpRoot, "partials"), makePartial(0));
  await assertMergeFails(tmpRoot, 2, "expected 2 cold shard partials, found 1");
});

await withShardTemp("cold-shard-mismatch", async (tmpRoot) => {
  const partialDir = join(tmpRoot, "partials");
  await writePartial(partialDir, makePartial(0));
  await writePartial(partialDir, makePartial(1, "different-reference-fingerprint"));
  await assertMergeFails(tmpRoot, 2, "cold shard 1 used a different reference snapshot");
});

console.log("cold shard merge CLI tests passed");
