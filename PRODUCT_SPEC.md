# The Plat Exchange Product Spec

Status: long-horizon product direction  
Date: 2026-07-06  
Product: The Plat Exchange (TPE)

## 1. Product vision

The Plat Exchange is the Warframe platinum-making analytics platform.

Warframe.market is the public outbound market: it helps players list, buy, and sell items that Digital Extremes does not officially broker outside the game. TPE serves a different niche. It turns public market data, official drop/acquisition data, and live Warframe activity data into actionable recommendations for players whose primary goal is to make platinum.

TPE should answer, with evidence:

- What should I farm, buy, open, refine, rank, convert, hold, complete, or sell right now?
- Why is that better than the alternatives?
- How liquid is it, how stale is the data, what assumptions were used, and what can go wrong?
- What should I put on my personal to-do list, watchlist, or alert rules?

The long-term product is not a clone of Warframe.market. It must add analytical value on top of Warframe.market and Warframe data: expected value, opportunity cost, liquidity, confidence, source freshness, route planning, and user-specific execution tracking.

## 2. Existing baseline and spec scope

TPE already has substantial Riven and Arcane functionality. Those surfaces are treated as implemented product, not roadmap work in this spec.

This spec focuses on the long-horizon expansion layers that are not already integrated:

- generic plat-making methods beyond Rivens and Arcanes;
- accounts, personal todos, saved filters, portfolios, and notifications;
- live Warframe activity integrations that rank what is worth running now;
- shared data provenance, confidence, source-health, and method abstractions for future modules.

## 3. Product principles

1. Accuracy over breadth. A shallow list of methods is less valuable than one method that is correct, explainable, and fresh.
2. Every recommendation needs provenance. Display data source, fetched-at time, sample size, source freshness, and confidence.
3. Market prices are estimates, not confirmed sales. TPE must label prices as listing/order-derived unless a verified sold-price source exists.
4. The user decides and trades manually. TPE may alert, rank, explain, and prepare checklists. It must not auto-message, auto-order, auto-undercut, or auto-trade.
5. Respect upstream services. Use identifiable User-Agent headers, caching, deduping, rate limits, and backoff. Avoid tight polling.
6. Deep beats generic. A method is only product-ready when it captures the Warframe-specific mechanics that make the recommendation useful.
7. Explain the counterfactual. Good recommendations compare against alternatives: sell now vs hold, crack vs sell relic, convert standing vs sell item, complete a set vs sell parts, or run this mission vs ignore it.
8. Personalization is private by default. Watchlists, inventories, portfolios, todos, alerts, and trade logs reveal strategy and should be treated as sensitive.

## 4. Source-of-truth and data governance

TPE's core differentiator is joining several imperfect sources into one confidence-scored answer. Each data record must carry `SourceProvenance`:

```ts
type SourceProvenance = {
  source: "warframe.market" | "official_drop_tables" | "public_export" | "worldstate" | "warframestat" | "warframe_wiki" | "manual_user" | "tpe_history";
  url?: string;
  fetchedAt: string;
  observedAt?: string;
  ttlSeconds: number;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};
```

### 4.1 Data-source matrix

