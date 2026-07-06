import type { FissureRecommendation, RunActivityCard, SourceProvenance } from "./product.js";
import { clamp01, round, statusFromScore } from "./product.js";

export const WARFRAMESTAT_BASE = "https://api.warframestat.us/pc";
const LIVE_TTL_SECONDS = 5 * 60;
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

export interface WarframestatArbitration {
  id?: string;
  activation?: string;
  expiry?: string;
  node?: string;
  type?: string;
  enemy?: string;
  archwing?: boolean;
  expired?: boolean;
}

export interface LiveActivitySnapshot {
  fetchedAt: string;
  fissures: FissureRecommendation[];
  activities: RunActivityCard[];
  rejected: Array<{ id: string; title: string; reason: string; source: SourceProvenance }>;
  sources: SourceProvenance[];
  warnings: string[];
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

  const arbitrationSource = source("https://api.warframestat.us/pc/arbitration", fetchedAt, []);
  try {
    const response = await fetcher(`${WARFRAMESTAT_BASE}/arbitration`, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
    if (!response.ok) throw new Error(`arbitration ${response.status}`);
    const activity = validateArbitration(await response.json() as WarframestatArbitration, fetchedAt, now);
    if (activity.accepted) activities.push(activity.accepted);
    if (activity.rejected) rejected.push(activity.rejected);
    arbitrationSource.confidence = activity.warning ? "low" : "medium";
    if (activity.warning) {
      warnings.push(activity.warning);
      arbitrationSource.warnings.push(activity.warning);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Warframestat arbitration unavailable: ${message}`);
    arbitrationSource.confidence = "low";
    arbitrationSource.warnings.push(message);
  }
  sources.push(arbitrationSource);

  activities.sort((left, right) => right.priority - left.priority || right.evPerMinute - left.evPerMinute);
  return { fetchedAt, fissures, activities, rejected, sources, warnings };
}

export function validateFissures(entries: readonly WarframestatFissure[], fetchedAt = new Date().toISOString(), now = new Date()): { accepted: FissureRecommendation[]; rejected: LiveActivitySnapshot["rejected"]; warnings: string[] } {
  const accepted: FissureRecommendation[] = [];
  const rejected: LiveActivitySnapshot["rejected"] = [];
  const warnings: string[] = [];
  for (const entry of entries) {
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
    const hardBonus = entry.isHard ? 1.08 : 1;
    const evPerMinute = round(4.5 * speed * tierValue * omniaBonus * stormBonus * hardBonus, 2);
    const confidence = clamp01(0.58 + (KNOWN_MISSION_TYPES.has(missionType) ? 0.18 : -0.22) + (tier === "Omnia" ? 0.04 : 0));
    const recWarnings = KNOWN_MISSION_TYPES.has(missionType) ? [] : [`Unknown mission type ${missionType}; verify manually.`];
    accepted.push({
      id,
      node: entry.node!,
      missionType,
      tier,
      isStorm: entry.isStorm === true,
      isHard: entry.isHard === true,
      expiresAt: entry.expiry!,
      evPerMinute,
      priority: round(evPerMinute * confidence, 2),
      confidence,
      warnings: recWarnings,
      source: sourceInfo,
    });
  }
  return { accepted, rejected, warnings };
}

export function validateArbitration(entry: WarframestatArbitration, fetchedAt = new Date().toISOString(), now = new Date()): { accepted: RunActivityCard | null; rejected: LiveActivitySnapshot["rejected"][number] | null; warning?: string } {
  const sourceInfo = source("https://api.warframestat.us/pc/arbitration", fetchedAt, []);
  const id = typeof entry.id === "string" && entry.id ? entry.id : "arbitration";
  const missionType = entry.type ?? "Unknown";
  const invalid = invalidActivityReason({ activation: entry.activation, expiry: entry.expiry, node: entry.node, missionType, expired: entry.expired, now });
  if (invalid) {
    sourceInfo.warnings.push(invalid);
    return { accepted: null, rejected: { id, title: entry.node ?? "Arbitration", reason: invalid, source: sourceInfo }, warning: `Arbitration rejected: ${invalid}` };
  }
  const confidenceScore = clamp01(0.62 + (KNOWN_MISSION_TYPES.has(missionType) ? 0.12 : -0.2));
  const evPerMinute = round(5.8 * missionSpeedMultiplier(missionType), 2);
  const accepted: RunActivityCard = {
    id,
    activityType: "arbitration",
    title: `${entry.node ?? "Unknown node"} Arbitration`,
    missionType,
    evPerMinute,
    priority: round(evPerMinute * confidenceScore, 2),
    confidenceScore,
    status: statusFromScore(confidenceScore),
    warnings: KNOWN_MISSION_TYPES.has(missionType) ? [] : [`Unknown arbitration type ${missionType}; verify manually.`],
    source: sourceInfo,
    explanation: {
      recommendation: "Run only if you can clear this Arbitration efficiently and want Vitus/mod resale exposure.",
      expectedOutcome: `${evPerMinute} estimated plat-equivalent/minute from Vitus conversion and Arbitration drops.`,
      dataBasis: ["warframestat wrapper activity payload; market conversion is conservative until item-specific Arbitration prices are scanned."],
      mechanics: ["Rejects expired, epoch, far-future, missing-node, and placeholder Arbitration payloads before scoring."],
      liquidity: ["Arbitration rewards depend on Vitus/rotation market liquidity; verify current reward demand."],
      risks: ["Wrapper data can lag raw worldstate; confidence is capped at medium."],
      alternatives: ["Compare against active fissures and current Prime/Relic EV before committing time."],
    },
  };
  if (entry.node !== undefined) accepted.node = entry.node;
  if (entry.expiry !== undefined) accepted.expiresAt = entry.expiry;
  return { accepted, rejected: null };
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
  if (activation - nowMs > 10 * 60 * 1000) return "activity activation is in the future";
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
