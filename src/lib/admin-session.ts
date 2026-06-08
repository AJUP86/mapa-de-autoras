// admin-session.ts — Stage 7a
//
// Thin wrappers around supabase.auth used by the admin pages. The Supabase
// client is the same one used by everything else (anon key); after sign-in
// it holds the user's authenticated JWT in localStorage. PostgREST calls
// then carry that JWT and RLS's is_admin() does the real authorization.

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type AdminSessionState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "not-admin"; session: Session }
  | { kind: "admin"; session: Session };

export async function readSession(): Promise<AdminSessionState> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return { kind: "anonymous" };
  if (!isAdmin(data.session)) return { kind: "not-admin", session: data.session };
  return { kind: "admin", session: data.session };
}

export function isAdmin(session: Session): boolean {
  const role = session.user.app_metadata?.role;
  return role === "admin";
}

export async function requestMagicLink(
  email: string,
  redirectTo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
