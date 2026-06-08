// Shared Supabase client for the site.
//
// Used by:
//   - Astro front-matter at build time (read-only catalog fetches; anon key
//     + RLS gates everything to `published = true` authors).
//   - React islands in the browser. Stage 7a's admin pages call
//     supabase.auth.signInWithOtp / .getSession / .onAuthStateChange — those
//     need the session to live across page reloads, so persistSession is on.
//     In Node (build-time) it's a no-op (no localStorage), so the same client
//     is safe in both environments.
//
// In dev, if the local Supabase stack is down, the client still constructs;
// queries will fail at call-time, callers handle that (see authors.ts).

import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/types/supabase";

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
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
