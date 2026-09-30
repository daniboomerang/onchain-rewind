# Onchain Rewind — DESIGN.md

A wallet's year, played back as five story cards after a particle reveal. Dark first, but not dark only: the whole app — the story, the share image and the chrome around them — follows one light or dark setting (§1, Theme). Desktop 1440×900, mobile 390 wide.

Files: `tokens.css` (Tailwind v4), `components/*.tsx` (reference code), `Rewind Design System.dc.html` (component sheet), `Rewind Screens.dc.html` (screens S01–S16, M01–M02).

---

## 1. Tokens

Colors come from the Zerion app palette. "Derived" = interpolated, confirm against source.

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | #16161a | #ffffff | Page, dialog |
| `surface` | #1d1d21 | #f5f5f7 | Share card, selected row |
| `surface-raised` | #26262b* | #ebebee* | Hover, icon slots, tooltip (low) |
| `surface-pressed` | #2d2d31* | #e1e1e6* | Pressed |
| `border` | #2d2d31* | #e1e1e6* | Dividers |
| `border-strong` | #3a3a40* | #cfcfd6* | Inputs, ghost buttons |
| `fg` | #ffffff | #16161a | Primary text, progress fill |
| `fg-muted` | #9c9ca3* | #6e6e76* | Kickers, labels, secondary bars |
| `fg-subtle` | #7a7a82* | #6e6e76* | Hints, placeholders, disabled |
| `primary` | #00a3f5 | #2962ef | Primary button, focus ring, accent |
| `primary-hover` | #33b5f7* | #4375f1 | |
| `on-primary` | #16161a | #ffffff | Text on primary (white on #00a3f5 fails AA) |
| `positive` | #4fbf67 | #01a643 | Gains, valid |
| `negative` | #ff5c5c | #ff4a4a | Losses, errors |
| `notice` | #ff9d1c | #ff9d1c | Origin accent |
| `track` | #fff @16% | #16161a @12% | Unfilled segments / bars |
| `overlay` | #0a0a0c @72% | #16161a @40% | Dialog backdrop |

**Theme** — dark is the bare `:root` default; `data-theme="light"` or `data-theme="dark"` on any element re-declares the palette for that element and everything inside it, `color` included, so a subtree that re-declares the palette draws its own ink rather than inheriting the outer theme's resolved colour. The root document resolves the setting into `data-theme` on `<html>` before the first paint — the choice stored on this device if there is one, the operating system's otherwise — and it is the only element that sets the attribute: the story pins no palette of its own, so the particle reveal, the story surface, the cards and the share card all follow that one choice, and a story already playing turns with it.

Two surfaces are painted on a canvas, which inherits no CSS, so the theme has to be handed to them: the reveal reads its three tones off its own resolved styles and reads them again whenever `data-theme` changes, and the share image is painted from the palette for the theme it is given.

The choice is made with `ThemeToggle`, which the story chrome and `/system` both carry. It is one setting for the whole app: it switches the document, not a subtree, and holds across routes and reloads.

**Card accents** (one element per card): Origin `notice` · Home chain `primary` · Top token `positive` (or `negative` if the change is negative) · The ride `primary` · Share `primary`.

**Type** — Display: Instrument Serif 400. UI + every figure: Geist (tabular-nums everywhere). Mono: Geist Mono (addresses only).

| Style | Size / line / tracking | Font |
|---|---|---|
| `display-xl` | 128 / .95 / −2% | serif — card headlines (88 on mobile) |
| `display` | 88 / 1 / −1.5% | serif — state headlines, card 4 title |
| `headline` | 56 / 1.05 / −1% | serif |
| `stat-xl` | 96 / 1 / −3% | Geist 500 — the card's key figure |
| `stat` | 40 / 1.1 / −2% | Geist 500 — secondary figures |
| `title` | 28 / 1.25 | Geist 400 — kickers ("It started on") |
| `body` | 16 / 24 | Geist 400 |
| `small` | 14 / 20 | Geist 400 |
| `label` | 12 / 16 / +12% caps | Geist 500 — eyebrows |

**Spacing** base 4px (`p-4` = 16px). Gap scale: 0 2 4 8 12 16 20 24 32 40 60.
**Radii** sm 4 · md 6 · lg 8 · xl 12 · 2xl 16 · 3xl 24 · full. Buttons = full, inputs = xl, dialog/share card = 3xl.
**Shadows** `card`, `dialog`, `popover` (dark adds a 1px top highlight).

