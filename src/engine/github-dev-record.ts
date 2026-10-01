/**
 * Pure fold from GitHub's raw issues, pull requests and comments (plus, per task, the round
 * record the Vinaya log already produced — `src/engine/dev-record.ts`) to this repo's own
 * development record: each milestone task's status, pull request, review rounds, findings,
 * verdicts, tokens, size and human rulings, and the milestone's totals.
 *
 * No `fetch`, no `Date.now()` without injection, no React, no globals — the same discipline as
 * `src/engine/rewind.ts`. Every shape below was verified against GitHub on 2026-09-28; see
 * `.claude/rules/zerion-api.md`'s sibling rule for the server-layer precedent this follows.
 */

import type { RoundRecord as LogRoundRecord, TaskRecord as LogTaskRecord } from "#/engine/dev-record.ts";

export type Severity = "blocker" | "major" | "minor" | "critical" | "high" | "medium" | "low";
export const SEVERITIES: readonly Severity[] = ["blocker", "major", "minor", "critical", "high", "medium", "low"];

export type FindingCounts = Record<Severity, number>;

function zeroFindingCounts(): FindingCounts {
  return { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 };
}

/* ------------------------------- Raw GitHub shapes ------------------------------- */

/** One item of `GET /repos/{owner}/{repo}/issues?state=all`. Carries both issues and pull requests. */
export type RawGithubIssue = {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly body: string | null;
  readonly labels: readonly (string | { readonly name?: string })[];
  /** Present (any shape) only on pull requests — issues never carry this key. */
  readonly pull_request?: unknown;
  /**
   * Same field GitHub puts on every comment (`RawGithubComment`), trusted the same way. GitHub's
   * real API always sends it — a genuinely missing value is a fixture gap, not a payload an
   * outside contributor can forge or omit, so `isTrustedAssociation` treats "missing" as trusted.
   */
  readonly author_association?: string;
};

/** `GET /repos/{owner}/{repo}/pulls/{n}`. The issues list has no size; this does. */
export type RawGithubPull = {
  readonly number: number;
  readonly html_url: string;
  readonly state: string;
  readonly merged: boolean;
  readonly changed_files: number;
  readonly additions: number;
  readonly deletions: number;
};

/** `GET /repos/{owner}/{repo}/pulls/{n}/commits?per_page=1`, oldest first — the first element is the first commit. */
export type RawGithubCommit = {
  readonly commit: {
    readonly author?: { readonly date?: string } | null;
    readonly committer?: { readonly date?: string } | null;
  };
};

/** One item of the repo-wide `GET /repos/{owner}/{repo}/issues/comments`. */
export type RawGithubComment = {
  readonly body: string;
  readonly created_at: string;
  /** Ends in the issue or pull request number the comment sits on. */
  readonly issue_url: string;
  /**
   * GitHub's own relationship of the commenter to this repository (`OWNER`, `MEMBER`,
   * `COLLABORATOR`, `CONTRIBUTOR`, `NONE`, …). This repo's issues and pull requests are public, so
   * anyone can post a comment — only a write-access association is ever trusted as a real review
   * artifact; see `isTrustedComment`.
   */
  readonly author_association: string;
};

/** Author associations with write access to this repo — the only authors trusted as review or task artifacts. */
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * Whether an `author_association` (a comment's, or a pull request's own) has write access to this
 * repo. `undefined` is trusted: GitHub's real API always sends this field, so a genuinely missing
 * value only ever happens in a fixture that predates this check, never in a live GitHub response —
 * see `RawGithubIssue`.
 */
function isTrustedAssociation(association: string | undefined): boolean {
  return association === undefined || TRUSTED_ASSOCIATIONS.has(association);
}

/**
 * Whether a comment's author is trusted to post a reviewer summary table, a verdict or a human
 * ruling. This repo's tracker is public: without this check, any GitHub user could comment a
 * forged `VERDICT: APPROVE`, a fabricated round table or a fake `Ruling` and have it folded into
 * the public development record as if it were authentic.
 */
function isTrustedComment(comment: RawGithubComment): boolean {
  return isTrustedAssociation(comment.author_association);
}

/** The immutable per-pull-request facts a merged pull request never needs re-read for. */
export type MergedPullDetails = {
  readonly filesChanged: number;
  readonly insertions: number;
  readonly deletions: number;
  readonly firstCommitAt?: string;
};

