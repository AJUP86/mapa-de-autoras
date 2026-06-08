// AdminLoginForm.tsx — Stage 7a
//
// Magic-link request form. On submit, asks Supabase to send a one-time-token
// email. Supabase honors `enable_signup = false` from config.toml — if the
// email doesn't match an existing user, no email is sent (silent, by design).

import { useState, type FormEvent } from "react";
import { requestMagicLink } from "../lib/admin-session";

interface Labels {
  title: string;
  subtitle: string;
  email_label: string;
  submit: string;
  submitting: string;
  success: string;
  error_generic: string;
}

interface Props {
  redirectTo: string;
  labels: Labels;
}

export default function AdminLoginForm({ redirectTo, labels }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    setError(null);
    // GoTrue requires an absolute redirect URL; relative paths silently
    // fall back to site_url. Compose the absolute target from the page's
    // origin so the magic-link always returns to the same host that
    // requested it.
    const absoluteRedirect = redirectTo.startsWith("http")
      ? redirectTo
      : `${window.location.origin}${redirectTo}`;
    const result = await requestMagicLink(email.trim(), absoluteRedirect);
    if (result.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setError(result.error || labels.error_generic);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="font-serif text-2xl text-ink">{labels.title}</h1>
      <p className="text-sm text-ink/70">{labels.subtitle}</p>
      <label className="block">
        <span className="text-sm text-ink/80">{labels.email_label}</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "sending" || status === "sent"}
          className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-2 text-ink"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending" || status === "sent" || !email.trim()}
        className="w-full rounded bg-oxblood px-4 py-2 text-parchment disabled:opacity-50"
      >
        {status === "sending" ? labels.submitting : labels.submit}
      </button>
      {status === "sent" && (
        <p className="text-sm text-sage" role="status">
          {labels.success}
        </p>
      )}
      {status === "error" && error && (
        <p className="text-sm text-oxblood" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
