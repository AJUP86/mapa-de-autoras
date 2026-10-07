// Domain types + pure helpers for the map.
// Kept apart from the React components so they're easy to unit-test later.
// The shapes match what `src/lib/authors.ts::fetchCatalog()` returns — client-
// side through `useCatalog` on /map, and at build time for the home's map
// picture — same structure as the Stage-4 mock, just sourced from Postgres.
//
// Book-first (Stage 8.5): book status drives the map. An author no longer has
// a status; each of its books carries a `to_read | reading | read` status, and
// a country's color is derived from the distinct statuses across all its
// authors' books.

export type BookStatus = "to_read" | "reading" | "read";
export type Filter = "all" | "to_read" | "reading" | "read";

export interface Book {
  id: string;
  title: string;
  year?: number;
  status: BookStatus;
}

export interface Author {
  id: string;
  name: string;
  birth_year?: number;
  death_year?: number;
  books: Book[];
}

export interface CountryEntry {
  iso_a3: string;
  authors: Author[];
}

// ─── Stage 11 — exact filter semantics ─────────────────────────────────────
// Each country keeps its full set of book statuses (the old helpers collapsed
// 2+ statuses to "mixed", which lit such a country under every filter).

const STATUS_PRIORITY: BookStatus[] = ["read", "reading", "to_read"];

/** Distinct book statuses per country, in priority order. Book-less countries are omitted. */
export function countryStatuses(
  entries: ReadonlyArray<CountryEntry>,
): Record<string, BookStatus[]> {
  const result: Record<string, BookStatus[]> = {};
  for (const entry of entries) {
    const seen = new Set<BookStatus>();
    for (const a of entry.authors) for (const b of a.books) seen.add(b.status);
    if (seen.size > 0) result[entry.iso_a3] = STATUS_PRIORITY.filter((s) => seen.has(s));
  }
  return result;
}

/**
 * The status whose color a country shows under `filter`, or null (uncolored).
 * "all" keeps the read > reading > to_read priority; a specific filter colors
 * the country only if it has a book with that status.
 */
export function countryColor(
  statuses: ReadonlyArray<BookStatus> | undefined,
  filter: Filter,
): BookStatus | null {
  if (!statuses || statuses.length === 0) return null;
  if (filter === "all") return STATUS_PRIORITY.find((s) => statuses.includes(s)) ?? null;
  return statuses.includes(filter) ? filter : null;
}
