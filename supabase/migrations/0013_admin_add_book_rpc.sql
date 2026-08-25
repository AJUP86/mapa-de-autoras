-- Stage 8.5 — admin adds one author+book directly (auto-promote, no suggestion).
create or replace function public.admin_add_book(
  p_author jsonb,  -- { name, country_iso_a3 }
  p_book   jsonb   -- { title, status? }
)
returns uuid language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_author_id uuid; v_book_id uuid;
  base_slug text; final_slug text; collision_n int := 1;
  name_in text; iso_in text;
begin
  if not public.is_admin() then raise exception 'unauthorized: admin only'; end if;

  name_in := nullif(trim(p_author->>'name'), '');
  iso_in  := nullif(trim(p_author->>'country_iso_a3'), '');
  if name_in is null then raise exception 'validation: name required'; end if;
  if iso_in is null or length(iso_in) <> 3 then raise exception 'validation: country invalid'; end if;
  if coalesce(trim(p_book->>'title'), '') = '' then raise exception 'validation: book title required'; end if;

  base_slug := public.slugify(name_in) || '-' || lower(iso_in);
  final_slug := base_slug;
  while exists (select 1 from public.authors where slug = final_slug) loop
    collision_n := collision_n + 1;
    final_slug := base_slug || '-' || collision_n::text;
  end loop;

  insert into public.authors (name, slug, country_iso_a3, published)
  values (name_in, final_slug, iso_in, true)
  on conflict (lower(name), country_iso_a3) do nothing
  returning id into v_author_id;

  if v_author_id is null then
    select id into v_author_id from public.authors
     where lower(name) = lower(name_in) and country_iso_a3 = iso_in;
    -- Adding a book is an explicit publish intent: ensure the author is visible.
    update public.authors set published = true where id = v_author_id and published = false;
  end if;

  insert into public.books (author_id, title, status, display_order)
  values (
    v_author_id, p_book->>'title',
    coalesce(nullif(p_book->>'status', '')::public.book_status, 'to_read'),
    coalesce((select max(display_order)+1 from public.books where author_id = v_author_id), 0)
  )
  returning id into v_book_id;

  return v_book_id;
end;
$$;

revoke execute on function public.admin_add_book(jsonb, jsonb) from public, anon;
grant execute on function public.admin_add_book(jsonb, jsonb) to authenticated;
