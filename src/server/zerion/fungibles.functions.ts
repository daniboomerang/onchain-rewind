/** One fungible: the name, symbol and icon card 3 shows, and its price change over the year. */

import { createServerFn } from "@tanstack/react-start";
import type { FungibleLite } from "#/engine/zerion.ts";
import { isFungibleId } from "#/server/inputs.ts";
import { type ZerionResult, zerionFetch } from "#/server/zerion/client.ts";
import { type RawFungibleDocument, trimFungible } from "#/server/zerion/trim.ts";

export type FungibleInput = { readonly id: string };

export const getFungible = createServerFn({ method: "GET" })
  .validator((input: FungibleInput) => input)
  .handler(({ data }) => readFungible(data));

export async function readFungible(input: FungibleInput): Promise<ZerionResult<FungibleLite>> {
  // An id that could escape the fungibles path never becomes a URL.
  if (!isFungibleId(input.id)) return { ok: false, error: "not_found" };

  const result = await zerionFetch<RawFungibleDocument>(`/v1/fungibles/${input.id}`);
  if (!result.ok) return result;

  const fungible = trimFungible(result.data);
  return fungible ? { ok: true, data: fungible } : { ok: false, error: "not_found" };
}
