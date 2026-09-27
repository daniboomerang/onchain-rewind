// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { normalWallet } from "../../engine/fixtures";
import { RewindPlayer } from "./RewindPlayer";

/**
 * The keyboard, which is what the reference handoff got wrong: its guard ignored every key whose
 * target sat inside a button, so ← → stopped moving the story as soon as the settings dialog
 * returned focus to the gear. Space is the opposite case — a focused button owns it, and the story
 * must not steal it. The reveal's canvas isn't involved here; happy-dom can't draw one.
 */

// The segments fill on a clock and auto-advance the story when a segment completes, which with
// animations set instantly would run the story to its last card before a key is ever pressed. The
// stub renders nothing, so the keys are the only thing that moves the story.
vi.mock("./ProgressSegments", () => ({ ProgressSegments: () => null }));

const noop = () => {};

/** Animations are set instantly, so an assertion reads the state the keys produced, not a frame. */
const play = (children: ReactNode) => render(<MotionConfig skipAnimations>{children}</MotionConfig>);

afterEach(cleanup);

const gear = () => screen.getByRole("button", { name: "Change wallet" });
const card = (label: string) => screen.getByLabelText(label);

test("the arrow keys move the story while the gear button has focus", async () => {
  const user = userEvent.setup();
  play(<RewindPlayer facts={normalWallet} onReplay={noop} onOpenSettings={noop} />);

  gear().focus();
  expect(gear()).toHaveFocus();
  expect(card("1 of 5: Origin")).toBeInTheDocument();

  await user.keyboard("[ArrowRight]");
  expect(gear()).toHaveFocus();
  expect(card("2 of 5: Home chain")).toBeInTheDocument();

  await user.keyboard("[ArrowLeft]");
  expect(card("1 of 5: Origin")).toBeInTheDocument();
});

test("Space activates the focused button instead of pausing the story", async () => {
  const user = userEvent.setup();
  const onOpenSettings = vi.fn();
  play(<RewindPlayer facts={normalWallet} onReplay={noop} onOpenSettings={onOpenSettings} />);

  gear().focus();
  await user.keyboard("[Space]");

  expect(onOpenSettings).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/^Paused/)).not.toBeInTheDocument();
});

test("Space still pauses the story when no button has focus", async () => {
  const user = userEvent.setup();
  play(<RewindPlayer facts={normalWallet} onReplay={noop} onOpenSettings={noop} />);

  await user.keyboard("[Space>]");
  expect(screen.getByText(/^Paused/)).toBeInTheDocument();

  await user.keyboard("[/Space]");
  expect(screen.queryByText(/^Paused/)).not.toBeInTheDocument();
});
