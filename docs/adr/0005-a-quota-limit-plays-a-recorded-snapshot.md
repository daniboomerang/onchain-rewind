# A quota limit plays a recorded snapshot

When Zerion is rate-limited or the day's data budget is spent, the first page of a run fails, and instead of ending on an error the Rewind plays a recorded `vitalik.eth` year with a small "Showing a recorded snapshot" note. Live data stays the default. This reverses the earlier rule that a spent budget ends on its own error screen: a visitor exploring the deployed demo alone, on the free Demo plan's 300 requests a day, must always see a working Rewind first.

## Considered options

- **Keep the error screen for a spent budget.** Rejected: honest, but it is the first thing a reviewer sees on a busy day, and there is nothing to do about it until tomorrow.
- **Serve every visitor recorded data.** Rejected: the demo's point is real onchain history read live, and a snapshot for everyone would hide that the live path works.
- **Cache live responses on disk or in a store to ride out a spent day.** Rejected: it only helps wallets already read that day, and needs a persistent store the serverless host does not provide.
- **Fall back to a recording, labelled, only for a run that could not begin.** Chosen: the demo never fails on a quota, live data is used whenever the API answers, and the label keeps it honest.

## Consequences

- The recorded fixtures now ship to production, so AGENTS.md's rule that fixtures stay in tests and on `/system` carries this one exception. They load only on the fallback, in their own chunk.
- The fallback fires only when the first page fails as rate-limited or budget-spent. A later page failing keeps the partial year marked with a "+", and an upstream fault, the timeout or an invalid address keep the error state.
- The recording is read as of the day it was made, so its counts never drift, and it needs no pacing because it costs no budget.
- The story names the wallet the recording belongs to, never the wallet the visitor picked.
- The dedicated budget-spent screen has no way to be reached and is removed. The server's error codes are unchanged.
