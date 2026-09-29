// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { revealMs } from "#/components/rewind/motion.ts";
import { installPendingAnimations } from "#/components/rewind/story-playback.tsx";
import type { Address } from "#/engine/types.ts";
import type { BalanceChart, ChainLite, FungibleLite, TransactionsPage, TxLite } from "#/engine/zerion.ts";
import { demoWallets } from "#/lib/demo-wallets.ts";
import { createAppQueryClient } from "#/lib/query-client.ts";
import type { RewindApi } from "#/lib/useRewind.ts";
import { readStoredWallet, WALLET_STORAGE_KEY } from "#/lib/wallet-store.ts";
import { Home } from "#/routes/index.tsx";
import type { ZerionResult } from "#/server/zerion/client.ts";

/**
 * The Rewind on `/`, played end to end without a network: a stored wallet autoplays, each page's
 * transactions reach the reveal as it arrives, the reveal hands over to the story, and a failure
 * lands in the error state with a retry that runs again.
 *
 * Reduced motion is the preference these tests run under, and not for coverage's sake: with it the
 * reveal draws no canvas, and no test environment has a 2D context, so it is the only branch whose
 * phases can run at all here. It exercises the same wiring — the same three callbacks, the same
 * handover, the same stages — with a crossfade where the burst would be. The full-motion reveal is
 * the browser pass's to prove.
 */

// Installed before anything renders, which is when Motion first reads the preference.
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query.includes("prefers-reduced-motion"),
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

let restoreAnimations: () => void;
beforeAll(() => {
  restoreAnimations = installPendingAnimations();
});
afterAll(() => restoreAnimations());

// Vitest runs without global test APIs, so Testing Library never registers its own cleanup.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const [first, second] = demoWallets;
if (!first || !second) throw new Error("the demo wallets are too few");

const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const CHAINS: readonly ChainLite[] = [
  { id: "ethereum", name: "Ethereum" },
  { id: "base", name: "Base" },
];

const ETH: FungibleLite = { id: "eth", symbol: "ETH", name: "Ethereum", changePct365d: 24.5 };

/** Three points a year apart is a chart with a story: a first value, a high and a last. */
const CHART: BalanceChart = {
  beginAt: days(365).toISOString(),
  endAt: days(0).toISOString(),
  points: [
    { ts: Math.floor(days(300).getTime() / 1000), value: 1000 },
    { ts: Math.floor(days(100).getTime() / 1000), value: 2400 },
    { ts: Math.floor(days(1).getTime() / 1000), value: 1800 },
  ],
};

/** One `trade` of ETH, priced so the top-token tally has something to add up. */
function tx(id: string, minedAt: Date, chainId: string): TxLite {
  return {
    id,
    minedAt: minedAt.toISOString(),
    operationType: "trade",
    chainId,
    transfers: [{ direction: "out", value: 100, fungible: { id: "eth", symbol: "ETH", name: "Ethereum" } }],
  };
}

const txs = (prefix: string, count: number, at: number) =>
  Array.from({ length: count }, (_, i) => tx(`${prefix}-${i}`, days(at), i % 2 === 0 ? "ethereum" : "base"));

/** A wallet whose year fills all five cards: an origin, two chains, a top token and a chart. */
const PAGES: readonly TxLite[][] = [txs("old", 3, 200), txs("new", 2, 30)];

const page = (items: readonly TxLite[], last: boolean): ZerionResult<TransactionsPage> => ({
  ok: true,
  data: { items: [...items], next: last ? null : "https://api.zerion.io/v1/next", count: items.length },
});

type Options = {
  /** One entry per page, in order. */
  readonly pages?: readonly TxLite[][];
  /** Each page waits for its own release, so a run can be observed between pages. */
  readonly gated?: boolean;
  /**
   * The first run's first page fails both times it is asked for — the hook retries a failed page
   * once — so the run ends in the error state and "Try again" is the run that succeeds.
   */
  readonly failFirstRun?: boolean;
  /** The day's data budget is spent: the first page fails with it, and no page is asked for twice. */
  readonly budgetSpent?: boolean;
};

