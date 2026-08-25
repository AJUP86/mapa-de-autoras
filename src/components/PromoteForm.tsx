// PromoteForm.tsx — Stage 8.5 (book-first, entry-only)
//
// Promotes a single suggestion_books entry into a real author + book via the
// promote_suggestion_book() RPC. The page is reached as
// /admin/promote?entry=<uuid>; it fetches that entry, prefills the author name
// + country + the one book's title, and lets the admin fill in the rest.
// On success it returns to the suggestion review page. Without ?entry= it
// renders a placeholder — from-scratch author creation is deferred.

import { useEffect, useState } from "react";
import TranslateButton from "./TranslateButton";
import BookFields, { EMPTY_BOOK, type BookValue } from "./BookFields";
import { getCountriesBilingual, type CountryRow } from "~/lib/countries";
import { promoteSuggestionBook, type PromoteError } from "~/lib/promote";
import { getSuggestionBookEntry, type SuggestionBookEntry } from "~/lib/suggestions-detail";
import type { BookStatus } from "~/lib/map-state";

interface TranslateLabels {
  button: string;
  confirm_title: string;
  confirm_body: string;
  confirm_ok: string;
  confirm_cancel: string;
  translating: string;
  error: string;
}

export interface PromoteFormLabels {
  title_new: string;
  no_entry_body: string;
  title_review: string;
  name_label: string;
  country_label: string;
  book_status_label: string;
  book_status_to_read: string;
  book_status_reading: string;
  book_status_read: string;
  birth_year_label: string;
  death_year_label: string;
  photo_label: string;
  bio_es_label: string;
  bio_en_label: string;
  books_section: string;
  publish_now_label: string;
  save: string;
  saving: string;
  loading: string;
  cancel: string;
  back: string;
  error_validation: string;
  error_unauthorized: string;
  error_unknown: string;
  translate_to_en: TranslateLabels;
  translate_to_es: TranslateLabels;
  book: {
    title_label: string;
    year_label: string;
    language_label: string;
    cover_label: string;
    description_es_label: string;
    description_en_label: string;
    remove: string;
  };
  context: {
    submitted_on: string;
    proposed_author: string;
    country: string;
    book_title: string;
    note: string;
    submitter: string;
  };
}

interface Props {
  labels: PromoteFormLabels;
}

interface AuthorValue {
  name: string;
  country_iso_a3: string;
  birth_year: string;
  death_year: string;
  photo_url: string;
  bio_es: string;
  bio_en: string;
  published: boolean;
}

const EMPTY_AUTHOR: AuthorValue = {
  name: "",
  country_iso_a3: "",
  birth_year: "",
  death_year: "",
  photo_url: "",
  bio_es: "",
  bio_en: "",
  published: true,
};

function formatDate(iso: string): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "—";
}

