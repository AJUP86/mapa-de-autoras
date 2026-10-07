// BookPanel.tsx — Stage 11. A book's view inside the /map panel: a sticky
// header (back to the country, the country's name, close) over the compact
// BookDetailView. The detail (synopsis, quotes, buy links) is fetched on
// demand; loading, error and not-found show a short message with a link to
// the full book page.

import { useEffect, useState } from "react";
import type { Locale } from "~/i18n/locales";
import { getBookDetail, type BookDetail } from "~/lib/book-detail";
import type { BookStatus } from "~/lib/map-state";
import type { BookDetailLabels } from "../book-labels";
import BookDetailView from "../BookDetailView";
import { IconBack, IconClose } from "./icons";

interface Props {
  bookId: string;
  lang: Locale;
  labels: BookDetailLabels;
  /** The catalog's current status for this book (live: Realtime patches it), when known. */
  status?: BookStatus;
  /** Localized name of the book's country (the header text). */
  countryName: string;
  /** Accessible name of the back button ("Volver a México"). */
  backLabel: string;
  closeLabel: string;
  onBack: () => void;
  onClose: () => void;
}

type Result = { kind: "loaded"; book: BookDetail } | { kind: "not_found" } | { kind: "error" };

// Books already fetched on this page, so going back and forth between a
// country and the same book does not fetch it again.
const cache = new Map<string, BookDetail>();
const cacheKey = (id: string, lang: Locale) => `${lang}:${id}`;

/**
 * The cached detail for a book, unless the catalog's status for it has moved
 * on since it was fetched: then the entry is dropped (and fetched again).
 */
function cachedDetail(id: string, lang: Locale, status?: BookStatus): BookDetail | undefined {
  const key = cacheKey(id, lang);
  const cached = cache.get(key);
  if (cached && status && cached.status !== status) {
    cache.delete(key);
    return undefined;
  }
  return cached;
}

export default function BookPanel({
  bookId,
  lang,
  labels,
  status,
  countryName,
  backLabel,
  closeLabel,
  onBack,
  onClose,
}: Props) {
  // The result for `id`; anything for another id means "still loading".
  const [result, setResult] = useState<{ id: string; value: Result } | null>(() => {
    const book = cachedDetail(bookId, lang, status);
    return book ? { id: bookId, value: { kind: "loaded", book } } : null;
  });

  useEffect(() => {
    const cached = cachedDetail(bookId, lang, status);
    if (cached) {
      setResult((r) =>
        r?.id === bookId ? r : { id: bookId, value: { kind: "loaded", book: cached } },
      );
      return;
    }
    let cancelled = false;
    getBookDetail(bookId, lang)
      .then((book) => {
        if (book) cache.set(cacheKey(bookId, lang), book);
        if (!cancelled)
          setResult({
            id: bookId,
            value: book ? { kind: "loaded", book } : { kind: "not_found" },
          });
      })
      .catch(() => {
        if (!cancelled) setResult({ id: bookId, value: { kind: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, lang, status]);

  const value = result?.id === bookId ? result.value : null;
  const pageHref = `/${lang}/book?id=${encodeURIComponent(bookId)}`;

  return (
    <>
      <header className="sticky top-0 z-[1] flex items-center gap-1.5 border-b border-ink/10 bg-bone pt-1 pr-2.5 pb-2 pl-2 md:pt-2.5">
        <button
          type="button"
          aria-label={backLabel}
          onClick={onBack}
          className="grid size-11 flex-none place-items-center rounded-full text-ink hover:bg-parchment"
        >
          <IconBack />
        </button>
        <p className="min-w-0 flex-1 truncate text-[0.92rem] font-semibold text-ink/75">
          {countryName}
        </p>
        <button
          type="button"
          data-autofocus
          aria-label={closeLabel}
          onClick={onClose}
          className="grid size-11 flex-none place-items-center rounded-full text-ink hover:bg-parchment"
        >
          <IconClose />
        </button>
      </header>

      {value?.kind === "loaded" ? (
        // The catalog's status wins: it is live, the fetched detail is a snapshot.
        <BookDetailView
          book={status ? { ...value.book, status } : value.book}
          lang={lang}
          labels={labels}
          compact
        />
      ) : (
        <div role="status" className="grid justify-items-start gap-2 px-5 pt-6 pb-7">
          <p className="text-ink/75">
            {!value ? labels.loading : value.kind === "error" ? labels.error : labels.not_found}
          </p>
          {value && (
            <a
              href={pageHref}
              className="inline-flex min-h-11 items-center text-[0.9rem] font-semibold text-oxblood underline underline-offset-[3px] hover:text-oxblood-2"
            >
              {labels.open_page}
            </a>
          )}
        </div>
      )}
    </>
  );
}
