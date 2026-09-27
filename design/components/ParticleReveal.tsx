import { useReducedMotion } from "motion/react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

/**
 * Particle reveal — DESIGN.md §3.
 * scatter (0–600ms) → gather (until complete(), min 3200ms total) → hold 400ms → burst 700ms → done.
 * One particle per transaction (cap 1500 / 600 mobile), padded with dust to 240.
 */

export type ParticleRevealHandle = {
  /** A page of transactions arrived. */
  addTransactions: (n: number) => void;
  /** All data loaded. Triggers hold → burst once the minimum reveal time has passed. */
  complete: (finalCount: number) => void;
  /** Fade particles out (480ms), then onFailed. */
  fail: () => void;
};

export type ParticleRevealProps = {
  ref?: Ref<ParticleRevealHandle>;
  /** Total from the API's first page, if known. Otherwise the label reads "Reading transactions…". */
  total?: number;
  /** Burst started. Mount the story 200ms later. */
  onBurst?: () => void;
  /** Burst finished. Unmount the reveal. */
  onDone?: () => void;
  /** Fade-out after fail() finished. Show ErrorState. */
  onFailed?: () => void;
};

const T = { scatter: 600, minReveal: 3200, hold: 400, burst: 700, fail: 480, fadeIn: 300, travelMin: 900, travelMax: 1400, countStep: 240, spread: 400, reducedFade: 240 };
const DUST = 240;
const CAP = { desktop: 1500, mobile: 600 };
const MOBILE_BP = 640;
const ROT = (6 * Math.PI) / 180 / 1000; // 6°/s in rad/ms
const TRAIL = 6;
const BAND = 14;

type Phase = "gather" | "hold" | "burst" | "failing" | "done";
type Particle = {
  sx: number; sy: number; vx: number; vy: number; // spawn + drift (px/ms)
  born: number; travel: number; angle: number; band: number;
  size: number; color: 0 | 1 | 2; alpha: number; dust: boolean;
  burst: number; bx: number; by: number; hasB: boolean;
  px: number; py: number; hasPrev: boolean;
};

