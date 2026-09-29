import { revealMs } from "./motion";

/**
 * The particle reveal's geometry, easing and colour maths — DESIGN.md §3.
 *
 * Kept apart from `ParticleReveal.tsx` because all of it is pure and testable, while the component
 * around it is a canvas and a rAF loop that no test environment can run. Nothing here allocates
 * once the reveal is running: positions are written into a caller-owned point, and every
 * `rgba(…)` string the loop paints with is built up front.
 */

/** Particles below this viewport width use the mobile cap. */
export const MOBILE_BREAKPOINT = 640;
/** Dust pads the field so a quiet wallet still reads as a field of particles. */
export const DUST_COUNT = 240;
/** One particle per transaction, up to this many. */
export const PARTICLE_CAP = { desktop: 1500, mobile: 600 } as const;
/** The ring's radius, by viewport width. */
export const RING_RADIUS = { desktop: 200, mobile: 120 } as const;
/** The ring turns 6°/s, in radians per millisecond. */
const ROTATION = (6 * Math.PI) / 180 / 1000;
/** Longest motion trail, in px. */
export const TRAIL_LENGTH = 6;
/** Standard deviation of a particle's offset from the ring, in px. */
const BAND = 14;
/** The ring sits slightly above the centre, so the counter reads inside it. */
export const RING_OFFSET_Y = 10;

