// map-search.ts — Stage 11
//
// Search + list grouping for /map. Pure functions over the public catalog so
// the search dropdown and the list view agree on what matches.

import type { Author, Book, CountryEntry, Filter } from "./map-state";
import type { CountryOption } from "./countries";

/** Lowercase and strip accents so "mexico" finds "México". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface BookHit {
  book: Book;
  author: Author;
  iso_a3: string;
}

export interface CountryHit {
  iso_a3: string;
  name: string;
  authorCount: number;
}

export interface AuthorHit {
  author: Author;
  iso_a3: string;
}

export interface SearchResults {
  countries: CountryHit[];
  authors: AuthorHit[];
  books: BookHit[];
}

export function allBooks(catalog: ReadonlyArray<CountryEntry>): BookHit[] {
  return catalog.flatMap((entry) =>
    entry.authors.flatMap((author) =>
      author.books.map((book) => ({ book, author, iso_a3: entry.iso_a3 })),
    ),
  );
}

export interface CatalogCounts {
  countries: number;
  authors: number;
  books: number;
}

/**
 * Countries, writers and books that count for the home's caption: only
 * writers and countries with at least one book (same rule as the list summary).
 */
export function catalogCounts(catalog: ReadonlyArray<CountryEntry>): CatalogCounts {
  const books = allBooks(catalog);
  return {
    countries: new Set(books.map((h) => h.iso_a3)).size,
    authors: new Set(books.map((h) => h.author.id)).size,
    books: books.length,
  };
}

/** The country (iso_a3) of the writer who owns `bookId`, or null when the catalog has no such book. */
export function bookCountry(catalog: ReadonlyArray<CountryEntry>, bookId: string): string | null {
  const entry = catalog.find((e) => e.authors.some((a) => a.books.some((b) => b.id === bookId)));
  return entry?.iso_a3 ?? null;
}

/**
 * Up to `limit` countries, authors and books whose name contains the query
 * (accent-insensitive). Countries with authors come first; otherwise the
 * input order (alphabetical from getCountries) is kept.
 */
export function searchCatalog(
  query: string,
  catalog: ReadonlyArray<CountryEntry>,
  countries: ReadonlyArray<CountryOption>,
  limit = 4,
): SearchResults {
  const q = fold(query.trim());
  if (!q) return { countries: [], authors: [], books: [] };
  const authorCount = new Map(catalog.map((e) => [e.iso_a3, e.authors.length]));
  const countryHits = countries
    .filter((c) => fold(c.name).includes(q))
    .map((c) => ({ iso_a3: c.iso_a3, name: c.name, authorCount: authorCount.get(c.iso_a3) ?? 0 }))
    .sort((a, b) => Number(b.authorCount > 0) - Number(a.authorCount > 0))
    .slice(0, limit);
  const authorHits = catalog
    .flatMap((e) => e.authors.map((author) => ({ author, iso_a3: e.iso_a3 })))
    .filter((h) => fold(h.author.name).includes(q))
    .slice(0, limit);
  const bookHits = allBooks(catalog)
    .filter((h) => fold(h.book.title).includes(q))
    .slice(0, limit);
  return { countries: countryHits, authors: authorHits, books: bookHits };
}

export interface ListGroup {
  iso_a3: string;
  name: string;
  books: BookHit[];
}

/** Books matching the filter and query, grouped by country name (alphabetical). */
export function listGroups(
  catalog: ReadonlyArray<CountryEntry>,
  countryNames: ReadonlyMap<string, string>,
  filter: Filter,
  query: string,
  locale: string,
): ListGroup[] {
  const q = fold(query.trim());
  const nameOf = (iso: string) => countryNames.get(iso) ?? iso;
  const matches = allBooks(catalog).filter(
    (h) =>
      (filter === "all" || h.book.status === filter) &&
      (!q ||
        fold(h.book.title).includes(q) ||
        fold(h.author.name).includes(q) ||
        fold(nameOf(h.iso_a3)).includes(q)),
  );
  const byCountry = new Map<string, BookHit[]>();
  for (const h of matches) {
    const list = byCountry.get(h.iso_a3);
    if (list) list.push(h);
    else byCountry.set(h.iso_a3, [h]);
  }
  return [...byCountry]
    .map(([iso_a3, books]) => ({
      iso_a3,
      name: nameOf(iso_a3),
      books: books.sort(
        (a, b) =>
          a.author.name.localeCompare(b.author.name, locale) ||
          (a.book.year ?? 9999) - (b.book.year ?? 9999),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
