/**
 * UI data contract. The data layer maps the Zerion API into `RewindFacts`;
 * components only read this shape. Optional fields (`?`) hide the card or value they feed.
 */

export type Address = `0x${string}`;

export type ChainShare = {
  id: string;
  name: string;
  /** Share of the wallet's transactions, 0–100. */
  share: number;
  iconUrl?: string;
};

export type TopToken = {
  symbol: string;
  name: string;
  iconUrl?: string;
  timesTraded: number;
  /** Price change since the wallet's first trade, in percent (e.g. 38.4, −12.1). */
  changePct: number;
};

export type BalancePoint = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** USD. */
  value: number;
};

export type RewindFacts = {
  wallet: {
    /** ENS name. Missing → short address is shown. */
    name?: string;
    address: Address;
  };
  /** Total transactions. 0 → empty state. */
  txCount: number;
  /** Missing on empty wallets. Feeds card 1 (Origin). */
  firstTx?: {
    date: string; // ISO YYYY-MM-DD
    chainName?: string;
  };
  daysOnchain: number;
  /** Sorted by share, descending. Top 5 are shown on card 2. Empty → card 2 hidden. */
  chains: ChainShare[];
  /** Total chains used (can exceed chains.length). */
  chainCount: number;
  /** Missing → card 3 hidden, share card shows "—". */
  topToken?: TopToken;
  /** Missing or < 2 points → card 4 hidden. `high`/`low` must be points of `series`. */
  balance?: {
    series: BalancePoint[];
    high: BalancePoint;
    low: BalancePoint;
    current: number;
    /** Change over the series, in percent. */
    changePct: number;
  };
};

/* Display helpers shared by the player and the share image. */

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const fmt = {
  int: (n: number) => Math.round(n).toLocaleString("en-US"),
  usd: (n: number) => `$${Math.round(n).toLocaleString("en-US")}`,
  pct: (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`,
  dateLong: (iso: string) => utc(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }),
  dateShort: (iso: string) => utc(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  monthYear: (iso: string) => utc(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
};

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const displayName = (w: RewindFacts["wallet"]) => w.name ?? shortAddress(w.address);
