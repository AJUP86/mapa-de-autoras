-- Stage 7b-i — Promote-suggestion prep.
--
-- 1. unaccent extension — needed by slugify() to fold accents in author
--    names ("Gabriela Mistral" → "gabriela-mistral", "María José" →
--    "maria-jose"). Standard Supabase extension; no auth changes.
-- 2. public.slugify(text) helper — pure function. Lowercase, strip accents,
--    replace non-alphanumeric runs with single dashes, trim leading/trailing
--    dashes. Used by promote_suggestion() to generate author slugs.
-- 3. author_status enum gains 'currently_reading'. The existing values
--    'read' and 'discovery' are unchanged. Postgres requires adding enum
--    values outside a transaction, hence ALTER TYPE ... ADD VALUE here
--    (no BEGIN/COMMIT around it).

create extension if not exists unaccent with schema extensions;

create or replace function public.slugify(input text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(extensions.unaccent(input)), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

comment on function public.slugify(text) is
  'URL-safe slug from arbitrary text. Lowercases, folds accents via unaccent, collapses non-alphanumerics to single dashes, trims edge dashes.';

alter type public.author_status add value if not exists 'currently_reading';
