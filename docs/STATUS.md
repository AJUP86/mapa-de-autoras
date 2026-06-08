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
| 7a — Owner notification + admin auth + read-only inbox | ✅ Done | feature/07a-notify-and-auth |
| 7b — Promote suggestion + author CRUD + book CRUD | ⏳ Next | feature/07b-promote-and-crud |
| 8 — Newsletter double-opt-in + Resend audience sync | ⏳ Pending | feature/08-newsletter-confirmation |
| 9 — Deploy to Cloudflare Pages + Supabase heartbeat | ⏳ Pending | feature/09-deploy-and-heartbeat |
| 10 — Launch content + checklist | ⏳ Pending | feature/10-launch-prep |

**About ~60% of MVP shipped by stage count.** Most remaining work is service-wiring (admin UI, email, deploy) — less novel design than what's been done so far.

---

## Last session — 2026-06-05 (Stage 7a)

**Branch in progress:** `feature/07a-notify-and-auth` (not yet merged).

### Notify path

- New migration `0003_notify_owner_trigger.sql` — AFTER INSERT trigger on `public.suggestions` fires `pg_net.http_post` to `notify_owner` asynchronously; failed POSTs do not block inserts.
- New Edge Function `supabase/functions/notify_owner/index.ts` — env-var-toggled: no `RESEND_API_KEY` → logs payload to console (dev); key present → POSTs to Resend using `RESEND_FROM_EMAIL` → `OWNER_NOTIFICATION_EMAIL`.
- `dev:functions` script now runs without an explicit function name, serving all functions registered in `config.toml`.

### Auth shell

- `/admin/login` — magic-link form using `signInWithOtp({ shouldCreateUser: false })`. Local emails land in Mailpit (`http://127.0.0.1:54324`).
- `<AdminGate>` React component — wraps protected admin content; redirects unauthenticated users to `/admin/login`.
- `<AdminLoginForm>` React component — handles OTP request + confirmation feedback.

### Inbox

- `/admin` — lists `pending` suggestions newest-first (authenticated, service-role query).
- `/admin/suggestions/[id]` — static placeholder; promote/reject actions deferred to Stage 7b.

### Config gotchas surfaced

- `auth.email.enable_signup = true` is required for OTP to work at all in GoTrue — even for existing users. `shouldCreateUser: false` blocks net-new signups client-side.
- `site_url` must use `localhost` (not `127.0.0.1`); GoTrue rejects magic-link redirects that don't match exactly.
- `additional_redirect_urls` needs explicit `/admin` paths listed alongside root paths.
- `enabled = true` is **not** a valid key for `[auth.email]` in Supabase CLI v2.102 — omit it entirely.

---

## Project facts worth remembering

- **Production domain:** `mapadeautoras.com` — acquired from Cloudflare Registrar on 2026-06-04. Same vendor as the planned hosting (Cloudflare Pages) and CAPTCHA (Turnstile) — collapses DNS, Resend domain auth (Stage 8), and OG canonical URLs (Stage 10) into one account.
- **Map UX baseline:** the dusty-blue-ocean / penguin-read / oxblood-discovery two-color hierarchy is **owner-approved** as of 2026-05-30 (with the Stage 4b refinement on top). Future style work should be additive, not replace this.
- **Branching convention:** `master` ← `development` ← `feature/NN-slug` (or `NNa`, `NNb` sub-stages). Alejandro commits + pushes + merges manually — Claude never runs `git commit`/`push`/`merge`.
- **Bilingual content debt:** Stage 7 will need to confront how to fill `bio_es` / `bio_en` / `description_es` / `description_en` without doubling the owner's writing time. Tentative plan: LLM-assisted translation button in the admin form (DeepL free tier or GPT-4o-mini). Worth a short ADR (`0004-translation-strategy.md`) before Stage 7 implementation starts.

---

## Open items pending decision before Stage 7b starts

1. **Bilingual content strategy** — still pending; now actively blocking Stage 7b (the author CRUD form needs to handle `bio_es`/`bio_en`/`description_es`/`description_en`). Write `docs/adr/0004-translation-strategy.md`. Recommendation: LLM-assisted translation button in the admin form, owner reviews/edits both versions before save.
2. **`book_links` shape** — the implementation plan flags this; recommendation (b) one link per book per locale.
3. **`/admin/suggestions/[id]` rendering strategy** — the current stub is a static Astro page. Decide whether it stays static (data fetched client-side via Supabase JS) or moves to SSR via the Cloudflare adapter (Stage 9 decision). Moving earlier may be worth it if Stage 7b's promote-form needs server-side data at request time.
4. **`SUPABASE_SERVICE_ROLE` env var rename** — currently in `.env.example` from Stage 3. Local Edge Function gets the right key (`SUPABASE_SERVICE_ROLE_KEY`) injected automatically. When Stage 7b needs server-side queries from Astro, rename to match the canonical name and update consumers.

---

## How to resume tomorrow

```sh
git checkout development
git pull
git checkout -b feature/07b-promote-and-crud

# Local stack — see supabase/README.md for full quickstart
npm run dev:db
npm run dev:db:reset      # one-shot, applies migrations + both seeds
npm run dev:functions     # serves submit_suggestion + notify_owner
npm run dev               # Astro

# Re-bootstrap the admin user (reset wipes auth.users — see supabase/README.md)
```

The translation-strategy ADR (`docs/adr/0004-translation-strategy.md`) is the natural opening move for Stage 7b, then the promote/reject actions on `/admin/suggestions/[id]`.
