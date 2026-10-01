/**
 * Pure fold from the Vinaya log's raw events to this repo's own development record: a
 * round-by-round history per task, plus the guardrail totals. No I/O, no clock — the log's own
 * `meta.ts` timestamps are the only notion of time, and events arrive in any order.
 */

export type LogEventKind = "gate" | "dev_review_loop" | "dispatch" | "role_attempt" | "usage" | "effect";

/** One event as the log stores it. Extra fields the fold doesn't read are never inspected. */
export type RawLogEvent = {
  readonly meta: { readonly ts: string; readonly run_id: string; readonly host: string };
  readonly subject: { readonly issue?: number; readonly role?: string };
  readonly kind: LogEventKind;
  readonly event: string;
} & Record<string, unknown>;

/** One line of the log, as the read endpoint returns it. `payload` is never read (always `{}`). */
export type RawLogEnvelope = {
  readonly seq: number;
  readonly status: string;
  readonly event: RawLogEvent;
};

export type Finding = {
  readonly id: string;
  readonly severity: string;
  readonly severityScale: string;
  readonly policyTreatment: string;
};

export type Confidence = { readonly value: number; readonly reason: string };

export type RoundOutcome = "changes_requested" | "green";

export type RoundRecord = {
  readonly round: number;
  /** Sum of the developer's `role_attempt` durations recorded during this round. */
  readonly developerMs?: number;
  /** The longest reviewer dispatch-to-`round_ended` span recorded during this round. */
  readonly reviewerMs?: number;
  /** Undefined until `round_ended` for this round has been read. */
  readonly outcome?: RoundOutcome;
  readonly filesChanged?: number;
  readonly insertions?: number;
  readonly deletions?: number;
  /** Undefined when the round's `gate_result_read` reported `confidence_unavailable`, or never arrived. */
  readonly confidence?: Confidence;
  readonly findings: readonly Finding[];
  readonly blockers?: number;
  /** The round was recorded under an Issue the task replaced, not under the task's own Issue. */
  readonly replacedIssue?: boolean;
};

export type TaskRecord = {
  readonly issue: number;
  /** Every round record, in order. A resumed task can repeat a round number — see `resumed`. */
  readonly rounds: readonly RoundRecord[];
  /** A second `loop_started` was read: the loop resumed after a human ruling or a stop. */
  readonly resumed: boolean;
  readonly paused: boolean;
  /** An `infrastructure_retry` recovered from a platform failure at some point in the task's history. */
  readonly recovered: boolean;
  /** A dispatch exists with no matching `outcome_received` yet: work is in progress right now. */
  readonly running: boolean;
};

export type GuardrailTotals = {
  /** Distinct automated checks observed. */
  readonly checks: number;
  /** Total check runs, across every check. */
  readonly runs: number;
  /** Check runs whose outcome stopped a change. */
  readonly stopped: number;
};

/**
 * The log's guardrail totals, counting only `gate` events — everything else in the log (loop,
 * dispatch, role_attempt, usage, effect) is never a check. Gate events are assumed to carry
 * `check` (the check's name) and `outcome: "pass" | "fail"`, which the live log's own docs don't
 * enumerate; recorded in the task that added this module.
 */
export function foldGuardrailTotals(envelopes: readonly RawLogEnvelope[]): GuardrailTotals {
  const checkNames = new Set<string>();
  let runs = 0;
  let stopped = 0;

  for (const envelope of envelopes) {
    const event = envelope.event;
    if (event.kind !== "gate") continue;
    runs++;
    const check = asString(event.check);
    if (check !== undefined) checkNames.add(check);
    if (asString(event.outcome) === "fail") stopped++;
  }

  return { checks: checkNames.size, runs, stopped };
}

/** A cancelled Issue and the Issue cut to replace it: the replacing task carries both Issues' history. */
export type IssueReplacement = { readonly replaced: number; readonly by: number };

/**
 * Every task the log has review-loop events for, ordered by issue number. An Issue named as
 * `replaced` has its events read under the Issue that replaced it, and gets no record of its own.
 * The log's events are never edited: the fold re-keys them in memory only, so each recorded round
 * is read once, and a round number both Issues recorded repeats like a resumed task's (`resumed`).
 */
export function foldTaskRecords(
  envelopes: readonly RawLogEnvelope[],
  replacements: readonly IssueReplacement[] = [],
): readonly TaskRecord[] {
  const ordered = orderEvents(envelopes);
  const replacedBy = new Map(replacements.map(({ replaced, by }) => [replaced, by]));
  const byIssue = new Map<number, RawLogEvent[]>();
  for (const event of ordered) {
    if (event.kind === "gate" || event.kind === "usage") continue;
    const recorded = asNumber(event.subject.issue);
    if (recorded === undefined) continue;
    const issue = replacedBy.get(recorded) ?? recorded;
    const events = byIssue.get(issue);
    if (events) events.push(event);
    else byIssue.set(issue, [event]);
  }

  return [...byIssue.entries()].sort(([a], [b]) => a - b).map(([issue, events]) => buildTaskRecord(issue, events));
}

export type DevelopmentRecord = {
  readonly tasks: readonly TaskRecord[];
  readonly guardrails: GuardrailTotals;
};

/** The whole development record: every task's round-by-round history, and the guardrail totals. */
export function foldDevelopmentRecord(
  envelopes: readonly RawLogEnvelope[],
  replacements: readonly IssueReplacement[] = [],
): DevelopmentRecord {
  return { tasks: foldTaskRecords(envelopes, replacements), guardrails: foldGuardrailTotals(envelopes) };
}

