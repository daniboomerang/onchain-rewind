import { expect, test } from "vitest";
import { enterItem, enterItemReduced } from "./motion";

/**
 * The server renders a card's hidden state before it can know whether the viewer asked for reduced
 * motion, so the two variants must agree on that state exactly: when they disagreed, the markup was
 * a hydration mismatch, and y — which only the full-motion variant animated back — stayed stuck at
 * its offset for every reduced-motion viewer.
 */
test("both entrance variants hide identically, so the server's markup never depends on the preference", () => {
  expect(enterItemReduced.hidden).toEqual(enterItem.hidden);
});

test("both entrance variants end at y 0, so nothing is left offset", () => {
  expect(enterItem.show).toMatchObject({ y: 0 });
  expect(enterItemReduced.show).toMatchObject({ y: 0 });
});

test("the reduced variant snaps y rather than moving it", () => {
  const { transition } = enterItemReduced.show as { transition: { y?: { duration?: number } } };
  expect(transition.y?.duration).toBe(0);
});
