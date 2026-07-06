# ThePlatExchange

ThePlatExchange is a TypeScript dashboard for finding Warframe riven arbitrage opportunities: buy low, sell high, and sort by expected platinum margin, ROI, confidence, and seller availability.

It reads public Warframe.market riven data, enriches weapons with warframestat.us images, and serves both a browser UI and an MCP-over-SSE endpoint for MCP-aware clients.

## What it shows

- Ranked buy-low / sell-high riven opportunities.
- Expected profit, ROI, buy-to-sell ratio, comparable listing count, confidence, and score.
- Seller status filters for `ingame`, `online`, and `offline` listings.
- Watchlist filters for scanning specific weapons.
- ROI-vs-profit chart and weapon market detail cards.
- Instant-win candidates when a listing is below same-signature valuation history.
- MCP tools for live snapshots, opportunity queries, refreshes, watchlist updates, health checks, signature valuation, and instant-win lookup.

## Requirements

- Node.js 22 or newer.
- npm.
- Network access to Warframe.market and, for weapon images, warframestat.us.

## Quick start

### Double-click launchers

- Windows: double-click `run.bat`.
- Linux: double-click `run-linux.desktop`, or run `./run.sh` from a terminal. Some desktop environments require right-clicking the launcher and selecting **Allow Launching** first.

The launchers check for Node.js/npm, run `npm install`, and start the dashboard with `npm run start`. The app opens the dashboard in your browser automatically by default.

### Manual start

```bash
npm install
npm run dev
```

Then open the printed dashboard URL, usually:

```text
http://127.0.0.1:3417
```

The server also prints:

```text
MCP SSE endpoint: http://127.0.0.1:3417/mcp/sse
Dashboard SSE endpoint: http://127.0.0.1:3417/events
```

To run without auto-opening a browser:

```bash
npm run dev -- --no-open
```

## Common commands

```bash
npm run dev      # start the dashboard with tsx
npm run start    # same entry point as dev
npm run check    # TypeScript type-check
npm test         # behavior tests
```

Bun is optional:

```bash
npm run start:bun
```

## How the data modes work

The dashboard supports three scan modes:

- `remote` — default. Reads the shared GitHub Actions data feed first, then falls back to local state when available.
- `tiered` — scans locally with a hot/cold cadence so high-priority markets refresh more often.
- `full` — scans all target weapons locally each refresh cycle.

You can switch between `CI feed` and `Local scan` from the settings modal in the UI.

Local scans are server-side, cached, and token-bucket rate-limited.

## Configuration

Most settings can be changed in the UI. Environment variables are useful for startup defaults and automation.

| Variable | Default | Purpose |
| --- | --- | --- |
| `WFM_HOST` | `127.0.0.1` | HTTP bind host. |
| `WFM_PORT` | `3417` | HTTP port. |
| `WFM_OPEN_BROWSER` | enabled | Set `0` to disable browser auto-open. |
| `WFM_SCAN_MODE` | `remote` | `remote`, `tiered`, `full`, or `local` (`local` maps to `tiered`). |
| `WFM_WATCHLIST` | empty | Comma- or newline-separated weapon names/slugs. Empty means all weapons. |
| `WFM_MIN_PROFIT` | `25` | Minimum expected profit in platinum. |
| `WFM_MIN_ROI` | `0.35` | Minimum ROI. |
| `WFM_MIN_GROUP_SIZE` | `4` | Minimum comparable listings required. |
| `WFM_MAX_RESULTS` | `75` | Maximum ranked opportunities returned. |
| `WFM_STATUSES` | `ingame,online` | Seller statuses to include. |
| `WFM_MIN_BUY_PRICE` | unset | Optional minimum listing buyout. |
| `WFM_MAX_BUY_PRICE` | unset | Optional maximum listing buyout. |
| `WFM_MAX_SELL_PRICE` | unset | Optional maximum target sell price. |
| `WFM_REFRESH_MS` | `60000` | Local refresh interval. |
| `WFM_RATE_PER_SEC` | `3` | Warframe.market request refill rate. |
| `WFM_BURST` | `20` | Warframe.market request burst size. |
| `WFM_CONCURRENCY` | `4` | Local scan worker count. |
| `WFM_HISTORY_ENABLED` | enabled | Set `0` to disable the local SQLite history store. |
| `WFM_HISTORY_DB` | `.cache/the-plat-exchange/history.db` | Local history database path. |
| `WFM_DATA_URL` | project data feed | Remote state JSON URL. Set `off` to disable. |
| `WFM_DATA_BASE` | project data root | Remote valuation/velocity data root. Set `off` to disable. |

Example:

```bash
WFM_SCAN_MODE=tiered WFM_WATCHLIST="war,kuva bramma" WFM_MIN_PROFIT=50 npm run dev
```

## MCP connection

The app starts an MCP-over-SSE server with the dashboard.

- SSE endpoint: `http://127.0.0.1:3417/mcp/sse`
- Message endpoint: `/mcp/messages`
- Info endpoint: `/api/mcp-info`

Open **Settings → MCP connect** in the dashboard to copy Claude Desktop or Claude Code configuration snippets and test the connection.

Available MCP tools include:

- `the_plat_exchange_snapshot`
- `riven_opportunities`
- `riven_refresh`
- `riven_set_watchlist`
- `riven_health`
- `riven_signature_value`
- `riven_instant_wins`

## HTTP endpoints

Useful local endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Browser dashboard. |
| `GET /events` | Dashboard server-sent events. |
| `GET /api/state` | Current dashboard state. |
| `GET /api/opportunities` | Enriched opportunity list. |
| `GET /api/instant-wins` | Same-signature undervaluation candidates. |
| `GET /api/weapons` | Weapon market summaries. |
| `GET /api/weapon/:slug` | Detailed weapon market view. |
| `GET /api/signature-value` | Historical valuation for a weapon/signature. |
| `POST /api/scan` | Update filters and trigger a manual scan. |
| `POST /api/refresh` | Trigger a manual refresh. |
| `POST /api/mode` | Switch `remote`, `tiered`, or `full` mode. |
| `GET /api/mcp-info` | MCP endpoint and tool metadata. |

## GitHub Actions data feed

The workflows in `.github/workflows` can publish a data branch used by the default `remote` mode:

- Cold scan every 30 minutes.
- Sentiment fetch every 6 hours.

The one-shot scanner can also be run manually:

```bash
npx tsx scripts/scan-and-write.ts --tier cold --data-dir data
npx tsx scripts/scan-and-write.ts --tier reference --data-dir data
```

## Project layout

```text
src/main.ts              app entry point and launch configuration
src/server.ts            HTTP server, API routes, static files, image proxy
src/mcp.ts               MCP-over-SSE transport and tools
src/wfm/client.ts        Warframe.market client and cache handling
src/wfm/scanner.ts       scan orchestration and remote feed polling
src/wfm/opportunities.ts opportunity scoring and filtering
src/wfm/history.ts       local valuation and velocity history
public/                  browser dashboard assets
scripts/                 CI/data-feed scripts
test/                    behavior tests
```

## Notes

- Prices are estimates based on current listings and historical samples; always verify a listing before trading.
- Profit is median-based over outlier-trimmed comparables so single extreme listings do not inflate expected returns.
- Warframe.market fetches are rate-limited by this server. Avoid raising request limits unless you know the API can handle it.