**Motion**

| Token | Value | Use |
|---|---|---|
| `instant` | 80ms | Press scale |
| `fast` | 150ms | Hover, focus, tooltip, exits |
| `base` | 240ms | Dialog, crossfades |
| `slow` | 480ms | Card element entrance |
| `grow` | 900ms | Chain bars |
| `count` | 1200ms | Number roll-up |
| `draw` | 1600ms | Line chart |
| `reveal` | ≥3200ms | Particle gather |
| `story` | 5000ms | Per card |
| `stagger` / `stagger-bars` | 80 / 60ms | Siblings |
| `ease-out` | cubic-bezier(.22,1,.36,1) | Entrances, counts, bars, draw |
| `ease-in-out` | cubic-bezier(.65,0,.35,1) | Gather, crossfades |
| `ease-in` | cubic-bezier(.55,0,1,.45) | Exits only |
| `spring-card` | stiffness 260, damping 32, mass 1 | Card slide, markers, sheet |
| `press` | scale .97 | All buttons |

---

## 2. Components

All animated components read `PlaybackContext` (paused) and `useReducedMotion()`. Shared tween: `useTween` in `motion.ts`.

| Component | Props | Variants / states |
|---|---|---|
| **Button** | `variant` primary \| ghost \| icon, `loading`, `disabled`, Ariakit `ButtonProps` | default, hover, focus-visible (2px primary outline, 2px offset), pressed (scale .97 + pressed bg), disabled (`aria-disabled` when loading), loading (spinner, `aria-busy`, width kept). Height 44. |
| **IconButton** | `label` (aria-label + tooltip), `icon` (default gear) | Same states as Button icon. 44×44. |
| **Tooltip** (Ariakit) | `content`, `children` (anchor via `render`), `placement`, `tone` label \| value | hidden → shown after 400ms hover / instantly on focus; 150ms fade + 4px lift. |
| **ProgressSegments** | `count`, `current`, `paused`, `duration`, `onComplete`, `holdLast` | Per segment: idle, filling (linear scaleX), done, paused (held, 50% opacity + pause glyph). `role=progressbar`. |
| **StatNumber** | `value`, `label`, `format`, `size` stat \| xl, `accent`, `delay` | counting, settled, paused (frozen), reduced (final value). Screen readers get the final value only. |
| **StoryCard** | `index`, `eyebrow`, `accent`, `kicker`, `headline`, `children`, `layout` stack \| split \| center | Entrance: eyebrow → kicker+headline → body, 80ms stagger, y 12 → 0, 480ms ease-out. `StoryStage` handles the direction-aware slide. |
| **ChainBar** | `name`, `percent`, `max`, `icon`, `highlight`, `index` | growing, settled, paused, reduced. Top chain = accent fill. |
| **LineChart** | `data {date,value}[]`, `formatValue`, `width`, `height` | drawing, drawn (markers pop), marker focus/hover (tooltip), paused, reduced (complete). |
| **ShareCard** | `name`, `address`, `stats[4]` | entering (y 16, fade), settled. |
| **WalletCombobox** (Ariakit) | `value`, `onValueChange`, `suggestions`, `status` idle \| resolving \| valid \| invalid, `resolved`, `error`, `disabled` | default, hover, focus-visible, open, resolving (spinner), valid (green short address ✓), invalid (negative border + message, `aria-invalid`), disabled. |
| **SettingsDialog** (Ariakit) | `open`, `onClose`, `dismissable`, `value`, `status`, `resolved`, `error`, `demoWallets`, `onSubmit`, `saving` | first visit (not dismissable, no Cancel), empty, filled/valid, invalid, saving. Bottom sheet < 640px. |

Demo wallets: `pranksy.eth` (first, and the first-visit default) and `dingaling.eth`. Never invent ENS names.

---

## 3. Motion per screen

