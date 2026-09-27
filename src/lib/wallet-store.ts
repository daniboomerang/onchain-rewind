/**
 * The connected wallet, remembered on this device.
 *
 * SPEC §1: the wallet is set once in settings and treated as the user's already-connected wallet,
 * so `localStorage` is the whole store. `localStorage` exists only in the browser, so the read
 * happens in an effect and never during render: the server renders the shell with no wallet, the
 * first client effect loads it, and only then can the shell know whether settings must open. That
 * ordering is also what keeps the markup either side of hydration identical.
 */

import { useCallback, useEffect, useState } from "react";
import type { Address } from "../engine/types";

/** Namespaced, because a demo shares its origin with whatever else is deployed there. */
export const WALLET_STORAGE_KEY = "onchain-rewind:wallet";

export type ConnectedWallet = {
  readonly address: Address;
  /** The ENS name the wallet was chosen by, when it was chosen by one. */
  readonly name?: string;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** An address exactly as it was given, case intact: the server lowercases it for Zerion's paths. */
export function asAddress(value: string): Address | null {
  return ADDRESS.test(value) ? (value as Address) : null;
}

/**
 * Anything but a wallet we wrote ourselves reads as no wallet at all — a hand-edited entry, a value
 * from an older shape, or another app's key collision must open settings rather than reach Zerion.
 */
export function parseStoredWallet(raw: string | null): ConnectedWallet | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { address, name } = parsed as { address?: unknown; name?: unknown };
  const checked = typeof address === "string" ? asAddress(address) : null;
  if (!checked) return null;

  return typeof name === "string" && name !== "" ? { address: checked, name } : { address: checked };
}

/** Browser-only: returns null anywhere `localStorage` is missing or blocked. */
export function readStoredWallet(): ConnectedWallet | null {
  try {
    return parseStoredWallet(globalThis.localStorage?.getItem(WALLET_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

/** A blocked store (private browsing, a storage quota) costs the memory of the choice, nothing more. */
export function writeStoredWallet(wallet: ConnectedWallet): void {
  try {
    globalThis.localStorage?.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
  } catch {
    console.warn("The wallet could not be saved on this device, so it will be asked for again.");
  }
}

export type ConnectedWalletState = {
  /** False until the browser has been read: neither "has a wallet" nor "has none" is known yet. */
  readonly loaded: boolean;
  readonly wallet: ConnectedWallet | null;
  readonly connect: (wallet: ConnectedWallet) => void;
};

export function useConnectedWallet(): ConnectedWalletState {
  const [state, setState] = useState<{ loaded: boolean; wallet: ConnectedWallet | null }>({
    loaded: false,
    wallet: null,
  });

  useEffect(() => {
    setState({ loaded: true, wallet: readStoredWallet() });
  }, []);

  const connect = useCallback((wallet: ConnectedWallet) => {
    writeStoredWallet(wallet);
    setState({ loaded: true, wallet });
  }, []);

  return { loaded: state.loaded, wallet: state.wallet, connect };
}
