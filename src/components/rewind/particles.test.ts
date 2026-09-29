import { expect, test } from "vitest";
import { revealMs } from "./motion";
import {
  ALPHA_STEPS,
  alphaIndex,
  alphaTable,
  type ColorTokens,
  easeInOut,
  easeOut,
  LAST_RESORT_RGB,
  MOBILE_BREAKPOINT,
  PARTICLE_CAP,
  type Point,
  parseRgb,
  particleCap,
  placeAt,
  RING_RADIUS,
  type Roll,
  reseedParticle,
  ringRadius,
  rollShown,
  rollTo,
  spawnParticle,
  toneTables,
} from "./particles";

/**
 * The reveal itself is a canvas and a rAF loop, and happy-dom has no 2D context — its phases are
 * proven in a browser. What is provable here is the maths underneath: the caps, the easing, where a
 * particle sits at a given moment, and the colour and alpha the loop paints it with.
 */

const point = (): Point => ({ x: 0, y: 0 });

test("one particle per transaction, capped lower on a phone than on a desktop", () => {
  expect(particleCap(MOBILE_BREAKPOINT - 1)).toBe(PARTICLE_CAP.mobile);
  expect(particleCap(MOBILE_BREAKPOINT)).toBe(PARTICLE_CAP.desktop);
  expect(particleCap(1440)).toBe(PARTICLE_CAP.desktop);
  expect(PARTICLE_CAP.mobile).toBeLessThan(PARTICLE_CAP.desktop);
});

test("the ring is tighter on a phone", () => {
  expect(ringRadius(MOBILE_BREAKPOINT - 1)).toBe(RING_RADIUS.mobile);
  expect(ringRadius(MOBILE_BREAKPOINT)).toBe(RING_RADIUS.desktop);
});

test("both easings run 0 → 1 without leaving the range, and clamp outside it", () => {
  for (const ease of [easeOut, easeInOut]) {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
    let previous = 0;
    for (let i = 1; i <= 20; i++) {
      const v = ease(i / 20);
      expect(v).toBeGreaterThanOrEqual(previous);
      expect(v).toBeLessThanOrEqual(1);
      previous = v;
    }
  }
});

test("easeOut leads its input and easeInOut sits on the diagonal at the midpoint", () => {
  expect(easeOut(0.25)).toBeGreaterThan(0.25);
  expect(easeInOut(0.5)).toBeCloseTo(0.5, 2);
});

test("a particle drifts from its own spawn point until the scatter ends", () => {
  const p = spawnParticle(false, 0, 800, 600);
  p.x0 = 100;
  p.y0 = 200;
  p.vx = 0.01;
  p.vy = -0.02;
  const out = point();
  placeAt(p, 0, 200, 400, 300, out);
  expect(out).toEqual({ x: 100, y: 200 });
  placeAt(p, revealMs.scatter / 2, 200, 400, 300, out);
  expect(out.x).toBeCloseTo(100 + 0.01 * (revealMs.scatter / 2), 6);
  expect(out.y).toBeCloseTo(200 - 0.02 * (revealMs.scatter / 2), 6);
});

test("once its flight is over, a particle sits its own band off the ring", () => {
  const p = spawnParticle(false, 0, 800, 600);
  p.band = 7;
  const out = point();
  placeAt(p, revealMs.scatter + p.travel, 200, 400, 300, out);
  expect(Math.hypot(out.x - 400, out.y - 300)).toBeCloseTo(207, 6);
});

test("a particle born mid-scatter still drifts for its full scatter, then flies", () => {
  const p = spawnParticle(false, revealMs.scatter * 2, 800, 600);
  const out = point();
  // Its own birth is later than the scatter, so the gather starts from the birth instead.
  placeAt(p, revealMs.scatter * 2, 200, 400, 300, out);
  expect(out).toEqual({ x: p.x0, y: p.y0 });
  placeAt(p, revealMs.scatter * 2 + p.travel, 200, 400, 300, out);
  expect(Math.hypot(out.x - 400, out.y - 300)).toBeCloseTo(200 + p.band, 6);
});

