// translate — Stage 7b-i
//
// Admin-only DeepL proxy. `verify_jwt` stays FALSE in config.toml so the CORS
// preflight (OPTIONS strips Authorization) is not rejected by the platform.
// The JWT signature is verified in-function via supabase.auth.getUser (see
// requireAdmin in _shared/auth.ts), which validates the token server-side and
// asserts app_metadata.role === 'admin' from the verified claims.
//
// Body: { text: string, target_lang: "EN" | "ES" }
// Out:  { text: string }  | error JSON
//
// Env: DEEPL_API_KEY (required for real calls; missing → 502).

import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

interface Body {
  text: string;
  target_lang: "EN" | "ES";
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  // Verify the JWT signature server-side and confirm the caller is an admin.
  if (!(await requireAdmin(req))) return json({ error: "unauthorized" }, 401, cors);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const text = body.text?.trim() ?? "";
  const target = body.target_lang;
  if (!text || (target !== "EN" && target !== "ES")) {
    return json({ error: "invalid_input" }, 400, cors);
  }

  const deeplKey = Deno.env.get("DEEPL_API_KEY") ?? "";
  if (!deeplKey) {
    console.error("[translate] DEEPL_API_KEY not set");
    return json({ error: "translation_failed" }, 502, cors);
  }

  const resp = await fetch(DEEPL_URL, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${deeplKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ text, target_lang: target }),
  });

  if (resp.status === 429) {
    return json({ error: "translation_rate_limited" }, 502, cors);
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error(`[translate] deepl failed (${resp.status}):`, errText);
    return json({ error: "translation_failed" }, 502, cors);
  }

  const data = (await resp.json()) as {
    translations: { text: string; detected_source_language?: string }[];
  };
  const translated = data?.translations?.[0]?.text ?? "";
  return json({ text: translated }, 200, cors);
});
