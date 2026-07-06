import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialProductDashboard } from "../src/wfm/productEngine.js";
import { UserStore } from "../src/wfm/userStore.js";

// createInitialProductDashboard defaults should represent an initial local/private, pre-refresh state.
const initialDashboard = createInitialProductDashboard();
assert.equal(initialDashboard.dataHealth.status, "red", "default dashboard health must be red while waiting for first refresh");
assert.equal(initialDashboard.dataHealth.sources[0]?.status, "red", "default product source status must be red while waiting for first refresh");
assert.ok(initialDashboard.dataHealth.warnings.includes("Waiting for product data refresh."), "default data-health warning must indicate refresh wait");
assert.equal(initialDashboard.personalization.profile.id, "user_local", "default profile should be local-scoped");
assert.equal(initialDashboard.personalization.profile.privacy.privateByDefault, true, "default local profile should opt into private-by-default behavior");
assert.ok(initialDashboard.personalization.warnings.includes("Local private profile created."), "default dashboard should advertise local private profile creation");

const tempDir = await mkdtemp(join(tmpdir(), "the-plat-exchange-product-planning-"));
const storePath = join(tempDir, "user-state.json");

function makeClock(startIso: string, stepMs = 1_000): () => Date {
  const start = Date.parse(startIso);
  let tick = 0;
  return () => new Date(start + tick++ * stepMs);
}

function first<T>(items: readonly T[] | undefined, label: string): T {
  const item = items?.[0];
  assert.ok(item !== undefined, `${label} should contain at least one entry`);
  return item;
}


async function readPersistedState(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(storePath, "utf8"));
}