/* ------------------------------- Development record shapes ------------------------------- */

export type TaskStatus = "planned" | "being_built" | "in_review" | "merged";

export type TokenRow = {
  readonly phase: string;
  readonly role: string;
  readonly model: string;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  readonly cost?: string;
  readonly date?: string;
};

export type ReviewerTokenRow = {
  readonly phase: string;
  readonly role: string;
  readonly agent: string;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
};

export type Verdict = {
  readonly result: "approve" | "pass";
  readonly tokens?: ReviewerTokenRow;
};

export type RoundSummary = {
  readonly round: number;
  readonly findings: FindingCounts;
  readonly confidence?: number;
  readonly outcome?: string;
};

export type PullRequestSummary = {
  readonly number: number;
  readonly url: string;
  readonly merged: boolean;
  readonly filesChanged: number;
  readonly insertions: number;
  readonly deletions: number;
  readonly firstCommitAt?: string;
};

export type TaskDevRecord = {
  readonly issue: number;
  readonly title: string;
  readonly status: TaskStatus;
  readonly pullRequest?: PullRequestSummary;
  /** Distinct round numbers only — a round reviewed again after a human ruling counts once. */
  readonly rounds: readonly RoundSummary[];
  readonly codeVerdict?: Verdict;
  readonly securityVerdict?: Verdict;
  readonly developerTokens: readonly TokenRow[];
  readonly reviewerTokens: readonly ReviewerTokenRow[];
  readonly humanRulings: readonly string[];
  /** Sourced from the round record when present, else the first commit to the last verdict. */
  readonly timeMs?: number;
  /** Only present when the round record supplied per-round developer/reviewer time. */
  readonly developerMs?: number;
  readonly reviewerMs?: number;
};

export type MilestoneTotals = {
  readonly tasksMerged: number;
  readonly medianTaskMs?: number;
  readonly developerMs: number;
  readonly reviewerMs: number;
  readonly secondRoundTasks: number;
  readonly findings: FindingCounts;
  readonly tokens: {
    readonly developerIn: number;
    readonly developerOut: number;
    readonly reviewerIn: number;
    readonly reviewerOut: number;
  };
  readonly typicalSize: { readonly filesChanged?: number; readonly insertions?: number; readonly deletions?: number };
  readonly humanRulings: number;
};

export type DevelopmentRecord = {
  readonly tasks: readonly TaskDevRecord[];
  readonly totals: MilestoneTotals;
};

/* ------------------------------- Folding GitHub's raw shapes ------------------------------- */

/** A milestone task: an issue (never a pull request) labelled for a Vinaya tranche. */
function isMilestoneTaskIssue(issue: RawGithubIssue): boolean {
  if ("pull_request" in issue && issue.pull_request !== undefined) return false;
  return issue.labels.some((label) => labelName(label).startsWith("vinaya/tranche:"));
}

function labelName(label: string | { readonly name?: string }): string {
  return typeof label === "string" ? label : (label.name ?? "");
}

/** The task issue number a pull request closes, from `Closes #N` in its body. Undefined if none. */
function closesIssue(body: string | null): number | undefined {
  if (!body) return undefined;
  const match = body.match(/\bCloses #(\d+)/i);
  return match?.[1] !== undefined ? Number(match[1]) : undefined;
}

/** A markdown table separator row, e.g. `|---|---|---|`. */
function isSeparatorRow(trimmedLine: string): boolean {
  return /^\|[-:\s|]+\|$/.test(trimmedLine);
}

const REVIEW_TABLE_HEADER =
  "| round | blocker | major | minor | critical | high | medium | low | confidence | outcome |";

/** Every `| round | ... |` row of a reviewers' summary comment, in the table's own order. */
function parseReviewTable(body: string): RoundSummary[] {
  const headerIndex = body.indexOf(REVIEW_TABLE_HEADER);
  if (headerIndex === -1) return [];

  // Strip the single newline that ended the header line, so the separator row is the first line.
  const rest = body.slice(headerIndex + REVIEW_TABLE_HEADER.length).replace(/^\n+/, "");
  const lines = rest.split("\n");
  const rows: RoundSummary[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) break;
    // The separator row (`|---|---|...`) is neither a header nor data — skip it, keep scanning.
    if (isSeparatorRow(trimmed)) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 10) continue;

    const round = Number(cells[0]);
    if (!Number.isFinite(round)) continue;

    const findings = zeroFindingCounts();
    SEVERITIES.forEach((severity, index) => {
      const value = Number(cells[index + 1]);
      findings[severity] = Number.isFinite(value) ? value : 0;
    });

    const confidenceValue = Number(cells[8]);
    const outcome = cells[9];

    rows.push({
      round,
      findings,
      confidence: Number.isFinite(confidenceValue) ? confidenceValue : undefined,
      outcome: outcome && outcome !== "-" ? outcome : undefined,
    });
  }

  return rows;
}

