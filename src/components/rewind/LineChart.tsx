import { motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Tooltip } from "../ui/Tooltip";
import { duration, springCard, useTween } from "./motion";

export type Point = { date: string; value: number };

export type LineChartProps = {
  /** `date` is a display label (e.g. "Oct 12"). */
  data: Point[];
  formatValue?: (n: number) => string;
  /** viewBox size; the SVG scales to its container. */
  width?: number;
  height?: number;
  "aria-label"?: string;
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Draws in over `duration.draw` → peak marker pops (spring) → low marker a beat later. Markers are focusable with tooltips. */
export function LineChart({ data, formatValue = usd, width = 1200, height = 380, ...rest }: LineChartProps) {
  const reduce = useReducedMotion();
  const path = useRef<SVGPathElement>(null);
  const [drawn, setDrawn] = useState(false);

  const chart = useMemo(() => build(data, width, height), [data, width, height]);

  useTween(1, {
    duration: duration.draw,
    onUpdate: (t) => path.current?.setAttribute("stroke-dashoffset", String(1 - t)),
    onComplete: () => setDrawn(true),
  });

  if (!chart) return null;

  const markers = [
    { ...chart.hi, kind: "Peak", delay: 0, stroke: "var(--color-accent-ride)" },
    { ...chart.lo, kind: "Low", delay: duration.base / 2, stroke: "var(--color-fg-muted)" },
  ] as const;

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-label={rest["aria-label"] ?? "Portfolio value over the year"}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <motion.path
          d={chart.area}
          fill="var(--color-accent-ride)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.08 }}
          transition={{ duration: reduce ? 0 : duration.draw }}
        />
        <path
          ref={path}
          d={chart.d}
          fill="none"
          stroke="var(--color-accent-ride)"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1}
        />
      </svg>
      {drawn &&
        markers.map((m) => (
          <Tooltip
            key={m.kind}
            tone="value"
            placement={m.kind === "Peak" ? "top" : "bottom"}
            content={
              <span className="flex flex-col gap-0.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em]">
                  {m.kind} · {m.date}
                </span>
                <span className="text-[15px] font-semibold tabular-nums">{formatValue(m.value)}</span>
              </span>
            }
          >
            <motion.button
              aria-label={`${m.kind}: ${formatValue(m.value)} on ${m.date}`}
              className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-bg outline-none focus-ring:outline-2 focus-ring:outline-offset-2 focus-ring:outline-primary"
              style={{ left: `${m.x}%`, top: `${m.y}%`, borderColor: m.stroke }}
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ ...springCard, delay: m.delay }}
            />
          </Tooltip>
        ))}
    </div>
  );
}

type XY = readonly [x: number, y: number];

/** Catmull-Rom → cubic Bézier. Safe under `noUncheckedIndexedAccess`. */
function build(data: Point[], W: number, H: number) {
  if (data.length < 2) return null;
  const values = data.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 20;
  const span = max - min || 1;
  const pts: XY[] = values.map((v, i) => [(i * W) / (values.length - 1), pad + (1 - (v - min) / span) * (H - 2 * pad)]);
  const last = pts.length - 1;
  const pt = (i: number): XY => pts[Math.min(Math.max(i, 0), last)] ?? [0, 0];

  const first = pt(0);
  let d = `M${first[0]},${first[1]}`;
  for (let i = 0; i < last; i++) {
    const a = pt(i - 1);
    const b = pt(i);
    const c = pt(i + 1);
    const e = pt(i + 2);
    const c1x = b[0] + (c[0] - a[0]) / 6;
    const c1y = b[1] + (c[1] - a[1]) / 6;
    const c2x = c[0] - (e[0] - b[0]) / 6;
    const c2y = c[1] - (e[1] - b[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${c[0]},${c[1]}`;
  }

  const at = (i: number) => {
    const [x, y] = pt(i);
    const p = data[i] ?? { date: "", value: 0 };
    return { x: (x / W) * 100, y: (y / H) * 100, value: p.value, date: p.date };
  };

  return { d, area: `${d} L${W},${H} L0,${H} Z`, hi: at(values.indexOf(max)), lo: at(values.indexOf(min)) };
}
