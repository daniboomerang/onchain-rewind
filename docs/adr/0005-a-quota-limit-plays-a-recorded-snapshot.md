# A quota limit plays a recorded snapshot

When Zerion refuses a Rewind's first page for a quota limit — a rate limit that outlasted the server's backoffs and the page's one retry, or the day's budget spent — the Rewind plays a recorded year of `vitalik.eth` instead of the error state. The run says so with a "Showing a recorded snapshot" note in the chrome for as long as the story plays, and everything in it names the recording's wallet rather than the one the visitor picked. Live data stays the default: the recording is only ever the answer to a refused first page. This reverses the budget-spent error screen, which told the visitor the day's data was spent and to come back tomorrow.

## Considered options

- **Keep the budget-spent screen.** Rejected: the key is on Zerion's free Demo plan — one request a second, 300 a day — and a deep wallet spends 28 of them, so a busy day ends the demo for everyone who arrives after it. A visitor exploring the demo alone would meet a dead end, not the product.
- **Serve everyone recorded data.** Rejected: the product is *your* wallet's year, read live. A recording for everyone would turn it into a video.
- **Cache responses harder.** Rejected as the answer: the server already keeps each response for half a day and the client's query cache does too, so a repeat visit costs nothing. It does nothing for the first visit of a new wallet, which is exactly the one the quota refuses.
- **Fall back to a labelled recording.** Chosen: the recording is the same trimmed `vitalik.eth` data the engine's tests read (`src/engine/__fixtures__/`), trimmed by the server's own pure `trim*` functions, so the engine folds it exactly as it folds a live response, into the same `RewindFacts`. The switch happens inside one run, after the first page fails and before anything is counted, so the reveal never takes a particle back.

## Consequences

- AGENTS.md rule 8 carries its one exception: the recording in `src/engine/__fixtures__/` also serves production, on this fallback only. Re-recording it changes what a quota-limited visitor sees, so it is recorded with the same care as a demo wallet.
- The recording is two pages, about five weeks, beside a full-year chart. The run ends paging there with a page still behind it, so the story is a year cut short: "+" on the counts, "onchain by" on the first card.
- The recording is read as of its own day, 2026-09-27: the window is relative to the instant it ends, so read against the clock it would lose its transactions a day at a time.
- Recorded reads cost no budget, so they are never paced a second apart, and they never go through the client's query cache, where a later live run of the same keys would read them.
- The recording is loaded with a dynamic import, only on the fallback, so no live run downloads its 170 KB of JSON.
- The share image carries a "Recorded snapshot" mark beside the wordmark, because it travels off the site without the chrome's note; the on-screen share card carries the same mark. Settings opened over a recorded run names the recording's wallet and says why.
- The budget-spent error screen is gone from the app and from `/system`. The server's error vocabulary is unchanged — `budget_spent` still tells a spent day from a throttle, which is what spares a spent day its pointless retry.
- A later page failing still ends paging with the year that arrived; it never falls back, because the wallet's own data has already landed. Every other failure — an upstream fault, the timeout, an address Zerion can't read — is still the error state.
