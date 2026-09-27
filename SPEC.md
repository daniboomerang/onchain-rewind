# Onchain Rewind: spec

## 0. Objectives and milestone

**Goal:** ship a demo-ready Onchain Rewind. A public URL plays any vetted wallet's last 365 days as the full Rewind (reveal, five cards, share image) on real Zerion data, at production quality (craft, accessibility, performance, clean architecture), built through governed AI agents.

**Success criteria** (the Milestone is done when all of these hold):
1. The deployed URL plays the Rewind end to end for 3 vetted demo wallets, and handles an empty wallet, an invalid address and an API error gracefully.
2. The quality bar in §7 holds: checks, tests and build are green, keyboard and reduced motion work, and the key doesn't appear in the client bundle.
3. `/system` shows every component in every state on fixtures.
4. Every task merged through a PR with Vinaya's gates and a human Test Plan tick.

**Milestone** (for the Architect):
- **Title:** Onchain Rewind v1: demo-ready
- **Release:** 0.1.0
- **Tranche intents:**
  - rewind-v1: Build the Rewind end to end: design system and playground, Zerion server layer, pure engine, settings and wallet, the live flow, share image and deploy (SPEC.md §8 tasks 1–6).

One tranche on purpose. The eleven tasks form a single dependency graph, and splitting them into several tranches would add archive and plan cycles to a one-day build.

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

**States:** empty wallet, invalid address, API error with retry, reduced motion.

**Platform:** desktop-first web app (1440×900), working down to 390 wide. It's not a native app.

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
2. **Loading is the animation.** The client pages through transactions and feeds each page's count into `ParticleReveal`. The reveal only completes when the data does (minimum 3.2s, 12s timeout → error).
3. **The engine is pure and separate from the UI.** Zerion responses → `RewindFacts` in `src/engine/`, unit-tested with recorded fixtures. Components never see raw API data.

## 5. Data mapping (Zerion → `RewindFacts`)

Base URL `https://api.zerion.io`. Auth is HTTP Basic, with the API key as the username and an empty password. Confirm this through the Zerion MCP or docs before coding. Always send `currency=usd` and `filter[trash]=only_non_trash` where supported.

| `RewindFacts` field | Source | Rule |
|---|---|---|
| `wallet.address` | input, or ENS resolution | Zerion does **not** resolve ENS. Resolve on the server with viem `getEnsAddress` on mainnet. Demo wallets store their resolved address. |
| `wallet.name` | input | The ENS name if the user typed one, otherwise missing. |
| `txCount` | `GET /v1/wallets/{a}/transactions/` | Count of non-trash transactions in the window (below). |
| `firstTx`, `daysOnchain` | transactions | **Verify first:** does the transactions endpoint support ascending order? If yes, fetch the oldest transaction (lifetime). If not, use the oldest transaction within the window and change card 1's kicker to "Your year started on". Record the decision here. |
| `chains[]`, `chainCount` | transactions + `GET /v1/chains/` | Group transactions by chain id. Share is a percentage of `txCount`. Names and icons come from `/v1/chains/`, cached for 24h. |
| `topToken` | transactions + `GET /v1/fungibles/{id}` | Most frequent fungible across `trade` operations. Fall back to transfers if there are no trades. `timesTraded` counts those transactions. `changePct`: the fungible's price change over the window, from its chart or market data. Label the copy to match whichever source is used. |
| `balance` | `GET /v1/wallets/{a}/charts/{period}` | Year period. `series` becomes daily points, `high`/`low` are max/min points of the series, `current` is the last value, and `changePct` compares first and last. |

**Window:** the last 365 days (`filter[min_mined_at]`). **Cap:** page size 100, at most 20 pages (2,000 transactions). If the cap is hit, the counter and share card say "2,000+".

**Budget:** the free key allows about 2,000 calls a day and 10 requests a second.
- Keep an in-memory server cache per `(address, endpoint, params)` with a 10-minute TTL.
- On the client, TanStack Query uses `staleTime` of 10 minutes.
- On 429, retry with exponential backoff (at most 3 tries), then show the error state.

## 6. Demo wallets

