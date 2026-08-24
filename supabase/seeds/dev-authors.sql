-- Dev seed: 30 authors + their books across 16 countries.
-- Mirrors src/data/mock-countries.ts (the Stage 4 mock) so the live map
-- looks identical to the mocked version after Stage 5 lands.
--
-- Stage 8.5 (book-first): status now lives on `books`, not `authors`.
-- Each seeded book carries a status; the per-author status the old seed used
-- is re-sourced onto every one of that author's books, so the map still shows
-- all three colours + mixed countries. Legacy → book_status mapping:
--   read              -> 'read'
--   discovery         -> 'to_read'
--   currently_reading -> 'reading'
--
-- Apply after migrations + the country seed:
--
--     supabase db reset
--     psql "$(supabase status -o env | grep ^DB_URL | cut -d= -f2- | tr -d '"')" \
--          -f supabase/seeds/dev-authors.sql
--
-- Or paste into Studio's SQL editor at http://127.0.0.1:54323
--
-- NOT included in production seed — this is dev-only sample data.
-- Real launch content lives in Stage 10.

begin;

-- Idempotent: wipe any existing dev authors first so reruns are clean.
-- (Cascades to books + book_links via FK on delete.)
delete from public.authors where slug like 'dev-%';

-- Idempotent: wipe any dev suggestion envelopes (cascade removes their
-- suggestion_books children) so reruns of the sample admin data are clean.
delete from public.suggestions where submitter_email like '%@example.com';

-- ─── helper macros via DO block ──────────────────────────────────────────
-- We use the inline pattern `with new_author as (insert ... returning id)`
-- + `insert into books select ..., new_author.id from new_author` so each
-- author + books block stays self-contained and re-orderable.

