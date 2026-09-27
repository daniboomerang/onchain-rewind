/**
 * The trimmed Zerion shapes.
 *
 * Types only — no runtime code. The server produces these shapes (`src/server/`) and the engine
 * reads them: ADR-0003 keeps all knowledge of Zerion's responses in `src/engine/`, and the engine
 * may never import server code. Raw JSON:API documents stop at the server boundary.
 *
 * Every field below was confirmed against the OpenAPI spec (openapi 3.0.3, info.version 1.0.0,
 * <https://developers.zerion.io/openapi-v1.yaml>) and against a live response for `vitalik.eth`.
 */

/** One asset moved by a transfer. */
export type FungibleRef = {
  /** Zerion's fungible id — the key `getFungible` takes. Missing on assets Zerion doesn't index. */
  id?: string;
  symbol: string;
  name: string;
  iconUrl?: string;
};

export type TransferLite = {
  direction: "in" | "out" | "self";
  /** USD value of the transfer, or null when Zerion can't price it. Breaks `topToken` ties. */
  value: number | null;
  /** Missing on NFT transfers, which token counting skips. */
  fungible?: FungibleRef;
};

export type TxLite = {
  id: string;
  /** ISO 8601 UTC instant, exactly as Zerion returns it (`2026-09-27T13:14:11Z`). */
  minedAt: string;
  /** Zerion's `operation_type`: `trade`, `send`, `receive`, `execute`, `mint`, `claim`, … */
  operationType: string;
  /** Zerion chain id (`ethereum`, `base`). Missing when a transaction carries no chain relationship. */
  chainId?: string;
  transfers: TransferLite[];
};

export type TransactionsPage = {
  items: TxLite[];
  /** The absolute `links.next` URL, handed back to `getTransactionsPage` unchanged. Null on the last page. */
  next: string | null;
  /** Transactions in this page — what the reveal counts. */
  count: number;
};

export type ChainLite = {
  /** Zerion chain id, the key `TxLite.chainId` carries. */
  id: string;
  name: string;
  iconUrl?: string;
};

export type FungibleLite = {
  id: string;
  symbol: string;
  name: string;
  iconUrl?: string;
  /** Price change over the last year, in percent, from market data. Null when Zerion has none. */
  changePct365d: number | null;
};

export type BalanceChartPoint = {
  /** Unix seconds, UTC. */
  ts: number;
  /** Portfolio value in USD. */
  value: number;
};

export type BalanceChart = {
  /** ISO 8601 instants bounding the series, as Zerion returns them. */
  beginAt: string;
  endAt: string;
  /** One point per day over the last 365 days, oldest first. */
  points: BalanceChartPoint[];
};
