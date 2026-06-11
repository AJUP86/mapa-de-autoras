# Stage 9a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `staging.mapadeautoras.com` live, auto-deploying every push to `development` from a hosted Cloudflare Pages + Supabase stack. Production deploy is deferred to a separate Stage 9b.

**Architecture:** Single hosted Supabase project (`mapa-staging`, region `eu-west-2`) holds the DB + Edge Functions + magic-link auth. Cloudflare Pages auto-builds the Astro static output on every push to `development` and serves it via the global CDN, with the staging Supabase URL + anon key baked in as build-time env vars. A GitHub Actions cron pings a no-op SQL function weekly to prevent the free-tier 7-day auto-pause.

**Tech Stack:** Astro 5 (static output), React 19 islands, Supabase (Postgres 15 + GoTrue + Deno Edge Runtime), Cloudflare Pages, Cloudflare Registrar + DNS, GitHub Actions.

**Spec:** [docs/specs/2026-06-12-stage-9a-staging-deploy-design.md](../specs/2026-06-12-stage-9a-staging-deploy-design.md) — read this first.

---

## Working conventions for this plan

1. **No test framework in this repo.** TDD-style "write the test first" doesn't apply. Each task ends with manual smoke verification.
2. **Alejandro commits manually.** Do NOT run `git commit`, `git push`, or `git merge`. End each slice with a STOP marker; Alejandro reads the diff and commits when satisfied.
3. **Branch:** `feature/09a-staging-deploy`, created off current `development` (which already contains 7b-i per commit `3e39da0`). One PR back to `development` at end of stage.
4. **Task labels:** Every task is tagged either `[Subagent]` (a file change a subagent can execute) or `[Manual]` (a dashboard or CLI action only Alejandro can do — Supabase project provisioning, Cloudflare Pages config, etc.). For subagent-driven execution, skip subagent dispatch for `[Manual]` tasks and read the instructions to Alejandro instead.
5. **Secrets policy:** No real values land in committed files. The repo only documents which variables are needed and where they live (`.env.example`, runbook). Real values go into Cloudflare Pages env vars, Supabase function settings, and GitHub Actions secrets.
6. **Each slice ends with `STOP — Slice X complete`.** That is the user-commit pause point. Do not move to the next slice until Alejandro confirms.

---

## Pre-flight

### Task PF1 — `[Manual]` Verify 7b-i is on `development`

- [ ] **Step 1: Check current branch + recent log**

Run:
```powershell
git log --oneline -5 development
```

Expected: the topmost commit contains `Merge pull request #9 from AJUP86/feature/07b-promote-and-crud` (or equivalent merge of the 7b-i branch). If not, finish the 7b-i merge first.

### Task PF2 — `[Manual]` Create the 09a branch

- [ ] **Step 1: Branch off `development`**

Run:
```powershell
git checkout development
git pull
git checkout -b feature/09a-staging-deploy
```

Expected: `git status` shows `On branch feature/09a-staging-deploy` with a clean tree.

---

# Slice A — Supabase staging environment

**Goal:** A real hosted Supabase project at `<staging-ref>.supabase.co` with all migrations applied, an admin user bootstrapped, all three edge functions deployed and reachable, and auth configured for the future staging URL.

## Task A1 — `[Subagent]` Add heartbeat migration `0006_heartbeat_rpc.sql`

**Files:**
- Create: `supabase/migrations/0006_heartbeat_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Stage 9a — Heartbeat function for Supabase free-tier auto-pause prevention.
--
-- Supabase free-tier projects auto-pause after 7 days of inactivity. A weekly
-- GitHub Action calls public.heartbeat() via PostgREST to keep the project warm.
--
-- The function is intentionally trivial: returns the literal text 'ok'. Marked
-- `stable` (not `immutable`) so Postgres won't memoize across calls in ways
-- that could theoretically skip database work. Grants execute to anon so the
-- workflow can call it without authentication.

create or replace function public.heartbeat()
returns text
language sql
stable
as $$
  select 'ok'::text;
$$;

comment on function public.heartbeat() is
  'No-op function called weekly by the heartbeat workflow to prevent free-tier auto-pause.';

grant execute on function public.heartbeat() to anon, authenticated;
```

- [ ] **Step 2: Apply locally to make sure it runs clean**

Run:
```powershell
npm run dev:db:reset
```

Expected: all six migrations apply cleanly, no errors. The reset reapplies migrations + seeds + dev-authors.

- [ ] **Step 3: Verify in Studio (`http://127.0.0.1:54323`) — SQL editor**

Run:
```sql
select public.heartbeat();
```

Expected: returns `'ok'`.

- [ ] **Step 4: STOP — Task A1 done. Migration verified locally; will be re-applied to staging in Task A3.**

---

## Task A2 — `[Manual]` Provision the staging Supabase project

- [ ] **Step 1: Create the project**

Go to https://supabase.com/dashboard → **New project**:

