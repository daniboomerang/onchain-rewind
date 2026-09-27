/**
 * The demo wallets offered in settings.
 *
 * SPEC §6 and §10: real public wallets only, each vetted for a story worth watching, and each
 * listed with the address its name resolved to — so picking one never depends on ENS at runtime.
 * Never invent a name or an address.
 */

import type { DemoWallet } from "../components/ui/WalletCombobox";
import { type Address, shortAddress } from "../engine/types";

export type DemoWalletEntry = {
  readonly label: string;
  /** Absent while the slot is unfilled: the dialog offers it disabled. */
  readonly address?: Address;
};

export const demoWallets: readonly DemoWalletEntry[] = [
  { label: "vitalik.eth", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  { label: "Demo wallet 2" },
  { label: "Demo wallet 3" },
];

/** What the dialog shows: the same labels, with each address shortened for display. */
export const demoWalletOptions: DemoWallet[] = demoWallets.map((wallet) =>
  wallet.address ? { label: wallet.label, address: shortAddress(wallet.address) } : { label: wallet.label },
);
