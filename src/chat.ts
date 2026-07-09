import type { ServerResponse } from "node:http";
import type { McpSseServer, OpenAiToolDefinition } from "./mcp.js";
import { isRecord, readString } from "./wfm/guards.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_PUBLIC_FREE_KEY = "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";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || OPENROUTER_PUBLIC_FREE_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "poolside/laguna-m.1:free";
const MAX_HISTORY_MESSAGES = 24;
const MAX_CHAT_MESSAGE_CHARS = 16_000;
const MAX_TOOL_CALLS = 8;
const MAX_TOOL_RESULT_CHARS = 80_000;
const STREAM_SANITIZER_TAIL = 512;
const CHAT_MUTATING_TOOLS: Record<string, true> = { riven_refresh: true, riven_set_watchlist: true, arcane_refresh: true, product_refresh: true };
const CHAT_PAGE_LINKS = [
  "[Home](#page=home)",
  "[Opportunities](#page=opportunities)",
  "[Instant Wins](#page=instant)",
  "[Arcanes](#page=arcanes)",
  "[Plat Engine](#page=products)",
  "[Run Now](#page=run-now)",
  "[Data Health](#page=data-health)",
  "[Planner](#page=planner)",
  "[Riven Markets](#page=markets)",
  "[Settings](#page=settings)",
];

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenRouterToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}


class ChatRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function handleOpenRouterChat(response: ServerResponse, mcp: McpSseServer, payload: unknown, referer: string | undefined): Promise<void> {
  let streamStarted = false;
  try {
    const history = parseChatHistory(payload);
    const latestUserText = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
    const mutatingToolsAllowed = /\b(refresh|rescan|scan now|start scan|update scan|set watchlist|change watchlist|watchlist)\b/i.test(latestUserText);
    const allTools = mcp.describeOpenAiTools();
    const tools = mutatingToolsAllowed ? allTools : allTools.filter((tool) => !CHAT_MUTATING_TOOLS[tool.function.name]);
    const allowedToolNames = new Set(tools.map((tool) => tool.function.name));
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(tools, mutatingToolsAllowed) },
      ...history,
    ];

    beginChatStream(response);
    streamStarted = true;
    writeChatEvent(response, "status", { phase: "thinking", model: OPENROUTER_MODEL, tools: tools.length });

    const localToolCalls = deterministicToolCallsForUser(latestUserText, history, allowedToolNames);
    if (localToolCalls.length > 0) {
      await executeToolCalls(response, mcp, messages, localToolCalls, allowedToolNames);
      messages.push({
        role: "system",
        content: "Answer now using the current site data above. If riven or instant-win rows contain a `url` field, include those exact direct Warframe.market auction links when the user asks for links. Do not claim links are unavailable unless the current rows truly have no `url`. Keep it concise, actionable, and explicit about data quality/warnings. Do not discuss implementation details or provider names.",
      });
      await streamFinalAnswer(response, messages, referer, localToolCalls.length);
      return;
    }

    messages.push({
      role: "system",
      content: "Answer now as the site's Warframe platinum assistant. Stay on Warframe plat-making and site navigation only. If the user asks for current prices or listings but no current site data is present above, say you need a Warframe market-data question with a specific area such as rivens, arcanes, relics, or Run Now.",
    });
    await streamFinalAnswer(response, messages, referer, 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (streamStarted) {
      writeChatEvent(response, "error", { error: message });
      response.end();
      return;
    }
    const status = error instanceof ChatRequestError ? error.status : 500;
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ error: message }));
  }
}

function parseChatHistory(payload: unknown): ChatMessage[] {
  if (!isRecord(payload)) throw new ChatRequestError(400, "JSON object body required");
  const rawMessages = payload.messages;
  if (!Array.isArray(rawMessages)) throw new ChatRequestError(400, "messages array required");
  const messages: ChatMessage[] = [];
  for (const raw of rawMessages) {
    if (!isRecord(raw)) continue;
    const role = readString(raw, "role");
    if (role !== "user" && role !== "assistant") continue;
    const rawContent = readString(raw, "content") ?? "";
    const content = cleanChatHistoryContent(role, rawContent);
    if (!content) continue;
    messages.push({ role, content: clampChatContent(content) });
  }
  if (!messages.some((message) => message.role === "user")) throw new ChatRequestError(400, "at least one user message required");
  return messages.slice(-MAX_HISTORY_MESSAGES);
}

