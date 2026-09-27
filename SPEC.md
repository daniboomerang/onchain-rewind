# Onchain Rewind: spec

## 0. Objectives

**Goal:** ship a demo-ready Onchain Rewind. A public URL plays any vetted wallet's last 365 days as the full Rewind (reveal, five cards, share image) on real Zerion data, at production quality (craft, accessibility, performance, clean architecture), built through governed AI agents.

**Success criteria** (the Milestone is done when all of these hold):
1. The deployed URL plays the Rewind end to end for 3 vetted demo wallets, and handles an empty wallet, an invalid address and an API error gracefully.
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
- **Window:** the last 365 days, capped at 2,000 transactions.

Open, to verify during the Zerion server work (research, not a Principal decision; record the answers in §5):
1. The exact Basic-auth header format.
2. The enum value of the year chart period.
3. Whether transactions can be fetched oldest-first. This decides the lifetime versus in-window `firstTx`.
4. Where the fungible's yearly price change comes from (market data field or price chart).

Open, for the Principal: none. The plan can proceed.

**Principal actions, not decisions** (tasks stop and ask when they reach these):
- Create a free Zerion API key and make it available (§9 step 4), before the Zerion server work starts.
- Create and link a Vercel project and set `ZERION_API_KEY` in its environment variables, before the deploy.
- Tick each PR's Test Plan after checking it in the browser.

