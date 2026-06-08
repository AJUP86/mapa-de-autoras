// AdminInbox.tsx — Stage 7a
//
// Read-only list of pending suggestions. Renders nothing while loading,
// an empty-state message if there are none, or a table with one row per
// suggestion. Clicking a row navigates to /admin/suggestions/:id.

import { useEffect, useState } from "react";
import { listPendingSuggestions, type PendingSuggestion } from "../lib/suggestions";

interface Labels {
  title: string;
  empty: string;
  loading: string;
  error: string;
  col_date: string;
  col_author: string;
  col_country: string;
  col_email: string;
  view: string;
}

interface Props {
  labels: Labels;
}

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; rows: PendingSuggestion[] };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

export default function AdminInbox({ labels }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    listPendingSuggestions()
      .then((rows) => {
        if (!cancelled) setState({ kind: "loaded", rows });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="font-serif text-2xl text-ink mb-4">{labels.title}</h1>
      {state.kind === "loading" && (
        <p className="text-ink/60">{labels.loading}</p>
      )}
      {state.kind === "error" && (
        <p className="text-oxblood" role="alert">{labels.error}</p>
      )}
      {state.kind === "loaded" && state.rows.length === 0 && (
        <p className="text-ink/60">{labels.empty}</p>
      )}
      {state.kind === "loaded" && state.rows.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/20 text-left text-ink/70">
              <th className="py-2 pr-4">{labels.col_date}</th>
              <th className="py-2 pr-4">{labels.col_author}</th>
              <th className="py-2 pr-4">{labels.col_country}</th>
              <th className="py-2 pr-4">{labels.col_email}</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row) => (
              <tr key={row.id} className="border-b border-ink/10 hover:bg-bone/40">
                <td className="py-2 pr-4 text-ink/80">{formatDate(row.created_at)}</td>
                <td className="py-2 pr-4 text-ink">{row.proposed_author_name}</td>
                <td className="py-2 pr-4 text-ink/80">{row.proposed_country_iso_a3}</td>
                <td className="py-2 pr-4 text-ink/70">{row.submitter_email}</td>
                <td className="py-2">
                  <a
                    href={`/admin/suggestion?id=${row.id}`}
                    className="text-oxblood underline"
                  >
                    {labels.view} →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
