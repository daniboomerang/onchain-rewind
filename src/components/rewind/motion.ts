import {
  type AnimationPlaybackControls,
  animate,
  type Transition,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { createContext, use, useEffect, useRef } from "react";

// Mirrors tokens.css (seconds, for Motion)
export const duration = {
  instant: 0.08,
  fast: 0.15,
  base: 0.24,
  slow: 0.48,
  grow: 0.9,
  count: 1.2,
  draw: 1.6,
  reveal: 3.2,
  story: 5,
} as const;
export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.55, 0, 1, 0.45],
} as const;
export const springCard: Transition = { type: "spring", stiffness: 260, damping: 32, mass: 1 };
export const stagger = { children: 0.08, bars: 0.06 } as const;
export const pressScale = 0.97;
/**
 * A pointer press this long, or longer, pauses the story instead of navigating — DESIGN.md §3,
 * "Paused". Shorter presses are clicks, and a hold is never one.
 */
export const holdMs = 200;

/** Card element entrance (eyebrow → kicker → headline → body). */
export const enterItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } },
};
/**
 * Reduced twin. `hidden` is `enterItem`'s, exactly: the server cannot read
 * `prefers-reduced-motion`, so a hidden state that differs between the two variants makes the
 * markup a hydration mismatch for whichever viewer the server guessed wrong — and leaves whatever
 * only the full-motion variant animates back stuck at its offset. `show` therefore still targets
 * y 0, so nothing can be left offset.
 *
 * `show` snaps the fade as well as the rise, and the two must snap together. A transition with no
 * duration and no delay is not an animation at all — Motion writes the target straight through its
 * own render loop — while a transition with a duration is one, and an animation that never reaches
 * its end leaves the element at the value it started from. When only the rise snapped, that split
 * the entrance in two: the rise landed on the first frame and the fade became the single thing
 * standing between the hidden state the server wrote and a readable card, so a fade that was cut
 * short left the card at `opacity: 0` with its content in the page and nothing to bring it back.
 * Snapping both is also what the preference asks for: the card appears, it does not fade in.
 */
export const enterItemReduced: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0 } },
};

/** A card's own shell (the share card): `enterItem`'s entrance over a slightly longer rise. */
export const enterCard: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } },
};
/** Reduced twin, snapping both values for the reasons `enterItemReduced` gives. */
export const enterCardReduced: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0 } },
};

/** Playback state shared by every animated story component (hold / Space = paused). */
export const PlaybackContext = createContext<{ paused: boolean }>({ paused: false });
export const usePaused = () => use(PlaybackContext).paused;

type TweenOptions = {
  duration: number;
  delay?: number;
  ease?: readonly number[];
  onUpdate: (v: number) => void;
  onComplete?: () => void;
};

/**
 * Tween 0 → `to`. Freezes while paused; jumps straight to `to` under reduced motion.
 * Used by StatNumber, ChainBar and LineChart.
 */
export function useTween(
  to: number,
  { duration: d, delay = 0, ease: e = ease.out, onUpdate, onComplete }: TweenOptions,
) {
  const reduce = useReducedMotion();
  const paused = usePaused();
  const ctrl = useRef<AnimationPlaybackControls | null>(null);
  const held = useRef(paused);
  held.current = paused;
  const cbs = useRef({ onUpdate, onComplete });
  cbs.current = { onUpdate, onComplete };

  useEffect(() => {
    if (reduce) {
      cbs.current.onUpdate(to);
      cbs.current.onComplete?.();
      return;
    }
    const controls = animate(0, to, {
      duration: d,
      delay,
      ease: e as [number, number, number, number],
      onUpdate: (v) => cbs.current.onUpdate(v),
      onComplete: () => cbs.current.onComplete?.(),
    });
    ctrl.current = controls;
    // A tween recreated mid-hold (a new value, delay or duration) must not start playing.
    if (held.current) controls.pause();
    return () => controls.stop();
  }, [to, d, delay, reduce, e]);

  useEffect(() => {
    if (!ctrl.current) return;
    if (paused) ctrl.current.pause();
    else ctrl.current.play();
  }, [paused]);
}

/**
 * Particle-reveal phase timings, in milliseconds — DESIGN.md §3. The rAF loop measures the reveal
 * in milliseconds, so every phase reads its length from here: the millisecond twin of a `duration`
 * token wherever one covers the phase, and the reveal's own value where none does.
 */
export const revealMs = {
  /** Particles drift at random before the gather starts. */
  scatter: 600,
  /** The reveal never finishes sooner than this, however fast the data arrives. */
  minReveal: duration.reveal * 1000,
  /** The ring holds still between gather and burst. */
  hold: 400,
  burst: 700,
  /** `onBurst` fires at burst start; card 1 enters this much later, over the burst.  */
  storyEnter: 200,
  /** `fail()` fades the particles out over this, then calls `onFailed`. */
  fail: duration.slow * 1000,
  /** A new particle fades in over this from its own birth. */
  fadeIn: 300,
  travelMin: duration.grow * 1000,
  travelMax: 1400,
  /** The counter rolls to a new total over this. */
  countRoll: duration.base * 1000,
  /** A page's particles are born spread across this, so they don't all appear at once. */
  spread: 400,
  /** Reduced motion: the static counter crossfades out over this instead of bursting. */
  reducedFade: duration.base * 1000,
  /** The live region announces the count at most this often. */
  announce: 1000,
} as const;
