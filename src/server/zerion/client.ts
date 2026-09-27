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

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { ok: false, error: "upstream" };
  }
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