const VERDICT_LINE = /^VERDICT:\s*(APPROVE|PASS)\b/;
const TOKENS_LINE = /Tokens:\s*\d+:\s*([^—]+?)\s*—\s*([^—]+?)\s*—\s*([^—]+?)\s*—\s*(\d+)\/(\d+)\/—/;
const SECURITY_MARKERS = /(Tokens:\s*\d+:\s*security\b)|SECRETS:/i;

function parseVerdict(body: string): { readonly verdict: Verdict; readonly isSecurity: boolean } | undefined {
  const first = body.trim().split("\n")[0] ?? "";
  const match = first.match(VERDICT_LINE);
  if (!match?.[1]) return undefined;

  const result = match[1] === "APPROVE" ? "approve" : "pass";
  const tokensMatch = body.match(TOKENS_LINE);
  const tokens: ReviewerTokenRow | undefined = tokensMatch
    ? {
        phase: (tokensMatch[1] ?? "").trim(),
        role: (tokensMatch[2] ?? "").trim(),
        agent: (tokensMatch[3] ?? "").trim(),
        tokensIn: tokensMatch[4] !== undefined ? Number(tokensMatch[4]) : undefined,
        tokensOut: tokensMatch[5] !== undefined ? Number(tokensMatch[5]) : undefined,
      }
    : undefined;

  return { verdict: { result, tokens }, isSecurity: SECURITY_MARKERS.test(body) };
}

const TOKENS_BLOCK = /<!-- AEG:TOKENS:START -->([\s\S]*?)<!-- AEG:TOKENS:END -->/;

/** The developer's token rows from the pull request body's `AEG:TOKENS` block, one per session. */
function parseDeveloperTokens(body: string | null): TokenRow[] {
  if (!body) return [];
  const block = body.match(TOKENS_BLOCK)?.[1];
  if (!block) return [];

  const rows: TokenRow[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || isSeparatorRow(trimmed)) continue;
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 7) continue;
    if (cells[0]?.toLowerCase() === "phase") continue; // the header row

    const tokensIn = Number(cells[3]);
    const tokensOut = Number(cells[4]);
    rows.push({
      phase: cells[0] ?? "",
      role: cells[1] ?? "",
      model: cells[2] ?? "",
      tokensIn: Number.isFinite(tokensIn) ? tokensIn : undefined,
      tokensOut: Number.isFinite(tokensOut) ? tokensOut : undefined,
      cost: cells[5],
      date: cells[6],
    });
  }
  return rows;
}

/** A human ruling opens with the word `Ruling`, or with the marker `vinaya task dispatch` posts on one. */
function isHumanRuling(body: string): boolean {
  const trimmed = body.trim();
  return /^Ruling\b/.test(trimmed) || trimmed.startsWith("<!-- aeg:principal:ruling");
}

/** The issue or pull request number a comment's `issue_url` ends in. */
function issueUrlNumber(issueUrl: string): number | undefined {
  const match = issueUrl.match(/\/(\d+)$/);
  return match?.[1] !== undefined ? Number(match[1]) : undefined;
}

/** Every pull request whose body closes the issue — normally one, but a task can be reattempted. */
export type PullMatch = { readonly issue: RawGithubIssue; readonly pulls: readonly RawGithubIssue[] };

/**
 * Every milestone task issue, paired with every pull request whose body closes it. Exported so
 * the server layer can learn which pull request numbers it needs `/pulls/{n}` and
 * `/pulls/{n}/commits` for, without repeating the `Closes #N` parsing — knowledge of GitHub's
 * shapes belongs to the engine alone. `selectPull` below picks the one that actually represents
 * the task once their merge status is known.
 *
 * A pull request only enters this map if its own author has write access to this repo. This
 * tracker is public: without that check, anyone could open a pull request whose body says
 * `Closes #N` and carries a forged `AEG:TOKENS` block, and — with no comment, no review, no merge
 * at all — have it picked up as that task's own developer record, the same forgery `isTrustedComment`
 * already guards against for comments.
 */
