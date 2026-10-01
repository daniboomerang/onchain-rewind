/**
 * Pure fold from the two development-record sources — GitHub's (`github-dev-record.ts`) and the
 * Vinaya log's own (`dev-record.ts`) — into the view model `/logs` renders: the milestone's
 * progress, its headline numbers, where the time goes, the guardrail totals, who is working on
 * something right now, and each ticket's round-by-round timeline.
 *
 * No `fetch`, no `Date.now()`, no React, no globals — the same discipline as every other engine
 * module. GitHub's tasks carry one summary per distinct round (a round reviewed again after a
 * human ruling collapses to its latest state, ADR-0004), so a round-by-round timeline with real
 * repeats can only come from the Vinaya log's own, unreduced round record — matched here by issue
 * number. A ticket the log has no rounds for gets a timeline rebuilt from GitHub's summaries —
 * the same rounds, outcomes, findings and confidence, with no time, which only the log measures.
 */

import type {
  GuardrailTotals,
  RoundRecord as LogRoundRecord,
  TaskRecord as LogTaskRecord,
} from "#/engine/dev-record.ts";
import {
  type FindingCounts,
  type DevelopmentRecord as GithubDevelopmentRecord,
  SEVERITIES,
  type Severity,
  type TaskDevRecord,
  type TaskStatus,
} from "#/engine/github-dev-record.ts";

/** This repo's one milestone (SPEC.md §0). Not fetched: GitHub's REST API has no milestone read in this app's surface. */
const MILESTONE_TITLE = "Onchain Rewind v1: demo-ready";

export type LogDevelopmentRecord = { readonly tasks: readonly LogTaskRecord[]; readonly guardrails: GuardrailTotals };

function zeroFindingCounts(): FindingCounts {
  return { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 };
}

function isSeverity(value: string): value is Severity {
  return (SEVERITIES as readonly string[]).includes(value);
}

/**
 * The two reviewers raise on disjoint scales (the record keeps all seven in one `FindingCounts`),
 * so the reviewer is told by the severity alone: no field is added to the record.
 */
const REVIEWER_SCALES = [
  { reviewer: "Code review", severities: ["blocker", "major", "minor"] },
  { reviewer: "Security", severities: ["critical", "high", "medium", "low"] },
] as const satisfies readonly { reviewer: string; severities: readonly Severity[] }[];

export type ReviewerFindings = {
  readonly reviewer: (typeof REVIEWER_SCALES)[number]["reviewer"];
  /** Only the severities the reviewer raised, most severe first. Empty when it raised none. */
  readonly raised: readonly { readonly severity: Severity; readonly count: number }[];
};

/** Both reviewers, always, in this order: a reviewer that raised nothing keeps its line, with `raised` empty. */
export function findingsByReviewer(counts: FindingCounts): readonly ReviewerFindings[] {
  return REVIEWER_SCALES.map(({ reviewer, severities }) => ({
    reviewer,
    raised: severities
      .filter((severity) => counts[severity] > 0)
      .map((severity) => ({ severity, count: counts[severity] })),
  }));
}

function addFindingCounts(a: FindingCounts, b: FindingCounts): FindingCounts {
  const sum = zeroFindingCounts();
  for (const severity of SEVERITIES) sum[severity] = a[severity] + b[severity];
  return sum;
}

function findingsFromLog(findings: readonly LogRoundRecord["findings"][number][]): FindingCounts {
  const counts = zeroFindingCounts();
  for (const finding of findings) {
    if (isSeverity(finding.severity)) counts[finding.severity]++;
  }
  return counts;
}

export type RoundTimelineEntry = {
  readonly round: number;
  /** This round number appeared earlier in the same ticket's timeline — a re-review. */
  readonly repeat: boolean;
  readonly developerMs?: number;
  readonly reviewerMs?: number;
  readonly outcome?: "changes_requested" | "green";
  /** `reason` is the log's own; GitHub's reviewer summary carries the figure alone. */
  readonly confidence?: { readonly value: number; readonly reason?: string };
  readonly filesChanged?: number;
  readonly insertions?: number;
  readonly deletions?: number;
  readonly findings: FindingCounts;
};

export type PullRequestView = {
  readonly number: number;
  readonly url: string;
  readonly merged: boolean;
  readonly filesChanged: number;
  readonly insertions: number;
  readonly deletions: number;
  readonly firstCommitAt?: string;
};

export type TicketView = {
  readonly issue: number;
  readonly title: string;
  readonly status: TaskStatus;
  readonly pullRequest?: PullRequestView;
  readonly humanRulingsCount: number;
  readonly codeVerdict?: "approve" | "pass";
  readonly securityVerdict?: "approve" | "pass";
  readonly buildMs?: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  /** The sum of the timeline's rows. */
  readonly findings: FindingCounts;
  /** Every review in the timeline, re-reviews included. */
  readonly roundCount: number;
  /** One entry per review in the timeline, with its outcome — for a compact round-by-round glance. */
  readonly rounds: readonly { readonly round: number; readonly outcome?: string }[];
  /** The round-by-round timeline: the Vinaya log's own when it has the ticket, else rebuilt from GitHub's summaries. Empty only when the ticket has no rounds. */
  readonly timeline: readonly RoundTimelineEntry[];
  readonly running: boolean;
  readonly recovered: boolean;
  readonly paused: boolean;
};

