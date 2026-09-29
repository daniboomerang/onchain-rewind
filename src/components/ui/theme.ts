/**
 * The theme the app chrome runs in, and the setting behind it.
 *
 * Dark is the tokens' `:root` default; light is an override the whole app follows, the story and the
 * share image included. The setting is one choice for the whole app, remembered on this device like
 * the wallet is, so every route reads the same value and a reload keeps it. With nothing stored the
 * app follows the operating system.
 *
 * This module holds the four things the app needs: the two `theme-color` values, the script that
 * resolves the setting before the first paint, the read and write of that setting, and the hook both
 * theme controls are built on.
 */

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

/** Namespaced, because a demo shares its origin with whatever else is deployed there. */
export const THEME_STORAGE_KEY = "onchain-rewind:theme";

/**
 * `bg` in each palette. A `theme-color` meta can't read a CSS token, and the router keeps one meta per
 * `name`, so there is one tag and the code below rewrites it.
 */
export const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#16161a" };

/**
 * Runs in the document head, before the first paint: reading the store or `matchMedia` from an effect
 * runs after it, which is a flash of the dark default on a light system. The stored choice wins over
 * the system setting, on every route and every reload, so the media query listener below can keep
 * following the system without ever undoing a choice. Without JavaScript the page stays dark, which is
 * the tokens' own default.
 */
export const THEME_SCRIPT = [
  '(function(){var r=document.documentElement,m=matchMedia("(prefers-color-scheme: light)");',
  `function stored(){try{var v=localStorage.getItem("${THEME_STORAGE_KEY}");`,
  'return v==="light"||v==="dark"?v:null}catch(e){return null}}',
  'function apply(){var t=stored()||(m.matches?"light":"dark");r.dataset.theme=t;',
  'var c=document.getElementsByName("theme-color")[0];',
  `if(c)c.setAttribute("content",t==="light"?"${THEME_COLOR.light}":"${THEME_COLOR.dark}")}`,
  'apply();m.addEventListener("change",apply)})();',
].join("");

/** The theme the page is in. Browser only: the attribute is written by the script above. */
export function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** The stored choice, or null when none was made and the app is following the system. */
export function readStoredTheme(): Theme | null {
  try {
    const raw = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

/** Paints the theme on this document. The head script does the same thing on the next load. */
export function applyTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  document.getElementsByName("theme-color")[0]?.setAttribute("content", THEME_COLOR[next]);
}

/**
 * Chooses a theme for the whole app: stored first, so the head script resolves to it on the next
 * route and the next reload, then painted on the document that is already open. A blocked store
 * (private browsing, a storage quota) costs the memory of the choice, nothing more.
 */
export function chooseTheme(next: Theme): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next);
  } catch {
    console.warn("The theme could not be saved on this device, so it will follow the system again.");
  }
  applyTheme(next);
}

export type ThemeState = {
  /**
   * Null until the browser has been read. The server can't know either the store or the system
   * setting, so no control can render a theme as chosen in the markup React hydrates.
   */
  readonly theme: Theme | null;
  readonly choose: (next: Theme) => void;
};

/** The state behind every theme control: the theme the page is in, and the choice that changes it. */
export function useTheme(): ThemeState {
  const [theme, setTheme] = useState<Theme | null>(null);

  // The attribute the head script wrote is the resolved theme, whichever way it was resolved.
  useEffect(() => setTheme(readTheme()), []);

  const choose = useCallback((next: Theme) => {
    chooseTheme(next);
    setTheme(next);
  }, []);

  return { theme, choose };
}
