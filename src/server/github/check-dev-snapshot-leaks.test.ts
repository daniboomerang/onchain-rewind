import { describe, expect, it } from "vitest";
import { findLeaks, tokenFingerprint } from "#/server/github/check-dev-snapshot-leaks.ts";

const env = {
  GITHUB_TOKEN: "github_pat_FAKEFAKEFAKE1234567890",
  VINAYA_LOG_READ_TOKEN: "vinaya-log-read-FAKE-0987654321",
  ZERION_API_KEY: undefined,
};

const found = (checks: ReturnType<typeof findLeaks>) => checks.filter((c) => c.found).map((c) => c.label);

describe("findLeaks", () => {
  it("passes a clean snapshot and client output, and still allows the variable names on the client", () => {
    const checks = findLeaks('{"takenAt":"2026-09-30T17:52:56.295Z"}', ["Set GITHUB_TOKEN on the server"], env);
    expect(found(checks)).toEqual([]);
    expect(checks.map((c) => c.label)).toContain("GITHUB_TOKEN value in the client output");
  });

  it("flags a token's name or value in the snapshot", () => {
    expect(found(findLeaks("VINAYA_LOG_READ_TOKEN", [], env))).toEqual(["VINAYA_LOG_READ_TOKEN name in the snapshot"]);
    expect(found(findLeaks(`x${env.GITHUB_TOKEN}x`, [], env))).toEqual(["GITHUB_TOKEN value in the snapshot"]);
  });

  it("flags a token's value in any client file", () => {
    expect(found(findLeaks(undefined, ["a", `Bearer ${env.VINAYA_LOG_READ_TOKEN}`], env))).toEqual([
      "VINAYA_LOG_READ_TOKEN value in the client output",
    ]);
  });

  it("matches on a token's tail, never its fixed prefix", () => {
    expect(tokenFingerprint("github_pat_FAKEFAKEFAKE1234567890")).toBe("KE1234567890");
    expect(found(findLeaks(undefined, ["github_pat_ appears in docs"], env))).toEqual([]);
  });
});