- Name: `mapa-staging`
- Database password: generate + save to your password manager
- Region: **`eu-west-2` (London)** — per spec decision #12; matches the future production region
- Pricing plan: **Free**

Wait ~2 minutes for provisioning.

- [ ] **Step 2: Capture project secrets**

Once the project is ready, go to **Project Settings → API** and copy these into a temporary scratch note (will paste into env-var dashboards in later tasks — never commit them):

- Project URL (e.g., `https://abcdefghijkl.supabase.co`)
- `anon` public key
- `service_role` secret key (only used briefly for SQL editor; not for app code)
- Project ref (the `abcdefghijkl` portion of the URL) — referred to as `<staging-ref>` below

- [ ] **Step 3: STOP — Task A2 done.**

---

## Task A3 — `[Manual]` Link the Supabase CLI + push migrations

- [ ] **Step 1: Link the CLI to the new project**

Run:
```powershell
supabase link --project-ref <staging-ref>
```

You'll be prompted for the database password from Task A2 Step 1.

Expected: `Finished supabase link.`

- [ ] **Step 2: Push migrations to the hosted DB**

Run:
```powershell
supabase db push
```

Expected: all six migrations apply against the remote DB. No errors. The seed (`supabase/seed.sql` — 249 countries) runs as part of the push *only if `[db.seed].sql_paths` includes it for remote* — confirm in `supabase/config.toml` if uncertain. If countries aren't seeded, run Step 3 below.

- [ ] **Step 3 (only if countries are empty): Manually run the seed in Studio**

Go to https://supabase.com/dashboard/project/<staging-ref>/sql/new and paste the content of `supabase/seed.sql`. Click **Run**.

Expected: `INSERT 0 249` (or similar).

- [ ] **Step 4: Verify the schema landed**

Run from the same SQL editor:
```sql
select count(*) from public.countries;            -- 249
select count(*) from public.authors;              -- 0 (no dev-authors seed on staging)
select unnest(enum_range(null::public.author_status));  -- read, discovery, currently_reading
select public.heartbeat();                        -- 'ok'
```

Expected: all four outputs as commented.

- [ ] **Step 5: STOP — Task A3 done.**

---

## Task A4 — `[Manual]` Bootstrap the admin user

- [ ] **Step 1: Create the user via Studio Auth UI**

Go to https://supabase.com/dashboard/project/<staging-ref>/auth/users → **Add user** → **Create new user**:

