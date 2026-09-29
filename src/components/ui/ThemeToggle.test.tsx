// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test } from "vitest";
import { StoryChrome } from "../rewind/StoryChrome";
import { ThemeToggle } from "./ThemeToggle";
import { readStoredTheme, readTheme, THEME_COLOR } from "./theme";

/**
 * The control itself: it names the theme it would switch to, it switches the whole document rather
 * than its own subtree, and it writes the choice down — which is what makes it hold on the next route
 * and the next load. The head script's side of that is `theme.test.ts`.
 */

const noop = () => {};

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLOR.dark}">`;
  // What the head script leaves behind on a dark system, which is the tokens' bare default too.
  document.documentElement.dataset.theme = "dark";
});

afterEach(cleanup);

test("it offers the theme the page is not in, and switching writes the whole document", async () => {
  render(<ThemeToggle />);

  await userEvent.click(screen.getByRole("button", { name: "Switch to the light theme" }));

  expect(readTheme()).toBe("light");
  expect(document.getElementsByName("theme-color")[0]?.getAttribute("content")).toBe(THEME_COLOR.light);
  expect(readStoredTheme()).toBe("light");
  // Having switched, it offers the way back.
  expect(screen.getByRole("button", { name: "Switch to the dark theme" })).toBeInTheDocument();
});

test("the story chrome carries it, next to the gear", () => {
  render(<StoryChrome wallet="vitalik.eth" onOpenSettings={noop} />);

  expect(screen.getByRole("button", { name: "Switch to the light theme" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Change wallet" })).toBeInTheDocument();
});
