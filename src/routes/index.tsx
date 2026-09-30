import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState } from "../components/rewind/ErrorState";
import { revealMs } from "../components/rewind/motion";
import { ParticleReveal, type ParticleRevealHandle } from "../components/rewind/ParticleReveal";
import { RewindPlayer } from "../components/rewind/RewindPlayer";
import { StoryChrome } from "../components/rewind/StoryChrome";
import { Button } from "../components/ui/Button";
import { SiteFooter } from "../components/ui/Footer";
import { SettingsDialog } from "../components/ui/SettingsDialog";
import { displayName } from "../engine/types";
import { demoWalletOptions } from "../lib/demo-wallets";
import type { RewindApi, RewindWallet } from "../lib/useRewind";
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
  const [value, setValue] = useState(demoWalletOptions[0]?.label ?? "");
  const input = useWalletInput(value);
  // Set while settings is open over the recorded snapshot (ADR-0005): the story behind the dialog is
  // the recording's wallet, not the stored one, and the dialog says so.
  const [notice, setNotice] = useState<string>();
  // Bumped by "Replay", "Try again" and "Play": re-keying the run below is what starts a fresh
  // Rewind, because the reveal, the stage and the player all reset together when they remount.
  const [run, setRun] = useState(0);
  // The landing state: the start screen, until "Play" sends the visitor into a fresh Rewind. Escape
  // or the story's close button — including during the reveal — returns here too. True from the
  // first render, so a remembered wallet never flashes the reveal before the load effect above has
  // even read it.
  const [stopped, setStopped] = useState(true);

  // First visit: the browser has been read, nothing was stored, so settings opens itself, already on
  // the first demo wallet. It stays open until a wallet is chosen, because there is no Rewind to show
  // behind it.
  useEffect(() => {
    if (loaded && !wallet) setOpen(true);
  }, [loaded, wallet]);

  const openSettings = useCallback(() => {
    setValue(wallet?.name ?? wallet?.address ?? "");
    setNotice(undefined);
    setOpen(true);
  }, [wallet]);

  // Over the recorded snapshot the dialog opens on the wallet whose year is playing, never the stored
  // one: presenting the stored wallet there would claim the recording as that wallet's year.
  const openSettingsOver = useCallback(
    (recording: RewindWallet | undefined) => {
      if (recording === undefined) return openSettings();
      const name = displayName(recording);
      setValue(recording.name ?? recording.address);
      setNotice(`Zerion's data limit was reached, so the story playing is a recorded snapshot of ${name}.`);
      setOpen(true);
    },
    [openSettings],
  );

  const restart = useCallback(() => {
    setStopped(false);
    setRun((n) => n + 1);
  }, []);

  const stop = useCallback(() => setStopped(true), []);

  // Escape leaves the story for the start screen, wherever the run is — the reveal, a card or the
  // error state. The settings dialog owns Escape while it's open, so this yields to it.
  useEffect(() => {
    if (!wallet || open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wallet, open, stop]);

  return (
    <main className="relative min-h-dvh bg-bg text-fg">
      {/*
       * Until a wallet is stored there is nothing to land on, so the shell is the wordmark and the
       * title behind the dialog. The server renders exactly this, whatever is in the browser's
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
      ) : stopped ? (
        <StartScreen wallet={wallet} onPlay={restart} onOpenSettings={openSettings} />
      ) : (
        // A different wallet, a replay or a retry is a different run: the key remounts the reveal,
        // which cancels its rAF loop and its clock, and the story starts over from card 1.
        <Rewind
          key={`${wallet.address}:${run}`}
          wallet={wallet}
          {...(api !== undefined ? { api } : {})}
          {...(requestIntervalMs !== undefined ? { requestIntervalMs } : {})}
          onRestart={restart}
          onOpenSettings={openSettingsOver}
          onClose={stop}
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
          {...(notice !== undefined ? { notice } : {})}
          onSubmit={() => {
            if (!input.wallet) return;
            connect(input.wallet);
            // Settings always closes onto the start screen, whether this is the first visit or a
            // wallet swap mid-story: choosing a wallet is never itself what starts the Rewind.
            setStopped(true);
            setOpen(false);
          }}
        />
      )}
    </main>
  );
}

/** The wordmark, the connected wallet, a Play button and settings — where Escape or the story's own close button lands. */
function StartScreen({
  wallet,
  onPlay,
  onOpenSettings,
}: {
  wallet: ConnectedWallet;
  onPlay: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <>
      <StoryChrome wallet={displayName(wallet)} onOpenSettings={onOpenSettings} />
      <div className="grid min-h-dvh place-items-center px-5">
        <div className="flex flex-col items-center gap-8 text-center">
          <h1 className="font-display text-headline">
            Onchain <em>Rewind</em>
          </h1>
          <Button onClick={onPlay}>Play</Button>
        </div>
      </div>
      <SiteFooter variant="overlay" />
    </>
  );
}

type RewindProps = {
  wallet: ConnectedWallet;
  api?: RewindApi;
  requestIntervalMs?: number;
  /** "Replay", and "Try again" on the error state: both are a fresh run of the whole Rewind. */
  onRestart: () => void;
  /** Carries the recording's wallet while the recorded snapshot plays, and nothing otherwise. */
  onOpenSettings: (recording: RewindWallet | undefined) => void;
  /** Escape and the close button in the story's top bar both call this: it leaves for the start screen. */
  onClose: () => void;
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
function Rewind({ wallet, api, requestIntervalMs, onRestart, onOpenSettings, onClose }: RewindProps) {
  const reveal = useRef<ParticleRevealHandle>(null);
  /** The 200ms between the burst starting and card 1 entering, cleared if this run is dropped. */
  const handoff = useRef<number | null>(null);
  const [stage, setStage] = useState<Stage>("reveal");

  const { facts, capped, recorded, subject, error } = useRewind({
    wallet,
    ...(api !== undefined ? { api } : {}),
    ...(requestIntervalMs !== undefined ? { requestIntervalMs } : {}),
    onPage: (count) => reveal.current?.addTransactions(count),
    onComplete: (finalCount, isCapped) => reveal.current?.complete(finalCount, isCapped),
    onFail: () => reveal.current?.fail(),
  });

  useEffect(
    () => () => {
      if (handoff.current !== null) window.clearTimeout(handoff.current);
    },
    [],
  );

  // A recorded run names the recording's wallet from the switch on, the reveal included: the picked
  // wallet's name over someone else's year would be the story lying about whose year it is.
  const playing = recorded && subject !== undefined ? subject : wallet;
  const openSettings = () => onOpenSettings(recorded ? subject : undefined);

  return (
    <>
      {/* The empty wallet is a story the player tells itself: no transactions, no cards. */}
      {facts && (stage === "burst" || stage === "story") && (
        <RewindPlayer
          facts={facts}
          capped={capped}
          recorded={recorded}
          onReplay={onRestart}
          onOpenSettings={openSettings}
          onClose={onClose}
        />
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
      {/* Once the burst starts, the player is already mounted underneath with its own chrome. */}
      {stage === "reveal" && (
        <StoryChrome
          wallet={displayName(playing)}
          recorded={recorded}
          onOpenSettings={openSettings}
          onClose={onClose}
        />
      )}
      {stage === "error" && (
        <ErrorState
          wallet={displayName(wallet)}
          reason={error === "budget_spent" ? "budget-spent" : "unavailable"}
          onRetry={onRestart}
          onChangeWallet={openSettings}
        />
      )}
    </>
  );
}
