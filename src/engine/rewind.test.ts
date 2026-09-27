/**
 * The engine's aggregation rules, as the examples and required cases in the engine rule state them.
 *
 * The `vitalik.eth` fixtures were recorded on 2026-09-27, so every test that feeds them injects an
 * instant on that day. Real data drifts, so those tests assert the rules (order, totals, the tie
 * chain, the transfer fallback), never a balance the next recording would move.
 *
 * The recorded fixtures are raw Zerion documents; the trimming the server applies to them is the
 * engine's real input, so the tests trim first rather than keeping a second, hand-edited copy of
 * the same responses.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accumulate, createState, finalize, MAX_TRANSACTIONS, topFungible } from "#/engine/rewind.ts";
import type { Address } from "#/engine/types.ts";
import type { BalanceChart, ChainLite, TransactionsPage, TransferLite, TxLite } from "#/engine/zerion.ts";
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

/* ---- The recorded wallet ---- */

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8")) as T;
}

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as Address;
/** The day the fixtures were recorded — the only instant that puts them inside the window. */
const RECORDED_AT = new Date("2026-09-27T14:00:00Z");

const recordedPages = [
  trimTransactionsPage(fixture<RawTransactionsDocument>("transactions-p1.vitalik.eth.json")),
  trimTransactionsPage(fixture<RawTransactionsDocument>("transactions-p2.vitalik.eth.json")),
];
const recordedChains = trimChains(fixture<RawChainsDocument>("chains.json"));
const recordedChart = trimBalanceChart(fixture<RawChartDocument>("chart-year.vitalik.eth.json"));
const recordedEth = trimFungible(fixture<RawFungibleDocument>("fungible-eth.json"));

function recordedFacts() {
  let state = createState({ wallet: { name: "vitalik.eth", address: VITALIK }, now: RECORDED_AT });
  for (const page of recordedPages) state = accumulate(state, page);
  return { state, facts: finalize(state, { chains: recordedChains, chart: recordedChart, fungible: recordedEth }) };
}

/* ---- Hand-made pages, for what a real wallet doesn't produce ---- */

let nextId = 0;
function tx(minedAt: string, over: Partial<Omit<TxLite, "minedAt">> = {}): TxLite {
  nextId += 1;
  return { id: `tx-${nextId}`, minedAt, operationType: "receive", transfers: [], ...over };
}

function page(items: TxLite[], next: string | null = null): TransactionsPage {
  return { items, next, count: items.length };
}

function transfer(symbol: string, value: number | null, id?: string): TransferLite {
  return {
    direction: "in",
    value,
    fungible: { ...(id ? { id } : {}), symbol, name: `${symbol} token` },
  };
}

const NOW = new Date("2026-12-31T12:00:00Z");
const walletOf = (address: string) => ({ address: address as Address });

function factsFrom(pages: TransactionsPage[], extras: Parameters<typeof finalize>[1] = {}, now = NOW) {
  let state = createState({ wallet: walletOf("0x1111111111111111111111111111111111111111"), now });
  for (const p of pages) state = accumulate(state, p);
  return { state, facts: finalize(state, extras) };
}

function chart(points: [string, number][]): BalanceChart {
  return {
    beginAt: `${points[0]?.[0] ?? "2026-01-01"}T00:00:00Z`,
    endAt: `${points[points.length - 1]?.[0] ?? "2026-12-31"}T00:00:00Z`,
    points: points.map(([date, value]) => ({ ts: Date.parse(`${date}T00:00:00Z`) / 1000, value })),
  };
}

/* ---- Example 1: chain shares ---- */

