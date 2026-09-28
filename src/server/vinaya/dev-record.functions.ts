/**
 * This repo's own development record — a round-by-round history per task and the guardrail
 * totals — read from the Vinaya log.
 *
 * After the first read, a refresh asks the log only for events after the last one held, every
 * concurrent caller shares that one in-flight read, and a failed refresh serves what is already
 * held rather than losing it. State lives in this module for the life of the server instance —
 * best-effort on a serverless host, same as `zerion/client.ts`'s response cache.
 */

import { createServerFn } from "@tanstack/react-start";
import { type DevelopmentRecord, foldDevelopmentRecord, type RawLogEnvelope } from "#/engine/dev-record.ts";
import { fetchLogEventsSince, type VinayaLogResult } from "#/server/vinaya/log-client.ts";

let heldEvents: RawLogEnvelope[] = [];
let heldRecord: DevelopmentRecord | undefined;
let cursor = 0;
let inFlight: Promise<VinayaLogResult<DevelopmentRecord>> | undefined;

export const getDevRecord = createServerFn({ method: "GET" }).handler(() => readDevRecord());

export async function readDevRecord(): Promise<VinayaLogResult<DevelopmentRecord>> {
  if (inFlight) return inFlight;

  const attempt = refresh();
  inFlight = attempt;
  try {
    return await attempt;
  } finally {
    inFlight = undefined;
  }
}

async function refresh(): Promise<VinayaLogResult<DevelopmentRecord>> {
  const result = await fetchLogEventsSince<RawLogEnvelope>(cursor);
  if (!result.ok) return heldRecord ? { ok: true, data: heldRecord } : result;

  heldEvents.push(...result.data);
  const lastSeq = result.data.at(-1)?.seq;
  if (lastSeq !== undefined) cursor = lastSeq;

  heldRecord = foldDevelopmentRecord(heldEvents);
  return { ok: true, data: heldRecord };
}

/** Test isolation only: drops every held event, the cursor and the in-flight read. */
export function clearDevRecordCache(): void {
  heldEvents = [];
  heldRecord = undefined;
  cursor = 0;
  inFlight = undefined;
}
