---
name: vet-demo-wallet
description: Evaluate whether a real public wallet makes a good Rewind demo (enough recent transactions, several chains, a usable balance chart, a clear top token) using the Zerion API through the app's server layer. Use when choosing or replacing entries in src/lib/demo-wallets.ts.
argument-hint: "<ens-or-address>"
context: fork
---

# Vet a demo wallet

Only evaluate **well-known public wallets** (for example a public figure's published ENS name, or a protocol treasury). Never invent names or guess at private individuals' wallets.

1. Resolve the argument to an address through the ENS server function, if needed.
2. Fetch through the app's server layer, never with a raw key in a shell:
   - transaction pages for the last 365 days (stop at the 20-page cap);
   - the year balance chart.
3. Run the engine (`finalize`) and inspect the resulting `RewindFacts`.
4. Score each item:
   - `txCount` ≥ 150 in the window
   - `chainCount` ≥ 3
   - `topToken` present
   - balance series ≥ 30 points, with a visible high and low
   - `firstTx` present
5. Return a short verdict with the numbers and **use / don't use**. If it's a use, give the exact entry to add to `src/lib/demo-wallets.ts` (name and resolved address).

Count the API calls made: the free tier is about 2,000 a day.