`src/lib/demo-wallets.ts` holds `vitalik.eth` plus two more **real public wallets**. Before listing a wallet, check that it produces a good story (enough transactions in the last 365 days, several chains, a balance chart). Never invent names.

## 7. Quality bar (definition of done for the whole build)

- The flow works on real data for all three demo wallets, plus an empty wallet and an invalid address.
- Typecheck, lint, tests and build are green.
- No console errors. The key doesn't appear in the client bundle: `grep` the build output for it.
- Reduced motion checked in the browser, and keyboard-only navigation works (including after closing settings; see KNOWN-ISSUES).
- Deployed to a public URL, working on a phone browser.
- `/system` shows every component in every state.

## 8. Tasks (tranche `rewind-v1`)

Each task is one PR and one GitHub Issue. The Planner cuts the Issues from this section. The fields map onto its rationale:

| Field | Meaning |
|---|---|
| **Objective** | the outcome the task delivers |
| **Surface** | the file globs it may touch |
| **Boundary** | what's in and what's explicitly out |
| **Done when** | the acceptance bar and test plan |
| **Traps** | known pitfalls |
| **Stop if** | when to stop and ask instead of improvising |
| **Docs to keep coherent** | docs the task must update if it changes their subject |
| **Agent** | the capabilities the task needs |

**Dependency graph:** eleven small tasks, each aimed at a PR of about 600 lines or less.

Waves, if every task merges before the next wave starts:
1. 1a ∥ 2a
2. 1b, then 1c (they conflict) ∥ 2b
3. 1d ∥ 3 ∥ 4
4. 5a
5. 5b
6. 6

- 1b and 1c both need only 1a, but both add sections to `src/routes/system.tsx`, so they conflict and run one after the other.
- 1d needs 1b (the story components `RewindPlayer` imports) and 1c (the `/system` full-screen flow plays the reveal into the player).
- 2b needs 2a (the client its server functions call).
- 3 needs 1a (`RewindFacts` in `src/engine/types.ts`) and 2b (the trimmed Zerion shapes in `src/engine/zerion.ts`, the recorded fixtures, and the §10 answer that decides `firstTx`).
- 4 needs 1a (SettingsDialog, WalletCombobox and IconButton) and 2b (the ENS server function).
- 5a needs 2b and 3. It reports progress through callbacks, so it doesn't need the reveal.
- 5b needs 1c, 1d, 4 and 5a. 6 needs 5b.
- Critical path: 2a → 2b → 3 → 5a → 5b → 6.

**Shared for every task:**
- Follow AGENTS.md and the path rules for the surface.
- Use CONTEXT.md's terms.
- Finish with the `ship-check` skill.
- All runtime and test dependencies are already installed. A task that adds a dependency must say why in its PR, because it touches the lockfile, which is a shared blast-radius domain.

### 0. Scaffold (done)
Bootstrap commit, before any Vinaya task: TanStack Start, Tailwind v4 tokens, fonts, Biome, Vitest with happy-dom and Testing Library, CI checks, and the pinned stack.

### 1. Design system foundation

Split into four tasks so each PR stays small. `/system` grows with each one, so every PR has a browser check. Shared for 1a–1d:
- **Traps:** the Biome ban fails any `@ariakit/react` import outside `src/components/ui/`. `design/` is read-only, except KNOWN-ISSUES. The canvas, `matchMedia`, `document.fonts` and `navigator.share` are client-only (SSR). `src/routeTree.gen.ts` is generated: commit it, never edit it.
- **Stop if:** a design component can't meet the strict TS settings without changing its props contract. Ask before changing `RewindFacts` or any component API in DESIGN.md.
- **Docs to keep coherent:** `design/DESIGN.md` if any prop changes.
- **Out, for all four:** any API call, real data, the `/` route, and the engine logic.

