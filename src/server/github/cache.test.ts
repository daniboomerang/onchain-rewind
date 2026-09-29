import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevelopmentRecord } from "#/engine/github-dev-record.ts";
import { readDiskCache, writeDiskCache } from "#/server/github/cache.ts";

const record: DevelopmentRecord = {
  tasks: [],
  totals: {
    tasksMerged: 0,
    developerMs: 0,
    reviewerMs: 0,
    secondRoundTasks: 0,
    findings: { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 },
    tokens: { developerIn: 0, developerOut: 0, reviewerIn: 0, reviewerOut: 0 },
    typicalSize: {},
    humanRulings: 0,
  },
};

let dir: string;
let cachePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "devlog-cache-test-"));
  cachePath = join(dir, "cache.json");
  vi.stubEnv("DEVLOG_CACHE_FILE", cachePath);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("writeDiskCache / readDiskCache", () => {
  it("round-trips a record written to disk", () => {
    writeDiskCache({ record, mergedPulls: { "50": { filesChanged: 1, insertions: 2, deletions: 3 } } });
    expect(readDiskCache()).toEqual({
      record,
      mergedPulls: { "50": { filesChanged: 1, insertions: 2, deletions: 3 } },
    });
  });

  it("never follows a symlink pre-planted at the cache path when reading", () => {
    const target = join(dir, "elsewhere-secret.json");
    writeFileSync(target, JSON.stringify({ planted: true }), "utf8");
    symlinkSync(target, cachePath);

    expect(readDiskCache()).toBeUndefined();
    // The symlink's real target is untouched — a read never follows it.
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ planted: true });
  });

  it("replaces a symlink pre-planted at the cache path with a real file when writing, never writing through it", () => {
    const target = join(dir, "elsewhere.json");
    writeFileSync(target, "should never change", "utf8");
    symlinkSync(target, cachePath);

    writeDiskCache({ record, mergedPulls: {} });

    // The path now holds this app's own regular file, not the symlink, and the symlink's real
    // target was never opened or written through.
    expect(readFileSync(target, "utf8")).toBe("should never change");
    expect(JSON.parse(readFileSync(cachePath, "utf8"))).toEqual({ record, mergedPulls: {} });
  });

  it("leaves no leftover temp file after a successful write", () => {
    writeDiskCache({ record, mergedPulls: {} });
    const leftovers = readdirSync(dir).filter((name) => name.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("returns undefined for a missing cache file, never throwing", () => {
    expect(existsSync(cachePath)).toBe(false);
    expect(readDiskCache()).toBeUndefined();
  });
});
