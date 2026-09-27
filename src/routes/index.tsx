import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StoryChrome } from "../components/rewind/StoryChrome";
import { SettingsDialog } from "../components/ui/SettingsDialog";
import { displayName } from "../engine/types";
import { demoWalletOptions } from "../lib/demo-wallets";
import { useWalletInput } from "../lib/wallet-input";
import { useConnectedWallet } from "../lib/wallet-store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { loaded, wallet, connect } = useConnectedWallet();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const input = useWalletInput(value);

  // First visit: the browser has been read, nothing was stored, so settings opens itself. It stays
  // open until a wallet is chosen, because there is no Rewind to show behind it.
  useEffect(() => {
    if (loaded && !wallet) setOpen(true);
  }, [loaded, wallet]);

  return (
    <main className="relative min-h-dvh bg-bg text-fg">
      <StoryChrome
        wallet={wallet ? displayName(wallet) : undefined}
        onOpenSettings={() => {
          setValue(wallet?.name ?? wallet?.address ?? "");
          setOpen(true);
        }}
      />
      <div className="grid min-h-dvh place-items-center">
        <h1 className="font-display text-headline">
          Onchain <em>Rewind</em>
        </h1>
      </div>

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
