// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { degradedDevLog, emptyDevLog, normalDevLog } from "../../engine/__fixtures__/dev-log";

vi.mock("../../server/github/dev-record.functions", () => ({ getGithubDevRecord: vi.fn() }));
vi.mock("../../server/vinaya/dev-record.functions", () => ({ getDevRecord: vi.fn() }));

import { getGithubDevRecord } from "../../server/github/dev-record.functions";
import { getDevRecord } from "../../server/vinaya/dev-record.functions";
import { DegradedLogRecord, DevLogPage, DevLogRecord, StateMessage } from "./DevLogPage";

const emptyGithubRecord = {
  ok: true as const,
  data: {
    tasks: [],
    totals: {
      tasksMerged: 0,
      developerMs: 0,
      reviewerMs: 0,
      secondRoundTasks: 0,
      findings: { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 },
      tokens: { developerIn: 0, developerOut: 0, reviewerIn: 0, reviewerOut: 0 },
      typicalSize: {},
      humanRulings: 0,
    },
  },
};

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

  it("names the ticket working on right now, and who, with subject-verb agreement", () => {
    render(<DevLogRecord view={normalDevLog} />);
    expect(screen.getByText(/Reviewers are working on ticket #25/)).toBeInTheDocument();
    expect(screen.getByText(/The developer is working on ticket #28/)).toBeInTheDocument();
    expect(screen.queryByText(/The developer are/)).not.toBeInTheDocument();
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

describe("DegradedLogRecord", () => {
  it("shows guardrails, round activity and the live line from the Vinaya log alone, with no ticket titles", () => {
    render(<DegradedLogRecord view={degradedDevLog} />);
    expect(screen.getByText("Ticket #25 is being worked on right now.")).toBeInTheDocument();
    expect(screen.getByText("Ticket #20")).toBeInTheDocument();
    expect(screen.getByText("Where the time goes")).toBeInTheDocument();
    expect(screen.getByText("Guardrails")).toBeInTheDocument();
    // No GitHub-only data (titles, status pills, pull requests) exists on this view at all.
    expect(screen.queryByText(/Merged|Planned|Being built|In review/)).not.toBeInTheDocument();
  });
});

describe("DevLogPage — GitHub failing doesn't blank a page the Vinaya log can still fill", () => {
  afterEach(() => {
    vi.mocked(getGithubDevRecord).mockReset();
    vi.mocked(getDevRecord).mockReset();
  });

  it("renders guardrails and round activity from the Vinaya log when GitHub is rate limited", async () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue({ ok: false, error: "rate_limited" });
    vi.mocked(getDevRecord).mockResolvedValue({
      ok: true,
      data: {
        tasks: [
          {
            issue: 20,
            rounds: [{ round: 1, findings: [] }],
            resumed: false,
            paused: false,
            recovered: false,
            running: false,
          },
        ],
        guardrails: { checks: 6, runs: 214, stopped: 9 },
      },
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DevLogPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Guardrails")).toBeInTheDocument();
    expect(screen.getByText("Ticket #20")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("GitHub's rate limit was hit");
  });
});

describe("DevLogPage — a missing VINAYA_LOG_READ_TOKEN never fails silently", () => {
  afterEach(() => {
    vi.mocked(getGithubDevRecord).mockReset();
    vi.mocked(getDevRecord).mockReset();
  });

  function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <DevLogPage />
      </QueryClientProvider>,
    );
  }

  it("shows the token-rejected message when the Vinaya read throws instead of returning a result", async () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue(emptyGithubRecord);
    // This is exactly what `log-client.ts` does for a missing `VINAYA_LOG_READ_TOKEN`: it throws
    // rather than returning a typed `VinayaLogResult`, so the query settles into `isError`, not a
    // `{ ok: false }` value — the case this test exists to cover.
    vi.mocked(getDevRecord).mockRejectedValue(new Error("VINAYA_LOG_READ_TOKEN is not set"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("VINAYA_LOG_READ_TOKEN");
    // The ticket list itself still rendered — a missing token degrades the page, it doesn't blank it.
    expect(screen.getByText("Onchain Rewind v1: demo-ready")).toBeInTheDocument();
  });

  it("shows nothing extra when both reads succeed", async () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue(emptyGithubRecord);
    vi.mocked(getDevRecord).mockResolvedValue({
      ok: true,
      data: { tasks: [], guardrails: { checks: 0, runs: 0, stopped: 0 } },
    });

    renderPage();

    expect(await screen.findByText("Onchain Rewind v1: demo-ready")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
