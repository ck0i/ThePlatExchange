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
  makeAuction("six-figure-bait", 100_000, "ingame", exactAttrs),
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
assert(!ids.includes("six-figure-bait"), "six-figure listings must be ignored");
assert.equal(analysis.opportunities[0]?.auctionId, "unique-cheap", "default ordering should favor largest platinum margin");
for (const opportunity of analysis.opportunities) {
  assert(opportunity.score >= 0 && opportunity.score <= 100, "score should be an understandable 0-100 value");
}

const exact = analysis.opportunities.find((entry) => entry.auctionId === "exact-cheap");
assert(exact, "exact opportunity missing");
assert.equal(exact.groupType, "exact-stats");
assert.equal(exact.targetSellPrice, 220);
assert.equal(exact.conservativeSellPrice, 180);
// Comparable pricing excludes the candidate itself, so the cheap listing cannot
// drag down the peer median or p75 target used for expected resale.
assert.equal(exact.expectedProfit, 130);
assert.equal(exact.buyToSellRatio, 4.4);
assert.equal(exact.status, "ingame");

const unique = analysis.opportunities.find((entry) => entry.auctionId === "unique-cheap");
assert(unique, "fallback opportunity missing");
assert.equal(unique.groupType, "weapon-market");
assert.equal(unique.targetSellPrice, 206);
assert(unique.roi > exact.roi, "fallback cheap listing should expose the stronger ratio");

const instantWinIds = analysis.instantWins.map((entry) => entry.opportunity.auctionId);
assert(instantWinIds.includes("exact-cheap"), "cheap exact-stat riven should be flagged as an instant win");
assert(!instantWinIds.includes("offline-cheap"), "off-status listings must not become instant wins");
assert(!instantWinIds.includes("closed-bait"), "closed listings must not become instant wins");
assert(!instantWinIds.includes("hidden-bait"), "invisible listings must not become instant wins");
assert(!instantWinIds.includes("auction-bid-only"), "non-direct auctions must not become instant wins");

const exactInstantWin = analysis.instantWins.find((entry) => entry.opportunity.auctionId === "exact-cheap");
assert(exactInstantWin, "exact instant win missing");
assert.equal(exactInstantWin.basis, "same-signature");
assert.equal(exactInstantWin.signature_value.source, "live_signature");
assert.equal(exactInstantWin.signature_value.sample_count, 5);
assert.equal(exactInstantWin.signature_value.p25, 150);
assert.equal(exactInstantWin.signature_value.p50, 180);
assert.equal(exactInstantWin.discount_to_p25, 100);
assert(
  exactInstantWin.reasons.some((reason) => reason.includes("peer listings excluding this auction")),
  "instant win explanation should disclose candidate-excluded peer pricing",
);
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
  maxSellPrice: 206,
  statuses: ["ingame", "online"],
  maxResults: 20,
});
assert(maxSellFiltered.opportunities.some((entry) => entry.auctionId === "unique-cheap"), "max sell filter should keep targets at or below threshold");
assert(!maxSellFiltered.opportunities.some((entry) => entry.auctionId === "exact-cheap"), "max sell filter should remove targets above threshold");
assert(
  maxSellFiltered.instantWins.some((entry) => entry.opportunity.auctionId === "exact-cheap"),
  "max sell filters final opportunities only; instant wins should still come from raw actionable auctions",
);

const summary = analysis.weaponSummaries[0];
assert(summary, "summary missing");
assert.equal(summary.listings, 10);
assert.equal(summary.directListings, 7);
assert.equal(summary.priceStats?.min, 20);
assert.equal(summary.priceStats?.p75, 200);
assert(summary.marketIntel, "summary market intel missing");
assert.equal(summary.marketIntel.opportunityCount, 2);
assert.equal(summary.marketIntel.bestOpportunityProfit, 154);
assert(summary.marketIntel.marketScore > 0, "market intel should expose a ranked market score");
assert(summary.marketIntel.reasons.some((reason) => reason.includes("ranked buy-low candidates")), "market intel should explain ranked candidates");

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

