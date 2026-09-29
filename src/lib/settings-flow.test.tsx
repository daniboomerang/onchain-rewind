// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import { Home } from "../routes/index";
import { demoWallets } from "./demo-wallets";
import { createAppQueryClient } from "./query-client";
import { INVALID_INPUT } from "./wallet-input";
import { readStoredWallet } from "./wallet-store";

/**
 * The settings flow as a visitor meets it: nothing stored, so the dialog opens itself and holds, and
 * a demo pick is remembered and starts the Rewind at once.
 *
 * The reveal covers the screen for as long as it is reading, with no chrome of its own — chrome
 * enters with card 1 — so the gear, and everything reached through it, belongs to a suite that plays
 * the Rewind far enough for the story to own the screen. That suite is `routes/-rewind-flow`.
 */

const [first] = demoWallets;

/** The reveal, which is what a wallet's page load autoplays into. */
const reading = () => screen.getByText("Reading transactions…");

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

test("a first visit opens settings with the first demo wallet already chosen, so one click plays it", async () => {
  const user = userEvent.setup();
  if (!first) throw new Error("the demo wallets are empty");
  open();

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("combobox")).toHaveValue(first.label);
  expect(screen.getByRole("button", { name: "Play rewind" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Play rewind" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(readStoredWallet()).toEqual({ address: first.address, name: first.label });
  expect(reading()).toBeInTheDocument();
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
  // Choosing a wallet is what starts the Rewind: the dialog closes onto the reveal, not onto a shell.
  expect(reading()).toBeInTheDocument();
});

test("a remembered wallet means no dialog, and the page load plays the Rewind", async () => {
  if (!first) throw new Error("the demo wallets are empty");
  localStorage.setItem("onchain-rewind:wallet", JSON.stringify({ address: first.address, name: first.label }));
  open();

  await waitFor(() => expect(reading()).toBeInTheDocument());
  expect(screen.queryByRole("dialog")).toBeNull();
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
