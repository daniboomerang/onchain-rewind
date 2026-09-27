import { displayName, fmt, type RewindFacts } from "../engine/types";

const W = 1200;
const H = 630;
const SCALE = 2;
const PAD = 64;
/**
 * The share image is always dark, whatever theme the page is in, so its palette is frozen here
 * rather than read from `tokens.css`: these are the dark-theme values, as literals canvas can use.
 */
const C = {
  bg: "#16161a",
  fg: "#ffffff",
  muted: "#9c9ca3",
  primary: "0,163,245",
  notice: "255,157,28",
  white: "255,255,255",
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = "Geist, system-ui, sans-serif";

/** 1200×630 share image at 2× (2400×1260 PNG). Always dark. Waits for fonts. */
export async function renderShareImage(facts: RewindFacts): Promise<Blob> {
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

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  drawRing(ctx, 960, 250, 170, facts.wallet.address);

  ctx.textBaseline = "alphabetic";

  // Wordmark
  ctx.fillStyle = C.fg;
  ctx.font = `500 20px ${SANS}`;
  ctx.fillText("Onchain", PAD, PAD + 20);
  const wx = PAD + ctx.measureText("Onchain ").width;
  ctx.font = `italic 400 25px ${SERIF}`;
  ctx.fillText("Rewind", wx, PAD + 20);

  // Name
  const name = displayName(facts.wallet);
  ctx.fillStyle = C.muted;
  ctx.font = `400 22px ${SANS}`;
  ctx.fillText("A year onchain", PAD, 262);
  ctx.fillStyle = C.fg;
  ctx.font = `400 ${name.length > 14 ? 72 : 112}px ${SERIF}`;
  ctx.fillText(name, PAD, 370, W - PAD * 2);

  // Stats
  const stats = [
    [fmt.int(facts.txCount), "transactions"],
    [fmt.int(facts.chainCount), facts.chainCount === 1 ? "chain" : "chains"],
    [facts.topToken?.symbol ?? "—", "top token"],
    [facts.firstTx ? fmt.monthYear(facts.firstTx.date) : "—", "onchain since"],
  ] as const;
  let x = PAD;
  for (const [value, label] of stats) {
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
function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, seed: string) {
  let s = [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 2147483647, 7) || 7;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < 700; i++) {
    const k = rnd();
    const rgb = k < 0.88 ? C.white : k < 0.97 ? C.primary : C.notice;
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
