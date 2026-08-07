# mapa-de-autoras — MVP tech stack & foundations plan

> Date: 2026-05-26 · Status: draft, awaiting approval · Author: planning session with Claude

## Context

Greenfield project (only `README.md`, `LICENSE`, `.gitignore`, empty `.work/` so far). The site is a landing page for a growing content creator whose theme is **female book writers around the world**. The hero feature is an interactive world map: visitors click a country, see the curated list of female authors from that country with their books and links to e-commerce (Amazon, etc.). Visitors can also **suggest** a new author/country pairing; the owner gets notified and approves or rejects from a small admin area. A reCAPTCHA-equivalent and an email opt-in to the newsletter gate the suggestion form.

The site must stay **simple, free-tier, mobile-first**, and remain wrappable as a native app via Capacitor in a later phase (out of MVP scope).

User-confirmed decisions (this session):

- Admin: a simple protected admin web page.
- Languages: **Spanish + English** from day one.
- Map UX: **click-a-country SVG map** (no full pan/zoom tile map).
- Budget: **free tiers only**.

Out of scope for MVP: native wrapper build, multi-admin/RBAC, author analytics, anything beyond ES/EN.

---

## Recommended stack at a glance

| Layer                        | Choice                                                                                                                       | Why                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend framework           | **Astro 5** (static output)                                                                                                  | Ships zero JS by default; map is the only React island; built-in i18n works with `output: 'static'`; clean Capacitor wrap. Next.js App Router would force `output: 'export'` and lose half its value (built-in i18n, ISR, route handlers). |
| UI library on the map island | **React 18 + `@vnedyalk0v/react19-simple-maps` fork** (the original `zcreativelabs/react-simple-maps` is dormant since 2022) | Fork is ESM, TS types, React 19 peer dep. Thin wrapper over d3-geo → easy fallback.                                                                                                                                                        |
| Map data                     | **`world-atlas/countries-110m.json`** (TopoJSON)                                                                             | Underlying Natural Earth data is public domain, commercial use OK. ISO numeric IDs in `geo.id` → map to ISO 3166-1 alpha-3 with a tiny lookup.                                                                                             |
| Styling                      | **Tailwind CSS** + a handful of custom components                                                                            | Astro's first-class Tailwind integration; no heavy component framework needed for this scope.                                                                                                                                              |
| i18n                         | **Astro built-in i18n** (`locales: ["es","en"]`, `defaultLocale: "es"`, prefix routing)                                      | No middleware, no third-party lib.                                                                                                                                                                                                         |
| Backend / DB / Auth          | **Supabase** (Postgres + Auth magic-link + RLS + Edge Functions + Database Webhooks)                                         | Free tier covers this easily. RLS makes the public/private split trivial.                                                                                                                                                                  |
| Bot protection               | **Cloudflare Turnstile**                                                                                                     | Unlimited free; no tracking cookies (GDPR-friendly for ES/EN audiences); reCAPTCHA v3 free tier was cut to 10k/mo in 2024 and is Google-tracking.                                                                                          |
| Email — transactional        | **Resend** (free tier: 3 000 emails/mo, 100/day, 1 domain)                                                                   | Best DX, cleanest API; powers owner-notification and double-opt-in confirmation.                                                                                                                                                           |
| Email — newsletter           | **Resend Broadcasts** (free: 1 000 contacts, unlimited sends)                                                                | One vendor for both flows. Subscribers live in Supabase, confirmed contacts sync to a Resend audience.                                                                                                                                     |
| Frontend hosting             | **Cloudflare Pages** (or Netlify) free tier                                                                                  | Astro static output deploys cleanly; no Vercel lock-in pressure.                                                                                                                                                                           |
| Liveness                     | **Weekly GitHub Actions cron** that pings Supabase                                                                           | Free Supabase projects pause after 7 days of DB inactivity; the heartbeat prevents that during launch.                                                                                                                                     |
| Future native wrapper        | **Capacitor** wrapping the static `dist/`                                                                                    | Astro static output is a near-perfect fit; community PoC: [somenoe/astro-capacitor-poc](https://github.com/somenoe/astro-capacitor-poc).                                                                                                   |

---

## Architecture overview

```
                ┌──────────────────────────────────────────┐
                │  Cloudflare Pages (static Astro output)  │
                │  /          /es/...   /en/...   /admin   │
                │  ─ HTML/CSS, one React island = AuthorsMap
                │  ─ One React island = AdminPanel (auth-gated)
                └────────────┬──────────────┬──────────────┘
                             │              │
              public reads   │              │ authed admin writes
                             ▼              ▼
                ┌──────────────────────────────────────────┐
                │              Supabase (free)             │
                │  Postgres + Row-Level Security           │
                │  Auth (magic-link, single admin user)    │
                │  Edge Function: notify_owner             │
                │  DB Webhook on suggestions INSERT  ──────┼──► Resend (transactional)
                └────────────┬─────────────────────────────┘                │
                             │                                              │
        public form POST ◄───┘                                              │
                                                                            ▼
                                                                   owner inbox email
```

Two protected client paths:

- `/admin/login` → magic-link via Supabase Auth.
- `/admin/...` → Astro page renders an empty shell + a React island that calls Supabase with the session.

Everything else is fully static + SEO-indexable.

---

## Data model (initial sketch)

Six tables, all in one Supabase schema. Names in English to keep code clean; UI strings localized separately.

- **`countries`** — seeded reference table (`iso_a3` PK, `iso_numeric`, `name_en`, `name_es`, optional `display_label`). Used to validate country selection and for fallbacks when the map dataset disagrees with display names.
- **`authors`** — `id`, `name`, `slug`, `country_iso_a3` FK, `bio_en`, `bio_es`, `photo_url`, `birth_year`, `death_year` nullable, `status` enum (`read` | `discovery`) default `discovery`, `created_at`, `published` boolean. `status` drives the map filter (Read vs Discoveries).
- **`books`** — `id`, `author_id` FK, `title`, `original_language`, `year`, `cover_url`, `description_en`, `description_es`, `display_order`.
- **`book_links`** — `id`, `book_id` FK, `retailer` (enum: `amazon`, `bookshop`, `kobo`, `other`), `locale` (e.g. `es`, `en`, `es-AR`), `url`, `affiliate_tag` nullable. Decouples e-commerce links so we can add retailers without schema churn.
- **`suggestions`** — `id`, `submitter_email`, `submitter_name` nullable, `proposed_author_name`, `proposed_country_iso_a3`, `proposed_books_text` (free text — we curate before adding), `note`, `status` (`pending` | `approved` | `rejected`), `turnstile_verified` boolean, `accepted_newsletter` boolean, `created_at`, `reviewed_at`, `reviewer_notes`.
- **`subscribers`** — `id`, `email` unique, `status` (`pending` | `confirmed` | `unsubscribed`), `locale`, `confirm_token`, `created_at`, `confirmed_at`. Self-rolled double-opt-in; confirmed emails are mirrored to a Resend audience.

**RLS policies (prose):**

- `anon` role: can `INSERT` into `suggestions` (with `status = 'pending'` enforced by CHECK constraint) and `INSERT` into `subscribers` (with `status = 'pending'`); no `SELECT` on either. Can `SELECT` on `countries`, `authors WHERE published`, `books`, `book_links`.
- `authenticated` role (the owner): full CRUD on everything; `SELECT/UPDATE` on `suggestions` gated by an `admins` table or a hardcoded UID check.

---

## Style guide direction — "Literary Salon"

Designed to feel **warm, intelligent, sophisticated** — a curated bookshelf, not a corporate site, not a stereotype-pink "for women" site.

**Color palette** — defined once in `src/styles/tokens.css` as CSS variables; Tailwind aliases (`bg-parchment`, `text-ink`, `fill-oxblood`) reference them via `var(--c-*)`. Changing the brand is a **one-file edit**. A `/styleguide` route (built in Stage 1) shows every token live for visual iteration.

| Token                      | Hex             | Use                                                                                                                           |
| -------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ink` (primary text)       | `#1B2A41`       | Body text, headings on light bg                                                                                               |
| `parchment` (background)   | `#F5EFE6`       | Page background, cards                                                                                                        |
| `bone` (surface)           | `#FAF6EE`       | Elevated surface vs `parchment`                                                                                               |
| `oxblood` (primary brand)  | `#7A1F2E`       | CTAs, "read" country fill, link accents                                                                                       |
| `oxblood-2`                | `#9C3A47`       | "Mixed" country fill (read + discoveries)                                                                                     |
| `oxblood-3`                | `#C97F87`       | "Discoveries only" country fill                                                                                               |
| `ochre` (secondary)        | `#C68B3C`       | Link underlines, subtle highlights                                                                                            |
| `penguin` (vintage accent) | `#E87722`       | Discovery badge · Featured / spine-band cards (classic Penguin paperback orange — used sparingly, never on map fills or CTAs) |
| `sage` (tertiary)          | `#7A9B82`       | Successful/confirmed states, subtle dividers                                                                                  |
| `shadow`                   | `#1B2A41 @ 10%` | Soft shadows                                                                                                                  |

This pairs warm cream + ink for readability, a wine/oxblood as the brand anchor (book-binding gravitas), with ochre and sage as complementary accents. Passes WCAG AA contrast in the obvious combinations (`ink` on `parchment` ≈ 11:1; `parchment` on `oxblood` ≈ 7:1). Full token detail and the map filter highlight scale: [adr/0002-style-guide.md](adr/0002-style-guide.md).

**Typography (Google Fonts, both OFL, both cover Spanish diacritics):**

- **Display / headings:** **Fraunces** — variable serif with personality, modern but literary.
- **Body / UI:** **Inter** — humanist sans-serif, exceptional mobile legibility, broad weights.

Heading scale `1.250` (major third); base body `16px` mobile / `17px` desktop.

**Tone & motion:**

- Soft, slow transitions (250–400 ms) for country hover/select.
- Subtle paper-grain texture (SVG noise overlay at ~3% opacity) on `parchment` — optional, can be cut for perf.
- No emoji-heavy UI; small Lucide-style icons.

---

## The map — implementation plan

1. **Component:** `<AuthorsMap onSelect={(isoA3) => …} selected={isoA3 | null} countryStates={Map<isoA3, 'read' | 'mixed' | 'discovery' | 'empty'>} filter={'all' | 'read' | 'discoveries'} />` — pure React island, no Supabase calls inside.
2. **Filter UX:** segmented control above the map — **All · Read · Discoveries** (default `All`). Switching the filter updates which countries highlight and which authors appear in the side panel. The country state is precomputed once per page load: `read` (only read authors), `discovery` (only discoveries), `mixed` (both), `empty` (neither).
3. **Data source:** `world-atlas/countries-110m.json`, loaded once on mount (≈100 KB). Numeric IDs → alpha-3 via a small JSON map generated at build time from the `countries` table seed.
4. **Behaviour:** countries fill according to `countryStates` + active filter (three oxblood tints — see [adr/0002-style-guide.md § Map highlight scale](adr/0002-style-guide.md)). Tap/click → `onSelect(isoA3)` → parent slides in a side panel listing the country's authors, each tagged "Read" or "Discovery". Esc/back closes it.
5. **Mobile:** `touch-action: manipulation` on the SVG to prevent iOS double-tap zoom; no `ZoomableGroup` in MVP (tap-to-select is enough; avoids accidental pan). Filter sits as a sticky segmented control above the map.
6. **Russia / large countries:** the brief says "zoomed to country (or a big part of a country)". MVP does not pan/zoom the map itself — it just highlights and opens the author panel. The "feels zoomed" effect comes from the panel filling the screen on mobile and a side-sheet on desktop, with the country name + flag big at the top.
7. **Fallback plan if the fork stalls:** swap the island internals to ~80 LOC of `d3-geo` + `topojson-client` directly (`geoMercator` / `geoNaturalEarth1` + `geoPath` → `<path>` elements). The `<AuthorsMap>` props contract stays identical.

---

## Suggestion + admin workflow

**Public form (`/suggest`)** — fields: country (select, populated from `countries`), author name, books (free text), submitter email, submitter name (optional), newsletter opt-in checkbox, Turnstile widget.

Submit flow:

1. Astro form posts to a tiny Supabase Edge Function `submit_suggestion`.
2. Function verifies the Turnstile token server-side (`POST challenges.cloudflare.com/turnstile/v0/siteverify`, single-use, 300 s expiry).
3. If newsletter opt-in: upserts into `subscribers` as `pending`, sends a double-opt-in email via Resend with a signed confirm link.
4. Inserts the row into `suggestions` (RLS allows anonymous insert).
5. A **Postgres Database Webhook** on `suggestions INSERT` POSTs to a second Edge Function `notify_owner` that emails the owner via Resend (one-click links into `/admin/suggestions/:id`).

**Admin (`/admin`)** — magic-link login (Supabase Auth, email allowlist). Pages:

- `Inbox` — list of `pending` suggestions, approve/reject buttons. Approving opens a "promote to catalog" form pre-filled with the suggestion data so the owner can clean up the author name, add a slug, paste a photo URL, etc. New authors default to `status = 'discovery'`; the owner flips to `'read'` only when she has actually read at least one of the books.
- `Authors` — table with inline edit, "Add author" button, drag-reorder books per author.
- `Subscribers` — list + manual unsubscribe / resync to Resend audience.

All admin pages are a single React island per route; they call `supabase-js` directly with the session token. No custom backend code beyond the two Edge Functions above.

---

## Free-tier risks & mitigations

- **Supabase 7-day pause.** Add a GitHub Actions workflow (`.github/workflows/heartbeat.yml`) that runs weekly and `curl`s a public `select 1` endpoint or a no-op RPC. Removes the risk entirely.
- **Resend 100/day cap.** Owner-notifications + double-opt-in confirmations are well under this. If newsletter sends ever approach the cap, batch broadcasts (Resend Broadcasts has no per-day cap on broadcast sends themselves).
- **Turnstile widget limit (20 per account).** Trivial here — one widget.
- **Cloudflare Pages build minutes / bandwidth.** 500 builds/mo and unmetered bandwidth on free tier; not a concern.

---

## Documentation conventions

Decisions live in `docs/` (committed); scratch in `.work/` (gitignored). See [../README.md § Documentation conventions](../README.md). The detail behind each major choice in this plan lives in a dedicated ADR under `docs/adr/`.

---

## MVP scope vs later

**MVP (this plan):** static landing page, ES/EN, world map with click-to-open authors panel, suggestion form with Turnstile + double-opt-in newsletter, admin inbox + author CRUD, owner email notifications.

**Phase 2 (post-MVP):** Capacitor wrapper for iOS/Android, author detail pages with deeper bios, book cover storage in Supabase Storage, search, "discover similar authors", optional translation workflow (third locale), light analytics (Plausible free tier).

---

## Critical files to create (when implementation begins)

> _Reference only — no code yet._

- `package.json`, `astro.config.mjs` — Astro 5, integrations: `@astrojs/react`, `@astrojs/tailwind`, `@astrojs/sitemap`.
- `tailwind.config.mjs` — palette tokens + Fraunces/Inter font families.
- `src/i18n/{es,en}.json` — UI string catalogs.
- `src/pages/index.astro`, `src/pages/[lang]/index.astro` — bilingual landing.
- `src/components/AuthorsMap.tsx` — React island; props per "the map" section.
- `src/components/CountryPanel.tsx` — author list side-sheet.
- `src/pages/suggest.astro` + `src/components/SuggestionForm.tsx` — form + Turnstile.
- `src/pages/admin/*.astro` + `src/components/admin/*.tsx` — admin SPA islands.
- `supabase/migrations/0001_init.sql` — schema + RLS policies.
- `supabase/functions/submit_suggestion/index.ts` — Turnstile verify + inserts.
- `supabase/functions/notify_owner/index.ts` — Resend send on DB webhook.
- `.github/workflows/heartbeat.yml` — weekly Supabase ping.
- `.env.example` — `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `RESEND_API_KEY`, `OWNER_EMAIL`.

---

## Verification plan (when we get to implementation)

End-to-end happy path the implementation must demonstrate before MVP is "done":

1. `pnpm dev` boots; `/`, `/en`, `/es` render bilingual landing with map.
2. Click a country on mobile-sized viewport → side panel slides in with authors.
3. Submit a suggestion with a fake Turnstile sitekey (Cloudflare provides test keys) and a real email → suggestion appears in `pending`; owner receives email; double-opt-in email arrives.
4. Confirm subscription via the email link → `subscribers.status = 'confirmed'`; contact present in Resend audience.
5. Admin logs in via magic link → sees suggestion in inbox → approves and promotes to catalog → author appears on the public map's country panel after refresh.
6. Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 on `/es` and `/en`.
7. Heartbeat workflow runs once successfully against the staging project.

---

## Open questions

- **E-commerce link strategy.** Three options for `book_links`: (a) one link per book, locale-agnostic; (b) one link per book per locale (ES audience → amazon.es, EN → amazon.com); (c) multiple retailers per book per locale (Amazon + Bookshop / Casa del Libro). Schema already supports (c). Recommendation: **(b)** for MVP. Decide before Stage 7 (admin author/book CRUD).
