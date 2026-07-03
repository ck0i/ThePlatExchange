import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WarframeMarketClient } from "../src/wfm/client.js";

const versionBody = {
  apiVersion: "0.25.0",
  data: {
    collections: { rivens: "hash-rivens-1" },
    updatedAt: "2026-07-03T00:00:00Z",
  },
  error: null,
};

const weaponsBody = {
  apiVersion: "0.25.0",
  data: [
    {
      id: "weapon-1",
      slug: "test_rifle",
      group: "primary",
      rivenType: "rifle",
      disposition: 1.1,
      reqMasteryRank: 8,
      i18n: { en: { name: "Test Rifle" } },
    },
  ],
  error: null,
};

const attributesBody = {
  apiVersion: "0.25.0",
  data: [
    {
      id: "attr-1",
      slug: "critical_chance",
      group: "default",
      prefix: "Crita",
      suffix: "Cron",
      i18n: { en: { name: "Critical Chance" } },
    },
  ],
  error: null,
};

const tempDir = await mkdtemp(join(tmpdir(), "wf-riventrader-cache-"));
try {
  const calls: string[] = [];
  const fetcher = async (input: URL, _init: RequestInit) => {
    calls.push(input.pathname);
    if (input.pathname === "/v2/versions") return jsonResponse(versionBody);
    if (input.pathname === "/v2/riven/weapons") return jsonResponse(weaponsBody);
    if (input.pathname === "/v2/riven/attributes") return jsonResponse(attributesBody);
    return new Response(JSON.stringify({ error: "unexpected path" }), { status: 404 });
  };

  const firstClient = new WarframeMarketClient({ cacheDir: tempDir, fetcher, ratePerSecond: 1000, burst: 10, maxRetries: 1 });
  const first = await firstClient.loadReference();
  assert.equal(first.rivenWeapons[0]?.name, "Test Rifle");
  assert.equal(first.rivenAttributes[0]?.name, "Critical Chance");

  const cachePath = join(tempDir, "reference.json");
  const firstCache = await readFile(cachePath, "utf8");

  const secondClient = new WarframeMarketClient({ cacheDir: tempDir, fetcher, ratePerSecond: 1000, burst: 10, maxRetries: 1 });
  const second = await secondClient.loadReference();
  const secondCache = await readFile(cachePath, "utf8");

  assert.equal(second.rivenWeapons[0]?.name, "Test Rifle");
  assert.equal(second.rivenAttributes[0]?.name, "Critical Chance");
  assert.equal(secondCache, firstCache, "unchanged versions must not rewrite reference cache");
  assert.deepEqual(calls, ["/v2/versions", "/v2/riven/weapons", "/v2/riven/attributes", "/v2/versions"]);

  const outageClient = new WarframeMarketClient({
    cacheDir: tempDir,
    fetcher: async () => {
      throw new Error("network down");
    },
    ratePerSecond: 1000,
    burst: 10,
    maxRetries: 1,
  });
  const outage = await outageClient.loadReference();
  const outageCache = await readFile(cachePath, "utf8");
  assert.equal(outage.rivenWeapons[0]?.name, "Test Rifle");
  assert.equal(outageCache, firstCache, "network outage must not overwrite usable cache");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("cache persistence tests passed");

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
