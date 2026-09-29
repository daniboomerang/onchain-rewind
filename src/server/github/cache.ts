/**
 * The development record's disk cache: the last good record (served on a restart or a rate
 * limit) plus the never-changing details of every merged pull request already read once. Lives
 * under `os.tmpdir()` — `DEVLOG_CACHE_FILE` overrides the path for tests. Best effort only: on
 * Vercel `/tmp` is writable but doesn't persist between invocations, so every read and write here
 * is wrapped and never throws — a cache miss just means asking GitHub again.
 *
 * Never imported from a `*.functions.ts` file: `node:fs` leaks into the client bundle from there.
 */

import { readFileSync, writeFileSync } from "node:fs";
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
  try {
    const text = readFileSync(cacheFilePath(), "utf8");
    const parsed = JSON.parse(text) as unknown;
    return isDiskCache(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeDiskCache(cache: DiskCache): void {
  try {
    writeFileSync(cacheFilePath(), JSON.stringify(cache), "utf8");
  } catch {
    // Best effort — a read-only /tmp or a full disk never breaks the record itself.
  }
}

function isDiskCache(value: unknown): value is DiskCache {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.record === "object" && record.record !== null && typeof record.mergedPulls === "object";
}
