import type { FissureRecommendation, ProductDashboardState, ProductOpportunity, RunActivityCard, RunNowDashboard, SourceHealth, SourceProvenance } from "./product.js";
import { clamp01, maxStatus, round, statusFromScore } from "./product.js";

export const WARFRAMESTAT_BASE = "https://api.warframestat.us/pc";
export const LIVE_TTL_SECONDS = 5 * 60;
export const RUN_NOW_MAX_SOURCE_AGE_MS = 60 * 60 * 1000;
const RUN_NOW_VISIBLE_FISSURE_LIMIT = 12;
const KNOWN_MISSION_TYPES = new Set([
  "Alchemy",
  "Assassination",
  "Capture",
  "Defense",
  "Disruption",
  "Excavation",
  "Extermination",
  "Interception",
  "Mobile Defense",
  "Rescue",
  "Sabotage",
  "Skirmish",
  "Spy",
  "Survival",
  "Volatile",
  "Void Cascade",
  "Void Flood",
]);

export interface WarframestatFissure {
  id?: string;
  activation?: string;
  expiry?: string;
  node?: string;
  missionType?: string;
  missionTypeKey?: string;
  tier?: string;
  tierNum?: number;
  isStorm?: boolean;
  isHard?: boolean;
  expired?: boolean;
}

interface RunNowFissureCandidate {
  fissure: FissureRecommendation;
  activationMs: number;
}


export interface LiveActivitySnapshot {
  fetchedAt: string;
  fissures: FissureRecommendation[];
  activities: RunActivityCard[];
  rejected: Array<{ id: string; title: string; reason: string; source: SourceProvenance }>;
  sources: SourceProvenance[];
  warnings: string[];
}

export interface RunNowLiveArtifact {
  schemaVersion: 1;
  generatedAt: string;
  live: SourceHealth;
  runNow: RunNowDashboard;
}

export function isRunNowLiveArtifact(value: unknown): value is RunNowLiveArtifact {
  if (!value || typeof value !== "object") return false;
  if (!("schemaVersion" in value) || value.schemaVersion !== 1) return false;
  if (!("generatedAt" in value) || typeof value.generatedAt !== "string") return false;
  if (!("live" in value) || !value.live || typeof value.live !== "object") return false;
  const live = value.live;
  if (!("id" in live) || live.id !== "live") return false;
  if (!("status" in live) || (live.status !== "green" && live.status !== "yellow" && live.status !== "red")) return false;
  if (!("warnings" in live) || !Array.isArray(live.warnings)) return false;
  if (!("ttlSeconds" in live) || typeof live.ttlSeconds !== "number") return false;
  if (!("runNow" in value) || !value.runNow || typeof value.runNow !== "object") return false;
  const runNow = value.runNow;
  if (!("generatedAt" in runNow) || typeof runNow.generatedAt !== "string") return false;
  if (!("activities" in runNow) || !Array.isArray(runNow.activities)) return false;
  if (!("rejectedActivities" in runNow) || !Array.isArray(runNow.rejectedActivities)) return false;
  if (!("warnings" in runNow) || !Array.isArray(runNow.warnings)) return false;
  return true;
}