| Source | TPE use | Verified source/link | Refresh cadence | Confidence and fallback behavior |
| --- | --- | --- | --- | --- |
| Warframe.market v2 items | Tradable item catalog, slugs, item IDs, tags, `gameRef`, rankability, bulk tradability, images. | Docs home: <https://docs.warframe.market/>. Live endpoint verified: <https://api.warframe.market/v2/items>. | Reference sync every 6-24h, plus manual refresh after schema drift. Cache aggressively. | High for market catalog as listed by Warframe.market. Medium for tradability edge cases; validate against game/wiki rules. If down, serve last known catalog with stale warning. |
| Warframe.market v2 orders/top orders | Current listing book for item commodities, including buy/sell side, rank, quantity, seller status, user reputation/platform/crossplay. | Live endpoint verified with a Prime set example: <https://api.warframe.market/v2/orders/item/frost_prime_set/top>. | Hot items: minutes. Cold items: tens of minutes to hours. Respect 3 req/s general public limit and stricter endpoint limits from WFM rules; central cache + dedupe required. | Medium-high for current visible listings. Not confirmed sales. Downstream outputs must show sample size and listing-derived confidence. |
| Warframe.market rules | Compliance and rate-limit behavior: identifiable User-Agent, caching, no browser impersonation, no tight polling; general public API limit observed as 3 req/s. | <https://docs.warframe.market/docs/rules/overview>. | Review before changing client behavior. | Blocking product constraint. If rules change, ingestion must adapt before adding load. |
| Official Warframe drop tables | Canonical drop/acquisition probabilities for missions, relics, bounties, rotations, mods, resources, and other reward tables. | <https://www.warframe.com/droptables> redirects to current PC drops page. Verified page states last update, PC scope, auto-generated internal data, no guarantee of completeness, and manual publishing with Updates not all Hotfixes. | Daily check for content hash; forced refresh on Warframe update/hotfix notes if available. | High for listed PC drop rates; medium for newest systems and non-PC parity. If missing, mark method unavailable or use wiki as lower-confidence supplemental source. |
| Official PublicExport | Canonical item metadata from DE content manifests; identity mapping via `uniqueName`/game path to WFM `gameRef`/slug. | <https://content.warframe.com/PublicExport/index_en.txt.lzma>. | Daily or on content hash change. | High for game item identity, but ingestion requires LZMA/hash parsing and schema validation. If unavailable, use last known snapshot and lower identity confidence. |
| Official worldstate | Raw live star-chart state when reachable: fissures, cycles, invasions, sorties, steel path, events. | Attempted source: <https://content.warframe.com/dynamic/worldState.php>; returned HTTP 404 in this environment. | 1-5 minutes for live activities if reachable. | Preferred canonical source when available. If unreachable, do not fail product; use WFCD/warframestat wrapper with defensive validation. |
| WFCD/warframestat.us | Practical live Warframe activity wrapper: fissures, invasions, steel path, cycles, sortie, syndicate missions, arbitration endpoint. | Docs: <https://docs.warframestat.us/>. Fissures verified: <https://api.warframestat.us/pc/fissures>. Arbitration verified but returned expired placeholder-like data: <https://api.warframestat.us/pc/arbitration>. | 1-5 minutes for live activity pages. | Medium. Validate expiry/activation/node/type fields. Reject expired placeholder values. Cross-check important signals against raw worldstate when reachable. |
| Warframe Wiki trading rules | Tradability, taxes, rank restrictions, trade limits, and edge cases that public market tags may not fully encode. | Trading page verified: <https://wiki.warframe.com/w/Trading>. | Weekly and on major updates. | Medium. Community-maintained; use as supplemental rules and link warnings. Critical tradability should be tested against WFM catalog and official sources when possible. |
| Warframe Wiki relic/Aya pages | Relic mechanics, refinement probabilities, vaulted/current status, Aya usage, and tradability context. | Void Relic: <https://wiki.warframe.com/w/Void_Relic>. Aya: <https://wiki.warframe.com/w/Aya>. | Daily for current/vaulted pages; hash and diff. | Medium. Use official drop tables for probabilities where possible; wiki is useful for mechanics and current curated status. |
| Warframe Support/official FAQs | Official Prime Resurgence/Aya/Regal Aya mechanics. | Prime Resurgence FAQ verified: <https://support.warframe.com/hc/en-us/articles/4413725645453-Prime-Resurgence-FAQ>. | Weekly and on Prime Resurgence changes. | High for official policy/mechanics. |
| TPE history | Local/hosted historical market snapshots, velocity estimates, volatility, stale listing detection, and trend deltas. | Internal generated data. | Append on every successful scan; compact daily. | Depends on sample count and retention. Must distinguish observed listing history from confirmed sale history. |
| Manual user data | Inventory, goals, todos, trade logs, assumptions, notification settings. | User-entered only. | Immediate. | High for user intent, not for game truth. Never infer hidden Warframe inventory without explicit user entry. |

### 4.2 Market-data policy

- Every price shown must have a price basis: `sell_floor`, `buy_ceiling`, `spread_mid`, `trimmed_median`, `weighted_listing_median`, `historical_listing_median`, or `manual_assumption`.
- Every opportunity must show liquidity: active sell count, active buy count, online/ingame seller count, order age, price spread, and historical movement when available.
- Every score must be decomposable. Users should see why an item scored high: EV, ROI, time gate, liquidity, supply shock, mission availability, or personal watchlist match.
- If a method depends on stale or incomplete data, the UI must degrade from recommendation to watch/warning.

### 4.3 Upstream compliance

TPE must not become a hidden load generator for Warframe.market.

Required behavior:

