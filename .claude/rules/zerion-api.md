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
| Transactions | `GET /v1/wallets/{address}/transactions/` | Paginated by following `links.next` exactly as returned; don't build cursors yourself — pass the absolute URL straight to `zerionFetch`, which accepts one. Filters: `filter[min_mined_at]`, `filter[max_mined_at]`, `filter[chain_ids]`, `filter[operation_types]`, `filter[trash]`. Page size: `page[size]` (use 100). |
| Balance chart | `GET /v1/wallets/{address}/charts/{period}` | Use the year period. Confirm the exact enum value in the OpenAPI spec. |
| Chains | `GET /v1/chains/` | Names and icons. Cache for 24h. |
| Fungible | `GET /v1/fungibles/{id}` | Name, symbol, icon, market data. |
| Portfolio / positions / PnL | `/v1/wallets/{a}/portfolio`, `/positions/`, `/pnl` | Not needed for v1. Don't add them without updating SPEC.md. |

The OpenAPI spec is at `https://developers.zerion.io/openapi-v1.yaml`, and the docs index is at `https://developers.zerion.io/llms.txt`. **Before relying on a field, confirm it** via the MCP server or the spec. Never guess field names.

## Paging contract (what the client relies on)
`getTransactionsPage({ address, next? }) → { items: TxLite[], next: string | null, count: number }`
- The client calls it in a loop, feeding `count` to `ParticleReveal.addTransactions`.
- Stop when `next` is null, when the window is exhausted, or at the cap of 20 pages (2,000 transactions). Report `capped: true`.
- Honour `AbortSignal`: a wallet change cancels the loop.

## Limits, caching, errors
- The free tier allows about 2,000 calls a day and 10 requests a second.
- Keep an in-memory LRU cache keyed by `(path, sorted params)`, TTL 10 minutes (24h for chains).
- **On 429:** exponential backoff at 500ms, 1s, then 2s. After 3 failures, throw `RateLimitedError`.
- **Map errors to typed results** the UI can render: `invalid_address`, `not_found`, `rate_limited`, `upstream`. Raw upstream messages never reach the UI.
- **Fixtures:** record one real response per endpoint into `src/engine/__fixtures__/` for engine tests. Record only the public demo wallets, and trim each file to the fields the engine reads.
