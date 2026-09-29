import { useReducedMotion } from "motion/react";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { countLabel, rollingCountLabel } from "../../lib/capped";
import { revealMs } from "./motion";
import {
  alphaIndex,
  alphaTable,
  clamp01,
  DUST_COUNT,
  easeOut,
  PARTICLE_CAP,
  type Particle,
  type Point,
  parseRgb,
  particleCap,
  placeAt,
  RING_OFFSET_Y,
  reseedParticle,
  ringRadius,
  spawnParticle,
  TRAIL_LENGTH,
} from "./particles";

/**
 * Particle reveal — DESIGN.md §3. One particle per transaction, padded with dust, gathering into a
 * turning ring while the data loads.
 *
 * scatter → gather (until `complete()`, never shorter than `revealMs.minReveal`) → hold → burst →
 * `onDone`. `fail()` fades the field out instead and calls `onFailed`. The clock excludes
 * hidden-tab time, so every phase pauses with the tab.
 */

export type ParticleRevealHandle = {
  /** A page of transactions arrived. */
  addTransactions: (n: number) => void;
  /**
   * All data loaded. Triggers hold → burst once the minimum reveal time has passed.
   *
   * `capped` is the run's own flag: the facts describe the newest slice of the window rather than
   * all of it, so the counter lands on "1,600+" instead of claiming the wallet made exactly that
   * many. It is an argument rather than a prop because the counter is written by the frame loop,
   * which must not wait a render to learn what the number it has just landed on means.
   */
  complete: (finalCount: number, capped: boolean) => void;
  /** Fade particles out, then `onFailed`. */
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
  /** Fade-out after `fail()` finished. Show ErrorState. */
  onFailed?: () => void;
};

type Phase = "gather" | "hold" | "burst" | "failing" | "done";

/**
 * Only reachable where the document exposes no computed styles at all, so no colour token can be
 * read — never in a browser painting this canvas.
 */
const LAST_RESORT_RGB = "255,255,255";

/** The counter's roll: from `from` to `to`, starting at clock time `at`. */
type Roll = { from: number; to: number; at: number; shown: number };

/** The reveal's own clock: wall time since mount, minus every millisecond the tab was hidden. */
const clock = (st: { clock0: number; hiddenMs: number }) => performance.now() - st.clock0 - st.hiddenMs;

/** Rolls the counter on from wherever it has got to, so a new page never makes it jump back. */
const rollTo = (roll: Roll, to: number, at: number) => {
  roll.from = roll.shown;
  roll.to = to;
  roll.at = at;
};

