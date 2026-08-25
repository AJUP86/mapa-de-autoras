// notify_submitter — Stage 8.5
//
// Invoked by a Supabase Database Webhook on `suggestions UPDATE` where a
// suggestion transitions to status='processed' (the admin "Finish & notify"
// action, which only fires once no child entry is still 'pending'). Sends one
// transactional email to the opted-in submitter, in their original locale, via
// Resend, listing the per-book outcome (promoted / already present / rejected)
// for each resolved suggestion_books entry in the envelope.
//
// Idempotency: guarded by a conditional `notified_at IS NULL` claim before
// send. Concurrent webhook retries collapse to one winner.
//
// Auth: webhook-only. Platform-level `verify_jwt=true` (pinned in
// config.toml) proves the bearer is SOME valid project JWT, but the public
// anon key passes that gate too — so in-function we additionally require the
// bearer to BE the service-role key (constant-time compared in
// isServiceRoleBearer).
//
// Local dev: if RESEND_API_KEY is absent, logs a warning and returns 200
// without sending — lets the suggest+process flow work end-to-end locally.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { isServiceRoleBearer } from "../_shared/auth.ts";
import { renderOutcome, type OutcomeEntry } from "./email.ts";

// Webhook payload for a `suggestions UPDATE` transitioning to
// status='processed'; only the record id is used (the row is re-loaded
// service-role-side below).
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: { id?: string } | null;
  old_record?: { id?: string } | null;
}

// Webhook-only function (no browser callers), so no CORS is emitted — matching
// notify_owner.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // ─── Auth ─────────────────────────────────────────────────────────────
  // Platform-level `verify_jwt=true` only proves the bearer is SOME valid
  // project JWT — the public anon key passes that gate. Since this is a
  // webhook-only function, we additionally require the bearer to BE the
  // service-role key (constant-time compared in isServiceRoleBearer).
  if (!isServiceRoleBearer(req)) return json({ error: "unauthorized" }, 401);

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
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: sug, error: loadErr } = await sb
    .from("suggestions")
    .select(
      "id, submitter_email, submitter_name, locale, accepted_newsletter, notified_at, status",
    )
    .eq("id", suggestionId)
    .single();
  if (loadErr || !sug) {
    console.error("[notify_submitter] suggestion load failed:", loadErr?.message);
    return json({ error: "load_failed" }, 500);
  }

  // ─── Guards ───────────────────────────────────────────────────────────
  if (sug.status !== "processed") {
    return json({ ok: true, reason: "not_processed" }, 200);
  }
  if (sug.accepted_newsletter !== true) {
    return json({ ok: true, reason: "not_opted_in" }, 200);
  }
  if (sug.notified_at !== null) {
    return json({ ok: true, reason: "already_notified" }, 200);
  }

  // ─── Load envelope children (per-book outcomes) ───────────────────────
  const { data: rows, error: rowsErr } = await sb
    .from("suggestion_books")
    .select(
      "proposed_book_title, proposed_author_name, disposition, display_order",
    )
    .eq("suggestion_id", suggestionId)
    .order("display_order", { ascending: true });
  if (rowsErr) {
    console.error("[notify_submitter] entries load failed:", rowsErr.message);
    return json({ error: "entries_load_failed" }, 500);
  }
  const entries: OutcomeEntry[] = (rows ?? [])
    .filter(
      (r) =>
        r.disposition === "promoted" ||
        r.disposition === "already_present" ||
        r.disposition === "rejected",
    )
    .map((r) => ({
      title: r.proposed_book_title,
      author: r.proposed_author_name,
      disposition: r.disposition as OutcomeEntry["disposition"],
    }));
  if (entries.length === 0) {
    return json({ ok: true, reason: "no_resolved_entries" }, 200);
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

  const { subject, textBody, htmlBody } = renderOutcome({
    locale,
    submitterName: sug.submitter_name ?? null,
    siteUrl,
    entries,
  });

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
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
    // No revert — notified_at stays set (at-most-once). A duplicate email is
    // worse than a missed one; the idempotency claim prevents webhook retries
    // from resending. Clear notified_at manually to force a resend.
    console.error(
      "[notify_submitter] Resend send failed (notified_at kept):",
      resendRes.status,
      bodyText,
    );
    return json({ error: "resend_failed", status: resendRes.status }, 500);
  }

  return json({ ok: true }, 200);
});
