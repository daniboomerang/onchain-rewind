// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { revealMs } from "./motion";
import { ParticleReveal, type ParticleRevealHandle } from "./ParticleReveal";

/**
 * The reveal's phases are canvas work, and happy-dom has no 2D context — those are proven in a
 * browser. What is provable here is everything the canvas isn't: the reduced-motion branch renders
 * no canvas at all, the counter is announced no more than once a second either way, and a run that
 * never gets a context still mounts, drives its handle and cleans up without throwing.
 */

// Stands in for DevTools' "emulate prefers-reduced-motion": Motion reads the preference once, into
// a module-level singleton, so the preference is swapped at its source rather than in the component.
const preference = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => preference.reduce,
}));

beforeEach(() => {
  vi.useFakeTimers();
  preference.reduce = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const live = (container: HTMLElement) => container.querySelector('[aria-live="polite"]')?.textContent ?? null;

/** One announce interval, inside `act` so the state it sets is flushed. */
const tick = (times = 1) =>
  act(() => {
    vi.advanceTimersByTime(revealMs.announce * times);
  });

test("reduced motion renders no canvas, just the count", () => {
  preference.reduce = true;
  const ref = createRef<ParticleRevealHandle>();
  const { container } = render(<ParticleReveal ref={ref} />);

  expect(container.querySelector("canvas")).toBeNull();
  act(() => ref.current?.addTransactions(1284));
  expect(container.textContent).toContain("1,284");
});

test("reduced motion still announces the count, and no more than once a second", () => {
  preference.reduce = true;
  const ref = createRef<ParticleRevealHandle>();
  const { container } = render(<ParticleReveal ref={ref} />);

  expect(live(container)).toBe("0 transactions read so far");
  // Four pages inside one interval: the live region has not been told any of them yet.
  act(() => {
    for (let i = 0; i < 4; i++) ref.current?.addTransactions(120);
  });
  expect(live(container)).toBe("0 transactions read so far");
  tick();
  expect(live(container)).toBe("480 transactions read so far");
});

test("a cut-short year is counted with a plus, and announced as at least that many", () => {
  preference.reduce = true;
  const ref = createRef<ParticleRevealHandle>();
  const { container } = render(<ParticleReveal ref={ref} />);

  act(() => ref.current?.addTransactions(1600));
  // Still paging: the count is what has landed, with no claim yet about what it means.
  expect(container.textContent).toContain("1,600");
  expect(container.textContent).not.toContain("1,600+");

  act(() => ref.current?.complete(1600, true));
  expect(container.textContent).toContain("1,600+");
  tick();
  expect(live(container)).toBe("At least 1,600 transactions read");
});

test("a complete year is counted exactly, and announced without a bound", () => {
  preference.reduce = true;
  const ref = createRef<ParticleRevealHandle>();
  const { container } = render(<ParticleReveal ref={ref} />);

  act(() => ref.current?.complete(1284, false));
  expect(container.textContent).toContain("1,284");
  expect(container.textContent).not.toContain("1,284+");
  tick();
  expect(live(container)).toBe("1,284 transactions read");
});

test("the announced count is throttled with a canvas too", () => {
  const ref = createRef<ParticleRevealHandle>();
  const { container } = render(<ParticleReveal ref={ref} />);

  expect(container.querySelector("canvas")).not.toBeNull();
  act(() => ref.current?.addTransactions(97));
  expect(live(container)).toBe("0 transactions read so far");
  tick();
  expect(live(container)).toBe("97 transactions read so far");
  // A second interval with nothing new must not re-announce the same number.
  const announced = live(container);
  tick();
  expect(live(container)).toBe(announced);
});

test("reduced motion crossfades into the story instead of bursting", () => {
  preference.reduce = true;
  const onBurst = vi.fn();
  const onDone = vi.fn();
  const ref = createRef<ParticleRevealHandle>();
  render(<ParticleReveal ref={ref} onBurst={onBurst} onDone={onDone} />);

  act(() => ref.current?.complete(1284, false));
  expect(onBurst).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(revealMs.reducedFade);
  });
  expect(onBurst).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledTimes(1);
});

test("reduced motion reports a failure once its fade-out is over", () => {
  preference.reduce = true;
  const onFailed = vi.fn();
  const ref = createRef<ParticleRevealHandle>();
  render(<ParticleReveal ref={ref} onFailed={onFailed} />);

  act(() => ref.current?.fail());
  expect(onFailed).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(revealMs.reducedFade);
  });
  expect(onFailed).toHaveBeenCalledTimes(1);
});

test("the known total is read out while the reveal is still loading", () => {
  const { container } = render(<ParticleReveal total={1284} />);
  expect(container.textContent).toContain("Reading 1,284 transactions…");
});

test("an unknown total says so rather than guessing a number", () => {
  const { container } = render(<ParticleReveal />);
  expect(container.textContent).toContain("Reading transactions…");
});

test("the handle is safe to drive where no 2D context exists", () => {
  const ref = createRef<ParticleRevealHandle>();
  const { unmount } = render(<ParticleReveal ref={ref} />);
  expect(() =>
    act(() => {
      ref.current?.addTransactions(120);
      ref.current?.complete(120, false);
      ref.current?.fail();
    }),
  ).not.toThrow();
  expect(() => unmount()).not.toThrow();
});
