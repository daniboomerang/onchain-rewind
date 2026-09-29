import { type FixtureName, fixtures } from "../../engine/fixtures";
import { buildCards } from "./RewindPlayer";

/**
 * Shared by `card-entrance.test.tsx` and `card-entrance-reduced.test.tsx`. The two suites have to be
 * separate files, because Motion reads `prefers-reduced-motion` once per process, and they only mean
 * the same thing while they agree on what a card is and on what counts as still faded — so both live
 * here rather than in one of the pair. Not a suite itself: nothing here registers a test.
 */

const noop = () => {};

/**
 * Every element an entrance drives writes its own inline opacity, and none may be left below 1. The
 * chart's own artwork is excluded: its area fill rests at a fraction by design, and the whole `<svg>`
 * is `aria-hidden`, so nothing the reader needs lives inside one.
 */
export function stillFaded(card: HTMLElement) {
  const styled = [...card.querySelectorAll("[style*='opacity']")] as (HTMLElement | SVGElement)[];
  return styled
    .filter((el) => !el.closest("svg") && el.style.opacity !== "1")
    .map((el) => `${el.tagName.toLowerCase()} at ${el.style.opacity}`);
}

/**
 * Animations still playing anywhere in the card, so an assertion can wait for the entrance to be over
 * rather than for the first frame that happens to read 1. Unmounting a card part-way through one is
 * what a browser shrugs at and happy-dom reports as an unhandled rejection.
 */
export function stillRunning(card: HTMLElement) {
  const nodes: Element[] = [card, ...card.querySelectorAll("*")];
  return nodes.flatMap((el) => el.getAnimations?.() ?? []).filter((a) => a.playState === "running");
}

/**
 * Every card the story builds, for every fixture, from the player's own composition — so Origin, Home
 * chain, Top token, The ride and the share card carry the media, lead, headline size and content the
 * player gives them rather than what a test happened to pass. A wallet with no transactions has no
 * story to build, and the player shows the empty state instead, so it contributes no cards.
 */
export function everyStoryCard() {
  return (Object.keys(fixtures) as FixtureName[]).flatMap((name) => {
    const cards = buildCards(fixtures[name], { share: noop, sharing: false, onReplay: noop, capped: false });
    return cards.map((card, i) => [`${name} wallet, ${card.eyebrow}`, card.render(i + 1, cards.length)] as const);
  });
}
