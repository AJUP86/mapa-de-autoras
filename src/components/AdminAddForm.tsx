// AdminAddForm.tsx — Stage 8.5 (book-first, admin-only, auto-promoting)
//
// The admin counterpart of SuggestionForm: a repeater of book entries, but
// every entry calls admin_add_book() directly — creating a PUBLISHED author +
// book (no suggestion queue, no Turnstile, no email). Each entry carries a
// per-book status. Entries are submitted sequentially; there is no cross-entry
// transaction, so partial success is possible and reported.

import { useRef, useState } from "react";
import { adminAddBook } from "~/lib/promote";
import type { BookStatus } from "~/lib/map-state";
import type { CountryOption } from "~/lib/countries";

export interface Labels {
  title: string;
  intro: string;
  entry: {
    heading: string;
    book_title_label: string;
    book_title_placeholder: string;
    author_name_label: string;
    author_name_placeholder: string;
    country_label: string;
    country_placeholder: string;
    status_label: string;
    status_to_read: string;
    status_reading: string;
    status_read: string;
    add: string;
    remove: string;
  };
  submit: string;
  submitting: string;
  errors: { validation: string; unauthorized: string; unknown: string };
  success_suffix: string;
  view_books: string;
  add_more: string;
  required_mark: string;
}

interface Props {
  labels: Labels;
  countries: CountryOption[];
}

interface BookEntry {
  key: string;
  bookTitle: string;
  authorName: string;
  countryIsoA3: string;
  status: BookStatus;
}

const newEntry = (seq: number): BookEntry => ({
  key: `e${seq}`,
  bookTitle: "",
  authorName: "",
  countryIsoA3: "",
  status: "to_read",
});

