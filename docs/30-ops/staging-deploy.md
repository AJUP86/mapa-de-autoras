# Staging deployment — runbook

> Operational reference for `staging.mapadeautoras.com`. Production runbook will live in `docs/30-ops/production-deploy.md` after Stage 9b ships.

## Environment inventory

| Resource | Provider | Region | Console URL |
|---|---|---|---|
| Hosted DB + Auth + Edge Functions | Supabase | `eu-west-1` (Ireland) | `https://supabase.com/dashboard/project/kkdjrzuewnwrlokhemnl` |
| Static site hosting | Cloudflare Pages | global edge | Cloudflare dashboard → Workers & Pages → `mapa-de-autoras` |
| Domain | Cloudflare Registrar | n/a | Cloudflare dashboard → Domain Registration → `mapadeautoras.com` |
| Heartbeat cron | GitHub Actions | GitHub-hosted | `https://github.com/AJUP86/mapa-de-autoras/actions/workflows/heartbeat.yml` |
| Turnstile (bot defence) | Cloudflare Turnstile | n/a | Cloudflare dashboard → Turnstile → `mapa-de-autoras` widget |

## Env vars — where each one lives

| Variable | Location | Scope | Why there |
|---|---|---|---|
| `PUBLIC_SUPABASE_URL` | Cloudflare Pages env vars | **Production** scope (critical) | Read by Astro at build time; baked into the static bundle |
| `PUBLIC_SUPABASE_ANON_KEY` | Cloudflare Pages env vars | **Production** scope | Same |
| `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Pages env vars | **Production** scope | Same |
| `NODE_VERSION` | Cloudflare Pages env vars | **Production** scope | Must be `22` minimum (Node 20 EOL + Supabase Realtime needs WebSocket) |
| `TURNSTILE_SECRET_KEY` | Supabase function settings (staging project) | n/a | Read by `submit_suggestion` at invocation |
| `DEEPL_API_KEY` | Supabase function settings (staging project) | n/a | Read by `translate` at invocation |
| `RESEND_API_KEY` | **Intentionally unset on staging** | n/a | Absence keeps `notify_owner` in console-log mode for 9a |
| `STAGING_SUPABASE_URL` | GitHub Actions secrets | repo-level | Heartbeat workflow |
| `STAGING_SUPABASE_ANON_KEY` | GitHub Actions secrets | repo-level | Heartbeat workflow |
| `app.settings.functions_url` | (intentionally not set) | n/a | Supabase hosted blocks user-defined GUCs even in `app.settings.*` namespace; the notify trigger falls back to a dev URL on staging which fails silently (acceptable — `notify_owner` is console-only on staging). 9b switches to Supabase Database Webhooks. |

## Key rotation

### Supabase anon key

1. Supabase dashboard → Project Settings → API → rotate
2. Update `PUBLIC_SUPABASE_ANON_KEY` in Cloudflare Pages env vars (Production scope)
3. Update `STAGING_SUPABASE_ANON_KEY` in GitHub Actions secrets
4. Trigger a new Pages deploy (Retry deployment, or push a commit)
5. Re-run heartbeat workflow to confirm

### Supabase service-role key

Never used in client code; only briefly in SQL editor. Rotation is dashboard-only — no app changes.

### DeepL API key

1. Generate new key at `https://www.deepl.com/account/api`
2. Supabase function settings → update `DEEPL_API_KEY` (staging project)
3. Re-deploy `translate` to pick up the new env var:
   ```bash
   supabase functions deploy translate --project-ref kkdjrzuewnwrlokhemnl --no-verify-jwt
   ```
4. Update local `.env`

### Turnstile secret

1. Cloudflare dashboard → Turnstile → `mapa-de-autoras` widget → **Rotate Secret Key**. **Copy immediately** — it won't be shown again.
2. Update `TURNSTILE_SECRET_KEY` in Supabase function settings (staging project)
3. Update local `.env` (line 22)
4. Site key does not rotate independently; if you want a fully fresh secret + site key, create a new widget and migrate.

## Rollback

### Pages deployment rollback

1. Pages project → Deployments tab
2. Find the last known-good deployment
3. `⋯` menu → **Rollback to this deployment**
4. Custom domain redirects to the rollback within ~30s

### Migration rollback

Supabase has no native rollback. Write a forward-fix migration and `supabase db push`. No PITR on free tier — back up critical data manually before risky migrations.

## Free-tier auto-pause recovery

If the heartbeat fails to fire (e.g., GitHub Actions outage) and the project pauses:

1. Visit `https://supabase.com/dashboard/project/kkdjrzuewnwrlokhemnl`
2. Click **Restore project**
3. Wait ~2 minutes for the project to come back online
4. Trigger a fresh Pages build so the site reconnects cleanly

## Gotchas surfaced during Stage 9a

