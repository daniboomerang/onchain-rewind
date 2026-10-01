import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useMemo, useState, useSyncExternalStore } from "react";
import {
  buildDegradedLogView,
  buildDevLogView,
  type DegradedLogView,
  type DevLogView,
  findingsByReviewer,
  type TicketView,
} from "../../engine/dev-log-view";
import type { TaskStatus } from "../../engine/github-dev-record";
import { getGithubDevRecord } from "../../server/github/dev-record.functions";
import type { DevSnapshot } from "../../server/github/dev-snapshot";
import { getDevRecord } from "../../server/vinaya/dev-record.functions";
import type { VinayaLogResult } from "../../server/vinaya/log-client";
import { duration, ease, enterCard, enterCardReduced, stagger } from "../rewind/motion";
import { Button, Spinner } from "../ui/Button";
import { SiteFooter } from "../ui/Footer";
import { localStamp, minutes, plural, tokens, utcStamp } from "./format";
import { RoundTimeline } from "./RoundTimeline";

const REPO = "https://github.com/daniboomerang/onchain-rewind";

// This page polls every few seconds so a running round shows up live, unlike the rest of the app
// (`.claude/rules/tanstack-start.md`'s half-day `staleTime`, unchanged): it is watching a loop that
// finishes in minutes, not a Zerion budget that resets once a day.
const POLL_MS = 5_000;

const STATUS: Record<TaskStatus, { label: string; tone: string }> = {
  merged: { label: "Merged", tone: "bg-positive/15 text-positive" },
  in_review: { label: "In review", tone: "bg-primary/15 text-primary" },
  being_built: { label: "Being built", tone: "bg-notice/15 text-notice" },
  planned: { label: "Planned", tone: "bg-surface-raised text-fg-muted" },
};

const SEVERITY_TONE: Record<string, string> = {
  blocker: "bg-negative-soft text-negative",
  critical: "bg-negative-soft text-negative",
  major: "bg-notice/15 text-notice",
  high: "bg-notice/15 text-notice",
  medium: "bg-surface-raised text-fg",
  minor: "bg-surface-raised text-fg-muted",
  low: "bg-surface-raised text-fg-subtle",
};

export type LoadState = "loading" | "github_limited" | "log_unavailable" | "unreachable";

// What a visitor reads: what is missing and that the page refreshes on its own. Never a variable,
// a token, a status or a server error — those go to the server log (`.claude/rules/tanstack-start.md`).
const STATE_MESSAGE: Record<LoadState, { headline: string; body: string } | undefined> = {
  loading: undefined,
  github_limited: {
    headline: "Ticket details are catching up",
    body: "Ticket titles, status, size and pull requests are missing below for a few minutes. Round activity from the Vinaya log, where available, still shows. This refreshes on its own every few seconds.",
  },
  log_unavailable: {
    headline: "Round detail is missing for now",
    body: "Round-by-round detail and the guardrail totals are missing below. Everything GitHub gives still shows. This refreshes on its own every few seconds.",
  },
  unreachable: {
    headline: "Part of the development log couldn't be reached",
    body: "Some of what's below — ticket detail, or round activity and guardrails — may be missing until it can. This refreshes on its own every few seconds.",
  },
};

/** One state message, used by the page and by `/system`'s fixtures. */
export function StateMessage({ state }: { state: LoadState }) {
  if (state === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-fg-muted">
        <Spinner className="size-8" />
        <p className="text-small">Reading the project record…</p>
      </div>
    );
  }
  const message = STATE_MESSAGE[state];
  if (!message) return null;
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-6">
      <p className="font-display text-title text-negative">{message.headline}</p>
      <p className="text-body text-fg-muted">{message.body}</p>
    </div>
  );
}

/**
 * `false` on the server and through hydration, `true` from then on — and `true` at once for
 * anything first rendered after hydration. Whatever reads it renders the same markup either side
 * of hydration, then corrects itself (a local time, an entrance animation) straight after.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

function subscribeNever(): () => void {
  return () => {};
}

/**
 * `snapshot` is the development snapshot this deploy carries (ADR-0006), or `null` when the build
 * wrote none. It paints first, from the server's own markup; the live reads replace it.
 */
