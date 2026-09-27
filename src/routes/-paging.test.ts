import { expect, test } from "vitest";
import { fixtures } from "../engine/fixtures";
import { PAGE_SIZE, pageTick } from "./-paging";

/**
 * The playground's paging stand-in drives the reveal, so a failing run has to end in `fail()` for
 * every fixture on `/system` — including one whose whole transaction count fits in a single page.
 * Deciding from the count as it stood before the page was added let such a fixture complete first,
 * and its failing run reached the story instead of the error state.
 */

/** Runs the stand-in to its end, the way the interval does, and reports what it did. */
function run(total: number, fail: boolean) {
  const pages: number[] = [];
  let sent = 0;
  for (let tick = 0; tick < 100; tick++) {
    const { send, next } = pageTick(sent, total, fail);
    sent += send;
    pages.push(send);
    if (next !== "continue") return { ended: next, pages, sent };
  }
  throw new Error("the stand-in never ended");
}

test("a failing run fails even when the whole fixture fits in one page", () => {
  const small = fixtures.negative.txCount;
  expect(small).toBeLessThan(PAGE_SIZE);
  expect(run(small, true).ended).toBe("fail");
});

test("every fixture's failing run ends in a failure, and its own run completes", () => {
  for (const [name, facts] of Object.entries(fixtures)) {
    expect(run(facts.txCount, true).ended, name).toBe("fail");
    expect(run(facts.txCount, false).ended, name).toBe("complete");
  }
});

test("a completing run sends the whole fixture, a page at a time", () => {
  const { sent, pages } = run(fixtures.normal.txCount, false);
  expect(sent).toBe(fixtures.normal.txCount);
  expect(Math.max(...pages)).toBeLessThanOrEqual(PAGE_SIZE);
  expect(pages.length).toBe(Math.ceil(fixtures.normal.txCount / PAGE_SIZE));
});

test("a failing run stops short of the whole fixture when there is more than a page of it", () => {
  const { sent } = run(fixtures.normal.txCount, true);
  expect(sent).toBeGreaterThan(0);
  expect(sent).toBeLessThan(fixtures.normal.txCount);
});
