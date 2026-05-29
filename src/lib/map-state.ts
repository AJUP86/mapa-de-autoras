// Domain types + pure helpers for the map.
// Kept apart from the React components so they're easy to unit-test later
// and so Stage 5 can swap `MockCountryEntry` for the live API shape.

export type AuthorStatus = "read" | "discovery";

export type Filter = "all" | "read" | "discoveries";

export type CountryState = "read" | "mixed" | "discovery" | "empty";

export interface MockBook {
  title: string;
  year?: number;
}

export interface MockAuthor {
  id: string;
  name: string;
  status: AuthorStatus;
  birth_year?: number;
  death_year?: number;
  books: MockBook[];
}

export interface MockCountryEntry {
  iso_a3: string;
  authors: MockAuthor[];
}

export interface MapLabels {
  filter: { all: string; read: string; discoveries: string };
  panel: { close: string; empty: string; suggest: string; booksLabel: string };
  status: { read: string; discovery: string };
}

/**
 * Reduce a list of country entries into a state-per-country map.
 * O(n) over authors; safe to memoize at the caller.
 */
export function computeCountryStates(
  entries: ReadonlyArray<MockCountryEntry>,
): Record<string, CountryState> {
  const result: Record<string, CountryState> = {};
  for (const entry of entries) {
    let hasRead = false;
    let hasDiscovery = false;
    for (const author of entry.authors) {
      if (author.status === "read") hasRead = true;
      else hasDiscovery = true;
      if (hasRead && hasDiscovery) break;
    }
    if (hasRead && hasDiscovery) result[entry.iso_a3] = "mixed";
    else if (hasRead) result[entry.iso_a3] = "read";
    else if (hasDiscovery) result[entry.iso_a3] = "discovery";
  }
  return result;
}

/**
 * Map a country's state + the active filter to a CSS fill.
 * Uses CSS variables so palette swaps in tokens.css propagate without a rebuild.
 * Returns `parchment` (the page background) for "faded" countries so they
 * recede visually but don't lose their shape.
 */
export function fillFor(state: CountryState, filter: Filter): string {
  if (state === "empty") return "var(--c-parchment)";

  if (filter === "read") {
    if (state === "read") return "var(--c-oxblood)";
    if (state === "mixed") return "var(--c-oxblood-2)";
    return "var(--c-parchment)";
  }

  if (filter === "discoveries") {
    if (state === "discovery") return "var(--c-oxblood-3)";
    if (state === "mixed") return "var(--c-oxblood-2)";
    return "var(--c-parchment)";
  }

  // filter === "all"
  if (state === "read") return "var(--c-oxblood)";
  if (state === "mixed") return "var(--c-oxblood-2)";
  return "var(--c-oxblood-3)"; // discovery
}
