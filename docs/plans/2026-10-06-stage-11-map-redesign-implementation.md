# Stage 11 — New home + full-screen map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small embedded map with a phone-first, full-screen `/[lang]/map` page (floating search + filters, Map | List switch, country panel, book view, suggest sheet) and turn the home into an intro + waitlist page, behind a build-time "map closed" switch.

**Architecture:** One React island (`MapApp`, `client:only`) owns the map page state. A d3-geo + d3-zoom renderer (`WorldMap`) draws the world and exposes an imperative handle (fly-to, regions, zoom). Pure logic (filter colors, search, list grouping, region from time zone, dot visibility, string formatting) lives in `src/lib/` with Vitest tests. The catalog fetch + Realtime patching moves unchanged into a `useCatalog` hook shared by the map page and the home preview.

**Tech Stack:** Astro 5 (static, `[lang]` routes), React 19 islands, Tailwind 4 (tokens in `src/styles/tokens.css`), Supabase JS (anon client + Realtime), `d3-geo` / `d3-zoom` / `d3-selection` / `d3-transition`, `world-atlas` 110m + `topojson-client`, Vitest.

**Spec:** [docs/specs/2026-10-06-stage-11-map-redesign-design.md](../specs/2026-10-06-stage-11-map-redesign-design.md). Visual reference: the prototype Danny approved, <https://claude.ai/artifact/JeK7bmc7p7cpzfGPx24Yin>.

## Global Constraints

- Branch: `feature/11-map-redesign`. **Alejandro commits manually.** Each task ends with a ready-to-paste commit command; never run `git commit`, `git push` or `git merge` yourself.
- Map URL `/[lang]/map`; list view `/[lang]/map?view=list`; `/[lang]/books` redirects to the list view.
- Locales come from `src/i18n/locales.ts` (`LOCALES`, `Locale`). Every user-visible string is an i18n key in **both** `src/i18n/es.json` and `src/i18n/en.json`.
- Colors only through the existing tokens (`--c-*` in `src/styles/tokens.css`, Tailwind `bg-ink`, `text-oxblood`, etc.). Status colors: read = `--c-state-read`, reading = `--c-state-reading`, to_read = `--c-state-to-read`.
- Filter semantics: under "all" a country shows read > reading > to_read; under a specific filter it is colored only if it has ≥1 book with that status.
- Small-country dot threshold: on-screen area < **900 px²**; dot tap radius 20 px, pin radius 7 px.
- Phones = viewport width < 768 px. Touch targets ≥ 44 px. Text inputs use `text-base` (16 px) so iOS Safari does not zoom.
- `prefers-reduced-motion: reduce` → no fly-to or sheet animation.
- Unit tests run under plain Vitest (no Astro alias): **value imports inside `src/lib/*.ts` files that are unit-tested must be relative** (`"./map-state"`, `"../data/..."`). Type-only imports may use `~/`.
- Gates before every commit: `npm test`, `npm run check` (0 errors), `npm run format:check`. `npm run build` at the end of Tasks 2, 4, 6 and 7.
- Prettier does not format `.astro` files (see `.prettierignore`); keep their indentation consistent by hand.

## File map

| File                                                                                                                            | Task    | Responsibility                                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `src/lib/map-state.ts` (+ test)                                                                                                 | 1, 6    | Add `countryStatuses` / `countryColor`; remove the old "mixed" API in Task 6 |
| `src/lib/map-region.ts` (+ test)                                                                                                | 1       | Region from time zone; region framing boxes                                  |
| `src/lib/map-markers.ts` (+ test)                                                                                               | 1       | `showDot` rule                                                               |
| `src/lib/map-search.ts` (+ test)                                                                                                | 1       | Accent-insensitive search; list grouping                                     |
| `src/i18n/format.ts` (+ test)                                                                                                   | 1       | `fmt` placeholders, `plural`                                                 |
| `src/lib/world-geo.ts` (+ test)                                                                                                 | 2       | World GeoJSON keyed by ISO-3, no Antarctica; `mainShape`                     |
| `src/lib/authors.ts`                                                                                                            | 2       | Add throwing `fetchCatalog()`; `getCatalog()` wraps it                       |
| `src/lib/use-catalog.ts`                                                                                                        | 2       | Catalog fetch + Realtime patching hook (moved from `MapSection.tsx`)         |
| `src/components/map/WorldMap.tsx`                                                                                               | 2       | d3 renderer + imperative handle                                              |
| `src/components/map/labels.ts`                                                                                                  | 2–5     | `mapPageLabels(lang)` builder for the island                                 |
| `src/components/map/MapApp.tsx`                                                                                                 | 2–5     | Map page state and composition                                               |
| `src/components/pages/MapPage.astro`, `src/pages/[lang]/map.astro`                                                              | 2, 5, 7 | Route, skeleton, build-time data                                             |
| `src/layouts/Base.astro`                                                                                                        | 2, 6, 7 | `bare` prop (no nav); nav labels                                             |
| `src/styles/global.css`                                                                                                         | 2, 6    | Map classes, `shadow-float`; remove old `.rsm-geography` rule                |
| `src/components/map/icons.tsx`                                                                                                  | 3       | Inline SVG icons                                                             |
| `src/components/StatusPill.tsx`                                                                                                 | 3       | Shared status badge                                                          |
| `src/components/map/MapTopBar.tsx`, `FilterChips.tsx`, `MapControls.tsx`, `CountrySheet.tsx`, `CountryContent.tsx`, `Toast.tsx` | 3       | Floating UI + country panel                                                  |
| `src/components/map/SearchResults.tsx`, `ViewSwitch.tsx`, `MapList.tsx`                                                         | 4       | Search dropdown, switch, list view                                           |
| `src/pages/[lang]/books.astro`                                                                                                  | 4       | Redirect page to the list view (replaces `BooksPage`)                        |
| `src/components/BookDetailView.tsx`, `src/components/book-labels.ts`                                                            | 5       | Shared book rendering + labels (page and panel)                              |
| `src/components/map/BookPanel.tsx`, `SuggestSheet.tsx`                                                                          | 5       | Book view in the panel; suggest sheet                                        |
| `src/components/suggest-labels.ts`, `SuggestionForm.tsx`                                                                        | 5       | Shared suggest labels; `initialCountry` + `onSuccess` props                  |
| `src/lib/waitlist.ts` (+ test), `src/components/WaitlistCard.tsx`                                                               | 6       | Waitlist stub + card                                                         |
| `src/components/MapPreview.tsx`, `src/components/pages/IndexPage.astro`                                                         | 6       | New home                                                                     |
| `src/components/AdminAwareNav.tsx`                                                                                              | 6, 7    | Phone-friendly public nav; hide "Mapa" when closed                           |
| `src/lib/site-config.ts` (+ test), `src/components/pages/ComingSoonPage.astro`                                                  | 7       | `PUBLIC_MAP_OPEN` switch + closed page                                       |
| `astro.config.mjs`, `.github/workflows/ci.yml`, `.env.example`                                                                  | 4, 7    | Sitemap filter, env guard, CI env                                            |

