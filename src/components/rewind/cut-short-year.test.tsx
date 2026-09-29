// @vitest-environment happy-dom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { normalWallet } from "../../engine/fixtures";
import { buildCards, type Card } from "./RewindPlayer";

/**
 * A year the cap or a failed page cut short (SPEC §5). The facts then describe the newest slice of
 * the window rather than all of it, so the story must read as a lower bound everywhere it counts.
 *
 * Each card is mounted on its own, the way `card-entrance.test.tsx` mounts them: what is under test
 * is the copy the player composes, not a transition.
 */

afterEach(cleanup);

const noop = () => {};

/** One of the player's own cards, by its eyebrow, for a complete or a cut-short year. */
function card(eyebrow: string, capped: boolean) {
  const cards = buildCards(normalWallet, { share: noop, sharing: false, onReplay: noop, capped });
  const index = cards.findIndex((c: Card) => c.eyebrow === eyebrow);
  const found = cards[index];
  if (!found) throw new Error(`no ${eyebrow} card`);
  return render(found.render(index + 1, cards.length));
}

test("the share card counts a cut-short year with a plus", () => {
  const { container } = card("Your rewind", true);
  const panel = within(container.querySelector("article") as HTMLElement);

  expect(panel.getByText("1,284+")).toBeInTheDocument();
  // Only the transaction count is a lower bound of its own: the chains are the ones that were seen.
  expect(panel.getByText("6")).toBeInTheDocument();
});

test("a complete year is still counted exactly", () => {
  const { container } = card("Your rewind", false);
  const panel = within(container.querySelector("article") as HTMLElement);

  expect(panel.getByText("1,284")).toBeInTheDocument();
  expect(panel.queryByText("1,284+")).not.toBeInTheDocument();
});
