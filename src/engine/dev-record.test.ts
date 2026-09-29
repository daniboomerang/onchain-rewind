import { describe, expect, it } from "vitest";
import { foldGuardrailTotals, foldTaskRecords, type RawLogEnvelope } from "#/engine/dev-record.ts";

type EventOverrides = Record<string, unknown> & { readonly role?: string };

function ev(seq: number, ts: string, issue: number, kind: string, name: string, fields: EventOverrides = {}) {
  const { role, ...rest } = fields;
  const subject: Record<string, unknown> = { issue };
  if (role !== undefined) subject.role = role;
  return {
    seq,
    status: "ok",
    event: { meta: { ts, run_id: "run-1", host: "host-a" }, subject, kind, event: name, ...rest },
  } as RawLogEnvelope;
}

function gate(seq: number, ts: string, check: string, outcome: "pass" | "fail") {
  return {
    seq,
    status: "ok",
    event: {
      meta: { ts, run_id: "run-1", host: "host-a" },
      subject: {},
      kind: "gate",
      event: "check_run",
      check,
      outcome,
    },
  } as RawLogEnvelope;
}

describe("foldTaskRecords — round records", () => {
  it("reads developer time, reviewer time, outcome, size, confidence and findings for a normal round", () => {
    const envelopes: RawLogEnvelope[] = [
      ev(1, "2026-09-01T09:54:00Z", 20, "dispatch", "dispatched", {
        role: "developer",
        effect_id: "eff-dev-1",
        round: 1,
      }),
      ev(2, "2026-09-01T09:59:00Z", 20, "role_attempt", "role_attempt", {
        role: "developer",
        effect_id: "eff-dev-1",
        duration_ms: 300_000,
      }),
      ev(3, "2026-09-01T09:59:01Z", 20, "dispatch", "outcome_received", { effect_id: "eff-dev-1" }),
      ev(4, "2026-09-01T10:00:00Z", 20, "dev_review_loop", "loop_started"),
      ev(5, "2026-09-01T10:00:01Z", 20, "dev_review_loop", "round_started", { round: 1 }),
      ev(6, "2026-09-01T10:00:02Z", 20, "dev_review_loop", "gate_result_read", {
        green: true,
        confidence_value: 82,
        confidence_reason: "no findings",
      }),
      ev(7, "2026-09-01T10:00:03Z", 20, "dispatch", "dispatched", { role: "reviewer", effect_id: "eff-rev-1" }),
      ev(8, "2026-09-01T10:03:03Z", 20, "dev_review_loop", "round_ended", {
        round: 1,
        outcome: "green",
        wall_ms: 300_000,
        files_changed: 3,
        insertions: 40,
        deletions: 5,
      }),
      ev(9, "2026-09-01T10:03:04Z", 20, "dispatch", "outcome_received", { effect_id: "eff-rev-1" }),
      ev(10, "2026-09-01T10:03:05Z", 20, "dev_review_loop", "verdicts_read", { findings: [], blockers: 0 }),
      ev(11, "2026-09-01T10:03:06Z", 20, "dev_review_loop", "journal_finalized"),
    ];

    const tasks = foldTaskRecords(envelopes);

    expect(tasks).toHaveLength(1);
    const task = tasks[0];
    expect(task).toBeDefined();
    if (!task) return;
    expect(task.issue).toBe(20);
    expect(task.resumed).toBe(false);
    expect(task.paused).toBe(false);
    expect(task.recovered).toBe(false);
    expect(task.running).toBe(false);
    expect(task.rounds).toHaveLength(1);

    const round = task.rounds[0];
    expect(round).toBeDefined();
    if (!round) return;
    expect(round.round).toBe(1);
    expect(round.developerMs).toBe(300_000);
    expect(round.reviewerMs).toBe(180_000);
    expect(round.outcome).toBe("green");
    expect(round.filesChanged).toBe(3);
    expect(round.insertions).toBe(40);
    expect(round.deletions).toBe(5);
    expect(round.confidence).toEqual({ value: 82, reason: "no findings" });
    expect(round.findings).toEqual([]);
    expect(round.blockers).toBe(0);
  });

  it("attaches developer time to the round its dispatch named, not the round open when the attempt ends", () => {
    // Real event order: a developer's dispatch (carrying `round`) and its role_attempt both land
    // before that round's own `round_started` — and a round can already be closed by the time the
    // *next* round's developer attempt ends, so neither "whichever round is open" nor "the previous
    // round" is the right answer. Only the dispatch's own `round`, threaded through `effect_id`, is.
    const envelopes: RawLogEnvelope[] = [
      ev(1, "2026-09-01T09:54:00Z", 33, "dispatch", "dispatched", {
        role: "developer",
        effect_id: "eff-d1",
        round: 1,
      }),
      ev(2, "2026-09-01T09:59:00Z", 33, "role_attempt", "role_attempt", {
        role: "developer",
        effect_id: "eff-d1",
        duration_ms: 300_000,
      }),
      ev(3, "2026-09-01T09:59:01Z", 33, "dispatch", "outcome_received", { effect_id: "eff-d1" }),
      ev(4, "2026-09-01T10:00:00Z", 33, "dev_review_loop", "loop_started"),
      ev(5, "2026-09-01T10:00:01Z", 33, "dev_review_loop", "round_started", { round: 1 }),
      ev(6, "2026-09-01T10:00:02Z", 33, "dev_review_loop", "gate_result_read", { green: true }),
      ev(7, "2026-09-01T10:00:03Z", 33, "dispatch", "dispatched", { role: "reviewer", effect_id: "eff-r1" }),
      ev(8, "2026-09-01T10:05:03Z", 33, "dev_review_loop", "round_ended", { round: 1, outcome: "green" }),
      ev(9, "2026-09-01T10:05:04Z", 33, "dispatch", "outcome_received", { effect_id: "eff-r1" }),
      ev(10, "2026-09-01T10:06:00Z", 33, "dispatch", "dispatched", {
        role: "developer",
        effect_id: "eff-d2",
        round: 2,
      }),
      ev(11, "2026-09-01T10:08:00Z", 33, "role_attempt", "role_attempt", {
        role: "developer",
        effect_id: "eff-d2",
        duration_ms: 120_000,
      }),
      ev(12, "2026-09-01T10:08:01Z", 33, "dispatch", "outcome_received", { effect_id: "eff-d2" }),
      ev(13, "2026-09-01T10:08:02Z", 33, "dev_review_loop", "round_started", { round: 2 }),
      ev(14, "2026-09-01T10:10:00Z", 33, "dev_review_loop", "round_ended", { round: 2, outcome: "green" }),
    ];

    const task = foldTaskRecords(envelopes)[0];
    expect(task?.rounds).toHaveLength(2);
    expect(task?.rounds[0]?.developerMs).toBe(300_000);
    expect(task?.rounds[1]?.developerMs).toBe(120_000);
  });

  it("leaves confidence undefined when the round reports confidence_unavailable", () => {
    const envelopes: RawLogEnvelope[] = [
      ev(1, "2026-09-01T10:00:00Z", 21, "dev_review_loop", "round_started", { round: 1 }),
      ev(2, "2026-09-01T10:01:00Z", 21, "dev_review_loop", "gate_result_read", {
        green: true,
        confidence_unavailable: true,
      }),
      ev(3, "2026-09-01T10:02:00Z", 21, "dev_review_loop", "round_ended", { round: 1, outcome: "green" }),
    ];

    const tasks = foldTaskRecords(envelopes);
    expect(tasks[0]?.rounds[0]?.confidence).toBeUndefined();
  });

  it("carries findings from verdicts_read, and never exposes findings_compared.resolved", () => {
    const envelopes: RawLogEnvelope[] = [
      ev(1, "2026-09-01T10:00:00Z", 22, "dev_review_loop", "round_started", { round: 1 }),
      ev(2, "2026-09-01T10:01:00Z", 22, "dev_review_loop", "verdicts_read", {
        findings: [{ id: "f1", severity: "high", severity_scale: "1-5", policy_treatment: "block" }],
        blockers: 1,
      }),
      ev(3, "2026-09-01T10:02:00Z", 22, "dev_review_loop", "findings_compared", { resolved: 0 }),
      ev(4, "2026-09-01T10:03:00Z", 22, "dev_review_loop", "round_ended", { round: 1, outcome: "changes_requested" }),
    ];

    const round = foldTaskRecords(envelopes)[0]?.rounds[0];
    expect(round?.findings).toEqual([{ id: "f1", severity: "high", severityScale: "1-5", policyTreatment: "block" }]);
    expect(round?.blockers).toBe(1);
    expect(round).not.toHaveProperty("resolved");
  });

  it("orders events by meta.ts rather than seq, since machines can disagree on seq order", () => {
    const envelopes: RawLogEnvelope[] = [
      ev(8, "2026-09-01T09:58:00Z", 23, "dispatch", "dispatched", {
        role: "developer",
        effect_id: "eff-d1",
        round: 1,
      }),
      ev(2, "2026-09-01T09:59:00Z", 23, "role_attempt", "role_attempt", {
        role: "developer",
        effect_id: "eff-d1",
        duration_ms: 60_000,
      }),
      ev(6, "2026-09-01T10:00:00Z", 23, "dev_review_loop", "round_started", { round: 1 }),
      ev(5, "2026-09-01T10:01:00Z", 23, "dev_review_loop", "round_ended", { round: 1, outcome: "green" }),
    ];

    const round = foldTaskRecords(envelopes)[0]?.rounds[0];
    expect(round?.developerMs).toBe(60_000);
    expect(round?.outcome).toBe("green");
  });
});

