/**
 * The one door to the Zerion API.
 *
 * Every Zerion call in this app goes through `zerionFetch`. The API key is read here and
 * nowhere else, it never leaves this module, and no upstream message ever reaches a caller:
 * failures come back as one of four typed error codes the UI can render.
 *
 * Auth is HTTP Basic with the key as the username and an empty password —
 * `Authorization: Basic base64(KEY + ":")` — confirmed against the OpenAPI spec's
 * `APIKeyBasicAuth` scheme (`type: http`, `scheme: basic`) at https://developers.zerion.io.
 */

export const ZERION_BASE_URL = "https://api.zerion.io";

/** The free tier allows about 2,000 calls a day, so a repeated call inside the window is served here. */
const DEFAULT_TTL_MS = 10 * 60 * 1000;
/** Chain names and icons barely move. */
const CHAINS_TTL_MS = 24 * 60 * 60 * 1000;
/** Enough for a year of transaction pages per wallet, a handful of wallets deep. */
const MAX_CACHE_ENTRIES = 200;

/** A query-parameter value. Arrays are sent comma-separated, the way Zerion's filters expect. */
export type ZerionParamValue = string | number | boolean | readonly string[];

export type ZerionParams = Readonly<Record<string, ZerionParamValue | undefined>>;

/** The only failure vocabulary a caller ever sees. Raw upstream messages stay in this module. */
export type ZerionErrorCode = "invalid_address" | "not_found" | "rate_limited" | "upstream";

export type ZerionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ZerionErrorCode };

/**
 * Fetch one Zerion resource.
 *
 * `path` is either a path (`/v1/chains/`) or an absolute URL on the Zerion origin, so a
 * `links.next` cursor can be followed exactly as returned instead of being rebuilt by hand.
 */
export async function zerionFetch<T>(
  path: string,
  params: ZerionParams = {},
  options: { readonly signal?: AbortSignal } = {},
): Promise<ZerionResult<T>> {
  const url = buildUrl(path, params);
  const cacheKey = `${url.pathname}${url.search}`;

  const cached = readCache(cacheKey);
  if (cached.hit) return { ok: true, data: cached.value as T };

  // Built outside the try: a missing key is a deployment fault, not an upstream failure.
  const headers = { Authorization: authorizationHeader(), Accept: "application/json" };

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: options.signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { ok: false, error: "upstream" };
  }

  if (!response.ok) return { ok: false, error: "upstream" };

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { ok: false, error: "upstream" };
  }

  // Only successes are cached: a failure must be retried, not remembered.
  writeCache(cacheKey, data, ttlFor(url.pathname));
  return { ok: true, data: data as T };
}

/** Empty the response cache. Tests use it for isolation; nothing in the app needs it yet. */
export function clearZerionCache(): void {
  cache.clear();
}

/**
 * `Basic base64(KEY + ":")`. The key is read from the environment on every call and never
 * stored, logged or returned — including in the error thrown when it is missing.
 */
function authorizationHeader(): string {
  const key = process.env.ZERION_API_KEY;
  if (!key) {
    throw new Error("ZERION_API_KEY is not set: the server cannot call the Zerion API without it.");
  }
  return `Basic ${Buffer.from(`${key}:`, "utf8").toString("base64")}`;
}

/**
 * Resolve `path` against the Zerion origin and produce a canonical URL: `currency=usd` by
 * default, every parameter sorted by name. Sorting is what makes two calls that differ only in
 * parameter order the same call — see the cache key below.
 */
function buildUrl(path: string, params: ZerionParams): URL {
  const url = new URL(path, ZERION_BASE_URL);
  if (url.origin !== ZERION_BASE_URL) {
    throw new Error(`zerionFetch: path must resolve to ${ZERION_BASE_URL}, got ${url.origin}`);
  }

  // Precedence: the currency default, then whatever the path already carried (a `links.next`
  // cursor), then the caller's own parameters.
  const merged = new Map<string, string>([["currency", "usd"]]);
  for (const [name, value] of url.searchParams) merged.set(name, value);
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    merged.set(name, Array.isArray(value) ? value.join(",") : String(value));
  }

  const sorted = [...merged].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(sorted).toString();
  return url;
}

type CacheEntry = { readonly value: unknown; readonly expiresAt: number };

/**
 * The in-memory response cache, keyed by path and sorted parameters. A `Map` iterates in
 * insertion order, so re-inserting an entry on every read makes the first key the least
 * recently used one — which is the one evicted when the cache is full.
 */
const cache = new Map<string, CacheEntry>();

function ttlFor(pathname: string): number {
  return pathname.startsWith("/v1/chains") ? CHAINS_TTL_MS : DEFAULT_TTL_MS;
}

function readCache(key: string): { hit: true; value: unknown } | { hit: false } {
  const entry = cache.get(key);
  if (!entry) return { hit: false };

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return { hit: false };
  }

  cache.delete(key);
  cache.set(key, entry);
  return { hit: true, value: entry.value };
}

function writeCache(key: string, value: unknown, ttlMs: number): void {
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });

  while (cache.size > MAX_CACHE_ENTRIES) {
    const leastRecentlyUsed = cache.keys().next();
    if (leastRecentlyUsed.done) break;
    cache.delete(leastRecentlyUsed.value);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
