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
6. **Development snapshot and token leak check:** for `GITHUB_TOKEN` and `VINAYA_LOG_READ_TOKEN` (values read from `.env.local`), check that:
   - neither the variable's name nor the last 12 characters of its value appear in `src/server/github/dev-snapshot.json`, when the build wrote one (ADR-0006);
   - the last 12 characters of its value don't appear anywhere in the client build output (`.output/public`) — the last, not the first, because a GitHub token starts with a fixed `github_pat_` or `ghp_` prefix. The names may: `/dev-stats`' error copy names both variables on purpose, never a value.

   Print only "found" or "not found" per check, never a value. Also check that `git ls-files` doesn't list `dev-snapshot.json` and that `public/` holds no copy of it.
7. **No raw Ariakit:** `grep -rn "@ariakit/react" src --include=*.tsx --include=*.ts` must only list files under `src/components/ui/`.
8. **No invented wallets:** every name in `src/lib/demo-wallets.ts` must have been vetted (see the `vet-demo-wallet` skill).
9. If the task touched UI, run the `verify-ui` skill.

End with a single line: `SHIP-CHECK: pass`, or `SHIP-CHECK: fail at step N`.