**Reveal (S04–S06)**
1. Scatter 0–600ms: particles spawn at random points as tx pages arrive; fade 0 → α, drift 4–12px/s.
2. Gather 600ms → data complete (min 3200ms total; 12s timeout → API error): each particle eases to a ring slot over 900–1400ms `ease-in-out`, 6px trail; ring rotates 6°/s. Counter inside ring rolls toward each page's total at a steady, linear pace — not eased — over the gap the page before it took to arrive, so it keeps climbing between pages instead of snapping to the new total and sitting still; the first page has no gap to learn from and rolls over 1000ms instead. Once paging ends the counter's finishing roll to the exact total takes the usual 240ms `ease-out`. If the next page hasn't landed within 2000ms of the one before it, a quiet line under the counter reads "Reading older transactions…" until it does, and clears the moment it lands — the dust keeps drifting throughout.
3. Hold 400ms: "Done", count final.
4. Burst 700ms `ease-out`: radial outward + fade. Card 1 starts entering at +200ms; chrome fades in with it.

Particle spec: 1 per tx, cap 1500 desktop / 600 mobile; pad with 25%-alpha dust to 240 minimum. Radius 0.8–2.2px (×DPR). Colors 88% `fg` (α .3–.9), 9% `primary`, 3% `notice`. Ring radius 200 / 120 mobile, band ±14px, center 10px above viewport center. Canvas 2D, one rAF loop, DPR ≤ 2.

**Card transitions** — next: enter x +64 → 0 with `spring-card`, exit x 0 → −64 at 150ms `ease-in`, both with opacity. Previous mirrors. `AnimatePresence mode="popLayout"`.

| Card | Order after card enters |
|---|---|
| 1 Origin | eyebrow 0 → kicker+date 80ms → "days onchain" count 160ms (1200ms) |
| 2 Home chain | eyebrow → kicker+headline → bars from 320ms, 60ms apart, 900ms; % counts in sync |
| 3 Top token | eyebrow → icon (scale .9 → 1, spring) + name → % change count (1200ms) + times traded |
| 4 The ride | eyebrow → title → value count + line draw 1600ms → peak marker (spring) → low marker +120ms |
| 5 Share | eyebrow → card rise 16px (480ms) → stats 80ms apart → buttons. No auto-advance. |

**Paused (S14)** — hold ≥200ms or Space. Segment fill freezes at 50% opacity + pause glyph; all tweens freeze via `PlaybackContext`; content dims to 85% (150ms); hint swaps to pause pill. Release resumes; a hold is never a click.

**Dialog** — backdrop fade 240ms; panel scale .96 → 1, y 8 → 0, 240ms `ease-out`; exit 150ms `ease-in`. Mobile sheet: y 100% → 0 with `spring-card`.

**States** — Empty and API error crossfade in over 240ms; particles fade out 480ms before API error.

**Start screen** — The landing state of `/`: the wordmark, the connected wallet (chrome carries both already), a centered Play button that starts a fresh Rewind, and the site footer. Opening `/` with a remembered wallet lands here — nothing loads and the reveal does not start until Play is pressed — and choosing a wallet in settings, first visit or not, closes onto this screen rather than straight into the reveal. Escape, or the close button in the story's top bar (next to the gear, its own accessible name "Close", present during the reveal as well as a card or the error state), leaves the reveal, a card or the error state for this screen instead. Escape is inert while the settings dialog is open — that dialog owns it instead.

**Reduced motion** — no canvas: static centered "Reading 1,284 transactions…" (number updates without rolling), crossfade 240ms into card 1. The late-page line still appears under it on the same 2000ms threshold. Cards crossfade (no x). Bars, chart and numbers render at final values. Progress segments still fill (timing, not decoration). Press scale off.

---

## 4. Layout

**1440×900**
- Story fills `100dvh`; content max-width 1440, side padding 120 (content 1200), 12-col grid, 24 gutter.
- Chrome (absolute, above click zones): progress segments 20 from top, 40 from sides, 3px tall, 6px gaps. Row below (12px gap): the Zerion logo (18×18, linking to zerion.io) beside the wordmark, left; wallet name (mono 13) + gear right, 44px tall.
- Navigation hint: bottom-center, 32px from bottom, 13px `fg-subtle`. Hidden on card 5; fades after first navigation.
- Click zones: left half = previous, right half = next. Chrome and buttons capture their own clicks.
- Content vertically centered with 120px top / 80px bottom reserved for chrome.
- Card 2 split: 5 / 6 columns, 96 gap. Card 4 chart: full 1200 width, 380 tall.

