// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { negativeWallet, normalWallet } from "../../engine/fixtures";
import { installPendingAnimations, playToLastCard, sharePanel, story } from "./story-playback";

/**
 * The reduced-motion half of `share-panel.test.tsx`, over the same played story. Motion reads the
 * preference once per process and each component keeps the value it read on mount, so a file can hold
 * only one preference — the stub below is installed before anything renders and stands for the whole
 * file, which is why the pair cannot be one suite.
 *
 * What this half holds is stricter than "ends visible": with the preference set, the panel must be
 * readable without any animation running to its end, because `enterCardReduced` snaps both of its
 * values and Motion writes a transition with no duration straight through its own render loop. Nothing
 * accelerated is left between the hidden state the server rendered and a readable panel, so no
 * interruption can strand it — this is the assertion that keeps it that way.
 *
 * The progress segments are stubbed out for the same reason as in `share-panel.test.tsx`: they advance
 * the story on a clock of their own, and the keys have to be the only thing that moves it.
 */

vi.mock("./ProgressSegments", () => ({ ProgressSegments: () => null }));

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

/** Frames to let pass before a snapped entrance must have landed. Well under any fade's length. */
const SNAP_FRAMES = 3;

/** Four transitions per fixture, each keyed and settled in turn. */
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

async function letFramesPass(count: number) {
  for (let i = 0; i < count; i++) {
    await act(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve(null));
      });
    });
  }
}

for (const [name, facts] of STORY_FIXTURES) {
  test(
    `${name} wallet: the share panel is readable on the last card with nothing left to fade`,
    async () => {
      const user = userEvent.setup();
      render(<StrictMode>{story(facts)}</StrictMode>);

      await playToLastCard(user, facts);
      await letFramesPass(SNAP_FRAMES);

      expect(screen.getByText("transactions")).toBeInTheDocument();
      expect(sharePanel().style.opacity).toBe("1");
    },
    TEST_TIMEOUT,
  );
}