export function matchTasksToPulls(issues: readonly RawGithubIssue[]): Map<number, PullMatch> {
  const tasks = issues.filter(isMilestoneTaskIssue);
  const pulls = issues.filter(
    (issue) =>
      "pull_request" in issue && issue.pull_request !== undefined && isTrustedAssociation(issue.author_association),
  );

  const byIssueNumber = new Map<number, PullMatch>();
  for (const task of tasks) byIssueNumber.set(task.number, { issue: task, pulls: [] });

  for (const pull of pulls) {
    const closes = closesIssue(pull.body);
    if (closes === undefined) continue;
    const existing = byIssueNumber.get(closes);
    if (existing) byIssueNumber.set(closes, { issue: existing.issue, pulls: [...existing.pulls, pull] });
  }

  return byIssueNumber;
}

/**
 * The pull request that represents a task, when more than one has closed it over its life (an
 * abandoned attempt followed by a fresh one, say). GitHub's issue/pull request numbers only ever
 * increase repo-wide, so the highest number is always the most recent. Preference: a merged pull
 * request first (there is only ever one, once merging closes the issue for good); otherwise the
 * most recently opened one still open; otherwise the most recent closed-unmerged attempt.
 * `undefined` when the task has no pull request at all yet.
 */
function selectPull(
  pulls: readonly RawGithubIssue[],
  pullDetails: ReadonlyMap<number, RawGithubPull>,
): RawGithubIssue | undefined {
  if (pulls.length === 0) return undefined;
  const byRecency = [...pulls].sort((a, b) => b.number - a.number);
  return (
    byRecency.find((pull) => pullDetails.get(pull.number)?.merged) ??
    byRecency.find((pull) => pull.state === "open") ??
    byRecency[0]
  );
}

/**
 * Fold GitHub's raw issues, pull requests and comments into one development record per milestone
 * task — everything this app can learn from GitHub alone, before a round record (if any) replaces
 * the round-by-round estimate. `pullDetails` and `firstCommits` are keyed by pull request number,
 * fetched once per task's pull request by the server layer (never for an issue with no pull request).
 */
