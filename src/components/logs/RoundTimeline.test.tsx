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
