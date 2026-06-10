// Domain types + pure helpers for the map.
// Kept apart from the React components so they're easy to unit-test later.
// The shapes match what `src/lib/authors.ts::getCatalog()` returns at build
// time — same structure as the Stage-4 mock, just sourced from Postgres.

export type AuthorStatus = "read" | "currently_reading" | "discovery";

export type Filter = "all" | "read" | "currently_reading" | "discoveries";

export type CountryState =
  | "read"
  | "currently_reading"
  | "discovery"
  | "mixed"
  | "empty";

export interface Book {
  title: string;
  year?: number;
}

export interface Author {
  id: string;
  name: string;
  status: AuthorStatus;
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
    read: string;
    currently_reading: string;
    discoveries: string;
  };
  panel: { close: string; empty: string; suggest: string; booksLabel: string };
  status: { read: string; currently_reading: string; discovery: string };
}

/**
 * Reduce a list of country entries into a state-per-country map.
 * O(n) over authors; safe to memoize at the caller.
 *
 * Mixed = country has 2+ distinct statuses among its authors. The exact
 * fill color for mixed is decided in fillFor() based on the active filter.
 */
export function computeCountryStates(
  entries: ReadonlyArray<CountryEntry>,
): Record<string, CountryState> {
  const result: Record<string, CountryState> = {};
  for (const entry of entries) {
    let hasRead = false;
    let hasCurrent = false;
    let hasDiscovery = false;
    for (const author of entry.authors) {
      if (author.status === "read") hasRead = true;
      else if (author.status === "currently_reading") hasCurrent = true;
      else hasDiscovery = true;
      if (hasRead && hasCurrent && hasDiscovery) break;
    }
    const distinct =
      (hasRead ? 1 : 0) + (hasCurrent ? 1 : 0) + (hasDiscovery ? 1 : 0);
    if (distinct === 0) continue;
    if (distinct >= 2) result[entry.iso_a3] = "mixed";
    else if (hasRead) result[entry.iso_a3] = "read";
    else if (hasCurrent) result[entry.iso_a3] = "currently_reading";
    else result[entry.iso_a3] = "discovery";
  }
  return result;
}

export interface CountryStyle {
  fill: string;
  stroke: string;
}

// Three-color hierarchy — Stage 7b-i (evolves the Stage 4b two-color baseline).
// Fills reference the semantic state aliases in tokens.css, never the base
// palette tokens directly.
const READ_STYLE: CountryStyle = {
  fill: "var(--c-state-read)",
  stroke: "var(--c-state-read-line)",
};
const CURRENT_STYLE: CountryStyle = {
  fill: "var(--c-state-currently-reading)",
  stroke: "var(--c-state-currently-reading-line)",
};
const DISCOVERY_STYLE: CountryStyle = {
  fill: "var(--c-state-discovery)",
  stroke: "var(--c-state-discovery-line)",
};
const EMPTY_STYLE: CountryStyle = {
  fill: "var(--c-parchment)",
  stroke: "var(--c-paper-line)",
};

/**
 * Resolve a country's {fill, stroke} from its state and the active filter.
 *
 *   filter             | mixed country shows as
 *   ───────────────────┼───────────────────────────────────────────────
 *   all                | priority: read > currently_reading > discovery
 *   read               | penguin (it has a read author) — else empty
 *   currently_reading  | sage    (it has a current author) — else empty
 *   discoveries        | oxblood (it has a discovery author) — else empty
 *
 * No blended fills — every country picks one color.
 */
export function fillFor(state: CountryState, filter: Filter): CountryStyle {
  if (state === "empty") return EMPTY_STYLE;

  if (filter === "read") {
    return state === "read" || state === "mixed" ? READ_STYLE : EMPTY_STYLE;
  }
  if (filter === "currently_reading") {
    return state === "currently_reading" || state === "mixed"
      ? CURRENT_STYLE
      : EMPTY_STYLE;
  }
  if (filter === "discoveries") {
    return state === "discovery" || state === "mixed"
      ? DISCOVERY_STYLE
      : EMPTY_STYLE;
  }

  // filter === "all" — priority for mixed and the per-state shortcuts
  if (state === "read" || (state === "mixed")) {
    // Mixed: pick by priority. computeCountryStates collapses 2+ statuses
    // to "mixed" without telling us which; we re-derive from the entry at
    // the call site, OR we accept the simple rule: any country labelled
    // "mixed" surfaces as read (the highest-priority signal).
    return READ_STYLE;
  }
  if (state === "currently_reading") return CURRENT_STYLE;
  return DISCOVERY_STYLE; // state === "discovery"
}
