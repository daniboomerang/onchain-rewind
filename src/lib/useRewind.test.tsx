// @vitest-environment happy-dom
/**
 * `useRewind`, proven without a network and without a browser.
 *
 * Every run here is driven by a scripted `RewindApi`, so the paging loop, the cap, the timeout,
 * the failure path and cancellation are all observable as values and callback order rather than as
 * pixels. The instant the window ends is injected, which is what makes the dates below fixed.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import type { Address } from "#/engine/types.ts";
import type { BalanceChart, ChainLite, FungibleLite, TransactionsPage, TxLite } from "#/engine/zerion.ts";
import { type RewindApi, TIMEOUT_MS, type UseRewindOptions, useRewind } from "#/lib/useRewind.ts";
import type { ZerionResult } from "#/server/zerion/client.ts";

const ADDRESS = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045" as Address;
/** Every date the tests assert is relative to this instant. */
const NOW = new Date("2026-09-27T12:00:00Z");

const CHAINS: ChainLite[] = [
  { id: "ethereum", name: "Ethereum", iconUrl: "https://chain.test/ethereum.png" },
  { id: "base", name: "Base" },
];

const ETH: FungibleLite = {
  id: "eth",
  symbol: "ETH",
  name: "Ethereum",
  iconUrl: "https://token.test/eth.png",
  changePct365d: -32.769575478149726,
};

const seconds = (iso: string) => Date.parse(iso) / 1000;

const CHART: BalanceChart = {
  beginAt: "2025-09-27T00:00:00Z",
  endAt: "2026-09-27T00:00:00Z",
  points: [
    { ts: seconds("2025-10-01T00:00:00Z"), value: 1000 },
    { ts: seconds("2026-03-01T00:00:00Z"), value: 2400 },
    { ts: seconds("2026-09-27T00:00:00Z"), value: 1800 },
  ],
};

/** One `trade` of ETH on `chainId`, priced so the top-token tally has something to add up. */
function tx(id: string, minedAt: string, chainId: string): TxLite {
  return {
    id,
    minedAt,
    operationType: "trade",
    chainId,
    transfers: [{ direction: "out", value: 100, fungible: { id: "eth", symbol: "ETH", name: "Ethereum" } }],
  };
}

function page(items: TxLite[], next: string | null): ZerionResult<TransactionsPage> {
  return { ok: true, data: { items, next, count: items.length } };
}

const cursor = (n: number) => `https://api.zerion.io/v1/wallets/${ADDRESS}/transactions/?page[after]=${n}`;

type Script = {
  /** Consumed one per `transactionsPage` call, in order. */
  readonly pages: readonly ZerionResult<TransactionsPage>[];
  readonly chains?: ZerionResult<readonly ChainLite[]>;
  readonly fungible?: ZerionResult<FungibleLite>;
  readonly chart?: ZerionResult<BalanceChart>;
};

type Calls = {
  /** The input of every `transactionsPage` call, so the cursor hand-off is observable. */
  readonly pages: { readonly address: string; readonly next?: string }[];
  readonly fungibles: string[];
  /** Every signal handed to the api, so "the run's signal reaches every call" is checkable. */
  readonly signals: AbortSignal[];
};

function fakeApi(script: Script): { api: RewindApi; calls: Calls } {
  const calls: Calls = { pages: [], fungibles: [], signals: [] };
  let index = 0;

  const api: RewindApi = {
    transactionsPage: async (input, signal) => {
      calls.pages.push(input);
      calls.signals.push(signal);
      const result = script.pages[index];
      index += 1;
      if (!result) throw new Error(`the script has no page ${index}`);
      return result;
    },
    chains: async (signal) => {
      calls.signals.push(signal);
      return script.chains ?? { ok: true, data: CHAINS };
    },
    fungible: async (id, signal) => {
      calls.fungibles.push(id);
      calls.signals.push(signal);
      return script.fungible ?? { ok: true, data: ETH };
    },
    balanceChart: async (_address, signal) => {
      calls.signals.push(signal);
      return script.chart ?? { ok: true, data: CHART };
    },
  };

  return { api, calls };
}

/** The callbacks, recorded as one ordered trace: the order is half of what the reveal depends on. */
function recorder() {
  const trace: string[] = [];
  return {
    trace,
    onPage: (count: number) => trace.push(`page:${count}`),
    onComplete: (finalCount: number) => trace.push(`complete:${finalCount}`),
    onFail: () => trace.push("fail"),
  };
}

function renderRewind(options: UseRewindOptions) {
  // A fresh client per run, so no test reads another's cached chains, fungible or chart.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook((props: UseRewindOptions) => useRewind(props), { initialProps: options, wrapper });
}

/* ---- O1, O2: paging, the engine, and the facts the extras complete ---- */

