import { motion } from "motion/react";
import { Button } from "./Button";
import { duration, ease } from "./motion";
import { StoryChrome } from "./StoryChrome";

export type EmptyStateProps = {
  /** Short address or ENS name. */
  wallet: string;
  onChangeWallet: () => void;
};

/** Wallet with no transactions. No reveal, no progress. Crossfades in over 240ms. */
export function EmptyState({ wallet, onChangeWallet }: EmptyStateProps) {
  return (
    <div className="fixed inset-0 bg-bg text-fg">
      <StoryChrome wallet={wallet} onOpenSettings={onChangeWallet} />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: duration.base, ease: ease.inOut }}
        className="flex h-dvh flex-col items-center justify-center gap-6 px-5 text-center"
      >
        <span className="font-mono text-[13px] text-fg-muted">{wallet}</span>
        <h1 className="max-w-[900px] text-balance font-display text-display max-md:text-[56px]">This wallet hasn't made its first move yet</h1>
        <p className="text-body text-fg-muted">Once it has a transaction, there's a story to tell.</p>
        <Button variant="ghost" onClick={onChangeWallet} className="mt-2">
          Change wallet
        </Button>
      </motion.main>
    </div>
  );
}
