# Vortaly — design system: "Kinetic canvas"

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

Based on the owner's Stitch design ("Kinetic canvas"). No flat grey: every
neutral is cool and blue-tinted. Dark mode is deep navy.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `surface` | `#F8F9FF` | `#0A1526` | canvas |
| `surface-raised` | `#FFFFFF` | `#111F36` | cards, inputs, sheets |
| `surface-sunken` | `#EFF4FF` | `#0D1A2F` | chips, troughs |
| `ink` | `#0B1C30` | `#EAF1FF` | text |
| `ink-muted` | `#4A5A78` | `#9FB0D0` | secondary text |
| `hairline` / `-strong` | `#DFE6F3` / `#C3CEE3` | `#1F3150` / `#2D4268` | 1px borders |
| `brand` / `-strong` / `-tint` | `#1D4ED8` / `#1E40AF` / `#EFF6FF` | `#4F7CFF` | primary action, selection |
| `coral` / `-tint` | `#EA580C` / `#FFF7ED` | `#FF8A4C` | AI actions only |
| `accent` | `#DC2626` | `#FF6B5B` | errors |
| `saffron` | `#D97706` | `#F5B83D` | warnings, "waiting" |
| `navy` | `#0B1C30` | `#06101F` | deep headers |

Type: Onest for headings (Outfit from the Stitch file has no Cyrillic),
Manrope for UI and text. Radii: 10 px controls and buttons, 12 px cards,
16 px sheets. Cards: white, 1px border, ambient shadow.

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
- Buttons: 10 px radius. Primary cobalt, secondary white with a 1px border, ghost text.

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
