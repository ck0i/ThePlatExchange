/*
 * Minimal MCP-over-legacy-SSE transport.
 *
 * The current TypeScript MCP SDK is moving toward Streamable HTTP, while this
 * app explicitly needs an SSE output. To keep the runtime dependency-free and
 * stable, this module implements the legacy MCP JSON-RPC framing directly:
 * GET /mcp/sse emits an `endpoint` event, and clients POST JSON-RPC messages to
 * that endpoint. Tool/list/call/resource methods are normal MCP JSON-RPC.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { isRecord, readNumber, readPositiveInteger, readString, readStringArray } from "./wfm/guards.js";
import type { RivenTraderService } from "./wfm/scanner.js";
import type { TraderConfig } from "./wfm/types.js";

interface McpSession {
  id: string;
  response: ServerResponse;
  createdAt: number;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: unknown;
  method: string;
  params?: unknown;
}

export class McpSseServer {
  private readonly sessions = new Map<string, McpSession>();

  constructor(private readonly service: RivenTraderService) {}

  handleSse(request: IncomingMessage, response: ServerResponse): void {
    const sessionId = randomUUID();
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const session: McpSession = { id: sessionId, response, createdAt: Date.now() };
    this.sessions.set(sessionId, session);
    this.writeEvent(response, "endpoint", `/mcp/messages?sessionId=${encodeURIComponent(sessionId)}`);
    this.writeEvent(response, "message", JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: { server: "wf-riventrader" } }));
    request.on("close", () => {
      this.sessions.delete(sessionId);
    });
  }

  async handleMessage(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const session = this.sessions.get(sessionId);
    if (!session) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unknown MCP SSE session");
      return;
    }

    const body = await readRequestJson(request);
    const messages = Array.isArray(body) ? body : [body];
    for (const candidate of messages) {
      const parsed = parseJsonRpcRequest(candidate);
      if (!parsed) {
        this.sendMessage(session, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC request" } });
        continue;
      }
      const result = await this.dispatch(parsed);
      if (result !== null) this.sendMessage(session, result);
    }

    response.writeHead(202, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("accepted");
  }

  private async dispatch(request: JsonRpcRequest): Promise<Record<string, unknown> | null> {
    if (request.method.startsWith("notifications/")) return null;
    if (request.method === "initialize") {
      return ok(request.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: { name: "wf-riventrader", version: "0.1.0" },
      });
    }
    if (request.method === "ping") return ok(request.id, {});
    if (request.method === "tools/list") return ok(request.id, { tools: this.tools() });
    if (request.method === "tools/call") return this.handleToolCall(request);
    if (request.method === "resources/list") {
      return ok(request.id, { resources: [{ uri: "wf-riventrader://snapshot", name: "Current riven trader snapshot", mimeType: "application/json" }] });
    }
    if (request.method === "resources/read") {
      return ok(request.id, { contents: [{ uri: "wf-riventrader://snapshot", mimeType: "application/json", text: JSON.stringify(this.service.getState(), null, 2) }] });
    }
    return err(request.id, -32601, `Unsupported MCP method: ${request.method}`);
  }

  private async handleToolCall(request: JsonRpcRequest): Promise<Record<string, unknown>> {
    if (!isRecord(request.params)) return err(request.id, -32602, "tools/call requires params");
    const name = readString(request.params, "name");
    const argumentsRecord = readRecordFromParams(request.params, "arguments");
    if (name === "riven_trader_snapshot") {
      const limit = readPositiveInteger(argumentsRecord, "limit", 25);
      const state = this.service.getState();
      const compactState = { ...state, opportunities: state.opportunities.slice(0, limit), weaponSummaries: state.weaponSummaries.slice(0, limit) };
      return ok(request.id, toolText(compactState));
    }
    if (name === "riven_opportunities") {
      const limit = readPositiveInteger(argumentsRecord, "limit", 25);
      const minProfit = readNumber(argumentsRecord, "minProfit");
      const minRoi = readNumber(argumentsRecord, "minRoi");
      const minBuyPrice = readNumber(argumentsRecord, "minBuyPrice");
      const maxSellPrice = readNumber(argumentsRecord, "maxSellPrice");
      const update: Partial<TraderConfig> = {};
      if (minProfit !== undefined) update.minProfit = minProfit;
      if (minRoi !== undefined) update.minRoi = minRoi;
      if (minBuyPrice !== undefined) update.minBuyPrice = minBuyPrice;
      if (maxSellPrice !== undefined) update.maxSellPrice = maxSellPrice;
      if (Object.keys(update).length > 0) this.service.updateConfig(update);
      return ok(request.id, toolText(this.service.getState().opportunities.slice(0, limit)));
    }
    if (name === "riven_refresh") {
      void this.service.refresh("mcp");
      return ok(request.id, toolText({ accepted: true, status: this.service.getState().status }));
    }
    if (name === "riven_set_watchlist") {
      const watchlist = parseWatchlist(argumentsRecord);
      this.service.updateConfig({ watchlist });
      void this.service.refresh("mcp-watchlist");
      return ok(request.id, toolText({ accepted: true, watchlist }));
    }
    return err(request.id, -32602, `Unknown tool: ${name ?? "missing"}`);
  }

  private tools(): Array<Record<string, unknown>> {
    return [
      {
        name: "riven_trader_snapshot",
        description: "Return the current Warframe.market riven trader dashboard snapshot.",
        inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, default: 25 } }, additionalProperties: false },
      },
      {
        name: "riven_opportunities",
        description: "Return ranked buy-low/sell-high riven opportunities, optionally tightening min profit, ROI, min buy, or max sell target.",
        inputSchema: {
          type: "object",
          properties: { limit: { type: "number", minimum: 1, default: 25 }, minProfit: { type: "number", minimum: 0 }, minRoi: { type: "number", minimum: 0 }, minBuyPrice: { type: "number", minimum: 0 }, maxSellPrice: { type: "number", minimum: 0 } },
          additionalProperties: false,
        },
      },
      {
        name: "riven_refresh",
        description: "Start a non-overlapping Warframe.market riven refresh through the shared server-side token bucket.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "riven_set_watchlist",
        description: "Set a riven weapon watchlist and start a refresh. Empty watchlist scans all riven weapons.",
        inputSchema: {
          type: "object",
          properties: { watchlist: { type: "array", items: { type: "string" } }, watchlistText: { type: "string" } },
          additionalProperties: false,
        },
      },
    ];
  }

  private sendMessage(session: McpSession, payload: Record<string, unknown>): void {
    this.writeEvent(session.response, "message", JSON.stringify(payload));
  }

  private writeEvent(response: ServerResponse, event: string, data: string): void {
    response.write(`event: ${event}\n`);
    response.write(`data: ${data}\n\n`);
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

function parseJsonRpcRequest(value: unknown): JsonRpcRequest | null {
  if (!isRecord(value)) return null;
  const method = readString(value, "method");
  if (!method) return null;
  const parsed: JsonRpcRequest = { jsonrpc: "2.0", method };
  if (value.id !== undefined) parsed.id = value.id;
  if (value.params !== undefined) parsed.params = value.params;
  return parsed;
}

function readRecordFromParams(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function parseWatchlist(record: Record<string, unknown>): string[] {
  const arrayValues = readStringArray(record, "watchlist");
  const text = readString(record, "watchlistText");
  const textValues = text ? text.split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0) : [];
  return [...arrayValues, ...textValues];
}

function ok(id: unknown, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function toolText(value: unknown): Record<string, unknown> {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
