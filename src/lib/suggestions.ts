// suggestions.ts — Stage 8.5 (book-first)
//
// Read helper for the admin inbox. Uses the authenticated supabase client
// (anon key + user JWT). RLS's "admins manage suggestions" policy allows
// the SELECT when is_admin() returns true.
//
// The envelope no longer carries the proposed author/country — those live on
// its `suggestion_books` children now. The inbox shows how many books each
// envelope proposes via a PostgREST embedded count.

import { supabase } from "./supabase";

export interface PendingSuggestion {
  id: string;
  created_at: string;
  submitter_email: string;
  submitter_name: string | null;
  locale: "es" | "en";
  /** Number of proposed books in this envelope (for the "N books proposed" hint). */
  bookCount: number;
}

// PostgREST returns the embedded aggregate as `suggestion_books: [{ count }]`.
interface PendingSuggestionRow {
  id: string;
  created_at: string;
  submitter_email: string;
  submitter_name: string | null;
  locale: "es" | "en";
  suggestion_books: { count: number }[];
}

export async function listPendingSuggestions(): Promise<PendingSuggestion[]> {
  const { data, error } = await supabase
    .from("suggestions")
    .select("id, created_at, submitter_email, submitter_name, locale, suggestion_books(count)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[suggestions] list pending failed:", error.message);
    throw error;
  }
  return ((data ?? []) as PendingSuggestionRow[]).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    submitter_email: row.submitter_email,
    submitter_name: row.submitter_name,
    locale: row.locale,
    bookCount: row.suggestion_books[0]?.count ?? 0,
  }));
}
