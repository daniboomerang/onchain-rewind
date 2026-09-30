/**
 * The development snapshot (ADR-0006): the development record as the build read it, carried by the
 * deploy so `/dev-stats` paints it at once on a cold visit while its live queries catch up.
 *
 * It holds the mapped record only — what `getGithubDevRecord` and `getDevRecord` already return to
 * the browser — plus the moment it was taken. Never a token, a header, a URL or a raw upstream body.
 */

import type { DevelopmentRecord as LogDevelopmentRecord } from "#/engine/dev-record.ts";
import type { DevelopmentRecord as GithubDevelopmentRecord } from "#/engine/github-dev-record.ts";

export type DevSnapshot = {
  /** ISO 8601, UTC: when the build read the record. */
  readonly takenAt: string;
  readonly github: GithubDevelopmentRecord;
  readonly log: LogDevelopmentRecord;
};

/** The build output's file name, beside this module. Gitignored; never under `public/`. */
export const DEV_SNAPSHOT_FILE = "dev-snapshot.json";

/** A structural check on the parsed file: a snapshot the build wrote, or `undefined`. */
export function parseDevSnapshot(value: unknown): DevSnapshot | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { takenAt, github, log } = value as Record<string, unknown>;
  if (typeof takenAt !== "string" || Number.isNaN(Date.parse(takenAt))) return undefined;
  if (!hasArray(github, "tasks") || !hasObject(github, "totals")) return undefined;
  if (!hasArray(log, "tasks") || !hasObject(log, "guardrails")) return undefined;
  return value as DevSnapshot;
}

function hasArray(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>)[key]);
}

function hasObject(value: unknown, key: string): boolean {
  if (typeof value !== "object" || value === null) return false;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "object" && field !== null;
}
