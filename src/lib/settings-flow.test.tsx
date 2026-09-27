// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import { Home } from "../routes/index";
import { demoWallets } from "./demo-wallets";
import { createAppQueryClient } from "./query-client";
import { INVALID_INPUT } from "./wallet-input";
import { readStoredWallet } from "./wallet-store";

/**
 * The settings flow as a visitor meets it: nothing stored, so the dialog opens itself and holds; a
 * demo pick is remembered; and the gear brings the dialog back, dismissable this time.
 */

const [first, second] = demoWallets;

// Vitest runs without global test APIs, so Testing Library never registers its own cleanup.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function open() {
  const client = createAppQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>,
  );
}

test("the first visit opens settings and will not let go of it until a wallet is chosen", async () => {
  const user = userEvent.setup();
  open();

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveAccessibleName("Choose a wallet");
  // No way out: no Cancel, and Escape is ignored.
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

  await user.keyboard("{Escape}");

  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("a demo pick is remembered as the connected wallet", async () => {
  const user = userEvent.setup();
  if (!first) throw new Error("the demo wallets are empty");
  open();

  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: new RegExp(first.label) }));
  await user.click(screen.getByRole("button", { name: "Play rewind" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(readStoredWallet()).toEqual({ address: first.address, name: first.label });
  expect(screen.getByText(first.label)).toBeInTheDocument();
});

test("a remembered wallet means no dialog, and the gear is what opens it", async () => {
  const user = userEvent.setup();
  if (!first || !second) throw new Error("the demo wallets are too few");
  localStorage.setItem("onchain-rewind:wallet", JSON.stringify({ address: first.address, name: first.label }));
  open();

  await waitFor(() => expect(screen.getByText(first.label)).toBeInTheDocument());
  expect(screen.queryByRole("dialog")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Change wallet" }));

  const dialog = await screen.findByRole("dialog");
  expect(dialog).toBeInTheDocument();
  // A wallet is already connected, so this time there is something to cancel back to.
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: new RegExp(second.label) }));
  await user.click(screen.getByRole("button", { name: "Play rewind" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(readStoredWallet()).toEqual({ address: second.address, name: second.label });
});

test("a pasted address that isn't one cannot be submitted, and says to paste an address", async () => {
  const user = userEvent.setup();
  open();

  await screen.findByRole("dialog");
  await user.type(screen.getByRole("combobox"), "0xnope");

  expect(screen.getByRole("combobox")).toBeInvalid();
  expect(screen.getByText(INVALID_INPUT)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Play rewind" })).toBeDisabled();
});
