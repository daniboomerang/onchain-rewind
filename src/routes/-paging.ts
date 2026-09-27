/**
 * The playground's stand-in for the paging loop: a page of this many transactions on this cadence.
 * Neither is a motion value — they stand for the network, not for anything the reveal animates.
 * A leading `-` keeps this file out of the router's route tree.
 */
export const PAGE_SIZE = 120;
export const PAGE_INTERVAL_MS = 350;

/** What one tick does: how many transactions it sends, and what happens to the run afterwards. */
export type PageTick = { send: number; next: "continue" | "fail" | "complete" };

/**
 * One tick of the stand-in, for a run that has sent `sent` of `total` transactions. The page is
 * counted before the decision is made, so a fixture smaller than one page still fails on its first
 * tick rather than completing: deciding from the previous tick's count let a failing run reach the
 * story whenever the whole fixture fitted in one page. A failing run stops a third of the way in,
 * so the fade-out lands mid-gather.
 */
export function pageTick(sent: number, total: number, fail: boolean): PageTick {
  const send = Math.max(Math.min(PAGE_SIZE, total - sent), 0);
  const reached = sent + send;
  if (fail && reached >= Math.ceil(total / 3)) return { send, next: "fail" };
  if (reached >= total) return { send, next: "complete" };
  return { send, next: "continue" };
}
