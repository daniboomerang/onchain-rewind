import { createServerFn } from "@tanstack/react-start";
import { readGithubDevRecord } from "#/server/github/dev-record.ts";

export const getGithubDevRecord = createServerFn({ method: "GET" }).handler(() => readGithubDevRecord());
