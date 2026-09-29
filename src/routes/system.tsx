import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChainBar } from "../components/rewind/ChainBar";
import { ChainIcon } from "../components/rewind/ChainIcon";
import { EmptyState } from "../components/rewind/EmptyState";
import { ErrorState } from "../components/rewind/ErrorState";
import { LineChart } from "../components/rewind/LineChart";
import { PlaybackContext, revealMs } from "../components/rewind/motion";
import { ParticleReveal, type ParticleRevealHandle } from "../components/rewind/ParticleReveal";
import { ProgressSegments } from "../components/rewind/ProgressSegments";
import { RewindPlayer } from "../components/rewind/RewindPlayer";
import { ShareCard } from "../components/rewind/ShareCard";
import { StatNumber } from "../components/rewind/StatNumber";
import { StoryChrome } from "../components/rewind/StoryChrome";
import { TokenIcon } from "../components/rewind/TokenIcon";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { SettingsDialog } from "../components/ui/SettingsDialog";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { Tooltip } from "../components/ui/Tooltip";
import { type DemoWallet, WalletCombobox, type WalletStatus } from "../components/ui/WalletCombobox";
import { type FixtureName, fixtures } from "../engine/fixtures";
import { displayName, fmt, type RewindFacts, shortAddress } from "../engine/types";
import { PAGE_INTERVAL_MS, pageTick } from "./-paging";

export const Route = createFileRoute("/system")({ component: System });

/**
 * /system — every component in every state, on fixture data.
 * Hover, focus-visible and pressed are live: use pointer and Tab.
 */

const demoWallets: DemoWallet[] = [
  { label: "vitalik.eth", address: "0xd8dA…6045" },
  { label: "Demo wallet 2" },
  { label: "Demo wallet 3" },
];

/** A real same-origin file, so the loaded-image state of the icons is on the page too. */
const loadedIcon = "/wordmark.svg";
/** Decodes to bytes that are not an image: `onError` fires with no request, so no console error. */
const brokenIcon = "data:image/png;base64,Zm9v";
/** Refused by AvatarImage's scheme rule — it falls back without the browser leaving the page. */
const blockedIcon = "http://example.com/icon.png";

const normal = fixtures.normal;
const topShare = normal.chains[0]?.share ?? 1;
const balanceSeries = (normal.balance?.series ?? []).map((p) => ({ date: fmt.dateShort(p.date), value: p.value }));

