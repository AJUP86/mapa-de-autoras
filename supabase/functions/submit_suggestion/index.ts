// submit_suggestion — Stage 6
//
// Public Edge Function that:
//   1. Validates the incoming JSON body.
//   2. Verifies the Cloudflare Turnstile token server-side (the SECRET key
//      is never exposed to the browser).
//   3. Inserts the row into `suggestions` using the service-role key
//      (bypasses RLS — the table no longer accepts anon INSERTs after
//      migration 0002).
//   4. If `newsletterOptIn === true`, upserts a pending `subscribers` row.
//      The confirmation email is sent in Stage 8; until then the row sits
//      as `pending`.
//
// Local invocation (from `npm run dev` on http://localhost:4321):
//   POST http://127.0.0.1:54321/functions/v1/submit_suggestion
//
// Env vars (set in `supabase/.env` or by `supabase functions serve --env-file`):
//   SUPABASE_URL                 - automatic
//   SUPABASE_SERVICE_ROLE_KEY    - automatic
//   TURNSTILE_SECRET_KEY         - your Cloudflare Turnstile secret
//                                  (use 1x0000000000000000000000000000000AA for dev)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

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

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ─── Parse + validate body ────────────────────────────────────────────
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const authorName = body.authorName?.trim() ?? "";
  const countryIsoA3 = body.countryIsoA3?.trim().toUpperCase() ?? "";
  const email = body.email?.trim() ?? "";

  if (
    authorName.length === 0 ||
    authorName.length > 120 ||
    !/^[A-Z]{3}$/.test(countryIsoA3) ||
    !isEmail(email) ||
    !body.turnstileToken ||
    (body.locale !== "es" && body.locale !== "en")
  ) {
    return json({ error: "validation" }, 400);
  }

  // ─── Verify Turnstile ─────────────────────────────────────────────────
  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
  if (!turnstileSecret) {
    console.error("[submit_suggestion] TURNSTILE_SECRET_KEY not set");
    return json({ error: "server_misconfigured" }, 500);
  }

  const verifyResp = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    body: new URLSearchParams({
      secret: turnstileSecret,
      response: body.turnstileToken,
      remoteip: req.headers.get("CF-Connecting-IP") ??
        req.headers.get("X-Forwarded-For") ??
        "",
    }),
  });
  const verifyJson = (await verifyResp.json()) as { success: boolean };
  if (!verifyJson.success) {
    return json({ error: "turnstile" }, 400);
  }

  // ─── Insert with service role (bypasses RLS) ──────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    console.error("[submit_suggestion] Supabase env vars missing");
    return json({ error: "server_misconfigured" }, 500);
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
    return json({ error: "insert_failed" }, 500);
  }

  // ─── Newsletter opt-in (pending row, email deferred to Stage 8) ──────
  if (body.newsletterOptIn === true) {
    const confirmToken = crypto.randomUUID();
    const { error: subErr } = await sb.from("subscribers").upsert(
      {
        email,
        status: "pending",
        locale: body.locale,
        confirm_token: confirmToken,
      },
      { onConflict: "email", ignoreDuplicates: true },
    );
    if (subErr) {
      // Non-fatal — the suggestion is in. Log and continue.
      console.warn(
        "[submit_suggestion] subscriber upsert failed (non-fatal):",
        subErr.message,
      );
    }
  }

  return json({ ok: true }, 200);
});
