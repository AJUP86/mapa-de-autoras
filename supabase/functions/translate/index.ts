// translate — Stage 7b-i
//
// Admin-only DeepL proxy. With `verify_jwt = true` in config.toml, Supabase
// validates the JWT before our handler runs — so we can assume the caller
// is authenticated. We still check the app_metadata.role for admin-ness in
// case a non-admin authed user reaches us.
//
// Body: { text: string, target_lang: "EN" | "ES" }
// Out:  { text: string }  | error JSON
//
// Env: DEEPL_API_KEY (required for real calls; missing → 502).

const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

interface Body {
  text: string;
  target_lang: "EN" | "ES";
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    // base64url → base64 → utf-8 JSON
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Extra defence: confirm the JWT belongs to an admin even though
  // verify_jwt = true already ensured it's a valid session.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const payload = decodeJwtPayload(jwt);
  const role = (payload?.app_metadata as Record<string, unknown> | undefined)?.role;
  if (role !== "admin") {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const text = body.text?.trim() ?? "";
  const target = body.target_lang;
  if (!text || (target !== "EN" && target !== "ES")) {
    return json({ error: "invalid_input" }, 400);
  }

  const deeplKey = Deno.env.get("DEEPL_API_KEY") ?? "";
  if (!deeplKey) {
    console.error("[translate] DEEPL_API_KEY not set");
    return json({ error: "translation_failed" }, 502);
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
    return json({ error: "translation_rate_limited" }, 502);
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error(`[translate] deepl failed (${resp.status}):`, errText);
    return json({ error: "translation_failed" }, 502);
  }

  const data = (await resp.json()) as {
    translations: { text: string; detected_source_language?: string }[];
  };
  const translated = data?.translations?.[0]?.text ?? "";
  return json({ text: translated }, 200);
});