- Send an identifiable User-Agent for all WFM requests.
- Maintain a shared server-side cache; never let clients directly fan out to WFM.
- Deduplicate concurrent requests for the same item/endpoint.
- Respect WFM's general public limit of 3 requests/second and stricter limits for expensive endpoints.
- Prefer remote precomputed feeds for broad scans; use local scans for user-targeted refreshes.
- Use exponential backoff and circuit breakers on 429/509/5xx.
- Do not impersonate a browser or scrape authenticated WFM user pages.
- Do not use WFM to execute trades or automate user contact.

## 5. Core product concepts

### 5.1 PlatMethod

A `PlatMethod` is a self-contained analysis module.

```ts
type PlatMethod = {
  id: string;
  label: string;
  description: string;
  requiredSources: string[];
  refreshPolicy: RefreshPolicy;
  evaluate(context: MethodContext): Promise<Opportunity[]>;
  explain(opportunity: Opportunity): Explanation;
};
```

New modules use the shared opportunity shape from day one. Existing method surfaces may adopt shared provenance/data-health primitives opportunistically, but they are not roadmap deliverables here.

### 5.2 Opportunity

```ts
type Opportunity = {
  id: string;
  methodId: string;
  title: string;
  action: "buy" | "sell" | "farm" | "open" | "refine" | "hold" | "convert" | "rank" | "run_mission" | "complete_set";
  itemRefs: ItemRef[];
  expectedPlat: number;
  expectedCostPlat?: number;
  expectedProfitPlat?: number;
  roi?: number;
  timeToExecuteMinutes?: number;
  liquidityScore: number;
  confidenceScore: number;
  riskScore: number;
  freshness: SourceProvenance[];
  assumptions: string[];
  warnings: string[];
  explanation: Explanation;
};
```

### 5.3 MarketSnapshot

A normalized commodity market book:

```ts
type MarketSnapshot = {
  item: ItemIdentity;
  rank?: number;
  platform: "pc";
  crossplay: boolean;
  sellOrders: MarketOrder[];
  buyOrders: MarketOrder[];
  statistics?: HistoricalStats;
  source: SourceProvenance;
};
```

### 5.4 ItemIdentity

Identity must bridge WFM slugs, DE game references, wiki names, and user-facing names.

```ts
type ItemIdentity = {
  tpeId: string;
  name: string;
  wfmSlug?: string;
  wfmId?: string;
  gameRef?: string;
  uniqueName?: string;
  tags: string[];
  tradability: TradabilityRule;
  maxRank?: number;
  setParts?: ItemRef[];
};
```

### 5.5 Confidence model

Confidence is not just sample size. It should combine:

- source freshness;
- market depth;
- order age;
- online/ingame seller availability;
- bid/ask spread;
- historical volatility;
- whether the recommendation uses official drop data or inferred mechanics;
- whether the item has stateful tradability conditions;
- whether the module has a tested parser and validator.

User-facing labels:

- Green: actionable; sources fresh; enough market depth; no major warnings.
- Yellow: useful but verify manually; low depth, stale source, or high volatility.
- Red: do not act from this signal alone; source unavailable, impossible tradability, expired mission, or too few comparable records.

## 6. Generic plat-making methods

### 6.1 Prime Parts, Relics, Sets, Aya, and Prime Resurgence

Priority: first new generic expansion.

Why this is high value:

- Prime items and relics are core Warframe trading commodities.
- Official drop tables provide probabilities.
- WFM provides prices for relics, parts, and sets.
- WFCD/warframestat provides active fissures.
- Aya creates recurring supply shocks through Prime Resurgence. Treat Aya itself as not player-tradable based on the community-maintained Wiki; official support separately states Aya is earned and exchanged for Void Relics at Varzia, while Regal Aya is premium and not tradeable. The player-tradable outputs are relics and prime parts/sets.

User jobs:

- Decide whether to sell a relic unopened or crack it.
- Decide whether to refine a relic before opening.
- Find which active fissures are worth running now.
- Decide whether to sell individual prime parts or complete a set.
- Decide what to buy with Aya for maximum expected tradable output.
- Track vaulted/unvaulted and Prime Resurgence-driven price shocks.
- Choose between ducat conversion and player sale.

Required data:

- WFM prices for relics, prime parts, prime sets, buy/sell depth, and order age.
- Official drop tables for relic reward probabilities and relic acquisition sources.
- Void Relic mechanics/refinement probabilities from official drop tables/wiki.
- Active fissures from warframestat/worldstate.
- Prime Resurgence/Aya rotation data from official pages, wiki, or maintained TPE parser.
- Ducat values from WFM item metadata and/or PublicExport/Wiki.
- User inventory counts for relics and parts, entered manually or imported only from user-provided files if ever supported.

