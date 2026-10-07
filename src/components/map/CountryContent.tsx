// CountryContent.tsx — Stage 11. What the /map panel shows for a country:
// sticky header (name + counts + close), each writer with her years and book
// rows, and a "missing someone?" footer — or the empty-country invitation.

import type { Author } from "~/lib/map-state";
import { fmt, plural } from "~/i18n/format";
import { authorYears } from "~/lib/panel-format";
import BookRow from "./BookRow";
import { IconClose } from "./icons";
import type { MapPageLabels } from "./labels";

interface Props {
  iso: string;
  name: string;
  authors: ReadonlyArray<Author>;
  labels: MapPageLabels;
  /** Shown instead of the writers while the catalog is loading or failed. */
  notice?: string | null;
  /** Back from this book's view: its row takes the panel's focus instead of ✕ (when it is still listed). */
  focusBookId?: string | null;
  onClose: () => void;
  onOpenBook: (bookId: string) => void;
  onSuggest: (iso: string) => void;
}

export default function CountryContent({
  iso,
  name,
  authors,
  labels,
  notice,
  focusBookId,
  onClose,
  onOpenBook,
  onSuggest,
}: Props) {
  const focusRow =
    !notice && focusBookId != null && authors.some((a) => a.books.some((b) => b.id === focusBookId))
      ? focusBookId
      : null;
  const bookCount = authors.reduce((n, a) => n + a.books.length, 0);
  const counts =
    !notice && authors.length > 0
      ? `${plural(authors.length, labels.count.authorOne, labels.count.authorOther)} · ${plural(
          bookCount,
          labels.count.bookOne,
          labels.count.bookOther,
        )}`
      : null;

  return (
    <>
      <header className="sticky top-0 z-[1] flex items-start gap-1.5 border-b border-ink/10 bg-bone pt-1 pr-2.5 pb-3 pl-5 md:pt-3.5">
        <div className="min-w-0 flex-1 pt-px">
          <p className="text-[0.72rem] font-medium tracking-[0.18em] text-ink/60 uppercase">
            {labels.panel.eyebrow}
          </p>
          <h2 className="mt-0.5 font-display text-[1.6rem] leading-tight font-semibold text-ink">
            {name}
          </h2>
          {counts && <p className="mt-1 text-[0.88rem] text-ink/60">{counts}</p>}
        </div>
        <button
          type="button"
          data-autofocus={focusRow ? undefined : ""}
          aria-label={labels.panel.close}
          onClick={onClose}
          className="grid size-11 flex-none place-items-center rounded-full text-ink hover:bg-parchment"
        >
          <IconClose />
        </button>
      </header>

      <div className="px-5 pt-1.5 pb-7">
        {notice ? (
          <p className="pt-6 text-ink/75">{notice}</p>
        ) : authors.length === 0 ? (
          <div className="grid justify-items-start gap-4 pt-6 pb-2">
            <p className="text-ink/75">{fmt(labels.panel.emptyCountry, { country: name })}</p>
            <button
              type="button"
              onClick={() => onSuggest(iso)}
              className="min-h-[46px] rounded-full bg-oxblood px-5 py-2 text-left text-[0.95rem] font-semibold text-bone hover:bg-oxblood-2"
            >
              {fmt(labels.panel.suggestCountry, { country: name })}
            </button>
          </div>
        ) : (
          <>
            {authors.map((author) => {
              const years = authorYears(author.birth_year, author.death_year, labels.yearsBorn);
              return (
                <article
                  key={author.id}
                  className="border-b border-ink/10 py-[18px] last-of-type:border-b-0"
                >
                  <h3 className="font-display text-[1.2rem] leading-snug font-semibold text-ink">
                    {author.name}
                  </h3>
                  {years && (
                    <p className="mt-0.5 text-[0.82rem] text-ink/60 tabular-nums">{years}</p>
                  )}
                  {author.books.length > 0 && (
                    <ul className="mt-1.5 grid gap-1.5">
                      {author.books.map((book) => (
                        <li key={book.id}>
                          <BookRow
                            book={book}
                            meta={book.year != null ? String(book.year) : null}
                            statusLabel={labels.status[book.status]}
                            surface="parchment"
                            autofocus={book.id === focusRow}
                            onOpen={onOpenBook}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
            <div className="grid justify-items-start pt-[18px]">
              <p className="text-[0.92rem] text-ink/75">
                {fmt(labels.panel.missing, { country: name })}
              </p>
              <button
                type="button"
                onClick={() => onSuggest(iso)}
                className="min-h-11 text-[0.9rem] font-semibold text-oxblood underline underline-offset-[3px] hover:text-oxblood-2"
              >
                {labels.panel.suggest}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
