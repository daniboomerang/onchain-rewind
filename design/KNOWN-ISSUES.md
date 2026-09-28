# Known issues in the design handoff

Found when the reference code was run in a scratch Vite app (React 19, Tailwind v4, Motion, Ariakit) on 2026-09-27.

## 1. Arrow keys ignored while a button has focus: `components/RewindPlayer.tsx`

**Symptom:** ← → do nothing whenever any `<button>` has focus. In the real app this happens after the settings dialog closes, because Ariakit returns focus to the gear button, and the story then silently stops responding to the keyboard.

**Cause:** the `skip()` guard in the keydown effect ignores events whose target is inside `input, textarea, button, [role=dialog]`.

**Fix, as ported into the app:** the arrow keys skip only `input, textarea, [contenteditable], [role=dialog]`, so the story keeps moving while a button has focus; Space additionally skips a focused button, so that button keeps its native activation. The prop contract is unchanged.

**Proven by** `src/components/rewind/RewindPlayer.test.tsx`: "the arrow keys move the story while the gear button has focus" focuses the gear, presses →, and asserts card 2 is on screen (and ← brings card 1 back), with the gear still focused throughout. Two companions hold the other half: "Space activates the focused button instead of pausing the story", and "Space still pauses the story when no button has focus". Restoring the old guard fails the first and leaves the other two green.

## 2. Lint rules the app rejects: `components/ChainBar.tsx`, `components/LineChart.tsx`, `renderShareImage.ts`, `components/RewindPlayer.tsx`

**Symptom:** all four files fail the app's lint rules. `design/` is excluded from Biome, so the handoff never saw them. The first three were found when the components were ported; the fourth when the player was.

**Cause:** `ChainBar` puts `aria-label` on the plain `<span>` that holds the rolling percentage, and a `<span>` has no role that supports it (`a11y/useAriaPropsSupportedByRole`). `LineChart`'s inner `<svg>` carries neither a `<title>` nor an accessible name — the name lives on the wrapping `div`, which is the element with `role="img"` (`a11y/noSvgWithoutTitle`).

**Cause, third file:** `renderShareImage`'s seeded random advances its state inside the returned expression, `((s = (s * 16807) % 2147483647) - 1) / 2147483646` (`suspicious/noAssignInExpressions`).

**Cause, fourth file:** `RewindPlayer`'s full-screen surface is a `<div>` carrying the pointer gestures, and a `<div>` has no role to make them meaningful (`a11y/noStaticElementInteractions`). `role="group"` fails a second rule, which wants a `<fieldset>` (`a11y/useSemanticElements`).

**Fix, as ported into the app:** `ChainBar` marks the rolling span `aria-hidden` and adds a sibling `sr-only` span holding the chain name and its final percentage — the same idiom `StatNumber` already uses for its counter. `LineChart` marks the inner `<svg>` `aria-hidden`, leaving the labelled wrapper as the single accessible node. `renderShareImage`'s generator becomes a block body that assigns, then returns — the same sequence, so every wallet's ring is unchanged. `RewindPlayer`'s surface becomes a `<section aria-label="Rewind story">`, which gives the gestures an element with a role and names the story for a screen reader; every gesture already has a keyboard equivalent on `window`. None of the four changes a prop.

## 3. The reduced-motion variants make the server's markup a guess: `components/motion.ts`, `components/StoryCard.tsx`, `components/ShareCard.tsx`

**Symptom:** with `prefers-reduced-motion` emulated, the app logs "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties", and every child of a story card — and every stat cell of the share card — settles at `translateY(12px)` instead of square.

**Cause:** `enterItem.hidden` carries `y: 12` and `enterItemReduced.hidden` does not, and `ShareCard` picks its `initial` the same way. `useReducedMotion()` is false on the server, which cannot read the media query, so the server always renders the full-motion hidden state; a reduced-motion client then hydrates against markup it never would have produced, and because `enterItemReduced.show` animates opacity alone, the offset the server wrote is never animated away.

**Fix, as ported into the app:** the reduced variant's hidden state is the full-motion one, character for character, so the server's markup no longer depends on a preference it cannot read; its `show` still targets `y: 0` so nothing can be left offset, but gives y its own zero-duration transition, so a reduced-motion viewer gets the crossfade with no movement. `ShareCard`'s `initial` is preference-independent for the same reason, with only its transition varying. `StoryStage`'s reduced variants pin `x: 0` against the same class of leftover. Unit tests assert all three invariants.

**Confirmed in the browser, on a card mounted through the story's own navigation** (the first card's entrance is suppressed by `AnimatePresence initial={false}`, so it proves nothing either way): full motion writes the rise frame by frame, `translateY(11.66px)` down to `none`; with the preference set, no `translateY` is written at all and the element settles at `none` rather than holding an offset.

