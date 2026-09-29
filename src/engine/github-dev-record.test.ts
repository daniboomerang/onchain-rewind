import { describe, expect, it } from "vitest";
import type { TaskRecord as LogTaskRecord } from "#/engine/dev-record.ts";
import {
  buildDevelopmentRecord,
  computeMilestoneTotals,
  foldGithubTasks,
  mergeRoundRecords,
  type RawGithubComment,
  type RawGithubCommit,
  type RawGithubIssue,
  type RawGithubPull,
  type TaskDevRecord,
} from "#/engine/github-dev-record.ts";

function taskIssue(number: number, overrides: Partial<RawGithubIssue> = {}): RawGithubIssue {
  return {
    number,
    title: `[rewind-v1] ${number} — a task`,
    state: "open",
    body: null,
    labels: ["vinaya/tier:1", "vinaya/tranche:rewind-v1"],
    author_association: "OWNER",
    ...overrides,
  };
}

function pullIssue(number: number, closes: number, overrides: Partial<RawGithubIssue> = {}): RawGithubIssue {
  return {
    number,
    title: `[rewind-v1] ${closes} — a task`,
    state: "closed",
    body: `Closes #${closes}\n\nSome body.`,
    labels: [],
    pull_request: { url: "https://api.github.com/…" },
    author_association: "OWNER",
    ...overrides,
  };
}

function pullDetail(number: number, overrides: Partial<RawGithubPull> = {}): RawGithubPull {
  return {
    number,
    html_url: `https://github.com/daniboomerang/onchain-rewind/pull/${number}`,
    state: "closed",
    merged: true,
    changed_files: 3,
    additions: 40,
    deletions: 5,
    ...overrides,
  };
}

function commit(date: string): RawGithubCommit {
  return { commit: { author: { date } } };
}

function reviewComment(
  prNumber: number,
  createdAt: string,
  round: number,
  overrides: Partial<Record<string, string>> = {},
  authorAssociation = "OWNER",
) {
  const cells = {
    blocker: "0",
    major: "0",
    minor: "0",
    critical: "0",
    high: "0",
    medium: "0",
    low: "0",
    confidence: "0.9",
    outcome: "green",
    ...overrides,
  };
  const body = [
    "| round | blocker | major | minor | critical | high | medium | low | confidence | outcome |",
    "|---|---|---|---|---|---|---|---|---|---|",
    `| ${round} | ${cells.blocker} | ${cells.major} | ${cells.minor} | ${cells.critical} | ${cells.high} | ${cells.medium} | ${cells.low} | ${cells.confidence} | ${cells.outcome} |`,
  ].join("\n");
  return comment(prNumber, createdAt, body, authorAssociation);
}

function verdictComment(
  prNumber: number,
  createdAt: string,
  result: "APPROVE" | "PASS",
  phase: string,
  tokensIn: number,
  tokensOut: number,
  authorAssociation = "OWNER",
) {
  const body = `VERDICT: ${result}\n\nLooks good.\n\nTokens: 1: ${phase} — Reviewer — claude-sonnet-5 — ${tokensIn}/${tokensOut}/—`;
  return comment(prNumber, createdAt, body, authorAssociation);
}

function rulingComment(
  prNumber: number,
  createdAt: string,
  body = "Ruling: overturn the blocker, ship it.",
  authorAssociation = "OWNER",
) {
  return comment(prNumber, createdAt, body, authorAssociation);
}

function comment(prNumber: number, createdAt: string, body: string, authorAssociation = "OWNER"): RawGithubComment {
  return {
    body,
    created_at: createdAt,
    issue_url: `https://api.github.com/repos/daniboomerang/onchain-rewind/issues/${prNumber}`,
    author_association: authorAssociation,
  };
}

