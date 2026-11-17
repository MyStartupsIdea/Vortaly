# Vortaly — design system: "Paper and ink"

Replaces the earlier "majolica" world (turquoise glaze, Unbounded) for
Vortaly's own surfaces. Business sites keep their six themes: they are the
business's brand, not Vortaly's (see `themeStyle` in lib/booking/catalog.tsx,
which overrides `--color-brand` and `--color-accent` per site).

## Point of view

A notebook, not a dashboard. Warm paper, near-black ink, one line of lapis.
The owner should feel they are writing about their business, and the product
quietly turns it into an app. Everything that is not the owner's content
recedes: no gradients, no glow, no shadows standing in for structure.

Minimal is not empty: hierarchy comes from type size, weight and space, and
from the one colour that is allowed to speak.

## Colour

Tokens live in `app/globals.css` (`@theme`), redefined for dark mode.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `surface` | `#F6F5F1` paper | `#121211` | page ground |
| `surface-raised` | `#FFFFFF` | `#1B1B19` | cards, inputs, sheets |
| `surface-sunken` | `#EEECE6` | `#0C0C0B` | wells, app shells behind panels |
| `ink` | `#1B1A17` | `#EDEBE5` | text |
| `ink-muted` | `#6E6A62` | `#A09B91` | secondary text (≥ 4.5:1 on surface) |
| `hairline` | ink at 10% | ink at 12% | every border and divider |
| `brand` | `#1B1A17` | `#EDEBE5` | primary action, selection (ink, not a hue) |
| `brand-ink` | `#FFFFFF` | `#121211` | text on brand |
| `lapis` | `#2E4BD6` | `#8EA2FF` | focus ring, AI moments, links, the mark |
| `accent` | `#B42318` | `#F0644F` | errors and destructive actions only |
| `saffron` | `#B7791F` | `#E3B04B` | warnings, "waiting" status |

Rules: lapis appears at most once or twice per screen. Red means "something
is wrong or will be destroyed", never decoration. Status pills are tinted
text on a 8–10% wash of the same colour.

## Type

One family: **Onest** (Google Fonts; Latin, Latin-ext, Cyrillic), loaded as
both `--font-sans` and `--font-display`.

- Display / page titles: 600–700, tracking −0.02em, 26–40 px, line-height 1.1.
- Section titles: 600, 15–17 px.
- Body: 400, 15 px on phones, line-height 1.45.
- Labels and meta: 500–600, 12–13 px. No all-caps except tiny overlines.
- Numbers (prices, times, counts): `tabular-nums`.

## Shape and depth

- Radii: controls and tiles 8 px (`radius-tile`), cards and buttons 12 px
  (`radius-card`), sheets and phone frames 20 px (`radius-sheet`).
- Depth is a 1 px hairline and a change of surface. Shadows only on things
  that float (a phone preview, a popover): one soft, low-opacity shadow.
- The primary button is a solid ink block, 12 px radius, not a pill.

## Space

4 px base. Page gutter 16 px on phones, 24–40 px on desktop. Cards pad 16–20
px. Content width 560 px for forms, 1120 px for two-column layouts.

## Motion

150 ms ease-out on colour and transform; pressed state scales to 0.985. No
entrance choreography. Loading is a quiet pulse. `prefers-reduced-motion`
turns motion off.

## Signature

The Vortaly mark: an eight-point girih star (two overlapping squares) in
lapis, beside the wordmark. It is the only ornament. The Uzbek identity lives
in the language, the content and this one geometric form, not in pattern
fills.

## Components

- Button: primary (ink), secondary (raised + hairline), ghost (muted text).
- Inputs: raised surface, hairline border, 48 px tall on phones, focus ring
  in lapis.
- Chips: hairline pill, selected = ink border + ink text.
- Cards: raised, hairline, 12 px radius, no shadow.
- Status: tinted pills (saffron waiting, lapis confirmed, ink paid, muted
  cancelled).
