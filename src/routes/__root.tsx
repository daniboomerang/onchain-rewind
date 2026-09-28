import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles/app.css?url";

const TITLE = "Onchain Rewind";
const DESCRIPTION = "Your wallet's year, played back.";

/**
 * Resolves the app chrome's theme before the first paint. Reading `matchMedia` from an effect runs
 * after it, which is a flash of the dark `:root` default on a light system, so this runs in the
 * document head instead. `/system`'s toggle sets `data-theme-lock`, which keeps a later change of the
 * system setting from overriding a theme chosen on the page. Without JavaScript the page stays dark,
 * which is the palette the story is designed in.
 */
const THEME_SCRIPT = [
  '(function(){var r=document.documentElement,m=matchMedia("(prefers-color-scheme: light)");',
  'function apply(){if(!r.dataset.themeLock)r.dataset.theme=m.matches?"light":"dark"}',
  'apply();m.addEventListener("change",apply)})();',
].join("");

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      // Both palettes' `bg`, so the browser chrome matches the theme the script below resolves.
      { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#16161a", media: "(prefers-color-scheme: dark)" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: "/og-default.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [{ children: THEME_SCRIPT }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
