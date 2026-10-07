// MapList.tsx — Stage 11. The list view of /map (?view=list): every book that
// matches the status filter and the search, grouped by country (listGroups).
// It covers the map, which stays mounted underneath and keeps its view. Rows
// open the book; "Ver en el mapa" goes back to the map on that country.
// The scroll area starts below the measured top bar (`--map-top-h`, set by
// MapApp), so no row ever sits under the bar, whose blank parts let taps
// through. Scroll padding keeps a focused row clear of the Map | List pill.

import { useMemo } from "react";
import { fmt, plural } from "~/i18n/format";
import type { Locale } from "~/i18n/locales";
import { listGroups } from "~/lib/map-search";
import type { CountryEntry, Filter } from "~/lib/map-state";
import BookRow from "./BookRow";
import type { MapPageLabels } from "./labels";

interface Props {
  id: string;
  catalog: ReadonlyArray<CountryEntry>;
  /** Localized country names by ISO code. */
  names: ReadonlyMap<string, string>;
  filter: Filter;
  query: string;
  lang: Locale;
  labels: MapPageLabels;
  /** False while the catalog is loading or failed (the top bar's pill says so): no list yet. */
  ready: boolean;
  onOpenBook: (bookId: string) => void;
  onShowOnMap: (iso: string) => void;
  onSuggest: () => void;
}

export default function MapList({
  id,
  catalog,
  names,
  filter,
  query,
  lang,
  labels,
  ready,
  onOpenBook,
  onShowOnMap,
  onSuggest,
}: Props) {
  const groups = useMemo(
    () => listGroups(catalog, names, filter, query, lang),
    [catalog, names, filter, query, lang],
  );
  const c = labels.count;
  const q = query.trim();
  let message = "";
  if (ready && groups.length === 0) {
    message = q ? fmt(labels.list.emptyQuery, { q }) : labels.list.emptyFilter;
  } else if (ready) {
    const books = groups.flatMap((g) => g.books);
    message = fmt(labels.list.summary, {
      books: plural(books.length, c.bookOne, c.bookOther),
      authors: plural(new Set(books.map((h) => h.author.id)).size, c.authorOne, c.authorOther),
      countries: plural(groups.length, c.countryOne, c.countryOther),
    });
  }
  const empty = ready && groups.length === 0;

  return (
    <div
      id={id}
      className="absolute inset-x-0 top-[var(--map-top-h,128px)] bottom-0 z-10 scroll-pt-2 scroll-pb-24 overflow-y-auto overscroll-contain bg-parchment px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)_+_100px)]"
    >
      <div className="mx-auto max-w-[720px]">
        <h1 className="sr-only">{labels.list.heading}</h1>
        {/* One live region for the summary and the empty message: it updates as the reader types. */}
        <div role="status" className={empty ? "px-2 pt-12 text-center" : ""}>
          {message && <p className="mb-5 text-ink/75 tabular-nums">{message}</p>}
        </div>
        {empty && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onSuggest}
              className="min-h-11 rounded-full bg-oxblood px-5 text-[0.95rem] font-semibold text-bone hover:bg-oxblood-2"
            >
              {labels.list.suggest}
            </button>
          </div>
        )}
        {ready &&
          groups.map((g) => {
            const headingId = `${id}-${g.iso_a3}`;
            return (
              <section
                key={g.iso_a3}
                aria-labelledby={headingId}
                className="mt-7 first-of-type:mt-0"
              >
                <header className="mb-1 flex items-baseline justify-between gap-3 border-b border-ink/10 pb-1">
                  <h2
                    id={headingId}
                    className="font-display text-[1.35rem] leading-tight font-semibold text-ink"
                  >
                    {g.name}
                    <span className="ml-1.5 font-body text-[0.85rem] font-normal text-ink/60 tabular-nums">
                      {g.books.length}
                    </span>
                  </h2>
                  <button
                    type="button"
                    aria-describedby={headingId}
                    onClick={() => onShowOnMap(g.iso_a3)}
                    className="min-h-11 flex-none text-[0.9rem] font-semibold text-oxblood underline underline-offset-[3px] hover:text-oxblood-2"
                  >
                    {labels.list.showOnMap}
                  </button>
                </header>
                <ul className="grid gap-1.5 pt-1">
                  {g.books.map((h) => (
                    <li key={h.book.id}>
                      <BookRow
                        book={h.book}
                        meta={
                          h.book.year != null ? `${h.author.name} · ${h.book.year}` : h.author.name
                        }
                        statusLabel={labels.status[h.book.status]}
                        surface="bone"
                        onOpen={onOpenBook}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
      </div>
    </div>
  );
}
