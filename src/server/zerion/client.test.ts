import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearZerionCache, zerionFetch } from "#/server/zerion/client.ts";

/** A stand-in for the one `Response` field the client reads. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof mockFetch>, call = 0): URL {
  const [url] = fetchMock.mock.calls[call] ?? [];
  return url as URL;
}

function requestHeaders(fetchMock: ReturnType<typeof mockFetch>, call = 0): Record<string, string> {
  const [, init] = fetchMock.mock.calls[call] ?? [];
  return (init?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  vi.stubEnv("ZERION_API_KEY", "test-key");
  clearZerionCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authentication", () => {
  it("sends the key as the Basic username with an empty password", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }));

    await zerionFetch("/v1/chains/");

    expect(requestHeaders(fetchMock).Authorization).toBe(`Basic ${btoa("test-key:")}`);
    expect(requestHeaders(fetchMock).Accept).toBe("application/json");
  });

  it("reads the key on every call, so a rotated key is picked up", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }), jsonResponse({ data: [] }));

    await zerionFetch("/v1/fungibles/eth");
    vi.stubEnv("ZERION_API_KEY", "rotated-key");
    await zerionFetch("/v1/fungibles/usdc");

    expect(requestHeaders(fetchMock, 0).Authorization).toBe(`Basic ${btoa("test-key:")}`);
    expect(requestHeaders(fetchMock, 1).Authorization).toBe(`Basic ${btoa("rotated-key:")}`);
  });

  it("refuses to call without a key, and never names it in the failure", async () => {
    vi.stubEnv("ZERION_API_KEY", "");
    const fetchMock = mockFetch(jsonResponse({ data: [] }));

    await expect(zerionFetch("/v1/chains/")).rejects.toThrow("ZERION_API_KEY is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the request URL", () => {
  it("resolves a path against the Zerion origin and defaults the currency to usd", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }));

    await zerionFetch("/v1/chains/");

    expect(requestedUrl(fetchMock).toString()).toBe("https://api.zerion.io/v1/chains/?currency=usd");
  });

  it("sorts parameters by name, joins arrays with commas and drops undefined", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }));

    await zerionFetch("/v1/wallets/0xabc/transactions/", {
      "page[size]": 100,
      "filter[chain_ids]": ["ethereum", "base"],
      "filter[trash]": "only_non_trash",
      "filter[min_mined_at]": undefined,
    });

    expect(requestedUrl(fetchMock).search).toBe(
      "?currency=usd&filter%5Bchain_ids%5D=ethereum%2Cbase&filter%5Btrash%5D=only_non_trash&page%5Bsize%5D=100",
    );
  });

  it("follows an absolute links.next cursor as returned, keeping its own parameters", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }));

    await zerionFetch("https://api.zerion.io/v1/wallets/0xabc/transactions/?page%5Bafter%5D=cursor-2&currency=eur");

    expect(requestedUrl(fetchMock).toString()).toBe(
      "https://api.zerion.io/v1/wallets/0xabc/transactions/?currency=eur&page%5Bafter%5D=cursor-2",
    );
  });

  it("refuses a path that resolves off the Zerion origin", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }));

    await expect(zerionFetch("https://evil.example/v1/chains/")).rejects.toThrow("must resolve to");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a successful response", () => {
  it("returns the parsed body", async () => {
    mockFetch(jsonResponse({ data: [{ id: "ethereum" }] }));

    const result = await zerionFetch<{ data: { id: string }[] }>("/v1/chains/");

    expect(result).toEqual({ ok: true, data: { data: [{ id: "ethereum" }] } });
  });
});

describe("the response cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves a repeated call from memory instead of calling upstream again", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [{ id: "ethereum" }] }));

    const first = await zerionFetch("/v1/fungibles/eth");
    const second = await zerionFetch("/v1/fungibles/eth");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("keys by path and sorted params, so parameter order is not a different call", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }));

    await zerionFetch("/v1/wallets/0xabc/transactions/", { "page[size]": 100, "filter[trash]": "only_non_trash" });
    await zerionFetch("/v1/wallets/0xabc/transactions/", { "filter[trash]": "only_non_trash", "page[size]": 100 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a different param value as a different call", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }), jsonResponse({ data: [] }));

    await zerionFetch("/v1/wallets/0xabc/transactions/", { "page[size]": 100 });
    await zerionFetch("/v1/wallets/0xabc/transactions/", { "page[size]": 50 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("expires an ordinary response after ten minutes", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: "first" }), jsonResponse({ data: "second" }));

    await zerionFetch("/v1/fungibles/eth");
    vi.advanceTimersByTime(10 * 60 * 1000 - 1);
    await zerionFetch("/v1/fungibles/eth");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    const afterExpiry = await zerionFetch("/v1/fungibles/eth");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(afterExpiry).toEqual({ ok: true, data: { data: "second" } });
  });

  it("keeps chains for twenty-four hours", async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }), jsonResponse({ data: [] }));

    await zerionFetch("/v1/chains/");
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1);
    await zerionFetch("/v1/chains/");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await zerionFetch("/v1/chains/");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never caches a failure", async () => {
    const fetchMock = mockFetch(jsonResponse({ errors: [] }, 500), jsonResponse({ data: [] }));

    const failure = await zerionFetch("/v1/fungibles/eth");
    const retry = await zerionFetch("/v1/fungibles/eth");

    expect(failure.ok).toBe(false);
    expect(retry).toEqual({ ok: true, data: { data: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used entry once it is full", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    // Fill the cache, then keep the first entry warm while one more call overflows it.
    for (let index = 0; index < 200; index++) await zerionFetch(`/v1/fungibles/token-${index}`);
    await zerionFetch("/v1/fungibles/token-0");
    const callsBeforeOverflow = fetchMock.mock.calls.length;
    await zerionFetch("/v1/fungibles/token-200");

    // token-1 was evicted; token-0 stayed, because reading it made it the most recent.
    await zerionFetch("/v1/fungibles/token-0");
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeOverflow + 1);
    await zerionFetch("/v1/fungibles/token-1");
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeOverflow + 2);
  });
});

describe("a rate-limited upstream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries after 500ms, 1s and 2s, then reports rate_limited", async () => {
    const fetchMock = mockFetch(
      jsonResponse({}, 429),
      jsonResponse({}, 429),
      jsonResponse({}, 429),
      jsonResponse({}, 429),
    );

    const pending = zerionFetch("/v1/wallets/0xabc/transactions/");

    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await expect(pending).resolves.toEqual({ ok: false, error: "rate_limited" });
  });

  it("returns the response when a retry succeeds", async () => {
    mockFetch(jsonResponse({}, 429), jsonResponse({ data: [] }));

    const pending = zerionFetch("/v1/chains/");
    await vi.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toEqual({ ok: true, data: { data: [] } });
  });

  it("stops retrying when the caller aborts during a backoff", async () => {
    const controller = new AbortController();
    const fetchMock = mockFetch(jsonResponse({}, 429), jsonResponse({ data: [] }));

    const pending = zerionFetch("/v1/chains/", {}, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();

    await expect(pending).rejects.toThrowError(expect.objectContaining({ name: "AbortError" }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("error mapping", () => {
  it.each([
    { status: 400, error: "invalid_address" },
    { status: 422, error: "invalid_address" },
    { status: 404, error: "not_found" },
    { status: 401, error: "upstream" },
    { status: 500, error: "upstream" },
    { status: 503, error: "upstream" },
  ])("maps $status to $error", async ({ status, error }) => {
    mockFetch(jsonResponse({ errors: [{ title: "Upstream detail", detail: "leak me" }] }, status));

    const result = await zerionFetch("/v1/wallets/not-an-address/transactions/");

    expect(result).toEqual({ ok: false, error });
  });

  it("never reads a failed response's body, so no upstream message can escape", async () => {
    const json = vi.fn(async () => ({ errors: [{ title: "Wallet address is invalid" }] }));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 400, json } as unknown as Response),
    );

    const result = await zerionFetch("/v1/wallets/not-an-address/transactions/");

    expect(json).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toBe(JSON.stringify({ ok: false, error: "invalid_address" }));
  });

  it("maps a transport failure to upstream", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")));

    await expect(zerionFetch("/v1/chains/")).resolves.toEqual({ ok: false, error: "upstream" });
  });

  it("maps an unparseable body to upstream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      } as unknown as Response),
    );

    await expect(zerionFetch("/v1/chains/")).resolves.toEqual({ ok: false, error: "upstream" });
  });

  it("propagates an abort raised by fetch itself", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new DOMException("This operation was aborted", "AbortError")),
    );

    await expect(zerionFetch("/v1/chains/", {}, { signal: controller.signal })).rejects.toThrowError(
      expect.objectContaining({ name: "AbortError" }),
    );
  });
});
