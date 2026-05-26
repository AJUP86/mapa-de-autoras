# Implementation plan — staged delivery

> Companion to [00-mvp-plan.md](00-mvp-plan.md). That doc defines **what** we're building; this one defines **how and in what order**.

## Workflow

- **Small, meaningful commits.** Each stage below is one feature branch. Alejandro commits manually; Claude never runs `git commit` / `git push`.
- **Review gate at every stage.** Claude completes a stage, summarizes the diff and verification steps, then **pauses**. Alejandro reviews, requests changes if any, commits when satisfied, then merges to `development`.
- **Stable releases merge to `master`.** Once a coherent slice of stages is on `development` and verified end-to-end, Alejandro merges `development` → `master`. No direct commits to `master` after stage 0.

## Branching strategy

```
master         ← stable, deployable; matches production
   ▲
   │ merge after end-to-end verification
   │
development    ← integration branch; CI runs here
   ▲
   │ merge after stage review
   │
feature/<slug> ← one branch per stage below
```

Branch naming: `feature/01-scaffold-and-styleguide`, `feature/02-i18n-skeleton`, etc. Stage number prefix keeps history readable.

## Definition of "done" for a stage

A stage is reviewable when, on its feature branch:

1. The code compiles / type-checks without warnings.
2. The verification steps in the stage definition pass locally.
3. New or changed surfaces are documented in the appropriate `docs/` file (ADR or plan) and the RAG index is current.
4. Any new env vars are in `.env.example` with a comment.
5. The diff is small enough that Alejandro can read it end-to-end in one sitting.

If a stage grows beyond ~300 changed lines or starts touching unrelated areas, **split it**.

---

## Stage 0 — Branching setup (Alejandro)

**Goal:** establish the branching topology. No code.

**Actions (you run these, not Claude):**

```sh
git checkout master
git pull
git checkout -b development
git push -u origin development
# Optional: set `development` as the default branch in GitHub settings
#   so PRs target it instead of master.
```

**Done when:** `development` exists locally and on origin; `master` untouched.

---

## Stage 1 — Project scaffold + brand tokens + `/styleguide` page

**Branch:** `feature/01-scaffold-and-styleguide`

**Goal:** a runnable Astro project with the brand wired through CSS variables and a visual styleguide page so the palette and type are iterable from day one.

**Build:**
- `pnpm create astro@latest .` — minimal template, TypeScript strict, no template content.
- Add integrations: `@astrojs/react`, `@astrojs/tailwind`, `@astrojs/sitemap`.
- `tailwind.config.mjs` — extend `colors` to reference CSS variables (`ink: 'var(--c-ink)'`, etc.) per [adr/0002 § Token wiring](adr/0002-style-guide.md).
- `src/styles/tokens.css` — `:root { --c-ink: …; --c-parchment: …; … }` for every palette token, plus type-scale variables.
- `src/styles/global.css` — base font-face for Fraunces + Inter via `@fontsource-variable/fraunces` and `@fontsource-variable/inter`; sets body bg `parchment`, text `ink`.
- `src/layouts/Base.astro` — minimal HTML shell, font preconnects, meta tags.
- `src/pages/index.astro` — placeholder hero ("mapa de autoras") referencing the brand.
- `src/pages/styleguide.astro` — **the visual proof**: renders every color token as a labelled swatch with hex and contrast info; renders Fraunces and Inter at all heading sizes + body; shows reference components (button, link, Read/Discovery badges, divider, Penguin spine-band featured card). Mirror the structure of `.work/palette-preview.html` — that file is the design source of truth for Stage 1.
- `.editorconfig`, `.prettierrc`, `.gitignore` additions for `node_modules`, `dist`, `.astro`.
- Root `README.md` "Getting started" filled in.

**Verify:**
1. `pnpm dev` boots; `http://localhost:4321/` renders the placeholder hero on parchment.
2. `http://localhost:4321/styleguide` shows all palette swatches with the right colors.
3. Editing `src/styles/tokens.css` and reloading visibly changes the palette everywhere.
4. `pnpm build` produces a clean `dist/`.

**Pause for review.**

---

## Stage 2 — i18n skeleton (ES default, EN alt)

**Branch:** `feature/02-i18n-skeleton`

**Goal:** bilingual routing and translation lookup, no real content yet.