Core calculations:

- Relic EV by refinement tier:
  - `EV(relic, tier) = sum(dropProbability(relic, tier, reward) * saleValue(reward))`.
  - Use conservative sale value: trimmed sell floor/median adjusted for liquidity and order age.
- Crack-vs-sell:
  - `crackPremium = EV(relic, chosenTier) - currentRelicSellValue - traceOpportunityCost`.
- Refinement decision:
  - compare EV delta per Void Trace for Exceptional/Flawless/Radiant.
  - surface cases where Radiant is only good for rare chase, not raw EV.
- Squad-share EV:
  - model 1x1 solo, radshare 4x same relic, and public mixed relics separately.
  - Do not present radshare EV unless the user can realistically assemble the group.
- Set completion delta:
  - `setDelta = setSellValue - sum(partSellValuesNeeded)`.
  - Recommend buying missing cheap parts only when set liquidity supports it.
- Aya conversion:
  - rank current Varzia relic offerings by relic sell value, crack EV, vaulted demand, and price trend.
- Ducat floor:
  - compare player-sale plat to ducat opportunity value when Baro is active/upcoming.
- Supply shock detector:
  - detect newly unvaulted/resurgent items, relic availability changes, Baro returns, and update-driven drop-table changes.

Outputs:

- Best relics to sell unopened.
- Best relics to crack now.
- Best active fissures by EV/minute and tier.
- Best Aya purchases.
- Set completion opportunities.
- Ducat-vs-plat recommendations.
- Warnings for vaulted/resurgent supply shocks and low-liquidity traps.

Acceptance criteria:

- Every recommended relic shows reward table, probabilities, item values, EV, confidence, and why a refinement tier was chosen.
- Active fissure recommendations expire automatically at mission expiry.
- Aya page never recommends selling Aya directly; model it as a non-player-tradable input currency whose player-tradable outputs are relics and prime parts/sets.
- Crafted Prime Warframe parts are excluded; tradable prime blueprints/weapon parts are allowed per trading rules.
- The module has parser tests for drop-table relic data, WFM price mapping, and refinement EV edge cases.

### 6.2 Mods and rank-aware upgrading

Priority: second expansion.

User jobs:

- Decide whether to sell unranked or maxed mods.
- Find mods where Endo/credit investment has positive plat EV.
- Track Baro, Arbitrations, syndicates, events, and limited sources that affect mod supply.

Required data:

- WFM order books by rank where available.
- Mod `maxRank`, rarity, Endo/credit fusion cost, tradability rules.
- Drop/acquisition source and live availability.
- User Endo/credit opportunity cost assumptions.

Core calculations:

- Rank-up arbitrage:
  - `maxedSellValue - rank0SellValue - endoCostValue - creditCostValue - liquidityPenalty`.
- Rank demand curve:
  - compare rank 0, mid-rank, and max-rank buy/sell depth.
- Acquisition EV:
  - combine drop chance, mission time, and price/liquidity.

Acceptance criteria:

- Never recommend non-tradable mods such as Flawed Mods, Umbra Mods, or restricted Daily Tribute Primed Mods as sale targets.
- Always state Endo and credit assumptions.
- Rank-specific WFM orders must not be mixed without explicit normalization.

### 6.3 Syndicate and standing conversion

Priority: second expansion, after rank-aware item catalog exists.

User jobs:

- Convert daily standing into the highest plat-per-standing item.
- Choose between augment mods, syndicate weapons, archwing parts, relic packs, and cosmetics.
- Plan daily standing caps and faction conflicts.

Required data:

- WFM prices for syndicate items.
- Standing costs and rank requirements from wiki/PublicExport/manual curated source.
- User faction access, standing balance, and daily cap.

Core calculations:

- `platPerStanding = conservativeSellValue / standingCost`.
- Include liquidity, trade tax, MR restrictions, and standing opportunity cost.
- Relic pack route should feed Prime/Relic module EV instead of being a hard-coded item value.

Acceptance criteria:

- User can set accessible syndicates.
- Recommendations explain rank/cost requirements.
- Relic pack EV is computed from current relic tables, not static assumptions.

### 6.4 Baro and Ducat optimizer

Priority: third expansion, but should share Prime/Relic data early.

User jobs:

- Decide what prime junk to sell for plat vs convert to ducats.
- Decide what Baro inventory to buy for resale.
- Detect price shocks before/after Baro visits.

Required data:

- Ducat values for prime parts.
- WFM current/historical prices.
- Baro live/upcoming inventory from warframestat/worldstate/wiki/manual feed.
- User prime part inventory.

