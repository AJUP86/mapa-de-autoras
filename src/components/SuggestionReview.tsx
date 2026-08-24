// SuggestionReview.tsx — Stage 8.5 (book-first envelope processor)
//
// Renders one suggestion envelope and its list of proposed books, each with an
// independent disposition. The admin promotes (navigates to the promote form),
// rejects, or marks-already-present each entry, then finishes the whole
// envelope (flips status → processed) once nothing is left pending. All writes
// go through the thin helpers in ~/lib/suggestions-detail.

import { useEffect, useState } from "react";
import {
  getSuggestion,
  rejectSuggestionBook,
  markSuggestionBookAlreadyPresent,
  reopenSuggestionBook,
  finishSuggestion,
  type SuggestionDetail,
  type SuggestionBook,
  type SuggestionBookDisposition,
} from "~/lib/suggestions-detail";

interface Labels {
  title: string;
  loading: string;
  error: string;
  not_found: string;
  submitted_on: string;
  submitter: string;
  status: string;
  status_pending: string;
  status_processed: string;
  books_heading: string;
  entry_author: string;
  entry_country: string;
  entry_book: string;
  entry_note: string;
  disp_pending: string;
  disp_promoted: string;
  disp_rejected: string;
  disp_already_present: string;
  action_promote: string;
  action_reject: string;
  action_already_present: string;
  action_reopen: string;
  reject_reason_label: string;
  reject_confirm: string;
  reject_cancel: string;
  already_present_confirm: string;
  finish: string;
  finish_hint_pending: string;
  action_error: string;
  back_to_inbox: string;
}

interface Props {
  labels: Labels;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; msg: string }
  | { kind: "not_found" }
  | { kind: "loaded"; suggestion: SuggestionDetail };

function formatDate(iso: string): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "—";
}

const DISP_BADGE: Record<SuggestionBookDisposition, string> = {
  promoted: "text-penguin bg-penguin/15",
  already_present: "text-sage bg-sage/15",
  rejected: "text-oxblood bg-oxblood/10",
  pending: "text-ink/60 bg-ink/5",
};