describe("chain shares", () => {
  it("uses largest remainder so the shares total exactly 100", () => {
    const items = [
      ...Array.from({ length: 5 }, () => tx("2026-06-01T00:00:00Z", { chainId: "ethereum" })),
      ...Array.from({ length: 3 }, () => tx("2026-06-01T00:00:00Z", { chainId: "base" })),
      ...Array.from({ length: 3 }, () => tx("2026-06-01T00:00:00Z", { chainId: "arbitrum" })),
    ];
    const chains: ChainLite[] = [
      { id: "ethereum", name: "Ethereum", iconUrl: "https://example.test/ethereum.png" },
      { id: "base", name: "Base" },
      { id: "arbitrum", name: "Arbitrum" },
    ];

    const { facts } = factsFrom([page(items)], { chains });

    expect(facts.txCount).toBe(11);
    expect(facts.chains.map((c) => c.id)).toEqual(["ethereum", "base", "arbitrum"]);
    expect(facts.chains.map((c) => c.share)).toEqual([46, 27, 27]);
    expect(facts.chains.reduce((total, c) => total + c.share, 0)).toBe(100);
    expect(facts.chainCount).toBe(3);
    expect(facts.chains[0]?.name).toBe("Ethereum");
    expect(facts.chains[0]?.iconUrl).toBe("https://example.test/ethereum.png");
    expect(facts.chains[1]?.iconUrl).toBeUndefined();
  });

  it("gives a single chain the whole 100", () => {
    const items = Array.from({ length: 7 }, () => tx("2026-06-01T00:00:00Z", { chainId: "ethereum" }));

    const { facts } = factsFrom([page(items)], { chains: [{ id: "ethereum", name: "Ethereum" }] });

    expect(facts.chains).toHaveLength(1);
    expect(facts.chains[0]?.share).toBe(100);
    expect(facts.chainCount).toBe(1);
  });

  it("falls back to the chain id when the chain lookup doesn't carry it", () => {
    const { facts } = factsFrom([page([tx("2026-06-01T00:00:00Z", { chainId: "unlisted" })])]);

    expect(facts.chains[0]?.name).toBe("unlisted");
  });
});

/* ---- Example 2: the balance summary ---- */

describe("balance", () => {
  it("takes high and low from real points and compares first to last", () => {
    const series = chart([
      ["2026-01-01", 1000],
      ["2026-06-10", 640],
      ["2026-11-02", 2400],
      ["2026-12-31", 1800],
    ]);

    const { facts } = factsFrom([page([tx("2026-06-01T00:00:00Z", { chainId: "ethereum" })])], { chart: series });

    expect(facts.balance?.series).toHaveLength(4);
    expect(facts.balance?.high).toEqual({ date: "2026-11-02", value: 2400 });
    expect(facts.balance?.low).toEqual({ date: "2026-06-10", value: 640 });
    expect(facts.balance?.current).toBe(1800);
    expect(facts.balance?.changePct).toBe(80);
    expect(facts.balance?.series.map((p) => p.date)).toEqual(["2026-01-01", "2026-06-10", "2026-11-02", "2026-12-31"]);
  });

  it("reports a negative change when the year ended lower", () => {
    const series = chart([
      ["2026-01-01", 4200],
      ["2026-12-31", 1480],
    ]);

    const { facts } = factsFrom([page([tx("2026-06-01T00:00:00Z", { chainId: "ethereum" })])], { chart: series });

    expect(facts.balance?.changePct).toBe(-64.8);
  });

  it("leaves balance undefined with fewer than 2 points", () => {
    const one = factsFrom([page([tx("2026-06-01T00:00:00Z")])], { chart: chart([["2026-01-01", 1000]]) });
    const none = factsFrom([page([tx("2026-06-01T00:00:00Z")])], { chart: chart([]) });
    const missing = factsFrom([page([tx("2026-06-01T00:00:00Z")])], { chart: null });

    expect(one.facts.balance).toBeUndefined();
    expect(none.facts.balance).toBeUndefined();
    expect(missing.facts.balance).toBeUndefined();
  });

  it("leaves balance undefined when the first point is zero, rather than reporting an infinite change", () => {
    const series = chart([
      ["2026-01-01", 0],
      ["2026-12-31", 1480],
    ]);

    const { facts } = factsFrom([page([tx("2026-06-01T00:00:00Z")])], { chart: series });

    expect(facts.balance).toBeUndefined();
  });
});

/* ---- Example 3: the empty wallet ---- */

