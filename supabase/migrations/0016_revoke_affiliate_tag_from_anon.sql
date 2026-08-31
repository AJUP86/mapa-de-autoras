-- Stage 8.6 — affiliate_tag is internal (spec: "never exposed to visitors").
-- The book_links RLS policy is row-level only, so anon could still SELECT the
-- column directly via PostgREST.
--
-- A plain column-level REVOKE is not enough on its own: Supabase's schema
-- bootstrap sets `alter default privileges in schema public grant all on
-- tables to anon, authenticated, service_role`, so anon already holds a
-- table-wide SELECT grant on book_links. Postgres column ACLs only restrict
-- access when no broader table-level grant remains — revoking just the
-- column leaves the table-wide grant covering it regardless (verified
-- empirically: anon could still read affiliate_tag after a column-only
-- revoke). So: revoke the table-wide SELECT from anon, then re-grant SELECT
-- on every book_links column except affiliate_tag. The public detail query
-- never selects affiliate_tag; the admin editor runs as `authenticated`,
-- whose own table-wide grant is untouched and keeps full access.

revoke select (affiliate_tag) on public.book_links from anon;
revoke select on public.book_links from anon;
grant select (id, book_id, retailer, locale, url) on public.book_links to anon;
