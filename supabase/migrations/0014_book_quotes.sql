-- Stage 8.6 — quotes Danny saved while reading a book.
-- Bilingual passage + optional page/chapter location. Public-read mirrors the
-- book_links posture (visible only when the book's author is published).

create table public.book_quotes (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books(id) on delete cascade,
  quote_es      text not null,
  quote_en      text not null,
  location      text,
  display_order int  not null default 0,
  created_at    timestamptz not null default now()
);

create index book_quotes_book_order_idx
  on public.book_quotes (book_id, display_order);

comment on table public.book_quotes is
  'Stage 8.6 — passages Danny underlined. quote_es/quote_en both required; location is language-neutral ("p. 42").';

alter table public.book_quotes enable row level security;

create policy "book_quotes for published authors"
  on public.book_quotes
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_quotes.book_id and a.published
    )
  );

create policy "admins manage book_quotes"
  on public.book_quotes
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
