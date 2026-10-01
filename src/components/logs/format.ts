/** Formatting helpers for the development log. Every number uses `tabular-nums` at the call site — see `design-system.md`. */

export function minutes(ms: number | undefined): string {
  if (ms === undefined) return "—";
  const total = Math.max(0, Math.round(ms / 60_000));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function tokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * A moment in the viewer's own time zone: the clock time for today, the date added for any other
 * day. Call this only on the client, from data that arrived after hydration — the server's zone
 * is never the viewer's, and calling it during SSR would make the markup mismatch.
 */
export function localStamp(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return at.toDateString() === now.toDateString()
    ? time
    : `${at.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A moment in UTC, e.g. `1 Oct 2026, 14:05 UTC`. Built by hand, not through `Intl`, so the server
 * and the browser print exactly the same string: this is what server-rendered markup shows until
 * hydration swaps in `localStamp`.
 */
export function utcStamp(iso: string): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}, ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} UTC`;
}