test("placeAt writes into the point it is given and allocates nothing", () => {
  const p = spawnParticle(true, 0, 800, 600);
  const out = point();
  placeAt(p, 1000, 200, 400, 300, out);
  const first = { ...out };
  placeAt(p, 2000, 200, 400, 300, out);
  expect(out).not.toEqual(first);
});

test("dust spawns inside the field, dimmer than a real transaction and in the base tone", () => {
  for (let i = 0; i < 50; i++) {
    const p = spawnParticle(true, 0, 800, 600);
    expect(p.dust).toBe(true);
    expect(p.tone).toBe(0);
    expect(p.alpha).toBeLessThan(0.3);
    expect(p.x0).toBeGreaterThanOrEqual(0);
    expect(p.x0).toBeLessThanOrEqual(800);
    expect(p.y0).toBeGreaterThanOrEqual(0);
    expect(p.y0).toBeLessThanOrEqual(600);
    expect(p.travel).toBeGreaterThanOrEqual(revealMs.travelMin);
    expect(p.travel).toBeLessThanOrEqual(revealMs.travelMax);
  }
});

test("a claimed dust particle keeps its place in the field but stops being dust", () => {
  const p = spawnParticle(true, 40, 800, 600);
  const { x0, y0, angle, band } = p;
  reseedParticle(p, false, p.born);
  expect(p).toMatchObject({ x0, y0, angle, band, dust: false, born: 40 });
  expect(p.alpha).toBeGreaterThanOrEqual(0.3);
  expect(p.hasBurst).toBe(false);
  expect(p.hasTrail).toBe(false);
});

test("most real particles take the base tone, a few the accents", () => {
  const tones = Array.from({ length: 3000 }, () => spawnParticle(false, 0, 800, 600).tone);
  expect(tones.filter((t) => t === 0).length).toBeGreaterThan(2400);
  expect(tones.filter((t) => t === 1).length).toBeGreaterThan(0);
  expect(tones.filter((t) => t === 2).length).toBeGreaterThan(0);
});

test("a colour token is read as the r,g,b triplet canvas rgba() needs", () => {
  expect(parseRgb("#00a3f5")).toBe("0,163,245");
  expect(parseRgb(" 00A3F5 ")).toBe("0,163,245");
  expect(parseRgb("#ffffff")).toBe("255,255,255");
  expect(parseRgb("rgb(1, 2, 3)")).toBe("1,2,3");
  expect(parseRgb("rgba(255 157 28 / 0.5)")).toBe("255,157,28");
});

test("an unreadable colour is refused rather than guessed", () => {
  expect(parseRgb("")).toBeNull();
  expect(parseRgb("#fff")).toBeNull();
  expect(parseRgb("oklch(0.7 0.1 200)")).toBeNull();
  expect(parseRgb("var(--fg)")).toBeNull();
});

test("every alpha the loop can ask for has a prebuilt string waiting", () => {
  const table = alphaTable("0,163,245");
  expect(table).toHaveLength(ALPHA_STEPS + 1);
  expect(table[alphaIndex(0)]).toBe("rgba(0,163,245,0)");
  expect(table[alphaIndex(1)]).toBe("rgba(0,163,245,1)");
  for (const alpha of [-1, 0, 0.003, 0.5, 0.999, 1, 2]) {
    expect(table[alphaIndex(alpha)]).toBeTypeOf("string");
  }
});

test("alphaIndex clamps to the table it indexes", () => {
  expect(alphaIndex(-5)).toBe(0);
  expect(alphaIndex(5)).toBe(ALPHA_STEPS);
  expect(alphaIndex(0.5)).toBe(ALPHA_STEPS / 2);
});

/** The two resolved palettes the canvas can be handed, as the tokens themselves declare them. */
const resolved = (tokens: Record<string, string>, color: string): ColorTokens => ({
  color,
  getPropertyValue: (name) => tokens[name] ?? "",
});