-- ESP — mixed (read + to_read)
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, published)
  values ('Almudena Grandes', 'dev-almudena-grandes', 'ESP', 1960, 2021, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, t.title, t.year, 'read', t.ord
from a, (values
  ('Las edades de Lulú', 1989, 0),
  ('El corazón helado', 2007, 1)
) as t(title, year, ord);

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Najat El Hachmi', 'dev-najat-el-hachmi', 'ESP', 1979, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, t.title, t.year, 'to_read', t.ord
from a, (values
  ('L''últim patriarca', 2008, 0),
  ('El lunes nos querrán', 2021, 1)
) as t(title, year, ord);

-- ARG — read + to_read
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, published)
  values ('Silvina Ocampo', 'dev-silvina-ocampo', 'ARG', 1903, 1993, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'La furia y otros cuentos', 1959, 'read', 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Mariana Enríquez', 'dev-mariana-enriquez', 'ARG', 1973, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Los peligros de fumar en la cama', 2009, 'read', 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Samanta Schweblin', 'dev-samanta-schweblin', 'ARG', 1978, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Distancia de rescate', 2014, 'to_read', 0 from a;

-- MEX — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, published)
  values ('Elena Garro', 'dev-elena-garro', 'MEX', 1916, 1998, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Los recuerdos del porvenir', 1963, 'read', 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Fernanda Melchor', 'dev-fernanda-melchor', 'MEX', 1982, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Temporada de huracanes', 2017, 'to_read', 0 from a;

-- JPN — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Yoko Tawada', 'dev-yoko-tawada', 'JPN', 1960, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'El emisario', 2014, 'read', 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Sayaka Murata', 'dev-sayaka-murata', 'JPN', 1979, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'La dependienta', 2016, 'to_read', 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Mieko Kawakami', 'dev-mieko-kawakami', 'JPN', 1976, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Pechos y huevos', 2008, 'to_read', 0 from a;

-- NGA — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Chimamanda Ngozi Adichie', 'dev-chimamanda-ngozi-adichie', 'NGA', 1977, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, t.title, t.year, 'read', t.ord
from a, (values
  ('Medio sol amarillo', 2006, 0),
  ('Americanah', 2013, 1)
) as t(title, year, ord);

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, published)
  values ('Buchi Emecheta', 'dev-buchi-emecheta', 'NGA', 1944, 2017, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Las delicias de la maternidad', 1979, 'to_read', 0 from a;

-- KOR — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Han Kang', 'dev-han-kang', 'KOR', 1970, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'La vegetariana', 2007, 'read', 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Bora Chung', 'dev-bora-chung', 'KOR', 1976, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Conejo maldito', 2017, 'to_read', 0 from a;

-- DEU — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Jenny Erpenbeck', 'dev-jenny-erpenbeck', 'DEU', 1967, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Kairós', 2021, 'read', 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Olga Grjasnowa', 'dev-olga-grjasnowa', 'DEU', 1984, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'El ruso es el idioma que ama', 2012, 'to_read', 0 from a;

-- CAN — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Margaret Atwood', 'dev-margaret-atwood', 'CAN', 1939, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, t.title, t.year, 'read', t.ord
from a, (values
  ('El cuento de la criada', 1985, 0),
  ('Alias Grace', 1996, 1)
) as t(title, year, ord);

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Esi Edugyan', 'dev-esi-edugyan', 'CAN', 1978, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Washington Black', 2018, 'to_read', 0 from a;

-- USA — mixed (read + to_read + reading via Tara Westover below)
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, published)
  values ('Toni Morrison', 'dev-toni-morrison', 'USA', 1931, 2019, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, t.title, t.year, 'read', t.ord
from a, (values
  ('Beloved', 1987, 0),
  ('Ojos azules', 1970, 1)
) as t(title, year, ord);

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Lauren Groff', 'dev-lauren-groff', 'USA', 1978, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Matrix', 2021, 'to_read', 0 from a;

-- IND — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Arundhati Roy', 'dev-arundhati-roy', 'IND', 1961, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'El dios de las pequeñas cosas', 1997, 'read', 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Geetanjali Shree', 'dev-geetanjali-shree', 'IND', 1957, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Tumba de arena', 2018, 'to_read', 0 from a;

-- FRA — read only
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Annie Ernaux', 'dev-annie-ernaux', 'FRA', 1940, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, t.title, t.year, 'read', t.ord
from a, (values
  ('El lugar', 1983, 0),
  ('Los años', 2008, 1),
  ('Memoria de chica', 2016, 2)
) as t(title, year, ord);

-- ZAF — read only
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, published)
  values ('Nadine Gordimer', 'dev-nadine-gordimer', 'ZAF', 1923, 2014, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'La hija de Burger', 1979, 'read', 0 from a;

-- KEN — to_read only
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Yvonne Adhiambo Owuor', 'dev-yvonne-adhiambo-owuor', 'KEN', 1968, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Polvo', 2014, 'to_read', 0 from a;

-- BRA — to_read only
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, published)
  values ('Clarice Lispector', 'dev-clarice-lispector', 'BRA', 1920, 1977, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'La hora de la estrella', 1977, 'to_read', 0 from a;

-- ITA — to_read only
with a as (
  insert into public.authors (name, slug, country_iso_a3, published)
  values ('Elena Ferrante', 'dev-elena-ferrante', 'ITA', true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'La amiga estupenda', 2011, 'to_read', 0 from a;

-- PRT — reading (Stage 7b-i smoke test for the currently-reading state)
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Lídia Jorge', 'dev-lidia-jorge', 'PRT', 1946, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Misericordia', 2022, 'reading', 0 from a;

-- USA already mixed (read + to_read). Add a reading book to make it
-- three-state mixed for the priority-rule smoke test.
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, published)
  values ('Tara Westover', 'dev-tara-westover', 'USA', 1986, true)
  returning id
)
insert into public.books (author_id, title, year, status, display_order)
select a.id, 'Educated', 2018, 'reading', 0 from a;

-- ─── sample suggestion envelope + children (admin-UI dev data) ─────────────
-- One pending envelope from a fictional reader, with three proposed books:
--   1. Han Kang / KOR — an author ALREADY seeded (exercise "already present").
--   2. Isabel Allende / CHL — a net-new author (exercise "promote").
--   3. Svetlana Alexievich / BLR — another net-new author.
-- All entries start pending so the admin promote/reject/already-present flow
-- can be exercised end to end. Idempotent via the delete above.
with s as (
  insert into public.suggestions (submitter_email, submitter_name, locale, accepted_newsletter, status)
  values ('reader@example.com', 'Dev Reader', 'es', true, 'pending')
  returning id
)
insert into public.suggestion_books
  (suggestion_id, proposed_author_name, proposed_country_iso_a3, proposed_book_title, note, disposition, display_order)
select s.id, e.author_name, e.iso, e.title, e.note, 'pending', e.ord
from s, (values
  ('Han Kang', 'KOR', 'La clase de griego', 'Creo que ya tenéis a esta autora, pero por si acaso.', 0),
  ('Isabel Allende', 'CHL', 'La casa de los espíritus', 'Un clásico que falta en el mapa.', 1),
  ('Svetlana Alexievich', 'BLR', 'La guerra no tiene rostro de mujer', null, 2)
) as e(author_name, iso, title, note, ord);

commit;

-- ─── verify ────────────────────────────────────────────────────────────
-- select b.status, count(*)
-- from public.books b
-- join public.authors a on a.id = b.author_id
-- where a.slug like 'dev-%'
-- group by b.status order by b.status;
--
-- select sb.proposed_author_name, sb.proposed_country_iso_a3, sb.disposition
-- from public.suggestion_books sb
-- join public.suggestions s on s.id = sb.suggestion_id
-- where s.submitter_email like '%@example.com'
-- order by sb.display_order;
