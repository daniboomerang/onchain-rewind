/** Zerion's chain list: the names and icons the engine joins onto a transaction's `chainId`. */

import { createServerFn } from "@tanstack/react-start";
import type { ChainLite } from "#/engine/zerion.ts";
import { type ZerionResult, zerionFetch } from "#/server/zerion/client.ts";
import { type RawChainsDocument, trimChains } from "#/server/zerion/trim.ts";

/** Cached for 24 hours inside the client, because chain names and icons barely move. */
export const getChains = createServerFn({ method: "GET" }).handler(() => readChains());

export async function readChains(): Promise<ZerionResult<ChainLite[]>> {
  const result = await zerionFetch<RawChainsDocument>("/v1/chains/");
  return result.ok ? { ok: true, data: trimChains(result.data) } : result;
}
