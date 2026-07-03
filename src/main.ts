import { spawn } from "node:child_process";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createAppServer } from "./server.js";
import { WarframeMarketClient } from "./wfm/client.js";
import { DEFAULT_CONFIG } from "./wfm/opportunities.js";
import { RivenTraderService } from "./wfm/scanner.js";
import type { TraderConfig } from "./wfm/types.js";

interface LaunchConfig {
  host: string;
  port: number;
  openBrowser: boolean;
  refreshMs: number;
  weaponLimit: number | null;
  concurrency: number;
  ratePerSecond: number;
  burst: number;
  traderConfig: Partial<TraderConfig>;
}

export async function main(): Promise<void> {
  const launch = readLaunchConfig(process.argv.slice(2), process.env);
  const client = new WarframeMarketClient({
    ratePerSecond: launch.ratePerSecond,
    burst: launch.burst,
  });
  const service = new RivenTraderService({
    client,
    config: launch.traderConfig,
    refreshMs: launch.refreshMs,
    concurrency: launch.concurrency,
    weaponLimit: launch.weaponLimit,
  });
  const server = createAppServer(service);
  await listen(server, launch.port, launch.host);
  const url = `http://${launch.host}:${launch.port}`;
  console.log(`WF-RivenTrader dashboard: ${url}`);
  console.log(`MCP SSE endpoint: ${url}/mcp/sse`);
  console.log(`Dashboard SSE endpoint: ${url}/events`);
  console.log("Warframe.market fetches are server-side, cached, and token-bucket rate-limited.");
  service.start();
  if (launch.openBrowser) openBrowser(url);

  const shutdown = () => {
    service.stop();
    server.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export function readLaunchConfig(args: string[], env: NodeJS.ProcessEnv): LaunchConfig {
  const host = readStringOption(args, "--host") ?? env.WFM_HOST ?? "127.0.0.1";
  const port = readNumberOption(args, "--port") ?? readNumberEnv(env, "WFM_PORT", 3417);
  const refreshMs = readNumberEnv(env, "WFM_REFRESH_MS", 60_000);
  const weaponLimitEnv = readOptionalNumberEnv(env, "WFM_WEAPON_LIMIT");
  const weaponLimit = weaponLimitEnv === undefined ? null : Math.max(1, Math.floor(weaponLimitEnv));
  const statuses = (env.WFM_STATUSES ?? "ingame,online").split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const traderConfig: Partial<TraderConfig> = {
    ...DEFAULT_CONFIG,
    watchlist: splitList(env.WFM_WATCHLIST ?? ""),
    minProfit: readNumberEnv(env, "WFM_MIN_PROFIT", DEFAULT_CONFIG.minProfit),
    minRoi: readNumberEnv(env, "WFM_MIN_ROI", DEFAULT_CONFIG.minRoi),
    minGroupSize: readNumberEnv(env, "WFM_MIN_GROUP_SIZE", DEFAULT_CONFIG.minGroupSize),
    maxResults: readNumberEnv(env, "WFM_MAX_RESULTS", DEFAULT_CONFIG.maxResults),
    statuses: statuses.filter((entry) => entry === "ingame" || entry === "online" || entry === "offline" || entry === "unknown"),
  };
  const minBuy = readOptionalNumberEnv(env, "WFM_MIN_BUY_PRICE");
  const maxBuy = readOptionalNumberEnv(env, "WFM_MAX_BUY_PRICE");
  if (maxBuy !== undefined) traderConfig.maxBuyPrice = maxBuy;
  const maxSell = readOptionalNumberEnv(env, "WFM_MAX_SELL_PRICE");
  if (minBuy !== undefined) traderConfig.minBuyPrice = minBuy;
  if (maxSell !== undefined) traderConfig.maxSellPrice = maxSell;

  return {
    host,
    port,
    openBrowser: !args.includes("--no-open") && env.WFM_OPEN_BROWSER !== "0",
    refreshMs,
    weaponLimit,
    concurrency: readNumberEnv(env, "WFM_CONCURRENCY", 4),
    ratePerSecond: readNumberEnv(env, "WFM_RATE_PER_SEC", 3),
    burst: readNumberEnv(env, "WFM_BURST", 20),
    traderConfig,
  };
}

async function listen(server: Server, port: number, host: string): Promise<void> {
  const waiting = Promise.withResolvers<void>();
  const onError = (error: Error) => waiting.reject(error);
  server.once("error", onError);
  server.listen(port, host, () => {
    server.off("error", onError);
    waiting.resolve();
  });
  await waiting.promise;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function readStringOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function readNumberOption(args: string[], name: string): number | undefined {
  const value = readStringOption(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readNumberEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = env[key];
  if (value === undefined || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalNumberEnv(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const value = env[key];
  if (value === undefined || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitList(value: string): string[] {
  return value.split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPoint === fileURLToPath(import.meta.url)) {
  void main();
}
