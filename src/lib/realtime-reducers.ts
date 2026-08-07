// Pure reducers for granular Realtime patching.
//
// Each function takes a catalog snapshot + an event payload, returns a new
// catalog. Used by MapSection's Realtime event handlers to update local state
// without re-fetching from Supabase on every change.
//
// Rules:
//   - published = false authors are filtered out before patching (defence in
//     depth — anon RLS already filters these server-side, but the reducer
//     re-checks).
//   - New author lands in its country_iso_a3 bucket; bucket is created if
//     absent.
//   - Removing the last author from a country bucket removes the bucket.
//   - Books sort by display_order within their parent author.
//   - Author UPDATE preserves existing books array; only top-level fields are
//     merged.
//
// NOTE (7b-ii): updateBook / removeBook match books by (title, year) because
// the client-side Book type carries no id. Realtime DELETE payloads also only
// carry the primary key under the default REPLICA IDENTITY, so book removal by
// author_id won't fire until `books` is set to REPLICA IDENTITY FULL. Book
// edit/delete is not exercised until Stage 7b-ii — these two reducers are
// placeholders until then. The in-scope 9a-ii paths (author + book INSERT from
// promote, author UPDATE for edit/publish) use `payload.new`, which is always
// fully populated.

import type { Author, AuthorStatus, Book, CountryEntry } from "./map-state";

export interface AuthorRow {
  id: string;
  name: string;
  status: AuthorStatus;
  birth_year: number | null;
  death_year: number | null;
  country_iso_a3: string;
  published: boolean;
}

export interface BookRow {
  id: string;
  author_id: string;
  title: string;
  year: number | null;
  display_order: number;
}

function rowToAuthor(row: AuthorRow, books: Book[] = []): Author {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    birth_year: row.birth_year ?? undefined,
    death_year: row.death_year ?? undefined,
    books,
  };
}

function rowToBook(row: BookRow): Book {
  return {
    title: row.title,
    year: row.year ?? undefined,
  };
}

export function addAuthor(catalog: CountryEntry[], row: AuthorRow): CountryEntry[] {
  if (!row.published) return catalog;
  const author = rowToAuthor(row);

  const bucketIndex = catalog.findIndex((c) => c.iso_a3 === row.country_iso_a3);
  if (bucketIndex === -1) {
    return [...catalog, { iso_a3: row.country_iso_a3, authors: [author] }];
  }

  const bucket = catalog[bucketIndex];
  if (bucket.authors.some((a) => a.id === row.id)) {
    return catalog; // idempotent — already present
  }

  const next = catalog.slice();
  next[bucketIndex] = { ...bucket, authors: [...bucket.authors, author] };
  return next;
}

export function updateAuthor(catalog: CountryEntry[], row: AuthorRow): CountryEntry[] {
  if (!row.published) {
    // Going from published=true to published=false → remove from view.
    return removeAuthor(catalog, row.id);
  }

  // Find existing books for this author (preserved from any previous state)
  // BEFORE we filter it out of its old bucket below.
  const existingBooks = catalog.flatMap((c) => c.authors).find((a) => a.id === row.id)?.books ?? [];

  // Country may have changed; remove from old bucket first, then add to new.
  let next = catalog
    .map((c) => ({
      ...c,
      authors: c.authors.filter((a) => a.id !== row.id),
    }))
    .filter((c) => c.authors.length > 0);

  const author = rowToAuthor(row, existingBooks);
  const bucketIndex = next.findIndex((c) => c.iso_a3 === row.country_iso_a3);

  if (bucketIndex === -1) {
    next = [...next, { iso_a3: row.country_iso_a3, authors: [author] }];
  } else {
    const bucket = next[bucketIndex];
    next = next.slice();
    next[bucketIndex] = { ...bucket, authors: [...bucket.authors, author] };
  }

  return next;
}

export function removeAuthor(catalog: CountryEntry[], id: string): CountryEntry[] {
  return catalog
    .map((c) => ({ ...c, authors: c.authors.filter((a) => a.id !== id) }))
    .filter((c) => c.authors.length > 0);
}

export function addBook(catalog: CountryEntry[], row: BookRow): CountryEntry[] {
  const book = rowToBook(row);
  return catalog.map((c) => ({
    ...c,
    authors: c.authors.map((a) => {
      if (a.id !== row.author_id) return a;
      if (a.books.some((b) => b.title === row.title && b.year === book.year)) {
        return a; // idempotent — already present
      }
      const books = [...a.books, book].sort((x, y) => (x.year ?? 0) - (y.year ?? 0));
      // display_order is preserved at fetch time; on incremental updates we
      // fall back to year sort, which matches the visible order in the panel.
      return { ...a, books };
    }),
  }));
}

export function updateBook(catalog: CountryEntry[], row: BookRow): CountryEntry[] {
  const book = rowToBook(row);
  return catalog.map((c) => ({
    ...c,
    authors: c.authors.map((a) => {
      if (a.id !== row.author_id) return a;
      // Placeholder (7b-ii): the client Book type has no id, so we can't match
      // the previous row precisely. Drop any book sharing the new year and
      // replace with the incoming title+year. Reliable book edits land in 7b-ii.
      const books = a.books.filter((b) => b.year !== book.year);
      return {
        ...a,
        books: [...books, book].sort((x, y) => (x.year ?? 0) - (y.year ?? 0)),
      };
    }),
  }));
}

export function removeBook(catalog: CountryEntry[], row: BookRow): CountryEntry[] {
  // Realtime DELETE payload has `old` populated; the reducer accepts the same
  // BookRow shape (callers pass payload.old).
  return catalog.map((c) => ({
    ...c,
    authors: c.authors.map((a) => {
      if (a.id !== row.author_id) return a;
      return {
        ...a,
        books: a.books.filter(
          (b) => !(b.title === row.title && b.year === (row.year ?? undefined)),
        ),
      };
    }),
  }));
}