function devTokensBody(closes: number): string {
  return [
    `Closes #${closes}`,
    "",
    "<!-- AEG:TOKENS:START -->",
    "| phase | role | model | in | out | cost | date |",
    "|---|---|---|---|---|---|---|",
    "| build | Developer | claude-sonnet-5 | 120000 | 8000 | $1.20 | 2026-09-28 |",
    "<!-- AEG:TOKENS:END -->",
  ].join("\n");
}

describe("foldGithubTasks — status", () => {
  it("is planned when no pull request closes the task", () => {
    const [task] = foldGithubTasks([taskIssue(35)], [], new Map(), new Map());
    expect(task?.status).toBe("planned");
    expect(task?.pullRequest).toBeUndefined();
  });

  it("is being_built when the pull request is open with no review activity yet", () => {
    const issues = [taskIssue(35), pullIssue(50, 35, { state: "open" })];
    const [task] = foldGithubTasks(
      issues,
      [],
      new Map([[50, pullDetail(50, { state: "open", merged: false })]]),
      new Map(),
    );
    expect(task?.status).toBe("being_built");
  });

  it("is in_review once a reviewer summary table or verdict has landed on an open pull request", () => {
    const issues = [taskIssue(35), pullIssue(50, 35, { state: "open" })];
    const comments = [reviewComment(50, "2026-09-28T10:00:00Z", 1)];
    const [task] = foldGithubTasks(
      issues,
      comments,
      new Map([[50, pullDetail(50, { state: "open", merged: false })]]),
      new Map(),
    );
    expect(task?.status).toBe("in_review");
  });

  it("is merged once the pull request is closed and merged", () => {
    const issues = [taskIssue(35), pullIssue(50, 35)];
    const [task] = foldGithubTasks(issues, [], new Map([[50, pullDetail(50)]]), new Map());
    expect(task?.status).toBe("merged");
    expect(task?.pullRequest).toEqual({
      number: 50,
      url: "https://github.com/daniboomerang/onchain-rewind/pull/50",
      merged: true,
      filesChanged: 3,
      insertions: 40,
      deletions: 5,
      firstCommitAt: undefined,
    });
  });
});

