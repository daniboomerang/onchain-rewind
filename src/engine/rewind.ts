/**
 * The Rewind engine: trimmed Zerion pages in, `RewindFacts` out.
 *
 * `createState(window) → accumulate(state, page) → finalize(state, extras)`. Each step is pure and
 * each returns a new value, so the player can finalize after any page and never holds a wallet's
 * whole history in memory — only the running tallies below. `now` is injected; the engine reads no
 * clock, performs no I/O, and imports nothing outside this folder (ADR-0003).
 *
 * The aggregation rules, with their worked examples, live in `.claude/rules/rewind-engine.md`; the
 * field-by-field mapping they implement is SPEC.md §5.
 */

import type { Address, BalancePoint, ChainShare, RewindFacts, TopToken } from "./types.ts";
import type { BalanceChart, ChainLite, FungibleLite, FungibleRef, TransactionsPage, TxLite } from "./zerion.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** SPEC §5: the window is the last 365 days. */
export const WINDOW_DAYS = 365;
/** SPEC §5: page size 100, at most 20 pages — beyond this the UI says "2,000+". */
export const MAX_TRANSACTIONS = 2000;

export type RewindWindow = {
  readonly wallet: { readonly address: Address; readonly name?: string };
  /** The instant the window ends. Injected, so a run is reproducible and tests are deterministic. */
  readonly now: Date;
  /** Overrides the cap. Tests use it; the app takes the default. */
  readonly maxTransactions?: number;
};

/** One fungible's running tally: what decides the top token, and the tie-breaks behind it. */
type TokenTally = {
  readonly ref: FungibleRef;
  /** Transactions this fungible appeared in — `TopToken.timesTraded`. */
  readonly count: number;
  /** Summed USD value of its transfers, which breaks a tie on count. */
  readonly volumeUsd: number;
};

export type RewindState = {
  readonly window: RewindWindow;
  /** Start of the window, in milliseconds. Transactions older than this don't count. */
  readonly windowStartMs: number;
  readonly txCount: number;
  /**
   * True once the cap hides transactions the wallet really made. `RewindFacts` carries no such
   * field — the count it reports is the honest one — so the player reads it here to show "2,000+".
   */
  readonly capped: boolean;
  readonly chainCounts: ReadonlyMap<string, number>;
  /** Counted transactions that named a chain — the denominator chain shares divide by. */
  readonly chainedCount: number;
  readonly trades: ReadonlyMap<string, TokenTally>;
  readonly transfers: ReadonlyMap<string, TokenTally>;
  /** The oldest counted transaction, which is where the wallet's year started. */
  readonly oldest?: { readonly minedAtMs: number; readonly chainId?: string };
};

/** What `finalize` needs beyond the transaction pages, each fetched once by the caller. */
export type RewindExtras = {
  /** Zerion's chain list, for names and icons. A chain missing from it keeps its id as its name. */
  readonly chains?: readonly ChainLite[];
  /** The fungible `topFungible` named, with its market data. Null when the fetch found none. */
  readonly fungible?: FungibleLite | null;
  /** The year balance chart. Null when the wallet has none. */
  readonly chart?: BalanceChart | null;
};

export function createState(window: RewindWindow): RewindState {
  return {
    window,
    windowStartMs: window.now.getTime() - WINDOW_DAYS * DAY_MS,
    txCount: 0,
    capped: false,
    chainCounts: new Map(),
    chainedCount: 0,
    trades: new Map(),
    transfers: new Map(),
  };
}

/**
 * Folds one page into the state and returns a new one — the page itself is never kept.
 *
 * The server already asks Zerion for non-trash transactions inside the window, so this re-checks
 * only the lower bound: a page fetched against a different instant, or replayed from a fixture,
 * can still carry transactions the injected `now` puts outside the year.
 */
