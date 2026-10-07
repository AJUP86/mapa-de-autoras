// SearchResults.tsx — Stage 11. The dropdown under the /map search field (map
// view only): region shortcuts for an empty query; otherwise the countries,
// writers and books searchCatalog found, or "not found" + suggest (or, while
// the catalog is loading or failed, that notice instead). Rows are buttons;
// MapApp decides what a pick does.

import { useId, type ReactNode } from "react";
import { fmt, plural } from "~/i18n/format";
import { REGION_ORDER, type RegionKey } from "~/lib/map-region";
import type { SearchResults as Hits } from "~/lib/map-search";
import { countryColor, type BookStatus } from "~/lib/map-state";
import { STATUS_FILL } from "../status-colors";
import type { MapPageLabels } from "./labels";

interface Props {
  id: string;
  query: string;
  hits: Hits;
  /** Localized country names by ISO code. */
  names: ReadonlyMap<string, string>;
  /** Distinct book statuses per country (countryStatuses). */
  statuses: Readonly<Record<string, BookStatus[]>>;
  /**
   * Loading / error text while the catalog is not loaded (null once it is):
   * writer counts are unknown, and "not found" would not be true yet.
   */
  notice: string | null;
  /** Set when loading failed: shows the retry button under the notice. */
  onRetry?: () => void;
  labels: MapPageLabels;
  onRegion: (key: RegionKey) => void;
  onCountry: (iso: string) => void;
  onBook: (bookId: string) => void;
  onSuggest: () => void;
}

/** Color dot class: the status color, or a neutral dot for nothing to show. */
const dotClass = (status: BookStatus | null) => (status ? STATUS_FILL[status] : "bg-ink/20");

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId}>
      <p
        id={headingId}
        className="mx-2.5 mt-2 mb-1.5 text-[0.7rem] font-semibold tracking-[0.14em] text-ink/60 uppercase"
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  dot,
  title,
  sub,
  onClick,
}: {
  dot: string;
  title: string;
  sub: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-2.5 py-[9px] text-left hover:bg-parchment"
    >
      <span aria-hidden="true" className={`size-[9px] flex-none rounded-full ${dot}`} />
      <span className="grid min-w-0 flex-1">
        <span className="font-semibold text-ink">{title}</span>
        {sub && <span className="text-[0.82rem] text-ink/60">{sub}</span>}
      </span>
    </button>
  );
}

export default function SearchResults({
  id,
  query,
  hits,
  names,
  statuses,
  notice,
  onRetry,
  labels,
  onRegion,
  onCountry,
  onBook,
  onSuggest,
}: Props) {
  const q = query.trim();
  const none = hits.countries.length + hits.authors.length + hits.books.length === 0;
  const r = labels.results;

  return (
    <div
      id={id}
      role="dialog"
      aria-label={labels.search.label}
      className="absolute inset-x-0 top-[52px] z-[1] max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain rounded-2xl bg-bone p-2 shadow-float"
    >
      {!q ? (
        <Section title={r.regions}>
          {/* Row gap 10 px: the chips' 44 px tap areas (::before) do not overlap. */}
          <div className="flex flex-wrap gap-x-1.5 gap-y-2.5 px-2 pt-0.5 pb-2">
            {REGION_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onRegion(key)}
                className="relative inline-flex h-[34px] flex-none items-center rounded-full bg-bone px-3 text-[0.86rem] font-medium whitespace-nowrap text-ink ring-1 ring-ink/10 ring-inset before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-[''] hover:bg-parchment"
              >
                {labels.regions[key]}
              </button>
            ))}
          </div>
        </Section>
      ) : none && notice ? (
        <div className="grid justify-items-start gap-1 px-2.5 pt-2 pb-1">
          <p className="text-ink/75">{notice}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 font-semibold text-oxblood underline underline-offset-[3px] hover:text-oxblood-2"
            >
              {labels.retry}
            </button>
          )}
        </div>
      ) : none ? (
        <div className="grid justify-items-start gap-2.5 px-2.5 pt-2 pb-1">
          <p className="text-ink/75">{fmt(r.none, { q })}</p>
          <button
            type="button"
            onClick={onSuggest}
            className="min-h-11 rounded-full bg-oxblood px-4 text-[0.88rem] font-semibold text-bone hover:bg-oxblood-2"
          >
            {r.suggest}
          </button>
        </div>
      ) : (
        <>
          {hits.countries.length > 0 && (
            <Section title={r.countries}>
              {hits.countries.map((c) => (
                <Row
                  key={c.iso_a3}
                  dot={dotClass(countryColor(statuses[c.iso_a3], "all"))}
                  title={c.name}
                  sub={
                    notice
                      ? null
                      : c.authorCount > 0
                        ? plural(c.authorCount, labels.count.authorOne, labels.count.authorOther)
                        : r.noAuthors
                  }
                  onClick={() => onCountry(c.iso_a3)}
                />
              ))}
            </Section>
          )}
          {hits.authors.length > 0 && (
            <Section title={r.authors}>
              {hits.authors.map((a) => (
                <Row
                  key={a.author.id}
                  // Her own books' color under "all" (read > reading > to_read).
                  dot={dotClass(
                    countryColor(
                      a.author.books.map((b) => b.status),
                      "all",
                    ),
                  )}
                  title={a.author.name}
                  sub={names.get(a.iso_a3) ?? a.iso_a3}
                  onClick={() => onCountry(a.iso_a3)}
                />
              ))}
            </Section>
          )}
          {hits.books.length > 0 && (
            <Section title={r.books}>
              {hits.books.map((b) => (
                <Row
                  key={b.book.id}
                  dot={dotClass(b.book.status)}
                  title={b.book.title}
                  sub={b.author.name}
                  onClick={() => onBook(b.book.id)}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
