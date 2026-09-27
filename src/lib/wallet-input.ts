/**
 * What was typed into the settings combobox, and what the dialog shows for it.
 *
 * The things a visitor can give are an address and a demo wallet's label, and neither needs the
 * server: a demo wallet's address was resolved once, when the wallet was vetted, so the dialog's
 * feedback costs no round trip.
 *
 * The pattern here deliberately repeats the server's own boundary check (`src/server/inputs.ts`):
 * the server never trusts client-side validation, and no server module belongs in the browser
 * bundle, so the two checks stay independent by design.
 */

import type { WalletStatus } from "../components/ui/WalletCombobox";
import { shortAddress } from "../engine/types";
import { type DemoWalletEntry, demoWallets } from "./demo-wallets";
import { asAddress, type ConnectedWallet } from "./wallet-store";

export type WalletInputReading =
  | { readonly kind: "empty" }
  /** An address, or a demo wallet's label: known without asking anyone. */
  | { readonly kind: "wallet"; readonly wallet: ConnectedWallet }
  | { readonly kind: "invalid" };

export function readWalletInput(value: string, wallets: readonly DemoWalletEntry[] = demoWallets): WalletInputReading {
  const trimmed = value.trim();
  if (trimmed === "") return { kind: "empty" };

  // A demo pick puts the label in the field, and that label's address is already known.
  const demo = wallets.find((w) => w.address && w.label.toLowerCase() === trimmed.toLowerCase());
  if (demo?.address) return { kind: "wallet", wallet: { address: demo.address, name: demo.label } };

  const address = asAddress(trimmed);
  if (address) return { kind: "wallet", wallet: { address } };

  return { kind: "invalid" };
}

export const INVALID_INPUT = "That isn't an address or an ENS name. Paste an address like 0x1234…";

export type WalletInputState = {
  readonly status: WalletStatus;
  /** The shortened address the combobox shows beside a valid field. */
  readonly resolved?: string;
  readonly error?: string;
  /** The wallet to connect, once there is one. */
  readonly wallet: ConnectedWallet | null;
};

/** The combobox's state for the current field value. */
export function walletInputState(value: string, wallets: readonly DemoWalletEntry[] = demoWallets): WalletInputState {
  const reading = readWalletInput(value, wallets);

  if (reading.kind === "empty") return { status: "idle", wallet: null };
  if (reading.kind === "invalid") return { status: "invalid", error: INVALID_INPUT, wallet: null };

  return { status: "valid", resolved: shortAddress(reading.wallet.address), wallet: reading.wallet };
}
