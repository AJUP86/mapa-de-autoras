# ADR 0002 — Style guide: "Literary Salon"

- **Status:** Accepted
- **Date:** 2026-05-26
- **Supersedes:** —

## Context

The brand needs to appeal to readers of literary fiction who are curious about female authors across cultures. Two anti-patterns to avoid: (1) **corporate / SaaS-flat** (cold, generic, "tech-startup"); (2) **stereotype-pink "for women"** (kitsch, dated, narrows the audience). The right tone is **warm, intelligent, sophisticated** — a curated bookshelf or a literary magazine, not a marketing landing page.

The palette must also work in dense reading contexts (author bios, book descriptions) without fatigue, and must hold up on mobile in bright light.

## Decision

### Color palette

| Token | Hex | Use |
| --- | --- | --- |
| `ink` | `#1B2A41` | Primary text; headings on light bg |
| `parchment` | `#F5EFE6` | Page background |
| `bone` | `#FAF6EE` | Elevated surfaces (cards, panels) |
| `oxblood` | `#7A1F2E` | Brand anchor — CTAs, link accents, "read" countries |
| `oxblood-2` | `#9C3A47` | Mid-tint — "mixed" countries (both read + discoveries) |
| `oxblood-3` | `#C97F87` | Light tint — "discoveries only" countries |
| `ochre` | `#C68B3C` | Link underlines, subtle highlights |
| `penguin` | `#E87722` | Discovery badges, "Featured" / "Editor's pick" spine bands, vintage-book accents |
| `sage` | `#7A9B82` | Confirmed/success states, subtle dividers |
| `shadow` | `#1B2A41 @ 10%` | Soft elevation |

The `penguin` token references the classic 1935 Penguin paperback orange and gives the brand its strongest "this is a books site" signal. **Use sparingly** — one accent per surface at most. Reserved roles:

- **Discovery badge** background (replaces the previous ochre badge — penguin reads more like a book sticker).
- **Spine-band** strip across the top of a "Featured", "Editor's pick", "Penguin Classics edition", or "Translated to español" card. Mimics the iconic Penguin paperback spine.
- **Not** allowed on map fills (the three oxblood tints already encode the read/mixed/discovery legend — adding orange would muddy it).
- **Not** allowed on primary CTAs (`oxblood` keeps that role so buttons feel grounded).

Contrast: `parchment` on `penguin` ≈ 4.0 : 1 — passes AA-large only. Use white/`parchment` text on penguin only at ≥ 14 pt bold or ≥ 18 pt regular; otherwise prefer `ink` on `penguin` (≈ 5.5 : 1, passes AA-normal).

Reference contrast checks (WCAG AA):
- `ink` on `parchment` ≈ 11 : 1 (body text — passes AAA)
- `parchment` on `oxblood` ≈ 7 : 1 (button text — passes AA-large and AA-normal)
- `ink` on `bone` ≈ 12 : 1 (passes AAA)

### Token wiring — palette must be easy to change

Using **Tailwind 4** with CSS-first configuration. No `tailwind.config.mjs` — the `@theme` block in CSS *is* the theme, which dovetails with the CSS-variable approach. Editing one file repaints the site.

```
src/styles/tokens.css         ← single source of truth (CSS variables)
   :root { --c-ink: #1B2A41; --c-parchment: #F5EFE6; ... }

src/styles/global.css         ← imports tokens + Tailwind theme aliases
   @import "tailwindcss";
   @import "./tokens.css";
   @theme {
     --color-ink:       var(--c-ink);
     --color-parchment: var(--c-parchment);
     --font-display:    var(--font-display);
     ...
   }
```

Consumers always use Tailwind utility classes (`bg-parchment`, `text-ink`, `font-display`) — never hard-coded hexes. The same indirection enables a future dark mode (`:root.dark { --c-parchment: ...; }`) without touching component code.

A live `/styleguide` route renders every token as a swatch, plus the type scale and reference components (badges, buttons, Penguin spine band). It's the visual confirmation that "the palette looks right" — built in Stage 1 so the brand is iterable from day one.

**Why Tailwind 4 over the legacy `@astrojs/tailwind` integration (Tailwind 3):** `@astrojs/tailwind` is deprecated; Tailwind 4 ships via `@tailwindcss/vite` and is the current default in Astro 5.2+. The CSS-first config also means there's no JS theme file to keep in sync with the CSS variables — Tailwind reads them directly.

### Map highlight scale

The map filter (`All` / `Read` / `Discoveries`) uses three tints of `oxblood`:

| Country state | Fill | When |
| --- | --- | --- |
| Read-only | `oxblood` (#7A1F2E) | Country has only read authors |
| Mixed | `oxblood-2` (#9C3A47) | Country has both read + discovery authors |
| Discoveries-only | `oxblood-3` (#C97F87) | Country has only discoveries |
| Empty | `parchment` (#F5EFE6) | No authors yet |

In `Read` filter mode, only read-only and mixed countries are highlighted (others fade to `parchment`). In `Discoveries` mode, only discoveries-only and mixed. In `All` (default) all three tints are visible.

### Typography

Both fonts: **Google Fonts, Open Font License**, cover Spanish diacritics.

- **Display / headings:** **Fraunces** — variable serif with personality (optical-size + soft/wonky axes). Use for site title, country names, hero copy.
- **Body / UI:** **Inter** — humanist sans-serif, optimised for screens, exceptional mobile legibility, broad weight range.

Type scale: `1.250` ratio (major third). Base body `16 px` on mobile, `17 px` on desktop.

### Motion & texture

- Soft transitions on hover/select: `250–400 ms` ease-out.
- Optional subtle paper-grain texture (SVG noise overlay at ~3 % opacity) on `parchment` — cut if it hurts Lighthouse Performance.
- Icons: thin-stroke Lucide set. No emoji in UI chrome.

## Alternatives considered

- **Saturated jewel palette (emerald + magenta + gold).** Too maximalist for long-form reading.
- **Mono-tone / Notion-style neutrals.** Too cold; fails the "literary warmth" test.
- **Stereotype pink/lavender palette.** Narrows audience, dated.
- **System fonts only (no Google Fonts).** Faster, but Fraunces's character is part of the brand identity — worth the ~30 KB.

## Consequences

**Positive**
- Strong, ownable visual identity that maps directly to the subject matter.
- Excellent reading contrast in body copy and admin tables.
- Tailwind tokens (`bg-parchment`, `text-ink`, `bg-oxblood`) keep the palette discoverable in code.

**Negative / risks**
- Two webfonts add ~30–60 KB. Mitigate with `font-display: swap`, `preconnect` to fonts.googleapis.com, and subset to Latin Extended.
- Oxblood + parchment is a strong combo that will look dated if used carelessly — design system review at the wireframe stage before committing components.
- Three map tints look very similar at small zoom; verify legibility on mobile before shipping. If indistinguishable, fall back to two tints (`oxblood` for "has any read author", `oxblood-3` for "discoveries only") and drop the mixed state.

## References

- [docs/00-mvp-plan.md § Style guide direction](../00-mvp-plan.md)
- [Fraunces](https://fonts.google.com/specimen/Fraunces)
- [Inter](https://fonts.google.com/specimen/Inter)