Core calculations:

- `platPerDucat = saleValue / ducatValue` for parts.
- `baroResaleEV = futureExpectedSellValue - ducatCostValue - creditCostValue - timeRisk`.
- Detect Baro item return events and avoid recommending items during immediate supply dump unless the strategy is long hold.

Acceptance criteria:

- Show whether a prime part is better as direct plat, ducats, or set completion.
- Baro recommendations include time horizon: flip now, hold, or avoid.

### 6.5 Fish, gems, mining, and open-world resources

Priority: later expansion unless market scan shows strong liquidity.

User jobs:

- Identify tradeable fish/refined gems worth farming or selling.
- Choose between standing conversion and player sale.
- Use open-world cycle data for availability windows.

Required data:

- WFM item prices for fish/refined gems and other resources that are tradable.
- Trade rules: refined gems are tradable; raw ores generally are not; fish can be tradable per Trading page categories.
- Cycle data: Cetus day/night, Orb Vallis warm/cold, Cambion Drift Fass/Vome.
- Drop/farm location data from wiki/drop tables where official tables cover it.

Core calculations:

- Plat per expected minute by location/window.
- Sell vs standing conversion.
- Batch-size and trade-slot constraints.

Acceptance criteria:

- Do not recommend non-tradable raw materials.
- Cycle-dependent recommendations expire or downgrade when the cycle changes.
- Low-liquidity commodities default to informational, not actionable.

### 6.6 Event and rotating-content opportunities

Priority: cross-cutting, implemented as source-shock layer.

User jobs:

- Know when a current event creates a farm or flip opportunity.
- Avoid buying into a supply crash.
- Know what to stockpile before an item leaves rotation.

Signals:

- New Warframe update/drop-table hash change.
- Prime Resurgence rotation.
- Baro inventory.
- Nightwave/alert/event/invasion rewards.
- Fissure type availability, especially high-value Omnia/Void Cascade/Void Flood/Disruption/Survival windows.

Outputs:

- Market shock banners.
- Watchlist alerts.
- Time-boxed method cards.

Acceptance criteria:

- Every event-driven recommendation includes expiry and source.
- If source confidence is low, show watch/warn instead of buy/farm.

### 6.7 Adversaries, imprints, and bespoke markets

Priority: later expansion.

These markets are high variance and cannot use simple commodity order-book logic.

Examples:

- Kuva Liches/Sisters with ephemeras, weapons, elements, percentages.
- Companion imprints with traits.

Required approach:

- Specialized comparables.
- Attribute-based valuation.
- Manual verification prompts.
- Strict confidence gating.

Acceptance criteria:

- No generic commodity scoring on bespoke items.
- Every comparable explains which attributes matched and which did not.

## 7. Accounts and personalization

Accounts should be TPE-native only.

Hard boundaries:

- Do not collect Warframe, Digital Extremes, or Warframe.market credentials.
- Do not collect cookies, 2FA tokens, Companion tokens, or authenticated session data.
- Do not scrape authenticated account pages.
- Do not automate messages, listings, undercuts, or trades.
- Alerts are analytics signals that require manual review.

### 7.1 Account capabilities

MVP account features:

- Email/OAuth login for TPE only.
- Private watchlists.
- Saved filters and default assumptions.
- User todos.
- Manual inventory/portfolio entries.
- Notification rules.
- Data export and deletion.

Long-term features:

- Trade journal with realized buy/sell prices.
- Strategy dashboards by method.
- Portfolio valuation and aging inventory warnings.
- Goal-based planning, e.g. "earn 500p this week".
- Team/clan sharing with explicit opt-in.
- Public profiles only if intentionally created by the user.

### 7.2 User data model

```ts
type UserProfile = {
  id: string;
  displayName: string;
  timezone: string;
  platform: "pc";
  crossplay: boolean;
  assumptions: UserAssumptions;
  privacy: PrivacySettings;
};

type Todo = {
  id: string;
  userId: string;
  title: string;
  methodId?: string;
  itemRefs: ItemRef[];
  action: Opportunity["action"];
  status: "open" | "in_progress" | "blocked" | "done" | "archived";
  dueAt?: string;
  sourceOpportunityId?: string;
  notes?: string;
};

type NotificationRule = {
  id: string;
  userId: string;
  name: string;
  methodIds: string[];
  filters: Record<string, unknown>;
  threshold: {
    minExpectedProfitPlat?: number;
    minRoi?: number;
    minConfidence?: number;
    maxRisk?: number;
    itemRefs?: ItemRef[];
  };
  channels: ("in_app" | "email" | "discord_webhook")[];
  cooldownSeconds: number;
  enabled: boolean;
};

type PortfolioEntry = {
  id: string;
  userId: string;
  item: ItemRef;
  quantity: number;
  rank?: number;
  acquiredAt?: string;
  costBasisPlat?: number;
  notes?: string;
};
```

