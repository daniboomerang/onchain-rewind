import { isRedirect } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { redirectToDevStats } from "./logs";

test("/logs redirects permanently to /dev-stats", () => {
  try {
    redirectToDevStats();
    throw new Error("expected a redirect to be thrown");
  } catch (thrown) {
    if (!isRedirect(thrown)) throw thrown;
    expect(thrown.options.to).toBe("/dev-stats");
    expect(thrown.status).toBe(301);
  }
});