try {
  const store = new UserStore({ path: storePath, now: makeClock("2026-07-06T00:00:00.000Z", 1_000) });
  const loaded = await store.load();

  assert.ok(typeof loaded.profile.id === "string" && loaded.profile.id.startsWith("user_"), "fresh store should initialize a user id");
  assert.equal(loaded.profile.privacy.privateByDefault, true, "fresh store should default to private profile");

  const updatedProfile = await store.updateProfile({
    displayName: "Planner",
    assumptions: {
      traceOpportunityCostPlat: 0.03,
      endoPlatPerThousand: 1.15,
      creditPlatPerMillion: 0.9,
      preferredMissionTypes: ["Capture", "Extermination"],
      unlockedContent: ["fissures"],
      accessibleSyndicates: ["loka"],
    },
    privacy: {
      privateByDefault: false,
      allowAnonymousAggregates: true,
      teamSharingEnabled: true,
    },
  });

  assert.equal(updatedProfile.profile.displayName, "Planner", "profile update should persist displayName");
  assert.equal(updatedProfile.profile.assumptions.traceOpportunityCostPlat, 0.03, "profile update should persist assumption trace opportunity cost");
  assert.equal(updatedProfile.profile.privacy.teamSharingEnabled, true, "profile update should persist privacy.teamSharingEnabled");

  const persistedProfileState = await readPersistedState();
  const persistedProfile = persistedProfileState.profile as Record<string, any>;
  assert.equal(persistedProfile.displayName, "Planner", "updated displayName should be written to disk");
  assert.equal((persistedProfile.assumptions as Record<string, any>).traceOpportunityCostPlat, 0.03, "updated assumption should be written to disk");
  assert.equal((persistedProfile.privacy as Record<string, any>).allowAnonymousAggregates, true, "updated privacy should be written to disk");

  const reloadedProfileState = await new UserStore({ path: storePath, now: makeClock("2026-07-06T00:10:00.000Z", 1_000) }).load();
  assert.equal(reloadedProfileState.profile.assumptions.endoPlatPerThousand, 1.15, "reload should preserve assumption updates");
  assert.equal(reloadedProfileState.profile.privacy.allowAnonymousAggregates, true, "reload should preserve privacy updates");

  const todoState = await store.addTodo({
    title: "Review run window",
    action: "sell",
    itemRefs: [{ tpeId: "wfm:neural_sensor", name: "Neural Sensor", wfmSlug: "neural_sensor" }],
  });
  const todo = first(todoState.todos, "todoState.todos");
  assert.equal(todo.status, "open", "new todos should default to open status");
  assert.equal(todo.action, "sell", "todo action should persist from input");
  assert.deepEqual(
    todo.itemRefs,
    [{ tpeId: "wfm:neural_sensor", name: "Neural Sensor", wfmSlug: "neural_sensor" }],
    "todo item references should persist as provided",
  );

  const persistedTodoState = await readPersistedState();
  const persistedTodo = first(persistedTodoState.todos as Array<Record<string, any>>, "persistedTodoState.todos");
  assert.equal(persistedTodo.status, "open", "todo status should be persisted");
  assert.equal(persistedTodo.action, "sell", "todo action should be persisted");
  const persistedTodoItemRef = first(persistedTodo.itemRefs as Array<Record<string, string>>, "persistedTodoState.todos[0].itemRefs");
  assert.equal(persistedTodoItemRef.tpeId, "wfm:neural_sensor", "todo itemRefs.tpeId should be persisted");

  const reloadedTodoState = await new UserStore({ path: storePath, now: makeClock("2026-07-06T00:20:00.000Z", 1_000) }).load();
  const reloadedTodo = first(reloadedTodoState.todos, "reloadedTodoState.todos");
  const reloadedTodoItemRef = first(reloadedTodo.itemRefs, "reloadedTodoState.todos[0].itemRefs");
  assert.equal(reloadedTodo.status, "open", "reloaded todo status should remain open");
  assert.equal(reloadedTodo.action, "sell", "reloaded todo action should match input");
  assert.equal(reloadedTodoItemRef.name, "Neural Sensor", "reloaded todo item refs should match provided item");

  const portfolioState = await store.addPortfolio({
    item: { tpeId: "wfm:neural_sensor", name: "Neural Sensor", wfmSlug: "neural_sensor" },
    quantity: 2.8,
    costBasisPlat: 120,
  });
  const entry = first(portfolioState.portfolio, "portfolioState.portfolio");
  assert.equal(entry.quantity, 2, "portfolio quantity should persist as integer-rounded value");
  assert.equal(entry.costBasisPlat, 120, "portfolio cost basis should persist when provided");

  const persistedPortfolioState = await readPersistedState();
  const persistedPortfolio = first(persistedPortfolioState.portfolio as unknown as Array<Record<string, any>>, "persistedPortfolioState.portfolio");
  assert.equal(persistedPortfolio.quantity, 2, "portfolio quantity should be persisted as integer value");
  assert.equal(persistedPortfolio.costBasisPlat, 120, "portfolio cost basis should be persisted");

  const reloadedPortfolioState = await new UserStore({ path: storePath, now: makeClock("2026-07-06T00:30:00.000Z", 1_000) }).load();
  const reloadedPortfolio = first(reloadedPortfolioState.portfolio, "reloadedPortfolioState.portfolio");
  assert.equal(reloadedPortfolio.quantity, 2, "reloaded portfolio quantity should remain normalized");
  assert.equal(reloadedPortfolio.costBasisPlat, 120, "reloaded portfolio cost basis should remain persisted");

  const notificationState = await store.addNotificationRule({
    name: "High Profit Alerts",
    methodIds: ["mods", "prime_relics"],
    filters: { minGain: 200 },
    threshold: { minExpectedProfitPlat: 120 },
    channels: ["in_app"],
    cooldownSeconds: 10,
    enabled: true,
    dedupeKey: "mods-profit",
  });
  const notification = first(notificationState.notificationRules, "notificationState.notificationRules");
  assert.equal(notification.cooldownSeconds, 60, "notification cooldown should enforce minimum 60s");
  const persistedNotificationState = await readPersistedState();
  const persistedNotification = first(persistedNotificationState.notificationRules as unknown as Array<Record<string, any>>, "persistedNotificationState.notificationRules");
  assert.equal(persistedNotification.cooldownSeconds, 60, "notification cooldown clamp should be persisted");
  const reloadedNotificationState = await new UserStore({ path: storePath, now: makeClock("2026-07-06T00:40:00.000Z", 1_000) }).load();
  const reloadedNotification = first(reloadedNotificationState.notificationRules, "reloadedNotificationState.notificationRules");
  assert.equal(reloadedNotification.cooldownSeconds, 60, "reloaded notification rule should keep clamped minimum cooldown");

  console.log("product planning primitives tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}