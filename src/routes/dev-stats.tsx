import { createFileRoute } from "@tanstack/react-router";
import { DevLogPage } from "../components/logs/DevLogPage";
import { getDevSnapshot } from "../server/github/dev-snapshot.functions";

export const Route = createFileRoute("/dev-stats")({
  head: () => ({ meta: [{ title: "Project development logs · Onchain Rewind" }] }),
  // The development snapshot (ADR-0006): read from the server bundle, never from GitHub, so a cold
  // visit paints the record from the server's own markup. It only changes with a deploy.
  loader: () => getDevSnapshot().catch(() => null),
  staleTime: Number.POSITIVE_INFINITY,
  component: DevStatsRoute,
});

function DevStatsRoute() {
  return <DevLogPage snapshot={Route.useLoaderData()} />;
}