export type MilestoneView = {
  readonly title: string;
  readonly ticketsMerged: number;
  readonly ticketsTotal: number;
};

export type HeadlineNumbers = {
  readonly medianTicketMs?: number;
  readonly secondRoundTickets: number;
  readonly reviewedTickets: number;
  readonly findings: FindingCounts;
  readonly findingsTotal: number;
  readonly typicalFiles?: number;
  readonly typicalLines?: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
};

export type TimeSplitView = {
  readonly developerMs: number;
  readonly reviewerMs: number;
  readonly humanRulings: number;
  readonly recoveredTickets: number;
};

export type WorkingNow = {
  readonly issue: number;
  readonly title: string;
  readonly role: "developer" | "reviewers";
};

export type DevLogView = {
  readonly milestone: MilestoneView;
  readonly headline: HeadlineNumbers;
  readonly timeSplit?: TimeSplitView;
  readonly guardrails?: GuardrailTotals;
  readonly workingNow: readonly WorkingNow[];
  readonly tickets: readonly TicketView[];
};

function hasFindings(findings: FindingCounts): boolean {
  return SEVERITIES.some((severity) => findings[severity] > 0);
}

/**
 * The log's own rounds, one entry per review, re-reviews included. A review's findings are the
 * log's. GitHub's reviewer-summary row for a round number stands in only when no review of that
 * number has findings in the log, and then once, on its last review: the table keeps one row per
 * round number, so spreading it over every re-review would count it twice.
 */
function buildTimeline(
  rounds: readonly LogRoundRecord[],
  githubRounds: TaskDevRecord["rounds"] = [],
): readonly RoundTimelineEntry[] {
  const logged = rounds.map((round) => findingsFromLog(round.findings));
  const lastReview = new Map<number, number>();
  const roundsWithLogFindings = new Set<number>();
  rounds.forEach((round, index) => {
    lastReview.set(round.round, index);
    if (hasFindings(logged[index] ?? zeroFindingCounts())) roundsWithLogFindings.add(round.round);
  });
  const githubByRound = new Map(githubRounds.map((round) => [round.round, round.findings]));

  const seen = new Set<number>();
  return rounds.map((round, index) => {
    const repeat = seen.has(round.round);
    seen.add(round.round);
    const own = logged[index] ?? zeroFindingCounts();
    const fromGithub =
      !roundsWithLogFindings.has(round.round) && lastReview.get(round.round) === index
        ? githubByRound.get(round.round)
        : undefined;
    return {
      round: round.round,
      repeat,
      developerMs: round.developerMs,
      reviewerMs: round.reviewerMs,
      outcome: round.outcome,
      confidence: round.confidence,
      filesChanged: round.filesChanged,
      insertions: round.insertions,
      deletions: round.deletions,
      findings: fromGithub ?? own,
    };
  });
}

/**
 * One entry per distinct round from GitHub's reviewer summaries, for a ticket the Vinaya log has
 * no rounds for. Time, size and the log's confidence reason are the log's alone, so they stay
 * unset rather than guessed.
 */
function buildTimelineFromGithub(rounds: TaskDevRecord["rounds"]): readonly RoundTimelineEntry[] {
  return rounds.map((round) => ({
    round: round.round,
    repeat: false,
    outcome: round.outcome === "green" || round.outcome === "changes_requested" ? round.outcome : undefined,
    confidence: round.confidence === undefined ? undefined : { value: round.confidence },
    findings: round.findings,
  }));
}

function buildTicket(task: TaskDevRecord, logTask: LogTaskRecord | undefined): TicketView {
  // The log's timeline, with times, wins whenever it has rounds for the ticket.
  const timeline =
    logTask !== undefined && logTask.rounds.length > 0
      ? buildTimeline(logTask.rounds, task.rounds)
      : buildTimelineFromGithub(task.rounds);
  // The ticket's numbers are its rows': its problems their sum, its rounds every review in them.
  let findings = zeroFindingCounts();
  for (const entry of timeline) findings = addFindingCounts(findings, entry.findings);

  let tokensIn = 0;
  let tokensOut = 0;
  for (const row of task.developerTokens) {
    tokensIn += row.tokensIn ?? 0;
    tokensOut += row.tokensOut ?? 0;
  }
  for (const row of task.reviewerTokens) {
    tokensIn += row.tokensIn ?? 0;
    tokensOut += row.tokensOut ?? 0;
  }

  const pullRequest: PullRequestView | undefined = task.pullRequest
    ? {
        number: task.pullRequest.number,
        url: task.pullRequest.url,
        merged: task.pullRequest.merged,
        filesChanged: task.pullRequest.filesChanged,
        insertions: task.pullRequest.insertions,
        deletions: task.pullRequest.deletions,
        firstCommitAt: task.pullRequest.firstCommitAt,
      }
    : undefined;

  return {
    issue: task.issue,
    title: task.title,
    status: task.status,
    pullRequest,
    humanRulingsCount: task.humanRulings.length,
    codeVerdict: task.codeVerdict?.result,
    securityVerdict: task.securityVerdict?.result,
    buildMs: task.timeMs,
    tokensIn,
    tokensOut,
    findings,
    roundCount: timeline.length,
    rounds: timeline.map((entry) => ({ round: entry.round, outcome: entry.outcome })),
    timeline,
    running: logTask?.running ?? false,
    recovered: logTask?.recovered ?? false,
    paused: logTask?.paused ?? false,
  };
}

