import { motion } from "motion/react";
import { Button } from "../ui/Button";
import { duration, ease } from "./motion";
import { StoryChrome } from "./StoryChrome";

export type ErrorStateProps = {
  wallet?: string;
  /**
   * Which failure this is. `"budget-spent"` is the one worth its own screen: the day's data budget is
   * gone, which is nothing the visitor did, which no retry fixes before the day resets, and which
   * says when to come back. Every other failure is `"unavailable"` — an upstream that didn't answer,
   * where trying again is the whole remedy.
   */
  reason?: ErrorReason;
  onRetry: () => void;
  onChangeWallet: () => void;
  retrying?: boolean;
};

export type ErrorReason = "unavailable" | "budget-spent";

/**
 * The two screens, copy and all. The demo reads onchain data on Zerion's free Demo plan, whose daily
 * budget is 300 requests, and a Rewind of a deep wallet spends more than twenty of them: when the
 * day's are gone the screen says that and says when to come back, instead of blaming an upstream that
 * answered perfectly well and offering a retry that is refused until the day resets.
 */
const COPY: Record<ErrorReason, { eyebrow: string; headline: string; message: string; retry: boolean }> = {
  unavailable: {
    eyebrow: "Couldn't load data",
    headline: "The rewind got stuck",
    message: "The data service didn't respond. Your wallet is fine; this is on our side.",
    retry: true,
  },
  "budget-spent": {
    eyebrow: "Out of data for today",
    headline: "Today's data budget is spent",
    message:
      "This demo reads onchain data on Zerion's free plan, and today's requests are all spent. " +
      "Nothing is wrong with your wallet — come back tomorrow and the year plays from the start.",
    retry: false,
  },
};

/**
 * API error / request timeout. Crossfades in after the particles fade out. Focus lands on "Try again",
 * or on "Change wallet" when there is no retry that could succeed.
 */
export function ErrorState({
  wallet,
  reason = "unavailable",
  onRetry,
  onChangeWallet,
  retrying = false,
}: ErrorStateProps) {
  const copy = COPY[reason];
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
          {copy.eyebrow}
        </span>
        <h1 className="max-w-[900px] text-balance font-display text-display max-md:text-[56px]">{copy.headline}</h1>
        <p className="max-w-[560px] text-body text-fg-muted">{copy.message}</p>
        <div className="mt-2 flex gap-3 max-sm:flex-col-reverse">
          <Button variant="ghost" autoFocus={!copy.retry} onClick={onChangeWallet}>
            Change wallet
          </Button>
          {copy.retry && (
            <Button autoFocus onClick={onRetry} loading={retrying}>
              Try again
            </Button>
          )}
        </div>
      </motion.main>
    </div>
  );
}
