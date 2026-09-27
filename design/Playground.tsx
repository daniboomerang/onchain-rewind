import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button,
  ChainBar,
  ChainIcon,
  EmptyState,
  ErrorState,
  IconButton,
  LineChart,
  ParticleReveal,
  PlaybackContext,
  ProgressSegments,
  RewindPlayer,
  SettingsDialog,
  ShareCard,
  StatNumber,
  TokenIcon,
  Tooltip,
  WalletCombobox,
  type DemoWallet,
  type ParticleRevealHandle,
  type WalletStatus,
} from "./components";
import { fixtures, type FixtureName } from "./fixtures";
import { fmt } from "./types";

/**
 * /system — every component in every state, plus the full flow driven by fixtures.
 * Hover, focus-visible and pressed are live: use pointer and Tab.
 */

const demoWallets: DemoWallet[] = [
  { label: "vitalik.eth", address: "0xd8dA…6045" },
  { label: "Demo wallet 2" },
  { label: "Demo wallet 3" },
];

export default function Playground() {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-20 px-8 py-16 max-md:px-5">
        <header className="flex flex-col gap-3">
          <span className="text-label font-medium uppercase text-fg-subtle">/system</span>
          <h1 className="font-display text-display">
            Onchain <i>Rewind</i>
          </h1>
        </header>

        <Section title="Button">
          <Row label="primary">
            <Button>Replay</Button>
            <Button disabled>Replay</Button>
            <Button loading>Saving</Button>
          </Row>
          <Row label="ghost">
            <Button variant="ghost">Share image</Button>
            <Button variant="ghost" disabled>Share image</Button>
            <Button variant="ghost" loading>Rendering</Button>
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
              <StatNumber value={1284} label="transactions" />
              <StatNumber value={38.4} format={fmt.pct} size="xl" accent="var(--color-accent-token)" label="price change" />
              <StatNumber value={-42.7} format={fmt.pct} size="xl" accent="var(--color-negative)" label="negative" />
            </div>
          </Replayable>
        </Section>

        <Section title="ChainBar · ChainIcon · TokenIcon">
          <Replayable>
            <div className="flex max-w-[620px] flex-col gap-5">
              {fixtures.normal.chains.map((c, i) => (
                <ChainBar key={c.id} name={c.name} percent={c.share} max={46} index={i} highlight={i === 0} icon={<ChainIcon name={c.name} />} />
              ))}
            </div>
          </Replayable>
          <Row label="icons: fallback / broken url">
            <TokenIcon symbol="ETH" />
            <TokenIcon symbol="PEPE" iconUrl="/missing.png" size={72} />
            <ChainIcon name="Base" />
            <ChainIcon name="Optimism" iconUrl="/missing.png" />
          </Row>
        </Section>

        <Section title="LineChart">
          <Replayable>
            <LineChart data={(fixtures.normal.balance?.series ?? []).map((p) => ({ date: fmt.dateShort(p.date), value: p.value }))} />
          </Replayable>
        </Section>

        <Section title="ShareCard">
          <ShareCard
            name="vitalik.eth"
            address="0xd8dA…6045"
            stats={[
              { value: "1,284", label: "transactions" },
              { value: "6", label: "chains" },
              { value: "ETH", label: "top token" },
              { value: "Mar 2022", label: "onchain since" },
            ]}
          />
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

        <Section title="Full screens">
          <FullScreenDemo />
        </Section>
      </div>
    </div>
  );
}

/* — demos — */

function ProgressDemo() {
  const [current, setCurrent] = useState(1);
  const [paused, setPaused] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <Row label="idle">
        <div className="w-80"><ProgressSegments count={5} current={-1} /></div>
      </Row>
      <Row label="filling / paused">
        <div className="w-80">
          <PlaybackContext value={{ paused }}>
            <ProgressSegments count={5} current={current} paused={paused} onComplete={() => setCurrent((c) => Math.min(c + 1, 4))} />
          </PlaybackContext>
        </div>
        <Button variant="ghost" onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</Button>
        <Button variant="ghost" onClick={() => setCurrent(0)}>Restart</Button>
      </Row>
      <Row label="done">
        <div className="w-80"><ProgressSegments count={5} current={5} /></div>
      </Row>
    </div>
  );
}

