// PromoteForm.tsx — Stage 7b-i
//
// The form that promotes a suggestion (or creates an author from scratch).
// In E1 this slice is "promote-from-scratch" only — no suggestion context
// column, no reviewer notes. E2 extends with suggestionId prefill.

import { useEffect, useState } from "react";
import TranslateButton from "./TranslateButton";
import BookFields, { EMPTY_BOOK, type BookValue } from "./BookFields";
import { getCountriesBilingual, type CountryRow } from "~/lib/countries";
import { promoteSuggestion, type PromoteError } from "~/lib/promote";
import type { AuthorStatus } from "~/lib/map-state";

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
  name_label: string;
  country_label: string;
  status_label: string;
  status_read: string;
  status_currently_reading: string;
  status_discovery: string;
  birth_year_label: string;
  death_year_label: string;
  photo_label: string;
  bio_es_label: string;
  bio_en_label: string;
  books_section: string;
  add_book: string;
  publish_now_label: string;
  save: string;
  saving: string;
  cancel: string;
  error_duplicate: string;
  error_validation: string;
  error_unknown: string;
  back: string;
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
}

interface Props {
  labels: PromoteFormLabels;
}

interface AuthorValue {
  name: string;
  country_iso_a3: string;
  status: AuthorStatus;
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
  status: "discovery",
  birth_year: "",
  death_year: "",
  photo_url: "",
  bio_es: "",
  bio_en: "",
  published: true,
};

export default function PromoteForm({ labels }: Props) {
  const [author, setAuthor] = useState<AuthorValue>(EMPTY_AUTHOR);
  const [books, setBooks] = useState<BookValue[]>([{ ...EMPTY_BOOK }]);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<PromoteError | null>(null);

  useEffect(() => {
    getCountriesBilingual()
      .then(setCountries)
      .catch((e) => console.error(e));
  }, []);

  function update<K extends keyof AuthorValue>(key: K, val: AuthorValue[K]) {
    setAuthor((a) => ({ ...a, [key]: val }));
  }
  function updateBook(i: number, next: BookValue) {
    setBooks((bs) => bs.map((b, idx) => (idx === i ? next : b)));
  }
  function addBook() {
    setBooks((bs) => [...bs, { ...EMPTY_BOOK }]);
  }
  function removeBook(i: number) {
    setBooks((bs) => bs.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving") return;
    setStatus("saving");
    setError(null);
    const result = await promoteSuggestion(
      null,
      {
        name: author.name.trim(),
        country_iso_a3: author.country_iso_a3,
        status: author.status,
        bio_es: author.bio_es.trim() || undefined,
        bio_en: author.bio_en.trim() || undefined,
        photo_url: author.photo_url.trim() || undefined,
        birth_year: author.birth_year ? Number(author.birth_year) : undefined,
        death_year: author.death_year ? Number(author.death_year) : undefined,
        published: author.published,
      },
      books.map((b) => ({
        title: b.title.trim(),
        year: b.year ? Number(b.year) : undefined,
        original_language: b.original_language.trim() || undefined,
        cover_url: b.cover_url.trim() || undefined,
        description_es: b.description_es.trim() || undefined,
        description_en: b.description_en.trim() || undefined,
      })),
    );
    if (result.ok) {
      window.location.href = "/";
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <a href="/" className="text-sm text-ink/70 underline">← {labels.back}</a>
        <h1 className="mt-2 font-serif text-2xl text-ink">{labels.title_new}</h1>
      </div>

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
            <option value="" disabled>—</option>
            {countries.map((c) => (
              <option key={c.iso_a3} value={c.iso_a3}>{c.name_es}</option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-sm text-ink/80">{labels.status_label} *</legend>
          <div className="mt-1 flex gap-4 text-sm">
            {(["read", "currently_reading", "discovery"] as const).map((s) => (
              <label key={s} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={author.status === s}
                  onChange={() => update("status", s)}
                />
                {s === "read" ? labels.status_read
                  : s === "currently_reading" ? labels.status_currently_reading
                  : labels.status_discovery}
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
        {books.map((b, i) => (
          <BookFields
            key={i}
            index={i}
            value={b}
            onChange={(next) => updateBook(i, next)}
            onRemove={books.length > 1 ? () => removeBook(i) : undefined}
            labels={{
              ...labels.book,
              translate_to_en: labels.translate_to_en,
              translate_to_es: labels.translate_to_es,
            }}
          />
        ))}
        <button
          type="button"
          onClick={addBook}
          className="rounded border border-ink/20 px-3 py-1 text-sm text-ink"
        >
          {labels.add_book}
        </button>
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
        <div role="alert" className="rounded border border-oxblood/40 bg-oxblood/5 p-3 text-sm text-oxblood">
          {error.kind === "duplicate" ? labels.error_duplicate
          : error.kind === "validation" ? labels.error_validation
          : labels.error_unknown}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded bg-oxblood px-4 py-2 text-parchment text-sm disabled:opacity-50"
        >
          {status === "saving" ? labels.saving : labels.save}
        </button>
        <a href="/" className="text-sm text-ink/70 underline">{labels.cancel}</a>
      </div>
    </form>
  );
}
