---
version: alpha
name: peik1
description: A solo engineer's blog and portfolio (Astro). Calm, editorial, technical on the reading surfaces — chrome stays quiet so the writing is the subject.
colors:
  background: 'hsl(210 33% 99%)'
  foreground: 'hsl(240 10% 3.9%)'
  card: 'hsl(0 0% 100%)'
  card-foreground: 'hsl(240 10% 3.9%)'
  popover: 'hsl(0 0% 100%)'
  popover-foreground: 'hsl(240 10% 3.9%)'
  primary: 'hsl(200 29% 45%)'
  primary-foreground: 'hsl(0 0% 92.5%)'
  secondary: 'hsl(240 4.8% 95.9%)'
  secondary-foreground: 'hsl(240 5.9% 10%)'
  muted: 'hsl(240 4.8% 95%)'
  muted-foreground: 'hsl(240 3.8% 28.1%)'
  accent: 'hsl(240 4.8% 95.9%)'
  accent-foreground: 'hsl(240 5.9% 10%)'
  destructive: 'hsl(0 72.22% 50.59%)'
  destructive-foreground: 'hsl(0 0% 98%)'
  border: 'hsl(240 5.9% 88%)'
  input: 'hsl(240 5.9% 90%)'
  ring: 'hsl(240 5.9% 10%)'
  code-bg: 'hsl(220 14% 93%)'
  code-fg: 'hsl(220 13% 18%)'
# colorsDark is a non-normative extension (not part of the base design.md
# spec): the site is dual-theme, and we keep both themes in one file rather
# than splitting into a second design.dark.md. Same keys as `colors` above,
# values applied when `.dark` is set on <html>.
colorsDark:
  background: 'hsl(240 20.54% 5.2%)'
  foreground: 'hsl(0 0% 98%)'
  card: 'hsl(240 10% 3.9%)'
  card-foreground: 'hsl(0 0% 98%)'
  popover: 'hsl(240 10% 3.9%)'
  popover-foreground: 'hsl(0 0% 98%)'
  primary: 'hsl(195 95% 85%)'
  primary-foreground: 'hsl(240 3.7% 15.9%)'
  secondary: 'hsl(240 3.7% 15.9%)'
  secondary-foreground: 'hsl(0 0% 98%)'
  muted: 'hsl(240 5.9% 12%)'
  muted-foreground: 'hsl(240 5% 74.9%)'
  accent: 'hsl(240 3.7% 15.9%)'
  accent-foreground: 'hsl(0 0% 98%)'
  destructive: 'hsl(0 62.8% 30.6%)'
  destructive-foreground: 'hsl(0 0% 98%)'
  border: 'hsl(240 3.7% 19.9%)'
  input: 'hsl(240 3.7% 15.9%)'
  ring: 'hsl(240 4.9% 83.9%)'
  code-bg: 'hsl(240 5.9% 12%)'
  code-fg: 'hsl(0 0% 92%)'
typography:
  body:
    fontFamily: "Satoshi, system-ui, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC', sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  brand:
    fontFamily: Satoshi
    fontSize: 20px
    fontWeight: 600
  prose-heading:
    fontFamily: Satoshi
    fontWeight: 500
  code:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: 14px
rounded:
  md: 6px
  lg: 8px
  xl: 12px
  2xl: 16px
  full: 9999px
spacing:
  icon-button: 6px
  nav-gap: 16px
---

# Design Conventions

This documents what the codebase actually does, not an aspirational spec.

## Overview

A solo engineering blog/portfolio. The reading surfaces (blog, notes, product, projects, about) should feel calm, editorial, and technical — quiet chrome, generous whitespace, nothing competing with the writing.

## Colors

All color is driven by HSL-triplet CSS variables in
[`app.css`](src/assets/styles/app.css:30-56), set in `:root` and overridden in
`.dark` ([`app.css:57-82`](src/assets/styles/app.css)), toggled as a class on
`<html>` by [`ThemeProvider.astro:24`](src/components/ThemeProvider.astro).
Variables store a raw `H S% L%` triplet (no `hsl()` wrapper) so they can be
consumed with an alpha channel: `hsl(var(--primary) / 0.25)`.

