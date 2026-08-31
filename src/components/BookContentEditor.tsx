// BookContentEditor.tsx — Stage 8.6
//
// Admin editor for one book's curated content: synopsis (ES/EN, DeepL-assisted),
// the quotes Danny underlined (1..N, bilingual + optional location), and buy
// links (0..N). Saving calls set_book_content, which replaces both lists
// atomically — the form is the source of truth.

import { useEffect, useRef, useState } from "react";
import TranslateButton from "./TranslateButton";
import {
  getBookForEdit,
  setBookContent,
  type BookEditContent,
  type SaveContentError,
} from "~/lib/book-detail";

interface TranslateLabels {
  button: string;
  confirm_title: string;
  confirm_body: string;
  confirm_ok: string;
  confirm_cancel: string;
  translating: string;
  error: string;
}

export interface BookContentEditorLabels {
  title: string;
  loading: string;
  error: string;
  not_found: string;
  back: string;
  synopsis_heading: string;
  synopsis_es_label: string;
  synopsis_en_label: string;
  quotes_heading: string;
  quote_heading: string;
  quote_es_label: string;
  quote_en_label: string;
  quote_location_label: string;
  quote_location_placeholder: string;
  add_quote: string;
  remove_quote: string;
  links_heading: string;
  link_heading: string;
  link_retailer_label: string;
  link_url_label: string;
  link_affiliate_label: string;
  link_locale_label: string;
  add_link: string;
  remove_link: string;
  save: string;
  saving: string;
  saved: string;
  error_validation: string;
  error_link_url: string;
  error_unauthorized: string;
  error_unknown: string;
  translate_to_en: TranslateLabels;
  translate_to_es: TranslateLabels;
}

interface Props {
  labels: BookContentEditorLabels;
}

interface QuoteEntry {
  key: string;
  quote_es: string;
  quote_en: string;
  location: string;
}

interface LinkEntry {
  key: string;
  retailer: string;
  url: string;
  affiliate_tag: string;
  locale: string;
}

const newQuote = (seq: number): QuoteEntry => ({
  key: `q${seq}`,
  quote_es: "",
  quote_en: "",
  location: "",
});

const newLink = (seq: number): LinkEntry => ({
  key: `l${seq}`,
  retailer: "amazon",
  url: "",
  affiliate_tag: "",
  locale: "es",
});

const RETAILERS = ["amazon", "bookshop", "kobo", "other"] as const;