type Gate = { readonly wait: Promise<void>; readonly open: () => void };

function gate(): Gate {
  let open: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/**
 * The Zerion reads, scripted. Pages are consumed in order across the whole render, so a retry or a
 * second wallet keeps reading the same year — which is what a server cache would do anyway.
 */
function fakeApi({ pages = PAGES, gated = false, failFirstRun = false, budgetSpent = false }: Options = {}) {
  const gates = pages.map(gate);
  let calls = 0;

  const api: RewindApi = {
    transactionsPage: async () => {
      const index = calls++;
      if (budgetSpent) return { ok: false, error: "budget_spent" };
      if (failFirstRun && index < 2) return { ok: false, error: "upstream" };
      const slot = (failFirstRun ? index - 2 : index) % pages.length;
      if (gated) await gates[slot]?.wait;
      return page(pages[slot] ?? [], slot === pages.length - 1);
    },
    chains: async () => ({ ok: true, data: CHAINS }),
    fungible: async () => ({ ok: true, data: ETH }),
    balanceChart: async () => ({ ok: true, data: CHART }),
  };

  /** Lets one page through and waits for React to have processed it. */
  const release = async (index: number) => {
    await act(async () => {
      gates[index]?.open();
      await gates[index]?.wait;
    });
  };

  return { api, release };
}

function remember(wallet: { label: string; address: Address }) {
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ address: wallet.address, name: wallet.label }));
}

/**
 * Unpaced: the app spaces its Zerion requests a whole second apart, because the Demo plan allows one
 * a second, and none of the scripted runs below has a reason to spend that wall clock.
 */
function open(api: RewindApi) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <Home api={api} requestIntervalMs={0} />
    </QueryClientProvider>,
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The reveal's own counter, which is the whole reveal under this preference. */
const revealCounter = () => screen.queryByText(/^Reading .*transactions…$/);

/** The five cards this year fills, by the accessible name each one's stage carries. */
const CARD = {
  origin: "1 of 5: Origin",
  chain: "2 of 5: Home chain",
} as const;

test("each page's transactions reach the reveal, and only the last page hands over to the story", async () => {
  remember(first);
  const { api, release } = fakeApi({ gated: true });
  open(api);

  // The reveal is up before any page has landed, counting nothing yet.
  expect(await screen.findByText("0")).toBeInTheDocument();
  expect(screen.queryByLabelText(CARD.origin)).toBeNull();

  await release(0);

  // Three transactions in, and still reading: the story waits for paging to end, not for a page.
  await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
  expect(screen.queryByLabelText(CARD.origin)).toBeNull();

  await release(1);

  expect(await screen.findByLabelText(CARD.origin)).toBeInTheDocument();
  // Five transactions, both pages counted, and the chrome is back with the story.
  expect(screen.getByText(first.label)).toBeInTheDocument();

  // The handover is one way. Reduced motion enters the story on the same tick the crossfade ends,
  // so the timer that mounts the story under a burst must find nothing left to do here.
  await act(() => wait(revealMs.storyEnter + 50));
  expect(revealCounter()).toBeNull();
});

test("a wallet with no transactions ends on the empty state", async () => {
  remember(first);
  const { api } = fakeApi({ pages: [[]] });
  open(api);

  expect(await screen.findByText("This wallet hasn't made its first move yet")).toBeInTheDocument();
});

test("a failed run ends in the error state, and Try again plays the Rewind", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi({ failFirstRun: true });
  open(api);

  // The failed page is retried once before the run gives up, so the error state is a moment later.
  const alert = await screen.findByRole("alert", undefined, { timeout: 4000 });
  expect(alert).toHaveTextContent("The rewind got stuck");

  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByLabelText(CARD.origin)).toBeInTheDocument();
});

