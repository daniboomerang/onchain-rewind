import type { BalancePoint, RewindFacts } from "./types";

const months = (values: number[], overrides: Record<number, string> = {}): BalancePoint[] =>
  values.map((value, i) => ({ date: overrides[i] ?? `2025-${String(i + 1).padStart(2, "0")}-15`, value }));

const normalSeries = months([12480, 13900, 11200, 9820, 9120, 10400, 13650, 15200, 17800, 24310, 21400, 18902], {
  4: "2025-05-21",
  9: "2025-10-12",
});

/** Typical active wallet. Sample numbers, not real data. */
export const normalWallet: RewindFacts = {
  wallet: { name: "vitalik.eth", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  txCount: 1284,
  firstTx: { date: "2022-03-14", chainName: "Ethereum" },
  daysOnchain: 1294,
  chains: [
    { id: "base", name: "Base", share: 46 },
    { id: "ethereum", name: "Ethereum", share: 27 },
    { id: "arbitrum", name: "Arbitrum", share: 14 },
    { id: "optimism", name: "Optimism", share: 8 },
    { id: "polygon", name: "Polygon", share: 5 },
  ],
  chainCount: 6,
  topToken: { symbol: "ETH", name: "Ether", timesTraded: 214, changePct: 38.4 },
  balance: {
    series: normalSeries,
    high: normalSeries[9] ?? { date: "2025-10-12", value: 24310 },
    low: normalSeries[4] ?? { date: "2025-05-21", value: 9120 },
    current: 18902,
    changePct: 51.5,
  },
};

/** No transactions → EmptyState. */
export const emptyWallet: RewindFacts = {
  wallet: { address: "0x1111111111111111111111111111111111111111" },
  txCount: 0,
  daysOnchain: 0,
  chains: [],
  chainCount: 0,
};

const downSeries = months([4200, 3900, 4400, 3600, 3100, 2700, 2900, 2300, 1900, 2100, 1650, 1480], {
  2: "2025-03-09",
  11: "2025-12-28",
});

/** Address only (no ENS), one chain, negative token change. */
export const negativeWallet: RewindFacts = {
  wallet: { address: "0x5a0B54D5dc17e0AadC383d2db43B0a0D3E029c4c" },
  txCount: 97,
  firstTx: { date: "2024-11-02", chainName: "Ethereum" },
  daysOnchain: 331,
  chains: [{ id: "ethereum", name: "Ethereum", share: 100 }],
  chainCount: 1,
  topToken: { symbol: "PEPE", name: "Pepe", timesTraded: 37, changePct: -42.7 },
  balance: {
    series: downSeries,
    high: downSeries[2] ?? { date: "2025-03-09", value: 4400 },
    low: downSeries[11] ?? { date: "2025-12-28", value: 1480 },
    current: 1480,
    changePct: -64.8,
  },
};

export const fixtures = { normal: normalWallet, empty: emptyWallet, negative: negativeWallet } as const;
export type FixtureName = keyof typeof fixtures;
