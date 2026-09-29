import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubGet, githubGetAllPages } from "#/server/github/client.ts";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("githubGet", () => {
  it("calls anonymously when GITHUB_TOKEN is unset", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await githubGet("/repos/daniboomerang/onchain-rewind/issues/35");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("sends GITHUB_TOKEN as a Bearer header when set", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-test-token");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await githubGet("/repos/daniboomerang/onchain-rewind/issues/35");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer gh-test-token");
  });

  it("names a spent primary rate limit distinctly from any other failure", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 403, { "x-ratelimit-remaining": "0" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await githubGet("/repos/daniboomerang/onchain-rewind/issues/35")).toEqual({
      ok: false,
      error: "rate_limited",
    });
  });

  it("names a 429 a rate limit too", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 429));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await githubGet("/repos/daniboomerang/onchain-rewind/issues/35")).toEqual({
      ok: false,
      error: "rate_limited",
    });
  });

  it("names any other non-2xx unreachable, never surfacing the upstream body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: "server exploded" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await githubGet("/repos/daniboomerang/onchain-rewind/issues/35")).toEqual({
      ok: false,
      error: "unreachable",
    });
  });

  it("names a network failure unreachable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await githubGet("/repos/daniboomerang/onchain-rewind/issues/35")).toEqual({
      ok: false,
      error: "unreachable",
    });
  });
});

describe("githubGetAllPages", () => {
  it('follows Link: rel="next" until GitHub stops sending one', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([{ id: 1 }], 200, { link: '<https://api.github.com/x?page=2>; rel="next"' }))
      .mockResolvedValueOnce(jsonResponse([{ id: 2 }], 200));
    vi.stubGlobal("fetch", fetchMock);

    const result = await githubGetAllPages("/repos/daniboomerang/onchain-rewind/issues");

    expect(result).toEqual({ ok: true, data: [{ id: 1 }, { id: 2 }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://api.github.com/x?page=2");
  });

  it("abandons the whole read when any page fails, rather than keeping a partial list", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([{ id: 1 }], 200, { link: '<https://api.github.com/x?page=2>; rel="next"' }))
      .mockResolvedValueOnce(jsonResponse({}, 403, { "x-ratelimit-remaining": "0" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await githubGetAllPages("/repos/daniboomerang/onchain-rewind/issues")).toEqual({
      ok: false,
      error: "rate_limited",
    });
  });
});
