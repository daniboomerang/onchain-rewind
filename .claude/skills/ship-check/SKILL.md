---
name: ship-check
description: Run the definition-of-done checks from SPEC.md §7 before opening a PR or deploying — typecheck, lint, tests, build, API key not in client bundle, and a browser pass. Use at the end of every task.
allowed-tools: Bash, Read, Grep, Glob
---

# Ship check

Run these steps in order. Stop at the first failure and report it with the exact output line.

1. `bun run check:format`
2. `bun run check:lint`, then `bun run check:types`. These are the same three checks CI runs.
3. `bun test`
4. `bun run build`
5. **Key leak check:** make sure the first 8 characters of `ZERION_API_KEY` (read from `.env.local`) don't appear anywhere in the client build output. Print only "found" or "not found", never the key.
6. **No raw Ariakit:** `grep -rn "@ariakit/react" src --include=*.tsx --include=*.ts` must only list files under `src/components/ui/`.
7. **No invented wallets:** every name in `src/lib/demo-wallets.ts` must have been vetted (see the `vet-demo-wallet` skill).
8. If the task touched UI, run the `verify-ui` skill.

End with a single line: `SHIP-CHECK: pass`, or `SHIP-CHECK: fail at step N`.