- Email: your real email (the one you'll use for magic-link login)
- Auto Confirm User: **yes** (skip email confirmation since we want immediate access)
- Password: leave empty (magic-link auth)

- [ ] **Step 2: Mark them as admin via SQL editor**

Go to the SQL editor and run:
```sql
update auth.users
set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', '"admin"')
where email = 'YOUR-OWNER-EMAIL@example.com';
```

Replace the email with the one from Step 1.

Expected: `UPDATE 1`.

- [ ] **Step 3: Verify**

Run:
```sql
select email, raw_app_meta_data from auth.users;
```

Expected: one row with `raw_app_meta_data` containing `"role": "admin"`.

- [ ] **Step 4: STOP — Task A4 done.**

---

## Task A5 — `[Manual]` Deploy the three Edge Functions

- [ ] **Step 1: Deploy all three functions**

Run:
```powershell
supabase functions deploy submit_suggestion --project-ref <staging-ref>
supabase functions deploy notify_owner --project-ref <staging-ref>
supabase functions deploy translate --project-ref <staging-ref>
```

Expected: each command finishes with `Deployed Function ...` and a URL like `https://<staging-ref>.supabase.co/functions/v1/<name>`.

- [ ] **Step 2: Verify they're registered**

Go to https://supabase.com/dashboard/project/<staging-ref>/functions

Expected: three functions listed — `submit_suggestion`, `notify_owner`, `translate`. Each shows last-deploy timestamp.

- [ ] **Step 3: STOP — Task A5 done. Functions deployed but env vars not set yet (next task).**

---

## Task A6 — `[Manual]` Set Edge Function env vars

- [ ] **Step 1: Set the function secrets**

In the staging project's Function Settings (https://supabase.com/dashboard/project/<staging-ref>/settings/functions → **Secrets**), add:

| Variable | Value | Why |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | same as your local `.env` | `submit_suggestion` validates the Turnstile token |
| `DEEPL_API_KEY` | same as your local `.env` | `translate` proxies to DeepL |

**Do NOT set:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OWNER_NOTIFICATION_EMAIL`. Their absence keeps `notify_owner` in console-log mode for 9a (per spec decision #5).

- [ ] **Step 2: Verify the secrets are saved**

Reload the page. The keys should be listed with values hidden (asterisks). Values are write-only in the Supabase dashboard.

- [ ] **Step 3: STOP — Task A6 done.**

---

## Task A7 — `[Manual]` Set `app.functions_url` for the notify trigger

The `0003_notify_owner_trigger.sql` migration uses `pg_net.http_post` against `app.functions_url`. On the hosted project this database setting is not auto-configured.

- [ ] **Step 1: Find the functions URL**

It is `https://<staging-ref>.supabase.co/functions/v1`. Copy.

- [ ] **Step 2: Set the database setting via SQL editor**

Run:
```sql
alter database postgres set "app.functions_url" = 'https://<staging-ref>.supabase.co/functions/v1';
```

Expected: `ALTER DATABASE`.

- [ ] **Step 3: Verify**

Run:
```sql
show "app.functions_url";
```

Expected: the URL you set.

- [ ] **Step 4: STOP — Task A7 done.**

---

## Task A8 — `[Manual]` Configure auth `site_url` + redirect URLs

- [ ] **Step 1: Open Auth → URL Configuration**

Go to https://supabase.com/dashboard/project/<staging-ref>/auth/url-configuration

- [ ] **Step 2: Set the values**

| Field | Value |
|---|---|
| Site URL | `https://staging.mapadeautoras.com` |
| Redirect URLs (one per line) | `https://staging.mapadeautoras.com`<br>`https://staging.mapadeautoras.com/admin`<br>`https://staging.mapadeautoras.com/admin/inbox` |

Save.

- [ ] **Step 3: STOP — Task A8 done. (Staging domain doesn't resolve yet; that's Slice B. Auth config landing now means it'll work the moment DNS is live.)**

---

## Task A9 — Verify Slice A end-to-end

- [ ] **Step 1: Smoke-test PostgREST from local laptop**

Run (replace `<staging-ref>` and `<staging-anon-key>` with real values):
```powershell
curl.exe "https://<staging-ref>.supabase.co/rest/v1/countries?select=count" `
  -H "apikey: <staging-anon-key>"
```

Expected: `[{"count":249}]`.

- [ ] **Step 2: Smoke-test the heartbeat RPC**

Run:
```powershell
curl.exe -X POST "https://<staging-ref>.supabase.co/rest/v1/rpc/heartbeat" `
  -H "apikey: <staging-anon-key>" `
  -H "Authorization: Bearer <staging-anon-key>" `
  -H "Content-Type: application/json" `
  -d "{}"
```

Expected: `"ok"`.

- [ ] **Step 3: Smoke-test the `translate` function**

Get a fresh admin JWT first by signing in locally and copying `sb-...-auth-token` from devtools (this is awkward for a hosted-only env, but it's the only function that needs admin auth — and we'll re-verify it end-to-end from the live staging site in Slice B).

Optional: skip this step if you'd rather wait until Slice B. The function deployment succeeded in Task A5; that's enough for now.

- [ ] **Step 4: STOP — Slice A complete.**

Alejandro: review the diff (`git status` should show only `supabase/migrations/0006_heartbeat_rpc.sql`). Commit when satisfied. Suggested message:

```
feat(stage-9a,migration): heartbeat() RPC for free-tier auto-pause prevention
```

---

# Slice B — Cloudflare Pages + DNS

**Goal:** `staging.mapadeautoras.com` resolves over HTTPS, every push to `development` auto-deploys, and the live site talks to the staging Supabase project from Slice A.

## Task B1 — `[Manual]` Add the staging hostname to the Turnstile site

- [ ] **Step 1: Open the Turnstile site config**

Go to https://dash.cloudflare.com/?to=/:account/turnstile → click the existing site (the one with `localhost` and `127.0.0.1`).

- [ ] **Step 2: Add `staging.mapadeautoras.com` as an allowed hostname**

Edit → Hostnames → Add `staging.mapadeautoras.com`. Save.

Expected: site config now lists three hostnames.

- [ ] **Step 3: STOP — Task B1 done. Same site key + secret continue to work on staging.**

---

## Task B2 — `[Manual]` Create the Cloudflare Pages project

- [ ] **Step 1: Create the project**

Go to https://dash.cloudflare.com/?to=/:account/workers-and-pages → **Create application** → **Pages** → **Connect to Git** → select the `mapa-de-autoras` repo.

- [ ] **Step 2: Set the build configuration**

| Field | Value |
|---|---|
| Project name | `mapa-de-autoras` |
| Production branch | **`development`** (yes, "production branch" in Pages-speak just means the branch that gets the custom domain) |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (default) |
| Node.js version | `20` (set via env var `NODE_VERSION=20` if there's no UI field) |

Do **not** start the first deploy yet — env vars aren't set. Click **Save and Deploy** if you can't avoid it; the first build will fail, that's fine.

- [ ] **Step 3: STOP — Task B2 done.**

---

## Task B3 — `[Manual]` Set Pages production env vars

- [ ] **Step 1: Open Pages project settings**

Go to the project → **Settings → Environment variables** → **Production** scope.

- [ ] **Step 2: Add the three public env vars**

| Variable | Value |
|---|---|
| `PUBLIC_SUPABASE_URL` | `https://<staging-ref>.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | `<staging-anon-key>` (from Task A2) |
| `PUBLIC_TURNSTILE_SITE_KEY` | same as your local `.env` |
| `NODE_VERSION` | `20` (if you didn't set it as a build setting in B2) |

Save.

- [ ] **Step 3: STOP — Task B3 done.**

---

## Task B4 — `[Manual]` Trigger the first deploy

The repo doesn't strictly need a new commit — Pages will redeploy with the new env vars. But the cleanest path is one trigger commit.

- [ ] **Step 1: Push the branch — but wait, this is the 09a branch, not `development`**

Decision: skip a noop trigger commit. Instead, manually retry the first build:

Go to Pages project → **Deployments** → find the failed (or pending) first build → **Retry deployment**.

If there is no build yet because Cloudflare didn't try one, push the 09a branch — Pages will build the *preview*, not the production deployment. To produce a production deployment from `development` while still on `feature/09a-staging-deploy`, just merge a small no-op commit (e.g., updating the runbook) into `development` later — for now, the preview deployment is enough to test the build pipeline works.

- [ ] **Step 2: Wait for the build**

Expected: green build in ~2–3 minutes. The deployment URL looks like `https://<commit-sha>.mapa-de-autoras.pages.dev`.

- [ ] **Step 3: Smoke-test the preview URL**

Open `https://<commit-sha>.mapa-de-autoras.pages.dev` in a browser.

Expected: the site loads. Map renders. Devtools network panel shows successful 200s to `<staging-ref>.supabase.co`. If you see 401s, env vars are wrong — revisit B3.

- [ ] **Step 4: STOP — Task B4 done.**

---

## Task B5 — `[Manual]` Add `staging.mapadeautoras.com` as a custom domain

- [ ] **Step 1: Open Pages project → Custom domains**

Pages project → **Custom domains** → **Set up a custom domain** → enter `staging.mapadeautoras.com`.

- [ ] **Step 2: Activate**

Cloudflare detects that the domain is in the same account (registrar = Cloudflare) and offers a one-click CNAME setup. Confirm.

Expected: status moves to "Provisioning SSL" within ~30 seconds, then "Active" after ~5 minutes.

- [ ] **Step 3: STOP — Task B5 done. Site is reachable at staging.mapadeautoras.com over HTTPS.**

(Note: until a real production deployment is produced from `development`, the custom domain points at whatever the latest production-scope build is. After merging this 09a branch into `development`, the latest commit will become the production deployment automatically.)

---

## Task B6 — Verify Slice B end-to-end

- [ ] **Step 1: Visit `https://staging.mapadeautoras.com`**

Expected: HTTPS green padlock, site loads, map renders, no authors visible (empty DB from Slice A).

- [ ] **Step 2: Submit a real suggestion via `/suggest`**

Fill the form, complete the Turnstile widget, submit.

Expected: success message.

- [ ] **Step 3: Confirm the suggestion landed in staging Supabase**

Go to https://supabase.com/dashboard/project/<staging-ref>/editor → `public.suggestions` table.

Expected: one row with the data you submitted.

- [ ] **Step 4: Confirm the notify trigger fired**

Run in SQL editor:
```sql
select created, status_code, content from net._http_response order by created desc limit 1;
```

Expected: a row with `status_code = 200` (or similar) and content that includes the suggestion payload (logged because `RESEND_API_KEY` is unset → console-log mode).

- [ ] **Step 5: End-to-end admin flow**

a. Visit `https://staging.mapadeautoras.com/admin`. Request a magic-link with your admin email.

b. Open the link in the magic-link email (delivered via Supabase's built-in mailer — check inbox + spam).

c. Land on `/admin/inbox`. See the new suggestion.

d. Click into the suggestion → Promotar → fill the promote form → click Traducir on one bilingual field to verify the `translate` function works → save.

e. Confirm the new author appears on `/` after page refresh.

f. Refresh `/admin/inbox`. Confirm the suggestion is now `approved` (or no longer in the pending list).

Expected: every step works.

- [ ] **Step 6: STOP — Slice B complete.**

Alejandro: there's nothing to commit from Slice B (all changes are in Cloudflare + Supabase dashboards). Confirm the URL works for you, then proceed to Slice C.

---

# Slice C — Heartbeat workflow + runbook + STATUS

**Goal:** weekly heartbeat keeps staging from auto-pausing; the runbook captures everything a future-Alejandro needs; the implementation plan reflects the 9a/9b split.

## Task C1 — `[Subagent]` Create the heartbeat GitHub Actions workflow

**Files:**
- Create: `.github/workflows/heartbeat.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Supabase heartbeat

# Free-tier Supabase projects auto-pause after 7 days of inactivity. This cron
# pings public.heartbeat() (a no-op SQL function) weekly to keep them warm.
#
# Matrix-ready: 9b adds a second entry for production. The secret-name strings
# resolve dynamically via `secrets[matrix.env.<name>]`.

on:
  schedule:
    - cron: '0 6 * * 1'  # Monday 06:00 UTC weekly
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        env:
          - name: staging
            url_secret: STAGING_SUPABASE_URL
            key_secret: STAGING_SUPABASE_ANON_KEY
          # 9b: add { name: production, url_secret: PROD_SUPABASE_URL, key_secret: PROD_SUPABASE_ANON_KEY }
    steps:
      - name: Ping ${{ matrix.env.name }}
        env:
          SUPABASE_URL: ${{ secrets[matrix.env.url_secret] }}
          SUPABASE_ANON_KEY: ${{ secrets[matrix.env.key_secret] }}
        run: |
          response=$(curl -sf -X POST \
            "$SUPABASE_URL/rest/v1/rpc/heartbeat" \
            -H "apikey: $SUPABASE_ANON_KEY" \
            -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
            -H "Content-Type: application/json" \
            -d '{}')
          if [ "$response" != '"ok"' ]; then
            echo "Heartbeat failed for ${{ matrix.env.name }}: $response"
            exit 1
          fi
          echo "Heartbeat OK for ${{ matrix.env.name }}"
```

- [ ] **Step 2: Verify YAML parses**

The subagent can't run GitHub Actions locally. Have the subagent visually verify indentation, then confirm with a JSON-style mental check (no syntax errors). The next task triggers the workflow live.

- [ ] **Step 3: STOP — Task C1 done.**

---

## Task C2 — `[Manual]` Add GitHub Actions secrets

- [ ] **Step 1: Open repo settings → Secrets and variables → Actions**

Go to https://github.com/AJUP86/mapa-de-autoras/settings/secrets/actions

- [ ] **Step 2: Add two secrets**

| Secret name | Value |
|---|---|
| `STAGING_SUPABASE_URL` | `https://<staging-ref>.supabase.co` |
| `STAGING_SUPABASE_ANON_KEY` | `<staging-anon-key>` |

- [ ] **Step 3: STOP — Task C2 done.**

---

## Task C3 — `[Manual]` Push the 09a branch to GitHub and trigger the workflow manually

- [ ] **Step 1: Commit Task C1's file**

Alejandro commits the workflow file:
```
ci(stage-9a): heartbeat workflow for staging Supabase
```

- [ ] **Step 2: Push the branch**

```powershell
git push -u origin feature/09a-staging-deploy
```

- [ ] **Step 3: Trigger the workflow manually**

Go to https://github.com/AJUP86/mapa-de-autoras/actions → **Supabase heartbeat** → **Run workflow** → select `feature/09a-staging-deploy` branch → **Run workflow**.

Expected: workflow run finishes green in ~30s. Log shows `Heartbeat OK for staging`.

- [ ] **Step 4: Re-trigger to confirm idempotency**

Run it again. Same result.

- [ ] **Step 5: STOP — Task C3 done.**

---

## Task C4 — `[Subagent]` Write the runbook

**Files:**
- Create: `docs/30-ops/staging-deploy.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Staging deployment — runbook

> Operational reference for `staging.mapadeautoras.com`. Production runbook will live in `docs/30-ops/production-deploy.md` after Stage 9b ships.

## Environment inventory

| Resource | Provider | Region | Console URL |
|---|---|---|---|
| Hosted DB + Auth + Edge Functions | Supabase | `eu-west-2` (London) | `https://supabase.com/dashboard/project/<staging-ref>` |
| Static site hosting | Cloudflare Pages | global edge | Cloudflare dashboard → Workers & Pages → `mapa-de-autoras` |
| Domain | Cloudflare Registrar | n/a | Cloudflare dashboard → Domain Registration |
| Heartbeat cron | GitHub Actions | GitHub-hosted | `https://github.com/AJUP86/mapa-de-autoras/actions/workflows/heartbeat.yml` |
| Turnstile (bot defence) | Cloudflare Turnstile | n/a | Cloudflare dashboard → Turnstile |

## Env vars — where each one lives

| Variable | Location | Why there |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Cloudflare Pages env vars (Production scope) | Read by Astro at build time; baked into the static bundle |
| `PUBLIC_SUPABASE_ANON_KEY` | Cloudflare Pages env vars (Production scope) | Same |
| `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Pages env vars (Production scope) | Same |
| `NODE_VERSION` | Cloudflare Pages env vars (Production scope) | Forces Node 20 for the build |
| `TURNSTILE_SECRET_KEY` | Supabase function settings (staging project) | Read by `submit_suggestion` at invocation |
| `DEEPL_API_KEY` | Supabase function settings (staging project) | Read by `translate` at invocation |
| `RESEND_API_KEY` | **Intentionally unset on staging** | Absence keeps `notify_owner` in console-log mode for 9a |
| `STAGING_SUPABASE_URL` | GitHub Actions secrets | Heartbeat workflow |
| `STAGING_SUPABASE_ANON_KEY` | GitHub Actions secrets | Heartbeat workflow |
| `app.functions_url` | Postgres database setting on staging project | Read by the `notify_owner_trigger` to know where to POST |

## Key rotation

### Supabase anon key

Rotation is rare (only on suspected leak — anon key is public). To rotate:
1. Supabase dashboard → Project Settings → API → **Reset anon key**.
2. Update `PUBLIC_SUPABASE_ANON_KEY` in Cloudflare Pages env vars.
3. Update `STAGING_SUPABASE_ANON_KEY` in GitHub Actions secrets.
4. Trigger a new Pages deploy (any push to `development` or **Retry deployment** in dashboard).
5. Re-run the heartbeat workflow to confirm.

### Supabase service-role key

Never used in client code. Only used briefly in SQL editor / Studio. Rotation is supabase-dashboard-only — no app changes.

### DeepL API key

1. Generate new key at https://www.deepl.com/account/api.
2. Supabase function settings → update `DEEPL_API_KEY`.
3. Restart the staging `translate` function by re-deploying it (`supabase functions deploy translate --project-ref <staging-ref>`).
4. Update local `.env` as well.

### Turnstile secret

1. Cloudflare dashboard → Turnstile → site → **Rotate secret**.
2. Update `TURNSTILE_SECRET_KEY` in Supabase function settings (staging).
3. Update local `.env`.
4. (Site key does not rotate — only the secret.)

## Rollback

### Pages deployment rollback

If a bad build hits `staging.mapadeautoras.com`:
1. Pages project → **Deployments** tab.
2. Find the last known-good production deployment (highest `development` commit that worked).
3. Click the `⋯` menu → **Rollback to this deployment**.
4. The custom domain redirects to the rolled-back build within ~30s.

No code changes needed; the bad commit can be fixed in a follow-up PR.

### Migration rollback

Supabase has no native rollback. If a bad migration lands:
1. Write a forward-fix migration that reverses the damage.
2. `supabase db push` to apply it.

The DB has no point-in-time-recovery on free tier — back up critical data manually before risky migrations.

## Free-tier auto-pause recovery

If the heartbeat fails to fire (e.g., GitHub Actions outage) and the project pauses:
1. Visit https://supabase.com/dashboard/project/<staging-ref>.
2. Click **Restore project**.
3. Wait ~2 minutes for the project to come back online.
4. Trigger a fresh build on Pages so the site reconnects cleanly.

## Gotchas

- **Magic-link redirect failures** — the most common bite. If admin login lands on a generic Supabase page instead of `/admin/inbox`, the `site_url` or `additional_redirect_urls` is wrong. Fix in Supabase dashboard → Auth → URL Configuration. Spelling matters (`https://` not `http://`, no trailing slash unless intentional).
- **`app.functions_url` not set** — the suggestion-insert trigger silently fails to POST. Verify with `select created, status_code from net._http_response order by created desc limit 5;` after a test suggestion.
- **Pages build with wrong env vars** — build succeeds, site loads, but Supabase calls 401. Check the Production scope env vars; redeploy after fixing.
- **Turnstile hostname missing** — suggestion form fails silently (no submit). Confirm `staging.mapadeautoras.com` is in the Turnstile site's hostname list.
- **Supabase free-tier auto-pause** — heartbeat workflow should prevent this. If it fires red for two weeks running, investigate.

## Adding production (9b) — what changes

When Stage 9b lands:
- Create `mapa-prod` Supabase project in same region (`eu-west-2`).
- Create production runbook at `docs/30-ops/production-deploy.md` (copy this file, swap values).
- Update this runbook's matrix in `.github/workflows/heartbeat.yml` to add `production` entry.
- Add `PROD_SUPABASE_URL` + `PROD_SUPABASE_ANON_KEY` to GitHub Actions secrets.
- Add `mapadeautoras.com` + `www.mapadeautoras.com` to the Pages project as custom domains.
- Set Pages **Preview** env vars to staging values (so `development` previews still hit staging Supabase). Production scope flips to prod Supabase values.
- Resend domain auth on `mapadeautoras.com` (SPF/DKIM/DMARC); set `RESEND_API_KEY` on the prod Supabase project to flip `notify_owner` out of console-log mode.
```

- [ ] **Step 2: STOP — Task C4 done.**

---

## Task C5 — `[Subagent]` Update STATUS, implementation-plan, RAG, `.env.example`, supabase README

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/01-implementation-plan.md`
- Modify: `docs/RAG.md`
- Modify: `.env.example`
- Modify: `supabase/README.md`

- [ ] **Step 1: Update `docs/01-implementation-plan.md`**

Split the existing "Stage 9 — Deploy to Cloudflare Pages + Supabase heartbeat" section into two:

- New section `## Stage 9a — Staging deployment (Cloudflare Pages + Supabase staging)`
  - Branch: `feature/09a-staging-deploy`
  - Goal: `staging.mapadeautoras.com` reachable; client-visible build of `development`
  - Build steps (cribbed from this plan)
  - Verify steps (cribbed from this plan)
  - Pause for review.
- New section `## Stage 9b — Production deployment (apex + www + Resend)`
  - Branch: `feature/09b-production-deploy`
  - Goal: `mapadeautoras.com` + `www` reachable; Resend domain-auth live; `notify_owner` sends real emails.
  - Build steps: provision `mapa-prod` Supabase, run migrations, redeploy edge functions, set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + `OWNER_NOTIFICATION_EMAIL`, verify Resend domain auth on `mapadeautoras.com`, add apex + `www` as Pages custom domains, add `PROD_SUPABASE_*` secrets, extend heartbeat matrix. Full slice plan in the 9b spec when brainstormed.
  - Verify steps: production URL serves HTTPS; suggestion submission triggers a real Resend email to `OWNER_NOTIFICATION_EMAIL`; magic-link login on `mapadeautoras.com` works.
  - Pause for review.

Update the table-of-contents / stage table at the top of the file to show 9a and 9b separately.

- [ ] **Step 2: Update `docs/STATUS.md`**

a. **Roadmap table:** split the 9 row into 9a (`✅ Done`) and 9b (`⏳ Pending`).

b. **New "Last session — 2026-06-12 (Stage 9a)" entry** at the top of the session log, covering:

```markdown
## Last session — 2026-06-12 (Stage 9a)

**Branch in progress:** `feature/09a-staging-deploy`.

### Hosted Supabase
- Provisioned `mapa-staging` in region `eu-west-2`. All six migrations applied + 249-country seed. Admin user bootstrapped via Studio SQL.
- Three edge functions deployed: `submit_suggestion`, `notify_owner`, `translate`.
- `TURNSTILE_SECRET_KEY` + `DEEPL_API_KEY` set in function settings. `RESEND_API_KEY` intentionally unset → `notify_owner` stays console-log on staging.
- `app.functions_url` set so the notify trigger reaches the deployed function.
- Auth `site_url` + redirects configured for `https://staging.mapadeautoras.com`.

### Cloudflare Pages
- Pages project `mapa-de-autoras` connected to GitHub repo, auto-deploys `development` branch.
- Public env vars (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`) set in Production scope.
- `staging.mapadeautoras.com` mapped as custom domain (one-click since registrar = same account).
- Existing Turnstile site extended with the staging hostname.

### Heartbeat
- New migration `0006_heartbeat_rpc.sql` adds `public.heartbeat()`.
- New GitHub Actions workflow `.github/workflows/heartbeat.yml` pings the function weekly. Matrix-ready for 9b production entry.
- `STAGING_SUPABASE_URL` + `STAGING_SUPABASE_ANON_KEY` set as GitHub Actions secrets.

### Docs
- New runbook `docs/30-ops/staging-deploy.md` — env-var inventory, key rotation, rollback, auto-pause recovery, gotchas, 9b migration notes.
- `docs/01-implementation-plan.md` — split Stage 9 into 9a (Done) + 9b (Pending).
```

c. **"Project facts worth remembering":** add a row noting staging URL + the region decision.

d. **"Open items pending decision before Stage 9b starts":**
- Resend account creation + DNS-propagation timing (~24h wait).
- Whether `notify_owner` HTML email template lands in 9b or as a small follow-up.

e. **"How to resume tomorrow":** update the command sheet to refer to `feature/09b-production-deploy` (for next session).

- [ ] **Step 3: Update `docs/RAG.md`**

Add a row for the new runbook:

```markdown
| `30-ops/staging-deploy.md` | Staging deployment runbook — env-var inventory, key rotation, rollback, auto-pause recovery, common gotchas. | Read when operating on the hosted staging environment, or before starting Stage 9b. |
```

Sort the row alphabetically into the existing table.

- [ ] **Step 4: Update `.env.example`**

Add a commented section at the bottom:

```bash
# -----------------------------------------------------------------------------
# Hosted environments (staging / production)
# -----------------------------------------------------------------------------
# These variables are NOT set in .env — they live in dashboards:
#
#   PUBLIC_SUPABASE_URL          → Cloudflare Pages env vars (Production)
#   PUBLIC_SUPABASE_ANON_KEY     → Cloudflare Pages env vars (Production)
#   PUBLIC_TURNSTILE_SITE_KEY    → Cloudflare Pages env vars (Production)
#   TURNSTILE_SECRET_KEY         → Supabase function settings (staging/prod)
#   DEEPL_API_KEY                → Supabase function settings (staging/prod)
#   RESEND_API_KEY               → Supabase function settings (prod only, 9b)
#   STAGING_SUPABASE_URL         → GitHub Actions secrets (heartbeat)
#   STAGING_SUPABASE_ANON_KEY    → GitHub Actions secrets (heartbeat)
#
# See docs/30-ops/staging-deploy.md for the full inventory.
```

- [ ] **Step 5: Update `supabase/README.md`**

Add a "Hosted (staging)" section after the existing "Promote + currently_reading + translate (Stage 7b-i)" section, linking to the runbook:

```markdown
## Hosted environments — staging (Stage 9a)

`staging.mapadeautoras.com` runs against a hosted Supabase project (`mapa-staging`, region `eu-west-2`) and auto-deploys from every push to `development` via Cloudflare Pages.

See [docs/30-ops/staging-deploy.md](../docs/30-ops/staging-deploy.md) for env-var inventory, key rotation, rollback steps, and gotchas.

Production deployment to `mapadeautoras.com` is deferred to Stage 9b.
```

- [ ] **Step 6: STOP — Task C5 done.**

---

## Task C6 — Verify Slice C end-to-end

- [ ] **Step 1: Confirm the heartbeat workflow runs green**

Visit https://github.com/AJUP86/mapa-de-autoras/actions/workflows/heartbeat.yml — most recent run is green.

- [ ] **Step 2: Read the runbook front-to-back**

Open `docs/30-ops/staging-deploy.md`. Every section is followable without needing to refer to the spec or this plan.

- [ ] **Step 3: Confirm STATUS reflects reality**

Open `docs/STATUS.md`. The Stage 9 split is visible; the 2026-06-12 session log is at the top.

- [ ] **Step 4: `npm run build` still passes**

Run:
```powershell
npm run build
```

Expected: 11 pages built cleanly. No new build-time changes from 9a, but a final sanity check.

- [ ] **Step 5: STOP — Slice C complete.**

Alejandro: review the diff (should be `.github/workflows/heartbeat.yml`, `docs/30-ops/staging-deploy.md`, `docs/01-implementation-plan.md`, `docs/STATUS.md`, `docs/RAG.md`, `.env.example`, `supabase/README.md`). Commit. Suggested message:

```
docs(stage-9a): runbook + STATUS + implementation-plan split into 9a/9b
```

---

## Stage 9a wrap-up (after all three slices)

- [ ] **Open PR `feature/09a-staging-deploy` → `development`.**
- [ ] Review the merge diff one more time. Merge.
- [ ] First push to `development` after merge triggers the real production-scope Pages build → `staging.mapadeautoras.com` updates to the latest commit.
- [ ] Send the staging URL to the project owner / client.

Stage 9b starts in a separate session; this plan is closed at that point.

---

## Self-review checklist

| Spec section | Plan coverage |
|---|---|
| Decision #1 (`development` auto-deploys) | Slice B / Task B2 sets `development` as Pages production branch ✓ |
| Decision #2 (two Supabase projects) | Slice A provisions `mapa-staging`; `mapa-prod` deferred to 9b ✓ |
| Decision #3 (empty DB) | Slice A Step 3 confirms `authors` count = 0; dev-authors seed not run on staging ✓ |
| Decision #4 (built-in mailer for auth) | Slice A Task A8 configures Supabase auth without overriding SMTP ✓ |
| Decision #5 (notify_owner console-log on staging) | Slice A Task A6 explicitly skips `RESEND_API_KEY` ✓ |
| Decision #6 (shared DeepL key) | Slice A Task A6 reuses `.env` value ✓ |
| Decision #7 (Turnstile single site, multi-hostname) | Slice B Task B1 extends existing site ✓ |
| Decision #8 (heartbeat in 9a, matrix-ready) | Slice A Task A1 + Slice C Task C1 ✓ |
| Decision #9 (runbook at `docs/30-ops/staging-deploy.md`) | Slice C Task C4 ✓ |
| Decision #10 (no committed secrets) | All `[Manual]` tasks set values in dashboards; only env-var keys documented in `.env.example` ✓ |
| Decision #11 (three slices, end-to-end verifiable) | Plan structure ✓ |
| Decision #12 (`eu-west-2` region) | Slice A Task A2 ✓ |
| Risk #1 (magic-link redirect mismatch) | Slice A Task A8 + Slice B Task B6 Step 5 verify ✓ |
| Risk #2 (`app.functions_url` typo) | Slice A Task A7 + Slice B Task B6 Step 4 verify ✓ |
| Risk #3 (Pages env vars wrong) | Slice B Task B4 Step 3 + B6 ✓ |
| Risk #4 (Turnstile rejecting staging) | Slice B Task B1 (before deploy) ✓ |
| Risk #5 (auto-pause) | Slice C Task C1 + C3 ✓ |
| Risk #6 (client visits before slice B ready) | Operational note in B5 ✓ |
| Risk #7 (DeepL quota shared) | Acknowledged in spec; no plan action needed ✓ |
| Full verification checklist | Distributed across Slice A/B/C verify steps ✓ |