Removed in Task 4: `src/components/pages/BooksPage.astro`, `src/components/BookList.tsx`. Removed in Task 6: `MapSection.tsx`, `AuthorsMap.tsx`, `ContinentNav.tsx`, `MapFilter.tsx`, `CountryPanel.tsx`, dependency `@vnedyalk0v/react19-simple-maps`.

---

### Task 1: Pure logic — filter colors, region, dots, search, formatting

**Files:**

- Modify: `src/lib/map-state.ts` (append), `src/lib/map-state.test.ts`
- Create: `src/lib/map-region.ts`, `src/lib/map-region.test.ts`
- Create: `src/lib/map-markers.ts`, `src/lib/map-markers.test.ts`
- Create: `src/lib/map-search.ts`, `src/lib/map-search.test.ts`
- Create: `src/i18n/format.ts`, `src/i18n/format.test.ts`

**Interfaces:**

- Consumes: `CountryEntry`, `Author`, `Book`, `BookStatus`, `Filter` from `src/lib/map-state.ts`; `CountryOption` (`{ iso_a3: string; name: string }`) from `src/lib/countries.ts`.
- Produces:
  - `countryStatuses(entries: ReadonlyArray<CountryEntry>): Record<string, BookStatus[]>`
  - `countryColor(statuses: ReadonlyArray<BookStatus> | undefined, filter: Filter): BookStatus | null`
  - `type RegionKey = "europe" | "americas" | "africa" | "asia" | "oceania"`; `REGION_BOXES: Record<RegionKey, [[number, number], [number, number]]>`; `REGION_ORDER: RegionKey[]`; `regionFromTimeZone(tz: string | null | undefined): RegionKey | null`; `browserRegion(): RegionKey | null`
  - `DOT_MAX_AREA_PX = 900`; `showDot(baseAreaPx: number, zoom: number, hasColor: boolean): boolean`
  - `fold(s: string): string`; `interface BookHit { book: Book; author: Author; iso_a3: string }`; `interface CountryHit { iso_a3: string; name: string; authorCount: number }`; `interface AuthorHit { author: Author; iso_a3: string }`; `interface SearchResults { countries: CountryHit[]; authors: AuthorHit[]; books: BookHit[] }`; `allBooks(catalog): BookHit[]`; `searchCatalog(query, catalog, countries, limit = 4): SearchResults`; `interface ListGroup { iso_a3: string; name: string; books: BookHit[] }`; `listGroups(catalog, countryNames: ReadonlyMap<string, string>, filter: Filter, query: string, locale: string): ListGroup[]`
  - `fmt(template: string, vars: Record<string, string | number>): string`; `plural(n: number, one: string, other: string): string`

- [ ] **Step 1: Write the failing tests for `countryStatuses` / `countryColor`**

In `src/lib/map-state.test.ts`, change the import line to:

```ts
import {
  computeCountryStates,
  countryColor,
  countryStatuses,
  fillFor,
  type BookStatus,
  type CountryEntry,
} from "./map-state";
```

Append at the end of the file:

```ts
describe("countryStatuses", () => {
  it("lists each country's distinct statuses in read > reading > to_read order", () => {
    const e: CountryEntry[] = [
      {
        iso_a3: "ARG",
        authors: [
          author([book("to_read", "t"), book("read", "r")], "a1"),
          author([book("to_read", "t2")], "a2"),
        ],
      },
    ];
    expect(countryStatuses(e)).toEqual({ ARG: ["read", "to_read"] });
  });
  it("omits countries whose authors have no books", () => {
    expect(countryStatuses([{ iso_a3: "AUS", authors: [author([])] }])).toEqual({});
  });
});

describe("countryColor", () => {
  it("is null for a country without books", () => {
    expect(countryColor(undefined, "all")).toBeNull();
    expect(countryColor([], "read")).toBeNull();
  });
  it("all: priority read > reading > to_read", () => {
    expect(countryColor(["read", "to_read"], "all")).toBe("read");
    expect(countryColor(["reading", "to_read"], "all")).toBe("reading");
    expect(countryColor(["to_read"], "all")).toBe("to_read");
  });
  it("a specific filter colors a country only if it has that status", () => {
    // Regression: a reading + to_read country used to light up under "read".
    expect(countryColor(["reading", "to_read"], "read")).toBeNull();
    expect(countryColor(["reading", "to_read"], "reading")).toBe("reading");
    expect(countryColor(["read"], "to_read")).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing tests for region, dots and formatting**

Create `src/lib/map-region.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { regionFromTimeZone } from "./map-region";

describe("regionFromTimeZone", () => {
  it.each([
    ["Europe/Amsterdam", "europe"],
    ["Europe/Madrid", "europe"],
    ["Atlantic/Canary", "europe"],
    ["America/Mexico_City", "americas"],
    ["America/Argentina/Buenos_Aires", "americas"],
    ["Africa/Lagos", "africa"],
    ["Asia/Tokyo", "asia"],
    ["Australia/Sydney", "oceania"],
    ["Pacific/Auckland", "oceania"],
  ])("%s → %s", (tz, region) => {
    expect(regionFromTimeZone(tz)).toBe(region);
  });

  it.each(["UTC", "Etc/GMT+3", "Pacific/Honolulu", "Atlantic/Bermuda", "", null, undefined])(
    "unknown or ambiguous zone %s → null",
    (tz) => {
      expect(regionFromTimeZone(tz)).toBeNull();
    },
  );
});
```

Create `src/lib/map-markers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { showDot } from "./map-markers";

describe("showDot", () => {
  it("shows a dot for a small colored country", () => {
    expect(showDot(20, 1, true)).toBe(true);
  });
  it("hides the dot once zoom makes the country fingertip-sized", () => {
    expect(showDot(20, 6, true)).toBe(true); // 720 px²
    expect(showDot(20, 7, true)).toBe(false); // 980 px²
  });
  it("never shows a dot for an uncolored or large country", () => {
    expect(showDot(20, 1, false)).toBe(false);
    expect(showDot(5000, 1, true)).toBe(false);
  });
});
```

Create `src/i18n/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fmt, plural } from "./format";

describe("fmt", () => {
  it("fills placeholders", () => {
    expect(fmt("Te muestro {region}.", { region: "Europa" })).toBe("Te muestro Europa.");
  });
  it("leaves unknown placeholders untouched", () => {
    expect(fmt("{a} {b}", { a: 1 })).toBe("1 {b}");
  });
});

describe("plural", () => {
  it("picks the singular only for exactly one", () => {
    expect(plural(1, "{n} autora", "{n} autoras")).toBe("1 autora");
    expect(plural(3, "{n} autora", "{n} autoras")).toBe("3 autoras");
    expect(plural(0, "{n} autora", "{n} autoras")).toBe("0 autoras");
  });
});
```

- [ ] **Step 3: Write the failing tests for search and list grouping**

Create `src/lib/map-search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fold, listGroups, searchCatalog } from "./map-search";
import type { CountryEntry } from "./map-state";

