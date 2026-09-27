import * as Ariakit from "@ariakit/react";
import { Button } from "./Button";
import { WalletCombobox, type DemoWallet, type WalletStatus } from "./WalletCombobox";

export type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  /** false on first visit: no Cancel, Esc and outside click ignored. */
  dismissable: boolean;
  value: string;
  onValueChange: (v: string) => void;
  status: WalletStatus;
  resolved?: string;
  error?: string;
  demoWallets: DemoWallet[];
  onSubmit: () => void;
  saving?: boolean;
};

/** Centered dialog ≥640px; bottom sheet below. Enter 240ms ease-out, exit 150ms ease-in (CSS via Ariakit data-enter/leave). */
export function SettingsDialog(p: SettingsDialogProps) {
  const canSubmit = p.status === "valid" && !p.saving;
  return (
    <Ariakit.Dialog
      open={p.open}
      onClose={p.onClose}
      hideOnEscape={p.dismissable}
      hideOnInteractOutside={p.dismissable}
      unmountOnHide
      backdrop={
        <div className="bg-overlay opacity-0 transition-opacity duration-(--duration-base) ease-out data-enter:opacity-100 data-leave:duration-(--duration-fast) data-leave:ease-in" />
      }
      className={
        "fixed inset-0 z-50 m-auto flex h-fit w-[min(480px,calc(100vw-32px))] flex-col gap-6 rounded-3xl bg-bg p-8 shadow-dialog outline-none " +
        "opacity-0 scale-96 translate-y-2 transition-[opacity,scale,translate] duration-(--duration-base) ease-out " +
        "data-enter:opacity-100 data-enter:scale-100 data-enter:translate-y-0 data-leave:duration-(--duration-fast) data-leave:ease-in " +
        "max-sm:top-auto max-sm:w-full max-sm:rounded-b-none max-sm:px-5 max-sm:pt-3 max-sm:pb-[max(34px,env(safe-area-inset-bottom))] " +
        "max-sm:scale-100 max-sm:translate-y-full max-sm:data-enter:translate-y-0 " +
        "motion-reduce:scale-100 motion-reduce:translate-y-0"
      }
    >
      <span aria-hidden className="mx-auto hidden h-1 w-9 rounded-full bg-border-strong max-sm:block" />
      <div className="flex flex-col gap-2">
        <Ariakit.DialogHeading className="font-display text-[40px] leading-[1.05] max-sm:text-[34px]">Choose a wallet</Ariakit.DialogHeading>
        <Ariakit.DialogDescription className="text-small text-fg-muted">
          Paste an address or ENS name. We'll remember it on this device.
        </Ariakit.DialogDescription>
      </div>

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) p.onSubmit();
        }}
      >
        <WalletCombobox
          autoFocus
          value={p.value}
          onValueChange={p.onValueChange}
          suggestions={p.demoWallets}
          status={p.status}
          resolved={p.resolved}
          error={p.error}
        />

        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1.5 text-label font-medium uppercase text-fg-subtle">Demo wallets</legend>
          {p.demoWallets.map((w) => (
            <Ariakit.Button
              key={w.label}
              disabled={!w.address}
              onClick={() => p.onValueChange(w.label)}
              className={
                "-mx-3 flex h-11 items-center justify-between rounded-lg px-3 text-[15px] font-medium outline-none max-sm:h-12 " +
                "hover:bg-surface focus-ring:outline-2 focus-ring:outline-primary disabled-any:cursor-default disabled-any:bg-transparent disabled-any:text-fg-subtle " +
                (p.value === w.label ? "bg-surface" : "")
              }
            >
              <span>{w.label}</span>
              <span className="whitespace-nowrap font-mono text-[13px] text-fg-muted">{w.address ?? "Not set"}</span>
            </Ariakit.Button>
          ))}
        </fieldset>

        <div className="flex justify-end gap-3 max-sm:flex-col-reverse">
          {p.dismissable && (
            <Ariakit.DialogDismiss render={<Button variant="ghost" type="button" />}>Cancel</Ariakit.DialogDismiss>
          )}
          <Button type="submit" disabled={!canSubmit} loading={p.saving} className="max-sm:h-13 max-sm:w-full">
            Play rewind
          </Button>
        </div>
      </form>
    </Ariakit.Dialog>
  );
}
