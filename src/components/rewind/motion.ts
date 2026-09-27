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
 * y 0, but snaps it instead of animating it, so the viewer sees a crossfade and no movement.
 */
export const enterItemReduced: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.base, ease: ease.inOut, y: { duration: 0 } },
  },
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
