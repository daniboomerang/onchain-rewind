// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RoundTimelineEntry } from "../../engine/dev-log-view";
import { RoundTimeline } from "./RoundTimeline";

afterEach(cleanup);

function round(overrides: Partial<RoundTimelineEntry>): RoundTimelineEntry {
  return { round: 1, findings: {}, ...overrides } as RoundTimelineEntry;
}

describe("RoundTimeline: untimed round", () => {
  it.each([
    ["green", "Approved", "bg-positive"],
    ["changes_requested", "Changes requested", "bg-notice"],
    [undefined, "In progress", "bg-fg-subtle"],
  ] as const)("%s shows a full-width %s bar, labelled, with the reason line", (outcome, label, tone) => {
    render(<RoundTimeline timeline={[round({ outcome })]} scaleMs={1000} humanRulings={0} />);
    const bar = screen.getByRole("img", { name: `${label}, time isn't available for this round` });
    expect(bar).toHaveClass("h-2.5", "rounded-full");
    const fill = bar.firstElementChild;
    expect(fill).toHaveClass("w-full", tone);
    expect(fill).not.toHaveAttribute("style");
    expect(screen.getByText("Time isn't available for this round.")).toBeInTheDocument();
  });
});

describe("RoundTimeline: timed round", () => {
  it("keeps developer and reviewer segments on the shared scale", () => {
    render(
      <RoundTimeline
        timeline={[round({ outcome: "green", developerMs: 60_000, reviewerMs: 30_000 })]}
        scaleMs={120_000}
        humanRulings={0}
      />,
    );
    const bar = screen.getByRole("img");
    expect(bar.getAttribute("aria-label")).toMatch(/^Developer .*, reviewers /);
    const [dev, review] = Array.from(bar.children) as HTMLElement[];
    expect(dev?.style.width).toBe("50%");
    expect(review?.style.width).toBe("25%");
    expect(screen.queryByText("Time isn't available for this round.")).not.toBeInTheDocument();
  });
});

describe("RoundTimeline: problems line", () => {
  const none = { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 };

  it("lists a round's problems by severity", () => {
    render(
      <RoundTimeline
        timeline={[round({ outcome: "changes_requested", findings: { ...none, major: 2, high: 1 } })]}
        scaleMs={1000}
        humanRulings={0}
      />,
    );
    expect(screen.getByText("Problems raised: 2 major · 1 high")).toBeInTheDocument();
  });

  it("prints no problems line, and no placeholder, for a round that raised nothing", () => {
    render(<RoundTimeline timeline={[round({ outcome: "green", findings: none })]} scaleMs={1000} humanRulings={0} />);
    expect(screen.queryByText(/Problems raised/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing raised/)).not.toBeInTheDocument();
  });
});

describe("RoundTimeline: reason line", () => {
  const none = { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 };

  it.each([
    ["checks_failed", "Checks failed before review."],
    ["human_check", "Stopped for a human check. The reviewers raised nothing."],
  ] as const)("says why a round with no problems was sent back: %s", (sentBackReason, text) => {
    render(
      <RoundTimeline
        timeline={[round({ outcome: "changes_requested", findings: none, sentBackReason })]}
        scaleMs={1000}
        humanRulings={0}
      />,
    );
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/Problems raised/)).not.toBeInTheDocument();
  });

  it("prints no reason line for a round sent back whose log recorded no reason", () => {
    render(
      <RoundTimeline
        timeline={[round({ outcome: "changes_requested", findings: none })]}
        scaleMs={1000}
        humanRulings={0}
      />,
    );
    expect(screen.queryByText(/Checks failed|Stopped for a human check/)).not.toBeInTheDocument();
  });

  it("keeps the problems line, and no reason line, for a round sent back with findings", () => {
    render(
      <RoundTimeline
        timeline={[
          round({ outcome: "changes_requested", findings: { ...none, major: 1 }, sentBackReason: "human_check" }),
        ]}
        scaleMs={1000}
        humanRulings={0}
      />,
    );
    expect(screen.getByText("Problems raised: 1 major")).toBeInTheDocument();
    expect(screen.queryByText(/Stopped for a human check/)).not.toBeInTheDocument();
  });
});