const catalog: CountryEntry[] = [
  {
    iso_a3: "MEX",
    authors: [
      {
        id: "a1",
        name: "Elena Garro",
        books: [{ id: "b1", title: "Los recuerdos del porvenir", year: 1963, status: "read" }],
      },
      {
        id: "a2",
        name: "Fernanda Melchor",
        books: [{ id: "b2", title: "Temporada de huracanes", year: 2017, status: "to_read" }],
      },
    ],
  },
  {
    iso_a3: "JPN",
    authors: [
      {
        id: "a3",
        name: "Sayaka Murata",
        books: [{ id: "b3", title: "La dependienta", year: 2016, status: "reading" }],
      },
    ],
  },
];
const countries = [
  { iso_a3: "JPN", name: "Japón" },
  { iso_a3: "MAR", name: "Marruecos" },
  { iso_a3: "MEX", name: "México" },
];
const names = new Map(countries.map((c) => [c.iso_a3, c.name]));

describe("fold", () => {
  it("strips accents and case", () => {
    expect(fold("México")).toBe("mexico");
    expect(fold("ÁFRICA")).toBe("africa");
  });
});

describe("searchCatalog", () => {
  it("returns nothing for a blank query", () => {
    expect(searchCatalog("  ", catalog, countries)).toEqual({
      countries: [],
      authors: [],
      books: [],
    });
  });
  it("matches countries accent-insensitively, countries with authors first", () => {
    const r = searchCatalog("m", catalog, countries);
    expect(r.countries.map((c) => c.iso_a3)).toEqual(["MEX", "MAR"]);
    expect(r.countries[0].authorCount).toBe(2);
    expect(searchCatalog("mexico", catalog, countries).countries[0].name).toBe("México");
  });
  it("finds authors and books", () => {
    expect(searchCatalog("murata", catalog, countries).authors.map((h) => h.author.id)).toEqual([
      "a3",
    ]);
    expect(searchCatalog("huracanes", catalog, countries).books.map((h) => h.book.id)).toEqual([
      "b2",
    ]);
  });
  it("caps each group at the limit", () => {
    expect(searchCatalog("e", catalog, countries, 1).authors).toHaveLength(1);
  });
});

describe("listGroups", () => {
  it("groups books by country name, alphabetically, authors sorted inside", () => {
    const groups = listGroups(catalog, names, "all", "", "es");
    expect(groups.map((g) => g.name)).toEqual(["Japón", "México"]);
    expect(groups[1].books.map((h) => h.book.id)).toEqual(["b1", "b2"]);
  });
  it("applies the status filter", () => {
    const groups = listGroups(catalog, names, "to_read", "", "es");
    expect(groups.map((g) => g.iso_a3)).toEqual(["MEX"]);
    expect(groups[0].books.map((h) => h.book.id)).toEqual(["b2"]);
  });
  it("matches the query against title, author and country name", () => {
    expect(listGroups(catalog, names, "all", "dependienta", "es")[0].books[0].book.id).toBe("b3");
    expect(
      listGroups(catalog, names, "all", "garro", "es")[0].books.map((h) => h.book.id),
    ).toEqual(["b1"]);
    expect(listGroups(catalog, names, "all", "japon", "es").map((g) => g.iso_a3)).toEqual(["JPN"]);
  });
});
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `npm test`
Expected: FAIL — `countryStatuses` / `countryColor` are not exported, and `./map-region`, `./map-markers`, `./map-search`, `./format` cannot be resolved.

- [ ] **Step 5: Implement `countryStatuses` / `countryColor`**

Append to `src/lib/map-state.ts`:

```ts
// ─── Stage 11 — exact filter semantics ─────────────────────────────────────
// computeCountryStates() collapses 2+ statuses to "mixed" and loses which
// ones a country has, so fillFor() lit a "mixed" country under every filter.
// The /map page keeps the full status set per country instead.

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
```

- [ ] **Step 6: Implement `map-region.ts`, `map-markers.ts` and `format.ts`**

Create `src/lib/map-region.ts`:

```ts
// map-region.ts — Stage 11
//
// Pick the visitor's world region from the browser time zone so the map can
// open there on phones. No permission prompt and nothing leaves the device:
// Intl already knows the zone (e.g. "Europe/Amsterdam").

export type RegionKey = "europe" | "americas" | "africa" | "asia" | "oceania";

/** [[west, south], [east, north]] in degrees — framing boxes, not borders. */
export const REGION_BOXES: Record<RegionKey, [[number, number], [number, number]]> = {
  europe: [
    [-11, 36],
    [38, 70],
  ],
  americas: [
    [-124, -55],
    [-35, 60],
  ],
  africa: [
    [-17, -35],
    [51, 37],
  ],
  asia: [
    [45, -8],
    [146, 55],
  ],
  oceania: [
    [113, -46],
    [178, -8],
  ],
};

export const REGION_ORDER: RegionKey[] = ["europe", "americas", "africa", "asia", "oceania"];

const ATLANTIC_EUROPE = ["Canary", "Madeira", "Azores", "Faroe", "Reykjavik"];
const PACIFIC_OCEANIA = [
  "Auckland",
  "Chatham",
  "Fiji",
  "Port_Moresby",
  "Noumea",
  "Guadalcanal",
  "Efate",
  "Tongatapu",
  "Apia",
];

export function regionFromTimeZone(tz: string | null | undefined): RegionKey | null {
  if (!tz) return null;
  const [area, place = ""] = tz.split("/");
  if (area === "Europe") return "europe";
  if (area === "Atlantic" && ATLANTIC_EUROPE.includes(place)) return "europe";
  if (area === "America") return "americas";
  if (area === "Africa") return "africa";
  if (area === "Asia") return "asia";
  if (area === "Australia") return "oceania";
  if (area === "Pacific" && PACIFIC_OCEANIA.includes(place)) return "oceania";
  return null;
}

/** The current browser's region, or null when the zone is unknown. */
export function browserRegion(): RegionKey | null {
  try {
    return regionFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}
```

Create `src/lib/map-markers.ts`:

```ts
// map-markers.ts — Stage 11
//
// Small countries get a dot so they can be tapped. A dot shows while the
// country's on-screen area is under about a fingertip (30 × 30 px) and the
// country has a color under the current filter.

/** On-screen area (px²) below which a colored country gets a dot. */
export const DOT_MAX_AREA_PX = 900;

/**
 * @param baseAreaPx the country's projected area at zoom 1
 * @param zoom       current zoom factor (area grows with zoom²)
 * @param hasColor   whether the country is colored under the current filter
 */
export function showDot(baseAreaPx: number, zoom: number, hasColor: boolean): boolean {
  return hasColor && baseAreaPx * zoom * zoom < DOT_MAX_AREA_PX;
}
```

Create `src/i18n/format.ts`:

```ts
// format.ts — Stage 11. Tiny helpers for i18n strings with placeholders.

/** Replace {name} placeholders; unknown placeholders stay as they are. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Pick the singular template only for exactly 1, then fill {n}. */
export function plural(n: number, one: string, other: string): string {
  return fmt(n === 1 ? one : other, { n });
}
```

- [ ] **Step 7: Implement `map-search.ts`**

Create `src/lib/map-search.ts`:

```ts
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
```

- [ ] **Step 8: Run all gates**

Run: `npm test` → Expected: PASS (43 existing + the new tests).
Run: `npm run check` → Expected: 0 errors.
Run: `npm run format:check` → Expected: clean (run `npx prettier --write src/lib src/i18n` first if it complains).

- [ ] **Step 9: Hand off the commit**

