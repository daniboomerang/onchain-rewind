/**
 * The one door to the Vinaya log's read endpoint.
 *
 * `VINAYA_LOG_READ_TOKEN` is read here and nowhere else, and it never leaves this module: a
 * rejected token and an unreachable log come back as two distinct, typed failures, and no raw
 * response body or status text is ever returned to a caller.
 *
 * Auth is `Authorization: Bearer <token>` — confirmed live on 2026-09-28: the same token over a
 * bare or `Basic`-shaped header is rejected cleanly (401), while the `Bearer` form is accepted
 * (the read itself was failing upstream with a 500 at the time, which this module reports as
 * `unreachable`, never `unauthorized`).
 */

const LOG_BASE_URL = "https://vinaya-log-server.estevez-dani.workers.dev";
const EVENTS_PATH = "/v1/repos/daniboomerang/onchain-rewind/events";
/** The read endpoint pages forward only, oldest first; a short or empty page ends the read. */
export const LOG_PAGE_LIMIT = 1000;

/** The deployment has no read credential. Thrown, never returned: it is a fault of the server, not of the log. */
export class LogTokenMissingError extends Error {
  constructor() {
    super("VINAYA_LOG_READ_TOKEN is not set: the server cannot read the Vinaya log without it.");
  }
}

export type VinayaLogErrorCode = "unauthorized" | "unreachable";

export type VinayaLogResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: VinayaLogErrorCode };

/**
 * Every event after `after`, oldest first. `after: 0` reads the whole log. A rejected token
 * (401/403) is `unauthorized`; a network failure, a non-2xx status or an unreadable body is
 * `unreachable` — the two are never confused, so a stale shell token doesn't look like an outage.
 */
export async function fetchLogEventsSince<T>(after: number): Promise<VinayaLogResult<readonly T[]>> {
  const token = process.env.VINAYA_LOG_READ_TOKEN;
  if (!token) {
    throw new LogTokenMissingError();
  }

  const events: T[] = [];
  let cursor = after;

  for (;;) {
    let response: Response;
    try {
      response = await fetch(`${LOG_BASE_URL}${EVENTS_PATH}?after=${cursor}&limit=${LOG_PAGE_LIMIT}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      return { ok: false, error: "unreachable" };
    }

    if (response.status === 401 || response.status === 403) {
      console.error(`vinaya log read rejected: ${response.status}`);
      return { ok: false, error: "unauthorized" };
    }
    if (!response.ok) {
      console.error(`vinaya log read failed: ${response.status}`);
      return { ok: false, error: "unreachable" };
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      return { ok: false, error: "unreachable" };
    }

    const page = parseNdjsonPage<T>(text);
    if (page === undefined) return { ok: false, error: "unreachable" };

    events.push(...page);
    const lastSeq = seqOf(page.at(-1));
    if (page.length < LOG_PAGE_LIMIT || lastSeq === undefined) break;
    cursor = lastSeq;
  }

  return { ok: true, data: events };
}

/** The endpoint answers `content-type: application/x-ndjson`: one JSON object per line, oldest first. */
function parseNdjsonPage<T>(text: string): T[] | undefined {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const page: T[] = [];
  for (const line of lines) {
    try {
      page.push(JSON.parse(line) as T);
    } catch {
      return undefined;
    }
  }
  return page;
}

function seqOf(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const seq = (value as Record<string, unknown>).seq;
  return typeof seq === "number" ? seq : undefined;
}
