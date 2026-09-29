/**
 * The development record's disk cache: the last good record (served on a restart or a rate
 * limit) plus the never-changing details of every merged pull request already read once. Lives
 * under `os.tmpdir()` — `DEVLOG_CACHE_FILE` overrides the path for tests. Best effort only: on
 * Vercel `/tmp` is writable but doesn't persist between invocations, so every read and write here
 * is wrapped and never throws — a cache miss just means asking GitHub again.
 *
 * `/tmp` can be shared with other local users or processes on some hosts, so this never opens the
 * fixed cache path directly: a write goes to a fresh, unpredictable temp name first and is then
 * renamed onto the real path (renaming replaces whatever sits there — file or symlink — without
 * ever following it), and a read refuses anything at the fixed path that isn't a plain regular
 * file. Neither a pre-planted symlink at the well-known path nor a crafted file substituted there
 * can redirect a write or get trusted as a read.
 *
 * Never imported from a `*.functions.ts` file: `node:fs` leaks into the client bundle from there.
 */

import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DevelopmentRecord, MergedPullDetails } from "#/engine/github-dev-record.ts";

export type DiskCache = {
  readonly record: DevelopmentRecord;
  /** Keyed by pull request number, as a string (JSON object keys are always strings). */
  readonly mergedPulls: Readonly<Record<string, MergedPullDetails>>;
};

function cacheFilePath(): string {
  return process.env.DEVLOG_CACHE_FILE || join(tmpdir(), "onchain-rewind-devlog-cache.json");
}

export function readDiskCache(): DiskCache | undefined {
  const path = cacheFilePath();
  try {
    // lstat, not stat: a symlink at this exact path must never be followed and trusted as ours.
    if (!lstatSync(path).isFile()) return undefined;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isDiskCache(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeDiskCache(cache: DiskCache): void {
  const path = cacheFilePath();
  const tmpPath = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    // "wx": fails if the (unpredictable) temp name already exists, so nothing could have
    // pre-planted a symlink there. The rename that follows then replaces the fixed path outright.
    writeFileSync(tmpPath, JSON.stringify(cache), { encoding: "utf8", flag: "wx" });
    renameSync(tmpPath, path);
  } catch {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Nothing to clean up — the write itself never landed.
    }
    // Best effort — a read-only /tmp or a full disk never breaks the record itself.
  }
}

function isDiskCache(value: unknown): value is DiskCache {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.record === "object" && record.record !== null && typeof record.mergedPulls === "object";
}
