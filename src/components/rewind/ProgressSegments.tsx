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
      aria-valuenow={current + 1}
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
  const done = useRef(onComplete);
  done.current = onComplete;

  // Timing, not decoration: the fill runs under reduced motion too.
  useEffect(() => {
    if (state !== "filling") return;
    ctrl.current = animate(
      scope.current,
      { scaleX: [0, 1] },
      { duration, ease: "linear", onComplete: () => done.current?.() },
    );
    return () => ctrl.current?.stop();
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
