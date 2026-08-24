// _shared/auth.ts — webhook caller authentication.
//
// Platform-level `verify_jwt = true` only proves the bearer is SOME valid
// project JWT — the public anon key passes that gate. Webhook-only functions
// must additionally require the bearer to BE the service-role key.

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function isServiceRoleBearer(req: Request): boolean {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!bearer || !serviceKey) return false;
  if (!timingSafeEqual(bearer, serviceKey)) {
    // Lengths only — never log key material. A length mismatch here means
    // the webhook UI truncated the pasted key (the Stage 8 failure mode).
    console.warn(
      `[auth] bearer/service-key mismatch (lengths ${bearer.length} vs ${serviceKey.length})`,
    );
    return false;
  }
  return true;
}
