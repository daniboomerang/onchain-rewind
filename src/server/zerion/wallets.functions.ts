/**
 * Wallet-scoped Zerion reads: one page of transactions, and the year balance chart.
 *
 * Both are thin — validate, call `zerionFetch`, trim — and both return the client's typed result,
 * so a bad address or a failing upstream is a value the UI renders, never an exception. Each
 * server function is only the boundary around the exported `read…` function below it, which is
 * where the tests live.
 */

import { createServerFn } from "@tanstack/react-start";
import type { BalanceChart, TransactionsPage } from "#/engine/zerion.ts";
import { isZerionUrl, normalizeWalletAddress } from "#/server/inputs.ts";
import { ZERION_BASE_URL, type ZerionResult, zerionFetch } from "#/server/zerion/client.ts";
import {
  type RawChartDocument,
  type RawTransactionsDocument,
  trimBalanceChart,
  trimTransactionsPage,
} from "#/server/zerion/trim.ts";

/** SPEC §5: page size 100, at most 20 pages, so a page is 100 transactions. */
const PAGE_SIZE = 100;
/** SPEC §5: the Rewind's window is the last 365 days. */
const WINDOW_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The year chart period — 1 point per day over the last 365 days (OpenAPI `chart_period` enum). */
const YEAR_PERIOD = "year";

export type TransactionsPageInput = { readonly address: string; readonly next?: string };

/**
 * One page of a wallet's transactions, newest first. Zerion's transactions endpoint has no sort
 * parameter, so the order is fixed; `next` is the absolute `links.next` URL from the previous page,
 * followed exactly as returned.
 */
export const getTransactionsPage = createServerFn({ method: "GET" })
  .validator((input: TransactionsPageInput) => input)
  .handler(({ data }) => readTransactionsPage(data));

export async function readTransactionsPage(input: TransactionsPageInput): Promise<ZerionResult<TransactionsPage>> {
  const address = normalizeWalletAddress(input.address);
  if (!address) return { ok: false, error: "invalid_address" };

  // A cursor we didn't get from Zerion is not something to follow.
  if (input.next !== undefined && !isZerionUrl(input.next, ZERION_BASE_URL)) {
    return { ok: false, error: "upstream" };
  }

  // A `links.next` URL already carries the window, the page size and every filter.
  const result = input.next
    ? await zerionFetch<RawTransactionsDocument>(input.next)
    : await zerionFetch<RawTransactionsDocument>(`/v1/wallets/${address}/transactions/`, {
        "filter[trash]": "only_non_trash",
        "filter[min_mined_at]": windowStartMs(),
        "page[size]": PAGE_SIZE,
      });

  return result.ok ? { ok: true, data: trimTransactionsPage(result.data) } : result;
}

export type BalanceChartInput = { readonly address: string };

/** The wallet's portfolio value over the last 365 days, one point per day. */
export const getBalanceChart = createServerFn({ method: "GET" })
  .validator((input: BalanceChartInput) => input)
  .handler(({ data }) => readBalanceChart(data));

export async function readBalanceChart(input: BalanceChartInput): Promise<ZerionResult<BalanceChart>> {
  const address = normalizeWalletAddress(input.address);
  if (!address) return { ok: false, error: "invalid_address" };

  const result = await zerionFetch<RawChartDocument>(`/v1/wallets/${address}/charts/${YEAR_PERIOD}`);
  if (!result.ok) return result;

  const chart = trimBalanceChart(result.data);
  return chart ? { ok: true, data: chart } : { ok: false, error: "not_found" };
}

/**
 * The window's lower bound, in milliseconds, floored to the start of a UTC day. Flooring is what
 * makes two calls minutes apart the same call, so the response cache can serve the second one.
 */
function windowStartMs(): number {
  const startOfToday = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  return startOfToday - WINDOW_DAYS * DAY_MS;
}
