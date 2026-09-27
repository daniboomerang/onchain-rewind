// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, test } from "vitest";
import { ShareCard, type ShareCardProps } from "./ShareCard";
import { StoryCard } from "./StoryCard";

/**
 * A card's entrance is the only thing that makes it readable: the server renders every animated
 * element at `opacity: 0`, because it cannot know the viewer's motion preference, so an entrance
 * that ends anywhere below 1 leaves a blank card with all of its content in the page. These tests
 * hold the end of the entrance for every shape the five story cards and the share card are built
 * from. The reduced-motion half is `card-entrance-reduced.test.tsx`: Motion reads the preference
 * once per process, so each preference needs its own file.
 */

/** Long enough for a full-motion entrance and the stagger behind its last child. */
const ENTRANCE_TIMEOUT = 3000;

const stats: ShareCardProps["stats"] = [
  { value: "1,284", label: "transactions" },
  { value: "7", label: "chains" },
  { value: "ETH", label: "top token" },
  { value: "Jun 2017", label: "onchain since" },
];

/** Every element the entrance drives writes its own inline opacity; none may be left below 1. */
function stillFaded(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("[style*='opacity']")]
    .filter((el) => el.style.opacity !== "1")
    .map((el) => `${el.tagName.toLowerCase()} at ${el.style.opacity}`);
}

const shareCard = () => <ShareCard name="vitalik.eth" address="0xd8dA…6045" stats={stats} />;

/** One per shape a card takes: cards 1, 3 and 4 stack, card 2 splits, card 5 centres the share card. */
const cards: [string, () => ReactElement][] = [
  [
    "story card, stacked",
    () => (
      <StoryCard index={1} eyebrow="Origin" accent="var(--color-accent-origin)" kicker="It started" headline="Jun 2017">
        <p>First transaction</p>
      </StoryCard>
    ),
  ],
  [
    "story card, split",
    () => (
      <StoryCard
        index={2}
        layout="split"
        eyebrow="Home chain"
        accent="var(--color-accent-chain)"
        headline="Base"
        lead="Most of the year"
      >
        <p>Chain bars</p>
      </StoryCard>
    ),
  ],
  [
    "story card, centred on the share card",
    () => (
      <StoryCard index={5} layout="center" eyebrow="Your rewind" accent="var(--color-accent-share)">
        {shareCard()}
      </StoryCard>
    ),
  ],
  ["share card on its own", shareCard],
];

afterEach(cleanup);

for (const [name, card] of cards) {
  test(`${name}: every element the entrance drives ends at full opacity`, async () => {
    const { container } = render(card());
    await waitFor(() => expect(stillFaded(container)).toEqual([]), { timeout: ENTRANCE_TIMEOUT });
  });
}
