/**
 * `useRewind` — the client half of "loading is the animation" (ADR-0002).
 *
 * One run pages a wallet's transactions for the window, folds every page into the engine, and
 * reports each page's transactions through `onPage` as it arrives, so the reveal can turn them
 * into particles while the rest is still in flight. When paging ends the run finalizes
 * `RewindFacts` and reports `onComplete(finalCount)`; any failure reports `onFail()`.
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
import { getChains } from "#/server/zerion/chains.functions.ts";
import type { ZerionErrorCode, ZerionResult } from "#/server/zerion/client.ts";
import { getFungible } from "#/server/zerion/fungibles.functions.ts";
import { getBalanceChart, getTransactionsPage } from "#/server/zerion/wallets.functions.ts";

/** SPEC §5: the cap is 20 pages of 100 transactions. Beyond it, figures read "2,000+". */
export const MAX_PAGES = 20;
/**
 * ADR-0002: a run that hasn't finished by here is an error state, not a longer wait.
 *
 * It has to hold a full year at the cap: 20 paced page requests, their upstream latency, the three
 * reads that resolve once, and a 429's own backoffs (500ms, 1s, 2s per call, in `zerionFetch`). A
 * wallet with a year of history loses nothing to the clock, and the reveal counts throughout —
 * nothing here shortens the wait for a wallet that pages quickly, which is still most of them.
 */
export const TIMEOUT_MS = 45_000;
/**
 * The floor between two page requests. The free tier allows about ten requests a second
 * (`.claude/rules/zerion-api.md`), and a run's pages are sequential, so only a fast upstream can
 * approach that — this keeps even a fully cached run at under seven requests a second, which is
 * what stops a 20-page wallet from being throttled into the error state. It costs a wallet that
 * pages quickly nothing visible: the reveal never finishes before `revealMs.minReveal` anyway.
 */
export const PAGE_INTERVAL_MS = 150;
/**
 * How long a failed page waits before its one retry. It mirrors `zerionFetch`'s first backoff,
 * because the failures that reach here are the ones the server already gave up on: a 429 that
 * outlasted its three waits, and — measured live on the demo wallets — an upstream 500 that Zerion
 * returns for a deep page of a very active wallet and then serves fine on the next attempt.
 */
export const PAGE_RETRY_MS = 500;
/** SPEC §5: the client keeps a Zerion read fresh for ten minutes, matching the server's own cache. */
const STALE_TIME_MS = 10 * 60 * 1000;

export type RewindWallet = RewindWindow["wallet"];

/** The hook's failure vocabulary: the client's four Zerion codes, plus running out of time. */
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
  /** Paging ended and the facts are built, for `ParticleReveal.complete`. */
  readonly onComplete?: (finalCount: number) => void;
  /** The run failed, for `ParticleReveal.fail`. The reason is on the result, not the callback. */
  readonly onFail?: () => void;
  readonly api?: RewindApi;
  /** Overrides for tests. The app takes the cap, the pacing and the timeout above. */
  readonly maxPages?: number;
  readonly maxTransactions?: number;
  readonly timeoutMs?: number;
  readonly pageIntervalMs?: number;
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
  error?: RewindFailure;
  /** Starts a fresh run for the same wallet. Safe while one is in flight: it cancels that one. */
  retry: () => void;
};

type Outcome =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly facts: RewindFacts; readonly capped: boolean }
  | { readonly status: "failed"; readonly error: RewindFailure };

export function useRewind({
  wallet,
  now,
  onPage,
  onComplete,
  onFail,
  api = serverRewindApi,
  maxPages = MAX_PAGES,
  maxTransactions,
  timeoutMs = TIMEOUT_MS,
  pageIntervalMs = PAGE_INTERVAL_MS,
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
    setOutcome({ status: "loading" });

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
     * One of the three reads that resolve once, through Query. A failed read yields `undefined`
     * rather than ending the run: the engine leaves the field it feeds out and the card hides, which
     * is a smaller loss than no Rewind at all. Throwing inside the query is what keeps a failure out
     * of the cache, so the next run retries it instead of remembering it for the whole `staleTime`.
     */
    const read = async <T>(queryKey: readonly unknown[], fetch: () => Promise<ZerionResult<T>>) => {
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

    void (async () => {
      try {
        const rewindWindow: RewindWindow = {
          wallet: { address, ...(name !== undefined ? { name } : {}) },
          now: nowMs === undefined ? new Date() : new Date(nowMs),
          ...(maxTransactions !== undefined ? { maxTransactions } : {}),
        };

        // Neither depends on a page, so both travel alongside the paging loop rather than after it.
        const chainsRead = read(["zerion", "chains"], () => api.chains(signal));
        const chartRead = read(["zerion", "balance-chart", address], () => api.balanceChart(address, signal));

        let state = createState(rewindWindow);
        let next: string | undefined;
        let pages = 0;
        /** The cap stopped paging with a page still behind it — the "2,000+" case. */
        let pageCapHit = false;
        /** When the request before this one went out, so the next one can be paced off it. */
        let lastRequestAt: number | undefined;
        /** A page failed for good with a year already counted, so the facts describe part of it. */
        let partial = false;

        for (;;) {
          if (lastRequestAt !== undefined) {
            const remaining = pageIntervalMs - (Date.now() - lastRequestAt);
            if (remaining > 0) {
              await pace(remaining);
              if (halted()) return;
            }
          }
          const request = () => {
            lastRequestAt = Date.now();
            return api.transactionsPage({ address, ...(next !== undefined ? { next } : {}) }, signal);
          };

          let page = await request();
          if (halted()) return;
          if (!page.ok) {
            // One retry, because the failures that get this far are usually the upstream's own
            // flake rather than anything about this wallet.
            await pace(pageRetryMs);
            if (halted()) return;
            page = await request();
            if (halted()) return;
          }
          if (!page.ok) {
            // Nothing landed, so there is no story to tell: this is the error state.
            if (pages === 0) {
              fail(page.error);
              return;
            }
            // A page deep into the year failed for good. The reveal has already counted every page
            // before it, and the engine holds a real year's worth, so the run finishes with what
            // arrived and records that the wallet made more than the facts describe — a partial
            // story beats throwing a counted year away over one upstream fault.
            partial = true;
            break;
          }

          pages += 1;
          const before = state.txCount;
          state = accumulate(state, page.data);
          // The engine's own delta, not the page's length: what the reveal counts has to add up to
          // the final count it is completed with, and a page can carry transactions the cap or the
          // window's lower bound drops.
          handlers.current.onPage?.(state.txCount - before);

          if (page.data.next === null) break;
          if (pages >= maxPages) {
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
            : await read(["zerion", "fungible", fungibleId], () => api.fungible(fungibleId, signal));

        const extras: RewindExtras = {
          chains: await chainsRead,
          fungible: fungible ?? null,
          chart: (await chartRead) ?? null,
        };
        if (halted()) return;

        if (
          settle({ status: "ready", facts: finalize(state, extras), capped: state.capped || pageCapHit || partial })
        ) {
          handlers.current.onComplete?.(state.txCount);
        }
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
  }, [address, name, nowMs, api, maxPages, maxTransactions, timeoutMs, pageIntervalMs, pageRetryMs, client, attempt]);

  return {
    status: outcome.status,
    ...(outcome.status === "ready" ? { facts: outcome.facts } : {}),
    capped: outcome.status === "ready" && outcome.capped,
    ...(outcome.status === "failed" ? { error: outcome.error } : {}),
    retry,
  };
}
