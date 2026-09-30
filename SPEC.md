# Onchain Rewind: spec

## 0. Objectives

**Goal:** ship a demo-ready Onchain Rewind. A public URL plays any vetted wallet's last 365 days as the full Rewind (reveal, five cards, share image) on real Zerion data, at production quality (craft, accessibility, performance, clean architecture), built through governed AI agents.

**Success criteria** (the Milestone is done when all of these hold):
1. The deployed URL plays the Rewind end to end for 2 vetted demo wallets, and handles an empty wallet, an invalid address and an API error gracefully.
2. The quality bar in §7 holds: checks, tests and build are green, keyboard and reduced motion work, and the key doesn't appear in the client bundle.
3. `/system` shows every component in every state on fixtures.
4. Every task merged through a PR with Vinaya's gates and a human Test Plan tick.

The milestone that tracks this goal lives on the forge: "Onchain Rewind v1: demo-ready".

## 1. Product

**One line:** your wallet's year, played back.

**Problem:** onchain history is public but unreadable: a long list of hashes and contract calls. People want to understand it and share it.

**For:** crypto wallet users. In a real product this would ship inside a wallet as a year-end moment ("Your 2026 Rewind is ready"), played once. In this demo it autoplays on every load.

**Experience:**
1. **First visit:** the settings dialog opens and can't be dismissed. The user pastes an address or ENS name, or picks a demo wallet. The choice is saved in `localStorage` and treated as the user's connected wallet.
2. **Every load:** the Rewind autoplays.
   - **Reveal:** full-screen particles. Each particle is a real transaction arriving from the API, so the reveal *is* the loading progress. A counter rolls: "Reading 1,284 transactions…". Then particles gather into a ring and burst into card 1.
   - **Five cards, about 5s each:** Origin → Home chain → Top token → The ride → Share. Progress segments at the top.
   - **Controls:** click left/right half (30/70 on mobile), arrow keys, hold or Space to pause.
3. **Gear icon, always visible:** reopens settings. Changing the wallet restarts the Rewind.
4. **Share card:** "Share image" renders a 1200×630 PNG (native share sheet or download), and "Replay" restarts.

**States:** empty wallet, invalid address, API error with retry, reduced motion, and the recorded snapshot: when Zerion is rate-limited or the day's budget is spent, the Rewind plays a recorded `vitalik.eth` year instead of an error, with a small "Showing a recorded snapshot" note (§5). Live data is always the default.

**Platform:** desktop-first web app (1440×900), working down to 390 wide. It's not a native app.

**Theme:** the whole app runs in light or dark, resolved before the first paint so no load flashes the wrong theme. That includes the story: the particle reveal, the five cards, the share card and the share image all follow the setting, and switching it while the story plays turns the story too.

The setting is one choice for the whole app, not one per page: a light/dark control sits in the story chrome next to the settings gear, `/system` carries the same control, and the choice is remembered on this device, so it holds across routes and reloads. Until a choice is made the app follows the operating system.

**Development log** (`/dev-stats`): this project's own development record (CONTEXT.md), shown as a product surface rather than kept off the site — the milestone's progress, five headline numbers, where the time goes between the developer and the reviewers, the guardrail totals, a live "working on it now" line, and every ticket, each expanding to its round-by-round timeline. Read live on the server (ADR-0004) from GitHub and the Vinaya log, on its own polling interval; times render in the viewer's own time zone, from data that only exists on the client. When one of the two sources fails, the page never blanks to an error alone: it still renders everything the other source gives — GitHub failing still shows the Vinaya log's own round activity, time and guardrails, just without ticket titles, status or pull requests; the Vinaya log failing still shows every ticket GitHub gives, just without the round timeline or guardrails — alongside one message naming what's missing and why. Findings are read by reviewer, each line naming its reviewer and listing every severity that reviewer uses ("Code review: 7 blocker · 18 major · …", "Security: 2 high · 12 medium · …"). A cold visit paints the last known record at once, from a snapshot the build baked into the deploy and stamped with the time it was taken, and refreshes live after (ADR-0006). No message on the page names an environment variable, a token or any other server internal: a failure reads as calm copy about what is missing, and its detail goes to the server logs only. Ends with "Made with Vinaya", linking to the tool that governs this build.

