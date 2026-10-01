// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
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

  it.each([
    ["github_limited", "Ticket details are catching up"],
    ["log_unavailable", "Timing data is temporarily unavailable"],
    ["unreachable", "Timing data is temporarily unavailable"],
  ] as const)("%s reads calmly, says it refreshes on its own and names no server internal", (state, headline) => {
    render(<StateMessage state={state} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(headline);
    expect(alert).toHaveTextContent("refreshes on its own");
    if (state !== "github_limited")
      expect(alert).toHaveTextContent(/every ticket, round and finding below is complete/i);
    expect(alert.textContent).not.toMatch(
      /TOKEN|token|credential|header|Authorization|rate limit|\b(401|403|429|500)\b/,
    );
  });
});

describe("DevLogRecord — findings by reviewer", () => {
  it("names both reviewers in the headline, each on its own scale", () => {
    render(<DevLogRecord view={normalDevLog} />);
    expect(screen.getByText("Code review: 1 blocker · 3 major · 5 minor")).toBeInTheDocument();
    expect(screen.getByText("Security: 1 high · 1 medium · 1 low")).toBeInTheDocument();
  });

  it("keeps a reviewer's line, reading none, when it raised nothing", () => {
    const view = {
      ...normalDevLog,
      headline: {
        ...normalDevLog.headline,
        findings: { ...normalDevLog.headline.findings, high: 0, medium: 0, low: 0 },
      },
    };
    render(<DevLogRecord view={view} />);
    expect(screen.getByText("Security: none")).toBeInTheDocument();
  });

  it("splits a reviewed ticket's problems by reviewer", () => {
    render(<DevLogRecord view={normalDevLog} />);
    expect(screen.getAllByText("Code review:").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Security:").length).toBeGreaterThan(0);
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

  it("shows a ticket's round-by-round timeline open by default, and collapses it on click", async () => {
    const user = userEvent.setup();
    render(<DevLogRecord view={normalDevLog} />);

    const summary = screen.getByText("The GitHub record of every task becomes a development record").closest("summary");
    expect(summary).not.toBeNull();
    if (!summary) throw new Error("summary not found");
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    if (!details) throw new Error("details not found");

    // Open on arrival: a reader sees every ticket's rounds without clicking.
    expect(details).toHaveAttribute("open");
    expect(screen.getByText(/re-review after a human ruling/)).toBeInTheDocument();

    await user.click(summary);

    expect(details).not.toHaveAttribute("open");
  });

  it("never renders an expand affordance for a ticket the log never saw", () => {
    render(<DevLogRecord view={normalDevLog} />);
    const plannedTitle = screen.getByText("A twelfth demo wallet replaces one that stopped producing a good story");
    expect(plannedTitle.closest("details")).toBeNull();
  });

  it("shows a decorative chevron only on an expandable ticket, rotated by the details' own open state", () => {
    render(<DevLogRecord view={normalDevLog} />);

    const expandableSummary = screen
      .getByText("The GitHub record of every task becomes a development record")
      .closest("summary");
    if (!expandableSummary) throw new Error("summary not found");
    const chevron = expandableSummary.querySelector("svg");
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveAttribute("aria-hidden");
    expect(chevron?.getAttribute("class")).toContain("group-open:rotate-180");

    const plannedRow = screen
      .getByText("A twelfth demo wallet replaces one that stopped producing a good story")
      .closest("li");
    expect(plannedRow?.querySelector("svg")).toBeNull();
  });

  it("shows zero tickets and zero merged for an empty milestone", () => {
    render(<DevLogRecord view={emptyDevLog} />);
    expect(screen.getByText((_, element) => element?.textContent === "0 of 0 tickets merged")).toBeInTheDocument();
  });
});

describe("DevLogRecord — rounds always show", () => {
  const rebuiltTitle = "The GitHub record of every task becomes a development record";

  // The same ticket as GitHub alone rebuilds it when the Vinaya log is down: rounds, no time.
  function githubOnly(): typeof normalDevLog {
    return {
      ...normalDevLog,
      timeSplit: undefined,
      guardrails: undefined,
      tickets: normalDevLog.tickets.map((t) => ({
        ...t,
        timeline: t.timeline.map(({ developerMs, reviewerMs, filesChanged, insertions, deletions, ...round }) => round),
      })),
    };
  }

  it("shows a ticket's rounds open, saying time isn't available and inventing none", () => {
    render(<DevLogRecord view={githubOnly()} />);
    const details = screen.getByText(rebuiltTitle).closest("details");
    expect(details).toHaveAttribute("open");
    expect(screen.getAllByText("Time isn't available for this round.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Time per round isn't available/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Developer \d+ min/)).not.toBeInTheDocument();
  });

  it("keeps a ticket with no rounds a plain row", () => {
    render(<DevLogRecord view={githubOnly()} />);
    const planned = screen.getByText("A twelfth demo wallet replaces one that stopped producing a good story");
    expect(planned.closest("details")).toBeNull();
  });

  it("keeps a closed ticket closed across a refresh, and an open one open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DevLogRecord view={githubOnly()} />);
    const summary = screen.getByText(rebuiltTitle).closest("summary");
    if (!summary) throw new Error("summary not found");

    await user.click(summary);
    expect(screen.getByText(rebuiltTitle).closest("details")).not.toHaveAttribute("open");

    rerender(<DevLogRecord view={githubOnly()} />);
    expect(screen.getByText(rebuiltTitle).closest("details")).not.toHaveAttribute("open");

    await user.click(screen.getByText(rebuiltTitle).closest("summary") as HTMLElement);
    rerender(<DevLogRecord view={githubOnly()} />);
    expect(screen.getByText(rebuiltTitle).closest("details")).toHaveAttribute("open");
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
    expect(screen.getByRole("alert")).toHaveTextContent("Ticket details are catching up");
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

  it("shows the calm round-detail message, never the error, when the Vinaya read throws instead of returning a result", async () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue(emptyGithubRecord);
    // This is exactly what `log-client.ts` does for a missing `VINAYA_LOG_READ_TOKEN`: it throws
    // rather than returning a typed `VinayaLogResult`, so the query settles into `isError`, not a
    // `{ ok: false }` value — the case this test exists to cover.
    vi.mocked(getDevRecord).mockRejectedValue(new Error("VINAYA_LOG_READ_TOKEN is not set"));

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Timing data is temporarily unavailable");
    expect(document.body.textContent).not.toContain("VINAYA_LOG_READ_TOKEN");
    // The ticket list itself still rendered — a missing token degrades the page, it doesn't blank it.
    expect(screen.getByText("Onchain Rewind v1: demo-ready")).toBeInTheDocument();
  });

  it("carries a Back to home link to / above the header, regardless of the reads' state", () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue(emptyGithubRecord);
    vi.mocked(getDevRecord).mockResolvedValue({
      ok: true,
      data: { tasks: [], guardrails: { checks: 0, runs: 0, stopped: 0 } },
    });

    renderPage();

    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
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

describe("DevLogPage — the development snapshot paints first, then the live record replaces it", () => {
  const emptyTotals = emptyGithubRecord.data.totals;

  function githubRecord(title: string, status: "merged" | "being_built", merged: number) {
    return {
      tasks: [{ issue: 40, title, status, rounds: [], developerTokens: [], reviewerTokens: [], humanRulings: [] }],
      totals: { ...emptyTotals, tasksMerged: merged },
    };
  }

  const logRecord = (running: boolean) => ({
    tasks: [{ issue: 40, rounds: [], resumed: false, paused: false, recovered: false, running }],
    guardrails: { checks: 6, runs: 214, stopped: 9 },
  });

  const snapshot = {
    takenAt: "2026-09-30T17:52:56.295Z",
    github: githubRecord("A ticket as the build read it", "being_built", 0),
    log: logRecord(true),
  };

  const liveGithub = { ok: true as const, data: githubRecord("The same ticket, read live", "merged", 1) };

  afterEach(() => {
    vi.mocked(getGithubDevRecord).mockReset();
    vi.mocked(getDevRecord).mockReset();
  });

  function renderPage(
    withSnapshot: { takenAt: string; github: typeof snapshot.github; log?: typeof snapshot.log } | null,
  ) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DevLogPage snapshot={withSnapshot} />
      </QueryClientProvider>,
    );
    return client;
  }

  it("paints a snapshot taken without the Vinaya log like a failed log read, with its tickets and no guardrails", () => {
    vi.mocked(getGithubDevRecord).mockReturnValue(new Promise(() => {}));
    vi.mocked(getDevRecord).mockReturnValue(new Promise(() => {}));

    renderPage({ takenAt: snapshot.takenAt, github: snapshot.github });

    expect(screen.getByText("A ticket as the build read it")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved copy as of");
    expect(screen.queryByText("Reading the project record…")).not.toBeInTheDocument();
    expect(screen.queryByText(/From the Vinaya log, as of the saved copy/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Timing data is temporarily unavailable");
  });

  it("fills in the log's data, and drops the message, once the live log answers", async () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue(liveGithub);
    vi.mocked(getDevRecord).mockResolvedValue({ ok: true, data: logRecord(false) });

    renderPage({ takenAt: snapshot.takenAt, github: snapshot.github });

    expect(await screen.findByText("The same ticket, read live")).toBeInTheDocument();
    expect(screen.getByText(/Live from the Vinaya log/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("paints the snapshot with its as-of line and no loader while the live reads are pending", () => {
    vi.mocked(getGithubDevRecord).mockReturnValue(new Promise(() => {}));
    vi.mocked(getDevRecord).mockReturnValue(new Promise(() => {}));

    renderPage(snapshot);

    expect(screen.getByText("A ticket as the build read it")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved copy as of");
    expect(screen.getByRole("status").querySelector("time")).toHaveAttribute("dateTime", snapshot.takenAt);
    expect(screen.queryByText("Reading the project record…")).not.toBeInTheDocument();
    // "Right now" was only true when the build ran, so the snapshot never claims it.
    expect(screen.queryByText(/working on ticket #40/)).not.toBeInTheDocument();
    expect(screen.getByText(/From the Vinaya log, as of the saved copy/)).toBeInTheDocument();
  });

  it("replaces the snapshot with the live record once both reads answer, never showing the loader", async () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue(liveGithub);
    vi.mocked(getDevRecord).mockResolvedValue({ ok: true, data: logRecord(false) });

    renderPage(snapshot);
    expect(screen.queryByText("Reading the project record…")).not.toBeInTheDocument();

    expect(await screen.findByText("The same ticket, read live")).toBeInTheDocument();
    expect(screen.queryByText("A ticket as the build read it")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Live, refreshed every few seconds.");
    expect(screen.queryByText(/Saved copy/)).not.toBeInTheDocument();
    expect(screen.queryByText("Reading the project record…")).not.toBeInTheDocument();
  });

  it("keeps the snapshot on screen when the live GitHub read fails, and says so", async () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue({ ok: false, error: "rate_limited" });
    vi.mocked(getDevRecord).mockResolvedValue({ ok: true, data: logRecord(false) });

    renderPage(snapshot);

    expect(await screen.findByText(/couldn't be read just now, so this copy stays/)).toBeInTheDocument();
    expect(screen.getByText("A ticket as the build read it")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved copy as of");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the snapshot, rounds and guardrails included, when the live Vinaya read fails", async () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue(liveGithub);
    vi.mocked(getDevRecord).mockRejectedValue(new Error("VINAYA_LOG_READ_TOKEN is not set"));

    renderPage(snapshot);

    expect(await screen.findByText(/couldn't be read just now, so this copy stays/)).toBeInTheDocument();
    expect(screen.getByText("A ticket as the build read it")).toBeInTheDocument();
    expect(screen.queryByText("The same ticket, read live")).not.toBeInTheDocument();
    expect(screen.getByText(/From the Vinaya log, as of the saved copy/)).toBeInTheDocument();
  });

  it("keeps the last live record, not the older snapshot, when a later poll fails", async () => {
    vi.mocked(getGithubDevRecord).mockResolvedValue(liveGithub);
    vi.mocked(getDevRecord).mockResolvedValue({ ok: true, data: logRecord(false) });

    const client = renderPage(snapshot);
    expect(await screen.findByText("The same ticket, read live")).toBeInTheDocument();

    vi.mocked(getGithubDevRecord).mockResolvedValue({ ok: false, error: "rate_limited" });
    await act(() => client.refetchQueries());

    expect(await screen.findByText(/The last live read\./)).toBeInTheDocument();
    expect(screen.getByText("The same ticket, read live")).toBeInTheDocument();
    expect(screen.queryByText("A ticket as the build read it")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The last live read.");
    expect(screen.queryByText("Reading the project record…")).not.toBeInTheDocument();
  });

  it("shows today's loader when the deploy carries no snapshot", () => {
    vi.mocked(getGithubDevRecord).mockReturnValue(new Promise(() => {}));
    vi.mocked(getDevRecord).mockReturnValue(new Promise(() => {}));

    renderPage(null);

    expect(screen.getByText("Reading the project record…")).toBeInTheDocument();
    expect(screen.queryByText(/Saved copy/)).not.toBeInTheDocument();
  });
});
