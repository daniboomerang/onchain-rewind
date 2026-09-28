/**
 * What was typed into the settings combobox, and what the dialog shows for it.
 *
 * The three things a visitor can give are an address, a demo wallet's label and an ENS name, and
 * only the last needs the server: a demo wallet's address was resolved once, when the wallet was
 * vetted, so the dialog's feedback for the first two costs no round trip. A name is resolved on the
 * server with viem (SPEC §10), through TanStack Query, and its states are the combobox's
 * `resolving` and `invalid`.
 *
 * The patterns here deliberately repeat the server's own boundary check (`src/server/inputs.ts`):
 * the server never trusts client-side validation, and no server module belongs in the browser
 * bundle, so the two checks stay independent by design.
 */

import { useQuery } from "@tanstack/react-query";
import type { WalletStatus } from "../components/ui/WalletCombobox";
import { shortAddress } from "../engine/types";
import { type DemoWalletEntry, demoWallets } from "./demo-wallets";
import { asAddress, type ConnectedWallet } from "./wallet-store";

/** The same shape the server accepts: normalisation itself is viem's job, on the server. */
const ENS_NAME = /^[^\s/?#]+\.eth$/;

export type WalletInputReading =
  | { readonly kind: "empty" }
  /** An address, or a demo wallet's label: known without asking anyone. */
  | { readonly kind: "wallet"; readonly wallet: ConnectedWallet }
  /** An ENS name, still to be resolved on the server. */
  | { readonly kind: "name"; readonly name: string }
  | { readonly kind: "invalid" };

export function readWalletInput(value: string, wallets: readonly DemoWalletEntry[] = demoWallets): WalletInputReading {
  const trimmed = value.trim();
  if (trimmed === "") return { kind: "empty" };

  // A demo pick puts the label in the field, and that label's address is already known.
  const demo = wallets.find((w) => w.label.toLowerCase() === trimmed.toLowerCase());
  if (demo) return { kind: "wallet", wallet: { address: demo.address, name: demo.label } };

  const address = asAddress(trimmed);
  if (address) return { kind: "wallet", wallet: { address } };

  const name = trimmed.toLowerCase();
  if (ENS_NAME.test(name)) return { kind: "name", name };

  return { kind: "invalid" };
}

export const INVALID_INPUT = "That isn't an address or an ENS name. Paste an address like 0x1234…";
/** Every failed resolution ends the same way: suggest an address, which needs nobody's help. */
export const UNRESOLVED: Record<"not_found" | "upstream" | "invalid_name", string> = {
  not_found: "No wallet is registered to that name. Paste an address instead.",
  upstream: "ENS didn't answer just now. Paste an address instead.",
  invalid_name: INVALID_INPUT,
};

export type WalletInputState = {
  readonly status: WalletStatus;
  /** The shortened address the combobox shows beside a valid field. */
  readonly resolved?: string;
  readonly error?: string;
  /** The wallet to connect, once there is one. */
  readonly wallet: ConnectedWallet | null;
};

/**
 * The combobox's state for the current field value, resolving an ENS name on the server when the
 * value is one. The query key is the name, so the same name typed again — after a wrong paste, or
 * on a second visit to settings — is served from the cache for as long as a read stays fresh
 * (`STALE_TIME_MS`) instead of being read from mainnet twice.
 */
export function useWalletInput(value: string, wallets: readonly DemoWalletEntry[] = demoWallets): WalletInputState {
  const reading = readWalletInput(value, wallets);
  const name = reading.kind === "name" ? reading.name : null;

  const query = useQuery({
    queryKey: ["ens", name],
    // Imported at call time, not at module scope: the ENS module's own server-side viem client
    // keeps viem reachable from anything that imports it statically, which would put a quarter of a
    // megabyte of it in the bundle every first visit loads — including the visits that never type a
    // name at all.
    queryFn: async () => {
      const { resolveEnsName } = await import("../server/ens/ens.functions");
      return resolveEnsName({ data: { name: name ?? "" } });
    },
    enabled: name !== null,
    // No retries: a visitor waiting on a dialog gets the invalid state and a way forward — pasting
    // an address — faster than three backed-off attempts at a name that may not exist at all.
    retry: false,
  });

  if (reading.kind === "empty") return { status: "idle", wallet: null };
  if (reading.kind === "invalid") return { status: "invalid", error: INVALID_INPUT, wallet: null };
  if (reading.kind === "wallet") {
    return { status: "valid", resolved: shortAddress(reading.wallet.address), wallet: reading.wallet };
  }

  // A name. `isPending` covers the first read; `isFetching` covers a re-read of a name whose cached
  // result is stale, so the spinner shows rather than a stale verdict.
  if (query.isPending || query.isFetching) return { status: "resolving", wallet: null };
  // A transport failure, as opposed to a result saying the name doesn't resolve.
  if (query.isError || !query.data) return { status: "invalid", error: UNRESOLVED.upstream, wallet: null };
  if (!query.data.ok) return { status: "invalid", error: UNRESOLVED[query.data.error], wallet: null };

  const wallet: ConnectedWallet = { address: query.data.data.address, name: query.data.data.name };
  return { status: "valid", resolved: shortAddress(wallet.address), wallet };
}
