import type { RoundTimelineEntry } from "../../engine/dev-log-view";
import { SEVERITIES } from "../../engine/github-dev-record";
import { minutes, plural } from "./format";

const OUTCOME: Record<string, { label: string; tone: string; bar: string }> = {
  green: { label: "Approved", tone: "bg-positive/15 text-positive", bar: "bg-positive" },
  changes_requested: { label: "Changes requested", tone: "bg-notice/15 text-notice", bar: "bg-notice" },
};
const IN_PROGRESS = { label: "In progress", tone: "bg-surface-raised text-fg-muted", bar: "bg-fg-subtle" };

function findingsLine(findings: RoundTimelineEntry["findings"]): string {
  const parts = SEVERITIES.filter((severity) => findings[severity] > 0).map(
    (severity) => `${findings[severity]} ${severity}`,
  );
  return parts.length > 0 ? parts.join(" · ") : "Nothing raised";
}

/** Developer and reviewer bars on one shared scale, so every round on the page compares fairly. */
export function RoundTimeline({
  timeline,
  scaleMs,
  humanRulings,
}: {
  timeline: readonly RoundTimelineEntry[];
  scaleMs: number;
  humanRulings: number;
}) {
  const seen = new Map<number, number>();
  const keyed = timeline.map((entry) => {
    const occurrence = seen.get(entry.round) ?? 0;
    seen.set(entry.round, occurrence + 1);
    return { entry, key: `${entry.round}-${occurrence}` };
  });

  return (
    <ol className="flex flex-col gap-4">
      {keyed.map(({ entry, key }) => {
        const outcome = entry.outcome ? (OUTCOME[entry.outcome] ?? IN_PROGRESS) : IN_PROGRESS;
        const dev = entry.developerMs ?? 0;
        const review = entry.reviewerMs ?? 0;
        // Time is the Vinaya log's alone: a round it never measured shows no bar, never a zero.
        const timed = entry.developerMs !== undefined || entry.reviewerMs !== undefined;
        return (
          <li key={key} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-small">
              <span className="text-fg-subtle">
                Round {entry.round}
                {entry.repeat ? ` · re-review${humanRulings > 0 ? " after a human ruling" : ""}` : ""}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-label font-medium ${outcome.tone}`}>{outcome.label}</span>
              {entry.confidence && (
                <span className="text-label text-fg-muted" title={entry.confidence.reason}>
                  Confidence {entry.confidence.value}%
                </span>
              )}
            </div>
            {timed ? (
              <>
                <div
                  role="img"
                  aria-label={`Developer ${minutes(entry.developerMs)}, reviewers ${minutes(entry.reviewerMs)}`}
                  className="flex h-2.5 overflow-hidden rounded-full bg-track"
                >
                  <span
                    className="h-full bg-primary"
                    style={{ width: scaleMs > 0 ? `${(dev / scaleMs) * 100}%` : 0 }}
                  />
                  <span
                    className="h-full bg-notice"
                    style={{ width: scaleMs > 0 ? `${(review / scaleMs) * 100}%` : 0 }}
                  />
                </div>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-label text-fg-muted">
                  <span>
                    <span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" aria-hidden />
                    Developer {minutes(entry.developerMs)}
                  </span>
                  <span>
                    <span className="mr-1.5 inline-block size-2 rounded-full bg-notice align-middle" aria-hidden />
                    Reviewers {minutes(entry.reviewerMs)}
                  </span>
                  {entry.filesChanged !== undefined && (
                    <span>
                      {plural(entry.filesChanged, "file")} · +{(entry.insertions ?? 0).toLocaleString("en-US")} −
                      {(entry.deletions ?? 0).toLocaleString("en-US")}
                    </span>
                  )}
                </p>
              </>
            ) : (
              <>
                {/* Colour shows the outcome only: the same full width for every untimed round, never a duration. */}
                <div
                  role="img"
                  aria-label={`${outcome.label}, time isn't available for this round`}
                  className="h-2.5 overflow-hidden rounded-full bg-track"
                >
                  <span className={`block h-full w-full ${outcome.bar}`} />
                </div>
                <p className="text-label text-fg-muted">Time isn't available for this round.</p>
              </>
            )}
            <p className="text-label text-fg-subtle">Problems raised: {findingsLine(entry.findings)}</p>
          </li>
        );
      })}
    </ol>
  );
}
