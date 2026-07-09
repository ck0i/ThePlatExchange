import assert from "node:assert/strict";
import { createInitialProductDashboard, buildProductDashboard, tradabilityForItem } from "../src/wfm/productEngine.js";
import type { MarketItem, WarframeMarketClient } from "../src/wfm/client.js";
import type { AuctionOwner, ArcaneOrder } from "../src/wfm/types.js";

type FetchMode = "success" | "failure";

type LivePayload = {
  fissures: Array<Record<string, unknown>>;
};

const personalization = createInitialProductDashboard().personalization;

const owner: AuctionOwner = {
  id: "trader-1",
  ingameName: "Trader",
  slug: "seller",
  reputation: 19,
  status: "ingame",
  platform: "pc",
  crossplay: true,
};

const items: MarketItem[] = [
  {
    id: "item-blind-rage",
    slug: "blind_rage",
    name: "Blind Rage",
    tags: ["mod"],
    tradable: true,
    bulkTradable: true,
    maxRank: 6,
  },
  {
    id: "item-aya",
    slug: "aya",
    name: "Aya",
    tags: ["mod"],
    tradable: true,
    bulkTradable: true,
    maxRank: 6,
  },
  {
    id: "item-primed-vigor",
    slug: "primed_vigor",
    name: "Primed Vigor",
    tags: ["mod"],
    tradable: true,
    bulkTradable: true,
    maxRank: 6,
  },
  {
    id: "item-syndicate",
    slug: "syndicate_coin",
    name: "Syndicate Coin",
    tags: ["syndicate"],
    tradable: true,
    bulkTradable: true,
  },
  {
    id: "item-barrel",
    slug: "soma_prime_barrel",
    name: "Soma Prime Barrel",
    tags: ["mod"],
    tradable: true,
    bulkTradable: true,
    ducats: 20,
  },
  {
    id: "item-resource-tradable",
    slug: "neural_sensor",
    name: "Neural Sensor",
    tags: ["resource"],
    tradable: true,
    bulkTradable: true,
  },
  {
    id: "item-resource-raw",
    slug: "ferrite",
    name: "Ferrite",
    tags: ["resource"],
    tradable: true,
    bulkTradable: true,
  },
  {
    id: "item-relic-lith-a1",
    slug: "lith_a1_relic",
    name: "Lith A1 Relic",
    tags: ["relic"],
    tradable: true,
    bulkTradable: true,
  },
];

const baseOrderTime = "2026-07-06T00:00:00.000Z";

function order(
  id: string,
  slug: string,
  type: "sell" | "buy",
  platinum: number,
  rank = 0,
  status: AuctionOwner["status"] = "ingame",
): ArcaneOrder {
  return {
    id,
    type,
    platinum,
    unitPrice: platinum,
    quantity: 1,
    perTrade: 1,
    rank,
    visible: true,
    createdAt: baseOrderTime,
    updatedAt: baseOrderTime,
    itemId: slug,
    user: { ...owner, status },
  };
}

