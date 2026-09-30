// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { StoryChrome } from "#/components/rewind/StoryChrome.tsx";

test("the Zerion logo links to zerion.io, opens a new tab safely, and names itself for a screen reader", () => {
  render(<StoryChrome onOpenSettings={() => {}} />);

  const link = screen.getByRole("link", { name: "Zerion" });
  expect(link).toHaveAttribute("href", "https://zerion.io");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("a recorded run carries the recorded-snapshot note, and a live one doesn't", () => {
  const recorded = render(<StoryChrome wallet="vitalik.eth" recorded onOpenSettings={() => {}} />);
  expect(within(recorded.container).getByText("Showing a recorded snapshot")).toBeInTheDocument();
  recorded.unmount();

  const live = render(<StoryChrome wallet="vitalik.eth" onOpenSettings={() => {}} />);
  expect(within(live.container).queryByText("Showing a recorded snapshot")).toBeNull();
  live.unmount();
});
