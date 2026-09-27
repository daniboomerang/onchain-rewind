import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { ChainBar } from "../components/rewind/ChainBar";
import { ChainIcon } from "../components/rewind/ChainIcon";
import { EmptyState } from "../components/rewind/EmptyState";
import { ErrorState } from "../components/rewind/ErrorState";
import { LineChart } from "../components/rewind/LineChart";
import { PlaybackContext } from "../components/rewind/motion";
import { ProgressSegments } from "../components/rewind/ProgressSegments";
import { ShareCard } from "../components/rewind/ShareCard";
import { StatNumber } from "../components/rewind/StatNumber";
import { StoryCard, StoryStage } from "../components/rewind/StoryCard";
import { TokenIcon } from "../components/rewind/TokenIcon";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { SettingsDialog } from "../components/ui/SettingsDialog";
import { Tooltip } from "../components/ui/Tooltip";
import { type DemoWallet, WalletCombobox, type WalletStatus } from "../components/ui/WalletCombobox";
import { fixtures } from "../engine/fixtures";
import { displayName, fmt, type RewindFacts, shortAddress } from "../engine/types";

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
          <Row label="icons: fallback / broken url">
            <TokenIcon symbol="ETH" />
            <TokenIcon symbol="PEPE" iconUrl="/missing.png" size={72} />
            <ChainIcon name="Base" />
            <ChainIcon name="Optimism" iconUrl="/missing.png" />
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

type Screen = "cards" | "empty" | "error" | "error-retrying";

function FullScreenDemo() {
  const [screen, setScreen] = useState<Screen | null>(null);
  const close = () => setScreen(null);
  return (
    <div className="flex flex-col gap-4">
      <Row label="open">
        <Button onClick={() => setScreen("cards")}>Story cards</Button>
        <Button variant="ghost" onClick={() => setScreen("empty")}>
          Empty state
        </Button>
        <Button variant="ghost" onClick={() => setScreen("error")}>
          Error state
        </Button>
        <Button variant="ghost" onClick={() => setScreen("error-retrying")}>
          Error state · retrying
        </Button>
      </Row>
      <p className="text-small text-fg-muted">Full screen. Press Esc or the gear to come back.</p>
      {screen && (
        <Overlay onClose={close}>
          {screen === "cards" && <StoryCardDemo />}
          {screen === "empty" && (
            <EmptyState wallet={shortAddress(fixtures.empty.wallet.address)} onChangeWallet={close} />
          )}
          {screen === "error" && (
            <ErrorState wallet={displayName(normal.wallet)} onRetry={() => setScreen("cards")} onChangeWallet={close} />
          )}
          {screen === "error-retrying" && (
            <ErrorState wallet={displayName(normal.wallet)} retrying onRetry={close} onChangeWallet={close} />
          )}
        </Overlay>
      )}
    </div>
  );
}

/** StoryCard's three layouts, moved through by StoryStage so both directions are visible. */
function StoryCardDemo() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [paused, setPaused] = useState(false);
  const cards = [
    <StoryCard
      key="origin"
      index={1}
      eyebrow="Origin"
      accent="var(--color-accent-origin)"
      kicker="It started on"
      headline={normal.firstTx ? fmt.dateLong(normal.firstTx.date) : "—"}
      headlineSize="lg"
    >
      <StatNumber value={normal.daysOnchain} label="days onchain" />
    </StoryCard>,
    <StoryCard
      key="chains"
      index={2}
      eyebrow="Home chain"
      accent="var(--color-accent-chain)"
      kicker="You mostly lived on"
      headline={normal.chains[0]?.name ?? "—"}
      lead={`${fmt.int(normal.chainCount)} chains in all`}
      layout="split"
    >
      <div className="flex flex-col gap-5">
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
    </StoryCard>,
    <StoryCard
      key="share"
      index={5}
      eyebrow="Your year"
      accent="var(--color-accent-share)"
      media={normal.topToken && <TokenIcon symbol={normal.topToken.symbol} iconUrl={normal.topToken.iconUrl} />}
      layout="center"
    >
      <FactsShareCard facts={normal} />
    </StoryCard>,
  ];

  const go = (d: 1 | -1) => {
    setDirection(d);
    setIndex((i) => Math.min(Math.max(i + d, 0), cards.length - 1));
  };

  return (
    <PlaybackContext value={{ paused }}>
      <div className="absolute inset-0 bg-bg text-fg">
        <StoryStage id={index} direction={direction}>
          {cards[index]}
        </StoryStage>
        <div className="absolute inset-x-0 bottom-8 z-10 flex justify-center gap-3">
          <Button variant="ghost" onClick={() => go(-1)} disabled={index === 0}>
            Previous
          </Button>
          <Button variant="ghost" onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="ghost" onClick={() => go(1)} disabled={index === cards.length - 1}>
            Next
          </Button>
        </div>
      </div>
    </PlaybackContext>
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
