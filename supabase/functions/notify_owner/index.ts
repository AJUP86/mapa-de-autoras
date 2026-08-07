// notify_owner — Stage 7a
//
// Called by an AFTER INSERT trigger on public.suggestions (via pg_net).
// Sends the owner an email when a new suggestion lands.
//
// In dev (RESEND_API_KEY empty), logs the payload to the console instead of
// sending. Lets us verify trigger -> function plumbing without Resend.
//
// Env it reads:
//   RESEND_API_KEY              - empty in dev = log-only mode
//   RESEND_FROM_EMAIL           - sender (e.g. hola@mapadeautoras.com)
//   OWNER_NOTIFICATION_EMAIL    - recipient
//   PUBLIC_SITE_URL             - used to build the inbox deep-link

interface TriggerPayload {
  type: "INSERT";
  table: "suggestions";
  record: {
    id: string;
    submitter_email: string;
    submitter_name: string | null;
    proposed_author_name: string;
    proposed_country_iso_a3: string;
    proposed_books_text: string | null;
    note: string | null;
    accepted_newsletter: boolean;
    created_at: string;
  };
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Source",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function buildEmailBody(
  record: TriggerPayload["record"],
  siteUrl: string,
): { subject: string; text: string } {
  const subject = `Nueva sugerencia: ${record.proposed_author_name}`;
  const reviewUrl = `${siteUrl}/admin/suggestions/${record.id}`;
  const text = [
    `Nueva sugerencia recibida.`,
    ``,
    `Autora propuesta: ${record.proposed_author_name}`,
    `País: ${record.proposed_country_iso_a3}`,
    `Libros sugeridos: ${record.proposed_books_text ?? "(ninguno)"}`,
    `Nota: ${record.note ?? "(ninguna)"}`,
    `Enviado por: ${record.submitter_name ?? "(sin nombre)"} <${record.submitter_email}>`,
    `Newsletter opt-in: ${record.accepted_newsletter ? "sí" : "no"}`,
    ``,
    `Revisar: ${reviewUrl}`,
  ].join("\n");
  return { subject, text };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: TriggerPayload;
  try {
    payload = (await req.json()) as TriggerPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (payload.type !== "INSERT" || payload.table !== "suggestions" || !payload.record) {
    return json({ error: "unexpected_payload" }, 400);
  }

  const ownerEmail = Deno.env.get("OWNER_NOTIFICATION_EMAIL") ?? "";
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:4321";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";

  if (!ownerEmail) {
    console.error("[notify_owner] OWNER_NOTIFICATION_EMAIL not set");
    return json({ error: "server_misconfigured" }, 500);
  }

  const { subject, text } = buildEmailBody(payload.record, siteUrl);

  if (!resendKey) {
    console.log("[notify_owner] RESEND_API_KEY empty — log-only mode");
    console.log(`  To:      ${ownerEmail}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:\n${text}`);
    return json({ ok: true, sent: false, mode: "log" }, 200);
  }

  if (!fromEmail) {
    console.error("[notify_owner] RESEND_FROM_EMAIL not set");
    return json({ error: "server_misconfigured" }, 500);
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: ownerEmail,
      subject,
      text,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[notify_owner] resend failed (${resp.status}):`, errText);
    return json({ error: "send_failed" }, 500);
  }

  return json({ ok: true, sent: true, mode: "resend" }, 200);
});
