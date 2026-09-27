#!/usr/bin/env bun
/**
 * vocabulary-citation — this repo's configured instance of
 * `@attalabs/aeg-core`'s `evaluateVocabularyCitation`, the same evaluator
 * behind Vinaya's own `retired-vocabulary` check.
 *
 * The rule it enforces: the durable docs (the spec, the glossary, the agent
 * instructions, the ADRs) state what the product is and must do. The plan —
 * which tasks exist, their numbers, their order, their tranche, their forge
 * Issues — lives only on the forge. A doc that copies the plan has to change
 * every time the plan changes, and drifts the moment it doesn't.
 *
 * Each pattern names the scope it sweeps and a sample it must match, so a
 * pattern that silently stops matching fails the check instead of passing
 * vacuously. Findings are reported only for files the change touches, and
 * they fail the run.
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateVocabularyCitation, type VocabularyHit, type VocabularyPattern } from "@attalabs/aeg-core";

const CHECK_NAME = "onchain-rewind/vocabulary-citation";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

// The durable docs. README.md is left out of the tranche-slug pattern only:
// its stack badges carry names like `tailwind-v4`.
const DOCS = ["SPEC.md", "CONTEXT.md", "AGENTS.md", "CLAUDE.md", "docs/adr"];

const PATTERNS: VocabularyPattern[] = [
  {
    id: "task-number",
    pattern: String.raw`\b[Tt]asks? [0-9]+`,
    scope: [...DOCS, "README.md"],
    sample: "restarting on a wallet change is checked in task 10",
  },
  {
    id: "forge-number",
    pattern: "#[0-9]{1,5}\\b",
    scope: DOCS,
    sample: "tracked in #13",
  },
  {
    id: "tranche-slug",
    pattern: "[a-z][a-z-]+-v[0-9]+",
    scope: DOCS,
    sample: "the Issues labeled vinaya/tranche:rewind-v1",
  },
];

function changedFiles(base: string): string[] {
  try {
    return execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .trim()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// On a pull request, only the files it touches. With no diff to scope to
// (a direct run on main), every doc in scope.
function reportableFiles(): Set<string> | null {
  const base = process.env.BASE_SHA || "origin/main";
  const changed = changedFiles(base);
  return changed.length > 0 ? new Set(changed) : null;
}

// Exit 1 from grep means no matches. Anything else is a real failure and
// must not read as a clean result.
function grepFn(pattern: string, scope: string[]): VocabularyHit[] {
  let out: string;
  try {
    out = execFileSync("grep", ["-rnE", pattern, ...scope, "--include=*.md"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
  const hits: VocabularyHit[] = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const match = /^([^:]+):(\d+):(.*)$/.exec(line);
    if (match) hits.push({ file: match[1] as string, line: Number(match[2]), content: match[3] as string });
  }
  return hits;
}

function matchFn(pattern: string, sample: string): boolean {
  try {
    execFileSync("grep", ["-E", pattern], { input: sample, encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

function emit(error: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify({ schema: 1, check: CHECK_NAME, ...error })}\n`);
}

function main(): void {
  const result = evaluateVocabularyCitation(PATTERNS, grepFn, matchFn, []);

  for (const patternId of result.vacuousPatterns) {
    emit({
      severity: "error",
      message: `pattern "${patternId}" does not match its own sample, so this check cannot be trusted until it is fixed.`,
      agent_recovery_prompt: `Fix the "${patternId}" pattern in vinaya/checks/vocabulary-citation.ts so it matches its sample.`,
    });
  }

  const scope = reportableFiles();
  const findings = result.findings.filter((f) => scope === null || scope.has(f.file));
  for (const finding of findings) {
    emit({
      severity: "error",
      message: `"${finding.patternId}": a durable doc cites the plan: ${finding.content.trim()}`,
      agent_recovery_prompt:
        "Rewrite the line without the task number, Issue number or tranche name. State the fact itself; " +
        "the plan lives on the forge, as the tranche's task Issues.",
      file: finding.file,
      line: finding.line,
    });
  }

  process.exit(result.vacuousPatterns.length > 0 || findings.length > 0 ? 1 : 0);
}

main();
