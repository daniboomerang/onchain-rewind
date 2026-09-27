---
name: verify-ui
description: Verify the Rewind UI in a real browser after any change to components, routes or styles — plays the full flow, checks console, keyboard, pause, reduced motion and mobile width, and reports what it saw. Use before calling a UI task done.
argument-hint: "[route, default /]"
---

# Verify the UI in the browser

1. Start the dev server (`bun dev`) if it isn't running. Open the route given as the argument (default `/`) in the browser.
2. **First visit:** clear `localStorage` for the origin and reload. The settings dialog must open and must not be dismissible. Pick `vitalik.eth`.
3. **Reveal:** particles appear while the counter rises, and it bursts into card 1. No console errors.
4. **Story:** let card 1 auto-advance. Then use → and ←, and click the right and left halves. Hold the mouse for more than 200ms, and press Space, to pause: the progress fill freezes and resumes without a jump.
5. **Keyboard after settings:** open the gear, close the dialog with Escape, and press →. The card must advance (see `design/KNOWN-ISSUES.md`).
6. **Share card:** "Replay" restarts, and "Share image" produces a PNG.
7. **Reduced motion:** emulate `prefers-reduced-motion: reduce`. No canvas, crossfades only, numbers at their final values.
8. **Width 390:** tap zones split 30/70, the dialog is a bottom sheet, and the text fits.
9. **`/system`:** every section renders, with no console errors.

Report each step as pass or fail, with one line of evidence for each failure: the exact console message, or what was seen versus what was expected. Don't fix anything while running this skill. Report first.
