# Onchain Rewind — DESIGN.md

A wallet's year, played back as five story cards after a particle reveal. Dark first (light theme exists in the tokens but the story always renders dark). Desktop 1440×900, mobile 390 wide.

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

**Theme** — dark is the bare `:root` default; `data-theme="light"` or `data-theme="dark"` on any element re-declares the palette for that element and everything inside it. The root document resolves the system setting into `data-theme` on `<html>` before the first paint, and the story's own roots — the particle reveal, the story surface and the share card — carry `data-theme="dark"`, so the story keeps its palette inside a light page.

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

Demo wallets: `vitalik.eth` + two unlabeled slots ("Demo wallet 2", "Demo wallet 3", disabled until filled with real public wallets). Never invent ENS names.

---

## 3. Motion per screen

**Reveal (S04–S06)**
1. Scatter 0–600ms: particles spawn at random points as tx pages arrive; fade 0 → α, drift 4–12px/s.
2. Gather 600ms → data complete (min 3200ms total; 12s timeout → API error): each particle eases to a ring slot over 900–1400ms `ease-in-out`, 6px trail; ring rotates 6°/s. Counter inside ring rolls per page (240ms `ease-out`).
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

**Reduced motion** — no canvas: static centered "Reading 1,284 transactions…" (number updates without rolling), crossfade 240ms into card 1. Cards crossfade (no x). Bars, chart and numbers render at final values. Progress segments still fill (timing, not decoration). Press scale off.

---

## 4. Layout

**1440×900**
- Story fills `100dvh`; content max-width 1440, side padding 120 (content 1200), 12-col grid, 24 gutter.
- Chrome (absolute, above click zones): progress segments 20 from top, 40 from sides, 3px tall, 6px gaps. Row below (12px gap): wordmark left; wallet name (mono 13) + gear right, 44px tall.
- Navigation hint: bottom-center, 32px from bottom, 13px `fg-subtle`. Hidden on card 5; fades after first navigation.
- Click zones: left half = previous, right half = next. Chrome and buttons capture their own clicks.
- Content vertically centered with 120px top / 80px bottom reserved for chrome.
- Card 2 split: 5 / 6 columns, 96 gap. Card 4 chart: full 1200 width, 380 tall.

**390 wide**
- Side padding 20. Chrome padding 12/20, plus `env(safe-area-inset-top/bottom)`.
- Display-xl → 88px; kickers 20px; bars 8px.
- Tap zones: left 30% previous / right 70% next.
- Dialog becomes a bottom sheet (< 640px): full width, radius 24 top, bottom padding `max(34px, safe-area)`, full-width 52px primary button.

**Share image** 1200×630 @2×, always dark, 64px padding; wordmark top, name 112px serif (72px if > 14 chars), 4 stats bottom; particle ring at (960, 250) r 170. Canvas 2D after `document.fonts.ready`; `navigator.share({ files })` or download.

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

**`components/ParticleReveal.tsx`** — Canvas 2D, one rAF loop, DPR ≤ 2, ResizeObserver. Ref API: `addTransactions(n)`, `complete(finalCount)`, `fail()`. Callbacks: `onBurst` (burst start; mount the story 200ms later), `onDone` (burst end; unmount), `onFailed` (after the 480ms fade; show ErrorState). Starts with 240 dust particles; each real transaction converts one dust particle, then spawns new ones up to the cap (1500, or 600 below 640px). The clock excludes hidden-tab time, so every phase pauses. The 12s timeout belongs to the data layer: call `fail()`. Reduced motion: no canvas, a static line with a live count, 240ms fade.

**`components/RewindPlayer.tsx`** — Props: `facts`, `onReplay`, `onOpenSettings`. Owns `current`, `direction` and `paused`, and provides `PlaybackContext`. A pointer press shorter than 200ms navigates (left half goes back, right half forward; 30/70 below 640px). Holding 200ms or longer pauses, and releasing resumes without navigating. Keys: ← and → navigate, holding Space pauses. Keys are ignored inside inputs, buttons and dialogs. Auto-advance comes from `ProgressSegments.onComplete`, and the last card holds. "Share image" calls `renderShareImage` → `shareOrDownload` with a loading state.

**`components/StoryChrome.tsx`** — The top bar (segments slot, wordmark, wallet name, gear), split out so the player and the state screens share it.

**`components/EmptyState.tsx` / `ErrorState.tsx`** — Match S12 and S13. ErrorState props: `onRetry`, `onChangeWallet`, `retrying`, and `message`; focus goes to "Try again". `message` replaces the generic explanation under the headline for a failure worth naming — the day's data budget being spent on the free API plan, which is nothing the visitor did and resolves when the day resets. Left out, the paragraph reads as S13 does.

**`components/TokenIcon.tsx` / `ChainIcon.tsx`** — `AvatarImage`: the initial renders first with the image layered over it; `onError` keeps the fallback. Lazy loading with async decoding, fixed size, so there's no layout shift.

**`StoryCard`** gained three optional props: `media` (card 3 icon), `lead` (card 2 summary line) and `headlineSize` (`"lg"` for card 4). Nothing else changed.

**`renderShareImage.ts`** — `renderShareImage(facts): Promise<Blob>` renders 2400×1260 PNG, following §4 (always dark, particle ring seeded by the address so each wallet's image stays the same). It loads the fonts it needs, then waits for `document.fonts.ready`. `shareOrDownload(blob, filename)` uses `navigator.share({ files })` when available and downloads otherwise; returns `"shared" | "downloaded" | "cancelled"`.

**`Playground.tsx`** — The `/system` page: every component in every state (hover, focus and press are live), a replay control for animated components, and full-screen runs of each fixture (reveal → story, reveal → error, empty, error). A fake data stream sends 120 tx every 350ms.

**`assets/`**
- `wordmark.svg` / `wordmark-dark.svg`: Instrument Serif converted to outlines, so no font is needed; white and #16161a versions.
- `favicon.svg`: particle ring mark, 32×32.
- `og-default.png`: 1200×630.
- `title-intro.png`, `title-section.png`, `title-outro.png`: 1920×1080. The intro leaves room for a name line at y ≈ 720–800; the outro leaves room for a name and link at y ≈ 640–860.

**Strictness notes** — `LineChart` compiles with `noUncheckedIndexedAccess` (clamped point lookup, returns null below 2 points). Fixture high/low use `?? fallback` for the same reason.
