// BookStatusEditor.tsx — Stage 8.5 task 13
//
// Admin table of all books with an inline status <select> per book.
// Changing a status writes books.status (optimistic UI + error revert).
// books has REPLICA IDENTITY FULL and is in the supabase_realtime
// publication, so the mutation repaints the public map live via the
// existing MapSection subscription — this component is only the mutator
// and holds no realtime subscription of its own.

import { useEffect, useState } from "react";
import { supabase } from "~/lib/supabase";
import type { BookStatus } from "~/lib/map-state";

interface BookRow {
  id: string;
  title: string;
  year: number | null;
  status: BookStatus;
  authorName: string;
  country: string;
  countryName: string;
}

interface Labels {
  title: string;
  loading: string;
  error: string;
  empty: string;
  col_author: string;
  col_country: string;
  col_book: string;
  col_year: string;
  col_status: string;
  status_to_read: string;
  status_reading: string;
  status_read: string;
  save_error: string;
  filter_author_placeholder: string;
  filter_country_all: string;
  filter_year_all: string;
  no_matches: string;
}

interface Props {
  labels: Labels;
}

type State = { kind: "loading" } | { kind: "error" } | { kind: "loaded"; rows: BookRow[] };

// PostgREST embeds authors!inner as an object on each book row.
interface RawBookRow {
  id: string;
  title: string;
  year: number | null;
  status: BookStatus;
  authors: { name: string; country_iso_a3: string; countries: { name_es: string } };
}

export default function BookStatusEditor({ labels }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [saveErrors, setSaveErrors] = useState<Set<string>>(new Set());
  // Rows with an in-flight status save. Their <select> is disabled so a
  // concurrent same-row edit can't race the optimistic revert.
  const [saving, setSaving] = useState<Set<string>>(new Set());
  // Client-side filters (country / author / year). Status + title are not
  // filtered (few distinct values / effectively unique).
  const [fAuthor, setFAuthor] = useState("");
  const [fCountry, setFCountry] = useState("");
  const [fYear, setFYear] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("books")
      .select(
        "id, title, year, status, authors!inner(name, country_iso_a3, countries!inner(name_es))",
      )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[BookStatusEditor] load failed:", error.message);
          setState({ kind: "error" });
          return;
        }
        const rows: BookRow[] = ((data ?? []) as unknown as RawBookRow[]).map((row) => ({
          id: row.id,
          title: row.title,
          year: row.year,
          status: row.status,
          authorName: row.authors.name,
          country: row.authors.country_iso_a3,
          countryName: row.authors.countries.name_es,
        }));
        rows.sort(
          (a, b) =>
            a.authorName.localeCompare(b.authorName, "es") || a.title.localeCompare(b.title, "es"),
        );
        setState({ kind: "loaded", rows });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateStatus = async (id: string, next: BookStatus) => {
    let previous: BookStatus | undefined;
    setSaving((prev) => new Set(prev).add(id));
    // Optimistic: reflect `next` immediately and clear this row's error.
    setState((s) => {
      if (s.kind !== "loaded") return s;
      return {
        kind: "loaded",
        rows: s.rows.map((row) => {
          if (row.id !== id) return row;
          previous = row.status;
          return { ...row, status: next };
        }),
      };
    });
    setSaveErrors((prev) => {
      if (!prev.has(id)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(id);
      return nextSet;
    });

    try {
      const { error } = await supabase.from("books").update({ status: next }).eq("id", id);
      if (error) {
        console.error("[BookStatusEditor] update failed:", error.message);
        // Revert this row to its previous status and flag the error.
        setState((s) => {
          if (s.kind !== "loaded") return s;
          return {
            kind: "loaded",
            rows: s.rows.map((row) =>
              row.id === id && previous !== undefined ? { ...row, status: previous } : row,
            ),
          };
        });
        setSaveErrors((prev) => {
          const nextSet = new Set(prev);
          nextSet.add(id);
          return nextSet;
        });
      }
    } finally {
      setSaving((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(id);
        return nextSet;
      });
    }
  };

  const rows = state.kind === "loaded" ? state.rows : [];
  const countryOptions = [...new Map(rows.map((r) => [r.country, r.countryName])).entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const yearOptions = [
    ...new Set(rows.map((r) => r.year).filter((y): y is number => y !== null)),
  ].sort((a, b) => b - a);
  const filtered = rows.filter(
    (r) =>
      (fAuthor.trim() === "" ||
        r.authorName.toLowerCase().includes(fAuthor.trim().toLowerCase())) &&
      (fCountry === "" || r.country === fCountry) &&
      (fYear === "" || String(r.year) === fYear),
  );

  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="font-serif text-2xl text-ink mb-4">{labels.title}</h1>
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
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <input
              type="text"
              value={fAuthor}
              onChange={(e) => setFAuthor(e.target.value)}
              placeholder={labels.filter_author_placeholder}
              className="rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
            <select
              value={fCountry}
              onChange={(e) => setFCountry(e.target.value)}
              className="rounded border border-ink/20 bg-parchment px-2 py-1.5 text-ink"
            >
              <option value="">{labels.filter_country_all}</option>
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={fYear}
              onChange={(e) => setFYear(e.target.value)}
              className="rounded border border-ink/20 bg-parchment px-2 py-1.5 text-ink"
            >
              <option value="">{labels.filter_year_all}</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
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
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-ink/10 hover:bg-bone/40">
                    <td className="py-2 pr-4 text-ink">{row.authorName}</td>
                    <td className="py-2 pr-4 text-ink/70">{row.country}</td>
                    <td className="py-2 pr-4 text-ink/80">{row.title}</td>
                    <td className="py-2 pr-4 text-ink/70">{row.year ?? "—"}</td>
                    <td className="py-2">
                      <select
                        value={row.status}
                        onChange={(e) => updateStatus(row.id, e.target.value as BookStatus)}
                        disabled={saving.has(row.id)}
                        className="rounded border border-ink/10 bg-bone/40 px-2 py-1 text-sm text-ink disabled:opacity-50"
                      >
                        <option value="to_read">{labels.status_to_read}</option>
                        <option value="reading">{labels.status_reading}</option>
                        <option value="read">{labels.status_read}</option>
                      </select>
                      {saveErrors.has(row.id) && (
                        <span className="ml-2 text-oxblood" role="alert">
                          {labels.save_error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
