-- Stage 9a — Fix notify URL setting path for hosted Supabase.
--
-- Hosted Supabase restricts the `postgres` role to writable GUCs in the
-- `app.settings.*` namespace only. Other custom prefixes (like the
-- `app.functions_url` used in migration 0003) fail with
-- `permission denied to set parameter`.
--
-- This migration replaces the trigger function with a copy that reads
-- `app.settings.functions_url` instead. Behaviour is otherwise identical;
-- local dev continues to work via the fallback URL.
--
-- On the hosted project, set the new GUC with:
--   alter database postgres
--     set "app.settings.functions_url" = 'https://<project-ref>.supabase.co/functions/v1';

create or replace function public.notify_owner_of_suggestion()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  functions_url text := coalesce(
    current_setting('app.settings.functions_url', true),
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

comment on function public.notify_owner_of_suggestion() is
  'AFTER INSERT trigger on public.suggestions. Enqueues an HTTP POST to the notify_owner Edge Function via pg_net. Reads URL from app.settings.functions_url GUC, falls back to local dev URL. Failures are non-fatal (async).';