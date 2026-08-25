import type { BookStatus } from "./map-state";

export interface BookListRow {
  id: string;
  title: string;
  year: number | null;
  status: BookStatus;
  authorName: string;
  country: string; // iso_a3 code
  countryName: string; // localized display name
}

export interface BookFilterValues {
  author: string;
  country: string; // iso code, "" = all
  year: string; // "" = all
}

export function deriveCountryOptions(
  rows: BookListRow[],
  locale = "es",
): { code: string; name: string }[] {
  return [...new Map(rows.map((r) => [r.country, r.countryName])).entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export function deriveYearOptions(rows: BookListRow[]): number[] {
  return [...new Set(rows.map((r) => r.year).filter((y): y is number => y !== null))].sort(
    (a, b) => b - a,
  );
}

export function filterBooks(rows: BookListRow[], f: BookFilterValues): BookListRow[] {
  const author = f.author.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (author === "" || r.authorName.toLowerCase().includes(author)) &&
      (f.country === "" || r.country === f.country) &&
      (f.year === "" || String(r.year) === f.year),
  );
}
