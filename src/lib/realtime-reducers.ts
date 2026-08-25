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
// Book-first (Stage 8.5): books now carry a `status` and a stable `id`.
// `books` is set to REPLICA IDENTITY FULL, so INSERT/UPDATE/DELETE payloads
// carry the full row (including `id`). updateBook / removeBook therefore match
// by `row.id` — the old (title, year) placeholder matching the audit flagged
// is gone. A book status change repaints its country live.

import type { Author, Book, BookStatus, CountryEntry } from "./map-state";

export interface AuthorRow {
  id: string;
  name: string;
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
  status: BookStatus;
}

function rowToAuthor(row: AuthorRow, books: Book[] = []): Author {
  return {
    id: row.id,
    name: row.name,
    birth_year: row.birth_year ?? undefined,
    death_year: row.death_year ?? undefined,
    books,
  };
}

function rowToBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    year: row.year ?? undefined,
    status: row.status,
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

// Sort books by the incoming row's display_order. We track display_order in a
// side map keyed by book id so re-sorts after an update stay stable; on the
// client Book we only keep the domain fields.
type OrderedBook = Book & { __order: number };

function sortByOrder(books: OrderedBook[]): Book[] {
  return books
    .slice()
    .sort((x, y) => x.__order - y.__order || (x.year ?? 0) - (y.year ?? 0))
    .map(({ __order: _order, ...b }) => b);
}

export function addBook(catalog: CountryEntry[], row: BookRow): CountryEntry[] {
  const book = rowToBook(row);
  return catalog.map((c) => ({
    ...c,
    authors: c.authors.map((a) => {
      if (a.id !== row.author_id) return a;
      if (a.books.some((b) => b.id === row.id)) {
        return a; // idempotent — already present
      }
      const merged: OrderedBook[] = [
        ...a.books.map((b, i) => ({ ...b, __order: i })),
        { ...book, __order: row.display_order },
      ];
      return { ...a, books: sortByOrder(merged) };
    }),
  }));
}

export function updateBook(catalog: CountryEntry[], row: BookRow): CountryEntry[] {
  const book = rowToBook(row);
  return catalog.map((c) => ({
    ...c,
    authors: c.authors.map((a) => {
      if (a.id !== row.author_id) return a;
      if (!a.books.some((b) => b.id === row.id)) return a;
      // Match by id (REPLICA IDENTITY FULL guarantees the id in the payload)
      // and replace that book in place, then re-sort by display_order.
      const merged: OrderedBook[] = a.books.map((b, i) =>
        b.id === row.id ? { ...book, __order: row.display_order } : { ...b, __order: i },
      );
      return { ...a, books: sortByOrder(merged) };
    }),
  }));
}

export function removeBook(catalog: CountryEntry[], row: BookRow): CountryEntry[] {
  // Realtime DELETE payload has `old` populated with the full row (REPLICA
  // IDENTITY FULL); the reducer matches by id.
  return catalog.map((c) => ({
    ...c,
    authors: c.authors.map((a) => {
      if (a.id !== row.author_id) return a;
      return {
        ...a,
        books: a.books.filter((b) => b.id !== row.id),
      };
    }),
  }));
}
