import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLogEventsSince, LOG_PAGE_LIMIT } from "#/server/vinaya/log-client.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function envelope(seq: number) {
  return { seq, status: "ok", event: { meta: { ts: "2026-09-01T00:00:00Z" }, subject: {}, kind: "gate", event: "x" } };
}

beforeEach(() => {
  vi.stubEnv("VINAYA_LOG_READ_TOKEN", "test-read-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchLogEventsSince", () => {
  it("authenticates with a bearer token and asks for events after the given seq", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchLogEventsSince(42);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("after=42");
    expect(String(url)).toContain("limit=1000");
    expect((init as RequestInit).headers).toEqual({ Authorization: "Bearer test-read-token" });
  });

  it("pages until a page is short, concatenating every event", async () => {
    const fullPage = Array.from({ length: LOG_PAGE_LIMIT }, (_, i) => envelope(i + 1));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(fullPage))
      .mockResolvedValueOnce(jsonResponse([envelope(LOG_PAGE_LIMIT + 1)]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLogEventsSince(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`after=${LOG_PAGE_LIMIT}`);
    expect(result).toEqual({ ok: true, data: [...fullPage, envelope(LOG_PAGE_LIMIT + 1)] });
  });

  it("stops at once on an empty page", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchLogEventsSince(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("tells a rejected token apart from an unreachable log, and never retries a rejection", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const unauthorizedFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "nope" }, 401));
    vi.stubGlobal("fetch", unauthorizedFetch);
    expect(await fetchLogEventsSince(0)).toEqual({ ok: false, error: "unauthorized" });
    expect(unauthorizedFetch).toHaveBeenCalledTimes(1);

    const forbiddenFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "nope" }, 403));
    vi.stubGlobal("fetch", forbiddenFetch);
    expect(await fetchLogEventsSince(0)).toEqual({ ok: false, error: "unauthorized" });

    const brokenFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "boom" }, 500));
    vi.stubGlobal("fetch", brokenFetch);
    expect(await fetchLogEventsSince(0)).toEqual({ ok: false, error: "unreachable" });

    // The status is logged; nothing else — never the token, never a URL, never the response body.
    for (const call of errorSpy.mock.calls) {
      const line = call.join(" ");
      expect(line).not.toContain("test-read-token");
      expect(line).not.toContain("nope");
      expect(line).not.toContain("boom");
    }
  });

  it("reports a network failure as unreachable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchLogEventsSince(0)).toEqual({ ok: false, error: "unreachable" });
  });

  it("throws when the read token isn't configured, since that's a deployment fault", async () => {
    vi.stubEnv("VINAYA_LOG_READ_TOKEN", "");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([])));

    await expect(fetchLogEventsSince(0)).rejects.toThrow(/VINAYA_LOG_READ_TOKEN/);
  });
});