function roleForStatus(status: TaskStatus): "developer" | "reviewers" | undefined {
  if (status === "being_built") return "developer";
  if (status === "in_review") return "reviewers";
  return undefined;
}

/** The whole `/logs` view. `log` is optional: a missing or failed Vinaya log read still shows every ticket GitHub knows about, with its rounds rebuilt from GitHub's summaries but without time, guardrails or time split. */
export function buildDevLogView(github: GithubDevelopmentRecord, log?: LogDevelopmentRecord): DevLogView {
  const logByIssue = new Map(log?.tasks.map((task) => [task.issue, task]) ?? []);
  const tickets = github.tasks.map((task) => buildTicket(task, logByIssue.get(task.issue)));

  // The headline is the sum of the tickets, as each ticket is the sum of its rows.
  const reviewedTickets = tickets.filter((ticket) => ticket.roundCount > 0).length;
  const secondRoundTickets = tickets.filter((ticket) => ticket.roundCount >= 2).length;
  let findings = zeroFindingCounts();
  for (const ticket of tickets) findings = addFindingCounts(findings, ticket.findings);

  const workingNow: WorkingNow[] = [];
  for (const ticket of tickets) {
    if (!ticket.running) continue;
    const role = roleForStatus(ticket.status);
    if (role) workingNow.push({ issue: ticket.issue, title: ticket.title, role });
  }

  const totals = github.totals;
  const timeSplit: TimeSplitView | undefined =
    totals.developerMs + totals.reviewerMs > 0
      ? {
          developerMs: totals.developerMs,
          reviewerMs: totals.reviewerMs,
          humanRulings: totals.humanRulings,
          recoveredTickets: log?.tasks.filter((task) => task.recovered).length ?? 0,
        }
      : undefined;

  return {
    milestone: {
      title: MILESTONE_TITLE,
      ticketsMerged: totals.tasksMerged,
      ticketsTotal: github.tasks.length,
    },
    headline: {
      medianTicketMs: totals.medianTaskMs,
      secondRoundTickets,
      reviewedTickets,
      findings,
      findingsTotal: SEVERITIES.reduce((sum, severity) => sum + findings[severity], 0),
      typicalFiles: totals.typicalSize.filesChanged,
      typicalLines:
        totals.typicalSize.insertions !== undefined && totals.typicalSize.deletions !== undefined
          ? totals.typicalSize.insertions + totals.typicalSize.deletions
          : undefined,
      tokensIn: totals.tokens.developerIn + totals.tokens.reviewerIn,
      tokensOut: totals.tokens.developerOut + totals.tokens.reviewerOut,
    },
    timeSplit,
    guardrails: log?.guardrails,
    workingNow,
    tickets,
  };
}

/** One ticket's round-by-round timeline, degraded: everything the Vinaya log alone can say about an issue, with no title, status, size or verdict — those are GitHub's alone. */
export type DegradedTicket = {
  readonly issue: number;
  readonly timeline: readonly RoundTimelineEntry[];
  readonly running: boolean;
};

/** The whole page, degraded to what the Vinaya log alone can show — for when GitHub has failed but the log hasn't. No milestone progress, ticket titles, status, size, verdicts or tokens: those are GitHub's alone. */
export type DegradedLogView = {
  readonly guardrails: GuardrailTotals;
  readonly timeSplit?: { readonly developerMs: number; readonly reviewerMs: number };
  readonly tickets: readonly DegradedTicket[];
};

/**
 * Builds a `/logs` view from the Vinaya log alone, for when GitHub has failed. The log's own
 * round record already carries developer/reviewer time, outcome, confidence, findings and size
 * per round — everything `RoundTimeline` needs — so a GitHub outage still shows the loop working,
 * just without the ticket titles, status, pull request or tokens only GitHub knows.
 */
export function buildDegradedLogView(log: LogDevelopmentRecord): DegradedLogView {
  const tickets: DegradedTicket[] = log.tasks
    .filter((task) => task.rounds.length > 0 || task.running)
    .map((task) => ({ issue: task.issue, timeline: buildTimeline(task.rounds), running: task.running }))
    .sort((a, b) => a.issue - b.issue);

  let developerMs = 0;
  let reviewerMs = 0;
  for (const task of log.tasks) {
    for (const round of task.rounds) {
      developerMs += round.developerMs ?? 0;
      reviewerMs += round.reviewerMs ?? 0;
    }
  }

  return {
    guardrails: log.guardrails,
    timeSplit: developerMs + reviewerMs > 0 ? { developerMs, reviewerMs } : undefined,
    tickets,
  };
}
