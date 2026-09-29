/**
 * The one door to GitHub's REST API.
 *
 * `GITHUB_TOKEN` is read here and nowhere else, used for `GET` only, and never logged, returned
 * or put in a URL. Anonymous calls work too — GitHub's own anonymous limit (60 requests/hour) is
 * what `rate_limited` names. No raw upstream message or body ever leaves this module.
 */

export const GITHUB_REPO = "daniboomerang/onchain-rewind";
const GITHUB_BASE_URL = "https://api.github.com";

export type GithubErrorCode = "rate_limited" | "unreachable";

export type GithubResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: GithubErrorCode };

export type GithubParams = Readonly<Record<string, string | number | undefined>>;

/**
 * One GitHub REST call. `path` is either a path on the API origin (`/repos/{repo}/issues`) or an
 * absolute URL there, so a `Link: rel="next"` page can be followed exactly as returned.
 */
async function githubFetch<T>(
  path: string,
  params: GithubParams = {},
): Promise<GithubResult<{ data: T; next?: string }>> {
  const url = new URL(path, GITHUB_BASE_URL);
  if (url.origin !== GITHUB_BASE_URL) {
    throw new Error(`githubFetch: path must resolve to ${GITHUB_BASE_URL}, got ${url.origin}`);
  }
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    return { ok: false, error: "unreachable" };
  }

  if (response.status === 429 || isPrimaryRateLimited(response)) {
    console.error(`github read rate-limited: ${response.status}`);
    return { ok: false, error: "rate_limited" };
  }
  if (!response.ok) {
    console.error(`github read failed: ${response.status}`);
    return { ok: false, error: "unreachable" };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: "unreachable" };
  }

  return { ok: true, data: { data: data as T, next: nextLink(response) } };
}

/** One page of a `GET` that returns an array, `data` unwrapped. */
export async function githubGet<T>(path: string, params: GithubParams = {}): Promise<GithubResult<T>> {
  const result = await githubFetch<T>(path, params);
  return result.ok ? { ok: true, data: result.data.data } : result;
}

/**
 * Every page of a `GET` that returns an array, followed via `Link: rel="next"` until GitHub stops
 * sending one. A rate limit or a failure on any page abandons the whole read — the caller already
 * falls back to its last held record, so a partial page list is never worth keeping.
 */
export async function githubGetAllPages<T>(path: string, params: GithubParams = {}): Promise<GithubResult<T[]>> {
  const items: T[] = [];
  let next: string | undefined = buildFirstPageUrl(path, params);

  while (next) {
    const result: GithubResult<{ data: T[]; next?: string }> = await githubFetch<T[]>(next);
    if (!result.ok) return result;
    items.push(...result.data.data);
    next = result.data.next;
  }

  return { ok: true, data: items };
}

function buildFirstPageUrl(path: string, params: GithubParams): string {
  const url = new URL(path, GITHUB_BASE_URL);
  for (const [name, value] of Object.entries({ per_page: 100, ...params })) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return url.toString();
}

/** GitHub's primary rate limit answers `403` with this header at `0`, distinct from any other `403`. */
function isPrimaryRateLimited(response: Response): boolean {
  return response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";
}

/** The `rel="next"` URL of a `Link` header, e.g. `<https://…?page=2>; rel="next", <…>; rel="last"`. */
function nextLink(response: Response): string | undefined {
  const header = response.headers.get("link");
  if (!header) return undefined;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}
