import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { McpSseServer } from "./mcp.js";
import { isRecord, readBoolean, readNumber, readString } from "./wfm/guards.js";
import type { RivenTraderService } from "./wfm/scanner.js";
import type { DashboardState, SellerStatus, TraderConfig } from "./wfm/types.js";

export interface AppServerOptions {
  publicDir?: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function createAppServer(service: RivenTraderService, options: AppServerOptions = {}): Server {
  const publicDir = options.publicDir ?? join(process.cwd(), "public");
  const mcp = new McpSseServer(service);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      if (request.method === "GET" && url.pathname === "/events") {
        handleDashboardSse(request, response, service);
        return;
      }
      if (request.method === "GET" && url.pathname === "/mcp/sse") {
        mcp.handleSse(request, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/mcp/messages") {
        await mcp.handleMessage(request, response, url);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        sendJson(response, 200, service.getState());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/scan") {
        const payload = await readRequestJson(request);
        service.updateConfig(configUpdateFromPayload(payload));
        void service.refresh("manual");
        sendJson(response, 202, service.getState());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/refresh") {
        void service.refresh("manual");
        sendJson(response, 202, service.getState());
        return;
      }
      if (request.method === "GET") {
        await serveStatic(response, publicDir, url.pathname);
        return;
      }
      sendText(response, 405, "Method not allowed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 500, { error: message });
    }
  });
}

function handleDashboardSse(request: IncomingMessage, response: ServerResponse, service: RivenTraderService): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendState = (state: DashboardState) => {
    writeSse(response, "state", JSON.stringify(state));
  };
  const unsubscribe = service.subscribe(sendState);
  const heartbeat: NodeJS.Timeout = setInterval(() => {
    writeSse(response, "heartbeat", new Date().toISOString());
  }, 30_000);

  request.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

async function serveStatic(response: ServerResponse, publicDir: string, pathname: string): Promise<void> {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = normalize(decodeURIComponent(requested)).replace(/^\.\.(?:\/|\\|$)/, "");
  const filePath = join(publicDir, normalizedPath);
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" });
    response.end(content);
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  }
  if (body.trim().length === 0) return {};
  return JSON.parse(body);
}

function configUpdateFromPayload(payload: unknown): Partial<TraderConfig> {
  if (!isRecord(payload)) return {};
  const update: Partial<TraderConfig> = {};
  const watchlistValue = payload.watchlist;
  if (typeof watchlistValue === "string") {
    update.watchlist = splitWatchlist(watchlistValue);
  } else if (Array.isArray(watchlistValue)) {
    update.watchlist = watchlistValue.filter((entry): entry is string => typeof entry === "string");
  }

  const statusesValue = payload.statuses;
  if (Array.isArray(statusesValue)) {
    const statuses = statusesValue.filter((entry): entry is SellerStatus => entry === "ingame" || entry === "online" || entry === "offline" || entry === "unknown");
    if (statuses.length > 0) update.statuses = statuses;
  }

  const minProfit = readNumber(payload, "minProfit");
  const minRoi = readNumber(payload, "minRoi");
  const minGroupSize = readNumber(payload, "minGroupSize");
  const maxResults = readNumber(payload, "maxResults");
  const scanAllWhenWatchlistEmpty = readBoolean(payload, "scanAllWhenWatchlistEmpty");
  if (minProfit !== undefined) update.minProfit = minProfit;
  if (minRoi !== undefined) update.minRoi = minRoi;
  if (minGroupSize !== undefined) update.minGroupSize = minGroupSize;
  if (maxResults !== undefined) update.maxResults = maxResults;
  if (scanAllWhenWatchlistEmpty !== undefined) update.scanAllWhenWatchlistEmpty = scanAllWhenWatchlistEmpty;

  if (payload.minBuyPrice === null) {
    update.minBuyPrice = null;
  } else {
    const minBuyPrice = readNumber(payload, "minBuyPrice");
    if (minBuyPrice !== undefined) update.minBuyPrice = minBuyPrice;
  }

  if (payload.maxBuyPrice === null) {
    update.maxBuyPrice = null;
  } else {
    const maxBuyPrice = readNumber(payload, "maxBuyPrice");
    if (maxBuyPrice !== undefined) update.maxBuyPrice = maxBuyPrice;
  }
  if (payload.maxSellPrice === null) {
    update.maxSellPrice = null;
  } else {
    const maxSellPrice = readNumber(payload, "maxSellPrice");
    if (maxSellPrice !== undefined) update.maxSellPrice = maxSellPrice;
  }


  const watchlistText = readString(payload, "watchlistText");
  if (watchlistText !== undefined) update.watchlist = splitWatchlist(watchlistText);
  return update;
}

function splitWatchlist(value: string): string[] {
  return value.split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response: ServerResponse, status: number, payload: string): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(payload);
}

function writeSse(response: ServerResponse, event: string, data: string): void {
  response.write(`event: ${event}\n`);
  for (const line of data.split("\n")) response.write(`data: ${line}\n`);
  response.write("\n");
}