describe("foldGithubTasks — rounds, verdicts, tokens and rulings", () => {
  const issues = [taskIssue(35), pullIssue(50, 35, { body: devTokensBody(35) })];
  const pullDetails = new Map([[50, pullDetail(50)]]);
  const firstCommits = new Map([[50, commit("2026-09-28T09:00:00Z")]]);

  it("parses a reviewer summary table into findings by severity", () => {
    const comments = [reviewComment(50, "2026-09-28T10:00:00Z", 1, { blocker: "1", minor: "2", high: "1" })];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.rounds).toEqual([
      {
        round: 1,
        findings: { blocker: 1, major: 0, minor: 2, critical: 0, high: 1, medium: 0, low: 0 },
        confidence: 0.9,
        outcome: "green",
      },
    ]);
  });

  it("lets a later table for the same round override an earlier one", () => {
    const comments = [
      reviewComment(50, "2026-09-28T10:00:00Z", 1, { blocker: "1", outcome: "changes_requested" }),
      reviewComment(50, "2026-09-28T11:00:00Z", 1, { blocker: "0", outcome: "green" }),
    ];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.rounds).toHaveLength(1);
    expect(task?.rounds[0]?.findings.blocker).toBe(0);
    expect(task?.rounds[0]?.outcome).toBe("green");
  });

  it("splits a code verdict from a security verdict and reads each one's tokens", () => {
    const comments = [
      verdictComment(50, "2026-09-28T12:00:00Z", "APPROVE", "review", 90_000, 4_000),
      verdictComment(50, "2026-09-28T12:05:00Z", "PASS", "security", 85_000, 3_500),
    ];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.codeVerdict).toEqual({
      result: "approve",
      tokens: { phase: "review", role: "Reviewer", agent: "claude-sonnet-5", tokensIn: 90_000, tokensOut: 4_000 },
    });
    expect(task?.securityVerdict).toEqual({
      result: "pass",
      tokens: { phase: "security", role: "Reviewer", agent: "claude-sonnet-5", tokensIn: 85_000, tokensOut: 3_500 },
    });
    expect(task?.reviewerTokens).toHaveLength(2);
  });

  it("treats a SECRETS: marker as a security verdict even without a security phase token line", () => {
    const body = "VERDICT: PASS\n\nSECRETS: none found.\n\nTokens: 1: security — Reviewer — claude-sonnet-5 — 1/2/—";
    const [task] = foldGithubTasks(issues, [comment(50, "2026-09-28T12:00:00Z", body)], pullDetails, firstCommits);
    expect(task?.securityVerdict?.result).toBe("pass");
    expect(task?.codeVerdict).toBeUndefined();
  });

  it("reads the developer's token rows from the pull request body's AEG:TOKENS block", () => {
    const [task] = foldGithubTasks(issues, [], pullDetails, firstCommits);
    expect(task?.developerTokens).toEqual([
      {
        phase: "build",
        role: "Developer",
        model: "claude-sonnet-5",
        tokensIn: 120_000,
        tokensOut: 8_000,
        cost: "$1.20",
        date: "2026-09-28",
      },
    ]);
  });

  it("collects comments starting Ruling as human rulings", () => {
    const comments = [rulingComment(50, "2026-09-28T13:00:00Z")];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.humanRulings).toEqual(["Ruling: overturn the blocker, ship it."]);
  });

  it("also collects a ruling posted with the aeg:principal:ruling marker instead of the word Ruling", () => {
    const body = "<!-- aeg:principal:ruling:52-1 -->\nRuling — four defects to fix.";
    const comments = [comment(50, "2026-09-28T13:00:00Z", body)];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.humanRulings).toEqual([body]);
  });

  it("also collects a ruling posted on the task Issue itself, not just on its pull request", () => {
    const comments = [comment(35, "2026-09-28T13:00:00Z", "Ruling: fix these before merge.")];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.humanRulings).toEqual(["Ruling: fix these before merge."]);
  });

  it("counts a ruling on the pull request and a ruling on the Issue as two, not one", () => {
    const comments = [
      rulingComment(50, "2026-09-28T13:00:00Z", "Ruling: on the pull request."),
      comment(35, "2026-09-28T13:05:00Z", "Ruling: on the issue."),
    ];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.humanRulings).toHaveLength(2);
  });

  it("counts a ruling posted on a task Issue that has no pull request yet", () => {
    const comments = [comment(35, "2026-09-28T13:00:00Z", "Ruling: reconsider before opening a pull request.")];
    const [task] = foldGithubTasks([taskIssue(35)], comments, new Map(), new Map());
    expect(task?.status).toBe("planned");
    expect(task?.humanRulings).toEqual(["Ruling: reconsider before opening a pull request."]);
  });

  it("times a task with no round record from the first commit to the last verdict", () => {
    const comments = [verdictComment(50, "2026-09-28T12:00:00Z", "APPROVE", "review", 1, 1)];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.timeMs).toBe(Date.parse("2026-09-28T12:00:00Z") - Date.parse("2026-09-28T09:00:00Z"));
  });
});

describe("foldGithubTasks — untrusted comments are never treated as review artifacts", () => {
  const issues = [taskIssue(35), pullIssue(50, 35)];
  const pullDetails = new Map([[50, pullDetail(50)]]);
  const firstCommits = new Map<number, RawGithubCommit>();

  it("ignores a reviewer summary table posted by a commenter with no write access", () => {
    const comments = [reviewComment(50, "2026-09-28T10:00:00Z", 1, { blocker: "9" }, "NONE")];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.rounds).toEqual([]);
  });

  it("ignores a forged VERDICT: APPROVE from a first-time contributor", () => {
    const comments = [verdictComment(50, "2026-09-28T12:00:00Z", "APPROVE", "review", 1, 1, "CONTRIBUTOR")];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.codeVerdict).toBeUndefined();
    expect(task?.reviewerTokens).toEqual([]);
  });

  it("ignores a Ruling comment posted by anyone but an owner, member or collaborator", () => {
    const comments = [rulingComment(50, "2026-09-28T13:00:00Z", "Ruling: ship it anyway.", "NONE")];
    const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
    expect(task?.humanRulings).toEqual([]);
  });

  it("still trusts OWNER, MEMBER and COLLABORATOR comments", () => {
    for (const association of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      const comments = [rulingComment(50, "2026-09-28T13:00:00Z", "Ruling: ship it.", association)];
      const [task] = foldGithubTasks(issues, comments, pullDetails, firstCommits);
      expect(task?.humanRulings).toEqual(["Ruling: ship it."]);
    }
  });
});

