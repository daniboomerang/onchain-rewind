# The development record is read on the server

This app's own build history — how it was built, not what it does — is read live on the server, from the Vinaya log and (in a later change) from GitHub, and folded into a round-by-round record per task plus the guardrail totals. Only that trimmed, aggregated result is ever returned to the client; no raw log event or GitHub API response reaches the browser.

## Considered options

- **Read the log directly from the browser.** Rejected: the log's read token would have to ship in the client bundle, and any visitor could then read the raw event stream — host names, run ids, every finding — with no aggregation in front of it.
- **A periodic snapshot, built at deploy time and checked in or generated as a static file.** Rejected: the record would go stale between deploys, defeating the point of showing how the app is actually being built, and it would need its own regeneration job to stay current.
- **Read on the server.** Chosen: the token stays server-side, the same pattern [ADR-0001](0001-zerion-key-stays-on-the-server.md) already established for the Zerion key, extended to a second upstream. The fold from raw events to the record is pure, the same shape of layering [ADR-0003](0003-pure-engine-between-api-and-ui.md) already uses for Zerion data, so it is tested on fixtures with no network call. An incremental cursor with one shared in-flight read keeps a page load's cost close to zero after the first.

## Consequences

- The Vinaya log's read token (`VINAYA_LOG_READ_TOKEN`) lives beside `ZERION_API_KEY`: read only in `src/server/`, documented in `.env.example`, and never returned by a server function or logged.
- A rejected token and an unreachable log are two distinct results, so a stale local token doesn't get reported as the log being down.
- A failed refresh keeps serving whatever round-by-round record is already held, rather than losing it, since the log is an external service this app doesn't control.
- The equivalent read from GitHub (issues, pull requests, merges) follows the same server-side, pure-fold shape in a later change, and the two sources combine into one development record for the route that shows it.
