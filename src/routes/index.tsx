import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState } from "../components/rewind/ErrorState";
import { revealMs } from "../components/rewind/motion";
import { ParticleReveal, type ParticleRevealHandle } from "../components/rewind/ParticleReveal";
import { RewindPlayer } from "../components/rewind/RewindPlayer";
import { StoryChrome } from "../components/rewind/StoryChrome";
import { SettingsDialog } from "../components/ui/SettingsDialog";
import { displayName } from "../engine/types";
import { demoWalletOptions } from "../lib/demo-wallets";
import type { RewindApi } from "../lib/useRewind";
import { useRewind } from "../lib/useRewind";
import { useWalletInput } from "../lib/wallet-input";
import { type ConnectedWallet, useConnectedWallet } from "../lib/wallet-store";

export const Route = createFileRoute("/")({ component: Home });

export type HomeProps = {
  /** The Zerion reads, for the route's own test. The app lets the run use the server functions. */
  api?: RewindApi;
  /**
   * The floor between two Zerion requests, for the route's own test: the app's own second-apart
   * pacing would make every scripted flow below a wall-clock wait. The app never passes it.
   */
  requestIntervalMs?: number;
};

/** Exported for its own test: the route itself is only this component. */

export function Home({ api, requestIntervalMs }: HomeProps) {
  const { loaded, wallet, connect } = useConnectedWallet();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const input = useWalletInput(value);
  // Bumped by "Replay" and by "Try again": re-keying the run below is what starts a fresh Rewind,
  // because the reveal, the stage and the player all reset together when they remount.
  const [run, setRun] = useState(0);

  // First visit: the browser has been read, nothing was stored, so settings opens itself. It stays
  // open until a wallet is chosen, because there is no Rewind to show behind it.
  useEffect(() => {
    if (loaded && !wallet) setOpen(true);
  }, [loaded, wallet]);

  const openSettings = useCallback(() => {
    setValue(wallet?.name ?? wallet?.address ?? "");
    setOpen(true);
  }, [wallet]);

  const restart = useCallback(() => setRun((n) => n + 1), []);

  return (
    <main className="relative min-h-dvh bg-bg text-fg">
      {/*
       * Until a wallet is stored there is no Rewind to autoplay, so the shell is the wordmark and
       * the title behind the dialog. The server renders exactly this, whatever is in the browser's
       * store: `loaded` is false there, so the markup either side of hydration is the same one.
       */}
      {wallet === null ? (
        <>
          <StoryChrome onOpenSettings={openSettings} />
          <div className="grid min-h-dvh place-items-center">
            <h1 className="font-display text-headline">
              Onchain <em>Rewind</em>
            </h1>
          </div>
        </>
      ) : (
        // A different wallet, a replay or a retry is a different run: the key remounts the reveal,
        // which cancels its rAF loop and its clock, and the story starts over from card 1.
        <Rewind
          key={`${wallet.address}:${run}`}
          wallet={wallet}
          {...(api !== undefined ? { api } : {})}
          {...(requestIntervalMs !== undefined ? { requestIntervalMs } : {})}
          onRestart={restart}
          onOpenSettings={openSettings}
        />
      )}

      {/* Mounted only after the browser has been read, so the server's shell carries no dialog. */}
      {loaded && (
        <SettingsDialog
          open={open}
          // A first visit has no wallet to fall back to, so there is nothing to cancel to.
          dismissable={wallet !== null}
          onClose={() => setOpen(false)}
          value={value}
          onValueChange={setValue}
          status={input.status}
          resolved={input.resolved}
          error={input.error}
          demoWallets={demoWalletOptions}
          onSubmit={() => {
            if (!input.wallet) return;
            connect(input.wallet);
            setOpen(false);
          }}
        />
      )}
    </main>
  );
}

type RewindProps = {
  wallet: ConnectedWallet;
  api?: RewindApi;
  requestIntervalMs?: number;
  /** "Replay", and "Try again" on the error state: both are a fresh run of the whole Rewind. */
  onRestart: () => void;
  onOpenSettings: () => void;
};

/**
 * The stage this run is on. `burst` is the overlap the handover needs: the player is already
 * mounted under the reveal, which is still painting the last of its burst.
 */
type Stage = "reveal" | "burst" | "story" | "error";

/**
 * One run of the Rewind: the paging feeds the reveal, the burst hands over to the player, and a
 * failed run lands in the error state.
 *
 * The run's own callbacks are the whole wiring — each page's transactions become particles as it
 * arrives, the last page completes the reveal, and a failure fades the field out. Nothing about the
 * count travels through React state: that is what `ParticleReveal`'s imperative handle is for.
 */
function Rewind({ wallet, api, requestIntervalMs, onRestart, onOpenSettings }: RewindProps) {
  const reveal = useRef<ParticleRevealHandle>(null);
  /** The 200ms between the burst starting and card 1 entering, cleared if this run is dropped. */
  const handoff = useRef<number | null>(null);
  const [stage, setStage] = useState<Stage>("reveal");

  const { facts, error } = useRewind({
    wallet,
    ...(api !== undefined ? { api } : {}),
    ...(requestIntervalMs !== undefined ? { requestIntervalMs } : {}),
    onPage: (count) => reveal.current?.addTransactions(count),
    onComplete: (finalCount) => reveal.current?.complete(finalCount),
    onFail: () => reveal.current?.fail(),
  });

  useEffect(
    () => () => {
      if (handoff.current !== null) window.clearTimeout(handoff.current);
    },
    [],
  );

  return (
    <>
      {/* The empty wallet is a story the player tells itself: no transactions, no cards. */}
      {facts && (stage === "burst" || stage === "story") && (
        <RewindPlayer facts={facts} onReplay={onRestart} onOpenSettings={onOpenSettings} />
      )}
      {(stage === "reveal" || stage === "burst") && (
        <ParticleReveal
          ref={reveal}
          onBurst={() => {
            // Reduced motion has no burst to overlap: the crossfade calls `onBurst` and `onDone`
            // together, so this timer must never pull the stage back to an already-entered story.
            handoff.current = window.setTimeout(
              () => setStage((current) => (current === "reveal" ? "burst" : current)),
              revealMs.storyEnter,
            );
          }}
          onDone={() => setStage("story")}
          onFailed={() => setStage("error")}
        />
      )}
      {stage === "error" && (
        <ErrorState
          wallet={displayName(wallet)}
          reason={error === "budget_spent" ? "budget-spent" : "unavailable"}
          onRetry={onRestart}
          onChangeWallet={onOpenSettings}
        />
      )}
    </>
  );
}
