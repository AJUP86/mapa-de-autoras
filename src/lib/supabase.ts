// Server-side Supabase client (used at build time by Astro front-matter).
//
// We use the anon key intentionally — RLS already restricts what `anon` can
// read (only `published = true` authors and their books). No service-role
// secret is needed for read-only data fetching.
//
// In dev, if the local Supabase stack is down, the client still constructs;
// queries will fail at call-time, callers handle that (see authors.ts).

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Don't throw — Astro evaluates this file even when the .env is missing
  // (e.g. fresh clone before `cp .env.example .env`). Log once so it's not
  // silently broken.
  console.warn(
    "[supabase] PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY missing — " +
      "live data fetches will fail. Copy .env.example to .env and fill them.",
  );
}

export const supabase = createClient<Database>(
  url ?? "http://127.0.0.1:54321",
  anonKey ?? "missing-anon-key",
  {
    auth: { persistSession: false }, // server-side / build-time use only
  },
);
