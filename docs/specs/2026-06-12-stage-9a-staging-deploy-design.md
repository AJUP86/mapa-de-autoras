# Stage 9a — Staging deployment to staging.mapadeautoras.com

**Date:** 2026-06-12
**Branch:** `feature/09a-staging-deploy`
**Status:** Design approved, ready to implement.

> Companion to [docs/01-implementation-plan.md § Stage 9](../01-implementation-plan.md). The original Stage 9 covered "deploy + heartbeat" against `master` as a single step; that stage is now split into **9a (staging on `development`)** and **9b (production on `master`)**. This document covers 9a only.

---

## Why now (out of original sequence)

Stage 9 was scheduled after 7b-ii + 8 in the original roadmap. We're pulling staging forward because the project owner wants to see in-progress work, and `development` is already advanced enough (7a + 7b-i merged or about to merge) to demo meaningfully. Production deploy (9b) stays in the original sequence — after newsletter (Stage 8) and before launch content (Stage 10).

---

## Scope

**In (9a):**

- Hosted Supabase project `mapa-staging` (free tier) with all five migrations applied + 249-country seed.
- Admin user re-bootstrapped via Studio SQL on the staging project.
- Three edge functions deployed to staging: `submit_suggestion`, `notify_owner`, `translate`. Function env vars set in dashboard.
- Cloudflare Pages project connected to GitHub repo, auto-deploying every push to `development`.
- `staging.mapadeautoras.com` custom domain mapped (Cloudflare Registrar → Cloudflare Pages, same account = one-click CNAME + auto-SSL).
- Heartbeat: new migration `0006_heartbeat_rpc.sql` + GitHub Actions workflow pinging the staging Supabase project weekly to prevent the free-tier 7-day auto-pause.
- Runbook at `docs/30-ops/staging-deploy.md` covering env var locations, key rotation, rollback, auto-pause recovery.
- `docs/01-implementation-plan.md` updated to split original Stage 9 into 9a (Done after merge) and 9b (Pending).

**Out (9a):**

