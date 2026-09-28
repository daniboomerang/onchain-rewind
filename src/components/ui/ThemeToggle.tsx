import { IconButton } from "./IconButton";
import { type Theme, useTheme } from "./theme";

/**
 * The app's light/dark control. One setting for the whole app: the choice is stored, so it holds
 * across routes and reloads, and until one is made the app follows the operating system.
 *
 * It is a single button rather than a pair, because there are only two themes: it names the one it
 * would switch to, which is also what makes its accessible name say what pressing it does.
 *
 * The story keeps the dark palette whichever way this is set — that is the design, not a miss.
 */
export function ThemeToggle() {
  const { theme, choose } = useTheme();
  // Before the browser is read there is no theme to name, so the server renders the dark default's
  // label and the first client effect corrects it. Nothing here is rendered conditionally, so the
  // markup either side of hydration is the same one.
  const next: Theme = theme === "light" ? "dark" : "light";

  return (
    <IconButton
      label={next === "light" ? "Switch to the light theme" : "Switch to the dark theme"}
      icon={next === "light" ? <SunIcon /> : <MoonIcon />}
      onClick={() => choose(next)}
    />
  );
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="4.2" strokeWidth="1.8" />
      <path
        d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
