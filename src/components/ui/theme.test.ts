// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { chooseTheme, readStoredTheme, readTheme, THEME_COLOR, THEME_SCRIPT, THEME_STORAGE_KEY } from "./theme";

/**
 * The head script is the part of the theme a component test can't reach: it runs as text, in the
 * document head, before React exists. Here it is run the same way the browser runs it — as a function
 * body over a stubbed `matchMedia` — so the behaviour that matters is provable: with nothing stored the
 * system setting decides, a stored choice decides instead, and it keeps deciding on the next page and
 * after the system setting changes underneath it. That last pair is what makes the setting global: the
 * script runs once per document, so a choice surviving it is a choice surviving a reload and a route.
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

/** A fresh document, as a reload or a route the head script runs in again would be. */
function reload() {
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLOR.dark}">`;
  document.documentElement.removeAttribute("data-theme");
  runHeadScript();
}

const themeColor = () => document.getElementsByName("theme-color")[0]?.getAttribute("content");

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLOR.dark}">`;
  document.documentElement.removeAttribute("data-theme");
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

test("the system setting changing while the page is open follows it, while nothing is stored", () => {
  const system = systemPrefers(false);
  runHeadScript();

  system.change(true);

  expect(readTheme()).toBe("light");
  expect(themeColor()).toBe(THEME_COLOR.light);
});

test("a chosen theme paints the open page and is remembered on this device", () => {
  systemPrefers(true);
  runHeadScript();

  chooseTheme("dark");

  expect(readTheme()).toBe("dark");
  expect(themeColor()).toBe(THEME_COLOR.dark);
  expect(readStoredTheme()).toBe("dark");
});

test("a chosen theme outlives a reload, so it is the theme every later route opens in", () => {
  systemPrefers(true);
  runHeadScript();
  chooseTheme("dark");

  reload();

  expect(readTheme()).toBe("dark");
  expect(themeColor()).toBe(THEME_COLOR.dark);
});

test("a chosen theme outlives the system setting changing", () => {
  const system = systemPrefers(false);
  runHeadScript();
  chooseTheme("light");

  system.change(false);

  expect(readTheme()).toBe("light");
  expect(themeColor()).toBe(THEME_COLOR.light);
});

test("anything but a theme we wrote ourselves reads as no choice at all", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "sepia");
  systemPrefers(true);

  runHeadScript();

  expect(readStoredTheme()).toBeNull();
  expect(readTheme()).toBe("light");
});