### 7.3 Notification rules

Initial alert types:

- Watchlist item crosses price/ROI/profit threshold.
- Active fissure crosses EV/minute threshold.
- A watched method's best option changes materially.
- Prime set completion becomes profitable from user's inventory.
- Item in user's portfolio enters supply-shock warning.
- A stale opportunity falls below threshold and should be removed from todo.

Notification quality gates:

- No alert without source freshness and confidence.
- No repeat spam; use cooldown, dedupe keys, and "changed because" summaries.
- Alerts must include manual verification instructions.

### 7.4 Privacy and security

Treat these as sensitive-by-context:

- alias/display name;
- watchlists;
- filters;
- portfolios/inventory;
- todos;
- trade journal;
- notification destinations;
- strategy assumptions.

Requirements:

- Private by default.
- User-controlled export/delete.
- Minimal PII.
- Audit log for notification delivery and account security events.
- Encrypt secrets such as webhook URLs.
- Never leak one user's strategy data into global market analytics unless explicitly aggregated/anonymized.

## 8. TPE Warframe integrations

TPE should rank live Warframe activities by plat relevance, not merely list timers.

### 8.1 Live activity opportunity engine

Inputs:

- Active fissures from warframestat/worldstate.
- Active arbitrations from warframestat/worldstate with defensive validation.
- Steel Path, Sortie, Invasions, Alerts, Nightwave, cycles, bounties, Void Trader/Baro, and Prime Resurgence where available.
- Market EV from relevant `PlatMethod` modules.
- User profile: unlocked content assumptions, inventory, goals, and preferred mission types.

Outputs:

- "Run now" board.
- Mission cards with EV/minute, expiry, prerequisites, and source confidence.
- Warnings for expired or placeholder activity data.

### 8.2 Fissure valuation

A fissure is valuable when the mission type, tier, active relic economics, and user inventory combine well.

Scoring factors:

- Tier and relic pool value.
- Mission type speed and reward compatibility.
- Omnia/Void Cascade/Void Flood/Disruption/Survival multipliers where the community values them for parallel farming.
- Steel Path/Void Storm/Requiem flags.
- Expiry time.
- User relic inventory and goals.
- Public squad viability if radshare is needed.

Example output:

- "Void Cascade Omnia Fissure: high priority because it opens any relic tier, overlaps high-value evergreen farm rewards, and current relic EV favors cracking over selling. Expires in 41m. Confidence yellow because user inventory is manual/unknown."

### 8.3 Arbitration valuation

Arbitration endpoint data must be validated before use. The verified `warframestat.us/pc/arbitration` response returned an expired placeholder-like record, so TPE must reject impossible values such as epoch activation, far-future expiry, unknown type, or expired true.

Scoring factors:

- Mission type speed.
- Drop-table rewards and expected value.
- Vitus Essence conversion value.
- Current prices for Arbitration mods/items.
- User capability assumptions.

### 8.4 Cycles and open-world windows

Cycle data should feed fish/gem/resource and bounty modules.

Required behavior:

- Expire recommendations when cycle changes.
- Show required location/window.
- State if data comes from wrapper and not raw worldstate.

## 9. Information architecture

Long-term navigation:

1. Command Center
   - Top cross-method opportunities.
   - Run-now live activities.
   - Watchlist changes.
   - User todos.
2. New Method Expansion
   - Prime/Relics/Aya.
   - Mods/Endo.
   - Syndicates/Standing.
   - Baro/Ducats.
   - Fish/Gems/Open World.
   - Events.
3. Market Explorer
   - Search any tradable item.
   - Item detail with current orders, history, acquisition, drop sources, and related methods.
4. Portfolio
   - Manual inventory.
   - Set completion.
   - Sell/hold/rank/convert suggestions.
5. Todos
   - Generated from opportunities or manually created.
   - Grouped by method and expiry.
6. Alerts
   - Rules, deliveries, cooldowns, and history.
7. Data Health
   - Source freshness, scan coverage, warnings, rate-limit state, schema drift.
8. Settings
   - Account, privacy, assumptions, data source mode, MCP/API.

