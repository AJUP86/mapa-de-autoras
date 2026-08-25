// submit_suggestion — Stage 8.5 (book-first)
//
// Public Edge Function that:
//   1. Validates the incoming JSON body — a book-first ENVELOPE with an
//      N-CHILDREN payload: one submitter envelope plus 1..20 proposed books.
//   2. Verifies the Cloudflare Turnstile token server-side (the SECRET key
//      is never exposed to the browser).
//   3. Inserts, with the service-role key (bypasses RLS):
//        a. ONE `suggestions` envelope row (submitter + locale + newsletter
//           opt-in), returning its new id;
//        b. N `suggestion_books` child rows (one per proposed book), each
//           carrying its own author / country / title / note and a
//           display_order. If the children insert fails, the just-created
//           envelope row is deleted to avoid an orphan.
//   4. Fires a non-fatal acknowledgement email ("I got your suggestion")
//      when the submitter opted in — the suggestion is already saved, so
//      the request always returns 200 regardless of the email outcome.
//
// No separate newsletter table is written here (removed in hardening).
//
// Local invocation (from `npm run dev` on http://localhost:4321):
//   POST http://127.0.0.1:54321/functions/v1/submit_suggestion
//
// Env vars (set in `supabase/.env` or by `supabase functions serve --env-file`):
//   SUPABASE_URL                 - automatic
//   SUPABASE_SERVICE_ROLE_KEY    - automatic
//   TURNSTILE_SECRET_KEY         - your Cloudflare Turnstile secret
//                                  (use 1x0000000000000000000000000000000AA for dev)
//   TURNSTILE_ALLOWED_HOSTNAMES  - optional, comma-separated allowlist of the
//                                  hostnames the Turnstile token may be issued
//                                  for. Unset/empty = hostname check skipped.
//   RESEND_API_KEY               - optional; ack email is skipped if unset.
//   RESEND_FROM_EMAIL            - optional; defaults to onboarding@resend.dev.
//   SITE_URL                     - optional; defaults to https://mapadeautoras.com.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { renderSubmitAck } from "./email.ts";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface BookEntry {
  authorName: string;
  countryIsoA3: string;
  bookTitle: string;
  note?: string;
}

interface SubmitBody {
  submitterName?: string;
  email: string;
  locale: "es" | "en";
  newsletterOptIn: boolean;
  turnstileToken: string;
  books: BookEntry[];
}

