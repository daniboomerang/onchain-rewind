import { describe, expect, it } from "vitest";
import { buildDevLogView } from "#/engine/dev-log-view.ts";
import type { RoundRecord as LogRoundRecord, TaskRecord as LogTaskRecord } from "#/engine/dev-record.ts";
import type { DevelopmentRecord as GithubDevelopmentRecord, TaskDevRecord } from "#/engine/github-dev-record.ts";

function task(overrides: Partial<TaskDevRecord> = {}): TaskDevRecord {
  return {
    issue: 22,
    title: "A ticket",
    status: "merged",
    rounds: [],
    developerTokens: [],
    reviewerTokens: [],
    humanRulings: [],
    ...overrides,
  };
}

function logTask(overrides: Partial<LogTaskRecord> = {}): LogTaskRecord {
  return { issue: 22, rounds: [], resumed: false, paused: false, recovered: false, running: false, ...overrides };
}

function logRound(overrides: Partial<LogRoundRecord> = {}): LogRoundRecord {
  return { round: 1, findings: [], ...overrides };
}

function github(tasks: readonly TaskDevRecord[]): GithubDevelopmentRecord {
  return {
    tasks,
    totals: {
      tasksMerged: tasks.filter((t) => t.status === "merged").length,
      developerMs: 0,
      reviewerMs: 0,
      secondRoundTasks: 0,
      findings: { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 },
      tokens: { developerIn: 0, developerOut: 0, reviewerIn: 0, reviewerOut: 0 },
      typicalSize: {},
      humanRulings: 0,
    },
  };
}

describe("buildDevLogView", () => {
  it("uses GitHub's ticket list for the milestone's progress", () => {
    const view = buildDevLogView(github([task({ status: "merged" }), task({ issue: 23, status: "planned" })]));
    expect(view.milestone.ticketsTotal).toBe(2);
    expect(view.milestone.ticketsMerged).toBe(1);
  });

  it("has no timeline when the Vinaya log never saw a ticket", () => {
    const view = buildDevLogView(github([task()]));
    expect(view.tickets[0]?.timeline).toEqual([]);
    expect(view.tickets[0]?.running).toBe(false);
  });

  it("marks a round that appears twice in the log's own record as a repeat", () => {
    const view = buildDevLogView(github([task()]), {
      tasks: [logTask({ rounds: [logRound({ round: 1 }), logRound({ round: 2 }), logRound({ round: 1 })] })],
      guardrails: { checks: 0, runs: 0, stopped: 0 },
    });
    const timeline = view.tickets[0]?.timeline ?? [];
    expect(timeline.map((r) => r.repeat)).toEqual([false, false, true]);
  });

  it("sums a round's findings by severity from the log's raw finding list", () => {
    const view = buildDevLogView(github([task()]), {
      tasks: [
        logTask({
          rounds: [
            logRound({
              findings: [
                { id: "f1", severity: "major", severityScale: "code", policyTreatment: "block" },
                { id: "f2", severity: "major", severityScale: "code", policyTreatment: "advisory" },
                { id: "f3", severity: "minor", severityScale: "code", policyTreatment: "advisory" },
              ],
            }),
          ],
        }),
      ],
      guardrails: { checks: 0, runs: 0, stopped: 0 },
    });
    expect(view.tickets[0]?.timeline[0]?.findings).toEqual({
      blocker: 0,
      major: 2,
      minor: 1,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    });
  });

  it("reports a running ticket as the developer's or the reviewers', by status", () => {
    const view = buildDevLogView(
      github([task({ issue: 1, status: "being_built" }), task({ issue: 2, status: "in_review" })]),
      {
        tasks: [logTask({ issue: 1, running: true }), logTask({ issue: 2, running: true })],
        guardrails: { checks: 0, runs: 0, stopped: 0 },
      },
    );
    expect(view.workingNow).toEqual([
      { issue: 1, title: "A ticket", role: "developer" },
      { issue: 2, title: "A ticket", role: "reviewers" },
    ]);
  });

  it("never reports a merged or planned ticket as working now, even if the log still marks it running", () => {
    const view = buildDevLogView(github([task({ status: "merged" })]), {
      tasks: [logTask({ running: true })],
      guardrails: { checks: 0, runs: 0, stopped: 0 },
    });
    expect(view.workingNow).toEqual([]);
  });

  it("leaves the time split out when no round has recorded time", () => {
    const view = buildDevLogView(github([task()]));
    expect(view.timeSplit).toBeUndefined();
  });

  it("sums a ticket's developer and reviewer token rows", () => {
    const view = buildDevLogView(
      github([
        task({
          developerTokens: [{ phase: "build", role: "developer", model: "x", tokensIn: 100, tokensOut: 20 }],
          reviewerTokens: [{ phase: "review", role: "reviewer", agent: "x", tokensIn: 50, tokensOut: 5 }],
        }),
      ]),
    );
    expect(view.tickets[0]?.tokensIn).toBe(150);
    expect(view.tickets[0]?.tokensOut).toBe(25);
  });
});
