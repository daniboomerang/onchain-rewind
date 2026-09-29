import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGithubDevRecordCache, readGithubDevRecord } from "#/server/github/dev-record.ts";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => "",
  } as unknown as Response;
}

const REPO = "daniboomerang/onchain-rewind";
const API = "https://api.github.com";

const taskIssue35 = {
  number: 35,
  title: "[rewind-v1] 21 — a task",
  state: "open",
  body: null,
  labels: ["vinaya/tier:1", "vinaya/tranche:rewind-v1"],
};

function pullFor(closes: number, number: number, state = "closed") {
  return {
    number,
    title: `pr for ${closes}`,
    state,
    body: `Closes #${closes}`,
    labels: [],
    pull_request: { url: `${API}/…` },
  };
}

function pullDetail(number: number, merged = true) {
  return {
    number,
    html_url: `https://github.com/${REPO}/pull/${number}`,
    state: "closed",
    merged,
    changed_files: 3,
    additions: 40,
    deletions: 5,
  };
}

function commits(date: string) {
  return [{ commit: { author: { date } } }];
}

/** Dispatches by URL, so GitHub's several endpoints and the Vinaya log's own fetch can coexist. */
function routedFetch(routes: ReadonlyMap<string, () => Response>) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    for (const [prefix, respond] of routes) {
      if (url.startsWith(prefix)) return respond();
    }
    throw new Error(`unmocked fetch: ${url}`);
  });
}

function noVinayaLog(): Map<string, () => Response> {
  // No VINAYA_LOG_READ_TOKEN is stubbed in these tests, so `fetchLogEventsSince` throws before
  // ever calling fetch — this repo's GitHub-only read must not depend on it.
  return new Map();
}

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "devlog-cache-"));
  vi.stubEnv("DEVLOG_CACHE_FILE", join(cacheDir, "cache.json"));
  clearGithubDevRecordCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearGithubDevRecordCache();
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("readGithubDevRecord", () => {
  it("builds a development record from GitHub alone when the Vinaya log token is unset", async () => {
    const routes = noVinayaLog();
    routes.set(`${API}/repos/${REPO}/issues/comments`, () => jsonResponse([]));
    routes.set(`${API}/repos/${REPO}/pulls/50/commits`, () => jsonResponse(commits("2026-09-28T09:00:00Z")));
    routes.set(`${API}/repos/${REPO}/pulls/50`, () => jsonResponse(pullDetail(50)));
    routes.set(`${API}/repos/${REPO}/issues`, () => jsonResponse([taskIssue35, pullFor(35, 50)]));
    vi.stubGlobal("fetch", routedFetch(routes));

    const result = await readGithubDevRecord();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tasks).toHaveLength(1);
    expect(result.data.tasks[0]?.status).toBe("merged");
    expect(result.data.totals.tasksMerged).toBe(1);
  });

  it("never reads a merged pull request's /pulls/{n} or its commits twice", async () => {
    let pullCalls = 0;
    let commitCalls = 0;
    const routes = noVinayaLog();
    routes.set(`${API}/repos/${REPO}/issues/comments`, () => jsonResponse([]));
    routes.set(`${API}/repos/${REPO}/pulls/50/commits`, () => {
      commitCalls++;
      return jsonResponse(commits("2026-09-28T09:00:00Z"));
    });
    routes.set(`${API}/repos/${REPO}/pulls/50`, () => {
      pullCalls++;
      return jsonResponse(pullDetail(50));
    });
    routes.set(`${API}/repos/${REPO}/issues`, () => jsonResponse([taskIssue35, pullFor(35, 50)]));
    vi.stubGlobal("fetch", routedFetch(routes));

    await readGithubDevRecord();
    await readGithubDevRecord();

    expect(pullCalls).toBe(1);
    expect(commitCalls).toBe(1);
  });

  it("keeps serving the last record when a refresh fails, naming a rate limit as one", async () => {
    const routes = noVinayaLog();
    routes.set(`${API}/repos/${REPO}/issues/comments`, () => jsonResponse([]));
    routes.set(`${API}/repos/${REPO}/pulls/50/commits`, () => jsonResponse(commits("2026-09-28T09:00:00Z")));
    routes.set(`${API}/repos/${REPO}/pulls/50`, () => jsonResponse(pullDetail(50)));
    routes.set(`${API}/repos/${REPO}/issues`, () => jsonResponse([taskIssue35, pullFor(35, 50)]));
    const fetchMock = routedFetch(routes);
    vi.stubGlobal("fetch", fetchMock);

    const first = await readGithubDevRecord();

    fetchMock.mockImplementation(async () => jsonResponse({}, 403, { "x-ratelimit-remaining": "0" }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const second = await readGithubDevRecord();

    expect(second).toEqual(first);
  });

  it("returns the named rate limit when nothing has ever been held", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 403, { "x-ratelimit-remaining": "0" })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await readGithubDevRecord()).toEqual({ ok: false, error: "rate_limited" });
  });

  it("serves the record held on disk after a restart, when the live refresh then fails", async () => {
    const routes = noVinayaLog();
    routes.set(`${API}/repos/${REPO}/issues/comments`, () => jsonResponse([]));
    routes.set(`${API}/repos/${REPO}/pulls/50/commits`, () => jsonResponse(commits("2026-09-28T09:00:00Z")));
    routes.set(`${API}/repos/${REPO}/pulls/50`, () => jsonResponse(pullDetail(50)));
    routes.set(`${API}/repos/${REPO}/issues`, () => jsonResponse([taskIssue35, pullFor(35, 50)]));
    vi.stubGlobal("fetch", routedFetch(routes));

    const beforeRestart = await readGithubDevRecord();

    // Simulate a restart: the in-memory holder is gone, but the disk file (written on the read
    // above, at the same DEVLOG_CACHE_FILE path) still is.
    clearGithubDevRecordCache();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 403, { "x-ratelimit-remaining": "0" })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const afterRestart = await readGithubDevRecord();

    expect(afterRestart).toEqual(beforeRestart);
  });
});
