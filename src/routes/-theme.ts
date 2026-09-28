/**
 * The theme the app chrome runs in. Dark is the tokens' `:root` default and the story's only palette;
 * light is an override the chrome follows when the operating system asks for it. `/system` switches
 * between them by hand, so this module holds the three things both places need: the two `theme-color`
 * values, the script that resolves the setting before the first paint, and the reads and writes of the
 * attribute the tokens key their palettes on.
 */

export type Theme = "dark" | "light";

/**
 * `bg` in each palette. A `theme-color` meta can't read a CSS token, and the router keeps one meta per
 * `name`, so there is one tag and the script below rewrites it.
 */
export const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#16161a" };

/**
 * Runs in the document head, before the first paint: reading `matchMedia` from an effect runs after
 * it, which is a flash of the dark default on a light system. A theme chosen on `/system` sets
 * `data-theme-lock`, which this leaves alone, so a later change of the system setting can't undo it.
 * Without JavaScript the page stays dark, which is the palette the story is designed in.
 */
export const THEME_SCRIPT = [
  '(function(){var r=document.documentElement,m=matchMedia("(prefers-color-scheme: light)");',
  "function apply(){if(r.dataset.themeLock)return;var light=m.matches;",
  'r.dataset.theme=light?"light":"dark";',
  'var c=document.getElementsByName("theme-color")[0];',
  `if(c)c.setAttribute("content",light?"${THEME_COLOR.light}":"${THEME_COLOR.dark}")}`,
  'apply();m.addEventListener("change",apply)})();',
].join("");

/** The theme the page is in. Browser only: the attribute is written by the script above. */
export function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Switches the page and locks the choice, so the script above stops following the system setting. */
export function lockTheme(next: Theme): void {
  const root = document.documentElement;
  root.dataset.themeLock = "1";
  root.dataset.theme = next;
  document.getElementsByName("theme-color")[0]?.setAttribute("content", THEME_COLOR[next]);
}
