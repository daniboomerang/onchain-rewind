/**
 * The one door to the Zerion API.
 *
 * Every Zerion call in this app goes through `zerionFetch`. The API key is read here and
 * nowhere else, it never leaves this module, and no upstream message ever reaches a caller:
 * failures come back as one of five typed error codes the UI can render.
 *
 * Auth is HTTP Basic with the key as the username and an empty password —
 * `Authorization: Basic base64(KEY + ":")` — confirmed against the OpenAPI spec's
 * `APIKeyBasicAuth` scheme (`type: http`, `scheme: basic`) at https://developers.zerion.io.
 */

export const ZERION_BASE_URL = "https://api.zerion.io";

/**
 * The Demo plan allows 300 calls a day, and one full Rewind of a deep wallet spends more than twenty
 * of them, so the cache is measured in hours rather than minutes: a wallet replayed, re-opened or
 * shared during the same sitting costs the budget nothing at all. Half a day is as stale as a year of
 * history can get without any card reading differently — the window is 365 days long.
 *
 * On a serverless host this is best-effort by nature: the cache lives in one instance's memory, so a
 * cold start starts empty. It saves the repeated calls of one session, which is what the budget needs.
 */
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
/** Chain names and icons barely move. */
const CHAINS_TTL_MS = 24 * 60 * 60 * 1000;
/** Enough for a year of transaction pages per wallet, a handful of wallets deep. */
const MAX_CACHE_ENTRIES = 200;
/**
 * A throttle is transient, so it waits: one 429 waits, a fourth gives up. The Demo plan allows one
 * request a second, which is what the run's own pacing is sized for; these backoffs are what catches
 * the second request the pacing didn't foresee.
 */
const RATE_LIMIT_BACKOFF_MS = [500, 1000, 2000] as const;
/**
 * Zerion reports the organization's remaining daily calls on every response. Read live off this
 * repository's key and recorded, with the plan's own limit headers, in
 * `.claude/rules/zerion-api.md`: on the free Demo plan a spent day answers `429` with
 * `ratelimit-org-day-remaining: 0` until `ratelimit-org-day-reset`.
 */
const DAY_REMAINING_HEADER = "ratelimit-org-day-remaining";

/** A query-parameter value. Arrays are sent comma-separated, the way Zerion's filters expect. */
export type ZerionParamValue = string | number | boolean | readonly string[];

export type ZerionParams = Readonly<Record<string, ZerionParamValue | undefined>>;

/**
 * The only failure vocabulary a caller ever sees. Raw upstream messages stay in this module.
 *
 * `rate_limited` and `budget_spent` are both a `429`, and they are not the same failure: the first is
 * a throttle that outlasted its backoffs and is worth retrying, the second is the plan's daily budget
 * spent, which no retry can help until the day resets — so only the second is worth telling a visitor
 * about.
 */
export type ZerionErrorCode = "invalid_address" | "not_found" | "rate_limited" | "budget_spent" | "upstream";

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

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { headers, signal: options.signal });
    } catch (error) {
      if (isAbortError(error)) throw error;
      return { ok: false, error: "upstream" };
    }

    if (response.status === 429) {
      // A spent daily budget is not a transient throttle: every retry is refused until the day
      // resets, so it skips the backoffs entirely and comes back as its own code.
      if (dailyBudgetSpent(response)) return { ok: false, error: "budget_spent" };

      const backoffMs = RATE_LIMIT_BACKOFF_MS[attempt];
      if (backoffMs === undefined) return { ok: false, error: "rate_limited" };
      await sleep(backoffMs, options.signal);
      continue;
    }

    // The body of a failed response is never read, so no upstream message can escape.
    if (!response.ok) return { ok: false, error: errorForStatus(response.status) };

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

/**
 * Zerion's documented statuses, reduced to the four codes the UI can render. `400` and `422`
 * both mean "malformed parameters", and on this app's paths the only parameter a user supplies
 * is the wallet address — so they surface as `invalid_address`. `401`, `403` and every `5xx`
 * stay `upstream`: a key problem is ours to fix, never something to explain to a visitor.
 */
function errorForStatus(status: number): ZerionErrorCode {
  if (status === 400 || status === 422) return "invalid_address";
  if (status === 404) return "not_found";
  return "upstream";
}

/**
 * Whether this `429` is the plan's daily budget spent rather than a throttle. A header that is
 * missing, empty or unreadable is not one: an unexplained 429 stays the retryable failure it was.
 */
function dailyBudgetSpent(response: Response): boolean {
  const remaining = response.headers.get(DAY_REMAINING_HEADER);
  if (remaining === null || remaining.trim() === "") return false;
  const left = Number(remaining);
  return Number.isFinite(left) && left <= 0;
}

/** A cancellable wait: an abort during a backoff stops the retry loop instead of outliving it. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