describe("empty wallet", () => {
  it("reports zeros and leaves every optional undefined", () => {
    const { state, facts } = factsFrom([page([])]);

    expect(facts.txCount).toBe(0);
    expect(facts.chains).toEqual([]);
    expect(facts.chainCount).toBe(0);
    expect(facts.daysOnchain).toBe(0);
    expect(facts.firstTx).toBeUndefined();
    expect(facts.topToken).toBeUndefined();
    expect(facts.balance).toBeUndefined();
    expect(state.capped).toBe(false);
  });

  it("carries the wallet through even with nothing to say about it", () => {
    const { facts } = factsFrom([page([])]);

    expect(facts.wallet.address).toBe("0x1111111111111111111111111111111111111111");
    expect(facts.wallet.name).toBeUndefined();
  });
});

/* ---- The cap ---- */

describe("the 2,000 cap", () => {
  const fullPages = () =>
    Array.from({ length: MAX_TRANSACTIONS / 100 }, (_, index) =>
      page(
        Array.from({ length: 100 }, () => tx("2026-06-01T00:00:00Z", { chainId: "ethereum" })),
        `https://api.zerion.io/v1/wallets/x/transactions/?page=${index + 2}`,
      ),
    );

  it("stops counting at the cap and marks the state capped", () => {
    const { state, facts } = factsFrom(fullPages());

    expect(facts.txCount).toBe(MAX_TRANSACTIONS);
    expect(state.capped).toBe(true);
  });

  it("stays uncapped when the last page inside the cap is the last page", () => {
    const pages = fullPages();
    const last = pages[pages.length - 1];
    const { state, facts } = factsFrom([...pages.slice(0, -1), page(last?.items ?? [], null)]);

    expect(facts.txCount).toBe(MAX_TRANSACTIONS);
    expect(state.capped).toBe(false);
  });

  it("drops what the cap hides rather than counting past it", () => {
    const { state, facts } = factsFrom([
      ...fullPages(),
      page(Array.from({ length: 100 }, () => tx("2026-06-01T00:00:00Z", { chainId: "base" }))),
    ]);

    expect(facts.txCount).toBe(MAX_TRANSACTIONS);
    expect(facts.chains.map((c) => c.id)).toEqual(["ethereum"]);
    expect(state.capped).toBe(true);
  });
});

/* ---- The window ---- */

describe("the window", () => {
  it("counts only the last 365 days, from the injected instant", () => {
    const { facts } = factsFrom([
      page([
        tx("2026-12-30T00:00:00Z", { chainId: "ethereum" }),
        tx("2026-01-02T00:00:00Z", { chainId: "ethereum" }),
        // 366 days before `NOW` — one day outside the window.
        tx("2025-12-30T12:00:00Z", { chainId: "base" }),
      ]),
    ]);

    expect(facts.txCount).toBe(2);
    expect(facts.chains.map((c) => c.id)).toEqual(["ethereum"]);
  });

  it("never reads the clock: the same pages under a later instant say something different", () => {
    const pages = [page([tx("2026-06-01T00:00:00Z", { chainId: "ethereum" })])];

    const inWindow = factsFrom(pages, {}, new Date("2026-12-31T12:00:00Z"));
    const outOfWindow = factsFrom(pages, {}, new Date("2028-12-31T12:00:00Z"));

    expect(inWindow.facts.txCount).toBe(1);
    expect(outOfWindow.facts.txCount).toBe(0);
  });
});

/* ---- firstTx and daysOnchain ---- */

describe("firstTx and daysOnchain", () => {
  it("takes the oldest transaction in the window, whichever page it arrived on", () => {
    const { facts } = factsFrom(
      [
        page([tx("2026-12-30T09:00:00Z", { chainId: "base" })], "https://api.zerion.io/next"),
        page([tx("2026-03-04T23:59:59Z", { chainId: "ethereum" })]),
      ],
      { chains: [{ id: "ethereum", name: "Ethereum" }] },
    );

    expect(facts.firstTx?.date).toBe("2026-03-04");
    expect(facts.firstTx?.chainName).toBe("Ethereum");
  });

  it("counts days onchain from that date to the injected instant, both days included", () => {
    const { facts } = factsFrom([page([tx("2026-12-01T00:00:00Z", { chainId: "ethereum" })])]);

    // 2026-12-01 through 2026-12-31.
    expect(facts.daysOnchain).toBe(31);
  });

  it("counts a wallet that started today as one day onchain", () => {
    const { facts } = factsFrom([page([tx("2026-12-31T08:00:00Z", { chainId: "ethereum" })])]);

    expect(facts.daysOnchain).toBe(1);
  });

  it("leaves the chain name off when the chain lookup doesn't carry the chain", () => {
    const { facts } = factsFrom([page([tx("2026-12-01T00:00:00Z", { chainId: "unlisted" })])]);

    expect(facts.firstTx?.date).toBe("2026-12-01");
    expect(facts.firstTx?.chainName).toBeUndefined();
  });
});

