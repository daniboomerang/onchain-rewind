// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { demoWallets } from "./demo-wallets";
import {
  parseStoredWallet,
  readStoredWallet,
  useConnectedWallet,
  WALLET_STORAGE_KEY,
  writeStoredWallet,
} from "./wallet-store";

const VITALIK_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
const OTHER_ADDRESS = "0x648aA14e4424e0825A5cE739C8C68610e143FB79" as const;

afterEach(() => {
  globalThis.localStorage?.clear?.();
});

test("a stored wallet survives a reload, name and all", () => {
  writeStoredWallet({ address: OTHER_ADDRESS, name: "example.eth" });

  expect(readStoredWallet()).toEqual({ address: OTHER_ADDRESS, name: "example.eth" });
});

test("an address chosen without a name is stored without one", () => {
  writeStoredWallet({ address: OTHER_ADDRESS });

  expect(readStoredWallet()).toEqual({ address: OTHER_ADDRESS });
});

test("the address keeps the case it was given, because it is displayed", () => {
  writeStoredWallet({ address: OTHER_ADDRESS });

  expect(readStoredWallet()?.address).toBe(OTHER_ADDRESS);
});

test.each([
  ["nothing stored", null],
  ["not JSON", "vitalik.eth"],
  ["not an object", '"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"'],
  ["no address", '{"name":"vitalik.eth"}'],
  ["a name where an address belongs", '{"address":"vitalik.eth"}'],
  ["an address of the wrong length", '{"address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA960"}'],
])("%s reads as no wallet, so settings opens rather than a bad address reaching Zerion", (_case, raw) => {
  expect(parseStoredWallet(raw)).toBeNull();
});

test("the hook reports nothing loaded on the server's first render, then the stored wallet", async () => {
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ address: OTHER_ADDRESS, name: "example.eth" }));

  const { result } = renderHook(() => useConnectedWallet());

  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.wallet).toEqual({ address: OTHER_ADDRESS, name: "example.eth" });
});

test("connecting a wallet remembers it on this device", async () => {
  const { result } = renderHook(() => useConnectedWallet());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.wallet).toBeNull();

  act(() => result.current.connect({ address: OTHER_ADDRESS, name: "example.eth" }));

  expect(result.current.wallet).toEqual({ address: OTHER_ADDRESS, name: "example.eth" });
  expect(readStoredWallet()).toEqual({ address: OTHER_ADDRESS, name: "example.eth" });
});

test("choosing another wallet replaces the one stored", async () => {
  const another = "0x1234567890123456789012345678901234567890" as const;
  const { result } = renderHook(() => useConnectedWallet());
  await waitFor(() => expect(result.current.loaded).toBe(true));

  act(() => result.current.connect({ address: OTHER_ADDRESS, name: "example.eth" }));
  act(() => result.current.connect({ address: another }));

  expect(readStoredWallet()).toEqual({ address: another });
});

test("reading a stored vitalik.eth migrates it to pranksy.eth, name and all", () => {
  writeStoredWallet({ address: VITALIK_ADDRESS, name: "vitalik.eth" });

  const migrated = readStoredWallet();
  expect(migrated?.address).toBe(demoWallets[0]?.address);
  expect(migrated?.name).toBe(demoWallets[0]?.label);
});

test("migration to pranksy.eth rewrites storage", () => {
  writeStoredWallet({ address: VITALIK_ADDRESS, name: "vitalik.eth" });

  readStoredWallet();

  const stored = localStorage.getItem(WALLET_STORAGE_KEY);
  expect(stored).toBe(JSON.stringify({ address: demoWallets[0]?.address, name: demoWallets[0]?.label }));
});

test("vitalik.eth without name also gets migrated to pranksy.eth, name and all", () => {
  writeStoredWallet({ address: VITALIK_ADDRESS });

  const migrated = readStoredWallet();
  expect(migrated?.address).toBe(demoWallets[0]?.address);
  expect(migrated?.name).toBe(demoWallets[0]?.label);
});

test("other stored wallets are not affected by migration", () => {
  writeStoredWallet({ address: OTHER_ADDRESS, name: "other.eth" });

  const result = readStoredWallet();
  expect(result).toEqual({ address: OTHER_ADDRESS, name: "other.eth" });
});

test("vitalik.eth with different case also gets migrated", () => {
  const mixedCase = "0xD8da6bf26964aF9D7eEd9e03E53415D37aA96045" as const;
  writeStoredWallet({ address: mixedCase });

  const migrated = readStoredWallet();
  expect(migrated?.address).toBe(demoWallets[0]?.address);
});
