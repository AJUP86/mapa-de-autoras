// SuggestionReview.tsx — Stage 7b-i (replaces SuggestionDetailPlaceholder)
//
// Renders one suggestion's full data, plus Promotar / Rechazar actions.
// Promotar navigates to /admin/promote?suggestion=<id> (the form handles
// prefilling + the RPC call in Slice E2). Rechazar opens an inline reason
// form right here and writes status=rejected via PostgREST.

import { useEffect, useState } from "react";
import { getSuggestion, rejectSuggestion, type SuggestionDetail } from "~/lib/suggestions-detail";

interface Labels {
  title: string;
  loading: string;
  error: string;
  not_found: string;
  proposed_author: string;
  country: string;
  books_text: string;
  note: string;
  submitter: string;
  submitted_on: string;
  status: string;
  status_pending: string;
  status_approved: string;
  status_rejected: string;
  promote: string;
  reject: string;
  reject_reason_label: string;
  reject_confirm: string;
  reject_cancel: string;
  reject_success: string;
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
  return new Date(iso).toISOString().slice(0, 10);
}

export default function SuggestionReview({ labels }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectStatus, setRejectStatus] = useState<"idle" | "submitting" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
      if (!cancelled) setState({ kind: "not_found" });
      return;
    }
    getSuggestion(id)
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
    return <p className="text-oxblood">{labels.error}: {state.msg}</p>;
  }
  if (state.kind === "not_found") {
    return (
      <div className="space-y-2">
        <p className="text-ink/60">{labels.not_found}</p>
        <a href="/admin/inbox" className="text-oxblood underline">← {labels.back_to_inbox}</a>
      </div>
    );
  }

  const s = state.suggestion;
  const statusLabel =
    s.status === "pending" ? labels.status_pending
    : s.status === "approved" ? labels.status_approved
    : labels.status_rejected;

  async function onConfirmReject() {
    setRejectStatus("submitting");
    try {
      await rejectSuggestion(s.id, rejectReason);
      window.location.href = "/admin/inbox";
    } catch {
      setRejectStatus("error");
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <a href="/admin/inbox" className="text-sm text-ink/70 underline">← {labels.back_to_inbox}</a>
        <h1 className="mt-2 font-serif text-2xl text-ink">{labels.title}</h1>
        <p className="text-xs text-ink/50">{labels.submitted_on}: {formatDate(s.created_at)}</p>
        <p className="text-xs text-ink/50">{labels.status}: <span className="font-medium">{statusLabel}</span></p>
      </div>

      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-ink/60">{labels.proposed_author}</dt>
        <dd className="text-ink">{s.proposed_author_name}</dd>

        <dt className="text-ink/60">{labels.country}</dt>
        <dd className="text-ink">{s.proposed_country_iso_a3}</dd>

        <dt className="text-ink/60">{labels.books_text}</dt>
        <dd className="text-ink whitespace-pre-wrap">{s.proposed_books_text ?? "—"}</dd>

        <dt className="text-ink/60">{labels.note}</dt>
        <dd className="text-ink whitespace-pre-wrap">{s.note ?? "—"}</dd>

        <dt className="text-ink/60">{labels.submitter}</dt>
        <dd className="text-ink">
          {s.submitter_name ?? "—"} &lt;{s.submitter_email}&gt;
        </dd>
      </dl>

      {s.status === "pending" && (
        <div className="flex items-center gap-3 pt-2 border-t border-ink/10">
          <a
            href={`/admin/promote?suggestion=${s.id}`}
            className="rounded bg-oxblood px-4 py-2 text-parchment text-sm"
          >
            {labels.promote}
          </a>
          {!rejecting && (
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="rounded border border-ink/30 px-4 py-2 text-sm text-ink"
            >
              {labels.reject}
            </button>
          )}
        </div>
      )}

      {rejecting && (
        <div className="space-y-3 rounded border border-ink/10 bg-bone p-4">
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
              onClick={onConfirmReject}
              disabled={rejectStatus === "submitting"}
              className="rounded bg-oxblood px-4 py-2 text-parchment text-sm disabled:opacity-50"
            >
              {rejectStatus === "submitting" ? "…" : labels.reject_confirm}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setRejectReason("");
                setRejectStatus("idle");
              }}
              className="text-sm text-ink/70 underline"
            >
              {labels.reject_cancel}
            </button>
            {rejectStatus === "error" && (
              <span className="text-sm text-oxblood">{labels.error}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