export function foldGithubTasks(
  issues: readonly RawGithubIssue[],
  comments: readonly RawGithubComment[],
  pullDetails: ReadonlyMap<number, RawGithubPull>,
  firstCommits: ReadonlyMap<number, RawGithubCommit | undefined>,
): readonly TaskDevRecord[] {
  const matches = matchTasksToPulls(issues);
  const orderedComments = comments
    .filter(isTrustedComment)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  const commentsByPull = new Map<number, RawGithubComment[]>();
  for (const comment of orderedComments) {
    const n = issueUrlNumber(comment.issue_url);
    if (n === undefined) continue;
    const list = commentsByPull.get(n);
    if (list) list.push(comment);
    else commentsByPull.set(n, [comment]);
  }

  const records: TaskDevRecord[] = [];
  for (const [issueNumber, { issue, pulls }] of [...matches].sort(([a], [b]) => a - b)) {
    const pull = selectPull(pulls, pullDetails) ?? issue;
    const hasPull = pull !== issue;
    const detail = hasPull ? pullDetails.get(pull.number) : undefined;
    const firstCommit = hasPull ? firstCommits.get(pull.number) : undefined;
    const pullComments = hasPull ? (commentsByPull.get(pull.number) ?? []) : [];
    // A ruling can land on the task Issue itself (before a pull request exists, or alongside one) —
    // distinct from `pullComments`, which review tables, verdicts and tokens read only from the pull
    // request. `commentsByPull` is keyed by any issue/PR number GitHub comments attach to, so the
    // same map already holds the Issue's own thread under its own number.
    const issueComments = commentsByPull.get(issueNumber) ?? [];

    const roundsByNumber = new Map<number, RoundSummary>();
    let codeVerdict: { readonly verdict: Verdict; readonly isSecurity: boolean } | undefined;
    let securityVerdict: { readonly verdict: Verdict; readonly isSecurity: boolean } | undefined;
    const developerTokens: TokenRow[] = hasPull ? parseDeveloperTokens(pull.body) : [];
    const reviewerTokens: ReviewerTokenRow[] = [];
    const humanRulings: string[] = [];

    for (const comment of pullComments) {
      for (const row of parseReviewTable(comment.body)) roundsByNumber.set(row.round, row);

      const parsed = parseVerdict(comment.body);
      if (parsed) {
        if (parsed.verdict.tokens) reviewerTokens.push(parsed.verdict.tokens);
        if (parsed.isSecurity) securityVerdict = parsed;
        else codeVerdict = parsed;
      }

      if (isHumanRuling(comment.body)) humanRulings.push(comment.body);
    }
    for (const comment of issueComments) {
      if (isHumanRuling(comment.body)) humanRulings.push(comment.body);
    }

    const merged = pull.state === "closed" && (detail?.merged ?? false);
    const rounds = [...roundsByNumber.values()].sort((a, b) => a.round - b.round);
    const status: TaskStatus = !hasPull
      ? "planned"
      : merged
        ? "merged"
        : rounds.length > 0 || codeVerdict || securityVerdict
          ? "in_review"
          : "being_built";

    const pullRequest: PullRequestSummary | undefined =
      hasPull && detail
        ? {
            number: pull.number,
            url: detail.html_url,
            merged,
            filesChanged: detail.changed_files,
            insertions: detail.additions,
            deletions: detail.deletions,
            firstCommitAt: firstCommit?.commit.author?.date ?? firstCommit?.commit.committer?.date,
          }
        : undefined;

    const lastVerdictAt = pullComments
      .filter((comment) => parseVerdict(comment.body))
      .map((comment) => comment.created_at)
      .at(-1);
    const timeMs =
      pullRequest?.firstCommitAt && lastVerdictAt
        ? Date.parse(lastVerdictAt) - Date.parse(pullRequest.firstCommitAt)
        : undefined;

    records.push({
      issue: issueNumber,
      title: issue.title,
      status,
      pullRequest,
      rounds,
      codeVerdict: codeVerdict?.verdict,
      securityVerdict: securityVerdict?.verdict,
      developerTokens,
      reviewerTokens,
      humanRulings,
      timeMs: timeMs !== undefined && Number.isFinite(timeMs) ? timeMs : undefined,
    });
  }

  return records;
}

/* ------------------------------- Merging the round record ------------------------------- */

/**
 * A task's Vinaya round record, reduced to one summary per distinct round number: outcome and
 * confidence from the round's last occurrence, findings and time summed across every occurrence —
 * the same "a round reviewed again after a human ruling is one row" shape the GitHub
 * reviewer-summary tables follow, but every review's findings and time still count.
 */
function reduceLogRounds(rounds: readonly LogRoundRecord[]): {
  readonly rounds: readonly RoundSummary[];
  readonly developerMs?: number;
  readonly reviewerMs?: number;
} {
  const byNumber = new Map<number, RoundSummary>();
  let developerMs: number | undefined;
  let reviewerMs: number | undefined;

  for (const round of rounds) {
    if (round.developerMs !== undefined) developerMs = (developerMs ?? 0) + round.developerMs;
    if (round.reviewerMs !== undefined) reviewerMs = (reviewerMs ?? 0) + round.reviewerMs;

    const findings = { ...(byNumber.get(round.round)?.findings ?? zeroFindingCounts()) };
    for (const finding of round.findings) {
      if (isSeverity(finding.severity)) findings[finding.severity]++;
    }

    byNumber.set(round.round, {
      round: round.round,
      findings,
      confidence: round.confidence?.value,
      outcome: round.outcome,
    });
  }

  return { rounds: [...byNumber.values()].sort((a, b) => a.round - b.round), developerMs, reviewerMs };
}

function isSeverity(value: string): value is Severity {
  return (SEVERITIES as readonly string[]).includes(value);
}

function hasFindings(findings: FindingCounts): boolean {
  return SEVERITIES.some((severity) => findings[severity] > 0);
}

/**
 * Replace each task's GitHub-estimated round timing with the Vinaya round record's, when the log
 * has one for that task's issue (O2). A round's findings are the log's whenever the log recorded
 * any for it: GitHub's reviewer table misses rounds (no row for a round the loop never summarised,
 * a duplicated row whose last copy is all dashes), so its row stands in only for a round the log
 * has no findings for — an empty list, or one on a scale none of this app's seven severities name.
 * A task the log never saw keeps its GitHub-derived rounds and its first-commit-to-last-verdict
 * span as `timeMs`.
 */