describe("foldTaskRecords — task-level flags", () => {
  it("marks a task resumed, and keeps both records when a round number repeats", () => {
    const envelopes: RawLogEnvelope[] = [
      ev(1, "2026-09-01T10:00:00Z", 24, "dev_review_loop", "loop_started"),
      ev(2, "2026-09-01T10:01:00Z", 24, "dev_review_loop", "round_started", { round: 1 }),
      ev(3, "2026-09-01T10:02:00Z", 24, "dev_review_loop", "paused", { reason: "human ruling" }),
      ev(4, "2026-09-02T09:00:00Z", 24, "dev_review_loop", "loop_started"),
      ev(5, "2026-09-02T09:01:00Z", 24, "dev_review_loop", "round_started", { round: 1 }),
      ev(6, "2026-09-02T09:05:00Z", 24, "dev_review_loop", "round_ended", { round: 1, outcome: "green" }),
    ];

    const task = foldTaskRecords(envelopes)[0];
    expect(task?.resumed).toBe(true);
    expect(task?.paused).toBe(true);
    expect(task?.rounds).toHaveLength(2);
    expect(task?.rounds.map((r) => r.round)).toEqual([1, 1]);
    expect(task?.rounds[0]?.outcome).toBeUndefined();
    expect(task?.rounds[1]?.outcome).toBe("green");
  });

  it("attributes a resumed round's developer time to its own occurrence, never the earlier one", () => {
    const envelopes: RawLogEnvelope[] = [
      ev(1, "2026-09-01T10:00:00Z", 31, "dispatch", "dispatched", {
        role: "developer",
        effect_id: "eff-d1",
        round: 1,
      }),
      ev(2, "2026-09-01T10:01:00Z", 31, "role_attempt", "role_attempt", {
        role: "developer",
        effect_id: "eff-d1",
        duration_ms: 90_000,
      }),
      ev(3, "2026-09-01T10:02:00Z", 31, "dev_review_loop", "round_started", { round: 1 }),
      ev(4, "2026-09-01T10:03:00Z", 31, "dev_review_loop", "paused", { reason: "human ruling" }),
      ev(5, "2026-09-02T09:00:00Z", 31, "dispatch", "dispatched", {
        role: "developer",
        effect_id: "eff-d2",
        round: 1,
      }),
      ev(6, "2026-09-02T09:01:00Z", 31, "role_attempt", "role_attempt", {
        role: "developer",
        effect_id: "eff-d2",
        duration_ms: 45_000,
      }),
      ev(7, "2026-09-02T09:02:00Z", 31, "dev_review_loop", "round_started", { round: 1 }),
      ev(8, "2026-09-02T09:05:00Z", 31, "dev_review_loop", "round_ended", { round: 1, outcome: "green" }),
    ];

    const task = foldTaskRecords(envelopes)[0];
    expect(task?.rounds).toHaveLength(2);
    expect(task?.rounds[0]?.developerMs).toBe(90_000);
    expect(task?.rounds[1]?.developerMs).toBe(45_000);
  });

  it("marks a task recovered only when infrastructure_retry actually recovered", () => {
    const recovered = foldTaskRecords([
      ev(1, "2026-09-01T10:00:00Z", 25, "dev_review_loop", "infrastructure_retry", { outcome: "recovered" }),
    ]);
    expect(recovered[0]?.recovered).toBe(true);

    const stillFailing = foldTaskRecords([
      ev(1, "2026-09-01T10:00:00Z", 26, "dev_review_loop", "infrastructure_retry", { outcome: "gave_up" }),
    ]);
    expect(stillFailing[0]?.recovered).toBe(false);
  });

  it("marks a task running when a dispatch has no matching outcome_received yet", () => {
    const running = foldTaskRecords([
      ev(1, "2026-09-01T10:00:00Z", 27, "dispatch", "dispatched", { effect_id: "eff-open" }),
    ]);
    expect(running[0]?.running).toBe(true);

    const settled = foldTaskRecords([
      ev(1, "2026-09-01T10:00:00Z", 28, "dispatch", "dispatched", { effect_id: "eff-closed" }),
      ev(2, "2026-09-01T10:05:00Z", 28, "dispatch", "outcome_received", { effect_id: "eff-closed" }),
    ]);
    expect(settled[0]?.running).toBe(false);
  });

  it("resolves a dispatch that ended in dispatch_failed, so it never reads as running", () => {
    const failed = foldTaskRecords([
      ev(1, "2026-09-01T10:00:00Z", 32, "dispatch", "dispatched", { effect_id: "eff-failed" }),
      ev(2, "2026-09-01T10:00:05Z", 32, "dispatch", "dispatch_failed", { effect_id: "eff-failed" }),
    ]);
    expect(failed[0]?.running).toBe(false);
  });
});

