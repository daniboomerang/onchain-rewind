import { expect, test } from "vitest";
import type { DemoWalletEntry } from "./demo-wallets";
import { INVALID_INPUT, readWalletInput, walletInputState } from "./wallet-input";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
const wallets: readonly DemoWalletEntry[] = [{ label: "vitalik.eth", address: ADDRESS }, { label: "Demo wallet 3" }];

test("an empty field is idle, not invalid", () => {
  expect(walletInputState("", wallets)).toEqual({ status: "idle", wallet: null });
});

test("a pasted address is valid, shown shortened", () => {
  expect(walletInputState(ADDRESS, wallets)).toEqual({
    status: "valid",
    resolved: "0xd8dA…6045",
    wallet: { address: ADDRESS },
  });
});

test("an address pasted with surrounding whitespace is still an address", () => {
  expect(readWalletInput(`  ${ADDRESS}\n`, wallets)).toEqual({ kind: "wallet", wallet: { address: ADDRESS } });
});

test("a demo wallet's label resolves from its own listed address, never from ENS", () => {
  expect(walletInputState("vitalik.eth", wallets)).toEqual({
    status: "valid",
    resolved: "0xd8dA…6045",
    wallet: { address: ADDRESS, name: "vitalik.eth" },
  });
});

test("a demo wallet matches however it was typed", () => {
  expect(readWalletInput("VITALIK.ETH", wallets)).toMatchObject({ kind: "wallet" });
});

test("an unfilled demo slot's label is not a wallet", () => {
  expect(readWalletInput("Demo wallet 3", wallets)).toEqual({ kind: "invalid" });
});

test.each([
  ["a truncated address", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA960"],
  ["an address with a non-hex character", "0xz8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
  ["an address missing its prefix", "d8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
  ["a sentence", "my wallet"],
])("%s is invalid, and the message says to paste an address", (_case, value) => {
  expect(walletInputState(value, wallets)).toEqual({ status: "invalid", error: INVALID_INPUT, wallet: null });
  expect(INVALID_INPUT).toContain("Paste an address");
});