/** Order by `meta.ts`, ties by `seq` — events from different machines arrive out of order. */
function orderEvents(envelopes: readonly RawLogEnvelope[]): readonly RawLogEvent[] {
  return [...envelopes]
    .sort((a, b) => {
      const byTime = Date.parse(a.event.meta.ts) - Date.parse(b.event.meta.ts);
      return byTime !== 0 ? byTime : a.seq - b.seq;
    })
    .map((envelope) => envelope.event);
}

type MutableRound = {
  round: number;
  developerMs?: number;
  reviewerDispatchMs: number[];
  reviewerMs?: number;
  outcome?: RoundOutcome;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
  confidence?: Confidence;
  findings: Finding[];
  blockers?: number;
  replacedIssue?: boolean;
};

function buildTaskRecord(issue: number, events: readonly RawLogEvent[]): TaskRecord {
  let loopStartedCount = 0;
  let paused = false;
  let recovered = false;
  const rounds: MutableRound[] = [];
  let current: MutableRound | undefined;

  const dispatchedEffects = new Set<string>();
  const resolvedEffects = new Set<string>();
  /** Round named by a dispatch's own `round` field, keyed by that dispatch's `effect_id`. */
  const roundByEffect = new Map<string, number>();
  /** Developer time waiting for its round's `round_started`, keyed by round number. */
  const pendingDeveloperMs = new Map<number, number>();

  for (const event of events) {
    const effectId = asString(event.effect_id);
    if (effectId !== undefined && event.event === "dispatched") dispatchedEffects.add(effectId);
    if (effectId !== undefined && (event.event === "outcome_received" || event.event === "dispatch_failed")) {
      resolvedEffects.add(effectId);
    }
    if (effectId !== undefined && event.event === "dispatched") {
      const round = asNumber(event.round);
      if (round !== undefined) roundByEffect.set(effectId, round);
    }

    switch (event.event) {
      case "loop_started":
        loopStartedCount++;
        break;
      case "paused":
        paused = true;
        break;
      case "infrastructure_retry":
        if (asString(event.outcome) === "recovered") recovered = true;
        break;
      case "round_started": {
        const round = asNumber(event.round);
        if (round === undefined) break;
        current = { round, reviewerDispatchMs: [], findings: [] };
        if (asNumber(event.subject.issue) !== issue) current.replacedIssue = true;
        const pending = pendingDeveloperMs.get(round);
        if (pending !== undefined) {
          current.developerMs = pending;
          pendingDeveloperMs.delete(round);
        }
        rounds.push(current);
        break;
      }
      case "round_ended": {
        if (!current) break;
        const outcome = asString(event.outcome);
        current.outcome = outcome === "green" || outcome === "changes_requested" ? outcome : undefined;
        current.filesChanged = asNumber(event.files_changed);
        current.insertions = asNumber(event.insertions);
        current.deletions = asNumber(event.deletions);
        const endMs = Date.parse(event.meta.ts);
        current.reviewerMs = current.reviewerDispatchMs.length
          ? Math.max(...current.reviewerDispatchMs.map((startMs) => endMs - startMs))
          : undefined;
        break;
      }
      case "gate_result_read": {
        if (!current) break;
        const value = asNumber(event.confidence_value);
        const reason = asString(event.confidence_reason);
        current.confidence = value !== undefined && reason !== undefined ? { value, reason } : undefined;
        break;
      }
      case "verdicts_read": {
        if (!current) break;
        current.findings.push(...asFindings(event.findings));
        const blockers = asNumber(event.blockers);
        if (blockers !== undefined) current.blockers = blockers;
        break;
      }
      case "dispatched": {
        if (!current) break;
        if (asString(event.subject.role) === "developer") break;
        current.reviewerDispatchMs.push(Date.parse(event.meta.ts));
        break;
      }
      default:
        break;
    }

    if (event.kind === "role_attempt" && asString(event.subject.role) === "developer") {
      const duration = asNumber(event.duration_ms);
      const round = effectId !== undefined ? roundByEffect.get(effectId) : undefined;
      if (duration !== undefined && round !== undefined) {
        pendingDeveloperMs.set(round, (pendingDeveloperMs.get(round) ?? 0) + duration);
      }
    }
  }

  const running = [...dispatchedEffects].some((id) => !resolvedEffects.has(id));

  return {
    issue,
    rounds: rounds.map(finalizeRound),
    resumed: loopStartedCount > 1,
    paused,
    recovered,
    running,
  };
}

function finalizeRound(round: MutableRound): RoundRecord {
  return {
    round: round.round,
    developerMs: round.developerMs,
    reviewerMs: round.reviewerMs,
    outcome: round.outcome,
    filesChanged: round.filesChanged,
    insertions: round.insertions,
    deletions: round.deletions,
    confidence: round.confidence,
    findings: round.findings,
    blockers: round.blockers,
    replacedIssue: round.replacedIssue,
  };
}

function asFindings(value: unknown): readonly Finding[] {
  if (!Array.isArray(value)) return [];
  const findings: Finding[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const id = asString(record.id);
    const severity = asString(record.severity);
    const severityScale = asString(record.severity_scale);
    const policyTreatment = asString(record.policy_treatment);
    if (id === undefined || severity === undefined || severityScale === undefined || policyTreatment === undefined) {
      continue;
    }
    findings.push({ id, severity, severityScale, policyTreatment });
  }
  return findings;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
