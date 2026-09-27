/**
 * The client-safe result of resolving an ENS name.
 *
 * ENS is not Zerion — Zerion's wallet paths take hex addresses only — so resolution has its own
 * failure vocabulary: a name that isn't resolvable at all, a name nobody has registered, and a
 * mainnet RPC that didn't answer.
 */

import type { Address } from "#/engine/types.ts";

export type EnsErrorCode = "invalid_name" | "not_found" | "upstream";

export type EnsResult =
  | { readonly ok: true; readonly data: { readonly name: string; readonly address: Address } }
  | { readonly ok: false; readonly error: EnsErrorCode };