function ComboDemo({ status, initial, disabled }: { status: WalletStatus; initial: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-xs text-fg-subtle">{disabled ? "disabled" : status}</span>
      <WalletCombobox value={value} onValueChange={setValue} suggestions={demoWallets} status={status} resolved={status === "valid" ? "0xd8dA…6045" : undefined} disabled={disabled} />
    </div>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);
  const [dismissable, setDismissable] = useState(true);
  const [value, setValue] = useState("");
  const status: WalletStatus = value === "" ? "idle" : value === "vitalik.eth" || /^0x[0-9a-fA-F]{40}$/.test(value) ? "valid" : "invalid";
  return (
    <Row label="open">
      <Button onClick={() => { setDismissable(false); setValue(""); setOpen(true); }}>First visit</Button>
      <Button variant="ghost" onClick={() => { setDismissable(true); setValue("vitalik.eth"); setOpen(true); }}>Change wallet</Button>
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

type Screen = "flow" | "reveal-fail" | "empty" | "error";

function FullScreenDemo() {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [fixture, setFixture] = useState<FixtureName>("normal");
  const close = () => setScreen(null);
  return (
    <div className="flex flex-col gap-4">
      <Row label="fixture">
        {(Object.keys(fixtures) as FixtureName[]).map((k) => (
          <Button key={k} variant={k === fixture ? "primary" : "ghost"} onClick={() => setFixture(k)}>{k}</Button>
        ))}
      </Row>
      <Row label="open">
        <Button onClick={() => setScreen("flow")}>Reveal → story</Button>
        <Button variant="ghost" onClick={() => setScreen("reveal-fail")}>Reveal → API error</Button>
        <Button variant="ghost" onClick={() => setScreen("empty")}>Empty state</Button>
        <Button variant="ghost" onClick={() => setScreen("error")}>Error state</Button>
      </Row>
      <p className="text-small text-fg-muted">Full screen. Press Esc or the gear to come back.</p>
      {screen && <Overlay onClose={close}>
        {screen === "flow" && <Flow fixture={fixture} onExit={close} />}
        {screen === "reveal-fail" && <Flow fixture={fixture} fail onExit={close} />}
        {screen === "empty" && <EmptyState wallet="0x1111…1111" onChangeWallet={close} />}
        {screen === "error" && <ErrorState wallet="vitalik.eth" onRetry={() => setScreen("flow")} onChangeWallet={close} />}
      </Overlay>}
    </div>
  );
}

/** Simulates paged data: 120 tx every 350ms, then complete (or fail). */
function Flow({ fixture, fail = false, onExit }: { fixture: FixtureName; fail?: boolean; onExit: () => void }) {
  const facts = fixtures[fixture];
  const reveal = useRef<ParticleRevealHandle>(null);
  const [run, setRun] = useState(0);
  const [stage, setStage] = useState<"reveal" | "burst" | "story" | "error">("reveal");

  useEffect(() => {
    if (facts.txCount === 0) return setStage("story");
    setStage("reveal");
    let sent = 0;
    const id = window.setInterval(() => {
      if (fail && sent >= 360) {
        window.clearInterval(id);
        reveal.current?.fail();
        return;
      }
      const n = Math.min(120, facts.txCount - sent);
      sent += n;
      reveal.current?.addTransactions(n);
      if (sent >= facts.txCount) {
        window.clearInterval(id);
        reveal.current?.complete(facts.txCount);
      }
    }, 350);
    return () => window.clearInterval(id);
  }, [facts, fail, run]);

  const replay = () => setRun((r) => r + 1);

  return (
    <>
      {(stage === "burst" || stage === "story") && <RewindPlayer key={run} facts={facts} onReplay={replay} onOpenSettings={onExit} />}
      {(stage === "reveal" || stage === "burst") && (
        <ParticleReveal
          key={`r-${run}`}
          ref={reveal}
          onBurst={() => window.setTimeout(() => setStage("burst"), 200)}
          onDone={() => setStage("story")}
          onFailed={() => setStage("error")}
        />
      )}
      {stage === "error" && <ErrorState wallet={facts.wallet.name} onRetry={replay} onChangeWallet={onExit} />}
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

/** Re-mounts children to replay their entrance animation. */
function Replayable({ children }: { children: ReactNode }) {
  const [k, setK] = useState(0);
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-border p-6">
      <div key={k} className="w-full">{children}</div>
      <Button variant="ghost" onClick={() => setK((n) => n + 1)}>Replay animation</Button>
    </div>
  );
}
