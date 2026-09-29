---
paths:
  - "src/components/**"
  - "src/styles/**"
---

# Design system

The source of truth is `design/DESIGN.md`, plus `design/tokens.css` and the reference components in `design/components/`. The visual sheets are `design/reference/*.dc.html`: open them in a browser through a local server.

## Tokens
- `src/styles/tokens.css` is a copy of `design/tokens.css`. `app.css` does `@import "tailwindcss"; @import "./tokens.css";`.
- Use the utilities those tokens generate: `bg-bg`, `bg-surface`, `text-fg`, `text-fg-muted`, `text-primary`, `border-border`, `text-display-xl`, `text-stat`, `rounded-3xl`, `shadow-card` and so on.
- **No raw hex, px font sizes or ms durations in components.** Add a token first if one is missing, and document it in DESIGN.md.
- Theme scope: `data-theme="light"` or `data-theme="dark"` on any element re-declares the palette for that element and its subtree, and dark is also the bare `:root` default. `tokens.css` re-declares `color` on `[data-theme]` as well as the variables, because `color` inherits an already-resolved value: without it a dark root inside a light page would draw the page's near-black text on its own dark background. It is in `@layer base`, so a `text-*` utility on the same element still wins.
- The theme is one setting for the whole app, held by `ui/theme.ts` and changed with `ui/ThemeToggle`, which the story chrome and `/system` both carry. The root route resolves it into `data-theme` on `<html>` in a head script, before the first paint, because the store and `matchMedia` read from an effect run after it. The story always renders dark — its roots (the reveal, the story surface, the share card) carry `data-theme="dark"` — and so does the share image. Any non-story component must read correctly in both themes: check its `/system` section with the toggle at the top of the page.
- Never put white text on dark-mode primary (`#00a3f5`); use `text-on-primary`.

## Typography
- Display headlines use Instrument Serif (`font-display`). UI and **every number** use Geist with `tabular-nums`. Addresses use Geist Mono, and only addresses.

## Ariakit layer (`src/components/ui/`)
- `Dialog`, `Combobox` and `Tooltip` wrap `@ariakit/react`. **Nothing outside `src/components/ui/` imports `@ariakit/react`.** A Biome `noRestrictedImports` rule enforces this.
- Compose with Ariakit's `render` prop (`render={<Button />}`), never `asChild`.
- Style interactive states through Ariakit data attributes: `data-focus-visible`, `data-active-item`, `aria-selected`, `aria-invalid`.
- Wrappers keep the full Ariakit prop surface (`...props`), so behaviour stays configurable.

## Component conventions
- React 19: `ref` as a prop, no `forwardRef`, and `use(Context)` instead of `useContext`.
- Props follow `DESIGN.md` §2. When a prop is added, update DESIGN.md in the same PR.
- Buttons are 44px tall (52px full-width on mobile sheets). Press scale is 0.97 (`--press-scale`). Focus ring: `outline-2 outline-primary outline-offset-2`, on keyboard focus only.
- Icons for chains and tokens fall back to an initial in a `surface-raised` circle and never block rendering.
- Every component keeps working on `/system` with fixture data. If you change a component, check its `/system` section in the browser.

## Accessibility checklist (every PR touching components)
- Icon-only controls have `aria-label` (and a Tooltip).
- Chart markers are focusable with accessible names and tooltips.
- The dialog traps focus and returns it on close. The first-visit dialog can't be dismissed.
- Keyboard: ← → navigate the story even when a button has focus (see `design/KNOWN-ISSUES.md`).
- Contrast AA for text. `fg-subtle` is used only for hints.