export async function fetchLiveActivitySnapshot(userAgent: string, fetcher: typeof fetch = fetch, now = new Date()): Promise<LiveActivitySnapshot> {
  const fetchedAt = now.toISOString();
  const warnings: string[] = [];
  const rejected: LiveActivitySnapshot["rejected"] = [];
  const sources: SourceProvenance[] = [];
  let fissures: FissureRecommendation[] = [];
  const activities: RunActivityCard[] = [];

  const fissureSource = source("https://api.warframestat.us/pc/fissures", fetchedAt, []);
  try {
    const response = await fetcher(`${WARFRAMESTAT_BASE}/fissures`, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
    if (!response.ok) throw new Error(`fissures ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("fissures payload was not an array");
    const parsed = validateFissures(payload as WarframestatFissure[], fetchedAt, now);
    fissures = parsed.accepted;
    rejected.push(...parsed.rejected);
    warnings.push(...parsed.warnings);
    fissureSource.confidence = parsed.warnings.length === 0 ? "medium" : "low";
    fissureSource.warnings.push(...parsed.warnings);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Warframestat fissures unavailable: ${message}`);
    fissureSource.confidence = "low";
    fissureSource.warnings.push(message);
  }
  sources.push(fissureSource);
  for (const fissure of fissures) activities.push(fissureToActivity(fissure));

  activities.sort((left, right) => right.priority - left.priority || right.evPerMinute - left.evPerMinute);
  return { fetchedAt, fissures, activities, rejected, sources, warnings };
}

export function buildRunNowDashboard(live: LiveActivitySnapshot, fissures: readonly FissureRecommendation[] = live.fissures, generatedAt = live.fetchedAt, now = new Date()): RunNowDashboard {
  const liveActivityById = new Map(live.activities.map((activity) => [activity.id, activity]));
  const fissureIds = new Set(fissures.map((fissure) => fissure.id));
  const fissureActivities = fissures.map((fissure) => ({ ...liveActivityById.get(fissure.id), ...fissureToActivity(fissure) }));
  const nonFissure = live.activities.filter((activity) => !fissureIds.has(activity.id));
  const dashboard: RunNowDashboard = {
    generatedAt,
    activities: [...fissureActivities, ...nonFissure].sort((left, right) => right.priority - left.priority),
    rejectedActivities: live.rejected,
    warnings: live.warnings,
  };
  return pruneRunNowDashboard(dashboard, now);
}

export function buildLiveSourceHealth(live: LiveActivitySnapshot, runNow: RunNowDashboard = buildRunNowDashboard(live), now = new Date()): SourceHealth {
  return runNowSourceHealth(live.fetchedAt, runNow, live.rejected, live.warnings, now);
}

export function buildRunNowLiveArtifact(live: LiveActivitySnapshot, generatedAt = new Date().toISOString(), now = new Date()): RunNowLiveArtifact {
  const runNow = buildRunNowDashboard(live, live.fissures, generatedAt, now);
  return {
    schemaVersion: 1,
    generatedAt,
    live: buildLiveSourceHealth(live, runNow, now),
    runNow,
  };
}

export function overlayRunNowArtifact(product: ProductDashboardState, artifact: RunNowLiveArtifact, now = new Date()): ProductDashboardState {
  const artifactFetchedAt = artifact.live.lastSuccessAt ?? artifact.live.lastFailureAt ?? artifact.generatedAt;
  const artifactStale = isOlderThanRunNowWindow(artifactFetchedAt, now);
  const pruned = pruneRunNowDashboard(artifact.runNow, now);
  const runNow = artifactStale
    ? {
        ...pruned,
        activities: [],
        warnings: appendUniqueWarning(pruned.warnings, "Run Now live artifact is older than one hour; live activities are hidden until the next live refresh."),
      }
    : pruned;
  const live = normalizeRunNowSourceHealth(artifact.live, runNow, artifact.generatedAt, now);
  return applyRunNowState(product, runNow, live, artifact.generatedAt, true);
}

export function enforceRunNowWindow(product: ProductDashboardState, now = new Date()): ProductDashboardState {
  const runNow = pruneRunNowDashboard(product.runNow, now);
  const existingLive = product.dataHealth.sources.find((source) => source.id === "live");
  if (!existingLive) {
    return runNow === product.runNow ? product : { ...product, runNow };
  }
  const live = normalizeRunNowSourceHealth(existingLive, runNow, runNow.generatedAt, now);
  return applyRunNowState(product, runNow, live, runNow.generatedAt, false);
}

export function pruneRunNowDashboard(runNow: RunNowDashboard, now = new Date()): RunNowDashboard {
  const nowMs = now.getTime();
  const activities = runNow.activities.filter((activity) => {
    if (!activity.expiresAt) return true;
    const expiryMs = Date.parse(activity.expiresAt);
    return Number.isFinite(expiryMs) && expiryMs > nowMs;
  });
  if (activities.length === runNow.activities.length) return runNow;
  const removed = runNow.activities.length - activities.length;
  return {
    ...runNow,
    activities,
    warnings: appendUniqueWarning(runNow.warnings, `Removed ${removed} expired live ${removed === 1 ? "activity" : "activities"} at read time.`),
  };
}

function applyRunNowState(product: ProductDashboardState, runNow: RunNowDashboard, live: SourceHealth, generatedAt: string, bumpGeneratedAt: boolean): ProductDashboardState {
  const sources = upsertSourceHealth(product.dataHealth.sources, live);
  const dataHealth = {
    ...product.dataHealth,
    generatedAt: bumpGeneratedAt ? laterIso(product.dataHealth.generatedAt, generatedAt) : product.dataHealth.generatedAt,
    status: maxStatus(sources.map((entry) => entry.status)),
    sources,
  };
  return {
    ...product,
    generatedAt: bumpGeneratedAt ? laterIso(product.generatedAt, generatedAt) : product.generatedAt,
    dataHealth,
    methods: product.methods.map((method) => {
      if (method.id !== "run_now") return method;
      const { bestOpportunityId, ...baseMethod } = method;
      return {
        ...baseMethod,
        status: live.status,
        opportunityCount: runNow.activities.length,
        warnings: runNow.warnings,
        ...(runNow.activities.length > 0 ? { bestOpportunityId: "run_now" } : {}),
      };
    }),
    opportunities: [
      ...product.opportunities.filter((opportunity) => opportunity.methodId !== "run_now"),
      ...runNow.activities.map(runActivityOpportunity),
    ].sort(compareProductOpportunities),
    runNow,
  };
}

function runNowSourceHealth(fetchedAt: string, runNow: RunNowDashboard, rejected: LiveActivitySnapshot["rejected"], sourceWarnings: readonly string[], now: Date): SourceHealth {
  const stale = isOlderThanRunNowWindow(fetchedAt, now);
  const warnings = mergeWarnings(sourceWarnings, rejected.slice(0, 3).map((entry) => `${entry.title}: ${entry.reason}`));
  const finalWarnings = stale
    ? appendUniqueWarning(warnings, "Live activity source is older than one hour; Run Now is hidden until the live feed refreshes.")
    : warnings;
  const status: SourceHealth["status"] = stale ? "red" : runNow.activities.length > 0 ? finalWarnings.length > 0 ? "yellow" : "green" : rejected.length > 0 ? "yellow" : "red";
  const health: SourceHealth = {
    id: "live",
    label: "Live Warframe activities",
    status,
    source: "warframestat",
    url: "https://api.warframestat.us/pc/fissures",
    lastSuccessAt: fetchedAt,
    ttlSeconds: LIVE_TTL_SECONDS,
    coverage: { scanned: runNow.activities.length, total: runNow.activities.length + rejected.length, label: "validated activities" },
    warningCount: finalWarnings.length,
    fallback: "raw worldstate unavailable; wrapper validation active",
    warnings: finalWarnings,
  };
  if (stale) health.staleAgeSeconds = Math.max(0, Math.floor((now.getTime() - Date.parse(fetchedAt)) / 1000));
  return health;
}

function normalizeRunNowSourceHealth(source: SourceHealth, runNow: RunNowDashboard, artifactGeneratedAt: string, now: Date): SourceHealth {
  const fetchedAt = source.lastSuccessAt ?? source.lastFailureAt ?? artifactGeneratedAt;
  const stale = isOlderThanRunNowWindow(fetchedAt, now);
  const warnings = stale
    ? appendUniqueWarning(mergeWarnings(source.warnings, runNow.warnings), "Live activity source is older than one hour; Run Now is hidden until the live feed refreshes.")
    : mergeWarnings(source.warnings, runNow.warnings);
  const status: SourceHealth["status"] = stale ? "red" : runNow.activities.length > 0 ? warnings.length > 0 ? "yellow" : "green" : source.status === "red" ? "red" : runNow.rejectedActivities.length > 0 ? "yellow" : "red";
  const health: SourceHealth = {
    ...source,
    id: "live",
    label: "Live Warframe activities",
    status,
    source: "warframestat",
    url: source.url ?? "https://api.warframestat.us/pc/fissures",
    lastSuccessAt: fetchedAt,
    ttlSeconds: LIVE_TTL_SECONDS,
    coverage: { scanned: runNow.activities.length, total: runNow.activities.length + runNow.rejectedActivities.length, label: "validated activities" },
    warningCount: warnings.length,
    warnings,
  };
  if (stale) health.staleAgeSeconds = Math.max(0, Math.floor((now.getTime() - Date.parse(fetchedAt)) / 1000));
  return health;
}

function upsertSourceHealth(sources: readonly SourceHealth[], live: SourceHealth): SourceHealth[] {
  const next = sources.map((source) => source.id === "live" ? live : source);
  if (!sources.some((source) => source.id === "live")) next.push(live);
  return next;
}

function mergeWarnings(left: readonly string[], right: readonly string[]): string[] {
  const merged = [...left];
  for (const warning of right) {
    if (!merged.includes(warning)) merged.push(warning);
  }
  return merged;
}

function appendUniqueWarning(warnings: readonly string[], warning: string): string[] {
  const next = [...warnings];
  if (!next.includes(warning)) next.push(warning);
  return next;
}

function laterIso(left: string, right: string): string {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isFinite(leftMs)) return right;
  if (!Number.isFinite(rightMs)) return left;
  return rightMs > leftMs ? right : left;
}

