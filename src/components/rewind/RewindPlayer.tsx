import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayName, fmt, type RewindFacts, shortAddress } from "../../engine/types";
import { countLabel, onchainSinceLabel, originKicker, rollingCountLabel } from "../../lib/capped";
import { renderShareImage, shareOrDownload } from "../../lib/renderShareImage";
import { Button } from "../ui/Button";
import { readTheme } from "../ui/theme";
import { ChainBar } from "./ChainBar";
import { ChainIcon } from "./ChainIcon";
import { EmptyState } from "./EmptyState";
import { LineChart } from "./LineChart";
import { duration, holdMs, PlaybackContext } from "./motion";
import { ProgressSegments } from "./ProgressSegments";
import { ShareCard } from "./ShareCard";
import { StatNumber } from "./StatNumber";
import { StoryCard, StoryStage } from "./StoryCard";
import { StoryChrome } from "./StoryChrome";
import { TokenIcon } from "./TokenIcon";

export type RewindPlayerProps = {
  facts: RewindFacts;
  /**
   * The facts describe the newest slice of the window rather than all of it (`useRewind`), so every
   * figure counted off them is a lower bound: the counts carry a "+", and the oldest transaction
   * that happened to arrive is labelled as a date the wallet was already onchain by, never as the
   * day its year started.
   */
  capped: boolean;
  onReplay: () => void;
  onOpenSettings: () => void;
  /** Escape does the same; both leave the story for the start screen. Omitted where there isn't one. */
  onClose?: () => void;
};

/** Below this width the pointer split is 30/70 rather than 50/50 — DESIGN.md §3. */
const MOBILE_BP = 640;

/** One story card, as the player composes it. Exported so a test can mount the real ones. */
export type Card = { key: string; eyebrow: string; render: (index: number, total: number) => ReactNode };

