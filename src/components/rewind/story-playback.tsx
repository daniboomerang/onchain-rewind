import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { RewindFacts } from "../../engine/types";
import { buildCards, RewindPlayer } from "./RewindPlayer";

/**
 * Shared by the suites that play the real story rather than mounting one card on its own:
 * `StoryStage.test.tsx`, `share-panel.test.tsx` and `share-panel-reduced.test.tsx`. Playing it is the
 * only way to reach a card the way a reader does — mounted by a transition, a card already on screen
 * having its own entrance cut off — and that is where an entrance breaks. Not a suite itself: nothing
 * here registers a test.
 */

const noop = () => {};

/**
 * Two things about happy-dom's `Animation` stand between these suites and a browser, and the shim
 * below closes both. Neither invents behaviour: each restores what Chromium does, measured there.
 * Install it in `beforeAll` and call what it returns in `afterAll`.
 *
 * **A freshly started animation is pending.** happy-dom assigns a `startTime` inside `play()`, so an
 * interruption always reads how far the animation had got correctly and the failure these suites are
 * about cannot happen at all. Holding `startTime` at `null` until the first frame, as a browser does,
 * is the one difference they need.
 *
 * **A cancelled animation's `finished` promise.** Interrupting an animation is the normal case here —
 * the story cuts one card's entrance off to play the next. happy-dom creates that promise in its
 * constructor and rejects it on cancel, and nothing in Motion reads it, so every deliberate
 * interruption would surface as an unhandled rejection; a browser creates it only when something asks.
 * Reading it here with a handler attached costs nothing and changes no timing.
 */
export function installPendingAnimations() {
  const original = Element.prototype.animate;
  Element.prototype.animate = function pendingUntilFirstFrame(this: Element, ...args: Parameters<Element["animate"]>) {
    const animation = original.apply(this, args);
    animation.finished.catch(() => {});

    let assigned = animation.startTime;
    let pending = true;
    requestAnimationFrame(() => {
      pending = false;
    });
    Object.defineProperty(animation, "startTime", {
      configurable: true,
      get: () => (pending ? null : assigned),
      set: (value: number | null) => {
        assigned = value;
        pending = false;
      },
    });

    return animation;
  };
  return () => {
    Element.prototype.animate = original;
  };
}

/** The cards the player builds for a wallet, by the accessible name each one's stage carries. */
export function cardLabels(facts: RewindFacts) {
  const cards = buildCards(facts, { share: noop, sharing: false, onReplay: noop, capped: false });
  return cards.map((card, i) => `${i + 1} of ${cards.length}: ${card.eyebrow}`);
}

/** The player as the app mounts it, with the callbacks a test never needs to see. */
export function story(facts: RewindFacts): ReactNode {
  return <RewindPlayer facts={facts} capped={false} onReplay={noop} onOpenSettings={noop} />;
}

/**
 * Steps the story to its last card with the right arrow, one card at a time, so the share card is
 * mounted by the transition that mounts it in the app rather than rendered on its own.
 */
export async function playToLastCard(user: UserEvent, facts: RewindFacts) {
  for (const label of cardLabels(facts).slice(1)) {
    await user.keyboard("[ArrowRight]");
    screen.getByLabelText(label);
  }
}

/**
 * The share panel on the last card: the `<article>` `ShareCard` animates, holding the wallet, the four
 * stats and the footer. It is the element that was left transparent with all of its content in the
 * page, so it is the element these suites read.
 */
export function sharePanel() {
  return screen.getByRole("article");
}
