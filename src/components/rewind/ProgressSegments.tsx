import { type AnimationPlaybackControls, useAnimate } from "motion/react";
import { useEffect, useRef } from "react";
import { duration as d } from "./motion";

export type ProgressSegmentsProps = {
  count: number;
  /** 0-based index of the card being shown. */
  current: number;
  paused?: boolean;
  /** Seconds per card. Default 5. */
  duration?: number;
  /** Fires when the current segment fills. Not called for the last card if `holdLast`. */
  onComplete?: () => void;
  holdLast?: boolean;
};

/** States per segment: idle (ahead), filling (current), done (behind), paused (current, held at 50%). */
export function ProgressSegments({
  count,
  current,
  paused = false,
  duration = d.story,
  onComplete,
  holdLast = true,
}: ProgressSegmentsProps) {
  return (
    <div
      role="progressbar"
      aria-label="Story progress"
      aria-valuemin={1}
      aria-valuemax={count}
      // `current` is -1 before the first card and `count` once the last one is done; the reported
      // position stays inside the range it declares.
      aria-valuenow={Math.min(Math.max(current + 1, 1), count)}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: count }, (_, i) => (
        <Segment
          key={i === current ? `current-${current}` : i}
          state={i < current ? "done" : i === current ? "filling" : "idle"}
          paused={paused}
          duration={duration}
          onComplete={i === count - 1 && holdLast ? undefined : onComplete}
        />
      ))}
      {paused && (
        <span aria-hidden className="ml-1.5 flex gap-[3px]">
          <span className="h-2.5 w-[3px] bg-fg-muted" />
          <span className="h-2.5 w-[3px] bg-fg-muted" />
        </span>
      )}
    </div>
  );
}

function Segment({
  state,
  paused,
  duration,
  onComplete,
}: {
  state: "idle" | "filling" | "done";
  paused: boolean;
  duration: number;
  onComplete?: () => void;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const ctrl = useRef<AnimationPlaybackControls | null>(null);
  const held = useRef(paused);
  held.current = paused;
  const done = useRef(onComplete);
  done.current = onComplete;

  // Timing, not decoration: the fill runs under reduced motion too.
  useEffect(() => {
    if (state !== "filling") return;
    const controls = animate(
      scope.current,
      { scaleX: [0, 1] },
      { duration, ease: "linear", onComplete: () => done.current?.() },
    );
    ctrl.current = controls;
    // A fill recreated mid-hold (a new duration, or a new card) must not start playing.
    if (held.current) controls.pause();
    return () => controls.stop();
  }, [state, duration, animate, scope]);

  useEffect(() => {
    if (paused) ctrl.current?.pause();
    else ctrl.current?.play();
  }, [paused]);

  return (
    <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-track">
      <div
        ref={scope}
        style={{ transformOrigin: "left", transform: `scaleX(${state === "done" ? 1 : 0})` }}
        className={`h-full bg-fg transition-opacity duration-(--duration-fast) ${
          paused && state === "filling" ? "opacity-50" : ""
        }`}
      />
    </div>
  );
}
