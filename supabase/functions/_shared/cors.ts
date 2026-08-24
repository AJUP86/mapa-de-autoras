// _shared/cors.ts — origin-allowlisted CORS for browser-called functions.
//
// Only submit_suggestion and translate are legitimately called from a
// browser. The notify_* functions are webhook-only and send NO CORS headers.

const ALLOWED_ORIGINS = new Set([
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "https://staging.mapadeautoras.com",
  "https://mapadeautoras.com",
  "https://www.mapadeautoras.com",
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://mapadeautoras.com",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  };
}
