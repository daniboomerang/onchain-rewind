import { expect, test } from "vitest";
import { createAppQueryClient, STALE_TIME_MS } from "./query-client";

test("the app's client caches every query for ten minutes", () => {
  const { queries } = createAppQueryClient().getDefaultOptions();

  expect(queries?.staleTime).toBe(10 * 60 * 1000);
  expect(STALE_TIME_MS).toBe(10 * 60 * 1000);
});

test("two calls are two caches, so a per-request client never shares a visitor's data", () => {
  expect(createAppQueryClient()).not.toBe(createAppQueryClient());
});
