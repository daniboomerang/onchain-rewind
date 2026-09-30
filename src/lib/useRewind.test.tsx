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
import { accumulate, createState } from "#/engine/rewind.ts";
import type { Address } from "#/engine/types.ts";
import type { BalanceChart, ChainLite, FungibleLite, TransactionsPage, TxLite } from "#/engine/zerion.ts";
import {
  MAX_PAGES,
  REQUEST_INTERVAL_MS,
  type RewindApi,
  TIMEOUT_MS,
  type UseRewindOptions,
  useRewind,
} from "#/lib/useRewind.ts";
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

/**
 * The callbacks, recorded as one ordered trace: the order is half of what the reveal depends on.
 *
 * A completion records the "+" the reveal would print, because `capped` travels with the count
 * rather than only on the result — the counter is written by a frame loop, and a flag that reached
 * the hook's return value a render later would be a flag the counter never saw.
 */
function recorder() {
  const trace: string[] = [];
  return {
    trace,
    onPage: (count: number) => trace.push(`page:${count}`),
    onComplete: (finalCount: number, capped: boolean, recorded: boolean) =>
      trace.push(`complete:${finalCount}${capped ? "+" : ""}${recorded ? " recorded" : ""}`),
    onFail: () => trace.push("fail"),
  };
}

/**
 * A run of `pages` pages where every request takes `latencyMs` upstream, recording the instant each
 * one went out — pages in `startedAt`, and every request of any kind in `requestedAt`. Those traces
 * are what make the pacing, and the wall clock a full year at the cap costs, observable — under fake
 * timers, so neither is a real wait.
 */
function pacedApi(pages: number, latencyMs: number) {
  const startedAt: number[] = [];
  const requestedAt: number[] = [];

  const upstream = async <T,>(value: T) => {
    requestedAt.push(Date.now());
    await new Promise((resolve) => setTimeout(resolve, latencyMs));
    return value;
  };

  const api: RewindApi = {
    transactionsPage: async (_input, _signal) => {
      startedAt.push(Date.now());
      const index = startedAt.length;
      return upstream(
        page([tx(`tx-${index}`, "2026-09-20T10:00:00Z", "ethereum")], index >= pages ? null : cursor(index)),
      );
    },
    chains: async () => upstream({ ok: true, data: CHAINS }),
    fungible: async () => upstream({ ok: true, data: ETH }),
    balanceChart: async () => upstream({ ok: true, data: CHART }),
  };

  return { api, startedAt, requestedAt };
}

/** Every gap in a trace of request instants, so "one a second" is one assertion per gap. */
const gapsIn = (instants: readonly number[]) => instants.slice(1).map((at, index) => at - (instants[index] ?? 0));

/**
 * Every run here is unpaced unless the test is about pacing: the app's floor is a whole second per
 * request (the Demo plan's limit), which a scripted three-page run has no reason to spend.
 */
function renderRewind(options: UseRewindOptions) {
  // A fresh client per run, so no test reads another's cached chains, fungible or chart.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const unpaced = (props: UseRewindOptions): UseRewindOptions => ({ requestIntervalMs: 0, ...props });
  const rendered = renderHook((props: UseRewindOptions) => useRewind(props), {
    initialProps: unpaced(options),
    wrapper,
  });
  // A re-render is a second run, and it takes the same default: `rerender` would otherwise hand the
  // hook the raw props and pace that run a second apart.
  return { ...rendered, client, rerender: (props: UseRewindOptions) => rendered.rerender(unpaced(props)) };
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
  expect(trace).toEqual(["page:1", "page:1", "page:1", "complete:3+"]);
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
  expect(trace).toEqual(["page:2", "complete:2+"]);
});

test("the request floor is the Demo plan's own limit: one request a second", () => {
  expect(REQUEST_INTERVAL_MS).toBeGreaterThanOrEqual(1_000);
});

