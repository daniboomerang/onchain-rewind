import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readChains } from "#/server/zerion/chains.functions.ts";
import { clearZerionCache } from "#/server/zerion/client.ts";
import { readFungible } from "#/server/zerion/fungibles.functions.ts";
import { readBalanceChart, readTransactionsPage } from "#/server/zerion/wallets.functions.ts";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const LOWERCASE = ADDRESS.toLowerCase();

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof mockFetch>, call = 0): URL {
  const [url] = fetchMock.mock.calls[call] ?? [];
  return url as URL;
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

describe("readTransactionsPage", () => {
  it("asks for one non-trash page inside the 365-day window, and trims it", async () => {
    const fetchMock = mockFetch({
      links: { next: "https://api.zerion.io/v1/wallets/x/transactions/?page%5Bafter%5D=abc" },
      data: [
        {
          id: "tx-1",
          attributes: {
            operation_type: "trade",
            mined_at: "2026-09-27T13:14:11Z",
            transfers: [
              { direction: "in", value: 12.5, fungible_info: { id: "eth", name: "Ethereum", symbol: "ETH" } },
            ],
          },
          relationships: { chain: { data: { id: "ethereum" } } },
        },
      ],
    });

    const result = await readTransactionsPage({ address: ADDRESS });

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe(`/v1/wallets/${LOWERCASE}/transactions/`);
    expect(url.searchParams.get("currency")).toBe("usd");
    expect(url.searchParams.get("filter[trash]")).toBe("only_non_trash");
    expect(url.searchParams.get("page[size]")).toBe("100");

    // The window's lower bound is the start of a UTC day, 365 days back.
    const minMinedAt = Number(url.searchParams.get("filter[min_mined_at]"));
    const dayMs = 24 * 60 * 60 * 1000;
    expect(minMinedAt % dayMs).toBe(0);
    expect(Date.now() - minMinedAt).toBeGreaterThanOrEqual(365 * dayMs);
    expect(Date.now() - minMinedAt).toBeLessThan(366 * dayMs);

    expect(result).toEqual({
      ok: true,
      data: {
        count: 1,
        next: "https://api.zerion.io/v1/wallets/x/transactions/?page%5Bafter%5D=abc",
        items: [
          {
            id: "tx-1",
            minedAt: "2026-09-27T13:14:11Z",
            operationType: "trade",
            chainId: "ethereum",
            transfers: [{ direction: "in", value: 12.5, fungible: { id: "eth", name: "Ethereum", symbol: "ETH" } }],
          },
        ],
      },
    });
  });

  it("follows a links.next cursor exactly as returned, adding no parameters of its own", async () => {
    const next =
      "https://api.zerion.io/v1/wallets/x/transactions/?currency=usd&filter%5Btrash%5D=only_non_trash&page%5Bafter%5D=abc";
    const fetchMock = mockFetch({ links: {}, data: [] });

    const result = await readTransactionsPage({ address: ADDRESS, next });

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe("/v1/wallets/x/transactions/");
    expect(url.searchParams.get("page[after]")).toBe("abc");
    expect(url.searchParams.get("page[size]")).toBeNull();
    expect(result).toEqual({ ok: true, data: { items: [], next: null, count: 0 } });
  });

  it("refuses a malformed address, and a cursor that isn't a Zerion URL, without calling out", async () => {
    const fetchMock = mockFetch({ links: {}, data: [] });

    expect(await readTransactionsPage({ address: "vitalik.eth" })).toEqual({ ok: false, error: "invalid_address" });
    expect(await readTransactionsPage({ address: ADDRESS, next: "https://evil.example/pages" })).toEqual({
      ok: false,
      error: "upstream",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the client's typed failure through untouched", async () => {
    mockFetch({}, 503);
    expect(await readTransactionsPage({ address: ADDRESS })).toEqual({ ok: false, error: "upstream" });
  });
});

describe("readBalanceChart", () => {
  it("asks for the year period and trims the points to timestamp and value", async () => {
    const fetchMock = mockFetch({
      data: {
        type: "wallet_chart",
        attributes: {
          begin_at: "2025-09-28T00:00:00Z",
          end_at: "2026-09-28T00:00:00Z",
          points: [
            [1759017600, 4432712.97],
            [1759104000, 4330943.95],
          ],
        },
      },
    });

    const result = await readBalanceChart({ address: ADDRESS });

    expect(requestedUrl(fetchMock).pathname).toBe(`/v1/wallets/${LOWERCASE}/charts/year`);
    expect(result).toEqual({
      ok: true,
      data: {
        beginAt: "2025-09-28T00:00:00Z",
        endAt: "2026-09-28T00:00:00Z",
        points: [
          { ts: 1759017600, value: 4432712.97 },
          { ts: 1759104000, value: 4330943.95 },
        ],
      },
    });
  });

  it("reports a chart with no window as not found", async () => {
    mockFetch({ data: { type: "wallet_chart", attributes: {} } });
    expect(await readBalanceChart({ address: ADDRESS })).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses a malformed address", async () => {
    const fetchMock = mockFetch({});
    expect(await readBalanceChart({ address: "0xnope" })).toEqual({ ok: false, error: "invalid_address" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("readChains", () => {
  it("trims each chain to id, name and icon", async () => {
    const fetchMock = mockFetch({
      data: [
        { id: "ethereum", attributes: { name: "Ethereum", icon: { url: "https://cdn/eth.png" } } },
        { id: "base", attributes: { name: "Base", icon: null } },
      ],
    });

    const result = await readChains();

    expect(requestedUrl(fetchMock).pathname).toBe("/v1/chains/");
    expect(result).toEqual({
      ok: true,
      data: [
        { id: "ethereum", name: "Ethereum", iconUrl: "https://cdn/eth.png" },
        { id: "base", name: "Base" },
      ],
    });
  });
});

describe("readFungible", () => {
  it("returns the yearly price change from market data", async () => {
    const fetchMock = mockFetch({
      data: {
        id: "eth",
        attributes: {
          name: "Ethereum",
          symbol: "ETH",
          icon: { url: "https://cdn.zerion.io/eth.png" },
          market_data: { price: 2705.32, changes: { percent_1d: 0.69, percent_365d: -32.36 } },
        },
      },
    });

    const result = await readFungible({ id: "eth" });

    expect(requestedUrl(fetchMock).pathname).toBe("/v1/fungibles/eth");
    expect(result).toEqual({
      ok: true,
      data: {
        id: "eth",
        name: "Ethereum",
        symbol: "ETH",
        iconUrl: "https://cdn.zerion.io/eth.png",
        changePct365d: -32.36,
      },
    });
  });

  it("reports a missing yearly change as null rather than zero", async () => {
    mockFetch({ data: { id: "zc", attributes: { name: "zipcoins", symbol: "zc", market_data: { price: null } } } });
    expect(await readFungible({ id: "zc" })).toEqual({
      ok: true,
      data: { id: "zc", name: "zipcoins", symbol: "zc", changePct365d: null },
    });
  });

  it("refuses an id that could escape the fungibles path", async () => {
    const fetchMock = mockFetch({});
    expect(await readFungible({ id: "../wallets/0xdead/transactions/" })).toEqual({ ok: false, error: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
