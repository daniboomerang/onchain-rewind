import { expect, test } from "vitest";
import { createAppQueryClient, STALE_TIME_MS } from "./query-client";

test("the app's client keeps every query fresh for as long as the server caches it: half a day", () => {
  const { queries } = createAppQueryClient().getDefaultOptions();

  expect(queries?.staleTime).toBe(12 * 60 * 60 * 1000);
  expect(STALE_TIME_MS).toBe(12 * 60 * 60 * 1000);
});

test("two calls are two caches, so a per-request client never shares a visitor's data", () => {
  expect(createAppQueryClient()).not.toBe(createAppQueryClient());
});