function isOlderThanRunNowWindow(fetchedAt: string, now: Date): boolean {
  const fetchedAtMs = Date.parse(fetchedAt);
  return !Number.isFinite(fetchedAtMs) || now.getTime() - fetchedAtMs > RUN_NOW_MAX_SOURCE_AGE_MS;
}

function runActivityOpportunity(activity: RunActivityCard): ProductOpportunity {
  return {
    id: `run:${activity.id}`,
    methodId: "run_now",
    title: activity.title,
    action: "run_mission",
    itemRefs: [],
    expectedPlat: round(activity.evPerMinute * 10, 2),
    timeToExecuteMinutes: 10,
    liquidityScore: 0.5,
    confidenceScore: round(clamp01(activity.confidenceScore), 4),
    riskScore: round(clamp01(1 - activity.confidenceScore), 4),
    freshness: [activity.source],
    assumptions: ["EV/minute is a method score combining mission speed, relic economics, and live expiry."],
    warnings: activity.warnings,
    explanation: activity.explanation,
    ...(activity.expiresAt !== undefined ? { expiresAt: activity.expiresAt } : {}),
  };
}

function compareProductOpportunities(left: ProductOpportunity, right: ProductOpportunity): number {
  const leftScore = (left.expectedProfitPlat ?? left.expectedPlat) * left.confidenceScore * Math.max(0.2, left.liquidityScore) * (1 - left.riskScore * 0.4);
  const rightScore = (right.expectedProfitPlat ?? right.expectedPlat) * right.confidenceScore * Math.max(0.2, right.liquidityScore) * (1 - right.riskScore * 0.4);
  return rightScore - leftScore;
}

