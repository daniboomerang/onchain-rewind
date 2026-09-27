/**
 * Raw Zerion responses in, trimmed shapes out.
 *
 * These are the only functions that read a JSON:API document. They are pure — no fetch, no clock,
 * no key — so they are tested against the recorded fixtures in `src/engine/__fixtures__/`. They
 * trim and rename; they never aggregate. Counting, grouping and percentages belong to the engine.
 *
 * The raw types below name only the fields the Rewind reads, each confirmed against the OpenAPI
 * spec (openapi 3.0.3, info.version 1.0.0) and a live response. Fields the spec marks optional or
 * nullable are optional here too, so a thin response trims instead of throwing.
 */

import type {
  BalanceChart,
  BalanceChartPoint,
  ChainLite,
  FungibleLite,
  FungibleRef,
  TransactionsPage,
  TransferLite,
  TxLite,
} from "#/engine/zerion.ts";

/* ---- Raw shapes (Zerion's `GET /v1/…` documents, trimmed to what we read) ---- */

type RawIcon = { readonly url?: string | null };

type RawFungibleInfo = {
  readonly id?: string;
  readonly name?: string;
  readonly symbol?: string;
  readonly icon?: RawIcon | null;
};

type RawTransfer = {
  readonly direction?: string;
  readonly value?: number | null;
  readonly fungible_info?: RawFungibleInfo | null;
};

type RawTransaction = {
  readonly id?: string;
  readonly attributes?: {
    readonly operation_type?: string;
    readonly mined_at?: string;
    readonly transfers?: readonly RawTransfer[];
  };
  readonly relationships?: { readonly chain?: { readonly data?: { readonly id?: string } } };
};

export type RawTransactionsDocument = {
  readonly data?: readonly RawTransaction[];
  readonly links?: { readonly next?: string | null };
};

export type RawChainsDocument = {
  readonly data?: readonly {
    readonly id?: string;
    readonly attributes?: { readonly name?: string; readonly icon?: RawIcon | null };
  }[];
};

export type RawFungibleDocument = {
  readonly data?: {
    readonly id?: string;
    readonly attributes?: {
      readonly name?: string;
      readonly symbol?: string;
      readonly icon?: RawIcon | null;
      readonly market_data?: { readonly changes?: { readonly percent_365d?: number | null } | null } | null;
    };
  };
};

export type RawChartDocument = {
  readonly data?: {
    readonly attributes?: {
      readonly begin_at?: string;
      readonly end_at?: string;
      /** `[unix seconds, value]` tuples. Typed loosely because JSON:API says nothing stronger. */
      readonly points?: readonly (readonly unknown[])[];
    };
  };
};

/* ---- Trimming ---- */

/**
 * One page of transactions. A transaction missing an id, a timestamp or an operation type is
 * dropped rather than guessed at — `count` reports what survived, which is what the reveal shows.
 */
export function trimTransactionsPage(document: RawTransactionsDocument): TransactionsPage {
  const items: TxLite[] = [];

  for (const raw of document.data ?? []) {
    const attributes = raw.attributes;
    if (!raw.id || !attributes?.mined_at || !attributes.operation_type) continue;

    const chainId = raw.relationships?.chain?.data?.id;
    items.push({
      id: raw.id,
      minedAt: attributes.mined_at,
      operationType: attributes.operation_type,
      ...(chainId ? { chainId } : {}),
      transfers: (attributes.transfers ?? []).map(trimTransfer),
    });
  }

  return { items, next: document.links?.next ?? null, count: items.length };
}

export function trimChains(document: RawChainsDocument): ChainLite[] {
  const chains: ChainLite[] = [];

  for (const raw of document.data ?? []) {
    const name = raw.attributes?.name;
    if (!raw.id || !name) continue;

    const iconUrl = raw.attributes?.icon?.url;
    chains.push({ id: raw.id, name, ...(iconUrl ? { iconUrl } : {}) });
  }

  return chains;
}

/** Null when the document carries no usable fungible: the caller turns that into `not_found`. */
export function trimFungible(document: RawFungibleDocument): FungibleLite | null {
  const raw = document.data;
  const attributes = raw?.attributes;
  if (!raw?.id || !attributes?.symbol || !attributes.name) return null;

  const iconUrl = attributes.icon?.url;
  return {
    id: raw.id,
    symbol: attributes.symbol,
    name: attributes.name,
    ...(iconUrl ? { iconUrl } : {}),
    changePct365d: attributes.market_data?.changes?.percent_365d ?? null,
  };
}

/** Null when the document carries no window: a chart without `begin_at`/`end_at` isn't a series. */
export function trimBalanceChart(document: RawChartDocument): BalanceChart | null {
  const attributes = document.data?.attributes;
  if (!attributes?.begin_at || !attributes.end_at) return null;

  const points: BalanceChartPoint[] = [];
  for (const point of attributes.points ?? []) {
    const [ts, value] = point;
    if (typeof ts !== "number" || typeof value !== "number") continue;
    points.push({ ts, value });
  }

  return { beginAt: attributes.begin_at, endAt: attributes.end_at, points };
}

function trimTransfer(raw: RawTransfer): TransferLite {
  const fungible = trimFungibleRef(raw.fungible_info);
  return {
    direction: raw.direction === "in" || raw.direction === "out" ? raw.direction : "self",
    value: raw.value ?? null,
    ...(fungible ? { fungible } : {}),
  };
}

/** Undefined for an NFT transfer, which carries `nft_info` instead and never counts as a token. */
function trimFungibleRef(raw: RawFungibleInfo | null | undefined): FungibleRef | undefined {
  if (!raw?.symbol || !raw.name) return undefined;

  const iconUrl = raw.icon?.url;
  return { ...(raw.id ? { id: raw.id } : {}), symbol: raw.symbol, name: raw.name, ...(iconUrl ? { iconUrl } : {}) };
}
