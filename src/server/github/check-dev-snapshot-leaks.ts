/**
 * The build's own leak check (ADR-0006). `bun run build` runs it after `vite build`: it fails the
 * build when the development snapshot carries a token's name or value, or when the client output
 * carries a token's value. Client names are allowed — `/dev-stats`' error copy names both
 * variables on purpose, never a value.
 *
 * It prints one "found" or "not found" line per check and never a value.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_SNAPSHOT_FILE } from "#/server/github/dev-snapshot.ts";

export const TOKEN_NAMES = ["GITHUB_TOKEN", "VINAYA_LOG_READ_TOKEN", "ZERION_API_KEY"] as const;

/** Where each build preset puts the client output: Nitro's node server locally, Vercel's on Vercel. */
const CLIENT_OUTPUT_DIRS = [".output/public", ".vercel/output/static"];

/**
 * A token's distinctive tail: its last 12 characters, or all of it when shorter. The tail, not
 * the head, because a GitHub token starts with a fixed `github_pat_` or `ghp_` prefix.
 */
export function tokenFingerprint(value: string): string {
  return value.length > 12 ? value.slice(-12) : value;
}

export type LeakCheck = { readonly label: string; readonly found: boolean };

/** Every check, for the snapshot's text (when there is one) and every client file's text. */
export function findLeaks(
  snapshot: string | undefined,
  clientFiles: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): LeakCheck[] {
  const checks: LeakCheck[] = [];
  for (const name of TOKEN_NAMES) {
    const value = env[name];
    const fingerprint = value ? tokenFingerprint(value) : undefined;
    if (snapshot !== undefined) {
      checks.push({ label: `${name} name in the snapshot`, found: snapshot.includes(name) });
      if (fingerprint) checks.push({ label: `${name} value in the snapshot`, found: snapshot.includes(fingerprint) });
    }
    if (fingerprint) {
      checks.push({
        label: `${name} value in the client output`,
        found: clientFiles.some((text) => text.includes(fingerprint)),
      });
    }
  }
  return checks;
}

function readTree(dir: string): string[] {
  const texts: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) texts.push(...readTree(path));
    else texts.push(readFileSync(path, "latin1"));
  }
  return texts;
}

function main(): void {
  const snapshotPath = fileURLToPath(new URL(`./${DEV_SNAPSHOT_FILE}`, import.meta.url));
  const snapshot = existsSync(snapshotPath) ? readFileSync(snapshotPath, "utf8") : undefined;
  const clientFiles = CLIENT_OUTPUT_DIRS.filter((dir) => existsSync(dir)).flatMap((dir) => readTree(dir));

  const checks = findLeaks(snapshot, clientFiles, process.env);
  if (checks.length === 0) console.warn("leak check: nothing to check, no snapshot and no token values");
  for (const check of checks) console.warn(`leak check: ${check.label}: ${check.found ? "found" : "not found"}`);
  if (checks.some((check) => check.found)) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