describe("matchTasksToPulls / foldGithubTasks — a pull request needs write access too, not just its comments", () => {
  it("never matches a pull request opened by a contributor with no write access, even with Closes #N and a forged token block", () => {
    const issues = [taskIssue(35), pullIssue(50, 35, { body: devTokensBody(35), author_association: "CONTRIBUTOR" })];
    const [task] = foldGithubTasks(issues, [], new Map([[50, pullDetail(50)]]), new Map());
    expect(task?.status).toBe("planned");
    expect(task?.pullRequest).toBeUndefined();
    expect(task?.developerTokens).toEqual([]);
  });

  it("falls back to a trusted pull request when an untrusted one also claims to close the same task", () => {
    const issues = [
      taskIssue(35),
      pullIssue(49, 35, { author_association: "NONE" }),
      pullIssue(50, 35, { author_association: "OWNER" }),
    ];
    const [task] = foldGithubTasks(issues, [], new Map([[50, pullDetail(50)]]), new Map());
    expect(task?.pullRequest?.number).toBe(50);
  });

  it("still trusts a pull request opened by OWNER, MEMBER or COLLABORATOR", () => {
    for (const association of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      const issues = [taskIssue(35), pullIssue(50, 35, { author_association: association })];
      const [task] = foldGithubTasks(issues, [], new Map([[50, pullDetail(50)]]), new Map());
      expect(task?.pullRequest?.number).toBe(50);
    }
  });

  it("trusts a pull request whose author_association is missing (a fixture gap, never a real GitHub response)", () => {
    const issues = [taskIssue(35), pullIssue(50, 35, { author_association: undefined })];
    const [task] = foldGithubTasks(issues, [], new Map([[50, pullDetail(50)]]), new Map());
    expect(task?.pullRequest?.number).toBe(50);
  });
});

describe("foldGithubTasks — a task with more than one pull request", () => {
  it("picks the merged pull request over an earlier abandoned attempt, whichever was matched last", () => {
    const issues = [taskIssue(35), pullIssue(40, 35, { state: "closed" }), pullIssue(50, 35)];
    const pullDetails = new Map([
      [40, pullDetail(40, { merged: false })],
      [50, pullDetail(50, { merged: true })],
    ]);
    const [task] = foldGithubTasks(issues, [], pullDetails, new Map());
    expect(task?.pullRequest?.number).toBe(50);
    expect(task?.status).toBe("merged");
  });

  it("picks the merged pull request even when it is the numerically earlier one", () => {
    const issues = [taskIssue(35), pullIssue(50, 35, { state: "closed" }), pullIssue(40, 35)];
    const pullDetails = new Map([
      [50, pullDetail(50, { merged: false })],
      [40, pullDetail(40, { merged: true })],
    ]);
    const [task] = foldGithubTasks(issues, [], pullDetails, new Map());
    expect(task?.pullRequest?.number).toBe(40);
  });

  it("falls back to the most recent still-open attempt when none is merged yet", () => {
    const issues = [taskIssue(35), pullIssue(40, 35, { state: "closed" }), pullIssue(50, 35, { state: "open" })];
    const pullDetails = new Map([
      [40, pullDetail(40, { merged: false })],
      [50, pullDetail(50, { state: "open", merged: false })],
    ]);
    const [task] = foldGithubTasks(issues, [], pullDetails, new Map());
    expect(task?.pullRequest?.number).toBe(50);
  });
});

