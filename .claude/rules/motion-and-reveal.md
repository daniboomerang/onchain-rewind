---
paths:
  - "src/components/rewind/**"
---

# Motion and reveal

The spec is `design/DESIGN.md` §1 (motion tokens) and §3 (motion per screen). Timings come from `components/rewind/motion.ts` (`duration`, `ease`, `stagger`, `springCard`, `pressScale`, and `revealMs` for the reveal's own phases); never type literal ms values.

## Principles
- **One hero moment:** the particle reveal. Everything else is restrained: spring card slides, staggered entrances, number roll-ups, bars growing, the line drawing.
- **Motion carries meaning.** Particles are real transactions, and the reveal finishes when the data does. Don't add decorative animation that isn't tied to state.
- No bouncing, shaking or glow, and nothing animates on hover beyond colour.

## Card transitions
- `StoryStage` with `AnimatePresence mode="popLayout"`. Next: enter x +64 → 0 with `springCard` (stiffness 260, damping 32), exit x → −64 over `duration.fast` with `ease.in`. Previous mirrors this.
- Card elements stagger 80ms: eyebrow → kicker and headline → body. Bars stagger 60ms.
- The stage's wrapper keeps an `onUpdate` handler, which holds its values on Motion's own frame loop instead of the browser's animation engine. Don't drop it: an accelerated value interrupted before its first frame is recorded as already finished, and the card is then left transparent with its content in the page (`design/KNOWN-ISSUES.md`).

## Pause
- `PlaybackContext` holds `paused`. Every tween (`useTween`, counters, chart draw, progress fill) must freeze while paused and resume without jumping.
- Hold ≥200ms or Space pauses. A hold never counts as a click.

## ParticleReveal (Canvas 2D)
- **Imperative handle:** `addTransactions(n)` for each page from the paging loop, `complete(finalCount)` when paging ends, `fail()` on error. `onBurst` fires at burst start; the story enters 200ms later.
- **Phases:** scatter 0–600ms, then gather until `complete()` (at least 3,200ms total, a 45s timeout leads to `fail()` upstream), hold 400ms, burst 700ms. Every one of those lengths is a field of `revealMs`, which reads the millisecond twin of a `duration` token wherever one covers the phase; the rAF loop measures in ms, `duration` is in seconds for Motion.
- **The maths is separate from the component.** `particles.ts` holds the caps, the easings, the position of a particle at a given moment, and the colour and alpha the loop paints it with — pure and unit-tested, because no test environment has a 2D context. `ParticleReveal.tsx` is the canvas, the handle and the loop around it.
- **Limits:** 1 particle per transaction, capped at 1500 on desktop and 600 on mobile. Dust pads the count to at least 240.
- **Performance:**
  - one rAF loop
  - DPR ≤ 2
  - pause when `document.hidden`
  - no allocations per frame in the hot loop
  - canvas resizes on viewport change
- **Accessibility:** the counter is in an `aria-live="polite"` region, with at most one update per second.

## Driving the reveal from a real run
The route owns the wiring; the reveal owns the clock. `useRewind`'s three callbacks are the whole
contract: `onPage` → `addTransactions(n)` for the page that just landed, `onComplete` →
`complete(finalCount)` when paging ends, `onFail` → `fail()`. None of them goes through React state,
so a page costs no re-render of the story.

- **One run is one mounted reveal.** A different wallet, a replay or a retry re-keys the run, so the
  reveal, the stage and the player reset together and the old rAF loop is cancelled by its own
  unmount. Nothing resets a run in place.
- **The handover is a three-stage overlap**: `reveal` → `burst` (the player mounts under the burst,
  `revealMs.storyEnter` after `onBurst`) → `story` (`onDone` unmounts the reveal). The empty wallet
  needs no branch: the run completes with a count of zero and the player renders its own empty state.
- **Guard the handover timer against reduced motion.** There the crossfade calls `onBurst` and
  `onDone` in the same tick, so the story is already entered when the timer fires; advance the stage
  only if it is still `reveal`, or the timer remounts a reveal the story has finished with.
- **A long run is still a counting reveal.** Paging is paced (`PAGE_INTERVAL_MS`) and the run's budget is
  `TIMEOUT_MS`, so a wallet with a full year of history can page for tens of seconds. Nothing in the
  reveal is sized to a shorter run: the gather holds until `complete()`, and each page rolls the
  counter as it lands.
- **`fail()` is the only way into the error state**, so the particles fade out before it crossfades
  in. Retry is a fresh run, not a resumed one. A page that fails once the reveal has counted others
  is not a failed run: paging stops there and the run completes, so the burst still happens.

## Reduced motion (`useReducedMotion()`)
- No canvas: a static "Reading N transactions…" whose number updates without rolling, then a 240ms crossfade into card 1. The announced copy is a separate `sr-only` polite region in both branches and the visible number is `aria-hidden`, so the once-a-second throttle holds whether or not there is a canvas — the number itself can keep up with the pages.
- Cards crossfade with no x movement. Bars, chart and numbers render at their final values. Progress segments still fill, because that's timing, not decoration. Press scale is off.

## Verify in the browser
After any change here, run the dev server and play the full flow on `/` and on `/system`. Check the console, pause and resume mid-card, navigate with the keyboard after closing settings, and toggle reduced motion (DevTools → Rendering → emulate `prefers-reduced-motion`).
