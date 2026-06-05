# Project status

Running log of what's done, what's next, and any context a future-you (or contributor) needs to pick the project back up without re-reading the whole git history.

> Update this file at the end of every working session. Keep it short — link out to ADRs / `docs/01-implementation-plan.md` for details.

---

## Where we are on the MVP roadmap

| Stage | Status | Branch |
| --- | --- | --- |
| 0 — Branching | ✅ Merged | master / development |
| 1 — Scaffold + brand tokens + styleguide | ✅ Merged | feature/01-scaffold-and-styleguide |
| 2 — i18n skeleton (ES default, EN at /en/) | ✅ Merged | feature/02-i18n-skeleton |
| 3 — Supabase schema + RLS + 249-country seed | ✅ Merged | feature/03-supabase-schema |
| 4 — Public landing + map (mocked data) | ✅ Merged | feature/04-landing-and-map |
| 4b — Two-color hierarchy map palette refinement | ✅ Merged | feature/04b-map-palette-penguin |
| 5 — Map runs on live Supabase data + dev seed | ✅ Merged | feature/05-real-author-data |
| **6 — Suggestion form + Turnstile + Edge Function** | ✅ Merged | feature/06-suggestion-flow |
| 7 — Owner notification + admin auth + inbox + author CRUD | ⏳ Next | feature/07-admin-area *(may split into 7a/7b)* |
| 8 — Newsletter double-opt-in + Resend audience sync | ⏳ Pending | feature/08-newsletter-confirmation |
| 9 — Deploy to Cloudflare Pages + Supabase heartbeat | ⏳ Pending | feature/09-deploy-and-heartbeat |
| 10 — Launch content + checklist | ⏳ Pending | feature/10-launch-prep |

**About ~55% of MVP shipped by stage count.** Most remaining work is service-wiring (admin UI, email, deploy) — less novel design than what's been done so far.

---

## Last session — 2026-06-04 → 2026-06-05

**Branches landed:** `feature/05-real-author-data`, `feature/06-suggestion-flow` (each via its own PR, both merged to `development`).

### Stage 5 — map on live data

- Added `@supabase/supabase-js` client (`src/lib/supabase.ts`), DB types (`src/types/supabase.ts`, regenerated from the live schema after first hand-crafting).
- `src/lib/authors.ts::getCatalog()` — one query, returns authors grouped by country, fetched at Astro build time and passed to MapSection as a prop. No Supabase JS in the browser bundle.
- `supabase/seeds/dev-authors.sql` — 30 authors across 16 countries mirroring the Stage-4 mock. Idempotent on rerun (deletes `slug like 'dev-%'` first).
- Deleted `src/data/mock-countries.ts`. The map is visually identical to before, just data-driven.

### Stage 6 — public suggestion form

- New routes: `/suggest`, `/en/suggest`, `/gracias`, `/en/thanks`.
- New React island: `src/components/SuggestionForm.tsx`. Renders Turnstile widget via the vanilla CF JS API (no extra dep).
- New helper: `src/lib/countries.ts::getCountries(lang)` — localized dropdown options.
- New Edge Function: `supabase/functions/submit_suggestion/index.ts` — validates body, verifies Turnstile token server-side, inserts with service-role (RLS bypass), optionally upserts a pending subscriber.
- New migration: `supabase/migrations/0002_tighten_submission_rls.sql` — drops anon's direct INSERT on `suggestions` + `subscribers`. The Edge Function is now the only write path.
- i18n: new `suggest.*` namespace in both locales.
- Header nav: `Sugerir / Suggest` link added on landing pages.

### DevX polish

- `supabase/config.toml` — auto-applies `dev-authors.sql` on `db reset`; registers `submit_suggestion` with `verify_jwt = false`.
- `package.json` — new scripts: `dev:db`, `dev:db:reset`, `dev:db:stop`, `dev:functions`, `dev:types`. Onboarding shrank from 10 manual steps to 7.
- `supabase/README.md` — rewritten with the 3-terminal quickstart, updated RLS table, accurate smoke tests.

---

## Project facts worth remembering

- **Production domain:** `mapadeautoras.com` — acquired from Cloudflare Registrar on 2026-06-04. Same vendor as the planned hosting (Cloudflare Pages) and CAPTCHA (Turnstile) — collapses DNS, Resend domain auth (Stage 8), and OG canonical URLs (Stage 10) into one account.
- **Map UX baseline:** the dusty-blue-ocean / penguin-read / oxblood-discovery two-color hierarchy is **owner-approved** as of 2026-05-30 (with the Stage 4b refinement on top). Future style work should be additive, not replace this.
- **Branching convention:** `master` ← `development` ← `feature/NN-slug` (or `NNa`, `NNb` sub-stages). Alejandro commits + pushes + merges manually — Claude never runs `git commit`/`push`/`merge`.
- **Bilingual content debt:** Stage 7 will need to confront how to fill `bio_es` / `bio_en` / `description_es` / `description_en` without doubling the owner's writing time. Tentative plan: LLM-assisted translation button in the admin form (DeepL free tier or GPT-4o-mini). Worth a short ADR (`0004-translation-strategy.md`) before Stage 7 implementation starts.

---

## Open items pending decision before Stage 7 starts

1. **Bilingual content strategy** — write `docs/adr/0004-translation-strategy.md`. Recommendation: LLM-assisted translation in the admin form, owner reviews/edits both versions before save.
2. **`book_links` shape** — the implementation plan flags this; recommendation (b) one link per book per locale.
3. **Stage 7 split** — likely worth doing **7a (notification + auth + read-only inbox)** in one session and **7b (promote + author CRUD + book CRUD)** in the next, given size.
4. **`SUPABASE_SERVICE_ROLE` env var rename** — currently in `.env.example` from Stage 3. Local Edge Function gets the right key (`SUPABASE_SERVICE_ROLE_KEY`) injected automatically. When Stage 7 needs server-side queries from Node/Astro, rename to match the canonical `SUPABASE_SERVICE_ROLE_KEY` and update consumers.

---

## How to resume tomorrow

```sh
git checkout development
git pull
git checkout -b feature/07-admin-area      # or feature/07a-notify-and-auth if pre-splitting

# Local stack — see supabase/README.md for full quickstart
npm run dev:db
npm run dev:db:reset      # one-shot, applies migrations + both seeds
npm run dev:functions     # Edge Functions
npm run dev               # Astro
```

The translation-strategy ADR is the natural opening move for Stage 7. Then magic-link login + the inbox.
