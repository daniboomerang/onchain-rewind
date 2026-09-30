/**
 * `useRewind` — the client half of "loading is the animation" (ADR-0002).
 *
 * One run pages a wallet's transactions for the window, folds every page into the engine, and
 * reports each page's transactions through `onPage` as it arrives, so the reveal can turn them
 * into particles while the rest is still in flight. When paging ends the run finalizes
 * `RewindFacts` and reports `onComplete(finalCount)`; any failure reports `onFail()` — except a quota
 * limit on the first page, which plays the recorded snapshot instead (ADR-0005).
 *
 * The loop is deliberately not a query: a query resolves once, and the reveal needs the count of
 * every page on the way. Query owns only the three reads that resolve once each — the chain list,
 * the top token's fungible and the balance chart — so a second Rewind of the same wallet inside
 * the `staleTime` re-pages nothing it already has.
 *
 * Nothing but the outcome reaches React state. The running count would re-render the whole tree
 * once per page, which is exactly what `ParticleReveal`'s imperative handle exists to avoid.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  accumulate,
  createState,
  finalize,
  type RewindExtras,
  type RewindWindow,
  topFungible,
} from "#/engine/rewind.ts";
import type { RewindFacts } from "#/engine/types.ts";
import type { BalanceChart, ChainLite, FungibleLite, TransactionsPage } from "#/engine/zerion.ts";
import { STALE_TIME_MS } from "#/lib/query-client.ts";
import { getChains } from "#/server/zerion/chains.functions.ts";
import type { ZerionErrorCode, ZerionResult } from "#/server/zerion/client.ts";
import { getFungible } from "#/server/zerion/fungibles.functions.ts";
import { getBalanceChart, getTransactionsPage } from "#/server/zerion/wallets.functions.ts";

/** SPEC §5: the cap is 25 pages of 100 transactions. Beyond it, figures read "2,500+". */
export const MAX_PAGES = 25;
/**
 * ADR-0002: a run that hasn't finished by here is an error state, not a longer wait.
 *
 * It has to hold a full year at the cap on the Demo plan's one request a second
 * (`.claude/rules/zerion-api.md`): 25 page requests and the three reads that resolve once are 28
 * slots a second apart, each slot's upstream latency on top, one failed page's retry, and a 429's
 * own backoffs (500ms, 1s, 2s per call, in `zerionFetch`). That is a little over half a minute for
 * the deepest wallet, so this leaves room for a slow upstream on top of it. The reveal counts
 * throughout, and nothing here lengthens the wait for a wallet that pages in three.
 */
export const TIMEOUT_MS = 90_000;
/**
 * The floor between any two Zerion requests one run makes — pages and the three reads alike.
 *
 * The key's organization is on Zerion's free Demo plan, which allows **one request a second**
 * (`ratelimit-org-second-limit: 1`, recorded in `.claude/rules/zerion-api.md`). One second is
 * therefore not a safety margin but the limit itself: two requests in the same second are throttled,
 * which is why the reads that don't depend on a page queue behind the paging loop instead of
 * travelling alongside it. It costs a wallet that pages quickly nothing visible: the reveal never
 * finishes before `revealMs.minReveal` anyway.
 */
export const REQUEST_INTERVAL_MS = 1_000;
/**
 * How long a failed page waits before its one retry. It is the request floor, because on this plan
 * nothing can go out sooner anyway: the failures that reach here are the ones the server already
 * gave up on — a throttle that outlasted its three backoffs, and, measured live on the demo wallets,
 * an upstream 500 that Zerion returns for a deep page of a very active wallet and then serves fine.
 */
export const PAGE_RETRY_MS = REQUEST_INTERVAL_MS;

export type RewindWallet = RewindWindow["wallet"];

/** The hook's failure vocabulary: the client's five Zerion codes, plus running out of time. */
export type RewindFailure = ZerionErrorCode | "timeout";

/**
 * The Zerion reads a run makes. The app passes the server functions; a test passes fakes, which is
 * what lets the paging loop, the cap, the timeout and cancellation be proven without a network.
 */
export type RewindApi = {
  transactionsPage(
    input: { readonly address: string; readonly next?: string },
    signal: AbortSignal,
  ): Promise<ZerionResult<TransactionsPage>>;
  chains(signal: AbortSignal): Promise<ZerionResult<readonly ChainLite[]>>;
  fungible(id: string, signal: AbortSignal): Promise<ZerionResult<FungibleLite>>;
  balanceChart(address: string, signal: AbortSignal): Promise<ZerionResult<BalanceChart>>;
};

/** Every call carries the run's signal, so an abort reaches the request and not just the caller. */
export const serverRewindApi: RewindApi = {
  transactionsPage: (data, signal) => getTransactionsPage({ data, signal }),
  chains: (signal) => getChains({ signal }),
  fungible: (id, signal) => getFungible({ data: { id }, signal }),
  balanceChart: (address, signal) => getBalanceChart({ data: { address }, signal }),
};