const LIMITS = {
  authorName: 120,
  bookTitle: 200,
  note: 500,
  submitterName: 120,
  email: 254,
} as const;

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  // ─── Parse + validate body ────────────────────────────────────────────
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const email = body.email?.trim() ?? "";
  const books = Array.isArray(body.books) ? body.books : [];

  const envelopeValid =
    isEmail(email) &&
    email.length <= LIMITS.email &&
    (body.submitterName ?? "").length <= LIMITS.submitterName &&
    (body.locale === "es" || body.locale === "en") &&
    !!body.turnstileToken &&
    books.length >= 1 &&
    books.length <= 20;

  if (!envelopeValid) {
    return json({ error: "validation" }, 400, cors);
  }

  for (const b of books) {
    const authorName = b?.authorName?.trim() ?? "";
    const countryIsoA3 = b?.countryIsoA3?.trim().toUpperCase() ?? "";
    const bookTitle = b?.bookTitle?.trim() ?? "";
    if (
      authorName.length < 1 ||
      authorName.length > LIMITS.authorName ||
      !/^[A-Z]{3}$/.test(countryIsoA3) ||
      bookTitle.length < 1 ||
      bookTitle.length > LIMITS.bookTitle ||
      (b?.note ?? "").length > LIMITS.note
    ) {
      return json({ error: "validation" }, 400, cors);
    }
  }

  // ─── Verify Turnstile ─────────────────────────────────────────────────
  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
  if (!turnstileSecret) {
    console.error("[submit_suggestion] TURNSTILE_SECRET_KEY not set");
    return json({ error: "server_misconfigured" }, 500, cors);
  }

  const verifyResp = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body: new URLSearchParams({
      secret: turnstileSecret,
      response: body.turnstileToken,
      remoteip: req.headers.get("CF-Connecting-IP") ?? req.headers.get("X-Forwarded-For") ?? "",
    }),
  });
  // A Cloudflare 5xx (or any non-2xx) means we cannot trust the verdict; treat
  // it as a failed challenge rather than letting `.json()` throw a bare 500.
  if (!verifyResp.ok) return json({ error: "turnstile" }, 400, cors);
  const verifyJson = (await verifyResp.json()) as { success: boolean; hostname?: string };
  if (!verifyJson.success) {
    return json({ error: "turnstile" }, 400, cors);
  }

  // Hostname allowlist: a token issued for one host (e.g. staging) must not
  // replay against another (e.g. prod). If TURNSTILE_ALLOWED_HOSTNAMES is set
  // (comma-separated), the token's hostname must be a member. If it is unset/
  // empty we log a warning and SKIP the check, so environments that have not
  // configured it yet still function.
  const allowedHostnamesRaw = Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES") ?? "";
  if (allowedHostnamesRaw.trim().length > 0) {
    const allowedHostnames = allowedHostnamesRaw
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
    if (!verifyJson.hostname || !allowedHostnames.includes(verifyJson.hostname)) {
      return json({ error: "turnstile" }, 400, cors);
    }
  } else {
    console.warn(
      "[submit_suggestion] TURNSTILE_ALLOWED_HOSTNAMES not set — skipping hostname check",
    );
  }

  // ─── Insert with service role (bypasses RLS) ──────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    console.error("[submit_suggestion] Supabase env vars missing");
    return json({ error: "server_misconfigured" }, 500, cors);
  }
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Insert the envelope row and grab its new id.
  const { data: envelope, error: envelopeErr } = await sb
    .from("suggestions")
    .insert({
      submitter_email: email,
      submitter_name: body.submitterName?.trim() || null,
      accepted_newsletter: body.newsletterOptIn === true,
      locale: body.locale,
    })
    .select("id")
    .single();

  if (envelopeErr || !envelope) {
    console.error("[submit_suggestion] envelope insert failed:", envelopeErr?.message);
    return json({ error: "insert_failed" }, 500, cors);
  }

  // 2. Insert the N child book rows.
  const childRows = books.map((b, i) => ({
    suggestion_id: envelope.id,
    proposed_author_name: b.authorName.trim(),
    proposed_country_iso_a3: b.countryIsoA3.trim().toUpperCase(),
    proposed_book_title: b.bookTitle.trim(),
    note: b.note?.trim() || null,
    display_order: i,
  }));

  const { error: childErr } = await sb.from("suggestion_books").insert(childRows);

  // 3. On child failure, delete the just-created envelope to avoid an orphan.
  if (childErr) {
    console.error("[submit_suggestion] children insert failed:", childErr.message);
    await sb.from("suggestions").delete().eq("id", envelope.id);
    return json({ error: "insert_failed" }, 500, cors);
  }

  // ─── Acknowledgement email (NON-FATAL) ────────────────────────────────
  // The suggestion is already saved; any failure here is logged and ignored.
  const optIn = body.newsletterOptIn === true;
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (optIn && email && resendKey) {
    try {
      const { subject, textBody, htmlBody } = renderSubmitAck({
        locale: body.locale,
        submitterName: body.submitterName?.trim() || null,
        bookTitles: books.map((b) => b.bookTitle.trim()),
        siteUrl: Deno.env.get("SITE_URL") ?? "https://mapadeautoras.com",
      });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev",
          to: email,
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });
      if (!res.ok) {
        console.error(
          "[submit_suggestion] ack email non-ok:",
          res.status,
          await res.text().catch(() => ""),
        );
      }
    } catch (e) {
      console.error("[submit_suggestion] ack email failed (non-fatal):", e);
    }
  }

  return json({ ok: true }, 200, cors);
});
