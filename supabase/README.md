# Supabase — local development

Local Postgres + Auth + Studio for **mapa-de-autoras**, run via the Supabase CLI on top of Docker.

## Prerequisites

- Docker Desktop running
- Supabase CLI installed (`supabase --version` ≥ `2.x`)
  - Windows: `scoop install supabase` (after `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git`)
  - macOS: `brew install supabase/tap/supabase`

## Quick start (3 terminals)

After `npm install` and `cp .env.example .env` (fill the values per the comments in `.env.example`):

```sh
# Terminal A — Postgres + Auth + Studio + Mailpit
npm run dev:db

# Terminal B — Edge Functions
npm run dev:functions

# Terminal C — Astro
npm run dev
```

First-run only: `npm run dev:db:reset` after the stack is up, to apply migrations + seeds. See **Apply migrations + seed** below for what that runs.

| Script | What it does |
| --- | --- |
| `npm run dev:db` | `supabase start` — brings up the local stack |
| `npm run dev:db:reset` | `supabase db reset` — replays migrations + seeds |
| `npm run dev:db:stop` | `supabase stop` — tears the stack down |
| `npm run dev:functions` | Serves the `submit_suggestion` Edge Function with `--env-file .env` |
| `npm run dev:types` | Regenerates `src/types/supabase.ts` from the running DB |
| `npm run dev` | Astro dev server on `http://localhost:4321` |

## Start the local stack

First time only (pulls ~1.5 GB of Docker images, takes 5–15 minutes):

```sh
npm run dev:db          # = supabase start
```

When the stack is up, the CLI prints local URLs and keys. Copy the printed `anon key` and `service_role key` into a new `.env` file (see `.env.example` at the repo root).

Subsequent starts are < 30 seconds. `dev:db:stop` is non-destructive — data persists across stop/start. Use `dev:db:reset` to actually wipe and re-seed.

## Apply migrations + seed

```sh
npm run dev:db:reset    # = supabase db reset
```

This drops the local database, replays every migration in `supabase/migrations/` in order, then runs both seeds:

1. `supabase/seed.sql` — 249 ISO 3166-1 countries.
2. `supabase/seeds/dev-authors.sql` — 30 sample authors + books across 16 countries (dev only; idempotent on rerun).

Both paths are wired via `[db.seed].sql_paths` in `supabase/config.toml`.

## Run the Edge Function

The suggestion form (Stage 6) posts to `submit_suggestion`. Serve it locally:

```sh
npm run dev:functions
```

Listens on `http://127.0.0.1:54321/functions/v1/submit_suggestion`. The function reads `TURNSTILE_SECRET_KEY` from your `.env` (passed via `--env-file`); `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the runtime.

`verify_jwt = false` is set in `config.toml`, so the function accepts anonymous POSTs — Cloudflare Turnstile is our gate, not JWT.

## Local URLs

| Service | URL |
| --- | --- |
| API (PostgREST + GoTrue) | http://127.0.0.1:54321 |
| Studio (Postgres GUI) | http://127.0.0.1:54323 |
| Postgres DB | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Mailpit (local SMTP sandbox) | http://127.0.0.1:54324 |

## Schema overview

See [docs/adr/0003-data-model.md](../docs/adr/0003-data-model.md) for the canonical reference. Six tables:

1. `countries` — ISO 3166-1 seeded (~249 rows).
2. `authors` — female writers; `status` = `read` | `discovery`; `published` gates visibility.
3. `books` — per author.
4. `book_links` — retailer links per book per locale.
5. `suggestions` — public suggestion queue. Anon **cannot** INSERT directly (migration 0002); the `submit_suggestion` Edge Function uses service-role after verifying Turnstile. Admin manages the inbox.
6. `subscribers` — double opt-in newsletter list. Same write path as `suggestions`.

## RLS model

Row-Level Security enforces the security boundary. The public site uses the `anon` key; the admin page (Stage 6+) uses an authenticated session with `app_metadata.role = 'admin'`.

| Role | Tables it can read | Tables it can write |
| --- | --- | --- |
| `anon` | `countries`, **published** `authors` + their `books` + `book_links` | **None directly** — `suggestions` + `subscribers` writes flow through the Edge Function (service-role, after Turnstile) |
| Admin (`app_metadata.role = 'admin'`) | All | All |
| `service_role` (server-side only) | All (RLS bypassed) | All (RLS bypassed) |

The common predicate is the SQL function `public.is_admin()`, which checks `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.

## Bootstrap an admin user (one-time)

After the first `supabase start`, create your owner account via Studio (`http://127.0.0.1:54323` → Authentication → Users → Add user), then mark it as admin:

```sql
update auth.users
set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', '"admin"')
where email = 'YOUR-OWNER-EMAIL@example.com';
```

Run that SQL from Studio's SQL Editor. From this point onward, `public.is_admin()` returns `true` for sessions issued to that user.

> **In production**, do the same on the hosted Supabase project (via the Supabase dashboard's SQL Editor) for the production owner account. Never expose the `service_role` key client-side; only `anon` key goes into the browser.

## Smoke-test RLS

After `npm run dev:db:reset`, verify the policies hold:

```sql
-- as anon (default role on the studio SQL editor when "Run as: anonymous"):
select count(*) from public.countries;       -- > 0 (public read)
select count(*) from public.authors;         -- 30 published (from dev-authors.sql)
select count(*) from public.suggestions;     -- 0 (anon cannot read)

-- anon INSERT must FAIL after migration 0002 — submissions go via the Edge Function:
insert into public.suggestions
  (submitter_email, proposed_author_name, proposed_country_iso_a3)
  values ('test@example.com', 'Test Author', 'ESP');
-- expected: ERROR: new row violates row-level security policy
```

To verify the full write path works, POST to the Edge Function instead — easiest via the `/suggest` form at `http://localhost:4321/suggest`. Switch the SQL Editor's role to `service_role` to read the resulting suggestions.

## Reset workflow

| Goal | Command |
| --- | --- |
| Apply new migrations + reseed | `npm run dev:db:reset` |
| Wipe everything and start fresh | `npm run dev:db:stop && npm run dev:db` |
| Regenerate frontend types from the live schema | `npm run dev:types` |

## Production

Stage 9 ports this same migration set to a hosted Supabase project. `supabase link --project-ref <id>` + `supabase db push` will replay the migrations against production.
