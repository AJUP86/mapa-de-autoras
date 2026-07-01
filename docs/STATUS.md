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
| 9a — Staging deployment (Cloudflare Pages + Supabase staging) | ✅ Done | feature/09a-staging-deploy |
| 9a-ii — Realtime map data (client-side fetch + Supabase Realtime) | ✅ Done | feature/09a-ii-realtime-map |
| 9b — Production deployment (apex + www + Resend) | ⏳ Pending | feature/09b-production-deploy |
| 10 — Launch content + checklist | ⏳ Pending | feature/10-launch-prep |

**About ~77% of MVP shipped by stage count.** Remaining work: author CRUD (7b-ii), newsletter (8), production deploy (9b), launch prep (10).

---

## Last session — 2026-07-01 (Stage 9a-ii — realtime map data)

**Branch in progress:** `feature/09a-ii-realtime-map` (not yet merged).

### Architecture flip
- Public map data flow changed from Astro build-time fetch to client-side fetch + Supabase Realtime subscription with granular patching. See [ADR 0005](adr/0005-realtime-map-data.md).
- `<MapSection>` now owns the catalog: fetches on mount, subscribes to `postgres_changes` on `public.authors` + `public.books`, patches local state in place (reducers in `src/lib/realtime-reducers.ts`), resyncs via `getCatalog()` on reconnect.
- `src/pages/index.astro` + `src/pages/en/index.astro` no longer call `getCatalog()` at build time — the build is data-independent (no more `[authors] getCatalog() failed` noise when local Supabase is off).

### Migrations
- `0008_realtime_authors.sql` — add `authors` + `books` to the `supabase_realtime` publication.
- `0009_iso_columns_to_text.sql` — **bug fix.** Supabase Realtime truncates `char(3)`/`bpchar` columns to one character in `postgres_changes` payloads, so `country_iso_a3` arrived as `"A"` not `"AUS"` and live-promoted authors never matched a map country (REST/`getCatalog` decoded correctly, so only reloads worked). Converted the three ISO columns to `text`. Confirmed with an anon Realtime probe.

### Tests (first in the repo)
- Added Vitest. `src/lib/map-state.test.ts` (13) + `src/lib/realtime-reducers.test.ts` (15) = **28 passing**. Scripts: `npm test`, `npm run test:watch`.

### Env / local
- `supabase/config.toml` `[db].major_version` 15 → 17. The Supabase CLI (≥ 2.102) initialises local volumes with PG 17.x; a leftover PG15 volume made `supabase start` crash-loop. Fix: `supabase stop --no-backup` → `npm run dev:db` → `npm run dev:db:reset` (wipes local data; re-bootstrap admin). Staging is PG `17.6.1.127` — **parity confirmed**; dashboard offers a patch upgrade to `.141`, deferred to 9b.

### Verified
- Two-tab browser demo: insert/promote a published author → the country paints live on another open tab within ~1s, no reload.

### Out of scope / next
- **Staging (Task A2):** `supabase db push` applies 0008 + 0009, then merge → `development` auto-deploys, then run the staging two-tab demo.
- Realtime admin inbox + pending-count badge → **Stage 9a-iii** (design brainstormed; spec pending).
- `notify_owner` deep-link points at `/admin/suggestions/:id` (404); should be `/admin/suggestion?id=` — small separate fix.

---

## Last session — 2026-06-18 (Stage 9a — staging deployment)

**Branch in progress:** `feature/09a-staging-deploy` (not yet merged).