const orderBooks = new Map<string, ArcaneOrder[]>([
  [
    "blind_rage",
    [
      order("blind_rage-r0-sell-1", "blind_rage", "sell", 14, 0, "online"),
      order("blind_rage-r0-sell-2", "blind_rage", "sell", 16, 0, "ingame"),
      order("blind_rage-r0-buy-1", "blind_rage", "buy", 12, 0, "online"),
    ],
  ],
  [
    "blind_rage::6",
    [
      order("blind_rage-r6-sell-1", "blind_rage", "sell", 260, 6, "online"),
      order("blind_rage-r6-buy-1", "blind_rage", "buy", 190, 6, "ingame"),
    ],
  ],
  [
    "soma_prime_barrel",
    [
      order("barrel-r0-sell-1", "soma_prime_barrel", "sell", 320, 0, "online"),
      order("barrel-r0-sell-2", "soma_prime_barrel", "sell", 310, 0, "online"),
      order("barrel-r0-buy-1", "soma_prime_barrel", "buy", 230, 0, "online"),
      order("barrel-r0-buy-2", "soma_prime_barrel", "buy", 250, 0, "ingame"),
    ],
  ],
  [
    "neural_sensor",
    [
      order("sensor-r0-sell-1", "neural_sensor", "sell", 52, 0, "online"),
      order("sensor-r0-buy-1", "neural_sensor", "buy", 40, 0, "ingame"),
    ],
  ],
  [
    "lith_a1_relic",
    [
      order("relic-lith-a1-r0-sell-1", "lith_a1_relic", "sell", 180, 0, "online"),
      order("relic-lith-a1-r0-buy-1", "lith_a1_relic", "buy", 150, 0, "online"),
    ],
  ],
  [
    "syndicate_coin",
    [
      order("syndicate-r0-sell-1", "syndicate_coin", "sell", 130, 0, "ingame"),
      order("syndicate-r0-buy-1", "syndicate_coin", "buy", 110, 0, "online"),
    ],
  ],
]);

