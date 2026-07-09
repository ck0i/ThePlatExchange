import assert from "node:assert/strict";
import { buildRunNowLiveArtifact, fetchLiveActivitySnapshot, overlayRunNowArtifact, validateFissures } from "../src/wfm/live.js";
import { createInitialProductDashboard } from "../src/wfm/productEngine.js";

const generatedAt = new Date("2026-07-07T12:00:00.000Z");
const fetcher: typeof fetch = async (input) => {
  const url = requestUrl(input);
  if (url.endsWith("/fissures")) {
    return jsonResponse([
      {
        id: "keep-fissure",
        node: "Ukko",
        missionType: "Capture",
        tier: "Axi",
        activation: "2026-07-07T11:55:00.000Z",
        expiry: "2026-07-07T12:45:00.000Z",
      },
      {
        id: "soon-expired-fissure",
        node: "Hepit",
        missionType: "Capture",
        tier: "Lith",
        activation: "2026-07-07T11:55:00.000Z",
        expiry: "2026-07-07T12:10:00.000Z",
      },
      {
        id: "keep-storm",
        node: "Bifrost Echo",
        missionType: "Extermination",
        tier: "Meso",
        isStorm: true,
        isHard: false,
        activation: "2026-07-07T11:55:00.000Z",
        expiry: "2026-07-07T12:50:00.000Z",
      },
      {
        id: "steel-path-fissure",
        node: "Acheron",
        missionType: "Extermination",
        tier: "Axi",
        isHard: true,
        activation: "2026-07-07T11:55:00.000Z",
        expiry: "2026-07-07T12:50:00.000Z",
      },
      {
        id: "future-fissure",
        node: "Mantle",
        missionType: "Capture",
        tier: "Lith",
        isHard: false,
        activation: "2026-07-07T12:05:00.000Z",
        expiry: "2026-07-07T12:55:00.000Z",
      },
      {
        id: "requiem-fissure",
        node: "Tamu",
        missionType: "Disruption",
        tier: "Requiem",
        tierNum: 5,
        isHard: false,
        activation: "2026-07-07T11:55:00.000Z",
        expiry: "2026-07-07T12:55:00.000Z",
      },
    ]);
  }
  return new Response(JSON.stringify({ error: "unexpected url" }), { status: 404 });
};

const live = await fetchLiveActivitySnapshot("test-agent", fetcher, generatedAt);
const artifact = buildRunNowLiveArtifact(live, generatedAt.toISOString(), generatedAt);
assert.deepEqual(
  artifact.runNow.activities.map((activity) => activity.id).sort(),
  ["keep-fissure", "keep-storm", "soon-expired-fissure"],
  "run-now artifact should include only active normal Void Fissures and Void Storms",
);
assert.deepEqual(
  artifact.runNow.rejectedActivities.map((activity) => activity.id).sort(),
  [],
  "expected out-of-scope future, Requiem, and Steel Path rows should be ignored without degrading live health",
);
assert.equal(artifact.live.warningCount, 0, "expected out-of-scope fissure rows must not produce user-facing live warnings");

const visibleLimitFixture = Array.from({ length: 13 }, (_, index) => ({
  id: `visible-${index}`,
  node: `Node ${index}`,
  missionType: index === 0 ? "Defense" : "Capture",
  tier: "Lith",
  activation: "2026-07-07T11:50:00.000Z",
  expiry: "2026-07-07T12:55:00.000Z",
}));
const visibleLimited = validateFissures(visibleLimitFixture, generatedAt.toISOString(), generatedAt).accepted;
assert.equal(visibleLimited.length, 12, "Run Now must never expose more than the visible fissure/storm limit");
assert.equal(visibleLimited.some((activity) => activity.id === "visible-0"), false, "visible limit should drop the lowest-priority active row, not source-order rows");
assert.equal(artifact.live.id, "live", "artifact must carry the live source health row used by the Run Now UI");

const baseProduct = createInitialProductDashboard();
baseProduct.methods = [{
  id: "run_now",
  label: "Run Now",
  description: "stale method fixture",
  status: "green",
  opportunityCount: 1,
  sourceIds: ["live"],
  warnings: [],
  bestOpportunityId: "run_now",
}];

const overlaid = overlayRunNowArtifact(baseProduct, artifact, new Date("2026-07-07T12:20:00.000Z"));
assert.deepEqual(
  overlaid.runNow.activities.map((activity) => activity.id).sort(),
  ["keep-fissure", "keep-storm"],
  "backend overlay must prune activities that expired after the artifact was written but before it is served",
);
assert.ok(
  overlaid.runNow.warnings.some((warning) => warning.includes("Removed 1 expired live activity")),
  "read-time expiry pruning must be visible in Run Now warnings",
);
const overlaidLive = overlaid.dataHealth.sources.find((source) => source.id === "live");
assert.notEqual(overlaidLive?.status, "red", "fresh artifact with remaining activities must stay visible to the Run Now tab");
assert.equal(overlaidLive?.lastSuccessAt, generatedAt.toISOString(), "overlay must patch the live health timestamp from the live artifact");
assert.equal(overlaid.methods.find((method) => method.id === "run_now")?.opportunityCount, 2, "method summary must reflect pruned live activities");
assert.ok(
  overlaid.opportunities.every((opportunity) => opportunity.expiresAt !== "2026-07-07T12:10:00.000Z"),
  "global product opportunities must not retain expired run-now rows",
);

const boundaryActivity = artifact.runNow.activities[0];
assert(boundaryActivity, "boundary fixture needs a Run Now activity");
const boundaryArtifact = {
  ...artifact,
  generatedAt: "2026-07-07T12:50:00.000Z",
  live: { ...artifact.live, status: "green" as const, lastSuccessAt: "2026-07-07T12:50:00.000Z", warnings: [] },
  runNow: {
    ...artifact.runNow,
    generatedAt: "2026-07-07T12:50:00.000Z",
    activities: [{ ...boundaryActivity, expiresAt: "2026-07-07T13:30:00.000Z" }],
    warnings: [],
  },
};
const sameHour = overlayRunNowArtifact(baseProduct, boundaryArtifact, new Date("2026-07-07T12:59:00.000Z"));
assert.equal(sameHour.runNow.activities.length, 1, "same-hour Run Now artifacts must stay visible even late in the hour");
assert.notEqual(sameHour.dataHealth.sources.find((source) => source.id === "live")?.status, "red", "same-hour Run Now artifacts must not be marked stale");
const nextHour = overlayRunNowArtifact(baseProduct, boundaryArtifact, new Date("2026-07-07T13:00:00.000Z"));
assert.equal(nextHour.runNow.activities.length, 0, "previous-hour Run Now artifacts must be hidden as soon as the UTC hour changes");
assert.equal(nextHour.dataHealth.sources.find((source) => source.id === "live")?.status, "red", "previous-hour Run Now artifacts must force the live health row red");

const stale = overlayRunNowArtifact(baseProduct, artifact, new Date("2026-07-07T13:01:00.000Z"));
assert.equal(stale.runNow.activities.length, 0, "previous-hour artifacts must not serve Run Now activities");
assert.equal(stale.dataHealth.sources.find((source) => source.id === "live")?.status, "red", "stale live artifacts must force the live health row red");
assert.equal(
  "bestOpportunityId" in (stale.methods.find((method) => method.id === "run_now") ?? {}),
  false,
  "empty Run Now method metadata must not point at an old best opportunity",
);

console.log("run-now live artifact tests passed");

function requestUrl(input: string | URL | Request): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
