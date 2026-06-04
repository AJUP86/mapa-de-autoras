-- Dev seed: 30 authors + their books across 16 countries.
-- Mirrors src/data/mock-countries.ts (the Stage 4 mock) so the live map
-- looks identical to the mocked version after Stage 5 lands.
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

-- ─── helper macros via DO block ──────────────────────────────────────────
-- We use the inline pattern `with new_author as (insert ... returning id)`
-- + `insert into books select ..., new_author.id from new_author` so each
-- author + books block stays self-contained and re-orderable.

-- ESP — mixed (read + discovery)
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, status, published)
  values ('Almudena Grandes', 'dev-almudena-grandes', 'ESP', 1960, 2021, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, t.title, t.year, t.ord
from a, (values
  ('Las edades de Lulú', 1989, 0),
  ('El corazón helado', 2007, 1)
) as t(title, year, ord);

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Najat El Hachmi', 'dev-najat-el-hachmi', 'ESP', 1979, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, t.title, t.year, t.ord
from a, (values
  ('L''últim patriarca', 2008, 0),
  ('El lunes nos querrán', 2021, 1)
) as t(title, year, ord);

-- ARG — read + discovery
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, status, published)
  values ('Silvina Ocampo', 'dev-silvina-ocampo', 'ARG', 1903, 1993, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'La furia y otros cuentos', 1959, 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Mariana Enríquez', 'dev-mariana-enriquez', 'ARG', 1973, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Los peligros de fumar en la cama', 2009, 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Samanta Schweblin', 'dev-samanta-schweblin', 'ARG', 1978, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Distancia de rescate', 2014, 0 from a;

-- MEX — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, status, published)
  values ('Elena Garro', 'dev-elena-garro', 'MEX', 1916, 1998, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Los recuerdos del porvenir', 1963, 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Fernanda Melchor', 'dev-fernanda-melchor', 'MEX', 1982, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Temporada de huracanes', 2017, 0 from a;

-- JPN — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Yoko Tawada', 'dev-yoko-tawada', 'JPN', 1960, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'El emisario', 2014, 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Sayaka Murata', 'dev-sayaka-murata', 'JPN', 1979, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'La dependienta', 2016, 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Mieko Kawakami', 'dev-mieko-kawakami', 'JPN', 1976, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Pechos y huevos', 2008, 0 from a;

-- NGA — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Chimamanda Ngozi Adichie', 'dev-chimamanda-ngozi-adichie', 'NGA', 1977, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, t.title, t.year, t.ord
from a, (values
  ('Medio sol amarillo', 2006, 0),
  ('Americanah', 2013, 1)
) as t(title, year, ord);

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, status, published)
  values ('Buchi Emecheta', 'dev-buchi-emecheta', 'NGA', 1944, 2017, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Las delicias de la maternidad', 1979, 0 from a;

-- KOR — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Han Kang', 'dev-han-kang', 'KOR', 1970, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'La vegetariana', 2007, 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Bora Chung', 'dev-bora-chung', 'KOR', 1976, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Conejo maldito', 2017, 0 from a;

-- DEU — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Jenny Erpenbeck', 'dev-jenny-erpenbeck', 'DEU', 1967, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Kairós', 2021, 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Olga Grjasnowa', 'dev-olga-grjasnowa', 'DEU', 1984, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'El ruso es el idioma que ama', 2012, 0 from a;

-- CAN — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Margaret Atwood', 'dev-margaret-atwood', 'CAN', 1939, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, t.title, t.year, t.ord
from a, (values
  ('El cuento de la criada', 1985, 0),
  ('Alias Grace', 1996, 1)
) as t(title, year, ord);

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Esi Edugyan', 'dev-esi-edugyan', 'CAN', 1978, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Washington Black', 2018, 0 from a;

-- USA — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, status, published)
  values ('Toni Morrison', 'dev-toni-morrison', 'USA', 1931, 2019, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, t.title, t.year, t.ord
from a, (values
  ('Beloved', 1987, 0),
  ('Ojos azules', 1970, 1)
) as t(title, year, ord);

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Lauren Groff', 'dev-lauren-groff', 'USA', 1978, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Matrix', 2021, 0 from a;

-- IND — mixed
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Arundhati Roy', 'dev-arundhati-roy', 'IND', 1961, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'El dios de las pequeñas cosas', 1997, 0 from a;

with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Geetanjali Shree', 'dev-geetanjali-shree', 'IND', 1957, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Tumba de arena', 2018, 0 from a;

-- FRA — read only
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Annie Ernaux', 'dev-annie-ernaux', 'FRA', 1940, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, t.title, t.year, t.ord
from a, (values
  ('El lugar', 1983, 0),
  ('Los años', 2008, 1),
  ('Memoria de chica', 2016, 2)
) as t(title, year, ord);

-- ZAF — read only
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, status, published)
  values ('Nadine Gordimer', 'dev-nadine-gordimer', 'ZAF', 1923, 2014, 'read', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'La hija de Burger', 1979, 0 from a;

-- KEN — discovery only
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Yvonne Adhiambo Owuor', 'dev-yvonne-adhiambo-owuor', 'KEN', 1968, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Polvo', 2014, 0 from a;

-- BRA — discovery only
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, death_year, status, published)
  values ('Clarice Lispector', 'dev-clarice-lispector', 'BRA', 1920, 1977, 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'La hora de la estrella', 1977, 0 from a;

-- ITA — discovery only
with a as (
  insert into public.authors (name, slug, country_iso_a3, status, published)
  values ('Elena Ferrante', 'dev-elena-ferrante', 'ITA', 'discovery', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'La amiga estupenda', 2011, 0 from a;

commit;

-- ─── verify ────────────────────────────────────────────────────────────
-- select country_iso_a3, status, count(*)
-- from public.authors
-- where slug like 'dev-%' and published
-- group by country_iso_a3, status order by country_iso_a3;