export type UseRewindOptions = {
  /** Null until the wallet is set. A different wallet cancels the run in flight and starts over. */
  readonly wallet: RewindWallet | null;
  /** The instant the window ends. Injected for determinism; the app lets the run read the clock. */
  readonly now?: Date;
  /** The transactions this page added, for `ParticleReveal.addTransactions`. */
  readonly onPage?: (count: number) => void;
  /**
   * Paging ended and the facts are built, for `ParticleReveal.complete`.
   *
   * `capped` travels with the count rather than only on the result, because the reveal's counter is
   * written by a frame loop: it has to know what the number means on the frame it lands on it, not
   * a render later. `recorded` travels the same way: the run played the recorded snapshot.
   */
  readonly onComplete?: (finalCount: number, capped: boolean, recorded: boolean) => void;
  /** The run failed, for `ParticleReveal.fail`. The reason is on the result, not the callback. */
  readonly onFail?: () => void;
  readonly api?: RewindApi;
  /** Overrides for tests. The app takes the cap, the pacing and the timeout above. */
  readonly maxPages?: number;
  /** Overrides the engine's own default cap. The app takes `maxPages` pages of 100, below. */
  readonly maxTransactions?: number;
  readonly timeoutMs?: number;
  readonly requestIntervalMs?: number;
  readonly pageRetryMs?: number;
};

export type UseRewindResult = {
  status: "idle" | "loading" | "ready" | "failed";
  /** The finished facts. `txCount: 0` is the empty wallet, which is a success, not a failure. */
  facts?: RewindFacts;
  /**
   * The facts describe less than the wallet really did, so figures read with a "+": the cap stopped
   * paging, or a page failed for good after the ones before it had landed.
   */
  capped: boolean;
  /**
   * The run plays the recorded snapshot (ADR-0005): Zerion refused the first page for a quota limit.
   * True from the switch on, so the chrome says so through the reveal as well as the story.
   */
  recorded: boolean;
  /**
   * Whose year the run plays: the wallet asked for, or on a recorded run the recording's wallet.
   * What the chrome, the share card and settings name, so the story never claims someone else's year.
   */
  subject?: RewindWallet;
  error?: RewindFailure;
  /** Starts a fresh run for the same wallet. Safe while one is in flight: it cancels that one. */
  retry: () => void;
};

type Outcome =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly recorded: boolean; readonly subject: RewindWallet }
  | {
      readonly status: "ready";
      readonly facts: RewindFacts;
      readonly capped: boolean;
      readonly recorded: boolean;
      readonly subject: RewindWallet;
    }
  | { readonly status: "failed"; readonly error: RewindFailure };

/** Where a run reads its pages from: the wallet asked for, live, or the recorded snapshot. */
type Source = {
  readonly api: RewindApi;
  readonly window: RewindWindow;
  readonly maxPages: number;
  /**
   * The recorded snapshot: its reads cost no budget, so they are never paced, and they never go
   * through Query, whose cache the live reads share.
   */
  readonly recorded: boolean;
};

/**
 * The recorded snapshot, loaded on the fallback only: a dynamic import keeps its JSON out of the
 * bundle every live run downloads.
 */
const loadRecordedRewind = () => import("#/lib/recorded-rewind.ts").then((module) => module.recordedRewind);

