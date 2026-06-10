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
| 7a — Owner notification + admin auth + read-only inbox | ✅ Merged | feature/07a-notify-and-auth |
| 7b-i — Promote suggestion + currently_reading + translate + unified admin UX | ✅ Done | feature/07b-promote-and-crud |
| 7b-ii — CRUD on existing authors (edit, add more books, delete) | ⏳ Next | feature/07b-ii-author-crud |
| 8 — Newsletter double-opt-in + Resend audience sync | ⏳ Pending | feature/08-newsletter-confirmation |
| 9 — Deploy to Cloudflare Pages + Supabase heartbeat | ⏳ Pending | feature/09-deploy-and-heartbeat |
| 10 — Launch content + checklist | ⏳ Pending | feature/10-launch-prep |

**About ~70% of MVP shipped by stage count.** Remaining work is mostly service-wiring (author CRUD, newsletter, deploy).

---

## Last session — 2026-06-10 (Stage 7b-i)

**Branch in progress:** `feature/07b-promote-and-crud` (six commits, not yet merged).

### DB
- Migration `0004_promote_prep.sql`: `unaccent` extension, `public.slugify(text)` helper, `author_status` enum extended with `currently_reading`.
- Migration `0005_promote_suggestion_rpc.sql`: atomic `promote_suggestion(p_suggestion_id uuid, p_author jsonb, p_books jsonb[]) returns uuid`. `SECURITY DEFINER` + `is_admin()` gate. Server-generates the slug as `slugify(name) || '-' || lower(iso_a3)` with collision-suffix fallback. Duplicate guard by `(lower(name), country_iso_a3)`. When `p_suggestion_id` non-null, flips the suggestion to `approved` + sets `reviewed_at` + `reviewer_notes`.
- ADR `docs/adr/0004-translation-strategy.md` accepted — DeepL via admin-only Edge Function, owner reviews before save.

### Map state model
- Third state `currently_reading` (sage `#7a9b82`) added alongside read (penguin) and discovery (oxblood).
- Filter row went from 3 → 4 buttons: `Todas / Sugerencias / Leyendo / Leídas`.
- Semantic CSS aliases (`--c-state-read`, `--c-state-currently-reading`, `--c-state-discovery`) in `tokens.css` so palette swaps later are one-line edits.
- i18n label rename only — "Descubrimientos" → "Sugerencias" in ES (`Discoveries` → `Suggestions` in EN). DB enum stays `discovery`.

### Admin UX
- Route restructure: `/admin` is now the login form, `/admin/inbox` is the list, `/admin/promote` is the form.
- `<AdminAwareNav>` island mounted in `Base.astro` renders public nav for anon, admin nav for authenticated admin (3 icons + tooltip + pending-count badge, 60s polling).
- Skeleton placeholder during the ~150ms session check — no content flicker.
- `<SuggestionReview>` page replaces the 7a placeholder: Promotar + Rechazar buttons; Rechazar uses an inline reason textarea + plain PostgREST update.

### Promote
- `<PromoteForm>` handles both entry points — from suggestion (prefilled, suggestion context column on the left, reviewer notes) or from scratch (`+ Añadir` icon in admin nav, empty form).
- Atomic save via `promote_suggestion()` RPC; redirects to `/admin/inbox` (suggestion mode) or `/` (scratch mode).
- Country dropdown loads from `public.countries` via a new `getCountriesBilingual()` helper (the Stage 6 `getCountries(lang)` stayed intact).

### Translation
- `supabase/functions/translate/index.ts` — admin-only DeepL proxy. `verify_jwt = true` plus a defence-in-depth `app_metadata.role === 'admin'` check inside the handler.
- `<TranslateButton>` per bilingual field pair (bio + book description) with confirm modal when the target field is non-empty.
- `.env.example` adds `DEEPL_API_KEY` (free tier, 500k chars/month).

### Gotchas surfaced
- `dev:functions` reads `--env-file .env` only at startup; restart needed after adding env vars.
- PowerShell + `curl.exe` mangles single-quoted JSON bodies → use `Invoke-RestMethod` or file-based `--data-binary "@body.json"`.
- Vite's `node_modules/.vite/deps/` cache can go stale across long dev sessions or after `dev:types` regen → fix with `Remove-Item -Recurse -Force node_modules\.vite` + restart `npm run dev`. Production unaffected (Vite produces static hashed bundles).
- Supabase TS generator emits `p_suggestion_id: string` (non-nullable) for the RPC even though Postgres accepts null — `promote.ts` uses a `as unknown as string` cast as workaround. Cleaner fix is `default null` in the migration; revisit if it becomes a pattern.

### Out of scope (lives in 7b-ii)
- Edit existing author (bio, dates, photo, status, published).
- Add more books to an existing author (post-promotion).
- Edit existing books and `book_links`.
- Delete actions (with confirmation modal).

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
- **Map UX baseline:** dusty-blue ocean + three-color state hierarchy — penguin (read), sage (currently_reading), oxblood (discovery). The original two-color hierarchy was owner-approved 2026-05-30; the sage third state was added in Stage 7b-i (2026-06-10) and **needs owner review before merging 7b-i**.
- **Branching convention:** `master` ← `development` ← `feature/NN-slug` (or `NNa`, `NNb` sub-stages). Alejandro commits + pushes + merges manually — Claude never runs `git commit`/`push`/`merge`.
- **Bilingual content:** Resolved by [ADR 0004](adr/0004-translation-strategy.md). DeepL via admin-only Edge Function at `/functions/v1/translate`; owner reviews/edits both versions before save. Free-tier headroom ~12× MVP volume.

---

## Open items pending decision before Stage 7b-ii starts

1. **`book_links` shape** — the implementation plan flags this; recommendation (b) one link per book per locale. Decision needs to land before 7b-ii's "edit book links" UI.
2. **`SUPABASE_SERVICE_ROLE` env var rename** — currently in `.env.example` from Stage 3. Local Edge Function gets the right key (`SUPABASE_SERVICE_ROLE_KEY`) injected automatically. If 7b-ii needs server-side queries from Astro, rename to match the canonical name and update consumers.
3. **Icon library** — 7b-i used 3 inline SVGs (inbox / plus / logout). 7b-ii will add at least edit / delete / save icons. Consider adding `lucide-react` if inline SVGs become painful (~5+ icons).
4. **Owner review of the three-color map** — the sage `currently_reading` state evolves the owner-approved two-color baseline. Quick visual review with the project owner before merging 7b-i to `master`.

---

## How to resume tomorrow

```sh
# After merging feature/07b-promote-and-crud into development:
git checkout development
git pull
git checkout -b feature/07b-ii-author-crud

# Local stack — see supabase/README.md for full quickstart
npm run dev:db
npm run dev:db:reset      # one-shot, applies migrations + both seeds
npm run dev:functions     # serves submit_suggestion + notify_owner + translate
npm run dev               # Astro

# Re-bootstrap the admin user (reset wipes auth.users — see supabase/README.md)
# Add DEEPL_API_KEY to .env if not already set (free tier: https://www.deepl.com/pro-api)
```

Stage 7b-ii adds author + book CRUD on existing rows (edit, add-books-to-existing, delete) on top of the promote flow shipped in 7b-i. Decide the `book_links` shape (recommendation (b) per the implementation plan) before touching that table.
