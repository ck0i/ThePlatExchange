import { spawn } from "node:child_process";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createAppServer } from "./server.js";
import { WarframeMarketClient } from "./wfm/client.js";
import { DEFAULT_CONFIG } from "./wfm/opportunities.js";
import { PriceHistoryStore } from "./wfm/history.js";
import { ThePlatExchangeService, type ScanMode } from "./wfm/scanner.js";
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
  scanMode: ScanMode;
  hotSize: number;
  coldSliceSize: number;
  hotIntervalMs: number;
  coldIntervalMs: number;
  emitDebounceMs: number;
  historyEnabled: boolean;
  historyDbPath: string;
  remoteDataUrl: string | undefined;
  remoteDataBase: string | undefined;
  remoteRunNowPollMs: number;
  traderConfig: Partial<TraderConfig>;
}

export async function main(): Promise<void> {
  const launch = readLaunchConfig(process.argv.slice(2), process.env);
  const client = new WarframeMarketClient({
    ratePerSecond: launch.ratePerSecond,
    burst: launch.burst,
  });
  let history: PriceHistoryStore | undefined;
  if (launch.historyEnabled) {
    try {
      history = new PriceHistoryStore(launch.historyDbPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`History store disabled — could not open ${launch.historyDbPath}: ${message}`);
    }
  }
  const service = new ThePlatExchangeService({
    client,
    config: launch.traderConfig,
    refreshMs: launch.refreshMs,
    concurrency: launch.concurrency,
    weaponLimit: launch.weaponLimit,
    scanMode: launch.scanMode,
    hotSize: launch.hotSize,
    coldSliceSize: launch.coldSliceSize,
    hotIntervalMs: launch.hotIntervalMs,
    coldIntervalMs: launch.coldIntervalMs,
    emitDebounceMs: launch.emitDebounceMs,
    ...(history ? { history } : {}),
    ...(launch.remoteDataUrl ? { remoteDataUrl: launch.remoteDataUrl } : {}),
    ...(launch.remoteDataBase ? { remoteDataBase: launch.remoteDataBase } : {}),
    remoteRunNowPollMs: launch.remoteRunNowPollMs,
  });
  const server = createAppServer(service, launch.remoteDataUrl ? { remoteFallback: { url: launch.remoteDataUrl } } : {});
  await listen(server, launch.port, launch.host);
  const url = `http://${launch.host}:${launch.port}`;
  console.log(`ThePlatExchange dashboard: ${url}`);
  console.log(`MCP SSE endpoint: ${url}/mcp/sse`);
  console.log(`Dashboard SSE endpoint: ${url}/events`);
  console.log(`Scan mode: ${launch.scanMode}${history ? ` · history: ${launch.historyDbPath}` : " · history: disabled"}`);
  console.log("Warframe.market fetches are server-side, cached, and token-bucket rate-limited.");
  service.start();
  if (launch.openBrowser) openBrowser(url);

  const shutdown = () => {
    service.stop();
    history?.close();
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
    statuses: statuses.filter((entry) => entry === "ingame" || entry === "online" || entry === "offline" || entry === "unknown"),
  };
  const minBuy = readOptionalNumberEnv(env, "WFM_MIN_BUY_PRICE");
  const maxBuy = readOptionalNumberEnv(env, "WFM_MAX_BUY_PRICE");
  if (maxBuy !== undefined) traderConfig.maxBuyPrice = maxBuy;
  const maxSell = readOptionalNumberEnv(env, "WFM_MAX_SELL_PRICE");
  if (minBuy !== undefined) traderConfig.minBuyPrice = minBuy;
  if (maxSell !== undefined) traderConfig.maxSellPrice = maxSell;

  const scanModeRaw = (env.WFM_SCAN_MODE ?? "remote").trim().toLowerCase();
  const scanMode: ScanMode = scanModeRaw === "full" ? "full" : scanModeRaw === "tiered" ? "tiered" : scanModeRaw === "local" ? "tiered" : "remote";
  const historyEnabled = env.WFM_HISTORY_ENABLED !== "0" && env.WFM_HISTORY !== "0";
  const historyDbPath = (env.WFM_HISTORY_DB ?? ".cache/the-plat-exchange/history.db").trim();
  const remoteDataUrl = env.WFM_DATA_URL === "off" || env.WFM_DATA_URL === ""
    ? undefined
    : env.WFM_DATA_URL ?? "https://raw.githubusercontent.com/ck0i/ThePlatExchange/data/data/latest/state.json";
  const remoteDataBase = env.WFM_DATA_BASE === "off" || env.WFM_DATA_BASE === ""
    ? undefined
    : env.WFM_DATA_BASE ?? "https://raw.githubusercontent.com/ck0i/ThePlatExchange/data/data";
  const remoteRunNowPollMs = readNumberEnv(env, "WFM_RUN_NOW_POLL_MS", 5_000);

  return {
    host,
    port,
    openBrowser: !args.includes("--no-open") && env.WFM_OPEN_BROWSER !== "0",
    refreshMs,
    weaponLimit,
    concurrency: readNumberEnv(env, "WFM_CONCURRENCY", 4),
    ratePerSecond: readNumberEnv(env, "WFM_RATE_PER_SEC", 3),
    burst: readNumberEnv(env, "WFM_BURST", 20),
    scanMode,
    hotSize: readNumberEnv(env, "WFM_HOT_SIZE", 40),
    coldSliceSize: readNumberEnv(env, "WFM_COLD_SLICE_SIZE", 150),
    hotIntervalMs: readNumberEnv(env, "WFM_HOT_INTERVAL_MS", 5 * 60_000),
    coldIntervalMs: readNumberEnv(env, "WFM_COLD_INTERVAL_MS", 60 * 60_000),
    emitDebounceMs: readNumberEnv(env, "WFM_EMIT_DEBOUNCE_MS", 1500),
    historyEnabled,
    historyDbPath,
    remoteDataUrl,
    remoteDataBase,
    remoteRunNowPollMs,
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
