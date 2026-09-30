import { displayName, fmt, type RewindFacts } from "../engine/types";
import { countLabel, onchainSinceLabel } from "./capped";

const W = 1200;
const H = 630;
const SCALE = 2;
const PAD = 64;
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = "Geist, system-ui, sans-serif";

/** The theme the image is painted in — the one the visitor chose, the same as the page's. */
export type ShareImageTheme = "dark" | "light";

export type ShareImagePalette = {
  /** Ground, ink and the quieter ink the labels are drawn in. */
  readonly bg: string;
  readonly fg: string;
  readonly muted: string;
  /** The ring's three tones as `r,g,b` triplets — `fg`, `primary`, `notice` — for canvas `rgba()`. */
  readonly tones: readonly [string, string, string];
};

/**
 * Each theme's palette, as literals a canvas can use: it is painted off-document, so no element of it
 * resolves a CSS token, and the values are `tokens.css`'s own for the theme named. The image follows
 * the app's one light/dark setting, so it and the share card on screen read as the same card.
 */
const PALETTE: Record<ShareImageTheme, ShareImagePalette> = {
  dark: {
    bg: "#16161a",
    fg: "#ffffff",
    muted: "#9c9ca3",
    tones: ["255,255,255", "0,163,245", "255,157,28"],
  },
  light: {
    bg: "#ffffff",
    fg: "#16161a",
    muted: "#6e6e76",
    tones: ["22,22,26", "41,98,239", "255,157,28"],
  },
};

/** The palette one theme's image is painted in. Exported because no test environment has a 2D context. */
export const shareImagePalette = (theme: ShareImageTheme): ShareImagePalette => PALETTE[theme];

/**
 * The image's four stats, as `[value, label]` pairs, in the order they are drawn.
 *
 * It is the share card's row, drawn with a canvas instead of the DOM, so the two read the same for
 * the same facts — including when the year was cut short, where the count carries a "+" and the
 * oldest transaction that arrived is a date the wallet was already onchain by. Exported because no
 * test environment has a 2D context, so this is the part of the image a test can hold.
 */
export function shareImageStats(facts: RewindFacts, capped: boolean): readonly (readonly [string, string])[] {
  return [
    [countLabel(facts.txCount, capped), "transactions"],
    [fmt.int(facts.chainCount), facts.chainCount === 1 ? "chain" : "chains"],
    [facts.topToken?.symbol ?? "—", "top token"],
    [facts.firstTx ? fmt.monthYear(facts.firstTx.date) : "—", onchainSinceLabel(capped)],
  ];
}

/**
 * 1200×630 share image at 2× (2400×1260 PNG), in the theme the app is in. Waits for fonts.
 *
 * `recorded` marks the image as the recorded snapshot (ADR-0005) beside the wordmark: the image travels
 * off the site without the chrome's note, so it has to carry the mark itself.
 */
export async function renderShareImage(
  facts: RewindFacts,
  capped: boolean,
  theme: ShareImageTheme,
  recorded = false,
): Promise<Blob> {
  await Promise.allSettled([
    document.fonts.load(`400 112px ${SERIF}`),
    document.fonts.load(`italic 400 25px ${SERIF}`),
    document.fonts.load(`500 44px ${SANS}`),
    document.fonts.load(`400 17px ${SANS}`),
  ]);
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.scale(SCALE, SCALE);

  const C = shareImagePalette(theme);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  drawRing(ctx, 960, 250, 170, facts.wallet.address, C.tones);

  ctx.textBaseline = "alphabetic";

  // Wordmark
  ctx.fillStyle = C.fg;
  ctx.font = `500 20px ${SANS}`;
  ctx.fillText("Onchain", PAD, PAD + 20);
  const wx = PAD + ctx.measureText("Onchain ").width;
  ctx.font = `italic 400 25px ${SERIF}`;
  ctx.fillText("Rewind", wx, PAD + 20);
  if (recorded) {
    const mx = wx + ctx.measureText("Rewind").width;
    ctx.fillStyle = C.muted;
    ctx.font = `400 20px ${SANS}`;
    ctx.fillText(" · Recorded snapshot", mx, PAD + 20);
  }

  // Name
  const name = displayName(facts.wallet);
  ctx.fillStyle = C.muted;
  ctx.font = `400 22px ${SANS}`;
  ctx.fillText("A year onchain", PAD, 262);
  ctx.fillStyle = C.fg;
  ctx.font = `400 ${name.length > 14 ? 72 : 112}px ${SERIF}`;
  ctx.fillText(name, PAD, 370, W - PAD * 2);

  // Stats
  let x = PAD;
  for (const [value, label] of shareImageStats(facts, capped)) {
    ctx.font = `500 44px ${SANS}`;
    ctx.fillStyle = C.fg;
    ctx.fillText(value, x, H - PAD - 34);
    const vw = ctx.measureText(value).width;
    ctx.font = `400 17px ${SANS}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(label, x, H - PAD);
    x += Math.max(vw, ctx.measureText(label).width) + 56;
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

/** Static particle ring, seeded by the address so each wallet's image is stable. */
function drawRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  seed: string,
  tones: readonly [string, string, string],
) {
  let s = [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 2147483647, 7) || 7;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < 700; i++) {
    const k = rnd();
    const rgb = k < 0.88 ? tones[0] : k < 0.97 ? tones[1] : tones[2];
    const a = rnd() * Math.PI * 2;
    const r = R + ((rnd() + rnd() + rnd() - 1.5) / 1.5) * 14;
    ctx.fillStyle = `rgba(${rgb},${0.3 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.8 + rnd() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** navigator.share({ files }) where supported; otherwise a download. */
export async function shareOrDownload(
  blob: Blob,
  filename = "onchain-rewind.png",
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Onchain Rewind" });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
