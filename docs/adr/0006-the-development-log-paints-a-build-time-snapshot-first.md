# The development log paints a build-time snapshot first

The build reads the development record once, through the same two server readers the live page calls, and writes it as the development snapshot, a file the deploy carries in its server bundle. A cold visit to `/dev-stats` paints that snapshot from the server's own markup, with a line saying when it was taken, and the page's live reads replace it in place once both answer. The live read itself is unchanged.

This reverses the rejection of "a periodic snapshot, built at deploy time" in [ADR-0004](0004-the-development-record-is-read-on-the-server.md), which rested on two reasons. It would go stale between deploys: here the live read replaces it, so staleness only ever lasts one first paint, and the page says how old it is. It would need its own regeneration job: here the build is the regeneration, on every deploy, and every merge redeploys. ADR-0004's choice of a server-side live read stands.

## Considered options

- **Live only.** Rejected: a cold serverless instance holds nothing, so the first visit re-reads GitHub (two calls per pull request, one after another) and shows 15 to 20 seconds of loader. A reviewer arriving alone meets an empty page. The server's disk cache can't help, because `/tmp` doesn't persist between Vercel invocations.
- **Edge cache headers.** Rejected: the first visitor after each expiry still pays the full read, and a page polled every few seconds would either serve stale responses or bypass the cache.
- **A persistent store.** Rejected: a database or key-value store to hold one record adds a service, credentials and a writer for data the build can already read. It is more than a portfolio demo's first paint needs.
- **A build-time snapshot, then the live read.** Chosen: the build already runs on every deploy and can read both sources, and the readers already produce exactly the record the page shows.

## Consequences

- `bun run build` runs `src/server/github/write-dev-snapshot.ts` before `vite build`. It calls `readDevRecord` and `readGithubDevRecord`, never a second mapping, so the snapshot cannot drift from the live record.
- The build needs read access to both sources: `VINAYA_LOG_READ_TOKEN` and `GITHUB_TOKEN`, the same read-only tokens the runtime uses, with no wider scope. Without them, or with a source rate limited or unreachable, the build still passes, writes no snapshot (and removes a stale one), and the page shows its loader as before.
- The build's log line names the source and its status only, as the runtime clients' own lines do: never a token, an error object, a URL or a header, because everyone with access to the team can read a build log.
- The snapshot is generated, gitignored and never under `public/`. Vite bundles it into the server output, and only a server function reads it, so it reaches the browser only as the page's own loader data. It holds the mapped record and the moment it was taken, never a token or a raw upstream body. The `ship-check` skill greps it and the client bundle for both tokens.
- The page says when the snapshot was taken. The server prints that time in UTC, and the browser switches it to the viewer's own zone after hydration, so the markup never mismatches. The snapshot's "working on it now" line is left out, because it was only true when the build ran.
- A failed live read keeps the snapshot on screen and says so. The poll interval and the live reads are unchanged, and the snapshot adds no GitHub read at runtime.
- The snapshot is as fresh as the last deploy, not a store: nothing writes it between deploys.