## 10. Explanation design

Each card needs a "Why this?" panel.

Minimum fields:

- Recommendation: exact action.
- Expected outcome: plat/profit/ROI/EV/minute.
- Data basis: source, fetched-at, sample size, rank, platform, status filters.
- Mechanics: drop chance, refinement tier, copies-to-max, standing cost, ducat value, or mission expiry.
- Liquidity: buy/sell depth, online sellers, order age, spread.
- Risks: stale source, low depth, supply shock, low confidence, manual inventory unknown.
- Alternatives: sell now, hold, crack/open, complete set, convert, rank, or run a different mission.

A recommendation without explanation is not product-ready.

## 11. Technical architecture direction

### 11.1 Data ingestion layers

1. Source clients
   - WFM client with cache, rate limit, dedupe, backoff, and User-Agent.
   - Official drop-table parser.
   - PublicExport parser.
   - warframestat/worldstate client with validation.
   - Wiki/support parsers only for supplemental mechanics.
2. Normalization
   - Item identity resolver.
   - Tradability rules engine.
   - Rank/set/component normalization.
   - Source provenance attachment.
3. Market snapshots
   - Current order books.
   - Historical listing snapshots.
   - Liquidity and volatility derivation.
4. Method engines
   - Pure evaluators that consume normalized data and assumptions.
   - Deterministic scoring with explainable components.
5. User layer
   - Accounts, portfolios, todos, saved filters, notification rules.
6. Delivery
   - Browser dashboard.
   - MCP tools.
   - API endpoints.
   - Notification workers.

### 11.2 History store

Current history is narrower than the long-term multi-method store. Future history should be method-agnostic:

- `item_identity`
- `market_snapshot`
- `market_order_snapshot`
- `source_fetch`
- `method_run`
- `opportunity_snapshot`
- `user_profile`
- `portfolio_entry`
- `todo`
- `notification_rule`
- `notification_delivery`

Retain enough history to estimate velocity and volatility. Compact raw order snapshots into daily aggregates where storage grows too large.

### 11.3 Data health

Every source has health fields:

- last success;
- last failure;
- stale age;
- schema version/hash;
- item coverage;
- warning count;
- current rate-limit/circuit state;
- fallback source in use.

Product UI should surface data health, not hide it in logs.

## 12. Roadmap

### Phase 0: Data backbone for new methods

Goal: build source-driven platform foundations before adding new plat-making methods.

Deliverables:

- Official drop-table parser and source hash tracking.
- PublicExport identity ingest.
- warframestat/worldstate live activity client with validators.
- Generic item identity resolver.
- Method-agnostic history tables.
- Tradability rules engine seeded from WFM tags plus Trading/Wiki rules.
- Data Health page for source freshness, scan coverage, warnings, and rate-limit state.

Acceptance:

- Data Health page shows WFM, drop tables, PublicExport, live activities, and history state.
- Invalid live activity data is rejected with visible warning.
- New method engines can request normalized market snapshots by `ItemIdentity`.

### Phase 1: Prime/Relic/Aya module

Goal: first generic plat-making module with real depth.

Deliverables:

- Prime item/relic/set catalog.
- Relic reward parser and refinement probabilities.
- Relic EV, crack-vs-sell, refinement EV, set completion, Aya conversion, and ducat comparison.
- Active fissure valuation.
- Prime supply-shock banners.

Acceptance:

- User can answer: "What relics should I sell, crack, refine, or buy with Aya today?"
- Active fissure cards expire correctly.
- Aya is handled as a non-player-tradable input currency; relics/parts/sets are player-tradable outputs.

### Phase 2: Accounts and todos

Goal: turn recommendations into user-specific execution.

Deliverables:

- TPE-native accounts.
- Saved filters/watchlists.
- Manual portfolio/inventory.
- Todos from opportunities.
- Notification rules with in-app/email first.
- Export/delete controls.

Acceptance:

- User can save a strategy and return to it.
- User can create and complete todos linked to opportunities.
- Alerts never execute trades or send game/WFM messages.

### Phase 3: Live Warframe integrations

Goal: make TPE useful when deciding what to run right now.

Deliverables:

- Run-now board.
- Fissure, Void Storm, Arbitration, Steel Path, Invasion, Sortie, bounty, and cycle cards where data is reliable.
- EV/minute and expiry-aware scoring.
- User assumptions for unlocked content and mission preferences.

Acceptance:

- A valuable Void Cascade fissure outranks a low-value spy fissure when market EV supports it.
- Expired/placeholder activities do not appear as actionable.

