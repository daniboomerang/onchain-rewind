---
paths:
  - "src/components/rewind/**"
---

# Motion and reveal

The spec is `design/DESIGN.md` §1 (motion tokens) and §3 (motion per screen). Timings come from `components/rewind/motion.ts` (`duration`, `ease`, `stagger`, `springCard`, `pressScale`); never type literal ms values.

## Principles
- **One hero moment:** the particle reveal. Everything else is restrained: spring card slides, staggered entrances, number roll-ups, bars growing, the line drawing.
- **Motion carries meaning.** Particles are real transactions, and the reveal finishes when the data does. Don't add decorative animation that isn't tied to state.
- No bouncing, shaking or glow, and nothing animates on hover beyond colour.

## Card transitions
- `StoryStage` with `AnimatePresence mode="popLayout"`. Next: enter x +64 → 0 with `springCard` (stiffness 260, damping 32), exit x → −64 over `duration.fast` with `ease.in`. Previous mirrors this.
- Card elements stagger 80ms: eyebrow → kicker and headline → body. Bars stagger 60ms.

## Pause
- `PlaybackContext` holds `paused`. Every tween (`useTween`, counters, chart draw, progress fill) must freeze while paused and resume without jumping.
- Hold ≥200ms or Space pauses. A hold never counts as a click.

## ParticleReveal (Canvas 2D)
- **Imperative handle:** `addTransactions(n)` for each page from the paging loop, `complete(finalCount)` when paging ends, `fail()` on error. `onBurst` fires at burst start; the story enters 200ms later.
- **Phases:** scatter 0–600ms, then gather until `complete()` (at least 3,200ms total, a 12s timeout leads to `fail()` upstream), hold 400ms, burst 700ms.
- **Limits:** 1 particle per transaction, capped at 1500 on desktop and 600 on mobile. Dust pads the count to at least 240.
- **Performance:**
  - one rAF loop
  - DPR ≤ 2
  - pause when `document.hidden`
  - no allocations per frame in the hot loop
  - canvas resizes on viewport change
- **Accessibility:** the counter is in an `aria-live="polite"` region, with at most one update per second.

## Reduced motion (`useReducedMotion()`)
- No canvas: a static "Reading N transactions…" whose number updates without rolling, then a 240ms crossfade into card 1.
- Cards crossfade with no x movement. Bars, chart and numbers render at their final values. Progress segments still fill, because that's timing, not decoration. Press scale is off.

## Verify in the browser
After any change here, run the dev server and play the full flow on `/` and on `/system`. Check the console, pause and resume mid-card, navigate with the keyboard after closing settings, and toggle reduced motion (DevTools → Rendering → emulate `prefers-reduced-motion`).
