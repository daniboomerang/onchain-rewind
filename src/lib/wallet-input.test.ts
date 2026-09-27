import { expect, test } from "vitest";
import type { DemoWalletEntry } from "./demo-wallets";
import { INVALID_INPUT, readWalletInput } from "./wallet-input";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
const wallets: readonly DemoWalletEntry[] = [{ label: "vitalik.eth", address: ADDRESS }, { label: "Demo wallet 3" }];

test("an empty field reads as empty, not as invalid input", () => {
  expect(readWalletInput("", wallets)).toEqual({ kind: "empty" });
  expect(readWalletInput("   ", wallets)).toEqual({ kind: "empty" });
});

test("a pasted address is a wallet on its own, with no name", () => {
  expect(readWalletInput(ADDRESS, wallets)).toEqual({ kind: "wallet", wallet: { address: ADDRESS } });
});

test("an address pasted with surrounding whitespace is still that address", () => {
  expect(readWalletInput(`  ${ADDRESS}\n`, wallets)).toEqual({ kind: "wallet", wallet: { address: ADDRESS } });
});

test("a demo wallet's label resolves from its own listed address, never from ENS", () => {
  expect(readWalletInput("vitalik.eth", wallets)).toEqual({
    kind: "wallet",
    wallet: { address: ADDRESS, name: "vitalik.eth" },
  });
});

test("a demo wallet matches however it was typed", () => {
  expect(readWalletInput("VITALIK.ETH", wallets)).toMatchObject({ kind: "wallet" });
});

test("an unfilled demo slot's label is not a wallet", () => {
  expect(readWalletInput("Demo wallet 3", wallets)).toEqual({ kind: "invalid" });
});

test("a name the demo list doesn't hold is a name to resolve, lowercased for the server", () => {
  expect(readWalletInput("  SASSAL.eth ", wallets)).toEqual({ kind: "name", name: "sassal.eth" });
});

test.each([
  ["a truncated address", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA960"],
  ["an address with a non-hex character", "0xz8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
  ["an address missing its prefix", "d8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
  ["a sentence", "my wallet"],
  ["a name on another registry", "sassal.xyz"],
  ["a name with a path in it", "sassal.eth/../etc.eth"],
])("%s is invalid", (_case, value) => {
  expect(readWalletInput(value, wallets)).toEqual({ kind: "invalid" });
});

test("the invalid message suggests the thing that always works", () => {
  expect(INVALID_INPUT).toContain("Paste an address");
});
