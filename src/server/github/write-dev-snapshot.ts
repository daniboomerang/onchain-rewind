/**
 * The build step that takes the development snapshot (ADR-0006). `bun run build` runs this file
 * before `vite build`, which then bundles `dev-snapshot.json` into the server output.
 *
 * It reads through the same two readers the live page calls — `readDevRecord` for the Vinaya log,
 * `readGithubDevRecord` for GitHub — so the snapshot is exactly what a live read would have shown,
 * never a second mapping that could drift from it.
 *
 * It never fails the build. A missing token, a rate limit or an unreachable source writes no
 * snapshot (and removes any stale one), and the page falls back to its loader. The build log gets
 * one line naming the source and its status, beside the clients' own HTTP-status lines — never a
 * token, an error object, a URL or a header, because a build log is visible to all of the team.
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
  | { readonly ok: true; readonly snapshot: DevSnapshot }
  | { readonly ok: false; readonly source: "GitHub" | "Vinaya log" | "build"; readonly status: string };

/**
 * One read of both sources. The Vinaya log goes first: it is one cheap read, and without it there
 * is no snapshot worth writing, so a missing token never spends GitHub's requests for nothing.
 */
export async function takeDevSnapshot(now: () => Date = () => new Date()): Promise<SnapshotAttempt> {
  let log: Awaited<ReturnType<typeof readDevRecord>>;
  try {
    log = await readDevRecord();
  } catch {
    // `log-client.ts` throws for one reason only: no read token in the environment.
    return { ok: false, source: "Vinaya log", status: "no read token" };
  }
  if (!log.ok) return { ok: false, source: "Vinaya log", status: log.error };

  const github = await readGithubDevRecord();
  if (!github.ok) return { ok: false, source: "GitHub", status: github.error };

  return {
    ok: true,
    snapshot: {
      takenAt: now().toISOString(),
      github: github.data,
      log: { tasks: log.data.tasks, guardrails: log.data.guardrails },
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
      console.warn(`dev snapshot: written, ${attempt.snapshot.github.tasks.length} tickets`);
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
