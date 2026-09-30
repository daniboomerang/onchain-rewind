---
paths:
  - "src/routes/**"
  - "src/server/**"
  - "vite.config.ts"
  - "vercel.json"
---

# TanStack Start

Zerion's own web app runs on TanStack Start, which is why this repo uses it too. **Check the installed version's types and docs before using an API.** TanStack Start's API has changed between releases. For example, server-function input validation has had different method names over time. Follow the version in `package.json`, not memory.

## Routes (`src/routes/`)
- `__root.tsx`: document shell, fonts, meta and OG tags, favicon, global CSS, and the head script that resolves the theme before the first paint.
- `index.tsx`: the Rewind (settings dialog on first visit, then autoplay).
- `system.tsx`: the component playground, ported from `design/Playground.tsx`.
- `dev-stats.tsx`: the development log (CONTEXT.md) — this project's own milestone, tickets and round-by-round review loop, read live from GitHub and the Vinaya log. Renders a neutral shell on the server; the record loads on the client, same SSR-boundary reasoning as below.
- `logs.tsx`: a route-level `beforeLoad` redirect (`redirect({ to: "/dev-stats", statusCode: 301 })`) — `/logs` is the page's old address, kept as a permanent redirect so a shared link never flashes the old page.
- No other routes in v1.

## Server functions (`src/server/`)
- Anything that needs `ZERION_API_KEY`, or that resolves ENS, is a server function created with `createServerFn`. Validate input at the boundary: addresses must be `0x` + 40 hex characters, and ENS names must end in `.eth`.
- Keep server functions thin: parse input, call `zerionFetch`, trim the response, return a typed result. Logic belongs in `src/engine/`.
- Name files `*.functions.ts`, grouped by resource (`wallets`, `chains`, `fungibles`). Keep the client-safe types they return in a separate `*.types.ts`, or — for the trimmed Zerion shapes the engine also reads — in `src/engine/zerion.ts` (ADR-0003).
- Each `*.functions.ts` exports the handler's body as a plain `read…` function beside the server function itself. The server function is one line around it, and the tests call the `read…` function: `createServerFn`'s own handler needs the Start server runtime, which Vitest doesn't have.
- **Return, never throw.** A server function returns the client's `ZerionResult<T>` (or, for ENS, `EnsResult`), including for input it refuses. Validation happens before the call goes out.
- ENS is not Zerion, so it lives in `src/server/ens/`, not `src/server/zerion/`.
- The development log's two sources each get their own directory, same reasoning: `src/server/github/` (`dev-record.functions.ts` → `getGithubDevRecord`) reads this repo's issues, pull requests and comments; `src/server/vinaya/` (`dev-record.functions.ts` → `getDevRecord`) reads the Vinaya log directly. Neither touches Zerion or ENS. `getGithubDevRecord` folds the Vinaya round record in server-side (ADR-0004), so `/dev-stats` calls both only because the round-by-round timeline needs the log's own unreduced round list — the ticket list and headline numbers come from `getGithubDevRecord` alone.

## Env

- `ZERION_API_KEY` in `.env.local` (gitignored), documented in `.env.example`. It's read via `process.env` only on the server.
- `VINAYA_LOG_READ_TOKEN` (server only, the Vinaya log) and `GITHUB_TOKEN` (server only, optional, raises GitHub's anonymous rate limit) sit beside it, same file, same rule.
- Never use the `VITE_` prefix for secrets: Vite inlines `VITE_*` into the client bundle.
- **Build check:** after `bun run build`, grep the client output for the key's first characters. It must not be found. This only checks a secret's *value*. A variable name never reaches a visitor either: no page copy names `ZERION_API_KEY`, `VINAYA_LOG_READ_TOKEN`, `GITHUB_TOKEN` or any other server internal, and the detail of a failure goes to the server logs only.

## Production

**Production is Principal-only.** The only Vercel command an agent may run is `vercel deploy --prod --skip-domain`; every other `vercel` command (`--prod` without `--skip-domain`, `--target=production`, `promote`, `rollback`, `redeploy`, `alias`, `domains`, `link`, `pull`, `git connect`, `env`, `--prebuilt`), the Vercel dashboard and its API are the Principal's alone, and so is every change to Vercel environment variables or project settings. An unaliased build is still a production-target deployment: it runs with the production environment variables and its URL is reachable, so hand the URL to the Principal, who verifies and promotes, and never publish it. An unaliased build must come from a clean commit that has been reviewed (`main` or the pull request's head), and a `.vercelignore` keeps `.env*` and other local secret files out of what is uploaded. Anything not named is denied. It is enforced by this prose and the Principal's project settings, not by a permission rule.

## Client data
- TanStack Query for server-function calls. `staleTime` is half a day, the same as the server's own cache, because the API plan's daily budget is small. The query key includes the address.
- The transaction paging loop lives in a hook (`useRewind`). It isn't a single query, because it must stream counts into the reveal. Use `AbortController` and cancel on wallet change or unmount.
- `/dev-stats` is the one deliberate exception to the half-day `staleTime`: it polls its two queries every few seconds (`POLL_MS` in `DevLogPage.tsx`) with `staleTime: 0`, because it is showing a review loop that finishes in minutes, not a Zerion budget that resets once a day. `refetchIntervalInBackground` stays at its default `false`, so a hidden tab stops polling. Nothing else about the Zerion default changes.

## SSR boundaries
- `localStorage`, `canvas`, `matchMedia` and `navigator.share` exist only in the browser. Read them in effects or behind a client-only boundary, never during render on the server.
- The theme is the one thing an effect is too late for: `__root.tsx`'s head script (`head: () => ({ scripts: [...] })`, rendered by `HeadContent`) reads the stored choice and then `matchMedia` in the browser, and writes `data-theme` on `<html>` before the first paint. React renders no theme attribute, so nothing about it can mismatch at hydration — which is also why a theme control renders the same label on the server whatever is stored, and corrects it in its first effect.
- The index route renders the shell with no theme attribute, so the server's markup is the dark `:root` default until that script resolves the setting. The settings dialog or reveal mounts on the client, so there's no hydration mismatch.
