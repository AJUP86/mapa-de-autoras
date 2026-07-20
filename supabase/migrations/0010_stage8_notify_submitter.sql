-- Stage 8 — Notify submitter on promote.
--
-- Adds three columns to public.suggestions:
--   - locale             : submitter's language (used to render notification email)
--   - promoted_author_id : FK back to the created author (nullable; set at promote time)
--   - notified_at        : idempotency marker for the notify_submitter Edge Function
--
-- Also re-declares the promote_suggestion RPC with a single-line addition:
-- the resolve-suggestion UPDATE now also sets promoted_author_id = new_author_id.
-- Body is otherwise byte-for-byte identical to migration 0005.

alter table public.suggestions
  add column locale text not null default 'es'
    check (locale in ('es', 'en')),
  add column promoted_author_id uuid
    references public.authors(id) on delete set null,
  add column notified_at timestamptz;

comment on column public.suggestions.locale is
  'Submitter locale (ES/EN) captured from the suggest form. Used to render notification email.';
comment on column public.suggestions.promoted_author_id is
  'Author created when this suggestion was promoted. NULL until promote_suggestion runs.';
comment on column public.suggestions.notified_at is
  'Timestamp of successful notify_submitter email send. Idempotency guard; NULL until sent.';
comment on column public.suggestions.accepted_newsletter is
  'True when submitter opted in to be notified when their suggestion is promoted. (Future: repurpose for newsletter opt-in when that feature ships.)';

-- Re-declare promote_suggestion. Body copied from 0005 with one addition:
-- `promoted_author_id = new_author_id` inside the resolve-suggestion UPDATE.

create or replace function public.promote_suggestion(
  p_suggestion_id uuid,
  p_author        jsonb,
  p_books         jsonb[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_author_id uuid;
  base_slug     text;
  final_slug    text;
  collision_n   int := 1;
  book_json     jsonb;
  book_order    int := 0;
  name_in       text;
  iso_in        text;
begin
  if not public.is_admin() then
    raise exception 'unauthorized: admin only';
  end if;

  name_in := nullif(trim(p_author->>'name'), '');
  iso_in  := nullif(trim(p_author->>'country_iso_a3'), '');
  if name_in is null then
    raise exception 'validation: name required';
  end if;
  if iso_in is null or length(iso_in) <> 3 then
    raise exception 'validation: country_iso_a3 invalid';
  end if;
  if (p_author->>'status') is null
     or (p_author->>'status') not in ('read', 'currently_reading', 'discovery') then
    raise exception 'validation: status invalid';
  end if;
  if p_books is null or array_length(p_books, 1) is null or array_length(p_books, 1) < 1 then
    raise exception 'validation: at least one book required';
  end if;

  if exists (
    select 1 from public.authors
    where lower(name) = lower(name_in)
      and country_iso_a3 = iso_in
  ) then
    raise exception 'duplicate_author: % already exists in %', name_in, iso_in;
  end if;

  base_slug := public.slugify(name_in) || '-' || lower(iso_in);
  final_slug := base_slug;
  while exists (select 1 from public.authors where slug = final_slug) loop
    collision_n := collision_n + 1;
    final_slug := base_slug || '-' || collision_n::text;
  end loop;

  insert into public.authors (
    name, slug, country_iso_a3, status, bio_es, bio_en, photo_url,
    birth_year, death_year, published
  )
  values (
    name_in,
    final_slug,
    iso_in,
    (p_author->>'status')::public.author_status,
    nullif(p_author->>'bio_es', ''),
    nullif(p_author->>'bio_en', ''),
    nullif(p_author->>'photo_url', ''),
    nullif(p_author->>'birth_year', '')::smallint,
    nullif(p_author->>'death_year', '')::smallint,
    coalesce((p_author->>'published')::boolean, true)
  )
  returning id into new_author_id;

  foreach book_json in array p_books loop
    if coalesce(trim(book_json->>'title'), '') = '' then
      raise exception 'validation: book title required (index %)', book_order;
    end if;
    insert into public.books (
      author_id, title, year, original_language, cover_url,
      description_es, description_en, display_order
    )
    values (
      new_author_id,
      book_json->>'title',
      nullif(book_json->>'year', '')::smallint,
      nullif(book_json->>'original_language', ''),
      nullif(book_json->>'cover_url', ''),
      nullif(book_json->>'description_es', ''),
      nullif(book_json->>'description_en', ''),
      book_order
    );
    book_order := book_order + 1;
  end loop;

  if p_suggestion_id is not null then
    update public.suggestions
      set status              = 'approved',
          reviewed_at         = now(),
          reviewer_notes      = nullif(p_author->>'reviewer_notes', ''),
          promoted_author_id  = new_author_id   -- Stage 8 addition
      where id = p_suggestion_id;
  end if;

  return new_author_id;
end;
$$;

grant execute on function public.promote_suggestion(uuid, jsonb, jsonb[]) to authenticated;
