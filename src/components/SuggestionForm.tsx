import { useEffect, useRef, useState } from "react";
import type { CountryOption } from "~/lib/countries";

// Turnstile is loaded via <script> on the suggest page; declare its API here.
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

export interface SuggestionFormLabels {
  fields: {
    author_name_label: string;
    author_name_placeholder: string;
    country_label: string;
    country_placeholder: string;
    books_label: string;
    books_placeholder: string;
    note_label: string;
    note_placeholder: string;
    email_label: string;
    email_placeholder: string;
    email_hint: string;
    submitter_name_label: string;
    submitter_name_placeholder: string;
    newsletter_label: string;
  };
  submit: string;
  submitting: string;
  errors: { network: string; validation: string; turnstile: string };
  required_mark: string;
}

interface Props {
  labels: SuggestionFormLabels;
  countries: CountryOption[];
  /** Locale code stored with the subscriber row; also sent to the Edge function. */
  locale: "es" | "en";
  /** Cloudflare Turnstile site key (PUBLIC_TURNSTILE_SITE_KEY). */
  turnstileSiteKey: string;
  /** Supabase Edge Function endpoint — `${PUBLIC_SUPABASE_URL}/functions/v1/submit_suggestion`. */
  submitUrl: string;
  /** Path the user lands on after a successful submit. */
  thanksUrl: string;
}

interface FormState {
  authorName: string;
  countryIsoA3: string;
  booksText: string;
  note: string;
  email: string;
  submitterName: string;
  newsletterOptIn: boolean;
}

const EMPTY: FormState = {
  authorName: "",
  countryIsoA3: "",
  booksText: "",
  note: "",
  email: "",
  submitterName: "",
  newsletterOptIn: false,
};

export default function SuggestionForm({
  labels,
  countries,
  locale,
  turnstileSiteKey,
  submitUrl,
  thanksUrl,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<keyof SuggestionFormLabels["errors"] | "">(
    "",
  );

  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Mount the Turnstile widget once the script and the div are both ready.
  useEffect(() => {
    if (!turnstileRef.current) return;
    let cancelled = false;

    const mount = () => {
      if (cancelled || !window.turnstile || !turnstileRef.current) return;
      if (widgetIdRef.current) return; // already mounted
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
        theme: "light",
      });
    };

    if (window.turnstile) {
      mount();
    } else {
      // Script not loaded yet — poll briefly.
      const id = setInterval(() => {
        if (window.turnstile) {
          clearInterval(id);
          mount();
        }
      }, 150);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [turnstileSiteKey]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    // Light client-side validation — the Edge Function validates again server-side.
    if (
      !form.authorName.trim() ||
      !/^[A-Z]{3}$/.test(form.countryIsoA3) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      setError("validation");
      return;
    }
    if (!turnstileToken) {
      setError("turnstile");
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: form.authorName.trim(),
          countryIsoA3: form.countryIsoA3,
          booksText: form.booksText.trim() || undefined,
          note: form.note.trim() || undefined,
          email: form.email.trim(),
          submitterName: form.submitterName.trim() || undefined,
          newsletterOptIn: form.newsletterOptIn,
          locale,
          turnstileToken,
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        if (body?.error === "turnstile") setError("turnstile");
        else if (body?.error === "validation") setError("validation");
        else setError("network");
        if (window.turnstile && widgetIdRef.current)
          window.turnstile.reset(widgetIdRef.current);
        setTurnstileToken("");
        setSubmitting(false);
        return;
      }

      window.location.assign(thanksUrl);
    } catch {
      setError("network");
      if (window.turnstile && widgetIdRef.current)
        window.turnstile.reset(widgetIdRef.current);
      setTurnstileToken("");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <Field
        label={labels.fields.author_name_label + labels.required_mark}
        htmlFor="author-name"
      >
        <input
          id="author-name"
          type="text"
          required
          maxLength={120}
          value={form.authorName}
          onChange={(e) => update("authorName", e.target.value)}
          placeholder={labels.fields.author_name_placeholder}
          className={inputCls}
        />
      </Field>

      <Field
        label={labels.fields.country_label + labels.required_mark}
        htmlFor="country"
      >
        <select
          id="country"
          required
          value={form.countryIsoA3}
          onChange={(e) => update("countryIsoA3", e.target.value)}
          className={inputCls}
        >
          <option value="" disabled>
            {labels.fields.country_placeholder}
          </option>
          {countries.map((c) => (
            <option key={c.iso_a3} value={c.iso_a3}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={labels.fields.books_label} htmlFor="books">
        <textarea
          id="books"
          rows={3}
          maxLength={1000}
          value={form.booksText}
          onChange={(e) => update("booksText", e.target.value)}
          placeholder={labels.fields.books_placeholder}
          className={inputCls + " resize-y"}
        />
      </Field>

      <Field label={labels.fields.note_label} htmlFor="note">
        <textarea
          id="note"
          rows={3}
          maxLength={2000}
          value={form.note}
          onChange={(e) => update("note", e.target.value)}
          placeholder={labels.fields.note_placeholder}
          className={inputCls + " resize-y"}
        />
      </Field>

      <Field
        label={labels.fields.email_label + labels.required_mark}
        htmlFor="email"
        hint={labels.fields.email_hint}
      >
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder={labels.fields.email_placeholder}
          className={inputCls}
        />
      </Field>

      <Field
        label={labels.fields.submitter_name_label}
        htmlFor="submitter-name"
      >
        <input
          id="submitter-name"
          type="text"
          autoComplete="name"
          maxLength={120}
          value={form.submitterName}
          onChange={(e) => update("submitterName", e.target.value)}
          placeholder={labels.fields.submitter_name_placeholder}
          className={inputCls}
        />
      </Field>

      <label className="flex items-start gap-3 text-sm font-body text-ink/80 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.newsletterOptIn}
          onChange={(e) => update("newsletterOptIn", e.target.checked)}
          className="mt-0.5 size-4 rounded border-ink/30 text-oxblood focus:ring-oxblood/40"
        />
        <span>{labels.fields.newsletter_label}</span>
      </label>

      <div ref={turnstileRef} className="mt-2" />

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
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-ink font-body"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink/60 font-body">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-ink/15 bg-bone px-3 py-2 text-ink font-body " +
  "placeholder:text-ink/40 focus:outline-none focus:border-oxblood/60 " +
  "focus:ring-2 focus:ring-oxblood/15 transition-colors";