function System() {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-20 px-8 py-16 max-md:px-5">
        <header className="flex flex-col gap-3">
          <span className="text-label font-medium uppercase text-fg-subtle">/system</span>
          <h1 className="font-display text-display">
            Onchain <i>Rewind</i>
          </h1>
          <ThemeRow />
        </header>

        <Section title="Button">
          <Row label="primary">
            <Button>Replay</Button>
            <Button disabled>Replay</Button>
            <Button loading>Saving</Button>
          </Row>
          <Row label="ghost">
            <Button variant="ghost">Share image</Button>
            <Button variant="ghost" disabled>
              Share image
            </Button>
            <Button variant="ghost" loading>
              Rendering
            </Button>
          </Row>
          <Row label="icon">
            <IconButton label="Change wallet" />
            <IconButton label="Change wallet" disabled />
            <IconButton label="Change wallet" loading />
          </Row>
        </Section>

        <Section title="Tooltip">
          <Row label="label / value">
            <Tooltip content="Change wallet">
              <Button variant="ghost">Hover or focus me</Button>
            </Tooltip>
            <Tooltip
              tone="value"
              placement="top"
              content={
                <span className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em]">Peak · Oct 12</span>
                  <span className="text-[15px] font-semibold">$24,310</span>
                </span>
              }
            >
              <Button variant="ghost">Chart point</Button>
            </Tooltip>
          </Row>
        </Section>

        <Section title="ProgressSegments">
          <ProgressDemo />
        </Section>

        <Section title="StatNumber">
          <Replayable>
            <div className="flex flex-wrap items-end gap-12">
              <StatNumber value={normal.txCount} label="transactions" />
              <StatNumber
                value={normal.topToken?.changePct ?? 0}
                format={fmt.pct}
                size="xl"
                accent="var(--color-accent-token)"
                label="price change"
              />
              <StatNumber
                value={fixtures.negative.topToken?.changePct ?? 0}
                format={fmt.pct}
                size="xl"
                accent="var(--color-negative)"
                label="negative"
              />
            </div>
          </Replayable>
        </Section>

        <Section title="ChainBar · ChainIcon · TokenIcon">
          <Replayable>
            <div className="flex max-w-[620px] flex-col gap-5">
              {normal.chains.map((c, i) => (
                <ChainBar
                  key={c.id}
                  name={c.name}
                  percent={c.share}
                  max={topShare}
                  index={i}
                  highlight={i === 0}
                  icon={<ChainIcon name={c.name} iconUrl={c.iconUrl} />}
                />
              ))}
            </div>
          </Replayable>
          <Row label="icons: loaded / initial / broken / blocked">
            <TokenIcon symbol="ETH" iconUrl={loadedIcon} />
            <TokenIcon symbol="ETH" />
            <TokenIcon symbol="PEPE" iconUrl={brokenIcon} size={72} />
            <ChainIcon name="Base" iconUrl={loadedIcon} />
            <ChainIcon name="Optimism" iconUrl={brokenIcon} />
            <ChainIcon name="Polygon" iconUrl={blockedIcon} />
          </Row>
        </Section>

        <Section title="LineChart">
          <Replayable>
            <LineChart data={balanceSeries} />
          </Replayable>
          <Row label="under 2 points">
            <span className="text-small text-fg-muted">Renders nothing:</span>
            <LineChart data={balanceSeries.slice(0, 1)} />
          </Row>
        </Section>

        <Section title="ShareCard">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-8">
            <ShareCardDemo facts={normal} />
            <ShareCardDemo facts={fixtures.negative} />
          </div>
        </Section>

        <Section title="WalletCombobox">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-8">
            <ComboDemo status="idle" initial="" />
            <ComboDemo status="resolving" initial="vitalik.eth" />
            <ComboDemo status="valid" initial="vitalik.eth" />
            <ComboDemo status="invalid" initial="0xd8dA6BF2" />
            <ComboDemo status="idle" initial="vitalik.eth" disabled />
          </div>
        </Section>

        <Section title="SettingsDialog">
          <DialogDemo />
        </Section>

        <Section title="StoryChrome">
          <ChromeDemo label="wallet + progress" wallet={displayName(normal.wallet)} progress />
          <ChromeDemo label="no wallet (first visit)" />
        </Section>

        <Section title="ParticleReveal">
          <RevealDemo />
        </Section>

        <Section title="Full screens">
          <FullScreenDemo />
        </Section>
      </div>
    </div>
  );
}

/* — demos — */

/**
 * The app's own theme control, on the page that has to be checked in both themes. It is the same
 * control the story chrome carries on `/`, and the same one setting behind it: a choice made here is
 * the choice `/` opens in.
 *
 * The story's own components stay dark whichever way this is set — that is the design, not a miss.
 */
function ThemeRow() {
  return (
    <Row label="theme">
      <ThemeToggle />
    </Row>
  );
}

function ProgressDemo() {
  const [current, setCurrent] = useState(1);
  const [paused, setPaused] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <Row label="idle">
        <div className="w-80">
          <ProgressSegments count={5} current={-1} />
        </div>
      </Row>
      <Row label="filling / paused">
        <div className="w-80">
          <PlaybackContext value={{ paused }}>
            <ProgressSegments
              count={5}
              current={current}
              paused={paused}
              onComplete={() => setCurrent((c) => Math.min(c + 1, 4))}
            />
          </PlaybackContext>
        </div>
        <Button variant="ghost" onClick={() => setPaused((p) => !p)}>
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button variant="ghost" onClick={() => setCurrent(0)}>
          Restart
        </Button>
      </Row>
      <Row label="done">
        <div className="w-80">
          <ProgressSegments count={5} current={5} />
        </div>
      </Row>
    </div>
  );
}