- **Cloudflare Pages env vars are scope-specific.** Setting them in "Preview" scope only leaves Production deploys without env vars → build succeeds but the bundle bakes in `undefined` (or fallback URLs in `src/lib/supabase.ts:32`). Always set to **Production** scope when the production branch points at `development`.
- **Node 20 is EOL + breaks Supabase Realtime.** `@supabase/realtime-js` needs native WebSocket support → Node 22 minimum on Cloudflare Pages builds. Set `NODE_VERSION=22` as an env var.
- **Hosted Supabase locks `verify_jwt = true` causes CORS preflight failures.** Browser strips Authorization from OPTIONS preflight → platform-level JWT check rejects with 401 → no CORS headers → browser blocks the actual POST. Fix: `verify_jwt = false` in `supabase/config.toml` + dashboard toggle OFF; in-function `decodeJwtPayload` + admin-role check provides the same security.
- **`supabase functions deploy` doesn't always sync `verify_jwt` setting.** Use `--no-verify-jwt` flag explicitly, OR flip the toggle in Supabase dashboard → Functions → translate.
- **CORS preflight needs `apikey` and `x-client-info` in Allow-Headers.** `supabase-js` sends both automatically. Function `CORS_HEADERS` must list them or browser blocks the POST. See `supabase/functions/translate/index.ts:18`.
- **Hosted Supabase rejects user-defined GUCs.** `alter database postgres set "app.functions_url" = ...` and even `app.settings.functions_url` fail with `permission denied`. The notify trigger's fallback URL writes harmless rows to `net._http_response` on staging — acceptable because `notify_owner` is console-log only here. 9b will pivot to Supabase Database Webhooks (UI-configured, no GUC needed).
- **Magic-link auth `site_url` and Redirect URLs are strict.** Must match the staging origin character-for-character. Configured in Supabase dashboard → Auth → URL Configuration.
- **Magic-link emails go to your real inbox via Supabase's built-in mailer** (4 emails/hour limit). Check spam — sender is `noreply@mail.supabase.io` which can land in spam without DKIM. 9b routes auth via Resend on `mapadeautoras.com` for better deliverability.
- **GitHub Actions only shows workflows in the UI from the default branch.** If a workflow file exists only on a feature branch, the Actions tab won't display it (redirects to `actions/new`). Triggers via `gh workflow run` or the API still work. Once the branch merges to the default branch, the UI surfaces it.
- **Turnstile widget needs all hostnames listed.** Current widget allows: `localhost`, `127.0.0.1`, `staging.mapadeautoras.com`, `mapadeautoras.com`, `www.mapadeautoras.com`. Add new hostnames before deploying.
- **Local + hosted Postgres are both major 17** (staging `17.6.1.127`; `config.toml` `[db].major_version = 17` since Stage 9a-ii). If a stale PG15 local volume makes `supabase start` crash-loop after a CLI update ("data directory initialized by version 15, incompatible with 17"), reset it: `supabase stop --no-backup` → `npm run dev:db` → `npm run dev:db:reset` (wipes local data; re-bootstrap admin). The dashboard offers a PG patch upgrade (`17.6.1.127` → `.141`) — deferred to 9b; keep staging + prod on the same patch.
- **Heartbeat workflow live-trigger deferred to post-merge** (Stage 9a). The workflow file exists on `feature/09a-staging-deploy` only and won't appear in the Actions UI until merged to the default branch. Confirm the first scheduled run on Monday 06:00 UTC after merge, OR manually trigger it via the UI once it's indexed.
- **Public map data is live via Supabase Realtime (since Stage 9a-ii).** `<MapSection>` fetches the catalog on mount and subscribes to `postgres_changes` on `public.authors` + `public.books`; promoted authors propagate to all open tabs within ~1s, no rebuild. See [ADR 0005](../adr/0005-realtime-map-data.md). If the map looks stale, check the devtools WebSocket panel (`…/realtime/v1/websocket`); disconnects auto-resync via a one-shot `getCatalog()` on rejoin. **Gotcha (fixed in migration 0009):** Supabase Realtime truncates `char(3)`/`bpchar` columns to one character in `postgres_changes` payloads — the ISO code columns are now `text`. Keep any new realtime-published columns off `char(n)`.
- **AdminAwareNav polls the suggestion pending-count every 60s.** Expected behavior — repeated HEAD requests to `/suggestions?select=id&status=eq.pending` in the network panel are by design. Lives behind a Realtime-subscription upgrade in [40-phase2-backlog.md](../40-phase2-backlog.md).

## Adding production (9b) — what changes

When Stage 9b lands:

- Create `mapa-prod` Supabase project in same region (`eu-west-1`)
- Create production runbook at `docs/30-ops/production-deploy.md` (copy this file, swap values)
- Update `.github/workflows/heartbeat.yml` matrix to add `production` entry with `PROD_SUPABASE_URL` + `PROD_SUPABASE_ANON_KEY` GitHub Actions secrets
- Create a separate Cloudflare Pages project (`mapa-de-autoras-prod`) with production branch = `master`, pointing at `mapadeautoras.com` + `www.mapadeautoras.com`
- Set `NODE_VERSION=22` in Production scope on the new Pages project
- Resend domain auth on `mapadeautoras.com` (SPF/DKIM/DMARC records)
- Set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + `OWNER_NOTIFICATION_EMAIL` on the prod Supabase function settings
- **Pivot the notify trigger to Supabase Database Webhooks** (dashboard-configured per environment; replaces the `app.functions_url` GUC approach which Supabase hosted blocks)
- HTML email template for `notify_owner` (deeplink to admin inbox, country flag, submitter info — see `40-phase2-backlog.md` for the spec)