function cleanChatHistoryContent(role: "user" | "assistant", content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (role === "assistant" && /OpenRouter\s+\d+|DEGRADED function cannot be invoked|Function id .* cannot be invoked|I can only help with Warframe plat-making/i.test(trimmed)) return null;
  if (role === "assistant") return filterAssistantStreamText(trimmed, true).emit.trim();
  return trimmed;
}


function deterministicToolCallsForUser(latestUserText: string, history: ChatMessage[], allowedToolNames: Set<string>): OpenRouterToolCall[] {
  const text = latestUserText.toLowerCase();
  const priorText = history.slice(0, -1).map((message) => message.content.toLowerCase()).join("\n");
  const context = `${text}\n${priorText}`;
  const asksForLinks = /\b(link|links|url|urls|direct|auction|auctions|listing|listings|warframe\.market)\b/i.test(text);
  const asksForCurrentPrices = /\b(price|prices|priced|right now|current|best|sell|buy|opportunit)/i.test(text);
  const asksBroadPlat = /\b(plat|platinum)\b/i.test(text) || text.includes("what should i do") || /\bbest\b.*\b(way|move|farm|method)\b/i.test(text);
  const mentionsInstantWins = /\binstant[-\s]?wins?\b/i.test(context);
  const mentionsRivens = /\brivens?\b/i.test(context);
  const mentionsArcanes = /\barcanes?\b/i.test(context);
  const mentionsRelics = /\b(relics?|prime|aya|ducats?|fissures?)\b/i.test(context);
  const mentionsRunNow = /\brun now\b/i.test(context);
  const calls: OpenRouterToolCall[] = [];
  const addCall = (name: string, args: string = "{\"limit\":5}") => {
    if (!allowedToolNames.has(name) || calls.some((call) => call.function.name === name)) return;
    calls.push({ id: `forced_tool_${Date.now()}_${calls.length}`, type: "function", function: { name, arguments: args } });
  };
  if (asksBroadPlat) {
    addCall("riven_health", "{}");
    addCall("riven_opportunities");
    addCall("arcane_health", "{}");
    addCall("arcane_dissolve_recommendations");
    addCall("product_run_now");
    addCall("product_opportunities");
  }
  if (mentionsInstantWins && (asksForLinks || asksForCurrentPrices || asksBroadPlat)) addCall("riven_instant_wins");
  if ((mentionsRivens || context.includes("opportunities")) && (asksForLinks || asksForCurrentPrices || asksBroadPlat)) addCall("riven_opportunities");
  if (mentionsArcanes && (asksForCurrentPrices || asksBroadPlat)) {
    addCall("arcane_health", "{}");
    addCall("arcane_market");
  }
  if (mentionsRelics && (asksForCurrentPrices || asksBroadPlat)) addCall("product_prime_relics");
  if (mentionsRunNow && (asksForCurrentPrices || asksBroadPlat)) addCall("product_run_now");
  return calls;
}


function clampChatContent(content: string): string {
  if (content.length <= MAX_CHAT_MESSAGE_CHARS) return content;
  return `${content.slice(0, MAX_CHAT_MESSAGE_CHARS)}\n[message truncated by ThePlatExchange]`;
}

function buildSystemPrompt(_tools: OpenAiToolDefinition[], mutatingToolsAllowed: boolean): string {
  const mutationPolicy = mutatingToolsAllowed
    ? "The user explicitly asked for a refresh, scan, or watchlist change, so those site actions may run if directly needed."
    : "Do not start refreshes, scans, or watchlist changes unless the user explicitly asks.";
  return [
    "You are ThePlatExchange Chat, the local Warframe platinum dashboard assistant.",
    "Use current site data before answering questions about platinum-making actions, prices, market health, rivens, arcanes, relics, products, Run Now activities, or planner state.",
    "For broad 'what should I do now' questions, compare rivens, arcanes, product opportunities, and Run Now activities before answering.",
    mutationPolicy,
    "Stay on-topic: Warframe, ThePlatExchange, platinum-making, trading, market data, and site navigation. If the user asks for unrelated advice, code generation, automation, bots, scraping, or anything outside Warframe plat-making, briefly redirect them back to Warframe plat-making and this site.",
    "Present findings as site knowledge. Do not discuss implementation details, provider names, hidden requests, or behind-the-scenes data plumbing.",
    "Use plain prose by default. Use Markdown only for short comparison tables and occasional section headers; avoid decorative bullets unless they prevent ambiguity.",
    `When pointing the user to a relevant site page, use one of these Markdown links exactly: ${CHAT_PAGE_LINKS.join(", ")}.`,
    "Always inspect quality/warnings before trusting data. If quality is red or warnings exist, say the data is degraded and avoid overconfident advice.",
    "Do not invent prices, listings, sellers, or scan freshness. If a value is unavailable, say it is unavailable.",
    "For riven opportunities and instant-win listings, use the exact `url` field as the direct Warframe.market auction link whenever it is present. Never claim direct auction links are unavailable until current site data has no `url` for that listing, and never invent a link when `url` is missing.",
  ].join("\n");
}