#### 1a. Primitives, contract and `/system`
- **Objective:** the Ariakit layer, the `RewindFacts` contract and the fixtures live in `src/`, and `/system` shows the primitives.
- **Surface:** `src/components/ui/**`, `src/components/rewind/motion.ts`, `src/engine/types.ts`, `src/engine/fixtures.ts`, `src/routes/system.tsx`, `src/routeTree.gen.ts`.
- **In:** Button (with Spinner), IconButton, Tooltip, WalletCombobox and SettingsDialog in `src/components/ui/`. `motion.ts` in `src/components/rewind/`, because Button imports its timings. `types.ts` (with the `TopToken.changePct` comment corrected to "price change over the window", matching §5; the type itself doesn't change) and `fixtures.ts`. The `/system` route with the Button, Tooltip, WalletCombobox and SettingsDialog sections of `design/Playground.tsx`.
- **Done when:** `/system` renders those sections with no console errors, and `check`, `test` and `build` are green.
- **Agent:** frontend (React, Ariakit) with browser verification.

#### 1b. Story components
- **Objective:** every story component runs on fixtures, and `/system` shows each one in every state.
- **Surface:** `src/components/rewind/**` (except `motion.ts`, `ParticleReveal.tsx` and `RewindPlayer.tsx`), `src/lib/renderShareImage.ts`, `src/routes/system.tsx`.
- **In:** ProgressSegments, StatNumber, StoryCard (with StoryStage), StoryChrome, ChainBar, ChainIcon, TokenIcon, LineChart, ShareCard, EmptyState, ErrorState, and `renderShareImage.ts` → `src/lib/`. Their `/system` sections.
- **Done when:** each section renders in every state with no console errors, paused tweens freeze and resume, and `check`, `test` and `build` are green.
- **Agent:** frontend (React, Motion) with browser verification.

#### 1c. Particle reveal
- **Objective:** the Canvas 2D reveal runs on `/system`, driven by fixture counts, through gather, burst, fail and reduced motion.
- **Surface:** `src/components/rewind/ParticleReveal.tsx`, `src/routes/system.tsx`.
- **In:** ParticleReveal with its imperative handle (`addTransactions`, `complete`, `fail`), and a `/system` section that drives it with fixture counts, including a failing run.
- **Done when:** the reveal gathers, bursts and fails on `/system`, reduced motion shows the static counter, and `check`, `test` and `build` are green.
- **Agent:** frontend (Canvas 2D, performance) with browser verification.

#### 1d. Player and keyboard fix
- **Objective:** the full `RewindPlayer` plays each fixture on `/system`, and the arrow keys work even when a button has focus.
- **Surface:** `src/components/rewind/RewindPlayer.tsx`, `src/routes/system.tsx`, `design/KNOWN-ISSUES.md`.
- **In:** RewindPlayer (navigation, pause, share and replay). The `/system` "Full screens" section (the reveal played into the player for each of the 3 fixtures, plus a failing run into ErrorState). Fix KNOWN-ISSUES #1.
- **Done when:** the full screens play each fixture with no console errors, a component test (happy-dom) focuses the gear, presses →, and sees the card advance, `verify-ui` passes its `/system` step, and `check`, `test` and `build` are green.
- **Docs to keep coherent:** `design/KNOWN-ISSUES.md`.
- **Agent:** frontend (React, Motion) with browser verification.

### 2. Zerion server layer

Split into the client and the endpoints. Shared for 2a–2b:
- **Traps:** Zerion doesn't resolve ENS. Follow `links.next` exactly as returned. Verify every field in the OpenAPI spec or the MCP before using it. Worktrees don't contain `.env.local`, so the key must come from the environment (see §9).
- **Stop if:** `ZERION_API_KEY` isn't available in the environment, the auth scheme or an endpoint behaves differently from `.claude/rules/zerion-api.md`, or the free tier can't serve an endpoint the Rewind needs.
- **Docs to keep coherent:** `.claude/rules/zerion-api.md`, and `SPEC.md` §5 and §10.
- **Out, for both:** aggregation logic (task 3), and any UI.

#### 2a. Zerion client
- **Objective:** one server-only client that authenticates, caches, backs off and maps errors to typed results.
- **Surface:** `src/server/zerion/client.ts` and its tests, `SPEC.md` (§5 and §10, question 1).
- **In:** `zerionFetch` (Basic auth, LRU cache keyed by path and sorted params, 10-minute TTL and 24 hours for chains, 429 backoff at 500ms, 1s and 2s, error mapping to `invalid_address`, `not_found`, `rate_limited` and `upstream`, `AbortSignal`). The answer to §10 question 1 (the auth header).
- **Done when:** unit tests with a mocked `fetch` cover auth, caching, a malformed address returning `invalid_address`, and a simulated 429 that retries, then returns `rate_limited`. The key-leak check passes. §10 records question 1.
- **Agent:** backend TypeScript.

#### 2b. Zerion endpoints
- **Objective:** typed, trimmed, server-only access to the Zerion data the Rewind needs.
- **Surface:** `src/server/**` (except `client.ts`), `src/engine/zerion.ts`, `src/engine/__fixtures__/**`, `SPEC.md` (§5 and §10, questions 2–4).
- **In:** server functions for a transactions page (`getTransactionsPage({ address, next? }) → { items, next, count }`), chains, fungible, the year balance chart, and ENS resolve (viem). `src/engine/zerion.ts`: type-only, the trimmed Zerion shapes the server functions return and the engine reads (ADR-0003: knowledge of Zerion shapes lives in `src/engine/`). The server imports these types, and the engine never imports `src/server`. Recorded, trimmed fixtures (the `record-fixture` skill) for `vitalik.eth`, the one demo wallet §6 already names. The answers to §10 questions 2–4, written into §5.
- **Done when:** each server function returns typed, trimmed data for `vitalik.eth`, the fixtures contain no key or auth header, and §5 and §10 record the verified answers.
- **Agent:** backend TypeScript with network access to `api.zerion.io`.

### 3. Rewind engine
- **Objective:** a pure, tested engine that turns Zerion data into `RewindFacts`.
- **Surface:** `src/engine/**` (except `types.ts` and `fixtures.ts`, which task 1a owns, and `zerion.ts` and `__fixtures__/`, which task 2b owns).
- **Boundary:** `createState`, `accumulate` and `finalize → RewindFacts`, test-first from the examples in `.claude/rules/rewind-engine.md`. It reads the trimmed shapes in `src/engine/zerion.ts` and is tested on task 2b's recorded fixtures, plus hand-made pages for cases a real wallet doesn't produce (empty, capped, single chain). `firstTx` follows the strategy task 2b recorded in §5. **Out:** fetching, React, and any change to `zerion.ts`.
- **Done when:**
  - All the required test cases in the rule pass.
  - The engine imports nothing from React, `src/server` or any I/O.
  - `now` is injected.
- **Traps:** shares must total exactly 100, and `high`/`low` must be real series points.
- **Stop if:** a rule in the engine rule contradicts real fixture data. Record a new input/output example and ask before changing the rule.
- **Docs to keep coherent:** `.claude/rules/rewind-engine.md`, and `SPEC.md` §5 if a mapping rule changes.
- **Agent:** TypeScript, test-first. No browser needed.

### 4. Settings and wallet
- **Objective:** the user sets their wallet once, and it's remembered and treated as connected.
- **Surface:** `src/routes/index.tsx`, `src/router.tsx`, `src/lib/demo-wallets.ts`, `src/lib/wallet-store.ts`.
- **Boundary:**
  - **In:**
    - The settings dialog wired to `localStorage`, shown on first visit and not dismissible then.
    - The TanStack Query `QueryClientProvider` (default `staleTime` 10 minutes), added for its first consumer, ENS resolution. Task 5a only uses it.
    - ENS resolution through task 2b's server function, with a resolving state.
    - Invalid-address validation.
    - `src/lib/demo-wallets.ts` with 3 wallets vetted by `vet-demo-wallet`.
    - The gear is always visible, and a wallet change updates the stored wallet.
  - **Out:** the paging loop (5a), the reveal wiring and restarting the Rewind on a wallet change (5b), and any edit in `src/components/`.
- **Done when:** first visit, change wallet, invalid input and ENS resolving all work in the browser (`verify-ui` step 2), with component tests for validation and persistence. `verify-ui` step 5 needs the story on `/`, so it's checked in task 5b.
- **Traps:**
  - `localStorage` is client-only.
  - Never invent demo wallets.
  - Keyboard focus returns to the gear on close (see KNOWN-ISSUES #1).
- **Stop if:** fewer than 3 public wallets pass `vet-demo-wallet`. Report the candidates and scores and ask.
- **Docs to keep coherent:** `SPEC.md` §6, and `CONTEXT.md` if a term changes.
- **Agent:** frontend with browser verification, and API access for vetting.

### 5. Rewind flow

Split into the hook and its wiring. Shared for 5a–5b:
- **Traps:** don't finalize before paging ends. Guard against state updates after abort.
- **Stop if:** the real paging time for a demo wallet regularly exceeds the 12s timeout. Report the timings and ask whether to raise the timeout or lower the cap.
- **Docs to keep coherent:** `.claude/rules/motion-and-reveal.md`, and a new ADR if the loading contract in `docs/adr/0002-loading-is-the-animation.md` changes.

#### 5a. The `useRewind` hook
- **Objective:** a tested hook pages a wallet's transactions, feeds the engine, and reports progress, completion and failure.
- **Surface:** `src/lib/useRewind.ts` and its tests.
- **In:** the paging loop over `getTransactionsPage`, feeding the engine's `accumulate`. Progress, completion and failure reported through callbacks (`onPage(count)`, `onComplete(finalCount)`, `onFail()`), so the hook doesn't depend on the reveal. The chains, fungible and balance calls through TanStack Query, then `finalize`. The 12s timeout, the 20-page cap ("2,000+"), and `AbortController` cancelling on a wallet change or unmount. **Out:** any UI.
- **Done when:** hook tests with fake server functions cover paging to the end, the cap, the timeout, an error, an empty wallet, and cancel-on-change with no update after abort.
- **Agent:** TypeScript and React hooks, test-first. No browser needed.

#### 5b. The Rewind on `/`
- **Objective:** a load autoplays the real Rewind: the reveal streams real transactions, then the five cards.
- **Surface:** `src/routes/index.tsx`.
- **In:** the hook's callbacks bound to `ParticleReveal`'s handle, the reveal played into `RewindPlayer`, EmptyState and ErrorState with retry, and a wallet change restarting the Rewind. **Out:** the share image and deploy (task 6).
- **Done when:** the whole of `verify-ui` passes on real data for all 3 demo wallets, including keyboard after settings (step 5). An empty wallet shows EmptyState, and a simulated 429 ends in ErrorState with a working retry.
- **Traps:** clean up the reveal's rAF.
- **Agent:** frontend with browser verification and API access.

### 6. Share and ship
- **Objective:** the Rewind is live at a public URL and shareable.
- **Surface:** `src/lib/renderShareImage.ts`, `src/components/rewind/**` (share wiring), `src/routes/__root.tsx`, `vercel.json`, `vite.config.ts` (the Nitro Vercel preset only), `README.md`.
- **Boundary:**
  - **In:**
    - The share image from real facts (native share or download). Task 1d already ports the wiring (`RewindPlayer` calls `renderShareImage` and `shareOrDownload`), so this is verification on real data plus any fix it needs.
    - Meta and OG tags checked.
    - Deploy to Vercel.
    - A check on a phone browser.
    - The README roadmap ticked and the live URL added.
  - **Out:** new features.
- **Done when:**
  - `ship-check` passes.
  - The public URL works on desktop and on a phone.
  - The OG preview renders when the link is pasted.
- **Traps:**
  - Wait for fonts before rendering the share image.
  - The key goes only in Vercel's environment variables.
  - `og:image` is a relative path today. Link-preview scrapers need an absolute URL.
- **Stop if:** the Vercel project doesn't exist or isn't linked. That's a Principal action (§10).
- **Docs to keep coherent:** `README.md`.
- **Agent:** frontend and deploy, with browser verification.

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
- **Window:** the last 365 days, capped at 2,000 transactions.

Open, to verify in task 2a (question 1) and task 2b (questions 2–4) (research, not a Principal decision; record the answers in §5):
1. The exact Basic-auth header format.
2. The enum value of the year chart period.
3. Whether transactions can be fetched oldest-first. This decides the lifetime versus in-window `firstTx`.
4. Where the fungible's yearly price change comes from (market data field or price chart).

Open, for the Principal: none. The plan can proceed.

**Principal actions, not decisions** (tasks stop and ask when they reach these):
- Create a free Zerion API key and make it available (§9 step 4), before task 2a.
- Create and link a Vercel project and set `ZERION_API_KEY` in its environment variables, before task 6.
- Tick each PR's Test Plan after checking it in the browser.