export function accumulate(state: RewindState, page: TransactionsPage): RewindState {
  const cap = state.window.maxTransactions ?? MAX_TRANSACTIONS;
  const chainCounts = new Map(state.chainCounts);
  const trades = new Map(state.trades);
  const transfers = new Map(state.transfers);
  let { txCount, chainedCount, capped, oldest } = state;

  for (const tx of page.items) {
    const minedAtMs = Date.parse(tx.minedAt);
    if (Number.isNaN(minedAtMs) || minedAtMs < state.windowStartMs) continue;

    if (txCount >= cap) {
      capped = true;
      continue;
    }
    txCount += 1;

    if (tx.chainId !== undefined) {
      chainCounts.set(tx.chainId, (chainCounts.get(tx.chainId) ?? 0) + 1);
      chainedCount += 1;
    }

    if (!oldest || minedAtMs < oldest.minedAtMs) {
      oldest = { minedAtMs, ...(tx.chainId !== undefined ? { chainId: tx.chainId } : {}) };
    }

    tally(tx.operationType === "trade" ? trades : transfers, tx);
  }

  // A full cap with another page behind it is the "2,000+" case, even if this page fit exactly.
  if (txCount >= cap && page.next !== null) capped = true;

  return {
    ...state,
    txCount,
    chainedCount,
    capped,
    chainCounts,
    trades,
    transfers,
    ...(oldest ? { oldest } : {}),
  };
}

/**
 * The fungible card 3 would show, before its market data exists.
 *
 * Trades decide it; transfers are the fallback for a wallet that never traded. The caller fetches
 * `ref.id` and hands the result back through `RewindExtras.fungible` — `changePct` is a price
 * change only that response carries.
 */
export function topFungible(
  state: RewindState,
): { readonly ref: FungibleRef; readonly timesTraded: number } | undefined {
  const source = state.trades.size > 0 ? state.trades : state.transfers;
  const best = [...source.values()].sort(byTopToken)[0];
  return best ? { ref: best.ref, timesTraded: best.count } : undefined;
}

export function finalize(state: RewindState, extras: RewindExtras = {}): RewindFacts {
  const chains = new Map((extras.chains ?? []).map((chain) => [chain.id, chain]));
  const { name } = state.window.wallet;
  const firstTx = buildFirstTx(state, chains);
  const topToken = buildTopToken(state, extras.fungible ?? undefined);
  const balance = buildBalance(extras.chart ?? undefined);

  return {
    wallet: { address: state.window.wallet.address, ...(name !== undefined ? { name } : {}) },
    txCount: state.txCount,
    daysOnchain: state.oldest ? daysBetween(state.oldest.minedAtMs, state.window.now.getTime()) : 0,
    chains: buildChains(state, chains),
    chainCount: state.chainCounts.size,
    ...(firstTx ? { firstTx } : {}),
    ...(topToken ? { topToken } : {}),
    ...(balance ? { balance } : {}),
  };
}

/* ---- Pieces ---- */

function buildFirstTx(state: RewindState, chains: ReadonlyMap<string, ChainLite>): RewindFacts["firstTx"] {
  const oldest = state.oldest;
  if (!oldest) return undefined;

  const chainName = oldest.chainId === undefined ? undefined : chains.get(oldest.chainId)?.name;
  return { date: isoDate(oldest.minedAtMs), ...(chainName !== undefined ? { chainName } : {}) };
}

/**
 * Chains by transaction count, highest first, with shares that total exactly 100.
 *
 * Equal counts keep the order the wallet's year introduced them in, which `Array.prototype.sort`'s
 * stability preserves. The shares divide by the transactions that named a chain rather than by
 * `txCount`, so a transaction Zerion returns without a chain relationship can't leave the wheel
 * summing to less than 100.
 */
function buildChains(state: RewindState, chains: ReadonlyMap<string, ChainLite>): ChainShare[] {
  if (state.chainedCount === 0) return [];

  const counted = [...state.chainCounts].sort(([, a], [, b]) => b - a);
  const shares = largestRemainder(counted.map(([, count]) => (count / state.chainedCount) * 100));

  return counted.map(([id], index) => {
    const chain = chains.get(id);
    const iconUrl = chain?.iconUrl;
    return {
      id,
      name: chain?.name ?? id,
      share: shares[index] ?? 0,
      ...(iconUrl !== undefined ? { iconUrl } : {}),
    };
  });
}

