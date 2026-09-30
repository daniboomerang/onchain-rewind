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
 * The Rewind on `/`, played end to end without a network: a stored wallet lands the start screen,
 * pressing "Play" pages a wallet's year, each page's transactions reach the reveal as it arrives,
 * the reveal hands over to the story, and a failure lands in the error state with a retry that runs
 * again.
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
  /**
   * Zerion refuses every page for a quota limit: a throttle that outlasted its backoffs, or a spent
   * day. The run plays the recorded snapshot instead (ADR-0005).
   */
  readonly quota?: "rate_limited" | "budget_spent";
  /**
   * The first run's first page lands and its second fails both times it is asked for: a year cut
   * short by a later page, which keeps the wallet's own data and never falls back.
   */
  readonly failSecondPage?: boolean;
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
function fakeApi({ pages = PAGES, gated = false, failFirstRun = false, quota, failSecondPage = false }: Options = {}) {
  const gates = pages.map(gate);
  let calls = 0;

  const api: RewindApi = {
    transactionsPage: async () => {
      const index = calls++;
      if (quota) return { ok: false, error: quota };
      if (failSecondPage && index >= 1) return { ok: false, error: "rate_limited" };
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

  return { api, release, callCount: () => calls };
}

/** Every scripted test starts from the start screen: this is the one place that leaves it. */
async function play(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Play" }));
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
  const user = userEvent.setup();
  remember(first);
  const { api, release } = fakeApi({ gated: true });
  open(api);
  await play(user);

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
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi({ pages: [[]] });
  open(api);
  await play(user);

  expect(await screen.findByText("This wallet hasn't made its first move yet")).toBeInTheDocument();
});

test("a failed run ends in the error state, and Try again plays the Rewind", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi({ failFirstRun: true });
  open(api);
  await play(user);

  // The failed page is retried once before the run gives up, so the error state is a moment later.
  const alert = await screen.findByRole("alert", undefined, { timeout: 4000 });
  expect(alert).toHaveTextContent("The rewind got stuck");

  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByLabelText(CARD.origin)).toBeInTheDocument();
});

/** The note the chrome carries for as long as a recorded run plays. */
const RECORDED_NOTE = "Showing a recorded snapshot";

test.each([
  ["a rate limit on the first page", "rate_limited"],
  ["a spent daily budget", "budget_spent"],
] as const)("%s plays the recorded vitalik.eth year, reveal to share card, and says so", async (_, quota) => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi({ quota });
  open(api);
  await play(user);

  // The switch happens during the reveal: from there on the chrome names the recording's wallet and
  // carries the note, before the story has begun. The rate limit is retried once first, a moment later.
  expect(await screen.findByText(RECORDED_NOTE, undefined, { timeout: 4000 })).toBeInTheDocument();
  expect(screen.getByText("vitalik.eth")).toBeInTheDocument();
  expect(screen.queryByText(first.label)).toBeNull();

  // Every card of the recorded year plays, and the note stays over each one.
  const cards = [
    "1 of 5: Origin",
    "2 of 5: Home chain",
    "3 of 5: Top token",
    "4 of 5: The ride",
    "5 of 5: Your rewind",
  ];
  for (const [index, name] of cards.entries()) {
    if (index > 0) await user.keyboard("[ArrowRight]");
    expect(await screen.findByLabelText(name, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(RECORDED_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(first.label)).toBeNull();
  }
  expect(screen.queryByRole("alert")).toBeNull();

  // The recording is two pages, not a whole year: the share card counts it as a year cut short, names
  // the recording's wallet and carries the recorded-snapshot mark.
  const panel = within(screen.getByRole("article"));
  expect(panel.getByRole("heading", { name: "vitalik.eth" })).toBeInTheDocument();
  expect(panel.getByText(/^[\d,]+\+$/)).toBeInTheDocument();
  expect(panel.getByText("onchain by")).toBeInTheDocument();
  expect(panel.getByText("Recorded snapshot")).toBeInTheDocument();

  // Settings opens on the wallet whose year is playing, and says why it isn't the stored one.
  await user.click(screen.getByRole("button", { name: "Change wallet" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("combobox")).toHaveValue("vitalik.eth");
  expect(dialog).toHaveTextContent("a recorded snapshot of vitalik.eth");
});

test("live data plays with no note, and a later page failing keeps the wallet's own year", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi({ failSecondPage: true });
  open(api);
  await play(user);

  // The second page is retried once before the run lets it go, so the story is a moment later.
  expect(await screen.findByLabelText(CARD.origin, undefined, { timeout: 4000 })).toBeInTheDocument();
  expect(screen.getByText(first.label)).toBeInTheDocument();
  expect(screen.queryByText("vitalik.eth")).toBeNull();
  expect(screen.queryByText(RECORDED_NOTE)).toBeNull();
});

test("changing the wallet restarts the Rewind", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api } = fakeApi();
  open(api);
  await play(user);

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

  // Settings closes onto the start screen for the new wallet, not straight back into the reveal.
  expect(screen.queryByLabelText(CARD.chain)).toBeNull();
  await play(user);

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
  await play(user);

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
  expect(screen.getByRole("link", { name: "Development stats" })).toHaveAttribute("href", "/dev-stats");

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
  await play(user);

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
  await play(user);

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
  await play(user);

  await screen.findByLabelText(CARD.origin);

  await user.click(screen.getByRole("button", { name: "Change wallet" }));
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  await user.keyboard("[ArrowRight]");

  expect(await screen.findByLabelText(CARD.chain)).toBeInTheDocument();
});

test("a remembered wallet lands the start screen with nothing loading, until Play is pressed", async () => {
  remember(first);
  const { api, callCount } = fakeApi({ gated: true });
  open(api);

  expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
  expect(revealCounter()).toBeNull();
  // The site footer only ever shows on the start screen and on `/dev-stats`, never mid-story: its
  // presence here is itself proof nothing has started.
  expect(screen.getByRole("link", { name: "Design system" })).toBeInTheDocument();
  expect(callCount()).toBe(0);
});

test("Escape during the reveal returns to the start screen and aborts the run", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api, release, callCount } = fakeApi({ gated: true });
  open(api);
  await play(user);

  // The first page is requested and in flight, gated so it hasn't resolved yet.
  expect(await screen.findByText("0")).toBeInTheDocument();
  await waitFor(() => expect(callCount()).toBe(1));

  await user.keyboard("{Escape}");

  expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  expect(revealCounter()).toBeNull();

  // Letting the first page land doesn't ask for a second: the run was cancelled, not merely
  // outrun, and `useRewind`'s cleanup already aborted the signal on unmount.
  await release(0);
  await wait(20);
  expect(callCount()).toBe(1);
});

test("the close button during the reveal does the same as Escape, and aborts the run", async () => {
  const user = userEvent.setup();
  remember(first);
  const { api, release, callCount } = fakeApi({ gated: true });
  open(api);
  await play(user);

  expect(await screen.findByText("0")).toBeInTheDocument();
  await waitFor(() => expect(callCount()).toBe(1));

  await user.click(screen.getByRole("button", { name: "Close" }));

  expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  expect(revealCounter()).toBeNull();

  await release(0);
  await wait(20);
  expect(callCount()).toBe(1);
});
