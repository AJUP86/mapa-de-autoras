-- Stage 7a — Notify the owner when a new suggestion lands.
--
-- An AFTER INSERT trigger on public.suggestions enqueues an HTTP POST to the
-- notify_owner Edge Function via pg_net. The request runs asynchronously in
-- pg_net's background worker — a failed POST does NOT roll back the INSERT.
-- Failures land in net._http_response for inspection.
--
-- URL strategy:
--   - LOCAL DEV: pg_net runs inside the Postgres container; the host's Edge
--     Runtime is reachable at http://host.docker.internal:54321.
--   - PRODUCTION: set `app.functions_url` via
--       alter database postgres set "app.functions_url" = 'https://<ref>.supabase.co/functions/v1';
--     The trigger reads it via current_setting() and falls back to the dev
--     URL if unset.
--
-- Authorization (MVP posture):
--   - notify_owner has `verify_jwt = false` (same as submit_suggestion).
--   - The trigger sends `X-Webhook-Source: postgres` so the function can do a
--     cheap header check. Not real auth — Stage 9 should either flip
--     verify_jwt on and pass a service-role bearer, or move to the Supabase
--     Database Webhooks UI.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_owner_of_suggestion()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  functions_url text := coalesce(
    current_setting('app.functions_url', true),
    'http://host.docker.internal:54321/functions/v1'
  );
begin
  perform net.http_post(
    url     := functions_url || '/notify_owner',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'X-Webhook-Source', 'postgres'
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

comment on function public.notify_owner_of_suggestion() is
  'AFTER INSERT trigger on public.suggestions. Enqueues an HTTP POST to the notify_owner Edge Function via pg_net. Failures are non-fatal (async).';