export function DevLogPage({ snapshot = null }: { snapshot?: DevSnapshot | null }) {
  return (
    <main className="min-h-dvh bg-bg px-10 py-12 text-fg max-sm:px-5">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8">
        <Button variant="ghost" render={<a href="/" />} className="self-start">
          Back to home
        </Button>

        <header className="flex max-w-[720px] flex-col gap-3">
          <p className="font-mono text-label text-fg-subtle uppercase">Onchain Rewind</p>
          <h1 className="font-display text-headline">Project development logs</h1>
          <p className="text-body text-fg-muted">
            How this app was built. Every ticket is planned, coded by an AI developer, checked by two independent AI
            reviewers, then merged. Nothing here is typed in by hand: it is read from{" "}
            <a className="underline underline-offset-2" href={REPO} rel="noreferrer" target="_blank">
              GitHub
            </a>{" "}
            and the Vinaya log.
          </p>
        </header>

        <DevLogData snapshot={snapshot} />

        <SiteFooter />
      </div>
    </main>
  );
}

function DevLogData({ snapshot }: { snapshot: DevSnapshot | null }) {
  // The reads start only once hydrated: the server and the first client render both show the
  // snapshot, or the loader when there is none, so the markup never mismatches.
  const hydrated = useHydrated();
  const github = useQuery({
    queryKey: ["dev-log", "github"],
    queryFn: () => getGithubDevRecord(),
    staleTime: 0,
    refetchInterval: POLL_MS,
    enabled: hydrated,
  });
  const vinaya = useQuery({
    queryKey: ["dev-log", "vinaya"],
    queryFn: () => getDevRecord(),
    staleTime: 0,
    refetchInterval: POLL_MS,
    enabled: hydrated,
  });

  const log = useMemo(
    () => (vinaya.data?.ok ? { tasks: vinaya.data.data.tasks, guardrails: vinaya.data.data.guardrails } : undefined),
    [vinaya.data],
  );

  const view = useMemo(() => {
    if (!github.data?.ok) return undefined;
    return buildDevLogView(github.data.data, log);
  }, [github.data, log]);

  // GitHub failing must not blank the page: the Vinaya log's own round record still has rounds,
  // time, size and guardrails per ticket, just no title, status or pull request (GitHub's alone).
  const degraded = useMemo(() => (log ? buildDegradedLogView(log) : undefined), [log]);

  const saved = useMemo(() => (snapshot ? buildDevLogView(snapshot.github, snapshot.log) : undefined), [snapshot]);

  const vinayaProblem = vinayaState(vinaya);
  const liveFailed = github.isError || github.data?.ok === false || vinayaProblem !== null;

  // The last record both live reads answered in full. Held (adjusting state during render, not in
  // an effect, so it never lags a frame) so a later failed poll keeps it rather than falling back
  // to the older snapshot.
  const complete = view && log ? view : undefined;
  const [lastLive, setLastLive] = useState<DevLogView>();
  if (complete && complete !== lastLive) setLastLive(complete);

  // The live record replaces what's on screen only once both reads have answered in full, so the
  // round timelines and guardrails never blink out. Until then — and whenever a live read fails —
  // the last full live record, or else the snapshot, stays. Every branch below renders the same
  // elements in the same places, so a swap re-renders the record in place: no remount, no loader,
  // no entrance animation played twice.
  if (complete) {
    return (
      <>
        <RecordSource />
        <DevLogRecord view={complete} />
      </>
    );
  }

  if (lastLive) {
    return (
      <>
        <RecordSource stale />
        <DevLogRecord view={lastLive} />
      </>
    );
  }

  if (saved && snapshot) {
    return (
      <>
        <RecordSource savedAt={snapshot.takenAt} liveFailed={liveFailed} />
        <DevLogRecord view={saved} saved />
        {/* A snapshot taken without the log reads like a failed live log read, until the log answers. */}
        {!snapshot.log && !log && <StateMessage state={vinayaProblem ?? "log_unavailable"} />}
      </>
    );
  }

  // No snapshot and no full live record yet: GitHub alone is enough to show the tickets, with a
  // message naming what the Vinaya log couldn't give.
  if (view) {
    return (
      <>
        <RecordSource />
        <DevLogRecord view={view} />
        {vinayaProblem && <StateMessage state={vinayaProblem} />}
      </>
    );
  }

  if (github.isError || (github.data && !github.data.ok)) {
    const githubProblem: LoadState =
      github.data?.ok === false && github.data.error === "rate_limited" ? "github_limited" : "unreachable";
    return (
      <>
        {degraded && <DegradedLogRecord view={degraded} />}
        <StateMessage state={githubProblem} />
        {!degraded && vinayaProblem && <StateMessage state={vinayaProblem} />}
      </>
    );
  }

  return <StateMessage state="loading" />;
}