const tinyOutlierAnalysis = analyzeMarket([war], new Map([[
  "war",
  [
    makeAuction("tiny-floor", 1, "ingame", exactAttrs),
    makeAuction("tiny-peer", 10, "online", exactAttrs),
    makeAuction("tiny-unreal", 35_000, "online", exactAttrs),
  ],
]]), {
  watchlist: ["war"],
  minProfit: 1,
  minRoi: 0.01,
  minGroupSize: 2,
  statuses: ["ingame", "online"],
});
const tinyOutlierSummary = tinyOutlierAnalysis.weaponSummaries.find((entry) => entry.slug === "war");
assert(tinyOutlierSummary?.priceStats, "tiny outlier summary stats missing");
assert.equal(tinyOutlierSummary.priceStats.max, 10, "isolated 35,000p listing must not define a 1-10p market max");
assert.equal(tinyOutlierSummary.priceStats.p75, 8, "isolated 35,000p listing must not inflate a 1-10p market p75");
assert(!tinyOutlierAnalysis.opportunities.some((entry) => entry.auctionId === "tiny-unreal"), "isolated 35,000p listing must not become an opportunity");

const ratioOutlierAuctions: RivenAuction[] = [
  makeAuction("ratio-floor", 300, "ingame", exactAttrs),
  makeAuction("ratio-peer-1", 350, "online", exactAttrs),
  makeAuction("ratio-peer-2", 400, "online", exactAttrs),
  makeAuction("ratio-unreal-1", 15_000, "online", exactAttrs),
  makeAuction("ratio-unreal-2", 30_000, "online", exactAttrs),
];
const ratioOutlierAnalysis = analyzeMarket([war], new Map([["war", ratioOutlierAuctions]]), {
  watchlist: ["war"],
  minProfit: 1,
  minRoi: 0.01,
  minGroupSize: 2,
  statuses: ["ingame", "online"],
});
const ratioOutlierSummary = ratioOutlierAnalysis.weaponSummaries.find((entry) => entry.slug === "war");
assert(ratioOutlierSummary?.priceStats, "ratio outlier summary stats missing");
assert.equal(ratioOutlierSummary.priceStats.max, 400, "15,000p/30,000p tail must not define a 300-400p market max");
assert.equal(ratioOutlierSummary.priceStats.p75, 375, "15,000p/30,000p tail must not inflate a 300-400p market p75");
assert(!ratioOutlierAnalysis.opportunities.some((entry) => entry.auctionId.startsWith("ratio-unreal")), "ratio outliers must not become opportunities");
const ratioFloorOpportunity = ratioOutlierAnalysis.opportunities.find((entry) => entry.auctionId === "ratio-floor");
assert(ratioFloorOpportunity, "300p floor listing should still produce a low-risk opportunity against sane peers");
assert.equal(ratioFloorOpportunity.conservativeSellPrice, 375);
assert.equal(ratioFloorOpportunity.targetSellPrice, 388);
assert.equal(ratioFloorOpportunity.expectedProfit, 75);

const roiCapOpportunityAnalysis = analyzeMarket([war], new Map([[
  "war",
  [
    makeAuction("roi-cap-kept", 10, "ingame", exactAttrs),
    makeAuction("roi-cap-peer-1", 180, "online", exactAttrs),
    makeAuction("roi-cap-peer-2", 190, "online", exactAttrs),
  ],
]]), {
  watchlist: ["war"],
  minProfit: 1,
  minRoi: 0.01,
  minGroupSize: 2,
  statuses: ["ingame", "online"],
});
const roiCapKept = roiCapOpportunityAnalysis.opportunities.find((entry) => entry.auctionId === "roi-cap-kept");
assert(roiCapKept, "opportunity at the 1750% ROI sanity cap should remain actionable");
assert.equal(roiCapKept.conservativeSellPrice, 185);
assert.equal(roiCapKept.roi, 17.5);

