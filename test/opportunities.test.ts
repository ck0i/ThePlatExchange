import assert from "node:assert/strict";
import { analyzeMarket, attributeSignature, normalizeConfig, percentile, slugify } from "../src/wfm/opportunities.js";
import type { AuctionAttribute, RivenAuction, RivenWeapon, SellerStatus } from "../src/wfm/types.js";

const war: RivenWeapon = {
  id: "war",
  slug: "war",
  name: "War",
  group: "melee",
  rivenType: "melee",
  disposition: 0.9,
  reqMasteryRank: 10,
};

const exactAttrs: AuctionAttribute[] = [
  { urlName: "critical_chance", value: 120, positive: true },
  { urlName: "critical_damage", value: 90, positive: true },
  { urlName: "zoom", value: -30, positive: false },
];

const uniqueAttrs: AuctionAttribute[] = [
  { urlName: "multishot", value: 80, positive: true },
  { urlName: "damage_vs_infested", value: -20, positive: false },
];

function makeAuction(id: string, price: number, status: SellerStatus, attrs: AuctionAttribute[], patch: Partial<RivenAuction> = {}): RivenAuction {
  return {
    id,
    weaponSlug: "war",
    name: id,
    buyoutPrice: price,
    startingPrice: price,
    topBid: null,
    isDirectSell: true,
    visible: true,
    closed: false,
    platform: "pc",
    crossplay: true,
    created: "2026-07-01T00:00:00.000Z",
    updated: "2026-07-03T00:00:00.000Z",
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
    attributes: attrs,
    noteRaw: "",
    ...patch,
  };
}

const auctions: RivenAuction[] = [
  makeAuction("offline-cheap", 45, "offline", exactAttrs),
  makeAuction("exact-cheap", 50, "ingame", exactAttrs),
  makeAuction("exact-mid-1", 150, "online", exactAttrs),
  makeAuction("exact-mid-2", 180, "online", exactAttrs),
  makeAuction("exact-high-1", 220, "online", exactAttrs),
  makeAuction("exact-high-2", 300, "online", exactAttrs),
  makeAuction("unique-cheap", 20, "online", uniqueAttrs),
  makeAuction("closed-bait", 1, "ingame", exactAttrs, { closed: true }),
  makeAuction("hidden-bait", 2, "ingame", exactAttrs, { visible: false }),
  makeAuction("auction-bid-only", 3, "ingame", exactAttrs, { isDirectSell: false }),
];

assert.equal(slugify("Kuva Bramma"), "kuva_bramma");
assert.equal(attributeSignature([...exactAttrs].reverse()), "+critical_chance+critical_damage|-zoom");
assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
assert.deepEqual(normalizeConfig({ statuses: [] }).statuses, ["ingame", "online"]);

const analysis = analyzeMarket([war], new Map([["war", auctions]]), {
  watchlist: ["War"],
  minProfit: 20,
  minRoi: 0.25,
  minGroupSize: 4,
  statuses: ["ingame", "online"],
  maxResults: 20,
});

const ids = analysis.opportunities.map((entry) => entry.auctionId);
assert(ids.includes("exact-cheap"), "cheap exact-stat riven should be ranked");
assert(ids.includes("unique-cheap"), "unique cheap riven should fall back to weapon market comparables");
assert(!ids.includes("offline-cheap"), "offline seller is not actionable by default filter");
assert(!ids.includes("closed-bait"), "closed listings must be ignored");
assert(!ids.includes("hidden-bait"), "invisible listings must be ignored");
assert(!ids.includes("auction-bid-only"), "non-direct auctions must be ignored");
assert.equal(analysis.opportunities[0]?.auctionId, "unique-cheap", "default ordering should favor largest platinum margin");
for (const opportunity of analysis.opportunities) {
  assert(opportunity.score >= 0 && opportunity.score <= 100, "score should be an understandable 0-100 value");
}

const exact = analysis.opportunities.find((entry) => entry.auctionId === "exact-cheap");
assert(exact, "exact opportunity missing");
assert.equal(exact.groupType, "exact-stats");
assert.equal(exact.targetSellPrice, 210);
assert.equal(exact.conservativeSellPrice, 165);
assert.equal(exact.expectedProfit, 160);
assert.equal(exact.buyToSellRatio, 4.2);
assert.equal(exact.status, "ingame");

const unique = analysis.opportunities.find((entry) => entry.auctionId === "unique-cheap");
assert(unique, "fallback opportunity missing");
assert.equal(unique.groupType, "weapon-market");
assert.equal(unique.targetSellPrice, 200);
assert(unique.roi > exact.roi, "fallback cheap listing should expose the stronger ratio");

const minBuyFiltered = analyzeMarket([war], new Map([["war", auctions]]), {
  watchlist: ["war"],
  minProfit: 20,
  minRoi: 0.25,
  minGroupSize: 4,
  minBuyPrice: 40,
  statuses: ["ingame", "online"],
  maxResults: 20,
});
assert(!minBuyFiltered.opportunities.some((entry) => entry.auctionId === "unique-cheap"), "min buy filter should remove too-cheap buys");
assert(minBuyFiltered.opportunities.some((entry) => entry.auctionId === "exact-cheap"), "min buy filter should keep buys at or above threshold");

const maxSellFiltered = analyzeMarket([war], new Map([["war", auctions]]), {
  watchlist: ["war"],
  minProfit: 20,
  minRoi: 0.25,
  minGroupSize: 4,
  maxSellPrice: 205,
  statuses: ["ingame", "online"],
  maxResults: 20,
});
assert(maxSellFiltered.opportunities.some((entry) => entry.auctionId === "unique-cheap"), "max sell filter should keep targets at or below threshold");
assert(!maxSellFiltered.opportunities.some((entry) => entry.auctionId === "exact-cheap"), "max sell filter should remove targets above threshold");

const summary = analysis.weaponSummaries[0];
assert(summary, "summary missing");
assert.equal(summary.listings, 10);
assert.equal(summary.directListings, 7);
assert.equal(summary.priceStats?.min, 20);
assert.equal(summary.priceStats?.p75, 200);

const withOffline = analyzeMarket([war], new Map([["war", auctions]]), {
  watchlist: ["war"],
  minProfit: 20,
  minRoi: 0.25,
  minGroupSize: 4,
  statuses: ["ingame", "online", "offline"],
  maxResults: 20,
});
assert(withOffline.opportunities.some((entry) => entry.auctionId === "offline-cheap"), "offline can be explicitly included");

const smallBook = analyzeMarket([war], new Map([["war", auctions.slice(0, 3)]]), {
  watchlist: ["war"],
  minProfit: 1,
  minRoi: 0.01,
  minGroupSize: 4,
  statuses: ["ingame", "online", "offline"],
});
assert.equal(smallBook.opportunities.length, 0, "small comparable books should not produce false confidence");

console.log("opportunities behavior tests passed");
