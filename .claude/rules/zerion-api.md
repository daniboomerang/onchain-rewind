---
paths:
  - "src/server/**"
---

# Zerion API

## Non-negotiables
- The key is read only here: `process.env.ZERION_API_KEY` inside `src/server/`. Never expose it through `VITE_*`, never log it, never return it, never put it in an error message.
- Every call goes through one function, `zerionFetch(path, params, { signal })` in `src/server/zerion/client.ts`. No other `fetch` to `api.zerion.io` anywhere.
- Server functions return **typed, trimmed** data: only the fields the engine needs. Don't pass whole JSON:API documents to the client.

## Basics
- Base URL: `https://api.zerion.io`. Responses are JSON:API: `data`, `links.next`, `included`.
- Auth: HTTP Basic, with the API key as the username and an empty password. The header is `Authorization: Basic base64(KEY + ":")`. **Confirmed** against the OpenAPI spec's `APIKeyBasicAuth` scheme (`type: http`, `scheme: basic`, "paste your API key … into the username field and leave the password empty") and the authentication page's examples (`btoa(apiKey + ':')`); `zerionFetch` builds it, so no caller ever touches it.
- Always send `currency=usd` — `zerionFetch` adds it to every call, and a caller only passes it to override it. Send `filter[trash]=only_non_trash` wherever the endpoint supports it.
- **ENS isn't resolved by Zerion.** Wallet path params must be a hex EVM address. Resolve ENS on the server with viem (`getEnsAddress`, mainnet) in its own server function.

## Endpoints used

| Purpose | Path | Notes |
|---|---|---|
| Transactions | `GET /v1/wallets/{address}/transactions/` | Paginated by following `links.next` exactly as returned; don't build cursors yourself — pass the absolute URL straight to `zerionFetch`, which accepts one. A `links.next` URL already carries every filter and the page size, so send no parameters with it. Filters: `filter[min_mined_at]`, `filter[max_mined_at]`, `filter[chain_ids]`, `filter[operation_types]`, `filter[trash]`. Page size: `page[size]` (use 100). **There is no sort parameter**: the order is newest-first, always (confirmed in the OpenAPI spec — `sort` exists on positions, NFT collections and the fungibles list, never on transactions). |
| Balance chart | `GET /v1/wallets/{address}/charts/{period}` | The period is `year`: one point per day over the last 365 days. **Confirmed** in the OpenAPI spec's `chart_period` enum (`hour`, `day`, `week`, `month`, `3months`, `6months`, `year`, `5years`, `max`) and live — 366 points, `begin_at`/`end_at` a year apart. Points are `[unix seconds, value]` tuples, oldest first. |
| Chains | `GET /v1/chains/` | Names and icons. Cache for 24h. |
| Fungible | `GET /v1/fungibles/{id}` | Name, symbol, icon, market data. |
| Portfolio / positions / PnL | `/v1/wallets/{a}/portfolio`, `/positions/`, `/pnl` | Not needed for v1. Don't add them without updating SPEC.md. |

The OpenAPI spec is at `https://developers.zerion.io/openapi-v1.yaml`, and the docs index is at `https://developers.zerion.io/llms.txt`. **Before relying on a field, confirm it** via the MCP server or the spec. Never guess field names.

## Paging contract (what the client relies on)
`getTransactionsPage({ address, next? }) → { items: TxLite[], next: string | null, count: number }`
- The client calls it in a loop, feeding `count` to `ParticleReveal.addTransactions`.
- Stop when `next` is null, when the window is exhausted, or at the cap of 20 pages (2,000 transactions). Report `capped: true`.
- Honour `AbortSignal`: a wallet change cancels the loop.
- Pace it: **every** request one run makes — each page and each of the three reads that resolve once — goes out at least `REQUEST_INTERVAL_MS` after the one before it (`src/lib/useRewind.ts`), because the Demo plan's per-second limit is one request and a burst of two is throttled whatever the two are. One per-run scheduler reserves the slots, so the chain list and the chart queue behind the first page rather than firing alongside it.
- A failed page is asked for once more (`PAGE_RETRY_MS`) before the run reacts to it. Measured live: a deep page of a very active wallet can answer `429` even when paced, and can answer `500` — twice the same second and then fine — so one retry is what the client owes the upstream. If it fails again, only the *first* page failing is the error state; a later one ends paging and reports `capped: true`.
- **`budget_spent` is never retried**, at either level: no backoff in the client and no second ask in the hook. Every request is refused until the day resets, so a retry spends only the wait.

## Limits, caching, errors

**The plan is Zerion's free Demo plan**, and its limits are the ones below — read off the response headers on this repository's own key and confirmed on the Zerion dashboard, never guessed:

| Header | Value on this key | Means |
|---|---|---|
| `ratelimit-org-tier` | `demo` | The organization's plan. |
| `ratelimit-org-second-limit` | `1` | **One request a second.** Two in the same second are throttled, whichever endpoints they are. |
| `ratelimit-org-day-limit` | `300` | **300 requests a day** for the whole organization. |
| `ratelimit-org-day-remaining` | counts down to `0` | What the day has left. `0` on a `429` is the budget spent. |
| `ratelimit-org-day-reset` | a timestamp | When the day's budget comes back. Nothing succeeds before it. |

Every response carries them, so re-read them from a live call rather than trusting this table if the plan ever changes.

- One full Rewind of a wallet at the cap costs 23 requests (20 pages, the chain list, the chart and the top token's fungible), so the day holds roughly a dozen of them.
- Keep an in-memory LRU cache keyed by `(path, sorted params)`, TTL half a day (24h for chains). Hours, not minutes: replaying or re-opening the same wallet in a sitting must cost the budget nothing, and a year of history doesn't move in half a day. On a serverless host the cache is best-effort by nature — a cold start starts empty.
- **On 429 with calls left in the day:** exponential backoff at 500ms, 1s, then 2s. After the third wait, give up with `rate_limited`.
- **On 429 with `ratelimit-org-day-remaining: 0`:** return `budget_spent` at once. No backoff, no retry — the day is over, not busy.
- **The client throws nothing an endpoint can cause.** `zerionFetch` returns `ZerionResult<T>`: `{ ok: true, data }`, or `{ ok: false, error }` where `error` is one of `invalid_address` (400, 422), `not_found` (404), `rate_limited` (429 with budget left, after the backoffs), `budget_spent` (429 with the day's budget at zero) or `upstream` (401, 403, 5xx, a network failure, unreadable JSON). Raw upstream messages and bodies never leave the module. An `AbortError` still propagates, because a cancelled call has no result; a missing `ZERION_API_KEY` throws too, because that's a deployment fault, not an upstream failure.
- `budget_spent` is the one failure the UI explains to a visitor: the error state takes a `message` saying the day's data budget is spent and to come back tomorrow. Every other code keeps the generic copy.
- **Server functions pass that result through.** Each one validates first and returns the same vocabulary — a malformed address is `invalid_address` before any call goes out — so a caller never gets an exception to handle. Only successes are cached.
- **Fixtures:** record one real response per endpoint into `src/engine/__fixtures__/` for engine tests. Record only the public demo wallets, and trim each file to the fields the engine reads.