/* ---- topToken ---- */

describe("topToken", () => {
  const trade = (symbol: string, value: number, id: string) =>
    tx("2026-06-01T00:00:00Z", {
      chainId: "ethereum",
      operationType: "trade",
      transfers: [transfer(symbol, value, id)],
    });

  it("counts trades first and reads the change from the fetched fungible", () => {
    const items = [
      ...Array.from({ length: 3 }, () => trade("PEPE", 10, "pepe")),
      trade("ETH", 10, "eth"),
      tx("2026-06-01T00:00:00Z", { chainId: "ethereum", transfers: [transfer("ETH", 10, "eth")] }),
      tx("2026-06-01T00:00:00Z", { chainId: "ethereum", transfers: [transfer("ETH", 10, "eth")] }),
    ];

    const { state, facts } = factsFrom([page(items)], {
      fungible: {
        id: "pepe",
        symbol: "PEPE",
        name: "Pepe",
        iconUrl: "https://example.test/pepe.png",
        changePct365d: -42.68,
      },
    });

    expect(topFungible(state)?.ref.id).toBe("pepe");
    expect(facts.topToken?.symbol).toBe("PEPE");
    expect(facts.topToken?.name).toBe("Pepe");
    expect(facts.topToken?.iconUrl).toBe("https://example.test/pepe.png");
    expect(facts.topToken?.timesTraded).toBe(3);
    expect(facts.topToken?.changePct).toBe(-42.7);
  });

  it("falls back to transfers when the wallet made no trade", () => {
    const items = [
      ...Array.from({ length: 4 }, () =>
        tx("2026-06-01T00:00:00Z", { chainId: "ethereum", transfers: [transfer("USDC", 5, "usdc")] }),
      ),
      tx("2026-06-01T00:00:00Z", { chainId: "ethereum", transfers: [transfer("ETH", 5, "eth")] }),
    ];

    const { state, facts } = factsFrom([page(items)], {
      fungible: { id: "usdc", symbol: "USDC", name: "USD Coin", changePct365d: 0.1 },
    });

    expect(topFungible(state)?.timesTraded).toBe(4);
    expect(facts.topToken?.symbol).toBe("USDC");
    expect(facts.topToken?.timesTraded).toBe(4);
  });

  it("counts a fungible once per transaction, however many transfers carry it", () => {
    const items = [
      tx("2026-06-01T00:00:00Z", {
        chainId: "ethereum",
        operationType: "trade",
        transfers: [transfer("ETH", 100, "eth"), { ...transfer("ETH", 40, "eth"), direction: "out" }],
      }),
    ];

    const { state } = factsFrom([page(items)]);

    expect(topFungible(state)?.timesTraded).toBe(1);
  });

  it("breaks a tie on USD volume, then alphabetically", () => {
    const byVolume = factsFrom([
      page([trade("AAA", 1, "aaa"), trade("AAA", 1, "aaa"), trade("ZZZ", 500, "zzz"), trade("ZZZ", 500, "zzz")]),
    ]);
    const byName = factsFrom([
      page([trade("ZZZ", 10, "zzz"), trade("ZZZ", 10, "zzz"), trade("AAA", 10, "aaa"), trade("AAA", 10, "aaa")]),
    ]);

    expect(topFungible(byVolume.state)?.ref.symbol).toBe("ZZZ");
    expect(topFungible(byName.state)?.ref.symbol).toBe("AAA");
  });

  it("skips NFT transfers, which carry no fungible", () => {
    const items = [tx("2026-06-01T00:00:00Z", { chainId: "ethereum", transfers: [{ direction: "in", value: 900 }] })];

    const { state, facts } = factsFrom([page(items)]);

    expect(topFungible(state)).toBeUndefined();
    expect(facts.topToken).toBeUndefined();
  });

  it("hides the token rather than inventing a change when the fungible has no yearly market data", () => {
    const { facts } = factsFrom([page([trade("PEPE", 10, "pepe")])], {
      fungible: { id: "pepe", symbol: "PEPE", name: "Pepe", changePct365d: null },
    });

    expect(facts.topToken).toBeUndefined();
  });

  it("hides the token when the fetched fungible isn't the one the transactions named", () => {
    const { facts } = factsFrom([page([trade("PEPE", 10, "pepe")])], {
      fungible: { id: "eth", symbol: "ETH", name: "Ether", changePct365d: 12 },
    });

    expect(facts.topToken).toBeUndefined();
  });
});