describe("mergeRoundRecords", () => {
  const githubTask: TaskDevRecord = {
    issue: 35,
    title: "a task",
    status: "merged",
    pullRequest: { number: 50, url: "…", merged: true, filesChanged: 3, insertions: 40, deletions: 5 },
    rounds: [{ round: 1, findings: { blocker: 1, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 } }],
    developerTokens: [],
    reviewerTokens: [],
    humanRulings: [],
    timeMs: 999_999,
  };

  function logRound(
    round: number,
    developerMs: number,
    reviewerMs: number,
    severity: string,
  ): LogTaskRecord["rounds"][number] {
    return {
      round,
      developerMs,
      reviewerMs,
      outcome: "green",
      findings: [{ id: "f1", severity, severityScale: "code", policyTreatment: "block" }],
    };
  }

  it("replaces the GitHub-estimated time with the round record's when one exists, keeping the table's findings", () => {
    const logTasks: LogTaskRecord[] = [
      {
        issue: 35,
        rounds: [logRound(1, 300_000, 600_000, "blocker")],
        resumed: false,
        paused: false,
        recovered: false,
        running: false,
      },
    ];
    const [merged] = mergeRoundRecords([githubTask], logTasks);
    expect(merged?.rounds).toHaveLength(1);
    expect(merged?.rounds[0]?.findings.blocker).toBe(1);
    expect(merged?.developerMs).toBe(300_000);
    expect(merged?.reviewerMs).toBe(600_000);
    expect(merged?.timeMs).toBe(900_000);
  });

  it("counts a round reviewed again after a human ruling once toward the task's rounds, summing its time", () => {
    const logTasks: LogTaskRecord[] = [
      {
        issue: 35,
        rounds: [logRound(1, 300_000, 600_000, "blocker"), logRound(1, 120_000, 240_000, "minor")],
        resumed: false,
        paused: false,
        recovered: false,
        running: false,
      },
    ];
    const [merged] = mergeRoundRecords([githubTask], logTasks);
    expect(merged?.rounds).toHaveLength(1);
    // Findings still come from the GitHub table's round 1 row, unaffected by which log occurrence is last.
    expect(merged?.rounds[0]?.findings.blocker).toBe(1);
    expect(merged?.rounds[0]?.findings.minor).toBe(0);
    // Time reflects both sessions actually spent.
    expect(merged?.developerMs).toBe(420_000);
    expect(merged?.reviewerMs).toBe(840_000);
  });

  it("keeps the GitHub-derived rounds and timing when the log has no record for the task", () => {
    const [merged] = mergeRoundRecords([githubTask], []);
    expect(merged).toEqual(githubTask);
  });

  it("takes severity counts from the GitHub table, not the log's own unmapped findings, for a matching round (O6)", () => {
    // The log's own severity scale doesn't map onto this app's seven severities, so its reduced
    // findings would all read 0 if trusted directly — the exact bug this fold must avoid.
    const tableRound: TaskDevRecord = {
      ...githubTask,
      rounds: [
        {
          round: 1,
          findings: { blocker: 0, major: 2, minor: 6, critical: 0, high: 0, medium: 0, low: 1 },
          confidence: undefined,
          outcome: "changes_requested",
        },
      ],
    };
    const logTasks: LogTaskRecord[] = [
      {
        issue: 35,
        rounds: [logRound(1, 300_000, 600_000, "unscaled-p1")],
        resumed: false,
        paused: false,
        recovered: false,
        running: false,
      },
    ];
    const [merged] = mergeRoundRecords([tableRound], logTasks);
    expect(merged?.rounds).toEqual([
      {
        round: 1,
        findings: { blocker: 0, major: 2, minor: 6, critical: 0, high: 0, medium: 0, low: 1 },
        confidence: undefined,
        outcome: "changes_requested",
      },
    ]);
    expect(merged?.developerMs).toBe(300_000);
    expect(merged?.reviewerMs).toBe(600_000);
  });

  it("keeps the log's own findings for a round the GitHub table never saw (the GitHub-unreachable path)", () => {
    const noTableTask: TaskDevRecord = { ...githubTask, rounds: [] };
    const logTasks: LogTaskRecord[] = [
      {
        issue: 35,
        rounds: [logRound(1, 300_000, 600_000, "blocker")],
        resumed: false,
        paused: false,
        recovered: false,
        running: false,
      },
    ];
    const [merged] = mergeRoundRecords([noTableTask], logTasks);
    expect(merged?.rounds[0]?.findings.blocker).toBe(1);
  });
});

