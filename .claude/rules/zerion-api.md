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
- Pace it: consecutive page requests go out at least `PAGE_INTERVAL_MS` apart (`src/lib/useRewind.ts`), so a wallet at the cap stays under the free tier's ten-requests-a-second burst limit. A throttled page fails the whole run, so the pacing is what buys the cap back.

## Limits, caching, errors
- The free tier allows about 2,000 calls a day and 10 requests a second.
- Keep an in-memory LRU cache keyed by `(path, sorted params)`, TTL 10 minutes (24h for chains).
- **On 429:** exponential backoff at 500ms, 1s, then 2s. After the third wait, give up.
- **The client throws nothing an endpoint can cause.** `zerionFetch` returns `ZerionResult<T>`: `{ ok: true, data }`, or `{ ok: false, error }` where `error` is one of `invalid_address` (400, 422), `not_found` (404), `rate_limited` (429, after the backoffs) or `upstream` (401, 403, 5xx, a network failure, unreadable JSON). Raw upstream messages and bodies never leave the module. An `AbortError` still propagates, because a cancelled call has no result; a missing `ZERION_API_KEY` throws too, because that's a deployment fault, not an upstream failure.
- **Server functions pass that result through.** Each one validates first and returns the same vocabulary — a malformed address is `invalid_address` before any call goes out — so a caller never gets an exception to handle. Only successes are cached.
- **Fixtures:** record one real response per endpoint into `src/engine/__fixtures__/` for engine tests. Record only the public demo wallets, and trim each file to the fields the engine reads.