**One layer of this is not fixed** — see the next issue.

## 4. `whileTap` makes the button's `tabindex` a server-side guess: `components/Button.tsx` (not yet fixed)

**Symptom:** with `prefers-reduced-motion` emulated, every page carrying a `Button` logs the same hydration-mismatch error, and the diff React prints is `tabindex="0"` on the `<button>` the server rendered and the client did not want.

**Cause:** the same shape as the issue above, one layer down. `whileTap` is `undefined` under reduced motion and a scale target otherwise; Motion adds `tabIndex` to an element it gives a tap gesture, so the server — which cannot read the media query and therefore always takes the full-motion branch — emits an attribute a reduced-motion client never produces.

**Status:** not fixed here. The same fix applies — keep the gesture prop constant and let the press scale itself be the thing reduced motion turns off (a zero-duration transition, or `motion-safe:` in CSS) — but the app's copy of this component is the primitives layer, outside the story components' surface. Reproduced on the app's own main branch before the story components existed, so it is not a regression in them.

## 5. `ProgressSegments` reports a position outside the range it declares: `components/ProgressSegments.tsx`

**Symptom:** the idle state (`current` of `-1`) reports `aria-valuenow` of `0`, and the done state (`current` equal to `count`) reports `count + 1`, both against `aria-valuemin` of `1` and `aria-valuemax` of `count`. A screen reader announces an out-of-range position for two of the four states.

**Cause:** `aria-valuenow={current + 1}` is written straight from the prop, and `current` is deliberately out of band before the first card and after the last.

**Fix, as ported into the app:** the reported position is clamped into the declared range. The prop keeps its meaning and its contract.

## 6. Raw px font sizes with no token behind them: `components/` (not yet fixed)

**Symptom:** `StoryChrome`, `ShareCard`, `EmptyState`, `ErrorState`, `StoryCard` and `LineChart` size text with `text-[15px]`, `text-[19px]`, `text-[13px]` and `text-[11px]`, against the app's own rule that components use tokens only.

**Cause:** the type scale in `tokens.css` stops at `--text-label`; these four sizes are UI text between the named steps and were written as literals.

**Status:** carried into the app verbatim, and the same literals are already in the app's primitives, so this is a scale gap rather than a regression in any one component. Closing it means adding the four steps to `design/tokens.css`, copying them into the app's own `tokens.css`, documenting them in `DESIGN.md` §1, and migrating both component directories in one pass — wider than any single component's task.

## 7. A card is invisible whenever its entrance's fade doesn't finish: `components/motion.ts`, `components/StoryCard.tsx`, `components/ShareCard.tsx`

**Symptom:** with `prefers-reduced-motion` emulated, a card can sit at `opacity: 0; transform: none` with all of its content present in the page — a blank card, nothing but the chrome above it, while the progress bar keeps advancing. Measured on the share card's outer `<article>`, whose stats sit at opacity 1 underneath a transparent parent, and seen on a story card during the full-screen flow.

**Cause:** the reduced-motion entrance snaps the rise and animates the fade. Motion treats a transition with no duration and no delay as no animation at all — it writes the target straight through its own render loop — so the rise lands on the first frame and `transform: none` appears immediately. The fade is a real animation, and it is the only thing standing between the hidden state the server rendered (`opacity: 0`) and a readable card. An animation that never reaches its end leaves the element at the value it started from, and nothing later re-writes it: Motion renders from the value the animation last set, so every subsequent render paints the card transparent again. The full-motion path cannot land here — both values share one duration, so a fade stuck at 0 is always paired with a visible part-way rise — which is why the stuck state only ever showed up with the preference set.

**Fix, as ported into the app:** the reduced twins snap the fade as well as the rise, so the entrance writes both values through the render loop and no animation has to finish for a card to be readable. That is also what the preference asks for: the card appears rather than fading in. The share card stops writing its own entrance inline and reads a named variant, so the shell's two twins live beside the item's in one file and cannot drift apart again. No prop and no motion token changes.

**Proven by** `src/components/rewind/card-entrance.test.tsx`, which renders every story card and the share card for every fixture and asserts each animated element reaches opacity 1 — under reduced motion with no frame allowed to pass, which is the assertion the old variants fail. `src/components/rewind/motion.test.ts` holds the invariant directly: every reduced entrance's transition has duration 0 and delay 0.

## 8. Nothing else found

Strict typecheck (including `noUncheckedIndexedAccess`) passes. The playground renders with no console errors. The reveal, all five cards, and the empty and error states were visually checked.