const roiCapFilteredAnalysis = analyzeMarket([war], new Map([[
  "war",
  [
    makeAuction("roi-cap-too-cheap", 10, "ingame", exactAttrs),
    makeAuction("roi-cap-high-peer-1", 188, "online", exactAttrs),
    makeAuction("roi-cap-high-peer-2", 190, "online", exactAttrs),
  ],
]]), {
  watchlist: ["war"],
  minProfit: 1,
  minRoi: 0.01,
  minGroupSize: 2,
  statuses: ["ingame", "online"],
});
assert(
  !roiCapFilteredAnalysis.opportunities.some((entry) => entry.auctionId === "roi-cap-too-cheap"),
  "opportunity above the 1750% ROI sanity cap should be filtered out",
);

const roiCapInstantWinAnalysis = analyzeMarket([war], new Map([[
  "war",
  [
    makeAuction("roi-cap-instant-floor", 10, "ingame", exactAttrs),
    makeAuction("roi-cap-instant-peer-1", 190, "online", exactAttrs),
    makeAuction("roi-cap-instant-peer-2", 200, "online", exactAttrs),
    makeAuction("roi-cap-instant-peer-3", 210, "online", exactAttrs),
  ],
]]), {
  watchlist: ["war"],
  minProfit: 1,
  minRoi: 0.01,
  minGroupSize: 2,
  statuses: ["ingame", "online"],
});
assert(
  !roiCapInstantWinAnalysis.instantWins.some((entry) => entry.opportunity.auctionId === "roi-cap-instant-floor"),
  "instant win above the 1750% ROI sanity cap should be filtered out",
);
const instantOutlierAnalysis = analyzeMarket([war], new Map([[
  "war",
  [
    makeAuction("instant-floor", 1, "ingame", exactAttrs),
    makeAuction("instant-peer-1", 10, "online", exactAttrs),
    makeAuction("instant-peer-2", 12, "online", exactAttrs),
    makeAuction("instant-peer-3", 14, "online", exactAttrs),
    makeAuction("instant-unreal", 35_000, "online", exactAttrs),
  ],
]]), {
  watchlist: ["war"],
  minProfit: 1,
  minRoi: 0.01,
  minGroupSize: 2,
  statuses: ["ingame", "online"],
});
const instantOutlier = instantOutlierAnalysis.instantWins.find((entry) => entry.opportunity.auctionId === "instant-floor");
assert(instantOutlier, "floor listing should still be an instant win against sane peers");
assert.equal(instantOutlier.signature_value.max, 14, "instant-win peers must exclude isolated 35,000p listings");
assert.equal(instantOutlier.signature_value.p75, 13, "instant-win valuation must not be inflated by isolated 35,000p listings");

const roiAllowedAnalysis = analyzeMarket([war], new Map([[
  "war",
  [
    makeAuction("roi-allowed-floor", 10, "ingame", exactAttrs),
    makeAuction("roi-allowed-peer-1", 180, "online", exactAttrs),
    makeAuction("roi-allowed-peer-2", 180, "online", exactAttrs),
  ],
]]), {
  watchlist: ["war"],
  minProfit: 1,
  minRoi: 0.01,
  minGroupSize: 2,
  statuses: ["ingame", "online"],
});
const roiAllowedOpportunity = roiAllowedAnalysis.opportunities.find((entry) => entry.auctionId === "roi-allowed-floor");
assert(roiAllowedOpportunity, "1700% ROI should remain below the 1750% sanity cap");
assert.equal(roiAllowedOpportunity.roi, 17);

const roiBlockedAnalysis = analyzeMarket([war], new Map([[
  "war",
  [
    makeAuction("roi-blocked-floor", 10, "ingame", exactAttrs),
    makeAuction("roi-blocked-peer-1", 190, "online", exactAttrs),
    makeAuction("roi-blocked-peer-2", 190, "online", exactAttrs),
    makeAuction("roi-blocked-peer-3", 190, "online", exactAttrs),
  ],
]]), {
  watchlist: ["war"],
  minProfit: 1,
  minRoi: 0.01,
  minGroupSize: 2,
  statuses: ["ingame", "online"],
});
assert(!roiBlockedAnalysis.opportunities.some((entry) => entry.auctionId === "roi-blocked-floor"), "ROI above 1750% must be excluded from opportunities");
assert(!roiBlockedAnalysis.instantWins.some((entry) => entry.opportunity.auctionId === "roi-blocked-floor"), "ROI above 1750% must be excluded from instant wins");