**390 wide**
- Side padding 20. Chrome padding 12/20, plus `env(safe-area-inset-top/bottom)`.
- Display-xl → 88px; kickers 20px; bars 8px.
- Tap zones: left 30% previous / right 70% next.
- Dialog becomes a bottom sheet (< 640px): full width, radius 24 top, bottom padding `max(34px, safe-area)`, full-width 52px primary button.

**Share image** 1200×630 @2×, in the theme the visitor chose, 64px padding; wordmark top, name 112px serif (72px if > 14 chars), 4 stats bottom; particle ring at (960, 250) r 170. Its ground, ink, quieter ink and the ring's three tones are that theme's `bg`, `fg`, `fg-muted`, `fg`/`primary`/`notice`. Canvas 2D after `document.fonts.ready`; `navigator.share({ files })` or download.

---

## 5. Do / Don't

Do
- Tabular numbers for every figure; mono only for addresses.
- One accent per card, on one element (eyebrow dot + the key figure at most).
- Keep the particle reveal as the only hero moment.
- Show focus rings on keyboard focus only (`data-focus-visible` / `:focus-visible`).
- Give markers, gear and buttons accessible names; `aria-live="polite"` on the reveal counter (≤ 1 update/s).

Don't
- Don't use white text on dark-mode primary (`#00a3f5`) — use `on-primary`.
- Don't animate on hover beyond color; no bouncing, shaking or glow.
- Don't add gradients or neon; the only gradient-like element is the chart's 8% area fill.
- Don't invent ENS names or wallet data.
- Don't block the story on fonts or icons; chain/token icons fall back to an initial in a `surface-raised` circle.


---

## 6. Pass 3 files

**`types.ts`** — `RewindFacts`, the only data the UI reads. Optional fields hide what they feed: no `firstTx` → no Origin card; empty `chains` → no Home chain card; no `topToken` → no Top token card (share card shows "—"); no `balance` or < 2 points → no Ride card. `txCount === 0` → EmptyState. Also exports `fmt` (int, usd, pct, dates in UTC), `shortAddress`, `displayName`.

**`fixtures.ts`** — `normal` (vitalik.eth, 5 of 6 chains, +38.4%), `empty` (0 tx), `negative` (address only, 1 chain, PEPE −42.7%, falling balance). Sample numbers, not real data.

**`components/ParticleReveal.tsx`** — Canvas 2D, one rAF loop, DPR ≤ 2, ResizeObserver. Ref API: `addTransactions(n)`, `complete(finalCount)`, `fail()`. Callbacks: `onBurst` (burst start; mount the story 200ms later), `onDone` (burst end; unmount), `onFailed` (after the 480ms fade; show ErrorState). Starts with 240 dust particles; each real transaction converts one dust particle, then spawns new ones up to the cap (1500, or 600 below 640px). The clock excludes hidden-tab time, so every phase pauses. Its tones come from the resolved tokens, re-read on every theme change, because a canvas inherits no CSS. The 12s timeout belongs to the data layer: call `fail()`. Reduced motion: no canvas, a static line with a live count, 240ms fade.

**`components/RewindPlayer.tsx`** — Props: `facts`, `onReplay`, `onOpenSettings`. Owns `current`, `direction` and `paused`, and provides `PlaybackContext`. A pointer press shorter than 200ms navigates (left half goes back, right half forward; 30/70 below 640px). Holding 200ms or longer pauses, and releasing resumes without navigating. Keys: ← and → navigate, holding Space pauses. Keys are ignored inside inputs, buttons and dialogs. Auto-advance comes from `ProgressSegments.onComplete`, and the last card holds. "Share image" calls `renderShareImage` → `shareOrDownload` with a loading state.

**`components/StoryChrome.tsx`** — The top bar (segments slot, wordmark, wallet name, theme toggle, gear, and an optional close button next to the gear), split out so the player and the state screens share it. The close button only renders where there's a story to leave.

**`components/EmptyState.tsx` / `ErrorState.tsx`** — Match S12 and S13. ErrorState props: `onRetry`, `onChangeWallet`, `retrying`, and `reason`. `reason` picks the screen: `"unavailable"` (the default) reads as S13 does — "The rewind got stuck", with focus on "Try again" — while `"budget-spent"` is the day's data budget being spent on the free API plan, which is nothing the visitor did and which resolves when the day resets: its own eyebrow and headline ("Today's data budget is spent"), its own paragraph saying when to come back, and no "Try again" at all, because no retry succeeds before the reset. Focus then goes to "Change wallet".

