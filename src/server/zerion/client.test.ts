import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zerionFetch } from "#/server/zerion/client.ts";

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
