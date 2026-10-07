// BookDetail.tsx — Stage 8.6
//
// Public, read-only book page. Reads ?id= from the URL on mount and fetches
// via the anon client — RLS returns the book only when its author is
// published. BookDetailView draws the book (synopsis, the passages Danny
// underlined, buy links); this page adds the back link and the tab title.

import { useEffect, useState } from "react";
import { getBookDetail, type BookDetail as BookDetailData } from "~/lib/book-detail";
import type { Locale } from "~/i18n/locales";
import type { BookDetailLabels } from "./book-labels";
import BookDetailView from "./BookDetailView";

interface Props {
  lang: Locale;
  labels: BookDetailLabels;
  /** The list view of the map (`/{lang}/map?view=list`). */
  listHref: string;
  siteTitle: string;
}

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "not_found" }
  | { kind: "loaded"; book: BookDetailData };

export default function BookDetail({ lang, labels, listHref, siteTitle }: Props) {
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
    <a href={listHref} className="text-sm text-oxblood font-body underline hover:opacity-80">
      {labels.back_to_list}
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

  return (
    <div className="space-y-8">
      <div className="font-body">{backLink}</div>
      <BookDetailView book={state.book} lang={lang} labels={labels} />
    </div>
  );
}