export default function BookContentEditor({ labels }: Props) {
  const [book, setBook] = useState<BookEditContent | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "not_found" | "ready">("loading");
  const [descEs, setDescEs] = useState("");
  const [descEn, setDescEn] = useState("");
  const [quotes, setQuotes] = useState<QuoteEntry[]>([]);
  const [links, setLinks] = useState<LinkEntry[]>([]);
  const seqRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"validation" | "link_url" | "unauthorized" | "unknown" | "">(
    "",
  );

  useEffect(() => {
    let cancelled = false;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setPhase("not_found");
      return;
    }
    getBookForEdit(id)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setPhase("not_found");
          return;
        }
        setBook(data);
        setDescEs(data.descriptionEs);
        setDescEn(data.descriptionEn);
        setQuotes(
          data.quotes.map((q) => ({
            key: `q${seqRef.current++}`,
            quote_es: q.quote_es,
            quote_en: q.quote_en,
            location: q.location,
          })),
        );
        setLinks(
          data.links.map((l) => ({
            key: `l${seqRef.current++}`,
            retailer: l.retailer,
            url: l.url,
            affiliate_tag: l.affiliate_tag,
            locale: l.locale,
          })),
        );
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The success banner must not outlive the state it described.
  function markDirty() {
    setSaved(false);
  }

  function updateQuote(key: string, patch: Partial<Omit<QuoteEntry, "key">>) {
    markDirty();
    setQuotes((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }
  function updateLink(key: string, patch: Partial<Omit<LinkEntry, "key">>) {
    markDirty();
    setLinks((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !book) return;
    setError("");
    setSaved(false);

    const quotesValid = quotes.every((q) => q.quote_es.trim() && q.quote_en.trim());
    const linksValid = links.every((l) => l.url.trim());
    if (!quotesValid || !linksValid) {
      setError("validation");
      return;
    }
    const schemesValid = links.every((l) => /^https?:\/\//i.test(l.url.trim()));
    if (!schemesValid) {
      setError("link_url");
      return;
    }

    setSaving(true);
    const result = await setBookContent(
      book.id,
      { es: descEs.trim(), en: descEn.trim() },
      quotes.map((q) => ({
        quote_es: q.quote_es.trim(),
        quote_en: q.quote_en.trim(),
        location: q.location.trim() || undefined,
      })),
      links.map((l) => ({
        retailer: l.retailer,
        url: l.url.trim(),
        affiliate_tag: l.affiliate_tag.trim() || undefined,
        locale: l.locale,
      })),
    );
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      return;
    }
    const kind: SaveContentError["kind"] = result.error.kind;
    setError(
      kind === "unauthorized" ? "unauthorized" : kind === "validation" ? "validation" : "unknown",
    );
  }

  if (phase === "loading") return <p className="text-ink/60">{labels.loading}</p>;
  if (phase === "error")
    return (
      <p className="text-oxblood" role="alert">
        {labels.error}
      </p>
    );
  if (phase === "not_found" || !book)
    return (
      <div className="space-y-3">
        <p className="text-ink/60">{labels.not_found}</p>
        <a href="/admin/books" className="text-sm text-oxblood underline">
          {labels.back}
        </a>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-8" noValidate>
      <div>
        <a href="/admin/books" className="text-sm text-ink/70 underline">
          {labels.back}
        </a>
        <h1 className="mt-2 font-serif text-2xl text-ink">{labels.title}</h1>
        <p className="text-sm text-ink/70">
          {book.title} — {book.authorName}
          {book.year !== null ? ` (${book.year})` : ""}
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-medium text-ink">{labels.synopsis_heading}</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-ink/80">{labels.synopsis_es_label}</span>
            <textarea
              rows={5}
              value={descEs}
              onChange={(e) => {
                markDirty();
                setDescEs(e.target.value);
              }}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/80">{labels.synopsis_en_label}</span>
            <textarea
              rows={5}
              value={descEn}
              onChange={(e) => {
                markDirty();
                setDescEn(e.target.value);
              }}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <TranslateButton
            sourceText={descEs}
            hasTargetContent={descEn.trim().length > 0}
            targetLang="EN"
            onTranslated={(text) => {
              markDirty();
              setDescEn(text);
            }}
            labels={labels.translate_to_en}
          />
          <TranslateButton
            sourceText={descEn}
            hasTargetContent={descEs.trim().length > 0}
            targetLang="ES"
            onTranslated={(text) => {
              markDirty();
              setDescEs(text);
            }}
            labels={labels.translate_to_es}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-medium text-ink">{labels.quotes_heading}</legend>
        {quotes.map((q, i) => (
          <div key={q.key} className="space-y-3 rounded border border-ink/10 bg-bone/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{`${labels.quote_heading} ${i + 1}`}</span>
              <button
                type="button"
                onClick={() => {
                  markDirty();
                  setQuotes((prev) => prev.filter((x) => x.key !== q.key));
                }}
                className="text-xs text-oxblood underline"
              >
                {labels.remove_quote}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink/80">{labels.quote_es_label} *</span>
                <textarea
                  rows={3}
                  value={q.quote_es}
                  onChange={(e) => updateQuote(q.key, { quote_es: e.target.value })}
                  className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink/80">{labels.quote_en_label} *</span>
                <textarea
                  rows={3}
                  value={q.quote_en}
                  onChange={(e) => updateQuote(q.key, { quote_en: e.target.value })}
                  className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <TranslateButton
                sourceText={q.quote_es}
                hasTargetContent={q.quote_en.trim().length > 0}
                targetLang="EN"
                onTranslated={(text) => updateQuote(q.key, { quote_en: text })}
                labels={labels.translate_to_en}
              />
              <TranslateButton
                sourceText={q.quote_en}
                hasTargetContent={q.quote_es.trim().length > 0}
                targetLang="ES"
                onTranslated={(text) => updateQuote(q.key, { quote_es: text })}
                labels={labels.translate_to_es}
              />
            </div>
            <label className="block text-sm">
              <span className="text-ink/80">{labels.quote_location_label}</span>
              <input
                type="text"
                maxLength={80}
                value={q.location}
                onChange={(e) => updateQuote(q.key, { location: e.target.value })}
                placeholder={labels.quote_location_placeholder}
                className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
              />
            </label>
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => {
              markDirty();
              setQuotes((prev) => [...prev, newQuote(seqRef.current++)]);
            }}
            className="text-sm font-medium text-oxblood hover:underline"
          >
            {labels.add_quote}
          </button>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-medium text-ink">{labels.links_heading}</legend>
        {links.map((l, i) => (
          <div key={l.key} className="space-y-3 rounded border border-ink/10 bg-bone/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{`${labels.link_heading} ${i + 1}`}</span>
              <button
                type="button"
                onClick={() => {
                  markDirty();
                  setLinks((prev) => prev.filter((x) => x.key !== l.key));
                }}
                className="text-xs text-oxblood underline"
              >
                {labels.remove_link}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-ink/80">{labels.link_retailer_label}</span>
                <select
                  value={l.retailer}
                  onChange={(e) => updateLink(l.key, { retailer: e.target.value })}
                  className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
                >
                  {RETAILERS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink/80">{labels.link_locale_label}</span>
                <select
                  value={l.locale}
                  onChange={(e) => updateLink(l.key, { locale: e.target.value })}
                  className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
                >
                  <option value="es">es</option>
                  <option value="en">en</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-ink/80">{labels.link_url_label} *</span>
              <input
                type="url"
                value={l.url}
                onChange={(e) => updateLink(l.key, { url: e.target.value })}
                className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink/80">{labels.link_affiliate_label}</span>
              <input
                type="text"
                value={l.affiliate_tag}
                onChange={(e) => updateLink(l.key, { affiliate_tag: e.target.value })}
                className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
              />
            </label>
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => {
              markDirty();
              setLinks((prev) => [...prev, newLink(seqRef.current++)]);
            }}
            className="text-sm font-medium text-oxblood hover:underline"
          >
            {labels.add_link}
          </button>
        </div>
      </fieldset>

      {error && (
        <p
          role="alert"
          className="rounded border border-oxblood/40 bg-oxblood/5 p-3 text-sm text-oxblood"
        >
          {error === "validation"
            ? labels.error_validation
            : error === "link_url"
              ? labels.error_link_url
              : error === "unauthorized"
                ? labels.error_unauthorized
                : labels.error_unknown}
        </p>
      )}
      {saved && !error && (
        <p className="rounded border border-sage/30 bg-sage/10 p-3 text-sm text-ink">
          {labels.saved}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded bg-oxblood px-4 py-2 text-sm text-parchment disabled:opacity-50"
      >
        {saving ? labels.saving : labels.save}
      </button>
    </form>
  );
}