export function mergeRoundRecords(
  githubTasks: readonly TaskDevRecord[],
  logTasks: readonly LogTaskRecord[],
): readonly TaskDevRecord[] {
  const logByIssue = new Map(logTasks.map((task) => [task.issue, task]));

  return githubTasks.map((task) => {
    const logTask = logByIssue.get(task.issue);
    if (!logTask || logTask.rounds.length === 0) return task;

    const reduced = reduceLogRounds(logTask.rounds);
    const githubRoundsByNumber = new Map(task.rounds.map((round) => [round.round, round]));
    const rounds = reduced.rounds.map((round) =>
      hasFindings(round.findings) ? round : (githubRoundsByNumber.get(round.round) ?? round),
    );
    const timeMs =
      reduced.developerMs !== undefined || reduced.reviewerMs !== undefined
        ? (reduced.developerMs ?? 0) + (reduced.reviewerMs ?? 0)
        : task.timeMs;

    return {
      ...task,
      rounds,
      developerMs: reduced.developerMs,
      reviewerMs: reduced.reviewerMs,
      timeMs,
    };
  });
}

/* ------------------------------- Milestone totals ------------------------------- */

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const midValue = sorted[mid];
  const otherValue = sorted[mid - 1];
  if (midValue === undefined) return undefined;
  return sorted.length % 2 === 0 && otherValue !== undefined ? (midValue + otherValue) / 2 : midValue;
}

export function computeMilestoneTotals(tasks: readonly TaskDevRecord[]): MilestoneTotals {
  const findings = zeroFindingCounts();
  let developerMs = 0;
  let reviewerMs = 0;
  let secondRoundTasks = 0;
  let humanRulings = 0;
  const tokens = { developerIn: 0, developerOut: 0, reviewerIn: 0, reviewerOut: 0 };
  const taskMsValues: number[] = [];
  const filesChangedValues: number[] = [];
  const insertionsValues: number[] = [];
  const deletionsValues: number[] = [];

  for (const task of tasks) {
    for (const round of task.rounds) {
      for (const severity of SEVERITIES) findings[severity] += round.findings[severity];
    }
    if (task.rounds.length >= 2) secondRoundTasks++;
    humanRulings += task.humanRulings.length;

    if (task.developerMs !== undefined) developerMs += task.developerMs;
    if (task.reviewerMs !== undefined) reviewerMs += task.reviewerMs;
    if (task.timeMs !== undefined) taskMsValues.push(task.timeMs);

    for (const row of task.developerTokens) {
      tokens.developerIn += row.tokensIn ?? 0;
      tokens.developerOut += row.tokensOut ?? 0;
    }
    for (const row of task.reviewerTokens) {
      tokens.reviewerIn += row.tokensIn ?? 0;
      tokens.reviewerOut += row.tokensOut ?? 0;
    }

    if (task.pullRequest) {
      filesChangedValues.push(task.pullRequest.filesChanged);
      insertionsValues.push(task.pullRequest.insertions);
      deletionsValues.push(task.pullRequest.deletions);
    }
  }

  return {
    tasksMerged: tasks.filter((task) => task.status === "merged").length,
    medianTaskMs: median(taskMsValues),
    developerMs,
    reviewerMs,
    secondRoundTasks,
    findings,
    tokens,
    typicalSize: {
      filesChanged: median(filesChangedValues),
      insertions: median(insertionsValues),
      deletions: median(deletionsValues),
    },
    humanRulings,
  };
}

/** The whole development record: GitHub folded, the round record merged in, then totalled. */
export function buildDevelopmentRecord(
  issues: readonly RawGithubIssue[],
  comments: readonly RawGithubComment[],
  pullDetails: ReadonlyMap<number, RawGithubPull>,
  firstCommits: ReadonlyMap<number, RawGithubCommit | undefined>,
  logTasks: readonly LogTaskRecord[],
): DevelopmentRecord {
  const githubTasks = foldGithubTasks(issues, comments, pullDetails, firstCommits);
  const tasks = mergeRoundRecords(githubTasks, logTasks);
  return { tasks, totals: computeMilestoneTotals(tasks) };
}