/**
 * The one state the Vinaya read can be in worth telling the visitor about, or `null` when it's
 * fine. A query that errored without a result (`getDevRecord` throwing) and a typed `unauthorized`
 * read the same: the log's round detail is missing, and the page says only that. Its message is
 * never read — the detail is in the server log. Guardrails and the round-by-round timeline both
 * need this read; the ticket list and headline numbers don't, so this never blocks the page the
 * way a failed GitHub read does.
 */
function vinayaState(vinaya: { data?: VinayaLogResult<unknown>; isError: boolean }): LoadState | null {
  if (vinaya.isError) return "log_unavailable";
  if (vinaya.data && !vinaya.data.ok) return vinaya.data.error === "unauthorized" ? "log_unavailable" : "unreachable";
  return null;
}

/**
 * Which record is on screen: the live one, or the snapshot and when it was taken. A snapshot is
 * never passed off as live — the page says it is a saved copy until the live reads replace it.
 */
function RecordSource({
  savedAt,
  liveFailed = false,
  stale = false,
}: {
  savedAt?: string;
  liveFailed?: boolean;
  stale?: boolean;
}) {
  const live = savedAt === undefined && !stale;
  return (
    <p role="status" className="flex items-center gap-2 text-small text-fg-muted">
      <span aria-hidden className={`size-2 rounded-full ${live ? "bg-positive" : "bg-fg-subtle"}`} />
      {live ? (
        "Live, refreshed every few seconds."
      ) : savedAt === undefined ? (
        "The last live read. The latest refresh couldn't be read, so this stays until it can. It tries again every few seconds."
      ) : (
        <span>
          Saved copy as of <LocalTime iso={savedAt} />, taken when this version of the site was built.{" "}
          {liveFailed
            ? "The live record couldn't be read just now, so this copy stays until it can. It tries again every few seconds."
            : "Checking for anything newer…"}
        </span>
      )}
    </p>
  );
}