const preservedOpportunityAuctions: RivenAuction[] = [
  ...Array.from({ length: 6 }, (_, index) => makeAuction(`preserved-cheap-${index + 1}`, 10 + index, "ingame", exactAttrs)),
  ...Array.from({ length: 10 }, (_, index) => makeAuction(`preserved-market-${index + 1}`, 100, "ingame", exactAttrs)),
];
const preservedAnalysis = analyzeMarket([war], new Map([["war", preservedOpportunityAuctions]]), {
  watchlist: ["war"],
  minProfit: 20,
  minRoi: 0.25,
  minGroupSize: 4,
  statuses: ["ingame"],
  maxResults: 3,
});
const preservedIds = preservedAnalysis.opportunities.map((entry) => entry.auctionId);
assert.equal(
  preservedAnalysis.opportunities.length,
  6,
  "server analysis should preserve every valid opportunity instead of truncating to config.maxResults",
);
assert(
  preservedIds.includes("preserved-cheap-6"),
  "server analysis should keep opportunities beyond the user-visible maxResults window",
);

const hotBlade: RivenWeapon = {
  id: "hot-blade",
  slug: "hot_blade",
  name: "Hot Blade",
  group: "melee",
  rivenType: "melee",
  disposition: 1.1,
  reqMasteryRank: 8,
};

const coldCannon: RivenWeapon = {
  id: "cold-cannon",
  slug: "cold_cannon",
  name: "Cold Cannon",
  group: "primary",
  rivenType: "rifle",
  disposition: 1.3,
  reqMasteryRank: 12,
};

const summaryOrdering = analyzeMarket(
  [coldCannon, hotBlade],
  new Map([
    [
      "hot_blade",
      [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125].map((price, index) =>
        makeAuction(`hot-${index + 1}`, price, index % 3 === 0 ? "ingame" : "online", exactAttrs, { weaponSlug: "hot_blade" }),
      ),
    ],
    [
      "cold_cannon",
      [500, 600, 700, 800].map((price, index) =>
        makeAuction(`cold-${index + 1}`, price, "offline", exactAttrs, { weaponSlug: "cold_cannon" }),
      ),
    ],
  ]),
  {
    watchlist: ["hot_blade", "cold_cannon"],
    minProfit: 10_000,
    minRoi: 0.01,
    minGroupSize: 4,
    statuses: ["ingame", "online"],
  },
);
const hotSummary = summaryOrdering.weaponSummaries.find((entry) => entry.slug === "hot_blade");
const coldSummary = summaryOrdering.weaponSummaries.find((entry) => entry.slug === "cold_cannon");
assert(hotSummary?.marketIntel, "hot market intel missing");
assert(coldSummary?.marketIntel, "cold market intel missing");
assert(hotSummary.priceStats && coldSummary.priceStats, "summary price stats missing");
assert(coldSummary.priceStats.p75 > hotSummary.priceStats.p75, "fixture must have a higher p75 on the cold market");
assert.equal(
  summaryOrdering.weaponSummaries[0]?.slug,
  "hot_blade",
  "weapon summaries should rank market quality ahead of a stale high-p75 book",
);
assert(hotSummary.marketIntel.marketScore > coldSummary.marketIntel.marketScore, "deeper active market should score above stale high prices");
assert(hotSummary.marketIntel.liquidityScore > coldSummary.marketIntel.liquidityScore, "online direct depth should improve liquidity score");
assert.equal(hotSummary.marketIntel.demand, "steady");
assert.equal(coldSummary.marketIntel.demand, "dead");
assert.equal(hotSummary.marketIntel.actionableRatio, 1);
assert.equal(coldSummary.marketIntel.actionableRatio, 0);
console.log("opportunities behavior tests passed");
