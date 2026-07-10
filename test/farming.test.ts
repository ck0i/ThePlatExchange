import assert from "node:assert/strict";
import {
  ARBY_TIER_BY_NODE_KEY,
  ARBY_TIER_MATERIAL,
  extractCreditCards,
  extractEndoCards,
  extractKuvaCards,
  FARMING_TOP_N,
  fetchFarmingDashboard,
  parseIncursionsForNow,
  WORLDSTATE_URL,
} from "../src/wfm/farming.js";
import type { SourceProvenance } from "../src/wfm/product.js";

const now = new Date("2026-07-10T12:00:00.000Z");

const wsSource: SourceProvenance = {
  source: "warframestat",
  url: "https://api.warframestat.us/pc",
  fetchedAt: now.toISOString(),
  ttlSeconds: 300,
  confidence: "medium",
  warnings: [],
};

function inWindow(offsetHoursFromNow: number): string {
  return new Date(now.getTime() + offsetHoursFromNow * 60 * 60 * 1000).toISOString();
}

const worldstateActiveKuva = {
  kuva: [
    {
      id: "kuva-a",
      node: "Wahiba (Mars)",
      nodeKey: "SolNode11",
      enemy: "Grineer",
      type: "Capture",
      activation: inWindow(-0.2),
      expiry: inWindow(0.5),
      eta: "30m",
    },
    {
      id: "kuva-b",
      node: "Cassini (Saturn)",
      nodeKey: "SolNode20",
      enemy: "Grineer",
      type: "Survival",
      activation: inWindow(-0.1),
      expiry: inWindow(1.5),
    },
    {
      id: "kuva-expired",
      node: "Old Node",
      type: "Capture",
      activation: inWindow(-10),
      expiry: inWindow(-1),
      expired: true,
    },
    {
      id: "kuva-future",
      node: "Future Node",
      type: "Capture",
      activation: inWindow(2),
      expiry: inWindow(3),
    },
  ],
};

const activeKuvaCards = extractKuvaCards(worldstateActiveKuva, wsSource, now);
assert.equal(activeKuvaCards.length, 2, "only currently-active kuva missions surface");
assert.ok(activeKuvaCards.every((card) => card.category === "kuva"));
assert.ok(activeKuvaCards.every((card) => card.kind === "kuva_mission"), "no variant is inferred from the node mission type");
assert.match(activeKuvaCards[0]!.title, /Kuva mission at /);
assert.ok(activeKuvaCards[0]!.rewards.some((line) => /worldstate payload does not distinguish variants/i.test(line)));
assert.ok(activeKuvaCards[0]!.rewards.some((line) => /Kuva Booster/.test(line)));
assert.ok(!activeKuvaCards[0]!.rewards.some((line) => /Steel Path variant/i.test(line)));

const worldstateActiveEndo = {
  arbitration: {
    id: "arby-a",
    node: "Cinxia (Ceres)",
    nodeKey: "SolNode25",
    type: "Defense",
    enemy: "Grineer",
    activation: inWindow(-0.1),
    expiry: inWindow(0.9),
  },
  sortie: {
    id: "sortie-a",
    activation: inWindow(-2),
    expiry: inWindow(6),
    rewardPool: "Sortie Rewards",
    boss: "Vay Hek",
    faction: "Grineer",
    variants: [{ missionType: "Assassination", node: "Everest (Earth)" }],
  },
  archonHunt: {
    id: "archon-a",
    activation: inWindow(-30),
    expiry: inWindow(48),
    boss: "Boreal",
    faction: "Narmer",
    missions: [{ type: "Extermination", node: "Kuva Fortress" }],
  },
  steelPath: {
    activation: inWindow(-24),
    expiry: inWindow(24),
    currentReward: { name: "30,000 Endo", cost: 150 },
    rotation: [
      { name: "50,000 Kuva", cost: 55 },
      { name: "30,000 Endo", cost: 150 },
    ],
  },
};

const emptyContext = {};
const endoCards = extractEndoCards(worldstateActiveEndo, wsSource, emptyContext, now);
assert.ok(endoCards.length >= 4, `expected at least 4 endo cards, got ${endoCards.length}`);
const arbyCard = endoCards.find((card) => card.kind === "arbitration");
assert.ok(arbyCard, "arbitration card present");
assert.equal(arbyCard!.tier, "S", "SolNode25 is on the arby S tier list");
assert.equal(ARBY_TIER_BY_NODE_KEY.SolNode25, "S", "arby tier map exports the S-tier entry");
assert.ok(arbyCard!.rewards.some((line) => /2,?000 Endo empty and 3,?450 Endo fully socketed/i.test(line)), "corrected Anasa endo values are cited");
assert.ok(!arbyCard!.rewards.some((line) => /3500 unmounted/i.test(line)));

const sortieCard = endoCards.find((card) => card.kind === "sortie");
assert.ok(sortieCard);
assert.ok(sortieCard!.rewards.some((line) => /single random reward/i.test(line)));

