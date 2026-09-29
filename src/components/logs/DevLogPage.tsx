import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { buildDevLogView, type DevLogView, type TicketView } from "../../engine/dev-log-view";
import { SEVERITIES, type TaskStatus } from "../../engine/github-dev-record";
import { getGithubDevRecord } from "../../server/github/dev-record.functions";
import { getDevRecord } from "../../server/vinaya/dev-record.functions";
import type { VinayaLogResult } from "../../server/vinaya/log-client";
import { duration, ease, enterCard, enterCardReduced, stagger } from "../rewind/motion";
import { localStamp, minutes, plural, tokens } from "./format";
import { RoundTimeline } from "./RoundTimeline";

const REPO = "https://github.com/daniboomerang/onchain-rewind";
const VINAYA = "https://vinaya.attalabs.dev";

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

export type LoadState = "loading" | "rate_limited" | "token_rejected" | "unreachable";

const STATE_MESSAGE: Record<LoadState, { headline: string; body: string } | undefined> = {
  loading: undefined,
  rate_limited: {
    headline: "GitHub's rate limit was hit",
    body: "Anonymous reads are capped at 60 an hour. Set GITHUB_TOKEN on the server to raise it, or wait a few minutes.",
  },
  token_rejected: {
    headline: "The Vinaya log rejected its token",
    body: "VINAYA_LOG_READ_TOKEN on the server is missing or no longer valid. Round-by-round detail and the guardrail totals stay hidden until it's fixed.",
  },
  unreachable: {
    headline: "The development log couldn't be reached",
    body: "GitHub or the Vinaya log didn't answer. This refreshes on its own every few seconds — no need to reload.",
  },
};

/** One state message, used by the page and by `/system`'s fixtures. */
export function StateMessage({ state }: { state: LoadState }) {
  if (state === "loading") return <p className="text-fg-muted">Reading the project record…</p>;
  const message = STATE_MESSAGE[state];
  if (!message) return null;
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-6">
      <p className="font-display text-title text-negative">{message.headline}</p>
      <p className="text-body text-fg-muted">{message.body}</p>
    </div>
  );
}

export function DevLogPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="min-h-dvh bg-bg px-10 py-12 text-fg max-sm:px-5">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8">
        <header className="flex max-w-[720px] flex-col gap-3">
          <p className="font-mono text-label text-fg-subtle uppercase">Onchain Rewind</p>
          <h1 className="font-display text-headline">Project development logs</h1>
          <p className="text-body text-fg-muted">
            How this app was built. Every ticket is planned, coded by an AI developer, checked by two independent AI
            reviewers, then merged. Nothing here is typed in by hand: it is read live from{" "}
            <a className="underline underline-offset-2" href={REPO} rel="noreferrer" target="_blank">
              GitHub
            </a>{" "}
            and the Vinaya log.
          </p>
        </header>

        {mounted ? <DevLogData /> : <StateMessage state="loading" />}

        <footer className="border-t border-border pt-6 text-small text-fg-muted">
          Made with{" "}
          <a
            className="font-medium text-fg underline underline-offset-2"
            href={VINAYA}
            rel="noreferrer"
            target="_blank"
          >
            Vinaya
          </a>
        </footer>
      </div>
    </main>
  );
}

function DevLogData() {
  const github = useQuery({
    queryKey: ["dev-log", "github"],
    queryFn: () => getGithubDevRecord(),
    staleTime: 0,
    refetchInterval: POLL_MS,
  });
  const vinaya = useQuery({
    queryKey: ["dev-log", "vinaya"],
    queryFn: () => getDevRecord(),
    staleTime: 0,
    refetchInterval: POLL_MS,
  });

  const view = useMemo(() => {
    if (!github.data?.ok) return undefined;
    const log = vinaya.data?.ok
      ? { tasks: vinaya.data.data.tasks, guardrails: vinaya.data.data.guardrails }
      : undefined;
    return buildDevLogView(github.data.data, log);
  }, [github.data, vinaya.data]);

  if (github.isPending) return <StateMessage state="loading" />;
  if (github.data && !github.data.ok) {
    return <StateMessage state={github.data.error === "rate_limited" ? "rate_limited" : "unreachable"} />;
  }
  if (!view) return <StateMessage state="loading" />;

  const vinayaProblem = vinayaState(vinaya);

  return (
    <>
      <DevLogRecord view={view} />
      {vinayaProblem && <StateMessage state={vinayaProblem} />}
    </>
  );
}