export function validateFissures(entries: readonly WarframestatFissure[], fetchedAt = new Date().toISOString(), now = new Date()): { accepted: FissureRecommendation[]; rejected: LiveActivitySnapshot["rejected"]; warnings: string[] } {
  const accepted: RunNowFissureCandidate[] = [];
  const rejected: LiveActivitySnapshot["rejected"] = [];
  const warnings: string[] = [];
  for (const entry of entries) {
    if (outOfScopeFissureReason(entry, now)) continue;
    const id = typeof entry.id === "string" && entry.id ? entry.id : `fissure-${accepted.length + rejected.length}`;
    const sourceInfo = source("https://api.warframestat.us/pc/fissures", fetchedAt, []);
    const invalid = invalidActivityReason({
      activation: entry.activation,
      expiry: entry.expiry,
      node: entry.node,
      missionType: entry.missionType ?? entry.missionTypeKey,
      expired: entry.expired,
      now,
    });
    if (invalid) {
      sourceInfo.warnings.push(invalid);
      rejected.push({ id, title: entry.node ?? id, reason: invalid, source: sourceInfo });
      warnings.push(`${entry.node ?? id}: ${invalid}`);
      continue;
    }
    const missionType = entry.missionType ?? entry.missionTypeKey ?? "Unknown";
    const tier = entry.tier ?? "Unknown";
    const speed = missionSpeedMultiplier(missionType);
    const tierValue = tierValueMultiplier(tier);
    const omniaBonus = tier === "Omnia" ? 1.35 : 1;
    const stormBonus = entry.isStorm ? 1.12 : 1;
    const evPerMinute = round(4.5 * speed * tierValue * omniaBonus * stormBonus, 2);
    const confidence = clamp01(0.58 + (KNOWN_MISSION_TYPES.has(missionType) ? 0.18 : -0.22) + (tier === "Omnia" ? 0.04 : 0));
    const recWarnings = KNOWN_MISSION_TYPES.has(missionType) ? [] : [`Unknown mission type ${missionType}; verify manually.`];
    const activationMs = Date.parse(entry.activation!);
    accepted.push({
      activationMs,
      fissure: {
        id,
        node: entry.node!,
        missionType,
        tier,
        isStorm: entry.isStorm === true,
        isHard: false,
        expiresAt: entry.expiry!,
        evPerMinute,
        priority: round(evPerMinute * confidence, 2),
        confidence,
        warnings: recWarnings,
        source: sourceInfo,
      },
    });
  }
  return { accepted: selectVisibleFissures(accepted), rejected, warnings };
}

function outOfScopeFissureReason(entry: WarframestatFissure, now: Date): string | null {
  if (entry.isHard === true) return "Steel Path fissure is outside Run Now scope";
  if (entry.tier === "Requiem" || entry.tierNum === 5) return "Requiem fissure is outside Run Now scope";
  const activation = Date.parse(entry.activation ?? "");
  if (Number.isFinite(activation) && activation > now.getTime()) return "fissure has not activated yet";
  return null;
}

