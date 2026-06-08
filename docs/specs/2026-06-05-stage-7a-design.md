# Stage 7a — Notify + Auth + Read-only Inbox

**Date:** 2026-06-05
**Branch:** `feature/07a-notify-and-auth`
**Status:** Design approved, ready to implement.

> Companion to [docs/01-implementation-plan.md § Stage 7](../01-implementation-plan.md). This document captures the design decisions for the first half of the split Stage 7. Stage 7b (review/promote + author CRUD) gets its own spec when we get there.

---

## Scope

**In:**
- Owner gets an email within seconds when a public suggestion lands in `public.suggestions`.
- Owner can log in via magic-link at `/admin/login`.
- Owner sees a read-only inbox at `/admin` listing pending suggestions (newest first).
- Clicking a row navigates to `/admin/suggestions/[id]` — a placeholder page in 7a, full review form in 7b.

**Out (lives in 7b):**
- Promote-suggestion form (write `authors` + `books` + `book_links`).
- Author / book / book_links CRUD pages.
- The translation-strategy ADR (only matters for 7b's bilingual content forms).

---

## Decisions

| # | Decision | Choice | Rationale |
| --- | --- | --- | --- |
| 1 | Page rendering | Static Astro pages + client-side auth check, RLS-gated PostgREST | Matches existing architecture; no SSR adapter change before Stage 9 |
| 2 | i18n | Spanish-only, bilingual-ready via `t()` + `admin.*` namespace | Owner-facing UI; zero refactor cost to add EN later |
| 3 | Email transport | Inbucket in dev (magic-links); `notify_owner` Edge Function logs to console when `RESEND_API_KEY` is empty, sends via Resend when present | Defers Resend account setup to Stage 8 (newsletter); function code is identical dev↔prod |
| 4 | Notification mechanism | Postgres `AFTER INSERT` trigger calling `pg_net.http_post()` to the Edge Function | Single source of truth in migration; works dev + prod identically; no dashboard webhook UI to configure |
| 5 | Auth API | `supabase.auth.signInWithOtp({ email })` with `emailRedirectTo: '/admin'` | Magic-link flow with the existing GoTrue setup; `enable_signup = false` already in `config.toml` |
| 6 | Authorization gate | RLS `is_admin()` on every read; client-side `<AdminGate>` just redirects unauthenticated to login (UX) | RLS is the real authorization boundary; client redirect is convenience |

---

## Architecture

### File layout

```
src/
  components/
    AdminGate.tsx              # session check + redirect-if-unauth wrapper
    AdminLoginForm.tsx         # magic-link request form
    AdminInbox.tsx             # list of pending suggestions
  lib/
    admin-session.ts           # supabase.auth wrappers; isAdmin() helper
    suggestions.ts             # readSuggestions() — uses authed JWT, RLS-gated
  pages/
    admin/
      login.astro              # /admin/login
      index.astro              # /admin (inbox)
      suggestions/
        [id].astro             # /admin/suggestions/:id  — placeholder for 7b

supabase/
  migrations/
    0003_notify_owner_trigger.sql
  functions/
    notify_owner/
      index.ts                 # Postgres-trigger-invoked; calls Resend or logs

src/i18n/
  es.json                      # adds `admin.*` namespace
  en.json                      # empty `admin.*` stub for bilingual-readiness
```

### Data flow — notification

```
POST /functions/v1/submit_suggestion        (anon, Stage 6)
  └─► INSERT INTO public.suggestions        (service-role, bypasses RLS)
        └─► AFTER INSERT trigger             (0003 migration)
              └─► pg_net.http_post(...)      (async, non-blocking)
                    └─► POST /functions/v1/notify_owner
                          ├─ if RESEND_API_KEY:  POST resend.com/emails
                          └─ else:               console.log(payload)
```

The trigger is async via `pg_net`. If the Edge Function errors, the INSERT still succeeds — the suggestion is captured even if the email fails. Failures land in `net._http_response` for inspection.

### Data flow — admin auth + inbox

```
/admin/login
  └─► <AdminLoginForm>
        └─► supabase.auth.signInWithOtp({ email, emailRedirectTo: '/admin' })
              └─► GoTrue sends magic-link → Inbucket (dev) or Supabase mailer (prod)

User clicks link in email
  └─► /admin (Supabase exchanges OTP for session in URL hash, persists to localStorage)
        └─► <AdminGate>
              ├─ getSession() → no session: redirect → /admin/login
              ├─ getSession() → not admin:  signOut + show error
              └─ getSession() → admin:      render children

<AdminInbox>
  └─► supabase.from('suggestions').select(...).eq('status','pending').order('created_at',{ascending:false})
        └─► PostgREST + user JWT → RLS "admins manage suggestions" → rows returned
```

---

## Component contracts

### `<AdminGate>`

```ts
interface Props {
  loginUrl: string;     // where to redirect if no session
  children: ReactNode;  // rendered only when session exists AND is_admin
}
```

- On mount: `supabase.auth.getSession()`.
- If no session → `window.location.replace(loginUrl)`.
- If session but `session.user.app_metadata.role !== 'admin'` → `supabase.auth.signOut()` then redirect.
- Else: render children. Also subscribes to `onAuthStateChange` to handle sign-out from another tab.

### `<AdminLoginForm>`

```ts
interface Props {
  redirectTo: string;   // becomes emailRedirectTo
  labels: { /* i18n strings */ };
}
```

- Single email input + submit button.
- On submit: `signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })`.
- Shows "Revisa tu correo" success state on resolve, error message on reject.

### `<AdminInbox>`

```ts
interface Props {
  labels: { /* i18n strings */ };
}
```

- On mount: query `suggestions` table, filter `status='pending'`, sort `created_at desc`.
- Renders table: date · author · country · email · arrow link to `/admin/suggestions/:id`.
- Empty state: "No hay sugerencias pendientes."
- No pagination (volume tiny; revisit at Stage 10).

### `notify_owner` Edge Function

**Input** (trigger payload):
```json
{
  "type": "INSERT",
  "table": "suggestions",
  "record": { "id": "uuid", "proposed_author_name": "...", ... }
}
```

**Behavior:**
1. Read `OWNER_NOTIFICATION_EMAIL` and `RESEND_API_KEY` from env.
2. If no `RESEND_API_KEY`: `console.log` the payload and return `{ ok: true, sent: false }`.
3. Else: POST to `https://api.resend.com/emails` with a short text body containing the suggestion details and a link to `/admin/suggestions/:id`.
4. Return `{ ok: true, sent: true }` on success; log + return 500 on Resend failure.

**Env it reads:**
- `OWNER_NOTIFICATION_EMAIL` (already in `.env.example`)
- `RESEND_API_KEY` (already in `.env.example`, may be empty in dev)
- `RESEND_FROM_EMAIL` (already in `.env.example`, defaults to `hola@mapadeautoras.com`)
- `PUBLIC_SITE_URL` (new — for the inbox deep-link in the email)

---

## Migration `0003_notify_owner_trigger.sql`

Pseudocode (final SQL written during implementation):

```sql
create extension if not exists pg_net;

create or replace function public.notify_owner_of_suggestion()
returns trigger
language plpgsql
security definer
as $$
declare
  function_url text := current_setting('app.functions_url', true) || '/notify_owner';
  service_key  text := current_setting('app.service_role_key', true);
begin
  perform net.http_post(
    url     := function_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  'suggestions',
      'record', row_to_json(NEW)
    )
  );
  return NEW;
end;
$$;

create trigger notify_owner_after_insert
  after insert on public.suggestions
  for each row execute function public.notify_owner_of_suggestion();
```

The `current_setting()` calls read DB-level settings we set in a follow-up `alter database` statement (or via `[db.settings]` in `config.toml`). The exact mechanism is finalized in the implementation plan — the Supabase CLI exposes the local URL/key in a known way; in prod we set these via `alter database postgres set app.functions_url = ...`.

---

## Incremental delivery

Three commit-sized slices on `feature/07a-notify-and-auth`. Pause for review between each.

### Slice A — Notification path

- `supabase/migrations/0003_notify_owner_trigger.sql`
- `supabase/functions/notify_owner/index.ts`
- `supabase/config.toml` — register `notify_owner` function
- `.env.example` — `PUBLIC_SITE_URL`
- `supabase/README.md` — update with notification flow notes

**Verify:** `npm run dev:db:reset` + `npm run dev:functions` (serving both functions), then submit a suggestion via `/suggest`. Watch the `notify_owner` function logs — payload should print to console with `RESEND_API_KEY` empty.

### Slice B — Auth shell

- `src/lib/admin-session.ts`
- `src/components/AdminGate.tsx`
- `src/components/AdminLoginForm.tsx`
- `src/pages/admin/login.astro`
- `src/pages/admin/index.astro` — temporary "logged in as <email>" placeholder
- `src/i18n/es.json` — `admin.login.*` strings
- `src/i18n/en.json` — empty `admin` stub

**Verify:** visit `/admin/login`, submit your owner email, check Mailpit (`localhost:54324`), click magic-link, land on `/admin` with a session. Visit `/admin` directly (no session) → redirects to `/admin/login`.

### Slice C — Inbox

- `src/components/AdminInbox.tsx`
- `src/lib/suggestions.ts`
- `src/pages/admin/index.astro` — wires `<AdminGate>` + `<AdminInbox>`
- `src/pages/admin/suggestions/[id].astro` — placeholder "Próximamente — Stage 7b"
- `src/i18n/es.json` — `admin.inbox.*` strings

**Verify:** full loop — public submit → email/log fires → log in to `/admin` → row appears → click → land on placeholder.

---

## Verification (end of stage)

1. **Notification** — submit a suggestion; `notify_owner` logs the payload (or sends via Resend if key is set).
2. **Auth gate** — `/admin` without session → redirects to `/admin/login`. With non-admin session → signs out + shows error.
3. **Magic-link** — request link, click from Mailpit, lands on `/admin` authenticated.
4. **Inbox** — see all `pending` suggestions, newest first, including the one from step 1.
5. **Placeholder** — clicking a row navigates to `/admin/suggestions/:id` placeholder page.
6. **Empty state** — with no pending suggestions, inbox shows the empty-state message.
7. **Type-check + build** — `npm run build` passes without errors.

---

## Open items deferred to Stage 7b

- `book_links` shape decision (recommendation (b) — one link per book per locale).
- Translation-strategy ADR — `docs/adr/0004-translation-strategy.md`. Needed before the promote form because that's where bilingual content gets created.
- Suggestion review actions: approve/reject + promote to catalog.
- Author/book/book_links CRUD pages.

## Open items deferred to Stage 9 (deploy)

- Real Resend account + DNS verification for `mapadeautoras.com`.
- Configuring `app.functions_url` and `app.service_role_key` on the hosted Postgres (the trigger needs them).
- Magic-link emails in production: keep Supabase's default mailer for now (owner logs in rarely); revisit if rate limits bite.
- `SUPABASE_SERVICE_ROLE` → `SUPABASE_SERVICE_ROLE_KEY` env-var rename + consumer updates.