test("a spent daily budget ends on the error state saying so, and when to come back", async () => {
  remember(first);
  const { api } = fakeApi({ budgetSpent: true });
  open(api);

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Today's data budget is spent");
  expect(alert).toHaveTextContent("today's requests are all spent");
  expect(alert).toHaveTextContent("come back tomorrow");
  // The generic screen is gone, headline and all: the data service answered, it just answered that
  // the day is over. And there is no retry, because no retry succeeds before the day resets — the
  // only thing left to do here is change wallet.
  expect(alert).not.toHaveTextContent("The data service didn't respond");
  expect(alert).not.toHaveTextContent("The rewind got stuck");
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  // The gear in the chrome carries the same name, so this is the screen's own button.
  expect(within(alert).getByRole("button", { name: "Change wallet" })).toHaveFocus();
});

test("changing the wallet restarts the Rewind", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi();
  open(api);

  await screen.findByLabelText(CARD.origin);
  // Somewhere past card 1, so a restart is visible as a return to it.
  await user.keyboard("[ArrowRight]");
  await screen.findByLabelText(CARD.chain);

  await user.click(screen.getByRole("button", { name: "Change wallet" }));
  await screen.findByRole("dialog");
  // A wallet is already connected, so this time there is something to cancel back to.
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: new RegExp(second.label) }));
  await user.click(screen.getByRole("button", { name: "Play rewind" }));

  // The new wallet's run starts at the reveal again, and its story starts at card 1.
  await waitFor(() => expect(revealCounter()).toBeInTheDocument());
  expect(screen.queryByLabelText(CARD.chain)).toBeNull();
  expect(await screen.findByLabelText(CARD.origin)).toBeInTheDocument();
  expect(screen.getByText(second.label)).toBeInTheDocument();
  expect(readStoredWallet()).toEqual({ address: second.address, name: second.label });
});

test("Escape leaves the story for the start screen, which carries the site footer the story never shows", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi();
  open(api);

  await screen.findByLabelText(CARD.origin);
  // The story plays with no footer at all.
  expect(screen.queryByRole("link", { name: "Vinaya" })).toBeNull();

  await user.keyboard("{Escape}");

  expect(screen.queryByLabelText(CARD.origin)).toBeNull();
  expect(revealCounter()).toBeNull();
  expect(screen.getByRole("heading", { name: "Onchain Rewind" })).toBeInTheDocument();
  expect(screen.getByText(first.label)).toBeInTheDocument();
  // The start screen carries the one site footer.
  expect(screen.getByRole("link", { name: "Vinaya" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Design system" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Play" }));

  await waitFor(() => expect(revealCounter()).toBeInTheDocument());
  expect(await screen.findByLabelText(CARD.origin)).toBeInTheDocument();
  // Back in the story, the footer is gone again.
  expect(screen.queryByRole("link", { name: "Vinaya" })).toBeNull();
});

test("the close button in the story's top bar does the same as Escape", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi();
  open(api);

  await screen.findByLabelText(CARD.origin);

  await user.click(screen.getByRole("button", { name: "Close" }));

  expect(screen.queryByLabelText(CARD.origin)).toBeNull();
  expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
});

test("Escape closes the open settings dialog instead of leaving the story", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi();
  open(api);

  await screen.findByLabelText(CARD.origin);

  await user.click(screen.getByRole("button", { name: "Change wallet" }));
  await screen.findByRole("dialog");

  await user.keyboard("{Escape}");

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // The dialog owned that Escape: the story never reset to the start screen underneath it.
  expect(screen.getByLabelText(CARD.origin)).toBeInTheDocument();
});

test("the arrow keys still move the story after the settings dialog closes", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi();
  open(api);

  await screen.findByLabelText(CARD.origin);

  await user.click(screen.getByRole("button", { name: "Change wallet" }));
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  await user.keyboard("[ArrowRight]");

  expect(await screen.findByLabelText(CARD.chain)).toBeInTheDocument();
});
