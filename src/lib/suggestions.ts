// suggestions.ts — Stage 7a
//
// Read helper for the admin inbox. Uses the authenticated supabase client
// (anon key + user JWT). RLS's "admins manage suggestions" policy allows
// the SELECT when is_admin() returns true.

import { supabase } from "./supabase";

export interface PendingSuggestion {
  id: string;
  created_at: string;
  proposed_author_name: string;
  proposed_country_iso_a3: string;
  submitter_email: string;
}

export async function listPendingSuggestions(): Promise<PendingSuggestion[]> {
  const { data, error } = await supabase
    .from("suggestions")
    .select("id, created_at, proposed_author_name, proposed_country_iso_a3, submitter_email")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[suggestions] list pending failed:", error.message);
    throw error;
  }
  return (data ?? []) as PendingSuggestion[];
}
