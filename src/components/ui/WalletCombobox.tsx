import * as Ariakit from "@ariakit/react";
import { useId } from "react";
import { Spinner } from "./Button";

export type DemoWallet = { label: string; address?: string };
export type WalletStatus = "idle" | "resolving" | "valid" | "invalid";

export type WalletComboboxProps = {
  value: string;
  onValueChange: (value: string) => void;
  suggestions: DemoWallet[];
  status?: WalletStatus;
  /** Short resolved address, shown when status = "valid". */
  resolved?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

/** States: default, hover, focus-visible, open (suggestions), resolving, valid, invalid, disabled. */
export function WalletCombobox({
  value,
  onValueChange,
  suggestions,
  status = "idle",
  resolved,
  error,
  disabled,
  autoFocus,
}: WalletComboboxProps) {
  const errorId = useId();
  const matches = suggestions.filter((s) => s.address && s.label.toLowerCase().includes(value.toLowerCase()));
  const invalid = status === "invalid";

  return (
    <Ariakit.ComboboxProvider value={value} setValue={onValueChange}>
      <div className="flex flex-col gap-2">
        <Ariakit.ComboboxLabel className="text-[13px] font-medium text-fg-muted">Wallet</Ariakit.ComboboxLabel>
        <div className="relative">
          <Ariakit.Combobox
            autoFocus={autoFocus}
            disabled={disabled}
            placeholder="0x… or name.eth"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            className={
              "h-13 w-full rounded-xl border bg-bg px-4 pr-36 text-base outline-none placeholder:text-fg-subtle " +
              "transition-[border-color,box-shadow] duration-(--duration-fast) ease-out " +
              "focus-ring:border-primary focus-ring:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_22%,transparent)] " +
              "disabled-any:border-transparent disabled-any:bg-surface-raised disabled-any:text-fg-subtle " +
              (invalid ? "border-negative bg-negative-soft font-mono" : "border-border-strong hover:border-fg-subtle")
            }
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
            {status === "resolving" && <Spinner />}
            {status === "valid" && resolved && (
              <span className="whitespace-nowrap font-mono text-[13px] text-positive">{resolved} ✓</span>
            )}
          </span>
        </div>
        {invalid && (
          <p id={errorId} className="text-small text-negative">
            {error ?? "That isn't a valid address or ENS name."}
          </p>
        )}
      </div>
      {matches.length > 0 && (
        <Ariakit.ComboboxPopover
          gutter={8}
          sameWidth
          unmountOnHide
          className="z-50 flex flex-col rounded-xl bg-bg p-1.5 shadow-popover opacity-0 transition-opacity duration-(--duration-fast) data-enter:opacity-100"
        >
          {matches.map((s) => (
            <Ariakit.ComboboxItem
              key={s.label}
              value={s.label}
              className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-[15px] font-medium outline-none data-active-item:bg-surface-raised"
            >
              <span>{s.label}</span>
              <span className="whitespace-nowrap font-mono text-[13px] text-fg-muted">{s.address}</span>
            </Ariakit.ComboboxItem>
          ))}
        </Ariakit.ComboboxPopover>
      )}
    </Ariakit.ComboboxProvider>
  );
}
