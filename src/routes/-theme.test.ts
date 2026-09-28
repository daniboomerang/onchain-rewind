// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { lockTheme, readTheme, THEME_COLOR, THEME_SCRIPT } from "./-theme";

/**
 * The head script is the part of the theme a component test can't reach: it runs as text, in the
 * document head, before React exists. Here it is run the same way the browser runs it — as a function
 * body over a stubbed `matchMedia` — so the three things that matter are provable: a light system is
 * resolved to light, a dark one to dark, and a theme locked on `/system` survives the system changing
 * underneath it.
 */

type Listener = () => void;

/** Stands in for the browser's own media query, whose `matches` the page can't set. */
function systemPrefers(light: boolean) {
  const listeners: Listener[] = [];
  const query = {
    matches: light,
    addEventListener: (_: string, listener: Listener) => listeners.push(listener),
  };
  vi.stubGlobal("matchMedia", () => query);
  return {
    /** The visitor switches their operating system over while the page is open. */
    change(next: boolean) {
      query.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

/** Runs the script the root route puts in the document head. */
const runHeadScript = () => new Function(THEME_SCRIPT)();

const themeColor = () => document.getElementsByName("theme-color")[0]?.getAttribute("content");

beforeEach(() => {
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLOR.dark}">`;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-lock");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a light system resolves to the light theme, browser chrome included", () => {
  systemPrefers(true);

  runHeadScript();

  expect(readTheme()).toBe("light");
  expect(themeColor()).toBe(THEME_COLOR.light);
});

test("a dark system resolves to the dark theme", () => {
  systemPrefers(false);

  runHeadScript();

  expect(readTheme()).toBe("dark");
  expect(themeColor()).toBe(THEME_COLOR.dark);
});

test("the system setting changing while the page is open follows it", () => {
  const system = systemPrefers(false);
  runHeadScript();

  system.change(true);

  expect(readTheme()).toBe("light");
  expect(themeColor()).toBe(THEME_COLOR.light);
});

test("a theme chosen on the page outlives the system setting changing", () => {
  const system = systemPrefers(true);
  runHeadScript();

  lockTheme("dark");
  system.change(true);

  expect(readTheme()).toBe("dark");
  expect(themeColor()).toBe(THEME_COLOR.dark);
});
