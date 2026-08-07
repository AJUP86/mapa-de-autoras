// Fetch the public catalog from Supabase and shape it for the map UI.
//
// One round-trip pulls every published author + their books, grouped by
// country. RLS already filters to `published = true`, so the anon client
// only sees rows the world should see.

import { supabase } from "./supabase";
import type { CountryEntry, Author, Book } from "./map-state";

type AuthorWithBooksRow = {
  id: string;
  name: string;
  status: "read" | "discovery";
  birth_year: number | null;
  death_year: number | null;
  country_iso_a3: string;
  books:
    | {
        id: string;
        title: string;
        year: number | null;
        display_order: number;
      }[]
    | null;
};

/**
 * Fetch the full public catalog grouped by country.
 *
 * - Read at Astro build time (front-matter `await getCatalog()`).
 * - Returns `[]` (and logs) if Supabase is unreachable, so `npm run dev`
 *   still renders an empty map instead of throwing.
 * - Books inside each author preserve their `display_order`.
 */
export async function getCatalog(): Promise<CountryEntry[]> {
  const { data, error } = await supabase
    .from("authors")
    .select(
      `
        id,
        name,
        status,
        birth_year,
        death_year,
        country_iso_a3,
        books (
          id,
          title,
          year,
          display_order
        )
      `,
    )
    .eq("published", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[authors] getCatalog() failed:", error.message);
    return [];
  }
  if (!data) return [];

  const byCountry = new Map<string, Author[]>();

  for (const row of data as unknown as AuthorWithBooksRow[]) {
    const books: Book[] = (row.books ?? [])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((b) => ({
        title: b.title,
        year: b.year ?? undefined,
      }));

    const author: Author = {
      id: row.id,
      name: row.name,
      status: row.status,
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
