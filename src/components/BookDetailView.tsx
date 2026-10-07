// BookDetailView.tsx — Stage 11. One book's curated content (Stage 8.6 data):
// the synopsis, the passages Danny underlined and the buy links, with the
// affiliate disclosure only when a buy link exists. Presentational: the full
// page /[lang]/book (BookDetail) and the /map panel's book view (BookPanel,
// `compact`) fetch the book and pass it in.

import type { ReactNode } from "react";
import type { Locale } from "~/i18n/locales";
import { visibleLinks, type BookDetail } from "~/lib/book-detail";
import type { BookDetailLabels } from "./book-labels";
import BookCover from "./BookCover";
import StatusPill from "./StatusPill";
import { IconExternal } from "./icons";

interface Props {
  book: BookDetail;
  lang: Locale;
  labels: BookDetailLabels;
  /** The /map panel: cover block, small section headings, a link to the full page. */
  compact?: boolean;
}

/** Only render covers from an http(s) source — cover_url is not DB-validated. */
function isSafeImageSrc(url: string | null): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

function retailerLabel(retailer: string, labels: BookDetailLabels["retailer"]): string {
  if (retailer === "amazon") return labels.amazon;
  if (retailer === "bookshop") return labels.bookshop;
  if (retailer === "kobo") return labels.kobo;
  return labels.other;
}

/** Buy links open in a new tab and are marked as paid (affiliate) links. */
const BUY_REL = "sponsored nofollow noopener";

export default function BookDetailView({ book, lang, labels, compact = false }: Props) {
  const links = visibleLinks(book.links, lang);
  return compact ? (
    <CompactView book={book} lang={lang} labels={labels} links={links} />
  ) : (
    <FullView book={book} labels={labels} links={links} />
  );
}

type ViewProps = Pick<Props, "book" | "labels"> & { links: ReturnType<typeof visibleLinks> };

/** The full page: h1 title, h2 sections, a country / year / language list. */
function FullView({ book, labels, links }: ViewProps) {
  return (
    <article className="font-body text-ink space-y-8">
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
          <StatusPill status={book.status} label={labels.status[book.status]} />
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
                  rel={BUY_REL}
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

/**
 * Section of the compact view. The global h1–h6 rule (display font, tight
 * tracking) is unlayered and beats utilities on the heading itself, so the
 * body font and the wide tracking go on an inner span.
 */
function CompactSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid justify-items-start gap-2 pt-5">
      <h3 className="text-[0.72rem] leading-normal text-ink/60 uppercase">
        <span className="font-body tracking-[0.16em]">{title}</span>
      </h3>
      {children}
    </section>
  );
}

/** The /map panel: cover + title block, small section headings, a link to the full page. */
function CompactView({ book, lang, labels, links }: ViewProps & { lang: Locale }) {
  const meta = book.year !== null ? `${book.countryName} · ${book.year}` : book.countryName;
  return (
    <article className="px-5 pt-5 pb-7 text-ink">
      <header className="flex items-start gap-[18px] pb-2">
        {isSafeImageSrc(book.coverUrl) ? (
          // The title is right next to it: decorative here.
          <img
            src={book.coverUrl}
            alt=""
            className="h-[108px] w-[76px] flex-none rounded-[2px_6px_6px_2px] border border-ink/10 object-cover"
          />
        ) : (
          <BookCover title={book.title} status={book.status} size="lg" />
        )}
        <div className="min-w-0">
          <h2 className="font-display text-[1.65rem] leading-[1.12] font-semibold break-words text-ink">
            {book.title}
          </h2>
          <p className="mt-1.5 font-semibold text-ink/75">{book.authorName}</p>
          <p className="mt-0.5 mb-2.5 text-[0.88rem] text-ink/60 tabular-nums">{meta}</p>
          <StatusPill status={book.status} label={labels.status[book.status]} />
        </div>
      </header>

      {book.synopsis && (
        <CompactSection title={labels.synopsis_heading}>
          <p className="whitespace-pre-wrap text-ink/85">{book.synopsis}</p>
        </CompactSection>
      )}

      {book.quotes.length > 0 && (
        <CompactSection title={labels.quotes_heading}>
          <ul className="grid gap-4">
            {book.quotes.map((q) => (
              <li key={q.id}>
                <blockquote className="border-l-[3px] border-ochre pl-3.5 font-display text-[1.1rem] leading-snug whitespace-pre-wrap text-ink/75 italic">
                  {q.text}
                </blockquote>
                {q.location && (
                  <p className="mt-1 pl-[17px] text-[0.8rem] text-ink/60">{q.location}</p>
                )}
              </li>
            ))}
          </ul>
        </CompactSection>
      )}

      {links.length > 0 && (
        <CompactSection title={labels.buy_heading}>
          <ul className="flex flex-wrap gap-2">
            {links.map((l) => (
              <li key={`${l.retailer}-${l.url}`}>
                <a
                  href={l.url}
                  target="_blank"
                  rel={BUY_REL}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[0.88rem] font-semibold text-ink ring-[1.5px] ring-ink ring-inset transition-colors hover:bg-ink hover:text-bone"
                >
                  {retailerLabel(l.retailer, labels.retailer)}
                  <IconExternal />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[0.78rem] leading-[1.45] text-ink/60">{labels.affiliate_disclosure}</p>
        </CompactSection>
      )}

      <p className="pt-6">
        <a
          href={`/${lang}/book?id=${encodeURIComponent(book.id)}`}
          className="inline-flex min-h-11 items-center text-[0.9rem] font-semibold text-oxblood underline underline-offset-[3px] hover:text-oxblood-2"
        >
          {labels.open_page}
        </a>
      </p>
    </article>
  );
}
