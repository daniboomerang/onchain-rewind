import { describe, expect, it } from "vitest";
import { parseDevSnapshot, readDevSnapshot } from "#/server/github/dev-snapshot.ts";

const githubRecord = {
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

const logRecord = { tasks: [], guardrails: { checks: 6, runs: 214, stopped: 9 } };

describe("parseDevSnapshot", () => {
  it("accepts a snapshot the build wrote", () => {
    const snapshot = { takenAt: "2026-09-30T17:52:56.295Z", github: githubRecord, log: logRecord };
    expect(parseDevSnapshot(snapshot)).toBe(snapshot);
  });

  it("refuses anything else", () => {
    expect(parseDevSnapshot(undefined)).toBeUndefined();
    expect(parseDevSnapshot({})).toBeUndefined();
    expect(parseDevSnapshot({ takenAt: "not a date", github: githubRecord, log: logRecord })).toBeUndefined();
    expect(parseDevSnapshot({ takenAt: "2026-09-30T17:52:56.295Z", github: {}, log: logRecord })).toBeUndefined();
    expect(parseDevSnapshot({ takenAt: "2026-09-30T17:52:56.295Z", github: githubRecord })).toBeUndefined();
  });
});

describe("readDevSnapshot", () => {
  // The file is a build output, present after a build with both tokens and absent otherwise, so
  // this holds either way: a snapshot that parses, or `null` — never a half-read file or a throw.
  it("returns the bundled snapshot when the build wrote one, and null when it didn't", () => {
    const snapshot = readDevSnapshot();
    if (snapshot === null) expect(snapshot).toBeNull();
    else expect(parseDevSnapshot(snapshot)).toBe(snapshot);
  });
});
