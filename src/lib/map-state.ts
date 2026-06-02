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

export interface CountryStyle {
  fill: string;
  stroke: string;
}

// Two-color hierarchy — Stage 4b refinement
// The map uses exactly two fill colors: penguin (read) and oxblood (discovery).
// There is no blended "mixed" fill. Countries with both kinds of authors are
// resolved by the filter context:
//
//   filter   | mixed country shows as
//   ─────────┼───────────────────────
//   all      | penguin (read wins — the default hierarchy)
//   read     | penguin (it has read authors)
//   disc.    | oxblood (the "exception" — surfaces the discovery side)
//
// Each fill is paired with a darker stroke of itself, so adjacent same-state
// countries (USA + Canada, ESP + FRA + DEU) keep a visible boundary against
// the dusty-blue ocean.
const READ_STYLE: CountryStyle = {
  fill: "var(--c-penguin)",
  stroke: "var(--c-penguin-line)",
};
const DISCOVERY_STYLE: CountryStyle = {
  fill: "var(--c-oxblood)",
  stroke: "var(--c-oxblood-line)",
};
const EMPTY_STYLE: CountryStyle = {
  fill: "var(--c-parchment)",
  stroke: "var(--c-paper-line)",
};

/**
 * Resolve a country's {fill, stroke} from its state and the active filter.
 * Mixed countries collapse to one color based on the filter context — see the
 * table above the constants. Filtered-out countries adopt the empty style so
 * they recede against the ocean without losing their shape.
 */
export function fillFor(state: CountryState, filter: Filter): CountryStyle {
  if (state === "empty") return EMPTY_STYLE;

  if (filter === "read") {
    if (state === "read" || state === "mixed") return READ_STYLE;
    return EMPTY_STYLE; // pure discovery fades out
  }

  if (filter === "discoveries") {
    // The exception: mixed countries swap to oxblood here so the
    // discovery-side surfaces. Pure read countries fade out.
    if (state === "discovery" || state === "mixed") return DISCOVERY_STYLE;
    return EMPTY_STYLE;
  }

  // filter === "all" — read wins for mixed countries
  if (state === "read" || state === "mixed") return READ_STYLE;
  return DISCOVERY_STYLE; // state === "discovery"
}
