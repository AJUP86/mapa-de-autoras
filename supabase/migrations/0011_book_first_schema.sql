-- Stage 8.5 — Book-first refactor: schema.
-- Greenfield migration: production is empty; staging/local data is disposable.
-- Transforms the post-0010 schema into the book-first model.

-- ── Enums ────────────────────────────────────────────────────────────────
create type public.book_status as enum ('to_read', 'reading', 'read');
create type public.suggestion_book_disposition as enum
  ('pending', 'promoted', 'rejected', 'already_present');

-- ── books: add status, enable full replica identity for reliable Realtime ─
alter table public.books
  add column status public.book_status not null default 'to_read';
alter table public.books replica identity full;

-- ── authors: drop status (books own state now); add uniqueness ────────────
drop index if exists public.authors_country_status_published_idx;
alter table public.authors drop column status;
drop type public.author_status;
create index authors_country_published_idx
  on public.authors (country_iso_a3) where published;
create unique index authors_name_country_unique
  on public.authors (lower(name), country_iso_a3);

-- ── suggestions: recreate status enum (pending|processed); slim columns ────
alter table public.suggestions alter column status drop default;
create type public.suggestion_status_new as enum ('pending', 'processed');
alter table public.suggestions
  alter column status type public.suggestion_status_new
  using (case when status::text = 'pending' then 'pending' else 'processed' end)::text::public.suggestion_status_new;
drop type public.suggestion_status;
alter type public.suggestion_status_new rename to suggestion_status;
alter table public.suggestions alter column status set default 'pending';

alter table public.suggestions
  drop column proposed_author_name,
  drop column proposed_country_iso_a3,
  drop column proposed_books_text,
  drop column note,
  drop column promoted_author_id,
  drop column reviewed_at,
  drop column reviewer_notes,
  drop column turnstile_verified;

comment on column public.suggestions.status is
  'Envelope lifecycle: pending until admin clicks Finish & notify, then processed.';

-- ── suggestion_books: one row per proposed book ───────────────────────────
create table public.suggestion_books (
  id                      uuid primary key default gen_random_uuid(),
  suggestion_id           uuid not null references public.suggestions(id) on delete cascade,
  proposed_author_name    text not null,
  proposed_country_iso_a3 text not null references public.countries(iso_a3) on update cascade,
  proposed_book_title     text not null,
  note                    text,
  disposition             public.suggestion_book_disposition not null default 'pending',
  reason                  text,
  linked_book_id          uuid references public.books(id) on delete set null,
  display_order           int not null default 0,
  created_at              timestamptz not null default now()
);
create index suggestion_books_suggestion_idx
  on public.suggestion_books (suggestion_id, display_order);

comment on table public.suggestion_books is
  'One proposed book within a suggestion envelope. Processed independently by admin.';

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Mirrors suggestions posture (0002): no direct anon writes — submit_suggestion
-- inserts with the service role. Admin manages everything.
alter table public.suggestion_books enable row level security;

create policy "admins manage suggestion_books"
  on public.suggestion_books
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