describe("foldGuardrailTotals", () => {
  it("counts only gate events, never a loop, dispatch, role_attempt, usage or effect event", () => {
    const envelopes: RawLogEnvelope[] = [
      gate(1, "2026-09-01T10:00:00Z", "Check format", "pass"),
      gate(2, "2026-09-01T10:00:01Z", "Check lint", "fail"),
      gate(3, "2026-09-01T10:00:02Z", "Check format", "pass"),
      ev(4, "2026-09-01T10:00:03Z", 29, "dev_review_loop", "loop_started"),
      ev(5, "2026-09-01T10:00:04Z", 29, "dispatch", "dispatched", { effect_id: "eff-1" }),
      ev(6, "2026-09-01T10:00:05Z", 29, "role_attempt", "role_attempt", { role: "developer", duration_ms: 1000 }),
      ev(7, "2026-09-01T10:00:06Z", 29, "usage", "usage", { tokens: 500 }),
      ev(8, "2026-09-01T10:00:07Z", 29, "effect", "outcome_received", { effect_id: "eff-1" }),
    ];

    expect(foldGuardrailTotals(envelopes)).toEqual({ checks: 2, runs: 3, stopped: 1 });
  });

  it("returns zero totals for a log with no gate events", () => {
    expect(foldGuardrailTotals([ev(1, "2026-09-01T10:00:00Z", 30, "dev_review_loop", "loop_started")])).toEqual({
      checks: 0,
      runs: 0,
      stopped: 0,
    });
  });
});
