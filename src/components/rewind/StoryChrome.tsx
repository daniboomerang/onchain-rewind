import type { ReactNode } from "react";
import { IconButton } from "../ui/IconButton";

export type StoryChromeProps = {
  /** Wallet display name (ENS or short address). Empty on first visit. */
  wallet?: string;
  onOpenSettings: () => void;
  /** ProgressSegments slot — omitted on reveal / empty / error. */
  progress?: ReactNode;
};

/** Top chrome shared by the player and state screens: segments, wordmark, wallet name, gear. */
export function StoryChrome({ wallet, onOpenSettings, progress }: StoryChromeProps) {
  return (
    <header
      data-chrome
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 px-10 pt-5 max-sm:gap-2 max-sm:px-5 max-sm:pt-[max(12px,env(safe-area-inset-top))]"
    >
      {progress}
      <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-[15px] font-medium">
          Onchain <span className="font-display text-[19px] italic">Rewind</span>
        </span>
        <div className="pointer-events-auto flex items-center gap-2">
          {wallet && <span className="whitespace-nowrap font-mono text-[13px] text-fg-muted">{wallet}</span>}
          <IconButton label="Change wallet" onClick={onOpenSettings} />
        </div>
      </div>
    </header>
  );
}