/* ---- The recorded wallet ---- */

describe("the recorded wallet", () => {
  it("counts every transaction on both recorded pages", () => {
    const { facts } = recordedFacts();

    expect(facts.txCount).toBe(recordedPages.reduce((total, p) => total + p.count, 0));
    expect(facts.wallet.name).toBe("vitalik.eth");
    expect(facts.wallet.address).toBe(VITALIK);
  });

  it("orders the chains by share, descending, and totals exactly 100", () => {
    const { facts } = recordedFacts();
    const shares = facts.chains.map((c) => c.share);

    expect(facts.chainCount).toBe(facts.chains.length);
    expect(facts.chainCount).toBeGreaterThan(1);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
    expect(shares.reduce((total, share) => total + share, 0)).toBe(100);
    expect(facts.chains[0]?.name).toBe("Ethereum");
  });

  it("names the oldest recorded transaction as the start of the year", () => {
    const { facts } = recordedFacts();
    const oldest = recordedPages.flatMap((p) => p.items).reduce((a, b) => (a.minedAt <= b.minedAt ? a : b));

    expect(facts.firstTx?.date).toBe(oldest.minedAt.slice(0, 10));
    expect(facts.daysOnchain).toBeGreaterThan(0);
    expect(facts.daysOnchain).toBeLessThanOrEqual(366);
  });

  it("reads the balance year from the recorded chart", () => {
    const { facts } = recordedFacts();
    const series = facts.balance?.series ?? [];

    expect(series).toHaveLength(recordedChart?.points.length ?? 0);
    expect(facts.balance?.current).toBe(series[series.length - 1]?.value);
    expect(series).toContainEqual(facts.balance?.high);
    expect(series).toContainEqual(facts.balance?.low);
    expect(facts.balance?.high.value).toBeGreaterThanOrEqual(facts.balance?.low.value ?? 0);
  });

  it("falls back to transfers for the top token, which this wallet's year is made of", () => {
    const { state, facts } = recordedFacts();

    expect(topFungible(state)?.ref.id).toBe("eth");
    expect(facts.topToken?.symbol).toBe("ETH");
    expect(facts.topToken?.name).toBe("Ethereum");
    expect(facts.topToken?.timesTraded).toBe(38);
    // The recording caught ETH down over the year: a real negative change.
    expect(facts.topToken?.changePct).toBe(-32.8);
  });
});

/* ---- Purity ---- */

describe("purity", () => {
  const source = readFileSync(new URL("./rewind.ts", import.meta.url), "utf8");

  it("imports nothing from React, the server layer or any I/O", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1] ?? "");

    expect(imports).not.toHaveLength(0);
    for (const specifier of imports) {
      expect(specifier).toMatch(/^\.\//);
    }
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("fetch(");
  });

  it("leaves the state it was handed untouched", () => {
    const state = createState({ wallet: walletOf("0x1111111111111111111111111111111111111111"), now: NOW });
    const next = accumulate(state, page([tx("2026-06-01T00:00:00Z", { chainId: "ethereum" })]));

    expect(state.txCount).toBe(0);
    expect(state.chainCounts.size).toBe(0);
    expect(next.txCount).toBe(1);
  });
});
