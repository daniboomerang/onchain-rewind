import type { ReactNode } from "react";
import { useRef } from "react";
import { duration, stagger, useTween } from "./motion";

export type ChainBarProps = {
  name: string;
  /** Share of transactions, 0–100. */
  percent: number;
  /** Percent of the top chain — bar width is relative to it. */
  max: number;
  icon?: ReactNode;
  /** Top chain: accent fill + full-weight text. */
  highlight?: boolean;
  /** Position in the list, for the stagger. */
  index?: number;
};

/** States: growing (scaleX 0 → share over `duration.grow`), settled, paused (frozen), reduced (full, no grow). */
export function ChainBar({ name, percent, max, icon, highlight = false, index = 0 }: ChainBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const target = percent / max;

  useTween(1, {
    duration: duration.grow,
    delay: duration.base + duration.instant + index * stagger.bars, // after eyebrow/kicker/headline
    onUpdate: (t) => {
      if (bar.current) bar.current.style.transform = `scaleX(${t * target})`;
      if (num.current) num.current.textContent = `${Math.round(t * percent)}%`;
    },
  });

  return (
    <div className="grid grid-cols-[36px_120px_1fr_56px] items-center gap-4 max-md:grid-cols-[28px_84px_1fr_40px] max-md:gap-2.5">
      <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-surface-raised text-xs font-semibold max-md:size-7">
        {icon ?? name[0]}
      </span>
      <span className="truncate text-body font-medium">{name}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-track max-md:h-2">
        <div
          ref={bar}
          style={{ transformOrigin: "left", transform: "scaleX(0)" }}
          className={`h-full rounded-full ${highlight ? "bg-accent-chain" : "bg-fg-muted"}`}
        />
      </div>
      <span
        ref={num}
        aria-hidden
        className={`text-right text-body tabular-nums ${highlight ? "font-medium" : "text-fg-muted"}`}
      >
        0%
      </span>
      <span className="sr-only">{`${name}: ${percent}%`}</span>
    </div>
  );
}