async function requestPlainFinalAnswer(messages: ChatMessage[], referer: string | undefined): Promise<string> {
  const parsed = await postOpenRouterJson({
    model: OPENROUTER_MODEL,
    messages: [
      ...messages,
      {
        role: "system",
        content: "Your previous visible answer was empty. Answer in plain prose now using the site data above when present. Use exact `url` fields for riven/instant-win direct links when present.",
      },
    ],
    temperature: 0.2,
    stream: false,
  }, referer);
  const choice = firstChoice(parsed);
  const message = isRecord(choice.message) ? choice.message : null;
  if (!message) return "";
  const content = readAssistantContent(message);
  if (readToolCalls(message).length > 0 || readMarkupToolCalls(content).length > 0) return "";
  return sanitizeAssistantText(content);
}

async function postOpenRouterJson(payload: Record<string, unknown>, referer: string | undefined): Promise<Record<string, unknown>> {
  const upstream = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: openRouterHeaders(referer),
    body: JSON.stringify(payload),
  });
  if (!upstream.ok) throw new Error(`OpenRouter ${upstream.status}: ${await upstream.text()}`);
  const parsed: unknown = await upstream.json();
  if (!isRecord(parsed)) throw new Error("OpenRouter returned a non-object response");
  return parsed;
}

function firstChoice(parsed: Record<string, unknown>): Record<string, unknown> {
  const choices = parsed.choices;
  const choice = Array.isArray(choices) ? choices[0] : null;
  if (!isRecord(choice)) throw new Error("OpenRouter response did not include choices[0]");
  return choice;
}

function readAssistantContent(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => isRecord(part) ? readString(part, "text") ?? "" : "").join("");
}

function readToolCalls(message: Record<string, unknown>): OpenRouterToolCall[] {
  const rawCalls = message.tool_calls;
  if (!Array.isArray(rawCalls)) return [];
  const calls: OpenRouterToolCall[] = [];
  for (let index = 0; index < rawCalls.length; index += 1) {
    const raw = rawCalls[index];
    if (!isRecord(raw)) continue;
    const fn = isRecord(raw.function) ? raw.function : null;
    if (!fn) continue;
    const name = readString(fn, "name");
    if (!name) continue;
    calls.push({
      id: readString(raw, "id") ?? `chat_tool_${Date.now()}_${index}`,
      type: "function",
      function: {
        name,
        arguments: readString(fn, "arguments") ?? "{}",
      },
    });
  }
  return calls;
}

function readMarkupToolCalls(content: string): OpenRouterToolCall[] {
  const normalizedContent = content.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&amp;/gi, "&");
  const calls: OpenRouterToolCall[] = [];
  const functionPattern = /<tool_call>\s*<function=([a-zA-Z0-9_:-]+)>\s*([\s\S]*?)\s*<\/function>\s*<\/tool_call>/gi;
  for (const match of normalizedContent.matchAll(functionPattern)) {
    const name = match[1]?.trim();
    if (!name) continue;
    calls.push({
      id: `markup_tool_${Date.now()}_${calls.length}`,
      type: "function",
      function: {
        name,
        arguments: markupToolArguments(match[2] ?? ""),
      },
    });
  }
  if (calls.length > 0) return calls;
  const barePattern = /<tool_call>\s*([a-zA-Z0-9_:-]+)\s*<\/tool_call>/gi;
  for (const match of normalizedContent.matchAll(barePattern)) {
    const name = match[1]?.trim();
    if (!name) continue;
    calls.push({
      id: `markup_tool_${Date.now()}_${calls.length}`,
      type: "function",
      function: { name, arguments: "{}" },
    });
  }
  return calls;
}

