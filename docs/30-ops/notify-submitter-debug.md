# notify_submitter — debugging runbook

Operational reference for the Stage 8 notification flow: submitter opts in → admin promotes → submitter receives one email.

Related:
- Spec: [docs/specs/2026-07-20-stage-8-notify-submitter-design.md](../specs/2026-07-20-stage-8-notify-submitter-design.md)
- Plan: [docs/plans/2026-07-20-stage-8-notify-submitter-implementation.md](../plans/2026-07-20-stage-8-notify-submitter-implementation.md)
- Function code: `supabase/functions/notify_submitter/`

---

## Architecture cheat-sheet

```
suggestions UPDATE (status → 'approved', promoted_author_id set)
  → Supabase Database Webhook `notify_submitter_on_promote`
  → POST /functions/v1/notify_submitter (Authorization: Bearer <service_role>)
  → guards (status, accepted_newsletter, notified_at, promoted_author_id)
  → conditional claim notified_at = now() WHERE notified_at IS NULL
  → POST to Resend API
  → return 200
```

Function guards short-circuit non-target rows with a 200 + reason string. The dashboard-level webhook filter is intentionally minimal (or absent — this UI version doesn't expose conditional filters); the function does the filtering itself, so a stray UPDATE to `suggestions` returns `{"ok":true,"reason":"not_opted_in"}` etc. and no email fires.

---

## The single most useful diagnostic query

`pg_net` records every webhook HTTP response in `net._http_response`. Run this in the Supabase SQL editor (staging or prod) whenever "the notification didn't fire":

```sql
select id, status_code, error_msg, content, created
from net._http_response
order by created desc
limit 5;
```

Read the newest row:

| Row shape | What it means | Fix |
|---|---|---|
| `status_code = 200` + `content = {"ok":true}` | Function accepted + sent to Resend | Check Gmail spam folder |
| `status_code = 200` + `content = {"ok":true,"reason":"not_opted_in"}` | `accepted_newsletter` was false on the row | Submitter didn't tick the checkbox — working as designed |
| `status_code = 200` + `content = {"ok":true,"reason":"already_notified"}` | `notified_at` was already set | Idempotency guard fired; safe |
| `status_code = 200` + `content = {"ok":true,"reason":"no_promoted_author"}` | `promoted_author_id` still NULL | Suggestion wasn't fully promoted OR migration 0010 hasn't run on this env |
| `status_code = 401` + `content = {"error":"unauthorized"}` | Webhook Authorization header missing/malformed | See "Auth 401" below |
| `status_code = 500` + `content = {"error":"resend_failed", ...}` | Resend rejected the send | Check `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and Resend dashboard → Emails |
| `error_msg = "Couldn't resolve host name"` (status_code NULL) | Webhook URL malformed | Edit webhook: URL should be `https://<project-ref>.supabase.co/functions/v1/notify_submitter` |
| No rows or nothing from the relevant timestamp | Webhook trigger didn't fire | Check that the webhook exists and is enabled at Dashboard → Integrations → Database Webhooks |

## Auth 401 (the fragile case)

Root cause: the Authorization header value on the webhook does NOT need to strictly match `SUPABASE_SERVICE_ROLE_KEY` — Supabase's platform-level `verify_jwt=true` (default) validates the JWT before the function runs. The function's in-function check only requires "some Bearer token is present" (see `notify_submitter/index.ts` — the check was intentionally relaxed after Slice D showed how easy it is to truncate a JWT when copying it into the webhook UI).

If you still see 401:
1. Webhook Authorization value must start with `Bearer ` (Bearer + one space) followed by ANY signed project JWT — service_role is easiest.
2. Dashboard → Integrations → Database Webhooks → click the webhook → verify the Authorization header is present and not empty.
3. If you paste a fresh service_role key: use the Supabase dashboard's "Copy" button on the API Settings page — never manually select + Ctrl+C (that's how JWTs get truncated).

## Wrong-language email

