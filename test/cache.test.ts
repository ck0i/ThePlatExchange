import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WarframeMarketClient } from "../src/wfm/client.js";
import type { ArcaneItem } from "../src/wfm/types.js";

const versionBody = {
  apiVersion: "0.25.0",
  data: {
    collections: { rivens: "hash-rivens-1" },
    updatedAt: "2026-07-03T00:00:00Z",
  },
  error: null,
};

const weaponsBody = {
  apiVersion: "0.25.0",
  data: [
    {
      id: "weapon-1",
      slug: "test_rifle",
      group: "primary",
      rivenType: "rifle",
      disposition: 1.1,
      reqMasteryRank: 8,
      i18n: { en: { name: "Test Rifle" } },
    },
  ],
  error: null,
};

const attributesBody = {
  apiVersion: "0.25.0",
  data: [
    {
      id: "attr-1",
      slug: "critical_chance",
      group: "default",
      prefix: "Crita",
      suffix: "Cron",
      i18n: { en: { name: "Critical Chance" } },
    },
  ],
  error: null,
};

const tempDir = await mkdtemp(join(tmpdir(), "the-plat-exchange-cache-"));
try {
  const calls: string[] = [];
  const fetcher = async (input: URL, _init: RequestInit) => {
    calls.push(input.pathname);
    if (input.pathname === "/v2/versions") return jsonResponse(versionBody);
    if (input.pathname === "/v2/riven/weapons") return jsonResponse(weaponsBody);
    if (input.pathname === "/v2/riven/attributes") return jsonResponse(attributesBody);
    return new Response(JSON.stringify({ error: "unexpected path" }), { status: 404 });
  };

  const firstClient = new WarframeMarketClient({ cacheDir: tempDir, fetcher, ratePerSecond: 1000, burst: 10, maxRetries: 1 });
  const first = await firstClient.loadReference();
  assert.equal(first.rivenWeapons[0]?.name, "Test Rifle");
  assert.equal(first.rivenAttributes[0]?.name, "Critical Chance");

  const cachePath = join(tempDir, "reference.json");
  const firstCache = await readFile(cachePath, "utf8");

  const secondClient = new WarframeMarketClient({ cacheDir: tempDir, fetcher, ratePerSecond: 1000, burst: 10, maxRetries: 1 });
  const second = await secondClient.loadReference();
  const secondCache = await readFile(cachePath, "utf8");

  assert.equal(second.rivenWeapons[0]?.name, "Test Rifle");
  assert.equal(second.rivenAttributes[0]?.name, "Critical Chance");
  assert.equal(secondCache, firstCache, "unchanged versions must not rewrite reference cache");
  assert.deepEqual(calls, ["/v2/versions", "/v2/riven/weapons", "/v2/riven/attributes", "/v2/versions"]);

  const outageClient = new WarframeMarketClient({
    cacheDir: tempDir,
    fetcher: async () => {
      throw new Error("network down");
    },
    ratePerSecond: 1000,
    burst: 10,
    maxRetries: 1,
  });
  const outage = await outageClient.loadReference();
  const outageCache = await readFile(cachePath, "utf8");
  assert.equal(outage.rivenWeapons[0]?.name, "Test Rifle");
  assert.equal(outageCache, firstCache, "network outage must not overwrite usable cache");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

await testArcaneOrderRankFallback();
await testRivenAuctionSearchMergesPriceExtremes();

console.log("cache and client parsing tests passed");

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

async function testRivenAuctionSearchMergesPriceExtremes(): Promise<void> {
  const requestedSorts: string[] = [];
  const ascAuctions = Array.from({ length: 500 }, (_, index) => rivenAuctionPayload(`asc-${index}`, index + 1));
  ascAuctions[498] = rivenAuctionPayload("duplicate-bookend", 25);
  ascAuctions[499] = rivenAuctionPayload("six-figure-bait", 100_000);
  const descAuctions = [
    rivenAuctionPayload("six-figure-whale", 150_000),
    rivenAuctionPayload("desc-expensive", 99_999),
    rivenAuctionPayload("duplicate-bookend", 25),
  ];
  const fetcher = async (input: URL, _init: RequestInit) => {
    if (input.pathname !== "/v1/auctions/search") {
      return new Response(JSON.stringify({ error: "unexpected path" }), { status: 404 });
    }
    const sort = input.searchParams.get("sort_by") ?? "";
    requestedSorts.push(sort);
    return jsonResponse({
      payload: {
        auctions: sort === "price_desc" ? descAuctions : ascAuctions,
      },
    });
  };

  const client = new WarframeMarketClient({ fetcher, ratePerSecond: 1000, burst: 10, maxRetries: 1 });
  const auctions = await client.searchRivenAuctions("war");
  const ids = auctions.map((auction) => auction.id);

  assert.deepEqual(requestedSorts, ["price_asc", "price_desc"], "capped riven searches must fetch both low and high price bookends");
  assert(ids.includes("desc-expensive"), "descending price fetch should add high-end non-outlier listings");
  assert.equal(ids.filter((id) => id === "duplicate-bookend").length, 1, "asc/desc overlap must be deduped by auction id");
  assert(!ids.includes("six-figure-bait"), "six-figure asc listings must be filtered out at ingestion");
  assert(!ids.includes("six-figure-whale"), "six-figure desc listings must be filtered out at ingestion");
  assert(auctions.every((auction) => auction.buyoutPrice < 100_000), "ingested riven auctions must stay below the six-figure plat cutoff");
}

async function testArcaneOrderRankFallback(): Promise<void> {
  const requestedRanks: string[] = [];
  const fetcher = async (input: URL, _init: RequestInit) => {
    if (input.pathname !== "/v2/orders/item/arcane_grace/top") {
      return new Response(JSON.stringify({ error: "unexpected path" }), { status: 404 });
    }

    const rank = input.searchParams.get("rank");
    requestedRanks.push(rank ?? "");
    if (rank === "0") {
      return jsonResponse({
        apiVersion: "0.25.0",
        data: {
          sell: [arcaneOrderPayload("rank-zero-omits-rank", "sell", 25)],
          buy: [],
        },
        error: null,
      });
    }

    if (rank === "5") {
      return jsonResponse({
        apiVersion: "0.25.0",
        data: {
          sell: [arcaneOrderPayload("max-rank-omits-rank", "sell", 250)],
          buy: [arcaneOrderPayload("explicit-rank-wins", "buy", 75, 3)],
        },
        error: null,
      });
    }

    return new Response(JSON.stringify({ error: `unexpected rank ${rank}` }), { status: 404 });
  };

  const client = new WarframeMarketClient({ fetcher, ratePerSecond: 1000, burst: 10, maxRetries: 1 });
  const item: ArcaneItem = {
    id: "arcane-grace",
    slug: "arcane_grace",
    name: "Arcane Grace",
    tags: ["arcane_enhancement"],
    rarity: "legendary",
    maxRank: 5,
    tradable: true,
    bulkTradable: true,
    tradingTax: 100_000,
  };

  const orders = await client.searchArcaneOrders(item);

  assert.deepEqual(requestedRanks, ["0", "5"], "arcane top orders must be fetched for rank 0 and max rank");
  assert.equal(orders.find((order) => order.id === "rank-zero-omits-rank")?.rank, 0);
  assert.equal(orders.find((order) => order.id === "max-rank-omits-rank")?.rank, 5);
  assert.equal(orders.find((order) => order.id === "explicit-rank-wins")?.rank, 3);
}

function rivenAuctionPayload(id: string, buyoutPrice: number): Record<string, unknown> {
  return {
    id,
    buyout_price: buyoutPrice,
    starting_price: buyoutPrice,
    is_direct_sell: true,
    visible: true,
    closed: false,
    platform: "pc",
    crossplay: true,
    created: "2026-07-06T00:00:00.000Z",
    updated: "2026-07-06T00:00:00.000Z",
    owner: {
      id: `${id}-seller`,
      ingame_name: `${id}-seller`,
      slug: `${id}-seller`,
      status: "ingame",
    },
    item: {
      weapon_url_name: "war",
      name: id,
      mastery_level: 0,
      mod_rank: 0,
      re_rolls: 0,
      polarity: "madurai",
      attributes: [],
    },
  };
}

function arcaneOrderPayload(id: string, type: "sell" | "buy", platinum: number, rank?: number): Record<string, unknown> {
  return {
    id,
    type,
    platinum,
    user: {
      id: `${id}-seller`,
      ingameName: `${id}-seller`,
      slug: `${id}-seller`,
      status: "ingame",
    },
    ...(rank === undefined ? {} : { rank }),
  };
}
