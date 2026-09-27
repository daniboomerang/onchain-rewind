# Known issues in the design handoff

Found when the reference code was run in a scratch Vite app (React 19, Tailwind v4, Motion, Ariakit) on 2026-09-27.

## 1. Arrow keys ignored while a button has focus: `components/RewindPlayer.tsx`

**Symptom:** ← → do nothing whenever any `<button>` has focus. In the real app this happens after the settings dialog closes, because Ariakit returns focus to the gear button, and the story then silently stops responding to the keyboard.

**Cause:** the `skip()` guard in the keydown effect ignores events whose target is inside `input, textarea, button, [role=dialog]`.

**Fix:** skip only `input, textarea, [contenteditable], [role=dialog]` for arrow keys. For Space, also skip when the target is a button, so a focused button keeps its native Space activation. Add a test: focus the gear, press →, and assert the card advances.

## 2. Nothing else found

Strict typecheck (including `noUncheckedIndexedAccess`) passes. The playground renders with no console errors. The reveal, all five cards, and the empty and error states were visually checked.