## 2. Non-goals (this build)

No WebGL. No signing, swaps or sends. No accounts or backend database. No personality card. No agent or CLI integration. No full wallet UI. Solana is out of scope: `RewindFacts.wallet.address` is EVM (`0x…`).

**Later** (don't build these): a personality card from the transaction mix, a shareable URL `/rewind/<name>` with a server-rendered preview image, an agent skill that returns the facts, and an in-wallet entry point.

## 3. Design input

Everything is in [`design/`](design/): `DESIGN.md` (tokens, components, motion per screen, layout), `tokens.css`, reference components, `types.ts`, `fixtures.ts`, `renderShareImage.ts`, `Playground.tsx`, assets (wordmark, favicon, OG image, title cards), and the reference sheets in `design/reference/`. `types.ts` has been ported: [`src/engine/types.ts`](src/engine/types.ts) is the live `RewindFacts` contract, not `design/types.ts`.

The reference code **typechecks under strict TypeScript** and was verified running in a scratch Vite app. Port it into `src/` and adapt it. Don't import from `design/`. Known issues are in [`design/KNOWN-ISSUES.md`](design/KNOWN-ISSUES.md).

## 4. Architecture

```
Browser                                              Server (TanStack Start)
───────                                              ───────────────────────
routes/index.tsx
  └─ useRewind(address)        ── server fn calls ──▶  server/zerion/*.functions.ts
       ├─ pages transactions one by one                   └─ zerionFetch(): Basic auth, cache, retry
       │    └─ ParticleReveal.addTransactions(n)                └─ https://api.zerion.io/v1/...
       ├─ engine: accumulate(page) → RewindFacts (pure)
       └─ RewindPlayer(facts)
```

**Key decisions** (recorded as ADRs in [`docs/adr/`](docs/adr/)):
1. **The key stays on the server.** Every Zerion call goes through a TanStack Start server function, so the browser never sees the key.
2. **Loading is the animation.** The client pages through transactions and feeds each page's count into `ParticleReveal`. The reveal only completes when the data does (minimum 3.2s, 90s timeout → error). The timeout has to hold a full year at the cap, so it is sized for the 28 requests that year costs at one a second rather than for a typical wallet, which still reaches the story in a few seconds.
3. **The engine is pure and separate from the UI.** Zerion responses → `RewindFacts` in `src/engine/`, unit-tested with recorded fixtures. Components never see raw API data.
4. **The development log reads two upstreams, server-side, the same way.** `/dev-stats` calls two server functions — one folding GitHub's issues, pull requests and comments, one folding the Vinaya log's own round record — because the round-by-round timeline needs the log's unreduced round list, while the ticket list and headline numbers come from GitHub alone. Neither key nor read token reaches the browser (ADR-0004). Only a pull request opened by someone with write access to this repo — the same trust the Vinaya-authored comments already require — is ever folded into a ticket's own record; the tracker is public, so a pull request's body is otherwise as forgeable as a comment's.

## 5. Data mapping (Zerion → `RewindFacts`)

Base URL `https://api.zerion.io`. Auth is HTTP Basic, with the API key as the username and an empty password: `Authorization: Basic base64(KEY + ":")`. Verified against the OpenAPI spec's `APIKeyBasicAuth` scheme (`type: http`, `scheme: basic`, "paste your API key … into the username field and leave the password empty") and the authentication page's own examples (`btoa(apiKey + ':')`) at <https://developers.zerion.io>. Always send `currency=usd` and `filter[trash]=only_non_trash` where supported.

| `RewindFacts` field | Source | Rule |
|---|---|---|
| `wallet.address` | input, or ENS resolution | Zerion does **not** resolve ENS. Resolve on the server with viem `getEnsAddress` on mainnet. Demo wallets store their resolved address. |
| `wallet.name` | input | The ENS name if the user typed one, otherwise missing. |
| `txCount` | `GET /v1/wallets/{a}/transactions/` | Count of non-trash transactions in the window (below). |
| `firstTx`, `daysOnchain` | transactions | **Verified:** the endpoint has no ordering parameter at all — Zerion returns transactions newest-first only. (`sort` exists on positions, NFT collections and the fungibles list; the transactions endpoint takes `page` and `filter[…]` and nothing else.) So `firstTx` is the **oldest transaction within the window**, and card 1's kicker reads "It started on" — or "Onchain by", where the year was cut short and the window was never reached (above). `daysOnchain` counts whole UTC days from that date to `now`, both ends included, so a wallet whose first transaction landed today has one day onchain. A wallet with no transactions in the window has neither: `firstTx` is missing and `daysOnchain` is `0`. |
| `chains[]`, `chainCount` | transactions + `GET /v1/chains/` | Group transactions by chain id, most transactions first, ties keeping the order the year introduced them in. Share is a whole percentage of the transactions that named a chain, rounded by largest remainder so the shares total exactly 100. Names and icons come from `/v1/chains/`, cached for 24h; a chain the list doesn't carry keeps its id as its name. |
| `topToken` | transactions + `GET /v1/fungibles/{id}` | Most frequent fungible across `trade` operations. Fall back to transfers if there are no trades. `timesTraded` counts those transactions, a fungible counting once per transaction however many transfers carry it. Equal counts go to the higher USD transfer volume, then alphabetically by symbol. `changePct`: **verified** — `data.attributes.market_data.changes.percent_365d`, the fungible's price change over the last year in percent (market data, not the price chart), so the copy reads "past year". It is nullable: when Zerion has no yearly change — or when the fungible fetched back isn't the one the transactions named — `topToken` is left out and card 3 hides rather than showing a made-up number. |
| `balance` | `GET /v1/wallets/{a}/charts/year` | **Verified:** the period is the `year` value of the `chart_period` enum — one point per day over the last 365 days (366 points, `begin_at` and `end_at` exactly a year apart). `points` are `[unix seconds, value]` tuples, oldest first, counting simple token and native-coin balances. `series` becomes daily points, `high`/`low` are max/min points of the series, `current` is the last value, and `changePct` compares first and last, to one decimal. Fewer than two points — or a first point of `0`, where a change has no meaning — leaves `balance` out and hides card 4. |

**Window:** the last 365 days (`filter[min_mined_at]`). **Cap:** page size 100, at most 25 pages (2,500 transactions).

**A year cut short.** Paging can stop before the window is exhausted: at the cap, or on a page that fails for good after earlier pages have landed (below). Either way the facts describe the newest slice of the year rather than all of it, so every figure counted off them is a lower bound and every screen says so. The reveal's counter, the share card and the share image write the transaction count with a "+" — "2,500+" at the cap, "1,600+" where a page failed — and the counter's live region announces "at least" rather than the bare figure, because a "+" is not something a screen reader reads.

The oldest transaction that happened to arrive is never presented as the day the wallet's year started, because it is not: it is only the oldest one paging reached. Card 1's kicker and the share card's fourth label read "onchain by" instead of "It started on" and "onchain since", over the same date, and the days-onchain figure carries the same "+". A complete year is unchanged: the counts are exact, the kicker reads "It started on", and the label reads "onchain since".

**Pacing and the timeout:** every request one run makes — each page, and each of the three reads that resolve once — goes out at least a second after the one before it, because the key's plan allows one request a second and a burst of two is throttled whatever the two are. One per-run scheduler reserves those slots, so the chain list and the balance chart queue behind the first page rather than firing alongside it: the reveal starts counting on page one. A wallet at the cap therefore costs 28 paced requests, close to thirty seconds of wall clock; a run that hasn't produced its facts within 90s is the error state, which leaves room for an upstream twice as slow. The reveal keeps counting the pages that have landed throughout.

**A page that fails:** it is asked for once more, half a second later, because a throttled page and the 500 Zerion returns for some deep pages of a very active wallet both usually answer on the next attempt. If it fails again, what happens depends on how far the year got: the **first** page failing is the error state (unless it failed as a rate limit or a spent budget, which plays the recorded snapshot below), while a **later** page failing ends paging there and the Rewind plays the year that did arrive, marked the same way the cap marks it. A counted year is worth more than a perfect one.

**Budget:** the key's organization is on Zerion's free **Demo plan**, and its limits are the plan's own, read from the response headers (`ratelimit-org-tier: demo`, `ratelimit-org-second-limit: 1`, `ratelimit-org-day-limit: 300`): **one request a second, and 300 a day**. One Rewind of a wallet at the cap spends 28 of them, so the day holds around ten.
- Keep an in-memory server cache per `(address, endpoint, params)` with a TTL of half a day — hours, not minutes, so replaying or re-opening a wallet the same day costs no new requests. The window is 365 days long, so nothing on a card reads differently for the drift.
- On the client, TanStack Query uses the same `staleTime` of half a day.
- On 429 with calls left in the day, retry with exponential backoff (at most 3 tries).
- **When the day's budget is spent** the API answers 429 with `ratelimit-org-day-remaining: 0`, and `ratelimit-org-day-reset` counts the seconds until it comes back; no retry helps before then. That is its own failure, not a throttle, and it is never retried.
- **The recorded snapshot** (ADR-0005). When the first page of a run fails as either of those two — a throttle that outlasted its backoffs and the one retry above, or a spent day, which is never retried — the run does not end on the error state: it plays the Rewind from recorded `vitalik.eth` data (the trimmed Zerion responses in `src/engine/__fixtures__/`), with a small "Showing a recorded snapshot" note visible for as long as the story plays. The recording holds two pages of transactions, about five weeks of activity, beside a full year balance chart, so a recorded run ends its paging there and is marked as a year cut short: the counts carry a "+" and the first card reads "onchain by", never "It started on". The story names the wallet the recording belongs to, not the wallet the visitor picked. The recording is read as of the day it was made, not the clock, so its counts never drift; it costs no budget and needs no pacing. Live data stays the default: the snapshot exists only for a run that could not begin. A later page failing keeps its rule above (the year that arrived plays, marked with a "+"), and every other failure — an upstream fault, the timeout, an invalid address — keeps the error state.

## 6. Demo wallets

`src/lib/demo-wallets.ts` holds two **real public wallets**, each stored with the address its name resolved to, so a demo pick never waits on ENS. `pranksy.eth` is listed first, so a first visit opens settings with it already chosen:

| Name | Address |
|---|---|
| `pranksy.eth` | `0xD387A6E4e84a6C86bd90C158C6028A58CC8Ac459` |
| `dingaling.eth` | `0x54BE3a794282C030b15E43aE2bB182E14c409C5e` |

Before listing a wallet, check that it produces a good story (enough transactions in the last 365 days, several chains, a balance chart). Never invent names.

## 7. Quality bar (definition of done for the whole build)

- The flow works on real data for both demo wallets, plus an empty wallet and an invalid address.
- Typecheck, lint, tests and build are green.
- No console errors. The key doesn't appear in the client bundle: `grep` the build output for it.
- Reduced motion checked in the browser, and keyboard-only navigation works (including after closing settings; see KNOWN-ISSUES).
- Deployed to a public URL, working on a phone browser.
- `/system` shows every component in every state, in both themes.

## 8. Tasks

The tasks live on the forge, not in this spec: the task Issues on the milestone "Onchain Rewind v1: demo-ready". Each Issue carries its own objectives, surface, dependencies and test plan, and the forge holds its state.

This spec states what the product is and what it must do. It never lists tasks, their numbers, their order or their dependencies: those are plan, and they change every time the plan changes.

**Shared for every task:**
- Follow AGENTS.md and the path rules for the surface.
- Use CONTEXT.md's terms.
- Finish with the `ship-check` skill.
- All runtime and test dependencies are already installed. A task that adds a dependency must say why in its PR, because it touches the lockfile, which is a shared blast-radius domain.

## 9. Post-install setup (after `vinaya quickstart`)

1. **Check the agent config survived install.** `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.claude/skills/` and `.agents/skills/` must sit next to Vinaya's generated files (`.agents/skills/vinaya-*`, `.claude/settings.json`, `.claude/commands/vinaya.md`). In Claude Code, `/context` should list `CLAUDE.md` under memory files.
2. **Add the Zerion docs MCP server** to `.mcp.json` next to Vinaya's entry. Take the endpoint from https://developers.zerion.io/build-with-ai/mcp.md.
3. **Optional:** install Zerion's agent skill from `zeriontech/zerion-ai` for wallet-analysis context.
4. **The API key, for local dev and for agents:**
   - For local dev, put `ZERION_API_KEY=…` in `.env.local`. It's entered by the human and never committed.
   - **Vinaya's agents work in fresh git worktrees, which contain no `.env.local`.** Before `vinaya task run`, export it instead: `export ZERION_API_KEY=…` in the shell that launches the run, since server functions read `process.env`.
   - On the first run, confirm the developer agent actually sees the variable.
   - CI needs no key, because tests use recorded fixtures and mocked `fetch`.
5. **Update the global CLI:** `npm install -g @attalabs/vinaya@latest`, then run `vinaya doctor`.
6. **Doc-coverage bindings** in `.vinaya/doc-owners` (Vinaya-managed; append below its header). Bind only contract files, so ordinary PRs don't owe a doc edit:
   ```
   src/engine/types.ts        SPEC.md
   src/styles/tokens.css      design/DESIGN.md
   biome.json                 AGENTS.md
   .github/workflows/checks.yml  AGENTS.md
   ```
7. **One registered project:** the installed config requires a `Project:` field on every task Issue and PR, so the repo registers a single project, `rewind` (path `.`), with `vinaya init product rewind --path .`. Every task Issue declares `**Project:** rewind`.

## 10. Decisions

Settled, so the Planner doesn't stop to ask:
- **Deploy target:** Vercel (TanStack Start supports it; the key goes in Vercel's environment variables).
- **Network scope:** EVM only (`0x` addresses). No Solana.
- **ENS:** resolved on the server with viem on mainnet through its default public transport. If resolution fails, show the invalid state and suggest pasting an address. Demo wallets store their resolved address, so they never depend on ENS at runtime.
- **Window:** the last 365 days, capped at 2,500 transactions.

Open, to verify during the Zerion server work (research, not a Principal decision; record the answers in §5): none left. All four are answered, against the OpenAPI spec at <https://developers.zerion.io> (`openapi: 3.0.3`, `info.version: 1.0.0`) and a live response for `vitalik.eth`:
1. ~~The exact Basic-auth header format.~~ **Answered:** `Authorization: Basic base64(KEY + ":")` — the key is the username, the password is empty. Recorded in §5.
2. ~~The enum value of the year chart period.~~ **Answered:** `year` — `GET /v1/wallets/{address}/charts/year`, one point per day over the last 365 days. Recorded in §5.
3. ~~Whether transactions can be fetched oldest-first.~~ **Answered: no.** The transactions endpoint has no ordering parameter, so the order is newest-first and `firstTx` is the oldest transaction in the window, not the lifetime one. Card 1's kicker reads "Your year started on". Recorded in §5.
4. ~~Where the fungible's yearly price change comes from.~~ **Answered:** market data — `data.attributes.market_data.changes.percent_365d` on `GET /v1/fungibles/{id}`, not the price chart. It is nullable, and a missing value hides card 3. Recorded in §5.

Open, for the Principal: none. The plan can proceed.

**Principal actions, not decisions** (tasks stop and ask when they reach these):
- Create a free Zerion API key and make it available (§9 step 4), before the Zerion server work starts.
- Create and link a Vercel project and set `ZERION_API_KEY` in its environment variables, before the deploy.
- Tick each PR's Test Plan after checking it in the browser.
- Before the first agent build, confirm in the Vercel project's settings that Deployment Protection is on and "auto-assign custom production domains" is off.
- Keep Deployment Protection on for the Vercel project and "auto-assign custom production domains" off, so an unaliased agent build never takes the live domain, and scope `GITHUB_TOKEN` (read-only access to public repository data) and `VINAYA_LOG_READ_TOKEN` (read-only) to the environments the build runs in, and no wider.

