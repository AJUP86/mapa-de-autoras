// submit_suggestion — Stage 6
//
// Public Edge Function that:
//   1. Validates the incoming JSON body.
//   2. Verifies the Cloudflare Turnstile token server-side (the SECRET key
//      is never exposed to the browser).
//   3. Inserts the row into `suggestions` using the service-role key
//      (bypasses RLS — the table no longer accepts anon INSERTs after
//      migration 0002). The newsletter opt-in is recorded on that row via
//      `accepted_newsletter`; no separate table is written here.
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SubmitBody {
  authorName: string;
  countryIsoA3: string;
  booksText?: string;
  note?: string;
  email: string;
  submitterName?: string;
  newsletterOptIn: boolean;
  locale: "es" | "en";
  turnstileToken: string;
}

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

  const authorName = body.authorName?.trim() ?? "";
  const countryIsoA3 = body.countryIsoA3?.trim().toUpperCase() ?? "";
  const email = body.email?.trim() ?? "";

  if (
    authorName.length === 0 ||
    authorName.length > 120 ||
    (body.booksText ?? "").length > 1000 ||
    (body.note ?? "").length > 2000 ||
    (body.submitterName ?? "").length > 120 ||
    (body.email ?? "").length > 254 ||
    !/^[A-Z]{3}$/.test(countryIsoA3) ||
    !isEmail(email) ||
    !body.turnstileToken ||
    (body.locale !== "es" && body.locale !== "en")
  ) {
    return json({ error: "validation" }, 400, cors);
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

  const { error: insertErr } = await sb.from("suggestions").insert({
    submitter_email: email,
    submitter_name: body.submitterName?.trim() || null,
    proposed_author_name: authorName,
    proposed_country_iso_a3: countryIsoA3,
    proposed_books_text: body.booksText?.trim() || null,
    note: body.note?.trim() || null,
    accepted_newsletter: body.newsletterOptIn === true,
    turnstile_verified: true,
    locale: body.locale,
  });

  if (insertErr) {
    console.error("[submit_suggestion] insert failed:", insertErr.message);
    return json({ error: "insert_failed" }, 500, cors);
  }

  return json({ ok: true }, 200, cors);
});