test("paces its page requests, so a long run stays inside the Demo plan's one request a second", async () => {
  vi.useFakeTimers();
  try {
    // An upstream that answers instantly is the throttling case: nothing but the pacing spaces the
    // requests out, and a 20-page wallet would otherwise fire a burst the plan rejects.
    const { api, startedAt } = pacedApi(4, 0);

    const { result } = renderRewind({
      wallet: { address: ADDRESS },
      now: NOW,
      api,
      requestIntervalMs: REQUEST_INTERVAL_MS,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    });

    expect(result.current.status).toBe("ready");
    expect(startedAt).toHaveLength(4);
    for (const gap of gapsIn(startedAt)) expect(gap).toBeGreaterThanOrEqual(REQUEST_INTERVAL_MS);
  } finally {
    vi.useRealTimers();
  }
});

test("the reads that resolve once queue behind the pages instead of bursting alongside them", async () => {
  vi.useFakeTimers();
  try {
    // Four pages, plus the chain list, the chart and the top token's fungible: every one of the
    // seven requests has to be a second clear of the one before it, whichever kind it is.
    const { api, startedAt, requestedAt } = pacedApi(4, 0);

    const { result } = renderRewind({
      wallet: { address: ADDRESS },
      now: NOW,
      api,
      requestIntervalMs: REQUEST_INTERVAL_MS,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    });

    expect(result.current.status).toBe("ready");
    expect(requestedAt).toHaveLength(7);
    for (const gap of gapsIn(requestedAt)) expect(gap).toBeGreaterThanOrEqual(REQUEST_INTERVAL_MS);
    // The first page goes out first: the reveal starts counting rather than waiting out two extras.
    expect(startedAt[0]).toBe(requestedAt[0]);
  } finally {
    vi.useRealTimers();
  }
});

