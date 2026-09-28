---
paths:
  - "src/routes/**"
  - "src/server/**"
  - "vite.config.ts"
---

# TanStack Start

Zerion's own web app runs on TanStack Start, which is why this repo uses it too. **Check the installed version's types and docs before using an API.** TanStack Start's API has changed between releases. For example, server-function input validation has had different method names over time. Follow the version in `package.json`, not memory.

## Routes (`src/routes/`)
- `__root.tsx`: document shell, fonts, meta and OG tags, favicon, global CSS, and the head script that resolves the theme before the first paint.
- `index.tsx`: the Rewind (settings dialog on first visit, then autoplay).
- `system.tsx`: the component playground, ported from `design/Playground.tsx`.
- No other routes in v1.

## Server functions (`src/server/`)
- Anything that needs `ZERION_API_KEY`, or that resolves ENS, is a server function created with `createServerFn`. Validate input at the boundary: addresses must be `0x` + 40 hex characters, and ENS names must end in `.eth`.
- Keep server functions thin: parse input, call `zerionFetch`, trim the response, return a typed result. Logic belongs in `src/engine/`.
- Name files `*.functions.ts`, grouped by resource (`wallets`, `chains`, `fungibles`). Keep the client-safe types they return in a separate `*.types.ts`, or — for the trimmed Zerion shapes the engine also reads — in `src/engine/zerion.ts` (ADR-0003).
- Each `*.functions.ts` exports the handler's body as a plain `read…` function beside the server function itself. The server function is one line around it, and the tests call the `read…` function: `createServerFn`'s own handler needs the Start server runtime, which Vitest doesn't have.
- **Return, never throw.** A server function returns the client's `ZerionResult<T>` (or, for ENS, `EnsResult`), including for input it refuses. Validation happens before the call goes out.
- ENS is not Zerion, so it lives in `src/server/ens/`, not `src/server/zerion/`.

## Env
- `ZERION_API_KEY` in `.env.local` (gitignored), documented in `.env.example`. It's read via `process.env` only on the server.
- Never use the `VITE_` prefix for secrets: Vite inlines `VITE_*` into the client bundle.
- **Build check:** after `bun run build`, grep the client output for the key's first characters. It must not be found.

## Client data
- TanStack Query for server-function calls. `staleTime` is half a day, the same as the server's own cache, because the API plan's daily budget is small. The query key includes the address.
- The transaction paging loop lives in a hook (`useRewind`). It isn't a single query, because it must stream counts into the reveal. Use `AbortController` and cancel on wallet change or unmount.

## SSR boundaries
- `localStorage`, `canvas`, `matchMedia` and `navigator.share` exist only in the browser. Read them in effects or behind a client-only boundary, never during render on the server.
- The theme is the one thing an effect is too late for: `__root.tsx`'s head script (`head: () => ({ scripts: [...] })`, rendered by `HeadContent`) reads `matchMedia` in the browser and writes `data-theme` on `<html>` before the first paint. React renders no theme attribute, so nothing about it can mismatch at hydration.
- The index route renders the shell with no theme attribute, so the server's markup is the dark `:root` default until that script resolves the system setting. The settings dialog or reveal mounts on the client, so there's no hydration mismatch.