- Production deploy to `mapadeautoras.com` + `www.mapadeautoras.com` (→ 9b).
- Resend domain auth on `mapadeautoras.com` (SPF/DKIM/DMARC) (→ 9b).
- Real bilingual content / 5–10 confirmed authors (→ Stage 10).
- HTML email template for `notify_owner` (→ 9b or phase 2; see "Notification polish" below).
- Reply-in-email actions on suggestion notifications (→ phase 2).
- Multi-channel notifications (Telegram/Slack) (→ phase 2).
- Per-feature-branch preview deployments mapped to custom subdomains (Pages still auto-builds them on `*.pages.dev` for free; we just don't map domains).

**Out (Phase 2):** see [docs/40-phase2-backlog.md](../40-phase2-backlog.md).

---

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Branch → environment mapping | `development` auto-deploys to staging; `master` deploys to production in 9b | Matches existing `master ← development ← feature/NN` flow; client sees every merged feature within minutes |
| 2 | Supabase project count | Two projects (`mapa-staging` now, `mapa-prod` in 9b) | Free tier allows two; staging writes never pollute production data |
| 3 | Initial staging DB state | Empty (migrations + 249-country seed + admin user only — no dev-authors seed) | Clean cutover pattern matches production; client first impression shows the real "no data yet" state honestly |
| 4 | Auth email transport | Supabase built-in mailer (free-tier: 4 emails/hour) | One admin user; rate limit is irrelevant; defers Resend domain auth to 9b |
| 5 | `notify_owner` on staging | Stays in console-log mode (no `RESEND_API_KEY` set) | No Resend setup until 9b; suggestion writes still succeed because `pg_net.http_post` is async non-blocking |
| 6 | DeepL key | Same `DEEPL_API_KEY` value as dev (one free-tier quota shared) | 500k chars/month is ~12× MVP volume; quota separation not warranted yet |
| 7 | Turnstile | Same site as dev, extended with `staging.mapadeautoras.com` as an allowed hostname | One site key + secret to manage in 9a; 9b gets a fresh site for production isolation |
| 8 | Heartbeat scope | Included in 9a, workflow parameterised so 9b is a 1-line matrix addition | Avoids forgetting it; protects staging from auto-pause while we work on 7b-ii / 8 |
| 9 | Runbook location | `docs/30-ops/staging-deploy.md` | Matches original Stage 9 plan's path; introduces the `30-ops/` folder for future runbooks (deploy, key rotation, incident response) |
| 10 | Secrets management | All actual values live in Cloudflare Pages env vars + Supabase function settings + GitHub Actions secrets. Repo only documents what's needed (extends `.env.example`) | Never commit hosted secrets |
| 11 | Slice structure | Three functional bundles (Supabase env / Cloudflare env / heartbeat + docs) | Each slice end-to-end verifiable; matches 7b-i cadence |
| 12 | Supabase region (staging + production) | `eu-west-1` (Ireland) | Static site assets ship from Cloudflare Pages' 300+ edge POPs, so Supabase region only affects dynamic calls (~50 KB initial fetch + low-frequency admin actions). London is optimal for Spain + NL (admin + client) at ~30 ms; Latin-American users pay ~200 ms on the initial fetch, acceptable for a mostly-static site. Free tier = one region per project, no read replicas — same region must be used for production in 9b |

---

## Architecture

```
   ┌─────────────────────┐         ┌──────────────────────────────┐
   │   GitHub repo       │ push    │  Cloudflare Pages            │
   │   branch:           │────────▶│  project: mapa-de-autoras    │
   │   development       │         │  build: npm run build        │
   └─────────────────────┘         │  output: dist                │
                                   │  prod branch: development    │
                                   └──────────────┬───────────────┘
                                                  │ CNAME (same Cloudflare account)
                                                  ▼
                              ┌─────────────────────────────────────┐
                              │  staging.mapadeautoras.com (HTTPS)  │
                              └──────────────┬──────────────────────┘
                                             │ supabase-js (anon key)
                                             ▼
                              ┌─────────────────────────────────────┐
                              │  Supabase hosted: mapa-staging      │
                              │  • Postgres + RLS + 6 migrations    │
                              │    (0001–0005 + 0006 heartbeat)     │
                              │  • Edge Functions:                  │
                              │    submit_suggestion / notify_owner │
                              │    / translate                      │
                              │  • Built-in mailer for magic-links  │
                              └──────────────┬──────────────────────┘
                                             │
                              ┌──────────────▼──────────────────────┐
                              │  GitHub Actions: heartbeat.yml      │
                              │  weekly: SELECT public.heartbeat()  │
                              └─────────────────────────────────────┘
```

---

## Slice plan

### Slice A — Supabase staging environment

**Build:**
- New migration `supabase/migrations/0006_heartbeat_rpc.sql`:
  ```sql
  create or replace function public.heartbeat() returns text language sql stable as $$ select 'ok' $$;
  grant execute on function public.heartbeat() to anon, authenticated;
  ```
  (Written first so the `supabase db push` below applies it. Also runs locally on next `npm run dev:db:reset`.)
- Provision `mapa-staging` project in Supabase dashboard (region: `eu-west-1` to match the user's locale).
- `supabase link --project-ref <staging-id>` + `supabase db push` — replays all six migrations.
- Bootstrap admin user via Studio SQL Editor: create user via Authentication UI, then run the existing `update auth.users ... set raw_app_meta_data ...` snippet from `supabase/README.md`.
- Deploy edge functions: `supabase functions deploy submit_suggestion notify_owner translate --project-ref <staging-id>`.
- Set function env vars via dashboard:
  - `TURNSTILE_SECRET_KEY` — reuse from `.env`
  - `DEEPL_API_KEY` — reuse from `.env`
  - **Do not set** `RESEND_API_KEY` — keeps `notify_owner` in console-log mode.
- Set `app.functions_url` on hosted Postgres: `alter database postgres set "app.functions_url" = '<staging-functions-url>'`.
- Configure auth in dashboard: `site_url = https://staging.mapadeautoras.com`; `additional_redirect_urls` includes `/`, `/admin`, `/admin/inbox`.

**Verify:**
- `curl https://<staging-ref>.supabase.co/rest/v1/countries?select=count -H "apikey: <staging-anon-key>"` returns `[{"count":249}]`.
- From Studio SQL Editor (service-role): `select * from auth.users` shows the admin user with `app_metadata.role = 'admin'`.
- `curl -X POST` against the deployed `translate` function with an admin JWT returns translated text.
- Insert a test row in `suggestions` from Studio; `select * from net._http_response` shows the notify-trigger POST landed (even though notify_owner just logs).

### Slice B — Cloudflare Pages + DNS

**Build:**
- Create Cloudflare Pages project in dashboard, connect to GitHub repo.
- Build config: framework = Astro, build command = `npm run build`, output = `dist`, Node version = 20.
- Set **production branch = `development`** (Pages-speak — the branch that gets the custom domain).
- Set Pages production env vars (the only env scope that maps to a custom domain):
  - `PUBLIC_SUPABASE_URL` = `https://<staging-ref>.supabase.co`
  - `PUBLIC_SUPABASE_ANON_KEY` = `<staging-anon-key>`
  - `PUBLIC_TURNSTILE_SITE_KEY` = `<existing-dev-site-key>` (after adding `staging.mapadeautoras.com` as an allowed hostname on the Turnstile site)
- Trigger first deploy by pushing a noop commit to `development` (the merge of `feature/07b-promote-and-crud` will do this naturally).
- Add `staging.mapadeautoras.com` as a custom domain on the Pages project. Cloudflare auto-creates the CNAME since the registrar is the same account. Wait ~5 min for SSL provisioning.

**Verify:**
- `https://staging.mapadeautoras.com` loads with the map rendered, no authors visible (empty DB).
- Devtools network panel shows successful 200s to `<staging-ref>.supabase.co`.
- Submit a real suggestion via `/suggest` form (with Turnstile widget passing).
- Studio shows the new row in `suggestions`.
- Visit `/admin`, request magic-link, receive email via Supabase's built-in mailer, complete login, see the new suggestion in `/admin/inbox`.
- Promote the suggestion via `/admin/promote?suggestion=<id>` — author appears on the map after page refresh.

### Slice C — Heartbeat workflow + runbook + STATUS

**Build:**
- New workflow `.github/workflows/heartbeat.yml` — cron `0 6 * * 1` (Monday 06:00 UTC weekly); matrix-ready for prod in 9b. Uses GitHub Actions secrets `STAGING_SUPABASE_URL` + `STAGING_SUPABASE_ANON_KEY` to POST `/rest/v1/rpc/heartbeat` (the function shipped with Slice A).
- New folder + file `docs/30-ops/staging-deploy.md` — runbook covering: env-var inventory (where each var lives), key rotation, Pages rollback to previous deployment, Supabase auto-pause recovery, common gotchas (magic-link redirect, `app.functions_url`).
- `docs/01-implementation-plan.md` — split Stage 9 into 9a (Done after merge) + 9b (Pending). Update branch table.
- `docs/STATUS.md` — append "Last session — 2026-06-12 (Stage 9a)" entry.
- `docs/RAG.md` — add row for the new runbook.
- `.env.example` — add commented section flagging which vars are dashboard-only on hosted environments.
- `supabase/README.md` — add "Hosted (staging)" section linking to the runbook.

**Verify:**
- GitHub Actions → "Run workflow" button → workflow run → green, returns `"ok"`.
- Re-run the workflow → still green (function is idempotent).
- Read the runbook front-to-back — every step is followable without referring to the spec.

---

## Risks + mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Magic-link redirect mismatch (`site_url` typo) breaks admin login on staging | Explicit verification step in Slice A; same gotcha as Stage 7a locally — solution is documented in `supabase/README.md` and the new runbook |
| 2 | `app.functions_url` typo → notify trigger silently fails | Smoke test in Slice A: insert a test suggestion, check `net._http_response` for the POST result |
| 3 | Pages build env vars wrong → site builds but PostgREST calls 401 | Slice B verification explicitly hits PostgREST from devtools console before sign-off |
| 4 | Turnstile rejects staging hostname → suggestion form fails silently | Add hostname to Turnstile site BEFORE first Slice B deploy; verify form submission as part of Slice B sign-off |
| 5 | Supabase free-tier auto-pause kicks in between sessions | Heartbeat workflow in Slice C; manual recovery path documented in runbook |
| 6 | Client visits URL before Slice B completes and sees a blank page | Don't share the URL until Slice B verification passes |
| 7 | Hosted DeepL quota shared with dev exhausts during testing | Quota is 500k chars/month; MVP usage is ~40k. Mitigation only needed in 9b if this proves wrong |

---

## Notification polish (future work)

Captured here so 9b's brainstorm has a starting point. None of these block 9a or 9b:

- **HTML email template** for `notify_owner`: submitter info, country flag, deep-link to `/admin/inbox?focus=<id>`. ~1h, fits inside 9b alongside the Resend domain-auth setup.
- **Reply-in-email actions**: signed magic-token links inside the email (Approve / Reject) hitting a new Edge Function. Adds security surface (token expiry, single-use, RLS check). ~4–6h, phase 2.
- **Multi-channel sinks**: Telegram bot or Slack webhook as a parallel notification path. Only if email-only proves insufficient. Phase 2.

---

## Verification checklist (whole stage)

- [ ] `staging.mapadeautoras.com` resolves, serves HTTPS with a valid cert.
- [ ] Map renders with no authors visible.
- [ ] Suggestion form submits successfully with Turnstile passing.
- [ ] Suggestion appears in staging Studio.
- [ ] Admin magic-link login works end-to-end (request email → click link → land on `/admin/inbox`).
- [ ] Promote-from-suggestion flow saves a new author and redirects to `/admin/inbox`.
- [ ] Promoted author renders on the map after page refresh.
- [ ] Reject-suggestion flow updates the suggestion row to `rejected` with the reviewer note.
- [ ] `translate` Edge Function returns translated text when invoked from the promote form.
- [ ] Heartbeat workflow runs green when triggered manually.
- [ ] Runbook (`docs/30-ops/staging-deploy.md`) is complete and followable.
- [ ] `docs/STATUS.md` and `docs/01-implementation-plan.md` reflect the Stage 9 split.
- [ ] Branch `feature/09a-staging-deploy` is ready to PR into `development` (or directly into `development` if a sub-branch is overkill — operator's choice).

---

## Open questions before implementation starts

- **Branch base** — branch `feature/09a-staging-deploy` from `development` after merging `feature/07b-promote-and-crud` in, or branch from current `development` and parallel-track the 7b-i merge? Operator's choice; either works.
- **Resend account choice (for 9b)** — not blocking 9a, but Alejandro should create the Resend account during 9a if convenient, to avoid the DNS-propagation wait blocking 9b kickoff.

---

## Hours estimate

Restating the breakdown from conversation:

| Phase | Hours |
|---|---|
| Spec + plan | 1.5–2 |
| Slice A — Supabase staging | 1–1.5 |
| Slice B — Cloudflare Pages + DNS | 1–1.5 |
| Slice C — Heartbeat + docs | 1 |
| First-deploy debug buffer | 1.5–2 |
| **Total realistic** | **6–8h** spread over 2–3 sessions |
