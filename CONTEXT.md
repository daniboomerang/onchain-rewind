# Onchain Rewind

A web app that plays a wallet's onchain year back as an animated story, built on the Zerion API. This document fixes the language used across the codebase, the specs and the PRs. Use these terms exactly, and avoid the listed alternatives.

## Language

### The experience

**Rewind**: The whole experience for one wallet: reveal, five cards, share. It autoplays on every load in this demo. _Avoid_: Wrapped, recap, summary, story (as a noun for the whole thing)

**Reveal**: The opening particle sequence, driven by real data. Phases: scatter → gather → hold → burst. One particle is one real transaction. See [ADR-0002](docs/adr/0002-loading-is-the-animation.md). _Avoid_: Intro, loader, splash, loading screen

**Card**: One step of the Rewind after the reveal. There are exactly five, in order: **Origin**, **Home chain**, **Top token**, **The ride**, **Share**. _Avoid_: Slide, page, step, screen

**Share card**: The fifth card and the 1200×630 image rendered from it. _Avoid_: Summary card, poster

**Chrome**: The persistent UI over the cards: progress segments, wordmark, wallet name, gear. _Avoid_: Header, toolbar, overlay

### Data

**RewindFacts**: The single UI data contract (`src/engine/types.ts`). It's the only shape components read. _Avoid_: Stats, wallet data, response, model

**Engine**: The pure layer in `src/engine/` that turns Zerion data into `RewindFacts`. No I/O. See [ADR-0003](docs/adr/0003-pure-engine-between-api-and-ui.md). _Avoid_: Service, parser, transformer, analytics

**Window**: The period the Rewind covers: the last 365 days before `now`. _Avoid_: Year (in code), range, period

**Cap**: The paging limit: 20 pages of 100, which is 2,000 transactions. When it's hit, figures show "2,000+". _Avoid_: Limit, max (unqualified)

**Recorded snapshot**: The recorded year of `vitalik.eth` a Rewind plays when Zerion refuses its first page for a quota limit (a rate limit, or the day's budget spent), with a "Showing a recorded snapshot" note in the chrome. Read as of its own day and marked as a year cut short. See [ADR-0005](docs/adr/0005-a-quota-limit-plays-a-recorded-snapshot.md). _Avoid_: Demo data, sample data, mock, cached data, offline mode

**Home chain**: The chain with the largest share of the wallet's transactions in the window. _Avoid_: Main chain, favourite chain, primary network

**Share (of a chain)**: A chain's transactions ÷ `txCount` × 100, rounded by largest remainder so all shares total exactly 100. _Avoid_: Percentage, ratio, weight

**Top token**: The fungible that appears in the most trades in the window (transfers are the fallback). _Avoid_: Favourite token, main asset

**The ride**: The portfolio's balance series over the window, with its **high** and **low**, which are real points of the series. _Avoid_: Chart, performance, PnL (PnL is a different Zerion endpoint)

### Wallet

**Wallet**: The address the Rewind is about, set in settings and treated as the user's connected wallet. _Avoid_: Account, user, profile

**Demo wallet**: A real public wallet listed in `src/lib/demo-wallets.ts` after vetting. Never invented. _Avoid_: Sample wallet, test wallet, fake wallet

### The build itself

**Development record**: How this app was built, shown on the site: each task's round-by-round record (developer time, reviewer time, outcome, size, confidence, findings) and the guardrail totals (checks run, checks that stopped a change), read from GitHub and the Vinaya log. See [ADR-0004](docs/adr/0004-the-development-record-is-read-on-the-server.md). _Avoid_: Changelog, activity log, audit trail

**Development log**: The `/dev-stats` page that shows the development record: the milestone's progress, its headline numbers, where the time goes, the guardrails and every ticket. _Avoid_: Dashboard, admin panel, console, build log

**Ticket**: One row of the development log — a milestone task, with its status, time, rounds, size, problems and pull request. A ticket is never a **card** (that word is reserved for the Rewind's five). _Avoid_: Task (the code's own name for the underlying record; the page's own word is ticket), row, item

**Round**: One back-and-forth of the developer and the reviewers within a ticket, ended by a verdict or a request for changes. A round whose number repeats is a re-review, most often after a human ruling. _Avoid_: Loop, iteration, pass, cycle

## Decisions

- [ADR-0001](docs/adr/0001-zerion-key-stays-on-the-server.md): The Zerion API key stays on the server
- [ADR-0002](docs/adr/0002-loading-is-the-animation.md): Loading is the animation
- [ADR-0003](docs/adr/0003-pure-engine-between-api-and-ui.md): A pure engine between the API and the UI
- [ADR-0004](docs/adr/0004-the-development-record-is-read-on-the-server.md): The development record is read on the server
- [ADR-0005](docs/adr/0005-a-quota-limit-plays-a-recorded-snapshot.md): A quota limit plays a recorded snapshot
