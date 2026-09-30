import { motion } from "motion/react";
import { Button } from "../ui/Button";
import { duration, ease } from "./motion";
import { StoryChrome } from "./StoryChrome";

export type ErrorStateProps = {
  wallet?: string;
  onRetry: () => void;
  onChangeWallet: () => void;
  retrying?: boolean;
};

/**
 * API error / request timeout: an upstream that didn't answer, where trying again is the whole
 * remedy. Crossfades in after the particles fade out. Focus lands on "Try again".
 *
 * A quota limit never reaches this screen: a rate-limited or spent first page plays the recorded
 * snapshot instead (ADR-0005), which is why there is no budget-spent screen any more.
 */
export function ErrorState({ wallet, onRetry, onChangeWallet, retrying = false }: ErrorStateProps) {
  return (
    <div className="fixed inset-0 bg-bg text-fg">
      <StoryChrome wallet={wallet} onOpenSettings={onChangeWallet} />
      <motion.main
        role="alert"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: duration.base, ease: ease.inOut }}
        className="flex h-dvh flex-col items-center justify-center gap-6 px-5 text-center"
      >
        <span className="flex items-center gap-2 text-[13px] font-medium text-negative">
          <span className="size-2 rounded-full bg-negative" />
          Couldn't load data
        </span>
        <h1 className="max-w-[900px] text-balance font-display text-display max-md:text-[56px]">
          The rewind got stuck
        </h1>
        <p className="max-w-[560px] text-body text-fg-muted">
          The data service didn't respond. Your wallet is fine; this is on our side.
        </p>
        <div className="mt-2 flex gap-3 max-sm:flex-col-reverse">
          <Button variant="ghost" onClick={onChangeWallet}>
            Change wallet
          </Button>
          <Button autoFocus onClick={onRetry} loading={retrying}>
            Try again
          </Button>
        </div>
      </motion.main>
    </div>
  );
}
