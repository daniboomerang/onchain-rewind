import type { ReactNode } from "react";
import { CloseIcon, IconButton } from "../ui/IconButton";
import { ThemeToggle } from "../ui/ThemeToggle";

export type StoryChromeProps = {
  /** Wallet display name (ENS or short address). Empty on first visit. */
  wallet?: string;
  onOpenSettings: () => void;
  /** ProgressSegments slot — omitted on reveal / empty / error. */
  progress?: ReactNode;
  /** Shown as a close button, top-right. Omitted where there's no story to leave. */
  onClose?: () => void;
  /**
   * The run plays the recorded snapshot rather than live data (ADR-0005). The note stays for as long
   * as the chrome does, the reveal and every card alike, so the story never passes it off as live.
   */
  recorded?: boolean;
};

/**
 * Top chrome shared by the player and state screens: segments, the Zerion logo, wordmark, wallet
 * name, theme and gear.
 *
 * The theme control sits next to the gear because both are settings for the app, and this header is
 * the only chrome every screen has. It switches the whole app, the story included, so on `/` the
 * cards under this header turn with it while they play. The Zerion logo is one brand-blue asset,
 * unlike the wallet chrome around it: it reads the same in both themes, the same way the favicon
 * does.
 */
export function StoryChrome({ wallet, onOpenSettings, progress, onClose, recorded = false }: StoryChromeProps) {
  return (
    <header
      data-chrome
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 px-10 pt-5 max-sm:gap-2 max-sm:px-5 max-sm:pt-[max(12px,env(safe-area-inset-top))]"
    >
      {progress}
      <div className="flex items-center justify-between gap-3">
        <span className="pointer-events-auto flex items-center gap-2">
          <a
            className="rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            href="https://zerion.io"
            rel="noopener noreferrer"
            target="_blank"
            aria-label="Zerion"
          >
            <img src="/zerion-logo.svg" alt="" width={18} height={18} className="shrink-0" />
          </a>
          <span className="whitespace-nowrap text-[15px] font-medium">
            Onchain <span className="font-display text-[19px] italic">Rewind</span>
          </span>
        </span>
        <div className="pointer-events-auto flex items-center gap-2">
          {wallet && <span className="whitespace-nowrap font-mono text-[13px] text-fg-muted">{wallet}</span>}
          <ThemeToggle />
          <IconButton label="Change wallet" onClick={onOpenSettings} />
          {onClose && <IconButton label="Close" icon={<CloseIcon />} onClick={onClose} />}
        </div>
      </div>
      {recorded && <p className="self-end text-small text-fg-muted">Showing a recorded snapshot</p>}
    </header>
  );
}