export default function SuggestionReview({ labels }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [id, setId] = useState<string | null>(null);

  // per-entry UI state
  const [rejectingEntryId, setRejectingEntryId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [entrySubmitting, setEntrySubmitting] = useState<string | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  function dispLabel(d: SuggestionBookDisposition): string {
    switch (d) {
      case "promoted":
        return labels.disp_promoted;
      case "rejected":
        return labels.disp_rejected;
      case "already_present":
        return labels.disp_already_present;
      default:
        return labels.disp_pending;
    }
  }

  async function refetch() {
    if (!id) return;
    const s = await getSuggestion(id);
    if (!s) setState({ kind: "not_found" });
    else setState({ kind: "loaded", suggestion: s });
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const qId = params.get("id");
    if (!qId) {
      if (!cancelled) setState({ kind: "not_found" });
      return;
    }
    setId(qId);
    getSuggestion(qId)
      .then((s) => {
        if (cancelled) return;
        if (!s) setState({ kind: "not_found" });
        else setState({ kind: "loaded", suggestion: s });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ kind: "error", msg: String(e?.message ?? e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return <p className="text-ink/60">{labels.loading}</p>;
  }
  if (state.kind === "error") {
    return (
      <p className="text-oxblood" role="alert">
        {labels.error}: {state.msg}
      </p>
    );
  }
  if (state.kind === "not_found") {
    return (
      <div className="space-y-2">
        <p className="text-ink/60">{labels.not_found}</p>
        <a href="/admin/inbox" className="text-oxblood underline">
          ← {labels.back_to_inbox}
        </a>
      </div>
    );
  }

  const s = state.suggestion;
  const isPending = s.status === "pending";
  const statusLabel = isPending ? labels.status_pending : labels.status_processed;
  const pendingCount = s.suggestion_books.filter((b) => b.disposition === "pending").length;

  async function runEntryWrite(entryId: string, fn: () => Promise<void>) {
    setEntrySubmitting(entryId);
    setEntryError(null);
    try {
      await fn();
      await refetch();
      if (rejectingEntryId === entryId) {
        setRejectingEntryId(null);
        setRejectReason("");
      }
    } catch {
      setEntryError(entryId);
    } finally {
      setEntrySubmitting(null);
    }
  }

  async function onFinish() {
    if (finishing || pendingCount > 0) return;
    setFinishing(true);
    try {
      await finishSuggestion(s.id);
      window.location.href = "/admin/inbox";
    } catch {
      setFinishing(false);
      setEntryError("__finish__");
    }
  }

  function renderEntry(entry: SuggestionBook) {
    const resolved = entry.disposition !== "pending";
    const canReopen = entry.disposition === "rejected" || entry.disposition === "already_present";
    const submitting = entrySubmitting === entry.id;
    return (
      <div key={entry.id} className="space-y-3 rounded border border-ink/10 bg-bone/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
            <dt className="text-ink/60">{labels.entry_author}</dt>
            <dd className="text-ink">{entry.proposed_author_name}</dd>
            <dt className="text-ink/60">{labels.entry_country}</dt>
            <dd className="text-ink">{entry.proposed_country_iso_a3}</dd>
            <dt className="text-ink/60">{labels.entry_book}</dt>
            <dd className="text-ink">{entry.proposed_book_title}</dd>
            {entry.note !== null && (
              <>
                <dt className="text-ink/60">{labels.entry_note}</dt>
                <dd className="whitespace-pre-wrap text-ink">{entry.note}</dd>
              </>
            )}
          </dl>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${DISP_BADGE[entry.disposition]}`}
          >
            {dispLabel(entry.disposition)}
          </span>
        </div>

        {isPending && !resolved && (
          <div className="space-y-3 border-t border-ink/10 pt-3">
            {rejectingEntryId === entry.id ? (
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="text-ink/80">{labels.reject_reason_label}</span>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    className="mt-1 block w-full rounded border border-ink/20 bg-parchment p-2"
                  />
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      runEntryWrite(entry.id, () => rejectSuggestionBook(entry.id, rejectReason))
                    }
                    disabled={submitting}
                    className="rounded bg-oxblood px-4 py-2 text-sm text-parchment disabled:opacity-50"
                  >
                    {labels.reject_confirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingEntryId(null);
                      setRejectReason("");
                    }}
                    className="text-sm text-ink/70 underline"
                  >
                    {labels.reject_cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`/admin/promote?entry=${entry.id}`}
                  className="rounded bg-oxblood px-4 py-2 text-sm text-parchment"
                >
                  {labels.action_promote}
                </a>
                <button
                  type="button"
                  onClick={() =>
                    runEntryWrite(entry.id, () => markSuggestionBookAlreadyPresent(entry.id))
                  }
                  disabled={submitting}
                  className="rounded border border-ink/30 px-4 py-2 text-sm text-ink disabled:opacity-50"
                >
                  {labels.action_already_present}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectingEntryId(entry.id);
                    setRejectReason("");
                    setEntryError(null);
                  }}
                  className="rounded border border-ink/30 px-4 py-2 text-sm text-ink"
                >
                  {labels.action_reject}
                </button>
              </div>
            )}
          </div>
        )}

        {isPending && resolved && canReopen && (
          <div className="border-t border-ink/10 pt-3">
            <button
              type="button"
              onClick={() => runEntryWrite(entry.id, () => reopenSuggestionBook(entry.id))}
              disabled={submitting}
              className="rounded border border-ink/30 px-4 py-2 text-sm text-ink disabled:opacity-50"
            >
              {labels.action_reopen}
            </button>
          </div>
        )}

        {entryError === entry.id && (
          <p className="text-sm text-oxblood" role="alert">
            {labels.action_error}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <a href="/admin/inbox" className="text-sm text-ink/70 underline">
          ← {labels.back_to_inbox}
        </a>
        <h1 className="mt-2 font-serif text-2xl text-ink">{labels.title}</h1>
        <p className="text-xs text-ink/50">
          {labels.submitted_on}: {formatDate(s.created_at)}
        </p>
        <p className="text-xs text-ink/50">
          {labels.submitter}: {s.submitter_name ?? "—"} {s.submitter_email}
        </p>
        <p className="text-xs text-ink/50">
          {labels.status}: <span className="font-medium">{statusLabel}</span>
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-medium text-ink">{labels.books_heading}</h2>
        {s.suggestion_books.map((entry) => renderEntry(entry))}
      </div>

      {isPending && (
        <div className="flex items-center gap-3 border-t border-ink/10 pt-4">
          <button
            type="button"
            onClick={onFinish}
            disabled={pendingCount > 0 || finishing}
            className="rounded bg-oxblood px-4 py-2 text-sm text-parchment disabled:opacity-50"
          >
            {labels.finish}
          </button>
          {pendingCount > 0 && (
            <span className="text-sm text-ink/60">
              {pendingCount} {labels.finish_hint_pending}
            </span>
          )}
          {entryError === "__finish__" && (
            <span className="text-sm text-oxblood" role="alert">
              {labels.action_error}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