const teshinCard = endoCards.find((card) => card.kind === "steel_path_teshin");
assert.ok(teshinCard);
assert.match(teshinCard!.title, /Teshin's shop.*30,000 Endo/);

const creditCards = extractCreditCards(
  {
    ...worldstateActiveEndo,
    invasions: [
      {
        id: "inv-a",
        activation: inWindow(-6),
        node: "Kepler (Phobos)",
        desc: "Corpus vs Grineer",
        completion: 40,
        attacker: {
          reward: { credits: 25000, countedItems: [{ type: "Fieldron", count: 3 }] },
          faction: "Corpus",
        },
        defender: {
          reward: { credits: 25000, countedItems: [{ type: "Detonite Injector", count: 3 }] },
          faction: "Grineer",
        },
      },
      {
        id: "inv-done",
        node: "Done Node",
        completion: 100,
        completed: true,
        attacker: { reward: { credits: 20000 } },
      },
    ],
  },
  wsSource,
  emptyContext,
  now,
);
const invasionCard = creditCards.find((card) => card.kind === "invasion");
assert.ok(invasionCard, "active invasion card present");
assert.ok(invasionCard!.rewards.some((line) => /25,000 credit battle-pay after 3 successful runs/.test(line)));
const completedInvasion = creditCards.find((card) => card.id === "invasion-inv-done");
assert.equal(completedInvasion, undefined, "completed invasions are dropped");
const sortieCreditCard = creditCards.find((card) => card.kind === "sortie");
assert.ok(sortieCreditCard, "sortie credit card is emitted");
assert.ok(sortieCreditCard!.rewards.some((line) => /20,000 \(stage 1\) \+ 30,000 \(stage 2\) \+ 50,000 \(stage 3\) = 100,000 guaranteed/.test(line)), "sortie credit card cites the corrected stage-credit rewards");
assert.ok(!sortieCreditCard!.rewards.some((line) => /credit cache/i.test(line)), "no incorrect credit-cache claim");

const incursionsText = [
  `${Math.floor((now.getTime() - 6 * 60 * 60 * 1000) / 1000)};SolNode25,SolNode147,ClanNode24,SolNode167,SolNode402,SolNode715`,
  `${Math.floor((now.getTime() + 24 * 60 * 60 * 1000) / 1000)};SolNode1,SolNode2,SolNode3,SolNode4,SolNode5,SolNode6`,
].join("\n");
const incursions = parseIncursionsForNow(incursionsText, now);
assert.ok(incursions, "current window is picked");
assert.equal(incursions!.nodeKeys.length, 6);
assert.ok(incursions!.nodeKeys.includes("SolNode25"));

const staleText = `${Math.floor((now.getTime() - 48 * 60 * 60 * 1000) / 1000)};SolNode1,SolNode2`;
assert.equal(parseIncursionsForNow(staleText, now), null, "expired window returns null");

console.log("farming.test.ts: OK");

// Material-score ordering + top-N cap through the public entry point.
const bigCredits = {
  invasions: [
    { id: "inv-lo", node: "Low Node", completion: 10, activation: inWindow(-1), attacker: { reward: { credits: 10_000 } } },
    { id: "inv-mid", node: "Mid Node", completion: 10, activation: inWindow(-1), attacker: { reward: { credits: 45_000 } } },
    { id: "inv-hi", node: "Hi Node", completion: 10, activation: inWindow(-1), attacker: { reward: { credits: 60_000 } } },
    { id: "inv-huge", node: "Huge Node", completion: 10, activation: inWindow(-1), attacker: { reward: { credits: 90_000 } } },
    { id: "inv-item", node: "Item Node", completion: 10, activation: inWindow(-1), attacker: { reward: { countedItems: [{ type: "Fieldron", count: 3 }] } } },
    { id: "inv-tiny", node: "Tiny Node", completion: 10, activation: inWindow(-1), attacker: { reward: { credits: 500 } } },
  ],
  darkSectors: [
    { id: "ds-a", node: "Node A", creditsTaxRate: 0, faction: "Grineer" },
    { id: "ds-b", node: "Node B", creditsTaxRate: 0, faction: "Corpus" },
  ],
};
const fetcher: typeof fetch = async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url === WORLDSTATE_URL) return new Response(JSON.stringify(bigCredits), { status: 200 });
  return new Response("", { status: 404 });
};
const ranked = await fetchFarmingDashboard("test", fetcher, now);
assert.ok(ranked.credits.length <= FARMING_TOP_N, `credits capped at ${FARMING_TOP_N}`);
assert.equal(ranked.credits.length, 5, "5 credit cards emitted when 8 sources are available");
const creditNodes = ranked.credits.map((card) => card.node);
assert.deepEqual(creditNodes.slice(0, 4), ["Huge Node", "Hi Node", "Mid Node", "Low Node"], "credit cards sorted by materialScore desc");
assert.equal((ARBY_TIER_MATERIAL.S ?? 0) > (ARBY_TIER_MATERIAL.A ?? 0), true, "S tier scores higher than A tier");
assert.equal((ARBY_TIER_MATERIAL.A ?? 0) > (ARBY_TIER_MATERIAL.B ?? 0), true, "A tier scores higher than B tier");

console.log("farming.test.ts: OK (ranking + top-N)");
