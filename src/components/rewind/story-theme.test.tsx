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
 * The story is designed dark only, while the page around it follows the system's light or dark
 * setting, so each story root re-declares the dark palette for its own subtree — the attribute the
 * tokens key that palette on. These are the roots: the reveal (both of its branches), the story
 * surface the cards and their chrome sit on, and the share card.
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

beforeEach(() => {
  preference.reduce = false;
});

afterEach(cleanup);

test("the reveal's canvas branch holds the dark palette", () => {
  const { container } = play(<ParticleReveal onBurst={noop} onDone={noop} onFailed={noop} />);

  expect(container.querySelector("[data-theme]")).toHaveAttribute("data-theme", "dark");
});

test("the reveal's reduced-motion branch holds the dark palette too", () => {
  preference.reduce = true;
  const { container } = play(<ParticleReveal onBurst={noop} onDone={noop} onFailed={noop} />);

  expect(container.querySelector("canvas")).toBeNull();
  expect(container.querySelector("[data-theme]")).toHaveAttribute("data-theme", "dark");
});

test("the story surface holds the dark palette, so the cards and the chrome over them stay dark", () => {
  play(<RewindPlayer facts={normalWallet} capped={false} onReplay={noop} onOpenSettings={noop} />);

  expect(screen.getByRole("region", { name: "Rewind story" })).toHaveAttribute("data-theme", "dark");
});

test("the share card holds the dark palette, so it stays the on-screen twin of the share image", () => {
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

  expect(screen.getByRole("article")).toHaveAttribute("data-theme", "dark");
});
