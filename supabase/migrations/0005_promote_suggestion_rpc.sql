-- Stage 7b-i — promote_suggestion() RPC.
--
-- Atomic write of one author + ≥1 books, optionally resolving a pending
-- suggestion. Postgres wraps the function body in an implicit transaction;
-- any raise rolls back all inserts/updates.
--
-- SECURITY DEFINER lets the function bypass RLS for the multi-table writes,
-- but the first thing it does is assert is_admin() — so only admins can
-- effectively call it.
--
-- Slug strategy: base_slug = slugify(name) || '-' || lower(iso_a3). If a
-- row with that slug exists, append '-2', '-3', ... until unique. The
-- caller never sees or supplies the slug — it's pure server bookkeeping.
--
-- Duplicate guard: (lower(name), country_iso_a3) is the semantic uniqueness
-- check. The slug uniqueness handled by the WHILE-loop is a defence-in-depth
-- for case differences and accents that map to the same slug.

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
  -- Authn / authz gate
  if not public.is_admin() then
    raise exception 'unauthorized: admin only';
  end if;

  -- Server-side validation (UI also validates; this is defence in depth)
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

  -- Semantic duplicate check
  if exists (
    select 1 from public.authors
    where lower(name) = lower(name_in)
      and country_iso_a3 = iso_in
  ) then
    raise exception 'duplicate_author: % already exists in %', name_in, iso_in;
  end if;

  -- Slug with collision resolution
  base_slug := public.slugify(name_in) || '-' || lower(iso_in);
  final_slug := base_slug;
  while exists (select 1 from public.authors where slug = final_slug) loop
    collision_n := collision_n + 1;
    final_slug := base_slug || '-' || collision_n::text;
  end loop;

  -- Insert author
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

  -- Insert books in order
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

  -- Resolve suggestion if linked
  if p_suggestion_id is not null then
    update public.suggestions
    set status         = 'approved',
        reviewed_at    = now(),
        reviewer_notes = nullif(p_author->>'reviewer_notes', '')
    where id = p_suggestion_id;
  end if;

  return new_author_id;
end;
$$;

grant execute on function public.promote_suggestion(uuid, jsonb, jsonb[]) to authenticated;

comment on function public.promote_suggestion(uuid, jsonb, jsonb[]) is
  'Stage 7b-i — atomic author + books write with optional suggestion resolution. SECURITY DEFINER; gated on is_admin(). Returns the new author id.';