/** The share card the last story card carries, filled from a fixture. */
function FactsShareCard({ facts }: { facts: RewindFacts }) {
  return (
    <ShareCard
      name={displayName(facts.wallet)}
      address={shortAddress(facts.wallet.address)}
      stats={[
        { value: fmt.int(facts.txCount), label: "transactions" },
        { value: fmt.int(facts.chainCount), label: facts.chainCount === 1 ? "chain" : "chains" },
        { value: facts.topToken?.symbol ?? "—", label: "top token" },
        { value: facts.firstTx ? fmt.monthYear(facts.firstTx.date) : "—", label: "onchain since" },
      ]}
    />
  );
}

function ChromeDemo({ label, wallet, progress }: { label: string; wallet?: string; progress?: boolean }) {
  const [opened, setOpened] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-xs text-fg-subtle">
        {label}
        {opened ? " · gear pressed" : ""}
      </span>
      <div className="relative h-28 overflow-hidden rounded-2xl border border-border bg-bg">
        <StoryChrome
          wallet={wallet}
          onOpenSettings={() => setOpened(true)}
          progress={progress ? <ProgressSegments count={5} current={1} /> : undefined}
        />
      </div>
    </div>
  );
}

function ShareCardDemo({ facts }: { facts: RewindFacts }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-xs text-fg-subtle">{facts.wallet.name ? "with ENS name" : "address only"}</span>
      <FactsShareCard facts={facts} />
    </div>
  );
}

function ComboDemo({ status, initial, disabled }: { status: WalletStatus; initial: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-xs text-fg-subtle">{disabled ? "disabled" : status}</span>
      <WalletCombobox
        value={value}
        onValueChange={setValue}
        suggestions={demoWallets}
        status={status}
        resolved={status === "valid" ? "0xd8dA…6045" : undefined}
        disabled={disabled}
      />
    </div>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);
  const [dismissable, setDismissable] = useState(true);
  const [value, setValue] = useState("");
  const status: WalletStatus =
    value === "" ? "idle" : value === "vitalik.eth" || /^0x[0-9a-fA-F]{40}$/.test(value) ? "valid" : "invalid";
  return (
    <Row label="open">
      <Button
        onClick={() => {
          setDismissable(false);
          setValue("");
          setOpen(true);
        }}
      >
        First visit
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setDismissable(true);
          setValue("vitalik.eth");
          setOpen(true);
        }}
      >
        Change wallet
      </Button>
      <SettingsDialog
        open={open}
        onClose={() => setOpen(false)}
        dismissable={dismissable}
        value={value}
        onValueChange={setValue}
        status={status}
        resolved={status === "valid" ? "0xd8dA…6045" : undefined}
        demoWallets={demoWallets}
        onSubmit={() => setOpen(false)}
      />
    </Row>
  );
}

