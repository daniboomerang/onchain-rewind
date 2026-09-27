# Onchain Rewind: spec

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

**Later** (mention in the video, don't build): a personality card from the transaction mix, a shareable URL `/rewind/<name>` with a server-rendered preview image, an agent skill that returns the facts, and an in-wallet entry point.

## 3. Design input

Everything is in [`design/`](design/): `DESIGN.md` (tokens, components, motion per screen, layout), `tokens.css`, reference components, `types.ts` (the `RewindFacts` contract), `fixtures.ts`, `renderShareImage.ts`, `Playground.tsx`, assets (wordmark, favicon, OG image, video title cards), and the reference sheets in `design/reference/`.

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

**Key decisions (explain these in the video):**
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

Each task is one PR and one GitHub Issue. The Vinaya Planner cuts the Issues from this section. **Boundary** says what's in, **Done when** is the acceptance bar, and **Traps** are known pitfalls. Dependencies: 1 → (2 ∥ 3) → 4 → 5 → 6. Tasks 2 and 3 can run in parallel.

### 0. Scaffold (done)
Done directly, before any Vinaya task, as part of the bootstrap.
- **Boundary:**
  - TanStack Start with React 19, TS strict (`noUncheckedIndexedAccess`);
  - Tailwind v4 importing `src/styles/tokens.css`;
  - fonts (Instrument Serif, Geist, Geist Mono);
  - Vitest, and the scripts from AGENTS.md "Commands";
  - favicon and wordmark from `design/assets`;
  - an empty dark `/` route.
- **Done when:** `bun run check`, `bun test` and `bun run build` pass, and `/` renders a dark page with no console errors.
- **Traps:** TanStack Start's setup has changed across releases, so follow the version you install. Keep `biome.json` and `checks.yml` as they are.

### 1. Design system foundation
- **Boundary:**
  - Port `design/components` into `src/components/ui/` (Button, IconButton, Tooltip, WalletCombobox, SettingsDialog) and `src/components/rewind/` (the rest, plus `motion.ts`).
  - Port `design/types.ts` → `src/engine/types.ts`, `design/fixtures.ts` → `src/engine/fixtures.ts`, `design/renderShareImage.ts` → `src/lib/`.
  - Add the `/system` route from `design/Playground.tsx`.
  - Fix KNOWN-ISSUES #1.
  - **Not in scope:** any API call or real data.
- **Done when:** `/system` shows every component in every state, and the full `RewindPlayer` runs on each of the 3 fixtures. Arrow keys work after closing the settings dialog, with a test for it. `check` is green.
- **Traps:**
  - The Biome import ban fails any Ariakit import outside `src/components/ui/`. Wrappers must re-export what feature code needs.
  - Don't edit `design/`.

### 2. Zerion server layer
- **Boundary:**
  - `src/server/zerion/client.ts` (`zerionFetch`: auth, cache, 429 backoff, typed error mapping).
  - Server functions: transactions page, chains, fungible, balance chart, ENS resolve.
  - Recorded fixtures in `src/engine/__fixtures__/` (use the `record-fixture` skill).
  - **Not in scope:** aggregation logic, and UI.
- **Done when:**
  - Each server function returns typed, trimmed data for `vitalik.eth`.
  - A bad address returns `invalid_address`.
  - The key-leak check in `ship-check` passes.
  - SPEC.md §5 records the verified answers to the open API questions in §10.
- **Traps:**
  - Zerion doesn't resolve ENS.
  - Follow `links.next` exactly as returned.
  - Verify field names in the OpenAPI spec or the MCP before using them.
  - Stop and ask if the auth scheme doesn't match the rule.

### 3. Rewind engine
- **Boundary:** `src/engine/` with `createState`, `accumulate` and `finalize → RewindFacts`, test-first from the examples in `.claude/rules/rewind-engine.md` and the fixtures from task 2 (use hand-made minimal pages until they exist). **Not in scope:** fetching.
- **Done when:** all the required test cases in the rule pass, and the engine has no imports from React, `src/server`, or anything that does I/O.
- **Traps:**
  - Shares must total exactly 100.
  - `high` and `low` must be real series points.
  - Don't call `Date.now()` inside the engine.

### 4. Settings and wallet
- **Boundary:**
  - The settings dialog wired to `localStorage`, shown on first visit and not dismissible then.
  - ENS resolution through the server function, with a resolving state.
  - Invalid-address validation.
  - `src/lib/demo-wallets.ts` (entries vetted with `vet-demo-wallet`).
  - The gear is always visible, and a wallet change restarts the Rewind.
- **Done when:** first visit, change wallet, invalid input and ENS resolving all work in the browser (the `verify-ui` steps 2 and 5).
- **Traps:**
  - `localStorage` is client-only (SSR).
  - Never invent demo wallets.

### 5. Rewind flow
- **Boundary:**
  - Autoplay on load.
  - A `useRewind` hook runs the paging loop, feeding `ParticleReveal.addTransactions` and the engine.
  - `complete` / `fail` handling, the 12s timeout, and the empty and error states with retry.
  - `AbortController` cancels on a wallet change.
- **Done when:** all of `verify-ui` passes on real data for every demo wallet, an empty wallet shows EmptyState, and a simulated 429 ends in ErrorState with a working retry.
- **Traps:**
  - Don't finalize before paging ends.
  - Respect the 20-page cap and show "2,000+".
  - Clean up the reveal's rAF on unmount.

### 6. Share and ship
- **Boundary:**
  - The share image from real facts (native share or download).
  - Meta and OG tags (`design/assets/og-default.png`).
  - Deploy to the target in §10.
  - A check on a phone browser.
- **Done when:** `ship-check` passes, the public URL works on desktop and phone, and the OG preview renders when the link is pasted.
- **Traps:**
  - Wait for fonts before rendering the share image.
  - Set `ZERION_API_KEY` in the host's environment settings. Never put it in the repo.

For the video, record one task running end to end through `vinaya task run`. Task 4 or 6 is the right size.

## 9. Post-install setup (after `vinaya quickstart`)

1. **Check the agent config survived install.** `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.claude/skills/` and `.agents/skills/` must sit next to Vinaya's generated files (`.agents/skills/vinaya-*`, `.claude/settings.json`, `.claude/commands/vinaya.md`). In Claude Code, `/context` should list `CLAUDE.md` under memory files.
2. **Add the Zerion docs MCP server** to `.mcp.json` next to Vinaya's entry. Take the endpoint from https://developers.zerion.io/build-with-ai/mcp.md.
3. **Optional:** install Zerion's agent skill from `zeriontech/zerion-ai` for wallet-analysis context.
4. **Put the key in `.env.local`:** `ZERION_API_KEY=…`, entered by the human and never committed.
5. **Update the global CLI:** `npm install -g @attalabs/vinaya@latest`, then run `vinaya doctor`.
6. **Doc-coverage bindings** in `.vinaya/doc-owners` (Vinaya-managed; append below its header). Bind only contract files, so ordinary PRs don't owe a doc edit:
   ```
   src/engine/types.ts        SPEC.md
   src/styles/tokens.css      design/DESIGN.md
   biome.json                 AGENTS.md
   .github/workflows/checks.yml  AGENTS.md
   ```
7. **Single-project repo:** no `.vinaya/projects.md` is needed, so task Issues omit the `Project` field.

## 10. Decisions

Settled, so the Planner doesn't stop to ask:
- **Deploy target:** Vercel (TanStack Start supports it; the key goes in Vercel's environment variables).
- **Network scope:** EVM only (`0x` addresses). No Solana.
- **ENS:** resolved on the server with viem on mainnet through its default public transport. If resolution fails, show the invalid state and suggest pasting an address. Demo wallets store their resolved address, so they never depend on ENS at runtime.
- **Window:** the last 365 days, capped at 2,000 transactions.

Open, to verify in task 2 (research, not a Principal decision; record the answers in §5):
1. The exact Basic-auth header format.
2. The enum value of the year chart period.
3. Whether transactions can be fetched oldest-first. This decides the lifetime versus in-window `firstTx`.
4. Where the fungible's yearly price change comes from (market data field or price chart).

Open, for the Principal:
- None.