function markupToolArguments(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "{}";
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const args: Record<string, unknown> = {};
  const parameterPattern = /<parameter=([a-zA-Z0-9_:-]+)>\s*([\s\S]*?)\s*<\/parameter>/gi;
  for (const match of trimmed.matchAll(parameterPattern)) {
    const key = match[1]?.trim();
    if (!key) continue;
    args[key] = markupScalarValue(match[2] ?? "");
  }
  return Object.keys(args).length > 0 ? JSON.stringify(args) : "{}";
}

function markupScalarValue(raw: string): unknown {
  const value = raw.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

async function executeToolCalls(response: ServerResponse, mcp: McpSseServer, messages: ChatMessage[], toolCalls: OpenRouterToolCall[], allowedToolNames: Set<string>): Promise<void> {
  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const args = parseToolArguments(toolCall.function.arguments);
    writeChatEvent(response, "lookup_start", { name: toolName, arguments: args });
    if (!allowedToolNames.has(toolName)) {
      const content = JSON.stringify({ error: "This action is unavailable unless the user explicitly asks for a refresh, scan, or watchlist change." });
      messages.push({ role: "system", content: `Site action ${toolName} was not run: ${content}` });
      writeChatEvent(response, "lookup_result", { name: toolName, ok: false, preview: "Action not run." });
      continue;
    }
    const result = await mcp.callToolForChat(toolName, args);
    const content = toolMessageContent(result.payload);
    messages.push({ role: "system", content: `Site data result (${toolName}, arguments ${stringifyForModel(args)}):\n${content}` });
    writeChatEvent(response, "lookup_result", { name: toolName, ok: result.ok, preview: toolResultPreview(result.payload) });
  }
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (raw.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toolMessageContent(payload: Record<string, unknown>): string {
  const compactPayload = payload.structuredContent ?? payload;
  const text = stringifyForModel(compactPayload);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n[tool result truncated by ThePlatExchange]`;
}

function toolResultPreview(payload: Record<string, unknown>): string {
  const structured = payload.structuredContent;
  if (!isRecord(structured)) return "Tool returned a result.";
  const meta = isRecord(structured.meta) ? structured.meta : null;
  const quality = meta ? readString(meta, "quality") : undefined;
  const warnings = meta && Array.isArray(meta.warnings) ? meta.warnings.length : 0;
  const data = structured.data;
  const count = Array.isArray(data) ? data.length : isRecord(data) ? Object.keys(data).length : null;
  const parts = [];
  if (quality) parts.push(`quality ${quality}`);
  if (count !== null) parts.push(`${count} rows/fields`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : "Tool returned a result.";
}

function sanitizeAssistantText(text: string): string {
  let sanitized = filterAssistantStreamText(text, true).emit;
  sanitized = sanitized.replace(/\bMCP\s+tools?\b/gi, "site data");
  sanitized = sanitized.replace(/\btool data\b/gi, "site data");
  sanitized = sanitized.replace(/\btool calls?\b/gi, "site checks");
  sanitized = sanitized.replace(/\btools?\b/gi, "site data");
  sanitized = sanitized.replace(/\bMCP\b/gi, "site");
  sanitized = sanitized.replace(/\bOpenRouter\b/gi, "the model");
  sanitized = sanitized.replace(/\bfunction calls?\b/gi, "site checks");
  sanitized = sanitized.replace(/\bschemas?\b/gi, "site details");
  sanitized = sanitized.replace(/\bsite data and site data\b/gi, "site data");
  return sanitized;
}

function filterAssistantStreamText(buffer: string, final: boolean): { emit: string; rest: string } {
  let emit = "";
  let index = 0;
  const lower = buffer.toLowerCase();
  while (index < buffer.length) {
    const rawStart = lower.indexOf("<tool_call", index);
    const escapedStart = lower.indexOf("&lt;tool_call", index);
    const starts = [rawStart, escapedStart].filter((value) => value >= 0);
    const start = starts.length > 0 ? Math.min(...starts) : -1;
    if (start < 0) {
      if (final) return { emit: emit + buffer.slice(index), rest: "" };
      if (buffer.length - index <= STREAM_SANITIZER_TAIL) return { emit, rest: buffer.slice(index) };
      const flushEnd = buffer.length - STREAM_SANITIZER_TAIL;
      return { emit: emit + buffer.slice(index, flushEnd), rest: buffer.slice(flushEnd) };
    }
    if (!final && start >= buffer.length - STREAM_SANITIZER_TAIL) return { emit: emit + buffer.slice(index, start), rest: buffer.slice(start) };
    emit += buffer.slice(index, start);
    const escaped = lower.startsWith("&lt;tool_call", start);
    const closeToken = escaped ? "&lt;/tool_call&gt;" : "</tool_call>";
    const close = lower.indexOf(closeToken, start);
    if (close < 0) return final ? { emit, rest: "" } : { emit, rest: buffer.slice(start) };
    index = close + closeToken.length;
  }
  return { emit, rest: "" };
}

async function streamFinalAnswer(response: ServerResponse, messages: ChatMessage[], referer: string | undefined, toolCallCount: number): Promise<void> {
  writeChatEvent(response, "status", { phase: "answering", model: OPENROUTER_MODEL, toolCalls: toolCallCount });
  const upstream = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: openRouterHeaders(referer),
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      temperature: 0.25,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  if (!upstream.ok) throw new Error(`OpenRouter ${upstream.status}: ${await upstream.text()}`);
  if (!upstream.body) throw new Error("OpenRouter did not return a stream");

  let visibleEmitted = false;
  let pendingText = "";
  await readOpenRouterSse(upstream.body, (content) => {
    pendingText += content;
    if (pendingText.length > STREAM_SANITIZER_TAIL * 2) {
      const filtered = filterAssistantStreamText(pendingText, false);
      pendingText = filtered.rest;
      if (filtered.emit) {
        const sanitized = sanitizeAssistantText(filtered.emit);
        if (sanitized.trim().length > 0) {
          visibleEmitted = true;
          writeChatEvent(response, "delta", { content: sanitized });
        }
      }
    }
  }, (usage) => {
    writeChatEvent(response, "usage", normalizeUsage(usage));
  });
  if (pendingText.length > 0) {
    const filtered = filterAssistantStreamText(pendingText, true);
    if (filtered.emit) {
      const sanitized = sanitizeAssistantText(filtered.emit);
      if (sanitized.trim().length > 0) {
        visibleEmitted = true;
        writeChatEvent(response, "delta", { content: sanitized });
      }
    }
  }
  if (!visibleEmitted) {
    const retryText = await requestPlainFinalAnswer(messages, referer);
    writeChatEvent(response, "delta", { content: retryText.trim().length > 0 ? retryText : "No answer text returned." });
  }
  writeChatEvent(response, "done", { model: OPENROUTER_MODEL, toolCalls: toolCallCount });
  response.end();
}

async function readOpenRouterSse(body: ReadableStream<Uint8Array>, onContent: (content: string) => void, onUsage: (usage: Record<string, unknown>) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const boundary = /\r?\n\r?\n/.exec(buffer);
      if (!boundary) break;
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      if (handleOpenRouterSseBlock(block, onContent, onUsage)) return;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim().length > 0) handleOpenRouterSseBlock(buffer, onContent, onUsage);
}

function handleOpenRouterSseBlock(block: string, onContent: (content: string) => void, onUsage: (usage: Record<string, unknown>) => void): boolean {
  const dataLines = block.split(/\r?\n/).filter((line) => line.startsWith("data:"));
  if (dataLines.length === 0) return false;
  const data = dataLines.map((line) => line.slice(5).trimStart()).join("\n");
  if (data === "[DONE]") return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return false;
  }
  if (!isRecord(parsed)) return false;
  if (isRecord(parsed.usage)) onUsage(parsed.usage);
  const choices = parsed.choices;
  const choice = Array.isArray(choices) ? choices[0] : null;
  if (!isRecord(choice)) return false;
  const delta = isRecord(choice.delta) ? choice.delta : null;
  const content = delta ? readString(delta, "content") : undefined;
  if (content) onContent(content);
  return false;
}

function normalizeUsage(usage: Record<string, unknown>): Record<string, unknown> {
  return {
    promptTokens: numberOrNull(usage.prompt_tokens) ?? numberOrNull(usage.promptTokens),
    completionTokens: numberOrNull(usage.completion_tokens) ?? numberOrNull(usage.completionTokens),
    totalTokens: numberOrNull(usage.total_tokens) ?? numberOrNull(usage.totalTokens),
    reasoningTokens: numberOrNull(usage.reasoning_tokens) ?? numberOrNull(usage.reasoningTokens),
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function beginChatStream(response: ServerResponse): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

function writeChatEvent(response: ServerResponse, event: string, payload: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}


function openRouterHeaders(referer: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "X-Title": "ThePlatExchange",
  };
  headers["HTTP-Referer"] = referer && referer.length > 0 ? referer : "https://github.com/ck0i/ThePlatExchange";
  return headers;
}

function stringifyForModel(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
