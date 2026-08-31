// BookList.tsx — Stage 8.5 task 14
//
// Public, read-only book catalogue. Fetches every published book via the
// anon client (RLS gates it to published authors' books — no self-filter),
// then renders a bilingual, filterable table with a read-only status badge
// per book. No editing, no realtime, no writes — the map owns live state.

import { useEffect, useState } from "react";
import { supabase } from "~/lib/supabase";
import type { BookStatus } from "~/lib/map-state";
import type { Locale } from "~/i18n/locales";
import {
  deriveCountryOptions,
  deriveYearOptions,
  filterBooks,
  type BookListRow,
} from "~/lib/book-list";
import BookFilters from "./BookFilters";

interface Labels {
  title: string;
  intro: string;
  loading: string;
  error: string;
  empty: string;
  col_author: string;
  col_country: string;
  col_book: string;
  col_year: string;
  col_status: string;
  filter_author_placeholder: string;
  filter_country_all: string;
  filter_year_all: string;
  no_matches: string;
  view_detail: string;
  status: { to_read: string; reading: string; read: string };
}

interface Props {
  lang: Locale;
  labels: Labels;
}

type State = { kind: "loading" } | { kind: "error" } | { kind: "loaded"; rows: BookListRow[] };

// PostgREST embeds authors!inner as an object on each book row.
interface RawRow {
  id: string;
  title: string;
  year: number | null;
  status: BookStatus;
  authors: {
    name: string;
    country_iso_a3: string;
    countries: { name_es: string; name_en: string };
  };
}

function StatusBadge({ status, labels }: { status: BookStatus; labels: Labels["status"] }) {
  // Reuses the map/panel encoding: read = penguin, reading = sage, to_read = oxblood.
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

export default function BookList({ lang, labels }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [fAuthor, setFAuthor] = useState("");
  const [fCountry, setFCountry] = useState("");
  const [fYear, setFYear] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("books")
      .select(
        "id, title, year, status, authors!inner(name, country_iso_a3, countries!inner(name_es, name_en))",
      )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[BookList] load failed:", error.message);
          setState({ kind: "error" });
          return;
        }
        const rows: BookListRow[] = ((data ?? []) as unknown as RawRow[]).map((row) => ({
          id: row.id,
          title: row.title,
          year: row.year,
          status: row.status,
          authorName: row.authors.name,
          country: row.authors.country_iso_a3,
          countryName:
            lang === "en" ? row.authors.countries.name_en : row.authors.countries.name_es,
        }));
        rows.sort(
          (a, b) =>
            a.authorName.localeCompare(b.authorName, lang) || a.title.localeCompare(b.title, lang),
        );
        setState({ kind: "loaded", rows });
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const rows = state.kind === "loaded" ? state.rows : [];
  const countryOptions = deriveCountryOptions(rows, lang);
  const yearOptions = deriveYearOptions(rows);
  const filtered = filterBooks(rows, { author: fAuthor, country: fCountry, year: fYear });

  return (
    <div className="font-body text-ink">
      {state.kind === "loading" && <p className="text-ink/60">{labels.loading}</p>}
      {state.kind === "error" && (
        <p className="text-oxblood" role="alert">
          {labels.error}
        </p>
      )}
      {state.kind === "loaded" && state.rows.length === 0 && (
        <p className="text-ink/60">{labels.empty}</p>
      )}
      {state.kind === "loaded" && state.rows.length > 0 && (
        <>
          <BookFilters
            author={fAuthor}
            country={fCountry}
            year={fYear}
            onAuthor={setFAuthor}
            onCountry={setFCountry}
            onYear={setFYear}
            countryOptions={countryOptions}
            yearOptions={yearOptions}
            labels={labels}
          />
          {filtered.length === 0 ? (
            <p className="text-ink/60">{labels.no_matches}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/20 text-left text-ink/70">
                  <th className="py-2 pr-4">{labels.col_author}</th>
                  <th className="py-2 pr-4">{labels.col_country}</th>
                  <th className="py-2 pr-4">{labels.col_book}</th>
                  <th className="py-2 pr-4">{labels.col_year}</th>
                  <th className="py-2">{labels.col_status}</th>
                  <th className="py-2">
                    <span className="sr-only">{labels.view_detail}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-ink/10 hover:bg-bone/40">
                    <td className="py-2 pr-4 text-ink">{row.authorName}</td>
                    <td className="py-2 pr-4 text-ink/70">{row.countryName}</td>
                    <td className="py-2 pr-4 text-ink/80">{row.title}</td>
                    <td className="py-2 pr-4 text-ink/70">{row.year ?? "—"}</td>
                    <td className="py-2">
                      <StatusBadge status={row.status} labels={labels.status} />
                    </td>
                    <td className="py-2">
                      <a
                        href={`/${lang}/book?id=${row.id}`}
                        className="text-oxblood underline hover:opacity-80"
                      >
                        {labels.view_detail}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
