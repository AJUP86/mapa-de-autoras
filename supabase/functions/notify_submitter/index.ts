// notify_submitter — Stage 8
//
// Invoked by a Supabase Database Webhook on `suggestions UPDATE` where a
// pending suggestion transitions to status='approved' by the promote_suggestion
// RPC. Sends one transactional email to the opted-in submitter, in their
// original locale, via Resend.
//
// Idempotency: guarded by a conditional `notified_at IS NULL` claim before
// send. Concurrent webhook retries collapse to one winner.
//
// Auth: rejects any request whose Authorization header != Bearer + service
// role key. The webhook is configured to include this header (dashboard).
//
// Local dev: if RESEND_API_KEY is absent, logs a warning and returns 200
// without sending — lets the suggest+promote flow work end-to-end locally.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { renderEmail } from "./email.ts";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: { id?: string } | null;
  old_record?: { id?: string } | null;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // ─── Auth ─────────────────────────────────────────────────────────────
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer || !serviceKey || bearer !== serviceKey) {
    return json({ error: "unauthorized" }, 401);
  }

  // ─── Parse payload ────────────────────────────────────────────────────
  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const suggestionId = payload?.record?.id;
  if (!suggestionId) {
    return json({ error: "bad_payload" }, 400);
  }

  // ─── Local-dev short-circuit ──────────────────────────────────────────
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!resendKey) {
    console.warn("[notify_submitter] RESEND_API_KEY absent — skipping send.");
    return json({ ok: true, skipped: true }, 200);
  }

  // ─── Load suggestion ──────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!supabaseUrl) {
    console.error("[notify_submitter] SUPABASE_URL missing");
    return json({ error: "server_misconfigured" }, 500);
  }
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: sug, error: loadErr } = await sb
    .from("suggestions")
    .select(
      "id, submitter_email, submitter_name, locale, accepted_newsletter, notified_at, promoted_author_id, status",
    )
    .eq("id", suggestionId)
    .single();
  if (loadErr || !sug) {
    console.error("[notify_submitter] suggestion load failed:", loadErr?.message);
    return json({ error: "load_failed" }, 500);
  }

  // ─── Guards ───────────────────────────────────────────────────────────
  if (sug.status !== "approved") {
    return json({ ok: true, reason: "not_approved" }, 200);
  }
  if (sug.accepted_newsletter !== true) {
    return json({ ok: true, reason: "not_opted_in" }, 200);
  }
  if (sug.notified_at !== null) {
    return json({ ok: true, reason: "already_notified" }, 200);
  }
  if (!sug.promoted_author_id) {
    return json({ ok: true, reason: "no_promoted_author" }, 200);
  }

  // ─── Load promoted author ─────────────────────────────────────────────
  const { data: author, error: authorErr } = await sb
    .from("authors")
    .select("name")
    .eq("id", sug.promoted_author_id)
    .single();
  if (authorErr || !author) {
    console.error("[notify_submitter] author load failed:", authorErr?.message);
    return json({ error: "author_load_failed" }, 500);
  }

  // ─── Idempotency claim ────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const { data: claim, error: claimErr } = await sb
    .from("suggestions")
    .update({ notified_at: nowIso })
    .eq("id", suggestionId)
    .is("notified_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) {
    console.error("[notify_submitter] claim failed:", claimErr.message);
    return json({ error: "claim_failed" }, 500);
  }
  if (!claim) {
    return json({ ok: true, reason: "already_claimed" }, 200);
  }

  // ─── Render + send ────────────────────────────────────────────────────
  const locale: "es" | "en" = sug.locale === "en" ? "en" : "es";
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://mapadeautoras.com";
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";

  const { subject, textBody, htmlBody } = renderEmail({
    locale,
    authorName: author.name,
    submitterName: sug.submitter_name ?? null,
    siteUrl,
  });

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: sug.submitter_email,
      subject,
      text: textBody,
      html: htmlBody,
    }),
  });

  if (!resendRes.ok) {
    const bodyText = await resendRes.text();
    console.error(
      "[notify_submitter] Resend send failed:",
      resendRes.status,
      bodyText,
    );
    // Revert the claim so a retry can succeed.
    await sb
      .from("suggestions")
      .update({ notified_at: null })
      .eq("id", suggestionId);
    return json({ error: "resend_failed", status: resendRes.status }, 500);
  }

  return json({ ok: true }, 200);
});