test("the tones are read from the theme the element resolves, so the field turns with the page", () => {
  const dark = toneTables(resolved({ "--fg": "#ffffff", "--primary": "#00a3f5", "--notice": "#ff9d1c" }, "#ffffff"));
  const light = toneTables(resolved({ "--fg": "#16161a", "--primary": "#2962ef", "--notice": "#ff9d1c" }, "#16161a"));

  expect(dark.map((tone) => tone[ALPHA_STEPS])).toEqual([
    "rgba(255,255,255,1)",
    "rgba(0,163,245,1)",
    "rgba(255,157,28,1)",
  ]);
  expect(light.map((tone) => tone[ALPHA_STEPS])).toEqual([
    "rgba(22,22,26,1)",
    "rgba(41,98,239,1)",
    "rgba(255,157,28,1)",
  ]);
  // Every alpha the loop can ask for is waiting in each theme's tables, not only the last.
  for (const tables of [dark, light]) {
    expect(tables).toHaveLength(3);
    for (const tone of tables) expect(tone).toHaveLength(ALPHA_STEPS + 1);
  }
});

test("a token it cannot read falls back to the ink the element already inherits", () => {
  const tones = toneTables(resolved({ "--fg": "var(--missing)", "--primary": "", "--notice": "#ff9d1c" }, "#16161a"));

  expect(tones[0]?.[ALPHA_STEPS]).toBe("rgba(22,22,26,1)");
  expect(tones[1]?.[ALPHA_STEPS]).toBe("rgba(22,22,26,1)");
  expect(tones[2]?.[ALPHA_STEPS]).toBe("rgba(255,157,28,1)");
});

const roll = (): Roll => ({ from: 0, to: 0, at: 0, dur: 1, shown: 0 });

test("a roll climbs at a steady, linear pace — not eased — and never passes its own target", () => {
  const r = roll();
  rollTo(r, 100, 0, 1000);

  // Linear: halfway through the duration is halfway to the target, unlike an ease-out curve.
  expect(rollShown(r, 500)).toBeCloseTo(50, 6);
  expect(rollShown(r, 250)).toBeCloseTo(25, 6);
  expect(rollShown(r, 0)).toBe(0);
  expect(rollShown(r, 1000)).toBe(100);
  // Never overshoots, however far past its own duration the clock has gone.
  expect(rollShown(r, 5000)).toBe(100);
});

test("a new page rolls on from wherever the counter has got to, so it never jumps back", () => {
  const r = roll();
  rollTo(r, 100, 0, 1000);
  r.shown = rollShown(r, 400); // partway through the first roll

  rollTo(r, 130, 400, 1000);
  expect(r.from).toBeCloseTo(40, 6);
  expect(rollShown(r, 400)).toBeCloseTo(r.from, 6);
  expect(rollShown(r, 1400)).toBe(130);
  // Monotonic: sampling forward in time never sees the shown value fall.
  let previous = rollShown(r, 400);
  for (let t = 400; t <= 1400; t += 100) {
    const shown = rollShown(r, t);
    expect(shown).toBeGreaterThanOrEqual(previous);
    previous = shown;
  }
});

test("a zero or negative duration still resolves to the target rather than dividing by zero", () => {
  const r = roll();
  rollTo(r, 42, 0, 0);
  expect(Number.isFinite(rollShown(r, 0))).toBe(true);
  // Clamped to a 1ms floor rather than a division by zero, so it reaches the target almost at once.
  expect(rollShown(r, 1)).toBe(42);
});

test("with no readable ink at all it still paints, on the last-resort tone", () => {
  const tones = toneTables(resolved({}, ""));

  expect(tones.map((tone) => tone[ALPHA_STEPS])).toEqual([
    `rgba(${LAST_RESORT_RGB},1)`,
    `rgba(${LAST_RESORT_RGB},1)`,
    `rgba(${LAST_RESORT_RGB},1)`,
  ]);
});
