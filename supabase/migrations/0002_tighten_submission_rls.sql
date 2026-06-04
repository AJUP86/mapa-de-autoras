-- Stage 6 — tighten RLS on suggestions + subscribers.
--
-- The original policies (from 0001_init.sql) allowed `anon` to INSERT a
-- pending row directly via PostgREST. That bypasses Cloudflare Turnstile —
-- an attacker could write a script that hits /rest/v1/suggestions and floods
-- the inbox with no CAPTCHA check.
--
-- Stage 6 routes all writes through the `submit_suggestion` Edge Function,
-- which uses the service-role key (bypasses RLS entirely). Removing the anon
-- INSERT policies makes the Edge Function the only legitimate write path.
--
-- Admin/authenticated policies stay untouched (they manage the inbox).

drop policy if exists "anyone can submit a suggestion" on public.suggestions;
drop policy if exists "anyone can subscribe"          on public.subscribers;

-- Refresh table comments so anyone browsing Studio sees the new write path.

comment on table public.suggestions is
  'Public suggestion queue. Writes flow through the submit_suggestion Edge Function (uses service-role; verifies Turnstile). RLS denies direct anon INSERT — see migration 0002.';

comment on table public.subscribers is
  'Self-rolled double-opt-in newsletter list. Pending rows are written by the submit_suggestion Edge Function (Stage 6) or a future subscribe-only function. Anon cannot INSERT directly — see migration 0002.';
