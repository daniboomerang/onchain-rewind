/**
 * This repo's development record, folded from GitHub (issues, pull requests, comments) and the
 * Vinaya round record (`src/server/vinaya/dev-record.functions.ts`, the previous task's read).
 *
 * A merged pull request's size and first commit never change, so once one is read its details are
 * held — in memory and on disk (`src/server/github/cache.ts`) — and never asked for again. A
 * failed refresh (GitHub's rate limit named as one, or any other failure) serves whatever record
 * is already held, in memory or, after a restart, from disk. State lives in this module for the
 * life of the server instance — best effort on a serverless host, same as `zerion/client.ts`'s
 * response cache and the Vinaya log read's own held state.
 */

import {
  buildDevelopmentRecord,
  type DevelopmentRecord,
  type MergedPullDetails,
  matchTasksToPulls,
  type RawGithubComment,
  type RawGithubCommit,
  type RawGithubIssue,
  type RawGithubPull,
} from "#/engine/github-dev-record.ts";
import { readDiskCache, writeDiskCache } from "#/server/github/cache.ts";
import {
  GITHUB_REPO,
  type GithubErrorCode,
  type GithubResult,
  githubGet,
  githubGetAllPages,
} from "#/server/github/client.ts";
import { readDevRecord as readVinayaLog } from "#/server/vinaya/dev-record.functions.ts";

export type GithubDevRecordResult = GithubResult<DevelopmentRecord>;

let heldRecord: DevelopmentRecord | undefined;
let heldMergedPulls = new Map<number, MergedPullDetails>();
let diskLoaded = false;
let inFlight: Promise<GithubDevRecordResult> | undefined;

export async function readGithubDevRecord(): Promise<GithubDevRecordResult> {
  if (inFlight) return inFlight;

  const attempt = refresh();
  inFlight = attempt;
  try {
    return await attempt;
  } finally {
    inFlight = undefined;
  }
}

function loadDiskCacheOnce(): void {
  if (diskLoaded) return;
  diskLoaded = true;
  const cache = readDiskCache();
  if (!cache) return;
  heldRecord = cache.record;
  heldMergedPulls = new Map(Object.entries(cache.mergedPulls).map(([number, details]) => [Number(number), details]));
}

async function refresh(): Promise<GithubDevRecordResult> {
  loadDiskCacheOnce();

  const issues = await githubGetAllPages<RawGithubIssue>(`/repos/${GITHUB_REPO}/issues`, { state: "all" });
  if (!issues.ok) return fallback(issues.error);

  const comments = await githubGetAllPages<RawGithubComment>(`/repos/${GITHUB_REPO}/issues/comments`);
  if (!comments.ok) return fallback(comments.error);

  const pulls = await readPullDetails(issues.data);
  if (!pulls.ok) return fallback(pulls.error);

  // The round record only enhances a task already built from GitHub (O2) — it is never a reason
  // this read fails, including a missing VINAYA_LOG_READ_TOKEN, which that module throws on.
  const logTasks = await readVinayaLog()
    .then((log) => (log.ok ? log.data.tasks : []))
    .catch(() => []);

  const record = buildDevelopmentRecord(issues.data, comments.data, pulls.pullDetails, pulls.firstCommits, logTasks);
  heldRecord = record;
  writeDiskCache({
    record,
    mergedPulls: Object.fromEntries([...heldMergedPulls].map(([number, details]) => [String(number), details])),
  });

  return { ok: true, data: record };
}

type PullReadResult =
  | {
      readonly ok: true;
      readonly pullDetails: ReadonlyMap<number, RawGithubPull>;
      readonly firstCommits: ReadonlyMap<number, RawGithubCommit | undefined>;
    }
  | { readonly ok: false; readonly error: GithubErrorCode };

/**
 * `/pulls/{n}` and `/pulls/{n}/commits?per_page=1`, once per candidate pull request — every pull
 * request that has ever closed a task, not just the first one seen, so the engine's `selectPull`
 * can tell a fresh merged attempt from a stale abandoned one by their actual merge status. Skipped
 * entirely for a pull request already known merged, whose details never change.
 */
async function readPullDetails(issues: readonly RawGithubIssue[]): Promise<PullReadResult> {
  const pullDetails = new Map<number, RawGithubPull>();
  const firstCommits = new Map<number, RawGithubCommit | undefined>();

  for (const { pulls } of matchTasksToPulls(issues).values()) {
    for (const pull of pulls) {
      const number = pull.number;
      if (pullDetails.has(number)) continue; // already read for another task's candidate list

      const known = pull.state === "closed" ? heldMergedPulls.get(number) : undefined;
      if (known) {
        pullDetails.set(number, {
          number,
          html_url: `https://github.com/${GITHUB_REPO}/pull/${number}`,
          state: "closed",
          merged: true,
          changed_files: known.filesChanged,
          additions: known.insertions,
          deletions: known.deletions,
        });
        firstCommits.set(
          number,
          known.firstCommitAt ? { commit: { author: { date: known.firstCommitAt } } } : undefined,
        );
        continue;
      }

      const detail = await githubGet<RawGithubPull>(`/repos/${GITHUB_REPO}/pulls/${number}`);
      if (!detail.ok) return { ok: false, error: detail.error };
      pullDetails.set(number, detail.data);

      const commits = await githubGet<RawGithubCommit[]>(`/repos/${GITHUB_REPO}/pulls/${number}/commits`, {
        per_page: 1,
      });
      if (!commits.ok) return { ok: false, error: commits.error };
      const firstCommit = commits.data[0];
      firstCommits.set(number, firstCommit);

      if (detail.data.merged) {
        heldMergedPulls.set(number, {
          filesChanged: detail.data.changed_files,
          insertions: detail.data.additions,
          deletions: detail.data.deletions,
          firstCommitAt: firstCommit?.commit.author?.date ?? firstCommit?.commit.committer?.date,
        });
      }
    }
  }

  return { ok: true, pullDetails, firstCommits };
}

function fallback(error: GithubErrorCode): GithubDevRecordResult {
  return heldRecord ? { ok: true, data: heldRecord } : { ok: false, error };
}

/** Test isolation only: drops every held record, merged-pull detail and the in-flight read. */
export function clearGithubDevRecordCache(): void {
  heldRecord = undefined;
  heldMergedPulls = new Map();
  diskLoaded = false;
  inFlight = undefined;
}
