// _shared/auth.ts — webhook caller authentication.
//
// Platform-level `verify_jwt = true` only proves the bearer is SOME valid
// project JWT — the public anon key passes that gate. Webhook-only functions
// must additionally require the bearer to BE the service-role key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

// Admin USER auth (for browser-called admin functions like translate).
// getUser() validates the JWT signature against the project server-side;
// then we assert the admin role from the verified claims.
export async function requireAdmin(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return false;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) return false;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(jwt);
  if (error || !user) return false;
  return (user.app_metadata as Record<string, unknown> | undefined)?.role === "admin";
}
