import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { SettingsDialog } from "../components/ui/SettingsDialog";
import { Tooltip } from "../components/ui/Tooltip";
import { type DemoWallet, WalletCombobox, type WalletStatus } from "../components/ui/WalletCombobox";

export const Route = createFileRoute("/system")({ component: System });

/**
 * /system — every component in every state.
 * Hover, focus-visible and pressed are live: use pointer and Tab.
 */

const demoWallets: DemoWallet[] = [
  { label: "vitalik.eth", address: "0xd8dA…6045" },
  { label: "Demo wallet 2" },
  { label: "Demo wallet 3" },
];

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
      </div>
    </div>
  );
}

/* — demos — */

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

/* — layout helpers — */

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