/** Plays the story: chrome, cards, navigation, pause. Card 5 (Share) doesn't auto-advance. */
export function RewindPlayer({ facts, capped, onReplay, onOpenSettings, onClose }: RewindPlayerProps) {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [nonce, setNonce] = useState(0); // re-keys a card when "previous" is pressed on card 1
  const [paused, setPaused] = useState(false);
  const [navigated, setNavigated] = useState(false);
  const [sharing, setSharing] = useState(false);

  const share = useCallback(async () => {
    setSharing(true);
    try {
      // Read at the moment of the press, not at render: the theme can have turned while the story played.
      const blob = await renderShareImage(facts, capped, readTheme());
      await shareOrDownload(blob, `onchain-rewind-${facts.wallet.name ?? shortAddress(facts.wallet.address)}.png`);
    } finally {
      setSharing(false);
    }
  }, [facts, capped]);

  const cards = useMemo(
    () => buildCards(facts, { share, sharing, onReplay, capped }),
    [facts, share, sharing, onReplay, capped],
  );
  const last = cards.length - 1;

  const go = useCallback(
    (delta: 1 | -1) => {
      setNavigated(true);
      setDirection(delta);
      setCurrent((c) => {
        const next = c + delta;
        if (next < 0) {
          setNonce((n) => n + 1);
          return 0;
        }
        return Math.min(next, last);
      });
    },
    [last],
  );

  // Pointer: short press = navigate by side, hold ≥ `holdMs` = pause. A hold is never a click.
  const press = useRef<{ timer: number; held: boolean } | null>(null);
  const isInteractive = (el: EventTarget | null) =>
    el instanceof Element && !!el.closest("button, a, input, [data-chrome], [role=dialog]");

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || isInteractive(e.target)) return;
    const timer = window.setTimeout(() => {
      if (press.current) press.current.held = true;
      setPaused(true);
    }, holdMs);
    press.current = { timer, held: false };
  };
  const onPointerUp = (e: PointerEvent) => {
    const p = press.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    press.current = null;
    if (p.held) return setPaused(false);
    const w = window.innerWidth;
    const split = w < MOBILE_BP ? 0.3 : 0.5;
    go(e.clientX < w * split ? -1 : 1);
  };
  const onPointerCancel = () => {
    const p = press.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (p.held) setPaused(false);
    press.current = null;
  };

  // Keys: ← →, Space = hold-to-pause. The arrows are ignored only where they already mean
  // something else — a text field, or an open dialog — so the story keeps moving while a button
  // has focus, which is where focus lands once the settings dialog returns it to the gear. Space
  // additionally yields to a focused button, whose native activation it is.
  useEffect(() => {
    const element = (e: KeyboardEvent) => (e.target instanceof Element ? e.target : null);
    const inTextEntry = (e: KeyboardEvent) =>
      !!element(e)?.closest("input, textarea, [contenteditable], [role=dialog]");
    const onButton = (e: KeyboardEvent) => !!element(e)?.closest("button");
    const down = (e: KeyboardEvent) => {
      if (inTextEntry(e)) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.code === "Space") {
        if (onButton(e)) return;
        e.preventDefault();
        if (!e.repeat) setPaused(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !inTextEntry(e) && !onButton(e)) setPaused(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [go]);

  if (facts.txCount === 0) return <EmptyState wallet={displayName(facts.wallet)} onChangeWallet={onOpenSettings} />;

  const card = cards[current] ?? cards[0];
  const showHint = !navigated && current !== last && !paused;

  // Reduced motion keeps the states — the dim while paused, the pill that replaces the hint — and
  // drops the tween between them, the same way the entrance variants snap y rather than moving it.
  // Only the durations vary: every `initial` and `animate` value below is preference-independent,
  // so the server's markup never depends on a media query it cannot read.
  const fade = { duration: reduce ? 0 : duration.fast };
  const fadeIn = { duration: reduce ? 0 : duration.base };

  return (
    <PlaybackContext value={{ paused }}>
      {/*
       * The pointer gestures cover the whole surface, so the surface is a named `section` rather
       * than a bare div: the story and its chrome are one region a screen reader can find. Every
       * gesture has a keyboard equivalent on `window` — ← → navigate, Space pauses — so nothing
       * here is reachable by pointer alone.
       *
       * The surface declares no theme of its own: the story follows the app's one light/dark setting,
       * so the cards, the chrome over them and the share panel all paint from the page's palette and
       * turn with the toggle mid-play.
       */}
      <section
        aria-label="Rewind story"
        className="fixed inset-0 touch-none select-none overflow-hidden bg-bg text-fg"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <motion.div
          className="absolute inset-0"
          // The dim layer states where it starts, so the server writes the same opacity the client
          // hydrates with and Motion never has to read an animation's start value off the DOM.
          initial={{ opacity: 1 }}
          animate={{ opacity: paused ? 0.85 : 1 }}
          transition={fade}
        >
          {card && (
            <StoryStage id={`${card.key}-${nonce}`} direction={direction}>
              {card.render(current + 1, cards.length)}
            </StoryStage>
          )}
        </motion.div>

        <StoryChrome
          wallet={displayName(facts.wallet)}
          onOpenSettings={onOpenSettings}
          onClose={onClose}
          progress={
            <ProgressSegments
              count={cards.length}
              current={current}
              paused={paused}
              onComplete={() => go(1)}
              holdLast
            />
          }
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-5 max-sm:bottom-[max(28px,env(safe-area-inset-bottom))]">
          <AnimatePresence mode="wait">
            {paused ? (
              <motion.span
                key="paused"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fade}
                className="inline-flex h-9 items-center gap-2.5 whitespace-nowrap rounded-full bg-surface-raised px-4 text-[13px] font-medium"
              >
                <span aria-hidden className="flex gap-[3px]">
                  <span className="h-2.5 w-[3px] bg-fg" />
                  <span className="h-2.5 w-[3px] bg-fg" />
                </span>
                Paused · release to continue
              </motion.span>
            ) : showHint ? (
              <motion.span
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fadeIn}
                className="whitespace-nowrap text-[13px] text-fg-subtle"
              >
                <span className="max-sm:hidden">← → or click sides to navigate · hold or Space to pause</span>
                <span className="hidden max-sm:inline">Tap sides to navigate · hold to pause</span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </section>
    </PlaybackContext>
  );
}

/**
 * The story's cards for a wallet: Origin, Home chain, Top token and The ride where the facts carry
 * them, then the share card, which every wallet with a transaction gets. Exported for the entrance
 * tests, which mount each card the player would build rather than assembling their own.
 */
export function buildCards(
  f: RewindFacts,
  a: { share: () => void; sharing: boolean; onReplay: () => void; capped: boolean },
): Card[] {
  const cards: Card[] = [];

  if (f.firstTx) {
    const first = f.firstTx;
    cards.push({
      key: "origin",
      eyebrow: "Origin",
      render: (i, n) => (
        <StoryCard
          index={i}
          total={n}
          eyebrow="Origin"
          accent="var(--color-accent-origin)"
          kicker={originKicker(a.capped)}
          headline={fmt.dateLong(first.date)}
        >
          <div className="flex gap-16 pt-6 max-md:gap-8">
            <StatNumber
              value={f.daysOnchain}
              format={(n) => rollingCountLabel(n, f.daysOnchain, a.capped)}
              label="days onchain"
              accent="var(--color-accent-origin)"
              delay={0.16}
            />
            {first.chainName && (
              <div className="flex flex-col gap-1">
                <span className="text-stat font-medium">{first.chainName}</span>
                <span className="text-small text-fg-muted">first chain</span>
              </div>
            )}
          </div>
        </StoryCard>
      ),
    });
  }

  const top = f.chains[0];
  if (top) {
    const shown = f.chains.slice(0, 5);
    cards.push({
      key: "chain",
      eyebrow: "Home chain",
      render: (i, n) => (
        <StoryCard
          index={i}
          total={n}
          layout="split"
          eyebrow="Home chain"
          accent="var(--color-accent-chain)"
          kicker="You live on"
          headline={top.name}
          lead={`${Math.round(top.share)}% of your transactions${f.chainCount > 1 ? `, across ${f.chainCount} chains` : ""}.`}
        >
          <div className="flex flex-col gap-5.5 max-md:gap-4.5">
            {shown.map((c, idx) => (
              <ChainBar
                key={c.id}
                name={c.name}
                percent={c.share}
                max={top.share}
                index={idx}
                highlight={idx === 0}
                icon={<ChainIcon name={c.name} iconUrl={c.iconUrl} />}
              />
            ))}
          </div>
        </StoryCard>
      ),
    });
  }

  if (f.topToken) {
    const t = f.topToken;
    const up = t.changePct >= 0;
    cards.push({
      key: "token",
      eyebrow: "Top token",
      render: (i, n) => (
        <StoryCard
          index={i}
          total={n}
          eyebrow="Top token"
          accent={up ? "var(--color-accent-token)" : "var(--color-negative)"}
          kicker="Your top token"
          headline={t.name}
          media={<TokenIcon symbol={t.symbol} iconUrl={t.iconUrl} />}
        >
          <div className="flex flex-wrap items-end gap-20 pt-8 max-md:gap-8">
            <StatNumber
              size="xl"
              value={t.changePct}
              format={fmt.pct}
              label="price change since your first trade"
              accent={up ? "var(--color-accent-token)" : "var(--color-negative)"}
            />
            <StatNumber value={t.timesTraded} label="times traded" />
          </div>
        </StoryCard>
      ),
    });
  }

  if (f.balance && f.balance.series.length > 1) {
    const b = f.balance;
    const data = b.series.map((p) => ({ date: fmt.dateShort(p.date), value: p.value }));
    cards.push({
      key: "ride",
      eyebrow: "The ride",
      render: (i, n) => (
        <StoryCard
          index={i}
          total={n}
          eyebrow="The ride"
          accent="var(--color-accent-ride)"
          headline="Your year, in one line"
          headlineSize="lg"
        >
          <div className="flex flex-col gap-8">
            <div className="flex items-end justify-between gap-6">
              <StatNumber value={b.current} format={fmt.usd} label={`${fmt.pct(b.changePct)} this year`} />
            </div>
            <LineChart data={data} formatValue={fmt.usd} />
          </div>
        </StoryCard>
      ),
    });
  }

  cards.push({
    key: "share",
    eyebrow: "Your rewind",
    render: (i, n) => (
      <StoryCard index={i} total={n} layout="center" eyebrow="Your rewind" accent="var(--color-accent-share)">
        <div className="flex w-full flex-col items-center gap-8">
          <ShareCard
            name={displayName(f.wallet)}
            address={shortAddress(f.wallet.address)}
            stats={[
              { value: countLabel(f.txCount, a.capped), label: "transactions" },
              { value: fmt.int(f.chainCount), label: f.chainCount === 1 ? "chain" : "chains" },
              { value: f.topToken?.symbol ?? "—", label: "top token" },
              { value: f.firstTx ? fmt.monthYear(f.firstTx.date) : "—", label: onchainSinceLabel(a.capped) },
            ]}
          />
          <div className="flex gap-3">
            <Button variant="ghost" onClick={a.share} loading={a.sharing}>
              Share image
            </Button>
            <Button onClick={a.onReplay}>Replay</Button>
          </div>
        </div>
      </StoryCard>
    ),
  });

  return cards;
}