/**
 * The one state the Vinaya read can be in worth telling the visitor about, or `null` when it's
 * fine. `getDevRecord` only ever throws for one reason (`log-client.ts`'s own missing-token
 * check — every other failure it meets, network or upstream, comes back as a typed `unreachable`
 * or `unauthorized` result instead) — so a query that errored without ever producing a result is
 * that one thrown case, read here as "token rejected" the same as the typed `unauthorized` result.
 * Guardrails and the round-by-round timeline both need this read; the ticket list and headline
 * numbers don't, so this never blocks the page the way a failed GitHub read does.
 */
function vinayaState(vinaya: { data?: VinayaLogResult<unknown>; isError: boolean }): LoadState | null {
  if (vinaya.isError) return "token_rejected";
  if (vinaya.data && !vinaya.data.ok) return vinaya.data.error === "unauthorized" ? "token_rejected" : "unreachable";
  return null;
}

function Reveal({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      variants={reduce ? enterCardReduced : enterCard}
      initial="hidden"
      animate="show"
      transition={{ delay: reduce ? 0 : index * stagger.children }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/** The whole record: milestone, headline numbers, time split, guardrails and the ticket list. Also used by `/system`. */
export function DevLogRecord({ view }: { view: DevLogView }) {
  const { milestone, headline } = view;
  const scaleMs = Math.max(
    1,
    ...view.tickets.flatMap((t) => t.timeline.map((r) => (r.developerMs ?? 0) + (r.reviewerMs ?? 0))),
  );
  const severityLine =
    SEVERITIES.filter((s) => headline.findings[s] > 0)
      .map((s) => `${headline.findings[s]} ${s}`)
      .join(" · ") || "none";

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

      {view.workingNow.length > 0 && (
        <Reveal index={1} className="flex flex-col gap-2">
          {view.workingNow.map((w) => (
            <p key={w.issue} className="flex items-center gap-2 text-small text-notice">
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-notice" />
              {w.role === "developer" ? "The developer" : "Reviewers"} are working on ticket #{w.issue} — {w.title} —
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
          note={`Raised by reviewers before merge: ${severityLine}.`}
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
      {view.guardrails && <Guardrails guardrails={view.guardrails} />}

      <Reveal index={9} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-title">Ticket by ticket</h2>
          <p className="text-small text-fg-muted">
            <strong className="font-medium text-fg">Rounds</strong> is how many times the developer and reviewers went
            back and forth. <strong className="font-medium text-fg">Problems</strong> are what the reviewers raised, by
            severity — not every problem stops a merge; some are recorded and fixed later.
          </p>
        </div>
        <ul className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
          <li className="grid grid-cols-[minmax(0,3fr)_110px_100px_130px_minmax(0,2fr)_130px] gap-4 border-b border-border px-5 py-3 font-mono text-label text-fg-subtle uppercase max-lg:hidden">
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
  return (
    <div role="img" aria-label={label} className="h-2.5 overflow-hidden rounded-full bg-track">
      <motion.div
        className="h-full origin-left rounded-full bg-positive"
        initial={{ scaleX: reduce ? value : 0 }}
        animate={{ scaleX: value }}
        transition={{ duration: reduce ? 0 : duration.grow, ease: ease.out, delay: reduce ? 0 : duration.base }}
      />
    </div>
  );
}

function Stat({ index, label, value, note }: { index: number; label: string; value: string; note: string }) {
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
  const problems = SEVERITIES.filter((s) => t.findings[s] > 0);
  const expandable = t.timeline.length > 0;

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
        ) : problems.length === 0 ? (
          <span className="text-fg-muted">None raised</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {problems.map((s) => (
              <span key={s} className={`rounded-full px-2 py-0.5 text-label ${SEVERITY_TONE[s]}`}>
                {t.findings[s]} {s}
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

  const activeMs = t.timeline.reduce((sum, r) => sum + (r.developerMs ?? 0) + (r.reviewerMs ?? 0), 0);

  return (
    <li className="border-b border-border last:border-b-0">
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{summary}</summary>
        <div className="flex flex-col gap-4 px-5 pb-5">
          <RoundTimeline timeline={t.timeline} scaleMs={scaleMs} humanRulings={t.humanRulingsCount} />
          <p className="text-label text-fg-subtle">
            {plural(t.timeline.length, "round")} · {minutes(activeMs)} of developer and reviewer time.{" "}
            {t.recovered && "The loop recovered from a platform failure on its own. "}
            {t.paused && "A human paused the loop at least once."}
          </p>
        </div>
      </details>
    </li>
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

function Guardrails({ guardrails }: { guardrails: NonNullable<DevLogView["guardrails"]> }) {
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
        The rules are enforced by code, not by asking the AI politely. Live from the Vinaya log, refreshed every few
        seconds.
      </p>
    </Reveal>
  );
}

/** Exported for `/system`: a client-only time, used nowhere during server rendering. */
export function LocalTime({ iso }: { iso: string }) {
  return <>{localStamp(iso)}</>;
}
