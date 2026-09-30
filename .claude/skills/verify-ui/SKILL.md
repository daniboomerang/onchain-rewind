---
name: verify-ui
description: Verify the Rewind UI in a real browser after any change to components, routes or styles — plays the full flow, checks console, keyboard, pause, reduced motion and mobile width, and reports what it saw. Use before calling a UI task done.
argument-hint: "[route, default /]"
---

# Verify the UI in the browser

1. Start the dev server (`bun dev`) if it isn't running. Open the route given as the argument (default `/`) in the browser.
2. **First visit:** clear `localStorage` for the origin and reload. The settings dialog must open, must not be dismissible, and must already show `pranksy.eth` chosen. Click "Play rewind" — this must land on the start screen (wordmark, connected wallet, a "Play" button, the site footer), with nothing loading yet.
3. **A remembered wallet:** reload. The start screen must show directly, no dialog, and nothing must load until "Play" is pressed.
4. **Play:** click "Play" on the start screen. The reveal starts.
5. **Reveal:** particles appear while the counter rises, and it bursts into card 1. No console errors.
6. **Skip the reveal:** reload with a remembered wallet, press "Play", then press Escape while the counter is still rising. It must return to the start screen at once and stop the loading (no further requests in the network tab). Repeat, using the close button in the top bar instead of Escape.
7. **Story:** press "Play" again. Let card 1 auto-advance. Then use → and ←, and click the right and left halves. Hold the mouse for more than 200ms, and press Space, to pause: the progress fill freezes and resumes without a jump.
8. **Keyboard after settings:** open the gear, close the dialog with Escape, and press →. The card must advance (see `design/KNOWN-ISSUES.md`).
9. **Share card:** "Replay" restarts, and "Share image" produces a PNG.
10. **Footer:** on the start screen, "Development stats" opens `/dev-stats`.
11. **Reduced motion:** emulate `prefers-reduced-motion: reduce`. No canvas, crossfades only, numbers at their final values.
12. **Width 390:** tap zones split 30/70, the dialog is a bottom sheet, and the text fits.
13. **`/system`:** every section renders, with no console errors.
14. **`/dev-stats`:** the page loads, and its own footer carries "Development stats" too (linking to itself is fine — it's the same footer everywhere). A visit to `/logs` redirects here at once.
15. **Quota fallback:** make the transactions request answer 429 (block it, or stub `getTransactionsPage` to return `rate_limited`) and press "Play". The reveal must count and play all five cards of the `vitalik.eth` year, with "Showing a recorded snapshot" in the chrome throughout, `vitalik.eth` as the wallet name, "+" on the counts, and the share card's "Recorded snapshot" mark; the gear opens settings on `vitalik.eth` with the recorded-snapshot notice. Check both themes and reduced motion. With the API answering, the same wallet plays live with no note.

Report each step as pass or fail, with one line of evidence for each failure: the exact console message, or what was seen versus what was expected. Don't fix anything while running this skill. Report first.
