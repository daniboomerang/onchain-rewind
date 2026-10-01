/**
 * The build step that takes the development snapshot (ADR-0006). `bun run build` runs this file
 * before `vite build`, which then bundles `dev-snapshot.json` into the server output.
 *
 * It reads through the same two readers the live page calls — `readDevRecord` for the Vinaya log,
 * `readGithubDevRecord` for GitHub — so the snapshot is exactly what a live read would have shown,
 * never a second mapping that could drift from it.
 *
 * It never fails the build. GitHub being missing, rate limited or unreachable writes no snapshot
 * (and removes any stale one), and the page falls back to its loader. The Vinaya log is optional:
 * when it can't be read the snapshot is written from GitHub alone, without log data. The build log
 * gets one line naming the source and its status, beside the clients' own HTTP-status lines —
 * never a token, an error object, a URL or a header, because a build log is visible to all of the team.
 */

import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readGithubDevRecord } from "#/server/github/dev-record.ts";
import { DEV_SNAPSHOT_FILE, type DevSnapshot } from "#/server/github/dev-snapshot.ts";
import { readDevRecord } from "#/server/vinaya/dev-record.functions.ts";

export type SnapshotAttempt =
  | {
      readonly ok: true;
      readonly snapshot: DevSnapshot;
      /** Set when the Vinaya log couldn't be read: the snapshot is GitHub's alone. */
      readonly logStatus?: string;
    }
  | { readonly ok: false; readonly source: "GitHub" | "Vinaya log" | "build"; readonly status: string };

/**
 * One read of both sources. GitHub goes first, because without it there is no snapshot worth
 * writing, so a failed GitHub read never spends a Vinaya log read for nothing. The log is
 * optional: a failed or refused read leaves `log` out and names its status in `logStatus`.
 */
export async function takeDevSnapshot(now: () => Date = () => new Date()): Promise<SnapshotAttempt> {
  const github = await readGithubDevRecord();
  if (!github.ok) return { ok: false, source: "GitHub", status: github.error };

  let log: Awaited<ReturnType<typeof readDevRecord>> | undefined;
  let logStatus: string | undefined;
  try {
    log = await readDevRecord();
    if (!log.ok) logStatus = log.error;
  } catch {
    // `log-client.ts` throws for one reason — no read token in the environment — but the fold
    // after it could too, so the status names what happened, not a guess at why.
    logStatus = "read threw before answering";
  }

  return {
    ok: true,
    logStatus,
    snapshot: {
      takenAt: now().toISOString(),
      github: github.data,
      log: log?.ok ? { tasks: log.data.tasks, guardrails: log.data.guardrails } : undefined,
    },
  };
}

/** Takes the snapshot and writes it beside `dev-snapshot.ts`, or removes the old one. Never throws. */
export async function writeDevSnapshot(path: string = defaultSnapshotPath()): Promise<SnapshotAttempt> {
  // A fresh disk-cache path for this one read: the GitHub reader falls back to its held record
  // on a failed refresh, and a stale cache left on a build machine must never pass as today's read.
  const previousCacheFile = process.env.DEVLOG_CACHE_FILE;
  const cacheFile = join(tmpdir(), `onchain-rewind-dev-snapshot-${randomBytes(8).toString("hex")}.json`);
  process.env.DEVLOG_CACHE_FILE = cacheFile;

  let attempt: SnapshotAttempt;
  try {
    attempt = await takeDevSnapshot();
  } catch {
    attempt = { ok: false, source: "build", status: "unexpected failure" };
  } finally {
    if (previousCacheFile === undefined) delete process.env.DEVLOG_CACHE_FILE;
    else process.env.DEVLOG_CACHE_FILE = previousCacheFile;
    rmSync(cacheFile, { force: true });
  }

  try {
    if (attempt.ok) {
      writeFileSync(path, JSON.stringify(attempt.snapshot), "utf8");
      console.warn(
        attempt.logStatus === undefined
          ? `dev snapshot: written, ${attempt.snapshot.github.tasks.length} tickets`
          : `dev snapshot: written from GitHub alone, ${attempt.snapshot.github.tasks.length} tickets, Vinaya log (${attempt.logStatus})`,
      );
    } else {
      rmSync(path, { force: true });
      console.warn(`dev snapshot: not written, ${attempt.source} (${attempt.status})`);
    }
  } catch {
    console.warn("dev snapshot: not written, the file could not be saved");
    return { ok: false, source: "build", status: "unwritable" };
  }
  return attempt;
}

function defaultSnapshotPath(): string {
  return fileURLToPath(new URL(`./${DEV_SNAPSHOT_FILE}`, import.meta.url));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeDevSnapshot();
}
