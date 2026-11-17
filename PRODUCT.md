# Vortaly — product context

Durable context for design work. What is decided lives here; how it looks lives
in DESIGN.md (not written yet). Updated 2026-11-18.

## What it is

Vortaly is an AI app builder for small businesses in Uzbekistan, an Uzbek
answer to Lovable and Bolt. A business owner describes the business in plain
words, signs in with Telegram, and AI builds a website and Telegram Mini App
with services, prices and online booking, in Russian and Uzbek. The owner
reviews the draft in a builder and presses Publish; from then on anyone with
the link can open the site and book.

Today the builder fills one proven app (business page + booking) with
AI-written content, rather than generating code. Code generation, Lovable
style, is a later stage, once revenue can pay for strong models.

## Who uses it

- **Business owners** (primary). Beauty salons, barbershops, cafes, car
  washes, training centres, workshops. Not technical. Phone first, Telegram
  every day, little patience for setup. They must get a working result before
  being asked for anything (no API key, no payment, no password up front).
- **Their customers.** Open the business's site, usually inside Telegram on a
  phone, choose a service and a time, leave name and phone. Done in a minute.
- **The platform operator** (Vortaly team). Creates businesses, invites
  owners, watches provisioning. Desktop, internal.

## Surfaces and modes

| Surface | Route | Who | Mode |
| --- | --- | --- | --- |
| Start: describe the business, sign in, get an app | `/start` | owner | Persuade |
| Business site and booking | `/<slug>` | customer | Operate |
| Builder: AI chat, content editor, live preview, publish, share | `/builder/<slug>` | owner, operator | Operate |
| Owner home and bookings | `/owner`, `/owner/bookings` | owner | Operate |
| Operator console | `/` | operator | Operate |
| Demo admin panel | `/admin` | operator | Operate |

`/start` is the product's front door and should become the public home; `/` is
still the operator console until then.

## Platform and constraints

- Web, Next.js 16 App Router, React 19, Tailwind CSS 4. Deployed on Vercel at a
  `*.vercel.app` address; businesses open by path (`/<slug>`). Own domain
  (`vortaly.com`) later.
- Customer surfaces run inside Telegram as a Mini App: phone width
  375–460 px, Telegram's own header above, haptics available, no hover.
- Two languages everywhere: Russian and Uzbek in Latin script (oʻ, gʻ).
  Uzbek strings run longer; layouts must leave room.
- Light and dark mode, following the system.
- Business sites take one of six AI-chosen themes: turquoise, pomegranate,
  saffron, petrol, plum, graphite. Customer UI must hold up in all six.
- Owners are on mid-range Android phones and mobile data: keep pages light.
- Accessibility: readable sizes on phones, visible focus, tap targets ≥ 44 px,
  respect reduced motion.

## Brand and voice

- Trustworthy, calm, local. A tool a salon owner in Chilanzar trusts with
  their customers, not a startup toy.
- Visual identity so far: Uzbek majolica. Porcelain backgrounds, oxidised
  copper ink, Samarkand turquoise as the main accent, pomegranate and saffron
  as secondaries; the time grid reads as a wall of glazed tiles. Fonts:
  Unbounded for display, Manrope for UI, both with Cyrillic.
- Copy is plain and specific, in the owner's language, no jargon ("ключ ИИ" is
  explained where it appears). Say what happened and what to do next.
- Honest: never claim what is not true. Sites never invent reviews, ratings,
  experience or guarantees (enforced in code). The UI never presents demo or
  unsaved data as real.

## Non-negotiables

- First result before any ask: the owner sees their app before signing in is
  required to keep it, and before any key or payment.
- Customers see only published content; drafts stay in the builder.
- Booking is the core action and must be fast and impossible to get wrong
  (no double bookings, clear free/taken/selected states).

## Anti-references

- Generic SaaS dashboards and template landing pages that could belong to any
  product anywhere.
- Western-startup gloss that reads as foreign or expensive to a local owner.
- Kitsch "oriental" decoration: ornament stays restrained (a thin tile
  stripe, a glaze sheen), never wallpaper.

## Open questions

- Pricing and the paid plan (no-key AI, payments) are not designed yet.
- Whether the operator console keeps the majolica look or becomes a plain
  internal tool.
- A professional redesign is being prepared in Google Stitch; when it lands it
  may replace parts of the visual identity above, and DESIGN.md should be
  written from the result.