| Token                                    | Light                              | Dark                                         | Used for                     |
| ---------------------------------------- | ---------------------------------- | -------------------------------------------- | ---------------------------- |
| `background` / `foreground`              | `210 33% 99%` / `240 10% 3.9%`     | `240 20.54% 5.2%` / `0 0% 98%`               | Page base                    |
| `card` / `card-foreground`               | `0 0% 100%` / `240 10% 3.9%`       | `240 10% 3.9%` / `0 0% 98%`                  | Cards, popovers              |
| `primary` / `primary-foreground`         | `200 29% 45%` (muted teal-blue)    | `195 95% 85%` (bright cyan)                  | Links, accents, active state |
| `secondary` / `muted` / `accent`         | `240 4.8% 95.9%` / `95%` / `95.9%` | `240 3.7% 15.9%` / `5.9% 12%` / `3.7% 15.9%` | Low-emphasis fills           |
| `muted-foreground`                       | `240 3.8% 28.1%`                   | `240 5% 74.9%`                               | Secondary text               |
| `destructive` / `destructive-foreground` | `0 72.22% 50.59%` / `0 0% 98%`     | `0 62.8% 30.6%` / `0 0% 98%`                 | Errors                       |
| `border` / `input` / `ring`              | `240 5.9% 88%` / `90%` / `10%`     | `240 3.7% 19.9%` / `15.9%` / `4.9% 83.9%`    | Structural lines, focus      |
| `code-bg` / `code-fg`                    | `220 14% 93%` / `220 13% 18%`      | `240 5.9% 12%` / `0 0% 92%`                  | Code blocks                  |

Changing the accent is a two-line edit — `--primary` in `:root` and in `.dark`
— and every reference follows.

`--primary` is not held constant across themes — it flips from a muted mid-tone
in light mode to a bright near-foreground tone in dark mode, rather than keeping
the same hue/lightness. Match that intent: a color that reads as an "accent" in
light mode should still read as one in dark mode, even if the exact HSL differs.

[`uno.config.ts:189-191`](uno.config.ts) maps every pair into `theme.colors` so
components use the semantic name, never the raw variable or a generic Tailwind
shade: `bg-muted`, `text-muted-foreground`, `border-input`, `hover:text-primary`.
`presetWind3` (full Tailwind palette) is intentionally disabled — only
`presetMini` + `presetTypography` run
([`uno.config.ts:184-185`](uno.config.ts)) — so classes like `text-red-500`
don't exist here; if a new color is needed, add a token to `app.css` +
`uno.config.ts` rather than reaching for a raw Tailwind shade.

**Known wart.** [`ThemeProvider.astro:3-4`](src/components/ThemeProvider.astro)
hard-codes `#0B0B10` / `#FCFCFD` and `:25-27` overwrites the _first_
`meta[name="theme-color"]`. [`BaseHead.astro:96-97`](src/components/BaseHead.astro)
emits two of those metas, one per `prefers-color-scheme`, carrying the token
values — so the script rewrites the light meta with the dark hex and never
touches the dark one. Left as-is; don't copy the pattern.

## Typography

- Body font: **Satoshi**, self-hosted variable font
  ([`app.css:1-13`](src/assets/styles/app.css),
  `/fonts/Satoshi-Variable.ttf`), preloaded at
  [`BaseHead.astro:64`](src/components/BaseHead.astro). Satoshi carries Latin
  only, so the CJK families are declared right after it in the same `html` rule
  ([`app.css:14-27`](src/assets/styles/app.css)) — set it once, don't
  re-declare `font-family` per component.
- Monospace: **JetBrains Mono**, from the Google Fonts CDN, loaded without
  blocking first paint ([`BaseHead.astro:71-82`](src/components/BaseHead.astro)).
  Scope is code blocks and code-adjacent chrome — not general emphasis.
- Prose (blog/notes/product body copy) uses `presetTypography` via the
  `prose text-base text-muted-foreground` class combo
  ([`site.config.ts:86`](src/site.config.ts)). Headings inside prose are
  `font-weight: 500`, not bold; `strong` is `600`, links are `500`
  ([`uno.config.ts`](uno.config.ts)) — don't fight these with inline weight
  utilities.
- There's no larger custom type scale beyond the default UnoCSS sizes
  (`text-xs` … `text-xl` cover nearly everything observed).

## Layout

No custom spacing scale — default 0.25rem-increment scale from `presetMini`.
Two idioms recur enough to be conventions:

- Icon buttons: `size-5` content box with `p-1.5` (6px) padding
  ([`Header.astro:51-68`](src/components/Header.astro)) — use this pairing for
  any new icon-only button rather than picking arbitrary padding.
- Horizontal flex spacing in nav/header contexts: `gap-x-*`, not bare `gap-*`
  ([`Header.astro:22,50`](src/components/Header.astro)) — keeps vertical rhythm
  untouched when a row wraps.

### Breakpoints

Utility classes use the default UnoCSS breakpoints (`sm:`, `md:`, …)
throughout — that part is standard. The exception is **scoped `<style>` blocks**,
where UnoCSS doesn't generate responsive variants for hand-rolled CSS, so
components fall back to raw `@media` queries that don't always match the
UnoCSS px values exactly.

When adding a scoped media query, use `640px` for the mobile cutoff and `768px`
for the tablet cutoff unless you have a specific reason to diverge.

## Elevation & Depth

