// Fetch the public catalog from Supabase and shape it for the map UI.
//
// One round-trip pulls every published author + their books, grouped by
// country. RLS already filters to `published = true`, so the anon client
// only sees rows the world should see.

import { supabase } from "./supabase";
import type { CountryEntry, Author, Book, BookStatus } from "./map-state";

type AuthorWithBooksRow = {
  id: string;
  name: string;
  birth_year: number | null;
  death_year: number | null;
  country_iso_a3: string;
  books:
    | {
        id: string;
        title: string;
        year: number | null;
        display_order: number;
        status: BookStatus;
      }[]
    | null;
};

/**
 * Fetch the full public catalog grouped by country. Throws on a Supabase
 * error so callers that show an error state (the /map page) can tell
 * "failed" from "empty". Books keep their `display_order` and carry their
 * `status`, which drives the map color.
 */
export async function fetchCatalog(): Promise<CountryEntry[]> {
  const { data, error } = await supabase
    .from("authors")
    .select(
      `
        id,
        name,
        birth_year,
        death_year,
        country_iso_a3,
        books (
          id,
          title,
          year,
          display_order,
          status
        )
      `,
    )
    .eq("published", true)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!data) return [];

  const byCountry = new Map<string, Author[]>();

  for (const row of data as unknown as AuthorWithBooksRow[]) {
    const books: Book[] = (row.books ?? [])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((b) => ({
        id: b.id,
        title: b.title,
        year: b.year ?? undefined,
        status: b.status,
      }));

    const author: Author = {
      id: row.id,
      name: row.name,
      birth_year: row.birth_year ?? undefined,
      death_year: row.death_year ?? undefined,
      books,
    };

    const list = byCountry.get(row.country_iso_a3);
    if (list) list.push(author);
    else byCountry.set(row.country_iso_a3, [author]);
  }

  return Array.from(byCountry, ([iso_a3, authors]) => ({ iso_a3, authors }));
}

/** Same as fetchCatalog() but returns [] (and logs) on failure. */
export async function getCatalog(): Promise<CountryEntry[]> {
  try {
    return await fetchCatalog();
  } catch (e) {
    console.warn("[authors] getCatalog() failed:", (e as Error).message);
    return [];
  }
}