export default function PromoteForm({ labels }: Props) {
  const [author, setAuthor] = useState<AuthorValue>(EMPTY_AUTHOR);
  const [book, setBook] = useState<BookValue>({ ...EMPTY_BOOK });
  const [bookStatus, setBookStatus] = useState<BookStatus>("to_read");
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<PromoteError | null>(null);

  // The entry id is read from window.location.search on mount.
  const [entryId, setEntryId] = useState<string | undefined>(undefined);
  const [entry, setEntry] = useState<SuggestionBookEntry | null>(null);
  const [hasEntryParam, setHasEntryParam] = useState<boolean>(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).has("entry")
      : false,
  );
  const [entryLoading, setEntryLoading] = useState<boolean>(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).has("entry")
      : false,
  );
  const [entryMissing, setEntryMissing] = useState(false);

  useEffect(() => {
    getCountriesBilingual()
      .then(setCountries)
      .catch((e) => console.error(e));
  }, []);

  // Hydrate the entry id from the URL on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("entry");
    setHasEntryParam(!!id);
    if (id) {
      setEntryId(id);
    } else {
      setEntryLoading(false);
    }
  }, []);

  // Fetch the entry once we have an id.
  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    getSuggestionBookEntry(entryId)
      .then((e) => {
        if (cancelled) return;
        if (!e) {
          setEntryMissing(true);
        } else {
          setEntry(e);
          setAuthor((a) => ({
            ...a,
            name: e.proposed_author_name,
            country_iso_a3: e.proposed_country_iso_a3,
          }));
          setBook({ ...EMPTY_BOOK, title: e.proposed_book_title });
        }
        setEntryLoading(false);
      })
      .catch((err) => {
        console.error("[PromoteForm] load entry failed:", err);
        if (!cancelled) {
          setEntryMissing(true);
          setEntryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  function update<K extends keyof AuthorValue>(key: K, val: AuthorValue[K]) {
    setAuthor((a) => ({ ...a, [key]: val }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving" || !entry) return;
    setStatus("saving");
    setError(null);
    const result = await promoteSuggestionBook(
      entry.entryId,
      {
        name: author.name.trim(),
        country_iso_a3: author.country_iso_a3,
        bio_es: author.bio_es.trim() || undefined,
        bio_en: author.bio_en.trim() || undefined,
        photo_url: author.photo_url.trim() || undefined,
        birth_year: author.birth_year ? Number(author.birth_year) : undefined,
        death_year: author.death_year ? Number(author.death_year) : undefined,
        published: author.published,
      },
      {
        title: book.title.trim(),
        year: book.year ? Number(book.year) : undefined,
        original_language: book.original_language.trim() || undefined,
        cover_url: book.cover_url.trim() || undefined,
        description_es: book.description_es.trim() || undefined,
        description_en: book.description_en.trim() || undefined,
        status: bookStatus,
      },
    );
    if (result.ok) {
      window.location.href = `/admin/suggestion?id=${entry.suggestionId}`;
      return;
    }
    setStatus("error");
    setError(result.error);
  }

  // No ?entry= → placeholder (from-scratch author creation is deferred).
  if (!hasEntryParam) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="font-serif text-2xl text-ink">{labels.title_new}</h1>
        <p className="text-sm text-ink/70">{labels.no_entry_body}</p>
        <a href="/admin/inbox" className="text-sm text-oxblood underline">
          ← {labels.back}
        </a>
      </div>
    );
  }

  if (entryLoading) {
    return <p className="mx-auto max-w-2xl p-6 text-ink/60">{labels.loading}</p>;
  }

  if (entryMissing || !entry) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="font-serif text-2xl text-ink">{labels.title_review}</h1>
        <p className="text-sm text-ink/70">{labels.no_entry_body}</p>
        <a href="/admin/inbox" className="text-sm text-oxblood underline">
          ← {labels.back}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <a href="/admin/inbox" className="text-sm text-ink/70 underline">
          ← {labels.back}
        </a>
        <h1 className="mt-2 font-serif text-2xl text-ink">{labels.title_review}</h1>
      </div>

      <aside className="rounded bg-bone/60 p-4 text-sm">
        <dl className="space-y-1">
          <div>
            <dt className="inline text-ink/60">{labels.context.proposed_author}: </dt>
            <dd className="inline text-ink">{entry.proposed_author_name}</dd>
          </div>
          <div>
            <dt className="inline text-ink/60">{labels.context.country}: </dt>
            <dd className="inline text-ink">{entry.proposed_country_iso_a3}</dd>
          </div>
          <div>
            <dt className="inline text-ink/60">{labels.context.book_title}: </dt>
            <dd className="inline text-ink">{entry.proposed_book_title}</dd>
          </div>
          <div>
            <dt className="inline text-ink/60">{labels.context.submitter}: </dt>
            <dd className="inline text-ink">
              {entry.submitter_name ?? "—"} {entry.submitter_email}
            </dd>
          </div>
          <div>
            <dt className="inline text-ink/60">{labels.context.submitted_on}: </dt>
            <dd className="inline text-ink">{formatDate(entry.submitted_on)}</dd>
          </div>
          {entry.note !== null && (
            <div>
              <dt className="inline text-ink/60">{labels.context.note}: </dt>
              <dd className="inline whitespace-pre-wrap text-ink">{entry.note}</dd>
            </div>
          )}
        </dl>
      </aside>

      <fieldset className="space-y-4">
        <label className="block text-sm">
          <span className="text-ink/80">{labels.name_label} *</span>
          <input
            type="text"
            required
            maxLength={200}
            value={author.name}
            onChange={(e) => update("name", e.target.value)}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>

        <label className="block text-sm">
          <span className="text-ink/80">{labels.country_label} *</span>
          <select
            required
            value={author.country_iso_a3}
            onChange={(e) => update("country_iso_a3", e.target.value)}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          >
            <option value="" disabled>
              —
            </option>
            {countries.map((c) => (
              <option key={c.iso_a3} value={c.iso_a3}>
                {c.name_es}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-sm text-ink/80">{labels.book_status_label} *</legend>
          <div className="mt-1 flex gap-4 text-sm">
            {(["to_read", "reading", "read"] as const).map((st) => (
              <label key={st} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="book_status"
                  value={st}
                  checked={bookStatus === st}
                  onChange={() => setBookStatus(st)}
                />
                {st === "to_read"
                  ? labels.book_status_to_read
                  : st === "reading"
                    ? labels.book_status_reading
                    : labels.book_status_read}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink/80">{labels.birth_year_label}</span>
            <input
              type="number"
              min={1000}
              max={2100}
              value={author.birth_year}
              onChange={(e) => update("birth_year", e.target.value)}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/80">{labels.death_year_label}</span>
            <input
              type="number"
              min={1000}
              max={2100}
              value={author.death_year}
              onChange={(e) => update("death_year", e.target.value)}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-ink/80">{labels.photo_label}</span>
          <input
            type="url"
            value={author.photo_url}
            onChange={(e) => update("photo_url", e.target.value)}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-ink/80">{labels.bio_es_label}</span>
            <textarea
              rows={4}
              value={author.bio_es}
              onChange={(e) => update("bio_es", e.target.value)}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/80">{labels.bio_en_label}</span>
            <textarea
              rows={4}
              value={author.bio_en}
              onChange={(e) => update("bio_en", e.target.value)}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <TranslateButton
            sourceText={author.bio_es}
            hasTargetContent={author.bio_en.trim().length > 0}
            targetLang="EN"
            onTranslated={(text) => update("bio_en", text)}
            labels={labels.translate_to_en}
          />
          <TranslateButton
            sourceText={author.bio_en}
            hasTargetContent={author.bio_es.trim().length > 0}
            targetLang="ES"
            onTranslated={(text) => update("bio_es", text)}
            labels={labels.translate_to_es}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-ink">{labels.books_section}</legend>
        <BookFields
          key="book"
          index={0}
          value={book}
          onChange={setBook}
          onRemove={undefined}
          labels={{
            ...labels.book,
            translate_to_en: labels.translate_to_en,
            translate_to_es: labels.translate_to_es,
          }}
        />
      </fieldset>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={author.published}
          onChange={(e) => update("published", e.target.checked)}
        />
        {labels.publish_now_label}
      </label>

      {status === "error" && error && (
        <div
          role="alert"
          className="rounded border border-oxblood/40 bg-oxblood/5 p-3 text-sm text-oxblood"
        >
          {error.kind === "validation"
            ? labels.error_validation
            : error.kind === "unauthorized"
              ? labels.error_unauthorized
              : labels.error_unknown}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded bg-oxblood px-4 py-2 text-sm text-parchment disabled:opacity-50"
        >
          {status === "saving" ? labels.saving : labels.save}
        </button>
        <a
          href={`/admin/suggestion?id=${entry.suggestionId}`}
          className="text-sm text-ink/70 underline"
        >
          {labels.cancel}
        </a>
      </div>
    </form>
  );
}
