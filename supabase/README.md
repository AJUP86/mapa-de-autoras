# Supabase — local development

Local Postgres + Auth + Studio for **mapa-de-autoras**, run via the Supabase CLI on top of Docker.

## Prerequisites

- Docker Desktop running
- Supabase CLI installed (`supabase --version` ≥ `2.x`)
  - Windows: `scoop install supabase` (after `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git`)
  - macOS: `brew install supabase/tap/supabase`

## Start the local stack

First time only (pulls ~1.5 GB of Docker images, takes 5–15 minutes):

```sh
supabase start
```

When the stack is up, the CLI prints local URLs and keys. Copy the printed `anon key` and `service_role key` into a new `.env` file (see `.env.example` at the repo root).

Subsequent starts are < 30 seconds:

```sh
supabase start    # bring up
supabase stop     # tear down (data persists across stop/start)
```

## Apply migrations + seed

```sh
supabase db reset
```

This drops the local database, replays every migration in `supabase/migrations/` in order, and runs `supabase/seed.sql`. Idempotent — run it any time you want a clean slate.

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
5. `suggestions` — public suggestion queue (anon INSERT only; admin manages).
6. `subscribers` — double opt-in newsletter list (anon INSERT only; admin manages).

## RLS model

Row-Level Security enforces the security boundary. The public site uses the `anon` key; the admin page (Stage 6+) uses an authenticated session with `app_metadata.role = 'admin'`.

| Role | Tables it can read | Tables it can write |
| --- | --- | --- |
| `anon` | `countries`, **published** `authors` + their `books` + `book_links` | INSERT into `suggestions` (status = 'pending'), INSERT into `subscribers` (status = 'pending') |
| Admin (`app_metadata.role = 'admin'`) | All | All |

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

After `supabase db reset`, verify the policies hold:

```sql
-- as anon (default role on the studio SQL editor when "Run as: anonymous"):
select count(*) from public.countries;       -- > 0 (public read)
select count(*) from public.authors;         -- 0 (no published rows seeded)
insert into public.suggestions
  (submitter_email, proposed_author_name, proposed_country_iso_a3)
  values ('test@example.com', 'Test Author', 'ESP');  -- succeeds
select count(*) from public.suggestions;     -- 0 (anon cannot read)
```

Switch the SQL Editor's role to `service_role` (or sign in as your admin user) to read suggestions.

## Reset workflow

| Goal | Command |
| --- | --- |
| Apply new migrations | `supabase db reset` |
| Wipe everything and start fresh | `supabase stop --no-backup && supabase start` |
| Generate types for the frontend | `supabase gen types typescript --local > src/types/supabase.ts` *(Stage 4+)* |

## Production

Stage 9 ports this same migration set to a hosted Supabase project. `supabase link --project-ref <id>` + `supabase db push` will replay the migrations against production.
