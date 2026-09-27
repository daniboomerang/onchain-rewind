# Known issues in the design handoff

Found when the reference code was run in a scratch Vite app (React 19, Tailwind v4, Motion, Ariakit) on 2026-09-27.

## 1. Arrow keys ignored while a button has focus: `components/RewindPlayer.tsx`

**Symptom:** ← → do nothing whenever any `<button>` has focus. In the real app this happens after the settings dialog closes, because Ariakit returns focus to the gear button, and the story then silently stops responding to the keyboard.

**Cause:** the `skip()` guard in the keydown effect ignores events whose target is inside `input, textarea, button, [role=dialog]`.

**Fix:** skip only `input, textarea, [contenteditable], [role=dialog]` for arrow keys. For Space, also skip when the target is a button, so a focused button keeps its native Space activation. Add a test: focus the gear, press →, and assert the card advances.

## 2. Three lint rules the app rejects: `components/ChainBar.tsx`, `components/LineChart.tsx`, `renderShareImage.ts`

**Symptom:** all three files fail the app's lint rules. `design/` is excluded from Biome, so the handoff never saw them.

**Cause:** `ChainBar` puts `aria-label` on the plain `<span>` that holds the rolling percentage, and a `<span>` has no role that supports it (`a11y/useAriaPropsSupportedByRole`). `LineChart`'s inner `<svg>` carries neither a `<title>` nor an accessible name — the name lives on the wrapping `div`, which is the element with `role="img"` (`a11y/noSvgWithoutTitle`).

**Cause, third file:** `renderShareImage`'s seeded random advances its state inside the returned expression, `((s = (s * 16807) % 2147483647) - 1) / 2147483646` (`suspicious/noAssignInExpressions`).

**Fix, as ported into the app:** `ChainBar` marks the rolling span `aria-hidden` and adds a sibling `sr-only` span holding the chain name and its final percentage — the same idiom `StatNumber` already uses for its counter. `LineChart` marks the inner `<svg>` `aria-hidden`, leaving the labelled wrapper as the single accessible node. `renderShareImage`'s generator becomes a block body that assigns, then returns — the same sequence, so every wallet's ring is unchanged. None of the three changes a prop.

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

## 7. Nothing else found

Strict typecheck (including `noUncheckedIndexedAccess`) passes. The playground renders with no console errors. The reveal, all five cards, and the empty and error states were visually checked.