**Build:**
- `astro.config.mjs` — `i18n: { locales: ['es','en'], defaultLocale: 'es', routing: { prefixDefaultLocale: false } }`.
- `src/i18n/es.json`, `src/i18n/en.json` — small starter catalog (`nav.home`, `nav.suggest`, `hero.headline`, `hero.subhead`).
- `src/i18n/t.ts` — tiny `t(lang, key)` helper.
- `src/pages/index.astro` (es default) + `src/pages/en/index.astro` — both pull from the catalog via `t()`.
- `src/components/LanguageSwitch.astro` — top-right toggle.

**Verify:**
1. `/` shows Spanish content; `/en/` shows English; toggle preserves the current page.
2. Adding a key to both catalogs and referencing it via `t()` works.

**Pause for review.**

---

## Stage 3 — Supabase project + schema + RLS

**Branch:** `feature/03-supabase-schema`

**Goal:** the database exists, with all six tables, RLS, indexes, and the countries seed.

**Build:**
- `supabase init` in `supabase/`.
- `supabase/migrations/0001_init.sql` — all six tables per [adr/0003-data-model.md](adr/0003-data-model.md), including the `authors.status` enum, every index, every RLS policy, and the `is_admin()` helper function.
- `supabase/seed.sql` — seed `countries` from a public ISO 3166-1 list (~250 rows).
- `supabase/README.md` — local dev setup (`supabase start`, env vars, how to reset).
- `.env.example` — `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`.

**Verify:**
1. `supabase start` brings up the local stack.
2. `supabase db reset` applies migrations and seed cleanly.
3. With `anon` JWT: `INSERT` into `suggestions` succeeds; `SELECT` from `suggestions` returns zero rows (RLS).
4. With `authenticated` JWT for a seeded admin user: all tables readable and writable.

**Pause for review.**

---

## Stage 4 — Public landing page + map island (mocked data)

**Branch:** `feature/04-landing-and-map`

**Goal:** the hero feature working end-to-end against mocked data — no Supabase wiring yet.

**Build:**
- Install `@vnedyalk0v/react19-simple-maps` + `topojson-client` + `world-atlas`.
- `src/components/AuthorsMap.tsx` — React island; props per [00-mvp-plan.md § The map](00-mvp-plan.md).
- `src/components/CountryPanel.tsx` — side panel with author list, per-author "Read" / "Discovery" tag.
- `src/components/MapFilter.tsx` — segmented control `All · Read · Discoveries`.
- `src/data/mock-countries.ts` — a handful of countries with author lists for development.
- `src/data/iso-numeric-to-a3.ts` — numeric → alpha-3 lookup table.
- `src/pages/index.astro` — wires hero + map + filter + panel; `client:visible` on the map island.

**Verify:**
1. Map renders all countries; mocked highlighted countries show the right tint.
2. Tap/click a country (desktop + mobile viewport) → side panel opens with the author list.
3. Filter `Read` only highlights read+mixed; `Discoveries` only highlights discovery+mixed; `All` shows everything.
4. Esc / back closes the panel.
5. Lighthouse Performance ≥ 90 on mobile for `/`.

**Pause for review.**

---

## Stage 5 — Connect map to Supabase (real authors data)

**Branch:** `feature/05-real-author-data`

**Goal:** replace the mock with live Supabase reads.

**Build:**
- `src/lib/supabase.ts` — typed `supabase-js` client (anon key).
- Generated TS types from the schema (`supabase gen types typescript`).
- `src/lib/authors.ts` — `getCountryStates()` and `getAuthorsByCountry(iso, filter)`.
- Pre-render country states at build time (Astro `getStaticPaths` or fetch in the page front-matter).
- A few seeded test authors per country in a dev-only `supabase/seeds/dev-authors.sql`.

**Verify:**
1. With dev seed loaded, the map highlights the correct countries with correct tints.
2. Clicking a country shows the seeded authors.
3. Build still passes; static output works.

**Pause for review.**

---

## Stage 6 — Suggestion form + Turnstile + Edge Function

**Branch:** `feature/06-suggestion-flow`

**Goal:** anonymous visitors can submit a suggestion; row lands in `suggestions`.

**Build:**
- `src/pages/suggest.astro` + `src/components/SuggestionForm.tsx` (React island).
- Cloudflare Turnstile widget on the form (use Cloudflare test sitekey in dev).
- `supabase/functions/submit_suggestion/index.ts` — verifies Turnstile token server-side, validates input, inserts into `suggestions`, optionally upserts `subscribers` as `pending` + sends double-opt-in email via Resend.
- `.env.example` additions: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `RESEND_API_KEY`, `OWNER_EMAIL`.
- A success page + an error message UX.

