import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

vi.mock("#/server/github/dev-record.ts", () => ({ readGithubDevRecord: vi.fn() }));
vi.mock("#/server/vinaya/dev-record.functions.ts", () => ({ readDevRecord: vi.fn() }));

import { readGithubDevRecord } from "#/server/github/dev-record.ts";
import { parseDevSnapshot } from "#/server/github/dev-snapshot.ts";
import { writeDevSnapshot } from "#/server/github/write-dev-snapshot.ts";
import { readDevRecord } from "#/server/vinaya/dev-record.functions.ts";

const FAKE_GITHUB_TOKEN = "github_pat_FAKEFAKEFAKE1234567890";
const FAKE_LOG_TOKEN = "vinaya-log-read-FAKE-0987654321";

const githubRecord = {
  tasks: [
    {
      issue: 40,
      title: "A ticket",
      status: "merged" as const,
      rounds: [],
      developerTokens: [],
      reviewerTokens: [],
      humanRulings: [],
    },
  ],
  totals: {
    tasksMerged: 1,
    developerMs: 0,
    reviewerMs: 0,
    secondRoundTasks: 0,
    findings: { blocker: 0, major: 0, minor: 0, critical: 0, high: 0, medium: 0, low: 0 },
    tokens: { developerIn: 0, developerOut: 0, reviewerIn: 0, reviewerOut: 0 },
    typicalSize: {},
    humanRulings: 0,
  },
};

const logRecord = { tasks: [], guardrails: { checks: 6, runs: 214, stopped: 9 } };

let dir: string;
let path: string;
let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dev-snapshot-test-"));
  path = join(dir, "dev-snapshot.json");
  vi.stubEnv("GITHUB_TOKEN", FAKE_GITHUB_TOKEN);
  vi.stubEnv("VINAYA_LOG_READ_TOKEN", FAKE_LOG_TOKEN);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.mocked(readGithubDevRecord).mockReset();
  vi.mocked(readDevRecord).mockReset();
  warn.mockRestore();
});

function buildLog(): string {
  return warn.mock.calls.map((call) => call.join(" ")).join("\n");
}

describe("writeDevSnapshot", () => {
  it("writes the mapped record and when it was taken, and nothing else", async () => {
    vi.mocked(readDevRecord).mockResolvedValue({ ok: true, data: logRecord });
    vi.mocked(readGithubDevRecord).mockResolvedValue({ ok: true, data: githubRecord });

    const attempt = await writeDevSnapshot(path);

    expect(attempt.ok).toBe(true);
    const written = readFileSync(path, "utf8");
    const parsed = parseDevSnapshot(JSON.parse(written));
    expect(parsed?.github).toEqual(githubRecord);
    expect(parsed?.log).toEqual(logRecord);
    expect(Object.keys(JSON.parse(written)).sort()).toEqual(["github", "log", "takenAt"]);
    for (const secret of [FAKE_GITHUB_TOKEN, FAKE_LOG_TOKEN, "GITHUB_TOKEN", "VINAYA_LOG_READ_TOKEN"]) {
      expect(written).not.toContain(secret);
    }
  });

  it("writes nothing and never reads GitHub when the Vinaya log has no read token", async () => {
    vi.mocked(readDevRecord).mockRejectedValue(new Error("VINAYA_LOG_READ_TOKEN is not set: …"));

    const attempt = await writeDevSnapshot(path);

    expect(attempt).toEqual({ ok: false, source: "Vinaya log", status: "read threw before answering" });
    expect(existsSync(path)).toBe(false);
    expect(readGithubDevRecord).not.toHaveBeenCalled();
    expect(buildLog()).toBe("dev snapshot: not written, Vinaya log (read threw before answering)");
  });

  it("removes a stale snapshot and logs only the source and status when GitHub is rate limited", async () => {
    writeFileSync(path, "{}", "utf8");
    vi.mocked(readDevRecord).mockResolvedValue({ ok: true, data: logRecord });
    vi.mocked(readGithubDevRecord).mockResolvedValue({ ok: false, error: "rate_limited" });

    const attempt = await writeDevSnapshot(path);

    expect(attempt).toEqual({ ok: false, source: "GitHub", status: "rate_limited" });
    expect(existsSync(path)).toBe(false);
    expect(buildLog()).toBe("dev snapshot: not written, GitHub (rate_limited)");
    expect(buildLog()).not.toContain(FAKE_GITHUB_TOKEN);
  });

  it("never throws, and writes nothing, when a reader throws unexpectedly", async () => {
    vi.mocked(readDevRecord).mockResolvedValue({ ok: true, data: logRecord });
    vi.mocked(readGithubDevRecord).mockRejectedValue(new Error(`boom ${FAKE_GITHUB_TOKEN}`));

    const attempt = await writeDevSnapshot(path);

    expect(attempt.ok).toBe(false);
    expect(existsSync(path)).toBe(false);
    expect(buildLog()).not.toContain(FAKE_GITHUB_TOKEN);
    expect(buildLog()).not.toContain("boom");
  });

  it("reads through a fresh disk-cache path, then restores the caller's", async () => {
    vi.stubEnv("DEVLOG_CACHE_FILE", "/somewhere/else.json");
    let seen: string | undefined;
    vi.mocked(readDevRecord).mockResolvedValue({ ok: true, data: logRecord });
    vi.mocked(readGithubDevRecord).mockImplementation(async () => {
      seen = process.env.DEVLOG_CACHE_FILE;
      return { ok: true, data: githubRecord };
    });

    await writeDevSnapshot(path);

    expect(seen).toMatch(/onchain-rewind-dev-snapshot-[0-9a-f]{16}\.json$/);
    expect(process.env.DEVLOG_CACHE_FILE).toBe("/somewhere/else.json");
  });
});