**`components/TokenIcon.tsx` / `ChainIcon.tsx`** — `AvatarImage`: the initial renders first with the image layered over it; `onError` keeps the fallback. Lazy loading with async decoding, fixed size, so there's no layout shift.

**`StoryCard`** gained three optional props: `media` (card 3 icon), `lead` (card 2 summary line) and `headlineSize` (`"lg"` for card 4). Nothing else changed.

**`renderShareImage.ts`** — `renderShareImage(facts, capped, theme): Promise<Blob>` renders 2400×1260 PNG, following §4 (the palette of the theme it is handed, particle ring seeded by the address so each wallet's image stays the same). `shareImagePalette(theme)` is that palette, and `shareImageStats(facts, capped)` the four pairs it draws. It loads the fonts it needs, then waits for `document.fonts.ready`. `shareOrDownload(blob, filename)` uses `navigator.share({ files })` when available and downloads otherwise; returns `"shared" | "downloaded" | "cancelled"`.

**`Playground.tsx`** — The `/system` page: every component in every state (hover, focus and press are live), a replay control for animated components, and full-screen runs of each fixture (reveal → story, reveal → error, empty, error). A fake data stream sends 120 tx every 350ms.

**`assets/`**
- `wordmark.svg` / `wordmark-dark.svg`: Instrument Serif converted to outlines, so no font is needed; white and #16161a versions.
- `favicon.svg`: particle ring mark, 32×32.
- `og-default.png`: 1200×630.
- `title-intro.png`, `title-section.png`, `title-outro.png`: 1920×1080. The intro leaves room for a name line at y ≈ 720–800; the outro leaves room for a name and link at y ≈ 640–860.

**Strictness notes** — `LineChart` compiles with `noUncheckedIndexedAccess` (clamped point lookup, returns null below 2 points). Fixture high/low use `?? fallback` for the same reason.

---

## 7. Development log (`/logs`)

This project's own build history (CONTEXT.md), not part of the Rewind story — its own route, its own components, reusing the same tokens and motion constants. `src/engine/dev-log-view.ts` is the only place that reads both `github-dev-record.ts`'s and `dev-record.ts`'s shapes; every component below reads its `DevLogView` output only, the same "components never see the raw upstream shape" discipline as `RewindFacts`.

| Component | Props | Notes |
|---|---|---|
| **`DevLogPage`** | *(none — the route's component)* | Owns the two polling queries and the client-only mount gate; renders the header, the record, then the shared `SiteFooter` (§8). |
| **`DevLogRecord`** | `view: DevLogView` | The milestone card, the five headline stats, the time split, the guardrails card and the ticket list. Pure presentational — this is what `/system` renders on fixtures. |
| **`DegradedLogRecord`** | `view: DegradedLogView` | What the Vinaya log alone can show when GitHub has failed: the live line (no role — GitHub's ticket status is what names it), the time split, the guardrails card and a round-activity list keyed by issue number only, no title, status, size or verdicts. Renders alongside a `StateMessage` naming what's missing and why. |
| **`StateMessage`** | `state: "loading" \| "rate_limited" \| "token_rejected" \| "unreachable"` | The four clear-message states a read can be in. Names an environment variable (`GITHUB_TOKEN`, `VINAYA_LOG_READ_TOKEN`), never a value. Its copy says what's still shown alongside it, and what isn't — a failed read degrades the page, it never blanks it while the other source still answers. |
| **`RoundTimeline`** | `timeline: RoundTimelineEntry[]`, `scaleMs: number`, `humanRulings: number` | Developer and reviewer bars on one shared scale (the longest round on the page sets `scaleMs`), outcome pill, confidence, files changed, problems raised. A round whose number repeats reads "re-review" (plus "after a human ruling" when the ticket had one). |

**Layout** — same page rhythm as the story's cards: `rounded-2xl border border-border bg-surface p-6` for every block, `gap-4`/`gap-8` between them, `max-w-[1180px]` centered, side padding 40 desktop / 20 mobile (`px-10`/`max-sm:px-5`). The ticket list is a `6fr`-ish CSS grid (`Ticket · Time · Rounds · Size · Problems · Tokens`) that collapses to 2 columns under `lg` and 1 under `sm`, matching the Rewind's own mobile-collapse pattern. Its column header row is `sticky top-0 z-10` with its own opaque `bg-surface` (the list's own background, so a row scrolling under it never shows through), pinned to the viewport — not to the list — because the page itself has no `overflow` ancestor to pin to instead; the list's own rounding moved from an `overflow-hidden` wrapper (which would have capped the header's stick range to the list's own box) onto the header's `rounded-t-2xl` corners instead. Hidden under `lg`, same as always, where the grid collapses and each `Cell` shows its own inline label.

**Motion** — each block fades and rises in with `enterCard`/`enterCardReduced` (`components/rewind/motion.ts`), staggered by `stagger.children` per block index; the milestone and time-split bars fill with `duration.grow`/`ease.out`, same as `ProgressSegments`. A ticket expands with the native `<details>`/`<summary>` disclosure (no `@ariakit/react` needed for it) — no bespoke open/close animation, so it costs nothing under reduced motion. The "working on it now" dot uses the same `animate-pulse` treatment as no other component in this doc; it's a plain CSS animation, not a `motion/react` one, so it isn't gated by `useReducedMotion()` — it is a single pulsing opacity, well under the threshold `design/KNOWN-ISSUES.md` would flag.

**Polling** — the page's two queries refresh every few seconds (`.claude/rules/tanstack-start.md`), the one deliberate exception to the app's half-day `staleTime`. `refetchIntervalInBackground` stays at its TanStack Query default (`false`), so a hidden tab stops polling — the same "hidden tabs pause" rule the story's own tweens follow, just enforced by Query instead of `PlaybackContext`.

**SSR** — the route renders a neutral shell on the server (no ticket data, no local time). `DevLogPage` mounts `DevLogData` (which owns both queries) only after a client-only effect flips a `mounted` flag, the same pattern `useConnectedWallet`'s `loaded` flag uses in `index.tsx`: the server and the first client render agree, so hydration never mismatches. Every local-time string (`LocalTime`, `src/components/logs/format.ts`'s `localStamp`) is therefore only ever rendered after that mount, from data that only exists on the client.

---

## 8. Site chrome

**Zerion logo** — `public/zerion-logo.svg`, sourced verbatim from Zerion's own design system at `https://design.zerion.io/logo` (the "symbol" mark, brand blue `#2461ED`, retrieved 2026-09-29). It is `StoryChrome.tsx`'s to render, beside the wordmark, top left of every screen `/` carries (reveal, cards, error, empty and the start screen alike) — 18×18, linking to `https://zerion.io`, `target="_blank"` with `rel="noopener noreferrer"`, and its own accessible name ("Zerion") on the link rather than the decorative image. One file for both themes, the same as `favicon.svg`: the brand-blue mark reads clearly against both `bg` tokens, so it never needs a second variant.

**`SiteFooter`** (`src/components/ui/Footer.tsx`) — `variant: "overlay" | "inline"` (default `inline`). The one footer the whole site carries: a link to `/system` ("Design system"), a link to `/logs` ("Development stats"), "Made with Vinaya" (`https://vinaya.attalabs.dev`), "© 2026 Atta Labs", a link to Atta Labs on GitHub (`https://github.com/atta-labs`) and a link to this demo's own source (`https://github.com/daniboomerang/onchain-rewind`) — every external link `target="_blank"` with `rel="noopener noreferrer"`, the two internal links (`/system`, `/logs`) neither. Text tokens only (`text-fg-muted`, `text-fg`), so it follows the theme the same as everything else.

It renders in exactly two places: the start screen of `/` (`variant="overlay"`, absolutely positioned to the bottom of that screen's `relative` container, so it adds no scroll height — the start screen's centered wordmark-and-Play-button layout already fits both 1280×800 and 390×844 with room under it) and the end of `/logs` (`variant="inline"`, in normal document flow, replacing `DevLogPage`'s own former "Made with Vinaya" line). It never renders on the reveal, a story card, the error state, the empty state, the share card or the share image — those mount their own chrome (`StoryChrome`) with no footer slot at all.
