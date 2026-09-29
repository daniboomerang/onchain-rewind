import { createFileRoute } from "@tanstack/react-router";
import { DevLogPage } from "../components/logs/DevLogPage";

export const Route = createFileRoute("/logs")({
  head: () => ({ meta: [{ title: "Project development logs · Onchain Rewind" }] }),
  component: DevLogPage,
});