function selectVisibleFissures(candidates: readonly RunNowFissureCandidate[]): FissureRecommendation[] {
  const ordered = [...candidates].sort((left, right) => {
    if (left.activationMs !== right.activationMs) return right.activationMs - left.activationMs;
    const priority = right.fissure.priority - left.fissure.priority;
    if (priority !== 0) return priority;
    const leftExpiry = Date.parse(left.fissure.expiresAt);
    const rightExpiry = Date.parse(right.fissure.expiresAt);
    if (Number.isFinite(leftExpiry) && Number.isFinite(rightExpiry) && leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;
    return left.fissure.id.localeCompare(right.fissure.id);
  });
  return ordered.slice(0, RUN_NOW_VISIBLE_FISSURE_LIMIT).map((candidate) => candidate.fissure);
}



export function fissureToActivity(fissure: FissureRecommendation): RunActivityCard {
  const confidenceScore = fissure.confidence;
  return {
    id: fissure.id,
    activityType: fissure.isStorm ? "void_storm" : "fissure",
    title: `${fissure.node} ${fissure.tier}${fissure.isStorm ? " Void Storm" : " Fissure"}`,
    node: fissure.node,
    missionType: fissure.missionType,
    evPerMinute: fissure.evPerMinute,
    priority: fissure.priority,
    expiresAt: fissure.expiresAt,
    confidenceScore,
    status: statusFromScore(confidenceScore),
    warnings: fissure.warnings,
    source: fissure.source,
    explanation: {
      recommendation: "Run now if the fissure tier matches relics you plan to crack or if Omnia/fast mission overlap improves EV.",
      expectedOutcome: `${fissure.evPerMinute} estimated EV/minute before user inventory adjustments.`,
      dataBasis: ["warframestat fissure payload", "Prime/Relic method EV multiplier by tier and mission speed"],
      mechanics: [`${fissure.tier} tier`, fissure.isStorm ? "Void Storm reward overlap" : "standard fissure", fissure.isHard ? "Steel Path flag present" : "normal path"],
      liquidity: ["Uses current relic/prime liquidity where available; confidence is lower without manual inventory."],
      risks: fissure.warnings.length > 0 ? fissure.warnings : ["User relic inventory is manual/unknown; verify you have useful relics for this tier."],
      alternatives: ["Sell high-EV relics unopened", "Run a faster fissure type", "Hold traces for Radiant chase relics"],
    },
  };
}

function invalidActivityReason(input: { activation: string | undefined; expiry: string | undefined; node: string | undefined; missionType: string | undefined; expired: boolean | undefined; now: Date }): string | null {
  if (input.expired === true) return "activity payload is already expired";
  if (!input.node || input.node.trim().length < 3) return "activity payload is missing a node";
  if (!input.missionType || input.missionType.trim().length < 3 || input.missionType === "Unknown") return "activity payload is missing a mission type";
  const activation = Date.parse(input.activation ?? "");
  const expiry = Date.parse(input.expiry ?? "");
  const nowMs = input.now.getTime();
  if (!Number.isFinite(activation) || activation <= 24 * 60 * 60 * 1000) return "activity activation is epoch/invalid placeholder data";
  if (!Number.isFinite(expiry)) return "activity expiry is invalid";
  if (expiry <= nowMs) return "activity has expired";
  if (expiry - nowMs > 8 * 60 * 60 * 1000) return "activity expiry is implausibly far in the future";
  if (activation > nowMs) return "activity activation is in the future";
  return null;
}

function source(url: string, fetchedAt: string, warnings: string[]): SourceProvenance {
  return { source: "warframestat", url, fetchedAt, ttlSeconds: LIVE_TTL_SECONDS, confidence: warnings.length === 0 ? "medium" : "low", warnings: [...warnings] };
}

function tierValueMultiplier(tier: string): number {
  switch (tier) {
    case "Axi": return 1.18;
    case "Neo": return 1.06;
    case "Meso": return 1;
    case "Lith": return 0.9;
    case "Requiem": return 1.14;
    case "Omnia": return 1.24;
    default: return 0.82;
  }
}

function missionSpeedMultiplier(missionType: string): number {
  switch (missionType) {
    case "Capture":
    case "Extermination":
    case "Rescue":
    case "Sabotage": return 1.22;
    case "Void Cascade": return 1.35;
    case "Void Flood":
    case "Disruption": return 1.18;
    case "Survival": return 1.05;
    case "Defense":
    case "Interception": return 0.74;
    case "Spy": return 0.78;
    case "Excavation": return 0.9;
    default: return 0.86;
  }
}