/** Drives the reveal on its own — no story, no player — so its phases are visible one at a time. */
function RevealDemo() {
  const [fixture, setFixture] = useState<FixtureName>("normal");
  const [run, setRun] = useState<{ id: number; fail: boolean; capped: boolean } | null>(null);
  const [phases, setPhases] = useState<string[]>([]);
  const start = (fail: boolean, capped = false) => {
    setPhases([]);
    setRun((r) => ({ id: (r?.id ?? 0) + 1, fail, capped }));
  };
  return (
    <div className="flex flex-col gap-4">
      <Row label="fixture">
        {(Object.keys(fixtures) as FixtureName[]).map((k) => (
          <Button key={k} variant={k === fixture ? "primary" : "ghost"} onClick={() => setFixture(k)}>
            {k} · {fmt.int(fixtures[k].txCount)}
          </Button>
        ))}
      </Row>
      <Row label="run">
        <Button onClick={() => start(false)}>Gather → burst</Button>
        <Button variant="ghost" onClick={() => start(false, true)}>
          Gather → burst · cut short
        </Button>
        <Button variant="ghost" onClick={() => start(true)}>
          Gather → fail
        </Button>
      </Row>
      <p className="text-small text-fg-muted">
        Full screen. The callbacks are logged over the reveal. Press Esc to come back. Under reduced motion there is no
        canvas: a static count, then a crossfade.
      </p>
      {run && (
        <Overlay onClose={() => setRun(null)}>
          <RevealRun
            key={run.id}
            facts={fixtures[fixture]}
            fail={run.fail}
            capped={run.capped}
            onPhase={(phase) => setPhases((p) => [...p, phase])}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-6">
            <p className="rounded-full border border-border bg-surface px-4 py-2 font-mono text-xs text-fg-muted">
              {fixture} · {fmt.int(fixtures[fixture].txCount)} tx{phases.length > 0 ? ` · ${phases.join(" → ")}` : ""}
            </p>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/** Feeds the reveal one page at a time, then either completes it or fails it partway through. */
function RevealRun({
  facts,
  fail,
  capped,
  onPhase,
}: {
  facts: RewindFacts;
  fail: boolean;
  /** A year cut short: the counter lands on the count with a "+" rather than as an exact figure. */
  capped: boolean;
  onPhase: (phase: string) => void;
}) {
  const reveal = useRef<ParticleRevealHandle>(null);

  useEffect(() => {
    let sent = 0;
    const id = window.setInterval(() => {
      const { send, next } = pageTick(sent, facts.txCount, fail);
      sent += send;
      if (send > 0) reveal.current?.addTransactions(send);
      if (next === "continue") return;
      window.clearInterval(id);
      if (next === "fail") reveal.current?.fail();
      else reveal.current?.complete(facts.txCount, capped);
    }, PAGE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [facts, fail, capped]);

  return (
    <ParticleReveal
      ref={reveal}
      total={facts.txCount}
      onBurst={() => onPhase("burst")}
      onDone={() => onPhase("done")}
      onFailed={() => onPhase("failed")}
    />
  );
}

type Screen = "flow" | "flow-capped" | "flow-fail" | "empty" | "error" | "error-retrying" | "error-budget";

/** The whole screen, end to end: the reveal hands over to the player, or a failure ends the run. */
function FullScreenDemo() {
  const [fixture, setFixture] = useState<FixtureName>("normal");
  const [screen, setScreen] = useState<Screen | null>(null);
  const close = () => setScreen(null);
  return (
    <div className="flex flex-col gap-4">
      <Row label="fixture">
        {(Object.keys(fixtures) as FixtureName[]).map((k) => (
          <Button key={k} variant={k === fixture ? "primary" : "ghost"} onClick={() => setFixture(k)}>
            {k} · {fmt.int(fixtures[k].txCount)}
          </Button>
        ))}
      </Row>
      <Row label="open">
        <Button onClick={() => setScreen("flow")}>Reveal → story</Button>
        <Button variant="ghost" onClick={() => setScreen("flow-capped")}>
          Reveal → story · cut short
        </Button>
        <Button variant="ghost" onClick={() => setScreen("flow-fail")}>
          Reveal → API error
        </Button>
        <Button variant="ghost" onClick={() => setScreen("empty")}>
          Empty state
        </Button>
        <Button variant="ghost" onClick={() => setScreen("error")}>
          Error state
        </Button>
        <Button variant="ghost" onClick={() => setScreen("error-retrying")}>
          Error state · retrying
        </Button>
        <Button variant="ghost" onClick={() => setScreen("error-budget")}>
          Error state · budget spent
        </Button>
      </Row>
      <p className="text-small text-fg-muted">
        Full screen. Press Esc or the gear to come back. ← → move the story, a hold or Space pauses it, and the last
        card holds instead of advancing. The empty fixture has no transactions to page, so it opens on the empty state.
      </p>
      {screen && (
        <Overlay onClose={close}>
          {screen === "flow" && <Flow fixture={fixture} onExit={close} />}
          {/* A year the cap or a failed page cut short: every figure it shows is a lower bound. */}
          {screen === "flow-capped" && <Flow fixture={fixture} capped onExit={close} />}
          {screen === "flow-fail" && <Flow fixture={fixture} fail onExit={close} />}
          {screen === "empty" && (
            <EmptyState wallet={shortAddress(fixtures.empty.wallet.address)} onChangeWallet={close} />
          )}
          {screen === "error" && (
            <ErrorState wallet={displayName(normal.wallet)} onRetry={() => setScreen("flow")} onChangeWallet={close} />
          )}
          {screen === "error-retrying" && (
            <ErrorState wallet={displayName(normal.wallet)} retrying onRetry={close} onChangeWallet={close} />
          )}
          {/* The day's data budget is spent: its own headline, and no retry that could succeed. */}
          {screen === "error-budget" && (
            <ErrorState
              wallet={displayName(normal.wallet)}
              reason="budget-spent"
              onRetry={close}
              onChangeWallet={close}
            />
          )}
        </Overlay>
      )}
    </div>
  );
}

/** A replay is a fresh run: re-keying it resets the reveal, the stage and the player together. */
function Flow({
  fixture,
  fail = false,
  capped = false,
  onExit,
}: {
  fixture: FixtureName;
  fail?: boolean;
  capped?: boolean;
  onExit: () => void;
}) {
  const [run, setRun] = useState(0);
  return (
    <FlowRun
      key={run}
      facts={fixtures[fixture]}
      fail={fail}
      capped={capped}
      onExit={onExit}
      onReplay={() => setRun((r) => r + 1)}
    />
  );
}

/**
 * One run: pages feed the reveal on the same cadence as the reveal demo above. `onBurst` mounts the
 * player under the burst, `onDone` unmounts the reveal, and a failing run lands in ErrorState.
 */
function FlowRun({
  facts,
  fail,
  capped,
  onExit,
  onReplay,
}: {
  facts: RewindFacts;
  fail: boolean;
  /** A year cut short: every figure the story shows off these facts is a lower bound. */
  capped: boolean;
  onExit: () => void;
  onReplay: () => void;
}) {
  const reveal = useRef<ParticleRevealHandle>(null);
  const handoff = useRef<number | null>(null);
  // An empty wallet has no transactions to page, so there is nothing to reveal: the player opens
  // straight onto its empty state.
  const [stage, setStage] = useState<"reveal" | "burst" | "story" | "error">(facts.txCount === 0 ? "story" : "reveal");

  useEffect(() => {
    if (facts.txCount === 0) return;
    let sent = 0;
    const id = window.setInterval(() => {
      const { send, next } = pageTick(sent, facts.txCount, fail);
      sent += send;
      if (send > 0) reveal.current?.addTransactions(send);
      if (next === "continue") return;
      window.clearInterval(id);
      if (next === "fail") reveal.current?.fail();
      else reveal.current?.complete(facts.txCount, capped);
    }, PAGE_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      if (handoff.current !== null) window.clearTimeout(handoff.current);
    };
  }, [facts, fail, capped]);

  return (
    <>
      {(stage === "burst" || stage === "story") && (
        <RewindPlayer facts={facts} capped={capped} onReplay={onReplay} onOpenSettings={onExit} />
      )}
      {(stage === "reveal" || stage === "burst") && (
        <ParticleReveal
          ref={reveal}
          total={facts.txCount}
          onBurst={() => {
            handoff.current = window.setTimeout(() => setStage("burst"), revealMs.storyEnter);
          }}
          onDone={() => setStage("story")}
          onFailed={() => setStage("error")}
        />
      )}
      {stage === "error" && (
        <ErrorState wallet={displayName(facts.wallet)} onRetry={onReplay} onChangeWallet={onExit} />
      )}
    </>
  );
}

/* — layout helpers — */

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="fixed inset-0 z-40">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-label font-medium uppercase text-fg-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="w-40 shrink-0 font-mono text-xs text-fg-subtle">{label}</span>
      {children}
    </div>
  );
}

/** Re-mounts children to replay their entrance, and holds them under a paused PlaybackContext. */
function Replayable({ children }: { children: ReactNode }) {
  const [k, setK] = useState(0);
  const [paused, setPaused] = useState(false);
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-border p-6">
      <PlaybackContext value={{ paused }}>
        <div key={k} className="w-full">
          {children}
        </div>
      </PlaybackContext>
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" onClick={() => setK((n) => n + 1)}>
          Replay animation
        </Button>
        <Button variant="ghost" onClick={() => setPaused((p) => !p)}>
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>
    </div>
  );
}
