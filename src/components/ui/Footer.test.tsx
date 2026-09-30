// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { SiteFooter } from "#/components/ui/Footer.tsx";

test("carries all six links, each external one opening a new tab safely", () => {
  render(<SiteFooter />);

  expect(screen.getByRole("link", { name: "Design system" })).toHaveAttribute("href", "/system");
  expect(screen.getByRole("link", { name: "Development stats" })).toHaveAttribute("href", "/dev-stats");

  const vinaya = screen.getByRole("link", { name: "Vinaya" });
  expect(vinaya).toHaveAttribute("href", "https://vinaya.attalabs.dev");
  expect(vinaya).toHaveAttribute("target", "_blank");
  expect(vinaya).toHaveAttribute("rel", "noopener noreferrer");

  const attaLabs = screen.getByRole("link", { name: "Atta Labs on GitHub" });
  expect(attaLabs).toHaveAttribute("href", "https://github.com/atta-labs");
  expect(attaLabs).toHaveAttribute("target", "_blank");
  expect(attaLabs).toHaveAttribute("rel", "noopener noreferrer");

  const source = screen.getByRole("link", { name: "Source" });
  expect(source).toHaveAttribute("href", "https://github.com/daniboomerang/onchain-rewind");
  expect(source).toHaveAttribute("target", "_blank");
  expect(source).toHaveAttribute("rel", "noopener noreferrer");

  expect(screen.getByText("© 2026 Atta Labs")).toBeInTheDocument();
});
