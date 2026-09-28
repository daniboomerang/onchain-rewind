import { QueryClient } from "@tanstack/react-query";

/**
 * SPEC §5: every server-function read is kept fresh for as long as the server caches it — half a day.
 * A Rewind is a year of history that does not move while someone watches it, so a remount, a wallet
 * swapped back, or a second reveal of the same address must not re-read Zerion: the key's Demo plan
 * allows 300 calls a day, and one deep wallet's year spends more than twenty of them.
 */
export const STALE_TIME_MS = 12 * 60 * 60 * 1000;

/**
 * One client per router instance, never a module-level singleton: on the server `getRouter()` runs
 * per request, and a shared cache would serve one visitor's wallet data to the next.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { staleTime: STALE_TIME_MS } } });
}