```bash
git add src/lib/map-state.ts src/lib/map-state.test.ts src/lib/map-region.ts src/lib/map-region.test.ts src/lib/map-markers.ts src/lib/map-markers.test.ts src/lib/map-search.ts src/lib/map-search.test.ts src/i18n/format.ts src/i18n/format.test.ts ; git commit -m "feat(11): pure map logic - exact filter colors, region from time zone, dots, search, list groups" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: World geometry, `WorldMap` renderer, `useCatalog`, bare `/map` route

**Files:**

- Create: `src/lib/world-geo.ts`, `src/lib/world-geo.test.ts`
- Modify: `src/lib/authors.ts` (full replacement below)
- Create: `src/lib/use-catalog.ts`
- Create: `src/components/map/WorldMap.tsx`, `src/components/map/MapApp.tsx`, `src/components/map/labels.ts`
- Create: `src/components/pages/MapPage.astro`, `src/pages/[lang]/map.astro`
- Modify: `src/layouts/Base.astro` (add `bare` prop), `src/styles/global.css` (map classes + `shadow-float`)
- Modify: `src/i18n/es.json`, `src/i18n/en.json` (`map.page_title`, `map.aria_map`)
- Modify: `package.json` / `package-lock.json` (via npm)

**Interfaces:**

- Consumes (Task 1): `countryStatuses`, `countryColor`, `browserRegion`, `REGION_BOXES`, `RegionKey`, `showDot`.
- Produces:
  - `interface CountryProps { name: string; iso: string | null }`; `type CountryFeature = Feature<Polygon | MultiPolygon, CountryProps> & { id: string }`; `WORLD_FEATURES: CountryFeature[]`; `WORLD: FeatureCollection<Polygon | MultiPolygon, CountryProps>`; `mainShape(f: CountryFeature): Feature<Polygon>`
  - `fetchCatalog(): Promise<CountryEntry[]>` (throws on error); `getCatalog()` unchanged behavior
  - `type CatalogState = { kind: "loading" } | { kind: "error" } | { kind: "loaded"; catalog: CountryEntry[] }`; `useCatalog(opts?: { realtime?: boolean }): { state: CatalogState; retry: () => void }`
  - `interface Insets { top: number; right: number; bottom: number; left: number }`; `interface WorldMapHandle { flyToCountry(iso: string): void; flyToRegion(key: RegionKey): void; showWorld(): void; zoomBy(factor: number): void }`; default export `WorldMap(props: { ref?: Ref<WorldMapHandle>; colors: Readonly<Record<string, BookStatus | null>>; selectedIso: string | null; ariaLabel: string; initialRegion: RegionKey | null; getInsets: () => Insets; onSelectCountry: (iso: string) => void; onBackgroundClick: () => void })`
  - `interface MapPageLabels { ariaMap: string }` and `mapPageLabels(lang: Locale): MapPageLabels` — extended in Tasks 3–5
  - `Base.astro` prop `bare?: boolean` (omits the site nav)
  - CSS classes `map-country`, `is-read`, `is-reading`, `is-to_read`, `is-selected`, `map-dot`, `map-dot-hit`, `map-dot-pin`; Tailwind utility `shadow-float`

- [ ] **Step 1: Install the d3 modules**

Run: `npm install d3-geo d3-zoom d3-selection d3-transition`
Run: `npm install -D @types/d3-geo @types/d3-zoom @types/d3-selection @types/d3-transition @types/geojson`
Expected: both succeed; `package.json` lists the new packages.

- [ ] **Step 2: Write the failing test for the world geometry**

Create `src/lib/world-geo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { geoBounds } from "d3-geo";
import { WORLD_FEATURES, mainShape } from "./world-geo";

