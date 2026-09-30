# The development log paints a build-time snapshot first

`/dev-stats` reads the development record live on the server ([ADR-0004](0004-the-development-record-is-read-on-the-server.md)), and on a cold serverless instance that read takes 15 to 20 seconds, all of it a loader. The build now reads the record once through the same server readers and bakes the result into the deploy; a cold visit paints that snapshot at once, stamped with the time it was taken, and the live read replaces it after. This reverses ADR-0004's rejection of a deploy-time snapshot: the rejection assumed the snapshot would be all the page had, and it would go stale between deploys.

## Considered options

- **Live read only, as before.** Rejected: a reviewer arriving alone waits half a minute on a spinner.
- **Cache headers so the host's edge serves the last response.** Rejected: nothing guarantees an edge entry survives a quiet day, so a cold visit can still wait for the whole read.
- **A persistent store holding the last good record.** Rejected: it meets the target but adds a dependency and a setup step for a page that only needs a first paint.
- **A build-time snapshot, then the live read.** Chosen: no new infrastructure, a paint in under two seconds, and staleness limited to the time since the last deploy, which every merge resets.

## Consequences

- The build needs read access to both sources. If it cannot read either, the build still passes and the page falls back to its loader.
- The snapshot is generated, gitignored and never committed, and holds no token and no raw upstream body.
- The page says when the snapshot was taken, so it never overstates that the record is read live.
- A failed live read keeps the snapshot on screen rather than replacing it with an error.
