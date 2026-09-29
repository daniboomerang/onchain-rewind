// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyDevLog, normalDevLog } from "../../engine/__fixtures__/dev-log";
import { DevLogRecord, StateMessage } from "./DevLogPage";

beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("StateMessage", () => {
  it("shows the loading copy with no alert role", () => {
    render(<StateMessage state="loading" />);
    expect(screen.getByText("Reading the project record…")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names GITHUB_TOKEN, never a value, when GitHub is rate limited", () => {
    render(<StateMessage state="rate_limited" />);
    expect(screen.getByRole("alert")).toHaveTextContent("GITHUB_TOKEN");
  });

  it("names VINAYA_LOG_READ_TOKEN, never a value, when the log rejects its token", () => {
    render(<StateMessage state="token_rejected" />);
    expect(screen.getByRole("alert")).toHaveTextContent("VINAYA_LOG_READ_TOKEN");
  });

  it("has its own clear message when the log is unreachable", () => {
    render(<StateMessage state="unreachable" />);
    expect(screen.getByRole("alert")).toHaveTextContent("couldn't be reached");
  });
});

describe("DevLogRecord", () => {
  it("shows the milestone's progress and every headline number", () => {
    render(<DevLogRecord view={normalDevLog} />);
    expect(screen.getByText("Onchain Rewind v1: demo-ready")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // tickets merged
    expect(screen.getByText("Time per ticket")).toBeInTheDocument();
    expect(screen.getByText("Second rounds")).toBeInTheDocument();
    expect(screen.getByText("Problems caught")).toBeInTheDocument();
    expect(screen.getByText("Typical size")).toBeInTheDocument();
    expect(screen.getByText("Model tokens")).toBeInTheDocument();
  });

  it("names the ticket working on right now, and who", () => {
    render(<DevLogRecord view={normalDevLog} />);
    expect(screen.getByText(/Reviewers are working on ticket #25/)).toBeInTheDocument();
  });

  it("expands a ticket's round-by-round timeline via its native <details>, closed until clicked", async () => {
    const user = userEvent.setup();
    render(<DevLogRecord view={normalDevLog} />);

    const summary = screen.getByText("The GitHub record of every task becomes a development record").closest("summary");
    expect(summary).not.toBeNull();
    if (!summary) throw new Error("summary not found");
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    if (!details) throw new Error("details not found");

    // A native <details> starts closed — the round timeline is not yet meaningfully shown to a
    // visitor, even though happy-dom (unlike a real browser's UA stylesheet) doesn't hide its markup.
    expect(details).not.toHaveAttribute("open");

    await user.click(summary);

    expect(details).toHaveAttribute("open");
    expect(screen.getByText(/re-review after a human ruling/)).toBeInTheDocument();
  });

  it("never renders an expand affordance for a ticket the log never saw", () => {
    render(<DevLogRecord view={normalDevLog} />);
    const plannedTitle = screen.getByText("A twelfth demo wallet replaces one that stopped producing a good story");
    expect(plannedTitle.closest("details")).toBeNull();
  });

  it("shows zero tickets and zero merged for an empty milestone", () => {
    render(<DevLogRecord view={emptyDevLog} />);
    expect(screen.getByText((_, element) => element?.textContent === "0 of 0 tickets merged")).toBeInTheDocument();
  });
});
