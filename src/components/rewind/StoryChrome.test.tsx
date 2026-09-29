// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { StoryChrome } from "#/components/rewind/StoryChrome.tsx";

test("the Zerion logo links to zerion.io, opens a new tab safely, and names itself for a screen reader", () => {
  render(<StoryChrome onOpenSettings={() => {}} />);

  const link = screen.getByRole("link", { name: "Zerion" });
  expect(link).toHaveAttribute("href", "https://zerion.io");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
