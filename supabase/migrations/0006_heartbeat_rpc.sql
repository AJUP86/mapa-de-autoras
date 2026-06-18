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
