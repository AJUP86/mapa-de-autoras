// suggestions-detail.ts — Stage 7b-i
//
// Read + write helpers for a single suggestion (the admin review page).
// Uses the authed supabase client; RLS gates everything via is_admin().

import { supabase } from "./supabase";

export interface SuggestionDetail {
  id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  submitter_email: string;
  submitter_name: string | null;
  proposed_author_name: string;
  proposed_country_iso_a3: string;
  proposed_books_text: string | null;
  note: string | null;
  reviewer_notes: string | null;
}

export async function getSuggestion(id: string): Promise<SuggestionDetail | null> {
  const { data, error } = await supabase
    .from("suggestions")
    .select(
      "id, created_at, status, submitter_email, submitter_name, proposed_author_name, proposed_country_iso_a3, proposed_books_text, note, reviewer_notes",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[suggestions-detail] get failed:", error.message);
    throw error;
  }
  return (data as SuggestionDetail) ?? null;
}

export async function rejectSuggestion(
  id: string,
  reviewerNotes: string,
): Promise<void> {
  const { error } = await supabase
    .from("suggestions")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewer_notes: reviewerNotes.trim() || null,
    })
    .eq("id", id);
  if (error) {
    console.error("[suggestions-detail] reject failed:", error.message);
    throw error;
  }
}
