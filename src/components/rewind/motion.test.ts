import { expect, test } from "vitest";
import { duration, enterCard, enterCardReduced, enterItem, enterItemReduced, revealMs } from "./motion";

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

test("the share card's shell hides identically to its reduced twin, and both end square", () => {
  expect(enterCardReduced.hidden).toEqual(enterCard.hidden);
  expect(enterCard.show).toMatchObject({ opacity: 1, y: 0 });
  expect(enterCardReduced.show).toMatchObject({ opacity: 1, y: 0 });
});

/**
 * A transition with no duration and no delay is not an animation: Motion writes the target through
 * its own render loop, so the values land whether or not an animation would have run to its end.
 * A reduced entrance that snapped only its rise left the fade as the one thing between the hidden
 * state the server wrote and a readable card, and a fade cut short held the card at opacity 0.
 */
test("the reduced entrances snap every value, so no animation has to finish for a card to show", () => {
  for (const [name, show] of [
    ["enterItemReduced", enterItemReduced.show],
    ["enterCardReduced", enterCardReduced.show],
  ] as const) {
    const { transition } = show as { transition: { duration?: number; delay?: number } };
    expect(transition.duration, name).toBe(0);
    expect(transition.delay ?? 0, name).toBe(0);
  }
});

/**
 * The reveal's rAF loop measures in milliseconds while `duration` is in seconds for Motion, so every
 * phase a token covers must read back as that token's millisecond twin — otherwise the canvas and
 * the CSS the reveal fades with drift apart.
 */
test("the reveal's phase timings mirror the duration tokens they come from", () => {
  expect(revealMs.minReveal).toBe(duration.reveal * 1000);
  expect(revealMs.fail).toBe(duration.slow * 1000);
  expect(revealMs.travelMin).toBe(duration.grow * 1000);
  expect(revealMs.countRoll).toBe(duration.base * 1000);
  expect(revealMs.reducedFade).toBe(duration.base * 1000);
});

test("the reveal never finishes before its minimum, and every phase has a length", () => {
  expect(revealMs.minReveal).toBe(3200);
  for (const [phase, ms] of Object.entries(revealMs)) {
    expect(ms, phase).toBeGreaterThan(0);
  }
  expect(revealMs.travelMax).toBeGreaterThan(revealMs.travelMin);
});

test("the live region is announced no more than once a second", () => {
  expect(revealMs.announce).toBeGreaterThanOrEqual(1000);
});