export default function AdminAddForm({ labels, countries }: Props) {
  const [entries, setEntries] = useState<BookEntry[]>(() => [newEntry(0)]);
  const seqRef = useRef(1); // stable monotonic keys — NOT array index.

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<keyof Labels["errors"] | "">("");
  const [done, setDone] = useState<number | null>(null);
  const [partialAdded, setPartialAdded] = useState(0);

  function updateEntry(key: string, patch: Partial<Omit<BookEntry, "key">>) {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  function addEntry() {
    setEntries((prev) => [...prev, newEntry(seqRef.current++)]);
  }

  function removeEntry(key: string) {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPartialAdded(0);

    const entriesValid =
      entries.length >= 1 &&
      entries.every(
        (entry) =>
          entry.authorName.trim() &&
          /^[A-Z]{3}$/.test(entry.countryIsoA3) &&
          entry.bookTitle.trim(),
      );
    if (!entriesValid) {
      setError("validation");
      return;
    }

    setSubmitting(true);
    let addedCount = 0;
    let firstError: keyof Labels["errors"] | "" = "";
    const remaining: BookEntry[] = [];
    for (const entry of entries) {
      const result = await adminAddBook(
        { name: entry.authorName.trim(), country_iso_a3: entry.countryIsoA3, published: true },
        { title: entry.bookTitle.trim(), status: entry.status },
      );
      if (result.ok) {
        addedCount++;
      } else {
        remaining.push(entry);
        if (!firstError) {
          firstError =
            result.error.kind === "unauthorized"
              ? "unauthorized"
              : result.error.kind === "validation"
                ? "validation"
                : "unknown";
        }
      }
    }
    setSubmitting(false);

    if (firstError) {
      // Keep only the entries that FAILED so a resubmit cannot re-insert the
      // ones already added (books has no unique(author_id, title)); surface the
      // count that did succeed alongside the error.
      setEntries(remaining);
      setPartialAdded(addedCount);
      setError(firstError);
    } else {
      setDone(addedCount);
    }
  }

  if (done !== null && !error) {
    return (
      <div className="rounded-lg border border-ink/15 bg-bone/40 p-6 space-y-4">
        <p className="text-sm font-semibold text-ink font-body">
          {`${done} ${labels.success_suffix}`}
        </p>
        <div className="flex items-center gap-4">
          <a
            href="/admin/books"
            className="text-sm text-oxblood font-body underline hover:opacity-80"
          >
            {labels.view_books}
          </a>
          <button
            type="button"
            onClick={() => {
              setEntries([newEntry(0)]);
              setDone(null);
              setError("");
            }}
            className="text-sm font-medium text-oxblood font-body hover:underline"
          >
            {labels.add_more}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {entries.map((entry, i) => (
        <div key={entry.key} className="rounded-lg border border-ink/15 bg-bone/40 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink font-body">
              {`${labels.entry.heading} ${i + 1}`}
            </span>
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(entry.key)}
                className="text-sm text-oxblood font-body hover:underline"
              >
                {labels.entry.remove}
              </button>
            )}
          </div>

          <Field
            label={labels.entry.book_title_label + labels.required_mark}
            htmlFor={`book-title-${entry.key}`}
          >
            <input
              id={`book-title-${entry.key}`}
              type="text"
              required
              maxLength={200}
              value={entry.bookTitle}
              onChange={(e) => updateEntry(entry.key, { bookTitle: e.target.value })}
              placeholder={labels.entry.book_title_placeholder}
              className={inputCls}
            />
          </Field>

          <Field
            label={labels.entry.author_name_label + labels.required_mark}
            htmlFor={`author-name-${entry.key}`}
          >
            <input
              id={`author-name-${entry.key}`}
              type="text"
              required
              maxLength={120}
              value={entry.authorName}
              onChange={(e) => updateEntry(entry.key, { authorName: e.target.value })}
              placeholder={labels.entry.author_name_placeholder}
              className={inputCls}
            />
          </Field>

          <Field
            label={labels.entry.country_label + labels.required_mark}
            htmlFor={`country-${entry.key}`}
          >
            <select
              id={`country-${entry.key}`}
              required
              value={entry.countryIsoA3}
              onChange={(e) => updateEntry(entry.key, { countryIsoA3: e.target.value })}
              className={inputCls}
            >
              <option value="" disabled>
                {labels.entry.country_placeholder}
              </option>
              {countries.map((c) => (
                <option key={c.iso_a3} value={c.iso_a3}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={labels.entry.status_label} htmlFor={`status-${entry.key}`}>
            <select
              id={`status-${entry.key}`}
              value={entry.status}
              onChange={(e) => updateEntry(entry.key, { status: e.target.value as BookStatus })}
              className={inputCls}
            >
              <option value="to_read">{labels.entry.status_to_read}</option>
              <option value="reading">{labels.entry.status_reading}</option>
              <option value="read">{labels.entry.status_read}</option>
            </select>
          </Field>
        </div>
      ))}

      <div>
        <button
          type="button"
          onClick={addEntry}
          className="text-sm font-medium text-oxblood font-body hover:underline"
        >
          {labels.entry.add}
        </button>
      </div>

      {partialAdded > 0 && (
        <p className="text-sm font-body text-ink bg-sage/10 border border-sage/30 rounded-lg px-3 py-2">
          {`${partialAdded} ${labels.success_suffix}`}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="text-sm text-oxblood font-body bg-oxblood/5 border border-oxblood/20 rounded-lg px-3 py-2"
        >
          {labels.errors[error]}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="
          inline-flex items-center justify-center
          rounded-lg bg-oxblood px-5 py-2.5
          text-parchment font-semibold font-body
          transition-colors hover:bg-oxblood/90
          disabled:opacity-60 disabled:cursor-not-allowed
        "
      >
        {submitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}

// ─── Field wrapper ───────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink font-body">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-ink/15 bg-bone px-3 py-2 text-ink font-body " +
  "placeholder:text-ink/40 focus:outline-none focus:border-oxblood/60 " +
  "focus:ring-2 focus:ring-oxblood/15 transition-colors";
