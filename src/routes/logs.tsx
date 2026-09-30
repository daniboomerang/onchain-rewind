import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/logs` is this page's old address: kept as a permanent redirect so a shared link never flashes the old page. */
export function redirectToDevStats(): never {
  throw redirect({ to: "/dev-stats", statusCode: 301 });
}

export const Route = createFileRoute("/logs")({
  beforeLoad: redirectToDevStats,
});