function Reveal({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  // Markup rendered on the server paints as it is: an entrance that starts hidden would leave the
  // snapshot invisible until the scripts load. Anything mounted after hydration still animates in.
  const hydrated = useHydrated();
  return (
    <motion.section
      variants={reduce ? enterCardReduced : enterCard}
      initial={hydrated ? "hidden" : false}
      animate="show"
      transition={{ delay: reduce ? 0 : index * stagger.children }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/**
 * The whole record: milestone, headline numbers, time split, guardrails and the ticket list. Also
 * used by `/system`. `saved` marks the development snapshot: its "working on it now" line is left
 * out, because it was only true when the build ran.
 */
export function DevLogRecord({ view, saved = false }: { view: DevLogView; saved?: boolean }) {
  const { milestone, headline } = view;
  const scaleMs = Math.max(
    1,
    ...view.tickets.flatMap((t) => t.timeline.map((r) => (r.developerMs ?? 0) + (r.reviewerMs ?? 0))),
  );
  const reviewerLines = findingsByReviewer(headline.findings);

  return (
    <>
      <Reveal index={0} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <p className="font-mono text-label text-fg-subtle uppercase">Milestone</p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="font-display text-title">{milestone.title}</h2>
          <p className="text-body text-fg-muted">
            <span className="font-medium text-fg">{milestone.ticketsMerged}</span> of{" "}
            {plural(milestone.ticketsTotal, "ticket")} merged
          </p>
        </div>
        <Progress
          value={milestone.ticketsTotal === 0 ? 0 : milestone.ticketsMerged / milestone.ticketsTotal}
          label={`${milestone.ticketsMerged} of ${milestone.ticketsTotal} tickets merged`}
        />
      </Reveal>

      {!saved && view.workingNow.length > 0 && (
        <Reveal index={1} className="flex flex-col gap-2">
          {view.workingNow.map((w) => (
            <p key={w.issue} className="flex items-center gap-2 text-small text-notice">
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-notice" />
              {w.role === "developer" ? "The developer is" : "Reviewers are"} working on ticket #{w.issue} — {w.title} —
              right now.
            </p>
          ))}
        </Reveal>
      )}

      <div className="grid grid-cols-5 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <Stat
          index={2}
          label="Time per ticket"
          value={minutes(headline.medianTicketMs)}
          note="Median developer plus reviewer time per ticket, from the Vinaya round log. Waiting for a human is not counted."
        />
        <Stat
          index={3}
          label="Second rounds"
          value={`${headline.secondRoundTickets} of ${headline.reviewedTickets}`}
          note="Reviewed tickets where the reviewers asked for changes and the developer went round again."
        />
        <Stat
          index={4}
          label="Problems caught"
          value={String(headline.findingsTotal)}
          note={
            <>
              Raised by the two reviewers before merge:
              {reviewerLines.map((line) => (
                <span key={line.reviewer} className="block">
                  {line.reviewer}: {line.raised.map((r) => `${r.count} ${r.severity}`).join(" · ") || "none"}
                </span>
              ))}
            </>
          }
        />
        <Stat
          index={5}
          label="Typical size"
          value={headline.typicalFiles === undefined ? "—" : plural(Math.round(headline.typicalFiles), "file")}
          note={
            headline.typicalLines === undefined
              ? ""
              : `Median change: ${Math.round(headline.typicalLines).toLocaleString("en-US")} lines added or removed.`
          }
        />
        <Stat
          index={6}
          label="Model tokens"
          value={`${tokens(headline.tokensOut)} out`}
          note={`${tokens(headline.tokensIn)} read in total, developer and reviewers together.`}
        />
      </div>

      {view.timeSplit && <TimeSplit timeSplit={view.timeSplit} />}
      {view.guardrails && <Guardrails guardrails={view.guardrails} saved={saved} />}

      <Reveal index={9} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-title">Ticket by ticket</h2>
          <p className="text-small text-fg-muted">
            <strong className="font-medium text-fg">Rounds</strong> is how many times the developer and reviewers went
            back and forth. <strong className="font-medium text-fg">Problems</strong> are what each reviewer, code
            review and security, raised, by severity — not every problem stops a merge; some are recorded and fixed
            later.
          </p>
        </div>
        <ul className="flex flex-col rounded-2xl border border-border bg-surface">
          <li className="sticky top-0 z-10 grid grid-cols-[minmax(0,3fr)_110px_100px_130px_minmax(0,2fr)_130px] gap-4 rounded-t-2xl border-b border-border bg-surface px-5 py-3 font-mono text-label text-fg-subtle uppercase max-lg:hidden">
            <span>Ticket</span>
            <span>Time</span>
            <span>Rounds</span>
            <span>Size</span>
            <span>Problems</span>
            <span>Tokens</span>
          </li>
          {view.tickets.map((ticket) => (
            <TicketRow key={ticket.issue} ticket={ticket} scaleMs={scaleMs} />
          ))}
        </ul>
      </Reveal>
    </>
  );
}

function Progress({ value, label }: { value: number; label: string }) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  return (
    <div role="img" aria-label={label} className="h-2.5 overflow-hidden rounded-full bg-track">
      <motion.div
        className="h-full origin-left rounded-full bg-positive"
        initial={hydrated ? { scaleX: reduce ? value : 0 } : false}
        animate={{ scaleX: value }}
        transition={{ duration: reduce ? 0 : duration.grow, ease: ease.out, delay: reduce ? 0 : duration.base }}
      />
    </div>
  );
}

function Stat({ index, label, value, note }: { index: number; label: string; value: string; note: ReactNode }) {
  return (
    <Reveal index={index} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
      <p className="font-mono text-label text-fg-subtle uppercase">{label}</p>
      <p className="font-display text-stat tabular-nums">{value}</p>
      <p className="text-small text-fg-muted">{note}</p>
    </Reveal>
  );
}

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1 text-small tabular-nums">
    <span className="font-mono text-label text-fg-subtle uppercase lg:hidden">{label}</span>
    {children}
  </div>
);

function TicketRow({ ticket: t, scaleMs }: { ticket: TicketView; scaleMs: number }) {
  const status = STATUS[t.status];
  const byReviewer = findingsByReviewer(t.findings);
  const expandable = t.timeline.length > 0;
  // Held here, not left to a static `open` attribute: React re-applies that on every render, so the
  // 5-second refresh would reopen a row a reader closed. Open until the reader says otherwise.
  const [open, setOpen] = useState(true);

  const summary = (
    <div className="grid grid-cols-[minmax(0,3fr)_110px_100px_130px_minmax(0,2fr)_130px] gap-4 px-5 py-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-2 max-lg:col-span-2 max-sm:col-span-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-small text-fg-subtle">#{t.issue}</span>
          <span className={`rounded-full px-2 py-0.5 text-label font-medium ${status.tone}`}>{status.label}</span>
          {t.humanRulingsCount > 0 && (
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-label text-fg-muted">
              {plural(t.humanRulingsCount, "human ruling")}
            </span>
          )}
        </div>
        <p className="text-body">{t.title}</p>
        <p className="flex flex-wrap gap-x-3 text-label text-fg-subtle">
          {t.pullRequest && (
            <a
              className="underline underline-offset-2"
              href={`${REPO}/pull/${t.pullRequest.number}`}
              rel="noreferrer"
              target="_blank"
            >
              Pull request #{t.pullRequest.number}
            </a>
          )}
          {t.pullRequest?.firstCommitAt && (
            <span>
              Started <LocalTime iso={t.pullRequest.firstCommitAt} />
            </span>
          )}
          {t.codeVerdict && <span>Code review: {t.codeVerdict}</span>}
          {t.securityVerdict && <span>Security: {t.securityVerdict}</span>}
        </p>
      </div>

      <Cell label="Time">
        <span>{minutes(t.buildMs)}</span>
      </Cell>

      <Cell label="Rounds">
        {t.rounds.length === 0 ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <>
            <span className="flex items-center gap-1.5" role="img" aria-label={plural(t.rounds.length, "round")}>
              {t.rounds.map((r) => (
                <span
                  key={r.round}
                  title={`Round ${r.round}: ${r.outcome ? r.outcome.replace("_", " ") : "in progress"}`}
                  className={`size-2.5 rounded-full ${r.outcome === "green" ? "bg-positive" : r.outcome === "changes_requested" ? "bg-notice" : "bg-fg-subtle"}`}
                />
              ))}
            </span>
            <span className="text-label text-fg-subtle">{plural(t.rounds.length, "round")}</span>
          </>
        )}
      </Cell>

      <Cell label="Size">
        {t.pullRequest ? (
          <>
            <span>{plural(t.pullRequest.filesChanged, "file")}</span>
            <span className="text-label text-fg-subtle">
              +{t.pullRequest.insertions.toLocaleString("en-US")} −{t.pullRequest.deletions.toLocaleString("en-US")}
            </span>
          </>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </Cell>

      <Cell label="Problems">
        {t.rounds.length === 0 ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <span className="flex flex-col gap-1">
            {byReviewer.map((line) => (
              <span key={line.reviewer} className="flex flex-wrap items-center gap-1.5">
                <span className="text-label text-fg-subtle">{line.reviewer}:</span>
                {line.raised.length === 0 ? (
                  <span className="text-label text-fg-muted">none</span>
                ) : (
                  line.raised.map((r) => (
                    <span
                      key={r.severity}
                      className={`rounded-full px-2 py-0.5 text-label ${SEVERITY_TONE[r.severity]}`}
                    >
                      {r.count} {r.severity}
                    </span>
                  ))
                )}
              </span>
            ))}
          </span>
        )}
      </Cell>

      <Cell label="Tokens">
        {t.tokensOut === 0 ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <>
            <span>{tokens(t.tokensOut)} out</span>
            <span className="text-label text-fg-subtle">{tokens(t.tokensIn)} read</span>
          </>
        )}
      </Cell>
    </div>
  );

  if (!expandable) {
    return <li className="border-b border-border last:border-b-0">{summary}</li>;
  }

  // Time is the Vinaya log's alone: a timeline rebuilt from GitHub's summaries carries none.
  const timed = t.timeline.some((r) => r.developerMs !== undefined || r.reviewerMs !== undefined);
  const activeMs = t.timeline.reduce((sum, r) => sum + (r.developerMs ?? 0) + (r.reviewerMs ?? 0), 0);

  return (
    <li className="border-b border-border last:border-b-0">
      <details className="group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="relative cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {summary}
          <ChevronIcon className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-fg-subtle transition-transform duration-(--duration-fast) ease-out group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="flex flex-col gap-4 px-5 pb-5">
          <RoundTimeline timeline={t.timeline} scaleMs={scaleMs} humanRulings={t.humanRulingsCount} />
          <p className="text-label text-fg-subtle">
            {plural(t.timeline.length, "round")} ·{" "}
            {timed
              ? `${minutes(activeMs)} of developer and reviewer time.`
              : "Time per round isn't available: the Vinaya log has no record of this ticket's rounds."}{" "}
            {t.recovered && "The loop recovered from a platform failure on its own. "}
            {t.paused && "A human paused the loop at least once."}
          </p>
        </div>
      </details>
    </li>
  );
}

/** Points down; `group-open:rotate-180` turns it to point up once the ticket's `<details>` is open. */
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={className}>
      <path d="M6 9L12 15L18 9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TimeSplit({ timeSplit }: { timeSplit: NonNullable<DevLogView["timeSplit"]> }) {
  const { developerMs, reviewerMs, humanRulings, recoveredTickets } = timeSplit;
  const total = developerMs + reviewerMs;
  if (total === 0) return null;
  const devShare = Math.round((developerMs / total) * 100);
  return (
    <Reveal index={7} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <p className="font-mono text-label text-fg-subtle uppercase">Where the time goes</p>
      <div
        role="img"
        aria-label={`${devShare}% developer, ${100 - devShare}% reviewers`}
        className="flex h-3 overflow-hidden rounded-full bg-track"
      >
        <span className="h-full bg-primary" style={{ width: `${devShare}%` }} />
        <span className="h-full bg-notice" style={{ width: `${100 - devShare}%` }} />
      </div>
      <p className="flex flex-wrap gap-x-6 gap-y-1 text-small text-fg-muted">
        <span>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" aria-hidden />
          Developer writes the code: {minutes(developerMs)} ({devShare}%)
        </span>
        <span>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-notice align-middle" aria-hidden />
          Reviewers check it: {minutes(reviewerMs)} ({100 - devShare}%)
        </span>
      </p>
      <p className="text-small text-fg-subtle">
        Across every round the log has seen. {humanRulings > 0 && `Humans stepped in ${plural(humanRulings, "time")}. `}
        {recoveredTickets > 0 &&
          `The loop recovered from a platform failure on its own on ${plural(recoveredTickets, "ticket")}.`}
      </p>
    </Reveal>
  );
}

