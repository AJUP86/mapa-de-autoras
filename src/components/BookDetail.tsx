// BookDetail.tsx — Stage 8.6
//
// Public, read-only book page. Reads ?id= from the URL on mount and fetches
// via the anon client — RLS returns the book only when its author is
// published. Shows the synopsis, the passages Danny underlined, and any buy
// links. The affiliate disclosure renders only when a buy link exists.

import { useEffect, useState } from "react";
import { getBookDetail, visibleLinks, type BookDetail as BookDetailData } from "~/lib/book-detail";
import type { BookStatus } from "~/lib/map-state";
import type { Locale } from "~/i18n/locales";

interface Labels {
  loading: string;
  error: string;
  not_found: string;
  back_to_books: string;
  country_label: string;
  year_label: string;
  language_label: string;
  synopsis_heading: string;
  quotes_heading: string;
  buy_heading: string;
  affiliate_disclosure: string;
  retailer: { amazon: string; bookshop: string; kobo: string; other: string };
  status: { to_read: string; reading: string; read: string };
}

interface Props {
  lang: Locale;
  labels: Labels;
  booksHref: string;
  siteTitle: string;
}

/** Only render covers from an http(s) source — cover_url is not DB-validated. */
function isSafeImageSrc(url: string | null): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "not_found" }
  | { kind: "loaded"; book: BookDetailData };

function StatusBadge({ status, labels }: { status: BookStatus; labels: Labels["status"] }) {
  const palette =
    status === "read"
      ? "bg-penguin/15 text-penguin"
      : status === "reading"
        ? "bg-sage/15 text-sage"
        : "bg-oxblood/10 text-oxblood";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium font-body " +
        palette
      }
    >
      {labels[status]}
    </span>
  );
}

function retailerLabel(retailer: string, labels: Labels["retailer"]): string {
  if (retailer === "amazon") return labels.amazon;
  if (retailer === "bookshop") return labels.bookshop;
  if (retailer === "kobo") return labels.kobo;
  return labels.other;
}

export default function BookDetail({ lang, labels, booksHref, siteTitle }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setState({ kind: "not_found" });
      return;
    }
    getBookDetail(id, lang)
      .then((book) => {
        if (cancelled) return;
        setState(book ? { kind: "loaded", book } : { kind: "not_found" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // The route is one static page per locale, so the server-rendered <title> is
  // the catalogue's. Correct the browser tab/history once the book is known.
  useEffect(() => {
    if (state.kind === "loaded") {
      document.title = `${state.book.title} · ${siteTitle}`;
    }
  }, [state, siteTitle]);

  const backLink = (
    <a href={booksHref} className="text-sm text-oxblood font-body underline hover:opacity-80">
      {labels.back_to_books}
    </a>
  );

  if (state.kind === "loading") return <p className="text-ink/60 font-body">{labels.loading}</p>;
  if (state.kind === "error")
    return (
      <div className="space-y-4 font-body">
        <p className="text-oxblood" role="alert">
          {labels.error}
        </p>
        {backLink}
      </div>
    );
  if (state.kind === "not_found")
    return (
      <div className="space-y-4 font-body">
        <p className="text-ink/70">{labels.not_found}</p>
        {backLink}
      </div>
    );

  const book = state.book;
  const links = visibleLinks(book.links, lang);

  return (
    <article className="font-body text-ink space-y-8">
      <div>{backLink}</div>

      <header className="flex flex-col gap-6 sm:flex-row">
        {isSafeImageSrc(book.coverUrl) && (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-32 shrink-0 rounded border border-ink/10 object-cover"
          />
        )}
        <div className="space-y-3">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight tracking-tight">
            {book.title}
          </h1>
          <p className="text-lg text-ink/75">{book.authorName}</p>
          <StatusBadge status={book.status} labels={labels.status} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-ink/70">
            <dt>{labels.country_label}</dt>
            <dd className="text-ink">{book.countryName}</dd>
            {book.year !== null && (
              <>
                <dt>{labels.year_label}</dt>
                <dd className="text-ink">{book.year}</dd>
              </>
            )}
            {book.originalLanguage && (
              <>
                <dt>{labels.language_label}</dt>
                <dd className="text-ink">{book.originalLanguage}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      {book.synopsis && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {labels.synopsis_heading}
          </h2>
          <p className="whitespace-pre-wrap text-ink/80 max-w-prose">{book.synopsis}</p>
        </section>
      )}

      {book.quotes.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {labels.quotes_heading}
          </h2>
          <ul className="space-y-4">
            {book.quotes.map((q) => (
              <li key={q.id} className="border-l-2 border-ochre pl-4">
                <blockquote className="italic text-ink/85 whitespace-pre-wrap">{q.text}</blockquote>
                {q.location && <p className="mt-1 text-xs text-ink/55">{q.location}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {links.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {labels.buy_heading}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {links.map((l) => (
              <li key={`${l.retailer}-${l.url}`}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="sponsored nofollow noopener"
                  className="inline-flex items-center rounded-lg border border-ink/15 bg-bone px-4 py-2 text-sm text-ink hover:border-oxblood/40 hover:text-oxblood transition-colors"
                >
                  {retailerLabel(l.retailer, labels.retailer)}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink/55 max-w-prose">{labels.affiliate_disclosure}</p>
        </section>
      )}
    </article>
  );
}
