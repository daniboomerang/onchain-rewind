import { useRef } from "react";
import { duration, useTween } from "./motion";

export type StatNumberProps = {
  value: number;
  label?: string;
  format?: (n: number) => string;
  size?: "stat" | "xl";
  /** CSS color, e.g. "var(--color-accent-token)". Use once per card. */
  accent?: string;
  delay?: number;
};

const defaultFormat = (n: number) => Math.round(n).toLocaleString("en-US");

/** States: counting (0 → value over `duration.count`), settled, paused (frozen), reduced (final value, no roll). */
export function StatNumber({
  value,
  label,
  format = defaultFormat,
  size = "stat",
  accent,
  delay = 0,
}: StatNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useTween(value, {
    duration: duration.count,
    delay,
    onUpdate: (v) => {
      if (ref.current) ref.current.textContent = format(v);
    },
  });

  return (
    <div className="flex flex-col gap-1">
      <span
        ref={ref}
        aria-hidden
        className={`${size === "xl" ? "text-stat-xl" : "text-stat"} font-medium tabular-nums`}
        style={accent ? { color: accent } : undefined}
      >
        {format(0)}
      </span>
      <span className="sr-only">{format(value)}</span>
      {label && <span className="text-small text-fg-muted">{label}</span>}
    </div>
  );
}
