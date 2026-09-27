---
name: record-fixture
description: Record a real Zerion API response for a demo wallet into src/engine/__fixtures__/ as a trimmed JSON file for engine tests. Use when adding or updating engine tests that need realistic data.
argument-hint: "<endpoint> <demo-wallet>"
---

# Record a fixture

1. Use only wallets listed in `src/lib/demo-wallets.ts`.
2. Call the endpoint through the app's server layer (`zerionFetch`), so the key never touches the shell history or the file.
3. Trim the response to the fields the engine reads, and keep `links.next` for pagination tests. Keep the JSON:API structure.
4. Save it as `src/engine/__fixtures__/<endpoint>.<wallet>.json`. Endpoint names: `transactions-p1`, `transactions-p2`, `chart-year`, `chains`, `fungible-<symbol>`.
5. Check the file contains no key, no auth header and no request metadata: `grep -i "authorization\|basic "` must return nothing.
6. Mention the recording date at the top of the test that uses it, since the data will drift.
