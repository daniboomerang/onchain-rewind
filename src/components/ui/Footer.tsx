const VINAYA_URL = "https://vinaya.attalabs.dev";
const ATTA_LABS_GITHUB_URL = "https://github.com/atta-labs";
const SOURCE_URL = "https://github.com/daniboomerang/onchain-rewind";

export type SiteFooterProps = {
  /** Positions the footer: `overlay` sits absolute at the bottom of a `relative` screen (the start
   * screen, so it never adds scroll height); `inline` sits in normal document flow (the end of `/dev-stats`). */
  variant?: "overlay" | "inline";
};

/**
 * The one footer the whole site carries: a link to the design system, a link to the development
 * stats at `/dev-stats`, credit to Vinaya and Atta Labs, and a link to this demo's own source. Shown
 * only on the start screen of `/` and at the end of `/dev-stats` — never while the reveal or the
 * story is playing, and never on the share card or the share image.
 */
export function SiteFooter({ variant = "inline" }: SiteFooterProps) {
  return (
    <footer
      className={
        variant === "overlay"
          ? "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-5 pb-[max(20px,env(safe-area-inset-bottom))]"
          : "border-t border-border pt-6"
      }
    >
      <p
        className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-small text-fg-muted ${variant === "overlay" ? "pointer-events-auto" : ""}`}
      >
        <a className="underline underline-offset-2 hover:text-fg" href="/system">
          Design system
        </a>
        <a className="underline underline-offset-2 hover:text-fg" href="/dev-stats">
          Development stats
        </a>
        <span>
          Made with{" "}
          <a
            className="font-medium text-fg underline underline-offset-2"
            href={VINAYA_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            Vinaya
          </a>
        </span>
        <span>© 2026 Atta Labs</span>
        <a
          className="underline underline-offset-2 hover:text-fg"
          href={ATTA_LABS_GITHUB_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Atta Labs on GitHub
        </a>
        <a
          className="underline underline-offset-2 hover:text-fg"
          href={SOURCE_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Source
        </a>
      </p>
    </footer>
  );
}