function buildTopToken(state: RewindState, fungible: FungibleLite | undefined): TopToken | undefined {
  const top = topFungible(state);
  const changePct = fungible?.changePct365d;
  if (!top || !fungible || changePct === null || changePct === undefined) return undefined;
  // The fetched fungible has to be the one the transactions named, or the card would describe
  // one token with another's market data.
  if (top.ref.id !== undefined && top.ref.id !== fungible.id) return undefined;

  return {
    symbol: fungible.symbol,
    name: fungible.name,
    ...(fungible.iconUrl !== undefined ? { iconUrl: fungible.iconUrl } : {}),
    timesTraded: top.timesTraded,
    changePct: oneDecimal(changePct),
  };
}

/**
 * The balance year. `high` and `low` are points of `series`, never recomputed values, and a series
 * of fewer than two points — or one starting at zero, where a change has no meaning — has no story
 * to tell, so it leaves `balance` undefined and card 4 hides.
 */
function buildBalance(chart: BalanceChart | undefined): RewindFacts["balance"] {
  const points = chart?.points ?? [];
  if (points.length < 2) return undefined;

  const series: BalancePoint[] = points.map((point) => ({ date: isoDate(point.ts * 1000), value: point.value }));
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last || first.value === 0) return undefined;

  let high = first;
  let low = first;
  for (const point of series) {
    if (point.value > high.value) high = point;
    if (point.value < low.value) low = point;
  }

  return {
    series,
    high,
    low,
    current: last.value,
    changePct: oneDecimal(((last.value - first.value) / first.value) * 100),
  };
}

/** A fungible counts once per transaction, however many of its transfers that transaction carries. */
function tally(into: Map<string, TokenTally>, tx: TxLite): void {
  const inThisTx = new Map<string, { ref: FungibleRef; volumeUsd: number }>();

  for (const transfer of tx.transfers) {
    const ref = transfer.fungible;
    if (!ref) continue; // An NFT transfer carries no fungible, and no token counts for it.

    const key = ref.id ?? `symbol:${ref.symbol.toLowerCase()}`;
    const seen = inThisTx.get(key);
    inThisTx.set(key, { ref: seen?.ref ?? ref, volumeUsd: (seen?.volumeUsd ?? 0) + Math.abs(transfer.value ?? 0) });
  }

  for (const [key, seen] of inThisTx) {
    const running = into.get(key);
    into.set(key, {
      ref: running?.ref ?? seen.ref,
      count: (running?.count ?? 0) + 1,
      volumeUsd: (running?.volumeUsd ?? 0) + seen.volumeUsd,
    });
  }
}

/** Most transactions first, then the higher USD volume, then alphabetically by symbol. */
function byTopToken(a: TokenTally, b: TokenTally): number {
  if (a.count !== b.count) return b.count - a.count;
  if (a.volumeUsd !== b.volumeUsd) return b.volumeUsd - a.volumeUsd;

  const left = a.ref.symbol.toLowerCase();
  const right = b.ref.symbol.toLowerCase();
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Whole percentages that still add up to 100: floor every share, then hand the points that rounding
 * dropped to the largest fractions first. `raw` is a set of percentages summing to 100.
 */
function largestRemainder(raw: number[]): number[] {
  const shares = raw.map((value) => Math.floor(value));
  const byFraction = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  let left = 100 - shares.reduce((total, share) => total + share, 0);
  for (const { index } of byFraction) {
    if (left <= 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }

  return shares;
}

/** Whole UTC days from one instant to another, counting both ends — a wallet that started today has one. */
function daysBetween(fromMs: number, toMs: number): number {
  const days = Math.floor((startOfUtcDay(toMs) - startOfUtcDay(fromMs)) / DAY_MS) + 1;
  return Math.max(0, days);
}

const startOfUtcDay = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

/** ISO `YYYY-MM-DD`, in UTC — the only date shape `RewindFacts` carries. */
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One decimal, and never `-0`, which would print as "−0.0%". */
const oneDecimal = (value: number) => Math.round(value * 10) / 10 || 0;
