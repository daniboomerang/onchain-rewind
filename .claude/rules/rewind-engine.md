---
paths:
  - "src/engine/**"
---

# Rewind engine

## Role
The engine is the only place that knows both Zerion's shapes and `RewindFacts`. Components read `RewindFacts` (`src/engine/types.ts`, ported from `design/types.ts`), and the server returns trimmed Zerion data. The engine connects the two.

## Rules
- **Pure.** No `fetch`, no `Date.now()` without injection, no React, no globals. Pass `now` in explicitly so tests are deterministic.
- **Incremental.** `createState(window) → accumulate(state, page) → finalize(state, extras) → RewindFacts`. The UI can finalize at any time; it never waits for the whole history to exist in memory at once.
- **Honest data.** If a field can't be computed, leave it `undefined`. The card that uses it hides itself. Never fill in placeholders.
- **Rounding** happens in the engine for stored values: shares add up to 100 after rounding (largest-remainder), and percentages have one decimal. Display formatting stays in `fmt` (types.ts).

## Aggregation rules (keep in sync with SPEC.md §5)
- **Window:** the last 365 days from `now`. Only non-trash transactions count.
- **`txCount`:** transactions in the window. If capped, add `capped: true` to the state and let the UI show "2,000+".
- **`chains`:** group by chain id, sort by count descending; equal counts keep the order the year introduced them in. Share = count / (transactions that named a chain) × 100, rounded by largest remainder. That denominator is `txCount` for every real page — Zerion gives each transaction a chain relationship — and it keeps the wheel at 100 if one ever arrives without. `chainCount` = distinct chains. Names and icons come from the chains lookup passed in `extras`; a chain the lookup doesn't carry keeps its id as its name.
- **`topToken`:** the most frequent fungible across trades; transfers are the fallback. Ties go to the higher USD volume, then alphabetical order. `timesTraded` = number of those transactions, counting a fungible once per transaction however many of its transfers that transaction carries. NFT transfers carry no fungible and never count. `changePct` comes from the fungible the caller fetched for `topFungible(state)`: no fungible, no yearly change, or a different fungible than the transactions named, and `topToken` is left out.
- **`balance`:** from the chart points, one point per day. `high` and `low` must be actual points of `series`. `changePct` = (last − first) / first × 100, to one decimal. If there are fewer than 2 points, or the first is `0`, leave it undefined.
- **`firstTx` / `daysOnchain`:** see SPEC.md §5 for the verified strategy. Dates are ISO `YYYY-MM-DD` in UTC.
- **Empty wallet:** `txCount: 0`, arrays empty, optionals undefined. The UI shows EmptyState.

## Examples (these define the rules; tests must cover them)

**1. Chain shares use largest remainder, and the total is always 100**
```
counts: { ethereum: 5, base: 3, arbitrum: 3 }   txCount: 11
raw:    45.45 / 27.27 / 27.27
out:    chains = [ {id:"ethereum", share:46}, {id:"base", share:27}, {id:"arbitrum", share:27} ]   chainCount: 3
```

**2. High and low are real points, and `changePct` compares first to last**
```
series: [ {2026-01-01, 1000}, {2026-06-10, 640}, {2026-11-02, 2400}, {2026-12-31, 1800} ]
out:    high = {2026-11-02, 2400}   low = {2026-06-10, 640}   current = 1800   changePct = 80.0
```

**3. Empty wallet**
```
pages: [ { items: [], next: null } ]
out:   { txCount: 0, chains: [], chainCount: 0, daysOnchain: 0, firstTx: undefined, topToken: undefined, balance: undefined }
```

**4. A wallet that never traded falls back to transfers, and a real change can be negative**
```
pages:  the recorded vitalik.eth year — operation types receive, execute and send, no trade
extras: fungible = { id:"eth", symbol:"ETH", name:"Ethereum", changePct365d: -32.769575478149726 }
out:    topToken = { symbol:"ETH", timesTraded: 38, changePct: -32.8 }
```

## Working method
Test-first. Write the tests for a rule (from the examples and the recorded fixtures), watch them fail, then implement. If an output looks wrong, add an input/output example here before changing code.

## Tests (Vitest)
- Co-locate as `*.test.ts`. Feed recorded fixtures from `src/engine/__fixtures__/`.
- **Required cases:**
  - normal wallet
  - empty wallet
  - single chain
  - capped at 2,000
  - negative token change
  - balance with fewer than 2 points
  - shares adding up to exactly 100
- A test fails the build, so no snapshot tests of whole objects. Assert on each field.