test("pages until the last page, reporting what each page added as it arrives", async () => {
  const { onPage, onComplete, onFail, trace } = recorder();
  const { api, calls } = fakeApi({
    pages: [
      page([tx("a", "2026-09-20T10:00:00Z", "ethereum"), tx("b", "2026-09-15T10:00:00Z", "ethereum")], cursor(1)),
      page([tx("c", "2026-09-10T10:00:00Z", "ethereum")], cursor(2)),
      page([tx("d", "2026-08-01T10:00:00Z", "base"), tx("e", "2026-07-15T08:00:00Z", "base")], null),
    ],
  });

  const { result } = renderRewind({ wallet: { address: ADDRESS }, now: NOW, api, onPage, onComplete, onFail });

  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current.status).toBe("ready"));

  // Every page is reported before completion, and the reported counts add up to the final one.
  expect(trace).toEqual(["page:2", "page:1", "page:2", "complete:5"]);
  // The cursor of each page is what the next call asks for, exactly as it was returned.
  expect(calls.pages).toEqual([
    { address: ADDRESS },
    { address: ADDRESS, next: cursor(1) },
    { address: ADDRESS, next: cursor(2) },
  ]);
});

test("folds every page into the engine, so the facts describe the whole window", async () => {
  const { api } = fakeApi({
    pages: [
      page([tx("a", "2026-09-20T10:00:00Z", "ethereum"), tx("b", "2026-09-15T10:00:00Z", "ethereum")], cursor(1)),
      page(
        [
          tx("c", "2026-09-10T10:00:00Z", "ethereum"),
          tx("d", "2026-08-01T10:00:00Z", "base"),
          tx("e", "2026-07-15T08:00:00Z", "base"),
        ],
        null,
      ),
    ],
  });

  const { result } = renderRewind({ wallet: { address: ADDRESS, name: "vitalik.eth" }, now: NOW, api });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  const facts = result.current.facts;

  expect(facts?.wallet).toEqual({ address: ADDRESS, name: "vitalik.eth" });
  expect(facts?.txCount).toBe(5);
  expect(facts?.chainCount).toBe(2);
  // The oldest counted transaction is where the wallet's year started.
  expect(facts?.firstTx).toEqual({ date: "2026-07-15", chainName: "Base" });
  expect(facts?.daysOnchain).toBe(75);
  expect(result.current.capped).toBe(false);
});

test("finalizes with the chain list, the top token's fungible and the balance chart", async () => {
  const { api, calls } = fakeApi({
    pages: [page([tx("a", "2026-09-20T10:00:00Z", "ethereum"), tx("b", "2026-08-01T10:00:00Z", "base")], null)],
  });

  const { result } = renderRewind({ wallet: { address: ADDRESS }, now: NOW, api });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  const facts = result.current.facts;

  // Names and icons come from the chain list; the shares total 100.
  expect(facts?.chains).toEqual([
    { id: "ethereum", name: "Ethereum", share: 50, iconUrl: "https://chain.test/ethereum.png" },
    { id: "base", name: "Base", share: 50 },
  ]);
  // Only the pages know which fungible to read, so it is read by the id they named.
  expect(calls.fungibles).toEqual(["eth"]);
  expect(facts?.topToken).toEqual({
    symbol: "ETH",
    name: "Ethereum",
    iconUrl: "https://token.test/eth.png",
    timesTraded: 2,
    changePct: -32.8,
  });
  expect(facts?.balance?.high).toEqual({ date: "2026-03-01", value: 2400 });
  expect(facts?.balance?.low).toEqual({ date: "2025-10-01", value: 1000 });
  expect(facts?.balance?.current).toBe(1800);
  expect(facts?.balance?.changePct).toBe(80);
});

test("a failed extra hides the card it feeds instead of failing the run", async () => {
  const { onFail, trace } = recorder();
  const { api } = fakeApi({
    pages: [page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], null)],
    chains: { ok: false, error: "upstream" },
    fungible: { ok: false, error: "not_found" },
    chart: { ok: false, error: "not_found" },
  });

  const { result } = renderRewind({ wallet: { address: ADDRESS }, now: NOW, api, onFail });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  expect(trace).not.toContain("fail");
  // A chain the list doesn't carry keeps its id as its name; the other two cards simply hide.
  expect(result.current.facts?.chains).toEqual([{ id: "ethereum", name: "ethereum", share: 100 }]);
  expect(result.current.facts?.topToken).toBeUndefined();
  expect(result.current.facts?.balance).toBeUndefined();
});

test("no facts and no completion before the last page arrives", async () => {
  const { onPage, onComplete, trace } = recorder();
  let releaseSecondPage: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    releaseSecondPage = resolve;
  });

  const scripted = fakeApi({
    pages: [
      page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], cursor(1)),
      page([tx("b", "2026-08-01T10:00:00Z", "base")], null),
    ],
  });
  const api: RewindApi = {
    ...scripted.api,
    transactionsPage: async (input, signal) => {
      if (input.next !== undefined) await held;
      return scripted.api.transactionsPage(input, signal);
    },
  };

  const { result } = renderRewind({ wallet: { address: ADDRESS }, now: NOW, api, onPage, onComplete });

  await waitFor(() => expect(trace).toEqual(["page:1"]));
  expect(result.current.status).toBe("loading");
  expect(result.current.facts).toBeUndefined();

  releaseSecondPage();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(trace).toEqual(["page:1", "page:1", "complete:2"]);
});