export const particleCap = (width: number) => (width < MOBILE_BREAKPOINT ? PARTICLE_CAP.mobile : PARTICLE_CAP.desktop);
export const ringRadius = (width: number) => (width < MOBILE_BREAKPOINT ? RING_RADIUS.mobile : RING_RADIUS.desktop);

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Newton-solved cubic Bézier, so the canvas eases on the same curves as the CSS tokens. */
export const bezier = (x1: number, y1: number, x2: number, y2: number) => (x: number) => {
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

/** `--ease-out` and `--ease-in-out`, as functions the canvas can sample. */
export const easeOut = bezier(0.22, 1, 0.36, 1);
export const easeInOut = bezier(0.65, 0, 0.35, 1);

/** Roughly normal, in about [-1, 1]. */
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

/** Index into `colors`: 0 foreground, 1 primary, 2 notice. */
export type Tone = 0 | 1 | 2;

export type Particle = {
  /** Spawn point, and drift in px/ms from it. */
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  /** Clock time this particle appears at, and how long its flight to the ring takes. */
  born: number;
  travel: number;
  /** Position on the ring, and its offset from the ring's radius. */
  angle: number;
  band: number;
  size: number;
  tone: Tone;
  alpha: number;
  dust: boolean;
  /** How far the burst throws this particle outwards. */
  push: number;
  /** Position at burst start, latched on the first burst frame. */
  bx: number;
  by: number;
  hasBurst: boolean;
  /** Previous frame's position, for the motion trail. */
  px: number;
  py: number;
  hasTrail: boolean;
};

/** Fresh drift, flight, ring seat and look. The caller owns where in the field it lands. */
export function spawnParticle(dust: boolean, born: number, width: number, height: number): Particle {
  const p: Particle = {
    x0: 0,
    y0: 0,
    vx: 0,
    vy: 0,
    born,
    travel: 0,
    angle: 0,
    band: 0,
    size: 0,
    tone: 0,
    alpha: 0,
    dust,
    push: 0,
    bx: 0,
    by: 0,
    hasBurst: false,
    px: 0,
    py: 0,
    hasTrail: false,
  };
  p.x0 = Math.random() * width;
  p.y0 = Math.random() * height;
  p.angle = Math.random() * Math.PI * 2;
  p.band = gauss() * BAND;
  reseedParticle(p, dust, born);
  return p;
}

/**
 * Re-rolls everything except where the particle already is — its spawn point, its ring seat and its
 * band. A real transaction claims a dust particle this way, so the field never jumps.
 */
export function reseedParticle(p: Particle, dust: boolean, born: number): void {
  const k = Math.random();
  p.vx = (Math.random() - 0.5) * 0.016;
  p.vy = (Math.random() - 0.5) * 0.016;
  p.born = born;
  p.travel = revealMs.travelMin + Math.random() * (revealMs.travelMax - revealMs.travelMin);
  p.size = 0.8 + Math.random() * 1.4;
  p.tone = dust || k < 0.88 ? 0 : k < 0.97 ? 1 : 2;
  p.alpha = dust ? 0.25 : 0.3 + Math.random() * 0.6;
  p.dust = dust;
  p.push = 300 + Math.random() * 400;
  p.hasBurst = false;
  p.hasTrail = false;
}

export type Point = { x: number; y: number };

/**
 * Writes the particle's position at clock time `t` into `out`: drifting from its spawn point until
 * the scatter ends, then easing onto the turning ring over its own flight time.
 */
export function placeAt(p: Particle, t: number, radius: number, cx: number, cy: number, out: Point): void {
  const gatherAt = Math.max(p.born, revealMs.scatter);
  if (t < gatherAt) {
    out.x = p.x0 + p.vx * (t - p.born);
    out.y = p.y0 + p.vy * (t - p.born);
    return;
  }
  const fx = p.x0 + p.vx * (gatherAt - p.born);
  const fy = p.y0 + p.vy * (gatherAt - p.born);
  const angle = p.angle + t * ROTATION;
  const r = radius + p.band;
  const e = easeInOut(clamp01((t - gatherAt) / p.travel));
  out.x = fx + (cx + Math.cos(angle) * r - fx) * e;
  out.y = fy + (cy + Math.sin(angle) * r - fy) * e;
}

/**
 * Reads one of the theme's colour tokens as the `r,g,b` triplet canvas `rgba()` needs.
 * Returns null for anything it can't read, so the caller falls back to a colour it can.
 */
export function parseRgb(value: string): string | null {
  const v = value.trim();
  const hex = /^#?([0-9a-f]{6})$/i.exec(v);
  const digits = hex?.[1];
  if (digits !== undefined) {
    const n = Number.parseInt(digits, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  const [, r, g, b] = rgb ?? [];
  if (r === undefined || g === undefined || b === undefined) return null;
  return `${Math.round(Number(r))},${Math.round(Number(g))},${Math.round(Number(b))}`;
}

/** Alpha is quantised to this many steps so the loop paints with prebuilt strings. */
export const ALPHA_STEPS = 64;

/** Every `rgba()` string one tone can be painted in, built once at setup. */
export const alphaTable = (rgb: string): readonly string[] =>
  Array.from({ length: ALPHA_STEPS + 1 }, (_, i) => `rgba(${rgb},${i / ALPHA_STEPS})`);

export const alphaIndex = (alpha: number) => Math.round(clamp01(alpha) * ALPHA_STEPS);

/**
 * Only reachable where the resolved styles carry no colour at all, so no token can be read — never in
 * a browser painting the canvas.
 */
export const LAST_RESORT_RGB = "255,255,255";

/**
 * The resolved styles the tones are read out of: `color` as the ink the element already inherits, and
 * the palette's own custom properties. A `CSSStyleDeclaration` satisfies it, and so does anything else
 * that can answer those two questions, which is what lets a test hold this without a browser.
 */
export type ColorTokens = {
  readonly color: string;
  getPropertyValue(name: string): string;
};

/**
 * The three tones the field is painted in — `fg`, `primary`, `notice` — each as every `rgba()` string
 * the loop can need. A canvas inherits no CSS, so handing it these tables is the only way the theme
 * reaches it: read them off the canvas's own resolved styles, and read them again whenever the theme
 * changes, or the field keeps painting the palette it was handed.
 */
export function toneTables(tokens: ColorTokens): readonly (readonly string[])[] {
  const fallback = parseRgb(tokens.color) ?? LAST_RESORT_RGB;
  const tone = (name: string) => parseRgb(tokens.getPropertyValue(name)) ?? fallback;
  return [tone("--fg"), tone("--primary"), tone("--notice")].map(alphaTable);
}
