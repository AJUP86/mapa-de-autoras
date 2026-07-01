-- Stage 9a-ii fix — convert ISO country-code columns from char(3) to text.
--
-- WHY: Supabase Realtime's WAL decoder truncates fixed-length char(n)/bpchar
-- columns to their FIRST character in `postgres_changes` payloads. (PostgREST
-- decodes them correctly, which is why build-time / reload fetches via
-- getCatalog() always worked.) With country_iso_a3 arriving over Realtime as
-- "A" instead of "AUS", the map's granular patcher (src/lib/realtime-reducers.ts)
-- bucketed newly-promoted authors under a non-existent 1-letter country code, so
-- they only appeared on the public map after a full page reload — defeating the
-- entire point of Stage 9a-ii. Verified with an anon Realtime probe: the same
-- event delivered `name`/`slug`/`status` (text/enum) intact but `country_iso_a3`
-- (char(3)) as a single char; switching the column to `text` fixed it.
--
-- text is the Postgres-recommended type for such codes anyway (char(n) is
-- discouraged). Validity for authors/suggestions is still guaranteed by their
-- FK to public.countries; the app also validates the ^[A-Z]{3}$ shape on input.
--
-- The two FKs are dropped and recreated because they reference countries.iso_a3,
-- whose type changes here.

alter table public.authors     drop constraint authors_country_iso_a3_fkey;
alter table public.suggestions drop constraint suggestions_proposed_country_iso_a3_fkey;

alter table public.countries    alter column iso_a3                  type text;
alter table public.authors      alter column country_iso_a3          type text;
alter table public.suggestions  alter column proposed_country_iso_a3 type text;

alter table public.authors
  add constraint authors_country_iso_a3_fkey
  foreign key (country_iso_a3) references public.countries(iso_a3) on update cascade;

alter table public.suggestions
  add constraint suggestions_proposed_country_iso_a3_fkey
  foreign key (proposed_country_iso_a3) references public.countries(iso_a3) on update cascade;

comment on column public.countries.iso_a3 is
  'ISO 3166-1 alpha-3 code. text (not char(3)) — Supabase Realtime truncates bpchar in postgres_changes payloads; see migration 0009.';
