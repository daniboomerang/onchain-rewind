// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ShareCard, type ShareCardProps } from "./ShareCard";
import { StoryCard } from "./StoryCard";

/**
 * The reduced-motion half of `card-entrance.test.tsx`. Motion reads the preference once per process
 * and each component keeps the value it read on mount, so a file can only hold one preference — the
 * stub below is installed before anything renders and stands for the whole file.
 *
 * What these tests hold is stricter than "ends visible": with the preference set, a card must be
 * readable without any animation running to its end. That is the failure they were written for. The
 * reduced entrance used to snap the rise and animate the fade, which left the fade as the single
 * thing between the hidden state the server rendered and a readable card, so a fade cut short held
 * the card at `opacity: 0; transform: none` with all of its content in the page. A few frames is
 * far inside the fade that used to run here, and far outside a value Motion writes through its own
 * render loop.
 */

/** Frames to let pass before a snapped entrance must have landed. Well under any fade's length. */
const SNAP_FRAMES = 3;

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

const stats: ShareCardProps["stats"] = [
  { value: "1,284", label: "transactions" },
  { value: "7", label: "chains" },
  { value: "ETH", label: "top token" },
  { value: "Jun 2017", label: "onchain since" },
];

function stillFaded(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("[style*='opacity']")]
    .filter((el) => el.style.opacity !== "1")
    .map((el) => `${el.tagName.toLowerCase()} at ${el.style.opacity}`);
}

async function letFramesPass(count: number) {
  for (let i = 0; i < count; i++) {
    await act(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(null));
      });
    });
  }
}

afterEach(cleanup);

test("a story card is readable within a few frames, with nothing left to fade", async () => {
  const { container } = render(
    <StoryCard index={1} eyebrow="Origin" accent="var(--color-accent-origin)" kicker="It started" headline="Jun 2017">
      <p>First transaction</p>
    </StoryCard>,
  );

  await letFramesPass(SNAP_FRAMES);

  expect(stillFaded(container)).toEqual([]);
});

test("the share card is readable within a few frames, with nothing left to fade", async () => {
  const { container } = render(<ShareCard name="vitalik.eth" address="0xd8dA…6045" stats={stats} />);

  await letFramesPass(SNAP_FRAMES);

  expect(stillFaded(container)).toEqual([]);
});
