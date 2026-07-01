-- Stage 9a-ii — Enable Realtime for the public map data tables.
--
-- Supabase Realtime is enabled at the project level by default, but each
-- table must be added to the supabase_realtime publication for postgres_changes
-- events to be emitted. Anon subscribers receive only rows visible under RLS,
-- so the existing `published = true` filter on authors continues to gate
-- visibility — books inherit the gate via their parent author + their own RLS.

alter publication supabase_realtime add table public.authors;
alter publication supabase_realtime add table public.books;
