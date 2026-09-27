/**
 * ENS resolution, on the server, on mainnet.
 *
 * Zerion does not resolve names: every wallet path parameter must be a hex address (SPEC §5). A
 * name is normalised first — ENSIP-15, viem's `normalize` — then read from mainnet through viem's
 * default public transport (SPEC §10). A name nobody has registered resolves to null, which the
 * Rewind treats as invalid, exactly like a malformed address.
 */

import { createServerFn } from "@tanstack/react-start";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import type { Address } from "#/engine/types.ts";
import type { EnsResult } from "#/server/ens/ens.types.ts";
import { isEnsName } from "#/server/inputs.ts";

/** One client for the process: viem holds no per-request state, and mainnet is the only ENS registry. */
const mainnetClient = createPublicClient({ chain: mainnet, transport: http() });

export type EnsInput = { readonly name: string };

export const resolveEnsName = createServerFn({ method: "GET" })
  .validator((input: EnsInput) => input)
  .handler(({ data }) => readEnsAddress(data));

export async function readEnsAddress(input: EnsInput): Promise<EnsResult> {
  if (!isEnsName(input.name)) return { ok: false, error: "invalid_name" };

  let name: string;
  try {
    name = normalize(input.name);
  } catch {
    return { ok: false, error: "invalid_name" };
  }

  let address: Address | null;
  try {
    address = await mainnetClient.getEnsAddress({ name });
  } catch {
    // Never surfaced raw: an RPC message would mean nothing to a visitor.
    return { ok: false, error: "upstream" };
  }

  return address ? { ok: true, data: { name, address } } : { ok: false, error: "not_found" };
}
