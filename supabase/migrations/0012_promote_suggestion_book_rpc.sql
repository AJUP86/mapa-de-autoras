-- Stage 8.5 — promote one suggested book. Upserts author by (lower(name),country),
-- inserts the book, resolves the suggestion_books entry. SECURITY DEFINER + is_admin().
create or replace function public.promote_suggestion_book(
  p_entry_id uuid,
  p_author   jsonb,   -- { name, country_iso_a3, bio_es?, bio_en?, photo_url?, birth_year?, death_year?, published? }
  p_book     jsonb    -- { title, year?, original_language?, cover_url?, description_es?, description_en?, status? }
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_author_id uuid;
  v_book_id   uuid;
  base_slug   text;
  final_slug  text;
  collision_n int := 1;
  name_in     text;
  iso_in      text;
  v_status    public.suggestion_status;
begin
  if not public.is_admin() then
    raise exception 'unauthorized: admin only';
  end if;

  -- State guard: entry must exist, be pending, and belong to a pending suggestion.
  select s.status into v_status
    from public.suggestion_books sb
    join public.suggestions s on s.id = sb.suggestion_id
   where sb.id = p_entry_id and sb.disposition = 'pending';
  if not found then
    raise exception 'validation: entry not found or already resolved';
  end if;
  if v_status <> 'pending' then
    raise exception 'validation: suggestion already processed';
  end if;

  name_in := nullif(trim(p_author->>'name'), '');
  iso_in  := nullif(trim(p_author->>'country_iso_a3'), '');
  if name_in is null then raise exception 'validation: name required'; end if;
  if iso_in is null or length(iso_in) <> 3 then raise exception 'validation: country invalid'; end if;
  if coalesce(trim(p_book->>'title'), '') = '' then raise exception 'validation: book title required'; end if;

  -- Upsert author. Slug only needed for the insert path.
  base_slug := public.slugify(name_in) || '-' || lower(iso_in);
  final_slug := base_slug;
  while exists (select 1 from public.authors where slug = final_slug) loop
    collision_n := collision_n + 1;
    final_slug := base_slug || '-' || collision_n::text;
  end loop;

  insert into public.authors (
    name, slug, country_iso_a3, bio_es, bio_en, photo_url, birth_year, death_year, published
  ) values (
    name_in, final_slug, iso_in,
    nullif(p_author->>'bio_es',''), nullif(p_author->>'bio_en',''), nullif(p_author->>'photo_url',''),
    nullif(p_author->>'birth_year','')::smallint, nullif(p_author->>'death_year','')::smallint,
    coalesce((p_author->>'published')::boolean, true)
  )
  on conflict (lower(name), country_iso_a3) do nothing
  returning id into v_author_id;

  if v_author_id is null then
    select id into v_author_id from public.authors
     where lower(name) = lower(name_in) and country_iso_a3 = iso_in;
  end if;

  insert into public.books (
    author_id, title, year, original_language, cover_url, description_es, description_en, status, display_order
  ) values (
    v_author_id, p_book->>'title', nullif(p_book->>'year','')::smallint,
    nullif(p_book->>'original_language',''), nullif(p_book->>'cover_url',''),
    nullif(p_book->>'description_es',''), nullif(p_book->>'description_en',''),
    coalesce((p_book->>'status')::public.book_status, 'to_read'),
    coalesce((select max(display_order)+1 from public.books where author_id = v_author_id), 0)
  )
  returning id into v_book_id;

  update public.suggestion_books
     set disposition = 'promoted', linked_book_id = v_book_id
   where id = p_entry_id;

  return v_book_id;
end;
$$;

revoke execute on function public.promote_suggestion_book(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.promote_suggestion_book(uuid, jsonb, jsonb) to authenticated;
