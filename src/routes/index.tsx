import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg text-fg">
      <h1 className="font-display text-headline">
        Onchain <em>Rewind</em>
      </h1>
    </main>
  );
}
