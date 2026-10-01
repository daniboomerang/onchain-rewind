import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDevRecordCache, readDevRecord, SKIPPED_ISSUES } from "#/server/vinaya/dev-record.functions.ts";

/** Mimics the endpoint's real `content-type: application/x-ndjson` body: one object per line. */
function ndjsonResponse(lines: readonly unknown[], status = 200): Response {
  const body = lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length > 0 ? "\n" : "");
  return { ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response;
}

function errorResponse(body: unknown, status: number): Response {
  return { ok: false, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

function gateEnvelope(seq: number) {
  return {
    seq,
    status: "ok",
    event: {
      meta: { ts: "2026-09-01T00:00:00Z" },
      subject: {},
      kind: "gate",
      event: "check_run",
      check: "Check types",
      outcome: "pass",
    },
  };
}

function issueEnvelope(seq: number, issue: number, event: string, fields: Record<string, unknown> = {}) {
  return {
    seq,
    status: "ok",
    event: { meta: { ts: `2026-09-01T00:00:0${seq}Z` }, subject: { issue }, kind: "dev_review_loop", event, ...fields },
  };
}

function issueGateEnvelope(seq: number, issue: number) {
  const gate = gateEnvelope(seq);
  return { ...gate, event: { ...gate.event, subject: { issue }, outcome: "fail" } };
}

function requestedAfter(url: unknown): string | null {
  return new URL(String(url)).searchParams.get("after");
}

beforeEach(() => {
  vi.stubEnv("VINAYA_LOG_READ_TOKEN", "test-read-token");
  clearDevRecordCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearDevRecordCache();
});

describe("readDevRecord", () => {
  it("reads the whole log from after=0 on the first call, and folds it", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ndjsonResponse([gateEnvelope(1)]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await readDevRecord();

    expect(requestedAfter(fetchMock.mock.calls[0]?.[0])).toBe("0");
    expect(result).toEqual({ ok: true, data: { tasks: [], guardrails: { checks: 1, runs: 1, stopped: 0 } } });
  });

  it("leaves every skipped Issue's events out of the tickets and the guardrail totals", async () => {
    expect([...SKIPPED_ISSUES]).toEqual([65, 75, 78, 80]);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        ndjsonResponse([
          issueEnvelope(1, 75, "round_started", { round: 1 }),
          issueEnvelope(2, 75, "round_ended", { round: 1, outcome: "green" }),
          issueGateEnvelope(3, 80),
          issueEnvelope(4, 82, "round_started", { round: 1 }),
          gateEnvelope(5),
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await readDevRecord();

    expect(result.ok && result.data.tasks.map((task) => task.issue)).toEqual([82]);
    expect(result.ok && result.data.guardrails).toEqual({ checks: 1, runs: 1, stopped: 0 });
  });

  it("asks only for events after the last one held on the next read", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ndjsonResponse([gateEnvelope(1), gateEnvelope(2)]))
      .mockResolvedValueOnce(ndjsonResponse([gateEnvelope(3)]));
    vi.stubGlobal("fetch", fetchMock);

    await readDevRecord();
    const second = await readDevRecord();

    expect(requestedAfter(fetchMock.mock.calls[1]?.[0])).toBe("2");
    expect(second).toEqual({ ok: true, data: { tasks: [], guardrails: { checks: 1, runs: 3, stopped: 0 } } });
  });

  it("shares one read between concurrent callers", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = readDevRecord();
    const second = readDevRecord();
    resolveFetch(ndjsonResponse([gateEnvelope(1)]));

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(secondResult);
  });

  it("keeps serving what is held when a refresh fails", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ndjsonResponse([gateEnvelope(1)]))
      .mockResolvedValueOnce(errorResponse({ error: "boom" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const first = await readDevRecord();
    const second = await readDevRecord();

    expect(second).toEqual(first);
    expect(second).toEqual({ ok: true, data: { tasks: [], guardrails: { checks: 1, runs: 1, stopped: 0 } } });
  });

  it("returns the typed error when a failing read has nothing held yet", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(errorResponse({ error: "nope" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await readDevRecord()).toEqual({ ok: false, error: "unauthorized" });
  });
});

describe("readDevRecord — a missing read token", () => {
  it("returns a typed failure instead of throwing, and logs the detail on the server only", async () => {
    vi.stubEnv("VINAYA_LOG_READ_TOKEN", "");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await readDevRecord();

    expect(result).toEqual({ ok: false, error: "unauthorized" });
    expect(JSON.stringify(result)).not.toContain("VINAYA_LOG_READ_TOKEN");
    expect(logged).toHaveBeenCalledWith("vinaya log read not attempted: VINAYA_LOG_READ_TOKEN is not set");
  });
});