### Hosted Supabase
- Provisioned `mapa-staging` (region `eu-west-1`, project ref `kkdjrzuewnwrlokhemnl`). All 7 migrations applied (0001-0007). 249-country seed run manually via Studio SQL (hosted projects don't auto-run `[db.seed].sql_paths`). Admin user bootstrapped.
- Three edge functions deployed: `submit_suggestion`, `notify_owner`, `translate`. `TURNSTILE_SECRET_KEY` + `DEEPL_API_KEY` set in function secrets. `RESEND_API_KEY` intentionally unset → `notify_owner` stays console-log only on staging (deferred to 9b).
- New migration `0007_fix_notify_url_setting.sql` — updates the notify trigger to read `app.settings.functions_url` instead of `app.functions_url`. Turns out **hosted Supabase blocks user-defined GUCs entirely**, including the `app.settings.*` namespace. Trigger writes harmless rows to `net._http_response`; 9b will pivot to Supabase Database Webhooks.
- Auth `site_url` + redirect URLs configured for `https://staging.mapadeautoras.com`. Magic-link emails route via Supabase's built-in mailer (4/hour limit on free tier).

### Cloudflare Pages + DNS
- Pages project `mapa-de-autoras` connected to GitHub repo, production branch = `development`, auto-deploys on every push.
- Env vars set in **Production scope** (not Preview — important): `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `NODE_VERSION=22`.
- `staging.mapadeautoras.com` mapped as custom domain (one-click since Cloudflare is both registrar + DNS host).
- Real Turnstile widget created (`mapa-de-autoras`) with 5 allowed hostnames covering local dev + staging + future production. Both local `.env` and the widget use the real keys (no more test keys).

### Heartbeat + docs
- New migration `0006_heartbeat_rpc.sql` adds `public.heartbeat()` — no-op SQL function called weekly to prevent free-tier auto-pause.
- New GitHub Actions workflow `.github/workflows/heartbeat.yml` (matrix-ready for 9b). Live-trigger verification deferred to post-merge (GitHub Actions only indexes workflows from the default branch).
- `STAGING_SUPABASE_URL` + `STAGING_SUPABASE_ANON_KEY` set as GitHub Actions repo secrets.
- New runbook `docs/30-ops/staging-deploy.md` documents env vars locations, key rotation, rollback, auto-pause recovery, and 10+ gotchas surfaced during the deploy.
- `docs/01-implementation-plan.md` updated — Stage 9 split into 9a (done) + 9b (pending).

### Gotchas surfaced (full list in the runbook)
- Cloudflare Pages env vars are scope-specific (Production vs Preview). Setting only one breaks builds for the other.
- Node 20 is EOL + breaks `@supabase/realtime-js` (needs native WebSocket). `NODE_VERSION=22` minimum.
- `verify_jwt = true` on hosted Edge Functions blocks CORS preflight (browser strips Authorization from OPTIONS → 401 → no CORS headers → POST blocked). Fix: `verify_jwt = false` in config.toml + dashboard toggle OFF + in-function `decodeJwtPayload` admin check.
- `supabase functions deploy` doesn't always sync verify_jwt — use `--no-verify-jwt` explicitly OR flip the dashboard toggle.
- CORS `Access-Control-Allow-Headers` must include `apikey, x-client-info` (sent by supabase-js). Updated in `translate/index.ts`.
- Hosted Supabase rejects user-defined GUCs entirely. Notify trigger URL approach must move to Supabase Database Webhooks in 9b.
- New Supabase anon key format is `sb_publishable_...` (replacing JWT-style `eyJ...`).
- GitHub Actions UI only shows workflows from the default branch.

### Out of scope (lives in 9b)
- Production Supabase project `mapa-prod` + production Pages project + apex + www custom domains
- Resend domain auth + real notify emails + HTML template
- Database Webhooks pivot for the notify trigger

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
- **Staging URL:** `https://staging.mapadeautoras.com` — live since 2026-06-18; auto-deploys from every push to `development` via Cloudflare Pages.
- **Supabase region:** `eu-west-1` (Ireland) for both staging (`mapa-staging`) and future production (`mapa-prod`).
- **Turnstile widget:** one shared widget (`mapa-de-autoras`) covering localhost, 127.0.0.1, staging.mapadeautoras.com, mapadeautoras.com, and www.mapadeautoras.com. Both local `.env` and Cloudflare Pages Production scope use the real keys (no more always-passing test keys).
- **Map UX baseline:** dusty-blue ocean + three-color state hierarchy — penguin (read), sage (currently_reading), oxblood (discovery). The original two-color hierarchy was owner-approved 2026-05-30; the sage third state was added in Stage 7b-i (2026-06-10) and **needs owner review before merging 9a → development → master**.
- **Branching convention:** `master` ← `development` ← `feature/NN-slug` (or `NNa`, `NNb` sub-stages). Alejandro commits + pushes + merges manually — Claude never runs `git commit`/`push`/`merge`.
- **Bilingual content:** Resolved by [ADR 0004](adr/0004-translation-strategy.md). DeepL via admin-only Edge Function at `/functions/v1/translate`; owner reviews/edits both versions before save. Free-tier headroom ~12× MVP volume. Works on staging (`verify_jwt = false` + in-function admin check).

---

## Open items pending decision before Stage 7b-ii starts

1. **`book_links` shape** — the implementation plan flags this; recommendation (b) one link per book per locale. Decision needs to land before 7b-ii's "edit book links" UI.
2. **`SUPABASE_SERVICE_ROLE` env var rename** — currently in `.env.example` from Stage 3. Local Edge Function gets the right key (`SUPABASE_SERVICE_ROLE_KEY`) injected automatically. If 7b-ii needs server-side queries from Astro, rename to match the canonical name and update consumers.
3. **Icon library** — 7b-i used 3 inline SVGs (inbox / plus / logout). 7b-ii will add at least edit / delete / save icons. Consider adding `lucide-react` if inline SVGs become painful (~5+ icons).
4. **Owner review of the three-color map** — the sage `currently_reading` state evolves the owner-approved two-color baseline. Quick visual review with the project owner before merging 9a (which carries 7b-i) to `master`.

## Open items before Stage 9b starts

1. **Resend account + domain auth** — create Resend account, authenticate `mapadeautoras.com` (SPF/DKIM/DMARC). Allow ~24h DNS propagation buffer before relying on real email delivery.
2. **Pivot notify trigger to Supabase Database Webhooks** — no committed code change needed; configured via the Supabase dashboard per environment. Unblocks real `notify_owner` emails in production (hosted Supabase blocks the pg_net GUC approach).
3. **HTML email template for `notify_owner`** — deeplink to admin inbox, country flag, formatted submitter info. Small follow-up; can land in 9b or as a phase-2 polish item (see `docs/40-phase2-backlog.md`).

---

## How to resume tomorrow

```sh
# After merging feature/09a-staging-deploy into development:
git checkout development
git pull
# Optionally for 9b:
# git checkout -b feature/09b-production-deploy
# Or for 7b-ii (CRUD on existing authors — different deferred stage):
# git checkout -b feature/07b-ii-author-crud

# Local stack — see supabase/README.md for full quickstart
npm run dev:db
npm run dev:db:reset
npm run dev:functions
npm run dev

# Re-bootstrap the admin user locally (reset wipes auth.users — see supabase/README.md)
# Verify staging at https://staging.mapadeautoras.com
```
