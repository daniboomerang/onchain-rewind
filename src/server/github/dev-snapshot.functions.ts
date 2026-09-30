import { createServerFn } from "@tanstack/react-start";
import { readDevSnapshot } from "#/server/github/dev-snapshot.ts";

export const getDevSnapshot = createServerFn({ method: "GET" }).handler(() => readDevSnapshot());