describe("WORLD_FEATURES", () => {
  it("keys countries by ISO alpha-3", () => {
    const isos = WORLD_FEATURES.map((f) => f.properties.iso);
    expect(isos).toContain("ESP");
    expect(isos).toContain("NLD");
  });
  it("drops Antarctica but keeps shapes without an ISO code (e.g. Kosovo)", () => {
    expect(WORLD_FEATURES.some((f) => f.properties.iso === "ATA")).toBe(false);
    expect(WORLD_FEATURES.some((f) => f.properties.name === "Kosovo")).toBe(true);
  });
  it("gives every feature a unique string id", () => {
    const ids = WORLD_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("mainShape", () => {
  it("frames the USA on the contiguous states, not Alaska", () => {
    const usa = WORLD_FEATURES.find((f) => f.properties.iso === "USA")!;
    const [[west], [east]] = geoBounds(mainShape(usa));
    expect(west).toBeGreaterThan(-130);
    expect(east).toBeLessThan(-60);
  });
});
```

Run: `npm test -- world-geo` → Expected: FAIL (`./world-geo` not found).

- [ ] **Step 3: Implement `world-geo.ts`**

Create `src/lib/world-geo.ts`:

```ts
// world-geo.ts — Stage 11
//
// The world as GeoJSON, built once from world-atlas' 110m TopoJSON. Each
// feature carries its ISO alpha-3 code (our domain key) or null for the few
// shapes without one (Kosovo, N. Cyprus, Somaliland): those still draw so the
// map has no holes, but they are not tappable. Antarctica is dropped — no
// authors, and it wastes a third of a phone screen.

import { feature } from "topojson-client";
import { geoArea } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import worldData from "world-atlas/countries-110m.json";
import { isoNumericToA3 } from "../data/iso-numeric-to-a3";

export interface CountryProps {
  name: string;
  iso: string | null;
}

export type CountryFeature = Feature<Polygon | MultiPolygon, CountryProps> & { id: string };

// TopoJSON typing is loose; cast once at the boundary (same as the old AuthorsMap).
const topology = worldData as unknown as Parameters<typeof feature>[0];
const collection = feature(
  topology,
  (topology as unknown as { objects: { countries: Parameters<typeof feature>[1] } }).objects
    .countries,
) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;

function toA3(id: unknown): string | null {
  const n = typeof id === "string" ? parseInt(id, 10) : typeof id === "number" ? id : NaN;
  return Number.isFinite(n) ? (isoNumericToA3[n] ?? null) : null;
}

export const WORLD_FEATURES: CountryFeature[] = collection.features.flatMap((f, i) => {
  const iso = toA3(f.id);
  if (iso === "ATA") return [];
  return [
    {
      type: "Feature" as const,
      id: iso ?? `x-${i}`,
      geometry: f.geometry,
      properties: { name: f.properties?.name ?? "", iso },
    },
  ];
});

export const WORLD: FeatureCollection<Polygon | MultiPolygon, CountryProps> = {
  type: "FeatureCollection",
  features: WORLD_FEATURES,
};

/**
 * The country's largest polygon by spherical area. Framing a country on its
 * main landmass keeps e.g. the USA from zooming out to include Alaska.
 */
export function mainShape(f: CountryFeature): Feature<Polygon> {
  if (f.geometry.type === "Polygon") {
    return { type: "Feature", properties: {}, geometry: f.geometry };
  }
  let best: Polygon = { type: "Polygon", coordinates: f.geometry.coordinates[0] };
  let bestArea = -1;
  for (const coordinates of f.geometry.coordinates) {
    const poly: Polygon = { type: "Polygon", coordinates };
    const area = geoArea(poly);
    if (area > bestArea) {
      bestArea = area;
      best = poly;
    }
  }
  return { type: "Feature", properties: {}, geometry: best };
}
```

Run: `npm test -- world-geo` → Expected: PASS.

- [ ] **Step 4: Split `getCatalog` into a throwing `fetchCatalog`**

Replace `src/lib/authors.ts` with:

```ts
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
```

- [ ] **Step 5: Create the `useCatalog` hook**

Create `src/lib/use-catalog.ts`:

```ts
// use-catalog.ts — Stage 11
//
// The public catalog for map UIs: initial fetch + optional Supabase Realtime
// patching (ADR 0005). Moved out of MapSection.tsx with the same behavior so
// /map and the home preview share it; the preview passes { realtime: false }.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { fetchCatalog } from "./authors";
import type { CountryEntry } from "./map-state";
import {
  addAuthor,
  addBook,
  removeAuthor,
  removeBook,
  updateAuthor,
  updateBook,
  type AuthorRow,
  type BookRow,
} from "./realtime-reducers";

export type CatalogState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; catalog: CountryEntry[] };

export function useCatalog({ realtime = true }: { realtime?: boolean } = {}) {
  const [state, setState] = useState<CatalogState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const hasSubscribedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchCatalog()
      .then((catalog) => {
        if (!cancelled) setState({ kind: "loaded", catalog });
      })
      .catch((e: Error) => {
        console.warn("[useCatalog] load failed:", e.message);
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Subscribe once the catalog has loaded. Keyed on the boolean so content
  // patches never tear the channel down (same rule as the old MapSection).
  const loaded = state.kind === "loaded";
  useEffect(() => {
    if (!realtime || !loaded) return;
    const patch = (fn: (c: CountryEntry[]) => CountryEntry[]) =>
      setState((prev) => (prev.kind === "loaded" ? { kind: "loaded", catalog: fn(prev.catalog) } : prev));
    const channel = supabase
      .channel("public-map-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "authors" }, (p) =>
        patch((c) => addAuthor(c, p.new as AuthorRow)),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "authors" }, (p) =>
        patch((c) => updateAuthor(c, p.new as AuthorRow)),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "authors" }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id) patch((c) => removeAuthor(c, id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "books" }, (p) =>
        patch((c) => addBook(c, p.new as BookRow)),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "books" }, (p) =>
        patch((c) => updateBook(c, p.new as BookRow)),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "books" }, (p) =>
        patch((c) => removeBook(c, p.old as BookRow)),
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // A second SUBSCRIBED means we reconnected: resync missed events.
        if (hasSubscribedOnce.current) {
          fetchCatalog()
            .then((catalog) => setState({ kind: "loaded", catalog }))
            .catch(() => {});
        } else {
          hasSubscribedOnce.current = true;
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [realtime, loaded]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
```

- [ ] **Step 6: Add the map styles and the float shadow**

In `src/styles/global.css`, add inside the existing `@theme { ... }` block (after `--font-body`):

```css
  --shadow-float: 0 1px 2px rgb(27 42 65 / 0.1), 0 8px 24px rgb(27 42 65 / 0.14);
```

Append at the end of `src/styles/global.css`:

```css
/* World map — Stage 11 (/map + home preview). Fills come from the state
   aliases in tokens.css, so a palette change repaints the map too. */
.map-country {
  fill: var(--c-bone);
  stroke: var(--c-paper-line);
  stroke-opacity: 0.4;
  stroke-width: 0.6;
  vector-effect: non-scaling-stroke;
  transition: fill 200ms ease-out;
}
.map-country.is-read {
  fill: var(--c-state-read);
  stroke: var(--c-state-read-line);
  stroke-opacity: 1;
}
.map-country.is-reading {
  fill: var(--c-state-reading);
  stroke: var(--c-state-reading-line);
  stroke-opacity: 1;
}
.map-country.is-to_read {
  fill: var(--c-state-to-read);
  stroke: var(--c-state-to-read-line);
  stroke-opacity: 1;
}
.map-country.is-selected {
  stroke: var(--c-ink);
  stroke-width: 2;
  stroke-opacity: 1;
}
.world-map .map-country {
  cursor: pointer;
}
@media (hover: hover) {
  .world-map .map-country:hover {
    fill: var(--c-ochre);
  }
}
.map-dot {
  cursor: pointer;
}
.map-dot-hit {
  fill: transparent;
}
.map-dot-pin {
  stroke: var(--c-bone);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.map-dot.is-read .map-dot-pin {
  fill: var(--c-state-read);
}
.map-dot.is-reading .map-dot-pin {
  fill: var(--c-state-reading);
}
.map-dot.is-to_read .map-dot-pin {
  fill: var(--c-state-to-read);
}
@media (prefers-reduced-motion: reduce) {
  .map-country {
    transition: none;
  }
}
```

- [ ] **Step 7: Create the `WorldMap` renderer**

Create `src/components/map/WorldMap.tsx`:

```tsx
// WorldMap.tsx — Stage 11
//
// Full-bleed world map drawn with d3-geo and driven by d3-zoom (replaces the
// react19-simple-maps wrapper, which hid d3-zoom). React renders the country
// paths and dots; the zoom transform is written straight to the DOM through a
// ref so panning never re-renders ~175 paths per frame.

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import "d3-transition";
import { WORLD, WORLD_FEATURES, mainShape } from "~/lib/world-geo";
import { REGION_BOXES, type RegionKey } from "~/lib/map-region";
import { showDot } from "~/lib/map-markers";
import type { BookStatus } from "~/lib/map-state";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WorldMapHandle {
  flyToCountry(iso: string): void;
  flyToRegion(key: RegionKey): void;
  showWorld(): void;
  zoomBy(factor: number): void;
}

interface Props {
  ref?: Ref<WorldMapHandle>;
  /** Color per ISO code under the current filter; missing or null = uncolored. */
  colors: Readonly<Record<string, BookStatus | null>>;
  selectedIso: string | null;
  ariaLabel: string;
  /** Region to open on when the screen is portrait (phones). null = Atlantic view. */
  initialRegion: RegionKey | null;
  /** Screen edges covered by floating UI; fly-to frames the free area. */
  getInsets: () => Insets;
  onSelectCountry: (iso: string) => void;
  onBackgroundClick: () => void;
}

type Bounds = [[number, number], [number, number]];

const PAD = 16;
const MAX_ZOOM = 16;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function WorldMap({
  ref,
  colors,
  selectedIso,
  ariaLabel,
  initialRegion,
  getInsets,
  onSelectCountry,
  onBackgroundClick,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const kRef = useRef(1);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Track the container size; a real change re-fits the projection.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w > 0 && h > 0) setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (!size) return null;
    const projection = geoEqualEarth().fitExtent(
      [
        [PAD, PAD],
        [size.w - PAD, size.h - PAD],
      ],
      WORLD,
    );
    const path = geoPath(projection);
    const shapes = WORLD_FEATURES.map((f) => ({ id: f.id, iso: f.properties.iso, d: path(f) ?? "" }));
    const dots = WORLD_FEATURES.flatMap((f) => {
      const iso = f.properties.iso;
      const area = path.area(f);
      if (!iso || !showDot(area, 1, true)) return [];
      const [x, y] = path.centroid(mainShape(f));
      return [{ iso, x, y, area }];
    });
    return { projection, path, shapes, dots, worldBounds: path.bounds(WORLD) as Bounds };
  }, [size]);

  /** Keep dots the same size on screen and hide them once the country is big enough. */
  const placeDots = (k: number) => {
    layerRef.current?.querySelectorAll<SVGGElement>("g[data-dot]").forEach((g) => {
      const x = Number(g.dataset.x);
      const y = Number(g.dataset.y);
      g.setAttribute("transform", `translate(${x},${y}) scale(${1 / k})`);
      g.style.display = showDot(Number(g.dataset.area), k, true) ? "" : "none";
    });
  };

  const boundsTransform = (b: Bounds, maxK: number): ZoomTransform => {
    const { w, h } = size!;
    const i = getInsets();
    const fw = Math.max(w - i.left - i.right, 40);
    const fh = Math.max(h - i.top - i.bottom, 40);
    const bw = Math.max(b[1][0] - b[0][0], 3);
    const bh = Math.max(b[1][1] - b[0][1], 3);
    const k = Math.max(1, Math.min(maxK, 0.8 * Math.min(fw / bw, fh / bh)));
    const mx = (b[0][0] + b[1][0]) / 2;
    const my = (b[0][1] + b[1][1]) / 2;
    return zoomIdentity.translate(i.left + fw / 2 - k * mx, i.top + fh / 2 - k * my).scale(k);
  };

  const regionBounds = (key: RegionKey): Bounds => {
    const [[west, south], [east, north]] = REGION_BOXES[key];
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    // Sample a grid: Equal Earth curves meridians, so corners alone are not enough.
    for (let i = 0; i <= 6; i++)
      for (let j = 0; j <= 6; j++) {
        const p = geo!.projection([west + ((east - west) * i) / 6, south + ((north - south) * j) / 6]);
        if (!p) continue;
        x0 = Math.min(x0, p[0]);
        y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]);
        y1 = Math.max(y1, p[1]);
      }
    return [
      [x0, y0],
      [x1, y1],
    ];
  };

  const initialTransform = (): ZoomTransform => {
    const { w, h } = size!;
    if (h < w * 1.1) return zoomIdentity; // landscape: the whole world fits
    if (initialRegion) return boundsTransform(regionBounds(initialRegion), 8);
    // Portrait, unknown region: Americas + Europe + Africa around the Atlantic.
    const b = geo!.worldBounds;
    const k = Math.max(1, Math.min(3.4, (h * 0.5) / (b[1][1] - b[0][1])));
    const [px, py] = geo!.projection([-38, 14])!;
    return zoomIdentity.translate(w / 2 - k * px, h / 2 - k * py).scale(k);
  };

  const animateTo = (t: ZoomTransform) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    select(svg)
      .transition()
      .duration(reducedMotion() ? 0 : 700)
      .call(z.transform, t);
  };

  // (Re)build the zoom behavior whenever the projection changes.
  useEffect(() => {
    const svg = svgRef.current;
    const layer = layerRef.current;
    if (!svg || !layer || !geo) return;
    const b = geo.worldBounds;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent([
        [b[0][0] - 24, b[0][1] - 24],
        [b[1][0] + 24, b[1][1] + 24],
      ])
      .clickDistance(8)
      .on("zoom", (event: { transform: ZoomTransform }) => {
        kRef.current = event.transform.k;
        layer.setAttribute("transform", event.transform.toString());
        placeDots(event.transform.k);
      });
    zoomRef.current = z;
    const sel = select(svg).call(z);
    sel.call(z.transform, initialTransform());
    return () => {
      sel.on(".zoom", null);
    };
    // initialTransform/placeDots read refs and `geo`; rebuilding on geo is intended.
  }, [geo]);

  // Newly colored countries render new dot elements: place them for the current zoom.
  useEffect(() => {
    placeDots(kRef.current);
  }, [colors, geo]);

  useImperativeHandle(
    ref,
    () => ({
      flyToCountry(iso) {
        const f = WORLD_FEATURES.find((x) => x.properties.iso === iso);
        if (f && geo) animateTo(boundsTransform(geo.path.bounds(mainShape(f)) as Bounds, 7));
      },
      flyToRegion(key) {
        if (geo) animateTo(boundsTransform(regionBounds(key), 8));
      },
      showWorld() {
        animateTo(zoomIdentity);
      },
      zoomBy(factor) {
        const svg = svgRef.current;
        const z = zoomRef.current;
        if (svg && z)
          select(svg)
            .transition()
            .duration(reducedMotion() ? 0 : 250)
            .call(z.scaleBy, factor);
      },
    }),
    [geo, size, getInsets],
  );

  // Draw the selected country last so its outline sits on top of its neighbors.
  const shapes = geo
    ? selectedIso
      ? [...geo.shapes.filter((s) => s.iso !== selectedIso), ...geo.shapes.filter((s) => s.iso === selectedIso)]
      : geo.shapes
    : [];

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-water">
      {geo && size && (
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          role="img"
          aria-label={ariaLabel}
          className="world-map block touch-none select-none"
          onClick={(e) => {
            if (e.target === svgRef.current) onBackgroundClick();
          }}
        >
          <g ref={layerRef}>
            {shapes.map((s) => {
              const c = s.iso ? colors[s.iso] : null;
              const cls =
                "map-country" + (c ? ` is-${c}` : "") + (s.iso && s.iso === selectedIso ? " is-selected" : "");
              const iso = s.iso;
              return (
                <path
                  key={s.id}
                  d={s.d}
                  className={cls}
                  onClick={iso ? () => onSelectCountry(iso) : undefined}
                />
              );
            })}
            {geo.dots
              .filter((d) => colors[d.iso])
              .map((d) => (
                <g
                  key={d.iso}
                  data-dot=""
                  data-x={d.x}
                  data-y={d.y}
                  data-area={d.area}
                  className={`map-dot is-${colors[d.iso]}`}
                  style={{ display: "none" }}
                  onClick={() => onSelectCountry(d.iso)}
                >
                  <circle className="map-dot-hit" r={20} />
                  <circle className="map-dot-pin" r={7} />
                </g>
              ))}
          </g>
        </svg>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Labels builder, bare layout, minimal `MapApp`, route**

Add to `src/i18n/es.json` inside `"map"` (after `"subhead"`):

```json
    "page_title": "Mapa",
    "aria_map": "Mapa del mundo con las autoras de cada país",
```

Add to `src/i18n/en.json` inside `"map"` (after `"subhead"`):

```json
    "page_title": "Map",
    "aria_map": "World map of women writers by country",
```

Create `src/components/map/labels.ts`:

```ts
// labels.ts — Stage 11. Every string the /map island needs, resolved at
// build time in MapPage.astro and passed as one prop.

import { t } from "~/i18n/t";
import type { Locale } from "~/i18n/locales";

export interface MapPageLabels {
  ariaMap: string;
}

export function mapPageLabels(lang: Locale): MapPageLabels {
  return {
    ariaMap: t(lang, "map.aria_map"),
  };
}
```

In `src/layouts/Base.astro`, add `bare?: boolean;` to `Props`, add `bare = false,` to the destructuring, and change the nav line to:

```astro
    {!bare && <AdminAwareNav client:load labels={navLabels} />}
```

Create `src/components/map/MapApp.tsx`:

```tsx
// MapApp.tsx — Stage 11. State + composition for /[lang]/map.

import { useCallback, useMemo, useRef, useState } from "react";
import WorldMap, { type Insets, type WorldMapHandle } from "./WorldMap";
import type { MapPageLabels } from "./labels";
import { useCatalog } from "~/lib/use-catalog";
import { browserRegion } from "~/lib/map-region";
import {
  countryColor,
  countryStatuses,
  type BookStatus,
  type CountryEntry,
  type Filter,
} from "~/lib/map-state";

interface Props {
  labels: MapPageLabels;
}

const EMPTY: CountryEntry[] = [];

export default function MapApp({ labels }: Props) {
  const { state } = useCatalog();
  const [filter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [region] = useState(browserRegion);
  const mapRef = useRef<WorldMapHandle>(null);

  const catalog = state.kind === "loaded" ? state.catalog : EMPTY;
  const statuses = useMemo(() => countryStatuses(catalog), [catalog]);
  const colors = useMemo(() => {
    const out: Record<string, BookStatus | null> = {};
    for (const iso of Object.keys(statuses)) out[iso] = countryColor(statuses[iso], filter);
    return out;
  }, [statuses, filter]);

  const getInsets = useCallback((): Insets => ({ top: 0, right: 0, bottom: 0, left: 0 }), []);

  return (
    <WorldMap
      ref={mapRef}
      colors={colors}
      selectedIso={selected}
      ariaLabel={labels.ariaMap}
      initialRegion={region}
      getInsets={getInsets}
      onSelectCountry={(iso) => {
        setSelected(iso);
        mapRef.current?.flyToCountry(iso);
      }}
      onBackgroundClick={() => setSelected(null)}
    />
  );
}
```

Create `src/components/pages/MapPage.astro`:

```astro
---
import Base from "~/layouts/Base.astro";
import MapApp from "~/components/map/MapApp";
import { mapPageLabels } from "~/components/map/labels";
import { t } from "~/i18n/t";

interface Props {
  lang: "es" | "en";
}

const { lang } = Astro.props;
const labels = mapPageLabels(lang);
---

<Base lang={lang} title={`${t(lang, "map.page_title")} · ${t(lang, "meta.title")}`} description={t(lang, "meta.description")} bare>
  <main class="fixed inset-0 overflow-hidden bg-water">
    <MapApp client:only="react" labels={labels} />
  </main>
</Base>

<style is:global>
  html,
  body {
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
  }
</style>
```

Create `src/pages/[lang]/map.astro`:

```astro
---
import MapPage from "~/components/pages/MapPage.astro";
import { LOCALES, type Locale } from "~/i18n/locales";

export function getStaticPaths() {
  return LOCALES.map((lang) => ({ params: { lang } }));
}

const { lang } = Astro.params as { lang: Locale };
---
<MapPage lang={lang} />
```

- [ ] **Step 9: Run the gates**

Run: `npm test` → PASS. `npm run check` → 0 errors. `npm run format:check` → clean (fix with `npx prettier --write src`). `npm run build` → succeeds and lists `/es/map/index.html` and `/en/map/index.html`.

- [ ] **Step 10: Verify in the browser**

Start the local stack (`npm run dev:db`, then the `dev` preview server). Open `http://localhost:4321/es/map`.

1. Desktop width: the map fills the window, whole world visible, countries colored from the dev seed, no Antarctica.
2. Phone size (375 × 812): with a `Europe/*` time zone the map opens on Europe. Dragging pans the map and never scrolls the page; pinch/wheel zooms.
3. Tap Spain: outline turns dark and the map flies to Spain. Tap the sea: the outline clears.
4. Portugal and South Korea show a colored dot at world zoom; the dot disappears after zooming in on them.
5. Console: no errors.

- [ ] **Step 11: Hand off the commit**

```bash
git add package.json package-lock.json src/lib/world-geo.ts src/lib/world-geo.test.ts src/lib/authors.ts src/lib/use-catalog.ts src/components/map src/components/pages/MapPage.astro src/pages/[lang]/map.astro src/layouts/Base.astro src/styles/global.css src/i18n/es.json src/i18n/en.json ; git commit -m "feat(11): full-screen /map route with d3 WorldMap renderer and useCatalog hook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

> **Tasks 3–7 are outlined below.** Their step-by-step code is written into this file just before each task is executed (agreed 2026-10-07 to keep the planning short). Each outline fixes the scope, files, interfaces and checks, so the detailed steps cannot drift from the spec.

### Task 3: Floating UI + country panel

**Scope:** spec §5.2 minus search, list, book view and suggest sheet.

**Files:** create `src/components/map/icons.tsx`, `src/components/StatusPill.tsx`, `src/components/map/MapTopBar.tsx`, `FilterChips.tsx`, `MapControls.tsx`, `CountrySheet.tsx`, `CountryContent.tsx`, `Toast.tsx`; modify `MapApp.tsx`, `labels.ts`, `MapPage.astro` (pass `lang` + build-time `getCountries(lang)`), both i18n catalogs.

**Interfaces:**

- `StatusPill({ status: BookStatus; label: string })` — shared badge (penguin / sage / oxblood tints, as today).
- `CountryContent({ iso, name, authors, labels, onClose, onOpenBook(bookId), onSuggest(iso) })` — country header with author/book counts (`plural`), writers with years, book rows, empty-country state.
- `CountrySheet({ open, onClose, children })` — bottom sheet < 768 px (56% height, handle toggles full height), 400 px side panel ≥ 768 px; `role="dialog"`.
- `MapApp` gets `lang`, `countries: CountryOption[]`; `getInsets()` = top-bar height (ref) + 8, bottom 84, plus the panel (phones: `min(56% h, 540)` bottom; desktop: 432 right) while a country is selected.
- Labels added: home, language switch, filters, zoom in/out/world, close, expand/collapse, panel eyebrow, author/book counts (one/other), empty-country text, region names, region hint, loading, error, retry, statuses.
- Until Task 5: `onOpenBook` navigates to `/{lang}/book?id=`, `onSuggest` to `/{lang}/suggest`.

**Checks:** chips recolor the map with exact filters; the panel opens, expands, closes (✕, sea tap, Esc); fly-to frames the country above the sheet; the region hint shows once on phones; the globe shows the whole world; zoom buttons only on desktop; loading/error pill with "Reintentar". Gates + browser at 375 × 812 and 1280 wide.

**Commit:** `feat(11): floating map controls, filter chips and country panel`

### Task 4: Search, Map | List switch, list view, `/books` redirect

**Scope:** spec §5.2 search, §5.3, decision 2.

**Files:** create `SearchResults.tsx`, `ViewSwitch.tsx`, `MapList.tsx`; modify `MapApp.tsx`, `labels.ts`, i18n; replace `src/pages/[lang]/books.astro` with a static redirect page (`meta refresh` + `noindex` + canonical) to `/{lang}/map?view=list`; delete `src/components/pages/BooksPage.astro` and `src/components/BookList.tsx`; sitemap filter in `astro.config.mjs` also excludes `/books`; `BookDetail` back link points to the list.

**Interfaces:** `searchCatalog` / `listGroups` from Task 1. `MapApp` owns `query`, `searchOpen`, `view: "map" | "list"`; the view reads `?view=list` on mount and is kept in the URL with `history.replaceState`. Empty query + focus shows region shortcuts (`flyToRegion`).

**Checks:** "mexico" finds México; picking a result flies + opens the panel; in the list, the search filters live and chips filter by status; "Ver en el mapa" switches view and opens the country; switching keeps filter and query; the language button keeps `?view=list`; `/es/books` lands on the list. Gates + `npm run build`.

**Commit:** `feat(11): search, map/list switch and list view; /books redirects to the list`

### Task 5: Book view in the panel + suggest sheet

**Scope:** spec decisions 3 and 11.

**Files:** create `src/components/BookDetailView.tsx` (presentational, `compact?: boolean`), `src/components/book-labels.ts` (`bookDetailLabels(lang)`), `src/components/suggest-labels.ts` (`suggestFormLabels(lang)`), `src/components/map/BookPanel.tsx`, `src/components/map/SuggestSheet.tsx`; modify `BookDetail.tsx` (uses `BookDetailView`), `BookDetailPage.astro` and `SuggestPage.astro` (use the builders), `SuggestionForm.tsx` (new optional props `initialCountry?: string`, `onSuccess?: () => void`), `MapApp.tsx`, `MapPage.astro` (Turnstile site key, submit URL, suggest + book labels).

**Interfaces:** `BookPanel({ bookId, lang, labels, onBack, onClose })` fetches with `getBookDetail`; shows loading / error (+ link to the full page). `SuggestSheet({ open, initialCountry, onClose, ... })` injects the Turnstile script once on first open and shows an inline thank-you on success instead of navigating.

**Checks:** a book row opens the book view with real synopsis, quotes, buy links and the affiliate disclosure; "Ver página del libro" opens `/{lang}/book?id=`; the suggest button, the empty-country link (country prefilled) and "no results" all open the sheet; a real submission passes Turnstile and shows the thank-you; `/es/suggest` still works and still goes to `/es/thanks`. Gates.

**Commit:** `feat(11): book view in the map panel and suggest sheet`

### Task 6: Landing home, phone nav, remove the old map

> **Revised 2026-10-07 (owner):** the home is a pure landing page (spec §5.1). Replaces the earlier outline (mini-map preview, legend, suggest band).

**Scope:** spec §5.1, §5.1.1, §5.4, §6.3.

**Files:** create `src/lib/site-config.ts` (+ test: `parseMapOpen("true") === true`, anything else `false`; `MAP_OPEN` from `import.meta.env.PUBLIC_MAP_OPEN`) and add `PUBLIC_MAP_OPEN=true` to `.env.example` (Task 7 adds the env guard, CI value and the closed routes); create `src/lib/waitlist.ts` (+ test: `isValidEmail`, `joinWaitlist({ email, locale, news })` stub resolving `{ ok: false, reason: "not_available" }`), `src/components/WaitlistCard.tsx` (news checkbox, unticked), `src/components/home/MapPicture.astro` (build-time SVG + counts, no JS); rewrite `src/components/pages/IndexPage.astro` (hero, map picture, about Danny, how it works, closing band, footer; waitlist vs "Abrir el mapa" from `MAP_OPEN`); add `home.*` i18n keys; `AdminAwareNav.tsx` public variant = logo, "Mapa", "Conóceme", "Sugerir", short "EN"/"ES" pill (fits 360 px); `Base.astro` nav labels. Delete `MapSection.tsx`, `AuthorsMap.tsx`, `ContinentNav.tsx`, `MapFilter.tsx`, `CountryPanel.tsx`; remove `computeCountryStates`, `fillFor`, `CountryState`, `CountryStyle`, `MapLabels` and their tests; `npm uninstall @vnedyalk0v/react19-simple-maps`; remove the `.rsm-geography` rule from `global.css`; remove unused i18n keys (`hero.*` if replaced, `map.eyebrow/title/subhead`, old `map.panel.*` not used by `/map`).

**Checks:** home at 375 px and 1280 px, both locales: hero, map picture with build-time colors and counts, about Danny, how it works, closing band, footer, no horizontal scroll; with `MAP_OPEN` false the waitlist card validates the email and shows the "abre muy pronto" message, the news box starts unticked, the closing button jumps to the card; with `MAP_OPEN` true the hero and closing band show "Abrir el mapa" and the picture links to `/map`; nav fits at 360 px; `grep -rn "computeCountryStates\|fillFor\|simple-maps" src` returns nothing; the home ships no map JavaScript. Gates + `npm run build`.

**Commit:** `feat(11): landing home with waitlist card and map picture; phone nav; remove the old map`

### Task 7: "Map closed" switch + docs

> **Revised 2026-10-07 (owner):** stricter closed mode with admin access (spec §5.5). `site-config.ts` (`MAP_OPEN`) and the `.env.example` entry already landed in Task 6.

**Scope:** spec decisions 9–10, §5.5, §6.5.

**Files:** `astro.config.mjs` env guard requires `PUBLIC_MAP_OPEN` ∈ {`true`, `false`} (clear error otherwise) and the sitemap drops `/map`, `/book`, `/books`, `/suggest`, `/thanks` when closed; `.github/workflows/ci.yml` env `PUBLIC_MAP_OPEN: "true"`; create `src/components/pages/ComingSoonPage.astro` (eyebrow, text, `WaitlistCard`, home link, `noindex`) and a small admin gate (`AdminOnly.tsx` using `readSession`/`isAdmin` from `~/lib/admin-session`) with per-route wrappers for the real `/map` and `/book`; `map.astro`, `book.astro`, `suggest.astro`, `thanks.astro` (or their page components) branch on `MAP_OPEN`; `Base.astro` passes `mapOpen` so `AdminAwareNav` hides "Mapa" and "Sugerir" when closed. Carried minors from the Task 6 review (language pill width, one catalog fetch per build, remove `useCatalog`'s unused `realtime` option). Docs: `STATUS.md` (Stage 11 done section), ADR 0001 amendment (map renderer is now d3 directly), `RAG.md` if a doc was added.

**Manual steps for Alejandro:** `PUBLIC_MAP_OPEN=true` (or `false`) in the local `.env` — the dev server refuses to start without it; before merging, set `PUBLIC_MAP_OPEN=true` (Production scope) on the **staging** Cloudflare Pages project, or the staging build fails on the env guard.

**Checks:** `PUBLIC_MAP_OPEN=false npm run build` → `dist/es/map/index.html`, `dist/es/book/index.html`, `dist/es/suggest/index.html`, `dist/es/thanks/index.html` are the "Abre pronto" page (`noindex`), no map/suggest link in nav or home, sitemap without those routes; in the browser a signed-in admin gets the real map and book page; `PUBLIC_MAP_OPEN=true npm run build` → everything as before; missing or misspelled value → build fails with a clear message. Real-device pass (spec §9.7) before the PR.

**Commit:** `feat(11): PUBLIC_MAP_OPEN switch with coming-soon pages and admin access; docs`