Root cause: `suggestions.locale` was not set when the submission happened.
- New submissions from Stage 8+: `submit_suggestion` writes `body.locale` on insert. `locale` will be `es` or `en`.
- Pre-Stage-8 rows: backfilled to `'es'` via the migration default. If an English submitter existed before Stage 8 and their suggestion is only now being promoted, the email will render in Spanish. Not a bug per se; correct behavior for rows lacking locale.

## Duplicate emails

Should be impossible thanks to the `notified_at IS NULL` conditional UPDATE claim in the function. If a duplicate lands:
- Check whether someone manually ran `update suggestions set notified_at = null where id = ...` between webhook deliveries.
- Check whether the promote RPC was run twice on the same suggestion id (creates two rows in `authors` but only one suggestion resolution).

## No email arrived, but `net._http_response` shows 200

Function claimed the send and got 200 from Resend, but the email didn't land. Order of checks:
1. Gmail spam folder (Resend's `onboarding@resend.dev` shared-shell address commonly gets flagged on first send).
2. Resend dashboard → Emails — is there a row for the send? What's its delivery status?
3. Check the recipient address on the `suggestions` row (`submitter_email`) — is it the address you're monitoring?
4. **Recipient restriction on unverified Resend accounts:** Resend refuses to send to any address other than the account owner's until a domain is verified. If the submitter is NOT the account owner, the send silently succeeds at API level but Resend blocks delivery. Fix in Stage 9b (domain auth for `mapadeautoras.com`).

## Manual retry (force a resend)

If you want to re-fire the webhook against an existing row:

```sql
-- Reset the claim so the next webhook trigger will send again.
update public.suggestions set notified_at = null where id = '<uuid>';

-- Trigger a real UPDATE cycle (webhook fires on column changes only —
-- setting a value to itself sometimes does not count as a change):
update public.suggestions set status = 'pending'  where id = '<uuid>';
update public.suggestions set status = 'approved' where id = '<uuid>';
```

Then re-query `net._http_response` to see the outcome.

---

## Deploy quirks (Windows + Supabase CLI 2.102)

`supabase functions deploy <name>` hangs silently after the `Using profile:` line on Windows with CLI 2.102 (attempted local Deno bundling fails without visible output). Always append `--use-api`:

```
supabase functions deploy notify_submitter --project-ref kkdjrzuewnwrlokhemnl --use-api
```

`--use-api` uses Supabase's server-side bundling and works reliably. Use this for all Edge Function deploys from Windows.

## Local dev short-circuit

If `RESEND_API_KEY` is absent (e.g. running locally without a Resend key configured), the function returns `200 {"ok":true,"skipped":true}` and logs a warning. This is intentional: local dev flows for submit + promote work end-to-end without email side-effects.

## Function logs quirks

Supabase Edge Functions log entries you'll see per invocation:
- `Boot` — function isolate started (usually ~30ms)
- `Shutdown` with `reason: "EarlyDrop"` — Deno runtime dropped the isolate. Not necessarily an error — it fires after every request completes.

There is no explicit "request/response" log entry with the status code in the current Edge Functions logs UI. Use `net._http_response` (SQL query above) for the actual HTTP outcome — it's the source of truth.

---

## Config drift risk

The webhook config lives in the Supabase dashboard, not in git. If someone deletes or disables it, emails stop with no visible error in the app. **Follow-up (post-launch):** add a smoke check to the heartbeat workflow that submits + promotes a test suggestion once a week and asserts `notified_at` is populated within N seconds.

## Filter expression currently in use

The current Supabase dashboard UI (as of 2026-07) does not expose conditional filters on Database Webhooks — the webhook fires on ALL `suggestions UPDATE` events. The function's internal guards handle the filtering. Zero user-visible impact; a small increase in unnecessary invocations that's nowhere near the free-tier ceiling.

- **Staging:** no dashboard filter; internal function guards.
- **Prod (Stage 9b):** to be configured identically.
