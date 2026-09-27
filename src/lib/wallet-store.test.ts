// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import {
  parseStoredWallet,
  readStoredWallet,
  useConnectedWallet,
  WALLET_STORAGE_KEY,
  writeStoredWallet,
} from "./wallet-store";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;

afterEach(() => {
  localStorage.clear();
});

test("a stored wallet survives a reload, name and all", () => {
  writeStoredWallet({ address: ADDRESS, name: "vitalik.eth" });

  expect(readStoredWallet()).toEqual({ address: ADDRESS, name: "vitalik.eth" });
});

test("an address chosen without a name is stored without one", () => {
  writeStoredWallet({ address: ADDRESS });

  expect(readStoredWallet()).toEqual({ address: ADDRESS });
});

test("the address keeps the case it was given, because it is displayed", () => {
  writeStoredWallet({ address: ADDRESS });

  expect(readStoredWallet()?.address).toBe(ADDRESS);
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
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ address: ADDRESS, name: "vitalik.eth" }));

  const { result } = renderHook(() => useConnectedWallet());

  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.wallet).toEqual({ address: ADDRESS, name: "vitalik.eth" });
});

test("connecting a wallet remembers it on this device", async () => {
  const { result } = renderHook(() => useConnectedWallet());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.wallet).toBeNull();

  act(() => result.current.connect({ address: ADDRESS, name: "vitalik.eth" }));

  expect(result.current.wallet).toEqual({ address: ADDRESS, name: "vitalik.eth" });
  expect(readStoredWallet()).toEqual({ address: ADDRESS, name: "vitalik.eth" });
});

test("choosing another wallet replaces the one stored", async () => {
  const other = "0x648aA14e4424e0825A5cE739C8C68610e143FB79" as const;
  const { result } = renderHook(() => useConnectedWallet());
  await waitFor(() => expect(result.current.loaded).toBe(true));

  act(() => result.current.connect({ address: ADDRESS, name: "vitalik.eth" }));
  act(() => result.current.connect({ address: other }));

  expect(readStoredWallet()).toEqual({ address: other });
});
