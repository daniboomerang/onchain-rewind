# Loading is the animation

The particle reveal is driven by real data. The client pages through the wallet's transactions and calls `ParticleReveal.addTransactions(n)` for each page, so **one particle is one real transaction**. The reveal can only finish (`complete(finalCount)`) when paging does, with a 3.2s minimum so it never flashes, and a 12s timeout that leads to the error state.

## Considered options

- **Spinner or skeleton, then the story.** Rejected: loading takes seconds for active wallets, and a spinner makes that time dead. The wait is the one moment every user sees.
- **A decorative intro on a fixed timer.** Rejected: it lies about progress. It either ends before the data is ready (and needs a second loader) or makes fast wallets wait.
- **Fetch everything, then animate.** Rejected: it's the slowest path to first pixel, and the counter would jump from 0 to N with nothing in between.

## Consequences

- Perceived performance improves without the data arriving any faster. The counter and particle density show real progress.
- The data layer has to stream pages (`getTransactionsPage` + `links.next`) instead of returning one blob. That's why the engine accumulates incrementally ([ADR-0003](0003-pure-engine-between-api-and-ui.md)).
- Reduced motion replaces the canvas with a static counter that still reflects real progress.
- Very large wallets are capped at 20 pages (2,000 transactions). The reveal and share card say "2,000+" rather than pretending to be complete.
