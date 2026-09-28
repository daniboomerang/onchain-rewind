// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flushKeyframeResolvers } from "motion/react";
import { Activity, StrictMode, useState } from "react";
import { flushSync } from "react-dom";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { negativeWallet, normalWallet } from "../../engine/fixtures";
import type { RewindFacts } from "../../engine/types";
import { cardLabels, installPendingAnimations, playToLastCard, sharePanel, story } from "./story-playback";

/**
 * The share panel on the story's last card: the `<article>` `ShareCard` animates, between the card's
 * "05 · Your rewind" label and its two buttons. All three were in the page and only the panel was
 * invisible — `opacity: 0; transform: none`, with the wallet, the four stats and the footer inside it.
 *
 * It is the same failure as the stage's, one element deeper, and it is why `card-entrance.test.tsx`
 * stayed green through it: mounted on its own, the panel's entrance runs to its end and the panel is
 * readable. Inside the story it is mounted by a transition, into a tree React's development build
 * double-invokes, and Motion answers the remount by resetting every value to `initial` and stopping
 * whatever was playing. Stopping an *accelerated* animation is the trap: a browser gives a freshly
 * started one no `startTime` until its first frame, and Motion reads that missing start as `0` — the
 * document's epoch — so it measures the interruption as the whole fade, writes the end value into the
 * value it owns, and leaves the element rendering the `0` the reset had just written. The restarted
 * entrance then finds opacity already at its target and animates nothing. `y` is never accelerated, so
 * the rise landed every time, which is why the panel sat square and transparent.
 *
 * The progress segments are stubbed out for the same reason as in `RewindPlayer.test.tsx`: they advance
 * the story on a clock of their own, and the keys have to be the only thing that moves it.
 *
 * The reduced-motion half is `share-panel-reduced.test.tsx`: Motion reads the preference once per
 * process, so each preference needs its own file.
 */

vi.mock("./ProgressSegments", () => ({ ProgressSegments: () => null }));

/** Long enough for the panel's rise and fade (`enterCard` over `duration.slow`), and a restart of it. */
const SETTLE_MS = 900;

/** Four transitions per fixture, each playing for real, plus the settling after each one. */
const TEST_TIMEOUT = 30_000;

/** The two fixtures that build a story. A wallet with no transactions shows the empty state instead. */
const STORY_FIXTURES = [
  ["normal", normalWallet],
  ["negative", negativeWallet],
] as const;

let restoreAnimate: (() => void) | undefined;

beforeAll(() => {
  restoreAnimate = installPendingAnimations();
});

afterAll(() => restoreAnimate?.());

afterEach(cleanup);

/**
 * A panel at anything below 1 is a card whose middle the reader cannot see. Motion renders the value it
 * last animated, so an entrance that was cut off and never restarted leaves the panel transparent for
 * as long as the card is on screen — waiting longer never recovers it.
 *
 * The wait is a plain timer rather than `waitFor`: that helper flushes React's pending work on every
 * poll, and flushing it is by itself enough to restart an entrance that had been left stuck, so a panel
 * this suite should have failed on reads 1 by the second poll.
 */
async function expectPanelVisible() {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  expect(sharePanel().style.opacity).toBe("1");
}

for (const [name, facts] of STORY_FIXTURES) {
  test(
    `${name} wallet: the share panel ends fully visible on the last card of the played story`,
    async () => {
      const user = userEvent.setup();
      render(<StrictMode>{story(facts)}</StrictMode>);

      await playToLastCard(user, facts);

      // The content is there either way — that was never the failure — so the assertion below is about
      // the panel the reader can actually see, not about the panel being in the page.
      expect(screen.getByText("transactions")).toBeInTheDocument();
      await expectPanelVisible();
    },
    TEST_TIMEOUT,
  );
}

/**
 * The remount `StrictMode` performs, placed deliberately rather than left to a development build's own
 * timing: hiding an `Activity` and showing it again runs React's `disappearLayoutEffects` /
 * `reappearLayoutEffects` pair, which is the path `StrictMode`'s second pass takes.
 */
let hide: ((hidden: boolean) => void) | undefined;

function Interruptible({ facts }: { facts: RewindFacts }) {
  const [hidden, setHidden] = useState(false);
  hide = setHidden;
  return <Activity mode={hidden ? "hidden" : "visible"}>{story(facts)}</Activity>;
}

test(
  "the share panel comes back to full opacity when its entrance is cut off before its first frame",
  async () => {
    const user = userEvent.setup();
    render(<Interruptible facts={normalWallet} />);

    // Up to the card before the last, so the step onto the last one can be taken in a single task.
    for (const label of cardLabels(normalWallet).slice(1, -1)) {
      await user.keyboard("[ArrowRight]");
      screen.getByLabelText(label);
    }

    // The key, the entrance and the interruption, all in one task, so the fade is cut off inside the
    // window where it has no `startTime` — the state the app's own StrictMode pass produces.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });
    // Motion would otherwise resolve these keyframes on its next frame, by which time the animations
    // would carry a start reference of their own. A browser flushes them in this same task.
    flushKeyframeResolvers();
    flushSync(() => hide?.(true));
    flushSync(() => hide?.(false));

    await expectPanelVisible();
  },
  TEST_TIMEOUT,
);