describe("computeMilestoneTotals", () => {
  function task(overrides: Partial<TaskDevRecord>): TaskDevRecord {
    return {
      issue: 1,
      title: "t",
      status: "merged",
      rounds: [],
      developerTokens: [],
      reviewerTokens: [],
      humanRulings: [],
      ...overrides,
    };
  }

  it("totals tasks merged, findings by severity, tokens, human rulings and second-round tasks", () => {
    const tasks: TaskDevRecord[] = [
      task({
        issue: 1,
        status: "merged",
        timeMs: 1_000,
        rounds: [
          { round: 1, findings: { blocker: 1, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 } },
          { round: 2, findings: { blocker: 0, major: 1, minor: 0, critical: 0, high: 0, medium: 0, low: 0 } },
        ],
        developerTokens: [{ phase: "build", role: "Developer", model: "m", tokensIn: 100, tokensOut: 10 }],
        reviewerTokens: [{ phase: "review", role: "Reviewer", agent: "a", tokensIn: 50, tokensOut: 5 }],
        humanRulings: ["Ruling: …"],
        pullRequest: { number: 1, url: "…", merged: true, filesChanged: 2, insertions: 10, deletions: 1 },
      }),
      task({
        issue: 2,
        status: "merged",
        timeMs: 3_000,
        rounds: [{ round: 1, findings: { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 } }],
        pullRequest: { number: 2, url: "…", merged: true, filesChanged: 4, insertions: 30, deletions: 3 },
      }),
      task({ issue: 3, status: "planned" }),
    ];

    const totals = computeMilestoneTotals(tasks);

    expect(totals.tasksMerged).toBe(2);
    expect(totals.medianTaskMs).toBe(2_000);
    expect(totals.secondRoundTasks).toBe(1);
    expect(totals.findings.blocker).toBe(1);
    expect(totals.findings.major).toBe(1);
    expect(totals.tokens).toEqual({ developerIn: 100, developerOut: 10, reviewerIn: 50, reviewerOut: 5 });
    expect(totals.humanRulings).toBe(1);
    expect(totals.typicalSize).toEqual({ filesChanged: 3, insertions: 20, deletions: 2 });
  });

  it("totals an empty milestone without dividing by zero", () => {
    expect(computeMilestoneTotals([])).toEqual({
      tasksMerged: 0,
      medianTaskMs: undefined,
      developerMs: 0,
      reviewerMs: 0,
      secondRoundTasks: 0,
      findings: { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 },
      tokens: { developerIn: 0, developerOut: 0, reviewerIn: 0, reviewerOut: 0 },
      typicalSize: { filesChanged: undefined, insertions: undefined, deletions: undefined },
      humanRulings: 0,
    });
  });
});

describe("buildDevelopmentRecord", () => {
  it("folds GitHub, merges the round record and totals the milestone in one call", () => {
    const issues = [taskIssue(35), pullIssue(50, 35)];
    const pullDetails = new Map([[50, pullDetail(50)]]);
    const record = buildDevelopmentRecord(issues, [], pullDetails, new Map(), []);
    expect(record.tasks).toHaveLength(1);
    expect(record.totals.tasksMerged).toBe(1);
  });
});
