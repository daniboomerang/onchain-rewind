/**
 * Trimming, against the real responses recorded for `vitalik.eth` on 2026-09-27.
 * The data drifts: these tests assert shapes and invariants, never specific balances or counts
 * beyond what the recording fixes (a full page is 100 transactions, a year is 366 daily points).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type RawChainsDocument,
  type RawChartDocument,
  type RawFungibleDocument,
  type RawTransactionsDocument,
  trimBalanceChart,
  trimChains,
  trimFungible,
  trimTransactionsPage,
} from "#/server/zerion/trim.ts";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../../engine/__fixtures__/${name}`, import.meta.url), "utf8")) as T;
}

const page1 = fixture<RawTransactionsDocument>("transactions-p1.vitalik.eth.json");
const page2 = fixture<RawTransactionsDocument>("transactions-p2.vitalik.eth.json");

describe("trimTransactionsPage", () => {
  it("keeps every transaction on a full page, and counts what it kept", () => {
    const page = trimTransactionsPage(page1);

    expect(page.items).toHaveLength(100);
    expect(page.count).toBe(page.items.length);
  });

  it("returns links.next as the absolute Zerion URL to follow", () => {
    const page = trimTransactionsPage(page1);

    expect(page.next).toMatch(/^https:\/\/api\.zerion\.io\/v1\/wallets\/0x[0-9a-f]{40}\/transactions\//);
    expect(page.next).toContain("page%5Bafter%5D=");
  });

  it("gives every transaction an id, a UTC timestamp, an operation type and a chain", () => {
    for (const tx of trimTransactionsPage(page1).items) {
      expect(tx.id).not.toBe("");
      expect(tx.minedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(tx.operationType).not.toBe("");
      expect(tx.chainId).toBeDefined();
    }
  });

  it("keeps the page newest-first, which is the only order the endpoint offers", () => {
    const minedAt = trimTransactionsPage(page1).items.map((tx) => Date.parse(tx.minedAt));
    const descending = [...minedAt].sort((a, b) => b - a);

    expect(minedAt).toEqual(descending);
    // The second page continues below the first.
    const oldestOnPage1 = Math.min(...minedAt);
    const newestOnPage2 = Math.max(...trimTransactionsPage(page2).items.map((tx) => Date.parse(tx.minedAt)));
    expect(newestOnPage2).toBeLessThanOrEqual(oldestOnPage1);
  });

  it("keeps a transfer's direction and USD value, and drops an NFT transfer's missing fungible", () => {
    const transfers = trimTransactionsPage(page1).items.flatMap((tx) => tx.transfers);

    expect(transfers.length).toBeGreaterThan(0);
    for (const transfer of transfers) {
      expect(["in", "out", "self"]).toContain(transfer.direction);
      expect(transfer.value === null || typeof transfer.value === "number").toBe(true);
      if (transfer.fungible) {
        expect(transfer.fungible.symbol).not.toBe("");
        expect(transfer.fungible.name).not.toBe("");
      }
    }

    // The recording carries NFT transfers, which have no fungible to count.
    expect(transfers.some((transfer) => transfer.fungible === undefined)).toBe(true);
  });

  it("returns an empty page rather than failing when a wallet has nothing in the window", () => {
    expect(trimTransactionsPage({ links: {}, data: [] })).toEqual({ items: [], next: null, count: 0 });
    expect(trimTransactionsPage({})).toEqual({ items: [], next: null, count: 0 });
  });

  it("drops a transaction with no timestamp instead of guessing one", () => {
    const page = trimTransactionsPage({
      data: [{ id: "tx-1", attributes: { operation_type: "send" } }, ...(page1.data ?? []).slice(0, 1)],
    });

    expect(page.count).toBe(1);
    expect(page.items[0]?.id).not.toBe("tx-1");
  });
});

describe("trimChains", () => {
  it("trims every chain to an id, a name and an icon", () => {
    const chains = trimChains(fixture<RawChainsDocument>("chains.json"));

    expect(chains.length).toBeGreaterThan(20);
    for (const chain of chains) {
      expect(chain.id).not.toBe("");
      expect(chain.name).not.toBe("");
      expect(chain.iconUrl).toMatch(/^https:\/\//);
    }
    expect(chains.map((chain) => chain.id)).toContain("ethereum");
  });

  it("keeps a chain that has no icon", () => {
    expect(trimChains({ data: [{ id: "somewhere", attributes: { name: "Somewhere", icon: null } }] })).toEqual([
      { id: "somewhere", name: "Somewhere" },
    ]);
  });
});

describe("trimFungible", () => {
  it("reads the yearly price change from market data", () => {
    const fungible = trimFungible(fixture<RawFungibleDocument>("fungible-eth.json"));

    expect(fungible).toEqual({
      id: "eth",
      name: "Ethereum",
      symbol: "ETH",
      iconUrl: "https://cdn.zerion.io/eth.png",
      changePct365d: expect.any(Number),
    });
  });

  it("reports an unusable document as null, for the caller to turn into not_found", () => {
    expect(trimFungible({})).toBeNull();
    expect(trimFungible({ data: { id: "eth", attributes: { name: "Ethereum" } } })).toBeNull();
  });
});

describe("trimBalanceChart", () => {
  it("returns a year of daily points, oldest first, with the window Zerion reported", () => {
    const chart = trimBalanceChart(fixture<RawChartDocument>("chart-year.vitalik.eth.json"));

    expect(chart).not.toBeNull();
    if (!chart) return;

    expect(chart.points).toHaveLength(366);
    expect(Date.parse(chart.endAt) - Date.parse(chart.beginAt)).toBe(365 * 24 * 60 * 60 * 1000);

    const timestamps = chart.points.map((point) => point.ts);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
    for (const point of chart.points) expect(typeof point.value).toBe("number");

    const [first, second] = chart.points;
    expect((second?.ts ?? 0) - (first?.ts ?? 0)).toBe(24 * 60 * 60);
  });

  it("drops a malformed point and keeps the rest", () => {
    const chart = trimBalanceChart({
      data: {
        attributes: {
          begin_at: "2025-09-28T00:00:00Z",
          end_at: "2026-09-28T00:00:00Z",
          points: [[1, 2], [3], ["x", 4], [5, 6]],
        },
      },
    });

    expect(chart?.points).toEqual([
      { ts: 1, value: 2 },
      { ts: 5, value: 6 },
    ]);
  });

  it("reports a chart with no window as null", () => {
    expect(trimBalanceChart({})).toBeNull();
    expect(trimBalanceChart({ data: { attributes: { begin_at: "2025-09-28T00:00:00Z" } } })).toBeNull();
  });
});
