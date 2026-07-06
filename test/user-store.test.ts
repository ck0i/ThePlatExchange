import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UserStore } from "../src/wfm/userStore.js";

function first<T>(items: readonly T[] | undefined, label: string): T {
  const value = items?.[0];
  assert.ok(value !== undefined, `${label} should contain at least one entry`);
  return value;
}

function makeClock(startIso: string, stepMs = 1_000): { now: () => Date; calls: string[] } {
  const start = Date.parse(startIso);
  let tick = 0;
  const calls: string[] = [];
  return {
    now() {
      const now = new Date(start + stepMs * tick++);
      calls.push(now.toISOString());
      return now;
    },
    calls,
  };
}

const tempDir = await mkdtemp(join(tmpdir(), "the-plat-exchange-user-store-"));
const storePath = join(tempDir, "user-state.json");
const clock = makeClock("2026-07-06T00:00:00.000Z", 5_000);

try {
  const store = new UserStore({ path: storePath, now: clock.now });
  const loaded = await store.load();

  const updated = await store.updateProfile({
    displayName: "Planner",
    timezone: "UTC+2",
    crossplay: false,
    assumptions: { traceOpportunityCostPlat: 0.03, endoPlatPerThousand: 1.12, creditPlatPerMillion: 0.7, preferredMissionTypes: [], unlockedContent: [], accessibleSyndicates: [] },
    privacy: { privateByDefault: false, allowAnonymousAggregates: false, teamSharingEnabled: true },
  });

  assert.equal(updated.profile.displayName, "Planner", "profile mutation should persist");
  assert.equal(updated.profile.timezone, "UTC+2", "profile mutation should persist timezone");
  assert.equal(updated.profile.crossplay, false, "profile mutation should persist crossplay");
  assert.equal(Object.hasOwn(updated.profile, "email"), false, "optional email should remain absent without explicit assignment");

  const todoState = await store.addTodo({
    title: "Review run window",
    action: "hold",
    itemRefs: [{ tpeId: "wfm:blind_rage", name: "Blind Rage", wfmSlug: "blind_rage" }],
  });
  const todo = first(todoState.todos, "todoState.todos");
  
  assert.equal(todo.title, "Review run window", "todo mutation should persist");
  assert.equal(todo.status, "open", "todo status should default open");
  assert.equal(Object.hasOwn(todo, "methodId"), false, "todo without methodId must not persist empty optional methodId");
  assert.equal(Object.hasOwn(todo, "dueAt"), false, "todo without dueAt must not persist empty optional dueAt");
  assert.equal(Object.hasOwn(todo, "sourceOpportunityId"), false, "todo without sourceOpportunityId must not persist empty optional sourceOpportunityId");
  assert.equal(Object.hasOwn(todo, "notes"), false, "todo without notes must not persist empty optional notes");

  const portfolioState = await store.addPortfolio({
    item: { tpeId: "wfm:neural_sensor", name: "Neural Sensor", wfmSlug: "neural_sensor" },
    quantity: 2.8,
    costBasisPlat: 120,
  });
  const holding = first(portfolioState.portfolio, "portfolioState.portfolio");

  assert.equal(holding.quantity, 2, "portfolio quantity should floor to an integer");
  assert.equal(Object.hasOwn(holding, "rank"), false, "portfolio rank should remain absent when not supplied");
  assert.equal(Object.hasOwn(holding, "notes"), false, "portfolio notes should remain absent when not supplied");

  assert.ok(holding.acquiredAt, "portfolio acquiredAt should be assigned");
  assert.ok(clock.calls.includes(holding.acquiredAt), "acquiredAt should be derived from injected clock in store operation");
  const acquisitionAt = holding.acquiredAt;

  const raw = JSON.parse(await readFile(storePath, "utf8")) as Record<string, unknown>;
  const rawState = raw as {
    profile: Record<string, unknown>;
    todos: Array<Record<string, unknown>>;
    portfolio: Array<Record<string, unknown>>;
  };
  assert.equal(Object.hasOwn(rawState.profile, "email"), false, "profile should be persisted without explicit undefined email");
  const storedTodo = first(rawState.todos, "rawState.todos");
  const storedPortfolio = first(rawState.portfolio, "rawState.portfolio");
  assert.equal(Object.hasOwn(storedTodo, "methodId"), false, "stored todo should not include missing optional methodId field");
  assert.equal(Object.hasOwn(storedTodo, "dueAt"), false, "stored todo should not include missing optional dueAt field");
  assert.equal(Object.hasOwn(storedPortfolio, "rank"), false, "stored portfolio should not include missing optional rank field");
  assert.equal(Object.hasOwn(storedPortfolio, "notes"), false, "stored portfolio should not include missing optional notes field");


  const reread = new UserStore({ path: storePath, now: makeClock("2026-07-06T00:30:00.000Z", 5_000).now });
  const restored = await reread.load();
  assert.equal(restored.profile.displayName, "Planner", "state should persist across new store instances");
  const restoredTodo = first(restored.todos, "restored.todos");
  const restoredPortfolio = first(restored.portfolio, "restored.portfolio");
  assert.equal(restoredTodo.title, "Review run window", "todo title should persist across reload");
  assert.equal(restoredPortfolio.acquiredAt, acquisitionAt, "acquiredAt should persist exactly as derived from source clock");
  assert.equal(restoredPortfolio.quantity, 2, "portfolio quantity should persist as rounded integer");
  assert.equal(restoredPortfolio.item.name, "Neural Sensor", "portfolio item payload should persist");
  assert.equal(Object.hasOwn(restoredPortfolio, "costBasisPlat"), true, "explicitly supplied optional portfolio fields must still persist");
  assert.equal(Object.hasOwn(restoredPortfolio, "acquiredAt"), true, "required portfolio acquiredAt should be present in restored state");
  assert.equal(Object.hasOwn(restoredTodo, "sourceOpportunityId"), false, "reload should preserve optional omission semantics");

  console.log("user store persistence tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
