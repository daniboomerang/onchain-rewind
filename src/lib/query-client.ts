import { QueryClient } from "@tanstack/react-query";

/**
 * SPEC §4: every server-function read is cached for ten minutes. A Rewind is a year of history that
 * does not move while someone watches it, so a remount, a wallet swapped back, or a second reveal
 * of the same address must not re-read Zerion — the free tier is about 2,000 calls a day.
 */
export const STALE_TIME_MS = 10 * 60 * 1000;

/**
 * One client per router instance, never a module-level singleton: on the server `getRouter()` runs
 * per request, and a shared cache would serve one visitor's wallet data to the next.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { staleTime: STALE_TIME_MS } } });
}
