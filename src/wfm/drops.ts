import { createHash } from "node:crypto";
import type { SourceProvenance } from "./product.js";

export type RelicRefinementTier = "Intact" | "Exceptional" | "Flawless" | "Radiant";

export interface DropTableEntry {
  table: string;
  rotation?: string;
  itemName: string;
  rarity: string;
  chance: number;
}

export interface RelicRewardEntry {
  relicName: string;
  tier: RelicRefinementTier;
  itemName: string;
  rarity: string;
  chance: number;
}

export interface OfficialDropTables {
  fetchedAt: string;
  url: string;
  contentHash: string;
  lastUpdate?: string;
  missionRewards: DropTableEntry[];
  relicRewards: RelicRewardEntry[];
  acquisitionRelics: string[];
  source: SourceProvenance;
  warnings: string[];
}

export const OFFICIAL_DROP_TABLES_URL = "https://www.warframe.com/droptables";
const DROP_TTL_SECONDS = 24 * 60 * 60;
const RELIC_NAME_RE = /^(Lith|Meso|Neo|Axi|Requiem)\s+[A-Z0-9]+\s+Relic$/;
const RELIC_TABLE_RE = /^(Lith|Meso|Neo|Axi|Requiem)\s+[A-Z0-9]+\s+Relic\s+\((Intact|Exceptional|Flawless|Radiant)\)$/;

export async function fetchOfficialDropTables(userAgent: string, fetcher: typeof fetch = fetch): Promise<OfficialDropTables> {
  const fetchedAt = new Date().toISOString();
  const response = await fetcher(OFFICIAL_DROP_TABLES_URL, {
    headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`official drop tables ${response.status}`);
  const finalUrl = response.url || OFFICIAL_DROP_TABLES_URL;
  const html = await response.text();
  return parseOfficialDropTables(html, fetchedAt, finalUrl);
}

export function parseOfficialDropTables(html: string, fetchedAt = new Date().toISOString(), url = OFFICIAL_DROP_TABLES_URL): OfficialDropTables {
  const warnings: string[] = [];
  const contentHash = createHash("sha256").update(html).digest("hex").slice(0, 16);
  const lastUpdate = textContent(matchFirst(html, /<b>Last Update:<\/b>\s*([^<]+)/i)?.[1] ?? "").trim() || undefined;
  const relicSection = sectionByHeading(html, "relicRewards");
  if (!relicSection) warnings.push("Official drop tables did not contain a relicRewards section.");

  const relicRewards = relicSection ? parseRelicRewardSection(relicSection) : [];
  if (relicSection && relicRewards.length === 0) warnings.push("Relic reward parser found no rewards in the official relic section.");

  const missionSection = sectionByHeading(html, "missionRewards") ?? html;
  const missionRewards = parseRewardTables(missionSection)
    .filter((entry) => RELIC_NAME_RE.test(entry.itemName));
  const acquisitionRelics = [...new Set(missionRewards.map((entry) => entry.itemName))].sort();
  if (acquisitionRelics.length === 0) warnings.push("No currently-dropping relics were detected from mission reward tables.");

  const source: SourceProvenance = {
    source: "official_drop_tables",
    url,
    fetchedAt,
    ttlSeconds: DROP_TTL_SECONDS,
    confidence: warnings.length === 0 ? "high" : "medium",
    warnings,
  };
  if (lastUpdate !== undefined) source.observedAt = lastUpdate;

  return {
    fetchedAt,
    url,
    contentHash,
    ...(lastUpdate ? { lastUpdate } : {}),
    missionRewards,
    relicRewards,
    acquisitionRelics,
    source,
    warnings,
  };
}

export function parseRelicRewardSection(html: string): RelicRewardEntry[] {
  const entries: RelicRewardEntry[] = [];
  for (const table of parseRewardTables(html)) {
    const match = table.table.match(RELIC_TABLE_RE);
    if (!match) continue;
    entries.push({
      relicName: `${match[1]} ${table.table.split(/\s+/)[1]} Relic`,
      tier: match[2] as RelicRefinementTier,
      itemName: table.itemName,
      rarity: table.rarity,
      chance: table.chance,
    });
  }
  return entries;
}

export function parseRewardTables(html: string): DropTableEntry[] {
  const rows = [...html.matchAll(/<tr(?:\s+[^>]*)?>(.*?)<\/tr>/gis)].map((match) => match[1] ?? "");
  const entries: DropTableEntry[] = [];
  let currentTable = "";
  let currentRotation: string | undefined;

  for (const row of rows) {
    const heading = row.match(/<th[^>]*colspan=["']?2["']?[^>]*>(.*?)<\/th>/is);
    if (heading) {
      const label = textContent(heading[1] ?? "").trim();
      if (/^Rotation\s+/i.test(label)) currentRotation = label;
      else {
        currentTable = label;
        currentRotation = undefined;
      }
      continue;
    }
    const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map((match) => textContent(match[1] ?? "").trim());
    const itemName = cells[0];
    const chanceLabel = cells[1];
    if (!itemName || !chanceLabel || !currentTable) continue;
    const chance = parseChance(chanceLabel);
    if (chance === null) continue;
    entries.push({
      table: currentTable,
      ...(currentRotation ? { rotation: currentRotation } : {}),
      itemName,
      rarity: parseRarityLabel(chanceLabel),
      chance,
    });
  }
  return entries;
}

export function relicSlugFromName(name: string): string {
  return slugifyName(name);
}

export function rewardSlugCandidates(name: string): string[] {
  const raw = normalizeRewardName(name);
  const candidates = new Set<string>([slugifyName(raw)]);
  if (/ blueprint$/i.test(raw)) candidates.add(slugifyName(raw.replace(/ blueprint$/i, "")));
  if (!/ blueprint$/i.test(raw) && / prime/i.test(raw)) candidates.add(slugifyName(`${raw} Blueprint`));
  return [...candidates];
}

export function normalizeRewardName(name: string): string {
  return name.replace(/^\d+(?:,\d+)?X\s+/i, "").replace(/\s+/g, " ").trim();
}

function sectionByHeading(html: string, id: string): string | null {
  const startRe = new RegExp(`<h3\\s+id=["']${escapeRegExp(id)}["'][^>]*>`, "i");
  const startMatch = startRe.exec(html);
  if (!startMatch) return null;
  const start = startMatch.index + startMatch[0].length;
  const next = html.slice(start).search(/<h3\s+id=["'][^"']+["'][^>]*>/i);
  return next < 0 ? html.slice(start) : html.slice(start, start + next);
}

function parseChance(label: string): number | null {
  const match = label.match(/\((\d+(?:\.\d+)?)%\)/);
  if (!match) return null;
  const chance = Number(match[1]) / 100;
  return Number.isFinite(chance) ? chance : null;
}

function parseRarityLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function textContent(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function matchFirst(value: string, regex: RegExp): RegExpMatchArray | null {
  return value.match(regex);
}

function slugifyName(name: string): string {
  return normalizeRewardName(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
