# The Zerion API key stays on the server

Every Zerion API call goes through a **TanStack Start server function** (`src/server/zerion/`). `ZERION_API_KEY` is read with `process.env` on the server only. Server functions return trimmed, typed data, never whole JSON:API documents and never upstream error messages.

## Considered options

- **Call Zerion from the browser with a `VITE_` key.** Rejected: Vite inlines `VITE_*` values into the client bundle, so the key would be public and the free tier's ~2,000 calls a day could be drained by anyone.
- **A separate API server (Express or Hono).** Rejected: a second deployable for a handful of endpoints. TanStack Start's server functions give the same boundary in one app and one deploy.
- **An edge proxy that only forwards requests with the key added.** Rejected: it hides the key but still ships raw JSON:API payloads to the client, and puts caching and error mapping in the wrong place.

## Consequences

- The client never sees API shapes. The engine gets trimmed data, and the UI gets typed errors (`invalid_address`, `not_found`, `rate_limited`, `upstream`).
- Caching (10-minute TTL) and 429 backoff live in one place, `zerionFetch`.
- `ship-check` greps the client build for the key, so a leak fails the check rather than depending on review.
- Every request adds one hop through our server. That's acceptable for a story that pages through at most 20 requests.
