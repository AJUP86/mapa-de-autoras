// Domain types + pure helpers for the map.
// Kept apart from the React components so they're easy to unit-test later.
// The shapes match what `src/lib/authors.ts::getCatalog()` returns at build
// time — same structure as the Stage-4 mock, just sourced from Postgres.
//
// Book-first (Stage 8.5): book status drives the map. An author no longer has
// a status; each of its books carries a `to_read | reading | read` status, and
// a country's color is derived from the distinct statuses across all its
// authors' books.

export type BookStatus = "to_read" | "reading" | "read";
export type Filter = "all" | "to_read" | "reading" | "read";
export type CountryState = "to_read" | "reading" | "read" | "mixed" | "empty";

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

export interface MapLabels {
  filter: {
    all: string;
    to_read: string;
    reading: string;
    read: string;
  };
  panel: { close: string; empty: string; suggest: string; booksLabel: string };
  status: { to_read: string; reading: string; read: string };
}

/**
 * Reduce a list of country entries into a state-per-country map.
 * O(n) over each author's books; safe to memoize at the caller.
 *
 * Mixed = country has 2+ distinct book statuses across all its authors' books.
 * Countries whose authors have no books are omitted entirely. The exact fill
 * color for mixed is decided in fillFor() based on the active filter.
 */
export function computeCountryStates(
  entries: ReadonlyArray<CountryEntry>,
): Record<string, CountryState> {
  const result: Record<string, CountryState> = {};
  for (const entry of entries) {
    let hasRead = false,
      hasReading = false,
      hasToRead = false;
    for (const a of entry.authors)
      for (const b of a.books) {
        if (b.status === "read") hasRead = true;
        else if (b.status === "reading") hasReading = true;
        else hasToRead = true;
      }
    const distinct = (hasRead ? 1 : 0) + (hasReading ? 1 : 0) + (hasToRead ? 1 : 0);
    if (distinct === 0) continue;
    if (distinct >= 2) result[entry.iso_a3] = "mixed";
    else if (hasRead) result[entry.iso_a3] = "read";
    else if (hasReading) result[entry.iso_a3] = "reading";
    else result[entry.iso_a3] = "to_read";
  }
  return result;
}

export interface CountryStyle {
  fill: string;
  stroke: string;
}

// Three-color hierarchy — book status drives the fill (Stage 8.5, evolving the
// Stage 7b-i three-color baseline). Fills reference the semantic state aliases
// in tokens.css, never the base palette tokens directly.
const READ_STYLE: CountryStyle = {
  fill: "var(--c-state-read)",
  stroke: "var(--c-state-read-line)",
};
const READING_STYLE: CountryStyle = {
  fill: "var(--c-state-reading)",
  stroke: "var(--c-state-reading-line)",
};
const TO_READ_STYLE: CountryStyle = {
  fill: "var(--c-state-to-read)",
  stroke: "var(--c-state-to-read-line)",
};
const EMPTY_STYLE: CountryStyle = {
  fill: "var(--c-parchment)",
  stroke: "var(--c-paper-line)",
};

/**
 * Resolve a country's {fill, stroke} from its state and the active filter.
 *
 *   filter    | mixed country shows as
 *   ──────────┼──────────────────────────────────────────────
 *   all       | priority: read > reading > to_read
 *   read      | penguin (it has a read book) — else empty
 *   reading   | sage    (it has a reading book) — else empty
 *   to_read   | oxblood (it has a to_read book) — else empty
 *
 * No blended fills — every country picks one color.
 */
export function fillFor(state: CountryState, filter: Filter): CountryStyle {
  if (state === "empty") return EMPTY_STYLE;

  if (filter === "read") {
    return state === "read" || state === "mixed" ? READ_STYLE : EMPTY_STYLE;
  }
  if (filter === "reading") {
    return state === "reading" || state === "mixed" ? READING_STYLE : EMPTY_STYLE;
  }
  if (filter === "to_read") {
    return state === "to_read" || state === "mixed" ? TO_READ_STYLE : EMPTY_STYLE;
  }

  // filter === "all" — priority for mixed and the per-state shortcuts.
  if (state === "read" || state === "mixed") {
    // Mixed: pick by priority. computeCountryStates collapses 2+ statuses
    // to "mixed" without telling us which; any country labelled "mixed"
    // surfaces as read (the highest-priority signal).
    return READ_STYLE;
  }
  if (state === "reading") return READING_STYLE;
  return TO_READ_STYLE; // state === "to_read"
}
