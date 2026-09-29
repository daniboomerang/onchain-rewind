/**
 * The demo wallets offered in settings.
 *
 * SPEC §6 and §10: real public wallets only, each vetted for a story worth watching, and each
 * listed with the address its name resolved to — so picking one never waits on ENS, and never
 * breaks if a name changes hands. Never invent a name or an address.
 *
 * Each of the two was vetted against the live Zerion API: every one has more transactions in the
 * window than three pages hold, at least four chains, a priced top token, and a full year of daily
 * balance points with a visible high and low. `pranksy.eth` is listed first, so it's the one a first
 * visit opens settings with already chosen.
 */

import type { DemoWallet } from "../components/ui/WalletCombobox";
import { type Address, shortAddress } from "../engine/types";

export type DemoWalletEntry = {
  /** The name it was vetted under, and the name shown in settings. */
  readonly label: string;
  /** What that name resolved to, read once at vetting time and stored here. */
  readonly address: Address;
};

export const demoWallets: readonly DemoWalletEntry[] = [
  { label: "pranksy.eth", address: "0xD387A6E4e84a6C86bd90C158C6028A58CC8Ac459" },
  { label: "dingaling.eth", address: "0x54BE3a794282C030b15E43aE2bB182E14c409C5e" },
];

/** What the dialog shows: the same labels, with each address shortened for display. */
export const demoWalletOptions: DemoWallet[] = demoWallets.map((wallet) => ({
  label: wallet.label,
  address: shortAddress(wallet.address),
}));