function Guardrails({
  guardrails,
  saved = false,
}: {
  guardrails: NonNullable<DevLogView["guardrails"]>;
  saved?: boolean;
}) {
  return (
    <Reveal index={8} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <p className="font-mono text-label text-fg-subtle uppercase">Guardrails</p>
      <p className="text-body">
        <span className="font-display text-stat tabular-nums">{guardrails.checks.toLocaleString("en-US")}</span>{" "}
        <span className="text-fg-muted">
          automated checks ran across {guardrails.runs.toLocaleString("en-US")} runs before code could be committed,
          pushed or merged.{" "}
          {guardrails.stopped > 0
            ? `${plural(guardrails.stopped, "run")} stopped a bad change.`
            : "None had to stop a change."}
        </span>
      </p>
      <p className="text-small text-fg-subtle">
        The rules are enforced by code, not by asking the AI politely.{" "}
        {saved
          ? "From the Vinaya log, as of the saved copy."
          : "Live from the Vinaya log, refreshed every few seconds."}
      </p>
    </Reveal>
  );
}

/** Everything the Vinaya log alone can show, for when GitHub has failed: no title, status, size or verdicts — those are GitHub's alone. Also used by `/system`. */
export function DegradedLogRecord({ view }: { view: DegradedLogView }) {
  const scaleMs = Math.max(
    1,
    ...view.tickets.flatMap((t) => t.timeline.map((r) => (r.developerMs ?? 0) + (r.reviewerMs ?? 0))),
  );
  const running = view.tickets.filter((t) => t.running);

  return (
    <>
      {running.length > 0 && (
        <Reveal index={0} className="flex flex-col gap-2">
          {running.map((t) => (
            <p key={t.issue} className="flex items-center gap-2 text-small text-notice">
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-notice" />
              Ticket #{t.issue} is being worked on right now.
            </p>
          ))}
        </Reveal>
      )}

      {view.timeSplit && <DegradedTimeSplit timeSplit={view.timeSplit} />}
      <Guardrails guardrails={view.guardrails} />

      {view.tickets.length > 0 && (
        <Reveal index={3} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-title">Round activity, from the Vinaya log</h2>
            <p className="text-small text-fg-muted">
              GitHub is unavailable, so ticket titles and status aren't shown here — only what the round-by-round log
              itself recorded.
            </p>
          </div>
          <ul className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
            {view.tickets.map((t) => (
              <li key={t.issue} className="flex flex-col gap-4 border-b border-border p-5 last:border-b-0">
                <span className="font-mono text-small text-fg-subtle">Ticket #{t.issue}</span>
                <RoundTimeline timeline={t.timeline} scaleMs={scaleMs} humanRulings={0} />
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </>
  );
}

function DegradedTimeSplit({ timeSplit }: { timeSplit: NonNullable<DegradedLogView["timeSplit"]> }) {
  const { developerMs, reviewerMs } = timeSplit;
  const total = developerMs + reviewerMs;
  if (total === 0) return null;
  const devShare = Math.round((developerMs / total) * 100);
  return (
    <Reveal index={2} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <p className="font-mono text-label text-fg-subtle uppercase">Where the time goes</p>
      <div
        role="img"
        aria-label={`${devShare}% developer, ${100 - devShare}% reviewers`}
        className="flex h-3 overflow-hidden rounded-full bg-track"
      >
        <span className="h-full bg-primary" style={{ width: `${devShare}%` }} />
        <span className="h-full bg-notice" style={{ width: `${100 - devShare}%` }} />
      </div>
      <p className="flex flex-wrap gap-x-6 gap-y-1 text-small text-fg-muted">
        <span>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" aria-hidden />
          Developer writes the code: {minutes(developerMs)} ({devShare}%)
        </span>
        <span>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-notice align-middle" aria-hidden />
          Reviewers check it: {minutes(reviewerMs)} ({100 - devShare}%)
        </span>
      </p>
      <p className="text-small text-fg-subtle">From the Vinaya log alone, while GitHub is unavailable.</p>
    </Reveal>
  );
}

/**
 * A moment in the viewer's own time zone. Server-rendered markup (the snapshot) and the render
 * that hydrates it print UTC instead — the server's zone is never the viewer's — and the local
 * time replaces it straight after. Exported for `/system`.
 */
export function LocalTime({ iso }: { iso: string }) {
  const hydrated = useHydrated();
  return <time dateTime={iso}>{hydrated ? localStamp(iso) : utcStamp(iso)}</time>;
}