### Phase 4: Mods, Syndicates, Baro, resources

Goal: expand breadth without losing depth.

Deliverables:

- Rank-aware mod maxing EV.
- Syndicate standing conversion.
- Baro/Ducat optimizer.
- Fish/gem/resource module with cycle gating.
- Event supply-shock engine used across modules.

Acceptance:

- Each module meets the same source, confidence, explanation, and tradability standards as Prime/Relics.

### Phase 5: Advanced analytics and community layer

Goal: improve strategy quality without compromising privacy or compliance.

Deliverables:

- User trade journal analytics.
- Portfolio aging and realized P/L.
- Anonymous aggregate trend signals only with privacy safeguards.
- Optional clan/team shared watchlists.
- Public method guides generated from source-backed data, not static guesses.

Acceptance:

- Aggregates cannot expose individual user inventories/watchlists.
- Community features remain opt-in.

## 13. Non-goals and boundaries

TPE should not:

- Replace Warframe.market listing, buying, or messaging flows.
- Automate in-game trading, WFM listings, WFM messages, or undercutting.
- Ask for Warframe/DE/WFM credentials.
- Present listing data as confirmed sale data.
- Recommend non-tradable items as sale targets.
- Hide low confidence behind a high score.
- Add a plat-making method without source provenance and method-specific mechanics.

## 14. Key risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| WFM API changes before 1.0 | Broken scans or wrong fields. | Schema guards, source health, typed decoders, fallbacks, explicit stale warnings. |
| WFM rate-limit/compliance issues | Service blocks or harms upstream. | Central rate limiter, cache, User-Agent, backoff, remote feeds, no tight polling. |
| Drop tables incomplete or delayed | Wrong farm EV. | Show source timestamp/hash, mark missing systems, use official first and wiki supplemental only with lower confidence. |
| Worldstate/wrapper bad data | Expired activities recommended. | Validators reject impossible dates, expired true, unknown mission types, missing nodes. |
| Market manipulation | Bad recommendations from spoofed listings. | Trim outliers, use depth/age/status filters, historical median, buyer-side checks, confidence penalties. |
| Low-liquidity items | Paper profit cannot sell. | Liquidity score, minimum depth, order age penalty, yellow/red labels. |
| Stateful tradability | Recommends item a user cannot trade. | Tradability rules engine; warnings for crafted/altered/MR-restricted items; user assumptions. |
| User privacy | Strategy/inventory leakage. | Private defaults, minimal PII, export/delete, encrypted notification secrets. |
| Scope sprawl | Many shallow pages. | Method acceptance gates; no module ships without source matrix, calculations, and explainers. |

## 15. Success metrics

Product quality:

- Percentage of opportunities with green source health.
- Percentage of recommendations with complete explanation fields.
- Scan coverage by method.
- Stale-source warning frequency.
- Parser/schema failure detection time.

User value:

- Todo creation rate from opportunities.
- Todo completion rate.
- Alert click-through and dismissal reasons.
- Portfolio P/L entries where users track realized trades.
- Retention by method used.

Market quality:

- Recommendation survival: opportunity remains above threshold after refresh.
- Liquidity-adjusted hit rate from user trade journals.
- False-positive reports by method.

Compliance/ops:

- WFM request rate and cache hit ratio.
- 429/509 rate.
- Circuit breaker activations.
- Source freshness by source.

## 16. Product-ready checklist for any new method

A method is not ready until all are true:

- Source matrix complete.
- Tradability rules implemented.
- Market price basis documented.
- EV/profit/ROI formulas tested.
- Confidence model implemented.
- Explanation panel complete.
- Stale/failed source behavior implemented.
- User assumptions surfaced.
- Edge cases tested.
- MCP/API output includes provenance and warnings.
- UI labels actions accurately and avoids overstating certainty.

## 17. Immediate next implementation recommendations

1. Implement the shared `Opportunity`, `SourceProvenance`, `MarketSnapshot`, and `ItemIdentity` primitives for new method engines.
2. Add a Data Health page and source validators before adding new method surfaces.
3. Implement official drop-table ingestion and PublicExport identity mapping.
4. Ship Prime/Relic/Aya as the first new module.
5. Add accounts/todos after the first generic method proves the shared model.
6. Add live Run Now integrations once fissure/arbitration/worldstate validation is reliable.

This sequence keeps the product deep: every new feature depends on source quality, explainable calculations, and user-specific actionability instead of a thin catalog of plat ideas.