**Verify:**
1. Submit a suggestion (no newsletter opt-in) → row in `suggestions` with `status='pending'`, `turnstile_verified=true`.
2. Submit a suggestion (with newsletter opt-in) → also row in `subscribers` (`status='pending'`); double-opt-in email arrives.
3. Submitting with a bad Turnstile token returns a clean error.

**Pause for review.**

---

## Stage 7 — Owner notification + admin auth + inbox + author CRUD

**Branch:** `feature/07-admin-area`

**Goal:** the owner can log in, see new suggestions, approve/reject, and manage the catalog.

> This is the biggest stage. If it crosses ~300 lines, **split** into `07a-notify-and-auth` and `07b-inbox-and-crud`.

**Build:**
- DB webhook on `suggestions INSERT` → `supabase/functions/notify_owner/index.ts` → Resend email to owner.
- `src/pages/admin/login.astro` — magic-link form.
- `src/pages/admin/index.astro` — inbox of pending suggestions (`<AdminInbox>` island).
- `src/pages/admin/suggestions/[id].astro` — review + promote-to-catalog form (defaults new author to `status='discovery'`).
- `src/pages/admin/authors/*` — list, edit, delete; manage books and `book_links`.
- Decide the open question on `book_links` shape (recommend (b) — one link per book per locale).
- Auth guard via Supabase session on the client; `is_admin()` checked server-side on every write.

**Verify:**
1. Submit a public suggestion → owner inbox receives email within seconds.
2. Owner clicks magic-link from another email → lands on `/admin` logged in.
3. Owner approves suggestion → promote form pre-filled → save → author appears on the public map at the right country with `discovery` tint.
4. Owner edits the author to `status='read'` → tint changes after refresh.

**Pause for review.**

---

## Stage 8 — Newsletter double-opt-in confirmation + Resend audience sync

**Branch:** `feature/08-newsletter-confirmation`

**Goal:** confirmed subscribers reach the Resend audience and are usable for broadcasts.

**Build:**
- `src/pages/confirm.astro` — handles `?token=…` from the double-opt-in email; flips `subscribers.status` to `confirmed`, sets `confirmed_at`.
- Edge function (or post-confirmation hook) that calls Resend Audiences API to add the contact.
- A simple `/admin/subscribers` page: list, manual unsubscribe, manual resync.

**Verify:**
1. Submit suggestion with newsletter opt-in → confirmation email arrives.
2. Click confirm link → DB row flips to `confirmed`; contact present in Resend audience.
3. Manually unsubscribing in admin removes from Resend audience.

**Pause for review.**

---

## Stage 9 — Deploy to Cloudflare Pages + Supabase heartbeat

**Branch:** `feature/09-deploy-and-heartbeat`

**Goal:** production site reachable; free-tier pause neutralised.

**Build:**
- Cloudflare Pages connected to `master`; environment variables configured.
- `.github/workflows/deploy.yml` — optional, if not using Pages auto-deploy.
- `.github/workflows/heartbeat.yml` — weekly cron pinging Supabase RPC `select 1`.
- `supabase/migrations/0002_heartbeat_rpc.sql` — a no-op function the heartbeat calls.
- `docs/30-ops/deploy.md` — runbook (where envs are stored, how to rotate keys, how to roll back).

**Verify:**
1. `master` → Pages build → site live on `*.pages.dev`.
2. Heartbeat workflow runs successfully on schedule.
3. End-to-end Stage-1-through-8 verification passes against production.

**Pause for review.**

---

## Stage 10 — Launch content + checklist

**Branch:** `feature/10-launch-prep`

**Goal:** seed real content and run the launch checklist.

**Build:**
- Seed initial author/book data from the creator.
- About / contact page.
- Open-Graph + Twitter card metadata per locale.
- Favicons (16/32/192/512), web manifest.
- `docs/30-ops/launch-checklist.md` — Lighthouse, accessibility audit, broken-link sweep, mobile QA on real device, email deliverability check (SPF/DKIM/DMARC for Resend).

**Verify:**
1. Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 on `/`, `/en/`, `/suggest`, `/en/suggest`.
2. Real-device test on iOS Safari + Android Chrome.
3. Test suggestion from a real (non-localhost) browser succeeds end-to-end.

**Pause for review. Merge `development` → `master`. Tag `v0.1.0`.** Launch.

---

## What comes after MVP (out of this plan)

Phase 2 candidates from [00-mvp-plan.md § MVP scope vs later](00-mvp-plan.md): Capacitor native wrapper, author detail pages, search, third locale, Plausible analytics, per-book `read` flag if the owner wants the panel to distinguish read vs to-read books per author.

Plan that work as `02-implementation-plan-phase2.md` when MVP ships.
