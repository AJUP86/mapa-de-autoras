-- Stage 8.6 — atomically replace one book's curated content.
-- Updates the synopsis and REPLACES the book's quotes + links in one
-- transaction (delete-then-insert), so the editor's list is the source of
-- truth. SECURITY DEFINER + is_admin() gate, mirroring promote_suggestion_book.

create or replace function public.set_book_content(
  p_book_id     uuid,
  p_description jsonb,  -- { es?, en? }
  p_quotes      jsonb,  -- [ { quote_es, quote_en, location? } ]
  p_links       jsonb   -- [ { retailer, url, affiliate_tag?, locale? } ]
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  item jsonb;
  idx  int := 0;
begin
  if not public.is_admin() then
    raise exception 'unauthorized: admin only';
  end if;

  if not exists (select 1 from public.books where id = p_book_id) then
    raise exception 'validation: book not found';
  end if;

  -- Shape guards run BEFORE any delete: a malformed payload must fail loudly,
  -- never silently wipe the stored lists. Pass '[]' to clear a list explicitly.
  if p_description is null or jsonb_typeof(p_description) <> 'object' then
    raise exception 'validation: description must be a json object';
  end if;
  if p_quotes is null or jsonb_typeof(p_quotes) <> 'array' then
    raise exception 'validation: quotes must be a json array';
  end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    raise exception 'validation: links must be a json array';
  end if;

  update public.books
     set description_es = nullif(trim(coalesce(p_description->>'es', '')), ''),
         description_en = nullif(trim(coalesce(p_description->>'en', '')), '')
   where id = p_book_id;

  -- Quotes: replace wholesale, display_order = array position.
  delete from public.book_quotes where book_id = p_book_id;
  for item in select * from jsonb_array_elements(p_quotes) loop
    if coalesce(trim(item->>'quote_es'), '') = ''
       or coalesce(trim(item->>'quote_en'), '') = '' then
      raise exception 'validation: quote requires both es and en';
    end if;
    insert into public.book_quotes (book_id, quote_es, quote_en, location, display_order)
    values (
      p_book_id,
      trim(item->>'quote_es'),
      trim(item->>'quote_en'),
      nullif(trim(coalesce(item->>'location', '')), ''),
      idx
    );
    idx := idx + 1;
  end loop;

  -- Links: replace wholesale. locale is NOT NULL in book_links -> default 'es'.
  delete from public.book_links where book_id = p_book_id;
  for item in select * from jsonb_array_elements(p_links) loop
    if coalesce(trim(item->>'url'), '') = '' then
      raise exception 'validation: link requires a url';
    end if;
    if trim(item->>'url') !~* '^https?://' then
      raise exception 'validation: link url must start with http:// or https://';
    end if;
    insert into public.book_links (book_id, retailer, url, affiliate_tag, locale)
    values (
      p_book_id,
      coalesce(nullif(trim(coalesce(item->>'retailer', '')), '')::public.retailer, 'other'),
      trim(item->>'url'),
      nullif(trim(coalesce(item->>'affiliate_tag', '')), ''),
      coalesce(nullif(trim(coalesce(item->>'locale', '')), ''), 'es')
    );
  end loop;
end;
$$;

comment on function public.set_book_content(uuid, jsonb, jsonb, jsonb) is
  'Stage 8.6 — admin-only atomic replace of a book''s synopsis, quotes and buy links.';

revoke execute on function public.set_book_content(uuid, jsonb, jsonb, jsonb) from public, anon;
grant  execute on function public.set_book_content(uuid, jsonb, jsonb, jsonb) to authenticated;