export function ParticleReveal({ ref, total, onBurst, onDone, onFailed }: ParticleRevealProps) {
  const reduce = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onBurst, onDone, onFailed });
  cbs.current = { onBurst, onDone, onFailed };

  // Engine state lives in a ref: the rAF loop never re-renders React.
  const engine = useRef({
    particles: [] as Particle[],
    /** Transactions reported, particles actually spawned, and how far into the dust we've claimed. */
    seen: 0,
    real: 0,
    dustCursor: 0,
    cap: PARTICLE_CAP.desktop as number,
    w: 0,
    h: 0,
    phase: "gather" as Phase,
    completeAt: -1,
    holdAt: 0,
    burstAt: 0,
    failAt: 0,
    failed: false,
    count: { from: 0, to: 0, at: 0, shown: 0 } as Roll,
    /** Set by `complete()`: the final count is a lower bound, so the counter lands with a "+". */
    capped: false,
    clock0: 0,
    hiddenAt: 0,
    hiddenMs: 0,
  });
  const [label, setLabel] = useState<"reading" | "done">("reading");
  const [finalTotal, setFinalTotal] = useState<number | undefined>(total);
  const [announced, setAnnounced] = useState(0);
  const [capped, setCapped] = useState(false);
  const [reducedCount, setReducedCount] = useState(0);
  const [reducedOut, setReducedOut] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      addTransactions(n) {
        const st = engine.current;
        st.seen += n;
        if (reduce) {
          setReducedCount(st.seen);
          return;
        }
        const t = clock(st);
        rollTo(st.count, st.seen, t);
        const add = Math.min(n, st.cap - st.real);
        for (let i = 0; i < add; i++) {
          // Spread the page's particles across `spread` so they don't all appear on one frame.
          const born = t + (i / Math.max(1, add)) * revealMs.spread;
          while (st.dustCursor < st.particles.length && !st.particles[st.dustCursor]?.dust) st.dustCursor++;
          const dust = st.particles[st.dustCursor];
          if (dust) {
            // A real transaction claims a dust particle where it already sits, keeping its birth so
            // it doesn't fade in a second time.
            reseedParticle(dust, false, dust.born);
            st.dustCursor++;
          } else {
            st.particles.push(spawnParticle(false, born, st.w, st.h));
          }
          st.real++;
        }
      },
      complete(finalCount, capped) {
        const st = engine.current;
        setFinalTotal(finalCount);
        setCapped(capped);
        st.seen = finalCount;
        st.capped = capped;
        if (reduce) {
          setReducedCount(finalCount);
          setLabel("done");
          setReducedOut(true);
          window.setTimeout(() => {
            cbs.current.onBurst?.();
            cbs.current.onDone?.();
          }, revealMs.reducedFade);
          return;
        }
        const t = clock(st);
        rollTo(st.count, finalCount, t);
        st.completeAt = t;
      },
      fail() {
        if (reduce) {
          setReducedOut(true);
          window.setTimeout(() => cbs.current.onFailed?.(), revealMs.reducedFade);
          return;
        }
        const st = engine.current;
        if (st.phase === "done") return;
        st.phase = "failing";
        st.failAt = clock(st);
        st.failed = true;
      },
    }),
    [reduce],
  );

  // The live region announces at most once a second, however fast the pages arrive.
  useEffect(() => {
    const id = window.setInterval(
      () => setAnnounced((a) => (a === engine.current.seen ? a : engine.current.seen)),
      revealMs.announce,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (reduce) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const st = engine.current;
    st.clock0 = performance.now();

    // Colour tokens, read once and prebaked into every alpha the loop can paint with, so the hot
    // loop allocates no strings.
    const root = getComputedStyle(document.documentElement);
    const fallback = parseRgb(getComputedStyle(canvas).color) ?? LAST_RESORT_RGB;
    const token = (name: string) => parseRgb(root.getPropertyValue(name)) ?? fallback;
    const tones = [token("--fg"), token("--primary"), token("--notice")].map(alphaTable);

    const resize = () => {
      // DPR is capped at 2: a 3x phone would cost three times the fill for no visible gain.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (st.w && st.h) {
        for (const p of st.particles) {
          p.x0 *= w / st.w;
          p.y0 *= h / st.h;
        }
      }
      st.w = w;
      st.h = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    st.cap = particleCap(st.w);
    for (let i = 0; i < DUST_COUNT; i++) {
      st.particles.push(spawnParticle(true, Math.random() * revealMs.scatter, st.w, st.h));
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // One point, reused by every particle on every frame.
    const at: Point = { x: 0, y: 0 };
    let raf = 0;

    const frame = () => {
      const t = clock(st);
      const { w, h } = st;
      const cx = w / 2;
      const cy = h / 2 - RING_OFFSET_Y;
      const radius = ringRadius(w);

      // Phase transitions, driven by the paused-aware clock.
      if (st.phase === "gather" && st.completeAt >= 0 && t >= Math.max(revealMs.minReveal, st.completeAt)) {
        st.phase = "hold";
        st.holdAt = t;
        setLabel("done");
      } else if (st.phase === "hold" && t >= st.holdAt + revealMs.hold) {
        st.phase = "burst";
        st.burstAt = t;
        cbs.current.onBurst?.();
      } else if (st.phase === "burst" && t >= st.burstAt + revealMs.burst) {
        st.phase = "done";
        cbs.current.onDone?.();
      } else if (st.phase === "failing" && t >= st.failAt + revealMs.fail) {
        st.phase = "done";
        cbs.current.onFailed?.();
      }

      const bursting = st.phase === "burst" || (st.phase === "done" && !st.failed);
      const b = bursting ? easeOut(clamp01((t - st.burstAt) / revealMs.burst)) : 0;
      const f = st.failed ? clamp01((t - st.failAt) / revealMs.fail) : 0;
      const fade = (1 - b) * (1 - f);

      const c = st.count;
      c.shown = c.from + (c.to - c.from) * easeOut(clamp01((t - c.at) / revealMs.countRoll));
      if (countRef.current) {
        countRef.current.textContent = rollingCountLabel(Math.round(c.shown), c.to, st.capped);
      }
      if (overlayRef.current) overlayRef.current.style.opacity = String(fade);

      ctx.clearRect(0, 0, w, h);
      for (const p of st.particles) {
        placeAt(p, t, radius, cx, cy, at);
        let x = at.x;
        let y = at.y;
        if (b > 0) {
          if (!p.hasBurst) {
            placeAt(p, st.burstAt, radius, cx, cy, at);
            p.bx = at.x;
            p.by = at.y;
            p.hasBurst = true;
          }
          // The burst throws each particle straight out from the centre it gathered around.
          const dx = p.bx - cx;
          const dy = p.by - cy;
          const len = Math.hypot(dx, dy) || 1;
          x = p.bx + (dx / len) * p.push * b;
          y = p.by + (dy / len) * p.push * b;
        }
        const alpha = p.alpha * clamp01((t - p.born) / revealMs.fadeIn) * fade;
        if (alpha <= 0.01) {
          p.hasTrail = false;
          continue;
        }
        const tone = tones[p.tone];
        const fill = tone?.[alphaIndex(alpha)];
        if (fill === undefined) continue;
        if (p.hasTrail) {
          const mx = x - p.px;
          const my = y - p.py;
          const m = Math.hypot(mx, my);
          const stroke = tone?.[alphaIndex(alpha * 0.5)];
          if (m > 0.2 && stroke !== undefined) {
            const l = Math.min(TRAIL_LENGTH, m * 4) / m;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = p.size;
            ctx.beginPath();
            ctx.moveTo(x - mx * l, y - my * l);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
        p.px = x;
        p.py = y;
        p.hasTrail = true;
      }
      if (st.phase !== "done") raf = requestAnimationFrame(frame);
    };

    // Pause the clock and the loop while the tab is hidden, so no phase runs out unwatched.
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
  const status =
    label === "done"
      ? "Done"
      : knownTotal != null
        ? `Reading ${countLabel(knownTotal, capped)} transactions…`
        : "Reading transactions…";

  // Reduced motion: no canvas, a static count, then a crossfade out — DESIGN.md §3.
  // Both roots carry `data-theme="dark"`: the reveal is the story's first frame, and the story is
  // designed dark only, so it re-declares the dark palette inside a page the system set to light.
  if (reduce) {
    return (
      <div
        data-theme="dark"
        className="fixed inset-0 grid place-items-center bg-bg px-5 text-center transition-opacity duration-(--duration-base) ease-in-out"
        style={{ opacity: reducedOut ? 0 : 1 }}
      >
        <p className="text-body text-fg-muted" aria-hidden>
          Reading <span className="tabular-nums text-fg">{countLabel(reducedCount, capped)}</span> transactions…
        </p>
        <LiveCount announced={announced} done={label === "done"} capped={capped} />
      </div>
    );
  }

  return (
    <div data-theme="dark" className="fixed inset-0 bg-bg" aria-busy={label !== "done"}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex -translate-y-2.5 flex-col items-center gap-1.5">
            {/* The rolling number is written by the loop, so the live region below reads instead. */}
            <span ref={countRef} className="text-stat font-medium tabular-nums" aria-hidden>
              0
            </span>
            <span className="text-small text-fg-muted">transactions</span>
          </div>
        </div>
        <p className="absolute inset-x-0 bottom-30 text-center text-body text-fg-muted max-sm:bottom-24">{status}</p>
      </div>
      <LiveCount announced={announced} done={label === "done"} capped={capped} />
    </div>
  );
}

/**
 * The counter's only announced copy: polite, and updated at most once a second.
 *
 * A cut-short year is announced as "at least", which is the same lower bound the "+" writes on the
 * counter — a symbol a screen reader would otherwise read out as a plus sign or skip entirely.
 */
function LiveCount({ announced, done, capped }: { announced: number; done: boolean; capped: boolean }) {
  const read = `${countLabel(announced, false)} transactions read`;
  return (
    <p className="sr-only" aria-live="polite">
      {done ? (capped ? `At least ${read}` : read) : `${read} so far`}
    </p>
  );
}
