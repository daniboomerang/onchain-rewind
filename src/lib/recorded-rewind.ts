/**
 * The recorded snapshot (ADR-0005): what a run plays when Zerion refuses its first page for a quota
 * limit — a rate limit that outlasted its backoffs and its retry, or a spent day.
 *
 * It is the `vitalik.eth` recording the engine's own tests read, trimmed by the server's own pure
 * `trim*` functions, so the snapshot and the live path produce the same shapes and the engine can't
 * tell them apart. `useRewind` loads this module with a dynamic `import()` and only on that fallback:
 * the recording is about 170 KB of JSON that no live run should download.
 *
 * The recording is two pages, about five weeks, beside a full-year chart. `pages` is what ends the
 * run there, with a page still behind it, so the story is told as a year cut short ("+" on the counts,
 * "onchain by" on the first card) rather than five weeks passed off as the whole year.
 */

import chainsDocument from "#/engine/__fixtures__/chains.json";
import chartDocument from "#/engine/__fixtures__/chart-year.vitalik.eth.json";
import fungibleDocument from "#/engine/__fixtures__/fungible-eth.json";
import page1Document from "#/engine/__fixtures__/transactions-p1.vitalik.eth.json";
import page2Document from "#/engine/__fixtures__/transactions-p2.vitalik.eth.json";
import type { Address } from "#/engine/types.ts";
import type { TransactionsPage } from "#/engine/zerion.ts";
import type { RewindApi, RewindWallet } from "#/lib/useRewind.ts";
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

export type RecordedRewind = {
  /** The wallet the recording is of. The story names it, never the wallet the visitor picked. */
  readonly wallet: RewindWallet;
  /**
   * The instant the recording was made. The engine's window is relative to `now`, so reading the
   * snapshot against the clock would drop its transactions out of the year a day at a time.
   */
  readonly now: Date;
  /** Where the recording ends. The run stops there with a page still behind it: a year cut short. */
  readonly pages: number;
  /** Answers from memory: no request, no budget, no pacing, and nothing written to Query's cache. */
  readonly api: RewindApi;
};

const pages: readonly TransactionsPage[] = [
  trimTransactionsPage(page1Document as RawTransactionsDocument),
  trimTransactionsPage(page2Document as RawTransactionsDocument),
];
const chains = trimChains(chainsDocument as RawChainsDocument);
const fungible = trimFungible(fungibleDocument as RawFungibleDocument);
const chart = trimBalanceChart(chartDocument as RawChartDocument);

/** The page a cursor points at: the first page for none, else the page after the one that handed it out. */
const pageAt = (next: string | undefined) =>
  next === undefined ? pages[0] : pages[pages.findIndex((page) => page.next === next) + 1];

export const recordedRewind: RecordedRewind = {
  wallet: { address: "0xd8dA6BF26964aF9D7eEd9e03e53415D37aA96045" as Address, name: "vitalik.eth" },
  // The last recorded transaction was mined at 13:44:59Z that day; this is the instant the engine's
  // own tests read the same recording at.
  now: new Date("2026-09-27T14:00:00Z"),
  pages: pages.length,
  api: {
    transactionsPage: async ({ next }) => {
      const page = pageAt(next);
      return page ? { ok: true, data: page } : { ok: false, error: "not_found" };
    },
    chains: async () => ({ ok: true, data: chains }),
    fungible: async (id) => (fungible?.id === id ? { ok: true, data: fungible } : { ok: false, error: "not_found" }),
    balanceChart: async () => (chart ? { ok: true, data: chart } : { ok: false, error: "not_found" }),
  },
};