function buildClient(orders: Map<string, ArcaneOrder[]>): WarframeMarketClient {
  return {
    async marketItems() {
      return items;
    },
    async topItemOrders(slug: string, rank = 0) {
      return orders.get(`${slug}::${rank}`) ?? orders.get(slug) ?? [];
    },
    health() {
      return {
        userAgent: "fake-engine-client",
        orderCacheEntries: orders.size,
        itemCatalogLoadedAt: baseOrderTime,
        lastSuccessAt: baseOrderTime,
      };
    },
  } as unknown as WarframeMarketClient;
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function textResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function buildLivePayload(base: Date): LivePayload {
  const activation = new Date(base.getTime() - 60_000).toISOString();
  const expiry = new Date(base.getTime() + 20 * 60_000).toISOString();
  return {
    fissures: [
      {
        id: "fissure-lith",
        activation,
        expiry,
        expired: false,
        node: "Akkad",
        missionType: "Extermination",
        tier: "Lith",
        isStorm: false,
        isHard: false,
      },
    ],
  };
}

function makeFetcher(
  mode: FetchMode,
  live: LivePayload,
  dropHtml: string,
): typeof fetch {
  return async (input: string | URL | Request, _init?: RequestInit) => {
    const url = requestUrl(input);

    if (url.includes("warframe.com/droptables")) {
      if (mode === "failure") {
        throw new Error("simulated drop-table outage");
      }
      return textResponse(dropHtml);
    }

    if (url.includes("/fissures")) {
      if (mode === "failure") {
        throw new Error("simulated live outage");
      }
      return jsonResponse(live.fissures);
    }


    return textResponse("public-export-manifest");
  };
}

const dropHtml = `
<html>
  <body>
    <b>Last Update:</b> Jul 06, 2026
    <h3 id="relicRewards">Relic Rewards</h3>
    <table>
      <tr><th colspan="2">Lith A1 Relic (Intact)</th></tr>
      <tr><td>Soma Prime Barrel</td><td>Common (100%)</td></tr>
    </table>
  </body>
</html>`;

const client = buildClient(orderBooks);

const success = await buildProductDashboard(client, personalization, {
  fetcher: makeFetcher("success", buildLivePayload(new Date()), dropHtml),
  maxExpansionItems: 20,
  maxRelics: 8,
});

const successMethodIds = new Set(success.methods.map((entry) => entry.id));
assert.ok(successMethodIds.has("mods"), "mods method must be present from mod-rank engine");
assert.ok(successMethodIds.has("prime_relics"), "prime_relics method must be present from relic engine");
assert.ok(successMethodIds.has("run_now"), "run_now method must be present from live activity engine");
assert.ok(successMethodIds.has("resources"), "resources method must be present from tradable commodity scan");

assert.equal(success.prime.warnings.some((entry) => entry.includes("unavailable")), false, "successful build should not carry synthetic fetch-failure warnings");

assert.ok(success.opportunities.some((entry) => entry.id === "mod-rank:blind_rage"), "tradable mod with positive rank EV should be recommended");
assert.ok(success.opportunities.some((entry) => entry.id === "resource:neural_sensor"), "tradable resource should be emitted as commodity opportunity");
assert.ok(
  success.opportunities.some((entry) => entry.id.startsWith("relic:")),
  "fake drop + market input must produce at least one Prime/Relic opportunity",
);
assert.ok(
  success.opportunities.some((entry) => entry.methodId === "run_now"),
  "valid live fissure payload must emit run-now opportunities",
);

assert.ok(!success.opportunities.some((entry) => entry.id === "mod-rank:aya"), "Aya should not become a rank/mod opportunity");
assert.ok(!success.opportunities.some((entry) => entry.id === "mod-rank:primed_vigor"), "restricted Primed mods should be excluded from rank opportunities");
assert.ok(!success.opportunities.some((entry) => entry.id === "resource:ferrite"), "raw ore/resource candidates should be excluded from tradable commodity opportunities");

const degraded = await buildProductDashboard(client, personalization, {
  fetcher: makeFetcher("failure", buildLivePayload(new Date(Date.now() + 20_000)), dropHtml),
  maxExpansionItems: 20,
  maxRelics: 8,
});

const drops = degraded.dataHealth.sources.find((entry) => entry.id === "drops");
assert.ok(drops, "drops source health must remain present when drop tables fail");
assert.equal(drops?.status, "red", "drops source health must be red on drop-table failure");
assert.ok(
  drops?.warnings.some((entry) => entry.includes("simulated drop-table outage")),
  "drops source must retain raw fetch failure text",
);

const live = degraded.dataHealth.sources.find((entry) => entry.id === "live");
assert.ok(live, "live source health must remain present when warframe.live fetches fail");
assert.equal(live?.status, "red", "live source should be red when live fetchers fail with thrown transport errors");
assert.ok(
  live?.warnings.some((entry) => entry.includes("simulated live outage")),
  "live source must retain raw live fetch failure text",
);

assert.ok(
  degraded.dataHealth.warnings.some((entry) => entry.includes("Official drop tables unavailable")),
  "top-level data health should include canonical drop-table prefix warning",
);

assert.ok(
  degraded.prime.sources.some(
    (entry) => entry.source === "official_drop_tables" && entry.warnings.some((warning) => warning.includes("simulated drop-table outage")),
  ),
  "prime source provenance must preserve the failed official-drop source warning",
);

assert.ok(
  degraded.opportunities.some((entry) => entry.id === "mod-rank:blind_rage"),
  "market-derived mod opportunities must still work when drop/live sources degrade",
);
assert.ok(
  degraded.opportunities.every((entry) => entry.methodId !== "run_now"),
  "run-now opportunities should disappear when live source fails entirely",
);

assert.equal(
  tradabilityForItem({ name: "Aya", tags: ["mod"], tradable: true, bulkTradable: false, slug: "aya" }).status,
  "not_tradable",
  "Aya must be marked non-tradable before scoring",
);
assert.equal(
  tradabilityForItem({ name: "Primed Vigor", tags: ["mod"], tradable: true, bulkTradable: false, slug: "primed_vigor" }).status,
  "not_tradable",
  "Restricted/mod-restricted mod families should be excluded by tradability rules",
);
assert.equal(
  tradabilityForItem({ name: "Ferrite", tags: ["resource"], tradable: true, bulkTradable: false, slug: "ferrite" }).status,
  "not_tradable",
  "Raw resources should be excluded from tradable commodity scoring",
);
assert.equal(
  tradabilityForItem({
    name: "Neural Sensor",
    tags: ["resource"],
    tradable: true,
    bulkTradable: false,
    slug: "neural_sensor",
  }).status,
  "tradable",
  "Non-raw tradable resources should remain eligible for commodity opportunities",
);

console.log("product engine dashboard tests passed");
