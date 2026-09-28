// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flushKeyframeResolvers } from "motion/react";
import { Activity, StrictMode, useState } from "react";
import { flushSync } from "react-dom";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { normalWallet } from "../../engine/fixtures";
import { RewindPlayer } from "./RewindPlayer";
import { installPendingAnimations } from "./story-playback";

/**
 * The stage, not the card: `StoryStage` wraps each card in the element `AnimatePresence` keys, slides
 * and fades, and that wrapper is what used to be left at `opacity: 0` with the card's whole content
 * present inside it — a blank screen while the progress bar kept advancing.
 *
 * What put it there was an entrance cut off in its first milliseconds. Motion hands accelerated values
 * — `opacity` among them — to the browser's own animation engine, and a browser starts such an
 * animation *pending*: it has no `startTime` until the first frame gives it one. Interrupt it inside
 * that window and Motion, measuring how far it had got from a `startTime` of `0`, reads the document's
 * epoch rather than the animation's start and concludes the fade had already finished: it writes the
 * end value into the value it owns, so the restarted entrance finds `opacity` already at its target and
 * animates nothing, while the element itself still renders the `0` the remount reset it to. `x` is not
 * accelerated, so it recovered on its own — which is why the card slid into place and stayed dark.
 *
 * The app cuts every entrance off that early all by itself: TanStack Start's client entry mounts the
 * tree inside `StrictMode`, and React's development build double-invokes a newly mounted subtree's
 * effects, detaching and re-attaching its refs around the second pass. That remounts Motion's visual
 * element a millisecond or two into the card's entrance, and Motion's remount resets every value to its
 * `initial` variant and stops whatever was playing.
 *
 * The progress segments are stubbed out for the same reason as in `RewindPlayer.test.tsx`: they advance
 * the story on a clock of their own, and the keys have to be the only thing that moves it.
 */

vi.mock("./ProgressSegments", () => ({ ProgressSegments: () => null }));

const noop = () => {};

/** The five cards the `normal` fixture builds, in order, by the accessible name each stage carries. */
const CARDS = [
  "1 of 5: Origin",
  "2 of 5: Home chain",
  "3 of 5: Top token",
  "4 of 5: The ride",
  "5 of 5: Your rewind",
] as const;

/** Long enough for the card spring to settle (`springCard`) and for a restarted fade behind it. */
const SETTLE_MS = 900;

/** Nine transitions, each playing for real, plus the polling around them. */
const TEST_TIMEOUT = 30_000;

let restoreAnimate: (() => void) | undefined;

beforeAll(() => {
  restoreAnimate = installPendingAnimations();
});

afterAll(() => restoreAnimate?.());

/** The stage wrapping a card: the `motion.div` `AnimatePresence` keys, one level above the card. */
function stageOf(label: string) {
  const stage = screen.getByLabelText(label).parentElement;
  if (!stage) throw new Error(`card "${label}" has no stage around it`);
  return stage;
}

/**
 * A stage at anything below 1 is a card the reader cannot see. Motion renders the value it last
 * animated, so an entrance that was cut off and never restarted leaves the wrapper transparent for as
 * long as the card is on screen — waiting longer never recovers it.
 *
 * The wait is a plain timer rather than `waitFor`: that helper flushes React's pending work on every
 * poll, and flushing it is by itself enough to restart an entrance that had been left stuck, so a
 * stage this suite should have failed on reads 1 by the second poll. Nothing here may push the story
 * along — the assertion has to read what it does on its own.
 */
async function expectVisible(label: string) {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  expect(stageOf(label).style.opacity).toBe("1");
}

afterEach(cleanup);

test(
  "every card's stage ends fully visible, stepping forward and back",
  async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <RewindPlayer facts={normalWallet} onReplay={noop} onOpenSettings={noop} />
      </StrictMode>,
    );

    const first = CARDS[0];
    await expectVisible(first);

    for (const label of CARDS.slice(1)) {
      await user.keyboard("[ArrowRight]");
      expect(screen.getByLabelText(label)).toBeInTheDocument();
      await expectVisible(label);
    }

    for (const label of [...CARDS].reverse().slice(1)) {
      await user.keyboard("[ArrowLeft]");
      expect(screen.getByLabelText(label)).toBeInTheDocument();
      await expectVisible(label);
    }

    // Previous on the first card re-keys it rather than moving, so it enters again — the one transition
    // that mounts a card the story is already showing.
    await user.keyboard("[ArrowLeft]");
    await expectVisible(first);
  },
  TEST_TIMEOUT,
);

/**
 * The remount `StrictMode` performs, placed deliberately rather than left to a development build's own
 * timing: hiding an `Activity` and showing it again runs React's `disappearLayoutEffects` /
 * `reappearLayoutEffects` pair, which is the path `StrictMode`'s second pass takes.
 */
let hide: ((hidden: boolean) => void) | undefined;

function Interruptible() {
  const [hidden, setHidden] = useState(false);
  hide = setHidden;
  return (
    <Activity mode={hidden ? "hidden" : "visible"}>
      <RewindPlayer facts={normalWallet} onReplay={noop} onOpenSettings={noop} />
    </Activity>
  );
}

test(
  "a card's stage comes back to full opacity when its entrance is cut off before its first frame",
  async () => {
    render(<Interruptible />);
    await expectVisible(CARDS[0]);

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

    await expectVisible(CARDS[1]);
  },
  TEST_TIMEOUT,
);