test("a full year at the page cap reaches the story well inside the timeout", async () => {
  vi.useFakeTimers();
  try {
    const { onPage, onComplete, onFail, trace } = recorder();
    // Slower per page than the live API is on the demo wallets, so the margin is the point.
    const { api, startedAt } = pacedApi(MAX_PAGES + 1, 700);

    const startedRunAt = Date.now();
    let finishedAt: number | undefined;
    const { result } = renderRewind({
      wallet: { address: ADDRESS },
      now: NOW,
      api,
      requestIntervalMs: REQUEST_INTERVAL_MS,
      onPage,
      onComplete: (finalCount, capped, recorded) => {
        finishedAt = Date.now();
        onComplete(finalCount, capped, recorded);
      },
      onFail,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.capped).toBe(true);
    expect(startedAt).toHaveLength(MAX_PAGES);
    expect(trace).toEqual([...Array.from({ length: MAX_PAGES }, () => "page:1"), `complete:${MAX_PAGES}+`]);
    // The run costs what the plan charges for it: 25 pages and the three reads that resolve once are
    // 28 requests a second apart, and the wall clock says so. The timeout still leaves room for an
    // upstream twice as slow as this one, which is what "holds a full paced year" has to mean.
    const elapsed = (finishedAt ?? Number.NaN) - startedRunAt;
    expect(elapsed).toBeGreaterThan((MAX_PAGES + 2) * REQUEST_INTERVAL_MS);
    expect(elapsed).toBeLessThan(TIMEOUT_MS / 2);
  } finally {
    vi.useRealTimers();
  }
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

/* ---- O4: an empty wallet, a failing API, and the retry ---- */

test("an empty wallet completes with no transactions, which is a success", async () => {
  const { onPage, onComplete, onFail, trace } = recorder();
  const { api, calls } = fakeApi({ pages: [page([], null)] });

  const { result } = renderRewind({ wallet: { address: ADDRESS }, now: NOW, api, onPage, onComplete, onFail });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  expect(trace).toEqual(["page:0", "complete:0"]);
  expect(result.current.facts?.txCount).toBe(0);
  expect(result.current.facts?.chains).toEqual([]);
  expect(result.current.facts?.chainCount).toBe(0);
  expect(result.current.facts?.daysOnchain).toBe(0);
  expect(result.current.facts?.firstTx).toBeUndefined();
  expect(result.current.facts?.topToken).toBeUndefined();
  expect(result.current.capped).toBe(false);
  // No transaction named a fungible, so there is nothing to read one for.
  expect(calls.fungibles).toEqual([]);
});

test.each(["upstream", "invalid_address", "not_found"] as const)(
  "a %s response from the transactions endpoint, twice, reports failure",
  async (error) => {
    const { onPage, onComplete, onFail, trace } = recorder();
    // Twice, because the first page gets the same one retry every other page does.
    const { api, calls } = fakeApi({
      pages: [
        { ok: false, error },
        { ok: false, error },
      ],
    });

    const { result } = renderRewind({
      wallet: { address: ADDRESS },
      now: NOW,
      api,
      pageRetryMs: 0,
      onPage,
      onComplete,
      onFail,
    });
    await waitFor(() => expect(result.current.status).toBe("failed"));

    expect(calls.pages).toHaveLength(2);
    expect(result.current.error).toBe(error);
    expect(trace).toEqual(["fail"]);
    expect(result.current.facts).toBeUndefined();
  },
);

/* ---- ADR-0005: a quota limit on the first page plays the recorded snapshot ---- */

/** What the recording folds to through the engine: the count a recorded run must complete with. */
async function recordedCount() {
  const { recordedRewind } = await import("#/lib/recorded-rewind.ts");
  let state = createState({ wallet: recordedRewind.wallet, now: recordedRewind.now });
  for (let n = 0, next: string | undefined; n < recordedRewind.pages; n += 1) {
    const result = await recordedRewind.api.transactionsPage(
      { address: recordedRewind.wallet.address, ...(next !== undefined ? { next } : {}) },
      new AbortController().signal,
    );
    if (!result.ok) throw new Error(result.error);
    state = accumulate(state, result.data);
    next = result.data.next ?? undefined;
  }
  return state.txCount;
}

test.each([
  // A throttle that outlasted the server's backoffs gets the page's one retry before the switch.
  ["rate_limited", 2],
  // A spent day is never asked for twice.
  ["budget_spent", 1],
] as const)(
  "a first page refused with %s plays the recorded vitalik.eth year instead of failing",
  async (error, asked) => {
    const { onPage, onComplete, onFail, trace } = recorder();
    // More live answers are scripted than the run may use: after the switch it asks Zerion for nothing.
    const { api, calls } = fakeApi({
      pages: [{ ok: false, error }, { ok: false, error }, page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], null)],
    });

    const { result, client } = renderRewind({
      wallet: { address: ADDRESS, name: "picked.eth" },
      now: NOW,
      api,
      pageRetryMs: 0,
      onPage,
      onComplete,
      onFail,
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(calls.pages).toHaveLength(asked);
    expect(calls.fungibles).toEqual([]);
    expect(result.current.error).toBeUndefined();
    expect(result.current.recorded).toBe(true);
    // The story is the recording's wallet's, never the picked one's.
    expect(result.current.subject?.name).toBe("vitalik.eth");
    expect(result.current.facts?.wallet.name).toBe("vitalik.eth");
    expect(result.current.facts?.wallet.address.toLowerCase()).toBe(ADDRESS);

    // Two recorded pages reach the reveal, and the run completes as a year cut short: the recording
    // holds about five weeks, not the whole year.
    const count = await recordedCount();
    const pages = trace.filter((entry) => entry.startsWith("page:"));
    expect(pages).toHaveLength(2);
    expect(pages.reduce((sum, entry) => sum + Number(entry.slice("page:".length)), 0)).toBe(count);
    expect(trace.at(-1)).toBe(`complete:${count}+ recorded`);
    expect(trace).not.toContain("fail");
    expect(result.current.capped).toBe(true);
    expect(result.current.facts?.txCount).toBe(count);

    // Every card has something to show: an origin, a home chain, a top token and the ride's chart.
    expect(result.current.facts?.firstTx).toBeDefined();
    expect(result.current.facts?.chains.length).toBeGreaterThan(0);
    expect(result.current.facts?.topToken?.symbol).toBe("ETH");
    expect(result.current.facts?.balance).toBeDefined();

    // Nothing recorded went through Query: a later live run of the same keys would read it.
    expect(client.getQueryCache().getAll()).toEqual([]);
  },
);

test("a recorded run is read as of its own day, whatever the clock says", async () => {
  const { onComplete, trace } = recorder();
  const { api } = fakeApi({ pages: [{ ok: false, error: "budget_spent" }] });

  // A year after the recording, every recorded transaction would be outside a window read at `now`.
  const { result } = renderRewind({
    wallet: { address: ADDRESS },
    now: new Date("2027-12-01T00:00:00Z"),
    api,
    onComplete,
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  expect(trace).toEqual([`complete:${await recordedCount()}+ recorded`]);
});

test("recorded reads cost no budget, so they are never paced", async () => {
  const { api } = fakeApi({ pages: [{ ok: false, error: "budget_spent" }] });
  const startedAt = Date.now();

  // The app's own floor: paced, the recording's two pages and three reads would take four seconds more.
  const { result } = renderRewind({
    wallet: { address: ADDRESS },
    now: NOW,
    api,
    requestIntervalMs: REQUEST_INTERVAL_MS,
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  expect(result.current.recorded).toBe(true);
  expect(Date.now() - startedAt).toBeLessThan(REQUEST_INTERVAL_MS);
});

test("a first page that fails once and answers on the retry never reaches the error state", async () => {
  const { onPage, onComplete, onFail, trace } = recorder();
  const { api, calls } = fakeApi({
    pages: [{ ok: false, error: "upstream" }, page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], null)],
  });

  const { result } = renderRewind({
    wallet: { address: ADDRESS },
    now: NOW,
    api,
    pageRetryMs: 0,
    onPage,
    onComplete,
    onFail,
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  // The retry asks for the same page again — the cursor never moves on a failure.
  expect(calls.pages).toEqual([{ address: ADDRESS }, { address: ADDRESS }]);
  expect(trace).toEqual(["page:1", "complete:1"]);
  expect(result.current.capped).toBe(false);
});

test("a page that fails for good part-way through finishes the run with what landed", async () => {
  const { onPage, onComplete, onFail, trace } = recorder();
  const { api, calls } = fakeApi({
    pages: [
      page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], cursor(1)),
      { ok: false, error: "rate_limited" },
      { ok: false, error: "rate_limited" },
    ],
  });

  const { result } = renderRewind({
    wallet: { address: ADDRESS },
    now: NOW,
    api,
    pageRetryMs: 0,
    onPage,
    onComplete,
    onFail,
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  // The page was asked for twice and then let go; the year already counted still becomes a story,
  // and `capped` is what records that the wallet did more than the facts describe.
  expect(calls.pages).toHaveLength(3);
  expect(trace).toEqual(["page:1", "complete:1+"]);
  expect(result.current.capped).toBe(true);
  expect(result.current.error).toBeUndefined();
  expect(result.current.facts?.txCount).toBe(1);
  // The wallet's own year has landed, so a later page's rate limit never falls back to the recording.
  expect(result.current.recorded).toBe(false);
  expect(result.current.facts?.wallet.address).toBe(ADDRESS);
});

test("retry starts paging over, and a run that then succeeds clears the failure", async () => {
  const { onPage, onComplete, onFail, trace } = recorder();
  const { api, calls } = fakeApi({
    pages: [
      { ok: false, error: "upstream" },
      { ok: false, error: "upstream" },
      page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], null),
    ],
  });

  const { result } = renderRewind({
    wallet: { address: ADDRESS },
    now: NOW,
    api,
    pageRetryMs: 0,
    onPage,
    onComplete,
    onFail,
  });
  await waitFor(() => expect(result.current.status).toBe("failed"));
  expect(calls.pages).toHaveLength(2);

  act(() => {
    result.current.retry();
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  // The retry asks for the first page again, with no cursor from the run that failed.
  expect(calls.pages).toEqual([{ address: ADDRESS }, { address: ADDRESS }, { address: ADDRESS }]);
  expect(trace).toEqual(["fail", "page:1", "complete:1"]);
  expect(result.current.error).toBeUndefined();
  expect(result.current.facts?.txCount).toBe(1);
});

/* ---- O5: a wallet change or an unmount cancels, silently ---- */

/** A promise the test opens by hand, so a run can be caught mid-paging. */
function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open: () => open(), opened };
}

test("a wallet change cancels the run in flight, and its late page reports nothing", async () => {
  const { onPage, onComplete, onFail, trace } = recorder();
  const OTHER = "0x1111111111111111111111111111111111111111" as Address;
  const firstRun = gate();
  const signals = new Map<string, AbortSignal>();

  const api: RewindApi = {
    transactionsPage: async (input, signal) => {
      signals.set(input.address, signal);
      if (input.address === ADDRESS) {
        await firstRun.opened;
        return page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], null);
      }
      return page([tx("z", "2026-09-01T10:00:00Z", "base"), tx("y", "2026-08-01T10:00:00Z", "base")], null);
    },
    chains: async () => ({ ok: true, data: CHAINS }),
    fungible: async () => ({ ok: true, data: ETH }),
    balanceChart: async () => ({ ok: true, data: CHART }),
  };

  const shared = { now: NOW, api, onPage, onComplete, onFail };
  const { result, rerender } = renderRewind({ wallet: { address: ADDRESS }, ...shared });
  await waitFor(() => expect(signals.has(ADDRESS)).toBe(true));
  expect(trace).toEqual([]);

  rerender({ wallet: { address: OTHER }, ...shared });
  expect(signals.get(ADDRESS)?.aborted).toBe(true);

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.facts?.wallet.address).toBe(OTHER);
  expect(trace).toEqual(["page:2", "complete:2"]);

  // The cancelled run's page arrives late and changes neither the facts nor the trace.
  await act(async () => {
    firstRun.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(trace).toEqual(["page:2", "complete:2"]);
  expect(result.current.facts?.wallet.address).toBe(OTHER);
});

test("unmounting cancels the run: the pages already reported stand, nothing follows them", async () => {
  const { onPage, onComplete, onFail, trace } = recorder();
  const secondPage = gate();
  let captured: AbortSignal | undefined;

  const api: RewindApi = {
    transactionsPage: async (input, signal) => {
      captured = signal;
      if (input.next === undefined) return page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], cursor(1));
      await secondPage.opened;
      return page([tx("b", "2026-08-01T10:00:00Z", "base")], null);
    },
    chains: async () => ({ ok: true, data: CHAINS }),
    fungible: async () => ({ ok: true, data: ETH }),
    balanceChart: async () => ({ ok: true, data: CHART }),
  };

  const { unmount } = renderRewind({ wallet: { address: ADDRESS }, now: NOW, api, onPage, onComplete, onFail });
  await waitFor(() => expect(trace).toEqual(["page:1"]));

  unmount();
  expect(captured?.aborted).toBe(true);

  await act(async () => {
    secondPage.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  // No second page, no completion and no failure: cancelling is silent.
  expect(trace).toEqual(["page:1"]);
});

test("unmounting before the last page never completes, even once every read has resolved", async () => {
  const { onPage, onComplete, onFail, trace } = recorder();
  const lastPage = gate();

  const api: RewindApi = {
    transactionsPage: async (_input, _signal) => {
      await lastPage.opened;
      return page([tx("a", "2026-09-20T10:00:00Z", "ethereum")], null);
    },
    chains: async () => ({ ok: true, data: CHAINS }),
    fungible: async () => ({ ok: true, data: ETH }),
    balanceChart: async () => ({ ok: true, data: CHART }),
  };

  const { unmount } = renderRewind({ wallet: { address: ADDRESS }, now: NOW, api, onPage, onComplete, onFail });
  unmount();

  await act(async () => {
    lastPage.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(trace).toEqual([]);
});
