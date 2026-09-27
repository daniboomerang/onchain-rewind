/**
 * Boundary validation for every server function.
 *
 * Zerion's wallet paths take hex addresses and its fungible paths take opaque ids, so both are
 * checked here before they ever reach a URL. A server function turns a rejection into a typed
 * result the UI can render, never into a thrown error.
 */

import type { Address } from "#/engine/types.ts";

const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Zerion fungible ids are UUIDs or short slugs (`eth`), at most 44 characters per the OpenAPI spec. */
const FUNGIBLE_ID = /^[A-Za-z0-9._-]{1,44}$/;
const ENS_NAME = /^[^\s/?#]+\.eth$/;

/**
 * Lowercased so that two spellings of the same wallet are one cache entry. Zerion accepts either,
 * and `RewindFacts.wallet.address` is only ever displayed shortened.
 */
export function normalizeWalletAddress(value: string): Address | null {
  return WALLET_ADDRESS.test(value) ? (value.toLowerCase() as Address) : null;
}

/** Rejects anything that could escape the fungibles path, including `..` and slashes. */
export function isFungibleId(value: string): boolean {
  return FUNGIBLE_ID.test(value) && !value.includes("..");
}

/** A name the Rewind accepts for ENS resolution. Normalisation itself is viem's job. */
export function isEnsName(value: string): boolean {
  return ENS_NAME.test(value.toLowerCase());
}

/** `links.next` is followed exactly as returned, so a cursor must be a Zerion URL and nothing else. */
export function isZerionUrl(value: string, baseUrl: string): boolean {
  try {
    return new URL(value).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}