test("every server-function call carries the run's own signal", async () => {
  const { api, calls } = fakeApi({ pages: [page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], null)] });

  const { result } = renderRewind({ wallet: { address: ADDRESS }, now: NOW, api });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  expect(calls.signals.length).toBeGreaterThanOrEqual(4);
  const [first] = calls.signals;
  expect(first).toBeInstanceOf(AbortSignal);
  for (const signal of calls.signals) expect(signal).toBe(first);
});

test("no wallet means no run at all", () => {
  const { api, calls } = fakeApi({ pages: [] });
  const spy = vi.fn();

  const { result } = renderRewind({ wallet: null, now: NOW, api, onPage: spy, onComplete: spy, onFail: spy });

  expect(result.current.status).toBe("idle");
  expect(calls.pages).toEqual([]);
  expect(spy).not.toHaveBeenCalled();
});

/* ---- O3: the cap and the timeout end paging ---- */

test("stops at the page cap, and says so, when a page is still behind it", async () => {
  const { onPage, onComplete, trace } = recorder();
  const { api, calls } = fakeApi({
    pages: [
      page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], cursor(1)),
      page([tx("b", "2026-09-15T10:00:00Z", "ethereum")], cursor(2)),
      page([tx("c", "2026-09-10T10:00:00Z", "base")], cursor(3)),
      page([tx("d", "2026-09-05T10:00:00Z", "base")], null),
    ],
  });

  const { result } = renderRewind({ wallet: { address: ADDRESS }, now: NOW, api, maxPages: 3, onPage, onComplete });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  // The page behind the cap is never asked for.
  expect(calls.pages).toHaveLength(3);
  expect(result.current.capped).toBe(true);
  expect(result.current.facts?.txCount).toBe(3);
  expect(trace).toEqual(["page:1", "page:1", "page:1", "complete:3"]);
});

test("stops at the transaction cap, and the count it completes with is the honest one", async () => {
  const { onPage, onComplete, trace } = recorder();
  const { api } = fakeApi({
    pages: [
      page(
        [
          tx("a", "2026-09-20T10:00:00Z", "ethereum"),
          tx("b", "2026-09-15T10:00:00Z", "ethereum"),
          tx("c", "2026-09-10T10:00:00Z", "base"),
        ],
        null,
      ),
    ],
  });

  const { result } = renderRewind({
    wallet: { address: ADDRESS },
    now: NOW,
    api,
    maxTransactions: 2,
    onPage,
    onComplete,
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  expect(result.current.capped).toBe(true);
  expect(result.current.facts?.txCount).toBe(2);
  // What the reveal counted still adds up to the count it is completed with.
  expect(trace).toEqual(["page:2", "complete:2"]);
});

test("a run still paging when the timeout lands reports failure and aborts", async () => {
  vi.useFakeTimers();
  try {
    const { onPage, onComplete, onFail, trace } = recorder();
    const { api: stubs, calls } = fakeApi({ pages: [] });
    const api: RewindApi = {
      ...stubs,
      // Never settles: the run must not wait on it past the timeout.
      transactionsPage: (_input, signal) => {
        calls.signals.push(signal);
        return new Promise(() => {});
      },
    };

    const { result } = renderRewind({
      wallet: { address: ADDRESS },
      now: NOW,
      api,
      timeoutMs: TIMEOUT_MS,
      onPage,
      onComplete,
      onFail,
    });
    expect(result.current.status).toBe("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("timeout");
    expect(trace).toEqual(["fail"]);
    expect(result.current.facts).toBeUndefined();
    for (const signal of calls.signals) expect(signal.aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

test("the timeout keeps the pages already reported and completes nothing after it", async () => {
  vi.useFakeTimers();
  try {
    const { onPage, onComplete, onFail, trace } = recorder();
    let releaseSecondPage: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });

    const scripted = fakeApi({
      pages: [
        page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], cursor(1)),
        page([tx("b", "2026-08-01T10:00:00Z", "base")], null),
      ],
    });
    const api: RewindApi = {
      ...scripted.api,
      transactionsPage: async (input, signal) => {
        if (input.next !== undefined) await held;
        return scripted.api.transactionsPage(input, signal);
      },
    };

    const { result } = renderRewind({
      wallet: { address: ADDRESS },
      now: NOW,
      api,
      timeoutMs: TIMEOUT_MS,
      onPage,
      onComplete,
      onFail,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    });
    expect(trace).toEqual(["page:1", "fail"]);

    // The page that was in flight arrives late and changes nothing.
    await act(async () => {
      releaseSecondPage();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(trace).toEqual(["page:1", "fail"]);
    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("timeout");
  } finally {
    vi.useRealTimers();
  }
});