export function useRewind({
  wallet,
  now,
  onPage,
  onComplete,
  onFail,
  api = serverRewindApi,
  maxPages = MAX_PAGES,
  // A page is 100 transactions (SPEC §5): the engine's own default cap is sized for the old page
  // cap, so this keeps the two in sync rather than leaving the engine capped below what paging here
  // actually reaches.
  maxTransactions = maxPages * 100,
  timeoutMs = TIMEOUT_MS,
  requestIntervalMs = REQUEST_INTERVAL_MS,
  pageRetryMs = PAGE_RETRY_MS,
}: UseRewindOptions): UseRewindResult {
  const client = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Held in a ref so a parent that re-creates its callbacks never restarts the run.
  const handlers = useRef({ onPage, onComplete, onFail });
  handlers.current = { onPage, onComplete, onFail };

  const address = wallet?.address;
  const name = wallet?.name;
  const nowMs = now?.getTime();

  // `attempt` is a restart trigger, not a value the run reads: `retry()` bumps it so this effect's
  // cleanup cancels the run in flight and a fresh one starts. The rule only sees dependencies the
  // body reads, so it reads that one as unnecessary.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt exists to re-run this effect
  useEffect(() => {
    if (address === undefined) {
      setOutcome((previous) => (previous.status === "idle" ? previous : { status: "idle" }));
      return;
    }
    const asked: RewindWallet = { address, ...(name !== undefined ? { name } : {}) };
    setOutcome({ status: "loading", recorded: false, subject: asked });

    const controller = new AbortController();
    const { signal } = controller;
    /** Set by the cleanup below: this run's wallet changed, or its consumer unmounted. */
    let cancelled = false;
    let timedOut = false;
    let settled = false;
    // The failure is reported here rather than left to the abort to surface, so a call that ignores
    // its signal can't hold the Rewind past the timeout by never settling.
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      fail("timeout");
    }, timeoutMs);

    const settle = (next: Outcome) => {
      if (settled || cancelled) return false;
      settled = true;
      clearTimeout(timer);
      setOutcome(next);
      return true;
    };

    const fail = (error: RewindFailure) => {
      if (settle({ status: "failed", error })) handlers.current.onFail?.();
    };

    /**
     * True once this run must produce nothing further. Cancellation is silent — no state update and
     * no callback after the abort — while the timeout is the one abort that still reports a failure.
     */
    const halted = () => {
      if (cancelled) return true;
      if (!signal.aborted) return false;
      if (timedOut) fail("timeout");
      return true;
    };

    /**
     * Waits out the rest of a page's interval. An abort resolves it at once rather than leaving the
     * loop parked on a timer the run has already been cancelled out of; `halted()` reads the abort
     * on the other side, so a cancelled run still produces nothing.
     */
    const pace = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });

    /**
     * The instant this run's next request may go out. Reserving a slot moves it on, synchronously,
     * so two callers never share one: the Demo plan allows a single request a second, and a burst of
     * two is throttled whether it is two pages or a page and a chart.
     */
    let nextRequestAt = 0;

    /** Waits for this run's next request slot and reserves it. */
    const takeSlot = async () => {
      const at = Math.max(Date.now(), nextRequestAt);
      nextRequestAt = at + requestIntervalMs;
      const waitMs = at - Date.now();
      if (waitMs > 0) await pace(waitMs);
    };

    /** A Zerion call that waits its turn. Every request this run makes goes through here. */
    const paced = async <T>(call: () => Promise<ZerionResult<T>>) => {
      await takeSlot();
      return call();
    };

    /**
     * One of the three reads that resolve once. A failed read yields `undefined` rather than ending
     * the run: the engine leaves the field it feeds out and the card hides, which is a smaller loss
     * than no Rewind at all.
     *
     * A live read goes through Query, and throwing inside the query is what keeps a failure out of
     * the cache, so the next run retries it instead of remembering it for the whole `staleTime`. A
     * recorded read never touches Query: under the live keys it would sit in the cache for that same
     * `staleTime`, and the next live run of the same wallet would read the recording.
     */
    const readOnce = async <T>(
      source: Source,
      queryKey: readonly unknown[],
      fetch: () => Promise<ZerionResult<T>>,
    ): Promise<T | undefined> => {
      if (source.recorded) {
        const result = await fetch();
        return result.ok ? result.data : undefined;
      }
      try {
        return await client.query({
          queryKey,
          queryFn: async () => {
            const result = await fetch();
            if (!result.ok) throw new Error(result.error);
            return result.data;
          },
          staleTime: STALE_TIME_MS,
        });
      } catch {
        return undefined;
      }
    };

    /**
     * Pages one source to the end and settles the run — unless its first page fails for good, which
     * is returned rather than reported, so the caller decides whether that is the error state or the
     * recorded snapshot. Every other outcome, the timeout and cancellation included, is settled here.
     */
    const play = async (source: Source): Promise<RewindFailure | undefined> => {
      const { api } = source;
      const address = source.window.wallet.address;
      /** A live call waits its turn; a recorded one costs no budget, so it has none to wait for. */
      const call = <T>(request: () => Promise<ZerionResult<T>>) => (source.recorded ? request() : paced(request));

      /**
       * Neither depends on a page, and on one request a second nothing travels *alongside* anything:
       * these queue behind the first page rather than in front of it, so the reveal starts counting
       * on the first page instead of waiting out their two slots first. A read Query already has
       * costs no slot at all, because the slot is taken inside its `queryFn`.
       */
      let chainsRead: Promise<readonly ChainLite[] | undefined> | undefined;
      let chartRead: Promise<BalanceChart | undefined> | undefined;
      const startExtras = () => {
        chainsRead ??= readOnce(source, ["zerion", "chains"], () => call(() => api.chains(signal)));
        chartRead ??= readOnce(source, ["zerion", "balance-chart", address], () =>
          call(() => api.balanceChart(address, signal)),
        );
      };

      let state = createState(source.window);
      let next: string | undefined;
      let pages = 0;
      /** The cap stopped paging with a page still behind it — the "2,000+" case. */
      let pageCapHit = false;
      /** A page failed for good with a year already counted, so the facts describe part of it. */
      let partial = false;

      /** Takes the run's next request slot, and reports whether the run may still use it. */
      const slot = async () => {
        if (!source.recorded) await takeSlot();
        return !halted();
      };
      const request = () => api.transactionsPage({ address, ...(next !== undefined ? { next } : {}) }, signal);

      for (;;) {
        if (!(await slot())) return;
        let page = await request();
        if (halted()) return;
        // One retry, because the failures that get this far are usually the upstream's own flake
        // rather than anything about this wallet — but never for a spent daily budget, which every
        // request is refused for until the day resets. Asking again only spends the wait.
        if (!page.ok && page.error !== "budget_spent") {
          await pace(pageRetryMs);
          if (!(await slot())) return;
          page = await request();
          if (halted()) return;
        }
        if (!page.ok) {
          // Nothing landed, so there is no story of this wallet to tell: the caller decides between
          // the error state and the recorded snapshot. Nothing has been counted yet, so either way
          // the reveal never has to take a particle back.
          if (pages === 0) return page.error;
          // A page deep into the year failed for good. The reveal has already counted every page
          // before it, and the engine holds a real year's worth, so the run finishes with what
          // arrived and records that the wallet made more than the facts describe — a partial
          // story beats throwing a counted year away over one upstream fault. It never falls back:
          // this wallet's own data has already landed.
          partial = true;
          break;
        }

        pages += 1;
        startExtras();
        const before = state.txCount;
        state = accumulate(state, page.data);
        // The engine's own delta, not the page's length: what the reveal counts has to add up to
        // the final count it is completed with, and a page can carry transactions the cap or the
        // window's lower bound drops.
        handlers.current.onPage?.(state.txCount - before);

        if (page.data.next === null) break;
        if (pages >= source.maxPages) {
          pageCapHit = true;
          break;
        }
        next = page.data.next;
      }

      // Only the pages know which fungible card 3 is about, so this read is the one that waits.
      const fungibleId = topFungible(state)?.ref.id;
      const fungible =
        fungibleId === undefined
          ? undefined
          : await readOnce(source, ["zerion", "fungible", fungibleId], () =>
              call(() => api.fungible(fungibleId, signal)),
            );

      const extras: RewindExtras = {
        chains: await chainsRead,
        fungible: fungible ?? null,
        chart: (await chartRead) ?? null,
      };
      if (halted()) return;

      const capped = state.capped || pageCapHit || partial;
      const { recorded } = source;
      const subject = source.window.wallet;
      if (settle({ status: "ready", facts: finalize(state, extras), capped, recorded, subject })) {
        handlers.current.onComplete?.(state.txCount, capped, recorded);
      }
    };

    void (async () => {
      try {
        const failure = await play({
          api,
          window: {
            wallet: asked,
            now: nowMs === undefined ? new Date() : new Date(nowMs),
            ...(maxTransactions !== undefined ? { maxTransactions } : {}),
          },
          maxPages,
          recorded: false,
        });
        if (failure === undefined) return;
        // ADR-0005: a quota limit is nothing the visitor did and nothing a retry fixes soon, so the
        // run plays the recorded snapshot instead of the error state. Every other failure is still
        // the error state: a timeout, an upstream fault or an address Zerion can't read.
        if (failure !== "rate_limited" && failure !== "budget_spent") {
          fail(failure);
          return;
        }
        const recording = await loadRecordedRewind().catch(() => undefined);
        if (halted()) return;
        if (recording === undefined) {
          fail(failure);
          return;
        }
        // The one render the switch costs: the chrome names the recording's wallet and shows the note
        // from here on, through the rest of the reveal and the whole story.
        setOutcome({ status: "loading", recorded: true, subject: recording.wallet });
        const recordedFailure = await play({
          api: recording.api,
          window: {
            wallet: recording.wallet,
            now: recording.now,
            ...(maxTransactions !== undefined ? { maxTransactions } : {}),
          },
          maxPages: recording.pages,
          recorded: true,
        });
        if (recordedFailure !== undefined) fail(recordedFailure);
      } catch {
        if (halted()) return;
        fail("upstream");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    address,
    name,
    nowMs,
    api,
    maxPages,
    maxTransactions,
    timeoutMs,
    requestIntervalMs,
    pageRetryMs,
    client,
    attempt,
  ]);

  return {
    status: outcome.status,
    ...(outcome.status === "ready" ? { facts: outcome.facts } : {}),
    capped: outcome.status === "ready" && outcome.capped,
    recorded: (outcome.status === "loading" || outcome.status === "ready") && outcome.recorded,
    ...(outcome.status === "loading" || outcome.status === "ready" ? { subject: outcome.subject } : {}),
    ...(outcome.status === "failed" ? { error: outcome.error } : {}),
    retry,
  };
}