const bezier = (x1: number, y1: number, x2: number, y2: number) => (x: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3 - x;
    const dx = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
    if (Math.abs(dx) < 1e-6) break;
    t -= cx / dx;
  }
  return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
};
const easeOut = bezier(0.22, 1, 0.36, 1);
const easeInOut = bezier(0.65, 0, 0.35, 1);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function cssRgb(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const hex = v.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
  const n = parseInt(hex, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function ParticleReveal({ ref, total, onBurst, onDone, onFailed }: ParticleRevealProps) {
  const reduce = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onBurst, onDone, onFailed });
  cbs.current = { onBurst, onDone, onFailed };

  // Engine state lives in a ref: the rAF loop never re-renders React.
  const s = useRef({
    particles: [] as Particle[],
    seen: 0, real: 0, cap: CAP.desktop, w: 0, h: 0,
    phase: "gather" as Phase, completeAt: -1, holdAt: 0, burstAt: 0, failAt: 0,
    count: { from: 0, to: 0, at: 0, shown: 0 },
    clock0: 0, hiddenAt: 0, hiddenMs: 0,
  });
  const [label, setLabel] = useState<"reading" | "done">("reading");
  const [finalTotal, setFinalTotal] = useState<number | undefined>(total);
  const [announced, setAnnounced] = useState(0);
  const [reducedCount, setReducedCount] = useState(0);
  const [reducedOut, setReducedOut] = useState(false);

  const now = () => performance.now() - s.current.clock0 - s.current.hiddenMs;

  const spawn = (dust: boolean, born: number): Particle => {
    const k = Math.random();
    const { w, h } = s.current;
    return {
      sx: Math.random() * w, sy: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.016, vy: (Math.random() - 0.5) * 0.016,
      born, travel: T.travelMin + Math.random() * (T.travelMax - T.travelMin),
      angle: Math.random() * Math.PI * 2, band: gauss() * BAND,
      size: 0.8 + Math.random() * 1.4,
      color: dust ? 0 : k < 0.88 ? 0 : k < 0.97 ? 1 : 2,
      alpha: dust ? 0.25 : 0.3 + Math.random() * 0.6, dust,
      burst: 300 + Math.random() * 400, bx: 0, by: 0, hasB: false, px: 0, py: 0, hasPrev: false,
    };
  };

  useImperativeHandle(ref, () => ({
    addTransactions(n) {
      const st = s.current;
      st.seen += n;
      if (reduce) return setReducedCount(st.seen);
      const t = now();
      st.count = { from: st.count.shown, to: st.seen, at: t, shown: st.count.shown };
      const add = Math.min(n, st.cap - st.real);
      for (let i = 0; i < add; i++) {
        const born = t + (i / Math.max(1, add)) * T.spread;
        const dust = st.particles.find((p) => p.dust);
        if (dust) Object.assign(dust, { ...spawn(false, dust.born), sx: dust.sx, sy: dust.sy, angle: dust.angle, band: dust.band });
        else st.particles.push(spawn(false, born));
        st.real++;
      }
    },
    complete(finalCount) {
      const st = s.current;
      setFinalTotal(finalCount);
      st.seen = finalCount;
      if (reduce) {
        setReducedCount(finalCount);
        setReducedOut(true);
        window.setTimeout(() => {
          cbs.current.onBurst?.();
          cbs.current.onDone?.();
        }, T.reducedFade);
        return;
      }
      st.count = { from: st.count.shown, to: finalCount, at: now(), shown: st.count.shown };
      st.completeAt = now();
    },
    fail() {
      if (reduce) {
        setReducedOut(true);
        window.setTimeout(() => cbs.current.onFailed?.(), T.reducedFade);
        return;
      }
      const st = s.current;
      if (st.phase === "done") return;
      st.phase = "failing";
      st.failAt = now();
    },
  }), [reduce]);

  // aria-live: at most one update per second
  useEffect(() => {
    const id = window.setInterval(() => setAnnounced((a) => (a === s.current.seen ? a : s.current.seen)), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (reduce) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const st = s.current;
    const colors: [string, string, string] = [cssRgb("--fg", "255,255,255"), cssRgb("--primary", "0,163,245"), cssRgb("--notice", "255,157,28")];
    st.clock0 = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (st.w && st.h) st.particles.forEach((p) => { p.sx *= w / st.w; p.sy *= h / st.h; });
      st.w = w; st.h = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    st.cap = st.w < MOBILE_BP ? CAP.mobile : CAP.desktop;
    for (let i = 0; i < DUST; i++) st.particles.push(spawn(true, Math.random() * T.scatter));
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const place = (p: Particle, t: number, R: number, cx: number, cy: number): [number, number] => {
      const gs = Math.max(p.born, T.scatter);
      const drift = (at: number): [number, number] => [p.sx + p.vx * (at - p.born), p.sy + p.vy * (at - p.born)];
      if (t < gs) return drift(t);
      const a = p.angle + t * ROT, r = R + p.band;
      const tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r;
      const [fx, fy] = drift(gs);
      const e = easeInOut(clamp01((t - gs) / p.travel));
      return [fx + (tx - fx) * e, fy + (ty - fy) * e];
    };

    let raf = 0;
    const frame = () => {
      const t = now();
      const { w, h } = st;
      const cx = w / 2, cy = h / 2 - 10, R = w < MOBILE_BP ? 120 : 200;

      // phase transitions (driven by the paused-aware clock)
      if (st.phase === "gather" && st.completeAt >= 0 && t >= Math.max(T.minReveal, st.completeAt)) {
        st.phase = "hold"; st.holdAt = t; setLabel("done");
      } else if (st.phase === "hold" && t >= st.holdAt + T.hold) {
        st.phase = "burst"; st.burstAt = t; cbs.current.onBurst?.();
      } else if (st.phase === "burst" && t >= st.burstAt + T.burst) {
        st.phase = "done"; cbs.current.onDone?.();
      } else if (st.phase === "failing" && t >= st.failAt + T.fail) {
        st.phase = "done"; cbs.current.onFailed?.();
      }

      const b = st.phase === "burst" || st.phase === "done" ? easeOut(clamp01((t - st.burstAt) / T.burst)) : 0;
      const f = st.phase === "failing" ? clamp01((t - st.failAt) / T.fail) : st.phase === "done" && st.failAt ? 1 : 0;
      const fade = (1 - b) * (1 - f);

      // counter roll
      const c = st.count;
      c.shown = c.from + (c.to - c.from) * easeOut(clamp01((t - c.at) / T.countStep));
      if (countRef.current) countRef.current.textContent = Math.round(c.shown).toLocaleString("en-US");
      if (overlayRef.current) overlayRef.current.style.opacity = String(fade);

      ctx.clearRect(0, 0, w, h);
      for (const p of st.particles) {
        let [x, y] = place(p, t, R, cx, cy);
        if (b > 0) {
          if (!p.hasB) { [p.bx, p.by] = place(p, st.burstAt, R, cx, cy); p.hasB = true; }
          const dx = p.bx - cx, dy = p.by - cy, len = Math.hypot(dx, dy) || 1;
          x = p.bx + (dx / len) * p.burst * b;
          y = p.by + (dy / len) * p.burst * b;
        }
        const alpha = p.alpha * clamp01((t - p.born) / T.fadeIn) * fade;
        if (alpha <= 0.01) { p.hasPrev = false; continue; }
        const rgb = colors[p.color];
        if (p.hasPrev) {
          const mx = x - p.px, my = y - p.py, m = Math.hypot(mx, my);
          if (m > 0.2) {
            const l = Math.min(TRAIL, m * 4) / m;
            ctx.strokeStyle = `rgba(${rgb},${alpha * 0.5})`;
            ctx.lineWidth = p.size;
            ctx.beginPath(); ctx.moveTo(x - mx * l, y - my * l); ctx.lineTo(x, y); ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(${rgb},${alpha})`;
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
        p.px = x; p.py = y; p.hasPrev = true;
      }
      if (st.phase !== "done") raf = requestAnimationFrame(frame);
    };

    // Pause the clock and the loop while the tab is hidden.
    const onVisibility = () => {
      if (document.hidden) {
        st.hiddenAt = performance.now();
        cancelAnimationFrame(raf);
      } else if (st.hiddenAt) {
        st.hiddenMs += performance.now() - st.hiddenAt;
        st.hiddenAt = 0;
        if (st.phase !== "done") raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduce]);

  const knownTotal = finalTotal ?? total;
  const status = label === "done" ? "Done" : knownTotal != null ? `Reading ${knownTotal.toLocaleString("en-US")} transactions…` : "Reading transactions…";

  if (reduce) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-bg px-5 text-center transition-opacity duration-(--duration-base) ease-in-out" style={{ opacity: reducedOut ? 0 : 1 }}>
        <p className="text-body text-fg-muted" aria-live="polite">
          Reading <span className="tabular-nums text-fg">{reducedCount.toLocaleString("en-US")}</span> transactions…
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-bg" aria-busy={label !== "done"}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex -translate-y-2.5 flex-col items-center gap-1.5">
            <span ref={countRef} className="text-stat font-medium tabular-nums" aria-hidden>0</span>
            <span className="text-small text-fg-muted">transactions</span>
          </div>
        </div>
        <p className="absolute inset-x-0 bottom-30 text-center text-body text-fg-muted max-sm:bottom-24">{status}</p>
      </div>
      <p className="sr-only" aria-live="polite">
        {label === "done" ? `${announced.toLocaleString("en-US")} transactions read` : `${announced.toLocaleString("en-US")} transactions read so far`}
      </p>
    </div>
  );
}
