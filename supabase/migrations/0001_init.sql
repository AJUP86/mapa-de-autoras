-- Initial schema for mapa-de-autoras
-- Six tables: countries, authors, books, book_links, suggestions, subscribers
-- RLS-first: anon role can read the published catalog and submit suggestions/subscriptions;
-- admin role (JWT app_metadata.role = 'admin') has full CRUD.

-- =============================================================================
-- Extensions
-- =============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- =============================================================================
-- Enums
-- =============================================================================

create type public.author_status     as enum ('read', 'discovery');
create type public.suggestion_status as enum ('pending', 'approved', 'rejected');
create type public.subscriber_status as enum ('pending', 'confirmed', 'unsubscribed');
create type public.retailer          as enum ('amazon', 'bookshop', 'kobo', 'other');

-- =============================================================================
-- Helper: is_admin()
-- =============================================================================
-- Checks the caller's JWT for app_metadata.role = 'admin'.
-- app_metadata is server-only mutable (users cannot elevate themselves).
-- Bootstrap is documented in supabase/README.md.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- =============================================================================
-- Tables
-- =============================================================================

create table public.countries (
  iso_a3        char(3)  primary key,
  iso_numeric   smallint not null unique,
  name_en       text     not null,
  name_es       text     not null,
  display_label text
);

create table public.authors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  country_iso_a3  char(3) not null references public.countries(iso_a3) on update cascade,
  bio_en          text,
  bio_es          text,
  photo_url       text,
  birth_year      smallint,
  death_year      smallint,
  status          public.author_status not null default 'discovery',
  published       boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.books (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references public.authors(id) on delete cascade,
  title             text not null,
  original_language text,
  year              smallint,
  cover_url         text,
  description_en    text,
  description_es    text,
  display_order     integer not null default 0
);

create table public.book_links (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books(id) on delete cascade,
  retailer      public.retailer not null,
  locale        text not null,
  url           text not null,
  affiliate_tag text
);

create table public.suggestions (
  id                       uuid primary key default gen_random_uuid(),
  submitter_email          text not null,
  submitter_name           text,
  proposed_author_name     text not null,
  proposed_country_iso_a3  char(3) not null references public.countries(iso_a3) on update cascade,
  proposed_books_text      text,
  note                     text,
  status                   public.suggestion_status not null default 'pending',
  turnstile_verified       boolean not null default false,
  accepted_newsletter      boolean not null default false,
  created_at               timestamptz not null default now(),
  reviewed_at              timestamptz,
  reviewer_notes           text
);

create table public.subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  status        public.subscriber_status not null default 'pending',
  locale        text not null,
  confirm_token text not null,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz
);

-- =============================================================================
-- Indexes
-- =============================================================================

create index authors_country_status_published_idx
  on public.authors (country_iso_a3, status)
  where published;

create index authors_slug_idx
  on public.authors (slug);

create index books_author_order_idx
  on public.books (author_id, display_order);

create index book_links_book_locale_idx
  on public.book_links (book_id, locale);

create index suggestions_status_created_idx
  on public.suggestions (status, created_at desc);

create index subscribers_status_email_idx
  on public.subscribers (status, email);

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- Enable RLS on every table. Policies are additive (OR'd) so the public read
-- policies coexist with the admin "manage all" policy.

alter table public.countries   enable row level security;
alter table public.authors     enable row level security;
alter table public.books       enable row level security;
alter table public.book_links  enable row level security;
alter table public.suggestions enable row level security;
alter table public.subscribers enable row level security;

-- countries: world is public.
create policy "countries are public"
  on public.countries
  for select
  to anon, authenticated
  using (true);

create policy "admins manage countries"
  on public.countries
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- authors: published rows are public.
create policy "published authors are public"
  on public.authors
  for select
  to anon, authenticated
  using (published);

create policy "admins manage authors"
  on public.authors
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- books: readable when their author is published.
create policy "books for published authors"
  on public.books
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.authors a
      where a.id = books.author_id and a.published
    )
  );

create policy "admins manage books"
  on public.books
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- book_links: readable when their book's author is published.
create policy "book_links for published authors"
  on public.book_links
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_links.book_id and a.published
    )
  );

create policy "admins manage book_links"
  on public.book_links
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- suggestions: anon may submit a pending row; only admin may read/update.
create policy "anyone can submit a suggestion"
  on public.suggestions
  for insert
  to anon, authenticated
  with check (status = 'pending');

create policy "admins manage suggestions"
  on public.suggestions
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- subscribers: anon may subscribe with pending status; only admin may read/update.
create policy "anyone can subscribe"
  on public.subscribers
  for insert
  to anon, authenticated
  with check (status = 'pending');

create policy "admins manage subscribers"
  on public.subscribers
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- Comments (for Studio / DB introspection)
-- =============================================================================

comment on table public.countries   is 'ISO 3166-1 country reference (seeded).';
comment on table public.authors     is 'Female writers. `status` drives the map filter; `published` gates anon visibility.';
comment on table public.books       is 'Books per author. Visible when the author is published.';
comment on table public.book_links  is 'Retailer links per book per locale (e.g., Amazon ES, Bookshop EN).';
comment on table public.suggestions is 'Public suggestion queue. Anon inserts pending; admin reviews.';
comment on table public.subscribers is 'Self-rolled double opt-in newsletter list.';

comment on function public.is_admin() is
  'True when the caller''s JWT app_metadata.role = ''admin''. Used by every admin RLS policy.';
