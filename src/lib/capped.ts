/**
 * How a Rewind that describes less than the wallet really did is written down.
 *
 * `capped` is the run's own word for it (`src/lib/useRewind.ts`): either the cap stopped paging, or
 * a page failed for good after the ones before it had landed. Both leave the same kind of facts —
 * the newest slice of the window — so every figure counted off them is a lower bound, and SPEC §5's
 * rule applies to all of them: the count reads "1,600+".
 *
 * Every display that prints one of those figures reads it from here, so the "+" is written once.
 */

import { fmt } from "../engine/types";

/** A count, with the "+" that says the wallet made at least this many. */
export const countLabel = (n: number, capped: boolean) => (capped ? `${fmt.int(n)}+` : fmt.int(n));

/**
 * The same, for a figure that rolls up to its value: the "+" belongs on the figure, not on every
 * frame of the roll, so it appears only once the roll has landed on the count it is counting to.
 */
export const rollingCountLabel = (shown: number, final: number, capped: boolean) =>
  countLabel(shown, capped && Math.round(shown) >= Math.round(final));
