// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { normalWallet } from "../../engine/fixtures";
import { fmt } from "../../engine/types";
import { ParticleReveal } from "./ParticleReveal";
import { RewindPlayer } from "./RewindPlayer";
import { ShareCard } from "./ShareCard";

/**
 * The whole app follows one light/dark setting, the story included, so no story root may pin a palette
 * of its own: the reveal (both of its branches), the story surface the cards and their chrome sit on,
 * and the share card all inherit the theme the document resolved. A pinned `data-theme` anywhere in
 * here is the regression these tests exist for — it is what made the toggle look like a dead control
 * while the story played.
 *
 * The theme the canvas paints its particles in is read from the resolved tokens and re-read on every
 * change; no test environment has a 2D context, so that half is `toneTables` in `particles.test.ts`
 * plus the browser pass.
 */

// Same swap as the reveal's own test: Motion reads the preference once into a module singleton.
const preference = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => preference.reduce,
}));

// The segments fill on a clock this file has no use for: the attribute is there on the first frame.
vi.mock("./ProgressSegments", () => ({ ProgressSegments: () => null }));

const noop = () => {};
const play = (children: ReactNode) => render(<MotionConfig skipAnimations>{children}</MotionConfig>);

/** Both themes, because a root that pins one of them reads as correct under that one. */
const themes = ["light", "dark"] as const;

beforeEach(() => {
  preference.reduce = false;
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

test.each(themes)("the reveal's canvas branch follows the page's theme (%s)", (theme) => {
  document.documentElement.dataset.theme = theme;
  const { container } = play(<ParticleReveal onBurst={noop} onDone={noop} onFailed={noop} />);

  expect(container.querySelector("canvas")).not.toBeNull();
  expect(container.querySelector("[data-theme]")).toBeNull();
});

test.each(themes)("the reveal's reduced-motion branch follows it too (%s)", (theme) => {
  document.documentElement.dataset.theme = theme;
  preference.reduce = true;
  const { container } = play(<ParticleReveal onBurst={noop} onDone={noop} onFailed={noop} />);

  expect(container.querySelector("canvas")).toBeNull();
  expect(container.querySelector("[data-theme]")).toBeNull();
});

test.each(themes)("the story surface follows it, so the cards and the chrome turn with it (%s)", (theme) => {
  document.documentElement.dataset.theme = theme;
  play(<RewindPlayer facts={normalWallet} capped={false} onReplay={noop} onOpenSettings={noop} />);

  const story = screen.getByRole("region", { name: "Rewind story" });
  expect(story).not.toHaveAttribute("data-theme");
  expect(story.querySelector("[data-theme]")).toBeNull();
});

test.each(themes)("the share card follows it, staying the on-screen twin of the share image (%s)", (theme) => {
  document.documentElement.dataset.theme = theme;
  play(
    <ShareCard
      name="vitalik.eth"
      address="0xd8dA…6045"
      stats={[
        { value: fmt.int(normalWallet.txCount), label: "transactions" },
        { value: fmt.int(normalWallet.chainCount), label: "chains" },
        { value: "ETH", label: "top token" },
        { value: "Jan 2026", label: "onchain since" },
      ]}
    />,
  );

  expect(screen.getByRole("article")).not.toHaveAttribute("data-theme");
});
