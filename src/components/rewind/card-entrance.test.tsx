// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { everyStoryCard, stillFaded, stillRunning } from "./card-entrance-cases";
import { ShareCard, type ShareCardProps } from "./ShareCard";

/**
 * A card's entrance is the only thing that makes it readable: the server renders every animated
 * element at `opacity: 0`, because it cannot know the viewer's motion preference, so an entrance that
 * ends anywhere below 1 leaves a blank card with all of its content in the page.
 *
 * Each card is mounted on its own, which is the entrance the player runs too — a card enters once,
 * and nothing interrupts it. The share card gets a case of its own as well, because `/system` renders
 * it alone and that is where it was first measured stuck.
 *
 * The reduced-motion half is `card-entrance-reduced.test.tsx`: Motion reads the preference once per
 * process and each component keeps the value it read on mount, so each preference needs its own file.
 */

/** Long enough for an entrance, its stagger, and the counters and chart a card carries. */
const ENTRANCE_TIMEOUT = 3000;

const stats: ShareCardProps["stats"] = [
  { value: "1,284", label: "transactions" },
  { value: "7", label: "chains" },
  { value: "ETH", label: "top token" },
  { value: "Jun 2017", label: "onchain since" },
];

afterEach(cleanup);

for (const [name, card] of everyStoryCard()) {
  test(`${name}: the entrance ends at full opacity`, async () => {
    const { container } = render(card);
    await waitFor(
      () => {
        expect(stillRunning(container)).toEqual([]);
        expect(stillFaded(container)).toEqual([]);
      },
      { timeout: ENTRANCE_TIMEOUT },
    );
  });
}

test("the share card ends its entrance at full opacity on its own, as /system renders it", async () => {
  const { container } = render(<ShareCard name="vitalik.eth" address="0xd8dA…6045" stats={stats} />);

  await waitFor(
    () => {
      expect(stillRunning(container)).toEqual([]);
      expect(stillFaded(container)).toEqual([]);
    },
    { timeout: ENTRANCE_TIMEOUT },
  );
});
