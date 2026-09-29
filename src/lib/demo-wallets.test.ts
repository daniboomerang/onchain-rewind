import { expect, test } from "vitest";
import { demoWalletOptions, demoWallets } from "./demo-wallets";
import { asAddress } from "./wallet-store";

test("settings offers two demo wallets, pranksy.eth first", () => {
  expect(demoWallets).toHaveLength(2);
  expect(demoWallets[0]?.label).toBe("pranksy.eth");
});

test("every demo wallet carries the address its name resolved to, so none waits on ENS", () => {
  for (const wallet of demoWallets) {
    expect(asAddress(wallet.address), `${wallet.label} has a real address`).not.toBeNull();
  }
});

test("no two demo wallets are the same wallet, by name or by address", () => {
  expect(new Set(demoWallets.map((w) => w.label)).size).toBe(demoWallets.length);
  expect(new Set(demoWallets.map((w) => w.address.toLowerCase())).size).toBe(demoWallets.length);
});

test("the dialog is offered the same labels, each with its address shortened", () => {
  expect(demoWalletOptions).toEqual(
    demoWallets.map((wallet) => ({
      label: wallet.label,
      address: `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`,
    })),
  );
});