No shadow token/CSS var — always a UnoCSS `shadow-*` utility or a
hand-authored `box-shadow`. The live idiom is a hover affordance on
interactive cards: `hover:shadow-sm` paired with `hover:border-foreground/25`
(or `/20`), e.g. [`home/LinkCard.astro:31`](src/components/home/LinkCard.astro),
[`pages/notes/[...page].astro:102`](src/pages/notes/[...page].astro). The only
static elevation left is the theme toast
([`ThemeProvider.astro:36`](src/components/ThemeProvider.astro)).

The header's "scrolled" chrome shadow
([`Header.astro:159-163,193-197`](src/components/Header.astro)) is a hardcoded
4-layer rgba stack predating any token idiom. It's left as-is, but don't copy it
into new components.

## Motion

### No instant state swaps

When a control has more than one visual state (an icon, a label, an
expanded/collapsed panel), do not swap between states with `display:none` /
`display:block` or a hard content replace. An instant swap reads as a glitch,
not a change. Prefer a short transition that makes the change feel intentional.

### Blurred Icon Transition

The default crossfade for a control that swaps between a small set of icons or
labels:

- Stack every state in the same position (`position: absolute; inset: 0;
margin: auto;` inside a `position: relative` container), instead of only
  rendering the active one.
- The outgoing state animates to `opacity: 0`, `filter: blur(4px)`,
  `transform: scale(0.6)`.
- The incoming state animates to `opacity: 1`, `filter: blur(0)`,
  `transform: scale(1)`.
- Both transition over `0.25s ease` on `opacity`, `filter`, and `transform`.
- Always add a `prefers-reduced-motion: reduce` override that removes the
  transition (state still changes, just without the animation).

Reference implementation:
[`Header.astro:224-251`](src/components/Header.astro) — the theme toggle button
(system / light / dark icons), swapped in place via a `data-theme` attribute.

Use this same recipe for any new control that has this shape, rather than
inventing a different transition style per component.

### Always respect reduced motion

Every animation/transition added to the site must have a
`@media (prefers-reduced-motion: reduce)` override. See
[`app.css:115`](src/assets/styles/app.css) for the global rule, and
[`Header.astro:268`](src/components/Header.astro) /
[`BackToTop.astro:180`](src/components/navigation/BackToTop.astro) for the
component-level pattern. Where an animation is driven from script rather than
CSS, gate it on `matchMedia('(prefers-reduced-motion: reduce)')`
([`TableOfContents.astro:212`](src/components/navigation/TableOfContents.astro)).

## Shapes

`--radius: 0.5rem` (8px, [`app.css:50`](src/assets/styles/app.css)) is the
canonical system radius, consumed as a raw CSS value in a couple of prose
elements ([`uno.config.ts`](uno.config.ts)) rather than a class — the practical
convention lives in which UnoCSS radius utility each layer uses:

- **`rounded-md`** (6px) — compact controls: icon buttons, small badges
  ([`Header.astro:51-68`](src/components/Header.astro)).
- **`rounded-lg`** (8px) — the default for list items and cards. Numerically
  equal to `--radius`.
- **`rounded-xl`/`rounded-2xl`** (12px/16px) — hero-level containers: the
  header shell ([`Header.astro:12-13`](src/components/Header.astro),
  `rounded-xl` → `sm:rounded-2xl`), homepage and about cards.
- **`rounded-full`** — avatars, status dots, pill badges.

Rule of thumb: control → `md`, card → `lg`, hero container → `xl`/`2xl`,
avatar/pill/dot → `full`.

## Components

No component token library — patterns are established by precedent, reused by
copying the class combo rather than a shared component prop API:

- **Icon button**: `box-content size-5` box, `p-1.5` padding, `rounded-md`,
  `hover:bg-border`, `transition-colors`
  ([`Header.astro:51-68`](src/components/Header.astro)).
- **Interactive card**: `rounded-xl`/`rounded-2xl`, `border`,
  `hover:border-foreground/25` + `hover:shadow-sm`
  ([`home/LinkCard.astro:31`](src/components/home/LinkCard.astro)).
- **Icon/label swap control**: see
  [Blurred Icon Transition](#blurred-icon-transition) — a motion pattern, not a
  static style.

## Do's and Don'ts

- Do use the semantic token classes (`bg-muted`, `text-primary`, …), never a
  raw Tailwind palette color or a literal hex/rgb in a component.
- Do keep `font-mono` for code, not for general emphasis.
- Do reuse `640px`/`768px` for scoped media queries rather than inventing a new
  breakpoint.
- Do reuse the Blurred Icon Transition for any control that swaps between a
  small set of icons or labels, instead of an instant state swap.
- Do tie new shadows to the foreground token or a `shadow-*` utility rather than
  hand-rolling another hardcoded rgba stack.
